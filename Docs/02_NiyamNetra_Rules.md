# NiyamNetra - Legal Reference - Act, Rules & Schedules
### Smart India Hackathon 2026 - Problem Statement SIH26034 - Deep Legal Reference
**Version:** 3.0 | **Date:** 29 Aug 2026 | **Revised:** 30 Aug 2026
**Path:** C:\Skills\Projects\NiyamNetra\Docs\02_NiyamNetra_Rules.md
**Scope:** Legal Metrology Act 2009, LM (Packaged Commodities) Rules 2011 rule-by-rule, all seven schedules, amendment history, measurability analysis, verification ledger

---

## 1. HOW TO READ THIS DOCUMENT

This file answers **"what does the law actually say, and can we measure it?"**
Its sibling `03_NiyamNetra_Rules_Priority_Ordered.md` answers **"in what order does the engine run the checks?"**

The two files were previously near-duplicates. They are now split by purpose:

| Question | File |
|---|---|
| What does Rule 7 require, and how is PDP area computed? | This file, §7 |
| What are the Second Schedule pack sizes? | This file, §12 |
| Which check runs first and what short-circuits it? | `03`, §3 |
| What JSON does check 6 emit on failure? | `03`, §4 |

### 1.1 Citation discipline - read this before writing any code

A compliance tool that cites the wrong rule is worse than no tool. A shopkeeper handed a notice citing "Rule 12(6)" when the provision is actually Rule 13 has a complete defence, and the inspector loses credibility.

Three non-negotiable rules follow from that:

1. **Citations are data, never string literals.** Every citation lives in `backend/app/rules/rules_catalog.py` (or `rules_catalog.json`), keyed by check ID. Code refers to `CATALOG["CHK06"].citation`. A wrong citation becomes a one-line data fix, not a hunt through f-strings.
2. **Every catalog entry carries a `verified` flag** and a `source` URL. See §15.
3. **Unverified citations render as descriptive text, not as a section number.** If `verified=False`, the report prints *"net quantity declaration requirements, Legal Metrology (Packaged Commodities) Rules 2011"* rather than *"Rule 12(6)"*. The finding still stands; only the pinpoint citation is withheld.

Catalog entry shape:

```python
# backend/app/rules/rules_catalog.py
from dataclasses import dataclass

@dataclass(frozen=True)
class RuleRef:
    check_id: str        # "CHK06"
    citation: str        # "Rule 7(2), LM (PC) Rules 2011"
    descriptive: str     # fallback prose when verified is False
    instrument: str      # "LMPCR2011" | "LMA2009" | "MDR2017" | "FSSR2020"
    verified: bool       # confirmed against the gazette PDF?
    source: str          # URL of the version checked
    measurable: str      # "image" | "image+dimensions" | "operator_input" | "physical"

CATALOG = {
    "CHK06": RuleRef(
        check_id="CHK06",
        citation="Rule 7(2) read with Table-I",
        descriptive="minimum height of numerals and letters by principal display panel area",
        instrument="LMPCR2011",
        verified=False,
        source="https://consumeraffairs.nic.in/  # transcribe from GSR 629(E) PDF",
        measurable="image+dimensions",
    ),
    # ... one entry per check, 18 total
}
```

### 1.2 The fail-open principle

**Missing reference data or missing measurement must produce `not_assessed`, never `fail`.**

A false violation is the most damaging output this system can produce. If the Second Schedule table for a commodity has not been transcribed, if the inspector did not supply package dimensions, or if OCR confidence is below threshold, the check returns `not_assessed` with a reason string. The report shows it as "Not assessed - reason" in grey, not as a red violation.

Every check therefore has **three** outcomes, not two: `pass`, `fail`, `not_assessed`. This propagates into the database (`scans.result` is not a boolean), the API, and the UI badge set. See `03` §4.

---

## 2. THE LEGAL CHAIN

```text
Constitution of India, Seventh Schedule, Union List Entry 50
  (weights and measures - establishment of standards)
        |
        v
Legal Metrology Act, 2009 (Act 1 of 2010)
  in force 01.04.2011, repealed and replaced:
    - Standards of Weights and Measures Act, 1976
    - Standards of Weights and Measures (Enforcement) Act, 1985
        |
        +-- Section 52(2)(j) --> power to make rules for packaged commodities
        |         |
        |         v
        |   Legal Metrology (Packaged Commodities) Rules, 2011
        |   GSR 202(E) dated 07.03.2011, in force 01.04.2011
        |         |
        |         +-- Schedules I to VII (reference data)
        |         +-- GSR 629(E) 23.06.2017, w.e.f 01.01.2018   [major]
        |         +-- Amendment Rules 2025, w.e.f 23.10.2025     [medical devices]
        |         +-- GSR 128(E) 13.02.2026, in force 01.07.2026 [e-commerce filter]
        |
        +-- Chapter V (Sections 25-57) Offences and penalties
                  |
                  +-- Jan Vishwas (Amendment of Provisions) Act, 2023 (Act 18 of 2023)
                  +-- Jan Vishwas (Amendment of Provisions) Act, 2026 (Act 8 of 2026),
                      w.e.f 01.05.2026  --> improvement-notice-first regime
```

**Why this matters to the build:** the Act creates the offence and the penalty; the Rules create the labelling duty. The engine detects breaches of the *Rules*; the penalty tier it reports comes from the *Act*. Two different instruments, two different catalog `instrument` values, and the report must attribute each correctly.

---

## 3. LEGAL METROLOGY ACT, 2009 - STRUCTURE

| Chapter | Sections | Subject | Relevance to NiyamNetra |
|---|---|---|---|
| I | 1-2 | Short title, definitions | Definitions of *pre-packaged commodity*, *retail package*, *retail sale price* drive scope |
| II | 3-8 | Standard units, SI base | Why Rule 13 permits only SI units |
| III | 9-12 | Standard weights and measures | Out of scope (instrument verification) |
| IV | 13-23 | Legal metrology organisation | Officer hierarchy, powers of inspection, seizure |
| V | 24-47 | Offences and penalties | Section 36 is the penalty the report cites |
| VI | 48-57 | Miscellaneous, compounding, rule-making | Section 52 is the parent of the 2011 Rules |

