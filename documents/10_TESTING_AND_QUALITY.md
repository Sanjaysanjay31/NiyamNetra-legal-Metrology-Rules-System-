# Testing Strategy, Quality Assurance & Verification

**Document Code:** `DOC-10`  
**Quality Status:** Zero Regressions, 100% Passing Baseline  
**Verified Backend Suite:** **428 passed, 0 failed**  
**Verified Frontend Suite:** **69 passed, 0 failed** (6 suites)  
**Total Automated Regression:** **497 tests passing**  

---

## 1. Testing Philosophy & Verification Principles

The primary objective of the NiyamNetra quality assurance framework is to **prevent false statutory compliance and false statutory violations**.

A missed violation in the field is a flaw; a fabricated clean pass over an unreadable package is an institutional failure that discredits the inspecting officer. The entire test suite is architected around invariant verification rather than ungrounded percentage claims:

| Invariant | Statutory Requirement | Test Verification |
|---|---|---|
| **I-01** | Every scan evaluates against the complete active rule pack | Stated denominator matches registered rules (26 checks). |
| **I-02** | `not_assessed` findings must carry a non-empty explanation | Guarded by database CHECK constraints and Pydantic validators. |
| **I-03** | `compliant` scan outcome strictly requires zero `not_assessed` | Assessed count must equal total applicable count. |
| **I-04** | Numeral height verification requires verified optical reference | Uncalibrated images produce `not_assessed` (never `pass`). |
| **I-05** | Original photographic evidence is immutable | SHA-256 digest re-verified on every assess; deletion denied by triggers. |
| **I-06** | Automated `engine_verdict` is never overwritten by human edits | Stored in immutable column; human overrides logged separately. |
| **I-07** | Client bundle contains zero API keys or master secrets | Direct bytecode regex audit of release APK bundle. |

---

## 2. Backend Automated Regression Matrix (428 Passed)

The backend test suite is executed using `pytest` across Python 3.11 with SQLAlchemy and FastAPI test clients:

```
============================== 428 passed in 100.43s ==============================
```

### 2.1 Test Suite Breakdown
1. **Legal Rule Engine & Statutory Baselines (`test_rules_*.py`):**
   - Evaluates all 26 statutory rules individually under deterministic inputs.
   - Verifies Fourth Amendment (G.S.R. 826(E)) effective-date switching (`2026.09.v1` vs `2026.07.v1`).
   - Verifies Table-I numeral height curves across all PDP area intervals ($A \leq 50$ through $A > 2500$).
   - Verifies Second Schedule packaging exemptions and commodity unit specifications.
2. **API Routers & RBAC Isolation (`test_phase6d_auth_rbac.py`, `test_admin_*.py`):**
   - Verifies JWT issuance, token epoch revocation, and `install_id` device binding.
   - Verifies role isolation: inspectors are blocked from administrative routes; cross-inspector inspections return 403 Forbidden.
3. **Evidence Integrity & Audit Chains (`test_integrity_*.py`, `test_evidence_*.py`):**
   - Tests tamper detection: altering a byte in stored images or a field in the database immediately triggers SHA-256 mismatch or breaks the cryptographic audit hash chain.
4. **End-to-End Workflow & Scenarios (`test_phase6e_e2e_scenarios.py`):**
   - Verifies all 10 canonical market surveillance scenarios (Scenarios A through J detailed below).

---

## 3. The 10 Canonical End-to-End Scenarios (`test_phase6e_e2e_scenarios.py`)

These comprehensive integration scenarios validate the entire statutory pipeline from capture to adjudication:

