"""queries.py — the aggregations behind the report and dashboard endpoints.

Also home to resolve_duplicate (06 §3.5): the unique index on
(store_id, commodity_generic, batch_number, inspection_date) is expressed over
a join, so on SQLite it is enforced here in the service layer rather than
declaratively.
"""
from datetime import date
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from models import Finding, Inspection, Scan, Store, User

LIVE = Scan.duplicate_of.is_(None)


def resolve_duplicate(db: Session, scan: Scan, inspection: Inspection) -> int | None:
    """Return the id of an existing scan this one duplicates, or None.

    A conflict is never rejected. The row is kept with duplicate_of set, so no
    field work is lost, and every aggregate excludes duplicate_of IS NOT NULL.
    """
    if not (scan.commodity_generic and scan.batch_number):
        return None
    prior = (
        db.query(Scan.id)
        .join(Inspection, Scan.inspection_id == Inspection.id)
        .filter(
            Inspection.store_id == inspection.store_id,
            Inspection.inspection_date == inspection.inspection_date,
            Scan.commodity_generic == scan.commodity_generic,
            Scan.batch_number == scan.batch_number,
            Scan.duplicate_of.is_(None),
            Scan.id != scan.id,
        )
        .order_by(Scan.id)
        .first()
    )
    return prior[0] if prior else None


def _result_counts(col=Scan.overall_result):
    """Four counts. Not two. A scan that could not be assessed is not a pass.

    total counts SCANS (Scan.id), not join rows: with the outer join an
    inspection with zero scans yields one NULL-scan row, and func.count()
    would count it as 1 while every bucket counts 0 — total != sum. Counting
    Scan.id keeps total == compliant+violation+not_assessed+out_of_scope.
    """
    return (
        func.coalesce(func.count(Scan.id), 0).label("total"),
        func.coalesce(func.sum(case((col == "compliant", 1), else_=0)), 0).label("compliant"),
        func.coalesce(func.sum(case((col == "violation", 1), else_=0)), 0).label("violation"),
        func.coalesce(func.sum(case((col == "not_assessed", 1), else_=0)), 0).label("not_assessed"),
        func.coalesce(func.sum(case((col == "out_of_scope", 1), else_=0)), 0).label("out_of_scope"),
    )
# --- Query 1: today's report for one inspector ---
def todays_stats(db: Session, user_id: int, day: date):
    total, comp, viol, na, oos = _result_counts()
    # Refusals: count inspections (not scans) where the merchant refused to
    # cooperate. signature_status == 'refused' is set by SubmitInspectionRequest
    # and is independent of whether any scans were taken.
    refusals = func.coalesce(
        func.count(func.distinct(case((Inspection.signature_status == "refused", Inspection.id)))), 0
    ).label("refusals")
    row = db.execute(
        select(
            func.count(func.distinct(Inspection.id)).label("inspections"),
            total, comp, viol, na, oos, refusals,
        )
        .select_from(Inspection)
        .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
        .where(Inspection.user_id == user_id, Inspection.inspection_date == day)
    ).one()
    return dict(row._mapping)


# --- Query 2: store-wise breakdown ---
def store_breakdown(db: Session, user_id: int, day: date):
    total, comp, viol, na, oos = _result_counts()
    return [
        dict(r._mapping)
        for r in db.execute(
            select(Store.id, Store.name, total, comp, viol, na, oos)
            .select_from(Inspection)
            .join(Store, Store.id == Inspection.store_id)
            .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
            .where(Inspection.user_id == user_id, Inspection.inspection_date == day)
            .group_by(Store.id, Store.name)
            .order_by(Store.name)
        )
    ]


# --- Query 3: which dates have data (calendar dots) ---
def active_dates(db: Session, user_id: int, year: int, month: int):
    return [
        r[0]
        for r in db.execute(
            select(Inspection.inspection_date)
            .where(
                Inspection.user_id == user_id,
                func.extract("year", Inspection.inspection_date) == year,
                func.extract("month", Inspection.inspection_date) == month,
            )
            .group_by(Inspection.inspection_date)
        )
    ]
# --- Query 4: admin dashboard ---
def admin_stats(db: Session, start: date, end: date):
    total, comp, viol, na, oos = _result_counts()
    row = db.execute(
        select(
            func.coalesce(func.count(func.distinct(Inspection.id)), 0).label("inspections"),
            func.coalesce(func.count(func.distinct(Inspection.user_id)), 0).label("active_inspectors"),
            func.coalesce(func.count(func.distinct(Inspection.store_id)), 0).label("stores_visited"),
            total, comp, viol, na, oos,
        )
        .select_from(Inspection)
        .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
        .where(Inspection.inspection_date.between(start, end))
    ).one()
    d = {k: (v if v is not None else 0) for k, v in dict(row._mapping).items()}
    # Real count, not the hard-coded 0 that v1.x shipped at line 924.
    d["review_queue"] = review_queue_size(db) or 0
    return d


