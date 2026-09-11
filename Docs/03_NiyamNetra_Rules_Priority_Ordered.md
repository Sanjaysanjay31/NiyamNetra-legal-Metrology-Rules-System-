# NiyamNetra - Rule Engine Specification - Priority Ordered
### Smart India Hackathon 2026 - Problem Statement SIH26034 - Executable Check Order
**Version:** 3.0 | **Date:** 29 Aug 2026 | **Revised:** 30 Aug 2026
**Path:** C:\Skills\Projects\NiyamNetra\Docs\03_NiyamNetra_Rules_Priority_Ordered.md
**Scope:** The eighteen compliance checks in the exact order the engine must run them, with inputs, outputs, preconditions and short-circuit conditions

---

## 1. WHAT THIS FILE IS

This is the implementation contract for `backend/app/rules/engine.py`. It specifies, for every check: its ID, what it needs, what it emits, what stops it running, and where it sits in the order.

It deliberately contains **no legal argument**. Every "why does the law say that" question is answered in `02_NiyamNetra_Rules.md`, which this file cross-references by section. The two files were near-identical in earlier versions; they are now split by purpose, and neither should restate the other.

---

## 2. THE RESULT MODEL

### 2.1 Three states, not two

```python
from enum import Enum

class Verdict(str, Enum):
    PASS         = "pass"           # requirement met
    FAIL         = "fail"           # requirement demonstrably breached
    NOT_ASSESSED = "not_assessed"   # cannot be determined - always with a reason
```

`NOT_ASSESSED` is the single most important design decision in the engine. A false violation is the most damaging output the system can produce: it destroys an inspector's trust permanently and it is indefensible if the shopkeeper contests it. Anything the engine cannot prove, it declines to assert. See `02` §1.2.

A check returns `NOT_ASSESSED` when any of these hold:

| Condition | Example |
|---|---|
| Precondition unmet | Rule 7 font check with no package dimensions supplied |
| Reference data absent | Second Schedule table not transcribed for this commodity |
| OCR confidence below threshold | mean confidence < 0.60 on the declaration block |
| Measurement uncertainty exceeds tolerance | character height 2.1 ± 0.3 mm against a 2.5 mm minimum, upper bound 2.4 mm - assert; but 2.3 ± 0.3 mm has upper bound 2.6 mm - do not assert |
| Requirement is conditional and the condition is unknown | best-before, where perishability is undetermined |
| Governed by another instrument | medical device under Rule 7 |
| Out of scope entirely | Rule 3 exclusion |

### 2.2 Per-check output

Every check returns the same structure. This is what the API serialises and what `scans.findings` stores.

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class Finding:
    check_id: str                    # "CHK06"
    verdict: Verdict
    title: str                       # "Character height below Table-I minimum"
    detail: str                      # human sentence shown in the report
    reason: str | None = None        # REQUIRED when verdict is NOT_ASSESSED
    citation: str = ""               # from CATALOG, blank if unverified
    provision: str = ""              # descriptive fallback, always populated
    severity: str = "major"          # "major" | "minor" | "advisory"
    limb: str = "36(1)"              # "36(1)" declaration | "36(2)" false declaration
    evidence: dict[str, Any] = field(default_factory=dict)
    measured: dict[str, Any] | None = None   # value, unit, uncertainty, threshold
```

Invariants, all enforced by tests:

```python
assert (f.verdict != Verdict.NOT_ASSESSED) or f.reason      # never a bare not_assessed
assert f.provision                                          # descriptive text always present
assert f.severity in {"major", "minor", "advisory"}
assert not (f.verdict == Verdict.FAIL and f.severity == "advisory")
```

The last invariant matters: an advisory observation (address looks thin, contrast is 2.4:1) must never be recorded as a violation. Advisories render in the report under "Observations", separately from "Violations".

### 2.3 Scan-level output

```python
@dataclass
class ScanResult:
    scan_id: str
    in_scope: bool                   # False when Rule 3 or Rule 26 excludes the package
    scope_reason: str | None
    findings: list[Finding]
    violation_count: int             # FAIL with severity major or minor
    advisory_count: int
    not_assessed_count: int
    violation_tier: str              # "none"|"improvement_notice"|"fine_second"|"fine_third"
    tier_basis: str                  # "1st instance recorded in this system for store 7"
    engine_version: str              # "3.0" - stored so old scans stay explainable
    catalog_hash: str                # SHA256 of rules_catalog - proves which citations were used
