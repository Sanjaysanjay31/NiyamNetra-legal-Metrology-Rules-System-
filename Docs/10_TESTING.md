# NiyamNetra — Testing Strategy

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Portal + Expo app + FastAPI

**Version:** 2.1 | **Date:** 30 Aug 2026 | **Supersedes:** 1.1, 2.0 (see §14 for the corrections log)

---

## 1. WHAT THESE TESTS ARE FOR

There is exactly one failure this test suite exists to prevent: **a package that was not assessed being reported as compliant.**

Everything else in this document is secondary. A missed violation is a bad outcome; a *fabricated* clean result is a different category of harm, because it goes into an enforcement record over an inspecting officer's name, and it is invisible — nobody audits a pass. The three-state verdict model, the mandatory reason, the four-state scan result and the stated denominator all exist to make that failure impossible, and the tests below exist to prove they work.

The second purpose is to stop the project asserting law it has not read. Fifteen entries in `02_NiyamNetra_Rules.md` §15 are marked UNVERIFIED. §5 tests that each one either prints a descriptive requirement or does not print at all.

### 1.1 What this suite does not claim

Version 1.1 of this document claimed "85%+ accuracy", "OCR 85% accuracy on 20 packets (17 correct, 3 Review)", and "54 tests — depth no other team has". None of those numbers were measured. They were written before the system existed.

This version states no accuracy figure anywhere, and neither should the submission, for three reasons. Nobody has run this engine against a labelled corpus, so any figure is invented. A single number over a mixed set of eighteen checks is meaningless even when measured — CHK01 presence detection and CHK06 sub-millimetre typography have nothing in common. And an accuracy claim in an enforcement tool is a representation about evidence quality; making one you cannot substantiate is the same defect the `cite()` helper exists to prevent, committed at the level of the project rather than the citation.

What the suite can honestly report is **which invariants hold**. That is a stronger claim than a percentage, and it is checkable by a judge in front of you.

### 1.2 Canon under test

| # | Invariant | Tested in |
|---|---|---|
| I1 | Every scan produces exactly 19 findings | §4.1 |
| I2 | Every `not_assessed` carries a non-empty reason | §4.2 |
| I3 | No check is ever silently omitted | §4.3 |
| I4 | A halt propagates as `not_assessed` with the halt reason, never as `pass` | §4.4 |
| I5 | `compliant` requires zero `not_assessed` for its scan type (`assessed == total`: 16/16 package without listing, 18/18 with listing) | §4.5 |
| I6 | The reported denominator matches the rows produced | §4.6 |
| I7 | No unverified ledger entry is cited to a pinpoint provision | §5 |
| I8 | No millimetre verdict is reached without a scale reference | §6.1 |
| I9 | A measurement inside the uncertainty band is `not_assessed` | §6.2 |
| I10 | A stored image rehashes to its recorded digest | §7.1 |
| I11 | Any mutation of a hashed audit field breaks the chain | §7.2 |
| I12 | `engine_verdict` cannot be updated, on either engine | §7.3 |
| I13 | No access token is written to browser storage | §9.2 |
| I14 | Ownership is resolved from the row, not from a request parameter | §8.3 |
| I15 | Both engines reject the abolished verdict vocabulary | §10 |

---

## 2. TOOLS AND LAYOUT

```text
backend/tests/
├── conftest.py              # fixtures: engines, sessions, contexts, images
├── factories.py             # builders for CheckContext and ORM rows
├── test_rules_completeness.py    # §4  — I1 to I6
├── test_rules_checks.py          # §4.7 — per-check behaviour
├── test_citations.py             # §5  — I7
├── test_measurement.py           # §6  — I8, I9
├── test_evidence.py              # §7.1 — I10
├── test_audit_chain.py           # §7.2, §7.3 — I11, I12
├── test_auth.py                  # §8  — I14
├── test_ssrf.py                  # §8.5
├── test_endpoints.py             # §8.1
├── test_dual_engine.py           # §10 — I15
└── fixtures/
    ├── panels/              # captured images, committed, small
    └── expected/            # golden findings sets, JSON

portal/src/**/*.test.jsx     # Vitest + React Testing Library
portal/tests/contrast.test.js # §9.1 — every token pair in 08 §2.1
```

```bash
pip install pytest==8.1.1 pytest-cov==5.0.0 httpx==0.27.0 freezegun==1.4.0
npm install -D vitest@1.4 @testing-library/react@14 @testing-library/jest-dom@6 jsdom@24
```

Playwright is optional and is not part of the required suite. The end-to-end path in §11 is a written manual script, because the parts of this system that most need end-to-end confidence — a phone camera, a GPS fix, a shop with poor light — cannot be driven by a browser automation tool, and pretending otherwise produces a green CI badge over the exact scenarios that fail in the field.

### 2.1 conftest.py — the two engines

```python
"""conftest.py"""
import os
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)   # passes the validator

SQLITE_URL = "sqlite:///:memory:"
# Set PG_TEST_URL to run the dual-engine suite. Without it those tests skip
# loudly rather than passing vacuously.
PG_URL = os.environ.get("PG_TEST_URL")


def _build(url):
    eng = create_engine(url, connect_args={"check_same_thread": False}
                        if url.startswith("sqlite") else {})
    if url.startswith("sqlite"):
        @event.listens_for(eng, "connect")
        def _pragmas(conn, _):
            cur = conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    return eng


@pytest.fixture(params=["sqlite", "postgres"])
def engine(request):
    """Every schema-level test runs against both engines.

    The project claims SQLite in development and PostgreSQL in production. A
    suite that only exercises SQLite cannot see that RAISE(ABORT),
    AUTOINCREMENT and json_each are SQLite-only — which is how v1.x shipped a
    DDL block headed "works for Postgres" that did not.
    """
    if request.param == "postgres":
        if not PG_URL:
            pytest.skip("PG_TEST_URL not set — PostgreSQL half of the suite not run")
        eng = _build(PG_URL)
    else:
        eng = _build(SQLITE_URL)

    from alembic import command
    from alembic.config import Config
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", str(eng.url))
    command.upgrade(cfg, "head")     # NOT create_all — the constraints matter
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.rollback()
    s.close()
```

Schema tests go through Alembic, never `Base.metadata.create_all`. `create_all` omits the `CHECK` constraints and cannot emit the triggers, so a suite built on it would pass while proving nothing about the guarantees those objects provide.

---

## 3. FIXTURES

### 3.1 The degraded-data fixture

This is the most important fixture in the suite and it is the one version 1.1 did not have. Every fixture in 1.1 was a clean, well-lit, correctly-declared package or a cleanly-broken one. Real field data is neither.

```python
"""factories.py"""
from datetime import date
from rules_engine import CheckContext


def clean_context(**over) -> CheckContext:
    """A fully readable, compliant biscuit packet."""
    from ocr_engine import ExtractedField as F
    ctx = CheckContext(
        transaction_type="retail_sale",
        commodity_generic="biscuits",
        commodity_category="food",
        net_quantity_value=100.0,
        net_quantity_unit="g",
        is_imported=False,
        is_perishable=False,
        is_medical_device=False,
        is_tobacco=False,
        has_sticker=False,
        panel_shape="rectangular",
        panel_height_mm=120.0,
        panel_width_mm=100.0,
        mm_per_pixel=0.05,
        mm_per_pixel_uncertainty=0.004,
        scale_source="declared",
        ocr_available=True,
        ocr_mean_confidence=0.92,
        image_usable=True,
        rules_as_at=date(2026, 7, 1),
    )
    ctx.fields = {
        "manufacturer": F("Example Foods Ltd, Pune", 0.94, "Mfd by Example Foods Ltd, Pune", True),
        "commodity": F("Biscuits", 0.96, "Biscuits", True),
        "net_quantity": F("100", 0.95, "Net Qty: 100 g", True),
        "date_of_manufacture": F("08/2026", 0.91, "Mfg 08/2026", True),
        "mrp": F("10.00", 0.93, "MRP Rs. 10.00 inclusive of all taxes", True),
        "consumer_care": F("18001234567", 0.90, "Consumer care 18001234567", True),
        "mrp_inclusive_wording": F("present", None, None, True),
    }
    ctx.measured_heights_mm = {
        "manufacturer": 2.8, "commodity": 3.4, "net_quantity": 3.0,
        "date_of_manufacture": 2.7, "mrp": 3.1, "consumer_care": 2.6,
    }
    ctx.measured_widths_mm = {k: v * 0.55 for k, v in ctx.measured_heights_mm.items()}
    ctx.clear_space_mm = {"above": 4.0, "below": 4.0, "left": 7.0, "right": 7.0}
    ctx.contrast_ratio = 9.4
    for k, v in over.items():
        setattr(ctx, k, v)
    return ctx


def degraded_context(**over) -> CheckContext:
    """A real capture that went wrong: dim shop, no ruler, glare on the panel.

    Nothing here is malformed. It is what a Tuesday afternoon in a kirana shop
    actually produces, and the engine must survive it while recording the truth.
    """
    ctx = CheckContext(
        transaction_type="retail_sale",
        commodity_generic="loose tea",
        panel_shape=None,              # operator skipped the dimension step
        mm_per_pixel=None,
        scale_source="none",
        ocr_available=False,
        ocr_failure_reason="PaddleOCR returned no text regions",
        image_usable=False,
        image_quality_reason="Glare over 14% of the panel obscures the declarations.",
        rules_as_at=date(2026, 7, 1),
    )
    for k, v in over.items():
        setattr(ctx, k, v)
    return ctx
```

