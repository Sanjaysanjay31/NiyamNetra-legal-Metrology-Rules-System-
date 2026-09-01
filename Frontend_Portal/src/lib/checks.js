/**
 * The check catalog, mirrored from Backend/rules_engine.py and Docs/03 SS3.3.
 *
 * Nineteen rows for eighteen checks. CHK06b is a sub-check of CHK06 and reports
 * under it. CHK18 is the derived Section 36 tier, not an assessed check, so it
 * is excluded from the denominator: `checks_total` is 18, never 19. A package
 * scan additionally cannot reach CHK15 or CHK16 - those need a web listing - so
 * a typical package scan assesses 16 of 18 and the header says so.
 *
 * Two orderings are exported because two things need ordering, and conflating
 * them is how a UI stops matching its engine:
 *
 *   REGISTRATION_ORDER - the order the engine runs and returns findings in,
 *     which is the order the law applies: gates first, so a package outside
 *     Chapter II never accrues a single violation. CheckRibbon uses this.
 *
 *   PHASE_GROUPS - the reading order for the review screen, per 08 SS4.4.
 *     The four headings cover exactly the eighteen assessable checks; CHK18
 *     sits outside them because it is outside the denominator. Registration
 *     order is preserved *within* each group.
 *
 * Titles and citations are copied verbatim from the engine. Where a provision
 * has not been read against the gazette, the engine appends its ledger
 * reference and the word "unverified", and so does this file - see
 * Backend/citations.py. Do not quietly promote one to a pinpoint citation.
 */

