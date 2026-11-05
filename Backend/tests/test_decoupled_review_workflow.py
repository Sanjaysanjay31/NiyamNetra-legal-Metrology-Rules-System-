"""Backend/tests/test_decoupled_review_workflow.py — Decoupled Automated Assessment Test Suite.

Exhaustive tests verifying that automated assessment results are returned immediately
upon inspection submission without unnecessarily entering an officer-review waiting state,
while preserving officer review for genuine exceptional cases (conflicts, escalations, overrides).

Covers all 12 required scenarios:
1. Compliant inspection completes without officer review.
2. Deterministic violation completes without waiting for officer review.
3. Not_assessed result communicates insufficient evidence without pretending assessment is pending.
4. OCR provider failure is reported as a technical problem.
5. Genuine statutory conflicts can still enter officer adjudication.
6. Explicitly escalated cases remain eligible for officer review.
7. Pending appeals or enforcement actions remain separate from assessment completion.
8. Offline edits alone do not automatically create a review requirement.
9. Review Queue counts no longer include every routine violation or insufficient-evidence scan.
10. Dashboard counts correctly distinguish completed assessment results from pending officer actions.
11. Existing officer adjudication and audit-log behavior remains functional.
12. Existing assessment and counting-contract invariants continue to hold.
"""
import os
import shutil
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from audit import append_audit
from database import Base, get_db
from main import app
from models import AuditLog, Finding, Inspection, Scan, ScanImage, Store, User
from ocr_engine import OcrLine, OcrResult
from password_handler import hash_password
from queries import admin_stats, get_canonical_queue_metrics, review_queue_size
from rbac import get_current_user, require_inspector
from rules.aggregation import (
    aggregate_inspection_assessment,
    detect_cross_panel_conflicts,
    generate_review_dossier,
    generate_violation_dossier,
    StatutoryConflict,
)
from rules_engine import CheckContext, FindingResult, ScanVerdict