### 3.1 Definitions that decide scope (Section 2)

- **`pre-packaged commodity` - Section 2(l).** A commodity placed in a package of *pre-determined quantity* without the purchaser being present. This is the gate: if the quantity was determined in front of the buyer (loose grain weighed at the counter, fabric cut to order), the 2011 Rules do not bite. The engine must not flag a counter-weighed item; the app therefore needs a "packed in my presence" flag on the scan form.
- **`retail package` - Rule 2(k) of the 2011 Rules.** A package intended for retail sale to the ultimate consumer. Distinguished from *wholesale package* (Rule 2(r), governed by Rule 24) and *institutional/industrial* packages (excluded by Rule 3).
- **`retail sale price` - Rule 2(m).** The maximum price at which the commodity may be sold, **inclusive of all taxes**, printed as `Maximum Retail Price Rs. ___ inclusive of all taxes` or `MRP Rs. ___ incl. of all taxes`. The rounding convention attached to this definition is reproduced at §11.3.
- **`principal display panel` - Rule 2(j).** The total surface area of the package where the manufacturer gives the prescribed declarations for the consumer's information at the point of purchase. The measurement method is in Rule 7(4), §7.2 below.

### 3.2 Officer hierarchy (Chapter IV) and the RBAC mapping

```text
Controller of Legal Metrology (State)        --> not modelled
  Additional / Joint / Deputy Controller     --> not modelled
    Legal Metrology Officer / Inspector      --> role = "inspector"
Director of Legal Metrology (Centre)         --> not modelled
```

NiyamNetra deliberately models **two** roles - `admin` and `inspector` - not the full statutory hierarchy. The statutory ladder is a chain of *appellate* and *appointing* authority; it is not an access-control tree, and modelling it would add four tables that no screen consumes. `admin` in this system means "district-level supervisor who provisions inspector accounts and reads aggregate reports". This is a scoping decision, recorded here so nobody later mistakes it for an oversight. See `09_SECURITY.md` §2.

**Section 15** gives the officer power to inspect, and (post-2026) to issue an **improvement notice** before any penalty. That is why the system's terminal state for a first-time declaration breach is `improvement_notice`, not `fine`.

### 3.3 Section 36 - the penalty the report cites

As substituted by the Jan Vishwas (Amendment of Provisions) Act, 2026, in force 01.05.2026:

| Provision | Breach | 1st instance | 2nd instance | 3rd and subsequent |
|---|---|---|---|---|
| **Sec 36(1)** | Selling/distributing a pre-packaged commodity that does not bear the prescribed declarations | Improvement notice | Fine up to Rs. 5,00,000 | Fine Rs. 25,00,000 to Rs. 50,00,000 |
| **Sec 36(2)** | Declaration made is **false** - net quantity error | Fine Rs. 10,000 to Rs. 1,00,000 | Fine up to Rs. 5,00,000 | Fine up to Rs. 50,00,000, or imprisonment up to 1 year, or both |

Three consequences for the build:

1. **The status field is not a boolean.** `scans.violation_tier` takes `none | improvement_notice | fine_second | fine_third`. A `pass/fail` boolean cannot express the 2026 regime.
2. **Tier depends on prior history, not on this scan.** Determining "2nd instance" requires counting prior *established* violations for that store/manufacturer. The MVP counts prior violations recorded in `inspections` for the same `store_id`; it must label this "instances recorded in this system", because a genuine statutory count spans all enforcement records nationally. Do not let the report imply otherwise.
3. **36(1) and 36(2) are different offences.** A missing MRP is 36(1) - a declaration is absent. A net quantity of 480 g on a pack marked 500 g is 36(2) - the declaration is present but false. NiyamNetra reads labels, so it detects 36(1) from the image; 36(2) needs a weighing step (§13).

### 3.4 Jan Vishwas 2023 vs 2026 - do not conflate them

- **Act 18 of 2023** amended Sections 25, 27, 28, 29, 31, 34, 35 and 48, converting several imprisonment-bearing offences to fine-only escalating tiers (e.g. Section 29: Rs. 50,000 / 1,00,000 / 2,00,000). **Section 36 was not among them**, so through 2023-2026 Section 36 remained **unamended** in its pre-2023 form.
- **Act 8 of 2026** substituted the Chapter V block including Section 36, introduced the improvement-notice-first structure, substituted Section 48 (compounding), and replaced the term *licence* with *registration certificate* throughout.

> Earlier drafts of these documents said Section 36 "remained **unverified** until 2026". That was a transcription error for **unamended**. The word matters: the section was fully in force, simply untouched by the 2023 Act.

---

## 4. LM (PACKAGED COMMODITIES) RULES, 2011 - RULE MAP

| Rule | Subject | In engine? | Measurable from an image? |
|---|---|---|---|
| 1 | Short title, commencement | - | - |
| 2 | Definitions | indirectly | - |
| 2A | Applicability | gate | operator input |
| **3** | **Chapter II applicability, exclusions** | **CHK03** | operator input |
| 4 | Prohibition of pre-packing without declarations | context | - |
| **5** | **Prescribed standard quantities (Sch. II)** | **CHK10** | image + reference table |
| **6** | **Declarations on every package** | **CHK01, 04, 11, 12, 13, 15, 16** | image |
| **7** | **Principal display panel, font size** | **CHK06, CHK07** | image + package dimensions |
| **8** | **Precise location, clear space** | **CHK09** | image + package dimensions |
| **9** | **Manner of declaration** | **CHK08** | image |
| 10 | Name and address of manufacturer/packer/importer | part of CHK01 | image |
| 11 | Net quantity - units and exclusion of wrapper | part of CHK05 | image |
| 12 | Net quantity - qualifying words prohibited | CHK05 | image |
| 13 | Net quantity - SI units, number declarations | CHK05 | image |
| 14-17 | Special commodities (textiles, sheet goods, containers) | out of MVP | image |
| 18 | Dealer obligations - no sale above MRP, no MRP alteration | context | operator input |
| 19-23 | Inspection mechanics, sampling, corrected average | out of MVP | **physical weighing** |
| 24 | Wholesale packages | out of MVP | image |
| 25 | Export and import packages | context | operator input |
| **26** | **Exemptions - small packages** | **CHK02** | image + operator input |
| 27-30 | Registration of manufacturers/packers/importers | out of MVP | - |
| 31 | Advertisements to state retail sale price | out of MVP | - |
| 32 | Penalty where no specific penalty provided | context | - |
| 32A | Compounding of offences | superseded, see §3.4 | - |
| 33 | Power to relax | context | - |
| 34 | Repeal and savings | - | - |