def review_queue_size(db: Session) -> int:
    """Everything a human still has to look at, counted the same way the
    review endpoint lists it, so the badge and the page can never disagree.

    Low-confidence includes NULL confidence (e.g. OCR.space reports no
    per-line confidence): unknown confidence must be reviewed, not skipped.
    """
    na_scans = db.scalar(
        select(func.count()).select_from(Scan)
        .where(Scan.overall_result == "not_assessed", LIVE)
    ) or 0
    low_conf = db.scalar(
        select(func.count()).select_from(Finding)
        .where(or_(Finding.confidence < 0.60, Finding.confidence.is_(None)),
               Finding.human_verdict.is_(None))
    ) or 0
    offline_edits = db.scalar(
        select(func.count()).select_from(Inspection)
        .where(Inspection.edited_offline.is_(True))
    ) or 0
    return na_scans + low_conf + offline_edits


# --- Query 5: violations by check, for the bar chart ---
def violations_by_check(db: Session, start: date, end: date, limit: int = 10):
    verdict = func.coalesce(Finding.human_verdict, Finding.engine_verdict)
    return [
        dict(r._mapping)
        for r in db.execute(
            select(
                Finding.check_id,
                Finding.title,
                func.count().label("count"),
            )
            .join(Scan, Scan.id == Finding.scan_id)
            .join(Inspection, Inspection.id == Scan.inspection_id)
            .where(
                verdict == "fail",
                LIVE,
                Inspection.inspection_date.between(start, end),
            )
            .group_by(Finding.check_id, Finding.title)
            .order_by(func.count().desc())
            .limit(limit)
        )
    ]


# --- Query 7: repeat violators, for enforcement prioritisation ---
def repeat_violators(db: Session, start: date, end: date, limit: int = 20):
    """Stores ranked by live violation-scan count in the window, with the most
    recent violation date. Powers GET /admin/repeat-violators and answers the
    enforcement question 'which premises re-offend' without a map."""
    return [
        dict(r._mapping)
        for r in db.execute(
            select(
                Store.id.label("store_id"),
                Store.name.label("store_name"),
                func.count(Scan.id).label("violations"),
                func.max(Inspection.inspection_date).label("last_violation_date"),
            )
            .select_from(Scan)
            .join(Inspection, Scan.inspection_id == Inspection.id)
            .join(Store, Store.id == Inspection.store_id)
            .where(
                Scan.overall_result == "violation",
                LIVE,
                Inspection.inspection_date.between(start, end),
            )
            .group_by(Store.id, Store.name)
            .order_by(func.count(Scan.id).desc())
            .limit(limit)
        )
    ]


# --- Query 8: proximity flags — different stores implausibly close ---
def proximity_flags(db: Session, start: date, end: date, meters: float = 50.0,
                    limit: int = 50):
    """Pairs of inspections at DIFFERENT stores whose device fixes fall within
    `meters` of each other. Same-store revisits are expected (see
    repeat_violators); different names at one doorstep mean a duplicated shop
    record, a mis-tagged visit, or GPS trouble — a human looks, the engine
    never concludes. O(n²) in Python over at most 2000 located inspections."""
    import math
    rows = (db.query(Inspection)
            .filter(Inspection.inspection_date.between(start, end),
                    Inspection.latitude.is_not(None),
                    Inspection.longitude.is_not(None))
            .order_by(Inspection.id).limit(2000).all())
    _R = 6_371_000.0

    def _hav(a1: float, o1: float, a2: float, o2: float) -> float:
        p1, p2 = math.radians(a1), math.radians(a2)
        dp, dl = math.radians(a2 - a1), math.radians(o2 - o1)
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 2 * _R * math.asin(math.sqrt(h))

    out: list[dict] = []
    for i, a in enumerate(rows):
        for b in rows[i + 1:]:
            if a.store_id == b.store_id:
                continue
            try:
                d = _hav(a.latitude, a.longitude, b.latitude, b.longitude)
            except (TypeError, ValueError):
                continue
            if d <= meters:
                out.append({
                    "inspection_a": a.id, "inspection_b": b.id,
                    "store_a": a.store_id, "store_b": b.store_id,
                    "distance_m": round(d, 1),
                    "date_a": a.inspection_date.isoformat(),
                    "date_b": b.inspection_date.isoformat(),
                })
                if len(out) >= limit:
                    return out
    return out


# --- Query 6: trend, for the line chart ---
def inspection_trend(db: Session, start: date, end: date):
    total, comp, viol, na, oos = _result_counts()
    return [
        dict(r._mapping)
        for r in db.execute(
            select(Inspection.inspection_date, total, comp, viol, na, oos)
            .select_from(Inspection)
            .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
            .where(Inspection.inspection_date.between(start, end))
            .group_by(Inspection.inspection_date)
            .order_by(Inspection.inspection_date)
        )
    ]


