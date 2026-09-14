"""tests/test_refusals_ocr_cache.py — verify refusals and OCR caching behaviour."""
import hashlib
import json
import os
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
import models
from models import Finding, Inspection, Scan, ScanImage, Store, User, utcnow
from password_handler import hash_password
from main import app
from rbac import get_current_user, require_admin, require_inspector
from ocr_engine import OcrLine, OcrResult
from queries import todays_stats
from routers.scans import _lines_from_cache, _lines_to_cache, build_context, _assess_inner, _OCR_CACHE_SALT


def _setup_test_env():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)
    db = Session()

    admin_user = User(
        employee_id="ADM-001",
        full_name="Admin User",
        password_hash=hash_password("adminpass123"),
        role="admin",
        is_active=True,
    )
    insp_user_1 = User(
        employee_id="INSP-001",
        full_name="Inspector One",
        password_hash=hash_password("insppass123"),
        role="inspector",
        is_active=True,
    )
    insp_user_2 = User(
        employee_id="INSP-002",
        full_name="Inspector Two",
        password_hash=hash_password("insppass123"),
        role="inspector",
        is_active=True,
    )
    store = Store(
        name="SuperMart Hyderabad",
        address="Banjara Hills",
        city="Hyderabad",
        state="Telangana",
        pincode="500034",
        is_active=True,
    )
    db.add_all([admin_user, insp_user_1, insp_user_2, store])
    db.commit()
    for obj in (admin_user, insp_user_1, insp_user_2, store):
        db.refresh(obj)

    current_user_holder = [insp_user_1]

    def override_get_db():
        try:
            yield db
        finally:
            pass

    def override_require_admin():
        return admin_user

    def override_require_inspector():
        return current_user_holder[0]

    def override_get_current_user():
        return current_user_holder[0]

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_admin] = override_require_admin
    app.dependency_overrides[require_inspector] = override_require_inspector
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)
    return client, db, admin_user, insp_user_1, insp_user_2, store, current_user_holder


# 1. test_refusal_rollup_surfaces_in_list
def test_refusal_rollup_surfaces_in_list():
    client, db, admin, insp1, insp2, store, holder = _setup_test_env()

    # Seed inspection with signature_status='refused', status='submitted', zero scans
    refused_insp = Inspection(
        user_id=insp1.id,
        store_id=store.id,
        inspection_date=date.today(),
        status="submitted",
        signature_status="refused",
        notes="Store keeper refused entry and signature",
        transaction_type="retail_sale",
    )
    db.add(refused_insp)
    db.commit()
    db.refresh(refused_insp)

    holder[0] = insp1
    res = client.get("/inspections")
    assert res.status_code == 200, res.text
    data = res.json()
    assert len(data) == 1
    item = data[0]
    assert item["id"] == refused_insp.id
    assert item["result"] == "refused"
    assert item["overall_result"] == "refused"
    assert item["verdict"] == "refused"
    assert item["is_refusal"] is True
    assert item["signature_status"] == "refused"


# 2. test_todays_stats_counts_refusals
def test_todays_stats_counts_refusals():
    client, db, admin, insp1, insp2, store, holder = _setup_test_env()
    today = date.today()

    # Seed 1 refused (zero scans)
    insp_refused = Inspection(
        user_id=insp1.id,
        store_id=store.id,
        inspection_date=today,
        status="submitted",
        signature_status="refused",
        notes="Merchant refused",
    )
    # Seed 1 ordinary scan-holding inspection
    insp_normal = Inspection(
        user_id=insp1.id,
        store_id=store.id,
        inspection_date=today,
        status="submitted",
        signature_status="signed",
    )
    db.add_all([insp_refused, insp_normal])
    db.commit()

    scan = Scan(
        inspection_id=insp_normal.id,
        commodity_generic="Biscuits",
        overall_result="compliant",
        rules_as_at=today,
        catalog_hash="testhash",
        engine_version="2.0.0",
    )
    db.add(scan)
    db.commit()

    stats = todays_stats(db, insp1.id, today)
    assert stats["inspections"] == 2
    assert stats["refusals"] == 1
    assert stats["compliant"] == 1
    assert stats["total"] == 1


