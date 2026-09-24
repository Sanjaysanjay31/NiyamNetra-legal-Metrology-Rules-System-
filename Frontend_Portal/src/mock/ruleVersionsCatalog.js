/**
 * Rule Versions Catalog for NiyamNetra Admin Portal.
 *
 * Route: /admin/rule-versions
 *
 * Requirements:
 *   - Only 1–2 example rule versions
 *   - Version 2.0.0 (Active, 30 Aug 2026, 19 checks, Current inspections)
 *   - Version 1.0.0 (Archived, Previous version, 19 checks, Historical inspections)
 *   - Current rule version card: 2.0.0, Active, 30 Aug 2026, 19 checks
 *   - Compact rule checks (CHK01, CHK02, CHK03...)
 *   - "Used by inspections" link: INS-10230 · Sri Stores
 *   - Version Integrity: Rule Version: 2.0.0, Status: Active, Inspection Evaluation: Enabled
 *   - Zero fake hashes, zero fake legal penalties
 */

export const CURRENT_RULE_VERSION = {
  version: '2.0.0',
  status: 'Active',
  effectiveDate: '30 Aug 2026',
  checksCount: 19,
  description: 'Current legal-metrology inspection rule set used by the system.',
  inspectionEvaluation: 'Enabled',
}

export const RULE_VERSIONS_LIST = [
  {
    id: 'rv-2.0.0',
    version: '2.0.0',
    effectiveDate: '30 Aug 2026',
    checks: 19,
    status: 'Active',
    usedBy: 'Current inspections',
    usedByInspection: 'INS-10230 · Sri Stores',
    usedByInspectionRawId: '10230',
    description: 'Current legal-metrology inspection rule set used by the system.',
    inspectionEvaluation: 'Enabled',
    ruleChecks: [
      { id: 'CHK01', name: 'Net Quantity Declaration', status: 'Active', section: 'Rule 6(1)(c)' },
      { id: 'CHK02', name: 'Unit of Measurement', status: 'Active', section: 'Rules 12–13' },
      { id: 'CHK03', name: 'MRP Declaration', status: 'Active', section: 'Rule 6(1)(e)' },
      { id: 'CHK04', name: 'Manufacturer Details', status: 'Active', section: 'Rule 6(1)(a)' },
      { id: 'CHK05', name: 'Consumer Care Details', status: 'Active', section: 'Rule 6(1)(g)' },
      { id: 'CHK06', name: 'Numeral & Character Font Height', status: 'Active', section: 'Rule 7(2)' },
      { id: 'CHK07', name: 'Character Width Ratio', status: 'Active', section: 'Rule 7(3)' },
      { id: 'CHK08', name: 'Conspicuous Background Contrast', status: 'Active', section: 'Rule 9' },
      { id: 'CHK09', name: 'Clear Space Around Net Quantity', status: 'Active', section: 'Rule 8' },
      { id: 'CHK10', name: 'Standard Pack Size Denomination', status: 'Active', section: 'Rule 12' },
      { id: 'CHK11', name: 'Date of Manufacture / Packing', status: 'Active', section: 'Rule 6(1)(d)' },
      { id: 'CHK12', name: 'Country of Origin for Imported Goods', status: 'Active', section: 'Rule 6(1)(j)' },
      { id: 'CHK13', name: 'Unit Sale Price (USP) Indication', status: 'Active', section: 'Rule 6(11)' },
      { id: 'CHK14', name: 'Generic Commodity Name', status: 'Active', section: 'Rule 6(1)(b)' },
      { id: 'CHK15', name: 'Best Before / Expiry Indication', status: 'Active', section: 'Rule 6(1)(d)' },
      { id: 'CHK16', name: 'Batch or Lot Number', status: 'Active', section: 'Rule 6(1)(h)' },
      { id: 'CHK17', name: 'Retail Package Sealed Integrity', status: 'Active', section: 'Rule 4' },
      { id: 'CHK18', name: 'Principal Display Panel Dimension', status: 'Active', section: 'Rule 2(h)' },
      { id: 'CHK19', name: 'Mandatory Language Accessibility', status: 'Active', section: 'Rule 9(1)' },
    ],
  },
  {
    id: 'rv-1.0.0',
    version: '1.0.0',
    effectiveDate: 'Previous version',
    checks: 19,
    status: 'Archived',
    usedBy: 'Historical inspections',
    usedByInspection: 'INS-10190 · Balaji Super Bazaar',
    usedByInspectionRawId: '10190',
    description: 'Baseline legal-metrology inspection rule catalog used during initial deployment.',
    inspectionEvaluation: 'Archived (Historical reference)',
    ruleChecks: [
      { id: 'CHK01', name: 'Net Quantity Declaration', status: 'Archived', section: 'Rule 6(1)(c)' },
      { id: 'CHK02', name: 'Unit of Measurement', status: 'Archived', section: 'Rules 12–13' },
      { id: 'CHK03', name: 'MRP Declaration', status: 'Archived', section: 'Rule 6(1)(e)' },
      { id: 'CHK04', name: 'Manufacturer Details', status: 'Archived', section: 'Rule 6(1)(a)' },
      { id: 'CHK05', name: 'Consumer Care Details', status: 'Archived', section: 'Rule 6(1)(g)' },
    ],
  },
]
