"""routers/reports.py — the inspector's day, as JSON and as documents.

Synthesised to the §8.2 inventory. report_generator is imported lazily inside
the document endpoints so that importing the app (uvicorn boot, non-vision
tests) never requires reportlab or python-docx.
"""
from datetime import date, datetime, timezone

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
    """(inspection, live scans, {scan_id: ordered findings}) for one day."""
    inspections = (
        db.query(Inspection)
        .filter(Inspection.user_id == user.id, Inspection.inspection_date == day)
        .order_by(Inspection.id)
        .all()
    )
    blocks = []
    for insp in inspections:
        scans = (
            db.query(Scan)
            .filter(Scan.inspection_id == insp.id, Scan.duplicate_of.is_(None))
            .order_by(Scan.id)
            .all()
        )
        findings_by_scan = {s.id: _ordered_findings(db, s.id) for s in scans}
        blocks.append((insp, scans, findings_by_scan))
    return blocks
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
    out = settings.OUT_DIR / f"today_{user.id}_{day.isoformat()}.docx"
    generate_daily_docx(user, day, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type=_DOCX_MIME)


@router.get("/today.pdf")
def todays_pdf(day: date | None = Query(default=None),
               user: User = Depends(require_inspector),
               db: Session = Depends(get_db)):
    day = day or date.today()
    blocks = _day_blocks(db, user, day)
    chain_head = verify_chain(db).get("head") or ""
    from report_generator import generate_daily_pdf
    out = settings.OUT_DIR / f"today_{user.id}_{day.isoformat()}.pdf"
    generate_daily_pdf(user, day, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type="application/pdf")


@router.get("/today.xlsx")
def todays_xlsx(day: date | None = Query(default=None),
                user: User = Depends(require_inspector),
                db: Session = Depends(get_db)):
    day = day or date.today()
    blocks = _day_blocks(db, user, day)
    chain_head = verify_chain(db).get("head") or ""
    from report_generator import generate_daily_xlsx
    out = settings.OUT_DIR / f"today_{user.id}_{day.isoformat()}.xlsx"
    generate_daily_xlsx(user, day, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type=_XLSX_MIME)


@router.get("/today.csv")
def todays_csv(day: date | None = Query(default=None),
               user: User = Depends(require_inspector),
               db: Session = Depends(get_db)):
    day = day or date.today()
    blocks = _day_blocks(db, user, day)
    chain_head = verify_chain(db).get("head") or ""
    from report_generator import generate_daily_csv
    out = settings.OUT_DIR / f"today_{user.id}_{day.isoformat()}.csv"
    generate_daily_csv(user, day, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type=_CSV_MIME)


@router.get("/inspections/{inspection_id}/pdf")
def inspection_pdf(inspection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Per-inspection PDF — 04_PRD §5.8, Backend §9."""
    from report_generator import generate_daily_pdf
    insp = db.get(Inspection, inspection_id)
    if not insp:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Inspection not found")
    # ownership: inspector sees own, admin sees all
    if user.role != "admin" and insp.user_id != user.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Inspection not found")
    scans = db.query(Scan).filter(Scan.inspection_id == insp.id, Scan.duplicate_of.is_(None)).all()
    findings_by_scan = {s.id: _ordered_findings(db, s.id) for s in scans}
    blocks = [(insp, scans, findings_by_scan)]
    chain_head = verify_chain(db).get("head") or ""
    out = settings.OUT_DIR / f"inspection_{insp.id}.pdf"
    generate_daily_pdf(user, insp.inspection_date, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type="application/pdf")


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
    scans = db.query(Scan).filter(Scan.inspection_id == insp.id, Scan.duplicate_of.is_(None)).all()
    findings_by_scan = {s.id: _ordered_findings(db, s.id) for s in scans}
    blocks = [(insp, scans, findings_by_scan)]
    chain_head = verify_chain(db).get("head") or ""
    out = settings.OUT_DIR / f"inspection_{insp.id}.docx"
    generate_daily_docx(user, insp.inspection_date, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type=_DOCX_MIME)


def _inspection_blocks(db: Session, user: User, inspection_id: int):
    """Shared lookup + ownership guard for the per-inspection document routes."""
    from fastapi import HTTPException
    insp = db.get(Inspection, inspection_id)
    if not insp or (user.role != "admin" and insp.user_id != user.id):
        raise HTTPException(status_code=404, detail="Inspection not found")
    scans = (db.query(Scan)
             .filter(Scan.inspection_id == insp.id, Scan.duplicate_of.is_(None))
             .all())
    findings_by_scan = {s.id: _ordered_findings(db, s.id) for s in scans}
    return insp, [(insp, scans, findings_by_scan)]


@router.get("/inspections/{inspection_id}/xlsx")
def inspection_xlsx(inspection_id: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    from report_generator import generate_daily_xlsx
    insp, blocks = _inspection_blocks(db, user, inspection_id)
    chain_head = verify_chain(db).get("head") or ""
    out = settings.OUT_DIR / f"inspection_{insp.id}.xlsx"
    generate_daily_xlsx(user, insp.inspection_date, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type=_XLSX_MIME)


@router.get("/inspections/{inspection_id}/csv")
def inspection_csv(inspection_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    from report_generator import generate_daily_csv
    insp, blocks = _inspection_blocks(db, user, inspection_id)
    chain_head = verify_chain(db).get("head") or ""
    out = settings.OUT_DIR / f"inspection_{insp.id}.csv"
    generate_daily_csv(user, insp.inspection_date, blocks, chain_head, out)
    return FileResponse(out, filename=out.name, media_type=_CSV_MIME)


@router.get("/verify")
def verify_report(inspection: int, head: str, db: Session = Depends(get_db)):
    """QR verification — https URL from PUBLIC_BASE_URL, not niyamnetra:// 05 §2.7."""
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