def check_category(check_id: str | None, title: str | None = "") -> str:
    cid = (check_id or "").upper()
    t = (title or "").upper()
    if cid in ("CHK06", "CHK11") or "MRP" in t:
        return "MRP Declaration"
    if cid in ("CHK05", "CHK10") or "QUANTITY" in t or "NET" in t:
        return "Net Quantity"
    if cid in ("CHK07", "CHK13") or "DATE" in t or "EXPIRY" in t or "MONTH" in t:
        return "Date / Expiry"
    if cid == "CHK09" or "CONSUMER" in t or "CARE" in t:
        return "Consumer Care"
    if cid == "CHK04" or "MANUFACTURER" in t or "PACKER" in t:
        return "Manufacturer Info"
    if cid == "CHK12" or "ORIGIN" in t:
        return "Country of Origin"
    if cid in ("CHK15", "CHK16") or "ECOMMERCE" in t or "MARKETPLACE" in t:
        return "E-Commerce"
    return "Package Declarations"


def admin_violations_list(
    db: Session,
    start: date | None = None,
    end: date | None = None,
    store_id: int | None = None,
    limit: int = 200,
) -> list[dict]:
    """Query live finding failures joined with Scan, Inspection, Store, User."""
    verdict = func.coalesce(Finding.human_verdict, Finding.engine_verdict)
    q = (
        db.query(Finding, Scan, Inspection, Store, User)
        .join(Scan, Finding.scan_id == Scan.id)
        .join(Inspection, Scan.inspection_id == Inspection.id)
        .join(Store, Inspection.store_id == Store.id)
        .join(User, Inspection.user_id == User.id)
        .filter(verdict == "fail", LIVE)
    )
    if start:
        q = q.filter(Inspection.inspection_date >= start)
    if end:
        q = q.filter(Inspection.inspection_date <= end)
    if store_id is not None:
        q = q.filter(Store.id == store_id)

    rows = q.order_by(Inspection.inspection_date.desc(), Finding.id.desc()).limit(limit).all()

    out = []
    for f, s, i, st, u in rows:
        prod_name = (
            f"{s.brand_name} {s.commodity_generic}".strip()
            if (s.brand_name or s.commodity_generic)
            else "Packaged Item"
        )
        out.append({
            "id": f.id,
            "scan_id": s.id,
            "check_id": f.check_id,
            "date": i.inspection_date.isoformat() if i.inspection_date else "",
            "store_id": st.id,
            "store_name": st.name,
            "area": st.city or st.district or "Andhra Pradesh",
            "commodity_generic": s.commodity_generic or "Packaged Commodity",
            "product_name": prod_name,
            "brand_name": s.brand_name or "—",
            "manufacturer": s.brand_name or st.name or "Manufacturer",
            "category": check_category(f.check_id, f.title),
            "rule": f.citation or f"Rule ({f.check_id})",
            "citation": f.citation or f"Rule ({f.check_id})",
            "title": f.title,
            "reason": f.reason or f.observed or "Non-compliance observed",
            "result": "violation",
            "inspector_id": u.id,
            "inspector": u.full_name or u.employee_id,
        })
    return out


def scans_list(
    db: Session,
    inspection_id: int | None = None,
    store_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = 200,
    offset: int = 0,
    user: User | None = None,
) -> list[dict]:
    """List live scans (duplicate_of is NULL) joined with Inspection, Store, User."""
    query = (
        db.query(Scan, Inspection, Store, User)
        .join(Inspection, Scan.inspection_id == Inspection.id)
        .join(Store, Inspection.store_id == Store.id)
        .join(User, Inspection.user_id == User.id)
        .filter(LIVE)
    )
    if user and getattr(user, "role", None) == "inspector":
        query = query.filter(Inspection.user_id == user.id)
    if inspection_id is not None:
        query = query.filter(Inspection.id == inspection_id)
    if store_id is not None:
        query = query.filter(Store.id == store_id)
    if status and status != "all":
        query = query.filter(Scan.overall_result == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Scan.brand_name.ilike(term),
                Scan.commodity_generic.ilike(term),
                Scan.commodity_category.ilike(term),
                Scan.batch_number.ilike(term),
                Scan.barcode.ilike(term),
                Store.name.ilike(term),
            )
        )
    rows = (
        query.order_by(Scan.created_at.desc(), Scan.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    out = []
    for s, i, st, u in rows:
        out.append({
            "id": s.id,
            "inspection_id": i.id,
            "store_id": st.id,
            "store_name": st.name or f"Shop #{st.id}",
            "store_area": st.city or st.district or None,
            "inspector_id": u.id,
            "inspector_name": u.full_name or u.employee_id,
            "commodity_generic": s.commodity_generic,
            "brand_name": s.brand_name,
            "commodity_category": s.commodity_category,
            "batch_number": s.batch_number,
            "barcode": s.barcode,
            "net_quantity_value": s.net_quantity_value,
            "net_quantity_unit": s.net_quantity_unit,
            "mrp": None,
            "overall_result": s.overall_result or "not_assessed",
            "checks_total": s.checks_total or 0,
            "checks_assessed": s.checks_assessed or 0,
            "image_count": len(getattr(s, "images", []) or []),
            "created_at": s.created_at,
        })
    return out