```

`engine_version` and `catalog_hash` are not decoration. If a citation is corrected six weeks after a scan, every stored scan must remain explainable in terms of the rules that were applied to it. Without the hash, a re-run produces different findings and nobody can account for the difference. This is the same reason `06_DATABASE.md` hash-chains the audit log.

### 2.4 Check sources - not every check reads a photograph

```python
class Source(str, Enum):
    PACKAGE  = "package"    # needs the pack image
    LISTING  = "listing"    # needs an e-commerce product page
    PLATFORM = "platform"   # assessed once per platform, not per product
    OPERATOR = "operator"   # answered by the inspector at scan time
```

Earlier drafts listed all eighteen checks as though one camera scan could satisfy them. It cannot: CHK15 and CHK16 assess a web listing and a platform. The mobile app therefore runs only the `PACKAGE` and `OPERATOR` checks, and the portal exposes a separate URL-scan entry point for the `LISTING` and `PLATFORM` checks. The engine filters by source:

```python
def checks_for(source_set: set[Source]) -> list[Check]:
    return [c for c in ORDERED_CHECKS if c.source in source_set]

# mobile camera scan
checks_for({Source.PACKAGE, Source.OPERATOR})       # -> 16 checks
# portal e-commerce scan
checks_for({Source.LISTING, Source.PLATFORM})       # -> 2 checks
```

A scan report must state which set ran, so "16 of 18 checks - package scan" appears in the header. Never present a package scan as an eighteen-check audit.

---

## 3. THE EXECUTION ORDER

### 3.1 Four phases

```text
PHASE 0  EXTRACT        OCR and field extraction. No verdicts.
                        Must precede phase 1: the Rule 26 gate needs net_quantity.
   |
PHASE 1  GATES          Is this package governed at all, and by which instrument?
                        Any gate that trips SHORT-CIRCUITS the remaining phases.
   |
PHASE 2  FIELD CHECKS   Presence and form of declarations. Image-only, cheap, reliable.
   |
PHASE 3  METROLOGY      Height, clear space, contrast. Precondition-heavy, uncertainty-bearing.
   |
