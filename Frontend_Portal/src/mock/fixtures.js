/**
 * Fixture data, so the interface can be reviewed before the backend is running.
 *
 * Three rules this file follows, because the alternative is a demo that lies:
 *
 *  1. Shapes are copied from Backend/schemas.py, not invented. A fixture that
 *     returns `verdict` where the API returns `effective_verdict` produces a
 *     portal that works beautifully in demo and breaks on connection.
 *  2. Every screen filled from here shows a "Demo data" chip. That is enforced
 *     by useResource, which sets `demo` on the same state that substituted.
 *  3. Names are obviously fictional and the accounts use `example.test`. No
 *     real shop, brand or officer appears, and no figure is presented as a
 *     national or state statistic - 08 SS4.1 bans fabricated statistics on the
 *     login screen for exactly this reason.
 */

import { CHECKS, REGISTRATION_ORDER } from '../lib/checks'

const RULES_AS_AT = '2026-07-01'
const ENGINE_VERSION = '2.0.0'
const CATALOG_HASH = 'b41f9c0d7e2a4863f5d1c98a2e7b04d6c3a58f19e0d7b26c48a1f350d92e6b7c'

/* Employee IDs follow the same shape as Backend/seed.py (LM-ADM-nnn for an
   administrator, LM-<zone>-nnnn for an inspector) but deliberately use numbers
   the seed never issues, so a fixture row can never be mistaken for a seeded
   account. */
export const users = [
  { id: 1, employee_id: 'LM-ADM-901', full_name: 'A. Deshmukh', role: 'admin', jurisdiction: 'Pune Division', is_active: true },
  { id: 2, employee_id: 'LM-PN-9114', full_name: 'S. Iyer', role: 'inspector', jurisdiction: 'Pune City', is_active: true },
  { id: 3, employee_id: 'LM-PN-9207', full_name: 'R. Kulkarni', role: 'inspector', jurisdiction: 'Pimpri-Chinchwad', is_active: true },
  { id: 4, employee_id: 'LM-PN-9233', full_name: 'M. Fernandes', role: 'inspector', jurisdiction: 'Pune Rural', is_active: true },
  { id: 5, employee_id: 'LM-PN-9298', full_name: 'P. Bhosale', role: 'inspector', jurisdiction: 'Baramati', is_active: false },
]

export const currentUser = users[0]

/* GET /stores returns routers/inspections.py:_store_dict - `store_type`, not
   `kind`, and the address broken into its parts. Corrected rather than
   simplified: a screen written against `kind` would render blank on connection. */
