"""image_processor.py"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2
import imagehash
import numpy as np
from PIL import Image, UnidentifiedImageError
from PIL.Image import DecompressionBombError

from config import settings

# 09 §2.5 — a decompression-bomb ceiling. Pillow's own default is lower and
# raises a warning rather than an error, which is not a control.
Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}

_FORMAT_TO_MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def sniff_mime(raw: bytes) -> str:
    """Sniff the true MIME via PIL format, never trusting the claimed header.

    Raises ValueError (mapped to 422 by callers / main.py handler) for
    unidentified or unsupported images. Decompression-bomb images raise
    ValueError("Image too large...") so callers can map to 413.
    """
    import io
    try:
        with Image.open(io.BytesIO(raw)) as im:
            fmt = im.format
    except DecompressionBombError as e:
        raise ValueError("Image too large: exceeds pixel limit") from e
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise ValueError(f"Unsupported or corrupt image: {e}") from e
    mime = _FORMAT_TO_MIME.get((fmt or "").upper())
    if mime is None:
        raise ValueError(f"Unsupported image type: format={fmt!r}")
    return mime


@dataclass(slots=True)
class StoredImage:
    path: Path
    sha256: str
    byte_size: int
    width_px: int
    height_px: int
    mime_type: str


def store_upload(raw: bytes, mime: str, inspection_id: int, scan_id: int) -> StoredImage:
    """Write the bytes, then hash what was written.

    THE ORDER MATTERS AND IS NOT NEGOTIABLE. C9.

    v1.x computed sha256 over the uploaded bytes and then wrote a resized,
    re-encoded JPEG at quality 80. The stored hash therefore could never be
    reproduced from the stored file: rereading the evidence and hashing it
    yields a different digest every time. That defeats the entire
    court-readiness claim of the project, and it fails on the first
    verification anyone attempts — which is precisely when it matters most.

    The file on disk is the evidence. The hash describes the file on disk.
    """
    if mime not in ALLOWED_MIME:
        raise ValueError(f"Unsupported image type: {mime}")

    # Verify it decodes, and get dimensions, without re-encoding it.
    # Wrap PIL errors as ValueError so main.py's 422 handler catches them
    # instead of leaking a 500. Decompression-bomb maps to 413 upstream.
    import io
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()                       # raises on a malformed file
    except DecompressionBombError as e:
        raise ValueError("Image too large: exceeds pixel limit") from e
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise ValueError(f"Unsupported or corrupt image: {e}") from e
    try:
        with Image.open(io.BytesIO(raw)) as im:
            width, height = im.size
    except DecompressionBombError as e:
        raise ValueError("Image too large: exceeds pixel limit") from e
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise ValueError(f"Unsupported or corrupt image: {e}") from e

    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
    folder = settings.EVIDENCE_DIR / str(inspection_id) / str(scan_id)
    # Unique uuid suffix per file: concurrent uploads for the same panel never
    # clobber each other (no shared temp name, no lock needed). Disk errors
    # (ENOSPC, EACCES) propagate as OSError so callers map them to 503, not 422.
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        import logging as _logging
        _logging.getLogger(__name__).warning("evidence mkdir failed: %s", e)
        raise
    dest = folder / f"{uuid.uuid4().hex}{ext}"

    try:
        dest.write_bytes(raw)                    # byte-for-byte, no re-encode
        stored = dest.read_bytes()               # read back what is actually there
    except OSError as e:
        import logging as _logging2
        _logging2.getLogger(__name__).warning("evidence write failed: %s", e)
        raise
    digest = hashlib.sha256(stored).hexdigest()

    # Mirror to Supabase Storage asynchronously if configured — best-effort, never blocks local evidence response.
    # Local remains primary per 09 §5.1; Supabase is backup for offline-phone images 12 §11.
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        import threading
        def _mirror_bg(img_bytes=stored, c_type=mime, path_name=dest.name):
            try:
                from supabase import create_client
                supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
                key = f"{inspection_id}/{scan_id}/{path_name}"
                supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
                    key, img_bytes, {"content-type": c_type, "upsert": "true"}
                )
            except Exception:
                pass
        threading.Thread(target=_mirror_bg, daemon=True).start()

    return StoredImage(
        path=dest,
        sha256=digest,
        byte_size=len(stored),
        width_px=width,
        height_px=height,
        mime_type=mime,
    )


def verify_stored_image(path: Path, expected_sha256: str) -> bool:
    """Called by the report generator and by GET /scans/{id}/verify.

    Streams in 1 MB chunks so a 25 MB evidence file never loads fully into
    memory on a small worker.
    """
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest() == expected_sha256


def delete_stored_file(file_path, inspection_id: int, scan_id: int) -> None:
    """Remove one stored evidence file locally and, best-effort, its Supabase mirror.

    Used when an assessment comes back non-violation: a compliant package is not
    evidence of anything, so its photos are discarded and only the assessed
    record is retained (§ storage-minimisation, decided 2026-08-31). Never raises
    — a purge failure must not fail the assessment that triggered it.
    """
    p = Path(file_path)
    try:
        if p.exists():
            p.unlink()
    except Exception:
        pass
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        try:
            from supabase import create_client
            supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
            key = f"{inspection_id}/{scan_id}/{p.name}"
            supabase.storage.from_(settings.SUPABASE_BUCKET).remove([key])
        except Exception:
            pass  # mirror removal is best-effort; local deletion is authoritative


@dataclass(slots=True)
class Quality:
    blur_variance: float
    glare_ratio: float
    mean_luma: float
    usable: bool
    reason: str | None


BLUR_FLOOR = 100.0          # Laplacian variance; below this, text strokes merge
GLARE_CEILING = 0.08        # fraction of pixels at/near saturation
LUMA_FLOOR, LUMA_CEILING = 40.0, 225.0


def assess_quality(bgr: np.ndarray) -> Quality:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    glare = float((gray >= 250).sum()) / gray.size
    luma = float(gray.mean())

    reason = None
    if blur < BLUR_FLOOR:
        reason = (
            f"Image too blurred for text measurement "
            f"(sharpness {blur:.0f}, minimum {BLUR_FLOOR:.0f})."
        )
    elif glare > GLARE_CEILING:
        # Differentiate between uniform white label/carton packaging (where the entire background is white >= 250)
        # and a localized specular glare / flash hotspot (which covers a fraction GLARE_CEILING < glare <= 0.80).
        is_clean_white_package = blur >= BLUR_FLOOR and luma > 180.0 and glare > 0.80
        if not is_clean_white_package:
            reason = f"Glare over {glare:.0%} of the panel obscures the declarations."
    elif not (LUMA_FLOOR <= luma <= LUMA_CEILING):
        # A bright white packaging panel with sharp text is legible even with high mean luma;
        # similarly, a dark packaging panel with sharp text is legible even with low mean luma.
        is_clean_dark_package = luma < LUMA_FLOOR and blur >= BLUR_FLOOR
        if not ((luma > LUMA_CEILING and blur >= BLUR_FLOOR) or is_clean_dark_package):
            reason = f"Exposure outside the usable range (mean luminance {luma:.0f})."

    return Quality(blur, glare, luma, usable=reason is None, reason=reason)


@dataclass(slots=True)
class GeometryResult:
    corners: np.ndarray | None
    geometry_status: str       # 'detected' | 'unavailable' | 'failed'
    rectification_status: str  # 'applied' | 'skipped' | 'failed'
    confidence: float          # 0.0 to 1.0
    perspective_severity: str  # 'near_front_facing' | 'moderate' | 'severe' | 'unusable'
    residual_tilt_deg: float   # degrees
    rectified_width: int | None
    rectified_height: int | None
    reason: str | None


def order_corners_robust(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as tl, tr, br, bl (clockwise starting from top-left).

    Guarantees consistent ordering, prevents self-intersection (bowtie),
    and handles rotated boxes robustly.
    """
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    cx, cy = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - cy, pts[:, 0] - cx)
    order = np.argsort(angles)
    sorted_pts = pts[order]

    tl_idx = np.argmin(sorted_pts.sum(axis=1))
    ordered = np.roll(sorted_pts, -tl_idx, axis=0)

    v1 = ordered[1] - ordered[0]
    v2 = ordered[2] - ordered[1]
    cross = v1[0] * v2[1] - v1[1] * v2[0]
    if cross < 0:
        ordered = np.array([ordered[0], ordered[3], ordered[2], ordered[1]], dtype=np.float32)

    tl, tr, br, bl = ordered
    if tr[0] < tl[0] or bl[1] < tl[1]:
        s = pts.sum(axis=1)
        d = np.diff(pts, axis=1).ravel()
        ordered = np.array([pts[np.argmin(s)], pts[np.argmin(d)],
                            pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)
    return ordered


_order_corners = order_corners_robust


def validate_quadrilateral(quad: np.ndarray, img_w: int, img_h: int) -> tuple[bool, str | None, dict]:
    """Validate candidate quadrilateral against geometric safety and distortion constraints."""
    meta = {
        "area_ratio": 0.0,
        "aspect_ratio": 1.0,
        "residual_tilt_deg": 0.0,
        "perspective_severity": "unusable",
        "confidence": 0.0,
    }
    if quad is None:
        return False, "Candidate quad is None", meta

    quad = np.asarray(quad, dtype=np.float32).reshape(4, 2)
    if not np.all(np.isfinite(quad)):
        return False, "Candidate quad contains NaN or Inf coordinates", meta

    # 1. Boundary safety: check if corners are within frame (with 2% margin)
    x_min, x_max = -0.02 * img_w, 1.02 * img_w
    y_min, y_max = -0.02 * img_h, 1.02 * img_h
    if (quad[:, 0] < x_min).any() or (quad[:, 0] > x_max).any() or \
       (quad[:, 1] < y_min).any() or (quad[:, 1] > y_max).any():
        return False, "Corners exceed image boundary tolerance", meta

    # Clamp corners safely to image domain
    quad[:, 0] = np.clip(quad[:, 0], 0.0, float(max(0, img_w - 1)))
    quad[:, 1] = np.clip(quad[:, 1], 0.0, float(max(0, img_h - 1)))

    # 2. Strict convexity check
    if not cv2.isContourConvex(quad.astype(np.int32)):
        return False, "Quadrilateral is not convex", meta

    # 3. Area check
    area = float(cv2.contourArea(quad))
    frame_area = float(img_w * img_h)
    if area <= 0.0:
        return False, "Candidate area is zero or negative", meta
    area_ratio = area / (frame_area + 1e-6)
    meta["area_ratio"] = round(area_ratio, 4)
    if area_ratio < 0.05:
        return False, f"Candidate area too small ({area_ratio:.1%} of frame, min 5%)", meta
    if area_ratio > 0.98:
        return False, f"Candidate area too large ({area_ratio:.1%} of frame, max 98%)", meta

    # 4. Interior angles & non-collinearity
    angles = []
    for i in range(4):
        p_prev = quad[(i - 1) % 4]
        p_curr = quad[i]
        p_next = quad[(i + 1) % 4]
        v1 = p_prev - p_curr
        v2 = p_next - p_curr
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        if norm1 < 1e-4 or norm2 < 1e-4:
            return False, "Zero-length edge detected", meta
        cos_ang = np.dot(v1, v2) / (norm1 * norm2)
        ang = np.degrees(np.arccos(np.clip(cos_ang, -1.0, 1.0)))
        angles.append(ang)
        if ang < 35.0 or ang > 145.0:
            return False, f"Degenerate corner angle {ang:.1f}° (must be between 35° and 145°)", meta

    # 5. Edge lengths & opposite side ratios
    tl, tr, br, bl = quad
    l_top = float(np.linalg.norm(tr - tl))
    l_right = float(np.linalg.norm(br - tr))
    l_bot = float(np.linalg.norm(bl - br))
    l_left = float(np.linalg.norm(tl - bl))
    min_edge = min(l_top, l_right, l_bot, l_left)
    min_allowed_edge = max(25.0, 0.07 * min(img_w, img_h))
    if min_edge < min_allowed_edge:
        return False, f"Edge too short ({min_edge:.1f}px, min {min_allowed_edge:.1f}px)", meta

    r_horiz = max(l_top, l_bot) / (min(l_top, l_bot) + 1e-6)
    r_vert = max(l_left, l_right) / (min(l_left, l_right) + 1e-6)
    if r_horiz > 3.0 or r_vert > 3.0:
        return False, f"Extreme perspective asymmetry (horiz {r_horiz:.1f}, vert {r_vert:.1f})", meta

    # 6. Diagonal ratio
    d1 = float(np.linalg.norm(br - tl))
    d2 = float(np.linalg.norm(bl - tr))
    r_diag = max(d1, d2) / (min(d1, d2) + 1e-6)
    if r_diag > 2.8:
        return False, f"Extreme diagonal distortion ratio ({r_diag:.1f})", meta

    # 7. Aspect ratio (per §9, allows skinny/long packs up to 8.0, rejects pathological slivers)
    w_est = max(l_top, l_bot)
    h_est = max(l_left, l_right)
    ar = max(w_est, h_est) / (min(w_est, h_est) + 1e-6)
    meta["aspect_ratio"] = round(ar, 2)
    if ar > 8.0:
        return False, f"Pathological aspect ratio ({ar:.1f})", meta

    # 8. Perspective tilt & severity
    top_vec = tr - tl
    left_vec = bl - tl
    top_tilt = abs(float(np.degrees(np.arctan2(top_vec[1], top_vec[0]))))
    top_tilt = min(top_tilt, 180.0 - top_tilt)
    left_tilt = abs(float(np.degrees(np.arctan2(left_vec[0], left_vec[1]))))
    left_tilt = min(left_tilt, 180.0 - left_tilt)
    tilt = max(top_tilt, left_tilt)
    meta["residual_tilt_deg"] = round(tilt, 2)

    if tilt < 10.0:
        severity = "near_front_facing"
    elif tilt < 25.0:
        severity = "moderate"
    elif tilt < 40.0:
        severity = "severe"
    else:
        severity = "unusable"
    meta["perspective_severity"] = severity

    # 9. Confidence scoring
    ortho_penalty = float(np.mean([abs(a - 90.0) for a in angles])) / 90.0
    ratio_penalty = (max(r_horiz, r_vert) - 1.0) / 2.0
    conf = max(0.1, min(1.0, 1.0 - 0.5 * ortho_penalty - 0.3 * ratio_penalty))
    meta["confidence"] = round(conf, 3)

    return True, None, meta


def safe_rectify(bgr: np.ndarray, corners: np.ndarray, max_dim: int = 1600) -> tuple[np.ndarray, float, dict]:
    """Safe perspective rectification onto a fronto-parallel plane.

    Validates source geometry, destination bounds, and homography condition.
    Never mutates original evidence; produces a bounded derived representation.
    """
    default_meta = {
        "geometry_status": "unavailable",
        "rectification_status": "skipped",
        "confidence": 0.0,
        "perspective_severity": "unusable",
        "residual_tilt_deg": 0.0,
        "rectified_width": None,
        "rectified_height": None,
        "reason": "Invalid input",
    }
    if bgr is None or getattr(bgr, "size", 0) == 0:
        default_meta["reason"] = "Empty or null image"
        return bgr, 0.0, default_meta

    h_img, w_img = bgr.shape[:2]
    if corners is None:
        default_meta["reason"] = "No candidate corners provided"
        return bgr, 0.0, default_meta

    try:
        ordered = order_corners_robust(corners)
    except Exception as e:
        default_meta["geometry_status"] = "failed"
        default_meta["rectification_status"] = "failed"
        default_meta["reason"] = f"Corner ordering failed: {e}"
        return bgr, 0.0, default_meta

    valid, reason, meta = validate_quadrilateral(ordered, w_img, h_img)
    if not valid:
        geom_status = "unavailable" if ("small" in (reason or "") or "None" in (reason or "")) else "failed"
        meta["geometry_status"] = geom_status
        meta["rectification_status"] = "skipped"
        meta["rectified_width"] = None
        meta["rectified_height"] = None
        meta["reason"] = reason
        return bgr, 0.0, meta

    tl, tr, br, bl = ordered
    w_top = float(np.linalg.norm(tr - tl))
    w_bot = float(np.linalg.norm(br - bl))
    h_left = float(np.linalg.norm(bl - tl))
    h_right = float(np.linalg.norm(br - tr))

    w_dst = int(round(np.clip(max(w_top, w_bot), 50, max_dim)))
    h_dst = int(round(np.clip(max(h_left, h_right), 50, max_dim)))

    if meta.get("perspective_severity") == "unusable":
        meta["geometry_status"] = "detected"
        meta["rectification_status"] = "skipped"
        meta["rectified_width"] = None
        meta["rectified_height"] = None
        meta["reason"] = f"Perspective tilt {meta.get('residual_tilt_deg')}° is unusable (>= 40°)"
        return bgr, meta.get("residual_tilt_deg", 0.0), meta

    dst = np.array([[0, 0], [w_dst - 1, 0], [w_dst - 1, h_dst - 1], [0, h_dst - 1]], dtype=np.float32)
    try:
        M = cv2.getPerspectiveTransform(ordered, dst)
        if not np.all(np.isfinite(M)):
            raise ValueError("Homography matrix contains NaN or Inf")
        det = float(np.linalg.det(M))
        cond = float(np.linalg.cond(M))
        if abs(det) < 1e-9 or abs(det) > 1e12 or cond > 1e6 or np.isnan(cond):
            raise ValueError(f"Numerically unstable homography: det={det:.2e}, cond={cond:.2e}")

        warped = cv2.warpPerspective(bgr, M, (w_dst, h_dst), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        meta["geometry_status"] = "detected"
        meta["rectification_status"] = "applied"
        meta["rectified_width"] = w_dst
        meta["rectified_height"] = h_dst
        meta["reason"] = None
        return warped, meta.get("residual_tilt_deg", 0.0), meta
    except Exception as e:
        meta["geometry_status"] = "detected"
        meta["rectification_status"] = "failed"
        meta["confidence"] = 0.0
        meta["rectified_width"] = None
        meta["rectified_height"] = None
        meta["reason"] = f"Rectification failed: {e}"
        return bgr, meta.get("residual_tilt_deg", 0.0), meta


def rectify(bgr: np.ndarray, corners: np.ndarray) -> tuple[np.ndarray, float]:
    """Four-point homography onto a fronto-parallel plane.

    corners: (4,2) float32, in order tl, tr, br, bl.
    Returns the rectified image and the residual tilt in degrees.
    Preserves backward compatibility while utilizing safe_rectify.
    """
    warped, tilt, _ = safe_rectify(bgr, corners)
    return warped, tilt


@dataclass(slots=True)
class Scale:
    mm_per_pixel: float | None
    uncertainty: float | None
    source: str
    reason: str | None


# ISO/IEC 7810 ID-1, the format of every Indian ID card: 85.60 x 53.98 mm.
ID1_LONG_EDGE_MM = 85.60
COIN_5INR_DIAMETER_MM = 23.0


def compute_scale(
    panel_pixel_height: int,
    declared_panel_height_mm: float | None,
    reference_pixel_size: float | None = None,
    reference: str = "declared",
) -> Scale:
    """C14. Millimetres come from a scale reference, never from pixel counts alone.

    A camera has no absolute scale. Two photographs of the same panel at
    different distances give different pixel heights for the same 2.5 mm
    letter, so any check expressed in millimetres is undecidable until one
    known length in the frame is identified.
    """
    if panel_pixel_height < settings.MIN_PANEL_PIXEL_HEIGHT:
        return Scale(
            None, None, "none",
            f"Panel occupies only {panel_pixel_height} px of image height; "
            f"{settings.MIN_PANEL_PIXEL_HEIGHT} px is the minimum for a "
            f"defensible millimetre measurement.",
        )

    if reference == "id1_card" and reference_pixel_size:
        mmpp = ID1_LONG_EDGE_MM / reference_pixel_size
        return Scale(mmpp, mmpp * 0.02, "id1_card", None)

    if reference == "coin_5inr" and reference_pixel_size:
        mmpp = COIN_5INR_DIAMETER_MM / reference_pixel_size
        # A smaller reference amplifies edge-location error.
        return Scale(mmpp, mmpp * 0.05, "coin_5inr", None)

    if declared_panel_height_mm:
        mmpp = declared_panel_height_mm / panel_pixel_height
        # The operator measured with a ruler; +/-1 mm on the panel is realistic.
        rel = 1.0 / declared_panel_height_mm
        return Scale(mmpp, mmpp * rel, "declared", None)

    return Scale(
        None, None, "none",
        "No scale reference: panel height was not measured and no reference "
        "object was in frame, so letter heights cannot be expressed in millimetres.",
    )


def format_measurement(value_mm: float, uncertainty_mm: float | None, minimum_mm: float) -> str:
    """Every millimetre figure in a report is printed with its uncertainty.

    'Height 2.1 mm +/- 0.3 mm against a 2.5 mm minimum' is a statement an
    inspector can defend. A bare '2.1 mm' is not.
    """
    if uncertainty_mm is None:
        return f"{value_mm:.1f} mm against a {minimum_mm:.1f} mm minimum"
    return (
        f"{value_mm:.1f} mm +/- {uncertainty_mm:.1f} mm "
        f"against a {minimum_mm:.1f} mm minimum"
    )


PHASH_BANDS = 8                    # 64 bits / 8 = eight 8-bit bands
PHASH_NEAR_DUPLICATE = 5           # must stay <= PHASH_BANDS - 1


def phash_bands(path: Path) -> tuple[str, tuple[int, ...]]:
    """64-bit pHash split into eight indexed 8-bit bands. 06 §6.3.

    Pigeonhole principle, stated exactly: d differing bits can touch at most d
    bands, so if the hashes are within Hamming distance d and there are k
    bands, at least k - d bands are bit-for-bit identical. The band index is
    therefore a *complete* candidate filter only while d <= k - 1.

    Four 16-bit bands would guarantee completeness to distance 3 — below the
    threshold of 5 this project uses. A concrete miss: flip bits 5, 9, 16, 38
    and 50 of any hash and all four 16-bit bands differ, so the OR matches
    nothing and a genuine near-duplicate at distance 5 is never even a
    candidate. Eight bands guarantee completeness through distance 7, which
    covers the threshold with margin. The cost is candidate volume: an 8-bit
    band has 256 values, so the expected candidate set is about n * 8 / 256 =
    n / 32 rows rather than n / 16384, which at demo scale is tens of rows.

    v1.x loaded and rehashed every stored image on every upload — O(n) disk
    reads and O(n) hash computations per scan, which at a few thousand images
    makes each upload take longer than the inspection.
    """
    with Image.open(path) as im:
        h = imagehash.phash(im, hash_size=8)      # 64 bits
    hexstr = str(h)                               # 16 hex chars
    return hexstr, split_bands(hexstr)


def split_bands(hexstr: str) -> tuple[int, ...]:
    """The pure half of phash_bands: hex string in, band tuple out.

    Separated so the completeness property can be tested over synthetic hashes
    instead of over whatever distance two sample photographs happen to land at.
    10 §7.1 flips every combination of bits and asserts the bound directly.
    """
    v = int(hexstr, 16)
    width = 64 // PHASH_BANDS
    mask = (1 << width) - 1
    # b0 is the most significant band, so band order is stable across dialects.
    return tuple(
        (v >> (width * (PHASH_BANDS - 1 - i))) & mask for i in range(PHASH_BANDS)
    )


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def find_near_duplicates(db, phash_hex: str, bands, exclude_scan_id: int) -> list[int]:
    """Returns scan_image ids within the near-duplicate threshold."""
    from functools import reduce
    from operator import or_

    from models import ScanImage

    assert PHASH_NEAR_DUPLICATE <= PHASH_BANDS - 1, (
        "the band index stops being a complete filter above "
        f"distance {PHASH_BANDS - 1}"
    )
    band_cols = [getattr(ScanImage, f"phash_b{i}") for i in range(PHASH_BANDS)]
    band_match = reduce(or_, (col == val for col, val in zip(band_cols, bands)))
    candidates = (
        db.query(ScanImage.id, ScanImage.phash)
        .filter(ScanImage.scan_id != exclude_scan_id, band_match)
        .all()
    )
    return [
        cid for cid, ph in candidates
        if ph and hamming(phash_hex, ph) <= PHASH_NEAR_DUPLICATE
    ]

def read_capture_time(raw: bytes) -> "datetime | None":
    import io
    from datetime import datetime
    from PIL import ExifTags
    try:
        with Image.open(io.BytesIO(raw)) as im:
            exif = im.getexif()
        if not exif:
            return None
        tag = {v: k for k, v in ExifTags.TAGS.items()}.get("DateTimeOriginal")
        raw_dt = exif.get(tag) if tag else None
        return datetime.strptime(raw_dt, "%Y:%m:%d %H:%M:%S") if raw_dt else None
    except Exception:
        return None


def estimate_contrast_ratio(bgr) -> float | None:
    """WCAG-style luminance contrast between dark ink and light background.

    Otsu-splits the grey panel into text/background, takes mean luminance of
    each half, returns (L_light+0.05)/(L_dark+0.05). Returns None when the
    split is degenerate (flat image). Heuristic for CHK08 — Rule 9 sets no
    numeric threshold, the engine only reports this number.
    """
    try:
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if gray.size == 0:
            return None
        _, thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        dark = gray[thr < 128]
        light = gray[thr >= 128]
        if dark.size < 100 or light.size < 100:
            return None
        dl, ll = float(dark.mean()), float(light.mean())
        if ll < dl:
            dl, ll = ll, dl
        if ll - dl < 5:
            return None
        return round((ll + 0.05) / (dl + 0.05), 2)
    except Exception:
        return None


def detect_candidate_quad(bgr: np.ndarray) -> tuple[np.ndarray | None, dict]:
    """Authoritative candidate quadrilateral detector (no YOLO or torch required).

    Finds the candidate packaging panel quadrilateral using multi-pass edge
    detection, contour approximation, geometric validation, and composite scoring.
    Returns (ordered_corners, metadata). If no valid candidate is found, returns
    (None, metadata_with_unavailable_status).
    """
    default_meta = {
        "geometry_status": "unavailable",
        "rectification_status": "skipped",
        "confidence": 0.0,
        "perspective_severity": "unusable",
        "residual_tilt_deg": 0.0,
        "rectified_width": None,
        "rectified_height": None,
        "reason": "No candidate quadrilateral found",
    }
    if bgr is None or getattr(bgr, "size", 0) == 0:
        default_meta["reason"] = "Empty or null image"
        return None, default_meta

    h, w = bgr.shape[:2]
    frame = float(h * w)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Multi-pass Canny thresholds: standard contrast (50, 150), then sensitive low-contrast (20, 70)
    passes = [(50, 150), (20, 70)]

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    img_center = np.array([w / 2.0, h / 2.0], dtype=np.float32)
    diag_img = float(np.hypot(w, h))

    best_quad = None
    best_score = -1.0
    best_meta = default_meta
    seen_quads = []

    for low_th, high_th in passes:
        edges = cv2.Canny(blurred, low_th, high_th)
        dilated = cv2.dilate(edges, kernel, iterations=1)
        contours, _ = cv2.findContours(dilated, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = float(cv2.contourArea(cnt))
            if area < 0.05 * frame or area > 0.98 * frame:
                continue
            peri = cv2.arcLength(cnt, True)

            for eps in (0.02, 0.03, 0.04):
                approx = cv2.approxPolyDP(cnt, eps * peri, True)
                if len(approx) != 4 or not cv2.isContourConvex(approx):
                    continue

                raw_pts = approx.reshape(4, 2).astype(np.float32)
                try:
                    ordered = order_corners_robust(raw_pts)
                except Exception:
                    continue

                # Deduplicate similar quads
                is_duplicate = False
                for prev in seen_quads:
                    if np.max(np.abs(prev - ordered)) < 15.0:
                        is_duplicate = True
                        break
                if is_duplicate:
                    continue
                seen_quads.append(ordered)

                valid, reason, meta = validate_quadrilateral(ordered, w, h)
                if not valid:
                    continue

                # Scoring criteria:
                # 1. Centrality: distance of quad center from image center
                q_center = ordered.mean(axis=0)
                dist_center = float(np.linalg.norm(q_center - img_center)) / (diag_img + 1e-6)
                centrality = max(0.0, 1.0 - dist_center * 1.5)

                # 2. Orthogonality & quality from validation confidence
                quality = meta.get("confidence", 0.5)

                # 3. Area score: sweet spot between 0.15 and 0.85
                area_ratio = meta.get("area_ratio", 0.0)
                if 0.15 <= area_ratio <= 0.85:
                    area_score = 1.0
                elif area_ratio < 0.15:
                    area_score = area_ratio / 0.15
                else:
                    area_score = max(0.2, (0.98 - area_ratio) / 0.13)

                # Composite score prioritizing centered, orthogonal packages
                score = quality * 0.45 + centrality * 0.35 + area_score * 0.20
                if score > best_score:
                    best_score = score
                    best_quad = ordered
                    meta["geometry_status"] = "detected"
                    meta["rectification_status"] = "skipped"
                    meta["reason"] = None
                    best_meta = meta

        if best_quad is not None and best_score >= 0.65:
            break

    return best_quad, best_meta


def detect_panel_quad(bgr: np.ndarray) -> np.ndarray | None:
    """Classical panel-quad detector (no YOLO/torch needed).

    Preserves backward compatibility: returns (4, 2) float32 tl, tr, br, bl
    or None when no confident quad exists.
    """
    quad, _ = detect_candidate_quad(bgr)
    return quad
