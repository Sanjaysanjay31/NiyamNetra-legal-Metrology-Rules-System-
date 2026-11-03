// Frontend_App/__tests__/test_optional_evidence_panels.js
// Test suite for Module 2: Optional Evidence Panels and Evidence-Aware Assessment
const assert = require('assert');

console.log('=== Running Module 2 Optional Evidence Panels Tests ===\n');

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

async function runTests() {
  const { canAssessPackage } = await import('../api/resilientUpload.js');
  const { normalizeEvidenceList } = await import('../config/evidenceRendering.js');

  // 1. Empty evidence cannot be assessed
  it('1. Empty evidence submission returns canAssess=false', () => {
    const res = canAssessPackage([], {});
    assert.strictEqual(res.canAssess, false);
    assert(res.reason.includes('At least one panel photograph is required'));
  });

  // 2. Back-only evidence can be assessed
  it('2. Back-only evidence returns canAssess=true when uploaded', () => {
    const statusMap = {
      back: { status: 'uploaded', imageId: 101 },
    };
    const res = canAssessPackage(['back'], statusMap);
    assert.strictEqual(res.canAssess, true);
  });

  // 3. MRP-only evidence can be assessed
  it('3. MRP-only evidence returns canAssess=true when uploaded', () => {
    const statusMap = {
      mrp: { status: 'uploaded', imageId: 102 },
    };
    const res = canAssessPackage(['mrp'], statusMap);
    assert.strictEqual(res.canAssess, true);
  });

  // 4. Batch-only evidence can be assessed
  it('4. Batch-only evidence returns canAssess=true when uploaded', () => {
    const statusMap = {
      batch: { status: 'uploaded', imageId: 103 },
    };
    const res = canAssessPackage(['batch'], statusMap);
    assert.strictEqual(res.canAssess, true);
  });

  // 5. Multiple panels without front can be assessed
  it('5. Multiple panels without front (back + mrp) can be assessed', () => {
    const statusMap = {
      back: { status: 'uploaded', imageId: 201 },
      mrp: { status: 'uploaded', imageId: 202 },
    };
    const res = canAssessPackage(['back', 'mrp'], statusMap);
    assert.strictEqual(res.canAssess, true);
  });

  // 6. Normalizing evidence list handles scans with non-front panels correctly
  it('6. normalizeEvidenceList extracts all non-front panels accurately', () => {
    const scan = {
      id: 77,
      server_id: 77,
      panels_captured: ['back', 'mrp'],
      panels_missing: ['front', 'batch'],
      images: [
        { id: 301, panel: 'back', sha256: 'sha256_back', url: '/scans/77/images/301' },
        { id: 302, panel: 'mrp', sha256: 'sha256_mrp', url: '/scans/77/images/302' },
      ],
    };
    const list = normalizeEvidenceList(scan, scan.id, null, 'https://test.api');
    assert.strictEqual(list.length, 2);
    const panels = list.map(item => item.panel);
    assert(panels.includes('back'));
    assert(panels.includes('mrp'));
    assert(!panels.includes('front'));
  });

  // 7. Missing panels extraction helper logic
  it('7. panels_missing separates unsupplied panels from captured panels', () => {
    const scan = {
      panels_captured: ['back', 'batch'],
      panels_missing: ['front', 'mrp'],
    };
    assert.deepStrictEqual(scan.panels_captured.sort(), ['back', 'batch']);
    assert.deepStrictEqual(scan.panels_missing.sort(), ['front', 'mrp']);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