export const CHECKS = {
  // --- Phase 1: gates. Any of these tripping short-circuits what follows. ---
  CHK03: {
    id: 'CHK03',
    title: 'Chapter II applies to this package',
    short: 'Chapter II applicability',
    phase: 1,
    group: 'scope',
    severity: 'critical',
    source: 'OPERATOR',
    citation: 'Rule 3, Legal Metrology (Packaged Commodities) Rules 2011',
    unverified: false,
    shortCircuits: 'all',
    help: 'Over 25 kg or 25 L, industrial or institutional supply, or quantity determined in the purchaser’s presence: Chapter II does not apply, and there is no declaration duty to breach.',
  },
  CHK02: {
    id: 'CHK02',
    title: 'Small-package exemption under Rule 26(a)',
    short: 'Small-package exemption',
    phase: 1,
    group: 'scope',
    severity: 'critical',
    source: 'PACKAGE + OPERATOR',
    citation: 'Rule 26(a) small-package exemption',
    unverified: 'L-15',
    shortCircuits: 'all',
    help: 'Net quantity of 10 g or 10 ml or less is exempt. The gate reads the extracted net quantity, so it cannot run before extraction.',
  },
  CHK14: {
    id: 'CHK14',
    title: 'Medical device — labelling routed to Medical Devices Rules 2017',
    short: 'Medical device routing',
    phase: 1,
    group: 'scope',
    severity: 'critical',
    source: 'OPERATOR + PACKAGE',
    citation: 'proviso to Rule 2(h), as amended w.e.f 23 October 2025',
    unverified: false,
    shortCircuits: 'phase3',
    help: 'The 2025 proviso routes declaration and font requirements to the Medical Devices Rules 2017. Metrology checks become not assessed; Rule 6 presence duties still run, reported as advisory.',
  },

  // --- Phase 2: presence and form of declarations. ------------------------
  CHK01: {
    id: 'CHK01',
    title: 'All mandatory Rule 6 declarations present',
    short: 'Mandatory declarations present',
    phase: 2,
    group: 'presence',
    severity: 'critical',
    source: 'PACKAGE',
    citation: 'Rule 6(1) and 6(2), mandatory declarations',
    unverified: false,
    help: 'Name and address of manufacturer, packer or importer; common name of the commodity; net quantity; month and year of packing; retail sale price; consumer care details.',
  },
  CHK04: {
    id: 'CHK04',
    title: 'Retail sale price correctly expressed',
    short: 'Retail sale price form',
    phase: 2,
    group: 'content',
    severity: 'major',
    source: 'PACKAGE',
    citation: 'Rule 6(1)(e) read with Rule 2(m)',
    unverified: false,
    help: '"Maximum retail price ₹ … inclusive of all taxes", rounded to the nearest rupee or 50 paise, with no second or dual price. Absence of the price itself is reported under CHK01.',
  },
  CHK05: {
    id: 'CHK05',
    title: 'Net quantity free of qualifiers and in permitted units',
    short: 'Net quantity form',
    phase: 2,
    group: 'content',
    severity: 'major',
    source: 'PACKAGE',
    citation: 'the prohibited-qualifier provision in Rules 12-13',
    unverified: 'L-01',
    help: 'No "about", "approximately", "minimum", "when packed" or similar qualifier, and SI units only.',
  },
  CHK11: {
    id: 'CHK11',
    title: 'Any sticker only reduces price and does not obscure the original',
    short: 'Sticker and correction',
    phase: 2,
    group: 'content',
    severity: 'major',
    source: 'PACKAGE',
    citation: 'Rules 6(3) to 6(4A) on stickers and corrections',
    unverified: false,
    help: 'A sticker may reduce the retail sale price. It may not increase it, and it may not cover the original declaration.',
  },
  CHK12: {
    id: 'CHK12',
    title: 'Country of origin declared on imported goods',
    short: 'Country of origin',
    phase: 2,
    group: 'presence',
    severity: 'major',
    source: 'PACKAGE + OPERATOR',
    citation: 'Rule 6(1)(aa), country of origin',
    unverified: false,
    help: 'Required on imported packages. On a domestic package the check records that the duty does not arise rather than producing no row at all.',
  },
  CHK13: {
    id: 'CHK13',
    title: 'Best-before or use-by declared where the commodity is perishable',
    short: 'Best-before declaration',
    phase: 2,
    group: 'presence',
    severity: 'major',
    source: 'PACKAGE + OPERATOR',
    citation: 'Rule 6(1)(da), best-before declaration',
    unverified: false,
    help: 'Applies where the commodity is perishable. Whether it is perishable is an operator declaration, not an inference from the image.',
  },
  CHK10: {
    id: 'CHK10',
    title: 'Net quantity is a prescribed standard pack size',
    short: 'Standard pack size',
    phase: 2,
    group: 'content',
    severity: 'minor',
    source: 'PACKAGE',
    citation: 'Rule 5 read with the Second Schedule',
    unverified: 'L-05',
    help: 'Only certain commodities have prescribed sizes. Where the commodity is not in the Second Schedule the check is not assessed, with that as its stated reason.',
  },
  CHK17: {
    id: 'CHK17',
    title: 'FSSAI licence number visible (advisory — not a Legal Metrology finding)',
    short: 'FSSAI licence visible',
    phase: 2,
    group: 'presence',
    severity: 'advisory',
    source: 'PACKAGE',
    citation: 'Food Safety and Standards Act 2006',
    unverified: false,
    advisoryOnly: true,
    help: 'Recorded for referral to the food safety authority. It is not a Legal Metrology contravention and never contributes to a violation.',
  },

  // --- Phase 3: metrology. Precondition-heavy and uncertainty-bearing. ----
  CHK06: {
    id: 'CHK06',
    title: 'Character height meets Table-I for the panel area',
    short: 'Character height',
    phase: 3,
    group: 'metrology',
    severity: 'major',
    source: 'PACKAGE + OPERATOR',
    citation: 'Rule 7(2) read with Table-I as substituted w.e.f 01.01.2018',
    unverified: 'L-11',
    measured: true,
    help: 'Needs a resolved millimetres-per-pixel scale and the panel area. Without a scale reference the height cannot be measured and the check is not assessed.',
  },
  CHK06b: {
    id: 'CHK06b',
    title: 'Net-quantity declaration meets its own minimum height',
    short: 'Net-quantity height',
    phase: 3,
    group: 'metrology',
    severity: 'major',
    source: 'PACKAGE + OPERATOR',
    citation: 'the net-quantity-specific minimum height in Rule 7',
    unverified: 'L-04',
    measured: true,
    subOf: 'CHK06',
    help: 'A separate minimum that applies to the net-quantity declaration in addition to, and may exceed, the general Table-I minimum checked in CHK06.',
  },
  CHK07: {
    id: 'CHK07',
    title: 'Character width at least one-third of height',
    short: 'Character width',
    phase: 3,
    group: 'metrology',
    severity: 'minor',
    source: 'PACKAGE + OPERATOR',
    citation: 'Rule 7(3), character width',
    unverified: false,
    measured: true,
    help: 'The characters 1, i, I and l are excluded from the ratio, because their natural width is below it.',
  },
  CHK09: {
    id: 'CHK09',
    title: 'Clear space around the net-quantity declaration',
    short: 'Clear space',
    phase: 3,
    group: 'metrology',
    severity: 'minor',
    source: 'PACKAGE + OPERATOR',
    citation: 'Rule 8, clear space around the net-quantity declaration',
    unverified: 'L-09',
    measured: true,
    help: 'One character height above and below, two to the left and right.',
  },
  CHK08: {
    id: 'CHK08',
    title: 'Declarations contrast conspicuously with the background',
    short: 'Conspicuous contrast',
    phase: 3,
    group: 'metrology',
    severity: 'minor',
    source: 'PACKAGE',
    citation: 'Rule 9, conspicuous contrast',
    unverified: 'L-10',
    measured: true,
    help: 'Measured from the crop. Lighting and gloss both affect it, so a borderline ratio is reported with its uncertainty rather than as a bare pass or fail.',
  },

  // --- Phase 2, but reachable only from a listing. ------------------------
  CHK15: {
    id: 'CHK15',
    title: 'E-commerce listing displays the required declarations',
    short: 'Listing declarations',
    phase: 2,
    group: 'presence',
    severity: 'major',
    source: 'LISTING',
    citation: 'Rule 6(10), declarations on e-commerce listings',
    unverified: false,
    listingOnly: true,
    help: 'Every Rule 6(1) declaration except month and year of packing must appear on the listing itself. A package scan cannot reach this check.',
  },
  CHK16: {
    id: 'CHK16',
    title: 'Platform offers a searchable country-of-origin filter',
    short: 'Origin search filter',
    phase: 2,
    group: 'presence',
    severity: 'major',
    source: 'PLATFORM',
    citation: 'Rule 6(10A), country-of-origin search filter',
    unverified: 'L-13',
    listingOnly: true,
    help: 'A duty on the platform, not on the seller, in force from 01.07.2026. A package scan cannot reach this check.',
  },

  // --- Phase 4: derived. Outside the denominator. -------------------------
  CHK18: {
    id: 'CHK18',
    title: 'Graduated response under Section 36 as amended',
    short: 'Graduated response',
    phase: 4,
    group: 'derived',
    severity: 'advisory',
    source: 'DERIVED',
    citation:
      'Section 36, Legal Metrology Act 2009, as amended by the Jan Vishwas Act 2026',
    unverified: 'L-12',
    derived: true,
    help: 'Computed from the other eighteen findings once the whole picture is visible. It is not an assessed check and is excluded from the denominator.',
  },
}