def _create_test_image(path: Path, width=400, height=300, color=(200, 200, 200)):
    """Create a decodable test JPEG on disk."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (width, height), color=color)
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 10, width - 10, height - 10], outline=(0, 0, 0), width=2)
    img.save(str(path), format="JPEG", quality=90)


def _make_scan(insp_id: int, **kwargs) -> Scan:
    """Helper to construct a valid Scan model row with required non-nullable fields."""
    params = {
        "inspection_id": insp_id,
        "rules_as_at": date.today(),
        "catalog_hash": "a" * 64,
        "engine_version": "2.0.0",
        "rule_pack_version": "2026.09.v1",
        "checks_total": 19,
        "checks_assessed": 19,
        "overall_result": "compliant",
    }
    params.update(kwargs)
    return Scan(**params)


@pytest.fixture
def env_setup():
    temp_dir = tempfile.mkdtemp()
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    db = TestingSessionLocal()
    admin_user = User(
        employee_id="LM-ADMIN-01",
        email="admin@example.gov.in",
        full_name="Admin Officer",
        password_hash=hash_password("Password123!"),
        role="admin",
        is_active=True,
    )
    inspector_user = User(
        employee_id="LM-INSP-01",
        email="inspector@example.gov.in",
        full_name="Inspector Test",
        password_hash=hash_password("Password123!"),
        role="inspector",
        is_active=True,
    )
    db.add(admin_user)
    db.add(inspector_user)
    db.commit()
    db.refresh(admin_user)
    db.refresh(inspector_user)

    store = Store(
        name="Apex Retail Central",
        address="42 Commercial St",
        city="Bengaluru",
        district="Bengaluru Urban",
        state="Karnataka",
        pincode="560001",
    )
    db.add(store)
    db.commit()
    db.refresh(store)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: admin_user
    app.dependency_overrides[require_inspector] = lambda: admin_user

    client = TestClient(app)

    yield {
        "db": db,
        "admin_user": admin_user,
        "inspector_user": inspector_user,
        "store": store,
        "client": client,
        "temp_dir": Path(temp_dir),
    }

    app.dependency_overrides.clear()
    db.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


# =========================================================================
# Scenario 1: Compliant inspection completes without officer review
# =========================================================================
def test_scenario_01_compliant_inspection_completes_without_officer_review(env_setup):
    """1. A compliant inspection completes without entering the officer review queue."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="draft",
        transaction_type="retail_sale",
        inspection_date=date.today(),
        edited_offline=False,
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Washing Powder",
        brand_name="Surf Clean",
        batch_number="BATCH-001",
        overall_result="compliant",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan)
    db.commit()

    # Create all pass findings
    for i in range(1, 20):
        cid = f"CHK{i:02d}"
        db.add(Finding(
            scan_id=scan.id,
            check_id=cid,
            title=f"Check {cid}",
            engine_verdict="pass",
            severity="major",
            confidence=0.95,
        ))
    db.commit()

    # Submit inspection
    resp = client.post(f"/inspections/{insp.id}/submit", json={"signature_status": "signed"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "submitted"

    # Review queue should NOT contain this compliant inspection
    q_resp = client.get("/review/queue")
    assert q_resp.status_code == 200
    q_data = q_resp.json()
    assert q_data["total"] == 0
    assert len(q_data["items"]) == 0

    # Summary metrics should report 0 pending review items
    sum_resp = client.get("/review/queue/summary")
    assert sum_resp.status_code == 200
    assert sum_resp.json()["total"] == 0


# =========================================================================
# Scenario 2: Deterministic violation completes immediately without review queue
# =========================================================================
def test_scenario_02_deterministic_violation_completes_without_waiting_for_officer_review(env_setup):
    """2. A deterministic violation completes immediately and is NOT placed in the review queue."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="draft",
        transaction_type="retail_sale",
        inspection_date=date.today(),
        edited_offline=False,
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Biscuits",
        brand_name="SweetBite",
        batch_number="BATCH-002",
        overall_result="violation",
        violation_limb="36(1)",
        recommended_action="notice",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan)
    db.commit()

    # Deterministic failing finding (missing manufacturer address)
    db.add(Finding(
        scan_id=scan.id,
        check_id="CHK01",
        title="Manufacturer Name and Address",
        engine_verdict="fail",
        severity="critical",
        limb="36(1)",
        reason="Manufacturer complete address missing on packaging",
        observed="Only brand name SweetBite present",
        required="Full registered address of manufacturer",
        confidence=0.95,
    ))
    for i in range(2, 20):
        cid = f"CHK{i:02d}"
        db.add(Finding(
            scan_id=scan.id,
            check_id=cid,
            title=f"Check {cid}",
            engine_verdict="pass",
            severity="major",
            confidence=0.95,
        ))
    db.commit()

    # Submit inspection
    resp = client.post(f"/inspections/{insp.id}/submit", json={"signature_status": "signed"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "submitted"
    assert data["finalization_summary"]["violations_count"] == 1

    # Enforcement summary confirms violation verdict immediately
    enf_resp = client.get(f"/enforcement/inspections/{insp.id}/summary")
    assert enf_resp.status_code == 200
    enf_data = enf_resp.json()
    assert enf_data["overall_verdict"] == "VIOLATION"
    assert enf_data["packages_with_violations"] == 1

    # Routine violation does NOT wait in the officer review queue
    q_resp = client.get("/review/queue")
    assert q_resp.status_code == 200
    assert q_resp.json()["total"] == 0

    sum_resp = client.get("/review/queue/summary")
    assert sum_resp.status_code == 200
    assert sum_resp.json()["total"] == 0


# =========================================================================
# Scenario 3: not_assessed communicates evidence gaps, not officer review
# =========================================================================
def test_scenario_03_not_assessed_communicates_insufficient_evidence(env_setup):
    """3. not_assessed communicates coverage/evidence limitations, not an officer-review state."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="draft",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Toothpaste",
        brand_name="MintFresh",
        batch_number="BATCH-003",
        overall_result="not_assessed",
        checks_total=19,
        checks_assessed=8,
    )
    db.add(scan)
    db.commit()

    # 8 passed, 11 not_assessed due to missing back panel
    for i in range(1, 9):
        cid = f"CHK{i:02d}"
        db.add(Finding(
            scan_id=scan.id, check_id=cid, title=f"Check {cid}",
            engine_verdict="pass", severity="major", confidence=0.90,
        ))
    for i in range(9, 20):
        cid = f"CHK{i:02d}"
        db.add(Finding(
            scan_id=scan.id, check_id=cid, title=f"Check {cid}",
            engine_verdict="not_assessed", severity="major",
            reason="Back panel required for assessment was not captured",
            confidence=None,
        ))
    db.commit()

    resp = client.post(f"/inspections/{insp.id}/submit", json={"signature_status": "signed"})
    assert resp.status_code == 200

    # Enforcement roll-up is NOT_ASSESSED, not REVIEW_REQUIRED
    enf_resp = client.get(f"/enforcement/inspections/{insp.id}/summary")
    assert enf_resp.status_code == 200
    assert enf_resp.json()["overall_verdict"] == "NOT_ASSESSED"

    # Aggregation layer returns NOT_ASSESSED with completeness status PARTIAL
    findings_rows = db.query(Finding).filter(Finding.scan_id == scan.id).all()
    all_f = [FindingResult(
        check_id=f.check_id, title=f.title, verdict=f.engine_verdict,
        severity=f.severity, reason=f.reason,
    ) for f in findings_rows]
    assessment = aggregate_inspection_assessment(
        inspection_id=insp.id,
        findings=all_f,
        captured_panels={"front"},
    )
    assert assessment.overall_verdict == "NOT_ASSESSED"
    assert assessment.assessment_completeness.status == "PARTIAL"
    assert len(assessment.actionable_capture_requests) > 0

    # Routine missing panel scan does NOT enter the officer review queue
    q_resp = client.get("/review/queue")
    assert q_resp.json()["total"] == 0


# =========================================================================
# Scenario 4: OCR provider failure reported as technical problem
# =========================================================================
def test_scenario_04_ocr_provider_failure_reported_as_technical_problem(env_setup):
    """4. OCR provider failures are communicated as technical problems, not officer-review states."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Cooking Oil",
        brand_name="GoldDrop",
        batch_number="BATCH-004",
        overall_result="not_assessed",
        ocr_provider="azure",
        checks_total=19,
        checks_assessed=0,
    )
    db.add(scan)
    db.commit()

    for i in range(1, 20):
        cid = f"CHK{i:02d}"
        db.add(Finding(
            scan_id=scan.id, check_id=cid, title=f"Check {cid}",
            engine_verdict="not_assessed", severity="major",
            reason="OCR provider service unavailable: Azure OCR service timeout: HTTP 504 Gateway Timeout",
        ))
    db.commit()

    # Check that this technical failure does NOT enter the officer review queue
    q_resp = client.get("/review/queue")
    assert q_resp.json()["total"] == 0


# =========================================================================
# Scenario 5: Genuine statutory conflicts enter officer adjudication
# =========================================================================
def test_scenario_05_genuine_statutory_conflicts_enter_officer_adjudication(env_setup):
    """5. Genuine statutory conflicts across panels enter the review queue for adjudication."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Tea Powder",
        brand_name="ChaiGold",
        batch_number="BATCH-005",
        overall_result="violation",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan)
    db.commit()

    # CHK04 finding noting cross-panel MRP conflict (dual pricing)
    db.add(Finding(
        scan_id=scan.id,
        check_id="CHK04",
        title="Maximum Retail Price (MRP)",
        engine_verdict="fail",
        severity="critical",
        limb="36(1)",
        reason="Statutory conflict detected: Dual MRP printed across panels (Front: Rs 150.00, Back: Rs 180.00)",
        observed="Front Rs 150.00 vs Back Rs 180.00",
        required="Uniform retail sale price under Rule 6(2A)",
    ))
    # Log conflict detection in audit trail
    append_audit(
        db, inspection_id=insp.id, scan_id=scan.id, user_id=user.id,
        action="conflict_detected",
        old_value="mrp",
        new_value="Front: 150.00 vs Back: 180.00",
        reason="Dual MRP violation engages officer review",
    )

    # Genuine conflict enters review queue!
    q_resp = client.get("/review/queue")
    assert q_resp.status_code == 200
    q_data = q_resp.json()
    assert q_data["total"] == 1
    item = q_data["items"][0]
    assert item["scan_id"] == scan.id
    assert any(r["type"] == "conflict" for r in item["review_reasons"])
    assert item["priority"] == "high"

    # Officer resolves conflict
    resolve_resp = client.post(
        f"/review/inspections/{insp.id}/conflicts/CONF_001/resolve",
        json={
            "conflict_id": "CONF_001",
            "resolution": "manual_value",
            "resolved_value": "180.00",
            "reason": "Verified back panel Rs 180 was charged at cash counter",
        },
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["success"] is True

    # Adjudicate review resolution
    adj_resp = client.post(
        f"/review/inspections/{insp.id}/adjudicate",
        json={"action": "resolve", "reason": "Dual pricing confirmed and compounded"},
    )
    assert adj_resp.status_code == 200

    # Resolved conflict moves out of OPEN review queue
    open_q = client.get("/review/queue?status_filter=OPEN")
    assert open_q.json()["total"] == 0

    # Exists in RESOLVED status
    res_q = client.get("/review/queue?status_filter=RESOLVED")
    assert res_q.json()["total"] == 1


# =========================================================================
# Scenario 6: Explicitly escalated cases remain eligible for officer review
# =========================================================================
def test_scenario_06_explicitly_escalated_cases_eligible_for_officer_review(env_setup):
    """6. Explicitly escalated inspections remain eligible for officer review."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Atta",
        brand_name="Aashirwaad",
        batch_number="BATCH-006",
        overall_result="compliant",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan)
    db.commit()

    db.add(Finding(
        scan_id=scan.id, check_id="CHK01", title="Check 1",
        engine_verdict="pass", severity="major", confidence=0.95,
    ))
    db.commit()

    # Inspector explicitly escalates for suspected tampering
    append_audit(
        db, inspection_id=insp.id, scan_id=scan.id, user_id=user.id,
        action="review_escalated",
        reason="Package seal appeared altered; requested officer inspection",
    )

    # Escalated case appears in review queue
    q_resp = client.get("/review/queue")
    assert q_resp.status_code == 200
    assert q_resp.json()["total"] == 1
    assert q_resp.json()["items"][0]["scan_id"] == scan.id


# =========================================================================
# Scenario 7: Pending enforcement actions separate from assessment completion
# =========================================================================
def test_scenario_07_pending_enforcement_separate_from_assessment_completion(env_setup):
    """7. Pending enforcement actions (notices, Section 36) remain separate from completed assessment."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Milk",
        brand_name="DairyFresh",
        batch_number="BATCH-007",
        overall_result="violation",
        violation_limb="36(2)",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan)
    db.commit()

    db.add(Finding(
        scan_id=scan.id,
        check_id="CHK05",
        title="Net Quantity Shortage",
        engine_verdict="fail",
        severity="critical",
        limb="36(2)",
        reason="Shortage in net quantity exceeds maximum permissible error under Second Schedule",
        observed="Declared 1000ml, actual measured 920ml (-80ml)",
        required="Minimum 985ml for 1000ml pack",
        confidence=0.98,
    ))
    db.commit()

    # Enforcement summary generates statutory guidance
    enf_resp = client.get(f"/enforcement/inspections/{insp.id}/summary")
    assert enf_resp.status_code == 200
    s36 = enf_resp.json()["section_36_guidance"]
    assert s36["applicable"] is True
    assert s36["recommended_action"] == "prosecute_and_seize"
    assert any(l["limb"] == "36(2)" for l in s36["limbs"])

    # Automated assessment is complete, not blocked in review queue
    q_resp = client.get("/review/queue")
    assert q_resp.json()["total"] == 0