The `measurable` column is the honest constraint that earlier drafts omitted. Sections 7, 8 and 13 below explain each non-`image` case.

---

## 5. RULE 3 - WHAT THE RULES DO **NOT** COVER

Chapter II (which contains Rules 4 to 25, the entire declaration regime) does not apply to:

1. **Packages above 25 kg or 25 litres**, other than cement, fertiliser and agricultural farm produce sold in bags **up to 50 kg**.
2. **Packaged commodities meant for industrial consumers or institutional consumers.**
   - *Industrial consumer*: buys the commodity directly from the manufacturer/packer for use in its own industry.
   - *Institutional consumer*: buys for service, not resale - transport undertakings, hotels, hospitals, airlines and similar.
3. **Fast food items packed by a restaurant or hotel**, and similar.

**Engine consequence - CHK03 runs before every Rule 6 check.** If the package is out of scope, the correct output is a single `not_assessed` for the whole scan with reason `"Rule 3 - outside Chapter II"`, not eighteen individual passes. Reporting "compliant" for a package the Rules never touched is a false assurance.

**Scope cannot be read from the image alone.** "Industrial consumer" is a fact about the transaction, not about the label - although a `NOT FOR RETAIL SALE` marking is strong evidence. The app therefore asks the inspector one question at scan time: *retail / institutional / industrial / packed in my presence*. Default is `retail`.

---

## 6. RULE 6 - THE DECLARATIONS (THE CORE)

Rule 6(1) requires each of the following on every retail package. The third column is what the OCR pipeline must actually extract, and is the contract between `ocr_service.py` and `rules_engine.py`.

| Provision | Declaration | Extracted field | Notes and traps |
|---|---|---|---|
| 6(1)(a) | Name and complete address of manufacturer / packer / importer | `manufacturer_name`, `manufacturer_address` | Rule 10 supplies detail. Where manufacturer and packer differ, both may be needed. For imports, an **Indian** importer address is required in addition to the country of origin. |
| 6(1)(aa) | **Country of origin** (imported commodities) | `country_of_origin` | Inserted by GSR 629(E) 2017. Only triggers when `is_imported` is true - which comes from operator input or from the presence of an importer declaration, never from a guess. |
| 6(1)(b) | Common or generic name of the commodity | `commodity_name` | The *generic* name, not the brand. "Aashirvaad" is not a commodity name; "Whole Wheat Atta" is. A brand-only label is a 6(1)(b) breach and OCR must not treat the largest text as the commodity name. |
| 6(1)(c) | Net quantity | `net_quantity_value`, `net_quantity_unit` | Mechanics in Rules 11-13, §11. |
| 6(1)(d) | Month and year of manufacture / pre-packing / import | `mfg_month_year` | Month and year suffice; a full date is not required. Accept `MFD 08/2026`, `Mfg: Aug 2026`, `PKD 08.2026`. |
| 6(1)(da) | **Best before / use by** date | `best_before` | Inserted 2017. Required where the commodity is perishable or where the label itself asserts a shelf life. Non-perishables (a steel bucket) are not in breach for omitting it, so this check is conditional and defaults to `not_assessed` when perishability is unknown. |
| 6(1)(e) | Retail sale price as `MRP Rs. ___ inclusive of all taxes` | `mrp_value`, `mrp_text_form` | §11.3. |
| 6(1)(f) | Dimensions, where the commodity is sold by length/width/height | `dimensions` | Conditional on commodity class. |
| 6(1)(g) | Such other matter as prescribed | - | Hook for Rules 7-9 and the Schedules. |
| 6(2) | Consumer care details - name, address, telephone, and email where available | `consumer_care` | Telephone is required; email only *where available*, so a missing email is not a breach on its own. |
| 6(2A) | **No dual MRP** - two different prices on identical commodities | `mrp_count` | Inserted 2017. Detect by OCR finding two distinct MRP tokens on one package. Beware the false positive where a struck-through old MRP sits beside a revised one - that is the Rule 6(3) sticker case, not a 6(2A) breach. |
| 6(3), 6(4), 6(4A) | Stickers - permitted only to **reduce** MRP, and must not obscure the original declaration | `has_sticker`, `sticker_covers_original` | A sticker raising the price is a violation; so is a compliant-value sticker pasted over the printed MRP. Detect with edge/texture discontinuity over the MRP region. |
| 6(10) | **E-commerce listings** must display every 6(1) declaration **except** month/year of manufacture | `listing_fields` | Inserted 2017. Applies to the platform's product page, not to the carton. |
| 6(10A) | Platform must provide a **searchable country-of-origin filter** | `has_origin_filter` | GSR 128(E) 13.02.2026, in force **01.07.2026**. A platform-level check, assessed once per platform, not per product. |

### 6.1 Two checks in Rule 6 are not package checks

CHK15 (6(10)) and CHK16 (6(10A)) assess a **web listing** and a **platform**, not a physical pack. They therefore cannot run on a camera scan. They belong to a separate entry point - a URL-based scan - and the mobile app must not offer them. `03` §3 marks both as `source=listing`, and the app's scan flow filters the check set by source. Earlier drafts listed all eighteen checks as if one photo could satisfy them; it cannot.

---

## 7. RULE 7 - PRINCIPAL DISPLAY PANEL AND FONT SIZE

This is the most technically demanding rule in the set and the one earlier drafts over-promised on. Read §7.4 before implementing.

### 7.1 What Rule 7 requires

