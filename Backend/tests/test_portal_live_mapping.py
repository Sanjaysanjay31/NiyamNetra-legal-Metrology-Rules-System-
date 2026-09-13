"""tests/test_portal_live_mapping.py — verify live contracts for the portal and app."""
import os
from datetime import date, datetime, timezone

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

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


def _setup_app():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    db = S()

    admin_user = User(
        employee_id="LM-ADM-001",
        full_name="Admin Officer",
        password_hash=hash_password("admin-pass-123"),
        role="admin",
        is_active=True,
    )
    inspector_1 = User(
        employee_id="LM-TG-1042",
        full_name="Inspector One",
        password_hash=hash_password("insp-pass-123"),
        role="inspector",
        is_active=True,
    )
    inspector_2 = User(
        employee_id="LM-TG-1043",
        full_name="Inspector Two",
        password_hash=hash_password("insp-pass-123"),
        role="inspector",
        is_active=True,
    )
    db.add_all([admin_user, inspector_1, inspector_2])
    db.commit()
    db.refresh(admin_user)
    db.refresh(inspector_1)
    db.refresh(inspector_2)

    current_user_holder = [admin_user]

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
    return client, db, admin_user, inspector_1, inspector_2, current_user_holder


def test_empty_db_zero_safety():
    client, db, admin, insp1, insp2, holder = _setup_app()

    # GET /scans on empty DB -> []
    r = client.get("/scans")
    assert r.status_code == 200, r.text
    assert r.json() == []

    # GET /admin/dashboard on empty DB -> zero counts, no None
    r = client.get("/admin/dashboard")
    assert r.status_code == 200, r.text
    dash = r.json()
    assert dash["inspections"] == 0
    assert dash["stores_visited"] == 0
    assert dash["active_inspectors"] == 0
    assert dash["counts"]["total"] == 0
    assert dash["counts"]["compliant"] == 0
    assert dash["counts"]["violation"] == 0
    assert dash["counts"]["not_assessed"] == 0
    assert dash["counts"]["out_of_scope"] == 0

    # GET /admin/repeat-offenders on empty DB -> offenders: []
    r = client.get("/admin/repeat-offenders")
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["offenders"] == []
    assert rep["stores"] == []

    # GET /reports/today on empty DB (as inspector)
    holder[0] = insp1
    r = client.get("/reports/today")
    assert r.status_code == 200, r.text
    tod = r.json()
    assert tod["inspections"] == 0
    assert tod["counts"]["total"] == 0
    assert tod["stores"] == []


def test_scans_list_and_role_scoping():
    client, db, admin, insp1, insp2, holder = _setup_app()

    store1 = Store(name="Store One", city="Hyderabad", is_active=True)
    store2 = Store(name="Store Two", city="Secunderabad", is_active=True)
    db.add_all([store1, store2])
    db.commit()
    db.refresh(store1)
    db.refresh(store2)

    insp_date = date.today()
    insp_row1 = Inspection(
        user_id=insp1.id,
        store_id=store1.id,
        inspection_date=insp_date,
        status="submitted",
        transaction_type="retail_sale",
    )
    insp_row2 = Inspection(
        user_id=insp2.id,
        store_id=store2.id,
        inspection_date=insp_date,
        status="submitted",
        transaction_type="retail_sale",
    )
    db.add_all([insp_row1, insp_row2])
    db.commit()
    db.refresh(insp_row1)
    db.refresh(insp_row2)

    scan1 = Scan(
        inspection_id=insp_row1.id,
        commodity_generic="Biscuits",
        brand_name="Brand A",
        overall_result="compliant",
        checks_total=18,
        checks_assessed=18,
        rules_as_at=insp_date,
        catalog_hash="dummy",
        engine_version="2.0",
    )
    scan2 = Scan(
        inspection_id=insp_row2.id,
        commodity_generic="Cooking Oil",
        brand_name="Brand B",
        overall_result="violation",
        checks_total=18,
        checks_assessed=18,
        rules_as_at=insp_date,
        catalog_hash="dummy",
        engine_version="2.0",
    )
    db.add_all([scan1, scan2])
    db.flush()

    scan_dup = Scan(
        inspection_id=insp_row2.id,
        commodity_generic="Cooking Oil",
        brand_name="Brand B",
        duplicate_of=scan2.id,
        overall_result="violation",
        checks_total=18,
        checks_assessed=18,
        rules_as_at=insp_date,
        catalog_hash="dummy",
        engine_version="2.0",
    )
    db.add(scan_dup)
    db.commit()
    db.refresh(scan1)
    db.refresh(scan2)
    db.refresh(scan_dup)

    # Admin sees both live scans (duplicate excluded)
    holder[0] = admin
    r = client.get("/scans")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 2
    ids = {s["id"] for s in data}
    assert ids == {scan1.id, scan2.id}

    # Filter by store_id
    r_store = client.get(f"/scans?store_id={store1.id}")
    assert len(r_store.json()) == 1
    assert r_store.json()[0]["id"] == scan1.id

    # Filter by status
    r_stat = client.get("/scans?status=violation")
    assert len(r_stat.json()) == 1
    assert r_stat.json()[0]["id"] == scan2.id

    # Filter by q (brand)
    r_q = client.get("/scans?q=Brand A")
    assert len(r_q.json()) == 1
    assert r_q.json()[0]["brand_name"] == "Brand A"

    # Inspector 1 sees only own scans
    holder[0] = insp1
    r_insp = client.get("/scans")
    assert r_insp.status_code == 200
    assert len(r_insp.json()) == 1
    assert r_insp.json()[0]["id"] == scan1.id