/** The order the engine runs and returns findings in. All nineteen rows. */
export const REGISTRATION_ORDER = [
  'CHK03', 'CHK02', 'CHK14',
  'CHK01', 'CHK04', 'CHK05', 'CHK11', 'CHK12', 'CHK13', 'CHK10', 'CHK17',
  'CHK06', 'CHK06b', 'CHK07', 'CHK09', 'CHK08',
  'CHK15', 'CHK16',
  'CHK18',
]

/** Reading order for the review screen. 08 SS4.4. */
export const PHASE_GROUPS = [
  {
    id: 'scope',
    label: 'Scope',
    caption: 'Whether the Rules govern this package at all. Decided first, so nothing downstream accrues against a package outside Chapter II.',
    checks: ['CHK03', 'CHK02', 'CHK14'],
  },
  {
    id: 'presence',
    label: 'Presence',
    caption: 'Whether each required declaration is on the package.',
    checks: ['CHK01', 'CHK12', 'CHK13', 'CHK17', 'CHK15', 'CHK16'],
  },
  {
    id: 'content',
    label: 'Content',
    caption: 'Whether what is declared is expressed as the Rules require.',
    checks: ['CHK04', 'CHK05', 'CHK11', 'CHK10'],
  },
  {
    id: 'metrology',
    label: 'Metrology',
    caption: 'Measured from the image against a resolved scale. Every one of these carries an uncertainty.',
    checks: ['CHK06', 'CHK06b', 'CHK07', 'CHK09', 'CHK08'],
  },
]

/** CHK18 is the derived tier, not an assessed check. */
export const DERIVED_CHECK = 'CHK18'

/** Checks a package-only scan cannot reach. */
export const LISTING_CHECKS = ['CHK15', 'CHK16']

/** 18. Not 19. This constant exists so nobody computes it from the wrong array. */
export const CHECKS_TOTAL = REGISTRATION_ORDER.filter((id) => id !== DERIVED_CHECK).length

export const SHORT_CIRCUIT_CHECKS = ['CHK03', 'CHK02', 'CHK14']

