"""routers/scans.py"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from audit import append_audit
from config import settings
from database import get_db
from models import Finding, Inspection, Scan, ScanImage, User
from rbac import get_current_user, owned_scan
from schemas import ScanOut, VerdictCounts
from pydantic import BaseModel, Field

router = APIRouter(prefix="/scans", tags=["scans"])

MAX_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024


def _label_for(line) -> str | None:
    """Map an OCR line to the declared-field label whose character height Rule 7/9 governs.
    Returns None for lines that carry no height-regulated field. Referenced by build_context."""
    t = (getattr(line, "text", "") or "").lower()
    if any(k in t for k in ("net qty", "net quantity", "net wt", "net weight", "net vol", "contents")):
        return "net_quantity"
    if any(k in t for k in ("m.r.p", "mrp", "maximum retail price")):
        return "mrp"
    return None


@router.post("/{scan_id}/images", status_code=status.HTTP_201_CREATED)
async def upload_image(
    panel: str = Form(...),
    file: UploadFile = File(...),
    scan: Scan = Depends(owned_scan),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Attach one panel image to an existing scan.

    Note what this does NOT do: it does not create a Scan. v1.x created a new
    Scan per uploaded image, so a package photographed front, back, MRP panel
    and batch panel became four packages with four independent verdicts, and
    the report listed the same item four times.
    """
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds {settings.MAX_UPLOAD_MB} MB",
        )

    from image_processor import (
        PHASH_BANDS, assess_quality, phash_bands, read_capture_time, store_upload,
    )
    import cv2
    import numpy as np

    stored = store_upload(raw, file.content_type or "image/jpeg",
                          scan.inspection_id, scan.id)
    bgr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Image could not be decoded")

    quality = assess_quality(bgr)
    phash_hex, bands = phash_bands(stored.path)

    img = ScanImage(
        scan_id=scan.id, panel=panel,
        sequence=db.query(ScanImage).filter(
            ScanImage.scan_id == scan.id, ScanImage.panel == panel
        ).count(),
        file_path=str(stored.path), byte_size=stored.byte_size,
        width_px=stored.width_px, height_px=stored.height_px,
        mime_type=stored.mime_type, sha256=stored.sha256,
        phash=phash_hex,
        **{f"phash_b{i}": bands[i] for i in range(PHASH_BANDS)},
        captured_at=read_capture_time(raw),
        blur_variance=quality.blur_variance, glare_ratio=quality.glare_ratio,
    )
    db.add(img)
    db.commit()
    db.refresh(img)

    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id,
                 user_id=user.id, action="image_uploaded",
                 new_value=f"{panel}:{stored.sha256[:16]}")

    # A poor-quality image is accepted and flagged. It is NOT rejected: doing
    # so throws away the capture and leaves no record that an unreadable
    # package was found, which silently biases the statistics toward the
    # photogenic subset of the field.
    return {
        "image_id": img.id,
        "sha256": img.sha256,
        "usable": quality.usable,
        "quality_note": quality.reason,
    }