PHASE 4  AGGREGATE      Tier computation. Reads phases 2-3, writes no findings of its own.
```

The ordering rationale is not arbitrary. Gates first, because running eighteen checks on an out-of-scope package and then discarding them wastes work and risks a partial result leaking into the report. Field checks before metrology, because they are cheap and certain while metrology is expensive and conditional - if the pack has no MRP at all, its character height is irrelevant. Aggregate last, because the tier is a function of everything above it.

### 3.2 The one ordering subtlety

Rule 26(a) exempts packages of 10 g or 10 ml or less. That is a threshold on the **net quantity of the commodity**, so the gate cannot run until net quantity has been extracted. But net quantity extraction is part of phase 0, and net quantity *validation* (CHK05) is in phase 2. Splitting extraction from validation is what makes the order work:

```text
phase 0  extract net_quantity_value + unit   (no verdict)
phase 1  CHK02 gate reads net_quantity_value (may short-circuit)
phase 2  CHK05 validates its form            (verdict)
```

If net quantity cannot be extracted, CHK02 cannot decide the exemption. It must then return `NOT_ASSESSED` and **must not** short-circuit - because refusing to assess the gate is not the same as clearing it. The scan proceeds with a banner: *"small-package exemption could not be assessed; findings below may not apply if this package is 10 g or less."*

### 3.3 The full order

| # | ID | Phase | Check | Source | Rule (see `02`) | Short-circuits? |
|---|---|---|---|---|---|---|
| - | - | 0 | Extract all fields from image | PACKAGE | - | no |
| 1 | **CHK03** | 1 | Chapter II applicability - >25 kg/25 L, industrial, institutional, packed in presence | OPERATOR | Rule 3, `02` §5 | **yes - halts all** |
| 2 | **CHK02** | 1 | Small package exemption - net quantity ≤ 10 g / 10 ml | PACKAGE + OPERATOR | Rule 26(a), `02` §14 | **yes - halts all** |
| 3 | **CHK14** | 1 | Medical device - route to Medical Devices Rules 2017 | OPERATOR + PACKAGE | Rule 2(h) proviso, `02` §14.1 | **yes - halts phase 3** |
| 4 | **CHK01** | 2 | All Rule 6(1)(a,b,c,d,e,f,g) + 6(2) declarations present | PACKAGE | Rule 6, `02` §6 | no |
| 5 | **CHK04** | 2 | MRP form - "inclusive of all taxes", rounding, no dual MRP | PACKAGE | Rule 6(1)(e), 2(m), 6(2A), `02` §11.3 | no |
| 6 | **CHK05** | 2 | Net quantity - no prohibited qualifiers, SI units only | PACKAGE | Rules 12-13, `02` §11.2 | no |
| 7 | **CHK11** | 2 | Sticker only reduces MRP and does not cover the original | PACKAGE | Rule 6(3)-6(4A), `02` §6 | no |
| 8 | **CHK12** | 2 | Country of origin declared, imported goods | PACKAGE + OPERATOR | Rule 6(1)(aa), `02` §6 | no |
| 9 | **CHK13** | 2 | Best-before / use-by, perishables | PACKAGE + OPERATOR | Rule 6(1)(da), `02` §6 | no |
| 10 | **CHK10** | 2 | Quantity is a Second Schedule prescribed size | PACKAGE | Rule 5, `02` §12.2 | no |
| 11 | **CHK17** | 2 | FSSAI licence number visible - **advisory only** | PACKAGE | FSS Act, `02` §16 | no |
| 12 | **CHK06** | 3 | Character height meets Table-I for the PDP area | PACKAGE + OPERATOR | Rule 7(2), `02` §7 | no |
| 13 | **CHK06b** | 3 | Net-quantity-specific minimum height | PACKAGE + OPERATOR | Rule 7, `02` §7.2, ledger L-04 | no |
| 14 | **CHK07** | 3 | Character width ≥ one-third of height, except `1 i I l` | PACKAGE + OPERATOR | Rule 7(3), `02` §7.1 | no |
| 15 | **CHK09** | 3 | Clear space around net quantity - 1x above/below, 2x left/right | PACKAGE + OPERATOR | Rule 8, `02` §8 | no |
| 16 | **CHK08** | 3 | MRP and net quantity in contrasting colour | PACKAGE | Rule 9, `02` §9 | no |
| 17 | **CHK15** | 2 | E-commerce listing shows all 6(1) except month/year | LISTING | Rule 6(10), `02` §6.1 | no |
| 18 | **CHK16** | 2 | Platform offers a searchable country-of-origin filter | PLATFORM | Rule 6(10A), in force 01.07.2026 | no |
| - | **CHK18** | 4 | Violation tier under Section 36 as amended 2026 | - | Sec 36, `02` §3.3 | no |

Nineteen rows for eighteen checks: CHK06b is a sub-check of CHK06 and reports under it in the UI. The IDs are stable and are referenced by `04_NiyamNetra_PRD.md`, `06_DATABASE.md` and `10_TESTING.md` - **do not renumber them.** Add new checks as CHK19 upward.

### 3.4 Short-circuit semantics

```python
def run(ctx: ScanContext) -> ScanResult:
    findings: list[Finding] = []
    fields = extract(ctx.image)                    # PHASE 0

    for check in gates():                          # PHASE 1
        f = check(ctx, fields)
        findings.append(f)
        if f.verdict is Verdict.PASS and check.halts_on_pass:
            # "pass" on a gate means "the exclusion applies"
            return ScanResult(
                in_scope=False, scope_reason=f.detail, findings=findings,
                violation_count=0, advisory_count=0,
                not_assessed_count=len(ALL_CHECKS) - len(findings),
                violation_tier="none", tier_basis="not in scope",
                engine_version=ENGINE_VERSION, catalog_hash=catalog_hash(),
            )

    route = medical_device_route(findings)          # CHK14 outcome
    for check in field_checks():                    # PHASE 2
        findings.append(check(ctx, fields))
    if route is not Route.MEDICAL_DEVICE:
        for check in metrology_checks():           # PHASE 3
            findings.append(check(ctx, fields))
    else:
        findings += [not_assessed(c, "medical device - Medical Devices Rules 2017 apply")
                     for c in metrology_checks()]

    return aggregate(ctx, findings)                # PHASE 4
