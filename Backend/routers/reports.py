"""routers/reports.py — the inspector's day, as JSON and as documents.

Synthesised to the §8.2 inventory. report_generator is imported lazily inside
the document endpoints so that importing the app (uvicorn boot, non-vision
tests) never requires reportlab or python-docx.
"""
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from audit import verify_chain
from config import settings
from database import get_db
from models import Finding, Inspection, Scan, User
from queries import active_dates, store_breakdown, todays_stats
from rbac import get_current_user, owned_inspection, require_inspector

router = APIRouter(prefix="/reports", tags=["reports"])

_DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
_XLSX_MIME = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)
_CSV_MIME = "text/csv; charset=utf-8"


from schemas import ResultCounts, StoreBreakdown, TodaysReportResponse, UserOut


def _counts(d: dict) -> ResultCounts:
    return ResultCounts(
        total=d.get("total") or 0,
        compliant=d.get("compliant") or 0,
        violation=d.get("violation") or 0,
        not_assessed=d.get("not_assessed") or 0,
        out_of_scope=d.get("out_of_scope") or 0,
    )


def _ordered_findings(db: Session, scan_id: int) -> list[Finding]:
    from rules_engine import ALL_CHECK_IDS
    order = {cid: i for i, cid in enumerate(ALL_CHECK_IDS)}
    rows = db.query(Finding).filter(Finding.scan_id == scan_id).all()
    rows.sort(key=lambda r: order.get(r.check_id, 99))
    return rows


def _day_blocks(db: Session, user: User, day: date):
    """(inspection, live scans, {scan_id: ordered findings}) for one day.

    Eager-loads store/inspector/scans/findings in two queries (no N+1):
    inspections with joined store+inspector and selectin scans, then one
    findings query for all live scan ids grouped in Python.
    """
    from sqlalchemy.orm import joinedload, selectinload
    inspections = (
        db.query(Inspection)
        .options(joinedload(Inspection.store), joinedload(Inspection.inspector),
                 selectinload(Inspection.scans))
        .filter(Inspection.user_id == user.id, Inspection.inspection_date == day)
        .order_by(Inspection.id)
        .all()
    )
    live_ids: list[int] = []
    live_by_insp: dict[int, list] = {}
    for insp in inspections:
        live = sorted([s for s in insp.scans if s.duplicate_of is None], key=lambda s: s.id)
        live_by_insp[insp.id] = live
        live_ids.extend(s.id for s in live)
    from rules_engine import ALL_CHECK_IDS as _IDS
    _order = {cid: i for i, cid in enumerate(_IDS)}
    _by_scan: dict[int, list] = {sid: [] for sid in live_ids}
    if live_ids:
        for f in db.query(Finding).filter(Finding.scan_id.in_(live_ids)).all():
            _by_scan.setdefault(f.scan_id, []).append(f)
        for v in _by_scan.values():
            v.sort(key=lambda r: _order.get(r.check_id, 99))
    blocks = []
    for insp in inspections:
        scans = live_by_insp[insp.id]
        findings_by_scan = {s.id: _by_scan.get(s.id, []) for s in scans}
        blocks.append((insp, scans, findings_by_scan))
    return blocks


def _unique_out(suffix: str) -> Path:
    """Unique OUT_DIR filename (uuid suffix) so concurrent report requests for
    the same day/inspection never clobber each other's file."""
    import uuid as _uuid
    from pathlib import Path as _P
    try:
        settings.OUT_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        import logging as _logging
        _logging.getLogger(__name__).warning("out dir unavailable: %s", e)
        raise
    return settings.OUT_DIR / f"{suffix}_{_uuid.uuid4().hex[:8]}"


def _generate_or_503(fn, *args, **kwargs):
    """Report generation writes to OUT_DIR; disk errors are 503, not 500."""
    from fastapi import HTTPException
    try:
        return fn(*args, **kwargs)
    except OSError as e:
        import logging as _logging
        _logging.getLogger(__name__).warning("report write failed: %s", e)
        raise HTTPException(status_code=503, detail="Report store unavailable; retry shortly")