- The declarations under Rule 6 must appear on the **principal display panel** (PDP).
- The **height of any numeral or letter** in those declarations must not be less than the value in **Table-I**, which is banded by PDP **area**.
- Rule 7(3): the **width** of a letter or numeral must not be less than **one-third of its height** - except for the characters `1`, `i`, `I` and `l`, which are naturally narrow.
- Where the package's total surface area does not exceed **5 cm³** [*sic* - the instrument uses a volume unit for an area threshold; see ledger L-07], the declarations may be given on a card or tape affixed to the package.

### 7.2 Table-I as substituted w.e.f 01.01.2018

GSR 629(E) replaced the earlier two-table scheme (one keyed to net quantity, one to PDP area) with a **single** table keyed to PDP area. Use only this one.

| PDP area **A** (cm²) | Min height - normal case | Min height - blown / formed / moulded / embossed on the container |
|---|---|---|
| A ≤ 50 | 1.0 mm | 1.5 mm |
| 50 < A ≤ 100 | 1.5 mm | 3.0 mm |
| 100 < A ≤ 500 | 2.5 mm | 4.0 mm |
| 500 < A ≤ 2500 | 4.0 mm | 6.0 mm |
| A > 2500 | 6.0 mm | 6.0 mm |

The right-hand column applies where the characters are part of the container itself rather than printed on it - the raised lettering on a moulded plastic bottle. Such lettering is harder to read, so the minimum is larger.

> **Separate, larger minimum for net quantity.** The Rules additionally prescribe a minimum height for the *net quantity* declaration specifically, keyed to the **quantity** rather than to PDP area. Treat this as a distinct sub-check (`CHK06b`) rather than folding it into CHK06, and see ledger entry **L-04** - the exact banding must be transcribed from the gazette before CHK06b is switched on. Until then CHK06b emits `not_assessed`.

### 7.3 Computing PDP area - Rule 7(4)

| Package shape | PDP area |
|---|---|
| Rectangular / cuboid | height × width of the panel bearing the declarations |
| Cylindrical or near-cylindrical | **40%** of (height × circumference), i.e. `0.4 × h × π × d` |
| Any other shape | **40%** of the total surface area of the container |

Worked examples:

```text
A. Rectangular carton, declaration panel 12.0 cm x 8.0 cm
   A = 12.0 x 8.0                    = 96.0 cm2
   Band: 50 < A <= 100               -> min height 1.5 mm (normal)

B. Cylindrical bottle, h = 15.0 cm, d = 6.0 cm
   circumference = pi x 6.0          = 18.85 cm
   h x circumference                 = 282.7 cm2
   A = 0.40 x 282.7                  = 113.1 cm2
   Band: 100 < A <= 500              -> min height 2.5 mm (normal)
   Moulded lettering on the bottle   -> min height 4.0 mm

C. Stand-up pouch, one face 10.0 cm x 6.0 cm, two faces
   total surface  = 2 x 10.0 x 6.0   = 120.0 cm2
   A = 0.40 x 120.0                  = 48.0 cm2
   Band: A <= 50                     -> min height 1.0 mm
   NOTE: example C sits 2 cm2 below a band boundary. See ledger L-08 on
   whether "total surface area" includes gussets and seals. When the
   computed area is within 10% of a band boundary, the engine must widen
   to the more lenient band and add reason "near band boundary".
```

That last instruction is a deliberate design choice: measurement error near a boundary must resolve **in favour of the person being inspected**, matching the way a court would treat an unproven margin.

### 7.4 The measurement problem - and how NiyamNetra actually solves it

**Table-I is expressed in millimetres. An image is measured in pixels. There is no way to convert without a scale reference.** A photograph taken from 10 cm and one taken from 40 cm give character heights differing by 4x. Any system that claims to check font height from a bare photograph is guessing, and a guess that produces a Rs. 5,00,000 penalty tier is indefensible.

Note also that **Rule 7 cannot be applied at all without the package's physical dimensions**, because Table-I is banded by PDP *area* in cm². So the inspector must supply dimensions regardless. That requirement is the solution, not an extra burden:

```text
Inspector enters, at scan time:
    shape          = rectangular | cylindrical | other
    dimension_1    = panel height (cm)      [required]
    dimension_2    = panel width or diameter (cm)  [required]

Pipeline then:
1. Detect the package outline in the image (contour / YOLOv8 box) -> pixel height Hpx
2. scale = dimension_1 (mm) / Hpx            -> mm per pixel
3. For each OCR'd character box of pixel height hpx:
       physical_height_mm = hpx x scale
4. Correct for perspective FIRST: rectify the panel to a fronto-parallel
   view with a 4-point homography (cv2.getPerspectiveTransform) using the
   detected panel corners, then measure. Measuring on an unrectified
   oblique image understates height on the far edge by the cosine of the
   tilt.
5. Reject the measurement and emit not_assessed when any of:
       - panel corners not detected with 4 clean corners
       - residual tilt after rectification > 15 degrees
       - Hpx < 400 px (insufficient resolution: at 400 px for a 120 mm
         panel, one pixel is 0.3 mm, so a 1.0 mm minimum is only ~3 px
         and the measurement uncertainty exceeds the tolerance)
6. Report the measured height WITH its uncertainty:
       "2.1 mm +/- 0.3 mm against a 2.5 mm minimum"
   and only assert a violation when the upper bound of the measurement
   is still below the minimum.
```

Step 6 is the part that makes the finding survive challenge. A tool that says "2.1 mm, violation" invites the reply "your camera is not a measuring instrument". A tool that says "2.1 ± 0.3 mm, so at most 2.4 mm against a 2.5 mm minimum" has stated its own error bars and cleared them.

**Optional second scale source.** If the inspector places an ISO/IEC 7810 ID-1 card (85.60 × 53.98 mm, the size of every debit card and Aadhaar card) or a Rs. 5 coin (23 mm diameter) in frame, the pipeline derives `scale` from that instead and cross-checks it against the entered dimensions. Agreement within 5% raises the finding's confidence band; disagreement emits `not_assessed` with reason `"scale sources disagree"`. This costs the inspector nothing - the card is in their wallet.

---

## 8. RULE 8 - PRECISE LOCATION AND CLEAR SPACE

