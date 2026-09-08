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
  /* The OCR layer's output. Real per Backend/models.py:539 (ocr_text +
     ocr_confidence_mean on Scan). The text is a literal of what the engine saw,
     and the per-field extraction is what the rule engine then uses. None of
     this is shown as a thumbnail or zoomable image; the project deliberately
     does not serve pixel data back through the API (Backend.md:558), and
     InspectionDetail names that boundary on the page. */
  ocr_text:
    'TASTEMAKER Salt Chips\nNet Wt. 50 g\nM.R.P. ₹20.00 (incl. of all taxes)\nBatch No. TSC-26-08-1142\nMfg. Date 08/2026\nBest before 6 months from mfg.\nMfd. by XYZ Foods Pvt Ltd, Survey No. 14, MIDC, Pune 411019\nFSSAI 11223344556677\nCustomer Care: 1800-103-2255, care@xyzfoods.example',
  ocr_confidence_mean: 0.86,
  extracted_fields: {
    product_name: 'Tastemaker Salt Chips',
    brand: 'Tastemaker',
    manufacturer: 'XYZ Foods Pvt Ltd, Survey No. 14, MIDC, Pune 411019',
    consumer_care: 'Customer Care: 1800-103-2255, care@xyzfoods.example',
    mrp: { value: 20.0, currency: 'INR', inclusive_of_taxes: true },
    net_quantity: { value: 50, unit: 'g' },
    batch_lot: 'TSC-26-08-1142',
    manufacturing_date: '2026-08-15',
    best_before: '2027-02-15',
    country_of_origin: null,
  },
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
  ocr_text:
    'VEGAFRESH Refined Sunflower Oil\nNet Qty 1 L\nMRP ₹165 (incl. of all taxes)\nBatch VF-OIL-2026-30-22\nPkd. 07/2026\nBest before 9 months from packing\nPacked by Vega Consumer Pvt Ltd, Plot 7, SIPCOT, Chennai 602105\nCustomer Care: care@vegafresh.example',
  ocr_confidence_mean: 0.42,
  extracted_fields: {
    product_name: 'VegaFresh Refined Sunflower Oil',
    brand: 'VegaFresh',
    manufacturer: 'Vega Consumer Pvt Ltd, Plot 7, SIPCOT, Chennai 602105',
    consumer_care: 'Customer Care: care@vegafresh.example',
    mrp: { value: 165, currency: 'INR', inclusive_of_taxes: true },
    net_quantity: { value: 1, unit: 'L' },
    batch_lot: 'VF-OIL-2026-30-22',
    packing_date: '2026-07-15',
    best_before: '2027-04-15',
    country_of_origin: null,
  },
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
  images: [
    { id: 504, panel: 'front', sha256: 'cf80…91a4', width_px: 3024, height_px: 4032, rectified: true, residual_tilt_deg: 0.6, blur_variance: 198.7 },
    { id: 505, panel: 'back', sha256: '5a13…7e2b', width_px: 3024, height_px: 4032, rectified: true, residual_tilt_deg: 0.9, blur_variance: 175.2 },
  ],
  ocr_text:
    'ANNAPURNA Chakki Atta\nNet Wt. 5 kg\nMRP ₹235 (incl. of all taxes)\nLOT AP-AT-26-09-088\nMfg. 09/2026\nBest before 3 months from packaging\nMfd. by Annapurna Snacks, Industrial Area, Indore 452010\nFSSAI 10012011000128\nCustomer Care: 1800-11-2026',
  ocr_confidence_mean: 0.92,
  extracted_fields: {
    product_name: 'Annapurna Chakki Atta',
    brand: 'Annapurna',
    manufacturer: 'Annapurna Snacks, Industrial Area, Indore 452010',
    consumer_care: 'Customer Care: 1800-11-2026',
    mrp: { value: 235, currency: 'INR', inclusive_of_taxes: true },
    net_quantity: { value: 5, unit: 'kg' },
    batch_lot: 'AP-AT-26-09-088',
    manufacturing_date: '2026-09-10',
    best_before: '2026-12-10',
    country_of_origin: null,
  },
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
  ocr_text: 'SAHARA Premium Basmati Rice\nNet Wt. 50 kg\nBasmati Rice, Pkd 06/2026\nPkd. by Sahara Beverages Pvt Ltd, Bhopal',
  ocr_confidence_mean: 0.71,
  extracted_fields: {
    product_name: 'Sahara Premium Basmati Rice',
    brand: 'Sahara',
    manufacturer: 'Sahara Beverages Pvt Ltd, Bhopal',
    consumer_care: null,
    mrp: null,
    net_quantity: { value: 50, unit: 'kg' },
    batch_lot: 'SBR-26-06-104',
    packing_date: '2026-06-10',
    best_before: null,
    country_of_origin: 'India',
  },
}