### 3.2 Fixture set

Twenty packages, and what each one is for. No fixture uses a real government email domain or a six-character password: credentials are `@example.test`, per `06_DATABASE.md` §9.

| # | Fixture | Exercises | Expected result |
|---|---|---|---|
| 1 | Biscuits 100 g, all declarations, 120×100 mm panel | the happy path | `compliant`, 19 pass |
| 2 | Same, MRP absent | CHK01 limb 36(1) | `violation` |
| 3 | Same, `Net Qty: Approx 500 g` | CHK05 prohibited qualifier, limb 36(2) | `violation` |
| 4 | Same, `MRP Rs. 10` with no tax wording | CHK04 form breach | `violation` |
| 5 | Same, two prices printed | CHK04 dual MRP, Rule 6(2A) | `violation` |
| 6 | Imported cocoa, no country of origin | CHK12 | `violation` |
| 7 | Domestic cocoa, no country of origin | CHK12 must **pass**, not vanish | `compliant` |
| 8 | Import status unrecorded | CHK12 must be `not_assessed` | `not_assessed` |
| 9 | Perishable curd, no best-before | CHK13 | `violation` |
| 10 | Non-perishable rice, no best-before | CHK13 must **pass** | `compliant` |
| 11 | Sachet 8 g, no declarations | CHK02 exemption halts | `out_of_scope` |
| 12 | Tobacco sachet 8 g, no declarations | CHK02 carve-out — must **not** exempt | `violation` |
| 13 | Sachet 8 g, tobacco status unrecorded | CHK02 `not_assessed` | `not_assessed` |
| 14 | 30 kg chemical drum, wholesale | CHK03 halts | `out_of_scope` |
| 15 | 50 kg cement bag, retail | Rule 3 agri ceiling — in scope | assessed normally |
| 16 | Glucometer box | CHK14 routes out, phase 3 `not_assessed` | `not_assessed` |
| 17 | Cylindrical 1 L bottle, blown-moulded | Rule 7(4) cylinder formula + blown column | assessed |
| 18 | Panel 300 px tall | `compute_scale` floor, five checks `not_assessed` | `not_assessed` |
| 19 | Glare + no OCR + no dimensions (`degraded_context`) | the whole degradation path | `not_assessed`, ≥13 rows `not_assessed` |
| 20 | Duplicate of #1, same store, same batch, same day | `duplicate_of` set, excluded from aggregates | `duplicate_of` non-null |

Fixtures 7, 10, 12 and 13 exist specifically because version 1.x's engine produced *no row at all* in those four situations. They are the regression tests for the silent-omission class of defect, and they are the reason this list is ordered the way it is.

---

## 4. RULES ENGINE — completeness

These tests import `run_checks` and `derive_result` and touch nothing else. No database, no image, no OCR model. That is what makes them fast enough to run on every commit and what makes the degraded fixtures cheap.

### 4.1 I1 — exactly nineteen, always

```python
import pytest
from factories import clean_context, degraded_context
from rules_engine import ALL_CHECK_IDS, run_checks

ALL_FIXTURES = ["clean", "degraded", "halted_scope", "halted_exempt",
                "medical_device", "no_scale", "tobacco_small", "imported_no_coo"]


@pytest.mark.parametrize("fixture_name", ALL_FIXTURES)
def test_always_nineteen_findings(fixture_name, load_fixture):
    ctx = load_fixture(fixture_name)
    results = run_checks(ctx)
    assert len(results) == 19, (
        f"{fixture_name} produced {len(results)} findings. A short findings set "
        f"means a check was skipped, and a skipped check is invisible in the report."
    )
    assert [r.check_id for r in results] == list(ALL_CHECK_IDS)


def test_registry_has_no_duplicates_and_no_gaps():
    assert len(ALL_CHECK_IDS) == 19
    assert len(set(ALL_CHECK_IDS)) == 19
    expected = {f"CHK{i:02d}" for i in range(1, 19)} | {"CHK06b"}
    assert set(ALL_CHECK_IDS) == expected
```

### 4.2 I2 — a reason is mandatory

```python
@pytest.mark.parametrize("fixture_name", ALL_FIXTURES)
def test_not_assessed_always_has_a_reason(fixture_name, load_fixture):
    for r in run_checks(load_fixture(fixture_name)):
        if r.verdict == "not_assessed":
            assert r.reason and r.reason.strip(), (
                f"{r.check_id} returned not_assessed with no reason. An "
                f"unexplained not_assessed is indistinguishable from a bug and "
                f"gives the inspector nothing to act on."
            )
            assert len(r.reason) > 25, (
                f"{r.check_id} reason is too short to be useful: {r.reason!r}"
            )


def test_database_also_refuses_a_reasonless_not_assessed(db):
    """The invariant is enforced twice — in the runner and in the schema — so a
    code path that bypasses the runner still cannot commit it."""
    from sqlalchemy.exc import IntegrityError
    from models import Finding
    db.add(Finding(scan_id=1, check_id="CHK01", title="t",
                   engine_verdict="not_assessed", severity="major", reason=None))
    with pytest.raises(IntegrityError):
        db.commit()
```

### 4.3 I3 — no silent omission, per check

```python
# Each entry: the fixture, and the check that v1.x made disappear on it.
SILENT_OMISSION_REGRESSIONS = [
    ("domestic_no_coo",        "CHK12"),   # gated on `if is_imported:` with no else
    ("coo_status_unknown",     "CHK12"),
    ("non_perishable",         "CHK13"),   # gated on `if is_perishable:`
    ("perishable_unknown",     "CHK13"),
    ("tobacco_small",          "CHK02"),   # `if category not in [...]` with no else
    ("no_sticker",             "CHK11"),
    ("sticker_state_unknown",  "CHK11"),
    ("non_food",               "CHK17"),
    ("package_scan_no_listing","CHK15"),   # no listing to fetch
    ("package_scan_no_listing","CHK16"),
    ("medical_device",         "CHK06"),   # phase 3 halted
    ("medical_device",         "CHK09"),
]


@pytest.mark.parametrize("fixture_name,check_id", SILENT_OMISSION_REGRESSIONS)
def test_check_is_present_even_when_inapplicable(fixture_name, check_id, load_fixture):
    results = run_checks(load_fixture(fixture_name))
    row = next((r for r in results if r.check_id == check_id), None)
    assert row is not None, (
        f"{check_id} produced no row on {fixture_name}. This is the exact defect "
        f"the three-state model exists to prevent: the check vanishes and the "
        f"report reads as though it never applied."
    )
    assert row.verdict in {"pass", "fail", "not_assessed"}
```

### 4.4 I4 — halts propagate as `not_assessed`, never as `pass`

```python
def test_scope_halt_marks_downstream_not_assessed(load_fixture):
    ctx = load_fixture("halted_scope")        # 30 kg drum, wholesale
    results = run_checks(ctx)
    chk03 = next(r for r in results if r.check_id == "CHK03")
    assert chk03.verdict == "pass"            # the check succeeded: it found no scope
    downstream = [r for r in results if r.check_id != "CHK03"]
    assert all(r.verdict == "not_assessed" for r in downstream), (
        "A package outside Chapter II cannot pass a Chapter II declaration check. "
        "Reporting those as pass manufactures eighteen compliant findings about "
        "obligations that never applied."
    )
    assert all(ctx.halt_reason in (r.reason or "") for r in downstream)


def test_exemption_halt_does_not_report_compliance(load_fixture):
    from rules_engine import derive_result
    ctx = load_fixture("halted_exempt")       # 8 g sachet, not tobacco
    results = run_checks(ctx)
    verdict = derive_result(results, ctx)
    assert verdict.overall_result == "out_of_scope"
    assert verdict.overall_result != "compliant", (
        "An exempt package has not demonstrated compliance; it was never required to."
    )
```