Declarations must appear on the principal display panel, and a **clear space** must surround the net quantity declaration:

| Boundary | Minimum clear space |
|---|---|
| Above and below the numerals | not less than the **height** of the numerals |
| Left and right of the numerals | not less than **twice the height** of the numerals |

```text
Net quantity printed at height h = 4.0 mm
  -> clear above  >= 4.0 mm
  -> clear below  >= 4.0 mm
  -> clear left   >= 8.0 mm
  -> clear right  >= 8.0 mm
```

The purpose is to stop the net quantity being crowded by other print so the consumer cannot pick it out.

**Same measurement dependency as Rule 7.** Clear space is in millimetres, so CHK09 inherits every precondition in §7.4 - rectification, scale, resolution floor, uncertainty band. It adds one of its own: "clear" means free of *other printed matter*, which requires connected-component analysis of the surrounding region rather than a simple whitespace test. A background colour block is not printed matter; a slogan is. Where the surrounding region is a busy photograph (common on food packs), reliably classifying "printed matter" is not achievable at MVP quality, and CHK09 must emit `not_assessed` with reason `"surrounding region not separable"`. Ledger **L-09**.

---

## 9. RULE 9 - MANNER OF DECLARATION

- Declarations must be **legible and prominent**, and conspicuous as to size and colour.
- The **net quantity and the retail sale price** must be in a colour that **contrasts conspicuously** with the background. Exception: characters blown, formed, moulded or embossed on a glass or plastic container.
- Declarations must be in **Hindi in Devanagari script or in English**. Additional languages are permitted, never a substitute.
- Where the package is inside an **outer wrapper or container**, the declarations must be repeated on the outer wrapper unless the outer wrapper is transparent enough to read the inner declarations through it, or the outer wrapper already carries all required declarations.

**Contrast is measurable, and should be measured properly.** Do not eyeball it and do not use a raw RGB distance. Compute the WCAG-style relative-luminance contrast ratio between the mean text colour and the mean local background colour:

```python
def _lin(c: float) -> float:           # c in 0..1
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def relative_luminance(rgb) -> float:
    r, g, b = (_lin(v / 255) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast_ratio(fg, bg) -> float:
    l1, l2 = sorted((relative_luminance(fg), relative_luminance(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)
```

The Rules say "contrasts conspicuously" and set no number, so the engine must not invent a statutory threshold. It reports the measured ratio and applies an **internal advisory** threshold of **3.0:1**, labelled as such: *"measured contrast 1.9:1 - below NiyamNetra's 3.0:1 advisory threshold; Rule 9 requires conspicuous contrast without specifying a ratio"*. Honest framing, and it gives the inspector a defensible number to discuss. Ledger **L-10**.

Language detection: run OCR with Devanagari and Latin script sets and confirm that at least one of the two carries the full declaration set. A pack whose declarations are only in Tamil is in breach even though Tamil is an official language, because Rule 9 names Hindi and English specifically.

---

## 10. RULE 10 - NAME AND ADDRESS

The name and **complete** address of the manufacturer must be given. Points that produce real findings:

- Where the manufacturer is not the packer, the packer's name and address are also required.
- For **imported** commodities, the name and complete address of the **importer in India** is required, in addition to the country of origin under 6(1)(aa).
- A **marketer** declaration ("Marketed by ...") does not substitute for the manufacturer or packer declaration.
- "Complete address" means enough to locate and serve the entity. A city and PIN with no street is a weak address; the engine flags `address_incomplete` as an advisory, not a hard violation, because completeness is a judgement the officer makes.
- Packages with a total area under the small-package threshold get relief on address detail - see Rule 26 and §14.

---

## 11. RULES 11-13 - NET QUANTITY MECHANICS

### 11.1 Rule 11 - what is measured

Net quantity is the quantity of the **commodity**, excluding the weight of the wrapper, packaging and any non-commodity content. Declaring gross weight as net is a breach. This is not detectable from a label; it emerges only on weighing (§13).

### 11.2 Rules 12 and 13 - how it is expressed

- **Qualifying words are prohibited.** The net quantity must be stated as an unqualified figure. Words such as *minimum*, *not less than*, *average*, *about*, *approximately*, *nett* qualifiers and similar are not permitted.
  - The one permitted qualifier is **"when packed"**, and only for the commodities listed in the **Third Schedule** - soaps, detergent cakes, lotions, creams and camphor - whose weight changes with moisture loss after packing.
- **SI units only.** Weight in g/kg, volume in ml/l, length in cm/m. Non-SI trade counts - *dozen*, *score*, *gross* - are not permitted. Where the commodity is sold by number, the declaration uses `N` or `U` (number/units), e.g. `10 N`.
- Combination declarations ("10 sachets x 5 g each, net 50 g") must give the total.

> **Citation status.** The prohibited-qualifier provision has been cited in earlier drafts as both **Rule 12(6)** and **Rule 13**, inconsistently, within the same document set. That conflict is not resolvable from the material available offline, and guessing would breach §1.1. Until an authoritative text is checked, `CATALOG["CHK05"]` carries `verified=False` and the report renders the descriptive form: *"net quantity must be declared without qualifying words such as 'minimum' or 'about', Legal Metrology (Packaged Commodities) Rules 2011"*. Ledger **L-01**. Resolving this is a five-minute task for anyone with the gazette PDF and it should be done before the first live use.

### 11.3 Rule 2(m) and MRP form

The declaration must carry the price **inclusive of all taxes**, in one of the accepted forms:

```text
Maximum Retail Price Rs. 45.00 inclusive of all taxes
MRP Rs. 45.00 incl. of all taxes
Max. Retail Price Rs. 45.00 (inclusive of all taxes)
```

A bare `Rs. 45.00` or `MRP 45` without the tax-inclusive wording is a form breach under 6(1)(e) even where the price itself is correct. Rounding convention attached to the retail-sale-price definition: fractions of less than 50 paise are rounded **down** to the preceding rupee; fractions of 50 paise and above are expressed as 50 paise. Ledger **L-02** - confirm the exact wording before the report quotes it, because the rounding sentence is frequently mis-stated in secondary sources.