@router.post("/{scan_id}/assess", response_model=ScanOut)
def assess_scan(
    scan: Scan = Depends(owned_scan),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run all nineteen checks and persist the findings.

    Idempotent by replacement: re-assessing deletes the previous findings for
    this scan and writes a fresh set, and the replacement is audited. It does
    NOT edit engine_verdict in place (C11) — the old row is gone, the new row
    is new, and the audit log records that an assessment was re-run.
    """
    inspection = db.get(Inspection, scan.inspection_id)
    ctx = build_context(db, scan, inspection)

    from rules_engine import assess as run_assessment
    findings, verdict, provenance = run_assessment(ctx)

    old = db.query(Finding).filter(Finding.scan_id == scan.id).all()
    if old:
        append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id,
                     user_id=user.id, action="assessment_rerun",
                     old_value=scan.overall_result, reason="Re-assessment requested")
        for f in old:
            db.delete(f)
        db.flush()

    for f in findings:
        db.add(Finding(
            scan_id=scan.id, check_id=f.check_id, title=f.title,
            engine_verdict=f.verdict, severity=f.severity, reason=f.reason,
            observed=f.observed, required=f.required, citation=f.citation,
            ledger_ref=f.ledger_ref, confidence=f.confidence,
        ))

    scan.overall_result = verdict.overall_result
    scan.violation_limb = verdict.violation_limb
    scan.recommended_action = verdict.recommended_action
    scan.checks_total = verdict.checks_total
    scan.checks_assessed = verdict.checks_assessed
    scan.rules_as_at = ctx.rules_as_at
    scan.catalog_hash = provenance["catalog_hash"]
    scan.engine_version = provenance["engine_version"]
    scan.mm_per_pixel = ctx.mm_per_pixel
    scan.scale_source = ctx.scale_source

    from models import Scan as ScanModel
    from queries import resolve_duplicate
    scan.duplicate_of = resolve_duplicate(db, scan, inspection)

    db.commit()
    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id,
                 user_id=user.id, action="assessed", new_value=verdict.overall_result)

    # Storage minimisation (decided 2026-08-31): a compliant / out-of-scope /
    # not-assessed package is not evidence of a breach, so its photos are
    # discarded and only the assessed record is kept. Images are retained ONLY
    # for a violation, which is the "bad record" an officer may need to show
    # later. This runs AFTER assessment, so the front panel was still available
    # to the engine above; re-assessing a purged scan will read no image.
    if scan.overall_result != "violation":
        from image_processor import delete_stored_file
        imgs = db.query(ScanImage).filter(ScanImage.scan_id == scan.id).all()
        if imgs:
            for im in imgs:
                delete_stored_file(im.file_path, scan.inspection_id, scan.id)
                db.delete(im)
            db.commit()
            append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id,
                         user_id=user.id, action="images_purged",
                         old_value=f"{len(imgs)} image(s)",
                         reason=f"result={scan.overall_result}; evidence retained only for violations")

    return _scan_out(db, scan)


def _scan_out(db: Session, scan: Scan) -> ScanOut:
    rows = db.query(Finding).filter(Finding.scan_id == scan.id).all()
    order = {cid: i for i, cid in enumerate(__import__("rules_engine").ALL_CHECK_IDS)}
    rows.sort(key=lambda r: order.get(r.check_id, 99))
    counts = VerdictCounts(
        total=len(rows),
        passed=sum(1 for r in rows if r.effective_verdict == "pass"),
        failed=sum(1 for r in rows if r.effective_verdict == "fail"),
        not_assessed=sum(1 for r in rows if r.effective_verdict == "not_assessed"),
    )
    out = ScanOut.model_validate(scan)
    out.counts = counts
    return out


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan: Scan = Depends(owned_scan), db: Session = Depends(get_db)):
    """Findings and counts for one scan. C4/C5 — the counts carry the denominator."""
    return _scan_out(db, scan)


@router.get("/{scan_id}/verify")
def verify_evidence(scan: Scan = Depends(owned_scan), db: Session = Depends(get_db)):
    """Rehash every stored file and report whether it still matches. C9.

    This endpoint is the reason store_upload() hashes what it wrote. Under
    v1.x every single image would report a mismatch here, because the hash was
    taken of the upload and the file on disk was a re-encoded derivative.
    """
    from image_processor import verify_stored_image
    from pathlib import Path

    results = []
    for img in db.query(ScanImage).filter(ScanImage.scan_id == scan.id).all():
        path = Path(img.file_path)
        exists = path.exists()
        results.append({
            "image_id": img.id,
            "panel": img.panel,
            "file_present": exists,
            "sha256_recorded": img.sha256,
            "sha256_matches": exists and verify_stored_image(path, img.sha256),
        })
    return {
        "scan_id": scan.id,
        "images": results,
        "all_intact": bool(results) and all(r["sha256_matches"] for r in results),
    }


class UpdateScanRequest(BaseModel):
    """Patch the operator-declared scope flags that decide CHK02/11/12/13/14. Nullable = unknown -> not_assessed, never pass."""
    commodity_generic: str | None = Field(default=None, max_length=120)
    brand_name: str | None = Field(default=None, max_length=120)
    commodity_category: str | None = Field(default=None, max_length=60)
    batch_number: str | None = Field(default=None, max_length=60)
    net_quantity_value: float | None = None
    net_quantity_unit: str | None = Field(default=None, max_length=12)
    is_imported: bool | None = None
    is_perishable: bool | None = None
    is_medical_device: bool | None = None
    is_tobacco: bool | None = None
    has_sticker: bool | None = None
    sticker_reduces_price: bool | None = None
    sticker_covers_original: bool | None = None


@router.patch("/{scan_id}")
def update_scan(body: UpdateScanRequest, scan: Scan = Depends(owned_scan), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Before assess: persist the 9 scope answers so re-assess is reproducible 06 §3.4."""
    if scan.inspection_id:
        insp = db.get(Inspection, scan.inspection_id)
        if insp and insp.status == "submitted":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Inspection submitted; scan frozen")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(scan, k, v)
    db.commit()
    db.refresh(scan)
    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id, user_id=user.id, action="scan_updated", new_value=str(sorted(body.model_dump(exclude_unset=True).keys())))
    return {"scan_id": scan.id, "updated": sorted(body.model_dump(exclude_unset=True).keys())}


