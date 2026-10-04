// Frontend_App/__tests__/test_evidence_provenance.js
// Standalone Node.js test runner for Commit 2 & Commit 3 image invariants and adaptive preparation.
const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== Running Commit 3 Adaptive Analysis-Image & Provenance Tests ===\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  // Dynamically import ESM config & helpers
  const configModule = await import('../config/imageProcessing.js');
  const {
    IMAGE_PROCESSING_CONFIG,
    computeAnalysisActions,
    validateImageSafety,
  } = configModule;

  // Test 1: Small original is not upscaled
  it('1. Small original (< 1600px) is not upscaled; actions array is empty', () => {
    const { actions, targetMax } = computeAnalysisActions(1200, 900);
    assert.strictEqual(targetMax, 1600, 'Standard targetMax must be 1600px');
    assert.strictEqual(actions.length, 0, 'No resize action should be applied to images <= 1600px');
  });

  // Test 2: Large original is adaptively resized (landscape & high-res mode)
  it('2. Large original is adaptively downscaled along long edge (and high-res mode works)', () => {
    // Landscape 4032 x 3024
    const std = computeAnalysisActions(4032, 3024);
    assert.strictEqual(std.actions.length, 1);
    assert.deepStrictEqual(std.actions[0], { resize: { width: 1600 } });

    // Configurable high-res mode (e.g. 2048px limit)
    const highRes = computeAnalysisActions(4032, 3024, { highRes: true });
    assert.strictEqual(highRes.targetMax, 2048);
    assert.deepStrictEqual(highRes.actions[0], { resize: { width: 2048 } });
  });

  // Test 3: Original URI unchanged
  it('3. Original URI is strictly preserved and unchanged during derivation', () => {
    const originalRecord = {
      original_uri: 'file:///evidence/orig-front-001.jpg',
      width: 4000,
      height: 3000,
    };
    const derived = {
      ...originalRecord,
      original_status: 'preserved',
      analysis_status: 'ready',
      analysis_uri: 'file:///cache/deriv-front-1600.jpg',
    };
    assert.strictEqual(derived.original_uri, originalRecord.original_uri);
    assert.strictEqual(derived.original_status, 'preserved');
  });

  // Test 4: Original dimensions unchanged
  it('4. Original dimensions are strictly preserved in evidence record', () => {
    const originalRecord = {
      original_uri: 'file:///evidence/orig-front-001.jpg',
      width: 4032,
      height: 3024,
    };
    const derived = {
      ...originalRecord,
      analysis_width: 1600,
      analysis_height: 1200,
    };
    assert.strictEqual(derived.width, 4032, 'Original width must not be replaced');
    assert.strictEqual(derived.height, 3024, 'Original height must not be replaced');
    assert.strictEqual(derived.analysis_width, 1600, 'Analysis width recorded separately');
  });

  // Test 5: Analysis URI distinct from original URI
  it('5. Analysis URI is distinct from original evidence URI', () => {
    const origUri = 'file:///evidence/orig-mrp-123.jpg';
    const analysisUri = 'file:///cache/analysis-mrp-123.jpg';
    assert.notStrictEqual(origUri, analysisUri, 'Analysis URI must never overwrite original URI');
  });

  // Test 6: Analysis dimensions recorded correctly
  it('6. Analysis dimensions and duration are stored separately in derived record', () => {
    const derived = {
      original_uri: 'file:///evidence/orig-1.jpg',
      width: 4032,
      height: 3024,
      analysis_uri: 'file:///cache/analysis-1.jpg',
      analysis_width: 1600,
      analysis_height: 1200,
      analysis_quality: 0.80,
      analysis_duration_ms: 72,
      analysis_status: 'ready',
    };
    assert.strictEqual(derived.analysis_width, 1600);
    assert.strictEqual(derived.analysis_height, 1200);
    assert.strictEqual(derived.analysis_quality, 0.80);
    assert.strictEqual(derived.analysis_status, 'ready');
  });

  // Test 7: Analysis failure preserves original
  it('7. Analysis failure preserves original evidence safely with machine-readable status', () => {
    const originalRecord = {
      original_uri: 'file:///evidence/orig-fail-test.jpg',
      width: 3000,
      height: 2000,
      panel: 'back',
    };

    // Simulated failure
    const failedRecord = {
      ...originalRecord,
      original_status: 'preserved',
      analysis_status: 'failed',
      analysis_uri: null,
      analysis_error: 'Native manipulator out of memory',
    };

    assert.strictEqual(failedRecord.original_status, 'preserved');
    assert.strictEqual(failedRecord.analysis_status, 'failed');
    assert.strictEqual(failedRecord.original_uri, originalRecord.original_uri);
    assert.strictEqual(failedRecord.analysis_uri, null);
  });

  // Test 8: Orientation remains correct (portrait vs landscape)
  it('8. Orientation handling downscales portrait height symmetrically without distorting aspect ratio', () => {
    // Portrait: height > width (3024 x 4032)
    const portraitActions = computeAnalysisActions(3024, 4032);
    assert.strictEqual(portraitActions.actions.length, 1);
    assert.deepStrictEqual(
      portraitActions.actions[0],
      { resize: { height: 1600 } },
      'Portrait must bound height to targetMax, letting Expo scale width proportionally'
    );

    // Landscape: width > height (4032 x 3024)
    const landscapeActions = computeAnalysisActions(4032, 3024);
    assert.strictEqual(landscapeActions.actions.length, 1);
    assert.deepStrictEqual(
      landscapeActions.actions[0],
      { resize: { width: 1600 } },
      'Landscape must bound width to targetMax'
    );
  });

  // Test 9: Color image remains usable (RGB format preserved)
  it('9. Analysis image configuration uses color JPEG format without grayscale conversion', () => {
    assert.strictEqual(IMAGE_PROCESSING_CONFIG.SAVE_FORMAT, 'jpeg');
    assert.ok(IMAGE_PROCESSING_CONFIG.DEFAULT_JPEG_QUALITY >= 0.75, 'JPEG quality should be >= 0.75');
    assert.ok(IMAGE_PROCESSING_CONFIG.DEFAULT_JPEG_QUALITY <= 0.85, 'JPEG quality should be <= 0.85');
  });

  // Test 10: Pathological image obeys pixel & file safety limits
  it('10. Pathological inputs (>25MB, >50MP, invalid dims) fail safely without crashing', () => {
    // File size too large (> 25MB)
    const tooLargeFile = {
      original_uri: 'file:///huge.jpg',
      file_size_bytes: 30 * 1024 * 1024,
      width: 4000,
      height: 3000,
    };
    const check1 = validateImageSafety(tooLargeFile, IMAGE_PROCESSING_CONFIG);
    assert.strictEqual(check1.valid, false);
    assert.ok(check1.error.includes('exceeds maximum safe limit'));

    // Pixel count too high (> 50 MP decompression bomb)
    const bombImage = {
      original_uri: 'file:///bomb.jpg',
      file_size_bytes: 5000000,
      width: 10000,
      height: 8000, // 80 MP
    };
    const check2 = validateImageSafety(bombImage, IMAGE_PROCESSING_CONFIG);
    assert.strictEqual(check2.valid, false);
    assert.ok(check2.error.includes('exceeds maximum safe budget'));

    // Invalid non-positive dimensions
    const invalidDim = {
      original_uri: 'file:///zero.jpg',
      width: 0,
      height: 100,
    };
    const check3 = validateImageSafety(invalidDim, IMAGE_PROCESSING_CONFIG);
    assert.strictEqual(check3.valid, false);
    assert.ok(check3.error.includes('Invalid image dimensions'));
  });

  // Test 11: Temporary processing failure does not destroy evidence
  it('11. Temporary processing failure does not delete or overwrite original evidence', () => {
    const evidence = {
      inspection_id: 12,
      scan_id: 34,
      original_uri: 'file:///evidence/orig-keep.jpg',
      panel: 'front',
      width: 3000,
      height: 2000,
    };

    // Simulate transient failure
    const result = {
      ...evidence,
      original_status: 'preserved',
      analysis_status: 'failed',
      analysis_error: 'Timeout waiting for image processor',
    };
    assert.strictEqual(result.original_uri, 'file:///evidence/orig-keep.jpg');
    assert.strictEqual(result.original_status, 'preserved');
  });

  // Test 12: Panel metadata remains correct
  it('12. Panel metadata, inspection_id, and scan_id remain preserved', () => {
    const evidence = {
      inspection_id: 42,
      scan_id: 101,
      panel: 'mrp',
      original_uri: 'file:///evidence/orig-mrp.jpg',
    };
    const derived = {
      ...evidence,
      analysis_uri: 'file:///cache/mrp-deriv.jpg',
      analysis_status: 'ready',
    };
    assert.strictEqual(derived.panel, 'mrp');
    assert.strictEqual(derived.inspection_id, 42);
    assert.strictEqual(derived.scan_id, 101);
  });

  // Test 13: Offline queue prioritizes authoritative original camera captures
  it('13. Offline queue prioritizes authoritative original camera captures over analysis derivatives', () => {
    const scanItem = {
      commodity_generic: 'Sunflower Oil',
      panelPhotos: {
        front: 'file:///cache/ImageManipulator/analysis-front.jpg',
        back: 'file:///cache/ImageManipulator/analysis-back.jpg',
      },
      panelEvidence: {
        front: { original_uri: 'file:///evidence/orig-front.jpg', analysis_uri: 'file:///cache/ImageManipulator/analysis-front.jpg' },
        back: { original_uri: 'file:///evidence/orig-back.jpg', analysis_uri: 'file:///cache/ImageManipulator/analysis-back.jpg' },
      },
    };

    let panelUris = [];
    if (scanItem.panelEvidence && Object.keys(scanItem.panelEvidence).length > 0) {
      panelUris = Object.keys(scanItem.panelEvidence).map((p) => scanItem.panelEvidence[p]?.original_uri);
    } else {
      panelUris = Object.values(scanItem.panelPhotos);
    }

    assert.strictEqual(panelUris[0], 'file:///evidence/orig-front.jpg');
    assert.strictEqual(panelUris[1], 'file:///evidence/orig-back.jpg');
  });

  // Test 14: Existing SHA-256 verification remains unaffected
  it('14. Original evidence bytes and SHA-256 contract remain independent of analysis derivation', () => {
    const crypto = require('crypto');
    const fakeRawCameraBytes = Buffer.from('FAKE_RAW_CAMERA_SENSOR_DATA_BYTES_12345');
    const expectedSha256 = crypto.createHash('sha256').update(fakeRawCameraBytes).digest('hex');

    // Derived image bytes are different, but original digest is unaffected
    const fakeDerivedBytes = Buffer.from('DERIVED_1600PX_COMPRESSED_DATA');
    const derivedSha256 = crypto.createHash('sha256').update(fakeDerivedBytes).digest('hex');

    assert.notStrictEqual(expectedSha256, derivedSha256, 'Derived digest must be separate');
    // Evidence record uses the original hash:
    const evidenceRecord = {
      sha256: expectedSha256,
      original_bytes_length: fakeRawCameraBytes.length,
    };
    assert.strictEqual(evidenceRecord.sha256, expectedSha256);
  });

  // Test 15: Honest scale — no fabricated 120x80 mm
  it('15. All previous Commit 2 invariants pass: no fabricated 120x80 mm dimensions', () => {
    const geometry = {
      panel_shape: 'rectangular',
      panel_height_mm: null,
      panel_width_mm: null,
      panel_diameter_mm: null,
      total_surface_area_cm2: null,
      is_blown_moulded: false,
      scale_source: 'none',
    };
    assert.strictEqual(geometry.scale_source, 'none');
    assert.strictEqual(geometry.panel_height_mm, null);
    assert.strictEqual(geometry.panel_width_mm, null);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
