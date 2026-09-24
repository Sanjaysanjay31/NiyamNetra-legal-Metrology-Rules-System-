/**
 * Reports Mock Dataset for NiyamNetra Admin Portal.
 *
 * Route: /admin/reports
 *
 * Requirements:
 *   - Total Reports: 42
 *   - Generated This Month: 18
 *   - Pending Reports: 3
 *   - Verified Reports: 39
 *
 * Example Reports:
 *   - RPT-001: Inspection Report | INS-10230 · Sri Stores | 02 Sep 2026 | Verified | Verified
 *   - RPT-002: Violation Report | INS-10230 · Sri Stores | 02 Sep 2026 | Generated | Pending Verification
 */

export const REPORT_KPIS = {
  total: 42,
  thisMonth: 18,
  pending: 3,
  verified: 39,
}

export const REPORT_RECORDS = [
  {
    id: 'RPT-001',
    type: 'Inspection Report',
    inspection: 'INS-10230',
    inspectionRawId: '10230',
    store: 'Sri Stores',
    storeId: 'ST-001',
    area: 'Rajahmundry',
    inspector: 'S. Kumar',
    generatedDate: '02 Sep 2026',
    rawDate: '2026-09-02',
    status: 'Verified',
    verification: 'Verified',
    hasAuditVerification: true,
    fileSize: '248 KB',
    summary: 'Statutory legal metrology inspection audit report covering retail package surveillance, PDP OCR evaluations, and Rule 6 checklist checks.',
  },
  {
    id: 'RPT-002',
    type: 'Violation Report',
    inspection: 'INS-10230',
    inspectionRawId: '10230',
    store: 'Sri Stores',
    storeId: 'ST-001',
    area: 'Rajahmundry',
    inspector: 'S. Kumar',
    generatedDate: '02 Sep 2026',
    rawDate: '2026-09-02',
    status: 'Generated',
    verification: 'Pending Verification',
    hasAuditVerification: false,
    fileSize: '192 KB',
    summary: 'Statutory breach report detailing Rule 6(1)(e) price sticker alteration and Rule 6(1)(g) consumer care contact omissions pending Assistant Controller sign-off.',
  },
]
