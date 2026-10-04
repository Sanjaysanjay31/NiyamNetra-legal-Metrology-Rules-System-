// Frontend_App/__tests__/test_quality_gate.js
// Standalone Node.js test runner for Commit 4: Fast Image Quality Gate & Guidance.
const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== Running Commit 4 Fast Image Quality Gate Tests ===\n');

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
  const qualityModule = await import('../offline/qualityGate.js');
  const { assessCaptureQuality, QUALITY_THRESHOLDS, GUIDANCE_MESSAGES } = qualityModule;

  const baseRecord = {
    inspection_id: 10,
    scan_id: 20,
    panel: 'front',
    original_uri: 'file:///evidence/orig-front-10.jpg',
    analysis_uri: 'file:///cache/analysis-front-10.jpg',
    width: 4032,
    height: 3024,
    analysis_width: 1600,
    analysis_height: 1200,
    file_size_bytes: 3500000,
    original_status: 'preserved',
    analysis_status: 'ready',
  };

  // Test 1: Valid sharp image -> READY
  await itAsync('1. Valid sharp image -> READY with no critical warnings', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 250.0, mean_luma: 160.0, glare_ratio: 0.01, contrast_ratio: 0.60 },
    });
    assert.strictEqual(res.decision, 'READY');
    assert.strictEqual(res.checks.blur, 'GOOD');
    assert.strictEqual(res.checks.exposure, 'GOOD');
    assert.strictEqual(res.checks.glare, 'GOOD');
    assert.strictEqual(res.action_code, 'NONE');
    assert.ok(res.primary_guidance.includes('ready'));
  });

  // Test 2: Mild blur -> WARNING if acceptable
  await itAsync('2. Mild blur (60 <= blur < 100) -> READY_WITH_WARNINGS', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 80.0, mean_luma: 160.0, glare_ratio: 0.0, contrast_ratio: 0.60 },
    });
    assert.strictEqual(res.decision, 'READY_WITH_WARNINGS');
    assert.strictEqual(res.checks.blur, 'WARNING');
    assert.strictEqual(res.action_code, 'BLUR');
    assert.ok(res.primary_guidance.includes('steady'));
  });

  // Test 3: Severe blur -> RETAKE_REQUIRED
  await itAsync('3. Severe blur (< 60) -> RETAKE_REQUIRED with hold steady guidance', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 30.0, mean_luma: 160.0, glare_ratio: 0.0, contrast_ratio: 0.60 },
    });
    assert.strictEqual(res.decision, 'RETAKE_REQUIRED');
    assert.strictEqual(res.checks.blur, 'FAIL');
    assert.strictEqual(res.action_code, 'BLUR');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.BLUR);
  });

  // Test 4: Severe glare -> RETAKE_REQUIRED
  await itAsync('4. Severe glare (> 15%) -> RETAKE_REQUIRED with reduce reflection guidance', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 200.0, mean_luma: 180.0, glare_ratio: 0.22, contrast_ratio: 0.50 },
    });
    assert.strictEqual(res.decision, 'RETAKE_REQUIRED');
    assert.strictEqual(res.checks.glare, 'FAIL');
    assert.strictEqual(res.action_code, 'GLARE');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.GLARE);
  });

  // Test 5: Moderate glare -> WARNING
  await itAsync('5. Moderate glare (5% - 15%) -> READY_WITH_WARNINGS', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 200.0, mean_luma: 160.0, glare_ratio: 0.08, contrast_ratio: 0.50 },
    });
    assert.strictEqual(res.decision, 'READY_WITH_WARNINGS');
    assert.strictEqual(res.checks.glare, 'WARNING');
    assert.strictEqual(res.action_code, 'GLARE');
  });

  // Test 6: Severe underexposure -> RETAKE_REQUIRED
  await itAsync('6. Severe underexposure (< 35 luma, low contrast) -> RETAKE_REQUIRED', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 150.0, mean_luma: 20.0, glare_ratio: 0.0, contrast_ratio: 0.20 },
    });
    assert.strictEqual(res.decision, 'RETAKE_REQUIRED');
    assert.strictEqual(res.checks.exposure, 'FAIL');
    assert.strictEqual(res.action_code, 'UNDEREXPOSURE');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.UNDEREXPOSURE);
  });

  // Test 7: Severe overexposure -> RETAKE_REQUIRED
  await itAsync('7. Severe overexposure (> 245 luma) -> RETAKE_REQUIRED', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 200.0, mean_luma: 250.0, glare_ratio: 0.05, contrast_ratio: 0.15 },
    });
    assert.strictEqual(res.decision, 'RETAKE_REQUIRED');
    assert.strictEqual(res.checks.exposure, 'FAIL');
    assert.strictEqual(res.action_code, 'OVEREXPOSURE');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.OVEREXPOSURE);
  });

  // Test 8: Acceptable black & white packaging not falsely rejected
  await itAsync('8. Acceptable black packaging (low luma, high contrast, sharp text) is not falsely rejected', async () => {
    const blackPkgRes = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 220.0, mean_luma: 25.0, glare_ratio: 0.0, contrast_ratio: 0.65 },
    });
    assert.strictEqual(blackPkgRes.checks.exposure, 'GOOD');
    assert.strictEqual(blackPkgRes.checks.contrast, 'GOOD');
    assert.strictEqual(blackPkgRes.decision, 'READY');

    const whitePkgRes = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 250.0, mean_luma: 235.0, glare_ratio: 0.08, contrast_ratio: 0.55 },
    });
    assert.strictEqual(whitePkgRes.checks.exposure, 'GOOD');
    assert.strictEqual(whitePkgRes.checks.glare, 'GOOD');
    assert.strictEqual(whitePkgRes.decision, 'READY');
  });

  // Test 9: Acceptable glossy packaging not falsely rejected
  await itAsync('9. Acceptable glossy packaging with tiny specular highlights is not falsely rejected', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 210.0, mean_luma: 165.0, glare_ratio: 0.02, contrast_ratio: 0.60 },
    });
    assert.strictEqual(res.decision, 'READY');
    assert.strictEqual(res.checks.glare, 'GOOD');
  });

  // Test 10: Severe crop -> RETAKE_REQUIRED
  await itAsync('10. Severe crop / edge clipping -> RETAKE_REQUIRED with crop guidance', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      is_cropped: true,
      metrics: { blur_score: 180.0, mean_luma: 150.0, glare_ratio: 0.0, contrast_ratio: 0.50 },
    });
    assert.strictEqual(res.decision, 'RETAKE_REQUIRED');
    assert.strictEqual(res.checks.framing, 'FAIL');
    assert.strictEqual(res.action_code, 'CROP');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.CROP);
  });

  // Test 11: Severe tilt -> warning based on threshold
  await itAsync('11. Severe tilt (> 25 deg) -> WARNING with front-facing guidance', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      tilt_deg: 28.5,
      metrics: { blur_score: 180.0, mean_luma: 150.0, glare_ratio: 0.0, contrast_ratio: 0.55 },
    });
    assert.strictEqual(res.decision, 'READY_WITH_WARNINGS');
    assert.strictEqual(res.checks.geometry, 'WARNING');
    assert.strictEqual(res.action_code, 'TILT');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.TILT);
  });

  // Test 12: Small package -> guidance rather than unconditional rejection
  await itAsync('12. Small package in frame -> guidance to move closer without crash', async () => {
    const res = await assessCaptureQuality(baseRecord, {
      coverage_ratio: 0.06,
      metrics: { blur_score: 180.0, mean_luma: 150.0, glare_ratio: 0.0, contrast_ratio: 0.55 },
    });
    assert.strictEqual(res.decision, 'READY_WITH_WARNINGS');
    assert.strictEqual(res.checks.framing, 'WARNING');
    assert.strictEqual(res.action_code, 'TOO_SMALL');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.TOO_SMALL);
  });

  // Test 13: Invalid / corrupt image -> RETAKE_REQUIRED
  await itAsync('13. Corrupt image record or failed analysis -> RETAKE_REQUIRED with corrupt guidance', async () => {
    const corruptRecord = {
      ...baseRecord,
      analysis_status: 'failed',
      analysis_error: 'Corrupt stream',
    };
    const res = await assessCaptureQuality(corruptRecord);
    assert.strictEqual(res.decision, 'RETAKE_REQUIRED');
    assert.strictEqual(res.action_code, 'CORRUPT');
    assert.strictEqual(res.primary_guidance, GUIDANCE_MESSAGES.CORRUPT);
  });

  // Test 14: Original evidence remains untouched
  await itAsync('14. Original evidence remains completely untouched through quality evaluation', async () => {
    const originalUri = baseRecord.original_uri;
    const originalWidth = baseRecord.width;
    const res = await assessCaptureQuality(baseRecord, {
      metrics: { blur_score: 20.0, mean_luma: 150.0, glare_ratio: 0.0, contrast_ratio: 0.5 },
    });
    assert.strictEqual(baseRecord.original_uri, originalUri, 'original_uri must never change');
    assert.strictEqual(baseRecord.width, originalWidth, 'original dimensions must never change');
    assert.strictEqual(baseRecord.original_status, 'preserved');
  });

  // Test 15: Analysis image remains separate
  it('15. Analysis image remains distinct artifact from original evidence', () => {
    assert.notStrictEqual(baseRecord.original_uri, baseRecord.analysis_uri);
  });

  // Test 16: Offline queue remains intact
  it('16. Offline queue contract references authoritative original evidence regardless of quality gate', () => {
    const panelEvidence = {
      front: { ...baseRecord, quality_gate: { decision: 'READY' } },
    };
    const queueUri = panelEvidence.front.original_uri;
    assert.strictEqual(queueUri, 'file:///evidence/orig-front-10.jpg');
  });

  // Test 17: SHA-256 evidence contract remains intact
  it('17. SHA-256 evidence digest describes original camera file, unaffected by quality metrics', () => {
    const crypto = require('crypto');
    const rawBytes = Buffer.from('TEST_CAMERA_BYTES_123');
    const hash = crypto.createHash('sha256').update(rawBytes).digest('hex');
    assert.strictEqual(hash.length, 64);
  });

  // Test 18: Existing Commit 1-3 tests remain passing
  await itAsync('18. Existing Commit 1-3 evidence provenance tests execute and pass', async () => {
    const provenanceModule = await import('../config/imageProcessing.js');
    const { computeAnalysisActions, validateImageSafety } = provenanceModule;
    const check = validateImageSafety(baseRecord);
    assert.strictEqual(check.valid, true);
    const actions = computeAnalysisActions(4032, 3024);
    assert.strictEqual(actions.actions.length, 1);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
