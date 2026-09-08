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

import { CHECKS, DERIVED_CHECK, REGISTRATION_ORDER } from '../lib/checks'

const RULES_AS_AT = '2026-07-01'
const ENGINE_VERSION = '2.0.0'
const CATALOG_HASH = 'b41f9c0d7e2a4863f5d1c98a2e7b04d6c3a58f19e0d7b26c48a1f350d92e6b7c'

/* Employee IDs follow the same shape as Backend/seed.py (LM-ADM-nnn for an
   administrator, LM-<zone>-nnnn for an inspector) but deliberately use numbers
   the seed never issues, so a fixture row can never be mistaken for a seeded
   account. */
export const users = [
  { id: 1, employee_id: 'LM-ADM-901', full_name: 'A. Deshmukh', role: 'admin', jurisdiction: 'Pune Division', is_active: true },
  { id: 2, employee_id: 'LM-TG-1042', full_name: 'Inspector One', role: 'inspector', jurisdiction: 'Hyderabad North', is_active: true },
  { id: 3, employee_id: 'LM-PN-9114', full_name: 'S. Iyer', role: 'inspector', jurisdiction: 'Pune City', is_active: true },
  { id: 4, employee_id: 'LM-PN-9207', full_name: 'R. Kulkarni', role: 'inspector', jurisdiction: 'Pimpri-Chinchwad', is_active: true },
  { id: 5, employee_id: 'LM-PN-9233', full_name: 'M. Fernandes', role: 'inspector', jurisdiction: 'Pune Rural', is_active: true },
  { id: 6, employee_id: 'LM-PN-9298', full_name: 'P. Bhosale', role: 'inspector', jurisdiction: 'Baramati', is_active: false },
]

export const currentUser = users[1]

/* GET /stores returns routers/inspections.py:_store_dict - `store_type`, not
   `kind`, and the address broken into its parts. */
