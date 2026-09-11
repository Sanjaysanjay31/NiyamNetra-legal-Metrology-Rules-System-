"""tests/test_retention_idempotency.py — regression tests for the 2026-09-10
audit fixes: durable idempotency replay, evidence retention (no auto-purge +
deny-delete trigger), and the /reports/verify existence-oracle closure."""
import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import Inspection, ScanImage, Store, User
from password_handler import hash_password
from rbac import get_current_user


def _setup_app():
    # StaticPool: ONE connection shared across threads. TestClient serves each
    # request from an anyio worker thread, and SQLite :memory: with the default
    # SingletonThreadPool hands every thread its own (empty) database.
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    db = S()

    admin = User(employee_id="LM-ADM-001", full_name="Admin Officer",
                 password_hash=hash_password("admin-pass-123456"), role="admin")
    insp_a = User(employee_id="LM-TG-1042", full_name="Inspector A",
                  password_hash=hash_password("inspector-pass-123"), role="inspector",
                  install_id="install-aaaa-bbbb")
    insp_b = User(employee_id="LM-TG-2042", full_name="Inspector B",
                  password_hash=hash_password("inspector-pass-456"), role="inspector")
    store = Store(name="Test Kirana", city="Hyderabad")
    db.add_all([admin, insp_a, insp_b, store])
    db.commit()
    for u in (admin, insp_a, insp_b):
        db.refresh(u)
    db.refresh(store)

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    return client, db, {"admin": admin, "a": insp_a, "b": insp_b, "store": store}


def _login_as(user):
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth_override():
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------- idempotency
def test_idempotent_inspection_replay():
    client, db, fx = _setup_app()
    _login_as(fx["a"])
    body = {"store_id": fx["store"].id, "transaction_type": "retail_sale"}
    r1 = client.post("/inspections", json=body, headers={"Idempotency-Key": "qitem-1"})
    assert r1.status_code == 201, r1.text
    r2 = client.post("/inspections", json=body, headers={"Idempotency-Key": "qitem-1"})
    assert r2.status_code == 201, r2.text
    assert r2.json()["id"] == r1.json()["id"], "replay must return the SAME inspection"
    ids = [i.id for i in db.query(Inspection).all()]
    assert ids == [r1.json()["id"]], "exactly one row must exist"
    _clear_auth_override()


def test_no_key_still_creates_two():
    """Sanity: without a key the endpoint behaves as before — the KEY is what
    dedupes, not some global de-duplication."""
    client, db, fx = _setup_app()
    _login_as(fx["a"])
    body = {"store_id": fx["store"].id, "transaction_type": "retail_sale"}
    r1 = client.post("/inspections", json=body)
    r2 = client.post("/inspections", json=body)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["id"] != r2.json()["id"]
    _clear_auth_override()


def test_key_reuse_for_different_endpoint_is_422():
    client, db, fx = _setup_app()
    _login_as(fx["a"])
    insp = client.post("/inspections",
                       json={"store_id": fx["store"].id, "transaction_type": "retail_sale"},
                       headers={"Idempotency-Key": "qitem-2"})
    assert insp.status_code == 201
    # Same key, different route: ambiguous replay must refuse, not hand back
    # the inspection body.
    r = client.post(f"/inspections/{insp.json()['id']}/scans",
                    json={"commodity_generic": "atta"},
                    headers={"Idempotency-Key": "qitem-2"})
    assert r.status_code == 422, r.text
    _clear_auth_override()


# ------------------------------------------------------------------- retention
def test_scan_images_row_cannot_be_deleted():
    """Migration 0006 restores img_no_delete: evidence rows are append-only,
    so the auto-purge path is now impossible at the DB level too.

    A temp FILE database (not :memory:) is required: alembic creates its own
    engine, and two sqlite:///:memory: engines are two different empty
    databases. A file makes the migrated schema visible to this test."""
    import tempfile
    from alembic import command
    from alembic.config import Config
    from datetime import date
    from models import Scan

    _fd, _dbpath = tempfile.mkstemp(suffix=".db")
    os.close(_fd)
    eng = create_engine(f"sqlite:///{_dbpath}")
    try:
        cfg = Config("alembic.ini")
        cfg.set_main_option("sqlalchemy.url", f"sqlite:///{_dbpath}")
        command.upgrade(cfg, "head")

        S = sessionmaker(bind=eng)
        db = S()
        u = User(employee_id="LM-TG-9001", full_name="T", password_hash="x" * 32,
                 role="inspector")
        st = Store(name="S")
        db.add_all([u, st])
        db.commit()
        db.refresh(u)
        db.refresh(st)
        i = Inspection(user_id=u.id, store_id=st.id, inspection_date=date.today(),
                       status="draft", transaction_type="retail_sale", in_scope=True)
        db.add(i)
        db.commit()
        db.refresh(i)
        sc = Scan(inspection_id=i.id, commodity_generic="atta",
                  rules_as_at=date.today(), catalog_hash="h", engine_version="2.0.0")
        db.add(sc)
        db.commit()
        db.refresh(sc)
        img = ScanImage(scan_id=sc.id, panel="front", sequence=0, file_path="/x/y.jpg",
                        byte_size=100, width_px=10, height_px=10,
                        mime_type="image/jpeg", sha256="ab" * 32, phash="0" * 16)
        db.add(img)
        db.commit()
        with pytest.raises(Exception):
            db.delete(img)
            db.commit()
        db.rollback()
        assert db.query(ScanImage).filter(ScanImage.id == img.id).first() is not None
        db.close()
    finally:
        eng.dispose()
        try:
            os.remove(_dbpath)
        except OSError:
            pass


def test_assess_source_contains_no_auto_purge():
    """Source-level guard: the assess path must not delete evidence."""
    import inspect
    from routers import scans as scans_mod
    src = inspect.getsource(scans_mod)
    assert "images_purged" not in src
    assert "delete_stored_file" not in src


# ---------------------------------------------------------------- /reports/verify
def test_verify_report_hides_foreign_inspection():
    client, db, fx = _setup_app()
    from datetime import date
    own = Inspection(user_id=fx["a"].id, store_id=fx["store"].id,
                     inspection_date=date.today(), status="draft",
                     transaction_type="retail_sale", in_scope=True)
    db.add(own)
    db.commit()
    db.refresh(own)

    _login_as(fx["b"])
    r = client.get("/reports/verify", params={"inspection": own.id, "head": "deadbeef"})
    assert r.status_code == 200
    assert r.json()["inspection_found"] is False, "foreign ids must not be probed"

    _login_as(fx["a"])
    r = client.get("/reports/verify", params={"inspection": own.id, "head": "deadbeef"})
    assert r.json()["inspection_found"] is True

    _login_as(fx["admin"])
    r = client.get("/reports/verify", params={"inspection": own.id, "head": "deadbeef"})
    assert r.json()["inspection_found"] is True
    _clear_auth_override()


# ---------------------------------------------------- UserOut device indicator
def test_admin_users_exposes_install_id():
    client, db, fx = _setup_app()
    from rbac import require_admin
    app.dependency_overrides[require_admin] = lambda: fx["admin"]
    r = client.get("/admin/users")
    assert r.status_code == 200, r.text
    rows = {u["employee_id"]: u for u in r.json()}
    assert rows["LM-TG-1042"]["install_id"] == "install-aaaa-bbbb"
    assert rows["LM-TG-2042"]["install_id"] is None
    app.dependency_overrides.pop(require_admin, None)

