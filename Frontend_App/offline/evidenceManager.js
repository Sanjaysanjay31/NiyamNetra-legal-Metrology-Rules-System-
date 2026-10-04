// offline/evidenceManager.js — Immutable original camera evidence management and provenance
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

let ImageManipulator = null;
try {
  ImageManipulator = require('expo-image-manipulator');
} catch {
  ImageManipulator = null;
}

const isWeb = Platform.OS === 'web';
const MIN_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB minimum safe headroom

let monotonic = 0;
function nextMonotonic() {
  monotonic += 1;
  return `${Date.now()}-${monotonic}`;
}

export function evidenceDir() {
  if (isWeb || !FileSystem.documentDirectory) return null;
  return FileSystem.documentDirectory + 'evidence/';
}

export async function ensureEvidenceDir() {
  const dir = evidenceDir();
  if (!dir) return;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Persist original camera capture to durable storage without any mutation or compression.
 * Establishes an immutable evidence record conforming to statutory audit requirements.
 *
 * @param {object} photo - Object returned by CameraView.takePictureAsync ({ uri, width, height })
 * @param {object} metadata - { panel, inspectionId, scanId }
 * @returns {Promise<object>} Immutable EvidenceRecord
 */
export async function persistOriginalCapture(photo, { panel = 'front', inspectionId = null, scanId = null } = {}) {
  if (!photo?.uri) {
    throw new Error('Capture failed: No image URI returned by camera');
  }

  // Pre-condition D: Check device storage headroom before persisting evidence
  if (!isWeb && FileSystem.getFreeDiskStorageAsync) {
    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      if (free != null && free < MIN_STORAGE_BYTES) {
        const freeMb = Math.round(free / (1024 * 1024));
        throw new Error(
          `Insufficient device storage (${freeMb} MB free). At least 500 MB required to safely preserve evidence without data loss.`
        );
      }
    } catch (fsErr) {
      if (fsErr.message?.includes('Insufficient device storage')) {
        throw fsErr;
      }
      // Non-fatal if storage check itself is unsupported on platform
    }
  }

  const dir = evidenceDir();
  let destUri = photo.uri;
  let fileSize = photo.fileSize || null;

  if (dir) {
    await ensureEvidenceDir();
    const filename = `orig-${panel}-${nextMonotonic()}.jpg`;
    destUri = dir + filename;

    try {
      await FileSystem.copyAsync({ from: photo.uri, to: destUri });
      const info = await FileSystem.getInfoAsync(destUri);
      if (!info.exists) {
        throw new Error(`Persisted evidence file not found at destination: ${destUri}`);
      }
      fileSize = info.size || fileSize;
    } catch (copyErr) {
      console.error('[EvidenceManager] Failed to persist original camera capture:', copyErr);
      throw new Error(`Failed to safely persist original camera evidence: ${copyErr.message || copyErr}`);
    }
  }

  // Immutable evidence record containing existing identifiers and metadata
  const record = {
    inspection_id: inspectionId,
    scan_id: scanId,
    panel: String(panel).trim().toLowerCase(),
    captured_at: new Date().toISOString(),
    original_uri: destUri,
    analysis_uri: null,
    file_size_bytes: fileSize,
    width: photo.width || null,
    height: photo.height || null,
    capture_source: 'camera',
    sync_status: 'pending',
    upload_status: 'not_uploaded',
    error: null,
  };

  return record;
}

/**
 * Creates a separate, derived analysis image (e.g. 1600px width, 75% quality JPEG)
 * for downstream OCR and quality gating without mutating or overwriting the original capture.
 *
 * @param {object} evidenceRecord - The immutable evidence record from persistOriginalCapture
 * @returns {Promise<object>} Copy of evidenceRecord with analysis_uri and analysis dimensions
 */
export async function createAnalysisImage(evidenceRecord) {
  if (!evidenceRecord?.original_uri) {
    throw new Error('Cannot create analysis image: original_uri is missing from evidence record');
  }

  // If ImageManipulator is not available (e.g. standard Node / basic Web test env)
  if (!ImageManipulator?.manipulateAsync) {
    return {
      ...evidenceRecord,
      analysis_uri: evidenceRecord.original_uri,
      analysis_width: evidenceRecord.width,
      analysis_height: evidenceRecord.height,
    };
  }

  try {
    // Only downsample if image is larger than 1600px; never upscale small images
    const origWidth = evidenceRecord.width;
    const actions = [];
    if (origWidth && origWidth > 1600) {
      actions.push({ resize: { width: 1600 } });
    } else if (!origWidth) {
      // Width unknown, apply standard width constraint
      actions.push({ resize: { width: 1600 } });
    }

    const manip = await ImageManipulator.manipulateAsync(
      evidenceRecord.original_uri,
      actions,
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
    );

    return {
      ...evidenceRecord,
      analysis_uri: manip.uri,
      analysis_width: manip.width || null,
      analysis_height: manip.height || null,
    };
  } catch (manipErr) {
    // Section 16.B: Analysis-image generation failure must NOT destroy or discard original evidence
    console.warn('[EvidenceManager] Analysis image generation failed, preserving original:', manipErr?.message || manipErr);
    return {
      ...evidenceRecord,
      analysis_uri: evidenceRecord.original_uri,
      analysis_error: manipErr?.message || 'Image manipulation failed',
    };
  }
}