```

Two subtleties worth spelling out, because both are easy to get backwards:

1. **On a gate, `PASS` means "excluded".** CHK03 returning `PASS` means "Rule 3 excludes this package", which halts the scan. This inversion is confusing enough that gate checks should use explicit names - `exclusion_applies=True` - rather than reusing `Verdict.PASS`. The reference implementation uses a separate `GateOutcome` enum for exactly this reason.
2. **A short-circuit still fills in `not_assessed_count`.** The result must account for all eighteen checks. Silently returning three findings out of eighteen makes the report look truncated and invites the question "what happened to the rest".

---

## 4. CHECK SPECIFICATIONS

Each specification below gives inputs, precondition, verdict logic and the exact `detail` string. Anything not specified here is left to implementation.

### CHK03 - Chapter II applicability (gate)

```text
inputs      operator.transaction_type in {retail_sale, wholesale, institutional, industrial, packed_in_presence, export, other}
            operator.net_quantity_declared (for the >25kg/25L test)
            operator.commodity_group (cement | fertiliser | agri_produce | other)
precondition  none - always runnable
logic
    if transaction_type == packed_in_presence -> OUT OF SCOPE
       "made up in the purchaser's presence, exempt from the pre-packaged
        commodity rules (matches _RETAIL_TYPES = {retail_sale} in
        routers/inspections.py and OUT_OF_SCOPE_TRANSACTIONS in rules_engine)"
    if transaction_type in {institutional, industrial} -> EXCLUDED
       "package for {type} consumers; Chapter II does not apply"
    if qty > 25 kg or 25 L:
        if commodity_group in {cement, fertiliser, agri_produce} and qty <= 50 kg -> IN SCOPE
        else -> EXCLUDED  "package exceeds 25 kg/25 L"
    else -> IN SCOPE
severity      n/a (gate)
```

### CHK02 - Small package exemption (gate)

```text
inputs        fields.net_quantity_value, fields.net_quantity_unit,
              operator.commodity_group
precondition  net_quantity extracted with confidence >= 0.60
              -> else NOT_ASSESSED, and DO NOT short-circuit (see s3.2)
logic
    q = normalise(value, unit)          # to grams or millilitres
    if operator.commodity_group == tobacco -> IN SCOPE
       "exemption does not extend to tobacco products"
    if q <= 10 -> EXCLUDED
       "net quantity {q}{unit} is within the 10 g / 10 ml exemption"
    else -> IN SCOPE
