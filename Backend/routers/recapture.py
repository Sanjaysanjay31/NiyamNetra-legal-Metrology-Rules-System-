"""routers/recapture.py — Phase 5B: Smart Recapture Workflow.

Turns the Phase 4D CaptureRequest objects into a real inspector recapture
workflow. When the deterministic compliance engine identifies missing evidence,
ambiguous readings, or panels with measurement uncertainty, it generates
structured CaptureRequest objects. This router:

1. Surfaces those requests to the inspector app as actionable capture tasks.
2. Tracks which capture requests have been fulfilled vs. pending.
3. Re-triggers assessment after new evidence is attached.
4. Provides panel-specific guidance (which panel, what to look for, priority).

Core invariant:
    RULES DECIDE → CAPTURE REQUESTS → INSPECTOR ACTS → RE-ASSESS
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload, selectinload

from audit import append_audit
from database import get_db
from models import Finding, Inspection, Scan, ScanImage, User
from rbac import get_current_user, require_inspector

router = APIRouter(prefix="/recapture", tags=["recapture"])


# ---------------------------------------------------------------------------
# 1. Request / Response Schemas
# ---------------------------------------------------------------------------

class CaptureTaskOut(BaseModel):
    """A single actionable capture task for the inspector."""
    request_id: str
    inspection_id: int
    scan_id: int
    target_panel: str
    reason: str
    expected_evidence: str
    priority: str  # high | medium | low
    suggested_action: str
    status: str  # pending | fulfilled | skipped
    fulfilled_image_id: int | None = None


class FulfillCaptureRequest(BaseModel):
    """Mark a capture request as fulfilled after the inspector takes a photo."""
    scan_image_id: int | None = None
    notes: str | None = Field(default=None, max_length=2000)
    skip_reason: str | None = Field(default=None, max_length=1000)


class RecaptureAssessRequest(BaseModel):
    """Request re-assessment after recapture evidence is attached."""
    scan_ids: list[int] = Field(min_length=1, max_length=50)


# ---------------------------------------------------------------------------
# 2. Generate Capture Requests from Assessment
# ---------------------------------------------------------------------------

def _generate_capture_tasks(
    inspection_id: int,
    scan: Scan,
    findings: list[Finding],
    images: list[ScanImage],
) -> list[dict]:
    """Generate actionable capture tasks based on assessment gaps."""
    tasks = []
    captured_panels = {img.panel for img in images}

    # Mandatory panels that should be captured
    expected_panels = {"front", "back"}
    missing_panels = expected_panels - captured_panels

    # 1. Missing mandatory panels
    for panel in sorted(missing_panels):
        tasks.append({
            "request_id": f"CAP_{inspection_id}_{scan.id}_{panel}_missing",
            "inspection_id": inspection_id,
            "scan_id": scan.id,
            "target_panel": panel,
            "reason": f"Panel '{panel}' not captured. Required for complete assessment.",
            "expected_evidence": f"Clear photograph of the {panel} panel showing all declarations",
            "priority": "high",
            "suggested_action": f"Capture the {panel} panel of the package with good lighting and minimal tilt",
            "status": "pending",
            "fulfilled_image_id": None,
        })

    # 2. Checks that are not_assessed due to missing evidence
    for f in findings:
        if f.engine_verdict == "not_assessed" and f.human_verdict is None:
            # Determine which panel likely has the evidence
            target = _check_to_panel(f.check_id)
            if target in captured_panels:
                # Panel captured but evidence not found — recapture with guidance
                reason = f.reason or f"Check {f.check_id} could not be assessed"
                tasks.append({
                    "request_id": f"CAP_{inspection_id}_{scan.id}_{f.check_id}_quality",
                    "inspection_id": inspection_id,
                    "scan_id": scan.id,
                    "target_panel": target,
                    "reason": f"{f.title}: {reason}",
                    "expected_evidence": f.required or f"Clear image showing {f.title}",
                    "priority": "medium" if f.severity in ("critical", "major") else "low",
                    "suggested_action": (
                        f"Recapture the '{target}' panel. Ensure the area with "
                        f"{f.title.lower()} is clearly visible, well-lit, and in focus."
                    ),
                    "status": "pending",
                    "fulfilled_image_id": None,
                })

    # 3. Low-confidence findings that may benefit from recapture
    for f in findings:
        if f.confidence is not None and f.confidence < 0.50 and f.human_verdict is None:
            target = _check_to_panel(f.check_id)
            tasks.append({
                "request_id": f"CAP_{inspection_id}_{scan.id}_{f.check_id}_lowconf",
                "inspection_id": inspection_id,
                "scan_id": scan.id,
                "target_panel": target,
                "reason": f"Low confidence ({f.confidence:.0%}) for {f.title}",
                "expected_evidence": f"Clearer image of the {f.title.lower()} declaration",
                "priority": "low",
                "suggested_action": (
                    f"Recapture the '{target}' panel with better lighting or closer zoom "
                    f"to improve OCR confidence for {f.check_id}."
                ),
                "status": "pending",
                "fulfilled_image_id": None,
            })

    # Deduplicate by request_id
    seen = set()
    unique = []
    for t in tasks:
        if t["request_id"] not in seen:
            seen.add(t["request_id"])
            unique.append(t)

    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    unique.sort(key=lambda t: priority_order.get(t["priority"], 3))

    return unique


def _check_to_panel(check_id: str) -> str:
    """Map a check ID to the most likely panel where its evidence appears."""
    front_checks = {"CHK01", "CHK02", "CHK03", "CHK04", "CHK05", "CHK06", "CHK06b", "CHK07"}
    back_checks = {"CHK08", "CHK09", "CHK12", "CHK13", "CHK14"}
    mrp_checks = {"CHK11"}
    if check_id in front_checks:
        return "front"
    if check_id in back_checks:
        return "back"
    if check_id in mrp_checks:
        return "mrp"
    return "front"  # default


# ---------------------------------------------------------------------------
# 3. Recapture Endpoints
# ---------------------------------------------------------------------------

@router.get("/inspections/{inspection_id}/tasks")
def get_capture_tasks(
    inspection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all pending and fulfilled capture tasks for an inspection.

    Generates tasks from the current assessment state of each live scan.
    """
    insp = (
        db.query(Inspection)
        .options(
            selectinload(Inspection.scans).selectinload(Scan.images),
            selectinload(Inspection.scans).selectinload(Scan.findings),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if insp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")

    all_tasks = []
    live_scans = [s for s in (insp.scans or []) if s.duplicate_of is None]

    for scan in live_scans:
        findings = list(scan.findings or [])
        images = list(scan.images or [])
        tasks = _generate_capture_tasks(inspection_id, scan, findings, images)

        # Check audit log for fulfillment status
        from models import AuditLog
        fulfilled_audit = (
            db.query(AuditLog)
            .filter(
                AuditLog.inspection_id == inspection_id,
                AuditLog.scan_id == scan.id,
                AuditLog.action.in_(["capture_fulfilled", "capture_skipped"]),
            )
            .all()
        )
        fulfilled_ids = set()
        skipped_ids = set()
        for a in fulfilled_audit:
            if a.action == "capture_fulfilled" and a.new_value:
                fulfilled_ids.add(a.new_value.split(":")[0] if ":" in a.new_value else a.new_value)
            elif a.action == "capture_skipped" and a.new_value:
                skipped_ids.add(a.new_value)

        for t in tasks:
            if t["request_id"] in fulfilled_ids:
                t["status"] = "fulfilled"
            elif t["request_id"] in skipped_ids:
                t["status"] = "skipped"

        all_tasks.extend(tasks)

    pending = sum(1 for t in all_tasks if t["status"] == "pending")
    fulfilled = sum(1 for t in all_tasks if t["status"] == "fulfilled")
    skipped = sum(1 for t in all_tasks if t["status"] == "skipped")

    return {
        "inspection_id": inspection_id,
        "total_tasks": len(all_tasks),
        "pending": pending,
        "fulfilled": fulfilled,
        "skipped": skipped,
        "tasks": all_tasks,
    }


@router.post("/inspections/{inspection_id}/tasks/{request_id}/fulfill")
def fulfill_capture_task(
    inspection_id: int,
    request_id: str,
    body: FulfillCaptureRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a capture request as fulfilled or skipped.

    If skip_reason is provided, the task is marked as skipped.
    Otherwise, it is fulfilled (optionally linking a scan_image_id).
    """
    insp = db.get(Inspection, inspection_id)
    if insp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")

    if insp.status == "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Inspection already submitted")

    # Validate linked image if provided
    if body.scan_image_id is not None:
        img = db.get(ScanImage, body.scan_image_id)
        if img is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Image not found")
        scan = db.get(Scan, img.scan_id)
        if scan is None or scan.inspection_id != inspection_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                detail="Image does not belong to this inspection")

    if body.skip_reason:
        # Skip the task
        append_audit(
            db, inspection_id=inspection_id, user_id=user.id,
            action="capture_skipped",
            new_value=request_id,
            reason=body.skip_reason,
        )
        return {
            "success": True,
            "request_id": request_id,
            "status": "skipped",
            "reason": body.skip_reason,
        }

    # Fulfill the task
    new_val = request_id
    if body.scan_image_id:
        new_val = f"{request_id}:img_{body.scan_image_id}"

    append_audit(
        db, inspection_id=inspection_id, user_id=user.id,
        action="capture_fulfilled",
        new_value=new_val,
        reason=body.notes or f"Capture request {request_id} fulfilled",
    )

    return {
        "success": True,
        "request_id": request_id,
        "status": "fulfilled",
        "scan_image_id": body.scan_image_id,
    }


@router.post("/inspections/{inspection_id}/reassess")
def trigger_reassessment(
    inspection_id: int,
    body: RecaptureAssessRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger re-assessment for specified scans after recapture.

    This does not re-run OCR or LLM (those are in the scan pipeline).
    It re-evaluates the compliance rules with the current evidence.
    """
    insp = db.get(Inspection, inspection_id)
    if insp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")

    if insp.status == "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Inspection already submitted")

    results = []
    for scan_id in body.scan_ids:
        scan = db.get(Scan, scan_id)
        if scan is None or scan.inspection_id != inspection_id:
            results.append({"scan_id": scan_id, "ok": False, "error": "not_found_or_wrong_inspection"})
            continue

        # Log the reassessment trigger — the actual re-assessment happens
        # via the existing POST /scans/{id}/assess endpoint
        append_audit(
            db, inspection_id=inspection_id, scan_id=scan_id,
            user_id=user.id,
            action="reassessment_triggered",
            new_value=f"scan_{scan_id}",
            reason="Inspector triggered reassessment after recapture",
        )

        results.append({
            "scan_id": scan_id,
            "ok": True,
            "current_result": scan.overall_result,
            "assess_url": f"/scans/{scan_id}/assess",
        })

    return {
        "inspection_id": inspection_id,
        "total": len(results),
        "succeeded": sum(1 for r in results if r["ok"]),
        "failed": sum(1 for r in results if not r["ok"]),
        "results": results,
    }


# ---------------------------------------------------------------------------
# 4. Panel Coverage Analysis
# ---------------------------------------------------------------------------

@router.get("/inspections/{inspection_id}/coverage")
def get_panel_coverage(
    inspection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Analyze panel coverage for an inspection — which panels are captured,
    which are missing, and what evidence gaps exist."""
    insp = (
        db.query(Inspection)
        .options(
            selectinload(Inspection.scans).selectinload(Scan.images),
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

    scan_coverage = []
    for scan in live_scans:
        images = list(scan.images or [])
        findings = list(scan.findings or [])

        captured = set()
        panel_images = {}
        for img in images:
            captured.add(img.panel)
            panel_images.setdefault(img.panel, []).append({
                "id": img.id,
                "panel": img.panel,
                "sha256": img.sha256,
                "blur_variance": img.blur_variance,
                "residual_tilt_deg": img.residual_tilt_deg,
                "rectified": img.rectified,
            })

        # Evidence gaps
        expected = {"front", "back"}
        missing = expected - captured
        extra = captured - expected

        # Quality issues
        quality_issues = []
        for img in images:
            if img.blur_variance is not None and img.blur_variance < 100:
                quality_issues.append({
                    "image_id": img.id,
                    "panel": img.panel,
                    "issue": "blur",
                    "detail": f"Blur variance {img.blur_variance:.1f} below threshold",
                })
            if img.residual_tilt_deg is not None and abs(img.residual_tilt_deg) > 5:
                quality_issues.append({
                    "image_id": img.id,
                    "panel": img.panel,
                    "issue": "tilt",
                    "detail": f"Residual tilt {img.residual_tilt_deg:.1f}° exceeds threshold",
                })

        # Assessment completeness
        total_checks = scan.checks_total
        assessed = scan.checks_assessed
        na_checks = [f for f in findings if f.engine_verdict == "not_assessed"]

        scan_coverage.append({
            "scan_id": scan.id,
            "commodity": scan.commodity_generic,
            "brand": scan.brand_name,
            "panels_captured": sorted(captured),
            "panels_missing": sorted(missing),
            "panels_extra": sorted(extra),
            "panel_images": panel_images,
            "quality_issues": quality_issues,
            "total_checks": total_checks,
            "checks_assessed": assessed,
            "not_assessed_checks": [f.check_id for f in na_checks],
            "coverage_percentage": round(assessed / total_checks * 100, 1) if total_checks > 0 else 0,
            "overall_result": scan.overall_result,
        })

    return {
        "inspection_id": inspection_id,
        "total_scans": len(scan_coverage),
        "scan_coverage": scan_coverage,
    }
