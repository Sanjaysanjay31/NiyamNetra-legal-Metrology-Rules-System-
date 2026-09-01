"""routers/admin.py — the override path (§8.6, verbatim) and the admin surface
built to the §8.2 inventory around it.
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from audit import append_audit, verify_chain
from config import settings
from database import get_db
from models import AuditLog, Finding, Scan, User
from password_handler import hash_password
from queries import (
    admin_stats, inspection_trend, review_queue_size, violations_by_check,
)
from rbac import require_admin
from schemas import (
    AdminDashboardResponse, AuditEntryOut, CheckTally, CreateUserRequest,
    OverrideFindingRequest, ResetInstallRequest, ResultCounts, TrendPoint,
    UpdateUserRequest, UserOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _counts(d: dict) -> ResultCounts:
    return ResultCounts(
        total=d.get("total") or 0,
        compliant=d.get("compliant") or 0,
        violation=d.get("violation") or 0,
        not_assessed=d.get("not_assessed") or 0,
        out_of_scope=d.get("out_of_scope") or 0,
    )
@router.get("/dashboard", response_model=AdminDashboardResponse)
def dashboard(start: date | None = Query(default=None),
              end: date | None = Query(default=None),
              user: User = Depends(require_admin),
              db: Session = Depends(get_db)):
    end = end or date.today()
    start = start or (end - timedelta(days=29))
    stats = admin_stats(db, start, end)
    top = [
        CheckTally(check_id=r["check_id"], title=r["title"], count=r["count"])
        for r in violations_by_check(db, start, end)
    ]
    trend = [
        TrendPoint(day=r["inspection_date"], counts=_counts(r))
        for r in inspection_trend(db, start, end)
    ]
    return AdminDashboardResponse(
        period_start=start, period_end=end,
        inspections=stats.get("inspections") or 0,
        active_inspectors=stats.get("active_inspectors") or 0,
        counts=_counts(stats),
        review_queue=stats.get("review_queue") or 0,
        top_failed_checks=top, trend=trend,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.employee_id).all()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: CreateUserRequest, user: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    if db.query(User).filter(User.employee_id == body.employee_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Employee ID exists")
    target = User(
        employee_id=body.employee_id, full_name=body.full_name,
        password_hash=hash_password(body.password), role=body.role,
        jurisdiction=body.jurisdiction, email=body.email, phone=body.phone,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    append_audit(db, user_id=user.id, action="user_created",
                 new_value=f"{target.employee_id}:{target.role}")
    return target


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UpdateUserRequest,
                user: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)
    append_audit(db, user_id=user.id, action="user_updated",
                 new_value=f"{target.employee_id}:{sorted(changes)}")
    return target


@router.post("/users/{user_id}/reset-install")
def reset_install(user_id: int, body: ResetInstallRequest,
                  user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Unbind the device and invalidate its live sessions. The next login on any
    device rebinds. token_epoch is bumped so refresh tokens minted for the old
    install die immediately (§3.2)."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    old = target.install_id
    target.install_id = None
    target.install_bound_at = None
    target.token_epoch += 1
    db.commit()
    append_audit(db, user_id=user.id, action="install_reset",
                 old_value=old, reason=body.reason)
    return {"user_id": user_id, "install_id": None}


@router.get("/review-queue")
def review_queue(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    # The same count the badge shows, computed the same way (queries §review).
    return {"count": review_queue_size(db)}


@router.patch("/findings/{finding_id}")
def override_finding(
    finding_id: int,
    body: OverrideFindingRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """A human may disagree with the engine. The disagreement is recorded
    alongside the engine's verdict, never in place of it. C11.

    engine_verdict is protected by a database trigger as well (§10.3), so a
    stray UPDATE from a script cannot do what this endpoint refuses to do.
    """
    f = db.get(Finding, finding_id)
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Finding not found")

    old = f.human_verdict or f.engine_verdict
    f.human_verdict = body.human_verdict
    f.override_reason = body.override_reason
    f.overridden_by = user.id
    f.overridden_at = datetime.now(timezone.utc)
    db.commit()

    scan = db.get(Scan, f.scan_id)
    append_audit(
        db, inspection_id=scan.inspection_id, scan_id=scan.id, user_id=user.id,
        action="finding_overridden",
        old_value=f"{f.check_id}={old}",
        new_value=f"{f.check_id}={body.human_verdict}",
        reason=body.override_reason,
    )
    return {"finding_id": f.id, "engine_verdict": f.engine_verdict,
            "human_verdict": f.human_verdict}


@router.get("/audit")
def audit_log(limit: int = Query(default=50, ge=1, le=500),
              offset: int = Query(default=0, ge=0),
              user: User = Depends(require_admin), db: Session = Depends(get_db)):
    total = db.query(AuditLog).count()
    rows = (db.query(AuditLog).order_by(AuditLog.seq.desc())
            .offset(offset).limit(limit).all())
    state = verify_chain(db)
    return {
        "total": total, "limit": limit, "offset": offset,
        "chain_intact": state.get("intact"), "chain_head": state.get("head"),
        "entries": [AuditEntryOut.model_validate(r) for r in rows],
    }


@router.get("/rules")
def rules_status(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from rules_engine import ALL_CHECK_IDS, catalog_hash, load_catalog
    cat = load_catalog()
    return {
        "rules_as_at": settings.RULES_AS_AT,
        "engine_version": settings.ENGINE_VERSION,
        "catalog_hash": catalog_hash(),
        "checks_registered": len(ALL_CHECK_IDS),
        "second_schedule_populated": bool(cat.get("second_schedule")),
        "net_quantity_heights_populated": bool(cat.get("net_quantity_heights")),
        "meta": cat.get("_meta"),
    }