note          the 10-20 g proviso was withdrawn w.e.f 01.07.2012; do not apply it
```

### CHK14 - Medical device routing (gate, partial)

```text
inputs        operator.category, fields.raw_text
precondition  none
logic
    signals = count of {"sterile", "single use", "for single use only",
                        "Mfg. Lic. No.", "CDSCO", "Class A|B|C|D device",
                        "IVD", "not for medicinal use"} present in raw_text
    if operator.category == "medical_device" or signals >= 2:
        route = MEDICAL_DEVICE
        -> all PHASE 3 checks become NOT_ASSESSED
           reason "medical device - Medical Devices Rules 2017 apply"
        -> PHASE 2 checks still run: Rule 6 presence duties are not displaced
           in their entirety, only the Rule 7 font regime is
    if signals == 1 -> flag advisory "possible medical device; confirm category"
severity      advisory when inferred, none when operator-declared
```

That phase-2-still-runs decision is deliberate and should be revisited with a Legal Metrology officer: the 2025 proviso routes *declaration and font* requirements to the Medical Devices Rules, and how completely it displaces Rule 6 is a question of construction, not of code. Flagged in `02` ledger as a construction question, and the conservative behaviour - report Rule 6 findings as advisory rather than as violations for devices - is what the engine does.

### CHK01 - Rule 6 declarations present

```text
inputs        fields.{manufacturer_name, manufacturer_address, commodity_name,
                      net_quantity_value, mfg_month_year, mrp_value,
                      consumer_care_phone}
precondition  mean OCR confidence on the declaration block >= 0.60
logic         one sub-finding per missing field
    REQUIRED_ALWAYS = [manufacturer_name, manufacturer_address, commodity_name,
                       net_quantity_value, mfg_month_year, mrp_value]
    REQUIRED_6_2    = [consumer_care_name, consumer_care_address,
                       consumer_care_phone]     # email only "where available"
    for f in REQUIRED_ALWAYS + REQUIRED_6_2:
        missing -> FAIL, severity major, limb "36(1)"
detail        "No declaration of {field} found on the principal display panel."
trap          commodity_name must be the GENERIC name. The largest text on the
              pack is the brand. Reject a commodity_name that exactly matches a
              detected brand token, and emit
              FAIL "brand name present but no generic commodity name"
              - see 02 s6, row 6(1)(b). Getting this wrong is the single most
              common false PASS in label-scanning systems.
```

### CHK04 - MRP form and dual MRP

```text
inputs        fields.mrp_tokens (list of {value, text, bbox}), fields.has_sticker
precondition  at least one mrp token, else deferred to CHK01
logic
    for each token: require TAX_RE match within the same declaration block
        absent -> FAIL major "MRP stated without 'inclusive of all taxes'"
    rounding: value*100 % 100 not in {0, 50} -> FAIL minor
        "MRP {v} is not expressed in whole rupees or 50 paise"
    if len(distinct values) >= 2:
        if has_sticker and one value is struck through
            -> defer to CHK11, no dual-MRP finding    # 02 s6, 6(2A) row
        else -> FAIL major, limb "36(1)"
            "Two different retail sale prices declared on identical commodity"
```

The struck-through exclusion is what stops the most common false positive in this check. Detect strikethrough as a horizontal connected component whose bounding box overlaps the price token's vertical centre by more than 60%.

### CHK05 - Net quantity form

```text
inputs        fields.net_quantity_raw (the literal string), operator.commodity_group
precondition  net_quantity_raw non-empty
logic
    QUALIFIERS = {"minimum", "min.", "not less than", "average", "avg",
                  "about", "approx", "approximately", "~"}
    hit -> FAIL major "Net quantity qualified by '{word}'; the declaration
                       must be an unqualified figure"
    "when packed" present:
        commodity in THIRD_SCHEDULE -> PASS
        else -> FAIL major "'when packed' may be used only for Third Schedule
                            commodities"
    NON_SI = {"dozen", "dozens", "doz", "score", "gross", "lb", "lbs",
              "oz", "pound", "ounce", "pint", "gallon"}
    hit -> FAIL major "Net quantity declared in a non-SI unit '{unit}'"
    count declarations must use N or U -> else FAIL minor
