# Phase 4: NiyamNetra Deterministic Legal Compliance Engine

## 1. Compliance Pipeline Architecture

The compliance engine implements a strict separation of concerns following the core project invariant:
**OCR READS → LLM STRUCTURES → RULES DECIDE → AGGREGATION ASSESSES**

```
Camera / Upload
  │
  ▼
Immutable Original Evidence (Original bytes preserved; tamper-evident SHA-256)
  │
  ▼
Derived Analysis Artifact (Normalized orientation, perspective rectification)
  │
  ▼
Quality Gate (Sharpness, resolution, glare detection, usability check)
  │
  ▼
Geometry Engine (PDP area calculation, surface model, scale calibration)
  │
  ▼
Cloud OCR (Text transcription & word bounding boxes)
  │
  ▼
Cloud LLM (Evidence-grounded structured extraction into StructuredDeclarationResult)
  │
  ▼
Phase 4B: Deterministic Declaration Evaluation (Rules 6(1), 6(1)(e), Rules 12/13 units, etc.)
  │
  ▼
Phase 4C: Deterministic Visual & Geometry Evaluation (Rules 7, 8, 9; Table-I font height, clear space, contrast)
  │
  ▼
Phase 4D: Multi-Panel Evidence Aggregation & Consistency (Dual pricing Rule 6(2A), net qty, date, party conflicts)
  │
  ▼
Final Inspection Assessment & Audit Dossiers (Violation dossier under Section 36, Review dossier, Actionable capture requests)
```

**Non-Negotiable Invariants:**
- Zero LLM legal decisions. The LLM structures evidence; deterministic code evaluates compliance.
- Zero extra AI/OCR calls during Phase 4 evaluation.
- Immutability of original evidence. Evaluation operates strictly on derived/read-only data structures.

---

## 2. Rule-Pack Architecture

The engine loads versioned legal rule packs from declarative JSON catalogues (`lmpc_2026_09_v1.json` as current baseline; `lmpc_2026_v1.json` as immutable historical baseline).

Each rule carries full statutory provenance:
- `rule_id`: Unique identifier (e.g. `RULE_LMPC_01_MANDATORY_DECLARATIONS`, `RULE_LMPC_23_ORIGIN_MARKING_COSMETICS`)
- `code`: Standard check code (`CHK01` through `CHK23`)
- `source_document`: Authoritative gazette statute (e.g. *Legal Metrology (Packaged Commodities) Rules, 2011*)
- `source_rule`: Specific statutory citation (e.g. *Rule 6(1)*, *Rule 6(4A)(d)*)
- `amendment_reference`: Gazette notification (e.g. *G.S.R. 629(E) dated 23.06.2017*, *G.S.R. 826(E) dated 21.09.2026*)
- `effective_from` & `effective_to`: Date boundaries ensuring legal version awareness
- `severity`: Statutory severity (`critical`, `major`, `minor`, `advisory`)
- `statutory_limb`: Legal Metrology Act, 2009 limb (`36(1)` for declarations, `36(2)` for quantity, `null` when no sanction is legislated)
- `applicability`: Conditions under which the rule applies (physical package vs e-commerce listing, retail vs wholesale, commodity exemptions)
- `evaluation_method`: Deterministic evaluation method specification

---

## 3. Effective-Date Behavior

The engine guarantees date-aware evaluation:
- Inspections conducted on or after **21 September 2026** apply the Fourth Amendment Rules, 2026 under G.S.R. 826(E), activating Rule 6(4A)(d) for soaps, shampoos, toothpastes, cosmetics, and toiletries, while former Rule 6(8) is omitted and inactive.
- Inspections conducted on or after **1 January 2018** apply the substituted Rule 7(2) under G.S.R. 629(E), requiring numeral height as per **Table-I** for all packages (Table-II was omitted).
- Historical inspections (prior to 21 September 2026) evaluate against former Rule 6(8) where applicable.
- Historical inspections (prior to 1 January 2018) evaluate against Table-II where applicable.
- Future rules (e.g. Platform Origin Filter under G.S.R. 128(E) effective 01.07.2026) **never** apply before their effective date.

---

## 4. Verdict Safety Matrix: PASS / FAIL / NOT_ASSESSED

The engine enforces a three-state finding model (`pass`, `fail`, `not_assessed`):

| Finding State | Statutory Meaning | Conditions Required |
|---|---|---|
| `pass` | Compliant with statutory requirement | Declaration present, formatted legally, grounded in verified provenance, within calibrated physical thresholds. |
| `fail` | Confirmed statutory non-compliance | Declaration confirmed missing despite full package coverage, or explicitly non-conforming format/measurements. |
| `not_assessed` | Inability to evaluate from available evidence | Incomplete panel coverage, glare/blur over region, missing calibration standard, ambiguous text. |

