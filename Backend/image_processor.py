"""image_processor.py"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2
import imagehash
import numpy as np
from PIL import Image

from config import settings

# 09 §2.5 — a decompression-bomb ceiling. Pillow's own default is lower and
# raises a warning rather than an error, which is not a control.
Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}


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
    import io
    with Image.open(io.BytesIO(raw)) as probe:
        probe.verify()                       # raises on a malformed file
    with Image.open(io.BytesIO(raw)) as im:
        width, height = im.size

    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
    folder = settings.EVIDENCE_DIR / str(inspection_id) / str(scan_id)
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{uuid.uuid4().hex}{ext}"

    dest.write_bytes(raw)                    # byte-for-byte, no re-encode
    stored = dest.read_bytes()               # read back what is actually there
    digest = hashlib.sha256(stored).hexdigest()

    # Mirror to Supabase Storage if configured — best-effort, never blocks local evidence.
    # Local remains primary per 09 §5.1; Supabase is backup for offline-phone images 12 §11.
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        try:
            from supabase import create_client
            supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
            key = f"{inspection_id}/{scan_id}/{dest.name}"
            # supabase-py expects bytes; content-type matters for browser preview
            supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
                key, stored, {"content-type": mime, "upsert": "true"}
            )
        except Exception:
            pass  # mirror failure does not fail the scan — local hash is the evidence

    return StoredImage(
        path=dest,
        sha256=digest,
        byte_size=len(stored),
        width_px=width,
        height_px=height,
        mime_type=mime,
    )


def verify_stored_image(path: Path, expected_sha256: str) -> bool:
    """Called by the report generator and by GET /scans/{id}/verify."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest() == expected_sha256


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
        reason = f"Glare over {glare:.0%} of the panel obscures the declarations."
    elif not (LUMA_FLOOR <= luma <= LUMA_CEILING):
        reason = f"Exposure outside the usable range (mean luminance {luma:.0f})."

    return Quality(blur, glare, luma, usable=reason is None, reason=reason)


def rectify(bgr: np.ndarray, corners: np.ndarray) -> tuple[np.ndarray, float]:
    """Four-point homography onto a fronto-parallel plane.

    corners: (4,2) float32, in order tl, tr, br, bl — from the YOLOv8 panel
    detector or from the operator's on-screen adjustment.
    Returns the rectified image and the residual tilt in degrees.
    """
    corners = np.asarray(corners, dtype=np.float32).reshape(4, 2)
    tl, tr, br, bl = corners

    w = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    h = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)

    M = cv2.getPerspectiveTransform(corners, dst)
    warped = cv2.warpPerspective(bgr, M, (w, h), flags=cv2.INTER_CUBIC)

    # Residual tilt: how far the top edge still departs from horizontal.
    top = tr - tl
    tilt = abs(float(np.degrees(np.arctan2(top[1], top[0]))))
    return warped, min(tilt, 180.0 - tilt)


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
