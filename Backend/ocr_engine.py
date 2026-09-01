"""ocr_engine.py — PaddleOCR primary, Tesseract fallback."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from config import settings


@lru_cache(maxsize=1)
def get_paddle():
    """Loaded once. Model init costs seconds; per-request init costs the demo."""
    from paddleocr import PaddleOCR
    return PaddleOCR(
        lang="en",
        use_angle_cls=True,      # rotated text on cylindrical panels is the norm
        det_db_box_thresh=0.5,
        drop_score=0.30,         # keep low-confidence lines; we grade them ourselves
        show_log=False if _paddle_accepts_show_log() else None,
    )


def _paddle_accepts_show_log() -> bool:
    """PaddleOCR 2.8 removed show_log; 2.7 requires it. Probe, do not guess."""
    import inspect
    from paddleocr import PaddleOCR
    return "show_log" in inspect.signature(PaddleOCR.__init__).parameters


def deskew(gray: np.ndarray) -> tuple[np.ndarray, float]:
    """Rotate small residual skew out of a grey image.

    v1.x wrote:
        coords = np.column_stack(np.where(gray > 0))
        angle = cv2.minAreaRect(coords)[-1]

    Two independent failures. `np.where` returns (row, col) int64 pairs;
    cv2.minAreaRect requires float32 (x, y) and raises on anything else.
    And `gray > 0` is not a text mask — on a photograph almost every pixel
    exceeds 0, so the "text" region is the whole frame and the angle is noise.
    """
    # Binarise so that ink is foreground, then measure the ink.
    thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    pts = cv2.findNonZero(thr)
    if pts is None or len(pts) < 50:
        return gray, 0.0

    angle = cv2.minAreaRect(pts.astype(np.float32))[-1]
    if angle < -45:
        angle += 90
    elif angle > 45:
        angle -= 90
    if abs(angle) < 0.3 or abs(angle) > 15:
        # Below 0.3 deg rotation is not worth the resampling loss; above 15 deg
        # this is not skew, it is a badly framed shot that rectify() must handle.
        return gray, 0.0

    h, w = gray.shape
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    out = cv2.warpAffine(
        gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return out, float(angle)


def preprocess_for_ocr(bgr: np.ndarray) -> np.ndarray:
    """Returns the array that OCR must actually receive."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray, _ = deskew(gray)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    gray = cv2.bilateralFilter(gray, 7, 50, 50)     # denoise, keep stroke edges
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)   # Paddle expects 3 channels


@dataclass(slots=True)
class OcrLine:
    text: str
    confidence: float
    box: list[list[float]]
    height_px: float


@dataclass(slots=True)
class OcrResult:
    lines: list[OcrLine] = field(default_factory=list)
    engine: str = "none"
    mean_confidence: float | None = None
    failure_reason: str | None = None

    @property
    def full_text(self) -> str:
        return "\n".join(l.text for l in self.lines)


def run_ocr(bgr: np.ndarray) -> OcrResult:
    """Feed the PREPROCESSED ARRAY to the engine, not the original file path.

    v1.x computed a deskewed, CLAHE-enhanced image into `img` and then called
        ocr_engine.ocr(image_path, cls=True)
    -- passing the path of the file on disk. Every line of preprocessing was
    computed and discarded. The pipeline looked sophisticated and did nothing.

    Cascade: PaddleOCR → Tesseract → OCR.space (cloud) → engine="none".
    The cloud stage is what lets the slim Render deploy read text at all.
    """
    prepped = preprocess_for_ocr(bgr)
    try:
        raw = get_paddle().ocr(prepped, cls=True)
    except Exception as e:                     # model missing, OOM, corrupt input
        return _tesseract_fallback(prepped, f"PaddleOCR unavailable: {type(e).__name__}", original=bgr)

    lines: list[OcrLine] = []
    for page in raw or []:
        for box, (text, conf) in page or []:
            ys = [p[1] for p in box]
            lines.append(
                OcrLine(
                    text=text.strip(),
                    confidence=float(conf),
                    box=[[float(x), float(y)] for x, y in box],
                    height_px=float(max(ys) - min(ys)),
                )
            )
    if not lines:
        return _tesseract_fallback(prepped, "PaddleOCR returned no text regions", original=bgr)

    return OcrResult(
        lines=lines,
        engine="paddleocr",
        mean_confidence=float(np.mean([l.confidence for l in lines])),
    )