def test_repeat_offenders_manufacturer_grouping():
    client, db, admin, insp1, insp2, holder = _setup_app()
    today = date.today()

    store_a = Store(name="Store Alpha", city="Kakinada", is_active=True)
    store_b = Store(name="Store Beta", city="Rajahmundry", is_active=True)
    db.add_all([store_a, store_b])
    db.commit()
    db.refresh(store_a)
    db.refresh(store_b)

    insp_a = Inspection(user_id=insp1.id, store_id=store_a.id, inspection_date=today, status="submitted", transaction_type="retail_sale")
    insp_b = Inspection(user_id=insp2.id, store_id=store_b.id, inspection_date=today, status="submitted", transaction_type="retail_sale")
    db.add_all([insp_a, insp_b])
    db.commit()
    db.refresh(insp_a)
    db.refresh(insp_b)

    scan_a = Scan(inspection_id=insp_a.id, brand_name="MegaFood", commodity_generic="Chips", overall_result="violation", checks_total=18, checks_assessed=18, rules_as_at=today, catalog_hash="d", engine_version="2.0")
    scan_b = Scan(inspection_id=insp_b.id, brand_name="MegaFood", commodity_generic="Atta", overall_result="violation", checks_total=18, checks_assessed=18, rules_as_at=today, catalog_hash="d", engine_version="2.0")
    db.add_all([scan_a, scan_b])
    db.commit()
    db.refresh(scan_a)
    db.refresh(scan_b)

    find_a = Finding(scan_id=scan_a.id, check_id="CHK07", title="MRP font height below standard", engine_verdict="fail", severity="major", citation="Rule 7(1)")
    find_b = Finding(scan_id=scan_b.id, check_id="CHK01", title="Missing consumer care", engine_verdict="fail", severity="major", citation="Rule 6(1)(da)")
    db.add_all([find_a, find_b])
    db.commit()

    holder[0] = admin
    r = client.get("/admin/repeat-offenders")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "offenders" in data
    assert len(data["offenders"]) >= 1

    top = data["offenders"][0]
    assert top["name"] == "MegaFood"
    assert top["violations"] == 2
    assert top["stores"] == 2
    assert set(top["regions"]) == {"Kakinada", "Rajahmundry"}
    assert len(top["history"]) == 2
    assert top["history"][0]["scan_id"] in (scan_a.id, scan_b.id)
    assert top["history"][0]["check_id"] in ("CHK07", "CHK01")


def test_inspection_dict_scanned_fields():
    client, db, admin, insp1, insp2, holder = _setup_app()
    today = date.today()

    store = Store(name="Shop Central", city="Vijayawada", is_active=True)
    db.add(store)
    db.commit()
    db.refresh(store)

    insp = Inspection(user_id=insp1.id, store_id=store.id, inspection_date=today, status="submitted", transaction_type="retail_sale")
    db.add(insp)
    db.commit()
    db.refresh(insp)

    scan = Scan(inspection_id=insp.id, brand_name="GoodBrand", commodity_generic="Tea", overall_result="compliant", checks_total=18, checks_assessed=18, rules_as_at=today, catalog_hash="d", engine_version="2.0")
    db.add(scan)
    db.commit()

    holder[0] = insp1
    r = client.get(f"/inspections/{insp.id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "scanned_at" in data
    assert "scanned_count" in data
    assert data["scanned_count"] == 1
    assert data["store_name"] == "Shop Central"