citation      CATALOG["CHK05"].verified is False - render descriptive form only.
              See 02 s11.2 and ledger L-01: prior drafts cited this as both
              Rule 12(6) and Rule 13. Do not print a sub-rule number until the
              gazette text is checked.
```

### CHK11 - Stickers

```text
inputs        image region around each mrp token
precondition  region resolvable
logic
    sticker detected (edge discontinuity + texture/gradient break + often a
    different white point) over the MRP region:
        if revised value > struck value  -> FAIL major
           "Sticker increases the declared retail sale price"
        if sticker fully occludes the printed original -> FAIL major
           "Sticker obscures the original retail sale price declaration"
        if revised < original and original legible -> PASS
           "Price-reduction sticker with the original declaration still legible"
    no sticker -> PASS
```

### CHK12 - Country of origin

```text
inputs        fields.country_of_origin, fields.importer_address, operator.is_imported
precondition  is_imported determined. If operator left it blank AND no importer
              declaration is detected -> NOT_ASSESSED
              reason "import status not established"
logic
    if not imported -> NOT_ASSESSED "not an imported commodity"
    country_of_origin missing -> FAIL major
       "No country of origin declared on an imported commodity"
    importer_address missing -> FAIL major
       "No Indian importer name and address declared"   # 02 s10
```

Note the deliberate use of `NOT_ASSESSED` rather than `PASS` for a domestic pack. A conditional requirement that never triggered was not satisfied - it was inapplicable, and the report should say so. Counting it as a pass inflates the compliance score, which is exactly the kind of quiet dishonesty that a judge with domain knowledge will find.

### CHK13 - Best before / use by

```text
inputs        fields.best_before, operator.is_perishable, fields.raw_text
precondition  perishability determined:
                operator.is_perishable set, OR
                a shelf-life assertion detected ("Best before N months",
                "Use within", "Expiry") which itself implies perishability
              -> else NOT_ASSESSED "perishability not established"
logic
    perishable and best_before missing -> FAIL major
    label asserts a shelf life but gives no date reference -> FAIL major
       "Shelf life stated without a manufacture or best-before date"
    not perishable -> NOT_ASSESSED "commodity not perishable"
```

### CHK10 - Second Schedule standard size

```text
inputs        operator.commodity_key, fields.net_quantity normalised
precondition  STANDARD_SIZES contains commodity_key
              -> else NOT_ASSESSED
                 "Second Schedule data not loaded for '{commodity_key}'"
logic         see 02 s12.2 for the loader, which supports both an explicit
              list and an {"above": X, "step": Y} form
              not a prescribed quantity -> FAIL major, limb "36(1)"
              "{q}{unit} is not a prescribed quantity for {commodity};
               nearest permitted is {nearest}{unit}"
```

### CHK17 - FSSAI presence (advisory)

```text
inputs        fields.raw_text
logic         FSSAI_RE = r"(?:FSSAI|Lic(?:ence|\.)?\s*No\.?)\D{0,12}(\d{14})"
              present -> PASS  severity advisory
              absent and category is food -> verdict PASS, severity advisory
                 detail "No FSSAI licence number detected. NiyamNetra does not
                         assess Food Safety and Standards compliance."
constraint    NEVER FAIL. This check cannot produce a violation. It exists so
              the officer knows to look, not so the system can allege an FSS
              breach it has no authority to assess. See 02 s16.
              The 14-digit group is captured for the officer's reference and is
              NOT validated against any registry.
```

### CHK06 / CHK06b / CHK07 / CHK09 - the metrology block

All four share one precondition chain. Implement it once, in `metrology.py`, and let each check consume the result.

```text
SHARED PRECONDITION  (02 s7.4)
  1. operator.shape and both dimensions supplied      else NOT_ASSESSED
                                                      "package dimensions not supplied"
  2. four panel corners detected                      else NOT_ASSESSED
                                                      "panel edges not detected"
  3. homography rectification applied, residual tilt <= 15 deg
                                                      else NOT_ASSESSED
                                                      "package too oblique to measure"
  4. panel pixel height >= 400 px                     else NOT_ASSESSED
                                                      "image resolution insufficient
                                                       for a millimetre measurement"
  5. scale = dim_1_mm / panel_px_height
     if a reference card or coin is detected, derive a second scale and require
     agreement within 5%                              else NOT_ASSESSED
                                                      "scale sources disagree"

