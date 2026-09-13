/**
 * Audit Logs Dataset for NiyamNetra Admin Portal.
 *
 * Route: /admin/audit-logs
 *
 * Requirements:
 *   - Total Events: 1,284
 *   - Today: 48
 *   - Evidence Events: 32
 *   - Integrity Status: Valid
 *
 * Example 1:
 *   Timestamp: 02 Sep 2026 · 10:21 AM
 *   Event: Evidence Captured
 *   Reference: IMG-001
 *   Performed By: S. Kumar
 *   Status: Success
 *   Integrity: Verified
 *
 * Example 2:
 *   Timestamp: 02 Sep 2026 · 10:25 AM
 *   Event: Report Generated
 *   Reference: RPT-001
 *   Performed By: System
 *   Status: Success
 *   Integrity: Verified
 */

export const AUDIT_KPIS = {
  totalEvents: '1,284',
  today: 48,
  evidenceEvents: 32,
  integrityStatus: 'Valid',
}

export const AUDIT_RECORDS = [
  {
    id: 'AUD-001',
    timestamp: '02 Sep 2026 · 10:21 AM',
    rawDate: '2026-09-02',
    event: 'Evidence Captured',
    eventType: 'Evidence',
    reference: 'IMG-001',
    performedBy: 'S. Kumar',
    status: 'Success',
    integrity: 'Verified',
    inspection: 'INS-10230',
    inspectionRawId: '10230',
    relatedEvidence: 'IMG-001',
    actualHash: 'a7c9f4d1e2b58839401f82c61149e0b82f4d19aa913b719484b2c1598372641a',
    details: 'Front Principal Display Panel photographic evidence acquired with optical calibration via terminal LM-TG-1042.',
  },
  {
    id: 'AUD-002',
    timestamp: '02 Sep 2026 · 10:25 AM',
    rawDate: '2026-09-02',
    event: 'Report Generated',
    eventType: 'Report',
    reference: 'RPT-001',
    performedBy: 'System',
    status: 'Success',
    integrity: 'Verified',
    inspection: 'INS-10230',
    inspectionRawId: '10230',
    relatedEvidence: 'IMG-001',
    actualHash: 'b41f9c0d7e2a4863f5d1c98a2e7b04d6c3a58f19e0d7b26c48a1f350d92e6b7c',
    details: 'Statutory inspection audit report compiled and sealed with regulatory digital signature.',
  },
]
