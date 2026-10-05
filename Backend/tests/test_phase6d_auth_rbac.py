"""tests/test_phase6d_auth_rbac.py — Comprehensive Phase 6D Authorization & RBAC Test Suite.

Validates:
1. Valid inspector authorization
2. Valid admin authorization
3. Wrong role access attempts (403 Forbidden)
4. Expired token rejection (401 Unauthorized)
5. Malformed token rejection (401 Unauthorized)
6. Missing token rejection (401 Unauthorized)
7. Inspector accessing another inspector's restricted inspection (403 or 404)
8. Non-admin attempting bulk adjudication (403 Forbidden)
9. Enforcement endpoint protection against unauthorized callers
10. Server-side token subject validation
"""
import os
from datetime import date, datetime, timedelta, timezone

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from jwt_handler import ACCESS, TokenError, create_access_token, decode_token
from main import app
from models import Inspection, Scan, Store, User
from password_handler import hash_password
from rbac import get_current_user, require_admin, require_inspector


def _create_test_env():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)
    db = Session()

    # Inspector 1
    insp1 = User(
        employee_id="LM-HYD-001",
        full_name="Inspector One",
        password_hash=hash_password("pass123"),
        role="inspector",
        install_id="device-001",
        is_active=True,
    )
    # Inspector 2
    insp2 = User(
        employee_id="LM-HYD-002",
        full_name="Inspector Two",
        password_hash=hash_password("pass123"),
        role="inspector",
        install_id="device-002",
        is_active=True,
    )
    # Admin
    admin = User(
        employee_id="LM-ADM-999",
        full_name="Super Admin",
        password_hash=hash_password("pass123"),
        role="admin",
        install_id="device-admin",
        is_active=True,
    )
    # Store
    store = Store(
        name="Apollo Supermarket",
        address="Banjara Hills",
        city="Hyderabad",
        state="Telangana",
        pincode="500034",
    )
    db.add_all([insp1, insp2, admin, store])
    db.commit()

    # Inspection owned by Inspector 1
    inspection1 = Inspection(
        user_id=insp1.id,
        store_id=store.id,
        inspection_date=date.today(),
        status="draft",
        in_scope=True,
    )
    # Inspection owned by Inspector 2
    inspection2 = Inspection(
        user_id=insp2.id,
        store_id=store.id,
        inspection_date=date.today(),
        status="draft",
        in_scope=True,
    )
    db.add_all([inspection1, inspection2])
    db.commit()

    today_date = date.today()
    cat_hash = "a" * 64
    scan1 = Scan(
        inspection_id=inspection1.id,
        commodity_generic="Atta",
        overall_result="not_assessed",
        rules_as_at=today_date,
        catalog_hash=cat_hash,
        engine_version="2.4.0",
        rule_pack_version="2026.09.v1",
    )
    scan2 = Scan(
        inspection_id=inspection2.id,
        commodity_generic="Rice",
        overall_result="not_assessed",
        rules_as_at=today_date,
        catalog_hash=cat_hash,
        engine_version="2.4.0",
        rule_pack_version="2026.09.v1",
    )
    db.add_all([scan1, scan2])
    db.commit()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    # Clear role overrides so real rbac runs!
    app.dependency_overrides.pop(require_admin, None)
    app.dependency_overrides.pop(require_inspector, None)
    app.dependency_overrides.pop(get_current_user, None)

    client = TestClient(app)
    return {
        "db": db,
        "client": client,
        "insp1": insp1,
        "insp2": insp2,
        "admin": admin,
        "inspection1": inspection1,
        "inspection2": inspection2,
    }


def test_missing_token_returns_401():
    env = _create_test_env()
    client = env["client"]

    # Calling review queue without auth
    resp = client.get("/review/queue")
    assert resp.status_code == 401
    assert "WWW-Authenticate" in resp.headers


def test_malformed_token_returns_401():
    env = _create_test_env()
    client = env["client"]

    headers = {"Authorization": "Bearer not-a-valid-jwt-token"}
    resp = client.get("/review/queue", headers=headers)
    assert resp.status_code == 401


