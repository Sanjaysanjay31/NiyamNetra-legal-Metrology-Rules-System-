"""queries.py — the aggregations behind the report and dashboard endpoints.

Also home to resolve_duplicate (06 §3.5): the unique index on
(store_id, commodity_generic, batch_number, inspection_date) is expressed over
a join, so on SQLite it is enforced here in the service layer rather than
declaratively.
"""
from datetime import date
from sqlalchemy import case, func, select
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
    """Four counts. Not two. A scan that could not be assessed is not a pass."""
    return (
        func.count().label("total"),
        func.sum(case((col == "compliant", 1), else_=0)).label("compliant"),
        func.sum(case((col == "violation", 1), else_=0)).label("violation"),
        func.sum(case((col == "not_assessed", 1), else_=0)).label("not_assessed"),
        func.sum(case((col == "out_of_scope", 1), else_=0)).label("out_of_scope"),
    )
# --- Query 1: today's report for one inspector ---
def todays_stats(db: Session, user_id: int, day: date):
    total, comp, viol, na, oos = _result_counts()
    row = db.execute(
        select(
            func.count(func.distinct(Inspection.id)).label("inspections"),
            total, comp, viol, na, oos,
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
            func.count(func.distinct(Inspection.id)).label("inspections"),
            func.count(func.distinct(Inspection.user_id)).label("active_inspectors"),
            total, comp, viol, na, oos,
        )
        .select_from(Inspection)
        .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
        .where(Inspection.inspection_date.between(start, end))
    ).one()
    d = dict(row._mapping)
    # Real count, not the hard-coded 0 that v1.x shipped at line 924.
    d["review_queue"] = review_queue_size(db)
    return d


def review_queue_size(db: Session) -> int:
    """Everything a human still has to look at, counted the same way the
    review endpoint lists it, so the badge and the page can never disagree."""
    na_scans = db.scalar(
        select(func.count()).select_from(Scan)
        .where(Scan.overall_result == "not_assessed", LIVE)
    ) or 0
    low_conf = db.scalar(
        select(func.count()).select_from(Finding)
        .where(Finding.confidence < 0.60, Finding.human_verdict.is_(None))
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
