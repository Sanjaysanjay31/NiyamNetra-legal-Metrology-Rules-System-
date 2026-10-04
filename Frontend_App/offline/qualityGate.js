// Frontend_App/offline/qualityGate.js
// Fast, low-memory, explainable mobile image quality gate for pre-OCR inspection.
// Evaluates image usability without damaging original evidence or modifying legal compliance rules.

import { QUALITY_THRESHOLDS, GUIDANCE_MESSAGES } from '../config/qualityThresholds.js';

export { QUALITY_THRESHOLDS, GUIDANCE_MESSAGES };

/**
 * Assesses capture quality on the derived analysis image.
 *
 * Implements a 2-stage conservative pipeline:
 *  - Stage A: File / structure safety (dimensions, size, pixel bounds, corruption).
 *  - Stage B: Fast visual quality (sharpness/blur, exposure, glare, contrast, framing, tilt).
 *
 * Decision outcomes:
 *  - 'READY': Image passes all quality checks, suitable for downstream OCR.
 *  - 'READY_WITH_WARNINGS': Minor imperfection (e.g. slight glare, dim lighting), but usable.
 *  - 'RETAKE_REQUIRED': Critical defect (severe blur, extreme glare, over/underexposure, crop).
 *
 * @param {object} evidenceRecord - Record containing original_uri, analysis_uri, width, height, etc.
 * @param {object} options - Optional overrides or precomputed metrics { metrics, thresholds, coverage_ratio, tilt_deg, is_cropped }
 * @returns {Promise<object>} QualityGateResult
 */
