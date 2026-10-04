// offline/evidenceManager.js — Immutable original camera evidence management and provenance
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  IMAGE_PROCESSING_CONFIG,
  computeAnalysisActions,
  validateImageSafety,
} from '../config/imageProcessing';

export { IMAGE_PROCESSING_CONFIG, computeAnalysisActions, validateImageSafety };

let ImageManipulator = null;
try {
  ImageManipulator = require('expo-image-manipulator');
} catch {
  ImageManipulator = null;
}

export function setImageManipulator(manipulator) {
  ImageManipulator = manipulator;
}

const isWeb = Platform.OS === 'web';
const MIN_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB minimum safe headroom

let monotonic = 0;
function nextMonotonic() {
  monotonic += 1;
  return `${Date.now()}-${monotonic}`;
}

// Bounded concurrency queue: serializes native image manipulation to prevent OOM
let analysisQueue = Promise.resolve();
function enqueueAnalysis(task) {
  const next = analysisQueue.then(task, task);
  analysisQueue = next.catch(() => {});
  return next;
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
    original_status: 'preserved',
  };

  return record;
}

/**
 * Creates a separate, derived analysis image for downstream OCR and quality gating
 * without mutating or overwriting the original capture.
 *
 * Implements an adaptive policy:
 * - If original image is already within target bounds, never upscale; preserve native resolution.
 * - If original image is large, downscale along longest edge preserving aspect ratio.
 * - Color (RGB) and logical orientation are preserved.
 * - Pathological inputs (> 25MB, > 50MP) are caught and reported cleanly without crashing.
 * - Derivation is serialized via enqueueAnalysis to bound mobile memory usage.
 *
 * @param {object} evidenceRecord - The immutable evidence record from persistOriginalCapture
 * @param {object} options - Optional configuration { highRes: boolean, quality: number, manipulator: object }
 * @returns {Promise<object>} Record with analysis_uri, analysis_status, and analysis dimensions
 */
export async function createAnalysisImage(evidenceRecord, options = {}) {
  const t0 = Date.now();
  const config = options.config || IMAGE_PROCESSING_CONFIG;

  const safety = validateImageSafety(evidenceRecord, config);
  if (!safety.valid) {
    if (!evidenceRecord?.original_uri) {
      throw new Error(`Cannot create analysis image: ${safety.error}`);
    }
    return {
      ...evidenceRecord,
      original_status: 'preserved',
      analysis_status: 'failed',
      analysis_uri: null,
      analysis_width: null,
      analysis_height: null,
      analysis_error: safety.error,
      analysis_duration_ms: Date.now() - t0,
    };
  }

  // Bounded execution to ensure mobile memory safety
  return enqueueAnalysis(async () => {
    const activeManipulator = options.manipulator || ImageManipulator;

    // Passthrough mode if ImageManipulator native module is not available
    if (!activeManipulator?.manipulateAsync) {
      return {
        ...evidenceRecord,
        original_status: 'preserved',
        analysis_status: 'passthrough',
        analysis_uri: evidenceRecord.original_uri,
        analysis_width: evidenceRecord.width || null,
        analysis_height: evidenceRecord.height || null,
        analysis_quality: 1.0,
        analysis_duration_ms: Date.now() - t0,
        analysis_error: null,
      };
    }

    try {
      const { actions, quality } = computeAnalysisActions(evidenceRecord.width, evidenceRecord.height, options);

      const format = activeManipulator.SaveFormat?.JPEG || 'jpeg';
      const manip = await activeManipulator.manipulateAsync(
        evidenceRecord.original_uri,
        actions,
        { compress: quality, format }
      );

      return {
        ...evidenceRecord,
        original_status: 'preserved',
        analysis_status: 'ready',
        analysis_uri: manip.uri,
        analysis_width: manip.width || (actions.length === 0 ? evidenceRecord.width : null),
        analysis_height: manip.height || (actions.length === 0 ? evidenceRecord.height : null),
        analysis_quality: quality,
        analysis_duration_ms: Date.now() - t0,
        analysis_error: null,
      };
    } catch (manipErr) {
      console.warn('[EvidenceManager] Analysis image generation failed, preserving original:', manipErr?.message || manipErr);
      return {
        ...evidenceRecord,
        original_status: 'preserved',
        analysis_status: 'failed',
        analysis_uri: null,
        analysis_error: manipErr?.message || 'Image manipulation failed',
        analysis_duration_ms: Date.now() - t0,
      };
    }
  });
}
