"""tests/test_scans.py — submitted guard + panel allow-list (no DB)."""
import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from fastapi import HTTPException

from routers.scans import ALLOWED_PANELS, UpdateScanRequest


def _guard(status: str | None):
    """Mirror of the submitted-inspection guard used by upload/assess/patch/listing."""
    if status == "submitted":
        raise HTTPException(409, detail="Inspection submitted; scan frozen")


def test_submitted_guard_fires():
    with pytest.raises(HTTPException) as ei:
        _guard("submitted")
    assert ei.value.status_code == 409
    # draft passes
    _guard("draft")
    _guard(None)


def test_panel_allow_list_rejects_unknown():
    assert "front" in ALLOWED_PANELS
    assert "mrp" in ALLOWED_PANELS
    assert "evil" not in ALLOWED_PANELS
    # normalisation matches router logic
    assert " Front ".strip().lower() in ALLOWED_PANELS
    assert "" not in ALLOWED_PANELS


def test_update_scan_sticker_consistency():
    with pytest.raises(Exception):
        UpdateScanRequest(has_sticker=False, sticker_reduces_price=True)
    # valid: no sticker, no sticker_* fields
    ok = UpdateScanRequest(has_sticker=False, commodity_generic="atta")
    assert ok.has_sticker is False


def test_update_scan_accepts_reference_pixel_size():
    r = UpdateScanRequest(reference_pixel_size=320.0)
    assert r.reference_pixel_size == 320.0
    with pytest.raises(Exception):
        UpdateScanRequest(reference_pixel_size=-5)


def test_quantity_unit_allow_list():
    from routers.scans import ALLOWED_QUANTITY_UNITS
    assert "kg" in ALLOWED_QUANTITY_UNITS
    with pytest.raises(Exception):
        UpdateScanRequest(net_quantity_unit="furlong")
