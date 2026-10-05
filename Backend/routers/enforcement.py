"""routers/enforcement.py — Phase 5C: Officer Reports + Enforcement-Support Workflow.

Turns the completed inspection assessment into real officer-facing reports
and enforcement-support information. This is a decision-support system,
NOT an automated prosecution system.

NiyamNetra does NOT claim:
- Automatic prosecution
- Automated compounding
- Self-executing seizure

It DOES provide:
- Violation dossiers with statutory citations
- Section 36 enforcement guidance (which limb applies)
- Recommended actions (compound / prosecute / seize) as advisory
- Inspector field notes and legal reference summaries
- Exportable compliance summaries for reporting chains

Core invariant:
    RULES DECIDE → OFFICER REVIEWS → REPORT DOCUMENTS → OFFICER DECIDES
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from audit import append_audit
from config import settings
from database import get_db
from models import AuditLog, Finding, Inspection, Scan, ScanImage, Store, User
from rbac import get_current_user, require_admin, require_inspector

router = APIRouter(prefix="/enforcement", tags=["enforcement"])


# ---------------------------------------------------------------------------
# 1. Enforcement Guidance Models
# ---------------------------------------------------------------------------

def _section_36_guidance(findings: list[Finding]) -> dict:
    """Generate Section 36 enforcement guidance based on findings.

    Section 36(1): Any person who manufactures, packs, sells, distributes,
    delivers, offers, displays or stores for sale any pre-packaged commodity
    which does not conform to the provisions of this Act or the rules...

    Section 36(2): Where a pre-packaged commodity has a declaration which is
    not in accordance with the provisions of this Act or the rules... false
    or misleading declaration as to quantity.
    """
    fail_findings = [f for f in findings
                     if (f.human_verdict or f.engine_verdict) == "fail"]

    if not fail_findings:
        return {
            "applicable": False,
            "summary": "No confirmed violations. Section 36 enforcement not triggered.",
            "limbs": [],
            "recommended_action": None,
        }

    limbs_engaged = set()
    for f in fail_findings:
        if f.limb:
            limbs_engaged.add(f.limb)

    # Determine recommended action based on severity
    severities = [f.severity for f in fail_findings]
    has_critical = "critical" in severities
    has_major = "major" in severities

    if has_critical:
        recommended = "prosecute_and_seize"
        action_detail = (
            "Critical violation(s) detected. Consider prosecution under Section 36 "
            "and seizure of non-compliant packages under Section 15. "
            "Compounding may not be appropriate for critical violations."
        )
    elif has_major:
        recommended = "compound_or_prosecute"
        action_detail = (
            "Major violation(s) detected. The officer may offer compounding "
            "under Section 48 or initiate prosecution under Section 36. "
            "Consider the offender's history and the nature of the violation."
        )
    else:
        recommended = "compound"
        action_detail = (
            "Minor violation(s) detected. Compounding under Section 48 "
            "is the recommended first action for minor violations."
        )

    # Build per-limb detail
    limb_details = []
    if "36(1)" in limbs_engaged:
        s36_1_findings = [f for f in fail_findings if f.limb == "36(1)"]
        limb_details.append({
            "limb": "36(1)",
            "description": (
                "Non-conformity with provisions — the pre-packaged commodity "
                "does not conform to the Act or rules."
            ),
            "violation_count": len(s36_1_findings),
            "checks": [f.check_id for f in s36_1_findings],
        })

    if "36(2)" in limbs_engaged:
        s36_2_findings = [f for f in fail_findings if f.limb == "36(2)"]
        limb_details.append({
            "limb": "36(2)",
            "description": (
                "False or misleading declaration — the declaration on the "
                "package is not in accordance with the Act or rules."
            ),
            "violation_count": len(s36_2_findings),
            "checks": [f.check_id for f in s36_2_findings],
        })

    # Findings without specific limb assignment
    no_limb = [f for f in fail_findings if not f.limb]
    if no_limb:
        limb_details.append({
            "limb": "unassigned",
            "description": (
                "Violation detected but the specific Section 36 limb was not "
                "deterministically assigned. Officer review required."
            ),
            "violation_count": len(no_limb),
            "checks": [f.check_id for f in no_limb],
        })

    return {
        "applicable": True,
        "summary": (
            f"Section 36 enforcement applicable. {len(fail_findings)} confirmed "
            f"violation(s) across {len(limbs_engaged)} limb(s)."
        ),
        "limbs": limb_details,
        "total_violations": len(fail_findings),
        "recommended_action": recommended,
        "action_detail": action_detail,
        "legal_disclaimer": (
            "This guidance is advisory only. The enforcement decision rests "
            "with the authorized officer under the Legal Metrology Act, 2009."
        ),
    }


def _violation_dossier_data(
    insp: Inspection, scan: Scan, findings: list[Finding]
) -> dict:
    """Build a structured violation dossier for a single scan/package."""
    fail_findings = [f for f in findings
                     if (f.human_verdict or f.engine_verdict) == "fail"]

    items = []
    for f in fail_findings:
        items.append({
            "check_id": f.check_id,
            "title": f.title,
            "severity": f.severity,
            "limb": f.limb,
            "engine_verdict": f.engine_verdict,
            "human_verdict": f.human_verdict,
            "effective_verdict": f.effective_verdict,
            "observed": f.observed,
            "required": f.required,
            "citation": f.citation,
            "ledger_ref": f.ledger_ref,
            "reason": f.reason,
            "override_reason": f.override_reason,
        })

    return {
        "scan_id": scan.id,
        "commodity": scan.commodity_generic,
        "brand": scan.brand_name,
        "batch_number": scan.batch_number,
        "category": scan.commodity_category,
        "overall_result": scan.overall_result,
        "total_violations": len(items),
        "violation_items": items,
        "rules_as_at": scan.rules_as_at.isoformat() if scan.rules_as_at else None,
        "engine_version": scan.engine_version,
        "rule_pack_version": scan.rule_pack_version,
    }


# ---------------------------------------------------------------------------
# 2. Inspection Compliance Summary
# ---------------------------------------------------------------------------

@router.get("/inspections/{inspection_id}/summary")
@router.get("/summary/{inspection_id}")
def get_compliance_summary(
    inspection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Comprehensive compliance summary for an inspection.

    Provides the officer with a single-page view of:
    - Overall inspection outcome
    - Per-package violation details
    - Section 36 enforcement guidance
    - Recommended next actions
    - Legal disclaimers
    """
    insp = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.store),
            joinedload(Inspection.inspector),
            selectinload(Inspection.scans).selectinload(Scan.findings),
            selectinload(Inspection.scans).selectinload(Scan.images),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if insp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")

    live_scans = [s for s in (insp.scans or []) if s.duplicate_of is None]

    # Overall rollup
    results = [s.overall_result for s in live_scans]
    if any(r == "violation" for r in results):
        overall_verdict = "VIOLATION"
    elif any(r == "not_assessed" for r in results):
        overall_verdict = "REVIEW_REQUIRED"
    elif all(r == "compliant" for r in results):
        overall_verdict = "COMPLIANT"
    elif all(r in ("out_of_scope", "compliant") for r in results):
        overall_verdict = "OUT_OF_SCOPE"
    else:
        overall_verdict = "REVIEW_REQUIRED"

    # Per-package summaries
    package_summaries = []
    all_findings = []
    for scan in live_scans:
        findings = list(scan.findings or [])
        all_findings.extend(findings)

        fail_count = sum(1 for f in findings if (f.human_verdict or f.engine_verdict) == "fail")
        pass_count = sum(1 for f in findings if (f.human_verdict or f.engine_verdict) == "pass")
        na_count = sum(1 for f in findings if (f.human_verdict or f.engine_verdict) == "not_assessed")

        package_summaries.append({
            "scan_id": scan.id,
            "commodity": scan.commodity_generic,
            "brand": scan.brand_name,
            "batch": scan.batch_number,
            "category": scan.commodity_category,
            "overall_result": scan.overall_result,
            "checks_total": scan.checks_total,
            "checks_assessed": scan.checks_assessed,
            "pass_count": pass_count,
            "fail_count": fail_count,
            "not_assessed_count": na_count,
            "violation_dossier": _violation_dossier_data(insp, scan, findings)
            if scan.overall_result == "violation" else None,
        })

    # Section 36 guidance
    s36 = _section_36_guidance(all_findings)

    # Store info
    store_info = None
    if insp.store:
        store_info = {
            "id": insp.store.id, "name": insp.store.name,
            "address": insp.store.address, "city": insp.store.city,
            "district": insp.store.district, "state": insp.store.state,
            "pincode": insp.store.pincode,
        }

    # Inspector info
    inspector_info = None
    if insp.inspector:
        inspector_info = {
            "id": insp.inspector.id,
            "employee_id": insp.inspector.employee_id,
            "full_name": insp.inspector.full_name,
            "jurisdiction": insp.inspector.jurisdiction,
        }

    return {
        "inspection_id": insp.id,
        "inspection_date": insp.inspection_date.isoformat(),
        "status": insp.status,
        "overall_verdict": overall_verdict,
        "total_packages": len(live_scans),
        "packages_with_violations": sum(1 for r in results if r == "violation"),
        "packages_compliant": sum(1 for r in results if r == "compliant"),
        "packages_not_assessed": sum(1 for r in results if r == "not_assessed"),
        "store": store_info,
        "inspector": inspector_info,
        "geofence_status": insp.geofence_status,
        "signature_status": insp.signature_status,
        "section_36_guidance": s36,
        "package_summaries": package_summaries,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "legal_disclaimer": (
            "This compliance summary is generated by the NiyamNetra inspection "
            "decision-support system. All enforcement decisions must be made by "
            "the authorized officer under the Legal Metrology Act, 2009 and the "
            "Legal Metrology (Packaged Commodities) Rules, 2011."
        ),
    }