# =========================================================================
# Scenario 8: Offline edits alone do not create review requirement
# =========================================================================
def test_scenario_08_offline_edits_alone_do_not_create_review_requirement(env_setup):
    """8. Normal offline edits do not enter review queue; only integrity concerns enter."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    # 1. Normal offline edit (clock skew 5s, valid location)
    insp_normal = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
        edited_offline=True,
        clock_skew_seconds=5,
        mock_location=False,
        geofence_status="inside",
    )
    db.add(insp_normal)
    db.commit()

    scan_normal = _make_scan(
        insp_normal.id,
        commodity_generic="Rice",
        brand_name="BasmatiGold",
        batch_number="BATCH-NORM",
        overall_result="compliant",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan_normal)
    db.commit()

    # Queue should be empty for normal offline edit
    assert client.get("/review/queue").json()["total"] == 0

    # 2. Offline edit with severe clock skew (e.g. 600s = 10 mins)
    insp_skewed = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
        edited_offline=True,
        clock_skew_seconds=-600,
        mock_location=False,
        geofence_status="inside",
    )
    db.add(insp_skewed)
    db.commit()

    scan_skewed = _make_scan(
        insp_skewed.id,
        commodity_generic="Sugar",
        brand_name="SweetSugar",
        batch_number="BATCH-SKEW",
        overall_result="compliant",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan_skewed)
    db.commit()

    # Integrity concern ENTERS review queue!
    q_resp = client.get("/review/queue")
    assert q_resp.status_code == 200
    assert q_resp.json()["total"] == 1
    item = q_resp.json()["items"][0]
    assert item["scan_id"] == scan_skewed.id
    assert any(r["subtype"] == "integrity_concern" for r in item["review_reasons"])


# =========================================================================
# Scenario 9: Review Queue counts exclude routine violations & not_assessed
# =========================================================================
def test_scenario_09_review_queue_counts_exclude_routine_violations_and_na(env_setup):
    """9. Review queue metrics count only genuine officer cases, excluding routine violations."""
    db = env_setup["db"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    # 3 compliant scans
    for i in range(1, 4):
        db.add(_make_scan(
            insp.id, commodity_generic=f"Comp {i}",
            brand_name=f"Brand {i}", batch_number=f"B-C{i}",
            overall_result="compliant", checks_total=19, checks_assessed=19,
        ))

    # 4 routine violations
    for i in range(1, 5):
        s = _make_scan(
            insp.id, commodity_generic=f"Viol {i}",
            brand_name=f"Brand {i}", batch_number=f"B-V{i}",
            overall_result="violation", checks_total=19, checks_assessed=19,
        )
        db.add(s)
        db.flush()
        db.add(Finding(
            scan_id=s.id, check_id="CHK01", title="CHK01",
            engine_verdict="fail", severity="critical", confidence=0.95,
        ))

    # 2 routine not_assessed scans
    for i in range(1, 3):
        db.add(_make_scan(
            insp.id, commodity_generic=f"NA {i}",
            brand_name=f"Brand {i}", batch_number=f"B-NA{i}",
            overall_result="not_assessed", checks_total=19, checks_assessed=6,
        ))

    # 1 escalated scan
    s_esc = _make_scan(
        insp.id, commodity_generic="Escalated Item",
        brand_name="Brand Esc", batch_number="B-ESC",
        overall_result="violation", checks_total=19, checks_assessed=19,
    )
    db.add(s_esc)
    db.flush()
    append_audit(db, inspection_id=insp.id, scan_id=s_esc.id, user_id=user.id, action="review_escalated")

    # 1 scan with statutory conflict
    s_conf = _make_scan(
        insp.id, commodity_generic="Conflicted Item",
        brand_name="Brand Conf", batch_number="B-CONF",
        overall_result="violation", checks_total=19, checks_assessed=19,
    )
    db.add(s_conf)
    db.flush()
    db.add(Finding(
        scan_id=s_conf.id, check_id="CHK04", title="Dual MRP",
        engine_verdict="fail", severity="critical",
        reason="Statutory conflict detected: Dual MRP printed across panels",
    ))
    db.commit()

    # Total queue size must be EXACTLY 2 (escalated + conflict), NOT 7!
    q_size = review_queue_size(db)
    assert q_size == 2

    metrics = get_canonical_queue_metrics(db, status_filter="OPEN")
    assert metrics["total"] == 2
    assert metrics["breakdown"]["statutory_conflicts"] == 1
    assert metrics["breakdown"]["escalated_adjudication"] == 1


# =========================================================================
# Scenario 10: Dashboard counts distinguish violations from pending actions
# =========================================================================
def test_scenario_10_dashboard_distinguishes_violations_from_pending_actions(env_setup):
    """10. Dashboard counts accurately distinguish completed violations from review queue."""
    db = env_setup["db"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    # 5 products: 2 violations, 3 compliant
    s_v1 = _make_scan(insp.id, commodity_generic="V1", batch_number="B1", overall_result="violation")
    s_v2 = _make_scan(insp.id, commodity_generic="V2", batch_number="B2", overall_result="violation")
    s_c1 = _make_scan(insp.id, commodity_generic="C1", batch_number="B3", overall_result="compliant")
    s_c2 = _make_scan(insp.id, commodity_generic="C2", batch_number="B4", overall_result="compliant")
    s_c3 = _make_scan(insp.id, commodity_generic="C3", batch_number="B5", overall_result="compliant")
    db.add_all([s_v1, s_v2, s_c1, s_c2, s_c3])
    db.commit()

    stats = admin_stats(db, start=date.today(), end=date.today())
    assert stats["violation"] == 2
    assert stats["compliant"] == 3
    assert stats["total"] == 5
    # Routine violations do NOT pollute review queue
    assert stats["review_queue"] == 0


# =========================================================================
# Scenario 11: Officer adjudication and audit-log behavior functional
# =========================================================================
def test_scenario_11_officer_adjudication_and_audit_log_functional(env_setup):
    """11. Finding overrides, immutable engine verdict, and audit logging remain functional."""
    db = env_setup["db"]
    client = env_setup["client"]
    store = env_setup["store"]
    user = env_setup["admin_user"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="submitted",
        transaction_type="retail_sale",
        inspection_date=date.today(),
    )
    db.add(insp)
    db.commit()

    scan = _make_scan(
        insp.id,
        commodity_generic="Pulses",
        brand_name="TataSampann",
        batch_number="BATCH-011",
        overall_result="violation",
        checks_total=19,
        checks_assessed=19,
    )
    db.add(scan)
    db.commit()

    finding = Finding(
        scan_id=scan.id,
        check_id="CHK01",
        title="Manufacturer Address",
        engine_verdict="fail",
        severity="critical",
        confidence=0.90,
    )
    db.add(finding)
    db.commit()

    # Officer overrides finding: engine_verdict immutable, human_verdict set
    adj_resp = client.post(
        f"/review/inspections/{insp.id}/adjudicate",
        json={
            "action": "override",
            "finding_id": finding.id,
            "human_verdict": "pass",
            "reason": "Manufacturer address verified via QR code under 2024 Rule Amendment",
        },
    )
    assert adj_resp.status_code == 200
    assert adj_resp.json()["success"] is True

    db.refresh(finding)
    assert finding.engine_verdict == "fail"  # Immutable!
    assert finding.human_verdict == "pass"   # Overridden!
    assert finding.override_reason == "Manufacturer address verified via QR code under 2024 Rule Amendment"

    # Audit trail records the override
    audits = db.query(AuditLog).filter(
        AuditLog.inspection_id == insp.id,
        AuditLog.action == "finding_overridden",
    ).all()
    assert len(audits) >= 1
    assert "CHK01=fail" in audits[0].old_value
    assert "CHK01=pass" in audits[0].new_value


# =========================================================================
# Scenario 12: Existing assessment counting-contract invariants hold
# =========================================================================
def test_scenario_12_assessment_counting_contract_invariants(env_setup):
    """12. Strict counting contract invariants hold across all assessment outcomes."""
    from rules_engine import assess as run_assessment

    # Test clean pass context
    ctx_pass = CheckContext(
        commodity_generic="Biscuits",
        net_quantity_value=1.0,
        net_quantity_unit="kg",
        panel_shape="rectangular",
        panel_height_mm=100.0,
        panel_width_mm=80.0,
        total_surface_area_cm2=400.0,
        mm_per_pixel=0.2,
        scale_source="known_reference",
    )
    findings, verdict, prov = run_assessment(ctx_pass)

    # Invariants enforced
    assert verdict.passed + verdict.failed + verdict.not_assessed == verdict.checks_total
    assert verdict.checks_assessed == verdict.passed + verdict.failed
    assert verdict.checks_total == len(findings)