PDP AREA          per 02 s7.3 by shape; when the computed area lies within 10%
                  of a band boundary, widen to the MORE LENIENT band and append
                  "near band boundary" to detail

CHK06   measured = char_height_mm +/- u
        FAIL only when (measured + u) < table_minimum
        detail "Smallest declaration character measures 2.1 mm +/- 0.3 mm
                against a 2.5 mm minimum for a 113 cm2 principal display panel."
        blown/moulded lettering -> use the second Table-I column

CHK06b  net-quantity-specific minimum, ledger L-04 not transcribed
        -> NOT_ASSESSED "net quantity height table not loaded"

CHK07   for each char not in {1, i, I, l}:
            FAIL when (width + u) < height / 3
        detail "Character '{c}' is {w} mm wide against a {h/3} mm minimum
                (one-third of its {h} mm height)."

CHK09   clear space above/below >= h, left/right >= 2h   (02 s8)
        requires connected-component analysis of the surround; where the
        surround is a photograph or dense artwork
        -> NOT_ASSESSED "surrounding region not separable from printed matter"
        This will be the most frequent not_assessed in the system. That is the
        correct outcome, not a defect.
```

### CHK08 - Contrasting colour

```text
inputs        text mask and local background for the MRP and net quantity tokens
precondition  tokens localised
logic         ratio = contrast_ratio(mean_fg, mean_bg)        # 02 s9
              blown/moulded on glass or plastic -> NOT_ASSESSED
                 "characters formed on the container; Rule 9 exception applies"
              ratio >= 3.0 -> PASS
              ratio <  3.0 -> verdict PASS, severity ADVISORY
                 detail "Measured contrast {ratio}:1 between the {token} and its
                         background, below NiyamNetra's 3.0:1 advisory threshold.
                         Rule 9 requires conspicuous contrast without specifying
                         a numeric ratio."
constraint    NEVER FAIL on contrast. The statute sets no number (02 ledger
              L-10), so the engine reports a measurement and an advisory. A
              violation asserted against an invented threshold would not
              survive challenge.
```

### CHK15 - E-commerce listing (source: LISTING)

```text
inputs        listing.fields scraped from the product page
precondition  page fetched successfully; see 09_SECURITY.md on SSRF controls
              for fetching an operator-supplied URL
logic         REQUIRED = all Rule 6(1) declarations EXCEPT mfg month/year
              missing -> FAIL major, limb "36(1)"
                 "Listing does not display {field}"
note          month/year of manufacture is expressly excluded by 6(10);
              do not flag its absence on a listing
```

### CHK16 - Platform origin filter (source: PLATFORM)

```text
inputs        platform.has_searchable_origin_filter (operator-confirmed
              or detected on the category page)
precondition  scan date >= 2026-07-01, the commencement date of Rule 6(10A)
              -> else NOT_ASSESSED "Rule 6(10A) not in force on the scan date"
logic         absent -> FAIL major
              "Platform does not provide a searchable country-of-origin filter"
scope         assessed once per platform per day, cached; not per product.
              Emitting this finding on every product scan would inflate the
              violation count by the size of the catalogue.
