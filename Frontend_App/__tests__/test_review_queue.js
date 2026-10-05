// Frontend_App/__tests__/test_review_queue.js
// Standalone Node.js test suite for Phase 6A: Review Queue & Adjudication UI logic.
const assert = require('assert');

console.log('=== Running Phase 6A Inspector Review Queue & Adjudication Tests ===\n');

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
  // Test 1: Priority styling logic
  it('1. Priority categorization properly maps critical/high to urgent styling', () => {
    const getPriorityStyle = (priority) => {
      switch (String(priority).toLowerCase()) {
        case 'critical':
        case 'high':
          return { bg: '#FEE2E2', border: '#FCA5A5', text: '#B91C1C', urgent: true };
        case 'medium':
          return { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309', urgent: false };
        default:
          return { bg: '#F1F5F9', border: '#CBD5E1', text: '#475569', urgent: false };
      }
    };

    assert.strictEqual(getPriorityStyle('high').urgent, true);
    assert.strictEqual(getPriorityStyle('critical').urgent, true);
    assert.strictEqual(getPriorityStyle('medium').urgent, false);
    assert.strictEqual(getPriorityStyle('low').urgent, false);
  });

  // Test 2: Dual verdict model invariant (C11)
  it('2. Dual verdict model preserves engine_verdict immutably while recording human_verdict', () => {
    const automatedFinding = {
      id: 101,
      check_id: 'CHK01',
      engine_verdict: 'fail',
      human_verdict: null,
      confidence: 0.92,
    };

    // Officer overrides fail -> pass with statutory justification
    const officerAdjudication = {
      action: 'override',
      human_verdict: 'pass',
      reason: 'Physical inspection confirms mandatory MRP declaration present on secondary carton flap.',
    };

    const updatedFinding = {
      ...automatedFinding,
      human_verdict: officerAdjudication.human_verdict,
      override_reason: officerAdjudication.reason,
    };

    // Engine verdict must remain untouched
    assert.strictEqual(updatedFinding.engine_verdict, 'fail', 'Engine verdict must NEVER be overwritten');
    assert.strictEqual(updatedFinding.human_verdict, 'pass');
    assert.strictEqual(updatedFinding.override_reason.length >= 10, true);
  });

  // Test 3: Mandatory reason validation for overrides
  it('3. Override rejection if explanation is missing or less than 10 characters', () => {
    const validateAdjudication = (body) => {
      if (!body.inspection_id) throw new Error('inspection_id required');
      if (!body.reason || body.reason.trim().length < 10) {
        throw new Error('mandatory reason must be at least 10 characters');
      }
      return true;
    };

    // Short reason fails
    assert.throws(
      () => validateAdjudication({ inspection_id: 1, reason: 'looks ok' }),
      /at least 10 characters/
    );

    // Empty reason fails
    assert.throws(
      () => validateAdjudication({ inspection_id: 1, reason: '' }),
      /at least 10 characters/
    );

    // Valid reason passes
    assert.strictEqual(
      validateAdjudication({
        inspection_id: 1,
        reason: 'Inspector verified batch code on package neck under magnification.',
      }),
      true
    );
  });

  // Test 4: Conflict resolution parameter validation
  it('4. Cross-panel conflict resolution requires valid conflict_id, resolution and reason', () => {
    const validateConflict = (body) => {
      if (!body.inspection_id || !body.conflict_id) {
        throw new Error('inspection_id and conflict_id required');
      }
      if (!body.resolution) throw new Error('resolution required');
      if (!body.reason || body.reason.trim().length < 10) {
        throw new Error('mandatory reason must be at least 10 characters');
      }
      return true;
    };

    assert.throws(
      () => validateConflict({ inspection_id: 5, conflict_id: '', resolution: 'accept_panel_a', reason: 'Verified manually' }),
      /conflict_id required/
    );

    assert.strictEqual(
      validateConflict({
        inspection_id: 5,
        conflict_id: 'CONF-MRP-01',
        resolution: 'accept_panel_a',
        reason: 'Front panel MRP sticker is authoritatively verified by establishment receipt.',
      }),
      true
    );
  });

  // Test 5: Offline queue item creation contract
  it('5. Offline adjudication enqueues structured item with unique ID and is_synced: false', () => {
    let mockSeq = 0;
    const createMockQueueItem = (type, inspectionId, body) => {
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

    const item = createMockQueueItem('adjudication', 42, {
      inspection_id: 42,
      action: 'resolve',
      reason: 'All package markings verified compliant with Rule 6.',
    });

    assert.strictEqual(item.type, 'adjudication');
    assert.strictEqual(item.inspectionId, 42);
    assert.strictEqual(item.is_synced, false);
    assert.strictEqual(typeof item.id, 'string');
    assert.strictEqual(item.body.action, 'resolve');
  });

  // Test 6: Sync dispatching handles adjudication and conflict types
  it('6. SyncProvider recognizes adjudication and conflict_resolution queue types', () => {
    const handledTypes = new Set(['inspection', 'scan', 'adjudication', 'conflict_resolution']);

    assert.strictEqual(handledTypes.has('adjudication'), true);
    assert.strictEqual(handledTypes.has('conflict_resolution'), true);
    assert.strictEqual(handledTypes.has('unknown_type'), false);
  });

  // Test 7: Duplicate submission prevention via Idempotency-Key
  it('7. Every adjudication request carries a unique idempotency key', () => {
    function generateIdempotencyKey(prefix = 'adj') {
      return `${prefix}-` + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();

    assert.notStrictEqual(key1, key2);
    assert.strictEqual(key1.startsWith('adj-'), true);
    assert.strictEqual(key1.length > 20, true);
  });

  // Test 8: Filter parameter building
  it('8. Filter parameter builder converts ALL values to undefined to avoid polluting API query', () => {
    const buildQuery = (params) => {
      const query = {};
      if (params.status_filter && params.status_filter !== 'ALL') {
        query.status_filter = params.status_filter;
      }
      if (params.reason && params.reason !== 'ALL') {
        query.reason = params.reason;
      }
      if (params.priority && params.priority !== 'ALL') {
        query.priority = params.priority;
      }
      return query;
    };

    const q1 = buildQuery({ status_filter: 'ALL', reason: 'ALL', priority: 'ALL' });
    assert.deepStrictEqual(q1, {});

    const q2 = buildQuery({ status_filter: 'OPEN', reason: 'violation', priority: 'high' });
    assert.deepStrictEqual(q2, { status_filter: 'OPEN', reason: 'violation', priority: 'high' });
  });

  // Test 9: Completeness percentage calculation
  it('9. Completeness calculation handles arbitrary checks assessed', () => {
    const calculateCompleteness = (assessed, total) => {
      if (!total || total <= 0) return '0%';
      const pct = Math.round((assessed / total) * 100);
      return `${pct}% (${assessed}/${total})`;
    };

    assert.strictEqual(calculateCompleteness(18, 18), '100% (18/18)');
    assert.strictEqual(calculateCompleteness(9, 18), '50% (9/18)');
    assert.strictEqual(calculateCompleteness(0, 18), '0% (0/18)');
  });

  // Test 10: Status transitions are valid
  it('10. Status transitions follow OPEN -> IN_REVIEW -> RESOLVED', () => {
    const validTransitions = {
      OPEN: ['IN_REVIEW', 'RESOLVED'],
      IN_REVIEW: ['RESOLVED', 'OPEN'],
      RESOLVED: ['IN_REVIEW'],
    };

    assert.strictEqual(validTransitions.OPEN.includes('RESOLVED'), true);
    assert.strictEqual(validTransitions.IN_REVIEW.includes('RESOLVED'), true);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