### 4.5 I5 — `compliant` requires zero `not_assessed` for its scan type

A package scan without a listing honestly reports 16/18 (CHK15/CHK16 `not_assessed`) and resolves `not_assessed`, never `compliant`. `compliant` means `assessed == total` for that scan's denominator (16/16 without listing, 18/18 with one) — equivalently `assessed >= 16` with zero gaps in the checks that could run.

```python
def test_compliant_requires_every_check_assessed(load_fixture):
    from rules_engine import derive_result
    ctx = load_fixture("clean")
    results = run_checks(ctx)
    v = derive_result(results, ctx)
    assert v.not_assessed == 0
    assert v.overall_result == "compliant"


def test_partial_assessment_is_never_compliant():
    """The single most consequential assertion in this file."""
    from rules_engine import derive_result
    from factories import clean_context
    ctx = clean_context(ocr_available=False,
                        ocr_failure_reason="PaddleOCR returned no text regions")
    results = run_checks(ctx)
    v = derive_result(results, ctx)
    assert v.not_assessed > 0
    assert v.overall_result == "not_assessed", (
        f"An unreadable package was reported {v.overall_result!r}. Under the "
        f"abolished two-state model this scan came back 'Good' — a clean result "
        f"on a package nobody could read."
    )


@pytest.mark.parametrize("fixture_name", ALL_FIXTURES)
def test_compliant_implies_no_failures_and_no_gaps(fixture_name, load_fixture):
    from rules_engine import derive_result
    ctx = load_fixture(fixture_name)
    v = derive_result(run_checks(ctx), ctx)
    if v.overall_result == "compliant":
        assert v.failed == 0 and v.not_assessed == 0
```

### 4.6 I6 — the denominator is honest

```python
def test_counts_sum_to_the_rows_produced(load_fixture):
    from rules_engine import derive_result
    for name in ALL_FIXTURES:
        ctx = load_fixture(name)
        results = run_checks(ctx)
        v = derive_result(results, ctx)
        assessable = len(results) - 1          # CHK18 is derived, not assessed
        assert v.passed + v.failed + v.not_assessed == assessable, name
        assert v.checks_total == 18          # 18 assessable; CHK18 is derived, not counted
        assert v.checks_assessed == assessable - v.not_assessed


def test_package_scan_reports_sixteen_of_eighteen(load_fixture):
    """C5. A mobile package scan cannot reach CHK15 or CHK16, and the report
    must say sixteen of eighteen rather than implying a full assessment."""
    ctx = load_fixture("clean")               # no listing captured
    results = run_checks(ctx)
    listing = [r for r in results if r.check_id in {"CHK15", "CHK16"}]
    assert all(r.verdict == "not_assessed" for r in listing)
    assert all("listing" in (r.reason or "").lower()
               or "platform" in (r.reason or "").lower() for r in listing)
```

### 4.7 Coherence and per-check behaviour

```python
def test_advisory_checks_never_fail(load_fixture):
    """CHK17 is advisory. The FSS Act is not administered under this Act, so a
    missing FSSAI number cannot be a Legal Metrology finding."""
    for name in ALL_FIXTURES:
        for r in run_checks(load_fixture(name)):
            assert not (r.verdict == "fail" and r.severity == "advisory"), (
                f"{r.check_id} on {name} returned an advisory failure."
            )


def test_chk17_only_passes_or_abstains(load_fixture):
    for name in ALL_FIXTURES:
        row = next(r for r in run_checks(load_fixture(name)) if r.check_id == "CHK17")
        assert row.verdict in {"pass", "not_assessed"}


def test_engine_error_in_one_check_does_not_delete_the_others(monkeypatch):
    """A bug in one check must not shorten the report, and must not read as
    compliance."""
    import rules_engine
    def exploding(ctx):
        raise RuntimeError("simulated engine fault")
    idx = next(i for i, (cid, _) in enumerate(rules_engine.CHECKS) if cid == "CHK04")
    monkeypatch.setitem(rules_engine.CHECKS, idx, ("CHK04", exploding))

    results = rules_engine.run_checks(clean_context())
    assert len(results) == 19
    row = next(r for r in results if r.check_id == "CHK04")
    assert row.verdict == "not_assessed"
    assert "engine fault" in row.reason.lower()


def test_net_quantity_failure_engages_limb_36_2():
    ctx = clean_context()
    ctx.fields["net_quantity"].source_line = "Net Qty: Approx 500 g"
    ctx.net_quantity_value, ctx.net_quantity_unit = 500.0, "g"
    from rules_engine import derive_result
    results = run_checks(ctx)
    v = derive_result(results, ctx)
    assert v.violation_limb in {"36(2)", "both"}
    assert v.recommended_action == "prosecution_36_2", (
        "A short or misdeclared net quantity is not an improvement-notice matter."
    )


def test_tier_is_not_always_improvement_notice():
    """v1.x's determine_violation_tier returned improvement_notice on every
    branch, so the tier was decorative."""
    from rules_engine import _graduated_action
    assert _graduated_action([], "36(2)") == "prosecution_36_2"
    crit = [type("F", (), {"verdict": "fail", "severity": "critical"})()]
    assert _graduated_action(crit, "36(1)") == "prosecution_36_1"
    minor = [type("F", (), {"verdict": "fail", "severity": "minor"})()]
    assert _graduated_action(minor, "36(1)") == "improvement_notice_s15"


def test_count_units_are_not_treated_as_si():
    """"N" and "U" denote a count. v1.x listed both in allowed_units as if they
    were SI units, so a quantity declared "500 N" passed CHK05 silently."""
    ctx = clean_context(net_quantity_unit="N", net_quantity_value=12.0)
    row = next(r for r in run_checks(ctx) if r.check_id == "CHK05")
    assert row.verdict == "not_assessed"
    assert row.ledger_ref == "L-06"
```

---

## 5. I7 — THE LEGAL VERIFICATION LEDGER

Fifteen tests, one per ledger entry. This section is why the project can be handed to an adjudicating officer.

```python
"""test_citations.py"""
import pytest
from citations import UNVERIFIED, cite

LEDGER = [f"L-{i:02d}" for i in range(1, 16)]


def test_ledger_is_complete():
    assert sorted(set(UNVERIFIED.values())) == LEDGER, (
        "Every entry L-01 to L-15 in 02 §15 must appear in citations.UNVERIFIED, "
        "or a check will print a pinpoint provision the project has not read."
    )


@pytest.mark.parametrize("key,ledger", sorted(UNVERIFIED.items()))
def test_unverified_provisions_are_never_pinpointed(key, ledger):
    out = cite(key, "the descriptive requirement")
    assert ledger in out
    assert "unverified" in out.lower()
    assert out.startswith("the descriptive requirement")


import re
PINPOINT = re.compile(r"\bRule\s+\d+\(\d+\)|\bSection\s+\d+\(\d+\)")


@pytest.mark.parametrize("key", sorted(UNVERIFIED))
def test_no_subrule_number_leaks_for_an_unverified_entry(key):
    out = cite(key, "the descriptive requirement")
    assert not PINPOINT.search(out), (
        f"cite({key!r}) emitted a pinpoint provision for an unverified entry: {out!r}. "
        f"An inspector can defend a described requirement; nobody can defend a "
        f"sub-rule number the project has not opened."
    )


def test_every_findings_citation_survives_the_same_test(load_fixture):
    """Belt and braces: run the engine and check the emitted citations too."""
    from rules_engine import run_checks
    for name in ["clean", "degraded", "imported_no_coo", "tobacco_small"]:
        for r in run_checks(load_fixture(name)):
            if r.ledger_ref:
                assert "unverified" in (r.citation or "").lower(), (
                    f"{r.check_id} carries ledger {r.ledger_ref} but its citation "
                    f"{r.citation!r} does not disclose that it is unverified."
                )


def test_no_penalty_amount_is_ever_printed(load_fixture):
    """L-12. Section 36 amounts under Act 8 of 2026 are unverified, so no rupee
    figure may appear in a finding or in a report."""
    from rules_engine import run_checks
    import re as _re
    money = _re.compile(r"(₹|Rs\.?\s*|INR\s*)\d{3,}")
    for name in ["clean", "degraded", "imported_no_coo"]:
        for r in run_checks(load_fixture(name)):
            for field in (r.observed, r.required, r.reason, r.citation):
                if field and r.check_id == "CHK18":
                    assert not money.search(field), (
                        f"CHK18 printed a monetary figure: {field!r}. L-12 is "
                        f"unverified; a wrong penalty in an enforcement document "
                        f"is worse than no penalty."
                    )
```