Regex for extraction (deliberately permissive, then validated):

```python
MRP_RE = re.compile(
    r"(?:M\.?R\.?P\.?|Max(?:imum)?\.?\s*Retail\s*Price)"   # label
    r"\s*:?\s*"
    r"(?:Rs\.?|INR|\u20b9)\s*"                              # currency
    r"(\d{1,7}(?:[.,]\d{1,2})?)",                           # amount
    re.IGNORECASE)
TAX_RE = re.compile(r"incl(?:usive|\.)?\s*(?:of\s*)?all\s*tax", re.IGNORECASE)
```

Extract with `MRP_RE`, then require `TAX_RE` to match somewhere in the same declaration block. Two distinct `MRP_RE` amounts on one package trigger the 6(2A) dual-MRP check - after excluding the struck-through-plus-sticker pattern.

---

## 12. SCHEDULES I TO VII

| Schedule | Contents | Used by | Data status |
|---|---|---|---|
| **I** | Maximum permissible error (tolerable negative error) on net quantity | physical weighing, not OCR | to transcribe - **L-03** |
| **II** | Prescribed standard quantities for specified commodities | CHK10 | to transcribe - **L-05** |
| **III** | Commodities that may use the "when packed" qualifier | CHK05 | complete, §12.3 |
| **IV** | Commodities to be declared in units other than weight/volume | CHK05 conditional | partial - **L-06** |
| **V** | Sampling plan - sample size and correction factor by lot size | physical inspection | §12.5 |
| **VI** | Method of testing, corrected-average methodology | physical inspection | §12.6 |
| **VII** | Forms A and B - inspection record sheets | report templates | §12.7 |

### 12.1 First Schedule - maximum permissible error

The tolerable negative error on the declared net quantity, banded by nominal quantity. The Indian table follows the OIML R87 pattern:

| Nominal quantity Qn (g or ml) | Tolerable negative error |
|---|---|
| 5 to 50 | 9% of Qn |
| 50 to 100 | 4.5 g or ml |
| 100 to 200 | 4.5% of Qn |
| 200 to 300 | 9 g or ml |
| 300 to 500 | 3% of Qn |
| 500 to 1000 | 15 g or ml |
| 1000 to 10000 | 1.5% of Qn |

Note the alternating pattern of percentage and absolute bands - it makes the tolerance curve continuous. Ledger **L-03**: verify against the gazette before any figure is used in a notice, and treat the above as the expected shape rather than as confirmed values.

**This schedule is not reachable from a photograph.** It compares declared quantity against *actual weighed* quantity. See §13.

### 12.2 Second Schedule - standard pack sizes

Rule 5 requires certain commodities to be packed only in the quantities the Second Schedule prescribes, so that consumers can compare prices across brands. Roughly nineteen commodity groups are covered, including baby food, biscuits, bread, butter and ghee, cereals and pulses, coffee, tea, edible oils, milk powder, salt, aerated soft drinks, drinking water, cement, paint, and detergent.

**CHK10 must be table-driven and must fail open.** The full table has not been transcribed (ledger **L-05**). Until it is:

```python
# backend/app/rules/second_schedule.py
STANDARD_SIZES: dict[str, list[int]] = {
    # "commodity_key": [permitted quantities in base SI unit]
    # Transcribe from the Second Schedule of GSR 202(E) as amended.
    # An absent key means NOT ASSESSED - never a violation.
}

def check_standard_size(commodity_key: str, qty_base_unit: int):
    sizes = STANDARD_SIZES.get(commodity_key)
    if sizes is None:
        return ("not_assessed",
                f"Second Schedule data not loaded for '{commodity_key}'")
    if qty_base_unit in sizes:
        return ("pass", None)
    return ("fail",
            f"{qty_base_unit} is not a prescribed quantity; nearest permitted "
            f"are {min(sizes, key=lambda s: abs(s - qty_base_unit))}")
```

Two traps worth stating: the Schedule applies only to the listed commodities, so a non-listed commodity in an odd size is perfectly lawful; and several groups carry a rule of the form "above X, any multiple of Y", which a flat list cannot express - so the loader must support both an explicit list and a `{"above": X, "step": Y}` form.

### 12.3 Third Schedule - the "when packed" commodities

Soaps, detergent cakes, lotions, creams and camphor. These lose moisture after packing, so their net weight legitimately drifts, and the declaration may read `100 g when packed`. For any commodity **not** on this list, the phrase "when packed" is itself a prohibited qualifier under §11.2.

### 12.4 Fourth Schedule - alternate units of declaration

Around twenty-six entries specifying commodities declared other than by the default unit - aerosols by net weight rather than volume, LPG by weight, garments and hosiery by number, certain fruits and vegetables by number. Consequence for CHK05: the "correct unit" is commodity-dependent, so unit validation needs this lookup and must return `not_assessed` for commodities absent from the transcribed table. Ledger **L-06**.

### 12.5 Fifth Schedule - sampling plan

For inspecting a lot by drawing a sample, as substituted in 2017:

| Lot size | Sample size **n** | Correction factor **C** | Max permitted deficient units |
|---|---|---|---|
| 100 to 500 | 50 | 0.379 | 3 |
| 501 to 3200 | 80 | 0.295 | 5 |
| above 3200 | 125 | 0.234 | 7 |

### 12.6 Sixth Schedule - corrected average

The lot's average is corrected upward for sampling uncertainty before being compared with the declared quantity:

```text
Xc = X_bar + (sigma x C)

  X_bar = arithmetic mean of the net quantities in the sample
  sigma = sample standard deviation
  C     = correction factor from the Fifth Schedule for the lot size
  Xc    = corrected average

Lot is accepted on average when   Xc >= declared net quantity
and separately when the count of units deficient by more than the
First Schedule error does not exceed the Fifth Schedule maximum.
```

Both tests must pass. A lot can hold up on average and still fail on the number of individually short units.

### 12.7 Seventh Schedule - Forms A and B

Statutory record sheets for an inspection. NiyamNetra's PDF report should mirror the Form A field order and labels so that an officer can transcribe from the report into the statutory form without re-ordering anything. The report is **not** a substitute for the statutory form, and must say so in its footer.