def _tesseract_fallback(bgr: np.ndarray, why: str, original: np.ndarray | None = None) -> OcrResult:
    try:
        import pytesseract
        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
        data = pytesseract.image_to_data(
            bgr, lang="eng+hin", output_type=pytesseract.Output.DICT
        )
    except Exception as e:
        # Tesseract binary/bindings missing → try the cloud stage on the
        # ORIGINAL image (cloud engines read raw photos better than our
        # deskew/CLAHE output, which is tuned for Paddle/Tesseract).
        return _ocrspace_fallback(
            original if original is not None else bgr,
            f"{why}; Tesseract also unavailable ({type(e).__name__}).",
        )
    lines = [
        OcrLine(
            text=data["text"][i].strip(),
            confidence=max(float(data["conf"][i]), 0.0) / 100.0,
            box=[[data["left"][i], data["top"][i]]],
            height_px=float(data["height"][i]),
        )
        for i in range(len(data["text"]))
        if data["text"][i].strip() and float(data["conf"][i]) > 0
    ]
    if not lines:
        return _ocrspace_fallback(
            original if original is not None else bgr,
            f"{why}; Tesseract found no text.",
        )
    return OcrResult(
        lines=lines,
        engine="tesseract",
        mean_confidence=float(np.mean([l.confidence for l in lines])),
    )


def _encode_under_limit(bgr: np.ndarray, max_bytes: int = 1_000_000) -> bytes:
    """JPEG-encode small enough for OCR.space's free tier (1 MB file limit).

    Drops quality first, then downscales — a 25 MB upload (MAX_UPLOAD_MB) would
    otherwise be rejected by the API with a size error, not an OCR result.
    """
    for quality in (85, 70, 55, 40):
        ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if ok and buf.nbytes <= max_bytes:
            return buf.tobytes()
    h, w = bgr.shape[:2]
    scale, small, buf = 1.0, bgr, buf
    for _ in range(6):
        scale *= 0.8
        small = cv2.resize(
            bgr, (max(1, int(w * scale)), max(1, int(h * scale))),
            interpolation=cv2.INTER_AREA,
        )
        ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 60])
        if ok and buf.nbytes <= max_bytes:
            return buf.tobytes()
    return buf.tobytes()      # smallest we managed; let the API decide


def _ocrspace_fallback(bgr: np.ndarray, why: str) -> OcrResult:
    """Last resort: OCR.space cloud API. Returns engine='ocrspace' on success,
    else engine='none' with a reason (which is what keeps a scan not_assessed
    rather than crashing the request)."""
    key = settings.OCR_SPACE_API_KEY
    if not key:
        return OcrResult(engine="none", failure_reason=f"{why}; OCR.space not configured.")
    try:
        blob = _encode_under_limit(bgr)
    except Exception as e:
        return OcrResult(engine="none", failure_reason=f"{why}; image encode failed ({type(e).__name__}).")

    try:
        import httpx
        resp = httpx.post(
            settings.OCR_SPACE_URL,
            data={
                "apikey": key,
                "OCREngine": str(settings.OCR_SPACE_ENGINE),
                "language": settings.OCR_SPACE_LANGUAGE,
                "isOverlayRequired": "true",
                "scale": "true",
                "detectOrientation": "true",
            },
            files={"file": ("scan.jpg", blob, "image/jpeg")},
            timeout=settings.OCR_SPACE_TIMEOUT_S,
        )
        resp.raise_for_status()
        body = resp.json()
    except Exception as e:
        return OcrResult(engine="none", failure_reason=f"{why}; OCR.space request failed ({type(e).__name__}).")

    if body.get("IsErroredOnProcessing"):
        msg = body.get("ErrorMessage") or body.get("ErrorDetails") or "unknown error"
        if isinstance(msg, list):
            msg = "; ".join(str(m) for m in msg)
        return OcrResult(engine="none", failure_reason=f"{why}; OCR.space error: {msg}.")

    lines = _parse_ocrspace(body.get("ParsedResults") or [])
    if not lines:
        return OcrResult(engine="none", failure_reason=f"{why}; OCR.space returned no text.")
    # OCR.space's free API reports no per-line confidence, so we record None
    # rather than a fabricated number — the confidence floor in the rules engine
    # is skipped for None, which is the honest behaviour when it is unknown.
    return OcrResult(lines=lines, engine="ocrspace", mean_confidence=None)


def _parse_ocrspace(results: list) -> list[OcrLine]:
    lines: list[OcrLine] = []
    for pr in results:
        overlay = ((pr or {}).get("TextOverlay") or {}).get("Lines") or []
        for ln in overlay:
            text = (ln.get("LineText") or "").strip()
            if not text:
                continue
            xs: list[float] = []
            ys: list[float] = []
            box: list[list[float]] = []
            heights: list[float] = []
            for w in ln.get("Words") or []:
                try:
                    left, top = float(w.get("Left", 0)), float(w.get("Top", 0))
                    wd, ht = float(w.get("Width", 0)), float(w.get("Height", 0))
                except (TypeError, ValueError):
                    continue
                box.append([left, top])
                xs += [left, left + wd]
                ys += [top, top + ht]
                heights.append(ht)
            try:
                height_px = float(ln.get("MaxHeight") or (max(heights) if heights else 0.0))
            except (TypeError, ValueError):
                height_px = max(heights) if heights else 0.0
            lines.append(OcrLine(text=text, confidence=None, box=box or [[0.0, 0.0]], height_px=height_px))
    if lines:
        return lines
    # No overlay (some engines/plans omit it): split the plain text instead.
    for pr in results:
        for raw_line in ((pr or {}).get("ParsedText") or "").splitlines():
            t = raw_line.strip()
            if t:
                lines.append(OcrLine(text=t, confidence=None, box=[[0.0, 0.0]], height_px=0.0))
    return lines