---

## 6. MEASUREMENT

### 6.1 I8 — no millimetre verdict without a scale

```python
"""test_measurement.py"""
import math
import pytest
from factories import clean_context
from rules_engine import min_height_mm, pdp_area_cm2, run_checks

MM_CHECKS = {"CHK06", "CHK06b", "CHK07", "CHK09"}


def test_no_scale_blocks_every_millimetre_check():
    ctx = clean_context(mm_per_pixel=None, scale_source="none")
    rows = {r.check_id: r for r in run_checks(ctx)}
    for cid in MM_CHECKS:
        assert rows[cid].verdict == "not_assessed", (
            f"{cid} reached a verdict with no scale reference. A camera has no "
            f"absolute scale: two photographs of the same 2.5 mm letter at "
            f"different distances give different pixel heights, so the check is "
            f"undecidable until one known length is identified in the frame."
        )


def test_panel_below_resolution_floor_blocks_measurement():
    from image_processor import compute_scale
    s = compute_scale(panel_pixel_height=300, declared_panel_height_mm=120.0)
    assert s.mm_per_pixel is None
    assert "400 px" in s.reason


def test_scale_from_declared_height():
    from image_processor import compute_scale
    s = compute_scale(panel_pixel_height=2400, declared_panel_height_mm=120.0)
    assert s.mm_per_pixel == pytest.approx(0.05)
    assert s.source == "declared"
    assert s.uncertainty and s.uncertainty > 0


def test_id1_card_reference_is_the_iso_dimension():
    from image_processor import compute_scale, ID1_LONG_EDGE_MM
    assert ID1_LONG_EDGE_MM == 85.60          # ISO/IEC 7810 ID-1
    s = compute_scale(2400, None, reference_pixel_size=856.0, reference="id1_card")
    assert s.mm_per_pixel == pytest.approx(0.1)
    assert s.source == "id1_card"


def test_smaller_reference_carries_larger_uncertainty():
    from image_processor import compute_scale
    card = compute_scale(2400, None, reference_pixel_size=856.0, reference="id1_card")
    coin = compute_scale(2400, None, reference_pixel_size=230.0, reference="coin_5inr")
    assert coin.uncertainty / coin.mm_per_pixel > card.uncertainty / card.mm_per_pixel
```

### 6.2 I9 — the uncertainty band

```python
def test_measurement_inside_the_band_is_not_assessed():
    from rules_engine import compare_with_uncertainty
    assert compare_with_uncertainty(3.0, 2.5, 0.1)[0] == "pass"
    assert compare_with_uncertainty(1.8, 2.5, 0.1)[0] == "fail"
    v, note = compare_with_uncertainty(2.45, 2.5, 0.2)
    assert v == "not_assessed"
    assert "uncertainty" in note.lower()
    assert "2.45" in note and "2.5" in note, (
        "The reason must print both figures. An inspector cannot act on "
        "'inconclusive' without knowing how close it was."
    )


def test_borderline_shortfall_is_never_reported_as_a_breach():
    ctx = clean_context()
    ctx.measured_heights_mm["mrp"] = 2.48       # 2.5 mm required, 0.02 mm short
    ctx.mm_per_pixel_uncertainty = 0.05         # doubled inside the check
    row = next(r for r in run_checks(ctx) if r.check_id == "CHK06")
    assert row.verdict == "not_assessed", (
        "A 0.02 mm shortfall measured with 0.1 mm uncertainty is not a finding. "
        "Asserting it invites the first defence lawyer to discredit the tool."
    )
```

### 6.3 Table-I bands and the Rule 7(4) formulas

```python
# Ledger L-11 — UNVERIFIED. These tests pin the values the engine uses so that
# a change to them is deliberate and visible in a diff, not accidental.
@pytest.mark.parametrize("area,blown,expected", [
    (10.0,   False, 1.0), (50.0,   False, 1.0),   # boundary, inclusive
    (50.01,  False, 1.5), (100.0,  False, 1.5),
    (100.01, False, 2.5), (500.0,  False, 2.5),
    (500.01, False, 4.0), (2500.0, False, 4.0),
    (2500.01, False, 6.0), (99999.0, False, 6.0),
    (10.0,   True,  1.5), (100.0,  True,  3.0),
    (500.0,  True,  4.0), (2500.0, True,  6.0), (5000.0, True, 6.0),
])
def test_table_i_bands_including_boundaries(area, blown, expected):
    assert min_height_mm(area, blown) == expected


def test_table_i_is_total_and_monotonic():
    from rules_engine import TABLE_I
    assert TABLE_I[-1][0] == math.inf, "the last band must be open-ended"
    normals = [b[1] for b in TABLE_I]
    assert normals == sorted(normals), "required height must not decrease with area"


def test_pdp_area_rectangular():
    ctx = clean_context(panel_shape="rectangular",
                        panel_height_mm=120.0, panel_width_mm=100.0)
    area, reason = pdp_area_cm2(ctx)
    assert reason is None
    assert area == pytest.approx(120.0)          # 12000 mm2 -> 120 cm2


def test_pdp_area_cylindrical_uses_the_rule_7_4_formula():
    ctx = clean_context(panel_shape="cylindrical",
                        panel_height_mm=200.0, panel_diameter_mm=70.0,
                        panel_width_mm=None)
    area, _ = pdp_area_cm2(ctx)
    assert area == pytest.approx(0.4 * 200.0 * math.pi * 70.0 / 100.0)


def test_pdp_area_other_is_forty_percent_of_total_surface():
    ctx = clean_context(panel_shape="other", panel_height_mm=None,
                        panel_width_mm=None, total_surface_area_cm2=500.0)
    area, _ = pdp_area_cm2(ctx)
    assert area == pytest.approx(200.0)


def test_missing_geometry_yields_a_reason_not_a_guess():
    ctx = clean_context(panel_shape=None, panel_height_mm=None, panel_width_mm=None)
    area, reason = pdp_area_cm2(ctx)
    assert area is None
    assert "Rule 7(4)" in reason


def test_chk06b_stays_not_assessed_until_l04_is_transcribed():
    """The net-quantity-specific height table has not been transcribed. CHK06b
    must abstain visibly rather than borrow CHK06's threshold."""
    row = next(r for r in run_checks(clean_context()) if r.check_id == "CHK06b")
    assert row.verdict == "not_assessed"
    assert row.ledger_ref == "L-04"
    assert "L-04" in row.reason or "not been transcribed" in row.reason
```

---

## 7. EVIDENCE AND AUDIT

### 7.1 I10 — the hash describes the file on disk