# 3. test_reports_today_carries_refusals
def test_reports_today_carries_refusals(tmp_path):
    client, db, admin, insp1, insp2, store, holder = _setup_test_env()
    today = date.today()

    insp_refused = Inspection(
        user_id=insp1.id,
        store_id=store.id,
        inspection_date=today,
        status="submitted",
        signature_status="refused",
        notes="Merchant refused to cooperate",
    )
    db.add(insp_refused)
    db.commit()

    holder[0] = insp1
    # GET /reports/today
    r = client.get("/reports/today")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["refusals"] == 1

    # Documents
    r_csv = client.get("/reports/today.csv")
    assert r_csv.status_code == 200, r_csv.text
    csv_text = r_csv.text
    assert "Refusal / Non-cooperation" in csv_text
    assert "REFUSED — Merchant refused to cooperate" in csv_text

    r_xlsx = client.get("/reports/today.xlsx")
    assert r_xlsx.status_code == 200

    r_pdf = client.get("/reports/today.pdf")
    assert r_pdf.status_code == 200

    r_docx = client.get("/reports/today.docx")
    assert r_docx.status_code == 200


# Helper to create a dummy image on disk
def _create_dummy_image(path: Path) -> str:
    img = np.full((100, 100, 3), 255, dtype=np.uint8)
    cv2.imwrite(str(path), img)
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


# 4. test_ocr_cache_skips_ocr
def test_ocr_cache_skips_ocr(monkeypatch, tmp_path):
    client, db, admin, insp1, insp2, store, holder = _setup_test_env()
    today = date.today()

    insp = Inspection(
        user_id=insp1.id,
        store_id=store.id,
        inspection_date=today,
        status="draft",
    )
    db.add(insp)
    db.commit()

    img_file = tmp_path / "front.jpg"
    img_sha = _create_dummy_image(img_file)

    cached_lines = [
        OcrLine(text="NET QTY 500 g", confidence=0.98, box=[[10.0, 10.0], [50.0, 10.0], [50.0, 20.0], [10.0, 20.0]], height_px=10.0)
    ]
    cached_ocr = OcrResult(lines=cached_lines, engine="google_vision", mean_confidence=0.98, failure_reason=None)
    cached_json = _lines_to_cache(cached_ocr)

    set_hash = hashlib.sha256(f"{_OCR_CACHE_SALT}|front:{img_sha}".encode()).hexdigest()

    scan = Scan(
        inspection_id=insp.id,
        commodity_generic="Tea",
        rules_as_at=today,
        catalog_hash="hash",
        engine_version="2.0.0",
        panel_height_mm=100.0,
        ocr_cache_hash=set_hash,
        ocr_cache=cached_json,
    )
    db.add(scan)
    db.commit()

    scan_img = ScanImage(
        scan_id=scan.id,
        panel="front",
        file_path=str(img_file),
        byte_size=img_file.stat().st_size,
        width_px=100,
        height_px=100,
        mime_type="image/jpeg",
        sha256=img_sha,
    )
    db.add(scan_img)
    db.commit()

    # Monkeypatch run_ocr to raise exception if called
    def _explode_if_called(*args, **kwargs):
        raise RuntimeError("run_ocr must not be called on cache hit!")

    import ocr_engine
    monkeypatch.setattr(ocr_engine, "run_ocr", _explode_if_called)

    ctx = build_context(db, scan, insp)
    assert ctx.ocr_available is True
    assert ctx.ocr_mean_confidence == 0.98

    # _assess_inner should succeed and keep scan.ocr_cache
    _assess_inner(scan, insp1, db)
    db.refresh(scan)
    assert scan.ocr_cache == cached_json
    assert scan.ocr_cache_hash == set_hash
    assert scan.overall_result in ("compliant", "violation", "not_assessed", "out_of_scope")