| Scenario | Title | Initial Input | Expected System Behavior & Final Verdict |
|---|---|---|---|
| **Scenario A** | Compliant Package | Multi-panel capture with valid declarations and calibrated scale | All 26 checks pass; overall verdict: **`COMPLIANT`**. |
| **Scenario B** | Confirmed Statutory Violation | Missing consumer care email under Rule 6(1)(g) | Check CHK19 fails; Section 36(1) limb mapped; overall verdict: **`VIOLATION`**. |
| **Scenario C** | Incomplete Coverage | Only Front panel photographed (Back omitted) | Mandatory back checks produce `not_assessed`; overall verdict: **`REVIEW_REQUIRED`**. |
| **Scenario D** | Recapture, Fulfill & Reassess | Scenario C followed by back panel upload | Automated `CAP_BACK_MISSING` task fulfilled; reassessment updates to **`COMPLIANT`**. |
| **Scenario E** | Physical Calibration Invariant | Font check with uncalibrated scale reference | Height check produces `not_assessed`; prevents false font violation. |
| **Scenario F** | Bad Capture Quality Gate | Severely blurred image (Laplacian variance < 60) | Quality gate rejects upload; returns `RETAKE_REQUIRED` with guidance. |
| **Scenario G** | Cross-Panel MRP Conflict | Front panel declares Rs. 145; top crimp declares Rs. 160 | Dual pricing flag raised under Rule 6(2A); surfaces in Review Queue. |
| **Scenario H** | Officer Adjudication | Officer overrides an advisory finding with reason | `engine_verdict` preserved as `fail`; `human_verdict` recorded as `pass`. |
| **Scenario I** | Offline Edit & Synchronization | Inspection created offline with clock skew | Batch synched with `Idempotency-Key`; `clock_skew_seconds` logged. |
| **Scenario J** | Role-Based Tenant Isolation | Inspector attempts access to another officer's visit | Endpoint strictly enforces ownership; returns `403 FORBIDDEN`. |

---

## 4. Frontend Automated Test Matrix (69 Passed)

Executed via `node run_all_tests.js` against the React Native / Expo codebase:

```
========================================
Frontend Test Summary: 6 suites passed, 0 suites failed (69 tests).
========================================
```

1. **`test_auth_security.js` (6 Passed):**
   - Attaches Bearer authorization token to all API calls.
   - Handles 401 Unauthorized by clearing session and redirecting to login.
   - Verifies client bundle contains zero hardcoded API keys or master secrets.
2. **`test_evidence_provenance.js` (15 Passed):**
   - Verifies original camera URI and dimensions are strictly preserved.
   - Verifies derived analysis image is downscaled along long edge ($\leq 1600\text{ px}$) without color distortion.
   - Confirms offline queue prioritizes authoritative original files over derivatives.
3. **`test_quality_gate.js` (18 Passed):**
   - Evaluates sharpness, specular glare, underexposure, overexposure, and edge clipping heuristics.
   - Confirms valid packaging with tiny specular highlights is not falsely rejected.
4. **`test_recapture_workflow.js` (10 Passed):**
   - Verifies recapture task sorting (high -> medium -> low priority).
   - Validates that skipping a task requires an officer explanation $\geq 10$ characters.
   - Enforces calibration task requirement for verified optical references.
5. **`test_reports_ui.js` (10 Passed):**
   - Validates statutory summary rollup and Section 36 limb mappings.
   - Verifies offline caching of inspection summaries.
6. **`test_review_queue.js` (10 Passed):**
   - Tests dual-verdict model rendering and mandatory override reasons.
   - Validates cross-panel conflict resolution modal state.

---

## 5. Physical Hardware Verification & Compatibility

The final production release APK (`NiyamNetra-v1.0.4-release.apk`) has been physically installed and verified on real Android hardware:

- **Hardware Architecture:** ARM64 (`arm64-v8a`) and ARMv7 (`armeabi-v7a`).
- **Android Version Coverage:** Android 7.0 (API Level 24) through Android 16 (API Level 36).
- **16 KB Memory Page-Size Compatibility:** Verified using Android 15 page-size alignment tooling (`zipalign -c -P 16 -v 4`).
- **Camera Sensor Verification:** Verified on autofocus camera sensors with auto-exposure and torch flash controls.
- **In-Place Upgrade Test:** Upgrading from v1.0.x to v1.0.4 on physical hardware preserves local SQLite inspection databases and user sessions without data wipe or signature conflict.

---

## 6. End-to-End Performance Benchmarks

Measured end-to-end on live Render infrastructure and physical Android client:

- **Mean End-to-End Turnaround:** **1,598 ms**
- **Median Turnaround (p50):** **1,547 ms**
- **95th Percentile Turnaround (p95):** **1,973 ms**
- **Conclusion:** Sub-2-second performance is sustained across all normal inspection flows, satisfying field usability requirements for fast market inspections.