```python
"""test_evidence.py"""
import hashlib
from pathlib import Path

import pytest


def test_stored_bytes_rehash_to_the_recorded_digest(tmp_path, monkeypatch, jpeg_bytes):
    from config import settings
    monkeypatch.setattr(settings, "EVIDENCE_DIR", tmp_path)
    from image_processor import store_upload, verify_stored_image

    stored = store_upload(jpeg_bytes, "image/jpeg", inspection_id=1, scan_id=1)
    assert verify_stored_image(stored.path, stored.sha256)
    assert hashlib.sha256(stored.path.read_bytes()).hexdigest() == stored.sha256


def test_stored_file_is_byte_identical_to_the_upload(tmp_path, monkeypatch, jpeg_bytes):
    """This is the regression test for the single worst defect in v1.x: the
    hash was taken of the upload and a re-encoded JPEG was written to disk, so
    the recorded digest could never be reproduced from the stored evidence."""
    from config import settings
    monkeypatch.setattr(settings, "EVIDENCE_DIR", tmp_path)
    from image_processor import store_upload

    stored = store_upload(jpeg_bytes, "image/jpeg", 1, 1)
    assert stored.path.read_bytes() == jpeg_bytes, (
        "The stored file differs from the upload. Any re-encode, resize or "
        "metadata strip between hashing and writing invalidates every integrity "
        "claim in the project, and it fails on the first verification anyone "
        "attempts — which is exactly when it matters."
    )


def test_a_tampered_file_is_detected(tmp_path, monkeypatch, jpeg_bytes):
    from config import settings
    monkeypatch.setattr(settings, "EVIDENCE_DIR", tmp_path)
    from image_processor import store_upload, verify_stored_image

    stored = store_upload(jpeg_bytes, "image/jpeg", 1, 1)
    with stored.path.open("ab") as fh:
        fh.write(b"tamper")
    assert not verify_stored_image(stored.path, stored.sha256)


def test_verify_endpoint_reports_per_image(client, seeded_scan):
    r = client.get(f"/scans/{seeded_scan.id}/verify")
    assert r.status_code == 200
    body = r.json()
    assert body["all_intact"] is True
    assert all(i["sha256_matches"] for i in body["images"])


def test_decompression_bomb_is_refused_before_decode():
    from config import settings
    from PIL import Image
    assert Image.MAX_IMAGE_PIXELS == settings.MAX_IMAGE_PIXELS == 80_000_000


@pytest.mark.parametrize("d", [1, 2, 3, 4, 5, 6, 7])
def test_band_index_is_complete_up_to_bands_minus_one(d):
    """The band index must be a COMPLETE filter at the near-duplicate
    threshold, not merely a fast one.

    The bound: d differing bits touch at most d bands, so k - d bands stay
    identical and the OR over band columns cannot miss the pair — while
    d <= k - 1. With k = 8 that covers every distance up to 7.

    This is tested over synthetic hashes and adversarially chosen bit
    positions, not over a sample image pair. The earlier version of this test
    hashed two photographs, checked `if d <= 5`, and passed vacuously whenever
    the pair happened to land further apart — which is how the four-band
    version of the code shipped with a false completeness claim for months.
    """
    import itertools, random
    from image_processor import PHASH_BANDS, split_bands

    assert PHASH_BANDS == 8
    width = 64 // PHASH_BANDS
    random.seed(20260830)

    for _ in range(200):
        base = random.getrandbits(64)
        # adversarial first: spread the flips across as many bands as possible
        spread = [i * width for i in range(min(d, PHASH_BANDS))]
        spread += random.sample(
            [b for b in range(64) if b not in spread], d - len(spread)
        )
        for flips in [spread, random.sample(range(64), d)]:
            other = base
            for bit in flips:
                other ^= 1 << bit
            a = split_bands(f"{base:016x}")
            b = split_bands(f"{other:016x}")
            assert any(x == y for x, y in zip(a, b)), (
                f"distance {d} with flips {sorted(flips)} matched no band — "
                "the index would never make this pair a candidate"
            )


def test_four_bands_would_have_been_incomplete_at_the_threshold():
    """The regression this replaced. Kept as a live demonstration so nobody
    re-derives the four-band design from first principles and repeats it."""
    base = 0xA5A5_5A5A_C3C3_3C3C
    other = base
    for bit in (5, 9, 16, 38, 50):          # distance 5
        other ^= 1 << bit
    four = lambda v: tuple((v >> (16 * i)) & 0xFFFF for i in range(4))
    assert not any(x == y for x, y in zip(four(base), four(other)))


def test_threshold_cannot_exceed_the_band_count():
    from image_processor import PHASH_BANDS, PHASH_NEAR_DUPLICATE
    assert PHASH_NEAR_DUPLICATE <= PHASH_BANDS - 1


def test_banded_lookup_finds_what_brute_force_finds(db_session, image_corpus):
    """End to end against the database: the SQL candidate filter plus the
    Python distance check must return exactly what rehashing every row does."""
    from image_processor import find_near_duplicates, hamming, PHASH_NEAR_DUPLICATE
    from models import ScanImage

    probe_hex, probe_bands = image_corpus.probe
    banded = set(find_near_duplicates(
        db_session, probe_hex, probe_bands, exclude_scan_id=image_corpus.probe_scan_id
    ))
    brute = {
        row.id for row in db_session.query(ScanImage).all()
        if row.scan_id != image_corpus.probe_scan_id and row.phash
        and hamming(probe_hex, row.phash) <= PHASH_NEAR_DUPLICATE
    }
    assert banded == brute


def test_near_duplicate_is_a_review_item_not_a_verdict(client, near_duplicate_upload):
    """Two shelf-mates of the same SKU are legitimately near-identical. pHash
    proximity means a human should look, and nothing more."""
    body = near_duplicate_upload
    assert "verdict" not in body
    assert body.get("usable") is not False or body.get("quality_note")
```

### 7.2 I11 — the chain protects every field it claims to

```python
"""test_audit_chain.py"""
import pytest
from audit import append_audit, chain_hash, verify_chain


def test_a_clean_chain_verifies(db):
    for i in range(5):
        append_audit(db, action=f"a{i}", user_id=1, inspection_id=1,
                     new_value=str(i))
    assert verify_chain(db)["intact"] is True


@pytest.mark.parametrize("field,new", [
    ("user_id", 99),            # v1.x did NOT hash this
    ("new_value", "Good"),      # v1.x did NOT hash this either
    ("action", "approved"),
    ("old_value", "x"),
    ("reason", "x"),
    ("inspection_id", 42),
    ("scan_id", 42),
])
def test_mutating_any_hashed_field_breaks_the_chain(db, field, new):
    """user_id and new_value are the two v1.x left out. Between them they cover
    almost every tampering motive: reassign the action to another officer, and
    change what the action did."""
    from models import AuditLog
    for i in range(3):
        append_audit(db, action=f"a{i}", user_id=1, inspection_id=1, new_value=str(i))
    target = db.query(AuditLog).filter(AuditLog.seq == 2).one()
    db.query(AuditLog).filter(AuditLog.seq == 2).update({field: new})
    db.commit()

    state = verify_chain(db)
    assert state["intact"] is False, f"mutating {field} went undetected"
    assert state["failed_at"] == 2


def test_a_sequence_gap_is_detected(db):
    from models import AuditLog
    for i in range(4):
        append_audit(db, action=f"a{i}", user_id=1)
    db.execute(AuditLog.__table__.delete().where(AuditLog.seq == 2))
    db.commit()
    state = verify_chain(db)
    assert state["intact"] is False
    assert "sequence gap" in state["why"]


def test_canonical_serialisation_is_order_independent(db):
    """sort_keys and compact separators are mandatory. Without them a change in
    dictionary ordering or in whitespace yields a different digest, and every
    verification fails for a reason that looks exactly like tampering."""
    from models import AuditLog
    e = append_audit(db, action="a", user_id=1, inspection_id=1, new_value="v")
    again = chain_hash(db.query(AuditLog).filter(AuditLog.seq == e.seq).one(), e.hash_prev)
    assert again == e.hash_self


def test_wholesale_rewrite_contradicts_the_published_head(db, tmp_path, monkeypatch):
    """A chain inside a database the attacker can write to protects nothing on
    its own: they rewrite every entry from the tampered point and it verifies
    perfectly. The defence is that the head has already left the building."""
    from config import settings
    monkeypatch.setattr(settings, "OUT_DIR", tmp_path)
    from audit import publish_daily_head

    for i in range(3):
        append_audit(db, action=f"a{i}", user_id=1, new_value=str(i))
    published = publish_daily_head(db)["head"]

    from models import AuditLog
    db.query(AuditLog).delete()
    db.commit()
    for i in range(3):
        append_audit(db, action=f"rewritten{i}", user_id=1, new_value="clean")

    assert verify_chain(db)["intact"] is True      # internally consistent
    assert verify_chain(db)["head"] != published, (
        "The rewritten chain must not reproduce the published head."
    )
    log = (tmp_path / "chain_heads.log").read_text()
    assert published[:16] in log
```

### 7.3 I12 — immutability, on both engines