DECLARED_FIELDS = (
    "manufacturer", "packer", "importer", "commodity", "net_quantity",
    "mrp", "date_of_manufacture", "best_before", "country_of_origin",
    "consumer_care", "batch_number", "unit_sale_price", "dimensions",
)

# Rule 6(1)(e) — MRP is inclusive of all taxes. The wording varies; the
# obligation does not.
MRP_PATTERNS = [
    r"(?:M\.?R\.?P\.?|Maximum\s+Retail\s+Price)[^\d]{0,20}(\d+(?:[.,]\d{1,2})?)",
    r"(?:Rs\.?|INR|₹)\s?(\d+(?:[.,]\d{1,2})?)",
]
NET_QTY_PATTERN = (
    r"(?:Net\s*(?:Qty|Quantity|Wt|Weight|Vol|Volume)|Contents)"
    r"[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*"
    r"(kg|g|gm|grams?|mg|l|litre|liters?|ltr|ml|m|cm|mm|pcs?|N|U)\b"
)
INCL_TAXES = r"incl(?:usive)?\.?\s+of\s+all\s+taxes"
COUNTRY_PATTERN = r"(?:Country\s+of\s+Origin|Made\s+in|Origin)\s*[:\-]?\s*([A-Za-z ]{3,40})"
BEST_BEFORE_PATTERN = (
    r"(?:Best\s+Before|Use\s+By|Expiry|Exp\.?)\s*[:\-]?\s*"
    r"(\d{1,2}\s*(?:month|months|mth)s?|\d{1,2}[/\-]\d{2,4}|\d{1,2}\s+\w+\s+\d{2,4})"
)
CARE_PATTERN = (
    r"(?:Customer|Consumer)\s+(?:Care|Service|Complaints?)"
    r"[\s\S]{0,120}?((?:\+?91[\-\s]?)?[6-9]\d{9}|[\w.\-]+@[\w.\-]+\.\w{2,})"
)


@dataclass(slots=True)
class ExtractedField:
    value: str | None
    confidence: float | None
    source_line: str | None
    found: bool


def extract_fields(ocr: OcrResult) -> dict[str, ExtractedField]:
    """Absence is reported as absence. It is never reported as a violation here.

    Whether a missing field is a violation depends on the exemptions in Rule 3
    and Rule 26 and on the transaction type, and none of that is knowable in
    this function. The rules engine decides. This function only reports what
    the text does and does not contain.
    """
    text = ocr.full_text
    out: dict[str, ExtractedField] = {}

    def put(name: str, m: re.Match | None, group: int = 1):
        if m:
            line = _line_for(ocr, m.group(0))
            out[name] = ExtractedField(
                value=m.group(group).strip(),
                confidence=line.confidence if line else ocr.mean_confidence,
                source_line=line.text if line else None,
                found=True,
            )
        else:
            out[name] = ExtractedField(None, None, None, False)

    mrp_m = next((m for p in MRP_PATTERNS if (m := re.search(p, text, re.I))), None)
    put("mrp", mrp_m)
    put("net_quantity", re.search(NET_QTY_PATTERN, text, re.I))
    put("country_of_origin", re.search(COUNTRY_PATTERN, text, re.I))
    put("best_before", re.search(BEST_BEFORE_PATTERN, text, re.I))
    put("consumer_care", re.search(CARE_PATTERN, text, re.I))

    out["net_quantity_unit"] = ExtractedField(
        (re.search(NET_QTY_PATTERN, text, re.I).group(2)
         if re.search(NET_QTY_PATTERN, text, re.I) else None),
        None, None,
        bool(re.search(NET_QTY_PATTERN, text, re.I)),
    )
    out["mrp_inclusive_wording"] = ExtractedField(
        "present" if re.search(INCL_TAXES, text, re.I) else None,
        None, None,
        bool(re.search(INCL_TAXES, text, re.I)),
    )
    return out

def _line_for(ocr: OcrResult, fragment: str) -> OcrLine | None:
    frag = fragment.strip().lower()[:24]
    return next((l for l in ocr.lines if frag and frag in l.text.lower()), None)


def read_barcode(bgr: np.ndarray) -> str | None:
    try:
        from pyzbar.pyzbar import decode
    except ImportError:
        return None       # libzbar0 absent; barcode is an aid, not a requirement
    for sym in decode(bgr):
        return sym.data.decode("utf-8", errors="replace")
    return None