---

## 13. WHAT NIYAMNETRA CAN AND CANNOT DETERMINE

The single most important table in this document. State it in the pitch, before a judge finds it.

| Legal question | Basis | Can a photo answer it? |
|---|---|---|
| Is a required declaration **absent**? | Rule 6 | **Yes** - this is the system's core competence |
| Is the MRP in the prescribed **form**? | Rule 6(1)(e), 2(m) | **Yes** |
| Are prohibited qualifying **words** used? | Rules 12-13 | **Yes** |
| Are **two** MRPs shown? | Rule 6(2A) | **Yes** |
| Is a **sticker** covering the original MRP? | Rule 6(3)-6(4A) | Mostly - texture and edge discontinuity |
| Is the **country of origin** declared? | Rule 6(1)(aa) | Yes, once `is_imported` is known |
| Is the font **height** sufficient? | Rule 7(2) | **Only with package dimensions + rectification + resolution floor.** §7.4 |
| Is **clear space** sufficient? | Rule 8 | **Weakly** - often `not_assessed`. §8 |
| Is the colour **contrasting**? | Rule 9 | Measurable ratio, but the statute sets no threshold. §9 |
| Is the quantity a **standard pack size**? | Rule 5, Sch. II | Yes, once Sch. II is transcribed |
| Is the declared net quantity **true**? | Rule 11, Sch. I, VI | **No. Requires a verified weighing instrument.** |
| Is the lot **acceptable** on corrected average? | Rules 19-23, Sch. V-VI | **No. Requires sampling and weighing.** |
| Is the package within **Chapter II** at all? | Rule 3 | No - needs operator input on the transaction |
| Which **penalty tier** applies? | Sec 36, as amended 2026 | Only for instances recorded in this system. §3.3 |

The honest one-line summary, and the line to use in the pitch: **NiyamNetra is a label-compliance scanner, not a metrology instrument.** It automates the declaration audit that currently consumes most of an inspector's time, and it hands off the weighing questions - clearly labelled - to the inspector. Claiming to verify net quantity from a photograph would be the fastest way to lose credibility with a Legal Metrology officer on the judging panel.

---

## 14. RULE 26 - EXEMPTIONS

Rule 26 exempts certain packages from the Chapter II declaration requirements:

- **26(a)** Packages containing a commodity with a net weight or measure of **10 g or 10 ml or less**. The earlier proviso extending relief to the 10-20 g band was **withdrawn with effect from 01.07.2012**. The exemption does **not** extend to tobacco and tobacco products.
- Agricultural farm produce in packages above 50 kg.
- **26(c)** Certain drug formulations, which are governed by the Drugs (Prices Control) Order - the reference was updated to the **2013** Order by GSR 629(E).

**CHK02 runs before every Rule 6 check** for the same reason as CHK03: a 5 g sachet with no MRP is not a violation, and flagging it destroys inspector trust in the tool faster than any other error. The threshold applies to the **net quantity of the commodity**, not the package's physical size, so the check needs `net_quantity` to have been extracted first - which creates the one ordering subtlety in the engine: extract net quantity, then test exemption, then test everything else. See `03` §3.

### 14.1 Medical devices - Amendment Rules 2025, w.e.f 23.10.2025

A proviso inserted into **Rule 2(h)** provides that packages containing **medical devices** follow the declaration and font requirements of the **Medical Devices Rules, 2017** rather than these Rules.

**Engine consequence:** medical devices are not "exempt" - they are governed by a different instrument. CHK14 detects the class and routes the scan out of the LM check set entirely, returning `not_assessed` for all Rule 7 checks with reason `"medical device - Medical Devices Rules 2017 apply"`. It must not silently pass them. Classification comes from the operator's category selection plus keyword evidence on the label (`sterile`, `single use`, `Mfd. Lic. No.`, a CDSCO import licence number, a device class marking).

This has a UI consequence that `08_UI_DESIGN.md` missed: **"Medical Device" must exist in the category dropdown**, otherwise the routing can never fire.

---

## 15. LEGAL VERIFICATION LEDGER

Every load-bearing figure in this document set, with its verification status. **No figure marked `UNVERIFIED` may be printed as a pinpoint citation in a report or a notice** - see §1.1.

Web access was unavailable when this revision was prepared, so no figure below could be checked against a primary source in this pass. The figures are internally consistent and match the project's earlier drafts; they are **not** independently confirmed. Verify against **indiacode.nic.in** (Act and consolidated Rules) and **egazette.gov.in** (the amendment notifications) before the system is used in any enforcement context.

| ID | Figure or provision | Where used | Status | Verify at |
|---|---|---|---|---|
| L-01 | Sub-rule number for the prohibited-qualifier provision - Rule 12(6) vs Rule 13 | CHK05 citation | **UNVERIFIED - conflicting in prior drafts** | Consolidated Rules 2011, Rules 11-13 |
| L-02 | Exact wording of the MRP rounding convention, Rule 2(m) | §11.3, report text | **UNVERIFIED** | Rules 2011, Rule 2(m) |
| L-03 | First Schedule maximum permissible error bands | §12.1 | **UNVERIFIED - OIML R87 pattern assumed** | Rules 2011, First Schedule |
| L-04 | Net-quantity-specific minimum height table | CHK06b | **UNVERIFIED - not transcribed** | GSR 629(E), Rule 7 |
| L-05 | Second Schedule standard pack sizes, all groups | CHK10 | **NOT TRANSCRIBED - check fails open** | Rules 2011, Second Schedule |
| L-06 | Fourth Schedule alternate units, full list | CHK05 | **PARTIAL** | Rules 2011, Fourth Schedule |
| L-07 | The "5 cm³" card/tape threshold in Rule 7 - volume unit for an area test | §7.1 | **UNVERIFIED - suspected typo in source** | Rules 2011, Rule 7 |
| L-08 | Whether "total surface area" includes gussets, seals and closures | §7.3 example C | **UNVERIFIED - ambiguous** | Rules 2011, Rule 7(4) |
| L-09 | Rule 8 clear-space multipliers - 1x above/below, 2x left/right | §8 | **UNVERIFIED** | Rules 2011, Rule 8 |
| L-10 | Whether any numeric contrast threshold exists in Rule 9 | §9 | **UNVERIFIED - assumed none** | Rules 2011, Rule 9 |
| L-11 | Table-I bands and heights as substituted w.e.f 01.01.2018 | CHK06 | **UNVERIFIED - consistent across drafts** | GSR 629(E) 23.06.2017 |
| L-12 | Section 36 tiers and amounts under Act 8 of 2026 | CHK18, report | **UNVERIFIED** | Jan Vishwas Act 2026, egazette |
| L-13 | GSR 128(E) 13.02.2026 and the 01.07.2026 commencement of 6(10A) | CHK16 | **UNVERIFIED** | egazette |
| L-14 | Fifth Schedule sample sizes and correction factors | §12.5 | **UNVERIFIED** | GSR 629(E), Fifth Schedule |
| L-15 | Withdrawal of the 10-20 g proviso w.e.f 01.07.2012 | CHK02 | **UNVERIFIED** | Amendment notification 2012 |

