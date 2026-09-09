"""tests/test_admin_portal_endpoints.py — verify endpoints serving the merged Admin Portal."""
import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import models
from models import User
from password_handler import hash_password
from main import app
from rbac import require_admin


def _setup_app():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    db = S()

    admin_user = User(
        employee_id="LM-ADM-001",
        full_name="Admin Officer",
        password_hash=hash_password("admin-pass-123"),
        role="admin",
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)

    def override_get_db():
        try:
            yield db
        finally:
            pass

    def override_require_admin():
        return admin_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_admin] = override_require_admin
    client = TestClient(app)
    return client, db


def test_admin_dashboard_endpoint():
    client, db = _setup_app()
    resp = client.get("/admin/dashboard")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "inspections" in data
    assert "stores_visited" in data
    assert "review_queue" in data
    assert "counts" in data


def test_admin_violations_endpoint():
    client, db = _setup_app()
    resp = client.get("/admin/violations")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "total" in data
    assert "violations" in data
    assert "top_violations" in data
    assert isinstance(data["violations"], list)


def test_admin_repeat_offenders_endpoint():
    client, db = _setup_app()
    resp = client.get("/admin/repeat-offenders")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "stores" in data
    assert isinstance(data["stores"], list)


def test_admin_rule_versions_endpoint():
    client, db = _setup_app()
    resp = client.get("/admin/rule-versions")
    assert resp.status_code == 200, resp.text
    versions = resp.json()
    assert len(versions) >= 4
    active = [v for v in versions if v["is_active"]]
    assert len(active) == 1
    assert active[0]["year"] == 2026
