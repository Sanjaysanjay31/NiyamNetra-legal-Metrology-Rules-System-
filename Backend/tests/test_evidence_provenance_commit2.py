"""Backend tests for Commit 2: Evidence provenance and honest scale state.

Validates:
1. PanelGeometry schema accepts honest `scale_source="none"` without requiring fabricated dimensions.
2. PanelGeometry schema still enforces dimensions when `scale_source="declared"` (backward compatibility).
3. Statutory assessment of a package with `scale_source="none"` correctly reports typography checks as
   `not_assessed` without fabricating or assuming dimensions.
4. Byte-exact SHA-256 verification contract on `GET /scans/{scan_id}/verify` remains intact.
5. Upload API contract (`POST /scans/{scan_id}/images`) remains intact and functional.
"""
import io
import os
from datetime import date
import pytest
from pydantic import ValidationError
from PIL import Image, ImageDraw

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import User, Store, Inspection, Scan, ScanImage
from password_handler import hash_password
from main import app
from rbac import get_current_user, require_inspector
from config import settings
from rules_engine import catalog_hash, assess as run_assessment
from routers.scans import build_context
from schemas import PanelGeometry, CreateScanRequest


def _make_sample_image_bytes(width=1600, height=1200, text="TEST PACKAGING"):
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, width - 50, height - 50], outline=(0, 0, 0), width=4)
    draw.text((100, 100), text, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_panel_geometry_honest_scale_none_requires_no_fabricated_dimensions():
    """Validates that a rectangular or other panel with scale_source='none'
    does NOT require fabricated 120.0 x 80.0 mm dimensions.
    """
    # Honest rectangular panel without fake dimensions
    geom = PanelGeometry(
        panel_shape="rectangular",
        scale_source="none",
        is_blown_moulded=False,
    )
    assert geom.scale_source == "none"
    assert geom.panel_height_mm is None
    assert geom.panel_width_mm is None

    # Reference card scale source also does not require declared package dimensions
    geom_card = PanelGeometry(
        panel_shape="rectangular",
        scale_source="id1_card",
        reference_pixel_size=420.0,
    )
    assert geom_card.scale_source == "id1_card"
    assert geom_card.reference_pixel_size == 420.0


def test_panel_geometry_declared_still_enforces_dimensions():
    """Validates backward compatibility: when scale_source='declared',
    the schema continues to require height and width dimensions.
    """
    # Missing dimensions with scale_source='declared' must raise ValidationError
    with pytest.raises(ValidationError) as exc_info:
        PanelGeometry(
            panel_shape="rectangular",
            scale_source="declared",
        )
    assert "A rectangular panel needs height and width in mm" in str(exc_info.value)

    # Valid declared dimensions must pass
    geom_declared = PanelGeometry(
        panel_shape="rectangular",
        scale_source="declared",
        panel_height_mm=100.0,
        panel_width_mm=75.0,
    )
    assert geom_declared.panel_height_mm == 100.0
    assert geom_declared.panel_width_mm == 75.0


def test_create_scan_request_honest_scale_schema():
    """Validates CreateScanRequest parses honest scale_source='none' correctly."""
    req = CreateScanRequest(
        commodity_generic="Basmati Rice",
        brand_name="Heritage",
        geometry=PanelGeometry(
            panel_shape="rectangular",
            scale_source="none",
        ),
    )
    assert req.geometry.scale_source == "none"
    assert req.geometry.panel_height_mm is None


def test_statutory_assessment_with_scale_none_honestly_reports_not_assessed():
    """End-to-end verification: when a scan has scale_source='none' (no fake dimensions),
    the rules engine reports typography checks as not_assessed with NO_SCALE reason,
    rather than fabricating compliance findings.
    """
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)
    session = Session()

    try:
        user = User(
            employee_id="INS-002",
            full_name="Inspector Test",
            password_hash=hash_password("password12345"),
            role="inspector",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        store = Store(name="Metro Store", latitude=17.4, longitude=78.4)
        session.add(store)
        session.commit()
        session.refresh(store)

        insp = Inspection(
            store_id=store.id,
            user_id=user.id,
            status="draft",
        )
        session.add(insp)
        session.commit()
        session.refresh(insp)

        # Create scan with honest scale_source='none' and NULL dimensions
        scan = Scan(
            inspection_id=insp.id,
            commodity_generic="WHEAT FLOUR",
            brand_name="ANNAPURNA",
            panel_shape="rectangular",
            panel_height_mm=None,   # Honest: NO fabricated 120.0
            panel_width_mm=None,    # Honest: NO fabricated 80.0
            scale_source="none",    # Honest: scale is not available
            rules_as_at=date.fromisoformat(settings.RULES_AS_AT),
            catalog_hash=catalog_hash(),
            engine_version=settings.ENGINE_VERSION,
        )
        session.add(scan)
        session.commit()
        session.refresh(scan)

        # Build context and run assessment
        ctx = build_context(session, scan, insp)
        assert ctx.scale_source == "none"
        assert ctx.mm_per_pixel is None

        findings, verdict, provenance = run_assessment(ctx)

        # Numeral height and typography checks (e.g. CHK08 / CHK09) must be not_assessed due to no scale
        scale_dependent_findings = [f for f in findings if f.check_id in ("CHK08", "CHK09")]
        for f in scale_dependent_findings:
            assert f.verdict == "not_assessed"
            assert "scale" in (f.reason or "").lower() or "reference" in (f.reason or "").lower() or "measured" in (f.reason or "").lower()
    finally:
        session.close()


def test_sha256_backend_verification_contract():
    """Verifies that the backend byte-exact SHA-256 computation and
    evidence verification endpoint (GET /scans/{scan_id}/verify)
    remains completely functional and uncompromised.
    """
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)

    def override_get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    session = Session()
    inspector = User(
        employee_id="INS-003",
        full_name="Verification Officer",
        password_hash=hash_password("password12345"),
        role="inspector",
        is_active=True,
    )
    session.add(inspector)
    store = Store(name="Reliable Mart", latitude=17.4, longitude=78.4)
    session.add(store)
    session.commit()
    session.refresh(inspector)
    session.refresh(store)
    store_id = store.id
    session.close()

    def override_user():
        return inspector

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_inspector] = override_user

    client = TestClient(app)

    try:
        # 1. Create inspection
        insp_res = client.post(
            "/inspections",
            json={
                "store_id": store_id,
                "transaction_type": "retail_sale",
            },
        )
        assert insp_res.status_code == 201, insp_res.text
        insp_id = insp_res.json()["id"]

        # 2. Create scan with honest scale_source='none'
        scan_res = client.post(
            f"/inspections/{insp_id}/scans",
            json={
                "commodity_generic": "Sunflower Oil",
                "geometry": {
                    "panel_shape": "rectangular",
                    "scale_source": "none",
                },
            },
        )
        assert scan_res.status_code == 201, scan_res.text
        scan_id = scan_res.json()["id"]

        # 3. Upload an evidence image
        raw_bytes = _make_sample_image_bytes(text="PURITY OIL MRP 150")
        files = {"file": ("front_panel.jpg", raw_bytes, "image/jpeg")}
        up_res = client.post(
            f"/scans/{scan_id}/images",
            data={"panel": "front"},
            files=files,
        )
        assert up_res.status_code == 201, up_res.text
        img_data = up_res.json()
        assert "image_id" in img_data
        assert "sha256" in img_data

        # 4. Call GET /scans/{scan_id}/verify to verify cryptographic SHA-256
        verify_res = client.get(f"/scans/{scan_id}/verify")
        assert verify_res.status_code == 200, verify_res.text
        v_data = verify_res.json()
        assert v_data["all_intact"] is True
        assert len(v_data["images"]) >= 1
        assert v_data["images"][0]["sha256_matches"] is True
        assert v_data["images"][0]["sha256_recorded"] == img_data["sha256"]
    finally:
        app.dependency_overrides.clear()