# ---------------------------------------------------------------------------
# 3. Violation Dossier Endpoint
# ---------------------------------------------------------------------------

@router.get("/inspections/{inspection_id}/dossier")
def get_violation_dossier(
    inspection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a complete violation dossier for an inspection.

    This is the document the officer uses when initiating enforcement action.
    It includes all statutory violations with evidence, citations, and
    recommended actions.
    """
    insp = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.store),
            joinedload(Inspection.inspector),
            selectinload(Inspection.scans).selectinload(Scan.findings),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if insp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")

    live_scans = [s for s in (insp.scans or []) if s.duplicate_of is None]
    violation_scans = [s for s in live_scans if s.overall_result == "violation"]

    if not violation_scans:
        return {
            "inspection_id": insp.id,
            "has_violations": False,
            "message": "No violations found in this inspection.",
        }

    # Build dossier
    all_findings = []
    dossier_packages = []
    for scan in violation_scans:
        findings = list(scan.findings or [])
        all_findings.extend(findings)
        dossier_packages.append(_violation_dossier_data(insp, scan, findings))

    # Section 36 guidance
    s36 = _section_36_guidance(all_findings)

    # Dossier metadata
    dossier_content = json.dumps({
        "inspection_id": insp.id,
        "packages": [p["scan_id"] for p in dossier_packages],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }, sort_keys=True)
    dossier_hash = hashlib.sha256(dossier_content.encode()).hexdigest()[:16]

    store_info = None
    if insp.store:
        store_info = {
            "id": insp.store.id, "name": insp.store.name,
            "address": insp.store.address, "city": insp.store.city,
            "district": insp.store.district, "state": insp.store.state,
        }

    inspector_info = None
    if insp.inspector:
        inspector_info = {
            "id": insp.inspector.id,
            "employee_id": insp.inspector.employee_id,
            "full_name": insp.inspector.full_name,
        }

    # Log dossier generation
    append_audit(
        db, inspection_id=inspection_id, user_id=user.id,
        action="dossier_generated",
        new_value=f"dossier_{dossier_hash}",
        reason=f"Violation dossier generated for {len(violation_scans)} packages",
    )

    return {
        "inspection_id": insp.id,
        "dossier_id": f"DOSSIER-{insp.id}-{dossier_hash}",
        "has_violations": True,
        "inspection_date": insp.inspection_date.isoformat(),
        "store": store_info,
        "inspector": inspector_info,
        "total_violation_packages": len(violation_scans),
        "total_compliant_packages": sum(1 for s in live_scans if s.overall_result == "compliant"),
        "section_36_guidance": s36,
        "packages": dossier_packages,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "legal_disclaimer": (
            "This dossier is advisory and does not constitute a legal charge. "
            "Enforcement decisions must be made by the authorized officer."
        ),
    }


@router.get("/dossier/{identifier}")
def get_dossier_by_identifier(
    identifier: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve violation dossier by inspection_id or scan_id."""
    insp = db.query(Inspection).filter(Inspection.id == identifier).first()
    if insp:
        return get_violation_dossier(identifier, user, db)

    scan = (
        db.query(Scan)
        .options(
            joinedload(Scan.inspection).joinedload(Inspection.store),
            joinedload(Scan.inspection).joinedload(Inspection.inspector),
            selectinload(Scan.findings),
            selectinload(Scan.images),
        )
        .filter(Scan.id == identifier)
        .first()
    )
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection or scan not found")

    insp = scan.inspection
    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")

    findings = list(scan.findings or [])
    fail_findings = [f for f in findings if (f.human_verdict or f.engine_verdict) == "fail"]
    package_data = _violation_dossier_data(insp, scan, findings)
    s36 = _section_36_guidance(fail_findings)

    return {
        "inspection_id": insp.id,
        "scan_id": scan.id,
        "dossier_id": f"DOSSIER-SCAN-{scan.id}",
        "has_violations": len(fail_findings) > 0,
        "commodity": scan.commodity_generic,
        "brand": scan.brand_name,
        "batch_number": scan.batch_number,
        "section_36_guidance": s36,
        "packages": [package_data],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "legal_disclaimer": (
            "This dossier is advisory and does not constitute a legal charge. "
            "Enforcement decisions must be made by the authorized officer."
        ),
    }


@router.get("/inspections/{inspection_id}/pdf")
@router.get("/pdf/{inspection_id}")
def get_enforcement_pdf(
    inspection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate or retrieve official PDF for an inspection."""
    from routers.reports import inspection_pdf
    return inspection_pdf(inspection_id, user, db)


# ---------------------------------------------------------------------------
# 4. Enforcement Statistics (Office-level)
# ---------------------------------------------------------------------------

@router.get("/stats")
def enforcement_stats(
    days: int = Query(default=30, ge=1, le=365),
    area: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enforcement statistics for the dashboard.

    Shows violation trends, top failing checks, stores with repeat violations,
    and enforcement action rates.
    """
    end = date.today()
    start = end - timedelta(days=days)

    from queries import LIVE

    base_q = (
        db.query(Scan)
        .join(Inspection, Inspection.id == Scan.inspection_id)
        .filter(LIVE, Inspection.inspection_date.between(start, end))
    )
    if user.role != "admin":
        base_q = base_q.filter(Inspection.user_id == user.id)

    if area and area.strip().lower() != "all":
        a = area.strip()
        base_q = base_q.join(Store, Store.id == Inspection.store_id).filter(
            or_(Store.city.ilike(f"%{a}%"), Store.district.ilike(f"%{a}%"))
        )

    total_scans = base_q.count()
    violation_scans = base_q.filter(Scan.overall_result == "violation").count()
    compliant_scans = base_q.filter(Scan.overall_result == "compliant").count()
    na_scans = base_q.filter(Scan.overall_result == "not_assessed").count()

    # Top failing checks
    verdict_expr = func.coalesce(Finding.human_verdict, Finding.engine_verdict)
    top_checks_q = (
        db.query(
            Finding.check_id,
            Finding.title,
            func.count().label("count"),
        )
        .join(Scan, Scan.id == Finding.scan_id)
        .join(Inspection, Inspection.id == Scan.inspection_id)
        .filter(
            verdict_expr == "fail",
            LIVE,
            Inspection.inspection_date.between(start, end),
        )
    )
    if user.role != "admin":
        top_checks_q = top_checks_q.filter(Inspection.user_id == user.id)
    if area and area.strip().lower() != "all":
        a = area.strip()
        top_checks_q = top_checks_q.join(
            Store, Store.id == Inspection.store_id
        ).filter(or_(Store.city.ilike(f"%{a}%"), Store.district.ilike(f"%{a}%")))

    top_checks = [
        {"check_id": r[0], "title": r[1], "count": r[2]}
        for r in top_checks_q.group_by(Finding.check_id, Finding.title)
        .order_by(func.count().desc()).limit(10).all()
    ]

    # Severity distribution
    severity_q = (
        db.query(
            Finding.severity,
            func.count().label("count"),
        )
        .join(Scan, Scan.id == Finding.scan_id)
        .join(Inspection, Inspection.id == Scan.inspection_id)
        .filter(
            verdict_expr == "fail",
            LIVE,
            Inspection.inspection_date.between(start, end),
        )
    )
    if user.role != "admin":
        severity_q = severity_q.filter(Inspection.user_id == user.id)

    severity_dist = {
        r[0]: r[1]
        for r in severity_q.group_by(Finding.severity).all()
    }

    # Dossiers generated in period
    dossiers = (
        db.query(func.count(AuditLog.id))
        .filter(
            AuditLog.action == "dossier_generated",
            AuditLog.timestamp >= datetime(start.year, start.month, start.day,
                                           tzinfo=timezone.utc),
        )
    )
    if user.role != "admin":
        dossiers = dossiers.filter(AuditLog.user_id == user.id)
    dossiers_count = dossiers.scalar() or 0

    violation_rate = round(violation_scans / total_scans * 100, 1) if total_scans > 0 else 0.0

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "total_packages_inspected": total_scans,
        "violations": violation_scans,
        "compliant": compliant_scans,
        "not_assessed": na_scans,
        "violation_rate_percent": violation_rate,
        "top_failing_checks": top_checks,
        "severity_distribution": {
            "critical": severity_dist.get("critical", 0),
            "major": severity_dist.get("major", 0),
            "minor": severity_dist.get("minor", 0),
            "advisory": severity_dist.get("advisory", 0),
        },
        "dossiers_generated": dossiers_count,
    }


# ---------------------------------------------------------------------------
# 5. Legal Reference Quick-Lookup
# ---------------------------------------------------------------------------

@router.get("/legal-reference/{check_id}")
@router.get("/reference/{check_id}")
def get_legal_reference(
    check_id: str,
    user: User = Depends(get_current_user),
):
    """Quick-lookup of the legal reference for a specific compliance check.

    Returns the relevant rule text, citation, and enforcement guidance
    so the officer can make an informed decision in the field.
    """
    # Static legal reference data (from the rule pack)
    references = {
        "CHK01": {
            "title": "Commodity Name Declaration",
            "rule": "Rule 6(1)(a)",
            "description": "Every package shall bear the name of the commodity contained in it.",
            "section_36_limb": "36(1)",
            "severity": "major",
        },
        "CHK02": {
            "title": "Net Quantity Declaration",
            "rule": "Rule 6(1)(b)",
            "description": "Net quantity by weight, measure or number.",
            "section_36_limb": "36(2)",
            "severity": "critical",
        },
        "CHK03": {
            "title": "Retail Sale Applicability",
            "rule": "Rule 2(l), Rule 3",
            "description": "Package intended for retail sale must comply with Chapter II.",
            "section_36_limb": None,
            "severity": "advisory",
        },
        "CHK04": {
            "title": "Manufacturer/Packer Name & Address",
            "rule": "Rule 6(1)(c)",
            "description": "Name and address of the manufacturer or packer.",
            "section_36_limb": "36(1)",
            "severity": "major",
        },
        "CHK05": {
            "title": "MRP Declaration",
            "rule": "Rule 6(1)(d)",
            "description": "Retail sale price (Maximum Retail Price inclusive of all taxes).",
            "section_36_limb": "36(1)",
            "severity": "critical",
        },
        "CHK06": {
            "title": "Net Quantity Numeral Height",
            "rule": "Rule 7(2), Table-I",
            "description": "Minimum height of numerals in net quantity declaration.",
            "section_36_limb": "36(1)",
            "severity": "minor",
        },
        "CHK06b": {
            "title": "Standard Package Sizes",
            "rule": "Second Schedule",
            "description": "Net quantity must conform to the Second Schedule sizes.",
            "section_36_limb": "36(2)",
            "severity": "major",
        },
        "CHK07": {
            "title": "Month & Year of Manufacture/Packing",
            "rule": "Rule 6(1)(da)",
            "description": "Month and year of manufacture or packing or import.",
            "section_36_limb": "36(1)",
            "severity": "major",
        },
        "CHK08": {
            "title": "Best Before / Use By Date",
            "rule": "Rule 6(1)(da)",
            "description": "Best before or use by date for perishable commodities.",
            "section_36_limb": "36(1)",
            "severity": "major",
        },
        "CHK09": {
            "title": "Consumer Care Details",
            "rule": "Rule 6(1)(e)",
            "description": "Customer care number, email, or address for complaints.",
            "section_36_limb": "36(1)",
            "severity": "minor",
        },
        "CHK10": {
            "title": "Unit Sale Price",
            "rule": "Rule 6(1)(f)",
            "description": "Unit sale price where required by the rules.",
            "section_36_limb": "36(1)",
            "severity": "minor",
        },
        "CHK11": {
            "title": "Sticker/Altered Price Compliance",
            "rule": "Rule 6(3), 6(4), 6(4A)",
            "description": "Sticker may not cover mandatory declarations or reduce price.",
            "section_36_limb": "36(1)",
            "severity": "critical",
        },
        "CHK12": {
            "title": "Country of Origin (Imported Goods)",
            "rule": "Rule 6(1)(aa)",
            "description": "Country of origin for imported pre-packaged commodities.",
            "section_36_limb": "36(1)",
            "severity": "major",
        },
        "CHK13": {
            "title": "Generic/Common Name (Imported)",
            "rule": "Rule 6(1)(a) proviso",
            "description": "Generic or common name for imported commodities.",
            "section_36_limb": "36(1)",
            "severity": "major",
        },
        "CHK14": {
            "title": "Medical Device Exemption",
            "rule": "Rule 2(h) proviso",
            "description": "Medical devices as defined by the Drugs Act are excluded.",
            "section_36_limb": None,
            "severity": "advisory",
        },
        "CHK15": {
            "title": "E-commerce Listing MRP",
            "rule": "Rule 6(10)",
            "description": "E-commerce listing must not sell above MRP.",
            "section_36_limb": "36(1)",
            "severity": "critical",
        },
        "CHK16": {
            "title": "E-commerce Listing Declarations",
            "rule": "Rule 6(10)",
            "description": "E-commerce listing must display mandatory declarations.",
            "section_36_limb": "36(1)",
            "severity": "major",
        },
        "CHK17": {
            "title": "Tobacco Warning Compliance",
            "rule": "COTPA / FSSAI advisory",
            "description": "Tobacco product statutory warning requirements.",
            "section_36_limb": None,
            "severity": "advisory",
        },
        "CHK18": {
            "title": "Section 36 Violation Tier",
            "rule": "Section 36",
            "description": "Derived violation tier under Section 36 of the LM Act.",
            "section_36_limb": None,
            "severity": "advisory",
        },
        "CHK23": {
            "title": "Country of Origin Marking",
            "rule": "Rule 6(4A)(d) / former Rule 6(8)",
            "description": "Origin marking for packages with stickers.",
            "section_36_limb": "36(1)",
            "severity": "minor",
        },
    }

    ref = references.get(check_id)
    if ref is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail=f"Legal reference not found for {check_id}")

    return {
        "check_id": check_id,
        **ref,
        "legal_disclaimer": (
            "This reference is for officer guidance only. Consult the full "
            "text of the Legal Metrology (Packaged Commodities) Rules, 2011 "
            "for definitive statutory requirements."
        ),
    }


