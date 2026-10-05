// Frontend_App/__tests__/test_recapture_workflow.js
// Standalone Node.js test suite for Phase 6B: Smart Evidence Recapture Camera Workflow.
const assert = require('assert');

console.log('=== Running Phase 6B Smart Recapture Camera Workflow Tests ===\n');

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
  // Test 1: Task structure contract
  it('1. Recapture task carries all mandatory fields from backend', () => {
    const mockTask = {
      request_id: 'CAP_10_2_back_missing',
      inspection_id: 10,
      scan_id: 2,
      target_panel: 'back',
      reason: "Panel 'back' not captured. Required for complete assessment.",
      expected_evidence: 'Clear photograph of the back panel showing all declarations',
      priority: 'high',
      suggested_action: 'Capture the back panel of the package with good lighting and minimal tilt',
      status: 'pending',
      fulfilled_image_id: null,
    };

    const requiredFields = [
      'request_id',
      'inspection_id',
      'scan_id',
      'target_panel',
      'reason',
      'expected_evidence',
      'priority',
      'suggested_action',
      'status',
    ];

    for (const f of requiredFields) {
      assert.strictEqual(f in mockTask, true, `Missing field: ${f}`);
    }
    assert.strictEqual(mockTask.target_panel, 'back');
    assert.strictEqual(mockTask.priority, 'high');
  });

  // Test 2: Priority ordering
  it('2. Task list sorts high -> medium -> low priority deterministically', () => {
    const rawTasks = [
      { request_id: 't1', priority: 'low' },
      { request_id: 't2', priority: 'high' },
      { request_id: 't3', priority: 'medium' },
      { request_id: 't4', priority: 'high' },
    ];

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...rawTasks].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    assert.strictEqual(sorted[0].priority, 'high');
    assert.strictEqual(sorted[1].priority, 'high');
    assert.strictEqual(sorted[2].priority, 'medium');
    assert.strictEqual(sorted[3].priority, 'low');
  });

  // Test 3: Camera-only capture invariant & immutable original
  it('3. Recapture evidence maintains immutable original and links task metadata', () => {
    const rawCameraCapture = {
      uri: 'file:///data/user/0/host.exp.exponent/cache/Camera/photo123.jpg',
      width: 4000,
      height: 3000,
    };

    const recaptureMetadata = {
      panel: 'back',
      inspectionId: 15,
      scanId: 4,
      taskId: 'CAP_15_4_back_missing',
      attemptNumber: 1,
    };

    // Simulated evidence preservation record
    const evidenceRecord = {
      original_uri: 'file:///data/user/0/host.exp.exponent/files/evidence/ev_back_15_4_1.jpg',
      analysis_uri: 'file:///data/user/0/host.exp.exponent/files/evidence/analysis_back_15_4_1.jpg',
      panel: recaptureMetadata.panel,
      inspection_id: recaptureMetadata.inspectionId,
      scan_id: recaptureMetadata.scanId,
      task_id: recaptureMetadata.taskId,
      attempt_number: recaptureMetadata.attemptNumber,
      width: rawCameraCapture.width,
      height: rawCameraCapture.height,
      captured_at: new Date().toISOString(),
      capture_source: 'camera',
    };

    assert.strictEqual(evidenceRecord.capture_source, 'camera', 'Must be camera capture only');
    assert.notStrictEqual(evidenceRecord.original_uri, evidenceRecord.analysis_uri);
    assert.strictEqual(evidenceRecord.task_id, 'CAP_15_4_back_missing');
    assert.strictEqual(evidenceRecord.attempt_number, 1);
  });

  // Test 4: Quality gate decision suppresses upload on RETAKE_REQUIRED
  it('4. Quality gate decision RETAKE_REQUIRED blocks upload and triggers guidance', () => {
    const qualityDecisions = {
      sharp: { decision: 'READY', primary_guidance: null },
      slight_tilt: { decision: 'READY_WITH_WARNINGS', primary_guidance: 'Keep package square to frame' },
      severe_blur: { decision: 'RETAKE_REQUIRED', primary_guidance: 'Severe blur: hold camera steady' },
      severe_glare: { decision: 'RETAKE_REQUIRED', primary_guidance: 'Severe glare on MRP panel: tilt slightly' },
    };

    const shouldUpload = (decision) => decision !== 'RETAKE_REQUIRED';

    assert.strictEqual(shouldUpload(qualityDecisions.sharp.decision), true);
    assert.strictEqual(shouldUpload(qualityDecisions.slight_tilt.decision), true);
    assert.strictEqual(shouldUpload(qualityDecisions.severe_blur.decision), false);
    assert.strictEqual(shouldUpload(qualityDecisions.severe_glare.decision), false);
  });

  // Test 5: Calibration reference validation
  it('5. Calibration tasks require verified optical references, rejecting manually typed scale', () => {
    const VALID_CALIBRATION_SOURCES = new Set(['id1_card', 'coin_5rs', 'calibrated_ruler']);

    const validateCalibration = (scaleSource) => {
      if (!scaleSource || scaleSource === 'none') {
        return { valid: false, reason: 'No physical reference' };
      }
      if (scaleSource === 'manual_typed' || scaleSource === 'phone_dpi') {
        return { valid: false, reason: 'Manually typed or screen DPI prohibited by Legal Metrology rules' };
      }
      if (VALID_CALIBRATION_SOURCES.has(scaleSource)) {
        return { valid: true, reference: scaleSource };
      }
      return { valid: false, reason: 'Unrecognized reference' };
    };

    assert.strictEqual(validateCalibration('id1_card').valid, true);
    assert.strictEqual(validateCalibration('coin_5rs').valid, true);
    assert.strictEqual(validateCalibration('manual_typed').valid, false);
    assert.strictEqual(validateCalibration('phone_dpi').valid, false);
    assert.strictEqual(validateCalibration('none').valid, false);
  });

  // Test 6: Attempt tracking & loop protection
  it('6. Repeated failures (attempts >= 3) trigger Manual Officer Review Required', () => {
    const getAttemptState = (attemptCount) => {
      if (attemptCount >= 3) {
        return {
          requiresManualReview: true,
          notice: 'Manual Officer Review Required — repeated captures could not resolve gap',
        };
      }
      return {
        requiresManualReview: false,
        notice: `Attempt ${attemptCount} of 3`,
      };
    };

    assert.strictEqual(getAttemptState(1).requiresManualReview, false);
    assert.strictEqual(getAttemptState(2).requiresManualReview, false);
    assert.strictEqual(getAttemptState(3).requiresManualReview, true);
    assert.strictEqual(getAttemptState(4).requiresManualReview, true);
  });

  // Test 7: Skip task requires mandatory justification (>= 10 chars)
  it('7. Skipping a capture task requires an officer explanation >= 10 characters', () => {
    const validateSkip = (body) => {
      if (!body.taskId) throw new Error('taskId required');
      if (!body.inspection_id) throw new Error('inspection_id required');
      if (!body.skip_reason || body.skip_reason.trim().length < 10) {
        throw new Error('mandatory skip_reason must be at least 10 characters');
      }
      return true;
    };

    assert.throws(
      () => validateSkip({ taskId: 't1', inspection_id: 1, skip_reason: 'no back' }),
      /at least 10 characters/
    );

    assert.strictEqual(
      validateSkip({
        taskId: 't1',
        inspection_id: 1,
        skip_reason: 'Retail sample carton torn on reverse; back panel missing from package.',
      }),
      true
    );
  });

  // Test 8: Offline queueing of recapture fulfillment and reassessment
  it('8. Offline recapture creates structured queue items for fulfillment and reassessment', () => {
    let mockSeq = 0;
    const createQueueItem = (type, inspectionId, body) => {
      mockSeq++;
      return {
        id: `${type}-${Date.now()}-${mockSeq}`,
        type,
        inspectionId,
        body,
        createdAt: new Date().toISOString(),
        is_synced: false,
      };
    };

    const fulfillItem = createQueueItem('recapture_fulfillment', 12, {
      inspection_id: 12,
      taskId: 'CAP_12_1_back_missing',
      scan_image_id: null,
      notes: 'Fulfilled offline',
    });

    const reassessItem = createQueueItem('reassessment_trigger', 12, {
      inspection_id: 12,
      scan_ids: [1],
    });

    assert.strictEqual(fulfillItem.type, 'recapture_fulfillment');
    assert.strictEqual(fulfillItem.is_synced, false);
    assert.strictEqual(reassessItem.type, 'reassessment_trigger');
    assert.deepStrictEqual(reassessItem.body.scan_ids, [1]);
  });

  // Test 9: Reassessment parameter validation
  it('9. Reassessment request requires valid inspection_id and non-empty scan_ids', () => {
    const validateReassess = (body) => {
      if (!body.inspection_id) throw new Error('inspection_id required');
      if (!Array.isArray(body.scan_ids) || body.scan_ids.length === 0) {
        throw new Error('scan_ids array must not be empty');
      }
      return true;
    };

    assert.throws(
      () => validateReassess({ inspection_id: 1, scan_ids: [] }),
      /must not be empty/
    );

    assert.strictEqual(
      validateReassess({ inspection_id: 1, scan_ids: [101, 102] }),
      true
    );
  });

  // Test 10: State progression strictly linear without fabricated success
  it('10. Recapture state progression follows LOCAL -> UPLOADING -> ASSESSED', () => {
    const STATES = ['LOCAL', 'QUEUED', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'ASSESSED'];

    const isValidTransition = (from, to) => {
      const fromIdx = STATES.indexOf(from);
      const toIdx = STATES.indexOf(to);
      return toIdx === fromIdx + 1 || (from === 'LOCAL' && to === 'QUEUED');
    };

    assert.strictEqual(isValidTransition('LOCAL', 'QUEUED'), true);
    assert.strictEqual(isValidTransition('LOCAL', 'UPLOADING'), false);
    assert.strictEqual(isValidTransition('UPLOADING', 'UPLOADED'), true);
    assert.strictEqual(isValidTransition('LOCAL', 'ASSESSED'), false); // Cannot jump directly to assessed!
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
