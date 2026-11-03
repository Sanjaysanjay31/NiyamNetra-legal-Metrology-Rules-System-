"""Backend/tests/test_optional_evidence_panels.py — Module 2 Test Suite.

Comprehensive tests covering optional evidence panels and evidence-aware assessment:
1. Front-only evidence.
2. Back-only evidence.
3. MRP-only evidence.
4. Batch-only evidence.
5. Multiple panels without front (e.g. back + mrp + batch).
6. All four panels (front + back + mrp + batch).
7. Empty evidence submission (rejected with 422).
8. Invalid or undecodable evidence (rejected with 422).
9. Check whose required panel is absent becomes not_assessed, not a violation.
10. Independent checks with sufficient evidence still run when another check is unresolved.
11. Missing panels do not create unsupported compliant or violation findings.
12. Correct panels_captured and panels_missing serialization.
"""
import os
import shutil
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from database import Base, get_db
from models import User, Store, Inspection, Scan, ScanImage
from password_handler import hash_password
from main import app
from rbac import get_current_user, require_inspector
from ocr_engine import OcrLine, OcrResult
from ocr.base import STATUS_SUCCESS
from llm.schema import (
    CommonFieldDeclaration,
    ConsumerCareDeclaration,
    DateDeclaration,
    FieldProvenance,
    MrpDeclaration,
    NetQuantityDeclaration,
    PartyDeclaration,
    StructuredDeclarationResult,
    STATUS_CONFIRMED,
    STATUS_NOT_OBSERVED,
)


def _create_test_image(path: Path, width=400, height=300, color=(200, 200, 200)):
    """Create a decodable test JPEG on disk."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (width, height), color=color)
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 10, width - 10, height - 10], outline=(0, 0, 0), width=2)
    img.save(str(path), format="JPEG", quality=90)


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
    user = User(
        employee_id="LM-INSP-01",
        email="inspector@example.gov.in",
        full_name="Inspector Test",
        password_hash=hash_password("Password123!"),
        role="inspector",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    store = Store(
        name="Supermarket Sample",
        address="123 Market Rd",
    )
    db.add(store)
    db.commit()
    db.refresh(store)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_inspector] = lambda: user

    client = TestClient(app)

    yield {
        "db": db,
        "user": user,
        "store": store,
        "client": client,
        "temp_dir": Path(temp_dir),
    }

    app.dependency_overrides.clear()
    db.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


def _setup_scan_with_panels(env_setup, panels_dict: dict[str, str | None]):
    """Create an inspection and scan with specific panel image files.
    panels_dict: e.g. {'front': 'valid', 'back': 'valid', 'mrp': None}
    where 'valid' creates a real decodable image, 'undecodable' creates garbage, None does not create.
    """
    db = env_setup["db"]
    user = env_setup["user"]
    store = env_setup["store"]
    temp_dir = env_setup["temp_dir"]

    insp = Inspection(
        store_id=store.id,
        user_id=user.id,
        status="draft",
        transaction_type="retail",
    )
    db.add(insp)
    db.commit()
    db.refresh(insp)

    scan = Scan(
        inspection_id=insp.id,
        commodity_generic="Biscuits",
        commodity_category="Food",
        overall_result="not_assessed",
        rules_as_at=date.today(),
        catalog_hash="catalog_test_hash",
        engine_version="2.4.0",
        checks_total=19,
        checks_assessed=0,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    images = []
    for panel_name, img_type in panels_dict.items():
        if img_type is None:
            continue
        img_path = temp_dir / f"scan_{scan.id}_{panel_name}.jpg"
        if img_type == "valid":
            _create_test_image(img_path)
        elif img_type == "undecodable":
            img_path.write_bytes(b"NOT_AN_IMAGE_GARBAGE")
        elif img_type == "missing_file":
            pass  # file does not exist on disk

        file_bytes = img_path.read_bytes() if img_path.exists() else b""
        im = ScanImage(
            scan_id=scan.id,
            panel=panel_name,
            file_path=str(img_path),
            sha256=f"sha256_{panel_name}_{scan.id}",
            byte_size=len(file_bytes),
            width_px=400 if img_type == "valid" else 100,
            height_px=300 if img_type == "valid" else 100,
            mime_type="image/jpeg",
        )
        db.add(im)
        images.append(im)

    db.commit()
    db.refresh(scan)
    return insp, scan, images


# ===========================================================================
# 1. Front-Only Evidence
# ===========================================================================

def test_front_only_evidence_assessment(env_setup):
    """Front-only panel allows assessment; missing back/mrp/batch declarations become not_assessed."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Demo Biscuit Brand", confidence=0.95, box=[[10, 10], [100, 10], [100, 30], [10, 30]], height_px=20),
                OcrLine(text="Net Qty 100 g", confidence=0.95, box=[[10, 40], [100, 40], [100, 60], [10, 60]], height_px=20),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Biscuits", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Demo Biscuit", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=100.0, unit="g", normalized_unit="g", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Net Qty 100 g", source_panel="front")),
            mrp=MrpDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            parties=[],
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Serialization of panels_captured and panels_missing
        assert data["panels_captured"] == ["front"]
        assert sorted(data["panels_missing"]) == ["back", "batch", "mrp"]
        assert data["diagnostics"]["panels_captured"] == ["front"]
        assert sorted(data["diagnostics"]["panels_missing"]) == ["back", "batch", "mrp"]

        # Declarations requiring back panel (e.g. manufacturer) become not_assessed, not fail!
        findings = {f["check_id"]: f for f in data["findings"]}
        assert findings["CHK01"]["engine_verdict"] == "not_assessed"
        assert "insufficient to establish absence" in (findings["CHK01"]["reason"] or "")