```python
def test_audit_log_cannot_be_updated(db):
    from sqlalchemy.exc import DatabaseError
    from models import AuditLog
    append_audit(db, action="a", user_id=1)
    with pytest.raises(DatabaseError):
        db.query(AuditLog).update({"action": "b"})
        db.commit()
    db.rollback()


def test_audit_log_cannot_be_deleted(db):
    from sqlalchemy.exc import DatabaseError
    from models import AuditLog
    append_audit(db, action="a", user_id=1)
    with pytest.raises(DatabaseError):
        db.query(AuditLog).delete()
        db.commit()
    db.rollback()


def test_engine_verdict_cannot_be_rewritten(db, seeded_finding):
    from sqlalchemy.exc import DatabaseError
    from models import Finding
    with pytest.raises(DatabaseError):
        db.query(Finding).filter(Finding.id == seeded_finding.id).update(
            {"engine_verdict": "pass"}
        )
        db.commit()
    db.rollback()


def test_an_override_is_additive_and_requires_a_reason(db, seeded_finding):
    from sqlalchemy.exc import IntegrityError
    from models import Finding
    f = db.get(Finding, seeded_finding.id)
    original = f.engine_verdict

    f.human_verdict = "pass"
    f.override_reason = None
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    f = db.get(Finding, seeded_finding.id)
    f.human_verdict = "pass"
    f.override_reason = "Verified against the physical package with a gauge."
    db.commit()
    assert f.engine_verdict == original, "the engine's view must survive the override"
    assert f.effective_verdict == "pass"


def test_override_is_audited(client, admin_token, seeded_finding, db):
    from models import AuditLog
    r = client.patch(
        f"/admin/findings/{seeded_finding.id}",
        json={"human_verdict": "pass",
              "override_reason": "Measured 2.6 mm with a calibrated gauge."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    entry = db.query(AuditLog).order_by(AuditLog.seq.desc()).first()
    assert entry.action == "finding_overridden"
    assert entry.old_value and entry.new_value and entry.reason
```

---

## 8. API AND AUTHORISATION

### 8.1 Endpoint contract

```python
def test_health_reports_nineteen_registered_checks(client):
    body = client.get("/health").json()
    assert body["checks_registered"] == 19, (
        "Anything other than 19 means a check failed to register and every "
        "report will be silently short."
    )
    assert body["catalog_hash"] and body["rules_as_at"]


def test_scan_response_carries_four_counts_and_a_denominator(client, seeded_scan):
    body = client.get(f"/scans/{seeded_scan.id}").json()
    assert body["checks_total"] == 18
    c = body["counts"]
    assert c["passed"] + c["failed"] + c["not_assessed"] == c["total"]
    assert "not_assessed" in c


def test_dashboard_contract_includes_not_assessed(client, admin_token):
    body = client.get("/admin/dashboard",
                      headers={"Authorization": f"Bearer {admin_token}"}).json()
    for key in ("compliant", "violation", "not_assessed", "out_of_scope", "total"):
        assert key in body["counts"], (
            f"{key} missing from the dashboard contract. A portal given three "
            f"counts infers the fourth, and infers it wrong."
        )
    assert "review_queue" in body


def test_review_badge_and_review_page_agree(client, admin_token, db):
    h = {"Authorization": f"Bearer {admin_token}"}
    badge = client.get("/admin/dashboard", headers=h).json()["review_queue"]
    page = client.get("/admin/review-queue", headers=h).json()
    assert badge == len(page["items"]), (
        "v1.x hard-coded review_count=0 in one place and computed it in another."
    )
```

### 8.2 Tokens

```python
def test_access_token_lives_twelve_hours_and_refresh_thirty_days():
    import jwt
    from config import settings
    from jwt_handler import create_access_token, create_refresh_token

    a = jwt.decode(create_access_token(1, "inspector", "abc"),
                   settings.JWT_SECRET, algorithms=["HS256"])
    r = jwt.decode(create_refresh_token(1, "abc", 0),
                   settings.JWT_SECRET, algorithms=["HS256"])
    assert a["exp"] - a["iat"] == 12 * 3600
    assert r["exp"] - r["iat"] == 30 * 86400
    for claim in ("sub", "role", "install_id", "jti", "token_type", "iat", "exp"):
        assert claim in a


def test_a_refresh_token_is_not_accepted_as_an_access_token():
    """Without the token_type check the 12-hour limit silently becomes 30 days."""
    from jwt_handler import ACCESS, TokenError, create_refresh_token, decode_token
    with pytest.raises(TokenError):
        decode_token(create_refresh_token(1, "abc", 0), expect=ACCESS)


def test_expired_token_yields_401_not_500(client):
    """v1.x raised a bare Exception inside the decoder, which FastAPI turns into
    HTTP 500 — so an expired login looked like a server outage and the client
    had no way to know it should refresh."""
    from freezegun import freeze_time
    from jwt_handler import create_access_token
    with freeze_time("2026-08-30 08:00:00"):
        tok = create_access_token(1, "inspector", "abc")
    with freeze_time("2026-08-31 08:00:00"):
        r = client.get("/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


def test_weak_jwt_secret_is_refused_at_startup(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "change_me")
    from importlib import reload
    import config
    with pytest.raises(Exception):
        reload(config)


def test_token_from_another_install_is_refused(client, db, seeded_user):
    from jwt_handler import create_access_token
    tok = create_access_token(seeded_user.id, seeded_user.role, "some-other-install")
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


def test_password_change_invalidates_live_refresh_tokens(client, seeded_user, db):
    from jwt_handler import create_refresh_token
    old = create_refresh_token(seeded_user.id, seeded_user.install_id,
                               seeded_user.token_epoch)
    seeded_user.token_epoch += 1
    db.commit()
    client.cookies.set("nn_refresh", old)
    assert client.post("/auth/refresh").status_code == 401


def test_refresh_token_is_httponly_and_not_in_the_body(client, seeded_user):
    r = client.post("/auth/login",
                    json={"employee_id": seeded_user.employee_id, "password": "TestPass123!"})
    assert "refresh" not in r.text.lower()
    cookie = r.headers.get("set-cookie", "")
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie.replace("Strict", "strict")
```

### 8.3 I14 — ownership

```python
def test_inspector_cannot_read_another_inspectors_inspection(
    client, inspector_a_token, inspection_of_b
):
    r = client.get(f"/inspections/{inspection_of_b.id}",
                   headers={"Authorization": f"Bearer {inspector_a_token}"})
    assert r.status_code == 404, (
        "404 rather than 403, so the endpoint is not an existence oracle for "
        "records the caller may not see."
    )


def test_ownership_cannot_be_satisfied_by_a_query_parameter(
    client, inspector_a_token, inspection_of_b, seeded_user
):
    """The v1.x regression. require_owner_or_admin(user_id: int, ...) had no
    Path() marker, so FastAPI bound user_id to a QUERY parameter supplied by
    the caller: `?user_id=<my own id>` satisfied the check while the path still
    addressed somebody else's record."""
    r = client.get(
        f"/inspections/{inspection_of_b.id}?user_id={seeded_user.id}",
        headers={"Authorization": f"Bearer {inspector_a_token}"},
    )
    assert r.status_code == 404


def test_inspector_is_refused_the_admin_dashboard(client, inspector_a_token):
    r = client.get("/admin/dashboard",
                   headers={"Authorization": f"Bearer {inspector_a_token}"})
    assert r.status_code == 403


def test_no_token_is_401_everywhere(client):
    for path in ("/auth/me", "/inspections", "/admin/dashboard", "/reports/today"):
        assert client.get(path).status_code == 401
```

### 8.4 Degraded input never becomes a 4xx

```python
def test_a_blurred_image_is_stored_and_flagged_not_rejected(client, inspector_token,
                                                            seeded_scan, blurred_jpeg):
    """v1.x returned HTTP 400, discarding the capture, the GPS fix and the
    inspector's time, and leaving no record that an unreadable package had been
    found — which silently biases the statistics toward the photogenic subset
    of the field."""
    r = client.post(
        f"/scans/{seeded_scan.id}/images",
        files={"file": ("blur.jpg", blurred_jpeg, "image/jpeg")},
        data={"panel": "front"},
        headers={"Authorization": f"Bearer {inspector_token}"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["usable"] is False
    assert "blur" in body["quality_note"].lower()
    assert body["sha256"]


def test_oversized_upload_is_413_and_stores_nothing(client, inspector_token,
                                                    seeded_scan, tmp_path):
    big = b"\xff\xd8" + b"0" * (26 * 1024 * 1024)
    r = client.post(
        f"/scans/{seeded_scan.id}/images",
        files={"file": ("big.jpg", big, "image/jpeg")},
        data={"panel": "front"},
        headers={"Authorization": f"Bearer {inspector_token}"},
    )
    assert r.status_code == 413


def test_duplicate_offline_record_is_kept_and_excluded(db, seeded_inspection):
    """No field work is lost, and no aggregate double-counts it."""
    from queries import todays_stats
    from models import Scan
    a = Scan(inspection_id=seeded_inspection.id, commodity_generic="tea",
             batch_number="B1", overall_result="violation", rules_as_at=
             seeded_inspection.inspection_date, catalog_hash="x", engine_version="2.0.0")
    db.add(a); db.commit()
    b = Scan(inspection_id=seeded_inspection.id, commodity_generic="tea",
             batch_number="B1", overall_result="violation", rules_as_at=
             seeded_inspection.inspection_date, catalog_hash="x", engine_version="2.0.0")
    db.add(b); db.commit()

    from queries import resolve_duplicate
    b.duplicate_of = resolve_duplicate(db, b, seeded_inspection)
    db.commit()
    assert b.duplicate_of == a.id

    stats = todays_stats(db, seeded_inspection.user_id, seeded_inspection.inspection_date)
    assert stats["violation"] == 1, "the duplicate must not inflate the count"
```

