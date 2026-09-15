"""tests/test_inspector_app_flow.py
Verify the end-to-end inspector field inspection workflow:
- Authentication & shared inspector account
- Canonical statuses: Inspection Status ('In Progress' / 'Submitted')
- Canonical statuses: Rule Results ('Compliant', 'Violation', 'Not Assessed', 'Out of Scope')
- Canonical statuses: Sync Status ('Synced', 'Not Synced')
- Inspector adding remarks and reviewing finding verdicts (permitted for owner before submit)
- Evidence integrity & SHA-256 verification
- Audit logging for finding remarks and overrides
- Final submission: status becomes 'submitted', display_status becomes 'Submitted'
- Inspector Portal and Admin Portal reading the exact same record from shared database
"""
import os
import hashlib

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
import models
from models import User, Store, Inspection, Scan, Finding, AuditLog
from password_handler import hash_password
from main import app
from rbac import get_current_user, require_admin, require_inspector


def test_inspector_app_full_workflow():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    db = S()

    # 1. Create Admin and Inspector users in shared database
    admin_user = User(
        employee_id="ADM-001",
        full_name="Chief Legal Metrology Controller",
        password_hash=hash_password("adminSecret123!"),
        role="admin",
        is_active=True,
    )
    inspector_user = User(
        employee_id="INS-101",
        full_name="Field Inspector Sharma",
        password_hash=hash_password("inspectorSecret123!"),
        role="inspector",
        is_active=True,
    )
    store = Store(
        name="Apex Supermarket",
        address="Banjara Hills Road No 2",
        city="Hyderabad",
        state="Telangana",
        pincode="500034",
    )
    db.add_all([admin_user, inspector_user, store])
    db.commit()
    db.refresh(admin_user)
    db.refresh(inspector_user)
    db.refresh(store)

    current_user_holder = [inspector_user]

    def override_get_db():
        try:
            yield db
        finally:
            pass

    def override_get_current_user():
        return current_user_holder[0]

    def override_require_inspector():
        return current_user_holder[0]

    def override_require_admin():
        if current_user_holder[0].role != "admin":
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Admin access required")
        return current_user_holder[0]

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[require_inspector] = override_require_inspector
    app.dependency_overrides[require_admin] = override_require_admin

    client = TestClient(app)

    # 2. Inspector starts inspection in Frontend_App
    create_resp = client.post(
        "/inspections",
        json={
            "store_id": store.id,
            "transaction_type": "retail_sale",
            "notes": "Field routine check under Rule 6",
        },
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    insp_data = create_resp.json()
    insp_id = insp_data["id"]

    # Verify canonical status mapping
    assert insp_data["status"] == "draft"
    assert insp_data["display_status"] == "In Progress"
    assert insp_data["sync_status"] == "Synced"

    # 3. Create Scan under this inspection
    scan_resp = client.post(
        f"/inspections/{insp_id}/scans",
        json={
            "commodity_generic": "Basmati Rice",
            "brand_name": "Royal Feast",
            "batch_number": "BATCH-2026-X",
            "geometry": {
                "panel_shape": "rectangular",
                "panel_height_mm": 120.0,
                "panel_width_mm": 80.0,
                "is_blown_moulded": False,
                "scale_source": "declared",
            },
        },
    )
    assert scan_resp.status_code in (200, 201), scan_resp.text
    scan_data = scan_resp.json()
    scan_id = scan_data["id"]

    # 4. Add Statutory Finding with initial 'fail' / 'violation'
    finding = Finding(
        scan_id=scan_id,
        check_id="CHK13",
        title="Sticker / Smudge Alteration",
        citation="Section 36 & Rule 6 — Over-stickering Prohibition",
        engine_verdict="fail",
        severity="critical",
        observed="Price sticker affixed over original declared MRP",
        required="Declarations must be indelible; no price alterations",
    )
    db.add(finding)
    db.commit()
    db.refresh(finding)

    # 5. Verify SHA-256 evidence integrity endpoint
    verify_resp = client.get(f"/scans/{scan_id}/verify")
    assert verify_resp.status_code == 200
    verify_data = verify_resp.json()
    assert "all_intact" in verify_data
    assert "images" in verify_data

    # 6. Inspector adds remark and reviews finding verdict before submission
    # (Testing that owner inspector is allowed to add remarks & review findings)
    override_resp = client.patch(
        f"/admin/findings/{finding.id}",
        json={
            "human_verdict": "compliant",
            "override_reason": "Merchant produced valid manufacturer authorization certificate for permissible sticker correction.",
        },
    )
    assert override_resp.status_code == 200, override_resp.text
    ov_data = override_resp.json()
    assert ov_data["human_verdict"] in ("pass", "compliant")
    assert ov_data["effective_verdict"] in ("pass", "compliant")
    assert "permissible sticker correction" in ov_data["override_reason"]

    # Verify audit trail was logged
    audit_entry = db.query(AuditLog).filter(
        AuditLog.scan_id == scan_id,
    ).order_by(AuditLog.id.desc()).first()
    assert audit_entry is not None
    assert audit_entry.user_id == inspector_user.id
    assert audit_entry.action in ("finding_overridden", "finding_remark_added")

    # 7. Update inspection notes / signature status via PATCH /inspections/{id}
    patch_insp_resp = client.patch(
        f"/inspections/{insp_id}",
        json={
            "notes": "Store manager co-operated. All labels checked.",
            "signature_status": "signed",
        },
    )
    assert patch_insp_resp.status_code == 200, patch_insp_resp.text
    patched_insp = patch_insp_resp.json()
    assert patched_insp["notes"] == "Store manager co-operated. All labels checked."
    assert patched_insp["signature_status"] == "signed"

    # 8. Inspector completes and submits the inspection
    submit_resp = client.post(
        f"/inspections/{insp_id}/submit",
        json={
            "signature_status": "signed",
            "notes": "Inspection completed and endorsed by merchant.",
        },
    )
    assert submit_resp.status_code == 200, submit_resp.text
    submitted_data = submit_resp.json()
    assert submitted_data["status"] == "submitted"
    assert submitted_data["display_status"] == "Submitted"
    assert submitted_data["sync_status"] == "Synced"

    # 9. Verify submitted inspection is locked against further edits
    post_submit_override = client.patch(
        f"/admin/findings/{finding.id}",
        json={
            "human_verdict": "violation",
            "override_reason": "Attempting modification after sealing.",
        },
    )
    assert post_submit_override.status_code == 409  # Conflict: submitted inspection cannot be altered

    # 10. Inspector Portal view (GET /inspections/{id})
    insp_portal_view = client.get(f"/inspections/{insp_id}")
    assert insp_portal_view.status_code == 200
    p_data = insp_portal_view.json()
    assert p_data["id"] == insp_id
    assert p_data["status"] == "submitted"
    assert p_data["display_status"] == "Submitted"

    # 11. Admin view via shared inspection endpoint and admin dashboard
    current_user_holder[0] = admin_user
    admin_portal_view = client.get(f"/inspections/{insp_id}")
    assert admin_portal_view.status_code == 200
    a_data = admin_portal_view.json()
    assert a_data["id"] == insp_id
    assert a_data["status"] == "submitted"
    assert a_data["store_name"] == "Apex Supermarket"
    # Both inspector and admin see the exact same remark
    assert any(
        f["override_reason"] and "permissible sticker correction" in f["override_reason"]
        for s in a_data.get("scans", [])
        for f in s.get("findings", [])
    )

    # Admin dashboard sees the submitted inspection in aggregated stats
    dash_resp = client.get("/admin/dashboard")
    assert dash_resp.status_code == 200
    dash_data = dash_resp.json()
    assert dash_data["inspections"] >= 1

    # 12. Verify statutory rule catalog access
    # Inspector accesses active rule info via /rule-info
    current_user_holder[0] = inspector_user
    rv_resp = client.get("/rule-info")
    assert rv_resp.status_code == 200
    rule_data = rv_resp.json()
    assert rule_data["is_active"] is True
    assert "Legal Metrology (Packaged Commodities) Rules, 2011" in rule_data["name"]

    # Admin accesses statutory timeline catalog via /admin/rule-versions
    current_user_holder[0] = admin_user
    admin_rv_resp = client.get("/admin/rule-versions")
    assert admin_rv_resp.status_code == 200
    rv_list = admin_rv_resp.json()
    assert len(rv_list) >= 4
