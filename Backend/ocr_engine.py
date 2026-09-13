"""ocr_engine.py — Cloud-first OCR for 512MB deploys, Paddle optional locally."""
from __future__ import annotations

import base64
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from config import settings


SUPPORTED_INDIC_LANGS = {
    "en": "en",
    "english": "en",
    "hi": "hi",
    "hindi": "hi",
    "devanagari": "devanagari",
    "te": "te",
    "telugu": "te",
    "ta": "ta",
    "tamil": "ta",
    "kn": "kannada",
    "kannada": "kannada",
    "bn": "bn",
    "bengali": "bn",
    "mr": "mr",
    "marathi": "mr",
}


@lru_cache(maxsize=8)
def get_paddle(lang: str = "en"):
    """Loaded once per language. Model init costs seconds; per-request init costs the demo.

    Supports English ('en') and Indic language models ('hi', 'devanagari', 'te', 'ta', 'bn', etc.).
    Disabled on 512MB deploys via DISABLE_PADDLE=1 or OCR_PROVIDER=google/
    ocrspace — raises immediately so run_ocr skips to cloud without importing
    the 1.5GB stack.
    """
    if getattr(settings, "DISABLE_PADDLE", False):
        raise RuntimeError("PaddleOCR disabled (DISABLE_PADDLE=1 for 512MB deploy)")
    if getattr(settings, "OCR_PROVIDER", "auto") in ("google", "ocrspace"):
        raise RuntimeError("PaddleOCR skipped (OCR_PROVIDER cloud-only)")
    norm_lang = SUPPORTED_INDIC_LANGS.get(str(lang).lower(), getattr(settings, "OCR_PADDLE_LANG", "en"))
    from paddleocr import PaddleOCR
    return PaddleOCR(
        lang=norm_lang,
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


def run_ocr(bgr: np.ndarray, lang: str | None = None) -> OcrResult:
    """Cloud-first cascade for 512MB Render free tier, with Indic multilingual support.

    Order (OCR_PROVIDER=auto):
      1. Google Cloud Vision DOCUMENT_TEXT_DETECTION (if GOOGLE_VISION_API_KEY)
         — best accuracy on small/Hindi label text, 0MB RAM, only httpx.
      2. OCR.space (if OCR_SPACE_API_KEY) — free, no card, only httpx+cv2.
      3. Tesseract local (if binary present) — small, works in Docker.
      4. PaddleOCR local (if installed + not DISABLE_PADDLE) — best offline,
         supports Indic models ('en', 'hi', 'te', 'ta', 'bn', etc.).
      5. engine="none" with honest failure_reason → checks not_assessed.

    OCR_PROVIDER forces one engine: google | ocrspace | tesseract | paddle.
    """
    provider = (getattr(settings, "OCR_PROVIDER", "auto") or "auto").lower()

    def _cloud_first() -> OcrResult | None:
        # Explicit provider pin.
        if provider == "google":
            return _google_vision_ocr(bgr, "Google Vision forced via OCR_PROVIDER.")
        if provider == "ocrspace":
            return _ocrspace_fallback(bgr, "OCR.space forced via OCR_PROVIDER.")
        if provider == "tesseract":
            return _tesseract_fallback(
                preprocess_for_ocr(bgr), "Tesseract forced via OCR_PROVIDER.",
                original=bgr)
        if provider == "paddle":
            return _paddle_ocr(bgr, lang=lang)
        return None

    forced = _cloud_first()
    if forced is not None:
        return forced

    # auto: best cloud → free cloud → local light → local heavy.
    if getattr(settings, "GOOGLE_VISION_API_KEY", None):
        r = _google_vision_ocr(bgr, "auto cascade")
        if r.engine != "none":
            return r
        _google_err = r.failure_reason
    else:
        _google_err = "Google Vision not configured."

    if getattr(settings, "OCR_SPACE_API_KEY", None):
        r = _ocrspace_fallback(bgr, f"{_google_err}")
        if r.engine != "none":
            return r
        _cloud_err = r.failure_reason
    else:
        _cloud_err = f"{_google_err}; OCR.space not configured."

    prepped = preprocess_for_ocr(bgr)
    r = _tesseract_fallback(prepped, _cloud_err, original=bgr)
    if r.engine != "none":
        return r
    p = _paddle_ocr(bgr, lang=lang)
    if p.engine != "none":
        return p
    # Honest terminal reason naming both cloud keys so the operator knows
    # exactly which .env key to add (see .env.example OCR section).
    why = (p.failure_reason or r.failure_reason or _cloud_err or "")
    if not getattr(settings, "GOOGLE_VISION_API_KEY", None) and not getattr(
            settings, "OCR_SPACE_API_KEY", None):
        why += (" No cloud OCR key configured: set GOOGLE_VISION_API_KEY "
                "(best) or OCR_SPACE_API_KEY (free) in Backend/.env.")
    return OcrResult(engine="none", failure_reason=why)


def _paddle_ocr(bgr: np.ndarray, lang: str | None = None) -> OcrResult:
    """PaddleOCR stage (offline, heavy) with Indic multilingual support. Never crashes the request."""
    prepped = preprocess_for_ocr(bgr)
    target_lang = lang or getattr(settings, "OCR_PADDLE_LANG", "en")
    try:
        raw = get_paddle(target_lang).ocr(prepped, cls=True)
    except Exception as e:                     # missing, OOM, disabled, corrupt
        return OcrResult(
            engine="none",
            failure_reason=f"PaddleOCR unavailable: {type(e).__name__}: {e}")
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
        return OcrResult(engine="none",
                         failure_reason="PaddleOCR returned no text regions")
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


def _google_vision_ocr(bgr: np.ndarray, why: str) -> OcrResult:
    """Best-accuracy cloud OCR: Google Cloud Vision DOCUMENT_TEXT_DETECTION.

    Zero heavy deps (httpx + cv2 only) → safe on 512MB Render free.
    Returns engine='google_vision' on success, else engine='none' with reason
    so the cascade can try OCR.space next. Never raises.
    """
    key = getattr(settings, "GOOGLE_VISION_API_KEY", None)
    if not key:
        return OcrResult(engine="none",
                         failure_reason=f"{why}; Google Vision not configured.")
    try:
        blob = _encode_under_limit(bgr, max_bytes=4_000_000)  # Vision allows 20MB; stay safe
        content_b64 = base64.b64encode(blob).decode("ascii")
    except Exception as e:
        return OcrResult(engine="none",
                         failure_reason=f"{why}; image encode failed ({type(e).__name__}).")
    try:
        import httpx
        resp = httpx.post(
            getattr(settings, "GOOGLE_VISION_URL",
                    "https://vision.googleapis.com/v1/images:annotate"),
            params={"key": key},
            json={"requests": [{
                "image": {"content": content_b64},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                "imageContext": {"languageHints": ["en", "hi"]},
            }]},
            timeout=getattr(settings, "GOOGLE_VISION_TIMEOUT_S", 25.0),
        )
        resp.raise_for_status()
        body = resp.json()
    except Exception as e:
        detail = ""
        try:
            if hasattr(e, "response") and e.response is not None:
                err_json = e.response.json()
                msg = err_json.get("error", {}).get("message", "")
                if msg:
                    detail = f": {msg}"
        except Exception:
            pass
        return OcrResult(engine="none",
                         failure_reason=f"{why}; Google Vision request failed ({type(e).__name__}{detail}).")
    try:
        responses = (body or {}).get("responses") or [{}]
        first = responses[0] if responses else {}
        if first.get("error"):
            msg = (first["error"] or {}).get("message", "unknown error")
            return OcrResult(engine="none",
                             failure_reason=f"{why}; Google Vision error: {msg}.")
        lines = _parse_google_vision(first)
    except Exception as e:
        return OcrResult(engine="none",
                         failure_reason=f"{why}; Google Vision parse failed ({type(e).__name__}).")
    if not lines:
        return OcrResult(engine="none",
                         failure_reason=f"{why}; Google Vision returned no text.")
    confs = [l.confidence for l in lines if l.confidence is not None]
    mean_c = float(sum(confs) / len(confs)) if confs else None
    return OcrResult(lines=lines, engine="google_vision", mean_confidence=mean_c)


def _parse_google_vision(resp: dict) -> list[OcrLine]:
    """Vision fullTextAnnotation.pages[].blocks[].paragraphs[].words[].symbols
    → one OcrLine per paragraph with pixel box + mean confidence."""
    lines: list[OcrLine] = []
    full = (resp or {}).get("fullTextAnnotation") or {}
    for page in full.get("pages") or []:
        for block in page.get("blocks") or []:
            for para in block.get("paragraphs") or []:
                words: list[str] = []
                confs: list[float] = []
                xs: list[float] = []
                ys: list[float] = []
                for w in para.get("words") or []:
                    sym_text = "".join(s.get("text", "") for s in w.get("symbols") or [])
                    if w.get("confidence") is not None:
                        try:
                            confs.append(float(w["confidence"]))
                        except (TypeError, ValueError):
                            pass
                    bb = (w.get("boundingBox") or {}).get("vertices") or []
                    for v in bb:
                        try:
                            xs.append(float(v.get("x", 0)))
                            ys.append(float(v.get("y", 0)))
                        except (TypeError, ValueError):
                            continue
                    if sym_text.strip():
                        words.append(sym_text)
                text = " ".join(words).strip()
                if not text:
                    continue
                h = float(max(ys) - min(ys)) if ys else 0.0
                box = [[min(xs), min(ys)], [max(xs), min(ys)],
                       [max(xs), max(ys)], [min(xs), max(ys)]] if xs and ys else [[0.0, 0.0]]
                mean_c = float(sum(confs) / len(confs)) if confs else None
                lines.append(OcrLine(text=text, confidence=mean_c, box=box, height_px=h))
    if lines:
        return lines
    # Fallback: textAnnotations[0] description (no boxes).
    anns = (resp or {}).get("textAnnotations") or []
    if anns and (anns[0].get("description") or "").strip():
        out = []
        for raw in anns[0]["description"].splitlines():
            t = raw.strip()
            if t:
                out.append(OcrLine(text=t, confidence=None, box=[[0.0, 0.0]], height_px=0.0))
        return out
    return lines


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
    r"(?:M\.?R\.?P\.?|Maximum\s+Retail\s+Price|एम\.?आर\.?पी\.?|अधिकतम\s+खुदरा\s+मूल्य|मूल्य|ధర|விலை)[^\d]{0,20}(\d+(?:[.,]\d{1,2})?)",
    r"(?:Rs\.?|INR|₹|रु\.?|రూ\.?)\s?(\d+(?:[.,]\d{1,2})?)",
]
NET_QTY_PATTERN = (
    r"(?:Net\s*(?:Qty|Quantity|Wt|Weight|Vol|Volume)|Contents|शुद्ध\s*(?:मात्रा|वज़न)|मात्रा|పరిమాణం|அளவு)"
    r"[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*"
    r"(kg|g|gm|grams?|mg|l|litre|liters?|ltr|ml|m|cm|mm|pcs?|N|U|किग्रा|ग्राम|मिली|लीटर)\b"
)
INCL_TAXES = r"(?:incl(?:usive)?\.?\s+of\s+all\s+taxes|सभी\s+कर(?:ों)?\s+सहित|అన్ని\s+పన్నులతో\s+కలిపి)"
COUNTRY_PATTERN = r"(?:Country\s+of\s+Origin|Made\s+in|Origin|मूल\s*देश|ఉత్పత్తి\s*దేశం|பிறப்பிடம்)\s*[:\-]?\s*([A-Za-z \u0900-\u097F\u0C00-\u0C7F\u0B80-\u0BFF]{3,40})"
BEST_BEFORE_PATTERN = (
    r"(?:Best\s+Before|Use\s+By|Expiry|Exp\.?|उपयोग\s*की\s*अंतिम\s*तिथि|समाप्ति)\s*[:\-]?\s*"
    r"(\d{1,2}\s*(?:month|months|mth)s?|\d{1,2}[/\-]\d{2,4}|\d{1,2}\s+\w+\s+\d{2,4})"
)
CARE_PATTERN = (
    r"(?:Customer|Consumer|ग्राहक|उपभोक्ता|వినియోగదారు)\s+(?:Care|Service|Complaints?|सेवा|సహాయం)"
    r"[\s\S]{0,120}?((?:1800[\-\s]?\d{3}[\-\s]?\d{3,4}|1800\d{6,7})|(?:\+?91[\-\s]?)?[6-9]\d{9}|[\w.\-]+@[\w.\-]+\.\w{2,})"
)
# P0 fix: manufacturer/packer/importer + commodity + date were never extracted,
# so CHK01 always reported them missing. Patterns below are intentionally broad
# (recall over precision) — the rules engine decides violation, not this file.
MFR_PATTERNS = [
    r"(?:Mfd\.?\s*by|Manufactured\s*by|Mfg\.?\s*by|Packed\s*by|Imported\s*by|Marketed\s*by|Mfr\.?|Pkd\.?\s*by)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 .,&\-/()]{3,120})",
    r"(?:Manufacturer|Packer|Importer)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 .,&\-/()]{3,120})",
]
COMMODITY_PATTERN = (
    r"(?:Commodity|Product|Item|Name\s*of\s*(?:the\s*)?(?:Commodity|Product))"
    r"\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 .()\-/&]{2,80})"
)
DATE_PATTERNS = [
    r"(?:MFD|MFG|Mfd\.?|Mfg\.?|Manufactured|Packed\s*on|Pkd\.?|Date\s*of\s*(?:Mfg|Manufacture|Packing|Packaging|Import))\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[/\-.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|\d{2,4}\s*/\s*\d{1,2})",
    r"(?:Month\s*(?:and|&)\s*Year\s*of\s*(?:Manufacture|Mfg|Packing|Packaging|Import|Mfd))\s*[:\-]?\s*(\d{1,2}[/\-.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|\d{1,2}\s+\d{4})",
]
BATCH_PATTERN = r"(?:Batch\s*(?:No\.?|Number)?|Lot\s*(?:No\.?|Number)?|B\.?\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-/]{1,30})"
DIMENSIONS_PATTERN = (
    r"(?:Dimensions?|Size)\s*[:\-]?\s*(\d+(?:[.,]\d+)?\s*(?:cm|mm|m|inch|in)\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:cm|mm|m|inch|in)(?:\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:cm|mm|m|inch|in))?)"
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
    # P0 fix: previously these Rule-6 fields were never populated, so CHK01
    # always failed manufacturer/commodity/date. Broad recall patterns above.
    mfr_m = next((m for p in MFR_PATTERNS if (m := re.search(p, text, re.I))), None)
    put("manufacturer", mfr_m)
    # packer/importer share the manufacturer evidence: any of the three
    # satisfies "name+address of manufacturer/packer/importer" presence.
    if mfr_m:
        line = _line_for(ocr, mfr_m.group(0))
        for alias in ("packer", "importer"):
            out[alias] = ExtractedField(
                value=mfr_m.group(1).strip(),
                confidence=line.confidence if line else ocr.mean_confidence,
                source_line=line.text if line else None,
                found=True,
            )
    else:
        out["packer"] = ExtractedField(None, None, None, False)
        out["importer"] = ExtractedField(None, None, None, False)
    put("commodity", re.search(COMMODITY_PATTERN, text, re.I))
    date_m = next((m for p in DATE_PATTERNS if (m := re.search(p, text, re.I))), None)
    put("date_of_manufacture", date_m)
    put("batch_number", re.search(BATCH_PATTERN, text, re.I))
    put("dimensions", re.search(DIMENSIONS_PATTERN, text, re.I))
    # Fallback: bare brand line (e.g. "Parle Hide & Seek") with no
    # "Commodity:" prefix. Use the longest alpha line that is not MRP/net-qty/
    # date/care, flagged at half confidence so the engine can weigh it.
    # (Runs after date/batch puts above — it reads their source_lines.)
    if not out["commodity"].found:
        try:
            _skip = (out["mrp"].source_line or "", out["net_quantity"].source_line or "",
                     out["date_of_manufacture"].source_line or "",
                     out["consumer_care"].source_line or "")
            _cands = [l for l in ocr.lines
                      if l.text and len(l.text.strip()) >= 3
                      and l.text not in _skip
                      and not re.search(r"(MRP|Net\s*(Qty|Quantity|Wt)|MFD|MFG|Batch|Customer|Consumer)", l.text, re.I)
                      and re.search(r"[A-Za-z]{3,}", l.text)]
            if _cands:
                _best = max(_cands, key=lambda l: len(l.text.strip()))
                _c = (0.5 * _best.confidence) if _best.confidence else 0.3
                out["commodity"] = ExtractedField(
                    value=_best.text.strip()[:80], confidence=_c,
                    source_line=_best.text, found=True)
        except Exception:
            pass

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
