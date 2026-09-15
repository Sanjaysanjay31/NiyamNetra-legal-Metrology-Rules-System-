# Backend/Dockerfile — the "make scanning actually work on Render" option.
#
# WHEN TO USE THIS INSTEAD OF THE PYTHON RUNTIME:
#   render.yaml ships runtime: python + requirements-render.txt. That deploys
#   fast and boots, but it has NO OCR/barcode engine, so every check comes back
#   not_assessed and the scan's photos are then purged (not_assessed != violation).
#   Fine for login / listing / report plumbing; useless for a live capture demo.
#
#   Tesseract and libzbar are system packages (apt), and Render's native python
#   runtime cannot apt-get. A Docker runtime can. This image adds the two
#   binaries + their Python bindings, so read_barcode() and the Tesseract
#   fallback in ocr_engine.run_ocr() start returning real text and verdicts.
#   (Full PaddleOCR still needs ~2 GB RAM — a paid instance — so this uses
#   Tesseract, which fits the 512 MB free tier.)
#
# TO SWITCH render.yaml TO THIS: replace these two lines
#     runtime: python
#     buildCommand: pip install -r requirements-render.txt
#   with
#     runtime: docker
#     dockerfilePath: Backend/Dockerfile
#     dockerContext: Backend
#   and drop the startCommand (the CMD below handles it). Everything else
#   (envVars, healthCheckPath, rootDir) stays.

FROM python:3.11-slim-bookworm

# tesseract-ocr = the OCR fallback binary pytesseract shells out to.
# libzbar0      = the shared library pyzbar loads to decode barcodes/QR.
# Both are runtime deps, not build-time — without them the Python packages
# import fine but raise the moment they are actually called.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr libzbar0 \
    && rm -rf /var/lib/apt/lists/*

# Non-root runtime user: evidence/out writes stay inside /app which is
# chowned to appuser at build end.
RUN useradd -m -u 10001 appuser

WORKDIR /app

# Install the slim set first (cached layer), then the two OCR bindings that
# requirements-render.txt deliberately leaves out. Pins match requirements.txt.
COPY requirements-render.txt .
RUN pip install --no-cache-dir -r requirements-render.txt \
    && pip install --no-cache-dir pytesseract==0.3.10 pyzbar==0.1.9

COPY . .

RUN mkdir -p /app/evidence /app/out && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + ('${PORT:-8000}') + '/health')" || exit 1

# Render injects $PORT; default 8000 locally. The shell form is required so
# $PORT is expanded at runtime, not baked at build. .dockerignore ensures
# .env / *.db / evidence / out never bake into the image.
CMD sh -c "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