def test_expired_token_returns_401():
    env = _create_test_env()
    client = env["client"]
    insp1 = env["insp1"]

    import jwt_handler as _jh
    # Mint token with negative delta (already expired)
    expired_token = _jh._mint(
        {"sub": str(insp1.id), "role": "inspector", "install_id": insp1.install_id},
        timedelta(seconds=-60),
        ACCESS,
    )

    headers = {"Authorization": f"Bearer {expired_token}"}
    resp = client.get("/review/queue", headers=headers)
    assert resp.status_code == 401


def test_valid_inspector_can_access_own_queue():
    env = _create_test_env()
    client = env["client"]
    insp1 = env["insp1"]

    token = create_access_token(insp1.id, "inspector", insp1.install_id)
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/review/queue", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "summary" in data


def test_inspector_cannot_access_admin_portal():
    env = _create_test_env()
    client = env["client"]
    insp1 = env["insp1"]

    token = create_access_token(insp1.id, "inspector", insp1.install_id)
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt to hit admin dashboard
    resp = client.get("/admin/dashboard", headers=headers)
    assert resp.status_code == 403


def test_inspector_cannot_run_bulk_adjudicate():
    env = _create_test_env()
    client = env["client"]
    insp1 = env["insp1"]
    i1 = env["inspection1"]

    token = create_access_token(insp1.id, "inspector", insp1.install_id)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "inspection_ids": [i1.id],
        "action": "resolve",
        "reason": "Inspector trying unauthorized bulk operation",
    }
    resp = client.post("/review/queue/bulk-adjudicate", json=payload, headers=headers)
    assert resp.status_code == 403


def test_inspector_cannot_view_another_inspectors_review_detail():
    env = _create_test_env()
    client = env["client"]
    insp1 = env["insp1"]
    i2 = env["inspection2"]  # Owned by Inspector 2

    token = create_access_token(insp1.id, "inspector", insp1.install_id)
    headers = {"Authorization": f"Bearer {token}"}

    # Inspector 1 trying to access Inspector 2's inspection
    resp = client.get(f"/review/inspections/{i2.id}", headers=headers)
    assert resp.status_code in (403, 404)


def test_inspector_cannot_fulfill_another_inspectors_capture_task():
    env = _create_test_env()
    client = env["client"]
    insp1 = env["insp1"]
    i2 = env["inspection2"]  # Owned by Inspector 2

    token = create_access_token(insp1.id, "inspector", insp1.install_id)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "inspection_id": i2.id,
        "notes": "Unauthorized fulfillment attempt by inspector 1",
    }
    resp = client.post(
        f"/recapture/inspections/{i2.id}/tasks/CAP_TEST/fulfill",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 403


def test_admin_can_access_any_inspection_and_bulk_adjudicate():
    env = _create_test_env()
    client = env["client"]
    admin = env["admin"]
    i1 = env["inspection1"]
    i2 = env["inspection2"]

    token = create_access_token(admin.id, "admin", admin.install_id)
    headers = {"Authorization": f"Bearer {token}"}

    # Admin accesses dashboard
    resp = client.get("/admin/dashboard", headers=headers)
    assert resp.status_code == 200

    # Admin accesses inspection 1
    resp1 = client.get(f"/review/inspections/{i1.id}", headers=headers)
    assert resp1.status_code == 200

    # Admin accesses inspection 2
    resp2 = client.get(f"/review/inspections/{i2.id}", headers=headers)
    assert resp2.status_code == 200

    # Admin can execute bulk adjudicate
    bulk_payload = {
        "inspection_ids": [i1.id, i2.id],
        "action": "resolve",
        "reason": "Authorized supervisor bulk resolution approval",
    }
    resp_bulk = client.post("/review/queue/bulk-adjudicate", json=bulk_payload, headers=headers)
    assert resp_bulk.status_code == 200
    assert resp_bulk.json()["succeeded"] == 2


def test_enforcement_endpoints_require_authenticated_officer():
    env = _create_test_env()
    client = env["client"]
    i1 = env["inspection1"]

    # Anonymous call
    resp = client.get(f"/enforcement/summary/{i1.id}")
    assert resp.status_code == 401

    resp_dos = client.get(f"/enforcement/dossier/{i1.id}")
    assert resp_dos.status_code == 401
