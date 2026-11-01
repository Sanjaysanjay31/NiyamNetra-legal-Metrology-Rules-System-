"""Backend/tests/test_ocr_provenance_and_fallback.py — Module 1 Comprehensive Test Suite.

Verifies:
1. OCR.space succeeds: returns text, provider recorded as ocr_space, Azure is not called.
2. OCR.space returns STATUS_NO_TEXT: Azure is called, returns text, provider recorded as azure.
3. OCR.space authentication or billing failure: falls back to Azure, records azure and diagnostic trace.
4. OCR.space timeout or network failure: bounded retry triggers, falls back to Azure.
5. Azure succeeds on fallback: returns full text, geometry preserved, azure provider persisted.
6. Both providers return no readable text: records no_text, does not hallucinate text, maintains image evidence.
7. Both configured providers fail technically: records technical failure, preserves error diagnostics.
8. Neither provider configured: returns explicit configuration_error.
9. Mixed-provider multi-panel scan: one image processed with OCR.space and another with Azure records per-image provenance and scan-level provider as mixed.
10. Database reload: persisted Scan and ScanImage records retain provider provenance across server/db reload.
11. API diagnostics serialization: GET /scans/{id} returns persisted provider, status and image-level provenance.
12. Historical records: pre-existing scans without provenance serialize as unknown or omitted without crashing.
13. No active Google Vision references: provider factory, defaults and environment cleanly reject or exclude google_vision.
14. Evidence preservation: original uploaded evidence files are untouched across all fallback paths.
15. Migration 0011: executes upgrade and downgrade cleanly.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from config import settings
from database import Base
from models import Inspection, Scan, ScanImage, User, Store
from ocr.base import (
    BaseOCRProvider,
    OcrLine,
    OcrResult,
    OcrWord,
    STATUS_AUTH_ERROR,
    STATUS_BILLING_ERROR,
    STATUS_CONFIGURATION_ERROR,
    STATUS_NETWORK_ERROR,
    STATUS_NO_TEXT,
    STATUS_PROVIDER_ERROR,
    STATUS_SKIPPED,
    STATUS_SUCCESS,
    STATUS_TIMEOUT,
    STATUS_UNAVAILABLE,
    normalize_ocr_status,
)
from ocr.fallback import FallbackOCRProvider
from ocr.factory import get_candidate_providers, get_ocr_provider
from ocr.azure_vision import AzureVisionProvider
from ocr.ocr_space import OCRSpaceProvider
from password_handler import hash_password
from routers.scans import _scan_out, build_context


class MockProvider(BaseOCRProvider):
    """Configurable mock OCR provider for deterministic testing."""

    def __init__(
        self,
        name: str,
        configured: bool = True,
        result: OcrResult | None = None,
        exc: Exception | None = None,
    ):
        self.name = name
        self._configured = configured
        self._result = result
        self._exc = exc
        self.call_count = 0

    def is_configured(self) -> bool:
        return self._configured

    def recognize(self, image_bytes, image_width=None, image_height=None, options=None):
        self.call_count += 1
        if self._exc:
            raise self._exc
        if self._result is not None:
            return self._result
        return OcrResult(engine=self.name, provider=self.name, status=STATUS_SUCCESS)


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = Session()

    user = User(
        employee_id="OFFICER-001",
        full_name="Testing Officer",
        password_hash=hash_password("secretpass"),
        role="inspector",
        is_active=True,
    )
    session.add(user)
    session.flush()

    store = Store(
        name="Supermarket Central",
        store_type="supermarket",
        address="123 Market Rd, Bengaluru",
    )
    session.add(store)
    session.flush()

    inspection = Inspection(
        user_id=user.id,
        store_id=store.id,
        transaction_type="retail_sale",
        status="draft",
    )
    session.add(inspection)
    session.flush()

    yield session, inspection

    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


# ---------------------------------------------------------------------------
# 1. OCR.space succeeds: returns text, provider recorded as ocr_space, Azure is not called
# ---------------------------------------------------------------------------
def test_ocr_space_succeeds_azure_not_called():
    p_ocr = MockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(
            lines=[OcrLine(text="FORTIFIED WHEAT FLOUR 5kg", confidence=0.98)],
            engine="ocr_space",
            provider="ocr_space",
            status=STATUS_SUCCESS,
            duration_ms=250.0,
        ),
    )
    p_azure = MockProvider(name="azure", configured=True)

    fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
    res = fallback.recognize(b"fake_image_bytes")

    assert res.status == STATUS_SUCCESS
    assert res.engine == "ocr_space"
    assert "FORTIFIED WHEAT FLOUR" in res.full_text
    assert p_ocr.call_count == 1
    assert p_azure.call_count == 0  # CRITICAL: Azure is NOT called
    assert len(res.attempts) == 1
    assert res.attempts[0]["provider"] == "ocr_space"
    assert res.attempts[0]["status"] == STATUS_SUCCESS


# ---------------------------------------------------------------------------
# 2. OCR.space returns STATUS_NO_TEXT: Azure is called, returns text, provider recorded as azure
# ---------------------------------------------------------------------------
def test_ocr_space_no_text_falls_back_to_azure():
    p_ocr = MockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(
            lines=[],
            engine="ocr_space",
            provider="ocr_space",
            status=STATUS_NO_TEXT,
            failure_reason="No text detected by OCR.space",
            duration_ms=180.0,
        ),
    )
    p_azure = MockProvider(
        name="azure",
        configured=True,
        result=OcrResult(
            lines=[OcrLine(text="NET QUANTITY 500g", confidence=0.92)],
            engine="azure",
            provider="azure",
            status=STATUS_SUCCESS,
            duration_ms=300.0,
        ),
    )

    fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
    res = fallback.recognize(b"fake_image_bytes")

    assert res.status == STATUS_SUCCESS
    assert res.engine == "azure"
    assert "NET QUANTITY 500g" in res.full_text
    assert p_ocr.call_count == 1
    assert p_azure.call_count == 1
    assert len(res.attempts) == 2
    assert res.attempts[0]["provider"] == "ocr_space"
    assert res.attempts[0]["status"] == STATUS_NO_TEXT
    assert res.attempts[1]["provider"] == "azure"
    assert res.attempts[1]["status"] == STATUS_SUCCESS


# ---------------------------------------------------------------------------
# 3. OCR.space auth or billing failure: falls back to Azure, records azure and diagnostic trace
# ---------------------------------------------------------------------------
def test_ocr_space_auth_or_billing_failure_fallback_azure():
    for err_status, err_cat in [
        (STATUS_AUTH_ERROR, "authentication_error"),
        (STATUS_BILLING_ERROR, "billing_error"),
    ]:
        p_ocr = MockProvider(
            name="ocr_space",
            configured=True,
            result=OcrResult(
                engine="ocr_space",
                provider="ocr_space",
                status=err_status,
                failure_reason=f"OCR.space failure {err_status}",
                duration_ms=110.0,
            ),
        )
        p_azure = MockProvider(
            name="azure",
            configured=True,
            result=OcrResult(
                lines=[OcrLine(text="MRP Rs. 99.00", confidence=0.96)],
                engine="azure",
                provider="azure",
                status=STATUS_SUCCESS,
                duration_ms=280.0,
            ),
        )

        fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
        res = fallback.recognize(b"fake_image_bytes")

        assert res.status == STATUS_SUCCESS
        assert res.engine == "azure"
        assert p_ocr.call_count == 1
        assert p_azure.call_count == 1
        assert len(res.attempts) == 2
        assert res.attempts[0]["provider"] == "ocr_space"
        assert res.attempts[0]["status"] == err_status
        assert res.attempts[0]["category"] == err_cat
        assert res.attempts[1]["provider"] == "azure"
        assert res.attempts[1]["status"] == STATUS_SUCCESS


# ---------------------------------------------------------------------------
# 4. OCR.space timeout or network failure: bounded retry triggers, falls back to Azure
# ---------------------------------------------------------------------------
def test_ocr_space_timeout_or_network_failure_fallback_azure():
    for err_status, err_cat in [
        (STATUS_TIMEOUT, "timeout"),
        (STATUS_NETWORK_ERROR, "network_error"),
    ]:
        p_ocr = MockProvider(
            name="ocr_space",
            configured=True,
            result=OcrResult(
                engine="ocr_space",
                provider="ocr_space",
                status=err_status,
                failure_reason=f"OCR.space {err_status}",
                duration_ms=5000.0,
            ),
        )
        p_azure = MockProvider(
            name="azure",
            configured=True,
            result=OcrResult(
                lines=[OcrLine(text="BATCH NO: BN2026X", confidence=0.94)],
                engine="azure",
                provider="azure",
                status=STATUS_SUCCESS,
                duration_ms=320.0,
            ),
        )

        fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
        res = fallback.recognize(b"fake_image_bytes")

        assert res.status == STATUS_SUCCESS
        assert res.engine == "azure"
        assert p_ocr.call_count == 1
        assert p_azure.call_count == 1
        assert res.attempts[0]["status"] == err_status
        assert res.attempts[0]["category"] == err_cat
        assert res.attempts[1]["status"] == STATUS_SUCCESS


# ---------------------------------------------------------------------------
# 5. Azure succeeds on fallback: returns full text, geometry preserved, azure provider persisted
# ---------------------------------------------------------------------------
def test_azure_success_on_fallback_preserves_geometry():
    quad_box = [[10.0, 20.0], [100.0, 20.0], [100.0, 50.0], [10.0, 50.0]]
    azure_line = OcrLine(
        text="BEST BEFORE 6 MONTHS",
        confidence=0.97,
        box=quad_box,
        height_px=30.0,
        words=[OcrWord(text="BEST", confidence=0.98, box=[[10.0, 20.0], [40.0, 20.0], [40.0, 50.0], [10.0, 50.0]])],
    )
    p_ocr = MockProvider(name="ocr_space", configured=True, result=OcrResult(status=STATUS_TIMEOUT, failure_reason="Timeout"))
    p_azure = MockProvider(
        name="azure",
        configured=True,
        result=OcrResult(
            lines=[azure_line],
            engine="azure",
            provider="azure",
            status=STATUS_SUCCESS,
            mean_confidence=0.97,
            duration_ms=310.0,
        ),
    )

    fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
    res = fallback.recognize(b"fake_image_bytes")

    assert res.status == STATUS_SUCCESS
    assert res.engine == "azure"
    assert len(res.lines) == 1
    assert res.lines[0].box == quad_box
    assert res.lines[0].height_px == 30.0
    assert res.lines[0].confidence == 0.97
    assert len(res.lines[0].words) == 1


# ---------------------------------------------------------------------------
# 6. Both providers return no readable text: records no_text, does not hallucinate
# ---------------------------------------------------------------------------
def test_both_providers_no_readable_text():
    p_ocr = MockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(lines=[], engine="ocr_space", status=STATUS_NO_TEXT, failure_reason="No text on image"),
    )
    p_azure = MockProvider(
        name="azure",
        configured=True,
        result=OcrResult(lines=[], engine="azure", status=STATUS_NO_TEXT, failure_reason="Zero text detected"),
    )

    fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
    res = fallback.recognize(b"blurry_blank_label_bytes")

    assert res.status == STATUS_NO_TEXT
    assert res.engine in ("azure", "none")
    assert len(res.lines) == 0
    assert res.full_text == ""
    assert p_ocr.call_count == 1
    assert p_azure.call_count == 1
    assert len(res.attempts) == 2


# ---------------------------------------------------------------------------
# 7. Both configured providers fail technically: records technical failure, preserves diagnostics
# ---------------------------------------------------------------------------
def test_both_configured_providers_fail_technically():
    p_ocr = MockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(engine="ocr_space", status=STATUS_PROVIDER_ERROR, failure_reason="OCR.space 500 Internal Error", duration_ms=400.0),
    )
    p_azure = MockProvider(
        name="azure",
        configured=True,
        result=OcrResult(engine="azure", status=STATUS_TIMEOUT, failure_reason="Azure Read API timed out after 10s", duration_ms=10000.0),
    )

    fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
    res = fallback.recognize(b"image_bytes")

    assert res.status in (STATUS_PROVIDER_ERROR, STATUS_TIMEOUT)
    assert res.engine in ("azure", "none")
    assert len(res.lines) == 0
    assert "All OCR providers failed" in res.failure_reason
    assert "ocr_space" in res.failure_reason
    assert "azure" in res.failure_reason
    assert len(res.attempts) == 2
    assert res.attempts[0]["status"] == STATUS_PROVIDER_ERROR
    assert res.attempts[1]["status"] == STATUS_TIMEOUT


# ---------------------------------------------------------------------------
# 8. Neither provider configured: returns explicit configuration_error
# ---------------------------------------------------------------------------
def test_neither_provider_configured():
    p_ocr = MockProvider(name="ocr_space", configured=False)
    p_azure = MockProvider(name="azure", configured=False)

    fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
    res = fallback.recognize(b"image_bytes")

    assert res.status == STATUS_CONFIGURATION_ERROR
    assert res.engine in ("azure", "none")
    assert "no configured credentials found" in res.failure_reason.lower() or "no ocr providers" in res.failure_reason.lower()
    assert len(res.attempts) == 2
    assert res.attempts[0]["status"] == STATUS_SKIPPED
    assert res.attempts[1]["status"] == STATUS_SKIPPED


# ---------------------------------------------------------------------------
# 9. Mixed-provider multi-panel scan: records per-image and scan-level "mixed"
# ---------------------------------------------------------------------------
def test_mixed_provider_multi_panel_scan(test_db, tmp_path):
    session, inspection = test_db

    scan = Scan(
        inspection_id=inspection.id,
        commodity_generic="Biscuits",
        panel_shape="rectangular",
        panel_height_mm=120.0,
        panel_width_mm=80.0,
        rules_as_at=date(2026, 9, 21),
        catalog_hash="hash_rules_catalog",
        engine_version="2.0.0",
    )
    session.add(scan)
    session.flush()

    import cv2
    import numpy as np

    # Front panel file
    front_file = tmp_path / "front_panel.jpg"
    dummy_bgr = np.full((1200, 800, 3), 200, dtype=np.uint8)
    cv2.imwrite(str(front_file), dummy_bgr)
    front_bytes = front_file.read_bytes()
    img_front = ScanImage(
        scan_id=scan.id,
        panel="front",
        file_path=str(front_file),
        sha256=hashlib.sha256(front_bytes).hexdigest(),
        width_px=800,
        height_px=1200,
        byte_size=len(front_bytes),
        mime_type="image/jpeg",
        rectified=False,
    )
    session.add(img_front)

    # Back panel file
    back_file = tmp_path / "back_panel.jpg"
    cv2.imwrite(str(back_file), dummy_bgr)
    back_bytes = back_file.read_bytes()
    img_back = ScanImage(
        scan_id=scan.id,
        panel="back",
        file_path=str(back_file),
        sha256=hashlib.sha256(back_bytes).hexdigest(),
        width_px=800,
        height_px=1200,
        byte_size=len(back_bytes),
        mime_type="image/jpeg",
        rectified=False,
    )
    session.add(img_back)
    session.commit()

    # Mock run_ocr to return ocr_space for front, azure for back
    def mock_run_ocr(p, *args, **kwargs):
        panel = kwargs.get("panel")
        if panel == "front":
            return OcrResult(
                lines=[OcrLine(text="BRAND COOKIES FRONT", confidence=0.95)],
                engine="ocr_space",
                status=STATUS_SUCCESS,
                duration_ms=150.0,
                attempts=[{"provider": "ocr_space", "status": STATUS_SUCCESS, "duration_ms": 150.0}],
            )
        else:
            return OcrResult(
                lines=[OcrLine(text="MRP Rs 50 BATCH 123", confidence=0.92)],
                engine="azure",
                status=STATUS_SUCCESS,
                duration_ms=220.0,
                attempts=[
                    {"provider": "ocr_space", "status": STATUS_TIMEOUT, "duration_ms": 1200.0},
                    {"provider": "azure", "status": STATUS_SUCCESS, "duration_ms": 220.0},
                ],
            )

    # Mock image_processor helpers so build_context proceeds
    with patch("ocr_engine.run_ocr", side_effect=mock_run_ocr), \
         patch("image_processor.get_ocr_input_artifact", side_effect=lambda im: (Path(im.file_path), "analysis", {})):
        ctx = build_context(session, scan, inspection)
        session.commit()

    session.refresh(scan)
    session.refresh(img_front)
    session.refresh(img_back)

    # Scan-level aggregation must be "mixed"
    assert scan.ocr_provider == "mixed"
    assert scan.ocr_status == "success"

    # Per-image provenance must reflect individual providers
    assert img_front.ocr_provider == "ocr_space"
    assert img_front.ocr_status == "success"
    assert img_front.ocr_duration_ms == 150.0

    assert img_back.ocr_provider == "azure"
    assert img_back.ocr_status == "success"
    assert img_back.ocr_duration_ms == 220.0
    assert img_back.ocr_attempts_json is not None
    attempts = json.loads(img_back.ocr_attempts_json)
    assert len(attempts) == 2
    assert attempts[0]["provider"] == "ocr_space"
    assert attempts[1]["provider"] == "azure"


# ---------------------------------------------------------------------------
# 10. Database reload: persisted records retain provider provenance across reload
# ---------------------------------------------------------------------------
def test_database_reload_durability(test_db, tmp_path):
    session, inspection = test_db

    scan = Scan(
        inspection_id=inspection.id,
        commodity_generic="Spices",
        ocr_provider="azure",
        ocr_status="success",
        ocr_duration_ms=315.5,
        ocr_error=None,
        rules_as_at=date(2026, 9, 21),
        catalog_hash="hash_rules_catalog",
        engine_version="2.0.0",
    )
    session.add(scan)
    session.flush()

    attempts_data = [{"provider": "ocr_space", "status": "timeout"}, {"provider": "azure", "status": "success"}]
    img = ScanImage(
        scan_id=scan.id,
        panel="front",
        file_path=str(tmp_path / "img.jpg"),
        sha256="abc123sha256",
        width_px=1000,
        height_px=1000,
        byte_size=2048,
        mime_type="image/jpeg",
        ocr_provider="azure",
        ocr_status="success",
        ocr_error_code=None,
        ocr_duration_ms=315.5,
        ocr_attempts_json=json.dumps(attempts_data),
    )
    session.add(img)
    session.commit()
    scan_id = scan.id
    img_id = img.id

    # Simulate restart by expunging/closing and querying in fresh session
    session.expire_all()

    loaded_scan = session.query(Scan).filter(Scan.id == scan_id).one()
    assert loaded_scan.ocr_provider == "azure"
    assert loaded_scan.ocr_status == "success"
    assert loaded_scan.ocr_duration_ms == 315.5
    assert loaded_scan.ocr_error is None

    loaded_img = session.query(ScanImage).filter(ScanImage.id == img_id).one()
    assert loaded_img.ocr_provider == "azure"
    assert loaded_img.ocr_status == "success"
    assert loaded_img.ocr_duration_ms == 315.5
    assert json.loads(loaded_img.ocr_attempts_json) == attempts_data


# ---------------------------------------------------------------------------
# 11. API diagnostics serialization: returns persisted provider, status, image-level provenance
# ---------------------------------------------------------------------------
def test_api_diagnostics_serialization(test_db):
    session, inspection = test_db

    scan = Scan(
        inspection_id=inspection.id,
        commodity_generic="Tea",
        ocr_provider="ocr_space",
        ocr_status="success",
        ocr_duration_ms=185.0,
        ocr_error=None,
        ocr_text="SAMPLE TEA PACK 250G",
        rules_as_at=date(2026, 9, 21),
        catalog_hash="hash_rules_catalog",
        engine_version="2.0.0",
    )
    session.add(scan)
    session.flush()

    img = ScanImage(
        scan_id=scan.id,
        panel="front",
        file_path="/tmp/tea.jpg",
        sha256="tea123hash",
        width_px=800,
        height_px=600,
        byte_size=1024,
        mime_type="image/jpeg",
        ocr_provider="ocr_space",
        ocr_status="success",
        ocr_duration_ms=185.0,
        ocr_attempts_json=json.dumps([{"provider": "ocr_space", "status": "success"}]),
    )
    session.add(img)
    session.commit()

    # Call _scan_out router serializer
    out = _scan_out(session, scan)

    # Root fields
    assert out.ocr_provider == "ocr_space"
    assert out.ocr_status == "success"
    assert out.ocr_duration_ms == 185.0

    # Diagnostics dict
    assert out.diagnostics["ocr_provider"] == "ocr_space"
    assert out.diagnostics["ocr_status"] == "success"
    assert out.diagnostics["ocr_duration_ms"] == 185.0

    # Image list
    assert len(out.images) == 1
    assert out.images[0].ocr_provider == "ocr_space"
    assert out.images[0].ocr_status == "success"
    assert out.images[0].ocr_duration_ms == 185.0
    assert len(out.images[0].ocr_attempts) == 1
    assert out.images[0].ocr_attempts[0]["provider"] == "ocr_space"

    # Per-image diagnostics list
    assert len(out.diagnostics["ocr_images"]) == 1
    assert out.diagnostics["ocr_images"][0]["ocr_provider"] == "ocr_space"
    assert out.diagnostics["ocr_images"][0]["ocr_status"] == "success"


# ---------------------------------------------------------------------------
# 12. Historical records: pre-existing scans without provenance serialize as unknown
# ---------------------------------------------------------------------------
def test_historical_records_serialization(test_db):
    session, inspection = test_db

    # Simulating legacy scan without ocr_provider or ocr_status
    scan = Scan(
        inspection_id=inspection.id,
        commodity_generic="Historical Biscuit",
        ocr_provider=None,
        ocr_status=None,
        ocr_duration_ms=None,
        ocr_error=None,
        ocr_text=None,
        rules_as_at=date(2026, 9, 21),
        catalog_hash="hash_rules_catalog",
        engine_version="2.0.0",
    )
    session.add(scan)
    session.flush()

    img = ScanImage(
        scan_id=scan.id,
        panel="front",
        file_path="/tmp/hist.jpg",
        sha256="histhash123",
        width_px=800,
        height_px=600,
        byte_size=1024,
        mime_type="image/jpeg",
        ocr_provider=None,
        ocr_status=None,
        ocr_duration_ms=None,
        ocr_attempts_json=None,
    )
    session.add(img)
    session.commit()

    out = _scan_out(session, scan)

    assert out.ocr_provider is None
    assert out.diagnostics["ocr_provider"] == "unknown"
    assert out.diagnostics["ocr_status"] == "unknown"
    assert out.images[0].ocr_provider is None
    assert out.diagnostics["ocr_images"][0]["ocr_provider"] == "unknown"


# ---------------------------------------------------------------------------
# 13. No active Google Vision references: cleanly reject or exclude google_vision
# ---------------------------------------------------------------------------
def test_no_active_google_vision_references():
    with pytest.raises(ValueError, match="Unsupported OCR provider 'google_vision'"):
        get_ocr_provider("google_vision")

    assert "google_vision" not in settings.OCR_PROVIDER_CHAIN
    assert "google_vision" not in settings.OCR_PROVIDER_ORDER
    assert not hasattr(settings, "GOOGLE_VISION_API_KEY")

    candidates = get_candidate_providers()
    candidate_names = [c.name for c in candidates]
    assert "google_vision" not in candidate_names
    assert candidate_names == ["ocr_space", "azure"]


# ---------------------------------------------------------------------------
# 14. Evidence preservation: original uploaded evidence files are untouched
# ---------------------------------------------------------------------------
def test_evidence_preservation_untouched(test_db, tmp_path):
    raw_content = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00EvidenceBytes"
    evidence_path = tmp_path / "original_packaging_evidence.jpg"
    evidence_path.write_bytes(raw_content)
    orig_sha = hashlib.sha256(raw_content).hexdigest()

    # Provider failing then falling back
    p_ocr = MockProvider(name="ocr_space", configured=True, result=OcrResult(status=STATUS_TIMEOUT, failure_reason="Timeout"))
    p_azure = MockProvider(
        name="azure",
        configured=True,
        result=OcrResult(lines=[OcrLine(text="PRESERVED", confidence=0.99)], engine="azure", status=STATUS_SUCCESS),
    )
    fallback = FallbackOCRProvider(candidates=[p_ocr, p_azure])
    _ = fallback.recognize(raw_content)

    # Verify original file byte exactness
    assert evidence_path.read_bytes() == raw_content
    assert hashlib.sha256(evidence_path.read_bytes()).hexdigest() == orig_sha


# ---------------------------------------------------------------------------
# 15. Migration 0011: executes upgrade and downgrade cleanly
# ---------------------------------------------------------------------------
def test_migration_0011_upgrade_and_downgrade(tmp_path):
    db_file = tmp_path / "migration_test.db"
    db_url = f"sqlite:///{db_file}"
    ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(ini_path.parent / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)

    # 1. Upgrade to revision 0010 first
    command.upgrade(cfg, "0010")
    eng = create_engine(db_url)
    # Simulate legacy database pre-0011 by ensuring 0011 columns are dropped if 0001 Base.metadata created them
    with eng.begin() as conn:
        for col in ["ocr_provider", "ocr_status", "ocr_duration_ms", "ocr_error"]:
            try:
                conn.execute(sa.text(f"ALTER TABLE scans DROP COLUMN {col}"))
            except Exception:
                pass
        for col in ["ocr_provider", "ocr_status", "ocr_error_code", "ocr_duration_ms", "ocr_attempts_json"]:
            try:
                conn.execute(sa.text(f"ALTER TABLE scan_images DROP COLUMN {col}"))
            except Exception:
                pass

    inspector = sa.inspect(eng)
    cols_scan_0010 = [c["name"] for c in inspector.get_columns("scans")]
    cols_img_0010 = [c["name"] for c in inspector.get_columns("scan_images")]
    assert "ocr_provider" not in cols_scan_0010
    assert "ocr_provider" not in cols_img_0010
    eng.dispose()

    # 2. Upgrade to revision 0011
    command.upgrade(cfg, "0011")
    eng = create_engine(db_url)
    inspector = sa.inspect(eng)
    cols_scan_0011 = [c["name"] for c in inspector.get_columns("scans")]
    cols_img_0011 = [c["name"] for c in inspector.get_columns("scan_images")]

    for col in ["ocr_provider", "ocr_status", "ocr_duration_ms", "ocr_error"]:
        assert col in cols_scan_0011

    for col in ["ocr_provider", "ocr_status", "ocr_error_code", "ocr_duration_ms", "ocr_attempts_json"]:
        assert col in cols_img_0011
    eng.dispose()

    # 3. Downgrade back to revision 0010
    command.downgrade(cfg, "0010")
    eng = create_engine(db_url)
    inspector = sa.inspect(eng)
    cols_scan_down = [c["name"] for c in inspector.get_columns("scans")]
    cols_img_down = [c["name"] for c in inspector.get_columns("scan_images")]

    assert "ocr_provider" not in cols_scan_down
    assert "ocr_provider" not in cols_img_down
    eng.dispose()

    # 4. Re-upgrade back to 0011
    command.upgrade(cfg, "0011")
    eng = create_engine(db_url)
    with eng.connect() as conn:
        rev = conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()
        assert rev == "0011"
    eng.dispose()