export const stores = [
  { id: 1, name: 'Anand General Store', store_type: 'retail', address: 'Plot 12, Main Road, Secunderabad', city: 'Hyderabad North', district: 'Hyderabad', state: 'Telangana', pincode: '500003', latitude: 17.4399, longitude: 78.4983, geofence_radius_m: 150 },
  { id: 2, name: 'Vasavi Wholesale Depot', store_type: 'wholesale', address: 'APMC Complex, Bowenpally', city: 'Hyderabad North', district: 'Hyderabad', state: 'Telangana', pincode: '500011', latitude: 17.4695, longitude: 78.4851, geofence_radius_m: 250 },
  { id: 3, name: 'Sri Sai Traders', store_type: 'retail', address: 'Shop 4, Marredpally West', city: 'Hyderabad North', district: 'Hyderabad', state: 'Telangana', pincode: '500026', latitude: 17.4478, longitude: 78.5102, geofence_radius_m: 150 },
  { id: 4, name: 'Ramesh Provision Store', store_type: 'retail', address: 'Karkhana Main Road', city: 'Hyderabad North', district: 'Hyderabad', state: 'Telangana', pincode: '500009', latitude: 17.4721, longitude: 78.5034, geofence_radius_m: 150 },
  { id: 5, name: 'Srinivasa Stores', store_type: 'retail', address: 'Near Clock Tower, Subhash Road', city: 'Hyderabad North', district: 'Hyderabad', state: 'Telangana', pincode: '500003', latitude: 17.4385, longitude: 78.4921, geofence_radius_m: 150 },
  { id: 6, name: 'Lakshmi Supermarket', store_type: 'retail', address: 'Alwal Hills Road', city: 'Hyderabad North', district: 'Hyderabad', state: 'Telangana', pincode: '500010', latitude: 17.5023, longitude: 78.5147, geofence_radius_m: 150 },
  { id: 11, name: 'Shivneri Provision Stores', store_type: 'retail', address: 'Lane 4, Kothrud', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411038', latitude: 18.5074, longitude: 73.8077, geofence_radius_m: 150 },
  { id: 12, name: 'Ganraj Supermart', store_type: 'retail', address: 'Market Road, Hadapsar', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411028', latitude: 18.5089, longitude: 73.9260, geofence_radius_m: 150 },
  { id: 13, name: 'Sahyadri Wholesale Depot', store_type: 'wholesale', address: 'APMC Yard, Gultekdi', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411037', latitude: 18.4938, longitude: 73.8712, geofence_radius_m: 250 },
  { id: 14, name: 'Nisarg Daily Needs', store_type: 'retail', address: 'Sector 21, Nigdi', city: 'Pimpri-Chinchwad', district: 'Pune', state: 'Maharashtra', pincode: '411044', latitude: 18.6513, longitude: 73.7708, geofence_radius_m: 150 },
  { id: 15, name: 'Sai Provision Mart', store_type: 'retail', address: 'Bibwewadi Corner', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411037', latitude: 18.4636, longitude: 73.8680, geofence_radius_m: 150 },
  { id: 16, name: 'Bhagyalaxmi Traders', store_type: 'wholesale', address: 'Market Yard Gate 3', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411037', latitude: 18.4858, longitude: 73.8615, geofence_radius_m: 250 },
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

/* ---------------------------------------------------- inspector demo rows --
   The inspector dashboard needs completed inspections with products, results
   and per-check findings that the review surfaces can show. The four named
   scans above remain the canonical review fixtures; what follows is generated
   with the same buildFindings catalog so the counts can never drift from the
   rows. `ocr` is the one presentational extra: the Rule 6 declarations the
   extraction phase reads and the scans table persists (ocr_text,
   net_quantity_value, …) but ScanOut does not yet expose. It is rendered only
   when a payload carries it — the live endpoint simply shows the gap. */

/** Every package scan reaches CHK15/CHK16 only through a listing capture. */
const PKG_PLAN = {
  CHK15: { v: 'not_assessed', reason: NO_LISTING },
  CHK16: { v: 'not_assessed', reason: NO_LISTING },
}

/** Build a ScanOut-shaped scan; verdict counts are derived so they add up. */
function scanFrom({ id, inspection_id, commodity, brand = null, result, limb = null, action = null, plan = {}, images = [], created_at, mm_per_pixel = 0.0405, scale_source = 'reference_card', ocr = null }) {
  const merged = { ...PKG_PLAN, ...plan }
  const entries = Object.entries(merged)
  const failed = entries.filter(([checkId, p]) => p.v === 'fail' && checkId !== DERIVED_CHECK).length
  const notAssessed = entries.filter(([, p]) => p.v === 'not_assessed').length
  return {
    id,
    inspection_id,
    commodity_generic: commodity,
    brand_name: brand,
    overall_result: result,
    violation_limb: limb,
    recommended_action: action,
    checks_total: 18,
    checks_assessed: result === 'out_of_scope' ? 1 : 18 - notAssessed,
    mm_per_pixel,
    scale_source,
    rules_as_at: RULES_AS_AT,
    catalog_hash: CATALOG_HASH,
    engine_version: ENGINE_VERSION,
    duplicate_of: null,
    created_at,
    counts: { total: 18, passed: 18 - failed - notAssessed, failed, not_assessed: notAssessed },
    findings: buildFindings(merged),
    images,
    ocr,
  }
}

const OOS_PLAN = Object.fromEntries([
  ['CHK03', { v: 'pass', observed: 'Net quantity 50 kg exceeds the 25 kg ceiling in Rule 3.' }],
  ...REGISTRATION_ORDER.filter((id) => id !== 'CHK03').map((id) => [
    id,
    { v: 'not_assessed', reason: 'Chapter II does not apply to this package, so the declaration duties were not assessed. There is no obligation here to have breached.' },
  ]),
])

/** Image set for a captured two-panel package. Hashes are illustrative. */
function panels(ids, opts = {}) {
  const [front, back] = ids
  return [
    { id: front, panel: 'front', sha256: '9c2f41d8e7b0a36514c8d2f6a09b7e5d3c8a1f2e6b4d7c9a0e3f5b8d1a4c7e2f9', width_px: 3024, height_px: 4032, rectified: true, residual_tilt_deg: 0.9, blur_variance: 176.2, ...(opts.front ?? {}) },
    { id: back, panel: 'back', sha256: '51b8e3a7c9d0f2468a1c5e7b9d3f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f', width_px: 3024, height_px: 4032, rectified: true, residual_tilt_deg: 1.6, blur_variance: 141.8, ...(opts.back ?? {}) },
  ]
}

/** The Rule 6 declarations as the extraction phase read them. A `null` value
    is as load-bearing as a filled one — a declaration the OCR never saw is
    exactly what CHK01 reports on. */
function ocrFrom(decls, confidenceMean) {
  return {
    confidence_mean: confidenceMean,
    declarations: decls.map(([label, value, confidence]) => ({
      label,
      value,
      found: value != null,
      confidence,
    })),
  }
}

const OCR_FULL = ocrFrom(
  [
    ['Name & address of manufacturer / packer', 'Demo Foods Pvt. Ltd., Plot 14, MIDC Bhosari, Pune 411026', 0.94],
    ['Generic name of the commodity', 'As printed on the front panel', 0.91],
    ['Net quantity', 'As printed below the brand mark', 0.93],
    ['Month & year of manufacture', '08 / 2026', 0.9],
    ['Best before', '02 / 2027', 0.88],
    ['Retail sale price (MRP)', '₹ 45.00 (inclusive of all taxes)', 0.92],
    ['Country of origin', 'Not declared (not an imported package)', 0.64],
    ['FSSAI licence number', '11223344556677', 0.72],
  ],
  0.87
)

export const scanRice5kg = scanFrom({
  id: 9045,
  inspection_id: 772,
  commodity: 'Rice (5 kg)',
  brand: 'Demo Brand D',
  result: 'compliant',
  created_at: '2026-08-30T11:20:10+05:30',
  images: panels([510, 511]),
  ocr: OCR_FULL,
})

export const scanCookingOil = scanFrom({
  id: 9046,
  inspection_id: 772,
  commodity: 'Cooking oil (1 L)',
  brand: 'Demo Brand B',
  result: 'violation',
  limb: '36(1)',
  action: 'improvement_notice',
  created_at: '2026-08-30T11:34:40+05:30',
  plan: {
    CHK04: {
      v: 'fail',
      observed: 'No retail sale price declaration found on any captured panel.',
      required: 'The retail sale price must be declared per Rule 6(1)(e) read with Rule 2(m).',
      confidence: 0.9,
    },
    CHK18: { v: 'fail', observed: 'One major contravention within limb 36(1). An improvement notice under Section 15 is the proportionate first response.' },
  },
  images: panels([512, 513]),
  ocr: ocrFrom(
    [
      ['Name & address of manufacturer / packer', 'Demo Oils Ltd., Survey 42, Taloja MIDC, Navi Mumbai 410208', 0.93],
      ['Net quantity', '1 L', 0.96],
      ['Month & year of manufacture', '07 / 2026', 0.89],
      ['Best before', null, null],
      ['Retail sale price (MRP)', null, null],
      ['Country of origin', null, null],
    ],
    0.81
  ),
})

export const scanMilkPowder = scanFrom({
  id: 9047,
  inspection_id: 773,
  commodity: 'Milk powder (500 g)',
  brand: 'Demo Brand C',
  result: 'compliant',
  created_at: '2026-08-29T15:58:12+05:30',
  images: panels([514, 515]),
  ocr: OCR_FULL,
})

export const scanRice50kgOOS = scanFrom({
  id: 9048,
  inspection_id: 774,
  commodity: 'Rice (50 kg)',
  brand: null,
  result: 'out_of_scope',
  created_at: '2026-08-29T10:15:33+05:30',
  plan: OOS_PLAN,
  images: [],
})

export const scanBiscuits200 = scanFrom({
  id: 9049,
  inspection_id: 776,
  commodity: 'Biscuits (200 g)',
  brand: 'Demo Brand A',
  result: 'compliant',
  created_at: '2026-08-28T10:12:44+05:30',
  images: panels([516, 517]),
  ocr: OCR_FULL,
})

export const scanTea250 = scanFrom({
  id: 9050,
  inspection_id: 777,
  commodity: 'Tea (250 g)',
  brand: 'Demo Brand B',
  result: 'violation',
  limb: '36(1)',
  action: 'improvement_notice',
  created_at: '2026-08-27T11:41:03+05:30',
  plan: {
    CHK06: {
      v: 'fail',
      observed: '1.05 mm measured character height (± 0.13 mm).',
      required: '1.50 mm minimum for a principal display panel of 64 cm².',
      confidence: 0.88,
    },
    CHK06b: { v: 'pass', observed: '2.10 mm (± 0.13 mm)', required: '2.00 mm', confidence: 0.84 },
    CHK18: { v: 'fail', observed: 'One major contravention within limb 36(1). An improvement notice under Section 15 is the proportionate first response.' },
  },
  images: panels([518, 519]),
  ocr: OCR_FULL,
})

export const scanSugar1kg = scanFrom({
  id: 9051,
  inspection_id: 777,
  commodity: 'Sugar (1 kg)',
  brand: 'Demo Brand C',
  result: 'compliant',
  created_at: '2026-08-27T12:02:19+05:30',
  images: panels([520, 521]),
  ocr: OCR_FULL,
})

export const scanTurmeric = scanFrom({
  id: 9052,
  inspection_id: 778,
  commodity: 'Turmeric powder (100 g)',
  brand: 'Demo Brand A',
  result: 'not_assessed',
  action: 'human_review',
  created_at: '2026-08-26T16:22:31+05:30',
  mm_per_pixel: null,
  scale_source: 'none',
  plan: {
    CHK06: { v: 'not_assessed', reason: NO_SCALE },
    CHK06b: { v: 'not_assessed', reason: NO_SCALE },
    CHK07: { v: 'not_assessed', reason: NO_SCALE },
    CHK09: { v: 'not_assessed', reason: NO_SCALE },
    CHK08: { v: 'not_assessed', reason: 'The captured panel is glossy and the reflection covers part of the declaration, so a contrast ratio could not be measured reliably.' },
    CHK18: { v: 'not_assessed', reason: '5 of 18 checks could not be assessed, so the graduated response under Section 36 cannot be settled on this evidence.' },
  },
  images: panels([522, 523], { front: { rectified: false, residual_tilt_deg: 4.1, blur_variance: 58.4 } }),
  ocr: OCR_FULL,
})

export const scanSalt = scanFrom({
  id: 9053,
  inspection_id: 778,
  commodity: 'Salt (1 kg)',
  brand: 'Demo Brand D',
  result: 'compliant',
  created_at: '2026-08-26T16:44:05+05:30',
  images: panels([524, 525]),
  ocr: OCR_FULL,
})

export const scanMasala = scanFrom({
  id: 9054,
  inspection_id: 779,
  commodity: 'Masala (50 g)',
  brand: 'Demo Brand A',
  result: 'compliant',
  created_at: '2026-08-12T10:31:27+05:30',
  images: panels([526, 527]),
  ocr: OCR_FULL,
})

export const scanBasmati = scanFrom({
  id: 9055,
  inspection_id: 780,
  commodity: 'Basmati rice (1 kg)',
  brand: 'Demo Brand B',
  result: 'violation',
  limb: '36(2)',
  action: 'improvement_notice',
  created_at: '2026-08-24T12:14:52+05:30',
  plan: {
    CHK05: {
      v: 'fail',
      observed: 'Net quantity reads “Net wt. 1 kg*”; the asterisk ties the declaration to a footnote qualifier.',
      required: 'Net quantity expressed in standard units, free of qualifiers.',
      confidence: 0.87,
    },
    CHK18: { v: 'fail', observed: 'One contravention within limb 36(2). An improvement notice under Section 15 is the proportionate first response.' },
  },
  images: panels([528, 529]),
  ocr: OCR_FULL,
})

export const scanHoney = scanFrom({
  id: 9056,
  inspection_id: 780,
  commodity: 'Honey (500 g)',
  brand: 'Demo Brand C',
  result: 'compliant',
  created_at: '2026-08-24T12:36:18+05:30',
  images: panels([530, 531]),
  ocr: OCR_FULL,
})

export const scanGroundnutOil = scanFrom({
  id: 9057,
  inspection_id: 781,
  commodity: 'Groundnut oil (1 L)',
  brand: 'Demo Brand B',
  result: 'compliant',
  created_at: '2026-09-01T10:20:41+05:30',
  images: panels([532, 533]),
  ocr: OCR_FULL,
})

export const scanWheatFlour = scanFrom({
  id: 9058,
  inspection_id: 781,
  commodity: 'Wheat flour (1 kg)',
  brand: 'Demo Brand C',
  result: 'compliant',
  created_at: '2026-09-01T10:41:33+05:30',
  images: panels([534, 535]),
  ocr: OCR_FULL,
})

export const scanToorDal = scanFrom({
  id: 9059,
  inspection_id: 782,
  commodity: 'Toor dal (1 kg)',
  brand: 'Demo Brand E',
  result: 'violation',
  limb: '36(1)',
  action: 'improvement_notice',
  created_at: '2026-08-25T11:55:09+05:30',
  plan: {
    CHK01: {
      v: 'fail',
      observed: 'The name and address of the manufacturer or packer is absent from the back panel; the remaining Rule 6 declarations are present.',
      required: 'Every declaration in Rule 6(1) and 6(2), including the manufacturer or packer name and address.',
      confidence: 0.92,
    },
    CHK18: { v: 'fail', observed: 'One major contravention within limb 36(1). An improvement notice under Section 15 is the proportionate first response.' },
  },
  images: panels([536, 537]),
  ocr: ocrFrom(
    [
      ['Name & address of manufacturer / packer', null, null],
      ['Net quantity', '1 kg', 0.95],
      ['Month & year of manufacture', '07 / 2026', 0.91],
      ['Retail sale price (MRP)', '₹ 132.00 (inclusive of all taxes)', 0.9],
      ['Country of origin', null, null],
    ],
    0.78
  ),
})

export const scanPoha = scanFrom({
  id: 9060,
  inspection_id: 782,
  commodity: 'Poha (500 g)',
  brand: 'Demo Brand A',
  result: 'compliant',
  created_at: '2026-08-25T12:18:56+05:30',
  images: panels([538, 539]),
  ocr: OCR_FULL,
})

export const scanNoodles = scanFrom({
  id: 9061,
  inspection_id: 783,
  commodity: 'Instant noodles (70 g)',
  brand: 'Demo Brand B',
  result: 'compliant',
  created_at: '2026-08-14T09:47:22+05:30',
  images: panels([540, 541]),
  ocr: OCR_FULL,
})

export const scanCoffee = scanFrom({
  id: 9062,
  inspection_id: 784,
  commodity: 'Coffee (100 g)',
  brand: 'Demo Brand C',
  result: 'not_assessed',
  action: 'human_review',
  created_at: '2026-08-17T15:31:44+05:30',
  mm_per_pixel: null,
  scale_source: 'none',
  plan: {
    CHK06: { v: 'not_assessed', reason: NO_SCALE },
    CHK06b: { v: 'not_assessed', reason: NO_SCALE },
    CHK07: { v: 'not_assessed', reason: NO_SCALE },
    CHK09: { v: 'not_assessed', reason: NO_SCALE },
    CHK18: { v: 'not_assessed', reason: '4 of 18 checks could not be assessed, so the graduated response under Section 36 cannot be settled on this evidence.' },
  },
  images: panels([542, 543], { front: { rectified: false, residual_tilt_deg: 5.3, blur_variance: 44.9 } }),
  ocr: OCR_FULL,
})

export const scanRava = scanFrom({
  id: 9063,
  inspection_id: 784,
  commodity: 'Rava (500 g)',
  brand: 'Demo Brand D',
  result: 'compliant',
  created_at: '2026-08-17T15:52:10+05:30',
  images: panels([544, 545]),
  ocr: OCR_FULL,
})

export const scanDetergent = scanFrom({
  id: 9064,
  inspection_id: 785,
  commodity: 'Detergent powder (1 kg)',
  brand: 'Demo Brand E',
  result: 'compliant',
  created_at: '2026-08-19T11:05:37+05:30',
  images: panels([546, 547]),
  ocr: OCR_FULL,
})

export const scanBiscuits100Draft = scanFrom({
  id: 9065,
  inspection_id: 775,
  commodity: 'Biscuits (100 g)',
  brand: 'Demo Brand A',
  result: 'not_assessed',
  action: null,
  created_at: '2026-08-30T09:12:05+05:30',
  plan: Object.fromEntries(
    REGISTRATION_ORDER.map((id) => [
      id,
      { v: 'not_assessed', reason: 'Assessment has not run yet — this package is still a draft on the officer’s device.' },
    ])
  ),
  images: panels([548, 549]),
  ocr: null,
})

export const scanBiscuits100 = scanFrom({
  id: 9066,
  inspection_id: 786,
  commodity: 'Biscuits (100 g)',
  brand: 'Demo Brand A',
  result: 'compliant',
  created_at: '2026-08-21T10:26:15+05:30',
  images: panels([550, 551]),
  ocr: OCR_FULL,
})

export const scanChilli = scanFrom({
  id: 9067,
  inspection_id: 787,
  commodity: 'Chilli powder (100 g)',
  brand: 'Demo Brand A',
  result: 'compliant',
  created_at: '2026-09-03T10:14:28+05:30',
  images: panels([552, 553]),
  ocr: OCR_FULL,
})

export const scanGramFlour = scanFrom({
  id: 9068,
  inspection_id: 788,
  commodity: 'Gram flour (500 g)',
  brand: 'Demo Brand C',
  result: 'compliant',
  created_at: '2026-09-05T11:42:53+05:30',
  images: panels([554, 555]),
  ocr: OCR_FULL,
})

export const scanSunflowerOil = scanFrom({
  id: 9069,
  inspection_id: 789,
  commodity: 'Sunflower oil (1 L)',
  brand: 'Demo Brand B',
  result: 'compliant',
  created_at: '2026-09-07T09:58:36+05:30',
  images: panels([556, 557]),
  ocr: OCR_FULL,
})

export const scan1023_Rice = scanFrom({
  id: 10231,
  inspection_id: 1023,
  commodity: 'Rice (1kg)',
  brand: 'Anand Sharbati',
  result: 'violation',
  limb: '36(1)',
  action: 'improvement_notice',
  created_at: '2026-09-08T10:32:00+05:30',
  plan: {
    CHK01: {
      v: 'fail',
      observed: 'Manufacturer address missing on the primary display panel.',
      required: 'Rule 6(1)(a) requires complete name and address of the manufacturer.',
      confidence: 0.94,
    },
    CHK06: {
      v: 'fail',
      observed: 'Measured numeral height 1.12 mm.',
      required: 'Rule 7 table requires minimum 2.0 mm for 1kg package.',
      confidence: 0.91,
    },
    CHK18: {
      v: 'fail',
      observed: 'Two major violations under limb 36(1). Improvement notice issued under Section 15.',
    },
  },
  images: panels([10231, 10232]),
  ocr: OCR_FULL,
})

export const scan1022_Oil = scanFrom({
  id: 10221,
  inspection_id: 1022,
  commodity: 'Cooking Oil (1L)',
  brand: 'Vasavi Gold',
  result: 'compliant',
  created_at: '2026-09-07T16:15:00+05:30',
  images: panels([10221, 10222]),
  ocr: OCR_FULL,
})

export const scan1021_Biscuits = scanFrom({
  id: 10211,
  inspection_id: 1021,
  commodity: 'Biscuits (200g)',
  brand: 'Anand Crisp',
  result: 'not_assessed',
  action: 'human_review',
  created_at: '2026-09-07T11:20:00+05:30',
  mm_per_pixel: null,
  scale_source: 'none',
  plan: {
    CHK06: { v: 'not_assessed', reason: 'Reflective gloss on packaging prevented automated character height resolution. Needs inspector review.' },
    CHK06b: { v: 'not_assessed', reason: NO_SCALE },
    CHK18: { v: 'not_assessed', reason: 'Pending manual evaluation of font dimensions.' },
  },
  images: panels([10211, 10212], { front: { rectified: false, residual_tilt_deg: 3.2, blur_variance: 74.0 } }),
  ocr: OCR_FULL,
})

export const scan1020_Milk = scanFrom({
  id: 10201,
  inspection_id: 1020,
  commodity: 'Milk Powder (500g)',
  brand: 'Sri Sai Pure',
  result: 'compliant',
  created_at: '2026-09-06T15:42:00+05:30',
  images: panels([10201, 10202]),
  ocr: OCR_FULL,
})

export const scan1019_Atta = scanFrom({
  id: 10191,
  inspection_id: 1019,
  commodity: 'Atta (5kg)',
  brand: 'Vasavi Chakki Fresh',
  result: 'compliant',
  created_at: '2026-09-06T11:05:00+05:30',
  images: panels([10191, 10192]),
  ocr: OCR_FULL,
})

export const scan1018_Sugar = scanFrom({
  id: 10181,
  inspection_id: 1018,
  commodity: 'Sugar (1kg)',
  brand: 'Ramesh Sweet Crystals',
  result: 'violation',
  limb: '36(2)',
  action: 'improvement_notice',
  created_at: '2026-09-05T14:18:00+05:30',
  plan: {
    CHK04: {
      v: 'fail',
      observed: 'Retail sale price (MRP) does not state "inclusive of all taxes".',
      required: 'Rule 26 / Rule 6(1)(e) requires unambiguous tax declaration.',
      confidence: 0.89,
    },
    CHK18: {
      v: 'fail',
      observed: 'Violation under Rule 26. Section 15 notice recommended.',
    },
  },
  images: panels([10181, 10182]),
  ocr: OCR_FULL,
})

export const scan1017_Turmeric = scanFrom({
  id: 10171,
  inspection_id: 1017,
  commodity: 'Turmeric Powder (100g)',
  brand: 'Srinivasa Spices',
  result: 'not_assessed',
  action: null,
  created_at: '2026-09-05T13:12:00+05:30',
  plan: Object.fromEntries(
    REGISTRATION_ORDER.map((id) => [
      id,
      { v: 'not_assessed', reason: 'Draft inspection awaiting completion by inspector.' },
    ])
  ),
  images: panels([10171, 10172]),
  ocr: null,
})

export const scan1016_Masala = scanFrom({
  id: 10161,
  inspection_id: 1016,
  commodity: 'Masala (50g)',
  brand: 'Lakshmi Kitchen King',
  result: 'not_assessed',
  action: null,
  created_at: '2026-09-04T17:27:00+05:30',
  plan: Object.fromEntries(
    REGISTRATION_ORDER.map((id) => [
      id,
      { v: 'not_assessed', reason: 'Draft inspection on inspector device.' },
    ])
  ),
  images: panels([10161, 10162]),
  ocr: null,
})

export const scansById = {
  10231: scan1023_Rice,
  10221: scan1022_Oil,
  10211: scan1021_Biscuits,
  10201: scan1020_Milk,
  10191: scan1019_Atta,
  10181: scan1018_Sugar,
  10171: scan1017_Turmeric,
  10161: scan1016_Masala,
  9041: scanViolation,
  9042: scanNotAssessed,
  9043: scanCompliant,
  9044: scanOutOfScope,
  9045: scanRice5kg,
  9046: scanCookingOil,
  9047: scanMilkPowder,
  9048: scanRice50kgOOS,
  9049: scanBiscuits200,
  9050: scanTea250,
  9051: scanSugar1kg,
  9052: scanTurmeric,
  9053: scanSalt,
  9054: scanMasala,
  9055: scanBasmati,
  9056: scanHoney,
  9057: scanGroundnutOil,
  9058: scanWheatFlour,
  9059: scanToorDal,
  9060: scanPoha,
  9061: scanNoodles,
  9062: scanCoffee,
  9063: scanRava,
  9064: scanDetergent,
  9065: scanBiscuits100Draft,
  9066: scanBiscuits100,
  9067: scanChilli,
  9068: scanGramFlour,
  9069: scanSunflowerOil,
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
  { id: 1023, store_id: 1, user_id: 2, inspection_date: '2026-09-08', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 12.0, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Routine market inspection at Secunderabad. Violations recorded under Rule 6 and Rule 7.', submitted_at: '2026-09-08T10:32:00+05:30', scan_count: 1 },
  { id: 1022, store_id: 2, user_id: 2, inspection_date: '2026-09-07', status: 'submitted', transaction_type: 'wholesale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 24.5, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Wholesale depot consignment inspected. Fully compliant.', submitted_at: '2026-09-07T16:15:00+05:30', scan_count: 1 },
  { id: 1021, store_id: 1, user_id: 2, inspection_date: '2026-09-07', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 14.2, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Glossy packaging reflection flagged by engine; officer review initiated.', submitted_at: '2026-09-07T11:20:00+05:30', scan_count: 1 },
  { id: 1020, store_id: 3, user_id: 2, inspection_date: '2026-09-06', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 9.1, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Routine retail inspection. All declarations verified.', submitted_at: '2026-09-06T15:42:00+05:30', scan_count: 1 },
  { id: 1019, store_id: 2, user_id: 2, inspection_date: '2026-09-06', status: 'submitted', transaction_type: 'wholesale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 35.8, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Packaged atta stock inspection. All checks passed.', submitted_at: '2026-09-06T11:05:00+05:30', scan_count: 1 },
  { id: 1018, store_id: 4, user_id: 2, inspection_date: '2026-09-05', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 16.3, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Non-compliant MRP format detected. Notice to be served.', submitted_at: '2026-09-05T14:18:00+05:30', scan_count: 1 },
  { id: 1017, store_id: 5, user_id: 2, inspection_date: '2026-09-05', status: 'draft', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 10.5, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: null, notes: 'Unfinished inspection draft.', submitted_at: null, scan_count: 1 },
  { id: 1016, store_id: 6, user_id: 2, inspection_date: '2026-09-04', status: 'draft', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 18.0, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: null, notes: 'Unfinished inspection draft.', submitted_at: null, scan_count: 1 },
  { id: 771, store_id: 11, user_id: 2, inspection_date: '2026-08-30', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 12.4, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Routine market inspection. Representative present and signed.', submitted_at: '2026-08-30T09:58:00+05:30', scan_count: 4 },
  { id: 772, store_id: 12, user_id: 2, inspection_date: '2026-08-30', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 31.0, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'refused', notes: 'Representative declined to sign. Copy left at the counter.', submitted_at: '2026-08-30T11:22:00+05:30', scan_count: 3 },
  { id: 773, store_id: 14, user_id: 3, inspection_date: '2026-08-29', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 8.6, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-08-29T16:40:00+05:30', scan_count: 6 },
  { id: 774, store_id: 13, user_id: 4, inspection_date: '2026-08-29', status: 'submitted', transaction_type: 'institutional', in_scope: false, out_of_scope_reason: 'Institutional supply, not a retail sale, so Chapter II does not apply to the consignment.', geofence_status: 'outside', geofence_distance_m: 210.0, geofence_reason: 'Recorded 210 m from the registered address. The depot gate is on the far side of the yard.', mock_location: false, clock_skew_seconds: 0, signature_status: 'unavailable', notes: 'No authorised representative on site; the yard supervisor could not sign for the depot. Copy left with the gate office.', submitted_at: '2026-08-29T10:12:00+05:30', scan_count: 2 },
  { id: 775, store_id: 11, user_id: 3, inspection_date: '2026-08-30', status: 'draft', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'unknown', geofence_distance_m: null, geofence_reason: 'Location unavailable on this device. The inspection can still be recorded.', mock_location: null, clock_skew_seconds: 41, signature_status: null, notes: null, submitted_at: null, scan_count: 1 },
  { id: 776, store_id: 15, user_id: 2, inspection_date: '2026-08-28', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 6.2, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-08-28T10:31:00+05:30', scan_count: 1 },
  { id: 777, store_id: 12, user_id: 2, inspection_date: '2026-08-27', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 18.9, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Label height discussed with the stockist; improvement notice to follow.', submitted_at: '2026-08-27T12:15:00+05:30', scan_count: 2 },
  { id: 778, store_id: 14, user_id: 2, inspection_date: '2026-08-26', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 11.3, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'refused', notes: 'Representative declined to sign. Copy left at the counter.', submitted_at: '2026-08-26T17:02:00+05:30', scan_count: 2 },
  { id: 779, store_id: 15, user_id: 2, inspection_date: '2026-08-12', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 9.8, geofence_reason: null, mock_location: false, clock_skew_seconds: 3, signature_status: 'signed', notes: null, submitted_at: '2026-08-12T10:49:00+05:30', scan_count: 1 },
  { id: 780, store_id: 16, user_id: 2, inspection_date: '2026-08-24', status: 'submitted', transaction_type: 'wholesale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 42.5, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-08-24T12:51:00+05:30', scan_count: 2 },
  { id: 781, store_id: 16, user_id: 2, inspection_date: '2026-09-01', status: 'submitted', transaction_type: 'wholesale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 37.1, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-09-01T11:03:00+05:30', scan_count: 2 },
  { id: 782, store_id: 15, user_id: 2, inspection_date: '2026-08-25', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 14.6, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: 'Missing manufacturer address on one pack; stockist informed.', submitted_at: '2026-08-25T12:34:00+05:30', scan_count: 2 },
  { id: 783, store_id: 13, user_id: 2, inspection_date: '2026-08-14', status: 'submitted', transaction_type: 'wholesale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 55.0, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'unavailable', notes: 'No authorised representative on site; copy left with the gate office.', submitted_at: '2026-08-14T10:12:00+05:30', scan_count: 1 },
  { id: 784, store_id: 14, user_id: 2, inspection_date: '2026-08-17', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 7.4, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-08-17T16:08:00+05:30', scan_count: 2 },
  { id: 785, store_id: 15, user_id: 2, inspection_date: '2026-08-19', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 10.1, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-08-19T11:27:00+05:30', scan_count: 1 },
  { id: 786, store_id: 12, user_id: 2, inspection_date: '2026-08-21', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 22.7, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-08-21T10:44:00+05:30', scan_count: 1 },
  { id: 787, store_id: 15, user_id: 2, inspection_date: '2026-09-03', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 8.8, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-09-03T10:32:00+05:30', scan_count: 1 },
  { id: 788, store_id: 11, user_id: 2, inspection_date: '2026-09-05', status: 'submitted', transaction_type: 'retail_sale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 13.5, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-09-05T12:01:00+05:30', scan_count: 1 },
  { id: 789, store_id: 16, user_id: 2, inspection_date: '2026-09-07', status: 'submitted', transaction_type: 'wholesale', in_scope: true, out_of_scope_reason: null, geofence_status: 'inside', geofence_distance_m: 48.2, geofence_reason: null, mock_location: false, clock_skew_seconds: 0, signature_status: 'signed', notes: null, submitted_at: '2026-09-07T10:15:00+05:30', scan_count: 1 },
]

/* ---------------------------------------------------------------- records --
   Join tables the review surfaces need, derived from the scans above so the
   demo can never disagree with itself. `scansForInspection(id)` mirrors what
   GET /inspections/{id} returns in `scans` — the six summary fields per scan. */
export const scansByInspection = {
  1023: [10231],
  1022: [10221],
  1021: [10211],
  1020: [10201],
  1019: [10191],
  1018: [10181],
  1017: [10171],
  1016: [10161],
  771: [9041, 9042, 9043, 9044],
  772: [9045, 9046],
  773: [9047],
  774: [9048],
  775: [9065],
  776: [9049],
  777: [9050, 9051],
  778: [9052, 9053],
  779: [9054],
  780: [9055, 9056],
  781: [9057, 9058],
  782: [9059, 9060],
  783: [9061],
  784: [9062, 9063],
  785: [9064],
  786: [9066],
  787: [9067],
  788: [9068],
  789: [9069],
}

const scanSummary = (s) => ({
  id: s.id,
  commodity_generic: s.commodity_generic,
  brand_name: s.brand_name,
  overall_result: s.overall_result,
  checks_assessed: s.checks_assessed,
  checks_total: s.checks_total,
  duplicate_of: s.duplicate_of,
})

export function scansForInspection(id) {
  return (scansByInspection[id] ?? [])
    .map((sid) => scansById[sid])
    .filter(Boolean)
    .map((s) => ({ ...s, inspection_id: Number(id) }))
}

const GPS_BY_STORE = {
  1: { latitude: 17.4399, longitude: 78.4983, gps_accuracy_m: 8 },
  2: { latitude: 17.4695, longitude: 78.4851, gps_accuracy_m: 11 },
  3: { latitude: 17.4478, longitude: 78.5102, gps_accuracy_m: 7 },
  4: { latitude: 17.4721, longitude: 78.5034, gps_accuracy_m: 9 },
  5: { latitude: 17.4385, longitude: 78.4921, gps_accuracy_m: 6 },
  6: { latitude: 17.5023, longitude: 78.5147, gps_accuracy_m: 12 },
  11: { latitude: 18.5071, longitude: 73.8081, gps_accuracy_m: 8 },
  12: { latitude: 18.5093, longitude: 73.9255, gps_accuracy_m: 11 },
  13: { latitude: 18.4941, longitude: 73.8706, gps_accuracy_m: 14 },
  14: { latitude: 18.6517, longitude: 73.7702, gps_accuracy_m: 9 },
  15: { latitude: 18.4631, longitude: 73.8687, gps_accuracy_m: 7 },
  16: { latitude: 18.4862, longitude: 73.8610, gps_accuracy_m: 12 },
}

/** GET /inspections/{id} for every fixture inspection, ready to stand in for
    the detail endpoint. Each carries its own scans and (demo-only) location. */
export const inspectionDetailsById = Object.fromEntries(
  inspections.map((i) => {
    const gps = GPS_BY_STORE[i.store_id] ?? {}
    return [
      i.id,
      {
        ...i,
        ...gps,
        location_captured_at: i.submitted_at ?? `${i.inspection_date}T10:00:00+05:30`,
        scans: scansForInspection(i.id).map(scanSummary),
      },
    ]
  })
)

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
  inspectionDetailsById,
  scansById,
  scansByInspection,
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
