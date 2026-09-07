"""routers/scans.py"""
import math
import os
import threading
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from audit import append_audit
from config import settings
from database import get_db
from models import Finding, Inspection, Scan, ScanImage, User
from rbac import get_current_user, owned_scan
from schemas import ScanOut, VerdictCounts
from pydantic import BaseModel, Field, field_validator, model_validator

router = APIRouter(prefix="/scans", tags=["scans"])

MAX_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024

# Assess concurrency guard (11 §4): ASSESS_CONCURRENCY=0 -> cpu_count.
# A full assess run is CPU-bound (OCR + 19 checks); unbounded parallel
# assesses OOM the worker. Try-acquire with 20s wait, else 503+Retry-After.
def _assess_limit() -> int:
    try:
        n = int(getattr(settings, "ASSESS_CONCURRENCY", 0) or 0)
    except Exception:
        n = 0
    if n <= 0:
        try:
            n = os.cpu_count() or 4
        except Exception:
            n = 4
    return max(1, n)

_ASSESS_SEMAPHORE = threading.Semaphore(_assess_limit())
_ASSESS_WAIT_S = int(getattr(settings, "ASSESS_QUEUE_WAIT_S", 20) or 20)

ALLOWED_PANELS = {"front", "back", "side", "mrp", "batch", "other"}
ALLOWED_QUANTITY_UNITS = {
    "g", "kg", "mg", "gm", "ml", "l", "ltr", "litre",
    "pcs", "pc", "pack", "m", "cm", "mm", "n", "u",
}


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
    request: Request,
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
    # Submitted-inspection guard: frozen once submitted (same as update_scan).
    if scan.inspection_id:
        _insp = db.get(Inspection, scan.inspection_id)
        if _insp is not None and _insp.status == "submitted":
            raise HTTPException(status.HTTP_409_CONFLICT,
                                detail="Inspection submitted; scan frozen")

    # Panel validation: allow-list, normalized; reject empty/>24 chars (422).
    normalized_panel = (panel or "").strip().lower()
    if not normalized_panel or len(normalized_panel) > 24:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Invalid panel: must be 1-24 chars")
    if normalized_panel not in ALLOWED_PANELS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Invalid panel: must be one of {sorted(ALLOWED_PANELS)}")

    # OOM guard: reject early on Content-Length before buffering the body.
    try:
        _cl = request.headers.get("content-length")
        if _cl is not None and int(_cl) > MAX_BYTES + 1024 * 1024:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image exceeds {settings.MAX_UPLOAD_MB} MB",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds {settings.MAX_UPLOAD_MB} MB",
        )

    from image_processor import (
        PHASH_BANDS, assess_quality, phash_bands, read_capture_time,
        sniff_mime, store_upload,
    )
    from PIL import UnidentifiedImageError
    from PIL.Image import DecompressionBombError
    import cv2
    import numpy as np

    # MIME sniffing: never trust file.content_type; sniff via PIL.
    # sniff_mime enforces MAX_IMAGE_PIXELS (decompression-bomb ceiling) via
    # PIL before any cv2 decode, so a bomb fails fast with 413, not OOM.
    try:
        sniffed_mime = sniff_mime(raw)
    except ValueError as e:
        msg = str(e)
        if "too large" in msg.lower():
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=msg)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)

    # Pre-validate decodability BEFORE store_upload to avoid orphan files.
    # PIL already verified pixels above; cv2 probe is the second gate.
    try:
        _probe = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Image could not be decoded")
    if _probe is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Image could not be decoded")

    try:
        stored = store_upload(raw, sniffed_mime, scan.inspection_id, scan.id)
    except ValueError as e:
        msg = str(e)
        if "too large" in msg.lower():
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=msg)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)
    except OSError as e:
        # Disk errors (ENOSPC/EACCES from mkdir/write) are 503, not 422:
        # the evidence store is unavailable, not the upload invalid.
        import errno as _errno
        _no = getattr(e, "errno", None)
        if _no in (_errno.ENOSPC, _errno.EACCES, _errno.EROFS, 28, 13, 30):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                                detail="Evidence store unavailable; retry shortly")
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Unsupported or corrupt image: {e}")
    except UnidentifiedImageError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Unsupported or corrupt image: {e}")
    except DecompressionBombError as e:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"Image too large: {e}")
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Image store failed: {type(e).__name__}")

    bgr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        # Pre-validation passed but decode now fails; remove orphan if created.
        try:
            from pathlib import Path as _P
            _p = _P(str(stored.path))
            if _p.exists():
                _p.unlink()
        except Exception:
            pass
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Image could not be decoded")

    quality = assess_quality(bgr)
    try:
        phash_hex, bands = phash_bands(stored.path)
    except Exception:
        # A hash failure is a client-visible 422, never a 500: the file is
        # stored but unhashable (e.g. truncated write); remove orphan.
        try:
            from pathlib import Path as _P2
            _p2 = _P2(str(stored.path))
            if _p2.exists():
                _p2.unlink()
        except Exception:
            pass
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Image could not be hashed")

    # Sequence race: (scan_id, panel, sequence) is unique. Two concurrent
    # uploads can read the same COUNT; retry with max+1 requery (3 attempts),
    # else 409 so the client retries instead of seeing a 500.
    img = None
    for _attempt in range(3):
        try:
            _seq = db.query(ScanImage).filter(
                ScanImage.scan_id == scan.id, ScanImage.panel == normalized_panel
            ).count()
            # On retry, ensure forward progress past the conflicting slot.
            if _attempt > 0:
                from sqlalchemy import func as _func
                _mx = db.query(_func.max(ScanImage.sequence)).filter(
                    ScanImage.scan_id == scan.id, ScanImage.panel == normalized_panel
                ).scalar()
                if _mx is not None and _mx >= _seq:
                    _seq = _mx + 1
            img = ScanImage(
                scan_id=scan.id, panel=normalized_panel,
                sequence=_seq,
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
            break
        except IntegrityError:
            db.rollback()
            if _attempt == 2:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    detail="Image slot conflict; retry upload")
            continue
    assert img is not None
    db.refresh(img)

    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id,
                 user_id=user.id, action="image_uploaded",
                 new_value=f"{normalized_panel}:{stored.sha256[:16]}")

    # A poor-quality image is accepted and flagged. It is NOT rejected: doing
    # so throws away the capture and leaves no record that an unreadable
    # package was found, which silently biases the statistics toward the
    # photogenic subset of the field.
    # Advisory panel-quad suggestion (classical detector, never acts on
    # evidence). The client may offer it for on-screen adjustment before
    # assess; None means "frame it manually".
    _corners = None
    try:
        from image_processor import detect_panel_quad
        _q = detect_panel_quad(bgr)
        if _q is not None:
            _corners = [[round(float(x), 1), round(float(y), 1)] for x, y in _q.tolist()]
    except Exception:
        _corners = None

    return {
        "image_id": img.id,
        "sha256": img.sha256,
        "usable": quality.usable,
        "quality_note": quality.reason,
        "suggested_corners": _corners,
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

    Concurrency: guarded by a process-local semaphore (ASSESS_CONCURRENCY or
    cpu_count); if the pool is busy for ASSESS_QUEUE_WAIT_S the endpoint
    returns 503 with Retry-After instead of OOMing the worker.
    """
    if not _ASSESS_SEMAPHORE.acquire(timeout=_ASSESS_WAIT_S):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Assessment capacity busy; retry shortly",
                            headers={"Retry-After": str(_ASSESS_WAIT_S)})
    try:
        return _assess_inner(scan, user, db)
    finally:
        try:
            _ASSESS_SEMAPHORE.release()
        except Exception:
            pass


def _assess_inner(scan: Scan, user: User, db: Session):
    inspection = db.get(Inspection, scan.inspection_id)
    if inspection is not None and inspection.status == "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="Inspection submitted; scan frozen")
    ctx = build_context(db, scan, inspection)

    from rules_engine import assess as run_assessment
    findings, verdict, provenance = run_assessment(ctx)

    # Persist OCR evidence on the scan (truncated 20k) + mean confidence so
    # reports and the review queue can show what the engine actually read
    # without re-running OCR. build_context already staged these on the
    # instance where possible; ensure they are set even if ctx was early-out.
    try:
        _full = getattr(ctx, "ocr_full_text", None)
        if _full is None and getattr(ctx, "fields", None):
            _full = " ".join(
                (getattr(f, "source_line", None) or getattr(f, "value", None) or "")
                for f in ctx.fields.values())
        if _full:
            scan.ocr_text = _full[:20000]
        scan.ocr_confidence_mean = getattr(ctx, "ocr_mean_confidence", None)
    except Exception:
        pass

    old = db.query(Finding).filter(Finding.scan_id == scan.id).all()
    if old:
        # Flush-only: batched into the single commit below so the audit row
        # cannot commit while the findings replacement later fails.
        append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id,
                     user_id=user.id, action="assessment_rerun",
                     old_value=scan.overall_result, reason="Re-assessment requested",
                     commit=False)
        for f in old:
            db.delete(f)
        db.flush()

    for f in findings:
        db.add(Finding(
            scan_id=scan.id, check_id=f.check_id, title=f.title,
            engine_verdict=f.verdict, severity=f.severity, reason=f.reason,
            observed=f.observed, required=f.required, citation=f.citation,
            ledger_ref=f.ledger_ref, confidence=f.confidence, limb=f.limb,
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

    from queries import resolve_duplicate
    scan.duplicate_of = resolve_duplicate(db, scan, inspection)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="Assessment conflicts with existing data; retry")
    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id,
                 user_id=user.id, action="assessed", new_value=verdict.overall_result)

    # Storage minimisation (decided 2026-08-31, narrowed: never purge
    # not_assessed or violation): only compliant / out_of_scope photos are
    # discarded; only the assessed record is kept. Images are retained for
    # violation (the "bad record" an officer may need) AND for not_assessed
    # (the review queue + append-only trigger need the file). Purging
    # not_assessed destroys the evidence the reviewer must see. This runs
    # AFTER assessment, so the front panel was still available to the engine
    # above; re-assessing a purged scan will read no image.
    # Retention vs migration: audit_logs stays fully append-only at the DB
    # level, scan_images blocks UPDATE only (evidence immutability) but
    # allows DELETE so this purge can run — see alembic 0001 (img_no_update
    # kept, img_no_delete removed). A purge failure is logged, never fatal.
    if scan.overall_result in ("compliant", "out_of_scope"):
        from image_processor import delete_stored_file
        import logging as _logging
        imgs = db.query(ScanImage).filter(ScanImage.scan_id == scan.id).all()
        if imgs:
            for im in imgs:
                try:
                    delete_stored_file(im.file_path, scan.inspection_id, scan.id)
                except Exception as e:
                    _logging.getLogger(__name__).warning(
                        "purge failed for scan %s image %s: %s", scan.id, im.id, e)
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
            "thumbnail_url": f"/scans/{scan.id}/images/{img.id}/thumbnail",
        })
    return {
        "scan_id": scan.id,
        "images": results,
        "all_intact": bool(results) and all(r["sha256_matches"] for r in results),
    }


@router.get("/{scan_id}/images/{image_id}/thumbnail")
def image_thumbnail(scan_id: int, image_id: int,
                    scan: Scan = Depends(owned_scan),
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """P1 fix: portal findings showed hashes only — judges could not eyeball.
    Serves a downscaled JPEG copy (max 512px) of the stored evidence; the
    original file is never resized. Auth via owned_scan (inspector sees own,
    admin sees all). Purged images → 404."""
    from fastapi.responses import Response
    from pathlib import Path
    import io
    img = db.query(ScanImage).filter(
        ScanImage.id == image_id, ScanImage.scan_id == scan.id).first()
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Image not found")
    p = Path(img.file_path)
    if not p.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail="Image purged or missing")
    try:
        from audit import append_audit as _aa
        _aa(db, inspection_id=scan.inspection_id, scan_id=scan.id,
            user_id=user.id, action="evidence_viewed",
            new_value=f"{img.panel}:{img.sha256[:16]}")
    except Exception:
        pass
    try:
        from PIL import Image
        with Image.open(p) as im:
            im = im.convert("RGB")
            im.thumbnail((512, 512))
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=72)
            return Response(content=buf.getvalue(), media_type="image/jpeg")
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Image could not be rendered")


class UpdateScanRequest(BaseModel):
    """Patch the operator-declared scope flags that decide CHK02/11/12/13/14. Nullable = unknown -> not_assessed, never pass.

    reference_pixel_size is the pixel length of the scale reference object
    (ID-1 card long edge / 5-INR coin diameter) when scale_source is not
    "declared". Threaded to compute_scale via getattr(scan, ...) in
    build_context; persisted on the row when the column exists, otherwise
    held transiently for the next assess.
    """
    commodity_generic: str | None = Field(default=None, max_length=120)
    brand_name: str | None = Field(default=None, max_length=120)
    commodity_category: str | None = Field(default=None, max_length=60)
    batch_number: str | None = Field(default=None, max_length=60)
    net_quantity_value: float | None = Field(default=None, gt=0)
    net_quantity_unit: str | None = Field(default=None, max_length=12)
    is_imported: bool | None = None
    is_perishable: bool | None = None
    is_medical_device: bool | None = None
    is_tobacco: bool | None = None
    has_sticker: bool | None = None
    sticker_reduces_price: bool | None = None
    sticker_covers_original: bool | None = None
    reference_pixel_size: float | None = Field(default=None, gt=0, le=100000)

    @field_validator("net_quantity_value", mode="after")
    @classmethod
    def _qty_finite_positive(cls, v):
        if v is None:
            return None
        if not math.isfinite(v) or v <= 0:
            raise ValueError("net_quantity_value must be finite and > 0")
        return v

    @field_validator("net_quantity_unit", mode="before")
    @classmethod
    def _unit_normalize(cls, v):
        if v is None:
            return None
        norm = str(v).strip().lower()
        if not norm:
            return None
        if norm not in ALLOWED_QUANTITY_UNITS:
            raise ValueError(f"net_quantity_unit must be one of {sorted(ALLOWED_QUANTITY_UNITS)}")
        return norm

    @model_validator(mode="after")
    def _sticker_consistency(self):
        if self.has_sticker is False and (
            self.sticker_reduces_price is not None or self.sticker_covers_original is not None
        ):
            raise ValueError("sticker_* must be None when has_sticker is False")
        return self


@router.patch("/{scan_id}")
def update_scan(body: UpdateScanRequest, scan: Scan = Depends(owned_scan), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Before assess: persist the 9 scope answers so re-assess is reproducible 06 §3.4.

    Any scope/geometry change stales the previous assessment: findings are
    deleted, overall_result reset to not_assessed with checks_assessed=0, and
    the staling is audited (scan_staled). The next assess rebuilds findings
    from the new inputs; without this the old verdict would masquerade as
    covering the new inputs.
    """
    if scan.inspection_id:
        insp = db.get(Inspection, scan.inspection_id)
        if insp and insp.status == "submitted":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Inspection submitted; scan frozen")
    _keys = body.model_dump(exclude_unset=True)
    for k, v in _keys.items():
        try:
            setattr(scan, k, v)  # all keys are columns (reference_pixel_size persisted since 0003)
        except AttributeError:
            # Unknown attr: keep on the instance for the next assess in this
            # process without failing the patch.
            object.__setattr__(scan, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Scan update conflicts with existing data")
    # Stale the prior assessment when inputs changed (skip if no findings).
    try:
        _old_findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        if _old_findings:
            for _f in _old_findings:
                db.delete(_f)
            scan.overall_result = "not_assessed"
            scan.checks_assessed = 0
            scan.violation_limb = None
            scan.recommended_action = None
            db.commit()
            append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id, user_id=user.id,
                         action="scan_staled", old_value=f"{len(_old_findings)} finding(s)",
                         reason=f"inputs changed: {sorted(_keys)}")
    except IntegrityError:
        db.rollback()
    db.refresh(scan)
    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id, user_id=user.id, action="scan_updated", new_value=str(sorted(_keys.keys())))
    return {"scan_id": scan.id, "updated": sorted(_keys.keys())}