class ListingRequest(BaseModel):
    url: str = Field(..., description="https:// E-commerce listing URL")


@router.post("/{scan_id}/listing")
def attach_listing(body: ListingRequest, scan: Scan = Depends(owned_scan), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fetch listing for CHK15/16 via SSRF-guarded fetcher. Stored as JSON on scan? For MVP store as audit + in-memory field for next assess."""
    # Use listing_fetcher SSRF guard
    from listing_fetcher import fetch_listing
    url = body.url
    try:
        html = fetch_listing(url)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Fetch failed: {type(e).__name__}")
    # Store first 5k chars as ocr_text proxy for listing_fields extraction
    scan.ocr_text = (scan.ocr_text or "") + f"\n[LISTING {url}]\n" + html[:5000]
    db.commit()
    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id, user_id=user.id, action="listing_attached", new_value=url[:200])
    return {"scan_id": scan.id, "listing_url": url, "fetched_chars": len(html)}


def build_context(db: Session, scan: Scan, inspection: Inspection):
    """Assemble everything the engine needs. One place, so a check never
    reaches into the database and so the engine is trivially testable with a
    hand-built context."""
    from pathlib import Path
    import cv2

    from image_processor import assess_quality, compute_scale, rectify
    from ocr_engine import extract_fields, run_ocr
    from rules_engine import CheckContext

    images = db.query(ScanImage).filter(ScanImage.scan_id == scan.id).all()
    ctx = CheckContext(
        transaction_type=inspection.transaction_type,
        commodity_generic=scan.commodity_generic,
        commodity_category=scan.commodity_category,
        net_quantity_value=scan.net_quantity_value,
        net_quantity_unit=scan.net_quantity_unit,
        is_imported=scan.is_imported,
        is_perishable=scan.is_perishable,
        is_medical_device=scan.is_medical_device,
        is_tobacco=scan.is_tobacco,
        has_sticker=scan.has_sticker,
        sticker_reduces_price=scan.sticker_reduces_price,
        sticker_covers_original=scan.sticker_covers_original,
        panel_shape=scan.panel_shape,
        panel_height_mm=scan.panel_height_mm,
        panel_width_mm=scan.panel_width_mm,
        panel_diameter_mm=scan.panel_diameter_mm,
        total_surface_area_cm2=scan.total_surface_area_cm2,
        is_blown_moulded=scan.is_blown_moulded,
        panels_captured={i.panel for i in images},
        rules_as_at=scan.rules_as_at or __import__("datetime").date.fromisoformat(
            settings.RULES_AS_AT
        ),
    )

    front = next((i for i in images if i.panel == "front"), None)
    if front is None or not Path(front.file_path).exists():
        ctx.image_usable = False
        ctx.image_quality_reason = (
            "No front-panel image is available for this scan, so nothing on the "
            "principal display panel can be read or measured."
        )
        return ctx

    bgr = cv2.imread(front.file_path)
    quality = assess_quality(bgr)
    ctx.image_usable, ctx.image_quality_reason = quality.usable, quality.reason

    scale = compute_scale(
        panel_pixel_height=bgr.shape[0],
        declared_panel_height_mm=scan.panel_height_mm,
        reference=scan.scale_source or "declared",
    )
    ctx.mm_per_pixel = scale.mm_per_pixel
    ctx.mm_per_pixel_uncertainty = scale.uncertainty
    ctx.scale_source = scale.source
    if scale.mm_per_pixel is None and ctx.image_quality_reason is None:
        ctx.image_quality_reason = scale.reason

    ocr = run_ocr(bgr)
    ctx.ocr_available = ocr.engine != "none"
    ctx.ocr_failure_reason = ocr.failure_reason
    ctx.ocr_mean_confidence = ocr.mean_confidence
    ctx.fields = extract_fields(ocr)

    if scale.mm_per_pixel:
        ctx.measured_heights_mm = {
            _label_for(line): line.height_px * scale.mm_per_pixel
            for line in ocr.lines
            if _label_for(line)
        }
    return ctx