/** Every phase-3 check becomes not_assessed when CHK14 trips. */
export const METROLOGY_CHECKS = REGISTRATION_ORDER.filter((id) => CHECKS[id].phase === 3)

/**
 * The four scan results, derived from nineteen three-state findings.
 * `not_assessed` is a first-class result and is never rendered as either of the
 * other two - 08 SS2.4 calls this the single most important constraint in the
 * design. `out_of_scope` outranks everything: there was no obligation to breach.
 */
export const SCAN_RESULTS = {
  compliant: {
    id: 'compliant',
    label: 'Compliant',
    family: 'pass',
    icon: 'CheckCircle',
    blurb: 'Every assessed declaration met its requirement.',
  },
  violation: {
    id: 'violation',
    label: 'Violation',
    family: 'violation',
    icon: 'XCircle',
    blurb: 'At least one declaration did not meet its requirement.',
  },
  not_assessed: {
    id: 'not_assessed',
    label: 'Not assessed',
    family: 'na',
    icon: 'HelpCircle',
    blurb: 'The evidence did not settle every check. This is not a pass.',
  },
  out_of_scope: {
    id: 'out_of_scope',
    label: 'Out of scope',
    family: 'na',
    icon: 'Clock',
    blurb: 'Chapter II of the Rules does not apply to this package.',
  },
}

/** The three finding verdicts. Icon + word + colour, never colour alone. */
export const VERDICTS = {
  pass: { id: 'pass', label: 'Pass', family: 'pass', icon: 'CheckCircle' },
  fail: { id: 'fail', label: 'Violation', family: 'violation', icon: 'XCircle' },
  not_assessed: {
    id: 'not_assessed',
    label: 'Not assessed',
    family: 'na',
    icon: 'HelpCircle',
  },
}

export const SEVERITIES = {
  critical: { label: 'Critical', rank: 0 },
  major: { label: 'Major', rank: 1 },
  minor: { label: 'Minor', rank: 2 },
  advisory: { label: 'Advisory', rank: 3 },
}

/**
 * The denominator sentence. Never assembled ad hoc at a call site: the whole
 * point is that one string, computed one way, appears on every surface.
 *   e.g. "16 of 18 checks - package scan"
 */
export function denominatorLabel({ assessed, total = CHECKS_TOTAL, scanType = 'package' }) {
  const kind =
    scanType === 'listing' ? 'listing scan' : scanType === 'both' ? 'package and listing' : 'package scan'
  return `${assessed} of ${total} checks — ${kind}`
}

export function checkById(id) {
  return CHECKS[id] ?? null
}

/**
 * The verdict a finding is *shown* under.
 *
 * The API returns three: `engine_verdict`, `human_verdict` and
 * `effective_verdict`. The interface reads the effective one, and where a human
 * overrode the engine it shows both - the override is legitimate and expected,
 * but it is never silent (08 SS4.4). Reading `.verdict` directly would silently
 * pick up `undefined` on a real payload, so it is only the last fallback.
 */
export function verdictOf(finding) {
  return finding?.effective_verdict ?? finding?.human_verdict ?? finding?.engine_verdict ?? finding?.verdict
}

export function isOverridden(finding) {
  return Boolean(
    finding?.human_verdict && finding.human_verdict !== finding.engine_verdict
  )
}

/** Sort findings into the engine's registration order, whatever order they arrive in. */
export function inRegistrationOrder(findings = []) {
  const rank = new Map(REGISTRATION_ORDER.map((id, i) => [id, i]))
  return [...findings].sort(
    (a, b) => (rank.get(a.check_id) ?? 99) - (rank.get(b.check_id) ?? 99)
  )
}

/** Counts for the summary strip. Four, not three, and CHK18 is not among them. */
export function tallyFindings(findings = []) {
  const assessable = findings.filter((f) => f.check_id !== DERIVED_CHECK)
  const t = { passed: 0, failed: 0, not_assessed: 0, advisory: 0, overridden: 0 }
  for (const f of assessable) {
    const v = verdictOf(f)
    if (v === 'pass') t.passed += 1
    else if (v === 'fail') t.failed += 1
    else t.not_assessed += 1
    if (CHECKS[f.check_id]?.advisoryOnly) t.advisory += 1
    if (isOverridden(f)) t.overridden += 1
  }
  t.total = CHECKS_TOTAL
  t.assessed = assessable.length - t.not_assessed
  return t
}
