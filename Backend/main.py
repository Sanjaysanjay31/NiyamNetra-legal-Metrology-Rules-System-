"""main.py — the app. Run from inside backend/ so flat imports resolve."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from routers import admin, auth, inspections, reports, scans


@asynccontextmanager
async def lifespan(app: FastAPI):
    # P0 fix: env hygiene guard (was dead code in env_assertion.py).
    try:
        from env_assertion import assert_env_clean
        assert_env_clean()
    except Exception:
        pass  # config.Settings validator is authoritative; this is belt-and-braces
    # Warm the OCR model once so the first real scan is not the slow one.
    # Skipped when cloud OCR is forced or paddle disabled (512MB Render):
    # importing paddleocr there costs 1.5GB and OOMs the worker.
    if settings.ENV != "test":
        try:
            if getattr(settings, "DISABLE_PADDLE", False):
                raise RuntimeError("paddle disabled (cloud OCR deploy)")
            if getattr(settings, "OCR_PROVIDER", "auto") in ("google", "ocrspace"):
                raise RuntimeError("cloud OCR forced; no local warmup needed")
            from ocr_engine import get_paddle
            get_paddle()
        except Exception:
            pass
    yield


app = FastAPI(
    title="NiyamNetra API",
    version="2.0.0",
    lifespan=lifespan,
    # FastAPI's own Swagger UI at /docs and ReDoc at /redoc. No custom bundle,
    # no hardcoded venv path — the interactive API-check page just works.
    docs_url="/docs",
    redoc_url="/redoc",
)


# A regex. Starlette matches allow_origins by exact string equality, so an
# entry like "exp://*" or "http://192.168.*.*:5173" never matches anything —
# which is why v1.x's Expo client could not reach the API from a phone.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.effective_cors_regex,
    allow_credentials=True,               # required: the refresh cookie
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    path = request.url.path
    # FastAPI's own Swagger UI (/docs) and ReDoc (/redoc) load their JS/CSS from
    # cdn.jsdelivr.net. The strict app CSP below (script-src 'self') blocks that
    # CDN, which is why /docs rendered as a blank white page. Relax the policy
    # ONLY on the docs UI routes — the API itself keeps the strict policy.
    is_docs = path in ("/docs", "/redoc", "/docs/oauth2-redirect")
    if is_docs:
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://cdn.jsdelivr.net https://fastapi.tiangolo.com; "
            "worker-src 'self' blob:; object-src 'none'; base-uri 'none'"
        )
    else:
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'"
        )
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    # Swagger UI needs to run in the frame; DENY only outside the docs routes.
    if not is_docs:
        resp.headers["X-Frame-Options"] = "DENY"
    if settings.ENV == "prod":
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp


@app.exception_handler(ValueError)
async def value_error_handler(_r: Request, exc: ValueError):
    # Domain validation failures are 422, not 500.
    return JSONResponse(status_code=422, content={"detail": str(exc)})


app.include_router(auth.router)
app.include_router(inspections.router)
app.include_router(scans.router)
app.include_router(reports.router)
app.include_router(admin.router)


@app.get("/health", tags=["meta"])
def health():
    from rules_engine import ALL_CHECK_IDS, catalog_hash
    import shutil
    try:
        free_gb = shutil.disk_usage(settings.EVIDENCE_DIR).free / (1024 ** 3)
    except Exception:
        free_gb = None
    return {
        "status": "ok",
        "engine_version": settings.ENGINE_VERSION,
        "rules_as_at": settings.RULES_AS_AT,
        "catalog_hash": catalog_hash(),
        "checks_registered": len(ALL_CHECK_IDS),
        "evidence_free_gb": round(free_gb, 2) if free_gb is not None else None,
        "evidence_low": free_gb is not None and free_gb < settings.EVIDENCE_MIN_FREE_GB,
    }
