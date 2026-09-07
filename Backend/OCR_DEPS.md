# OCR dependencies — NiyamNetra (cloud-first)

Cascade in `ocr_engine.py:run_ocr`: Google Vision (`GOOGLE_VISION_API_KEY`, best, Hindi via languageHints en+hi) → OCR.space (`OCR_SPACE_API_KEY`, free) → Tesseract local (`eng+hin`, needs binary + `pytesseract`) → PaddleOCR (`lang="en"`, ~1.5GB, never on Render free; skip with `DISABLE_PADDLE=1` or `OCR_PROVIDER=google|ocrspace`) → `engine="none"` (honest not_assessed).

Render free (512MB): install `requirements-render.txt` (httpx + opencv only, no paddle/tesseract/zbar). Set at least one cloud key in `.env` / dashboard or every scan is not_assessed. Docker path (`Backend/Dockerfile`): `apt-get install tesseract-ocr libzbar0` + `pytesseract pyzbar` for local OCR without cloud. PaddleOCR full stack = `requirements.txt` on a ≥2GB host only.