# ---------------------------------------------------------------------------
# 6. Inspection History for a Store (Enforcement Pattern Detection)
# ---------------------------------------------------------------------------

@router.get("/stores/{store_id}/history")
def get_store_enforcement_history(
    store_id: int,
    days: int = Query(default=90, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the enforcement history for a specific store.

    Shows past inspections, violations, and enforcement actions to help
    officers understand patterns and prioritize interventions.
    """
    store = db.get(Store, store_id)
    if store is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Store not found")

    end = date.today()
    start = end - timedelta(days=days)

    inspections = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.inspector),
            selectinload(Inspection.scans),
        )
        .filter(
            Inspection.store_id == store_id,
            Inspection.inspection_date.between(start, end),
        )
        .order_by(Inspection.inspection_date.desc())
        .all()
    )

    history = []
    total_violations = 0
    for insp in inspections:
        live = [s for s in (insp.scans or []) if s.duplicate_of is None]
        results = [s.overall_result for s in live]
        v_count = sum(1 for r in results if r == "violation")
        total_violations += v_count

        inspector_name = None
        try:
            if insp.inspector:
                inspector_name = insp.inspector.full_name
        except Exception:
            pass

        history.append({
            "inspection_id": insp.id,
            "date": insp.inspection_date.isoformat(),
            "inspector": inspector_name,
            "total_packages": len(live),
            "violations": v_count,
            "compliant": sum(1 for r in results if r == "compliant"),
            "status": insp.status,
            "signature_status": insp.signature_status,
        })

    # Pattern analysis
    is_repeat_offender = total_violations >= 3
    violation_trend = "increasing" if len(history) >= 2 and history[0].get("violations", 0) > history[-1].get("violations", 0) else "stable"

    return {
        "store_id": store.id,
        "store_name": store.name,
        "address": store.address,
        "city": store.city,
        "district": store.district,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "total_inspections": len(history),
        "total_violations": total_violations,
        "is_repeat_offender": is_repeat_offender,
        "violation_trend": violation_trend,
        "inspections": history,
    }