### Anti-False-Compliance Safeguards
`pass` can **never** occur when:
- Evidence provenance is missing or unverified.
- Physical calibration is invalid, fake, or missing.
- Principal Display Panel (PDP) surface is unestablished.
- Measurement falls within the calibration uncertainty band.
- Statutory conflict between panels remains unresolved.
- Package panel coverage is incomplete.

### Anti-False-Violation Safeguards
`fail` can **never** occur when:
- A declaration was not observed, but only partial panels were photographed.
- Measurement lacks an optical calibration standard.
- Clear space or contrast is obscured by image glare or blur.
- The rule is out of scope (e.g. wholesale or institutional transaction).

---

## 5. Multi-Panel Consistency & Conflict Adjudication

Contradictions between panels are detected deterministically without silent resolution:
- **MRP Conflict (Rule 6(2A))**: If different MRP values are printed across panels (e.g. ₹260 on front vs ₹280 on back), neither is selected. The engine flags a `StatutoryConflict` with `severity="critical"` and forces `REVIEW_REQUIRED`.
- **Net Quantity Conflict**: Flags conflicting quantities or units across panels.
- **Date Consistency**: Compares dates within the same statutory category (MFG vs MFG, EXP vs EXP). Distinct date types coexisting on the package (MFG + EXP) are recognized as valid.
- **Party Normalization**: Corporate abbreviations (`Pvt. Ltd.`, `Private Limited`, `Mfg`, `Indl Area`) are normalized deterministically without fuzzy AI matching to distinguish genuine entity conflicts from syntactic formatting differences.

---

## 6. Assessment Completeness & Overall Verdict

Overall verdict precedence:
```
1. OUT_OF_SCOPE: Institutional or wholesale transactions exempt under Chapter II.
2. VIOLATION: At least one applicable rule confirmed FAIL. Outranks review conditions.
3. REVIEW_REQUIRED: No confirmed FAIL, but incomplete coverage (PARTIAL), unresolved conflicts, or NOT_ASSESSED mandatory rules exist.
4. COMPLIANT: All applicable rules evaluated and confirmed PASS, complete package coverage, zero conflicts, zero NOT_ASSESSED.
```

**Completeness Rule:**
An inspection with only front panel coverage is marked `PARTIAL`. `PARTIAL` coverage can **never** produce `COMPLIANT`.

---

## 7. Actionable Inspector Guidance & Dossiers

- **Violation Dossier**: Assembled when verdict is `VIOLATION`. Summarizes statutory limb violations under Section 36(1) or 36(2) of the Legal Metrology Act, 2009, with deterministic inspector explanations and direct evidence references.
- **Review Dossier**: Assembled when verdict is `REVIEW_REQUIRED`. Lists unresolved issues, missing requirements, and specific officer actions.
- **Actionable Capture Requests**: Prioritized guidance specifying targeted panels (e.g. `CAP_PANEL_BACK`), optical scale reference (`CAP_SCALE_REFERENCE` with ID-1 card or 5-INR coin), or non-glare orthogonal re-capture (`CAP_CLEAR_SPACE_CLEAN`).

---

## 8. Performance & Hardware Constraints

Phase 4 evaluation runs entirely in local Python without external network calls:
- Mean end-to-end evaluation latency: **< 1.0 ms** (context-based) / **~5 ms** (with full OpenCV image glyph measurement).
- Peak working set memory: **~72 MB**, safely below Render's 512 MB RAM ceiling (providing **> 440 MB headroom**).

---

## 9. Legal Scope & Enforcement Boundary

NiyamNetra is an **inspection and compliance decision-support system**. It does **not** claim:
- Automatic prosecution or judicial warrant issuance.
- Automated compounding or fine collection.
- Self-executing seizure of goods.

Enforcement workflows and statutory limbs (Section 36(1) for declarations, Section 36(2) for net quantity violations) provide structured legal pathways for authorized Metrology Officers to inspect, review, and act under the Legal Metrology Act, 2009 and the Jan Vishwas (Amendment of Provisions) Act, 2023.

---

## 10. Fourth Amendment Synchronization (G.S.R. 826(E), 21 September 2026)

### 10.1 Statutory Instrument Summary
* **Statutory Instrument**: Legal Metrology (Packaged Commodities) Fourth Amendment Rules, 2026
* **Gazette Reference**: G.S.R. 826(E), published in the Official Gazette on 21 September 2026
* **Issuing Authority**: Department of Consumer Affairs, Ministry of Consumer Affairs, Food and Public Distribution, Government of India
* **Effective Date**: 2026-09-21 (in force immediately upon publication in the Official Gazette)

### 10.2 Legislative Changes Incorporated
1. **Rule 6(4A)(d) Insertion**: Inserts clause `(d)` after clause `(c)` in sub-rule (4A) of Rule 6, establishing origin marking requirements for soaps, shampoos, toothpastes, cosmetics, and toiletries:
   - Green dot for products of vegetarian origin
   - Red or brown dot for products of non-vegetarian origin
   - Mandatory placement at the top of the Principal Display Panel (PDP)