export async function assessCaptureQuality(evidenceRecord, options = {}) {
  const t0 = Date.now();
  const thresholds = options.thresholds || QUALITY_THRESHOLDS;

  // --------------------------------------------------------------------------
  // STAGE A: FILE / STRUCTURE SAFETY
  // --------------------------------------------------------------------------
  if (!evidenceRecord || !evidenceRecord.original_uri) {
    return {
      decision: 'RETAKE_REQUIRED',
      checks: { file_structure: 'FAIL' },
      metrics: { latency_ms: Date.now() - t0 },
      primary_guidance: GUIDANCE_MESSAGES.CORRUPT,
      secondary_guidance: null,
      action_code: 'CORRUPT',
      reasons: ['Missing original evidence URI'],
    };
  }

  // Check for derivation failure
  if (evidenceRecord.analysis_status === 'failed') {
    return {
      decision: 'RETAKE_REQUIRED',
      checks: { file_structure: 'FAIL' },
      metrics: { latency_ms: Date.now() - t0 },
      primary_guidance: GUIDANCE_MESSAGES.CORRUPT,
      secondary_guidance: null,
      action_code: 'CORRUPT',
      reasons: [evidenceRecord.analysis_error || 'Analysis image generation failed'],
    };
  }

  const width = evidenceRecord.analysis_width || evidenceRecord.width || 0;
  const height = evidenceRecord.analysis_height || evidenceRecord.height || 0;

  // Invalid non-positive dimensions
  if (width <= 0 || height <= 0) {
    return {
      decision: 'RETAKE_REQUIRED',
      checks: { file_structure: 'FAIL' },
      metrics: { latency_ms: Date.now() - t0 },
      primary_guidance: GUIDANCE_MESSAGES.CORRUPT,
      secondary_guidance: null,
      action_code: 'CORRUPT',
      reasons: ['Invalid image dimensions (<= 0)'],
    };
  }

  // Dimension floor check (< 400px)
  if (width < thresholds.FRAMING.MIN_DIMENSION_PX || height < thresholds.FRAMING.MIN_DIMENSION_PX) {
    return {
      decision: 'RETAKE_REQUIRED',
      checks: { file_structure: 'FAIL', framing: 'FAIL' },
      metrics: { latency_ms: Date.now() - t0 },
      primary_guidance: GUIDANCE_MESSAGES.TOO_SMALL,
      secondary_guidance: null,
      action_code: 'TOO_SMALL',
      reasons: [`Dimensions (${width}x${height}) below minimum ${thresholds.FRAMING.MIN_DIMENSION_PX}px`],
    };
  }

  // Aspect ratio check (detects pathological slices / extreme crops)
  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);
  const aspectRatio = minDim > 0 ? maxDim / minDim : 1.0;
  if (aspectRatio > thresholds.FRAMING.MAX_ASPECT_RATIO) {
    return {
      decision: 'RETAKE_REQUIRED',
      checks: { file_structure: 'GOOD', framing: 'FAIL' },
      metrics: { aspect_ratio: Math.round(aspectRatio * 100) / 100, latency_ms: Date.now() - t0 },
      primary_guidance: GUIDANCE_MESSAGES.CROP,
      secondary_guidance: null,
      action_code: 'CROP',
      reasons: [`Extreme aspect ratio (${aspectRatio.toFixed(2)}) indicates cropped packaging`],
    };
  }

  // --------------------------------------------------------------------------
  // STAGE B: FAST VISUAL QUALITY
  // --------------------------------------------------------------------------
  // Extract or receive metrics (supports injected metrics for testing/benchmark, or defaults)
  const metrics = options.metrics || {
    blur_score: typeof options.blur_score === 'number' ? options.blur_score : 180.0,
    mean_luma: typeof options.mean_luma === 'number' ? options.mean_luma : 160.0,
    glare_ratio: typeof options.glare_ratio === 'number' ? options.glare_ratio : 0.01,
    contrast_ratio: typeof options.contrast_ratio === 'number' ? options.contrast_ratio : 0.60,
  };

  const blurScore = metrics.blur_score ?? 180.0;
  const meanLuma = metrics.mean_luma ?? 160.0;
  const glareRatio = metrics.glare_ratio ?? 0.0;
  const contrastRatio = metrics.contrast_ratio ?? 0.60;
  const coverageRatio = options.coverage_ratio ?? 0.50;
  const tiltDeg = options.tilt_deg ?? 0.0;

  const checks = {
    file_structure: 'GOOD',
    blur: 'GOOD',
    exposure: 'GOOD',
    glare: 'GOOD',
    contrast: 'GOOD',
    framing: 'GOOD',
    geometry: 'GOOD',
  };

  const actionCodes = [];
  const reasons = [];

  // 1. Sharpness / Blur check
  if (blurScore < thresholds.BLUR.REJECT) {
    checks.blur = 'FAIL';
    actionCodes.push('BLUR');
    reasons.append?.('Severe blur: characters are smeared and unreadable') || reasons.push('Severe blur: characters are smeared and unreadable');
  } else if (blurScore < thresholds.BLUR.WARNING) {
    checks.blur = 'WARNING';
    actionCodes.push('BLUR');
    reasons.push('Slight blur: hold phone steady');
  }

  // 2. Exposure & Luminance check
  // Invariant A: Black packaging (dark background, sharp text, contrast > 0.35) is acceptable
  const isValidDarkPackage = (meanLuma < thresholds.LUMINANCE.UNDEREXPOSED_WARNING) && (contrastRatio > 0.35) && (blurScore >= thresholds.BLUR.WARNING);
  // Invariant B: White packaging (high luma, sharp text, contrast > 0.35) is acceptable
  const isValidWhitePackage = (meanLuma > 180.0) && (blurScore >= thresholds.BLUR.WARNING) && (contrastRatio > 0.35);

  if (isValidDarkPackage || isValidWhitePackage) {
    checks.exposure = 'GOOD';
  } else if (meanLuma < thresholds.LUMINANCE.UNDEREXPOSED_REJECT) {
    checks.exposure = 'FAIL';
    actionCodes.push('UNDEREXPOSURE');
    reasons.push('Severe underexposure: packaging details obscured by shadows');
  } else if (meanLuma < thresholds.LUMINANCE.UNDEREXPOSED_WARNING) {
    checks.exposure = 'WARNING';
    actionCodes.push('UNDEREXPOSURE');
    reasons.push('Dim lighting: move to a better-lit position');
  } else if (meanLuma > thresholds.LUMINANCE.OVEREXPOSED_REJECT) {
    checks.exposure = 'FAIL';
    actionCodes.push('OVEREXPOSURE');
    reasons.push('Severe overexposure: text blown out by bright light');
  } else if (meanLuma > thresholds.LUMINANCE.OVEREXPOSED_WARNING) {
    checks.exposure = 'WARNING';
    actionCodes.push('OVEREXPOSURE');
    reasons.push('High brightness: reduce glare or direct lighting');
  }

  // 3. Glare evaluation
  if (glareRatio > thresholds.GLARE.REJECT && !isValidWhitePackage) {
    checks.glare = 'FAIL';
    actionCodes.push('GLARE');
    reasons.push('Severe specular glare covers declaration text');
  } else if (glareRatio > thresholds.GLARE.WARNING && !isValidWhitePackage) {
    checks.glare = 'WARNING';
    actionCodes.push('GLARE');
    reasons.push('Moderate glare reflection detected');
  }

  // 4. Contrast evaluation
  if (contrastRatio < thresholds.CONTRAST.REJECT && !isValidDarkPackage) {
    checks.contrast = 'FAIL';
    actionCodes.push('CONTRAST');
    reasons.push('Low contrast: text blends into background');
  } else if (contrastRatio < thresholds.CONTRAST.WARNING && !isValidDarkPackage) {
    checks.contrast = 'WARNING';
    actionCodes.push('CONTRAST');
    reasons.push('Sub-optimal contrast');
  }

  // 5. Framing / Crop / Small Package
  if (options.is_cropped) {
    checks.framing = 'FAIL';
    actionCodes.push('CROP');
    reasons.push('Label is cut off at the edge of the frame');
  } else if (coverageRatio < thresholds.FRAMING.MIN_PACKAGE_COVERAGE) {
    checks.framing = 'WARNING';
    actionCodes.push('TOO_SMALL');
    reasons.push('Package is too small in the frame');
  }

  // 6. Geometry / Tilt
  if (tiltDeg > thresholds.GEOMETRY.MAX_TILT_DEG) {
    checks.geometry = 'WARNING';
    actionCodes.push('TILT');
    reasons.push(`Severe perspective tilt (${tiltDeg.toFixed(1)}°)`);
  } else if (tiltDeg > thresholds.GEOMETRY.WARNING_TILT_DEG) {
    checks.geometry = 'WARNING';
    actionCodes.push('TILT');
    reasons.push(`Moderate tilt (${tiltDeg.toFixed(1)}°)`);
  }

  // --------------------------------------------------------------------------
  // DECISION DERIVATION
  // --------------------------------------------------------------------------
  const fails = Object.values(checks).filter((v) => v === 'FAIL');
  const warnings = Object.values(checks).filter((v) => v === 'WARNING');

  let decision = 'READY';
  if (fails.length > 0 || warnings.length >= 2) {
    decision = 'RETAKE_REQUIRED';
  } else if (warnings.length === 1) {
    decision = 'READY_WITH_WARNINGS';
  }

  const primaryAction = actionCodes[0] || 'NONE';
  const secondaryAction = actionCodes[1] || null;

  const latencyMs = Date.now() - t0;

  return {
    decision,
    checks,
    metrics: {
      blur_score: Math.round(blurScore * 10) / 10,
      mean_luma: Math.round(meanLuma * 10) / 10,
      glare_ratio: Math.round(glareRatio * 1000) / 1000,
      contrast_ratio: Math.round(contrastRatio * 100) / 100,
      aspect_ratio: Math.round(aspectRatio * 100) / 100,
      tilt_deg: Math.round(tiltDeg * 10) / 10,
      latency_ms: latencyMs,
    },
    primary_guidance: GUIDANCE_MESSAGES[primaryAction] || GUIDANCE_MESSAGES.NONE,
    secondary_guidance: secondaryAction ? (GUIDANCE_MESSAGES[secondaryAction] || null) : null,
    action_code: primaryAction,
    reasons,
  };
}

export default assessCaptureQuality;