def _log_report(db: Session, user: User, kind: str, fmt: str, label: str, out_path) -> None:
    """Archive WHAT was generated (the 'no archived-doc list' fix). The file
    stays ephemeral; the row (who/kind/label/sha256) is the archive. Never
    fails the download."""
    import hashlib
    from pathlib import Path as _P
    try:
        _p = _P(str(out_path))
        digest = hashlib.sha256(_p.read_bytes()).hexdigest()
        size = _p.stat().st_size
    except Exception:
        digest, size = None, None
    try:
        from models import ReportRecord
        db.add(ReportRecord(generated_by=user.id, kind=kind, fmt=fmt,
                            label=label[:160], file_sha256=digest, byte_size=size))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
@router.get("/today", response_model=TodaysReportResponse)
def todays_report(day: date | None = Query(default=None),
                  user: User = Depends(require_inspector),
                  db: Session = Depends(get_db)):
    day = day or date.today()
    stats = todays_stats(db, user.id, day)
    stores = [
        StoreBreakdown(store_id=r["id"], store_name=r["name"], counts=_counts(r))
        for r in store_breakdown(db, user.id, day)
    ]
    return TodaysReportResponse(
        report_date=day,
        inspector=UserOut.model_validate(user),
        inspections=stats.get("inspections") or 0,
        counts=_counts(stats),
        stores=stores,
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/calendar")
def calendar(year: int = Query(..., ge=2000, le=2100),
             month: int = Query(..., ge=1, le=12),
             user: User = Depends(require_inspector),
             db: Session = Depends(get_db)):
    return {
        "year": year, "month": month,
        "dates": [d.isoformat() for d in active_dates(db, user.id, year, month)],
    }


@router.get("/today.docx")
def todays_docx(day: date | None = Query(default=None),
                user: User = Depends(require_inspector),
                db: Session = Depends(get_db)):
    day = day or date.today()
    blocks = _day_blocks(db, user, day)
    chain_head = verify_chain(db).get("head") or ""
    from report_generator import generate_daily_docx
    out = _unique_out(f"today_{user.id}_{day.isoformat()}.docx")
    _generate_or_503(generate_daily_docx, user, day, blocks, chain_head, out)
    _log_report(db, user, "day", "docx", day.isoformat(), out)
    return FileResponse(out, filename=f"today_{user.id}_{day.isoformat()}.docx", media_type=_DOCX_MIME)


@router.get("/today.pdf")
def todays_pdf(day: date | None = Query(default=None),
                user: User = Depends(require_inspector),
                db: Session = Depends(get_db)):
    day = day or date.today()
    blocks = _day_blocks(db, user, day)
    chain_head = verify_chain(db).get("head") or ""
    from report_generator import generate_daily_pdf
    out = _unique_out(f"today_{user.id}_{day.isoformat()}.pdf")
    _generate_or_503(generate_daily_pdf, user, day, blocks, chain_head, out)
    _log_report(db, user, "day", "pdf", day.isoformat(), out)
    return FileResponse(out, filename=f"today_{user.id}_{day.isoformat()}.pdf", media_type="application/pdf")


@router.get("/today.xlsx")
def todays_xlsx(day: date | None = Query(default=None),
                user: User = Depends(require_inspector),
                db: Session = Depends(get_db)):
    day = day or date.today()
    blocks = _day_blocks(db, user, day)
    chain_head = verify_chain(db).get("head") or ""
    from report_generator import generate_daily_xlsx
    out = _unique_out(f"today_{user.id}_{day.isoformat()}.xlsx")
    _generate_or_503(generate_daily_xlsx, user, day, blocks, chain_head, out)
    _log_report(db, user, "day", "xlsx", day.isoformat(), out)
    return FileResponse(out, filename=f"today_{user.id}_{day.isoformat()}.xlsx", media_type=_XLSX_MIME)


@router.get("/today.csv")
def todays_csv(day: date | None = Query(default=None),
                user: User = Depends(require_inspector),
                db: Session = Depends(get_db)):
    day = day or date.today()
    blocks = _day_blocks(db, user, day)
    chain_head = verify_chain(db).get("head") or ""
    from report_generator import generate_daily_csv
    out = _unique_out(f"today_{user.id}_{day.isoformat()}.csv")
    _generate_or_503(generate_daily_csv, user, day, blocks, chain_head, out)
    _log_report(db, user, "day", "csv", day.isoformat(), out)
    return FileResponse(out, filename=f"today_{user.id}_{day.isoformat()}.csv", media_type=_CSV_MIME)


@router.get("/inspections/{inspection_id}/pdf")
def inspection_pdf(inspection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Per-inspection PDF — 04_PRD §5.8, Backend §9.

    Attribution fix: the header names the VISITED officer (inspection owner),
    not the caller — an admin downloading another officer's visit previously
    got their own name stamped on it.
    """
    from report_generator import generate_daily_pdf
    insp = db.get(Inspection, inspection_id)
    if not insp:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Inspection not found")
    # ownership: inspector sees own, admin sees all
    if user.role != "admin" and insp.user_id != user.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Inspection not found")
    owner = db.get(User, insp.user_id) or user
    scans = db.query(Scan).filter(Scan.inspection_id == insp.id, Scan.duplicate_of.is_(None)).all()
    _sids = [s.id for s in scans]
    from rules_engine import ALL_CHECK_IDS as _IDS2
    _ord = {cid: i for i, cid in enumerate(_IDS2)}
    _rows = db.query(Finding).filter(Finding.scan_id.in_(_sids)).all() if _sids else []
    _grp: dict[int, list] = {sid: [] for sid in _sids}
    for _f in _rows:
        _grp.setdefault(_f.scan_id, []).append(_f)
    for _v in _grp.values():
        _v.sort(key=lambda r: _ord.get(r.check_id, 99))
    findings_by_scan = {s.id: _grp.get(s.id, []) for s in scans}
    blocks = [(insp, scans, findings_by_scan)]
    chain_head = verify_chain(db).get("head") or ""
    out = _unique_out(f"inspection_{insp.id}.pdf")
    _generate_or_503(generate_daily_pdf, owner, insp.inspection_date, blocks, chain_head, out)
    _log_report(db, user, "inspection", "pdf", f"inspection-{insp.id}", out)
    return FileResponse(out, filename=f"inspection_{insp.id}.pdf", media_type="application/pdf")


@router.get("/inspections/{inspection_id}/docx")
def inspection_docx(inspection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from report_generator import generate_daily_docx
    insp = db.get(Inspection, inspection_id)
    if not insp:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Inspection not found")
    if user.role != "admin" and insp.user_id != user.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Inspection not found")
    owner = db.get(User, insp.user_id) or user
    scans = db.query(Scan).filter(Scan.inspection_id == insp.id, Scan.duplicate_of.is_(None)).all()
    _sids = [s.id for s in scans]
    from rules_engine import ALL_CHECK_IDS as _IDS3
    _ord = {cid: i for i, cid in enumerate(_IDS3)}
    _rows = db.query(Finding).filter(Finding.scan_id.in_(_sids)).all() if _sids else []
    _grp: dict[int, list] = {sid: [] for sid in _sids}
    for _f in _rows:
        _grp.setdefault(_f.scan_id, []).append(_f)
    for _v in _grp.values():
        _v.sort(key=lambda r: _ord.get(r.check_id, 99))
    findings_by_scan = {s.id: _grp.get(s.id, []) for s in scans}
    blocks = [(insp, scans, findings_by_scan)]
    chain_head = verify_chain(db).get("head") or ""
    out = _unique_out(f"inspection_{insp.id}.docx")
    _generate_or_503(generate_daily_docx, owner, insp.inspection_date, blocks, chain_head, out)
    _log_report(db, user, "inspection", "docx", f"inspection-{insp.id}", out)
    return FileResponse(out, filename=f"inspection_{insp.id}.docx", media_type=_DOCX_MIME)


def _inspection_blocks(db: Session, user: User, inspection_id: int):
    """Shared lookup + ownership guard for the per-inspection document routes."""
    from fastapi import HTTPException
    from rules_engine import ALL_CHECK_IDS as _IDS4
    insp = db.get(Inspection, inspection_id)
    if not insp or (user.role != "admin" and insp.user_id != user.id):
        raise HTTPException(status_code=404, detail="Inspection not found")
    scans = (db.query(Scan)
             .filter(Scan.inspection_id == insp.id, Scan.duplicate_of.is_(None))
             .all())
    _sids = [s.id for s in scans]
    _ord = {cid: i for i, cid in enumerate(_IDS4)}
    _rows = db.query(Finding).filter(Finding.scan_id.in_(_sids)).all() if _sids else []
    _grp: dict[int, list] = {sid: [] for sid in _sids}
    for _f in _rows:
        _grp.setdefault(_f.scan_id, []).append(_f)
    for _v in _grp.values():
        _v.sort(key=lambda r: _ord.get(r.check_id, 99))
    findings_by_scan = {s.id: _grp.get(s.id, []) for s in scans}
    return insp, [(insp, scans, findings_by_scan)]


@router.get("/inspections/{inspection_id}/xlsx")
def inspection_xlsx(inspection_id: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    from report_generator import generate_daily_xlsx
    insp, blocks = _inspection_blocks(db, user, inspection_id)
    owner = db.get(User, insp.user_id) or user
    chain_head = verify_chain(db).get("head") or ""
    out = _unique_out(f"inspection_{insp.id}.xlsx")
    _generate_or_503(generate_daily_xlsx, owner, insp.inspection_date, blocks, chain_head, out)
    _log_report(db, user, "inspection", "xlsx", f"inspection-{insp.id}", out)
    return FileResponse(out, filename=f"inspection_{insp.id}.xlsx", media_type=_XLSX_MIME)


@router.get("/inspections/{inspection_id}/csv")
def inspection_csv(inspection_id: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    from report_generator import generate_daily_csv
    insp, blocks = _inspection_blocks(db, user, inspection_id)
    owner = db.get(User, insp.user_id) or user
    chain_head = verify_chain(db).get("head") or ""
    out = _unique_out(f"inspection_{insp.id}.csv")
    _generate_or_503(generate_daily_csv, owner, insp.inspection_date, blocks, chain_head, out)
    _log_report(db, user, "inspection", "csv", f"inspection-{insp.id}", out)
    return FileResponse(out, filename=f"inspection_{insp.id}.csv", media_type=_CSV_MIME)


def _range_blocks_for(db: Session, start: date, end: date,
                      user_ids: list[int] | None):
    """Blocks for every day in [start, end] (cap 31 days). user_ids=None means
    all inspectors (admin office-wide); otherwise only those users."""
    from datetime import timedelta as _td
    from sqlalchemy.orm import joinedload, selectinload
    if (end - start).days > 31 or (end - start).days < 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Range must be 0-31 days")
    from rules_engine import ALL_CHECK_IDS as _IDS5
    _order = {cid: i for i, cid in enumerate(_IDS5)}
    day, blocks = start, []
    while day <= end:
        q = (db.query(Inspection)
             .options(joinedload(Inspection.store), joinedload(Inspection.inspector),
                      selectinload(Inspection.scans)))
        if user_ids is not None:
            q = q.filter(Inspection.user_id.in_(user_ids))
        for insp in q.filter(Inspection.inspection_date == day).order_by(Inspection.id).all():
            live = sorted([s for s in insp.scans if s.duplicate_of is None], key=lambda s: s.id)
            _sids = [s.id for s in live]
            _grp: dict[int, list] = {sid: [] for sid in _sids}
            if _sids:
                for f in db.query(Finding).filter(Finding.scan_id.in_(_sids)).all():
                    _grp.setdefault(f.scan_id, []).append(f)
                for v in _grp.values():
                    v.sort(key=lambda r: _order.get(r.check_id, 99))
            blocks.append((insp, live, {s.id: _grp.get(s.id, []) for s in live}))
        day += _td(days=1)
    return blocks


def _range_doc(fmt: str, start: date, end: date, blocks, owner, chain_head: str,
               db=None, caller=None, kind: str = "range"):
    from fastapi import HTTPException
    label = f"{start.strftime('%d %B %Y')} to {end.strftime('%d %B %Y')}"
    if fmt == "pdf":
        from report_generator import generate_daily_pdf as _g
        out = _unique_out(f"range_{start.isoformat()}_{end.isoformat()}.pdf")
        _generate_or_503(_g, owner, end, blocks, chain_head, out,
                         period_label=label)
        if db is not None and caller is not None:
            _log_report(db, caller, kind, "pdf", label, out)
        return FileResponse(out, filename=f"range_{start.isoformat()}_{end.isoformat()}.pdf",
                            media_type="application/pdf")
    if fmt == "docx":
        from report_generator import generate_daily_docx as _g
        out = _unique_out(f"range_{start.isoformat()}_{end.isoformat()}.docx")
        _generate_or_503(_g, owner, end, blocks, chain_head, out,
                         period_label=label)
        if db is not None and caller is not None:
            _log_report(db, caller, kind, "docx", label, out)
        return FileResponse(out, filename=f"range_{start.isoformat()}_{end.isoformat()}.docx",
                            media_type=_DOCX_MIME)
    if fmt == "xlsx":
        from report_generator import generate_daily_xlsx as _g
        out = _unique_out(f"range_{start.isoformat()}_{end.isoformat()}.xlsx")
        _generate_or_503(_g, owner, end, blocks, chain_head, out,
                         period_label=label)
        if db is not None and caller is not None:
            _log_report(db, caller, kind, "xlsx", label, out)
        return FileResponse(out, filename=f"range_{start.isoformat()}_{end.isoformat()}.xlsx",
                            media_type=_XLSX_MIME)
    if fmt == "csv":
        from report_generator import generate_daily_csv as _g
        out = _unique_out(f"range_{start.isoformat()}_{end.isoformat()}.csv")
        _generate_or_503(_g, owner, end, blocks, chain_head, out,
                         period_label=label)
        if db is not None and caller is not None:
            _log_report(db, caller, kind, "csv", label, out)
        return FileResponse(out, filename=f"range_{start.isoformat()}_{end.isoformat()}.csv",
                            media_type=_CSV_MIME)
    raise HTTPException(status_code=404, detail="Unknown format")


@router.get("/range.{fmt}")
def range_report(fmt: str, start: date = Query(...), end: date = Query(...),
                 user: User = Depends(require_inspector),
                 db: Session = Depends(get_db)):
    """One document for a month-of-work (own visits, 0-31 days) — the fix for
    'a month of work = N downloads'. fmt is pdf|docx|xlsx|csv."""
    blocks = _range_blocks_for(db, start, end, [user.id])
    return _range_doc(fmt, start, end, blocks, user, verify_chain(db).get("head") or "",
                      db=db, caller=user, kind="range")


@router.get("/verify")
def verify_report(inspection: int, head: str, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """QR verification — https URL from PUBLIC_BASE_URL, not niyamnetra:// 05 §2.7.

    Authenticated: requires a valid access token (inspector or admin) so the
    chain-head prefix cannot be probed anonymously. Response shape unchanged.
    """
    state = verify_chain(db)
    current_head = state.get("head") or ""
    # head is first 16 chars of chain_head embedded in QR
    match = current_head.startswith(head) or head == current_head[:16]
    insp = db.get(Inspection, inspection)
    return {
        "inspection_id": inspection,
        "head_provided": head,
        "head_current": current_head[:16],
        "match": match,
        "chain_intact": state.get("intact"),
        "inspection_found": insp is not None,
    }