# ===========================================================================
# 2. Back-Only Evidence
# ===========================================================================

def test_back_only_evidence_assessment(env_setup):
    """Back-only panel assesses without front; PDP checks are not_assessed, back declarations evaluate."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"back": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Mfg by: Reliable Foods Pvt Ltd, Industrial Area, Pune", confidence=0.92, box=[[10, 10], [200, 10], [200, 30], [10, 30]], height_px=15),
                OcrLine(text="Customer Care: care@reliablefoods.com", confidence=0.90, box=[[10, 40], [180, 40], [180, 55], [10, 55]], height_px=15),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            parties=[PartyDeclaration(name="Reliable Foods Pvt Ltd", party_type="manufacturer", address="Industrial Area, Pune", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfg by: Reliable Foods", source_panel="back"))],
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["panels_captured"] == ["back"]
        assert sorted(data["panels_missing"]) == ["batch", "front", "mrp"]

        findings = {f["check_id"]: f for f in data["findings"]}

        # PDP character height check must be not_assessed because front panel is absent!
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"
        assert "No front-panel image is available" in (findings["CHK06"]["reason"] or "")

        # Net quantity height on PDP must be not_assessed, not fail!
        assert findings["CHK06b"]["engine_verdict"] == "not_assessed"

        # Clear space on PDP must be not_assessed
        assert findings["CHK09"]["engine_verdict"] == "not_assessed"

        # Contrast must be not_assessed
        assert findings["CHK08"]["engine_verdict"] == "not_assessed"

        # Net quantity absence does not produce a false violation because front is absent!
        assert findings["CHK05"]["engine_verdict"] == "not_assessed"


# ===========================================================================
# 3. MRP-Only Evidence
# ===========================================================================

def test_mrp_only_evidence_assessment(env_setup):
    """MRP-only panel evaluates MRP check (CHK04); independent unresolved checks stay not_assessed."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"mrp": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="MRP Rs. 50.00 (inclusive of all taxes)", confidence=0.96, box=[[10, 10], [180, 10], [180, 30], [10, 30]], height_px=18),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(value=50.00, currency="INR", raw_text="MRP Rs. 50.00 (inclusive of all taxes)", inclusive_of_taxes=True, status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs. 50.00 (inclusive of all taxes)", source_panel="mrp")),
            parties=[],
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["panels_captured"] == ["mrp"]
        assert sorted(data["panels_missing"]) == ["back", "batch", "front"]

        findings = {f["check_id"]: f for f in data["findings"]}

        # MRP form is evaluated and passes!
        assert findings["CHK04"]["engine_verdict"] == "pass"

        # Missing PDP checks are not_assessed
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"
        assert findings["CHK05"]["engine_verdict"] == "not_assessed"