export const stores = [
  { id: 11, name: 'Shivneri Provision Stores', store_type: 'retail', address: 'Lane 4, Kothrud', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411038', latitude: 18.5074, longitude: 73.8077, geofence_radius_m: 150 },
  { id: 12, name: 'Ganraj Supermart', store_type: 'retail', address: 'Market Road, Hadapsar', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411028', latitude: 18.5089, longitude: 73.9260, geofence_radius_m: 150 },
  { id: 13, name: 'Sahyadri Wholesale Depot', store_type: 'wholesale', address: 'APMC Yard, Gultekdi', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411037', latitude: 18.4938, longitude: 73.8712, geofence_radius_m: 250 },
  { id: 14, name: 'Nisarg Daily Needs', store_type: 'retail', address: 'Sector 21, Nigdi', city: 'Pimpri-Chinchwad', district: 'Pune', state: 'Maharashtra', pincode: '411044', latitude: 18.6513, longitude: 73.7708, geofence_radius_m: 150 },
]

export const storesById = Object.fromEntries(stores.map((s) => [s.id, s]))
export const usersById = Object.fromEntries(users.map((u) => [u.id, u]))

/* ---------------------------------------------------------------- findings -- */

/**
 * The nineteen rows, built from the catalog itself so the count and the order
 * can never drift from the engine. `plan` supplies only what differs per row.
 */
function buildFindings(plan) {
  return REGISTRATION_ORDER.map((id) => {
    const c = CHECKS[id]
    const p = plan[id] ?? { v: 'pass' }
    const verdict = p.v
    return {
      check_id: id,
      title: c.title,
      engine_verdict: verdict,
      human_verdict: p.human ?? null,
      effective_verdict: p.human ?? verdict,
      severity: c.severity,
      reason: verdict === 'not_assessed' ? p.reason : null,
      observed: p.observed ?? null,
      required: p.required ?? null,
      citation: c.citation,
      ledger_ref: c.unverified || null,
      confidence: p.confidence ?? null,
    }
  })
}

const NO_LISTING = 'This scan captured a package, not a web listing, so the listing duty could not be assessed.'
const NO_SCALE = 'No scale reference was resolved in the frame, so millimetres per pixel is unknown and the height cannot be measured.'

/** A violation scan: short net-quantity height and a missing origin declaration. */
export const scanViolation = {
  id: 9041,
  inspection_id: 771,
  commodity_generic: 'Biscuits',
  brand_name: 'Demo Brand A',
  overall_result: 'violation',
  violation_limb: '36(1)',
  recommended_action: 'improvement_notice',
  /* 15, not 16: CHK15 and CHK16 need a listing, and CHK10 does not arise for a
     commodity absent from the Second Schedule. rules_engine.py computes
     checks_assessed as 18 minus the not-assessed count, so the figure here has
     to follow the rows rather than be chosen. */
  checks_total: 18,
  checks_assessed: 15,
  mm_per_pixel: 0.0412,
  scale_source: 'reference_card',
  rules_as_at: RULES_AS_AT,
  catalog_hash: CATALOG_HASH,
  engine_version: ENGINE_VERSION,
  duplicate_of: null,
  created_at: '2026-08-30T09:41:22+05:30',
  counts: { total: 18, passed: 13, failed: 2, not_assessed: 3 },
  findings: buildFindings({
    CHK12: {
      v: 'fail',
      observed: 'No country-of-origin declaration found on any captured panel.',
      required: 'Country of origin must be declared on an imported package.',
      confidence: 0.91,
    },
    CHK06: {
      v: 'fail',
      observed: '1.12 mm measured character height (± 0.14 mm).',
      required: '1.50 mm minimum for a principal display panel of 78 cm².',
      confidence: 0.86,
    },
    CHK10: { v: 'not_assessed', reason: 'Biscuits are not a commodity with a prescribed pack size in the Second Schedule, so no standard size applies.' },
    CHK15: { v: 'not_assessed', reason: NO_LISTING },
    CHK16: { v: 'not_assessed', reason: NO_LISTING },
    CHK06b: { v: 'pass', observed: '3.20 mm (± 0.14 mm)', required: '2.00 mm', confidence: 0.88 },
    CHK08: { v: 'pass', observed: 'Contrast ratio 7.4:1', required: 'Conspicuous contrast with the background', confidence: 0.79 },
    CHK17: { v: 'pass', observed: 'FSSAI 11223344556677', confidence: 0.72 },
    CHK18: { v: 'fail', observed: 'One major and one further major contravention, both within limb 36(1). An improvement notice under Section 15 is the proportionate first response.' },
  }),
  images: [
    { id: 501, panel: 'front', sha256: '3f9a…c21e', width_px: 3024, height_px: 4032, rectified: true, residual_tilt_deg: 0.8, blur_variance: 182.4 },
    { id: 502, panel: 'back', sha256: '77b4…09da', width_px: 3024, height_px: 4032, rectified: true, residual_tilt_deg: 1.4, blur_variance: 154.1 },
  ],
}

/** A scan the evidence did not settle. The important one: not a pass. */
export const scanNotAssessed = {
  ...scanViolation,
  id: 9042,
  inspection_id: 772,
  commodity_generic: 'Edible oil',
  brand_name: 'Demo Brand B',
  overall_result: 'not_assessed',
  violation_limb: null,
  recommended_action: 'human_review',
  checks_total: 18,
  checks_assessed: 11,
  mm_per_pixel: null,
  scale_source: 'none',
  created_at: '2026-08-30T11:06:58+05:30',
  counts: { total: 18, passed: 11, failed: 0, not_assessed: 7 },
  findings: buildFindings({
    CHK06: { v: 'not_assessed', reason: NO_SCALE },
    CHK06b: { v: 'not_assessed', reason: NO_SCALE },
    CHK07: { v: 'not_assessed', reason: NO_SCALE },
    CHK09: { v: 'not_assessed', reason: NO_SCALE },
    CHK08: { v: 'not_assessed', reason: 'The captured panel is glossy and the reflection covers part of the declaration, so a contrast ratio could not be measured reliably.' },
    CHK15: { v: 'not_assessed', reason: NO_LISTING },
    CHK16: { v: 'not_assessed', reason: NO_LISTING },
    CHK18: { v: 'not_assessed', reason: '7 of 18 checks could not be assessed, so the graduated response under Section 36 cannot be settled on this evidence.' },
  }),
  images: [{ id: 503, panel: 'front', sha256: 'ab12…f4c8', width_px: 2268, height_px: 4032, rectified: false, residual_tilt_deg: 4.9, blur_variance: 61.2 }],
}

/** A compliant scan - still with the two listing checks unreachable. */
export const scanCompliant = {
  ...scanViolation,
  id: 9043,
  inspection_id: 773,
  commodity_generic: 'Wheat flour',
  brand_name: 'Demo Brand C',
  overall_result: 'compliant',
  violation_limb: null,
  recommended_action: null,
  checks_total: 18,
  checks_assessed: 16,
  created_at: '2026-08-29T16:22:04+05:30',
  counts: { total: 18, passed: 16, failed: 0, not_assessed: 2 },
  findings: buildFindings({
    CHK15: { v: 'not_assessed', reason: NO_LISTING },
    CHK16: { v: 'not_assessed', reason: NO_LISTING },
    CHK18: { v: 'pass', observed: 'No breach identified, so no response under Section 36 arises.' },
  }),
}

/** Out of scope: a 50 kg sack. Nothing accrues against it. */
export const scanOutOfScope = {
  ...scanViolation,
  id: 9044,
  inspection_id: 774,
  commodity_generic: 'Rice',
  brand_name: 'Demo Brand D',
  overall_result: 'out_of_scope',
  violation_limb: null,
  recommended_action: null,
  checks_total: 18,
  checks_assessed: 1,
  created_at: '2026-08-29T10:15:33+05:30',
  counts: { total: 18, passed: 1, failed: 0, not_assessed: 17 },
  findings: buildFindings(
    Object.fromEntries([
      ['CHK03', { v: 'pass', observed: 'Net quantity 50 kg exceeds the 25 kg ceiling in Rule 3.' }],
      ...REGISTRATION_ORDER.filter((id) => id !== 'CHK03').map((id) => [
        id,
        {
          v: 'not_assessed',
          reason:
            'Chapter II does not apply to this package, so the declaration duties were not assessed. There is no obligation here to have breached.',
        },
      ]),
    ])
  ),
  images: [],
}

export const scansById = {
  9041: scanViolation,
  9042: scanNotAssessed,
  9043: scanCompliant,
  9044: scanOutOfScope,
}

/* ------------------------------------------------------------ inspections -- */

/**
 * GET /inspections and GET /inspections/{id} both return
 * routers/inspections.py:_inspection_dict. Three things it does NOT carry, which
 * this fixture used to invent and no longer does:
 *
 *   - a store name or an inspector object. Only `store_id` and `user_id`. Screens
 *     join against /stores and /admin/users, both of which are real endpoints.
 *   - per-inspection result counts. An inspection has scans; the counts live on
 *     each scan. A dashboard cannot show one verdict per inspection.
 *   - latitude / longitude / gps_accuracy_m. The columns exist on the model but
 *     the response omits them, so no screen can plot the capture point. Flagged,
 *     not worked around.
 *
 * The list endpoint also takes no query parameters at all - no filter, no limit,
 * no pagination - so every list screen sorts and pages on the client and says so.
 */
export const inspections = [
  { id: 771, store_id: 11, user_id: 2, inspection_date: '2026-08-30', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 12.4, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Routine market inspection. Representative present and signed.', submitted_at: '2026-08-30T09:58:00+05:30', scan_count: 4 },
  { id: 772, store_id: 12, user_id: 2, inspection_date: '2026-08-30', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 31.0, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'refused', notes: 'Representative declined to sign. Copy left at the counter.', submitted_at: '2026-08-30T11:22:00+05:30', scan_count: 3 },
  { id: 773, store_id: 14, user_id: 3, inspection_date: '2026-08-29', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 8.6, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-08-29T16:40:00+05:30', scan_count: 6 },
  { id: 774, store_id: 13, user_id: 4, inspection_date: '2026-08-29', status: 'submitted', transaction_type: 'institutional', in_scope: false, out_of_scope_reason: 'Institutional supply, not a retail sale, so Chapter II does not apply to the consignment.', geofence_status: 'outside', geofence_distance_m: 210.0, geofence_reason: 'Recorded 210 m from the registered address. The depot gate is on the far side of the yard.', mock_location: false, clock_skew_seconds: 0, signature_status: 'unavailable', notes: 'No authorised representative on site; the yard supervisor could not sign for the depot. Copy left with the gate office.', submitted_at: '2026-08-29T10:12:00+05:30', scan_count: 2 },
  { id: 775, store_id: 11, user_id: 3, inspection_date: '2026-08-30', status: 'draft', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'unknown', geofence_distance_m: null, geofence_reason: 'Location unavailable on this device. The inspection can still be recorded.', mock_location: null, clock_skew_seconds: 41, signature_status: null, notes: null, submitted_at: null, scan_count: 1 },
]

/* The detail response is the same dict plus `scans`, with exactly these six
   fields per scan (routers/inspections.py:152-158). No created_at on a scan
   here, and no images - the scan detail endpoint carries those. */
export const inspectionDetail = {
  ...inspections[0],
  scans: [scanViolation, scanNotAssessed, scanCompliant, scanOutOfScope].map((s) => ({
    id: s.id,
    commodity_generic: s.commodity_generic,
    brand_name: s.brand_name,
    overall_result: s.overall_result,
    checks_assessed: s.checks_assessed,
    checks_total: s.checks_total,
    duplicate_of: s.duplicate_of,
  })),
}

/* --------------------------------------------------------------- dashboard -- */

export const adminDashboard = {
  period_start: '2026-08-01',
  period_end: '2026-08-30',
  inspections: 148,
  active_inspectors: 9,
  counts: { total: 412, compliant: 231, violation: 74, not_assessed: 88, out_of_scope: 19 },
  review_queue: 12,
  top_failed_checks: [
    { check_id: 'CHK06', title: CHECKS.CHK06.title, count: 31 },
    { check_id: 'CHK01', title: CHECKS.CHK01.title, count: 22 },
    { check_id: 'CHK04', title: CHECKS.CHK04.title, count: 14 },
    { check_id: 'CHK12', title: CHECKS.CHK12.title, count: 11 },
    { check_id: 'CHK05', title: CHECKS.CHK05.title, count: 7 },
  ],
  /* Which checks could not be assessed, and how often. This chart is the one
     that tells an administrator their capture guidance is failing, not their
     inspectors. 08 SS4.7 requires it.

     THE ONE FIELD IN THIS FILE THAT THE API DOES NOT RETURN.
     AdminDashboardResponse (Backend/schemas.py:213) carries top_failed_checks
     and no not-assessed equivalent, and queries.py has violations_by_check with
     no counterpart either. It is kept here so the required chart can be built
     and reviewed, and AdminDashboard.jsx renders that chart only when the field
     is present - against the live endpoint it states the gap instead of drawing
     an empty axis. Rule 1 at the top of this file still holds everywhere else. */
  top_not_assessed_checks: [
    { check_id: 'CHK15', title: CHECKS.CHK15.title, count: 393 },
    { check_id: 'CHK16', title: CHECKS.CHK16.title, count: 393 },
    { check_id: 'CHK06', title: CHECKS.CHK06.title, count: 96 },
    { check_id: 'CHK09', title: CHECKS.CHK09.title, count: 84 },
    { check_id: 'CHK08', title: CHECKS.CHK08.title, count: 61 },
  ],
  trend: [
    { day: '2026-08-24', counts: { total: 52, compliant: 29, violation: 9, not_assessed: 11, out_of_scope: 3 } },
    { day: '2026-08-25', counts: { total: 61, compliant: 36, violation: 11, not_assessed: 12, out_of_scope: 2 } },
    { day: '2026-08-26', counts: { total: 48, compliant: 26, violation: 8, not_assessed: 11, out_of_scope: 3 } },
    { day: '2026-08-27', counts: { total: 57, compliant: 33, violation: 10, not_assessed: 12, out_of_scope: 2 } },
    { day: '2026-08-28', counts: { total: 64, compliant: 38, violation: 12, not_assessed: 12, out_of_scope: 2 } },
    { day: '2026-08-29', counts: { total: 71, compliant: 41, violation: 13, not_assessed: 14, out_of_scope: 3 } },
    { day: '2026-08-30', counts: { total: 59, compliant: 28, violation: 11, not_assessed: 16, out_of_scope: 4 } },
  ],
}

/* ------------------------------------------------------------ review queue -- */

/**
 * GET /admin/review-queue returns EXACTLY THIS - one integer, no rows, and it
 * accepts no query parameters (routers/admin.py:119-122).
 *
 * The number is also stranger than it looks. queries.py:review_queue_size sums
 * three counts over three different units:
 *
 *   na_scans       live scans (duplicate_of IS NULL) whose overall_result is
 *                  not_assessed                                    - per SCAN
 *   low_conf       findings with confidence < 0.60 and no human verdict, with
 *                  no live filter, so duplicated scans count too   - per FINDING
 *   offline_edits  inspections with edited_offline = true          - per INSPECTION
 *
 * So "12" is not twelve findings. ReviewQueue.jsx states that on the page rather
 * than presenting the sum as a row count, and assembles what can be listed from
 * the endpoints that do exist - `edited_offline` is not among them, because
 * _inspection_dict does not carry it.
 *
 * An earlier version of this file had an array of rows here. That was invented:
 * there is no listing endpoint. Corrected rather than kept for convenience.
 */
export const reviewQueue = { count: 12 }

/* -------------------------------------------------------------------- audit -- */

/**
 * GET /admin/audit returns an ENVELOPE, newest first, paged by limit/offset
 * (routers/admin.py:161-173). The rows are AuditEntryOut (schemas.py), and four
 * things an earlier version of this fixture assumed are not in it:
 *
 *   no `id`            the primary key is `seq`, and it is the chain position -
 *                      which is why it is shown, not hidden as a row key.
 *   no `user` object   `user_id` is a bare integer. The Audit screen joins it
 *                      against /admin/users itself, exactly as AdminInspections
 *                      joins inspector names.
 *   no `ip_address`    AuditLog stores it and append_audit writes it, but the
 *                      response schema leaves it out. The portal therefore
 *                      cannot show it, and says so rather than omitting it
 *                      silently - an auditor looking for the field should learn
 *                      that it exists and is withheld.
 *   no per-row hash_ok integrity is a property of the CHAIN, not a row:
 *                      `chain_intact` and `chain_head` sit on the envelope, and
 *                      `hash_self` on each row is the link value itself.
 *
 * There is also no `target` column. Which object an entry concerns is carried by
 * `inspection_id` / `scan_id`, and for user administration only by a string
 * inside `new_value`. The action names below are the exact seventeen strings the
 * backend writes; `finding_override` and `scan_assessed` (the old fixture's
 * guesses) are not among them.
 */
export const auditLog = {
  total: 40912,
  limit: 50,
  offset: 0,
  chain_intact: true,
  chain_head: 'a1d3f0c47b9e2856',
  entries: [
    { seq: 40912, inspection_id: 773, scan_id: 9043, user_id: 1, action: 'finding_overridden', old_value: 'CHK04=fail', new_value: 'CHK04=pass', reason: 'Panel is curved; re-measured from the rectified crop at 1.61 mm, above the minimum.', timestamp: '2026-08-30T12:31:07+05:30', hash_self: 'a1d3f0c47b9e2856' },
    { seq: 40911, inspection_id: 772, scan_id: 9042, user_id: 2, action: 'assessed', old_value: null, new_value: 'not_assessed', reason: null, timestamp: '2026-08-30T11:07:02+05:30', hash_self: '7c02be5519af6d34' },
    { seq: 40910, inspection_id: 772, scan_id: 9042, user_id: 2, action: 'image_uploaded', old_value: null, new_value: 'principal:5e1c9a70b3d84f26', reason: null, timestamp: '2026-08-30T11:06:12+05:30', hash_self: 'e58a1470c6b23df9' },
    { seq: 40909, inspection_id: 771, scan_id: 9041, user_id: 2, action: 'assessed', old_value: null, new_value: 'violation', reason: null, timestamp: '2026-08-30T09:41:25+05:30', hash_self: '4b7d0e93a2c18f65' },
    { seq: 40908, inspection_id: 771, scan_id: null, user_id: 2, action: 'inspection_created', old_value: null, new_value: 'store=11', reason: null, timestamp: '2026-08-30T09:12:40+05:30', hash_self: 'd6931fa08e47c25b' },
    { seq: 40907, inspection_id: null, scan_id: null, user_id: 2, action: 'login', old_value: null, new_value: null, reason: null, timestamp: '2026-08-30T08:02:44+05:30', hash_self: '2f84c0d75b1e396a' },
    { seq: 40906, inspection_id: null, scan_id: null, user_id: 1, action: 'install_reset', old_value: 'b7f4-2a19-c8e0-5d63', new_value: null, reason: 'Handset returned to store on transfer; officer issued a new device.', timestamp: '2026-08-29T18:51:33+05:30', hash_self: '9e0b5c34718fa2d6' },
    { seq: 40905, inspection_id: null, scan_id: null, user_id: 1, action: 'user_updated', old_value: null, new_value: "LM-PN-9298:['is_active']", reason: null, timestamp: '2026-08-29T18:44:10+05:30', hash_self: '3ca7f9018d6b45e2' },
    { seq: 40904, inspection_id: 770, scan_id: null, user_id: 3, action: 'inspection_submitted', old_value: 'draft', new_value: 'submitted', reason: 'Four packages checked; shopkeeper given the printed summary.', timestamp: '2026-08-29T17:20:06+05:30', hash_self: '81bf4d6072ea3c95' },
    { seq: 40903, inspection_id: null, scan_id: null, user_id: null, action: 'login_failed', old_value: null, new_value: 'LM-PN-9298', reason: null, timestamp: '2026-08-29T16:58:52+05:30', hash_self: '6d15e8b0429c7f3a' },
  ],
}

/** The rows on their own, for anything that wants the list without the envelope. */
export const auditEntries = auditLog.entries

/* -------------------------------------------------------------------- rules -- */

/**
 * GET /admin/rules returns exactly these seven keys (routers/admin.py:176-188).
 *
 * `checks_registered` is 19, not 18, and the distinction is the whole point:
 * len(ALL_CHECK_IDS) counts every registered check including CHK18, the derived
 * Section 36 tier. The assessable denominator is 18, and it lives on the scan
 * (`checks_total`), not here. Rules.jsx prints both and names which is which.
 *
 * The two booleans are `false` in the shipped rule set, because
 * rules/catalog_2026_07_01.json carries `second_schedule: {}` and
 * `net_quantity_heights: {}` - the shapes are declared in `_meta`, the tables are
 * empty pending a verified transcription of the gazette. That is not a bug to
 * hide: CHK10 and CHK06b return not_assessed naming the missing table, and the
 * screen shows the same thing.
 *
 * An earlier version of this fixture invented `catalog_loaded_at`, `checks_total`,
 * `finding_rows` and an `unverified_provisions` array. The endpoint returns none
 * of them. The ledger is client-side canon in src/lib/checks.js (each check's
 * `unverified` field), so Rules.jsx derives it from there and says so, rather
 * than pretending the server sent it.
 */
export const rulesMeta = {
  rules_as_at: RULES_AS_AT,
  engine_version: ENGINE_VERSION,
  catalog_hash: CATALOG_HASH,
  checks_registered: 19,
  second_schedule_populated: false,
  net_quantity_heights_populated: false,
  meta: {
    rules_as_at: RULES_AS_AT,
    engine_target: '2.0.0',
    gazette: 'Legal Metrology (Packaged Commodities) Rules 2011 as amended; GSR 128(E) in force',
    description:
      'NiyamNetra rule catalogue read by rules_engine.load_catalog(). Two tables are deliberately left empty because they have NOT been transcribed from the gazette, and the engine does not guess at schedule contents: (1) ‘second_schedule’ — the Second Schedule prescribed pack-size table, ledger L-05, consumed by the prescribed-size check; (2) ‘net_quantity_heights’ — the net-quantity-specific minimum-height table, ledger L-04, consumed by CHK06b. While empty, the dependent checks return not_assessed with a reason that names the missing table, so the gap is visible in every report rather than silently guessed. To activate a check, populate its table only from a verified gazette reading and bump the catalogue file name/date.',
    second_schedule_shape: '{ "<commodity_category lowercased>": { "sizes": [<net_quantity_value numbers>] } }',
    net_quantity_heights_shape:
      '{ "bands": [ { "unit": "g|kg|ml|l", "upper": <inclusive max net_quantity_value>, "min_height_mm": <number> } ] }',
  },
}

/* ------------------------------------------------------------------ report -- */

export const todaysReport = {
  report_date: '2026-08-30',
  inspector: users[1],
  inspections: 3,
  counts: { total: 8, compliant: 3, violation: 2, not_assessed: 2, out_of_scope: 1 },
  stores: [
    { store_id: 11, store_name: 'Shivneri Provision Stores', counts: { total: 4, compliant: 1, violation: 2, not_assessed: 1, out_of_scope: 0 } },
    { store_id: 12, store_name: 'Ganraj Supermart', counts: { total: 3, compliant: 1, violation: 0, not_assessed: 2, out_of_scope: 0 } },
    { store_id: 13, store_name: 'Sahyadri Wholesale Depot', counts: { total: 1, compliant: 1, violation: 0, not_assessed: 0, out_of_scope: 1 } },
  ],
  generated_at: '2026-08-30T18:30:00+05:30',
}

/**
 * GET /reports/calendar returns `{year, month, dates}` — a list of the days in
 * that month on which the calling officer recorded something, and nothing more.
 * It carries no per-day counts, so this fixture carries none either; an earlier
 * draft of it invented `inspections` and `scans` per day, which would have let a
 * screen render totals the endpoint cannot supply.
 */
export const reportCalendar = {
  year: 2026,
  month: 8,
  dates: [
    '2026-08-24',
    '2026-08-25',
    '2026-08-26',
    '2026-08-27',
    '2026-08-28',
    '2026-08-29',
    '2026-08-30',
  ],
}

export const fixtures = {
  users,
  usersById,
  currentUser,
  stores,
  storesById,
  inspections,
  inspectionDetail,
  scansById,
  scanViolation,
  scanNotAssessed,
  scanCompliant,
  scanOutOfScope,
  adminDashboard,
  reviewQueue,
  auditLog,
  auditEntries,
  rulesMeta,
  todaysReport,
  reportCalendar,
}

export default fixtures
