// Frontend_App/config/imageProcessing.js
// Centralized image-analysis parameters and adaptive planning for mobile preparation.
// These are SYSTEM parameters, NOT Legal Metrology thresholds.

export const IMAGE_PROCESSING_CONFIG = {
  // Dimension limits (adaptive long-edge bounding)
  MAX_ANALYSIS_DIMENSION: 1600,       // Standard maximum long-edge dimension in pixels
  HIGH_RES_ANALYSIS_DIMENSION: 2048,  // Optional high-resolution mode for small/dense printed text
  MIN_USEFUL_DIMENSION: 400,          // Below 400px, packaging declarations cannot be reliably resolved

  // Compression & format
  DEFAULT_JPEG_QUALITY: 0.80,         // Tuned JPEG quality balancing small-font legibility and size
  SAVE_FORMAT: 'jpeg',

  // Safeguards and safety budgets (aligned with backend ceilings)
  MAX_PIXEL_BUDGET: 50_000_000,       // 50 MP mobile decode budget (backend decompression-bomb is 80 MP)
  MAX_FILE_BYTES: 25 * 1024 * 1024,   // 25 MB max file size limit (matching backend MAX_UPLOAD_MB)

  // Mobile concurrency bounding
  MAX_CONCURRENT_ANALYSIS: 1,         // Bounded to 1 to guarantee mobile memory safety
};

/**
 * Computes adaptive downscaling actions for expo-image-manipulator.
 * Implements the non-destructive adaptive rule:
 * - If max dimension <= targetMax: returns empty actions array (never upscales).
 * - If max dimension > targetMax: downscales along the longest edge preserving aspect ratio.
 * - Handles both landscape and portrait orientations symmetrically.
 */
export function computeAnalysisActions(origWidth, origHeight, options = {}) {
  const config = options.config || IMAGE_PROCESSING_CONFIG;
  const targetMax = options.highRes ? config.HIGH_RES_ANALYSIS_DIMENSION : config.MAX_ANALYSIS_DIMENSION;
  const quality = typeof options.quality === 'number' ? options.quality : config.DEFAULT_JPEG_QUALITY;

  const maxDim = Math.max(origWidth || 0, origHeight || 0);
  const actions = [];

  if (maxDim > targetMax) {
    if (origWidth && origHeight) {
      if (origWidth >= origHeight) {
        actions.push({ resize: { width: targetMax } });
      } else {
        actions.push({ resize: { height: targetMax } });
      }
    } else if (origWidth && origWidth > targetMax) {
      actions.push({ resize: { width: targetMax } });
    } else if (origHeight && origHeight > targetMax) {
      actions.push({ resize: { height: targetMax } });
    } else {
      actions.push({ resize: { width: targetMax } });
    }
  } else if (!origWidth && !origHeight) {
    actions.push({ resize: { width: targetMax } });
  }

  return { actions, targetMax, quality };
}

/**
 * Validates input evidence record against mobile safety ceilings.
 * Returns { valid: boolean, error?: string }
 */
export function validateImageSafety(evidenceRecord, config = IMAGE_PROCESSING_CONFIG) {
  if (!evidenceRecord) {
    return { valid: false, error: 'Missing evidence record' };
  }
  if (!evidenceRecord.original_uri) {
    return { valid: false, error: 'original_uri is missing from evidence record' };
  }

  // Safeguard 1: File size ceiling check (25 MB)
  if (evidenceRecord.file_size_bytes && evidenceRecord.file_size_bytes > config.MAX_FILE_BYTES) {
    return {
      valid: false,
      error: `File size (${evidenceRecord.file_size_bytes} bytes) exceeds maximum safe limit of ${config.MAX_FILE_BYTES} bytes`,
    };
  }

  // Safeguard 2: Pixel budget ceiling check (50 MP)
  const pixelCount = (evidenceRecord.width || 0) * (evidenceRecord.height || 0);
  if (pixelCount > config.MAX_PIXEL_BUDGET) {
    return {
      valid: false,
      error: `Pixel count (${pixelCount} px) exceeds maximum safe budget of ${config.MAX_PIXEL_BUDGET} px`,
    };
  }

  // Safeguard 3: Invalid non-positive dimensions
  if ((evidenceRecord.width != null && evidenceRecord.width <= 0) || (evidenceRecord.height != null && evidenceRecord.height <= 0)) {
    return {
      valid: false,
      error: 'Invalid image dimensions (<= 0)',
    };
  }

  return { valid: true };
}

export default IMAGE_PROCESSING_CONFIG;