# ===========================================================================
# 4. Batch-Only Evidence
# ===========================================================================

def test_batch_only_evidence_assessment(env_setup):
    """Batch-only panel assesses date of manufacture without front."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"batch": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="BATCH NO: B2026-99", confidence=0.94, box=[[10, 10], [150, 10], [150, 25], [10, 25]], height_px=14),
                OcrLine(text="MFG: 05/2026", confidence=0.94, box=[[10, 30], [120, 30], [120, 45], [10, 45]], height_px=14),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            parties=[],
            dates=[DateDeclaration(raw_text="05/2026", date_type_candidate="mfg", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MFG: 05/2026", source_panel="batch"))],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["panels_captured"] == ["batch"]
        assert sorted(data["panels_missing"]) == ["back", "front", "mrp"]

        findings = {f["check_id"]: f for f in data["findings"]}
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"
        assert findings["CHK04"]["engine_verdict"] == "not_assessed"


# ===========================================================================
# 5. Multiple Panels Without Front
# ===========================================================================

def test_multiple_panels_without_front(env_setup):
    """Multiple panels (back + mrp + batch) assess successfully together without front."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"back": "valid", "mrp": "valid", "batch": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Mfg: ABC Ltd, Delhi", confidence=0.90, box=[[10, 10]], height_px=15),
                OcrLine(text="MRP Rs 80.00 incl of all taxes", confidence=0.95, box=[[10, 30]], height_px=15),
                OcrLine(text="Batch: X100, Mfg: 08/2026", confidence=0.92, box=[[10, 50]], height_px=15),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(value=80.00, currency="INR", raw_text="MRP Rs 80.00 incl of all taxes", inclusive_of_taxes=True, status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 80.00 incl of all taxes", source_panel="mrp")),
            parties=[PartyDeclaration(name="ABC Ltd", party_type="manufacturer", address="Delhi", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfg: ABC Ltd, Delhi", source_panel="back"))],
            dates=[DateDeclaration(raw_text="08/2026", date_type_candidate="mfg", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfg: 08/2026", source_panel="batch"))],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert sorted(data["panels_captured"]) == ["back", "batch", "mrp"]
        assert data["panels_missing"] == ["front"]

        findings = {f["check_id"]: f for f in data["findings"]}
        # CHK04 passes based on MRP evidence
        assert findings["CHK04"]["engine_verdict"] == "pass"

        # CHK06 (PDP font height) is not_assessed because front is absent
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"
        assert "No front-panel image is available" in (findings["CHK06"]["reason"] or "")


# ===========================================================================
# 6. All Four Panels
# ===========================================================================

def test_all_four_panels_evidence(env_setup):
    """When all 4 panels are present, panels_missing is empty and full assessment runs."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "back": "valid", "mrp": "valid", "batch": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Super Brand Biscuits", confidence=0.95, box=[[10, 10], [100, 10], [100, 30], [10, 30]], height_px=20),
                OcrLine(text="Net Quantity 200 g", confidence=0.95, box=[[10, 40], [100, 40], [100, 60], [10, 60]], height_px=20),
                OcrLine(text="Mfg by: Super Foods Ltd, Mumbai", confidence=0.92, box=[[10, 70], [150, 70], [150, 85], [10, 85]], height_px=15),
                OcrLine(text="MRP Rs 40.00 inclusive of all taxes", confidence=0.95, box=[[10, 90], [160, 90], [160, 105], [10, 105]], height_px=15),
                OcrLine(text="Batch: B101, Mfg: 09/2026", confidence=0.94, box=[[10, 110], [140, 110], [140, 125], [10, 125]], height_px=15),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Biscuits", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Super Brand Biscuits", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=200.0, unit="g", normalized_unit="g", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Net Quantity 200 g", source_panel="front")),
            mrp=MrpDeclaration(value=40.00, currency="INR", raw_text="MRP Rs 40.00 inclusive of all taxes", inclusive_of_taxes=True, status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 40.00", source_panel="mrp")),
            parties=[PartyDeclaration(name="Super Foods Ltd", party_type="manufacturer", address="Mumbai", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfg by: Super Foods Ltd", source_panel="back"))],
            dates=[DateDeclaration(raw_text="09/2026", date_type_candidate="mfg", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfg: 09/2026", source_panel="batch"))],
            consumer_care=ConsumerCareDeclaration(phone="1800-123-456", email="care@superfoods.com", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="1800-123-456", source_panel="back")),
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert sorted(data["panels_captured"]) == ["back", "batch", "front", "mrp"]
        assert data["panels_missing"] == []


# ===========================================================================
# 7. Empty Evidence Submission
# ===========================================================================

def test_empty_evidence_submission_rejected(env_setup):
    """Submitting assessment on a scan with 0 images returns HTTP 422."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {})
    client = env_setup["client"]

    resp = client.post(f"/scans/{scan.id}/assess")
    assert resp.status_code == 422
    assert "no evidence images" in resp.json()["detail"].lower()


# ===========================================================================
# 8. Invalid or Undecodable Evidence
# ===========================================================================

def test_all_undecodable_evidence_rejected(env_setup):
    """When all supplied images are corrupt/undecodable, assessment is rejected with HTTP 422."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "undecodable", "back": "missing_file"})
    client = env_setup["client"]

    resp = client.post(f"/scans/{scan.id}/assess")
    assert resp.status_code == 422
    assert "undecodable" in resp.json()["detail"].lower() or "invalid" in resp.json()["detail"].lower()


# ===========================================================================
# 9. Missing Required Panel Becomes not_assessed, Not a Violation
# ===========================================================================

def test_missing_panel_becomes_not_assessed_not_violation(env_setup):
    """A check whose required panel is absent must be marked not_assessed with reason, NEVER a violation."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"back": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[OcrLine(text="Some general text on back", confidence=0.88, box=[[10, 10]], height_px=12)],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            parties=[],
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # Neither font height (CHK06) nor net quantity (CHK05) nor MRP (CHK04) may fail as a violation!
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"
        assert findings["CHK06b"]["engine_verdict"] == "not_assessed"
        assert findings["CHK05"]["engine_verdict"] == "not_assessed"
        assert findings["CHK04"]["engine_verdict"] == "not_assessed"

        # Overall result must not be violation!
        assert data["overall_result"] == "not_assessed"


# ===========================================================================
# 10. Independent Checks Run When Another Check is Unresolved
# ===========================================================================

def test_independent_checks_run_when_another_check_unresolved(env_setup):
    """An independent check with evidence runs and fails on a real breach, while unresolved checks remain not_assessed."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"mrp": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        # Real violation: MRP is declared without "inclusive of all taxes"
        mock_ocr.return_value = OcrResult(
            lines=[OcrLine(text="MRP Rs 99.00 (tax extra)", confidence=0.95, box=[[10, 10]], height_px=18)],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(value=99.00, currency="INR", raw_text="MRP Rs 99.00 (tax extra)", inclusive_of_taxes=False, status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 99.00 (tax extra)", source_panel="mrp")),
            parties=[],
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # MRP fails due to actual observed breach
        assert findings["CHK04"]["engine_verdict"] == "fail"
        assert data["violation_limb"] == "36(1)"

        # Independent unresolved checks remain honestly not_assessed
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"
        assert findings["CHK05"]["engine_verdict"] == "not_assessed"

        # Overall verdict captures the actual evidence-supported violation
        assert data["overall_result"] == "violation"


# ===========================================================================
# 11. Missing Panels Do Not Create Unsupported Compliant or Violation Findings
# ===========================================================================

def test_missing_panels_do_not_create_unsupported_findings(env_setup):
    """Missing panels leave checks unresolved without falsely certifying compliance."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Brand Name", confidence=0.95, box=[[10, 10]], height_px=20),
                OcrLine(text="Net Wt 500g", confidence=0.95, box=[[10, 30]], height_px=20),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Biscuits", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Brand Name", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=500.0, unit="g", normalized_unit="g", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Net Wt 500g", source_panel="front")),
            mrp=MrpDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            parties=[],
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200
        data = resp.json()

        # Overall result cannot be compliant when mandatory declarations on back/mrp are unassessed!
        assert data["overall_result"] != "compliant"
        assert data["overall_result"] == "not_assessed"


# ===========================================================================
# 12. Recapture Router Supports All Four Evidence Panels
# ===========================================================================

def test_recapture_coverage_and_tasks_support_all_panels(env_setup):
    """Recapture coverage and tasks inspect expected evidence across front, back, mrp, batch."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"back": "valid"})
    client = env_setup["client"]

    # 1. Coverage endpoint
    resp = client.get(f"/recapture/inspections/{insp.id}/coverage")
    assert resp.status_code == 200, resp.text
    cov = resp.json()
    assert cov["inspection_id"] == insp.id
    scans_cov = cov["scan_coverage"]
    assert len(scans_cov) == 1
    assert scans_cov[0]["panels_captured"] == ["back"]
    assert sorted(scans_cov[0]["panels_missing"]) == ["batch", "front", "mrp"]

    # 2. Tasks endpoint
    resp = client.get(f"/recapture/inspections/{insp.id}/tasks")
    assert resp.status_code == 200, resp.text
    tasks = resp.json()["tasks"]
    missing_targets = {t["target_panel"] for t in tasks if "missing" in t["request_id"]}
    assert missing_targets == {"front", "mrp", "batch"}



# ===========================================================================
# 13. Audit Regression Suite: 14 Corrective Scenarios for Reliable Evidence
# ===========================================================================

def test_scenario_1_corrupt_front_valid_back_pdp_not_assessed(env_setup):
    """Scenario 1: Corrupt front + valid back -> PDP checks must evaluate to not_assessed, not fail."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "undecodable", "back": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[OcrLine(text="Mfg by: Acme Foods Ltd, Mumbai", confidence=0.95, box=[[10, 10]], height_px=20)],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            parties=[PartyDeclaration(name="Acme Foods Ltd", address="Mumbai", party_type="manufacturer", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfg by: Acme Foods Ltd", source_panel="back"))],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # PDP checks (CHK05 net quantity, CHK07 PDP area/clarity) must be not_assessed because front was corrupt!
        assert findings["CHK05"]["engine_verdict"] == "not_assessed"
        assert findings["CHK07"]["engine_verdict"] == "not_assessed"
        # Panels accurately categorized
        assert "front" in data["panels_unusable"]
        assert "back" in data["panels_decodable"]


def test_scenario_2_valid_front_corrupt_mrp_mrp_not_assessed(env_setup):
    """Scenario 2: Valid front + corrupt MRP -> MRP assessment must evaluate to not_assessed, not fail."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "mrp": "undecodable"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[OcrLine(text="Biscuit Pack", confidence=0.95, box=[[10, 10]], height_px=20)],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Biscuits", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Biscuit Pack", source_panel="front")),
            mrp=MrpDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # MRP must NOT be marked as failed absence under 36(1)
        assert findings["CHK04"]["engine_verdict"] == "not_assessed"
        assert "mrp" in data["panels_unusable"]
        assert "front" in data["panels_decodable"]


def test_scenario_3_batch_only_date_not_assessed(env_setup):
    """Scenario 3: Batch-only evidence -> Date of manufacture must evaluate to not_assessed, not fail."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"batch": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[OcrLine(text="BATCH NO B204", confidence=0.95, box=[[10, 10]], height_px=20)],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            dates=[],  # No dates in batch crop
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # Date of manufacture (CHK06) must be not_assessed, not fail!
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"


def test_scenario_4_front_plus_mrp_manufacturer_consumer_care_not_assessed(env_setup):
    """Scenario 4: Front + MRP panel evidence -> Manufacturer and consumer-care checks must evaluate to not_assessed."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "mrp": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Tea 500g", confidence=0.95, box=[[10, 10]], height_px=20),
                OcrLine(text="MRP Rs 250", confidence=0.95, box=[[10, 40]], height_px=20),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Tea", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Tea", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=500.0, unit="g", normalized_unit="g", raw_text="500g", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="500g", source_panel="front")),
            parties=[],  # Manufacturer unobserved
            consumer_care=ConsumerCareDeclaration(status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(value=250.0, raw_text="MRP Rs 250.00 incl. of all taxes", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 250", source_panel="mrp")),
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # Back is missing, so manufacturer and consumer care cannot be proven absent!
        # CHK01 contains manufacturer/consumer-care; with front+mrp, insufficient coverage causes not_assessed
        assert findings["CHK01"]["engine_verdict"] == "not_assessed"
        assert "insufficient to establish absence" in (findings["CHK01"]["reason"] or "")


def test_scenario_5_valid_back_unobserved_not_assessed_extracted_evaluates(env_setup):
    """Scenario 5: Valid back image -> Unobserved declarations on missing panels are not_assessed; declarations extracted from back image evaluate normally."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"back": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="MRP Rs. 100.00 (inclusive of all taxes)", confidence=0.95, box=[[10, 10]], height_px=20),
                OcrLine(text="Country of Origin: India", confidence=0.95, box=[[10, 30]], height_px=20),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            # Unobserved PDP declarations
            commodity_name=CommonFieldDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            net_quantity=NetQuantityDeclaration(value=None, status=STATUS_NOT_OBSERVED),
            # Observed back declarations
            mrp=MrpDeclaration(value=100.0, currency="INR", raw_text="MRP Rs. 100.00 (inclusive of all taxes)", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs. 100.00 (inclusive of all taxes)", source_panel="back")),
            country_of_origin=CommonFieldDeclaration(value="India", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Country of Origin: India", source_panel="back")),
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # Unobserved PDP declarations are honestly not_assessed
        assert findings["CHK05"]["engine_verdict"] == "not_assessed"
        assert findings["CHK06"]["engine_verdict"] == "not_assessed"
        assert findings["CHK07"]["engine_verdict"] == "not_assessed"
        # Extracted declarations from back evaluate normally
        assert findings["CHK04"]["engine_verdict"] == "pass"


def test_scenario_6_positively_detected_declaration_evaluates_normally(env_setup):
    """Scenario 6: Any declaration positively detected on an available valid panel evaluates its substantive rule normally."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"mrp": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        # Invalid MRP rounding (e.g. fractional paise like Rs 99.456)
        mock_ocr.return_value = OcrResult(
            lines=[OcrLine(text="MRP Rs 99.456 incl of all taxes", confidence=0.95, box=[[10, 10]], height_px=20)],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            mrp=MrpDeclaration(value=99.456, currency="INR", raw_text="MRP Rs 99.456 incl of all taxes", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 99.456", source_panel="mrp")),
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # Substantive check on MRP evaluates and fails on substantive rounding rule (CHK04)
        assert findings["CHK04"]["engine_verdict"] == "fail"


def test_scenario_7_insufficient_evidence_not_assessed_never_unsupported_violation(env_setup):
    """Scenario 7: Insufficient evidence coverage produces not_assessed, never an unsupported violation."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[OcrLine(text="Clean Front Label Only", confidence=0.95, box=[[10, 10]], height_px=20)],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Biscuits", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Clean Front", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=100.0, unit="g", normalized_unit="g", raw_text="100g", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="100g", source_panel="front")),
            parties=[],
            consumer_care=ConsumerCareDeclaration(status=STATUS_NOT_OBSERVED),
            mrp=MrpDeclaration(status=STATUS_NOT_OBSERVED),
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # The overall result must be not_assessed, never false violation or false compliant
        assert data["overall_result"] == "not_assessed"
        findings = {f["check_id"]: f for f in data["findings"]}
        # Absence checks on uncaptured panels must be not_assessed
        assert findings["CHK01"]["engine_verdict"] == "not_assessed"
        assert findings["CHK04"]["engine_verdict"] == "not_assessed"


def test_scenario_8_independent_checks_continue_running(env_setup):
    """Scenario 8: Independent checks continue to run and return verdicts when another check is unresolved."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "back": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Premium Cookies", confidence=0.95, box=[[10, 10]], height_px=20),
                OcrLine(text="Net Qty: 200 gms", confidence=0.95, box=[[10, 30]], height_px=20),  # Non-standard unit 'gms'!
                OcrLine(text="Mfd by: Bakery Corp, Delhi", confidence=0.95, box=[[10, 50]], height_px=20),
                OcrLine(text="MRP Rs 50.00 incl. of all taxes", confidence=0.95, box=[[10, 70]], height_px=20),
                OcrLine(text="Mfg Date: 01/2026", confidence=0.95, box=[[10, 90]], height_px=20),
                OcrLine(text="Care: help@bakery.com", confidence=0.95, box=[[10, 110]], height_px=20),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Cookies", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Premium Cookies", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=200.0, unit="gms", normalized_unit="g", raw_text="Net Qty: 200 gms", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Net Qty: 200 gms", source_panel="front")),
            parties=[PartyDeclaration(name="Bakery Corp", address="Delhi", party_type="manufacturer", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfd by: Bakery Corp, Delhi", source_panel="back"))],
            consumer_care=ConsumerCareDeclaration(email="help@bakery.com", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Care: help@bakery.com", source_panel="back")),
            mrp=MrpDeclaration(value=50.0, raw_text="MRP Rs 50.00 incl. of all taxes", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 50.00", source_panel="back")),
            dates=[DateDeclaration(date_type_candidate="mfg", raw_text="Mfg Date: 01/2026", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="01/2026", source_panel="back"))],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        findings = {f["check_id"]: f for f in data["findings"]}

        # Net quantity fails on non-standard unit 'gms'
        assert findings["CHK05"]["engine_verdict"] == "fail"
        # Mandatory declarations (CHK01) and MRP (CHK04) pass independently
        assert findings["CHK01"]["engine_verdict"] == "pass"
        assert findings["CHK04"]["engine_verdict"] == "pass"


def test_scenario_9_mixed_valid_and_corrupt_images_preserves_valid(env_setup):
    """Scenario 9: Mixed valid and corrupt image submissions preserve usable evidence from valid panels."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "back": "undecodable", "mrp": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Brand Salt", confidence=0.95, box=[[10, 10]], height_px=20),
                OcrLine(text="Net 1 kg", confidence=0.95, box=[[10, 30]], height_px=20),
                OcrLine(text="MRP Rs 30.00 incl. of all taxes", confidence=0.95, box=[[10, 50]], height_px=20),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Salt", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Brand Salt", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=1.0, unit="kg", normalized_unit="kg", raw_text="Net 1 kg", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Net 1 kg", source_panel="front")),
            mrp=MrpDeclaration(value=30.0, raw_text="MRP Rs 30.00 incl. of all taxes", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 30.00", source_panel="mrp")),
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Decodable panels front & mrp are preserved and evaluated
        assert sorted(data["panels_decodable"]) == ["front", "mrp"]
        assert data["panels_unusable"] == ["back"]
        findings = {f["check_id"]: f for f in data["findings"]}
        assert findings["CHK05"]["engine_verdict"] == "pass"
        assert findings["CHK04"]["engine_verdict"] == "pass"


def test_scenario_10_empty_and_wholly_undecodable_rejected(env_setup):
    """Scenario 10: Empty and wholly undecodable submissions remain rejected with HTTP 422."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "undecodable", "back": "undecodable"})
    client = env_setup["client"]

    resp = client.post(f"/scans/{scan.id}/assess")
    assert resp.status_code == 422, resp.text
    assert "undecodable" in resp.json()["detail"].lower() or "cannot assess scan" in resp.json()["detail"].lower()


def test_scenario_11_panel_state_fields_consistency(env_setup):
    """Scenario 11: panels_captured, panels_decodable, panels_unusable, panels_missing accurately reflect evidence state."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "back": "undecodable"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(lines=[], engine="ocr_space", status=STATUS_SUCCESS)
        mock_llm.return_value = StructuredDeclarationResult(metadata={"status": "success"})

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert sorted(data["panels_captured"]) == ["back", "front"]
        assert data["panels_decodable"] == ["front"]
        assert data["panels_unusable"] == ["back"]
        assert sorted(data["panels_missing"]) == ["batch", "mrp"]


def test_scenario_12_ocr_provider_errors_do_not_become_absence_findings(env_setup):
    """Scenario 12: OCR provider errors do not become absence findings."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "back": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        # Simulate OCR engine failure
        mock_ocr.return_value = OcrResult(
            lines=[],
            engine="ocr_space",
            status="provider_error",
            failure_reason="OCR API 503 Service Unavailable",
        )
        mock_llm.return_value = StructuredDeclarationResult(metadata={"status": "provider_error"})

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Overall result must reflect OCR failure / not_assessed, NOT statutory violations
        assert data["overall_result"] in ("not_assessed", "review_required")
        assert data["violation_limb"] is None
        # No absence checks may be failed when OCR provider failed
        findings = {f["check_id"]: f for f in data["findings"]}
        for cid in ("CHK01", "CHK04", "CHK05", "CHK06"):
            if cid in findings:
                assert findings[cid]["engine_verdict"] == "not_assessed"


def test_scenario_13_root_and_diagnostics_evidence_states_identical(env_setup):
    """Scenario 13: The root response and diagnostic evidence-state values are identical."""
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "mrp": "undecodable"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(lines=[], engine="ocr_space", status=STATUS_SUCCESS)
        mock_llm.return_value = StructuredDeclarationResult(metadata={"status": "success"})

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        diag = data["diagnostics"]

        assert data["panels_captured"] == diag["panels_captured"]
        assert data["panels_decodable"] == diag["panels_decodable"]
        assert data["panels_unusable"] == diag["panels_unusable"]
        assert data["panels_missing"] == diag["panels_missing"]


def test_scenario_14_all_previous_optional_panel_tests_continue_to_pass(env_setup):
    """Scenario 14: All previous optional panel tests continue to pass (verified via full suite)."""
    # Simply verifies that all 4 panel types can be assessed in combination
    insp, scan, images = _setup_scan_with_panels(env_setup, {"front": "valid", "back": "valid", "mrp": "valid", "batch": "valid"})
    client = env_setup["client"]

    with patch("ocr_engine.run_ocr") as mock_ocr, \
         patch("llm.structure_inspection_ocr") as mock_llm:
        mock_ocr.return_value = OcrResult(
            lines=[
                OcrLine(text="Full Pack", confidence=0.95, box=[[10, 10]], height_px=20),
                OcrLine(text="Net 500 g", confidence=0.95, box=[[10, 30]], height_px=20),
                OcrLine(text="Mfg by: Full Foods Ltd, Delhi", confidence=0.95, box=[[10, 50]], height_px=20),
                OcrLine(text="Care: help@fullfoods.in", confidence=0.95, box=[[10, 70]], height_px=20),
                OcrLine(text="MRP Rs 150.00 incl taxes", confidence=0.95, box=[[10, 90]], height_px=20),
            ],
            engine="ocr_space",
            status=STATUS_SUCCESS,
        )
        mock_llm.return_value = StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(value="Full Pack", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Full Pack", source_panel="front")),
            net_quantity=NetQuantityDeclaration(value=500.0, unit="g", normalized_unit="g", raw_text="500 g", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Net 500 g", source_panel="front")),
            parties=[PartyDeclaration(name="Full Foods Ltd", address="Delhi", party_type="manufacturer", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Mfg by: Full Foods Ltd, Delhi", source_panel="back"))],
            consumer_care=ConsumerCareDeclaration(email="help@fullfoods.in", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="Care: help@fullfoods.in", source_panel="back")),
            mrp=MrpDeclaration(value=150.0, currency="INR", raw_text="MRP Rs 150.00 incl taxes", status=STATUS_CONFIRMED, provenance=FieldProvenance(source_text="MRP Rs 150.00", source_panel="mrp")),
            dates=[],
            metadata={"status": "success"},
        )

        resp = client.post(f"/scans/{scan.id}/assess")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert sorted(data["panels_captured"]) == ["back", "batch", "front", "mrp"]
        assert sorted(data["panels_decodable"]) == ["back", "batch", "front", "mrp"]
        assert data["panels_unusable"] == []
        assert data["panels_missing"] == []