### 15.1 Making the ledger executable

The ledger is not a comment. Wire it to the build so it cannot rot:

```python
# backend/tests/test_citation_integrity.py
from app.rules.rules_catalog import CATALOG

def test_every_check_has_a_catalog_entry():
    assert {f"CHK{i:02d}" for i in range(1, 19)} <= set(CATALOG)

def test_unverified_citations_are_never_rendered_as_pinpoints():
    """An unverified entry must supply prose the report can use instead."""
    for ref in CATALOG.values():
        if not ref.verified:
            assert ref.descriptive, f"{ref.check_id} unverified with no fallback"
            assert ref.source,      f"{ref.check_id} unverified with no source URL"

def test_report_renderer_respects_the_flag():
    from app.reports.render import citation_for
    unverified = next(r for r in CATALOG.values() if not r.verified)
    assert unverified.citation not in citation_for(unverified.check_id)
```

The third test is the one that matters: it proves at CI time that no unverified pinpoint citation can reach a document a shopkeeper receives.

---

## 16. SCOPE BOUNDARIES - OTHER INSTRUMENTS

NiyamNetra assesses the Legal Metrology (Packaged Commodities) Rules 2011 **only**. Four adjacent regimes govern the same label and are explicitly out of scope. Every report must carry the disclaimer in §16.1.

| Regime | Governs | Overlap with LM |
|---|---|---|
| **Food Safety and Standards Act 2006** + Labelling and Display Regulations **2020** | FSSAI licence number, ingredient list, allergens, nutrition panel, veg/non-veg mark | Food articles are relieved of part of the Rule 6 manufacturer declaration where FSS requirements cover it. NiyamNetra does **not** assess FSS compliance. |
| **Medical Devices Rules 2017** | Declarations and font for medical devices | Displaces Rule 7 entirely for devices - §14.1 |
| **Drugs and Cosmetics Act 1940** + DPCO 2013 | Drug labelling and price control | Rule 26(c) relief |
| **BIS Act 2016** | ISI mark, mandatory certification | Independent; the ISI mark is not an LM declaration |

A `FSSAI` licence check is included as CHK17 only as an **advisory presence check** - it reports whether a licence number is visible, and never asserts FSS compliance or validates the number's checksum against any registry.

### 16.1 Mandatory report disclaimer

Print this verbatim in the footer of every generated PDF:

> **Scope of this report.** This report assesses declarations required by the Legal Metrology (Packaged Commodities) Rules, 2011 only. It does not assess compliance with the Food Safety and Standards Act, 2006 and its labelling regulations, the Medical Devices Rules, 2017, the Drugs and Cosmetics Act, 1940, or the BIS Act, 2016. Findings on character height, clear space and colour contrast are photogrammetric estimates with stated uncertainty and are not measurements by a verified instrument. The declared net quantity has **not** been verified by weighing. Citations marked as pending verification have not been confirmed against the official Gazette text. This report is an inspection aid and is not a statutory notice under the Legal Metrology Act, 2009.

That paragraph is not a weakness in the submission. It is the difference between a demo and a tool an enforcement officer could actually carry.

---

## 17. AMENDMENT CHANGE LOG

| Date in force | Instrument | What changed |
|---|---|---|
| 01.04.2011 | Act 1 of 2010 + GSR 202(E) 07.03.2011 | Legal Metrology Act 2009 and the 2011 Rules commence; SWM Acts 1976 and 1985 repealed |
| 01.07.2012 | Amendment | Proviso extending small-package relief to the 10-20 g band withdrawn |
| 01.01.2018 | **GSR 629(E) 23.06.2017** | Rule 3 substituted; Rule 6 gains (1)(aa) country of origin, (1)(da) best before, (2A) no dual MRP, (4A), (10) e-commerce, (10A); Rule 7 two-table scheme replaced by a single PDP-area Table-I; Rules 19-20 corrected average; Fifth and Sixth Schedules substituted; Rule 26(c) updated to DPCO 2013 |
| 23.10.2025 | Amendment Rules 2025 | Proviso to Rule 2(h) - medical devices routed to Medical Devices Rules 2017 |
| 01.05.2026 | **Act 8 of 2026** (Jan Vishwas) | Chapter V substituted; Section 36 becomes improvement-notice-first with escalating fines; Section 48 compounding substituted; "licence" becomes "registration certificate" |
| 01.07.2026 | **GSR 128(E) 13.02.2026** | Rule 6(10A) commences - e-commerce platforms must provide a searchable country-of-origin filter |

Two dates are close enough to the present to matter for the demo: the 2026 penalty regime is **already in force**, and the e-commerce filter obligation commenced **01.07.2026**, two months before this document's revision date. Both are live law for a 2026 submission, which is precisely why the project is timely - and worth saying out loud to the judges.

---

**End of Legal Reference.** Use this for the legal *why* behind each check, and for the honest limits of what a photograph can prove. For the engine's execution order and the JSON each check emits, see 03_NiyamNetra_Rules_Priority_Ordered.md.