export const scansById = {
  9041: scanViolation,
  9042: scanNotAssessed,
  9043: scanCompliant,
  9044: scanOutOfScope,
  9081: {
    ...scanViolation,
    id: 9081,
    inspection_id: 772,
    commodity_generic: 'Edible oil',
    brand_name: 'VegaFresh',
    overall_result: 'violation',
    counts: { total: 18, passed: 16, failed: 1, not_assessed: 1 },
    created_at: '2026-08-30T11:08:00+05:30',
  },
  9082: {
    ...scanCompliant,
    id: 9082,
    inspection_id: 772,
    commodity_generic: 'Toothpaste',
    brand_name: 'Pearl White',
    overall_result: 'compliant',
    counts: { total: 18, passed: 16, failed: 0, not_assessed: 2 },
    created_at: '2026-08-30T11:14:30+05:30',
  },
  9083: {
    ...scanViolation,
    id: 9083,
    inspection_id: 772,
    commodity_generic: 'Detergent cake',
    brand_name: 'BrightWash',
    overall_result: 'not_assessed',
    counts: { total: 18, passed: 13, failed: 0, not_assessed: 5 },
    created_at: '2026-08-30T11:21:15+05:30',
  },
  9084: {
    ...scanViolation,
    id: 9084,
    inspection_id: 773,
    commodity_generic: 'Atta',
    brand_name: 'Annapurna',
    overall_result: 'violation',
    counts: { total: 18, passed: 14, failed: 3, not_assessed: 1 },
    created_at: '2026-08-29T16:24:00+05:30',
  },
  9085: {
    ...scanOutOfScope,
    id: 9085,
    inspection_id: 774,
    commodity_generic: 'Biscuits',
    brand_name: 'Tastemaker',
    overall_result: 'out_of_scope',
    counts: { total: 18, passed: 1, failed: 0, not_assessed: 17 },
    created_at: '2026-08-29T10:18:30+05:30',
  },
  9086: {
    ...scanCompliant,
    id: 9086,
    inspection_id: 773,
    commodity_generic: 'Rice',
    brand_name: 'Sahara',
    overall_result: 'compliant',
    counts: { total: 18, passed: 17, failed: 0, not_assessed: 1 },
    created_at: '2026-08-29T16:32:00+05:30',
  },
  9087: {
    ...scanViolation,
    id: 9087,
    inspection_id: 773,
    commodity_generic: 'Soap',
    brand_name: 'GlowSkin',
    overall_result: 'violation',
    counts: { total: 18, passed: 14, failed: 2, not_assessed: 2 },
    created_at: '2026-08-29T16:38:00+05:30',
  },
  9088: {
    ...scanViolation,
    id: 9088,
    inspection_id: 774,
    commodity_generic: 'Sauce',
    brand_name: 'Red Sun',
    overall_result: 'violation',
    counts: { total: 18, passed: 15, failed: 2, not_assessed: 1 },
    created_at: '2026-08-29T10:24:00+05:30',
  },
  9089: {
    ...scanCompliant,
    id: 9089,
    inspection_id: 775,
    commodity_generic: 'Namkeen',
    brand_name: 'Tastemaker',
    overall_result: 'not_assessed',
    counts: { total: 18, passed: 11, failed: 0, not_assessed: 7 },
    created_at: '2026-08-30T13:42:00+05:30',
  },
  9090: {
    ...scanCompliant,
    id: 9090,
    inspection_id: 775,
    commodity_generic: 'Lentils',
    brand_name: 'Annapurna',
    overall_result: 'compliant',
    counts: { total: 18, passed: 16, failed: 0, not_assessed: 2 },
    created_at: '2026-08-30T13:50:00+05:30',
  },
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

/* The detail response is the same dict plus `scans`. Routers/inspections.py:152
   carries a slim per-scan dict (id, commodity, brand, result, the two counts
   and duplicate_of), but the inspection detail page now reads evidence and
   extraction data per package too, so the slim shape is enriched here. The
   list endpoint still returns slim rows; only the detail page is wider. */
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
    /* Richer fields shown on the inspection detail page. The live endpoint
       does not return these on _inspection_dict (Backend.md:558, 491); the
       review-gap callout on the page names that contract. The fixtures carry
       them so the page is reviewable. */
    images: s.images ?? [],
    mm_per_pixel: s.mm_per_pixel ?? null,
    scale_source: s.scale_source ?? 'none',
    ocr_text: s.ocr_text ?? null,
    ocr_confidence_mean: s.ocr_confidence_mean ?? null,
    extracted_fields: s.extracted_fields ?? {},
  })),
}