# 5. test_ocr_cache_invalidated_by_image_set_change
def test_ocr_cache_invalidated_by_image_set_change(monkeypatch, tmp_path):
    client, db, admin, insp1, insp2, store, holder = _setup_test_env()
    today = date.today()

    insp = Inspection(
        user_id=insp1.id,
        store_id=store.id,
        inspection_date=today,
        status="draft",
    )
    db.add(insp)
    db.commit()

    img_file = tmp_path / "front.jpg"
    img_sha = _create_dummy_image(img_file)

    scan = Scan(
        inspection_id=insp.id,
        commodity_generic="Coffee",
        rules_as_at=today,
        catalog_hash="hash",
        engine_version="2.0.0",
        panel_height_mm=100.0,
        ocr_cache_hash="old_invalid_hash",
        ocr_cache="{}",
    )
    db.add(scan)
    db.commit()

    scan_img = ScanImage(
        scan_id=scan.id,
        panel="front",
        file_path=str(img_file),
        byte_size=img_file.stat().st_size,
        width_px=100,
        height_px=100,
        mime_type="image/jpeg",
        sha256=img_sha,
    )
    db.add(scan_img)
    db.commit()

    calls = []
    def _mock_ocr(bgr):
        calls.append(1)
        return OcrResult(
            lines=[OcrLine(text="COFFEE 200g", confidence=0.9, box=[[5, 5], [20, 5], [20, 15], [5, 15]], height_px=8.0)],
            engine="tesseract",
            mean_confidence=0.9,
            failure_reason=None,
        )

    import ocr_engine
    monkeypatch.setattr(ocr_engine, "run_ocr", _mock_ocr)

    ctx = build_context(db, scan, insp)
    assert len(calls) >= 1
    assert scan.ocr_cache_hash != "old_invalid_hash"
    assert scan.ocr_cache is not None


# 6. test_batch_assess_owned_only
def test_batch_assess_owned_only(tmp_path):
    client, db, admin, insp1, insp2, store, holder = _setup_test_env()
    today = date.today()

    insp_own = Inspection(user_id=insp1.id, store_id=store.id, inspection_date=today, status="draft")
    insp_foreign = Inspection(user_id=insp2.id, store_id=store.id, inspection_date=today, status="draft")
    db.add_all([insp_own, insp_foreign])
    db.commit()

    img1 = tmp_path / "img1.jpg"
    sha1 = _create_dummy_image(img1)
    img2 = tmp_path / "img2.jpg"
    sha2 = _create_dummy_image(img2)

    scan_own = Scan(inspection_id=insp_own.id, commodity_generic="Item1", rules_as_at=today, catalog_hash="h", engine_version="2.0.0")
    scan_foreign = Scan(inspection_id=insp_foreign.id, commodity_generic="Item2", rules_as_at=today, catalog_hash="h", engine_version="2.0.0")
    db.add_all([scan_own, scan_foreign])
    db.commit()

    db.add(ScanImage(scan_id=scan_own.id, panel="front", file_path=str(img1), byte_size=10, width_px=10, height_px=10, mime_type="image/jpeg", sha256=sha1))
    db.add(ScanImage(scan_id=scan_foreign.id, panel="front", file_path=str(img2), byte_size=10, width_px=10, height_px=10, mime_type="image/jpeg", sha256=sha2))
    db.commit()

    # Inspector 1 calls batch-assess
    holder[0] = insp1
    res = client.post("/scans/batch-assess", json={"scan_ids": [scan_own.id, scan_foreign.id]})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] == 2
    r_map = {item["scan_id"]: item for item in data["results"]}
    assert r_map[scan_own.id]["ok"] is True
    assert r_map[scan_foreign.id]["ok"] is False
    assert "not permitted" in r_map[scan_foreign.id]["error"]

    # Admin calls batch-assess on both -> both ok
    holder[0] = admin
    res_adm = client.post("/scans/batch-assess", json={"scan_ids": [scan_own.id, scan_foreign.id]})
    assert res_adm.status_code == 200
    data_adm = res_adm.json()
    assert all(it["ok"] for it in data_adm["results"])


# 7. test_batch_assess_capacity_timeout
def test_batch_assess_capacity_timeout(monkeypatch, tmp_path):
    client, db, admin, insp1, insp2, store, holder = _setup_test_env()
    today = date.today()

    insp = Inspection(user_id=insp1.id, store_id=store.id, inspection_date=today, status="draft")
    db.add(insp)
    db.commit()

    scan = Scan(inspection_id=insp.id, commodity_generic="Item", rules_as_at=today, catalog_hash="h", engine_version="2.0.0")
    db.add(scan)
    db.commit()

    # Monkeypatch semaphore acquire to return False
    import routers.scans as scans_router
    class DummySemaphore:
        def acquire(self, timeout=None):
            return False
        def release(self):
            pass

    monkeypatch.setattr(scans_router, "_ASSESS_SEMAPHORE", DummySemaphore())

    holder[0] = insp1
    res = client.post("/scans/batch-assess", json={"scan_ids": [scan.id]})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] == 1
    assert data["results"][0]["ok"] is False
    assert data["results"][0]["error"] == "capacity busy"