2. **Rule 6(8) Omission**: Officially omits former sub-rule (8) of Rule 6.

### 10.3 Versioned Rule Pack Architecture (`2026.09.v1`)
* **Current Production Pack**: `2026.09.v1` (`Backend/rules/rule_packs/lmpc_2026_09_v1.json`) with `rules_as_at = "2026-09-21"`.
* **Historical Immutability**: Historical pack `2026.07.v1` (`Backend/rules/rule_packs/lmpc_2026_v1.json`) remains completely immutable and reproducible for inspections conducted prior to 21 September 2026.
* **CHK23 Effective Timeline**:
  - `RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL`: `effective_from = "2011-03-07"`, `effective_to = "2026-09-20"`
  - `RULE_LMPC_23_ORIGIN_MARKING_COSMETICS`: `effective_from = "2026-09-21"`, `effective_to = null`
  - Disjoint timeline: Exactly 0 days gap, 0 overlapping active days.

### 10.4 Category Applicability & Strict Boundary
* **Target Categories**: Soap, shampoo, toothpaste, other cosmetics, toiletries.
* **Non-Applicable Commodities**: Fast-Moving Consumer Goods (FMCG) generally, food commodities (rice, atta, biscuits, tea), beverages, and non-cosmetic household items are outside the scope of Rule 6(4A)(d). The engine returns `pass` ("rule does not apply").
* **Uncertain Category**: If category cannot be verified from evidence, the engine returns `not_assessed`, never assuming applicability.

### 10.5 Critical Legal Interpretation & Safety Safeguard (Section 3)
* **Parent Sub-Rule Structure**: Rule 6(4A) begins with permissive language: *"Nothing in these rules shall preclude the manufacturer, or as the case may be, the packer or importer, from declaring the following on the package, in addition to the mandatory declarations..."*.
* **Statutory Ambiguity**: Relocating origin symbols from former Rule 6(8) (affirmative mandate) into Rule 6(4A) (permissive non-preclusion) creates statutory ambiguity regarding whether an omitted dot can be penalized as a criminal offence under Section 36(1).
* **Anti-False-Violation Safeguard**: The engine **never converts legal ambiguity into a false statutory violation**:
  - Omitted origin symbols on post-amendment inspections evaluate to `not_assessed` with documented `MANUAL_REVIEW` guidance for the Metrology Officer.
  - No Section 36 limbs (`statutory_limb = null`), fines, or criminal sanctions are manufactured.

### 10.6 Automation vs. Manual Review Decision Boundary
| Condition | Evaluator Finding | Statutory Reason |
|---|---|---|
| Verified green dot at top of PDP on vegetarian cosmetic | `pass` | Compliant with Rule 6(4A)(d) origin requirement. |
| Verified red/brown dot at top of PDP on non-vegetarian cosmetic | `pass` | Compliant with Rule 6(4A)(d) origin requirement. |
| Colour mismatch (e.g. red dot on vegetarian product) | `fail` | Explicit statutory non-compliance. |
| Placement outside PDP or not at top of PDP | `fail` | Placement violates Rule 6(4A)(d) top-of-PDP mandate. |
| Missing dot on post-2026-09-21 cosmetic | `not_assessed` | Flagged for `MANUAL_REVIEW` due to permissive sub-rule (4A) wording. |
| Missing dot on pre-2026-09-21 cosmetic with full coverage | `fail` | Historical Rule 6(8) affirmative violation under Section 36(1). |
| Unknown product origin (veg vs non-veg) | `not_assessed` | Cannot evaluate without verified product origin evidence. |
| Unestablished Principal Display Panel | `not_assessed` | Cannot verify top-of-PDP placement without affirmative PDP evidence. |
| Ambiguous / uncalibrated colour signal | `not_assessed` | Avoids manufactured arbitrary RGB thresholds. |

### 10.7 Rule Pack Validation Report Summary
```
======================================================================
RULE PACK VALIDATION REPORT — FOURTH AMENDMENT BASELINE
======================================================================
Active Rule Pack Version:     2026.09.v1
Previous Rule Pack Version:   2026.07.v1
Fourth Amendment Date:        2026-09-21
Latest Effective Amendment:   2026-09-21
Total Versioned Rules:        26
Enabled Rules:                26
New / Changed Rules:          1 (RULE_LMPC_23_ORIGIN_MARKING_COSMETICS)
Removed / Expired Rules:      1 (RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL)
Manual Interpretation Rules:  2 (RULE_LMPC_23_ORIGIN_MARKING_COSMETICS, RULE_LMPC_17_FSSAI_ADVISORY_ALIGNMENT)
Visual Evidence Rules:        7 (CHK06, CHK06b, CHK07, CHK08, CHK09, CHK22, CHK23)
Effective Date Range:         2011-03-07 to 2026-09-21
======================================================================
```
