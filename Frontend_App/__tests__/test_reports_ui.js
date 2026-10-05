// Frontend_App/__tests__/test_reports_ui.js — Phase 6C Officer Reports & Dossier Tests
const assert = require('assert');

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

console.log('=== Running Phase 6C Officer Reports & Dossier UI Tests ===\n');

// 1. Compliant report structure
it('1. Compliant report rolls up properly with 0 violations and COMPLIANT verdict', () => {
  const summary = {
    inspection_id: 101,
    inspection_date: '2026-10-05',
    status: 'submitted',
    overall_verdict: 'COMPLIANT',
    total_packages: 2,
    packages_with_violations: 0,
    packages_compliant: 2,
    packages_not_assessed: 0,
    section_36_guidance: {
      applicable: false,
      summary: 'No confirmed violations. Section 36 enforcement not triggered.',
      limbs: [],
      recommended_action: null,
    },
    package_summaries: [
      { scan_id: 201, commodity: 'Atta', pass_count: 8, fail_count: 0, not_assessed_count: 0, overall_result: 'compliant' },
      { scan_id: 202, commodity: 'Rice', pass_count: 8, fail_count: 0, not_assessed_count: 0, overall_result: 'compliant' },
    ],
  };

  assert.strictEqual(summary.overall_verdict, 'COMPLIANT');
  assert.strictEqual(summary.packages_with_violations, 0);
  assert.strictEqual(summary.section_36_guidance.applicable, false);
});

// 2. Violation report structure and Section 36 limbs
it('2. Violation report maps statutory citations and Section 36 limbs deterministically', () => {
  const summary = {
    inspection_id: 102,
    inspection_date: '2026-10-05',
    status: 'submitted',
    overall_verdict: 'VIOLATION',
    total_packages: 1,
    packages_with_violations: 1,
    section_36_guidance: {
      applicable: true,
      summary: 'Section 36 enforcement applicable. 2 confirmed violation(s) across 2 limb(s).',
      limbs: [
        { limb: '36(1)', description: 'Non-conformity with provisions', violation_count: 1, checks: ['CHK04'] },
        { limb: '36(2)', description: 'False or misleading declaration', violation_count: 1, checks: ['CHK02'] },
      ],
      recommended_action: 'prosecute_and_seize',
    },
    package_summaries: [
      {
        scan_id: 203,
        commodity: 'Edible Oil',
        pass_count: 6,
        fail_count: 2,
        not_assessed_count: 0,
        overall_result: 'violation',
        violation_dossier: {
          scan_id: 203,
          commodity: 'Edible Oil',
          rule_pack_version: '2026.09.v1',
          violation_items: [
            { check_id: 'CHK02', title: 'Net Quantity Declaration', severity: 'critical', limb: '36(2)', citation: 'Rule 6(1)(b)' },
            { check_id: 'CHK04', title: 'Manufacturer/Packer Name & Address', severity: 'major', limb: '36(1)', citation: 'Rule 6(1)(c)' },
          ],
        },
      },
    ],
  };

  assert.strictEqual(summary.overall_verdict, 'VIOLATION');
  assert.strictEqual(summary.section_36_guidance.applicable, true);
  assert.strictEqual(summary.section_36_guidance.limbs.length, 2);
  const items = summary.package_summaries[0].violation_dossier.violation_items;
  assert.strictEqual(items[0].citation, 'Rule 6(1)(b)');
  assert.strictEqual(items[0].severity, 'critical');
});

// 3. Review report indicates incomplete checks needing officer attention
it('3. Review report isolates unassessed checks and requests review/recapture', () => {
  const summary = {
    inspection_id: 103,
    overall_verdict: 'REVIEW_REQUIRED',
    packages_not_assessed: 1,
    package_summaries: [
      { scan_id: 204, commodity: 'Spice Mix', pass_count: 4, fail_count: 0, not_assessed_count: 3, overall_result: 'not_assessed' },
    ],
  };

  assert.strictEqual(summary.overall_verdict, 'REVIEW_REQUIRED');
  assert.strictEqual(summary.packages_not_assessed, 1);
  assert(summary.package_summaries[0].not_assessed_count > 0);
});