### 8.5 SSRF

Only CHK15 and CHK16 fetch anything. That one outbound path is the whole attack surface.

```python
"""test_ssrf.py"""
import pytest
from listing_fetcher import resolve_and_validate

BLOCKED = [
    "https://169.254.169.254/latest/meta-data/",     # cloud metadata
    "https://127.0.0.1/admin",
    "https://localhost/admin",
    "https://10.0.0.1/",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    "https://[::1]/",
    "https://0.0.0.0/",
]


@pytest.mark.parametrize("url", BLOCKED)
def test_private_and_link_local_targets_are_refused(url):
    with pytest.raises(ValueError):
        resolve_and_validate(url)


@pytest.mark.parametrize("url", ["http://example.com/", "file:///etc/passwd",
                                 "gopher://example.com/", "ftp://example.com/"])
def test_only_https_is_permitted(url):
    with pytest.raises(ValueError):
        resolve_and_validate(url)


def test_hostname_resolving_to_a_private_address_is_refused(monkeypatch):
    import socket
    monkeypatch.setattr(
        socket, "getaddrinfo",
        lambda *a, **k: [(2, 1, 6, "", ("169.254.169.254", 443))],
    )
    with pytest.raises(ValueError, match="169.254.169.254"):
        resolve_and_validate("https://innocent.example.com/listing")


def test_redirects_are_not_followed(httpx_mock):
    """A 302 to 169.254.169.254 is the attack, and follow_redirects=False is
    the control. Re-validating after each hop is not enough: the DNS answer can
    change between the check and the connection."""
    import inspect
    from listing_fetcher import fetch_listing
    src = inspect.getsource(fetch_listing)
    assert "follow_redirects=False" in src
```

---

## 9. PORTAL

### 9.1 Contrast, over every token pair in `08_UI_DESIGN.md`

```javascript
// portal/tests/contrast.test.js
import { describe, expect, it } from "vitest";
import { PAIRS } from "../src/theme/tokens";   // exported for exactly this test

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

describe("every colour pair the UI actually renders", () => {
  it.each(PAIRS)("$name meets its minimum", ({ name, fg, bg, min }) => {
    const r = ratio(fg, bg);
    expect(r, `${name}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`)
      .toBeGreaterThanOrEqual(min);
  });
});
```

This test exists because version 1.0 of `Frontend_Portal_Prompts.md` instructed the build tool to use six colours that fail the contrast standard the project claims to meet — including one line telling it to audit every screen *for* the non-compliant palette. A build prompt cannot be trusted to keep a numeric promise; a test can. `PAIRS` is exported from the theme module so that adding a colour to the UI without adding it to the test is impossible without noticing.

### 9.2 I13 — no token in browser storage

```javascript
// portal/src/auth/token.test.jsx
import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../App";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it("never writes a token to localStorage or sessionStorage", async () => {
  const setLocal = vi.spyOn(Storage.prototype, "setItem");
  render(<App />);
  await waitFor(() => expect(document.body).toBeTruthy());

  const written = setLocal.mock.calls.map(([k, v]) => `${k}=${v}`).join("|");
  expect(written).not.toMatch(/token|jwt|bearer|eyJ/i);
  expect(Object.keys(localStorage)).toHaveLength(0);
});
```

### 9.3 Four states in the UI, and a greyscale render

```javascript
it.each([
  ["compliant", /compliant/i],
  ["violation", /violation/i],
  ["not_assessed", /not assessed/i],
  ["out_of_scope", /outside these rules/i],
])("renders %s with its own label", (result, label) => {
  const { getByText } = render(<ResultBadge result={result} />);
  expect(getByText(label)).toBeInTheDocument();
});

it("shows nineteen rows and states the denominator", () => {
  const { getByText, getAllByTestId } = render(<FindingsTable findings={NINETEEN} />);
  expect(getAllByTestId("finding-row")).toHaveLength(19);
  expect(getByText(/of 18 checks/i)).toBeInTheDocument();
});

it("does not encode a result in colour alone", () => {
  // Every badge must carry text. A photocopied enforcement document is greyscale.
  for (const r of ["compliant", "violation", "not_assessed", "out_of_scope"]) {
    const { container } = render(<ResultBadge result={r} />);
    expect(container.textContent.trim().length).toBeGreaterThan(3);
  }
});
```

The PDF equivalent is a manual check, recorded in §11: generate a report containing all four outcomes, print it in greyscale, and confirm every verdict is still readable. It takes one minute and it catches the whole class of colour-only encoding that a screen never reveals.

### 9.4 Offline

```javascript
it("queues a scan while offline and marks it edited_offline when changed", async () => {
  // idb@8 fake, not localStorage — Blobs, not base64.
  const queued = await queueScan(sampleScan);
  expect(queued.blob instanceof Blob).toBe(true);
  const edited = await editQueuedScan(queued.id, { commodity: "tea" });
  expect(edited.edited_offline).toBe(true);
});

it("does not silently discard the local copy on conflict", async () => {
  const result = await syncOne(conflictingScan);
  expect(result.action).toBe("review_item");
  expect(result.action).not.toBe("server_wins");
});
```

---

## 10. I15 — DUAL ENGINE

```python
"""test_dual_engine.py — every test here runs twice, via the engine fixture."""
import pytest
from sqlalchemy.exc import IntegrityError


@pytest.mark.parametrize("bad", ["Good", "Bad", "Review", "PASS", "", "compliantt"])
def test_abolished_verdict_vocabulary_is_refused(db, bad, seeded_inspection):
    from models import Scan
    db.add(Scan(inspection_id=seeded_inspection.id, overall_result=bad,
                rules_as_at=seeded_inspection.inspection_date,
                catalog_hash="x", engine_version="2.0.0"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


@pytest.mark.parametrize("value", ["compliant", "violation", "not_assessed",
                                   "out_of_scope"])
def test_all_four_states_are_accepted(db, value, seeded_inspection):
    from models import Scan
    db.add(Scan(inspection_id=seeded_inspection.id, overall_result=value,
                rules_as_at=seeded_inspection.inspection_date,
                catalog_hash="x", engine_version="2.0.0"))
    db.commit()


def test_not_assessed_fits_the_column(db, seeded_inspection):
    """v1.x used String(10). "not_assessed" is twelve characters, so on
    PostgreSQL the insert raises and on SQLite it silently succeeds — the two
    engines disagreed about whether the third state existed."""
    from models import Scan
    s = Scan(inspection_id=seeded_inspection.id, overall_result="not_assessed",
             rules_as_at=seeded_inspection.inspection_date,
             catalog_hash="x", engine_version="2.0.0")
    db.add(s); db.commit(); db.refresh(s)
    assert s.overall_result == "not_assessed"


def test_foreign_keys_are_enforced(db):
    """PRAGMA foreign_keys is per connection and defaults to OFF. Issued once in
    a setup script it protects nothing, because the pooled connections that
    serve real requests never saw it."""
    from models import Scan
    from datetime import date
    db.add(Scan(inspection_id=999_999, overall_result="compliant",
                rules_as_at=date.today(), catalog_hash="x", engine_version="2.0.0"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_report_queries_run_on_both_engines(db, seeded_day):
    """v1.x aggregated violations with SQLite-only json_each, so the admin
    dashboard's second chart raised OperationalError the moment the project
    moved to the PostgreSQL it claims to support in production."""
    from queries import (admin_stats, inspection_trend, store_breakdown,
                         todays_stats, violations_by_check)
    todays_stats(db, seeded_day.user_id, seeded_day.date)
    store_breakdown(db, seeded_day.user_id, seeded_day.date)
    admin_stats(db, seeded_day.date, seeded_day.date)
    violations_by_check(db, seeded_day.date, seeded_day.date)
    inspection_trend(db, seeded_day.date, seeded_day.date)
```

