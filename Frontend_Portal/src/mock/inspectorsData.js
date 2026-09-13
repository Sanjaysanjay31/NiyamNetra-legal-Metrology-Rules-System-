/**
 * Unified Inspectors Dataset for NiyamNetra Admin Portal.
 *
 * Route: /admin/inspectors and /admin/inspectors/:inspectorId
 *
 * Specific requirements:
 *   - Total Inspectors: 12
 *   - Active Inspectors: 9
 *   - Inspections This Month: 86
 *   - Inspectors With Pending Reviews: 3
 *
 * Exactly 2 example records specified:
 *   - INS-001: S. Kumar, Rajahmundry, 24 inspections, 7 violations found, 02 Sep 2026, Active
 *   - INS-002: R. Kumar, Kakinada, 19 inspections, 4 violations found, 02 Sep 2026, Active
 *
 * Strict legal & privacy rules:
 *   - Zero sensitive employee/HR data (no salary, no attendance, no personal photos, no fake ratings).
 */

export const INSPECTOR_KPIS = {
  total: 12,
  active: 9,
  thisMonth: 86,
  pendingReviews: 3,
}

export const INSPECTORS_RECORDS = [
  {
    id: 'INS-001',
    numericId: 1,
    name: 'S. Kumar',
    area: 'Rajahmundry',
    inspections: 24,
    violationsFound: 7,
    lastInspection: '02 Sep 2026',
    rawDate: '2026-09-02',
    status: 'Active',
    badgeId: 'LM-TG-1042',
    designation: 'Legal Metrology Inspector',
    division: 'East Godavari Jurisdiction',
    latestInspectionId: 'INS-10230',
    latestInspectionRawId: '10230',
    latestStore: 'Sri Stores',
  },
  {
    id: 'INS-002',
    numericId: 2,
    name: 'R. Kumar',
    area: 'Kakinada',
    inspections: 19,
    violationsFound: 4,
    lastInspection: '02 Sep 2026',
    rawDate: '2026-09-02',
    status: 'Active',
    badgeId: 'LM-AP-1014',
    designation: 'Legal Metrology Inspector',
    division: 'Kakinada Jurisdiction',
    latestInspectionId: 'INS-10229',
    latestInspectionRawId: '10229',
    latestStore: 'Lakshmi General Store',
  },
]

export const RECENT_ACTIVITY = [
  {
    id: 'ACT-001',
    inspector: 'S. Kumar',
    inspectorId: 'INS-001',
    action: 'completed inspection',
    inspectionId: 'INS-10230',
    inspectionRawId: '10230',
    date: '02 Sep 2026',
    store: 'Sri Stores',
    area: 'Rajahmundry',
  },
  {
    id: 'ACT-002',
    inspector: 'R. Kumar',
    inspectorId: 'INS-002',
    action: 'completed inspection',
    inspectionId: 'INS-10229',
    inspectionRawId: '10229',
    date: '02 Sep 2026',
    store: 'Lakshmi General Store',
    area: 'Kakinada',
  },
]

/**
 * Retrieves inspector dossier by ID (INS-001 or INS-002).
 * Falls back to first record if not matched.
 */
export function getInspectorDetail(id) {
  if (!id) return INSPECTORS_RECORDS[0]
  const clean = String(id).trim().toUpperCase()
  const found = INSPECTORS_RECORDS.find(
    (ins) =>
      ins.id.toUpperCase() === clean ||
      ins.id.toUpperCase() === `INS-${clean}` ||
      ins.id.replace('INS-', '') === clean.replace('INS-', '')
  )
  return found || INSPECTORS_RECORDS[0]
}