/* --------------------------------------------------------------- dashboard -- */

export const adminDashboard = {
  period_start: '2026-08-01',
  period_end: '2026-08-30',
  inspections: 148,
  /* The number of distinct shops that had at least one inspection recorded in
     this period. The KPI card "Stores visited" is drawn from this. /admin/dashboard
     does not return it today; the live endpoint will return this when queries.py
     adds a distinct-count over store_id, and AdminDashboard.jsx renders a gap
     callout when the field is missing. */
  stores_visited: 23,
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
  /* Repeat offenders — manufacturers with violations in three or more distinct
     shops in this period. The dashboard's "Repeat Offenders" KPI card counts
     this list, and the "Repeat violation alert" callout surfaces the worst
     entry. The threshold (3 shops) is named on the callout, not invented here.

     THE FIELDS BELOW — repeat_offenders, violations_by_category,
     violations_by_area, violations_by_brand — are NOT returned by the live
     /admin/dashboard endpoint. queries.py has no rollup for any of them.
     Each is rendered by AdminDashboard.jsx when present (the demo / fixture
     path) and replaced with a clearly named "data not yet available from
     backend" callout when absent (the live path). Same pattern as
     top_not_assessed_checks above. */
  repeat_offenders_count: 5,
  repeat_offenders: [
    { manufacturer: 'XYZ Foods Pvt Ltd',     violations: 17, stores: 8, last_violation: '2026-09-02' },
    { manufacturer: 'Vega Consumer Pvt Ltd', violations: 9,  stores: 4, last_violation: '2026-09-01' },
    { manufacturer: 'Annapurna Snacks',      violations: 6,  stores: 3, last_violation: '2026-08-30' },
    { manufacturer: 'Sahara Beverages',      violations: 4,  stores: 3, last_violation: '2026-08-28' },
    { manufacturer: 'Brightline Cosmetics',  violations: 3,  stores: 3, last_violation: '2026-08-25' },
  ],
  /* The seven categories an officer actually has to act on. When the live
     endpoint grows this, the chart switches off the derived mapping. */
  violations_by_category: [
    { category: 'MRP Violations',       count: 42 },
    { category: 'Net Quantity',         count: 27 },
    { category: 'Consumer Care',        count: 18 },
    { category: 'Manufacturer Details', count: 14 },
    { category: 'Date Declaration',     count: 11 },
    { category: 'Font / Readability',   count: 10 },
    { category: 'Placement / Manner',   count: 6  },
    { category: 'Others',               count: 8  },
  ],
  /* District / jurisdiction rollup. The endpoint would group on
     store.jurisdiction or the inspection's geofence coordinates. */
  violations_by_area: [
    { area: 'Kakinada',       count: 38 },
    { area: 'Rajahmundry',    count: 24 },
    { area: 'Anakapalli',     count: 18 },
    { area: 'Visakhapatnam',  count: 9  },
    { area: 'Vijayawada',     count: 19 },
    { area: 'Guntur',         count: 12 },
  ],
  /* Manufacturer → brand → product chains, ranked by violation count. The
     dashboard's "Brand/manufacturer patterns" table renders this list. */
  violations_by_brand: [
    { manufacturer: 'XYZ Foods Pvt Ltd',     brand: 'Tastemaker',     product: 'Salt Chips 50g',     count: 11 },
    { manufacturer: 'XYZ Foods Pvt Ltd',     brand: 'Tastemaker',     product: 'Masala Chips 90g',   count: 6  },
    { manufacturer: 'Vega Consumer Pvt Ltd', brand: 'VegaFresh',      product: 'Tomato Ketchup 200g', count: 5 },
    { manufacturer: 'Annapurna Snacks',      brand: 'Annapurna',      product: 'Mixture 250g',       count: 4  },
    { manufacturer: 'Sahara Beverages',      brand: 'Sahara',         product: 'Cola 500ml',         count: 3  },
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

/* Admin /admin/rule-versions — the versioned gazette readings the engine stamps
   onto every scan. Each entry has an Effective From; the Effective To is null
   while the version is current and the engine is using it (the `rules_as_at`
   on rulesMeta points at the row whose to-date is null). */
export const ruleVersions = [
  {
    id: 'rv-2006-amend',
    name: '2006 Amendment',
    effective_from: '2025-07-01',
    effective_to: null,
    description: 'Amendment Notified in 2006',
    is_active: true,
  },
  {
    id: 'rv-2005-amend',
    name: '2005 Amendment',
    effective_from: '2025-01-01',
    effective_to: null,
    description: 'Amendment Notified in 2025',
    is_active: true,
  },
  {
    id: 'rv-2017-amend',
    name: '2017 Amendment',
    effective_from: '2018-01-01',
    effective_to: null,
    description: 'Amendment Notified in 2017',
    is_active: true,
  },
  {
    id: 'rv-lmr-2011',
    name: 'LMR Rules 2011',
    effective_from: '2011-03-07',
    effective_to: null,
    description: 'Original Rules 2011',
    is_active: true,
  },
]

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

/* --------------------------------------------------------- repeat offenders --
 *
 * Repeat Offender Tracking fixture.
 *
 * The screen at /admin/repeat-offenders is the dedicated home of the
 * "manufacturer with breaches in three or more distinct shops" alert. The
 * top-of-page alert is the existing adminDashboard.repeat_offenders[0] —
 * the dashboard's KPI feeds into this screen, so the worst current offender
 * is the same one and the navigation is consistent.
 *
 * Five search modes: manufacturer, brand, shop, region, declaration type.
 * The list endpoint takes none of them as a parameter today; the screen
 * applies them client-side over the response and names the gap.
 *
 * The history rows are real findings, with date, store, brand, declaration
 * type, region and the rule that was applied — exactly what the brief asks
 * "Click → show history" to reveal.
 */
export const repeatOffenders = {
  /* Same data as the dashboard's rollup, lifted to its own fixture so this
     page can be loaded independently. The first row is the alert card. */
  total_breaches: 38,
  threshold_stores: 3,
  offenders: [
    {
      id: 'mfg-xyz',
      name: 'XYZ Foods Pvt Ltd',
      violations: 17,
      stores: 8,
      regions: ['Pune City', 'Pimpri-Chinchwad', 'Pune Rural'],
      brands: ['Demo Brand A', 'Tastemaker'],
      last_violation: '2026-09-02',
      history: [
        { id: 1, date: '2026-09-02', scan_id: 9101, store_id: 11, region: 'Pune City',          brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK04', inspector_id: 2 },
        { id: 2, date: '2026-09-02', scan_id: 9101, store_id: 11, region: 'Pune City',          brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK12', inspector_id: 2 },
        { id: 3, date: '2026-08-31', scan_id: 9102, store_id: 12, region: 'Pune City',          brand: 'Tastemaker',    product: 'Namkeen',   check_id: 'CHK04', inspector_id: 2 },
        { id: 4, date: '2026-08-30', scan_id: 9041, store_id: 11, region: 'Pune City',          brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK06', inspector_id: 2 },
        { id: 5, date: '2026-08-30', scan_id: 9041, store_id: 11, region: 'Pune City',          brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK12', inspector_id: 2 },
        { id: 6, date: '2026-08-29', scan_id: 9085, store_id: 14, region: 'Pimpri-Chinchwad',   brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK01', inspector_id: 3 },
        { id: 7, date: '2026-08-28', scan_id: 9089, store_id: 11, region: 'Pune City',          brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK12', inspector_id: 2 },
        { id: 8, date: '2026-08-27', scan_id: 9111, store_id: 13, region: 'Pune Rural',         brand: 'Tastemaker',    product: 'Namkeen',   check_id: 'CHK04', inspector_id: 4 },
        { id: 9, date: '2026-08-26', scan_id: 9112, store_id: 12, region: 'Pune City',          brand: 'Tastemaker',    product: 'Namkeen',   check_id: 'CHK13', inspector_id: 2 },
        { id: 10, date: '2026-08-25', scan_id: 9113, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK05', inspector_id: 3 },
        { id: 11, date: '2026-08-24', scan_id: 9094, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK08', inspector_id: 3 },
        { id: 12, date: '2026-08-22', scan_id: 9114, store_id: 11, region: 'Pune City',          brand: 'Tastemaker',    product: 'Namkeen',   check_id: 'CHK04', inspector_id: 2 },
        { id: 13, date: '2026-08-20', scan_id: 9115, store_id: 13, region: 'Pune Rural',         brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK12', inspector_id: 4 },
        { id: 14, date: '2026-08-18', scan_id: 9116, store_id: 12, region: 'Pune City',          brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK04', inspector_id: 2 },
        { id: 15, date: '2026-08-15', scan_id: 9117, store_id: 11, region: 'Pune City',          brand: 'Tastemaker',    product: 'Namkeen',   check_id: 'CHK13', inspector_id: 2 },
        { id: 16, date: '2026-08-12', scan_id: 9118, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'Demo Brand A',  product: 'Biscuits',  check_id: 'CHK12', inspector_id: 3 },
        { id: 17, date: '2026-08-08', scan_id: 9119, store_id: 13, region: 'Pune Rural',         brand: 'Tastemaker',    product: 'Namkeen',   check_id: 'CHK05', inspector_id: 4 },
      ],
    },
    {
      id: 'mfg-vega',
      name: 'Vega Consumer Pvt Ltd',
      violations: 9,
      stores: 4,
      regions: ['Pune City', 'Pimpri-Chinchwad'],
      brands: ['VegaFresh', 'Demo Brand B'],
      last_violation: '2026-09-01',
      history: [
        { id: 1, date: '2026-09-01', scan_id: 9121, store_id: 12, region: 'Pune City',         brand: 'VegaFresh',  product: 'Edible oil', check_id: 'CHK05', inspector_id: 2 },
        { id: 2, date: '2026-08-30', scan_id: 9081, store_id: 12, region: 'Pune City',         brand: 'Demo Brand B', product: 'Edible oil', check_id: 'CHK05', inspector_id: 2 },
        { id: 3, date: '2026-08-25', scan_id: 9093, store_id: 11, region: 'Pune City',         brand: 'VegaFresh',  product: 'Edible oil', check_id: 'CHK05', inspector_id: 2 },
        { id: 4, date: '2026-08-22', scan_id: 9122, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'VegaFresh',  product: 'Edible oil', check_id: 'CHK01', inspector_id: 3 },
        { id: 5, date: '2026-08-20', scan_id: 9123, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'Demo Brand B', product: 'Edible oil', check_id: 'CHK05', inspector_id: 3 },
        { id: 6, date: '2026-08-18', scan_id: 9124, store_id: 12, region: 'Pune City',         brand: 'VegaFresh',  product: 'Edible oil', check_id: 'CHK13', inspector_id: 2 },
        { id: 7, date: '2026-08-15', scan_id: 9125, store_id: 12, region: 'Pune City',         brand: 'VegaFresh',  product: 'Edible oil', check_id: 'CHK12', inspector_id: 2 },
        { id: 8, date: '2026-08-12', scan_id: 9126, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'VegaFresh',  product: 'Edible oil', check_id: 'CHK05', inspector_id: 3 },
        { id: 9, date: '2026-08-10', scan_id: 9127, store_id: 11, region: 'Pune City',         brand: 'Demo Brand B', product: 'Edible oil', check_id: 'CHK13', inspector_id: 2 },
      ],
    },
    {
      id: 'mfg-annapurna',
      name: 'Annapurna Flour Mills',
      violations: 6,
      stores: 3,
      regions: ['Pune City', 'Pimpri-Chinchwad', 'Pune Rural'],
      brands: ['Annapurna'],
      last_violation: '2026-08-30',
      history: [
        { id: 1, date: '2026-08-30', scan_id: 9084, store_id: 12, region: 'Pune City',         brand: 'Annapurna', product: 'Atta', check_id: 'CHK13', inspector_id: 3 },
        { id: 2, date: '2026-08-26', scan_id: 9131, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'Annapurna', product: 'Atta', check_id: 'CHK01', inspector_id: 3 },
        { id: 3, date: '2026-08-22', scan_id: 9132, store_id: 13, region: 'Pune Rural',        brand: 'Annapurna', product: 'Atta', check_id: 'CHK12', inspector_id: 4 },
        { id: 4, date: '2026-08-18', scan_id: 9133, store_id: 11, region: 'Pune City',         brand: 'Annapurna', product: 'Atta', check_id: 'CHK13', inspector_id: 2 },
        { id: 5, date: '2026-08-14', scan_id: 9134, store_id: 12, region: 'Pune City',         brand: 'Annapurna', product: 'Atta', check_id: 'CHK05', inspector_id: 2 },
        { id: 6, date: '2026-08-09', scan_id: 9135, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'Annapurna', product: 'Atta', check_id: 'CHK01', inspector_id: 3 },
      ],
    },
    {
      id: 'mfg-sahara',
      name: 'Sahara Agro Pvt Ltd',
      violations: 4,
      stores: 3,
      regions: ['Pune City', 'Pimpri-Chinchwad', 'Pune Rural'],
      brands: ['Sahara', 'Sahara Basmati'],
      last_violation: '2026-08-28',
      history: [
        { id: 1, date: '2026-08-28', scan_id: 9141, store_id: 11, region: 'Pune City',         brand: 'Sahara',          product: 'Rice', check_id: 'CHK01', inspector_id: 2 },
        { id: 2, date: '2026-08-26', scan_id: 9092, store_id: 13, region: 'Pune Rural',        brand: 'Sahara',          product: 'Rice', check_id: 'CHK01', inspector_id: 4 },
        { id: 3, date: '2026-08-22', scan_id: 9142, store_id: 12, region: 'Pune City',         brand: 'Sahara Basmati',  product: 'Rice', check_id: 'CHK13', inspector_id: 2 },
        { id: 4, date: '2026-08-16', scan_id: 9143, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'Sahara',          product: 'Rice', check_id: 'CHK01', inspector_id: 3 },
      ],
    },
    {
      id: 'mfg-bright',
      name: 'BrightChem Industries',
      violations: 3,
      stores: 3,
      regions: ['Pune City', 'Pimpri-Chinchwad', 'Pune Rural'],
      brands: ['BrightWash'],
      last_violation: '2026-08-25',
      history: [
        { id: 1, date: '2026-08-25', scan_id: 9151, store_id: 11, region: 'Pune City',         brand: 'BrightWash', product: 'Detergent cake', check_id: 'CHK08', inspector_id: 2 },
        { id: 2, date: '2026-08-23', scan_id: 9152, store_id: 12, region: 'Pune City',         brand: 'BrightWash', product: 'Detergent cake', check_id: 'CHK13', inspector_id: 2 },
        { id: 3, date: '2026-08-19', scan_id: 9153, store_id: 14, region: 'Pimpri-Chinchwad',  brand: 'BrightWash', product: 'Detergent cake', check_id: 'CHK08', inspector_id: 3 },
      ],
    },
  ],
}

/* ----------------------------------------------------------------- violations --
 *
 * Violations list fixture.
 *
 * The live endpoint is /admin/violations, which routers/admin.py does not yet
 * expose. Until it does, the screen renders against this fixture, with a
 * fixture.fallback used by useResource in the same way the other admin
 * screens use it. The shape follows the brief: a Top-Violations rollup in
 * the five categories the user named, then a per-record list the filters
 * can narrow.
 *
 * Mapping of check_id to category — kept here, in the fixture, because the
 * brief's five labels are higher-level than the catalog's CHK0x ids. The
 * one-category-per-check mapping is a UI rollup, not an engine verdict, and
 * is named as such in the screen.
 */
const VIOLATION_CATEGORY_OF = {
  CHK01: 'manufacturer',  /* Rule 6 presence - manufacturer / name / address */
  CHK04: 'mrp',           /* MRP declaration form */
  CHK05: 'net_quantity',  /* Net quantity form */
  CHK06: 'net_quantity',  /* Principal display panel character height (form of the quantity declaration) */
  CHK06b: 'net_quantity',
  CHK07: 'net_quantity',  /* height of numerals */
  CHK08: 'consumer_care', /* contrast for consumer-care legibility */
  CHK12: 'manufacturer',  /* country of origin (manufacturer responsibility) */
  CHK13: 'date',          /* best-before / use-by */
  CHK11: 'manufacturer',  /* stickers and corrections */
}

export const violationsList = {
  total: 112,
  /* The five categories from the brief, in their order. */
  top_categories: [
    { id: 'mrp', count: 42 },
    { id: 'net_quantity', count: 27 },
    { id: 'consumer_care', count: 18 },
    { id: 'manufacturer', count: 14 },
    { id: 'date', count: 11 },
  ],
  rule_versions: [
    { id: '2026-07-01', label: 'Rules as at 2026-07-01' },
    { id: '2026-04-01', label: 'Rules as at 2026-04-01' },
    { id: '2026-01-01', label: 'Rules as at 2026-01-01' },
  ],
  /* A wide set, with multiple entries per shop and per inspector, so the
     filters have something to work on. */
  items: [
    { id: 9041, date: '2026-08-30', store_id: 11, user_id: 2, rules_as_at: '2026-07-01', commodity_generic: 'Biscuits', brand_name: 'Demo Brand A', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK04', reason: 'MRP shown as Rs. 20/- only — no “inclusive of all taxes” qualifier.' },
    { id: 9041, date: '2026-08-30', store_id: 11, user_id: 2, rules_as_at: '2026-07-01', commodity_generic: 'Biscuits', brand_name: 'Demo Brand A', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK12', reason: 'No country-of-origin declaration on any panel.' },
    { id: 9041, date: '2026-08-30', store_id: 11, user_id: 2, rules_as_at: '2026-07-01', commodity_generic: 'Biscuits', brand_name: 'Demo Brand A', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK06', reason: '1.12 mm character height on the principal display panel.' },
    { id: 9041, date: '2026-08-30', store_id: 11, user_id: 2, rules_as_at: '2026-07-01', commodity_generic: 'Biscuits', brand_name: 'Demo Brand A', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK13', reason: 'Best-before missing on a perishable biscuit SKU.' },
    { id: 9081, date: '2026-08-30', store_id: 12, user_id: 2, rules_as_at: '2026-07-01', commodity_generic: 'Edible oil', brand_name: 'Demo Brand B', manufacturer: 'Vega Consumer Pvt Ltd', check_id: 'CHK05', reason: 'Net quantity printed as “1 L approx.” — qualifier “approx.” is prohibited.' },
    { id: 9082, date: '2026-08-30', store_id: 12, user_id: 2, rules_as_at: '2026-07-01', commodity_generic: 'Toothpaste', brand_name: 'Pearl White', manufacturer: 'Pearl Consumer Care Ltd', check_id: 'CHK04', reason: 'MRP shown as “M.R.P. Rs. 95/-” with no inclusive-of-taxes note.' },
    { id: 9083, date: '2026-08-30', store_id: 12, user_id: 3, rules_as_at: '2026-07-01', commodity_generic: 'Detergent cake', brand_name: 'BrightWash', manufacturer: 'BrightChem Industries', check_id: 'CHK08', reason: 'Consumer-care number printed in 5.4 pt — contrast ratio 3.1:1 against the panel.' },
    { id: 9084, date: '2026-08-30', store_id: 12, user_id: 3, rules_as_at: '2026-07-01', commodity_generic: 'Atta', brand_name: 'Annapurna', manufacturer: 'Annapurna Flour Mills', check_id: 'CHK13', reason: 'Best-before shown only as “see pack” with no month/year on the principal panel.' },
    { id: 9085, date: '2026-08-29', store_id: 14, user_id: 3, rules_as_at: '2026-07-01', commodity_generic: 'Biscuits', brand_name: 'Demo Brand A', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK01', reason: 'Name and address of the packer missing from the front panel.' },
    { id: 9086, date: '2026-08-29', store_id: 14, user_id: 3, rules_as_at: '2026-07-01', commodity_generic: 'Toothpaste', brand_name: 'Pearl White', manufacturer: 'Pearl Consumer Care Ltd', check_id: 'CHK06', reason: 'Numerals on the PDP measured at 2.2 mm; 3.0 mm required.' },
    { id: 9087, date: '2026-08-29', store_id: 14, user_id: 3, rules_as_at: '2026-07-01', commodity_generic: 'Namkeen', brand_name: 'Tastemaker', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK04', reason: 'MRP printed in paise (₹ 2500) without rupee symbol.' },
    { id: 9088, date: '2026-08-29', store_id: 13, user_id: 4, rules_as_at: '2026-07-01', commodity_generic: 'Sauce', brand_name: 'Red Sun', manufacturer: 'RedSun Foods', check_id: 'CHK05', reason: 'Net quantity in fluid ounces, a non-permitted unit.' },
    { id: 9089, date: '2026-08-28', store_id: 11, user_id: 2, rules_as_at: '2026-07-01', commodity_generic: 'Biscuits', brand_name: 'Demo Brand A', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK12', reason: 'Country of origin not declared on the imported SKU.' },
    { id: 9090, date: '2026-08-28', store_id: 12, user_id: 2, rules_as_at: '2026-04-01', commodity_generic: 'Soap', brand_name: 'GlowSkin', manufacturer: 'GlowSkin Personal Care', check_id: 'CHK04', reason: 'MRP printed as a single price with no inclusive-of-taxes note.' },
    { id: 9091, date: '2026-08-27', store_id: 14, user_id: 3, rules_as_at: '2026-04-01', commodity_generic: 'Detergent cake', brand_name: 'BrightWash', manufacturer: 'BrightChem Industries', check_id: 'CHK13', reason: 'Best-before shows only the year, no month.' },
    { id: 9092, date: '2026-08-26', store_id: 13, user_id: 4, rules_as_at: '2026-04-01', commodity_generic: 'Rice', brand_name: 'Sahara', manufacturer: 'Sahara Agro Pvt Ltd', check_id: 'CHK01', reason: 'Manufacturer name abbreviated to “Sahara Agro” with no full address.' },
    { id: 9093, date: '2026-08-25', store_id: 11, user_id: 2, rules_as_at: '2026-04-01', commodity_generic: 'Edible oil', brand_name: 'VegaFresh', manufacturer: 'Vega Consumer Pvt Ltd', check_id: 'CHK05', reason: 'Net quantity shown as “1 litre (Net Wt. 920 g)” — mass in parentheses is forbidden.' },
    { id: 9094, date: '2026-08-24', store_id: 14, user_id: 3, rules_as_at: '2026-01-01', commodity_generic: 'Biscuits', brand_name: 'Demo Brand A', manufacturer: 'Tastemaker Snacks Pvt Ltd', check_id: 'CHK08', reason: 'Consumer-care number at 3.4:1 contrast against a saturated yellow panel.' },
  ],
}

export const VIOLATION_CATEGORIES = ['mrp', 'net_quantity', 'consumer_care', 'manufacturer', 'date']
export const VIOLATION_CATEGORY_OF_MAP = VIOLATION_CATEGORY_OF

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
  violationsList,
  VIOLATION_CATEGORIES,
  VIOLATION_CATEGORY_OF_MAP,
  rulesMeta,
  todaysReport,
  reportCalendar,
  repeatOffenders,
}

export default fixtures