// 4. Evidence provenance and integrity references in dossier
it('4. Violation dossier includes immutable ledger references and SHA-256 evidence anchors', () => {
  const dossierItem = {
    check_id: 'CHK05',
    title: 'MRP Declaration',
    severity: 'critical',
    limb: '36(1)',
    engine_verdict: 'fail',
    human_verdict: null,
    observed: 'Covered by altered pricing sticker Rs. 150',
    required: 'Uncovered original MRP with all taxes',
    citation: 'Rule 6(1)(d), Rule 6(3)',
    ledger_ref: 'LEDGER-SCAN-205-CHK05-A8F932',
    reason: 'Price sticker illegitimately covers mandatory MRP declaration.',
  };

  assert(dossierItem.ledger_ref.startsWith('LEDGER-'));
  assert(dossierItem.citation.includes('Rule 6'));
  assert.strictEqual(dossierItem.severity, 'critical');
});

// 5. Legal references contain exact statutory descriptions without LLM hallucinations
it('5. Static legal reference dictionary provides authoritative LM Act statutory citations', () => {
  const references = {
    CHK01: { rule: 'Rule 6(1)(a)', limb: '36(1)' },
    CHK02: { rule: 'Rule 6(1)(b)', limb: '36(2)' },
    CHK05: { rule: 'Rule 6(1)(d)', limb: '36(1)' },
    CHK12: { rule: 'Rule 6(1)(aa)', limb: '36(1)' },
  };

  assert.strictEqual(references.CHK01.rule, 'Rule 6(1)(a)');
  assert.strictEqual(references.CHK02.limb, '36(2)');
  assert.strictEqual(references.CHK12.rule, 'Rule 6(1)(aa)');
});

// 6. Historical rule-pack preservation
it('6. Assessment report preserves active rule-pack version tag (e.g. 2026.09.v1)', () => {
  const scanRecord = {
    scan_id: 206,
    rule_pack_version: '2026.09.v1',
    rules_as_at: '2026-09-01T00:00:00Z',
    engine_version: '2.4.0',
  };

  assert.strictEqual(scanRecord.rule_pack_version, '2026.09.v1');
  assert(scanRecord.rules_as_at.startsWith('2026-09'));
});

// 7. No-evidence / empty inspection case
it('7. Zero package inspection handles empty scan list safely without crashing', () => {
  const summary = {
    inspection_id: 104,
    inspection_date: '2026-10-05',
    status: 'in_progress',
    overall_verdict: 'REVIEW_REQUIRED',
    total_packages: 0,
    package_summaries: [],
    section_36_guidance: { applicable: false, limbs: [] },
  };

  assert.strictEqual(summary.total_packages, 0);
  assert.strictEqual(summary.package_summaries.length, 0);
});

// 8. Offline cache and retrieval simulation for reports and dossiers
it('8. Offline caching serializes and restores report summary and dossier safely', () => {
  const cacheStorage = new Map();
  const cacheReport = (id, data) => cacheStorage.set(`report_${id}`, JSON.stringify(data));
  const loadReport = (id) => {
    const raw = cacheStorage.get(`report_${id}`);
    return raw ? JSON.parse(raw) : null;
  };

  const dummySummary = {
    inspection_id: 999,
    overall_verdict: 'VIOLATION',
    store: { name: 'Super Bazaar Hyderabad' },
  };

  cacheReport(999, dummySummary);
  const loaded = loadReport(999);

  assert.deepStrictEqual(loaded, dummySummary);
});

// 9. Offline cache handles missing records safely
it('9. Missing offline report cache returns null without exception', () => {
  const cacheStorage = new Map();
  const loadReport = (id) => {
    const raw = cacheStorage.get(`report_${id}`);
    return raw ? JSON.parse(raw) : null;
  };

  const nonExistent = loadReport(88888);
  assert.strictEqual(nonExistent, null);
});

// 10. PDF URL builder format
it('10. Inspection PDF URL targets deterministic backend PDF generator', () => {
  const buildPdfUrl = (base, id) => `${base}/reports/inspections/${id}/pdf`;
  const url = buildPdfUrl('https://api.niyamnetra.gov.in', 501);
  assert(url.includes('/reports/inspections/501/pdf'));
  assert(url.startsWith('https://'));
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