```

The commencement-date precondition is worth keeping even though the date has passed: it makes the engine correct for back-dated scans, and it documents the date in executable form rather than in a comment.

### CHK18 - Violation tier (phase 4)

```text
inputs        findings from phases 2-3, store_id, scan date
logic
    limb_36_1 = any FAIL with limb "36(1)" and severity in {major, minor}
    limb_36_2 = any FAIL with limb "36(2)"          # requires weighing; MVP: never
    if not (limb_36_1 or limb_36_2):
        tier = "none"
    else:
        prior = count of PRIOR inspections for this store with tier != "none"
        if limb_36_2:                      # false declaration - fines from 1st
            tier = ["fine_second", "fine_third"][min(prior, 1)] if prior \
                   else "fine_first"
        else:                              # 36(1) - improvement notice first
            tier = ["improvement_notice", "fine_second", "fine_third"][min(prior, 2)]
    tier_basis = f"{ordinal(prior+1)} instance recorded in this system for store {store_id}"
constraint    tier_basis MUST say "recorded in this system". A statutory
              instance count spans all enforcement records nationally; this
              system sees only its own. Implying otherwise overstates the
              finding. See 02 s3.3.
mvp note      limb "36(2)" is unreachable in the MVP because no check can
              establish a FALSE net quantity from a photograph (02 s13).
              The branch is implemented anyway so that adding a weighing
              integration later needs no engine change.
```

---

## 5. THE CONFIDENCE GATE

One threshold governs whether OCR output may be reasoned about at all.

```python
OCR_CONFIDENCE_FLOOR = 0.60      # mean over the declaration block

if block.mean_confidence < OCR_CONFIDENCE_FLOOR:
    return [not_assessed(c, f"OCR confidence {block.mean_confidence:.2f} below "
                            f"the {OCR_CONFIDENCE_FLOOR} floor; retake the photograph")
            for c in field_checks()]
```

The app must surface this immediately, at capture time rather than after upload, so the inspector retakes the shot while still standing at the shelf. A `not_assessed` discovered back at the office is a wasted visit. This is the single highest-value piece of feedback in the whole product, and it belongs in the camera preview as a live quality indicator - see `08_UI_DESIGN.md`.

Per-field confidence matters too: a block mean of 0.85 can hide an MRP token at 0.31. Each finding therefore carries the confidence of the specific token it relied on, in `Finding.evidence["confidence"]`, and any individual field below the floor is `not_assessed` on its own even when the block passes.

---

## 6. DETERMINISM AND TESTABILITY

The engine must be a pure function of its inputs.

```python
def run(ctx: ScanContext, fields: ExtractedFields) -> ScanResult: ...
```

No clock reads, no database reads, no network calls inside the engine. The two facts it needs from outside - the scan date for CHK16 and the prior-violation count for CHK18 - are passed in on `ctx`. That is what makes the engine unit-testable with fixtures and what makes a stored scan reproducible six months later:

```python
def test_scan_is_reproducible():
    ctx, fields = load_fixture("bad_packet_03")
    assert run(ctx, fields) == run(ctx, fields)          # no hidden state

def test_out_of_scope_short_circuits_but_accounts_for_all_checks():
    ctx, fields = load_fixture("industrial_50kg_bag")
    r = run(ctx, fields)
    assert r.in_scope is False
    assert r.violation_count == 0
    assert len(r.findings) + r.not_assessed_count == TOTAL_CHECKS

def test_no_finding_asserts_an_unverified_pinpoint_citation():
    for f in run(*load_fixture("bad_packet_01")).findings:
        ref = CATALOG[f.check_id]
        if not ref.verified:
            assert f.citation == "" and f.provision

def test_contrast_and_fssai_can_never_fail():
    for fx in all_fixtures():
        for f in run(*load_fixture(fx)).findings:
            if f.check_id in {"CHK08", "CHK17"}:
                assert f.verdict is not Verdict.FAIL
```

Those four tests encode the four promises this specification makes. If they pass, the engine is honest; `10_TESTING.md` §3 carries them as required cases.

---

**End of Rule Engine Specification.** Use this to build `rules_engine.py`. For statutory text, PDP geometry, the schedules and the citation verification ledger, see 02_NiyamNetra_Rules.md.