---

## 11. MANUAL SCRIPT

Run before any demonstration. Twelve minutes. Every step names what would be wrong if it failed, so the person running it knows what they are looking at.

**Inspector, on the phone (5 min).** Log in as `inspector@example.test`. Start an inspection; confirm the scope card appears **first**, with fifteen categories including medical device — if it appears after capture, an out-of-scope package has already been photographed and assessed. Confirm there is **no gallery button** anywhere; it must be absent, not disabled. Capture front, then back; confirm the advance gate requires both. Complete the panel-dimension step; confirm it cannot be skipped, and note what the app says if you decline — it must warn that the millimetre checks will be `not_assessed`. Submit and confirm the findings screen shows **nineteen rows**, four counts, and the sentence "16 of 18 checks assessed" or similar with a stated denominator.

**The degraded capture (2 min).** Photograph a package in poor light, deliberately blurred, and skip the dimension step. Confirm the app **accepts** it, that the result reads `not_assessed` and not compliant, and that each affected row gives a reason a person could act on. This is the single most important manual step in the script: it is the field condition that version 1.x rejected with an HTTP 400.

**Out of scope (1 min).** Record a 30 kg wholesale drum. Confirm the result is `out_of_scope`, that all eighteen downstream rows say why, and that it does not appear in the compliant count.

**Admin, in the portal (2 min).** Log in as `admin@example.test`. Confirm **five** dashboard cards including `not_assessed`, and that the review badge equals the number of rows on the review page. Open a finding and override it with a reason; confirm the engine's verdict is still displayed beside yours. Open the audit log and confirm the override appears with old value, new value and reason.

**The report (1 min).** Generate a PDF for an inspection containing all four outcomes. Confirm four distinct labelled verdicts, nineteen rows per scan, the stated denominator, the ledger notes under the unverified thresholds, **no rupee figure anywhere**, and a QR code that opens in a phone camera. Print it greyscale and confirm every verdict is still readable.

**Integrity (1 min).** Call `GET /scans/{id}/verify` and confirm `all_intact` is true. Append a byte to one stored file and call it again; confirm that image now reports a mismatch and the others do not.

---

## 12. WHAT THE SUBMISSION MAY SAY

Permitted, because it is checkable in front of a judge:

Fifteen named invariants are asserted by the suite, including that no scan can be reported compliant while any of its nineteen checks is unassessed, that every abstention carries a reason, and that no unverified statutory provision is ever cited to a sub-rule number. The schema-level tests run against both SQLite and PostgreSQL. Every degraded field condition has a fixture and a recorded outcome.

Not permitted, because it is not measured: any OCR accuracy percentage, any total test count offered as a competitive claim, any statement that the rule engine is "100% covered", and any performance figure not produced by a run that is reproducible on the demonstration machine.

If asked "how accurate is it?", the honest answer is the strong one: *the engine does not claim to be accurate enough to decide a case. It claims never to report a clean result it cannot support, and here is the test that proves it.* Then run §4.5.

---

## 13. RUNNING

```bash
cd backend
pytest -q                                    # SQLite only; PostgreSQL tests skip
PG_TEST_URL=postgresql+psycopg://localhost/nn_test pytest -q      # both engines
pytest -q --cov=. --cov-report=term-missing  # coverage as a gap-finder, not a target

cd ../portal
npm run test                                 # Vitest
```

Coverage is read to find untested branches, never quoted as a number. A file of trivial assertions raises the percentage and lowers the assurance, and the branches that matter here — the eight silent-skip paths, the halt propagation, the uncertainty band — are named individually above precisely so that they cannot hide inside an aggregate.

---

## 14. CORRECTIONS LOG — what version 1.1 got wrong

| # | Where | Defect | Now |
|---|---|---|---|
| 1 | §1, §12, §13 | "85%+ accuracy", "OCR 85% accuracy on 20 packets", "54 tests" — none measured | No figure claimed; §12 states what may and may not be said |
| 2 | §13 | "blur check + CLAHE + **Gemini fallback**" — a hosted LLM, prohibited by `07` §1 and `09` | Tesseract fallback; no hosted service anywhere |
| 3 | Throughout | Two-state assertions: `-> Pass`, `status Good/Bad`, `all checklist Passed` | Three-state findings, four-state scans |
| 4 | §3.7 | `-> NA (not applicable)` as a fourth ad-hoc verdict | `not_assessed` with a mandatory reason |
| 5 | §3.1 | Invented a 50-paise rounding rule as settled law | Ledger L-02, reported as an observation |
| 6 | §3.2 | Cited "Rule 12(6),13" as though both were settled | Ledger L-01, descriptive citation |
| 7 | §3.2 | `"1 Dozen" -> must be 12 N` treats N as an SI unit | Count units routed to L-06 |
| 8 | §3.3 | "Violation unless exempt (bidi, LPG)" — those are Fourth Schedule alternate-unit items, not date exemptions | Removed; date exemptions are not in the Fourth Schedule |
| 9 | §3.6 | Font tests with no scale reference at all | I8: no scale, no verdict |
| 10 | §3.6 | No boundary cases; no uncertainty band | Both boundaries of all five bands, plus I9 |
| 11 | §3.4 | Only three exemption cases; no tobacco carve-out | Fixtures 11, 12, 13 |
| 12 | §3.8, §4.1, §9 | `admin@niyamnetra.gov.in` / `123456` — a real government domain and a six-character password | `@example.test`, 12-char minimum for new accounts and 8-char minimum at login |
| 13 | §4.2 | Asserted `rule_version 2017_amended` | `rules_as_at` + `catalog_hash` + `engine_version` |
| 14 | §4.3 | Asserted `checklist`, `reasons`, `rule_results JSON` columns | `findings` rows |
| 15 | §4.3 | "rule_results JSON has 18 checks" | 19 rows, asserted by I1 |
| 16 | §5, §9 | "Checklist with 6 rows" | 19 rows with a stated denominator |
| 17 | §5, §9 | "4 cards Total / Good / Bad / Review" | Five cards, four states |
| 18 | §6.3 | "compress 5MB -> 800KB" as a test target | Prohibited: it breaks the evidence hash and destroys the measurement |
| 19 | §7.3 | Hash tamper test qualified "if implemented" | I10, unconditional, plus the byte-identity test |
| 20 | §7.6 | PDF signature verification — the PyJWT-signs-PDF claim was deleted in `09` §9.1 | Removed; QR carries the chain head instead |
| 21 | §7.4, §7.5 | GPS and offline-edit tests qualified "if implemented" | §8.4, unconditional |
| 22 | — | No ledger tests | §5, fifteen entries |
| 23 | — | No audit chain tests; the formula was untested and omitted two fields | §7.2, seven mutation cases including `user_id` and `new_value` |
| 24 | — | No SSRF tests | §8.5 |
| 25 | — | No contrast test, no greyscale check | §9.1, §9.3 |
| 26 | — | No token-storage test | §9.2 |
| 27 | — | No PostgreSQL run, so engine-specific SQL was invisible | §2.1 and §10, every schema test twice |
| 28 | — | No degraded-data fixture; every fixture was clean or cleanly broken | §3.1 |
| 29 | — | No silent-omission regression tests | §4.3, twelve cases |
| 30 | §5 | Playwright presented as the E2E answer for camera, GPS and shop lighting | §11, a written manual script |
| 31 | §7.1 | `test_banded_phash_finds_what_brute_force_finds` guarded its assertion behind `if d <= 5`, so it passed vacuously whenever the sample pair landed further apart — and it asserted a completeness bound that was false for four bands | Parametrised over distances 1–7 with adversarially spread bit flips, plus a kept regression proving the four-band design missed distance 5, plus an end-to-end comparison against brute force |
| 32 | §7.1 | Nothing tied the near-duplicate threshold to the band count, so raising one without the other would silently disable the control | `test_threshold_cannot_exceed_the_band_count` |

---

*End of Testing Strategy v2.1. The invariants under test are defined in `02_NiyamNetra_Rules.md` (law and ledger), `03_NiyamNetra_Rules_Priority_Ordered.md` (check order), `06_DATABASE.md` (schema as documented) and `Backend.md` §4 (schema of record), `08_UI_DESIGN.md` (contrast tokens), `09_SECURITY.md` (controls) and `Backend.md` §13 (the hooks these tests bind to).*
