// Frontend_App/config/qualityThresholds.js
// Centralized engineering thresholds for mobile capture quality gating.
// These are SYSTEM and UX thresholds, NOT statutory Legal Metrology limits.

export const QUALITY_THRESHOLDS = {
  // Sharpness / Blur (Laplacian variance on central declaration ROI)
  BLUR: {
    REJECT: 60.0,       // Below 60: character strokes smeared, text unreadable by OCR
    WARNING: 100.0,     // 60 - 100: slightly soft; warning displayed
    GOOD: 100.0,        // >= 100: crisp character boundaries
  },

  // Exposure / Luminance (0 - 255 scale)
  LUMINANCE: {
    UNDEREXPOSED_REJECT: 35.0,     // Severely dark (< 35 luma) without high text contrast
    UNDEREXPOSED_WARNING: 50.0,    // Dim lighting (35 - 50 luma)
    OVEREXPOSED_WARNING: 225.0,    // High ambient brightness
    OVEREXPOSED_REJECT: 245.0,     // Saturated / blown out text
  },

  // Glare / Specular Reflection (% of pixels at or near saturation >= 250)
  GLARE: {
    WARNING: 0.05,      // > 5% saturated pixels
    REJECT: 0.15,       // > 15% saturated reflection covering declaration area
  },

  // Contrast Ratio (normalized 0.0 - 1.0 based on dynamic range)
  CONTRAST: {
    REJECT: 0.20,       // Below 0.20: washed out / flat
    WARNING: 0.35,      // 0.20 - 0.35: low contrast
    GOOD: 0.35,         // >= 0.35: legible text separation
  },

  // Framing & Dimensions
  FRAMING: {
    MIN_DIMENSION_PX: 400,         // Minimum width or height (matches backend MIN_PANEL_PIXEL_HEIGHT)
    MIN_TOTAL_PIXELS: 200_000,     // Minimum pixel budget (~400x500)
    MAX_ASPECT_RATIO: 3.5,         // Max aspect ratio before deemed sliced/cropped
    MIN_PACKAGE_COVERAGE: 0.10,    // Minimum % of frame occupied by package
  },

  // Geometry / Tilt
  GEOMETRY: {
    MAX_TILT_DEG: 25.0,            // Severe perspective angle requiring re-angling
    WARNING_TILT_DEG: 15.0,        // Noticeable tilt
  },
};

export const GUIDANCE_MESSAGES = {
  NONE: 'Image ready for assessment',
  BLUR: 'Hold the phone steady and capture again',
  GLARE: 'Reduce reflection or tilt the package slightly',
  UNDEREXPOSURE: 'Image is too dark. Move to a better-lit position',
  OVEREXPOSURE: 'Too bright. Move away from direct light',
  CONTRAST: 'Low contrast. Ensure lighting is even',
  TILT: 'Hold the package more front-facing',
  TILT_MODERATE: 'Hold the package more front-facing',
  TILT_SEVERE: 'Move closer and align the package with the frame',
  CROP: 'Keep all important package edges inside the frame',
  TOO_SMALL: 'Move closer to the package',
  CORRUPT: 'Retake image for clearer evidence',
  UNAVAILABLE: 'Move to a clearer view of the package',
};

export default QUALITY_THRESHOLDS;