class ListingRequest(BaseModel):
    url: str = Field(..., description="https:// E-commerce listing URL")
    platform_has_origin_filter: bool | None = Field(
        default=None,
        description="Officer-observed: marketplace offers country-of-origin filter (CHK16)")


@router.post("/{scan_id}/listing")
def attach_listing(body: ListingRequest, scan: Scan = Depends(owned_scan), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fetch listing for CHK15/16 via SSRF-guarded fetcher. Persists the URL +
    stripped listing text on the scan so build_context can assess Rule 6(10)
    (previously the HTML was fetched then discarded → CHK15/16 dead)."""
    if scan.inspection_id:
        _li = db.get(Inspection, scan.inspection_id)
        if _li is not None and _li.status == "submitted":
            raise HTTPException(status.HTTP_409_CONFLICT,
                                detail="Inspection submitted; scan frozen")
    # Use listing_fetcher SSRF guard
    from listing_fetcher import fetch_listing
    url = body.url
    try:
        html = fetch_listing(url)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Fetch failed: {type(e).__name__}")
    # Strip tags → visible text (first 20k chars) for declaration parsing.
    try:
        import re as _re
        _txt = _re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=_re.I)
        _txt = _re.sub(r"<[^>]+>", " ", _txt)
        _txt = _re.sub(r"\s+", " ", _txt).strip()[:20000]
    except Exception:
        _txt = html[:20000]
    try:
        scan.listing_url = url[:500]
    except Exception:
        pass
    try:
        scan.listing_text = _txt
    except Exception:
        pass
    # Optional platform flag from request body (checkbox in portal Capture).
    try:
        _pf = getattr(body, "platform_has_origin_filter", None)
        if _pf is not None:
            scan.platform_has_origin_filter = bool(_pf)
    except Exception:
        pass
    try:
        db.commit()
    except Exception:
        db.rollback()
    # Keep ocr_text for OCR only; do NOT append raw HTML. Record the URL +
    # a truncated marker in audit for traceability.
    marker = f"[LISTING {url[:200]} len={len(html)}]"
    append_audit(db, inspection_id=scan.inspection_id, scan_id=scan.id, user_id=user.id, action="listing_attached", new_value=f"{url[:200]} {marker}")
    return {"scan_id": scan.id, "listing_url": url, "fetched_chars": len(html)}


def build_context(db: Session, scan: Scan, inspection: Inspection):
    """Assemble everything the engine needs. One place, so a check never
    reaches into the database and so the engine is trivially testable with a
    hand-built context.

    OCR covers ALL panels, not just front: each stored image is OCR'd and the
    lines concatenated for field extraction, so an MRP on the side panel or a
    batch number on the back panel is still found. Scale/measurement still
    comes from the front panel only (Rule 7 governs the principal display).
    OCR text is persisted on scan.ocr_text (truncated 20k) with
    scan.ocr_confidence_mean for reports and the review queue.
    """
    from pathlib import Path
    import cv2

    from image_processor import assess_quality, compute_scale, rectify
    from ocr_engine import OcrResult, extract_fields, run_ocr
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
    if bgr is None:
        # Missing/corrupt/purged file: mark unusable and return early instead
        # of crashing on assess_quality / bgr.shape (would be a 500).
        ctx.image_usable = False
        ctx.image_quality_reason = (
            "The front-panel image file is missing, corrupt, or was purged, "
            "so nothing on the principal display panel can be read or measured."
        )
        return ctx
    quality = assess_quality(bgr)
    ctx.image_usable, ctx.image_quality_reason = quality.usable, quality.reason

    shape = getattr(bgr, "shape", None)
    if shape is None or len(shape) < 1:
        ctx.image_usable = False
        ctx.image_quality_reason = (
            "The front-panel image could not be decoded, so nothing on the "
            "principal display panel can be read or measured."
        )
        return ctx
    scale = compute_scale(
        panel_pixel_height=int(shape[0]),
        declared_panel_height_mm=scan.panel_height_mm,
        reference_pixel_size=getattr(scan, "reference_pixel_size", None),
        reference=scan.scale_source or "declared",
    )
    ctx.mm_per_pixel = scale.mm_per_pixel
    ctx.mm_per_pixel_uncertainty = scale.uncertainty
    ctx.scale_source = scale.source
    if scale.mm_per_pixel is None and ctx.image_quality_reason is None:
        ctx.image_quality_reason = scale.reason

    # Multi-panel OCR: run every stored panel, concat lines for field
    # extraction. Front-panel quality above still governs image_usable; OCR
    # availability is true if ANY panel yields text.
    _all_lines: list = []
    _engines: list[str] = []
    _confs: list[float] = []
    _fail_reason: str | None = None
    for _im in images:
        try:
            if not Path(_im.file_path).exists():
                continue
            _b = cv2.imread(_im.file_path) if _im is not front else bgr
            if _b is None:
                continue
            _ocr = run_ocr(_b)
        except Exception:
            continue
        if _ocr.lines:
            _all_lines.extend(_ocr.lines)
            _engines.append(_ocr.engine)
        if _ocr.mean_confidence is not None:
            _confs.append(float(_ocr.mean_confidence))
        if _ocr.failure_reason and _fail_reason is None:
            _fail_reason = _ocr.failure_reason
    if _all_lines:
        _mean = float(sum(_confs) / len(_confs)) if _confs else None
        ocr = OcrResult(lines=_all_lines, engine=_engines[0] if _engines else "unknown",
                        mean_confidence=_mean, failure_reason=None)
    else:
        # Fall back to the front-panel result for an honest failure reason.
        ocr = run_ocr(bgr)
    ctx.ocr_available = ocr.engine != "none"
    ctx.ocr_failure_reason = ocr.failure_reason if not ctx.ocr_available else _fail_reason if _fail_reason and not _all_lines else ocr.failure_reason
    ctx.ocr_mean_confidence = ocr.mean_confidence
    ctx.fields = extract_fields(ocr)
    try:
        ctx.ocr_full_text = ocr.full_text  # consumed by assess for scan.ocr_text persistence
    except Exception:
        pass
    # Persist OCR evidence on the scan row (staged; committed by assess).
    try:
        if ocr.full_text:
            scan.ocr_text = ocr.full_text[:20000]
        scan.ocr_confidence_mean = ocr.mean_confidence
    except Exception:
        pass

    if scale.mm_per_pixel:
        ctx.measured_heights_mm = {
            _label_for(line): line.height_px * scale.mm_per_pixel
            for line in ocr.lines
            if _label_for(line)
        }
        # P0 fix: CHK07/CHK09/CHK08 were permanently not_assessed because these
        # inputs were never built. Derive widths from OCR box x-extent (same
        # scale), clear-space from neighbouring line gaps, contrast from panel.
        try:
            widths: dict[str, float] = {}
            for line in ocr.lines:
                label = _label_for(line)
                if not label or label in widths:
                    continue
                xs = [p[0] for p in (line.box or []) if len(p) >= 2]
                if len(xs) >= 2:
                    widths[label] = (max(xs) - min(xs)) * scale.mm_per_pixel
                elif line.text:
                    # No box (plain-text fallback): width ≈ 0.6×height per char.
                    widths[label] = len(line.text.strip()) * line.height_px * 0.6 * scale.mm_per_pixel
            ctx.measured_widths_mm = widths
        except Exception:
            pass
        try:
            # Clear space: vertical gap between net-qty line and nearest lines
            # above/below in pixel space → mm. Left/right approximated from
            # horizontal margins of the net-qty box within the frame.
            from image_processor import estimate_contrast_ratio
            nq = [l for l in ocr.lines if _label_for(l) == "net_quantity"]
            if nq:
                import numpy as np
                ref = max(nq, key=lambda l: len(l.text or ""))
                ry = [p[1] for p in (ref.box or []) if len(p) >= 2]
                rx = [p[0] for p in (ref.box or []) if len(p) >= 2]
                if ry and rx:
                    ryc, rxc = (min(ry) + max(ry)) / 2, (min(rx) + max(rx)) / 2
                    above = [max([p[1] for p in l.box if len(p) >= 2])
                             for l in ocr.lines if l is not ref and l.box and len(l.box[0]) >= 2
                             and max([p[1] for p in l.box if len(p) >= 2]) < min(ry)]
                    below = [min([p[1] for p in l.box if len(p) >= 2])
                             for l in ocr.lines if l is not ref and l.box and len(l.box[0]) >= 2
                             and min([p[1] for p in l.box if len(p) >= 2]) > max(ry)]
                    h, w = bgr.shape[:2]
                    cs: dict[str, float] = {}
                    if above:
                        cs["above"] = (min(ry) - max(above)) * scale.mm_per_pixel
                    if below:
                        cs["below"] = (min(below) - max(ry)) * scale.mm_per_pixel
                    cs["left"] = min(rx) * scale.mm_per_pixel
                    cs["right"] = (w - max(rx)) * scale.mm_per_pixel
                    ctx.clear_space_mm = {k: max(0.0, float(v)) for k, v in cs.items()}
            try:
                ctx.contrast_ratio = estimate_contrast_ratio(bgr)
            except Exception:
                pass
        except Exception:
            pass

    # P0 fix: CHK15/CHK16 were permanently not_assessed because listing fields
    # were fetched then discarded. Re-parse persisted listing text (stored by
    # POST /scans/{id}/listing) into the same extract_fields shape the engine
    # reads, so e-commerce scans actually assess Rule 6(10).
    try:
        listing_text = getattr(scan, "listing_text", None) or getattr(scan, "listing_url", None) and ""
        listing_url = getattr(scan, "listing_url", None)
        if listing_text:
            from ocr_engine import OcrLine, OcrResult as _OR, extract_fields as _ef
            _lr = _OR(lines=[OcrLine(text=listing_text[:20000], confidence=None,
                                     box=[[0.0, 0.0]], height_px=0.0)],
                      engine="listing", mean_confidence=None)
            _lf = _ef(_lr)
            ctx.listing_available = True
            ctx.listing_fields = {k: (v.value or "") for k, v in _lf.items() if v.found}
            # platform filter flag persisted on scan when officer answers it
            pf = getattr(scan, "platform_has_origin_filter", None)
            if pf is not None:
                ctx.platform_has_origin_filter = bool(pf)
        elif listing_url:
            ctx.listing_available = True
            ctx.listing_fields = {}
    except Exception:
        pass
    return ctx

