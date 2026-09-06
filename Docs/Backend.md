# NiyamNetra — Backend Architecture

### Smart India Hackathon 2026 · Problem Statement SIH26034 · FastAPI service for the Portal and the Expo app

**Version:** 2.1 | **Date:** 30 Aug 2026 | **Supersedes:** 1.x, 2.0 (see §15 for the corrections log)

**§4 is the schema of record.** Alembic autogenerates migrations from these models, so they are the only description of the database that becomes an actual database. `06_DATABASE.md` documents them and must not diverge by a single column name.

---

## HOW TO USE THIS FILE

This is the backend specification. It is written to be handed to a code-generation tool or a human developer and built without further interpretation. Every code block in it is intended to be runnable as written, in the file named above it, with the imports shown.

Three rules govern how you read it.

**One — this file is subordinate to the rule documents.** Where this file states a legal requirement, it is repeating `02_NiyamNetra_Rules.md`. Where the two disagree, `02` wins and this file is wrong. Never re-derive a statutory threshold from the code here; the code here is a transcription and transcriptions rot.

**Two — no check may vanish.** Every one of the eighteen checks produces a row in `findings` on every scan, without exception. A check that cannot be evaluated returns `not_assessed` with a reason. There is no code path in this specification where a check is skipped and nothing is recorded, and any implementation that introduces one is defective regardless of whether its tests pass. This single constraint is the reason the file is as long as it is.

**Three — the legal ledger is not decoration.** Fifteen entries in `02` §15 are marked UNVERIFIED. The backend must not print a pinpoint provision for any of them. §10.4 gives the `cite()` helper that enforces this. Removing it produces a system that states statutory references it cannot support, in documents intended for enforcement use.

---

## CANON — the fifteen facts this file is built on

Anything in this document that contradicts the list below is an error in this document.

| # | Fact | Source |
|---|---|---|
| C1 | Seven tables: `users`, `stores`, `inspections`, `scans`, `scan_images`, `findings`, `audit_logs` | `06_DATABASE.md` §3 |
| C2 | A finding has three verdicts: `pass`, `fail`, `not_assessed`. `not_assessed` requires a reason. | `02` §3 |
| C3 | A scan has four results: `compliant`, `violation`, `not_assessed`, `out_of_scope` | `02` §3 |
| C4 | Eighteen checks CHK01–CHK18, plus sub-check CHK06b, giving **19 findings rows** per scan | `03_NiyamNetra_Rules_Priority_Ordered.md` |
| C5 | A package scan from the mobile app evaluates **16 of 18**; CHK15 and CHK16 need a web listing | `02` §6 |
| C6 | Rule versioning is `rules_as_at DATE` + `catalog_hash` + `engine_version`. There is no version enum. | `06` §3.4 |
| C7 | Device identity is a server-issued random 32-byte `install_id`. Never IMEI, never a fingerprint. | `09_SECURITY.md` §3.3 |
| C8 | JWT access token 12 hours, held in memory only. Refresh token 30 days, httpOnly cookie (`SameSite=Strict` locally, `SameSite=None; Secure` in prod cross-site). | `09` §3.2 |
| C9 | The evidence hash is computed over the bytes **as stored**, never over the bytes as uploaded | `09` §5.1 |
| C10 | The audit chain hashes `seq, inspection_id, scan_id, user_id, action, old_value, new_value, reason, timestamp, hash_prev` | `06` §5.2, `09` §6.2 |
| C11 | `findings.engine_verdict` is written once and never updated. Human overrides go in a separate column with a reason. | `06` §3.6 |
| C12 | Ports: FastAPI **8000**, Vite portal **5173**, Expo dev server **8081** | `07_Tech_Stack.md` |
| C13 | Local FS primary, Supabase Storage optional best-effort mirror (`SUPABASE_*`), OCR.space optional fallback when local OCR absent, `Backend/Dockerfile` present for Render; no hosted LLM, no S3, no generative super-resolution | `07` §1, `09` §5.2 |
| C14 | Millimetre measurement requires a scale reference; `mm_per_pixel = panel_height_mm / panel_pixel_height` | `02` §7.4 |
| C15 | Fifteen ledger entries L-01…L-15 are UNVERIFIED and must not be cited to a pinpoint provision | `02` §15 |

---

## TABLE OF CONTENTS

| § | Section | What it settles |
|---|---|---|
| 1 | Project structure and configuration | The flat module layout, pinned dependencies, settings |
| 2 | Database layer | Seven ORM models, four-state columns, report queries |
| 3 | Authentication and RBAC | Two-token JWT, install binding, the path-parameter ownership check |
| 4 | Pydantic schemas | Request and response contracts, including `not_assessed` counts |
| 5 | Image pipeline | Storage-first hashing, rectification, the scale reference |
| 6 | OCR pipeline | PaddleOCR configuration, field extraction, confidence handling |
| 7 | Rules engine | Nineteen findings rows, three verdicts, no silent skips |
| 8 | API endpoints | Every route, with the ownership and scope rules that guard it |
| 9 | Report generation | PDF and DOCX, four outcome colours, verifiable QR |
| 10 | Security and evidence integrity | Hash chain, SSRF, the `cite()` helper |
| 11 | Overflow handling | Every degraded input and what is recorded instead |
| 12 | Loophole coverage map | Which module answers which entry in `12_…loopholes.md` |
| 13 | Testing hooks | What the backend must expose for `10_TESTING.md` to assert on |
| 14 | Run configuration | Commands, host binding, first-run seed |
| 15 | Corrections log | What version 1.x got wrong |

Sections appear in this order in the body. Version 1.x listed twelve sections, printed seven of them, and printed those in the order 1, 2, 3, 6, 4, 5, 7 — so a reader following the table of contents landed in the wrong place and the five sections that contained the security model were absent.

---

## 1. PROJECT STRUCTURE & CONFIGURATION

### 1.1 File structure

Modules sit directly under `backend/`. There is no `app/` package and no `auth/` or `services/` subpackage.

```text
backend/
├── main.py                  # FastAPI app, middleware, router registration
├── config.py                # Settings (pydantic-settings)
├── database.py              # Engine, SessionLocal, get_db, PRAGMA listener
├── models.py                # 7 SQLAlchemy ORM models
├── schemas.py               # Pydantic request/response models
├── password_handler.py      # bcrypt hash + verify
├── jwt_handler.py           # access/refresh mint + verify
├── rbac.py                  # get_current_user, require_role, ownership checks
├── image_processor.py       # store-then-hash, rectify, scale, pHash
├── ocr_engine.py            # PaddleOCR + Tesseract fallback + field extraction
├── rules_engine.py          # the 18 checks, returns 19 findings
├── report_generator.py      # PDF (ReportLab) + DOCX (python-docx)
├── audit.py                 # chain_hash, append_audit
├── citations.py             # cite() — the UNVERIFIED ledger guard
├── seed.py                  # first-run users, stores, demo fixtures
├── alembic.ini
├── requirements.txt
├── .env                     # never committed
├── alembic/
│   └── versions/            # CHECK constraints and triggers live here
├── routers/
│   ├── __init__.py
│   ├── auth.py
│   ├── inspections.py
│   ├── scans.py
│   ├── reports.py
│   └── admin.py
├── rules/
│   ├── catalog_2026_07_01.json     # the rule catalog, hashed into every scan
│   └── forbidden_words.json        # single source, loaded once
├── evidence/                # image storage, gitignored
│   └── {inspection_id}/{scan_id}/{image_id}.jpg
├── out/                     # generated PDF/DOCX, gitignored
└── tests/
    ├── conftest.py
    ├── test_rules_engine.py
    ├── test_evidence.py
    ├── test_audit_chain.py
    ├── test_auth.py
    └── test_endpoints.py
```

**Why flat.** Version 1.x drew a nested tree with `auth/jwt_handler.py` and `services/ocr_engine.py`, then wrote every import flat — `from jwt_handler import verify_token`, `from ocr_engine import extract_fields`. Neither form resolves against the other. With the tree as drawn the imports raise `ModuleNotFoundError` on the first request; with the imports as written the tree is wrong. `05_SYSTEM_ARCHITECTURE.md`, `07_Tech_Stack.md`, `14_env_example.md` and `README.md` all describe `backend/main.py`, so the flat layout is the one the rest of the project already assumes, and the imports were already written for it. The tree was the error. Only `routers/` is a package, because FastAPI routers are genuinely a collection.

Run uvicorn from inside `backend/` so that `from models import ...` resolves without a path hack. §14 gives the command.

### 1.2 requirements.txt

```text
# --- web ---
fastapi==0.110.0
uvicorn[standard]==0.29.0
pydantic==2.6.4
pydantic-settings==2.2.1
python-multipart==0.0.9

# --- database ---
SQLAlchemy==2.0.29
alembic==1.13.1
psycopg[binary]==3.1.18        # PostgreSQL (Supabase pooler) — REQUIRED, no SQLite fallback

# --- auth ---
PyJWT==2.8.0
passlib==1.7.4
bcrypt==4.0.1                  # pin: passlib 1.7.4 reads bcrypt.__about__, removed in 4.1

# --- vision / OCR ---
opencv-python-headless==4.9.0.80
paddlepaddle==2.6.1
paddleocr==2.8.0
pytesseract==0.3.10            # needs the tesseract-ocr binary, see below
Pillow==10.3.0
imagehash==4.3.1
pyzbar==0.1.9                  # needs libzbar0
ultralytics==8.1.34            # YOLOv8 panel detection

# --- documents ---
reportlab==4.1.0
python-docx==1.1.0
qrcode[pil]==7.4.2

# --- utility ---
python-dotenv==1.0.1
cachetools==5.3.3              # TTLCache; not functools.lru_cache
httpx==0.27.0                  # also the test client
```

System packages, which pip cannot install:

```bash
# Debian / Ubuntu
sudo apt-get install -y tesseract-ocr tesseract-ocr-hin libzbar0 libgl1
# macOS
brew install tesseract tesseract-lang zbar
# Windows: install the UB-Mannheim tesseract build, then set TESSERACT_CMD in .env
```

Version 1.x omitted `pytesseract`, `ultralytics`, `pyzbar`, `pydantic-settings` and `alembic` from requirements while importing or requiring all five, and listed no system packages at all, so `pyzbar` would import and then fail at first use with an opaque `ImportError: Unable to find zbar shared library`.

`cachetools` rather than `functools.lru_cache`: the rule catalog and the store list are cached, and both must expire. `lru_cache` has no TTL, so an admin editing a store would not see the change until the process restarted — the defect recorded against `11_working_overflow.md` §2.6.

### 1.3 config.py

```python
"""Settings. Reads .env, validates at import time, fails loudly."""
from functools import lru_cache
from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent

WEAK_SECRETS = {
    "", "change_me", "changeme", "secret", "your-secret-key",
    "dev", "test", "niyamnetra", "sih2026",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="forbid"
    )

    # --- app ---
    ENV: str = "dev"                       # dev | prod
    APP_NAME: str = "NiyamNetra"
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # --- database ---
    # REQUIRED. Supabase / PostgreSQL only — there is no SQLite fallback.
    # Set in .env as  postgresql+psycopg://...  (psycopg 3, session pooler port 5432).
    # If it is missing, the app refuses to start rather than creating a SQLite file.
    DATABASE_URL: str

    # --- auth ---
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_HOURS: int = 12           # C8
    REFRESH_TOKEN_DAYS: int = 30           # C8
    REFRESH_COOKIE_NAME: str = "nn_refresh"

    # --- CORS ---
    # A regex, not a glob. Starlette does not expand "*" inside an origin.
    # Covers localhost, 127.0.0.1, 10.x, 192.168.x, 172.16-31.x on ports
    # 3000/5173/8081/19006, plus exp:// for Expo Go (see config.py:73-80).
    CORS_ORIGIN_REGEX: str = (
        r"^(https?://localhost:(3000|5173|8081|19006)"
        r"|https?://127\.0\.0\.1:(3000|5173|8081|19006)"
        r"|https?://10\.\d{1,3}\.\d{1,3}\.\d{1,3}:(3000|5173|8081|19006)"
        r"|https?://192\.168\.\d{1,3}\.\d{1,3}:(3000|5173|8081|19006)"
        r"|https?://172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:(3000|5173|8081|19006)"
        r"|exp://.*)$"
    )

    # --- evidence ---
    EVIDENCE_DIR: Path = BASE_DIR / "evidence"
    OUT_DIR: Path = BASE_DIR / "out"
    MAX_UPLOAD_MB: int = 25                # not 5 — see note
    MAX_IMAGE_PIXELS: int = 80_000_000     # decompression-bomb ceiling, 09 §2.5
    MIN_PANEL_PIXEL_HEIGHT: int = 400      # C14 / 02 §7.4
    MAX_RESIDUAL_TILT_DEG: float = 15.0
    EVIDENCE_MIN_FREE_GB: float = 5.0      # below this, new inspections are refused
    DERIVED_MAX_WIDTH_PX: int = 1600       # display copies only; originals are never resized

    # --- capacity, 11 §4 ---
    ASSESS_CONCURRENCY: int = 0            # 0 → os.cpu_count()
    ASSESS_QUEUE_WAIT_S: int = 20          # then 503 with Retry-After
    RATE_LIMIT_LOGIN_PER_MIN: int = 5      # per employee_id and per IP
    RATE_LIMIT_API_PER_MIN: int = 300      # per user; a loop guard, not a throttle
    DASHBOARD_CACHE_TTL_SECONDS: int = 60  # never applied to the review-queue badge

    # --- OCR ---
    OCR_LANGS: str = "en,hi"
    OCR_MIN_CONFIDENCE: float = 0.60
    TESSERACT_CMD: str | None = None

    # --- rules ---
    RULES_AS_AT: str = "2026-07-01"        # C6; GSR 128(E) in force
    RULES_CATALOG: Path = BASE_DIR / "rules" / "catalog_2026_07_01.json"
    ENGINE_VERSION: str = "2.0.0"

    @field_validator("JWT_SECRET")
    @classmethod
    def _secret_must_be_strong(cls, v: str) -> str:
        if v.strip().lower() in WEAK_SECRETS or len(v) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters and not a placeholder. "
                "Generate one: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    s = Settings()                      # raises at import if .env is missing JWT_SECRET
    s.EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    s.OUT_DIR.mkdir(parents=True, exist_ok=True)
    return s


settings = get_settings()
```

`MAX_UPLOAD_MB` is 25 and there is no `MAX_IMAGE_WIDTH`. Version 1.x capped uploads at 5 MB and downscaled every image to 1280 px wide. A 1280 px capture of a 60 mm panel gives roughly 0.05 mm per pixel in the best case and much worse once the panel occupies part of the frame — and the millimetre checks in `02` §7 are decided at the 0.5 mm level. Downscaling before measurement destroys the only thing the measurement depends on. Uploads are stored at capture resolution; the *display* copy is derived and never measured. The decompression-bomb risk that motivated the old cap is handled by `MAX_IMAGE_PIXELS`, which rejects hostile files without degrading honest ones.

### 1.4 database.py

```python
"""Engine, session factory, and the per-connection SQLite pragmas."""
from collections.abc import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    # check_same_thread is a SQLite-only argument
    connect_args={"check_same_thread": False} if settings.is_sqlite else {},
    pool_pre_ping=not settings.is_sqlite,
)

if settings.is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        """PRAGMA state is per connection and resets on every new one.

        foreign_keys defaults to OFF in SQLite. Issued once in a setup script
        it protects nothing: the pooled connections that serve real requests
        never saw it, and every declared foreign key is decorative.
        """
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Schema creation is Alembic's job, not `Base.metadata.create_all`'s. `create_all` emits the columns but silently drops the four-state `CHECK` constraints and cannot emit the immutability triggers at all, so a database built that way accepts `overall_result='Good'` and accepts a rewritten `engine_verdict` — the two things the schema exists to prevent. §14.2 gives the migration command.

### 1.5 Environment variables

See `14_env_example.md`, which is the single source. Do not duplicate the variable list here; a second copy drifts, and the copy in version 1.x had already drifted to a 24-hour token and a glob CORS origin.

---
## 2. DATABASE LAYER

`06_DATABASE.md` is the authority for the schema. This section gives the ORM that implements it and the queries the endpoints use. If a column here is absent from `06`, this file is wrong.

### 2.1 models.py — seven ORM models

```python
"""SQLAlchemy 2.0 ORM. Seven tables, per 06_DATABASE.md §3."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Vocabularies. Single definition, used by the CHECK constraints and by tests.
SCAN_RESULTS = ("compliant", "violation", "not_assessed", "out_of_scope")   # C3
VERDICTS = ("pass", "fail", "not_assessed")                                # C2
SEVERITIES = ("critical", "major", "minor", "advisory")
ROLES = ("inspector", "admin")


# ---------------------------------------------------------------- 1. users
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(160), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="inspector")
    jurisdiction: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # C7 — server-issued random 32 bytes, hex. Not IMEI, not a fingerprint.
    install_id: Mapped[str | None] = mapped_column(String(64), index=True)
    install_bound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bumped on password change or forced logout; invalidates live refresh tokens.
    token_epoch: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inspections: Mapped[list[Inspection]] = relationship(back_populates="inspector")

    __table_args__ = (
        CheckConstraint(f"role IN {ROLES}", name="ck_users_role"),
    )


# --------------------------------------------------------------- 2. stores
class Store(Base):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    store_type: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(80))
    district: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str | None] = mapped_column(String(10))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    geofence_radius_m: Mapped[int] = mapped_column(Integer, default=150)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inspections: Mapped[list[Inspection]] = relationship(back_populates="store")
```

There is no `visit_count` column. A denormalised counter drifts the first time an inspection is deleted or an offline record arrives twice, and after it drifts nothing tells you which number is right. `SELECT COUNT(*)` over an indexed foreign key is fast enough at this scale and cannot be wrong.

```python
# ---------------------------------------------------------- 3. inspections
class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)

    inspection_date: Mapped[date] = mapped_column(Date, index=True, default=date.today)
    status: Mapped[str] = mapped_column(String(16), default="draft")   # draft|submitted

    # --- scope, per Rule 3 and the retail-sale test (02 §4) ---
    transaction_type: Mapped[str | None] = mapped_column(String(32))
    in_scope: Mapped[bool | None] = mapped_column(Boolean)
    out_of_scope_reason: Mapped[str | None] = mapped_column(Text)

    # --- location assurance ---
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    gps_accuracy_m: Mapped[float | None] = mapped_column(Float)
    geofence_status: Mapped[str | None] = mapped_column(String(16))   # inside|outside|unknown
    geofence_distance_m: Mapped[float | None] = mapped_column(Float)
    geofence_reason: Mapped[str | None] = mapped_column(Text)
    mock_location: Mapped[bool | None] = mapped_column(Boolean)

    # --- offline provenance ---
    local_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    clock_skew_seconds: Mapped[int | None] = mapped_column(Integer)
    edited_offline: Mapped[bool] = mapped_column(Boolean, default=False)

    signature_status: Mapped[str | None] = mapped_column(String(24))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    inspector: Mapped[User] = relationship(back_populates="inspections")
    store: Mapped[Store] = relationship(back_populates="inspections")
    scans: Mapped[list[Scan]] = relationship(back_populates="inspection")

    __table_args__ = (
        CheckConstraint("status IN ('draft','submitted')", name="ck_insp_status"),
        Index("ix_insp_user_date", "user_id", "inspection_date"),
    )


# --------------------------------------------------------------- 4. scans
class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_id: Mapped[int] = mapped_column(ForeignKey("inspections.id"), index=True)

    # --- identification ---
    commodity_generic: Mapped[str | None] = mapped_column(String(120))
    brand_name: Mapped[str | None] = mapped_column(String(120))
    commodity_category: Mapped[str | None] = mapped_column(String(60))
    batch_number: Mapped[str | None] = mapped_column(String(60))
    barcode: Mapped[str | None] = mapped_column(String(64), index=True)

    # --- operator-declared inputs: the answers that decided the scope gates ---
    # Persisted, not merely passed to the engine. Nullable on purpose: NULL is
    # "the officer was not asked / did not answer", which is what makes the
    # dependent check return not_assessed rather than pass. A scan whose flags
    # are not stored cannot be re-assessed or defended six months later —
    # "why did country-of-origin pass?" has no answer if nothing records that
    # the officer said the pack was domestic.
    net_quantity_value: Mapped[float | None] = mapped_column(Float)
    net_quantity_unit: Mapped[str | None] = mapped_column(String(12))
    is_imported: Mapped[bool | None] = mapped_column(Boolean)          # CHK12, country of origin, 6(1)(aa)
    is_perishable: Mapped[bool | None] = mapped_column(Boolean)        # CHK13, best-before, 6(1)(da)
    is_medical_device: Mapped[bool | None] = mapped_column(Boolean)    # CHK14, proviso to Rule 2(h)
    is_tobacco: Mapped[bool | None] = mapped_column(Boolean)           # CHK02 tobacco carve-out under Rule 26(a); CHK17 is the FSSAI advisory
    has_sticker: Mapped[bool | None] = mapped_column(Boolean)          # CHK11, 6(3)-6(4A)
    sticker_reduces_price: Mapped[bool | None] = mapped_column(Boolean)
    sticker_covers_original: Mapped[bool | None] = mapped_column(Boolean)

    # --- the four-state result (C3) ---
    overall_result: Mapped[str] = mapped_column(String(16), default="not_assessed")
    # Which limb of s.36 the violation engages, when it is a violation.
    violation_limb: Mapped[str | None] = mapped_column(String(16))   # 36(1)|36(2)|both
    recommended_action: Mapped[str | None] = mapped_column(String(40))

    # --- denominator, so a partial scan can never read as a clean one (C4/C5) ---
    # 18 assessable checks (CHK18 is the derived Section-36 tier, not an assessed
    # check), so a package scan honestly reports "16 of 18"; C5.
    checks_total: Mapped[int] = mapped_column(Integer, default=18)
    checks_assessed: Mapped[int] = mapped_column(Integer, default=0)

    # --- panel geometry, Rule 7(4) ---
    panel_shape: Mapped[str | None] = mapped_column(String(20))  # rectangular|cylindrical|other
    panel_height_mm: Mapped[float | None] = mapped_column(Float)
    panel_width_mm: Mapped[float | None] = mapped_column(Float)
    panel_diameter_mm: Mapped[float | None] = mapped_column(Float)
    pdp_area_cm2: Mapped[float | None] = mapped_column(Float)
    # Whole-package surface area — a different quantity from the PDP area, and
    # the one Rule 26(a) and the Table-I band lookup read. Storing only
    # pdp_area_cm2 makes the small-package exemption unreproducible.
    total_surface_area_cm2: Mapped[float | None] = mapped_column(Float)
    is_blown_moulded: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- measurement provenance (C14) ---
    mm_per_pixel: Mapped[float | None] = mapped_column(Float)
    scale_source: Mapped[str | None] = mapped_column(String(32))  # declared|id1_card|coin_5inr|none
    mm_per_pixel_uncertainty: Mapped[float | None] = mapped_column(Float)

    # --- rule provenance (C6) ---
    rules_as_at: Mapped[date] = mapped_column(Date)
    catalog_hash: Mapped[str] = mapped_column(String(64))
    engine_version: Mapped[str] = mapped_column(String(16))

    # --- deduplication ---
    duplicate_of: Mapped[int | None] = mapped_column(ForeignKey("scans.id"), index=True)
    instances_recorded: Mapped[int] = mapped_column(Integer, default=1)

    ocr_confidence_mean: Mapped[float | None] = mapped_column(Float)
    ocr_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inspection: Mapped[Inspection] = relationship(back_populates="scans")
    images: Mapped[list[ScanImage]] = relationship(back_populates="scan")
    findings: Mapped[list[Finding]] = relationship(back_populates="scan")

    __table_args__ = (
        CheckConstraint(f"overall_result IN {SCAN_RESULTS}", name="ck_scan_result"),
        CheckConstraint(
            "violation_limb IS NULL OR violation_limb IN ('36(1)','36(2)','both')",
            name="ck_scan_limb",
        ),
        CheckConstraint("checks_assessed <= checks_total", name="ck_scan_denominator"),
        Index("ix_scan_result_created", "overall_result", "created_at"),
    )
```

There are no `image_urls` and no `image_hashes` JSON columns. A hash inside a JSON array cannot be indexed, so duplicate detection over it degrades to a full scan and rehash of every row — which is what version 1.x did, once per upload. Images are rows.

There are no `reasons` and no `checklist` JSON columns either. Version 1.x aggregated violations by type with `json_each(scans.reasons)`, a SQLite-only function, so the admin dashboard's second chart raised `OperationalError: no such function: json_each` the moment the project moved to the PostgreSQL it claims to support in production. Findings are rows.

```python
# --------------------------------------------------------- 5. scan_images
class ScanImage(Base):
    __tablename__ = "scan_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), index=True)

    panel: Mapped[str] = mapped_column(String(24))   # front|back|side|mrp|batch|other
    sequence: Mapped[int] = mapped_column(Integer, default=0)

    file_path: Mapped[str] = mapped_column(String(400))
    byte_size: Mapped[int] = mapped_column(Integer)
    width_px: Mapped[int] = mapped_column(Integer)
    height_px: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(40))

    # C9 — over the bytes as stored on disk, verifiable by rereading the file.
    sha256: Mapped[str] = mapped_column(String(64), index=True)

    # Banded perceptual hash, 06 §6.3. EIGHT indexed 8-bit bands, not four
    # 16-bit ones. The band index is only a *complete* filter for Hamming
    # distance <= (number of bands - 1): d differing bits touch at most d
    # bands, so k - d >= 1 bands survive identical. With four bands the
    # guarantee stops at distance 3, and the near-duplicate threshold is 5 —
    # bits {5, 9, 16, 38, 50} differ in all four 16-bit bands at distance 5 and
    # would be missed. Eight bands guarantee completeness through distance 7.
    phash: Mapped[str | None] = mapped_column(String(16))
    phash_b0: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b1: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b2: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b3: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b4: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b5: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b6: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b7: Mapped[int | None] = mapped_column(Integer, index=True)

    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exif_stripped: Mapped[bool] = mapped_column(Boolean, default=False)
    rectified: Mapped[bool] = mapped_column(Boolean, default=False)
    residual_tilt_deg: Mapped[float | None] = mapped_column(Float)
    blur_variance: Mapped[float | None] = mapped_column(Float)
    glare_ratio: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scan: Mapped[Scan] = relationship(back_populates="images")

    __table_args__ = (
        UniqueConstraint("scan_id", "panel", "sequence", name="uq_image_slot"),
    )


# ------------------------------------------------------------- 6. findings
class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), index=True)

    check_id: Mapped[str] = mapped_column(String(8), index=True)   # CHK01..CHK18, CHK06b
    title: Mapped[str] = mapped_column(String(160))

    # C11 — written once by the engine, never updated.
    engine_verdict: Mapped[str] = mapped_column(String(16))
    # A human may disagree. The disagreement is recorded, not substituted.
    human_verdict: Mapped[str | None] = mapped_column(String(16))
    override_reason: Mapped[str | None] = mapped_column(Text)
    overridden_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    overridden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    severity: Mapped[str] = mapped_column(String(16))
    # C2 — mandatory whenever the verdict is not_assessed.
    reason: Mapped[str | None] = mapped_column(Text)

    # Which limb of s.36 this single failure engages. FindingResult carries it
    # and it was previously dropped on persist, which made scans.violation_limb
    # unexplainable: the aggregate said 36(2) and no row said why.
    limb: Mapped[str | None] = mapped_column(String(8))   # 36(1)|36(2), set only on fail

    observed: Mapped[str | None] = mapped_column(Text)
    required: Mapped[str | None] = mapped_column(Text)
    # C15 — the descriptive requirement, or a pinpoint provision only if verified.
    citation: Mapped[str | None] = mapped_column(String(240))
    ledger_ref: Mapped[str | None] = mapped_column(String(8))       # L-01..L-15
    confidence: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scan: Mapped[Scan] = relationship(back_populates="findings")

    __table_args__ = (
        UniqueConstraint("scan_id", "check_id", name="uq_finding_per_check"),
        CheckConstraint(f"engine_verdict IN {VERDICTS}", name="ck_finding_engine_verdict"),
        CheckConstraint(
            f"human_verdict IS NULL OR human_verdict IN {VERDICTS}",
            name="ck_finding_human_verdict",
        ),
        CheckConstraint(f"severity IN {SEVERITIES}", name="ck_finding_severity"),
        # C2 as a database invariant, not a convention.
        CheckConstraint(
            "engine_verdict <> 'not_assessed' OR reason IS NOT NULL",
            name="ck_finding_reason_required",
        ),
        # An advisory item cannot be a failure; a failure cannot be advisory.
        CheckConstraint(
            "NOT (engine_verdict = 'fail' AND severity = 'advisory')",
            name="ck_finding_severity_coherent",
        ),
        # An override must say why.
        CheckConstraint(
            "human_verdict IS NULL OR override_reason IS NOT NULL",
            name="ck_finding_override_reason",
        ),
        # A limb is a property of a failure. Nothing else may carry one.
        CheckConstraint(
            "limb IS NULL OR (engine_verdict = 'fail' AND limb IN ('36(1)','36(2)'))",
            name="ck_finding_limb_only_on_fail",
        ),
        Index("ix_finding_check_verdict", "check_id", "engine_verdict"),
    )

    @property
    def effective_verdict(self) -> str:
        return self.human_verdict or self.engine_verdict


# ----------------------------------------------------------- 7. audit_logs
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, unique=True, index=True)

    # Nullable: user-level actions (login, password change, install rebind)
    # have no inspection. v1.x declared this NOT NULL while its own ERD
    # recorded exactly those actions, so they could not be written at all.
    inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspections.id"), index=True)
    scan_id: Mapped[int | None] = mapped_column(ForeignKey("scans.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)

    action: Mapped[str] = mapped_column(String(48))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(45))   # IPv6 fits in 45
    user_agent: Mapped[str | None] = mapped_column(String(240))

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    hash_prev: Mapped[str | None] = mapped_column(String(64))
    hash_self: Mapped[str] = mapped_column(String(64))

    __table_args__ = (
        Index("ix_audit_ts", "timestamp"),
    )
```

### 2.2 Deduplication

`06` §3.5 requires a unique index on `(store_id, commodity_generic, batch_number, inspection_date)`. On SQLite this is expressed over a join, so it is enforced in the service layer rather than declaratively:

```python
def resolve_duplicate(db: Session, scan: Scan, inspection: Inspection) -> int | None:
    """Return the id of an existing scan this one duplicates, or None.

    A conflict is never rejected. The row is kept with duplicate_of set, so no
    field work is lost, and every aggregate excludes duplicate_of IS NOT NULL.
    """
    if not (scan.commodity_generic and scan.batch_number):
        return None
    prior = (
        db.query(Scan.id)
        .join(Inspection, Scan.inspection_id == Inspection.id)
        .filter(
            Inspection.store_id == inspection.store_id,
            Inspection.inspection_date == inspection.inspection_date,
            Scan.commodity_generic == scan.commodity_generic,
            Scan.batch_number == scan.batch_number,
            Scan.duplicate_of.is_(None),
            Scan.id != scan.id,
        )
        .order_by(Scan.id)
        .first()
    )
    return prior[0] if prior else None
```

### 2.3 Report queries

All six are SQLAlchemy, four-state, and exclude duplicates. Version 1.x fenced these as `python` but wrote raw SQL inside, so a generator copying them into a `.py` file produced a syntax error on the first line.

```python
"""queries.py — the aggregations behind the report and dashboard endpoints."""
from datetime import date
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from models import Finding, Inspection, Scan, Store, User

LIVE = Scan.duplicate_of.is_(None)


def _result_counts(col=Scan.overall_result):
    """Four counts. Not two. A scan that could not be assessed is not a pass."""
    return (
        func.count().label("total"),
        func.sum(case((col == "compliant", 1), else_=0)).label("compliant"),
        func.sum(case((col == "violation", 1), else_=0)).label("violation"),
        func.sum(case((col == "not_assessed", 1), else_=0)).label("not_assessed"),
        func.sum(case((col == "out_of_scope", 1), else_=0)).label("out_of_scope"),
    )


# --- Query 1: today's report for one inspector ---
def todays_stats(db: Session, user_id: int, day: date):
    total, comp, viol, na, oos = _result_counts()
    row = db.execute(
        select(
            func.count(func.distinct(Inspection.id)).label("inspections"),
            total, comp, viol, na, oos,
        )
        .select_from(Inspection)
        .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
        .where(Inspection.user_id == user_id, Inspection.inspection_date == day)
    ).one()
    return dict(row._mapping)


# --- Query 2: store-wise breakdown ---
def store_breakdown(db: Session, user_id: int, day: date):
    total, comp, viol, na, oos = _result_counts()
    return [
        dict(r._mapping)
        for r in db.execute(
            select(Store.id, Store.name, total, comp, viol, na, oos)
            .select_from(Inspection)
            .join(Store, Store.id == Inspection.store_id)
            .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
            .where(Inspection.user_id == user_id, Inspection.inspection_date == day)
            .group_by(Store.id, Store.name)
            .order_by(Store.name)
        )
    ]


# --- Query 3: which dates have data (calendar dots) ---
def active_dates(db: Session, user_id: int, year: int, month: int):
    return [
        r[0]
        for r in db.execute(
            select(Inspection.inspection_date)
            .where(
                Inspection.user_id == user_id,
                func.extract("year", Inspection.inspection_date) == year,
                func.extract("month", Inspection.inspection_date) == month,
            )
            .group_by(Inspection.inspection_date)
        )
    ]


# --- Query 4: admin dashboard ---
def admin_stats(db: Session, start: date, end: date):
    total, comp, viol, na, oos = _result_counts()
    row = db.execute(
        select(
            func.count(func.distinct(Inspection.id)).label("inspections"),
            func.count(func.distinct(Inspection.user_id)).label("active_inspectors"),
            total, comp, viol, na, oos,
        )
        .select_from(Inspection)
        .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
        .where(Inspection.inspection_date.between(start, end))
    ).one()
    d = dict(row._mapping)
    # Real count, not the hard-coded 0 that v1.x shipped at line 924.
    d["review_queue"] = review_queue_size(db)
    return d


def review_queue_size(db: Session) -> int:
    """Everything a human still has to look at, counted the same way the
    review endpoint lists it, so the badge and the page can never disagree."""
    na_scans = db.scalar(
        select(func.count()).select_from(Scan)
        .where(Scan.overall_result == "not_assessed", LIVE)
    ) or 0
    low_conf = db.scalar(
        select(func.count()).select_from(Finding)
        .where(Finding.confidence < 0.60, Finding.human_verdict.is_(None))
    ) or 0
    offline_edits = db.scalar(
        select(func.count()).select_from(Inspection)
        .where(Inspection.edited_offline.is_(True))
    ) or 0
    return na_scans + low_conf + offline_edits


# --- Query 5: violations by check, for the bar chart ---
def violations_by_check(db: Session, start: date, end: date, limit: int = 10):
    verdict = func.coalesce(Finding.human_verdict, Finding.engine_verdict)
    return [
        dict(r._mapping)
        for r in db.execute(
            select(
                Finding.check_id,
                Finding.title,
                func.count().label("count"),
            )
            .join(Scan, Scan.id == Finding.scan_id)
            .join(Inspection, Inspection.id == Scan.inspection_id)
            .where(
                verdict == "fail",
                LIVE,
                Inspection.inspection_date.between(start, end),
            )
            .group_by(Finding.check_id, Finding.title)
            .order_by(func.count().desc())
            .limit(limit)
        )
    ]


# --- Query 6: trend, for the line chart ---
def inspection_trend(db: Session, start: date, end: date):
    total, comp, viol, na, oos = _result_counts()
    return [
        dict(r._mapping)
        for r in db.execute(
            select(Inspection.inspection_date, total, comp, viol, na, oos)
            .select_from(Inspection)
            .outerjoin(Scan, (Scan.inspection_id == Inspection.id) & LIVE)
            .where(Inspection.inspection_date.between(start, end))
            .group_by(Inspection.inspection_date)
            .order_by(Inspection.inspection_date)
        )
    ]
```

`not_assessed` is a first-class column in every one of these. Version 1.x counted `'Good'` and `'Bad'` only, so a scan the engine could not evaluate was reported as compliant. That is the single most damaging class of defect this project can ship: a false clean result on an enforcement record.

---

## 3. AUTHENTICATION & RBAC

### 3.1 password_handler.py

Password policy: 12-character minimum for new accounts (`CreateUserRequest.password`, change-password `new_password`) and 8-character minimum at login (`LoginRequest.password`, so existing shorter passwords are not locked out at the gate). Both bounds are `max_length=72` (bcrypt truncation limit).

```python
"""bcrypt via passlib. See requirements.txt for why bcrypt is pinned <4.1."""
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# bcrypt truncates at 72 bytes and silently ignores the rest.
MAX_PASSWORD_BYTES = 72


def hash_password(plain: str) -> str:
    if len(plain.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password exceeds 72 bytes; bcrypt would silently truncate it.")
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        # Malformed stored hash. Fail closed, do not raise into the request.
        return False
```

### 3.2 jwt_handler.py

Two tokens, per C8. The access token is short-lived and is never persisted by the client; the refresh token lives only in an httpOnly cookie.

```python
"""jwt_handler.py — mint and verify. PyJWT 2.8."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError

from config import settings

ACCESS, REFRESH = "access", "refresh"


def _mint(payload: dict, ttl: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    body = {
        **payload,
        "token_type": token_type,
        "jti": secrets.token_hex(16),
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(body, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int, role: str, install_id: str | None) -> str:
    return _mint(
        {"sub": str(user_id), "role": role, "install_id": install_id},
        timedelta(hours=settings.ACCESS_TOKEN_HOURS),
        ACCESS,
    )


def create_refresh_token(user_id: int, install_id: str | None, epoch: int) -> str:
    return _mint(
        {"sub": str(user_id), "install_id": install_id, "epoch": epoch},
        timedelta(days=settings.REFRESH_TOKEN_DAYS),
        REFRESH,
    )


class TokenError(Exception):
    """Raised for every invalid token. Callers translate this to HTTP 401."""


def decode_token(token: str, expect: str) -> dict:
    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],   # a list, never a bare string
            options={"require": ["exp", "iat", "sub", "token_type"]},
        )
    except ExpiredSignatureError as e:
        raise TokenError("expired") from e
    except InvalidTokenError as e:
        raise TokenError("invalid") from e

    # Without this, a refresh token is accepted as an access token and the
    # 12-hour limit becomes 30 days.
    if claims.get("token_type") != expect:
        raise TokenError(f"wrong token type: expected {expect}")
    return claims
```

`TokenError` is a named exception. Version 1.x raised bare `Exception` inside the decoder, which FastAPI turns into HTTP 500 — so an expired login looked like a server outage to the client, and the app had no way to know it should refresh.

### 3.3 rbac.py

```python
"""rbac.py — identity and authorisation dependencies."""
from fastapi import Depends, HTTPException, Path, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from jwt_handler import ACCESS, TokenError, decode_token
from models import Inspection, Scan, User

bearer = HTTPBearer(auto_error=False)

UNAUTHORIZED = HTTPException(
    status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)
FORBIDDEN = HTTPException(status.HTTP_403_FORBIDDEN, detail="Not permitted")


def get_current_user(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if cred is None:
        raise UNAUTHORIZED
    try:
        claims = decode_token(cred.credentials, expect=ACCESS)
    except TokenError:
        raise UNAUTHORIZED

    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise UNAUTHORIZED

    # C7 — a token minted for one install is not valid from another.
    tok_install = claims.get("install_id")
    if user.install_id and tok_install != user.install_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Device not recognised")

    request.state.user_id = user.id      # for the audit middleware
    return user


def require_role(*allowed: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise FORBIDDEN
        return user
    return dep


require_admin = require_role("admin")
require_inspector = require_role("inspector", "admin")


# ---------------------------------------------------------------------------
# Ownership. Read this before changing it.
#
# WRONG — what v1.x shipped:
#
#     def require_owner_or_admin(user_id: int, user: User = Depends(...)):
#         if user.role != "admin" and user.id != user_id:
#             raise FORBIDDEN
#
# `user_id` has no Path() marker, so FastAPI binds it to a *query* parameter.
# The caller supplies it. `?user_id=<my own id>` satisfies the check while the
# path still addresses somebody else's record. The dependency was also never
# attached to any route, so it protected nothing even when it was correct.
#
# RIGHT — resolve the owner from the row the path names, in the database.
# ---------------------------------------------------------------------------
def owned_inspection(
    inspection_id: int = Path(..., ge=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Inspection:
    insp = db.get(Inspection, inspection_id)
    if insp is None:
        # 404 for a row you may not see, so the endpoint is not an existence oracle.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    if user.role != "admin" and insp.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return insp


def owned_scan(
    scan_id: int = Path(..., ge=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Scan:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Scan not found")
    insp = db.get(Inspection, scan.inspection_id)
    if user.role != "admin" and (insp is None or insp.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return scan
```

### 3.4 Install binding

```python
"""In routers/auth.py. The install_id is issued by the server, once."""
import secrets
from datetime import datetime, timezone


def bind_install(db: Session, user: User) -> str:
    """First login on a device binds it. A rebind is an audited admin action."""
    if user.install_id:
        return user.install_id
    user.install_id = secrets.token_hex(32)          # 32 bytes, server-generated
    user.install_bound_at = datetime.now(timezone.utc)
    db.commit()
    return user.install_id
```

No IMEI, no `Build.SERIAL`, no MAC address, no assembled device fingerprint. `READ_PRIVILEGED_PHONE_STATE` is signature-level from Android 10, so IMEI is unavailable to this app on every device it will actually run on; and a fingerprint assembled from model, screen and locale is both weak and a DPDP liability. Version 1.x carried a `device_id` column that was never written and never verified, which is worse than having none — it implies an assurance that does not exist. Where stronger assurance is required, `09` §3.3 specifies Play Integrity and DeviceCheck as the correct mechanism.

---
## 4. PYDANTIC SCHEMAS

Pydantic 2.6. `from_attributes=True` replaces v1's `orm_mode`. Every schema that reports a result carries four counts and a denominator, because a client given three counts has to infer the fourth and will infer it wrong.

```python
"""schemas.py"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Verdict = Literal["pass", "fail", "not_assessed"]
ScanResult = Literal["compliant", "violation", "not_assessed", "out_of_scope"]
Severity = Literal["critical", "major", "minor", "advisory"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ auth
class LoginRequest(BaseModel):
    employee_id: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=72)


class UserOut(ORMModel):
    id: int
    employee_id: str
    full_name: str
    role: str
    jurisdiction: str | None = None
    is_active: bool


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int                     # seconds; the client refreshes before this
    user: UserOut
    install_id: str
    # The refresh token is NOT in this body. It is set as an httpOnly cookie
    # (SameSite=Strict locally, SameSite=None; Secure in prod cross-site)
    # so that no JavaScript in the portal can read it.


# ------------------------------------------------------------ inspections
class CreateInspectionRequest(BaseModel):
    store_id: int
    transaction_type: Literal[
        "retail_sale", "wholesale", "institutional", "industrial",
        "packed_in_presence", "export", "other",
    ]
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    gps_accuracy_m: float | None = Field(default=None, ge=0)
    mock_location: bool | None = None
    local_created_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=4000)


class SubmitInspectionRequest(BaseModel):
    signature_status: Literal["signed", "refused", "unavailable"]
    notes: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _refusal_needs_a_note(self) -> SubmitInspectionRequest:
        if self.signature_status in {"refused", "unavailable"} and not self.notes:
            raise ValueError(
                "A refused or unavailable signature must be explained in notes."
            )
        return self


class PanelGeometry(BaseModel):
    """Mandatory before the millimetre checks can run. C14."""
    panel_shape: Literal["rectangular", "cylindrical", "other"]
    panel_height_mm: float | None = Field(default=None, gt=0, le=2000)
    panel_width_mm: float | None = Field(default=None, gt=0, le=2000)
    panel_diameter_mm: float | None = Field(default=None, gt=0, le=2000)
    total_surface_area_cm2: float | None = Field(default=None, gt=0)
    is_blown_moulded: bool = False
    scale_source: Literal["declared", "id1_card", "coin_5inr", "none"] = "declared"

    @model_validator(mode="after")
    def _shape_needs_its_dimensions(self) -> PanelGeometry:
        if self.panel_shape == "rectangular" and not (
            self.panel_height_mm and self.panel_width_mm
        ):
            raise ValueError("A rectangular panel needs height and width in mm.")
        if self.panel_shape == "cylindrical" and not (
            self.panel_height_mm and self.panel_diameter_mm
        ):
            raise ValueError("A cylindrical panel needs height and diameter in mm.")
        if self.panel_shape == "other" and not self.total_surface_area_cm2:
            raise ValueError(
                "An irregular package needs total surface area; Rule 7(4) takes 40% of it."
            )
        return self


# ------------------------------------------------------------------ scans
class CreateScanRequest(BaseModel):
    """One scan per package. Images are attached to it afterwards.

    v1.x created a Scan per uploaded image, so a four-panel package produced
    four independent verdicts on the same package and the report listed the
    same item four times with different results.
    """
    commodity_generic: str | None = Field(default=None, max_length=120)
    brand_name: str | None = Field(default=None, max_length=120)
    commodity_category: str | None = Field(default=None, max_length=60)
    batch_number: str | None = Field(default=None, max_length=60)
    geometry: PanelGeometry


class FindingOut(ORMModel):
    check_id: str
    title: str
    engine_verdict: Verdict
    human_verdict: Verdict | None = None
    effective_verdict: Verdict
    severity: Severity
    reason: str | None = None
    observed: str | None = None
    required: str | None = None
    citation: str | None = None
    ledger_ref: str | None = None
    confidence: float | None = None


class ScanImageOut(ORMModel):
    id: int
    panel: str
    sha256: str
    width_px: int
    height_px: int
    rectified: bool
    residual_tilt_deg: float | None = None
    blur_variance: float | None = None


class VerdictCounts(BaseModel):
    """Four counts and the denominator they are counted against. C4/C5."""
    total: int
    passed: int
    failed: int
    not_assessed: int

    @model_validator(mode="after")
    def _must_add_up(self) -> VerdictCounts:
        if self.passed + self.failed + self.not_assessed != self.total:
            raise ValueError("Verdict counts must sum to total.")
        return self


class ScanOut(ORMModel):
    id: int
    inspection_id: int
    commodity_generic: str | None = None
    brand_name: str | None = None
    overall_result: ScanResult
    violation_limb: str | None = None
    recommended_action: str | None = None
    checks_total: int
    checks_assessed: int
    mm_per_pixel: float | None = None
    scale_source: str | None = None
    rules_as_at: date
    catalog_hash: str
    engine_version: str
    duplicate_of: int | None = None
    created_at: datetime
    counts: VerdictCounts
    findings: list[FindingOut]
    images: list[ScanImageOut]


# ---------------------------------------------------------------- reports
class ResultCounts(BaseModel):
    """The four scan results. Required in every report and dashboard payload."""
    total: int = 0
    compliant: int = 0
    violation: int = 0
    not_assessed: int = 0
    out_of_scope: int = 0


class StoreBreakdown(BaseModel):
    store_id: int
    store_name: str
    counts: ResultCounts


class TodaysReportResponse(BaseModel):
    report_date: date
    inspector: UserOut
    inspections: int
    counts: ResultCounts
    stores: list[StoreBreakdown]
    generated_at: datetime


class TrendPoint(BaseModel):
    day: date
    counts: ResultCounts


class CheckTally(BaseModel):
    check_id: str
    title: str
    count: int


class AdminDashboardResponse(BaseModel):
    period_start: date
    period_end: date
    inspections: int
    active_inspectors: int
    counts: ResultCounts
    review_queue: int
    top_failed_checks: list[CheckTally]
    trend: list[TrendPoint]


# ------------------------------------------------------------------ admin
class CreateUserRequest(BaseModel):
    employee_id: str = Field(min_length=3, max_length=32)
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=12, max_length=72)
    role: Literal["inspector", "admin"] = "inspector"
    jurisdiction: str | None = None
    email: str | None = None
    phone: str | None = None


class UpdateUserRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    role: Literal["inspector", "admin"] | None = None
    jurisdiction: str | None = None
    is_active: bool | None = None
    email: str | None = None
    phone: str | None = None


class ResetInstallRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class OverrideFindingRequest(BaseModel):
    human_verdict: Verdict
    override_reason: str = Field(min_length=10, max_length=1000)


class AuditEntryOut(ORMModel):
    seq: int
    inspection_id: int | None = None
    scan_id: int | None = None
    user_id: int | None = None
    action: str
    old_value: str | None = None
    new_value: str | None = None
    reason: str | None = None
    timestamp: datetime
    hash_self: str
```

`TodaysReportResponse`, `AdminDashboardResponse`, `CreateInspectionRequest`, `SubmitInspectionRequest` and `UpdateUserRequest` are all defined here. Version 1.x referenced all five in route signatures and defined none of them, so the module failed at import.

---

## 5. IMAGE PIPELINE

### 5.1 Store first, then hash — the rule that makes the evidence claim true

```python
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

    # Optional best-effort mirror to Supabase Storage (local remains primary).
    # Configured via SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_BUCKET;
    # a mirror failure never fails the scan.
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        try:
            from supabase import create_client
            supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
            key = f"{inspection_id}/{scan_id}/{dest.name}"
            supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
                key, stored, {"content-type": mime, "upsert": "true"}
            )
        except Exception:
            pass

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
```

Derived images — the rectified copy fed to OCR, the thumbnail shown in the portal — are written beside the original with a `.derived` infix and are never hashed into the evidence record. They are working files. Only the original is evidence.

### 5.2 Quality assessment

```python
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
```

A failing quality assessment does **not** reject the request. It is recorded, and every check that depended on reading the panel returns `not_assessed` with this reason attached. Version 1.x raised HTTP 400 on a blurred image, which threw away the capture, the GPS fix and the inspector's time, and left no record that an unreadable package had been encountered — so the statistics silently described only the photogenic subset of the field.

### 5.3 Rectification and the millimetre scale

```python
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
```

`02` §7.4 requires a `not_assessed` verdict rather than a borderline `fail` when the measured value falls inside the uncertainty band of the threshold. §7.4 of this file implements that.

### 5.4 Perceptual hash, banded

```python
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
```

The `assert` is not decoration. Raising `PHASH_NEAR_DUPLICATE` without adding bands turns a complete filter into a silently lossy one, and the failure mode is invisible: duplicates simply stop being found, and nobody notices that a fraud control has been switched off. The assertion makes that edit fail loudly instead.

A near-duplicate creates a **review item**, never an automatic rejection and never a verdict. Two shelf-mates of the same SKU photographed a minute apart are legitimately near-identical, and so are two captures of one package from slightly different angles. `09` §5.4 states this limit explicitly: pHash proximity is evidence that a human should look, and nothing more.

### 5.5 EXIF

```python
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
```

EXIF is read for the capture timestamp and then **left in the stored original**, because stripping it would change the bytes and therefore change the hash. The metadata is stripped from the *derived* copies that leave the system — thumbnails and report images — which is where the privacy exposure actually is. Version 1.x set an `exif_stripped` flag on the evidence record while also claiming the hash covered the original file; both cannot be true.

---

## 6. OCR PIPELINE

### 6.1 ocr_engine.py

```python
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
```

Version 1.x passed `use_gpu=True` and `show_log=False` and omitted `use_angle_cls`. `use_gpu` is deprecated in Paddle 2.6+ and is ignored with a warning; `show_log` was removed in PaddleOCR 2.8 and raises `TypeError: __init__() got an unexpected keyword argument`; and without `use_angle_cls` the rotated text that appears on every cylindrical package is missed entirely. The probe above is written so the file works against either release rather than pinning the reader to one.

### 6.2 Preprocessing — and the bug that made it pointless

```python
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
```

```python
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

    Cascade: PaddleOCR -> Tesseract -> OCR.space (cloud, optional) -> engine="none".
    The cloud stage lets the slim Render deploy read text at all (needs OCR_SPACE_API_KEY).
    """
    prepped = preprocess_for_ocr(bgr)
    try:
        raw = get_paddle().ocr(prepped, cls=True)
    except Exception as e:                     # model missing, OOM, corrupt input
        return _tesseract_fallback(prepped, f"PaddleOCR unavailable: {type(e).__name__}")

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
        return _tesseract_fallback(prepped, "PaddleOCR returned no text regions")

    return OcrResult(
        lines=lines,
        engine="paddleocr",
        mean_confidence=float(np.mean([l.confidence for l in lines])),
    )


def _tesseract_fallback(bgr: np.ndarray, why: str) -> OcrResult:
    try:
        import pytesseract
        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
        data = pytesseract.image_to_data(
            bgr, lang="eng+hin", output_type=pytesseract.Output.DICT
        )
    except Exception as e:
        return OcrResult(
            engine="none",
            failure_reason=f"{why}; Tesseract also unavailable ({type(e).__name__}).",
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
        return OcrResult(engine="none", failure_reason=f"{why}; Tesseract found no text.")
    return OcrResult(
        lines=lines,
        engine="tesseract",
        mean_confidence=float(np.mean([l.confidence for l in lines])),
    )
```

When both local engines are absent (slim Render deploy), `run_ocr` falls back to OCR.space (`OCR_SPACE_API_KEY`) before giving up — see `ocr_engine._ocrspace_fallback`. When `OcrResult.engine == "none"`, every text-dependent check returns `not_assessed` carrying `failure_reason`. The scan is still recorded, still counted, still visible in the review queue. Nine of the nineteen rows come back `not_assessed` in that case, and the report says so on its face.

### 6.3 Field extraction

```python
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
```

---
## 7. RULES ENGINE

### 7.1 The contract

The engine takes one scan's evidence and returns exactly **nineteen** findings, always, in the priority order of `03_NiyamNetra_Rules_Priority_Ordered.md`. It then derives the scan's four-state result from those nineteen.

```text
run_checks(context)  ->  list[FindingResult]   # len == 19, invariably
derive_result(findings, context)  ->  ScanVerdict
```

Three properties are asserted in code and tested in `10_TESTING.md`:

**Completeness.** `len(results) == 19` and `{r.check_id for r in results} == ALL_CHECK_IDS`. A check that cannot run returns `not_assessed`; it does not return nothing. Version 1.x had eight `if` branches with no `else` — CHK02's tobacco carve-out, the imported-goods gate on CHK12, the perishable gate on CHK13, and five others — where the condition failing meant the check produced no row at all. The report then showed twelve rows on one package and sixteen on another, with no indication that four checks had silently disappeared, and the "no violations found" line at the bottom covered both cases identically.

**Justification.** `verdict != "not_assessed" or reason is not None`. Enforced by the database `CHECK` constraint in §2.1 as well, so a code path that forgets it cannot commit.

**Coherence.** `not (verdict == "fail" and severity == "advisory")`. CHK17 is advisory, so it can only ever return `pass` or `not_assessed`; a missing FSSAI number is reported as an observation for the food authority, not as a Legal Metrology violation, because this Act does not create that obligation.

### 7.2 Context and result types

```python
"""rules_engine.py"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Callable, Literal

from cachetools import TTLCache, cached

from citations import cite
from config import settings

Verdict = Literal["pass", "fail", "not_assessed"]
Severity = Literal["critical", "major", "minor", "advisory"]
Source = Literal["OPERATOR", "PACKAGE", "LISTING", "PLATFORM"]


@dataclass(slots=True)
class FindingResult:
    check_id: str
    title: str
    verdict: Verdict
    severity: Severity
    reason: str | None = None          # mandatory when verdict == "not_assessed"
    observed: str | None = None
    required: str | None = None
    citation: str | None = None
    ledger_ref: str | None = None
    confidence: float | None = None
    limb: str | None = None            # "36(1)" | "36(2)" — set only on fail


@dataclass(slots=True)
class CheckContext:
    """Everything a check may look at. Nothing is fetched from inside a check."""
    # --- operator-declared ---
    transaction_type: str | None = None
    commodity_generic: str | None = None
    commodity_category: str | None = None
    net_quantity_value: float | None = None
    net_quantity_unit: str | None = None
    is_imported: bool | None = None
    is_perishable: bool | None = None
    is_medical_device: bool | None = None
    is_tobacco: bool | None = None
    has_sticker: bool | None = None
    sticker_reduces_price: bool | None = None
    sticker_covers_original: bool | None = None

    # --- geometry ---
    panel_shape: str | None = None
    panel_height_mm: float | None = None
    panel_width_mm: float | None = None
    panel_diameter_mm: float | None = None
    total_surface_area_cm2: float | None = None
    is_blown_moulded: bool = False

    # --- measurement ---
    mm_per_pixel: float | None = None
    mm_per_pixel_uncertainty: float | None = None
    scale_source: str = "none"

    # --- OCR ---
    ocr_available: bool = False
    ocr_failure_reason: str | None = None
    ocr_mean_confidence: float | None = None
    fields: dict = field(default_factory=dict)      # name -> ExtractedField
    measured_heights_mm: dict = field(default_factory=dict)
    measured_widths_mm: dict = field(default_factory=dict)
    clear_space_mm: dict = field(default_factory=dict)
    contrast_ratio: float | None = None

    # --- image quality ---
    image_usable: bool = True
    image_quality_reason: str | None = None
    panels_captured: set[str] = field(default_factory=set)

    # --- listing, only when the scan came from a web listing ---
    listing_available: bool = False
    listing_fields: dict = field(default_factory=dict)
    platform_has_origin_filter: bool | None = None

    rules_as_at: date = field(default_factory=lambda: date.fromisoformat(settings.RULES_AS_AT))

    # --- set by the runner, read by later checks ---
    halted: str | None = None          # the check_id that halted the run
    halt_reason: str | None = None
    phase3_halted: bool = False
```

### 7.3 The catalog and the millimetre tables

```python
@cached(TTLCache(maxsize=1, ttl=300))
def load_catalog() -> dict:
    """TTLCache, not lru_cache: an admin editing the catalog must take effect
    without a process restart, and must not take effect silently forever."""
    return json.loads(settings.RULES_CATALOG.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def catalog_hash() -> str:
    import hashlib
    return hashlib.sha256(settings.RULES_CATALOG.read_bytes()).hexdigest()


# Rule 7, Table-I as substituted by GSR 629(E) w.e.f 01.01.2018.
# Ledger L-11 — UNVERIFIED. Consistent across drafts but not read from the
# gazette. The engine uses these numbers and says so in every report.
# (area_upper_cm2_inclusive, min_height_mm_normal, min_height_mm_blown)
TABLE_I = (
    (50.0,    1.0, 1.5),
    (100.0,   1.5, 3.0),
    (500.0,   2.5, 4.0),
    (2500.0,  4.0, 6.0),
    (math.inf, 6.0, 6.0),
)


def min_height_mm(pdp_area_cm2: float, blown: bool) -> float:
    for upper, normal, blown_h in TABLE_I:
        if pdp_area_cm2 <= upper:
            return blown_h if blown else normal
    raise AssertionError("TABLE_I must end with an infinite upper bound")


def pdp_area_cm2(ctx: CheckContext) -> tuple[float | None, str | None]:
    """Rule 7(4). Returns (area, reason_if_unavailable).

    rectangular : height x width
    cylindrical : 0.4 x height x pi x diameter
    other       : 40% of total surface area
    """
    if ctx.panel_shape == "rectangular" and ctx.panel_height_mm and ctx.panel_width_mm:
        return (ctx.panel_height_mm * ctx.panel_width_mm) / 100.0, None
    if ctx.panel_shape == "cylindrical" and ctx.panel_height_mm and ctx.panel_diameter_mm:
        area_mm2 = 0.4 * ctx.panel_height_mm * math.pi * ctx.panel_diameter_mm
        return area_mm2 / 100.0, None
    if ctx.panel_shape == "other" and ctx.total_surface_area_cm2:
        return 0.4 * ctx.total_surface_area_cm2, None
    return None, (
        "Principal display panel area cannot be computed: the package shape and "
        "its dimensions were not recorded, and Rule 7(4) requires them before "
        "any Table-I band can be selected."
    )
```

### 7.4 Measurement guards

Every millimetre check passes through the same three gates before it is allowed to reach a verdict. They are written once.

```python
NO_SCALE = (
    "No millimetre scale could be established for this capture, so letter "
    "heights cannot be measured. Record the panel height, or include a "
    "reference object, and re-capture."
)


def measurement_blocked(ctx: CheckContext) -> str | None:
    """Returns a reason if millimetre measurement is impossible, else None."""
    if not ctx.image_usable:
        return ctx.image_quality_reason
    if not ctx.ocr_available:
        return ctx.ocr_failure_reason or "No text was recognised on the panel."
    if ctx.mm_per_pixel is None or ctx.scale_source == "none":
        return NO_SCALE
    return None


def compare_with_uncertainty(
    measured_mm: float, minimum_mm: float, uncertainty_mm: float | None
) -> tuple[Verdict, str]:
    """A measurement inside its own uncertainty band of the threshold is not a
    finding either way. 02 §7.4 requires not_assessed there, because a
    prosecution cannot rest on a difference smaller than the instrument's error.
    """
    u = uncertainty_mm or 0.0
    if measured_mm - u >= minimum_mm:
        return "pass", ""
    if measured_mm + u < minimum_mm:
        return "fail", ""
    return "not_assessed", (
        f"Measured {measured_mm:.2f} mm +/- {u:.2f} mm against a "
        f"{minimum_mm:.1f} mm minimum. The shortfall is inside the measurement "
        f"uncertainty, so compliance cannot be determined from this capture. "
        f"Physical verification with a calibrated gauge is required."
    )
```

### 7.5 The eighteen checks

Each check is a function of the context returning one `FindingResult`. Order of definition is the execution order.

```python
CHECKS: list[tuple[str, Callable[[CheckContext], FindingResult]]] = []


def check(check_id: str):
    def deco(fn):
        CHECKS.append((check_id, fn))
        return fn
    return deco
```

#### Phase 1 — scope. These can halt the run.

```python
OUT_OF_SCOPE_TRANSACTIONS = {
    "wholesale": "a wholesale dealing, not a retail sale",
    "institutional": "an institutional supply",
    "industrial": "an industrial supply",
    "packed_in_presence": "a package made up in the purchaser's presence",
    "export": "a package for export",
}

# Rule 3 thresholds. Chapter II does not apply above these.
RETAIL_WEIGHT_CEILING_KG = 25.0
RETAIL_VOLUME_CEILING_L = 25.0
AGRI_CEILING_KG = 50.0          # cement, fertiliser and agricultural produce
AGRI_CATEGORIES = {"cement", "fertiliser", "fertilizer", "agricultural_produce"}


@check("CHK03")
def chk03_chapter_ii_applicability(ctx: CheckContext) -> FindingResult:
    """Rule 3. Halts everything if Chapter II does not apply."""
    t = FindingResult(
        "CHK03", "Chapter II applies to this package", "pass", "critical",
        citation=cite("R3", "Rule 3, Legal Metrology (Packaged Commodities) Rules 2011"),
    )
    if ctx.transaction_type is None:
        t.verdict, t.reason = "not_assessed", (
            "The transaction type was not recorded, so it cannot be determined "
            "whether Chapter II applies. Rule 3 excludes wholesale, industrial "
            "and institutional dealings and packages made up in the purchaser's "
            "presence."
        )
        return t

    if ctx.transaction_type in OUT_OF_SCOPE_TRANSACTIONS:
        t.verdict = "pass"     # the check itself succeeded: it correctly found no scope
        t.observed = f"Recorded as {OUT_OF_SCOPE_TRANSACTIONS[ctx.transaction_type]}."
        t.required = "Chapter II applies only to packages intended for retail sale."
        ctx.halted, ctx.halt_reason = "CHK03", (
            f"Out of scope: this is {OUT_OF_SCOPE_TRANSACTIONS[ctx.transaction_type]}, "
            f"to which Chapter II of the Rules does not apply."
        )
        return t

    ceiling, unit = None, None
    if ctx.net_quantity_unit in {"kg", "g", "gm", "mg"} and ctx.net_quantity_value:
        kg = _to_kg(ctx.net_quantity_value, ctx.net_quantity_unit)
        ceiling = (
            AGRI_CEILING_KG
            if (ctx.commodity_category or "").lower() in AGRI_CATEGORIES
            else RETAIL_WEIGHT_CEILING_KG
        )
        unit = "kg"
        if kg is not None and kg > ceiling:
            t.observed = f"Net quantity {kg:g} kg exceeds the {ceiling:g} kg ceiling."
            ctx.halted, ctx.halt_reason = "CHK03", (
                f"Out of scope: net quantity {kg:g} kg is above the {ceiling:g} kg "
                f"limit in Rule 3 for this commodity class."
            )
            return t
    elif ctx.net_quantity_unit in {"l", "ltr", "litre", "ml"} and ctx.net_quantity_value:
        litres = _to_litres(ctx.net_quantity_value, ctx.net_quantity_unit)
        if litres is not None and litres > RETAIL_VOLUME_CEILING_L:
            t.observed = f"Net quantity {litres:g} L exceeds the 25 L ceiling."
            ctx.halted, ctx.halt_reason = "CHK03", (
                f"Out of scope: net quantity {litres:g} L is above the 25 L limit in Rule 3."
            )
            return t

    t.observed = "Retail sale, within the Rule 3 quantity limits."
    return t


def _to_kg(value: float, unit: str) -> float | None:
    return {"kg": value, "g": value / 1000, "gm": value / 1000,
            "mg": value / 1_000_000}.get(unit)


def _to_litres(value: float, unit: str) -> float | None:
    return {"l": value, "ltr": value, "litre": value, "ml": value / 1000}.get(unit)


@check("CHK02")
def chk02_small_package_exemption(ctx: CheckContext) -> FindingResult:
    """Rule 26(a): packages of net quantity 10 g / 10 ml or less are exempt
    from the Rule 6 declarations — EXCEPT tobacco products.

    The 10-20 g proviso was withdrawn w.e.f 01.07.2012 (ledger L-15), so there
    is no intermediate band. Everything above 10 g / 10 ml is fully in.
    """
    t = FindingResult(
        "CHK02", "Small-package exemption under Rule 26(a)", "pass", "critical",
        citation=cite("R26a", "Rule 26(a) small-package exemption"),
        ledger_ref="L-15",
    )
    if ctx.halted:
        return _halted(t, ctx)

    if ctx.net_quantity_value is None or ctx.net_quantity_unit is None:
        t.verdict, t.reason = "not_assessed", (
            "Net quantity could not be read, so the Rule 26(a) exemption cannot "
            "be evaluated. The declarations are checked on the assumption that "
            "the package is not exempt; confirm the quantity physically."
        )
        return t

    grams = _to_kg(ctx.net_quantity_value, ctx.net_quantity_unit)
    millilitres = _to_litres(ctx.net_quantity_value, ctx.net_quantity_unit)
    small = (grams is not None and grams * 1000 <= 10) or (
        millilitres is not None and millilitres * 1000 <= 10
    )

    if not small:
        t.observed = (
            f"Net quantity {ctx.net_quantity_value:g} {ctx.net_quantity_unit} is "
            f"above the 10 g / 10 ml exemption threshold; Rule 6 applies in full."
        )
        return t

    # The carve-out. THIS BRANCH MUST EXIST — v1.x tested tobacco inline with
    # `if category not in [...]` and no else, so a tobacco package silently
    # produced no CHK02 row at all.
    if ctx.is_tobacco:
        t.observed = (
            f"Net quantity {ctx.net_quantity_value:g} {ctx.net_quantity_unit} is "
            f"within the small-package threshold, but the exemption in Rule 26(a) "
            f"does not extend to tobacco products, so all declarations remain due."
        )
        t.required = "Rule 6 declarations apply notwithstanding the package size."
        return t

    if ctx.is_tobacco is None:
        t.verdict, t.reason = "not_assessed", (
            f"Net quantity {ctx.net_quantity_value:g} {ctx.net_quantity_unit} is "
            f"within the small-package threshold, but whether this is a tobacco "
            f"product was not recorded, and Rule 26(a) does not exempt tobacco. "
            f"Confirm the commodity class."
        )
        return t

    t.observed = (
        f"Exempt: net quantity {ctx.net_quantity_value:g} {ctx.net_quantity_unit} "
        f"is within the 10 g / 10 ml threshold and this is not a tobacco product."
    )
    ctx.halted, ctx.halt_reason = "CHK02", (
        f"Exempt under Rule 26(a): net quantity "
        f"{ctx.net_quantity_value:g} {ctx.net_quantity_unit} is at or below "
        f"10 g / 10 ml, and the tobacco carve-out does not apply."
    )
    return t


@check("CHK14")
def chk14_medical_device_routing(ctx: CheckContext) -> FindingResult:
    """Proviso to Rule 2(h), as amended w.e.f 23.10.2025: a medical device is
    labelled under the Medical Devices Rules 2017, not under these Rules.

    Halts phase 3 only. The scope and identification findings still stand, and
    the report routes the package to the drug authority rather than closing it.
    """
    t = FindingResult(
        "CHK14", "Medical device — labelling routed to Medical Devices Rules 2017",
        "pass", "critical",
        citation=cite("R2h", "proviso to Rule 2(h), as amended w.e.f 23 October 2025"),
    )
    if ctx.halted:
        return _halted(t, ctx)

    if ctx.is_medical_device is None:
        t.verdict, t.reason = (
            "not_assessed",
            "Whether this is a medical device was not recorded. Since 23 October "
            "2025 medical devices are labelled under the Medical Devices Rules "
            "2017, so the applicable regime cannot be settled without it.",
        )
        return t

    if ctx.is_medical_device:
        ctx.phase3_halted = True
        t.observed = (
            "Recorded as a medical device. Declaration and typography "
            "requirements under these Rules do not apply; refer to the State "
            "Drug Controller under the Medical Devices Rules 2017."
        )
        t.required = "Labelling assessed under the Medical Devices Rules 2017."
        return t

    t.observed = "Not a medical device; these Rules apply."
    return t
```

#### Phase 2 — declarations.

```python
# Rule 6(1) and 6(2). Each entry: field key, human label, provision key, limb.
RULE_6_DECLARATIONS = (
    ("manufacturer", "Name and address of the manufacturer, packer or importer",
     "R6-1-a", "36(1)"),
    ("commodity", "Common or generic name of the commodity", "R6-1-b", "36(1)"),
    ("net_quantity", "Net quantity in standard units", "R6-1-c", "36(2)"),
    ("date_of_manufacture", "Month and year of manufacture or packing",
     "R6-1-d", "36(1)"),
    ("mrp", "Retail sale price as maximum retail price", "R6-1-e", "36(1)"),
    ("consumer_care", "Consumer care contact — name, address, telephone or email",
     "R6-1-f", "36(1)"),
    ("dimensions", "Dimensions, where the commodity is sold by number or length",
     "R6-1-g", "36(1)"),
)


@check("CHK01")
def chk01_declarations_present(ctx: CheckContext) -> FindingResult:
    t = FindingResult(
        "CHK01", "All mandatory Rule 6 declarations present", "pass", "critical",
        citation=cite("R6", "Rule 6(1) and 6(2), mandatory declarations"),
    )
    if ctx.halted:
        return _halted(t, ctx)
    if not ctx.ocr_available:
        t.verdict, t.reason = "not_assessed", (
            ctx.ocr_failure_reason
            or "No text was recognised on the package, so the presence of the "
               "mandatory declarations cannot be determined."
        )
        return t

    missing, unreadable = [], []
    for key, label, _prov, _limb in RULE_6_DECLARATIONS:
        f = ctx.fields.get(key)
        if key == "dimensions" and ctx.net_quantity_unit not in {"pcs", "pc", "m", "cm", "mm"}:
            continue        # 6(1)(g) is conditional on sale by number or length
        if f is None or not f.found:
            missing.append(label)
        elif f.confidence is not None and f.confidence < settings.OCR_MIN_CONFIDENCE:
            unreadable.append(f"{label} (read at {f.confidence:.0%} confidence)")

    if missing:
        t.verdict = "fail"
        t.limb = "36(1)"
        t.observed = f"{len(missing)} declaration(s) absent: " + "; ".join(missing) + "."
        t.required = "Every declaration in Rule 6(1) must appear on the principal display panel."
        return t
    if unreadable:
        t.verdict, t.reason = "not_assessed", (
            "All declarations appear present, but "
            + "; ".join(unreadable)
            + " fell below the confidence floor, so their content cannot be "
              "certified from this capture."
        )
        return t
    t.observed = "All applicable Rule 6(1) declarations located on the panel."
    t.confidence = ctx.ocr_mean_confidence
    return t


@check("CHK04")
def chk04_mrp_form(ctx: CheckContext) -> FindingResult:
    """Rule 6(1)(e) with Rule 2(m); dual MRP prohibited by Rule 6(2A)."""
    t = FindingResult(
        "CHK04", "Retail sale price correctly expressed", "pass", "major",
        citation=cite("R6-1-e", "Rule 6(1)(e) read with Rule 2(m)"),
        ledger_ref="L-02",
    )
    if ctx.halted:
        return _halted(t, ctx)
    mrp = ctx.fields.get("mrp")
    if not ctx.ocr_available or mrp is None or not mrp.found:
        t.verdict, t.reason = "not_assessed", (
            ctx.ocr_failure_reason
            or "No retail sale price was read, so its form cannot be checked. "
               "Absence of the price itself is reported under CHK01."
        )
        return t

    problems = []
    if not ctx.fields.get("mrp_inclusive_wording", _absent()).found:
        problems.append(
            'the price is not qualified as "inclusive of all taxes" or an '
            "equivalent expression"
        )

    rounding = _mrp_rounding_note(mrp.value)
    if rounding:
        problems.append(rounding)

    # Rule 6(2A) — no second, higher price on the same package.
    if _has_dual_price(ctx):
        problems.append(
            "two different retail sale prices appear on the package, which "
            "Rule 6(2A) prohibits"
        )

    if problems:
        t.verdict, t.limb = "fail", "36(1)"
        t.observed = f'Price read as "{mrp.value}"; ' + "; ".join(problems) + "."
        t.required = (
            "The retail sale price must be declared as the maximum retail price "
            "inclusive of all taxes, in a single amount."
        )
        return t
    t.observed = f'Price "{mrp.value}" declared inclusive of all taxes, single amount.'
    t.confidence = mrp.confidence
    return t


def _mrp_rounding_note(value: str | None) -> str | None:
    """Rule 2(m) rounding. Ledger L-02 — the exact wording is UNVERIFIED, so
    this reports the observation and does not assert a breach of a provision
    it cannot quote.

    v1.x had a check_mrp_rounding() that returned True on every branch — it
    could not fail, and the 95-99 paise case it was written for was unhandled.
    """
    if not value:
        return None
    try:
        paise = round(float(value.replace(",", "")) * 100) % 100
    except ValueError:
        return None
    if paise == 0:
        return None
    if paise == 50:
        return None                       # half-rupee is conventionally accepted
    return (
        f"the price ends in {paise:02d} paise, which does not follow the rounding "
        f"convention in Rule 2(m) (ledger L-02, wording unverified — recorded as "
        f"an observation, not asserted as a breach)"
    )


def _has_dual_price(ctx: CheckContext) -> bool:
    import re as _re
    amounts = {
        m.group(1)
        for m in _re.finditer(r"(?:M\.?R\.?P\.?|Rs\.?|INR|₹)\s?(\d+(?:[.,]\d{1,2})?)",
                              " ".join(f.source_line or "" for f in ctx.fields.values()),
                              _re.I)
    }
    return len(amounts) > 1


def _absent():
    from ocr_engine import ExtractedField
    return ExtractedField(None, None, None, False)


# Rules 12-13. Ledger L-01: the sub-rule number for the prohibited-qualifier
# provision has been cited as both 12(6) and 13 in earlier drafts, so cite()
# prints the descriptive form until that is resolved.
FORBIDDEN_QUALIFIERS_PATH = settings.RULES_CATALOG.parent / "forbidden_words.json"


@cached(TTLCache(maxsize=1, ttl=300))
def forbidden_qualifiers() -> tuple[str, ...]:
    """One source of truth. v1.x defined three divergent copies of this list in
    the same file, so which words were prohibited depended on which function
    happened to run."""
    return tuple(json.loads(FORBIDDEN_QUALIFIERS_PATH.read_text(encoding="utf-8"))["words"])


SI_UNITS = {
    "kg", "g", "mg", "l", "ml", "m", "cm", "mm",
}
COUNT_UNITS = {"n", "u"}     # numbers/units — permissible for count, not SI


@check("CHK05")
def chk05_net_quantity_expression(ctx: CheckContext) -> FindingResult:
    t = FindingResult(
        "CHK05", "Net quantity free of qualifiers and in permitted units",
        "pass", "major",
        citation=cite("R12-13", "the prohibited-qualifier provision in Rules 12-13"),
        ledger_ref="L-01",
    )
    if ctx.halted:
        return _halted(t, ctx)
    nq = ctx.fields.get("net_quantity")
    if not ctx.ocr_available or nq is None or not nq.found:
        t.verdict, t.reason = "not_assessed", (
            ctx.ocr_failure_reason
            or "Net quantity was not read, so its expression cannot be checked."
        )
        return t

    line = (nq.source_line or "").lower()
    hits = [w for w in forbidden_qualifiers() if re.search(rf"\b{re.escape(w)}\b", line)]

    unit = (ctx.net_quantity_unit or "").lower()
    unit_problem = None
    if unit in COUNT_UNITS:
        # "N" and "U" are not SI units. They are permissible where the Fourth
        # Schedule prescribes declaration by number, and not otherwise.
        # Ledger L-06 — the Fourth Schedule is only partly transcribed.
        t.verdict, t.reason = "not_assessed", (
            f'Quantity declared in "{ctx.net_quantity_unit}", which denotes a '
            f"count rather than an SI unit. Whether a count is the prescribed "
            f"form for this commodity depends on the Fourth Schedule, which is "
            f"only partly transcribed (ledger L-06)."
        )
        t.ledger_ref = "L-06"
        return t
    if unit and unit not in SI_UNITS:
        unit_problem = f'"{ctx.net_quantity_unit}" is not a permitted unit'

    if hits or unit_problem:
        t.verdict, t.limb = "fail", "36(2)"
        parts = []
        if hits:
            parts.append("prohibited qualifier(s) " + ", ".join(f'"{h}"' for h in hits))
        if unit_problem:
            parts.append(unit_problem)
        t.observed = f'Net quantity read as "{nq.source_line}": ' + "; ".join(parts) + "."
        t.required = (
            "Net quantity must be declared in the prescribed unit without any "
            "qualifying word such as those in the prohibited list."
        )
        return t
    t.observed = f'Net quantity "{nq.source_line}" in permitted units, unqualified.'
    t.confidence = nq.confidence
    return t


@check("CHK11")
def chk11_sticker(ctx: CheckContext) -> FindingResult:
    """Rules 6(3) to 6(4A): a sticker may only reduce the declared price and
    must not obscure the original declaration."""
    t = FindingResult(
        "CHK11", "Any sticker only reduces price and does not obscure the original",
        "pass", "major",
        citation=cite("R6-3", "Rules 6(3) to 6(4A) on stickers and corrections"),
    )
    if ctx.halted:
        return _halted(t, ctx)
    if ctx.has_sticker is None:
        t.verdict, t.reason = "not_assessed", (
            "Whether a price sticker is applied to the package was not recorded, "
            "so Rules 6(3) to 6(4A) cannot be applied. This is an operator "
            "observation the app requests at capture."
        )
        return t
    if not ctx.has_sticker:
        t.observed = "No sticker applied; the printed declarations stand as made."
        return t

    problems = []
    if ctx.sticker_reduces_price is False:
        problems.append("the sticker states a price higher than the printed price")
    if ctx.sticker_covers_original is True:
        problems.append("the sticker conceals the original declaration")
    if ctx.sticker_reduces_price is None or ctx.sticker_covers_original is None:
        t.verdict, t.reason = "not_assessed", (
            "A sticker is present, but it was not recorded whether it reduces the "
            "price and whether it conceals the original declaration. Both are "
            "required before Rule 6(4A) can be applied."
        )
        return t
    if problems:
        t.verdict, t.limb = "fail", "36(1)"
        t.observed = "Sticker present and " + "; ".join(problems) + "."
        t.required = (
            "A sticker may only declare a reduced price and must leave the "
            "original declaration legible."
        )
        return t
    t.observed = "Sticker reduces the price and leaves the original declaration visible."
    return t


@check("CHK12")
def chk12_country_of_origin(ctx: CheckContext) -> FindingResult:
    """Rule 6(1)(aa), inserted by GSR 629(E) w.e.f 01.01.2018."""
    t = FindingResult(
        "CHK12", "Country of origin declared on imported goods", "pass", "major",
        citation=cite("R6-1-aa", "Rule 6(1)(aa), country of origin"),
    )
    if ctx.halted:
        return _halted(t, ctx)

    # THIS BRANCH MUST EXIST. v1.x gated the whole check on `if is_imported:`
    # with no else, so a domestic package produced no CHK12 row and an
    # unrecorded import status produced no row either.
    if ctx.is_imported is None:
        t.verdict, t.reason = "not_assessed", (
            "Whether the goods are imported was not recorded. Rule 6(1)(aa) "
            "requires the country of origin on imported packages, so the "
            "obligation cannot be determined."
        )
        return t
    if not ctx.is_imported:
        t.observed = (
            "Recorded as domestically manufactured, so Rule 6(1)(aa) does not "
            "impose a country-of-origin declaration."
        )
        return t

    coo = ctx.fields.get("country_of_origin")
    if not ctx.ocr_available:
        t.verdict, t.reason = "not_assessed", (
            ctx.ocr_failure_reason
            or "The panel text could not be read, so the country-of-origin "
               "declaration cannot be located."
        )
        return t
    if coo is None or not coo.found:
        t.verdict, t.limb = "fail", "36(1)"
        t.observed = "No country of origin declared on an imported package."
        t.required = "Imported packages must declare the country of origin."
        return t
    t.observed = f'Country of origin declared as "{coo.value}".'
    t.confidence = coo.confidence
    return t


@check("CHK13")
def chk13_best_before(ctx: CheckContext) -> FindingResult:
    """Rule 6(1)(da), inserted by GSR 629(E) w.e.f 01.01.2018."""
    t = FindingResult(
        "CHK13", "Best-before or use-by declared where the commodity is perishable",
        "pass", "major",
        citation=cite("R6-1-da", "Rule 6(1)(da), best-before declaration"),
    )
    if ctx.halted:
        return _halted(t, ctx)
    if ctx.is_perishable is None:
        t.verdict, t.reason = "not_assessed", (
            "Whether the commodity is perishable was not recorded, so it cannot "
            "be determined whether Rule 6(1)(da) requires a best-before date."
        )
        return t
    if not ctx.is_perishable:
        t.observed = (
            "Recorded as non-perishable, so no best-before declaration is due "
            "under Rule 6(1)(da)."
        )
        return t
    bb = ctx.fields.get("best_before")
    if not ctx.ocr_available:
        t.verdict, t.reason = "not_assessed", (
            ctx.ocr_failure_reason or "The panel text could not be read."
        )
        return t
    if bb is None or not bb.found:
        t.verdict, t.limb = "fail", "36(1)"
        t.observed = "No best-before or use-by declaration on a perishable commodity."
        t.required = "Perishable commodities must declare a best-before or use-by date."
        return t
    t.observed = f'Best-before declared as "{bb.value}".'
    t.confidence = bb.confidence
    return t


@check("CHK10")
def chk10_prescribed_quantity(ctx: CheckContext) -> FindingResult:
    """Rule 5 with the Second Schedule. Ledger L-05: the Second Schedule has
    not been transcribed, so this check FAILS OPEN — it returns not_assessed
    rather than guessing at prescribed sizes.
    """
    t = FindingResult(
        "CHK10", "Net quantity is a prescribed standard pack size", "not_assessed",
        "minor",
        citation=cite("R5", "Rule 5 read with the Second Schedule"),
        ledger_ref="L-05",
        reason=(
            "The Second Schedule table of prescribed pack sizes has not been "
            "transcribed into the rule catalog (ledger L-05), so whether this "
            "quantity is a prescribed size cannot be determined. The engine "
            "does not guess at schedule contents."
        ),
    )
    if ctx.halted:
        return _halted(t, ctx)

    catalog = load_catalog()
    table = catalog.get("second_schedule", {})
    group = table.get((ctx.commodity_category or "").lower())
    if not group:
        return t                       # stays not_assessed, with the reason above

    if ctx.net_quantity_value is None:
        t.reason = "Net quantity was not read, so it cannot be matched to the schedule."
        return t

    if ctx.net_quantity_value in group.get("sizes", []):
        t.verdict, t.reason = "pass", None
        t.observed = (
            f"{ctx.net_quantity_value:g} {ctx.net_quantity_unit} is a prescribed "
            f"size for {ctx.commodity_category}."
        )
        return t
    t.verdict, t.reason, t.limb = "fail", None, "36(1)"
    t.observed = (
        f"{ctx.net_quantity_value:g} {ctx.net_quantity_unit} is not among the "
        f"prescribed sizes for {ctx.commodity_category}: "
        f"{', '.join(str(s) for s in group['sizes'])}."
    )
    t.required = "Commodities in this group may only be packed in the prescribed sizes."
    return t


@check("CHK17")
def chk17_fssai_advisory(ctx: CheckContext) -> FindingResult:
    """ADVISORY ONLY. The Food Safety and Standards Act is not administered by
    Legal Metrology, so a missing licence number is an observation to pass to
    the food authority, never a finding under these Rules.

    Because it is advisory it can return only pass or not_assessed. The
    database CHECK constraint ck_finding_severity_coherent enforces that.
    """
    t = FindingResult(
        "CHK17", "FSSAI licence number visible (advisory — not a Legal Metrology finding)",
        "pass", "advisory",
        citation="Food Safety and Standards Act 2006 — referred, not enforced here",
    )
    if ctx.halted:
        return _halted(t, ctx)
    if not ctx.ocr_available:
        t.verdict, t.reason = "not_assessed", (
            ctx.ocr_failure_reason or "The panel text could not be read."
        )
        return t
    if (ctx.commodity_category or "").lower() not in {"food", "beverage", "nutraceutical"}:
        t.observed = "Not a food commodity; no FSSAI observation recorded."
        return t
    m = re.search(r"\b(\d{14})\b", "\n".join(
        f.source_line or "" for f in ctx.fields.values()
    ))
    if m:
        t.observed = f"A 14-digit FSSAI licence number is present ({m.group(1)})."
    else:
        t.verdict, t.reason = "not_assessed", (
            "No 14-digit FSSAI licence number was located. This is recorded for "
            "referral to the food safety authority and is not assessed as a "
            "Legal Metrology matter."
        )
    return t
```

#### Phase 3 — typography and layout. Millimetre-dependent, and halted for medical devices.

```python
def _phase3_gate(t: FindingResult, ctx: CheckContext) -> FindingResult | None:
    if ctx.halted:
        return _halted(t, ctx)
    if ctx.phase3_halted:
        t.verdict, t.reason = "not_assessed", (
            "Not assessed: the package is a medical device, whose labelling is "
            "governed by the Medical Devices Rules 2017 rather than by the "
            "typography requirements of these Rules."
        )
        return t
    blocked = measurement_blocked(ctx)
    if blocked:
        t.verdict, t.reason = "not_assessed", blocked
        return t
    return None


@check("CHK06")
def chk06_character_height(ctx: CheckContext) -> FindingResult:
    """Rule 7(2) with Table-I. Ledger L-11."""
    t = FindingResult(
        "CHK06", "Character height meets Table-I for the panel area", "pass", "major",
        citation=cite("R7-2", "Rule 7(2) read with Table-I as substituted w.e.f 01.01.2018"),
        ledger_ref="L-11",
    )
    if (early := _phase3_gate(t, ctx)) is not None:
        return early

    area, area_reason = pdp_area_cm2(ctx)
    if area is None:
        t.verdict, t.reason = "not_assessed", area_reason
        return t
    if not ctx.measured_heights_mm:
        t.verdict, t.reason = "not_assessed", (
            "No character heights could be measured on the rectified panel, so "
            "Table-I compliance cannot be determined."
        )
        return t

    required = min_height_mm(area, ctx.is_blown_moulded)
    smallest_field = min(ctx.measured_heights_mm, key=ctx.measured_heights_mm.get)
    smallest = ctx.measured_heights_mm[smallest_field]
    u = (ctx.mm_per_pixel_uncertainty or 0.0) * 2      # two edges per measurement

    verdict, note = compare_with_uncertainty(smallest, required, u)
    t.verdict = verdict
    t.required = (
        f"Minimum {required:.1f} mm for a principal display panel of "
        f"{area:.0f} cm2"
        + (" (blown-moulded container)" if ctx.is_blown_moulded else "")
        + ". Table-I values are ledger L-11, unverified against the gazette."
    )
    if verdict == "not_assessed":
        t.reason = note
        return t
    from image_processor import format_measurement
    t.observed = (
        f'Smallest measured character height is on "{smallest_field}": '
        + format_measurement(smallest, u, required)
        + f" (scale from {ctx.scale_source})."
    )
    if verdict == "fail":
        t.limb = "36(1)"
    return t


@check("CHK06b")
def chk06b_net_quantity_height(ctx: CheckContext) -> FindingResult:
    """Rule 7 prescribes a separate, larger minimum height for the net quantity
    declaration specifically, keyed to the quantity itself.

    Ledger L-04: that table has NOT been transcribed. This check therefore
    always returns not_assessed with the reason stated, and will begin
    returning verdicts the moment the table is added to the catalog. It is a
    row in every report so that the gap is visible rather than invisible.
    """
    t = FindingResult(
        "CHK06b", "Net-quantity declaration meets its own minimum height",
        "not_assessed", "major",
        citation=cite("R7-nq", "the net-quantity-specific minimum height in Rule 7"),
        ledger_ref="L-04",
        reason=(
            "The net-quantity-specific minimum height table has not been "
            "transcribed into the rule catalog (ledger L-04), so this "
            "requirement cannot be evaluated. It is distinct from, and larger "
            "than, the general Table-I minimum checked in CHK06."
        ),
    )
    if ctx.halted:
        return _halted(t, ctx)
    if ctx.phase3_halted:
        t.reason = (
            "Not assessed: medical device, labelled under the Medical Devices "
            "Rules 2017."
        )
        return t

    table = load_catalog().get("net_quantity_heights")
    if not table:
        return t                       # stays not_assessed, reason as constructed

    if (blocked := measurement_blocked(ctx)) is not None:
        t.reason = blocked
        return t
    if ctx.net_quantity_value is None:
        t.reason = "Net quantity was not read, so its height requirement cannot be selected."
        return t
    measured = ctx.measured_heights_mm.get("net_quantity")
    if measured is None:
        t.reason = "The net-quantity declaration was not located on the rectified panel."
        return t

    required = _select_band(table, ctx.net_quantity_value, ctx.net_quantity_unit)
    if required is None:
        t.reason = (
            f"No band in the transcribed table covers "
            f"{ctx.net_quantity_value:g} {ctx.net_quantity_unit}."
        )
        return t
    u = (ctx.mm_per_pixel_uncertainty or 0.0) * 2
    verdict, note = compare_with_uncertainty(measured, required, u)
    t.verdict, t.reason = verdict, (note or None)
    t.required = f"Minimum {required:.1f} mm for the net-quantity declaration (ledger L-04)."
    if verdict != "not_assessed":
        from image_processor import format_measurement
        t.observed = format_measurement(measured, u, required)
    if verdict == "fail":
        t.limb = "36(2)"
    return t


def _select_band(table: dict, value: float, unit: str | None) -> float | None:
    for band in table.get("bands", []):
        if band["unit"] == (unit or "").lower() and value <= band["upper"]:
            return float(band["min_height_mm"])
    return None


# Rule 7(3): character width at least one-third of height — except for the
# narrow glyphs, which have no width requirement.
NARROW_GLYPHS = set("1iIl")
WIDTH_RATIO = 1 / 3


@check("CHK07")
def chk07_character_width(ctx: CheckContext) -> FindingResult:
    t = FindingResult(
        "CHK07", "Character width at least one-third of height", "pass", "minor",
        citation=cite("R7-3", "Rule 7(3), character width"),
    )
    if (early := _phase3_gate(t, ctx)) is not None:
        return early
    if not ctx.measured_widths_mm:
        t.verdict, t.reason = "not_assessed", (
            "Character widths could not be measured on the rectified panel."
        )
        return t

    offenders = []
    for label, width in ctx.measured_widths_mm.items():
        if label and all(c in NARROW_GLYPHS for c in label.strip()):
            continue                       # exempt glyphs
        height = ctx.measured_heights_mm.get(label)
        if height and width < height * WIDTH_RATIO:
            offenders.append(f'"{label}" {width:.2f} mm wide against {height:.2f} mm high')

    if offenders:
        t.verdict, t.limb = "fail", "36(1)"
        t.observed = "; ".join(offenders) + "."
        t.required = (
            "Character width must be at least one-third of character height, "
            "excluding the glyphs 1, i, I and l."
        )
        return t
    t.observed = "All measured characters meet the one-third width ratio."
    return t


@check("CHK09")
def chk09_clear_space(ctx: CheckContext) -> FindingResult:
    """Rule 8. Ledger L-09 — the multipliers are UNVERIFIED."""
    t = FindingResult(
        "CHK09", "Clear space around the net-quantity declaration", "pass", "minor",
        citation=cite("R8", "Rule 8, clear space around the net-quantity declaration"),
        ledger_ref="L-09",
    )
    if (early := _phase3_gate(t, ctx)) is not None:
        return early
    height = ctx.measured_heights_mm.get("net_quantity")
    if height is None or not ctx.clear_space_mm:
        t.verdict, t.reason = "not_assessed", (
            "The net-quantity declaration and the space around it could not both "
            "be measured, so Rule 8 cannot be applied."
        )
        return t

    need = {
        "above": height * 1.0, "below": height * 1.0,
        "left": height * 2.0, "right": height * 2.0,
    }
    u = (ctx.mm_per_pixel_uncertainty or 0.0) * 2
    short = []
    inconclusive = []
    for side, required in need.items():
        got = ctx.clear_space_mm.get(side)
        if got is None:
            inconclusive.append(side)
            continue
        v, _ = compare_with_uncertainty(got, required, u)
        if v == "fail":
            short.append(f"{side} {got:.1f} mm against {required:.1f} mm required")
        elif v == "not_assessed":
            inconclusive.append(side)

    if short:
        t.verdict, t.limb = "fail", "36(2)"
        t.observed = "; ".join(short) + "."
        t.required = (
            "One character height clear above and below, two character heights "
            "left and right (multipliers per ledger L-09, unverified)."
        )
        return t
    if inconclusive:
        t.verdict, t.reason = "not_assessed", (
            "Clear space on the "
            + ", ".join(inconclusive)
            + " side(s) could not be determined within measurement uncertainty."
        )
        return t
    t.observed = "Clear space on all four sides meets the Rule 8 multipliers."
    return t


@check("CHK08")
def chk08_contrast(ctx: CheckContext) -> FindingResult:
    """Rule 9 says the declarations must contrast conspicuously and sets no
    number. Ledger L-10 records the assumption that no numeric threshold
    exists. The engine therefore reports the measured ratio and returns an
    INDICATIVE observation — it never invents a statutory threshold.
    """
    t = FindingResult(
        "CHK08", "Declarations contrast conspicuously with the background",
        "pass", "minor",
        citation=cite("R9", "Rule 9, conspicuous contrast"),
        ledger_ref="L-10",
    )
    if ctx.halted:
        return _halted(t, ctx)
    if ctx.phase3_halted:
        t.verdict, t.reason = "not_assessed", (
            "Not assessed: medical device, labelled under the Medical Devices "
            "Rules 2017."
        )
        return t
    if not ctx.image_usable:
        t.verdict, t.reason = "not_assessed", ctx.image_quality_reason
        return t
    if ctx.contrast_ratio is None:
        t.verdict, t.reason = "not_assessed", (
            "Text and background luminance could not be separated on this "
            "capture, so contrast cannot be reported."
        )
        return t

    t.observed = (
        f"Measured luminance contrast ratio {ctx.contrast_ratio:.1f}:1 between "
        f"the declarations and their background."
    )
    t.required = (
        "Rule 9 requires conspicuous contrast and prescribes no numeric ratio "
        "(ledger L-10). The measured value is reported for the inspector's "
        "judgement; the engine does not convert it into a statutory threshold."
    )
    if ctx.contrast_ratio < 3.0:
        t.verdict, t.reason = "not_assessed", (
            f"Measured contrast {ctx.contrast_ratio:.1f}:1 is low enough to "
            f"warrant a human view, but Rule 9 sets no numeric threshold, so "
            f"the engine will not record a breach. Inspector to determine "
            f"whether the declarations contrast conspicuously."
        )
    return t
```

#### Phase 2, continued — the two web-listing checks.

```python
@check("CHK15")
def chk15_ecommerce_listing(ctx: CheckContext) -> FindingResult:
    """Rule 6(10): an e-commerce listing must display every Rule 6(1)
    declaration except the month and year of manufacture.

    C5 — a package scan from the mobile app cannot evaluate this, because
    there is no listing to look at. That is not_assessed with a reason, not a
    silent omission and not a pass.
    """
    t = FindingResult(
        "CHK15", "E-commerce listing displays the required declarations",
        "pass", "major",
        citation=cite("R6-10", "Rule 6(10), declarations on e-commerce listings"),
    )
    if ctx.halted:
        return _halted(t, ctx)
    if not ctx.listing_available:
        t.verdict, t.reason = "not_assessed", (
            "No e-commerce listing was captured for this package. Rule 6(10) "
            "governs the online listing rather than the physical panel, so it "
            "cannot be assessed from a package scan. Capture the listing in the "
            "portal to assess it."
        )
        return t

    required_keys = [k for k, _l, _p, _lm in RULE_6_DECLARATIONS if k != "date_of_manufacture"]
    missing = [k for k in required_keys if not ctx.listing_fields.get(k)]
    if missing:
        t.verdict, t.limb = "fail", "36(1)"
        t.observed = "Listing omits: " + ", ".join(missing) + "."
        t.required = (
            "An online listing must show every Rule 6(1) declaration except the "
            "month and year of manufacture."
        )
        return t
    t.observed = "Listing shows all declarations required by Rule 6(10)."
    return t


@check("CHK16")
def chk16_platform_origin_filter(ctx: CheckContext) -> FindingResult:
    """Rule 6(10A), inserted by GSR 128(E) dated 13.02.2026, in force from
    01.07.2026: the platform must offer a searchable country-of-origin filter.

    Commencement matters. Before 01.07.2026 there is no obligation to breach,
    so the engine reports that rather than back-dating the requirement.
    Ledger L-13 — the notification and its commencement are UNVERIFIED.
    """
    t = FindingResult(
        "CHK16", "Platform offers a searchable country-of-origin filter",
        "pass", "major",
        citation=cite("R6-10A", "Rule 6(10A), country-of-origin search filter"),
        ledger_ref="L-13",
    )
    if ctx.halted:
        return _halted(t, ctx)

    commencement = date(2026, 7, 1)
    if ctx.rules_as_at < commencement:
        t.verdict, t.reason = "not_assessed", (
            f"Rule 6(10A) commences on {commencement:%d %B %Y} and the rule set "
            f"applied to this scan is as at {ctx.rules_as_at:%d %B %Y}, so no "
            f"obligation existed at the assessed date (ledger L-13)."
        )
        return t
    if ctx.platform_has_origin_filter is None:
        t.verdict, t.reason = "not_assessed", (
            "This is a platform-level obligation, not a package-level one. It "
            "cannot be assessed from a package scan; it requires an inspection "
            "of the marketplace's own search interface."
        )
        return t
    if not ctx.platform_has_origin_filter:
        t.verdict, t.limb = "fail", "36(1)"
        t.observed = "The platform provides no searchable country-of-origin filter."
        t.required = "The platform must allow consumers to filter by country of origin."
        return t
    t.observed = "A searchable country-of-origin filter is available on the platform."
    return t
```

#### Phase 4 — the tier determination.

```python
@check("CHK18")
def chk18_violation_tier(ctx: CheckContext) -> FindingResult:
    """Section 36 as amended by the Jan Vishwas Act 2026 (Act 8 of 2026),
    w.e.f 01.05.2026. Ledger L-12 — the tiers and amounts are UNVERIFIED.

    This row records WHICH LIMB is engaged and what the graduated response is.
    It never prints a rupee amount, because L-12 is unverified and a wrong
    penalty figure in an enforcement document is worse than no figure.

    The verdict is filled in by derive_result(), which is the only function
    that has seen all eighteen other findings.
    """
    return FindingResult(
        "CHK18", "Graduated response under Section 36 as amended", "not_assessed",
        "advisory",
        citation=cite("S36", "Section 36, Legal Metrology Act 2009, as amended by "
                             "the Jan Vishwas Act 2026"),
        ledger_ref="L-12",
        reason="Determined after all other checks — see derive_result().",
    )


def _halted(t: FindingResult, ctx: CheckContext) -> FindingResult:
    """Every check downstream of a halt still produces a row, saying why."""
    t.verdict = "not_assessed"
    t.reason = ctx.halt_reason
    return t
```

### 7.6 The runner and the four-state derivation

```python
ALL_CHECK_IDS = tuple(cid for cid, _ in CHECKS)
assert len(ALL_CHECK_IDS) == 19, f"expected 19 checks, registered {len(ALL_CHECK_IDS)}"
assert len(set(ALL_CHECK_IDS)) == 19, "duplicate check id registered"

# C5 — the two checks a package scan cannot reach.
LISTING_CHECKS = {"CHK15", "CHK16"}


def run_checks(ctx: CheckContext) -> list[FindingResult]:
    """Runs every registered check. Never skips one. Never raises out."""
    results: list[FindingResult] = []
    for check_id, fn in CHECKS:
        try:
            r = fn(ctx)
        except Exception as e:
            # A bug in one check must not delete the other eighteen findings,
            # and must not be reported as compliance.
            r = FindingResult(
                check_id, f"{check_id} (engine error)", "not_assessed", "major",
                reason=(
                    f"The check could not complete: {type(e).__name__}. This is "
                    f"an engine fault, not a finding about the package. The scan "
                    f"is in the review queue."
                ),
            )
        assert r.check_id == check_id, f"{check_id} returned a finding for {r.check_id}"
        assert r.verdict != "not_assessed" or r.reason, (
            f"{check_id} returned not_assessed without a reason"
        )
        results.append(r)

    assert len(results) == 19
    return results


@dataclass(slots=True)
class ScanVerdict:
    overall_result: str            # C3
    violation_limb: str | None
    recommended_action: str | None
    checks_total: int
    checks_assessed: int
    passed: int
    failed: int
    not_assessed: int


def derive_result(findings: list[FindingResult], ctx: CheckContext) -> ScanVerdict:
    """Four states, derived from nineteen three-state findings."""
    assessable = [f for f in findings if f.check_id != "CHK18"]
    passed = sum(1 for f in assessable if f.verdict == "pass")
    failed = sum(1 for f in assessable if f.verdict == "fail")
    na = sum(1 for f in assessable if f.verdict == "not_assessed")

    limbs = {f.limb for f in assessable if f.verdict == "fail" and f.limb}
    limb = (
        "both" if limbs == {"36(1)", "36(2)"}
        else (next(iter(limbs)) if limbs else None)
    )

    # out_of_scope outranks everything: there is no obligation to have breached.
    if ctx.halted == "CHK03":
        result, action = "out_of_scope", None
    elif ctx.halted == "CHK02":
        result, action = "out_of_scope", None
    elif failed:
        result = "violation"
        action = _graduated_action(assessable, limb)
    elif na and passed == 0:
        result, action = "not_assessed", "recapture_required"
    elif na:
        # Some checks passed and some could not be assessed. This is NOT a
        # clean result and must never be reported as one.
        result, action = "not_assessed", "human_review"
    else:
        result, action = "compliant", None

    # CHK18 is filled in here, where the whole picture is visible.
    tier = next(f for f in findings if f.check_id == "CHK18")
    if result == "violation":
        tier.verdict, tier.reason = "fail", None
        tier.observed = _tier_description(assessable, limb)
        tier.limb = limb
    elif result == "out_of_scope":
        tier.reason = ctx.halt_reason
    elif result == "compliant":
        tier.verdict, tier.reason = "pass", None
        tier.observed = "No breach identified, so no response under Section 36 arises."
    else:
        tier.reason = (
            f"{na} of {len(assessable)} checks could not be assessed, so the "
            f"graduated response under Section 36 cannot be settled on this "
            f"evidence."
        )

    return ScanVerdict(
        overall_result=result,
        violation_limb=limb,
        recommended_action=action,
        checks_total=len(assessable),          # 18 — CHK18 is the derived tier, not an assessed check (C5)
        checks_assessed=len(assessable) - na,  # e.g. 16 of 18 on a package scan with no web listing
        passed=passed,
        failed=failed,
        not_assessed=na,
    )


def _graduated_action(findings: list[FindingResult], limb: str | None) -> str:
    """Section 15 improvement notice versus prosecution under Section 36.

    v1.x had a determine_violation_tier() whose every branch returned
    'improvement_notice', so the tier was decorative.
    """
    critical = [f for f in findings if f.verdict == "fail" and f.severity == "critical"]
    major = [f for f in findings if f.verdict == "fail" and f.severity == "major"]

    if limb in {"36(2)", "both"}:
        # A false or short net quantity is the limb that goes to the consumer's
        # pocket. It is not an improvement-notice matter.
        return "prosecution_36_2"
    if critical:
        return "prosecution_36_1"
    if len(major) >= 3:
        return "prosecution_36_1"
    return "improvement_notice_s15"


def _tier_description(findings: list[FindingResult], limb: str | None) -> str:
    n = sum(1 for f in findings if f.verdict == "fail")
    limb_text = {
        "36(1)": "the declaration limb, section 36(1)",
        "36(2)": "the net-quantity limb, section 36(2)",
        "both": "both the declaration and net-quantity limbs of section 36",
    }.get(limb or "", "section 36")
    return (
        f"{n} breach(es) identified, engaging {limb_text}. Amounts under the "
        f"Jan Vishwas Act 2026 are ledger L-12 and unverified, so no figure is "
        f"stated; the adjudicating officer applies the schedule in force."
    )
```

### 7.7 The public entry point

```python
def assess(ctx: CheckContext) -> tuple[list[FindingResult], ScanVerdict, dict]:
    """Called by POST /scans/{id}/assess. Returns findings, verdict, provenance."""
    findings = run_checks(ctx)
    verdict = derive_result(findings, ctx)
    provenance = {
        "rules_as_at": ctx.rules_as_at.isoformat(),
        "catalog_hash": catalog_hash(),
        "engine_version": settings.ENGINE_VERSION,
    }
    return findings, verdict, provenance
```

---
## 8. API ENDPOINTS

### 8.1 main.py

```python
"""main.py — the app. Run from inside backend/ so flat imports resolve."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from routers import admin, auth, inspections, reports, scans


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the OCR model once so the first real scan is not the slow one.
    if settings.ENV != "test":
        from ocr_engine import get_paddle
        try:
            get_paddle()
        except Exception:
            pass          # absence is handled per-scan as not_assessed
    yield


app = FastAPI(
    title="NiyamNetra API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENV != "prod" else None,
    redoc_url=None,
)

# A regex. Starlette matches allow_origins by exact string equality, so an
# entry like "exp://*" or "http://192.168.*.*:5173" never matches anything —
# which is why v1.x's Expo client could not reach the API from a phone.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,               # required: the refresh cookie
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; object-src 'none'; "
        "base-uri 'none'; frame-ancestors 'none'"
    )
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
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
    return {
        "status": "ok",
        "engine_version": settings.ENGINE_VERSION,
        "rules_as_at": settings.RULES_AS_AT,
        "catalog_hash": catalog_hash(),
        "checks_registered": len(ALL_CHECK_IDS),
    }
```

### 8.2 Endpoint inventory

| Method | Path | Role | Guard | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | — | rate-limited | Sets refresh cookie, returns access token in body |
| POST | `/auth/refresh` | — | refresh cookie | Rotates the refresh token |
| POST | `/auth/logout` | any | — | Clears the cookie, bumps nothing |
| GET | `/auth/me` | any | token | |
| POST | `/auth/change-password` | any | token | Bumps `token_epoch`, kills live refresh tokens |
| GET | `/stores` | inspector | token | Cached 5 min, TTL |
| POST | `/inspections` | inspector | token | Records scope, GPS, geofence |
| GET | `/inspections` | inspector | own rows only | Admin sees all |
| GET | `/inspections/{inspection_id}` | inspector | `owned_inspection` | |
| POST | `/inspections/{inspection_id}/submit` | inspector | `owned_inspection` | Draft → submitted, audited |
| POST | `/inspections/{inspection_id}/scans` | inspector | `owned_inspection` | One scan per package |
| POST | `/scans/{scan_id}/images` | inspector | `owned_scan` | Multiple panels, one scan |
| PATCH | `/scans/{scan_id}` | inspector | `owned_scan` | Update declared scope flags (`commodity_generic`, `brand_name`, `commodity_category`, `batch_number`, `net_quantity_value/unit`, `is_imported`, `is_perishable`, `is_medical_device`, `is_tobacco`, `has_sticker` + sticker_*); frozen once submitted |
| POST | `/scans/{scan_id}/listing` | inspector | `owned_scan` | Attach e-commerce listing `{url}` for CHK15/CHK16 via SSRF-guarded fetch |
| POST | `/scans/{scan_id}/assess` | inspector | `owned_scan` | Runs all 19 checks |
| GET | `/scans/{scan_id}` | inspector | `owned_scan` | Findings + counts |
| GET | `/scans/{scan_id}/verify` | any | `owned_scan` | Rehashes stored files |
| GET | `/reports/today` | inspector | token | Four-state counts |
| GET | `/reports/today.pdf` | inspector | token | Daily PDF |
| GET | `/reports/today.docx` | inspector | token | Daily DOCX |
| GET | `/reports/inspections/{inspection_id}/pdf` | inspector | own rows (admin: all) | Per-inspection PDF |
| GET | `/reports/inspections/{inspection_id}/docx` | inspector | own rows (admin: all) | Per-inspection DOCX |
| GET | `/reports/calendar` | inspector | token | Which dates have data |
| GET | `/admin/dashboard` | admin | `require_admin` | |
| GET | `/admin/users` | admin | `require_admin` | |
| POST | `/admin/users` | admin | `require_admin` | |
| PATCH | `/admin/users/{user_id}` | admin | `require_admin` | Audited |
| POST | `/admin/users/{user_id}/reset-install` | admin | `require_admin` | Reason required, audited |
| GET | `/admin/review-queue` | admin | `require_admin` | Same count as the badge |
| PATCH | `/admin/findings/{finding_id}` | admin | `require_admin` | Override with reason; engine verdict untouched |
| GET | `/admin/audit` | admin | `require_admin` | Paginated, with chain head |
| GET | `/admin/rules` | admin | `require_admin` | Catalog + ledger status |

### 8.3 routers/auth.py

```python
"""routers/auth.py"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from audit import append_audit
from config import settings
from database import get_db
from jwt_handler import (
    ACCESS, REFRESH, TokenError, create_access_token, create_refresh_token, decode_token,
)
from models import User
from password_handler import hash_password, verify_password
from rbac import get_current_user
from schemas import LoginRequest, LoginResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(resp: Response, token: str) -> None:
    # SameSite=None is only honoured together with Secure, so the two flags move
    # as one. Cross-site in prod (portal and API on different sites), strict on
    # local http. See config.refresh_cookie_cross_site.
    cross_site = settings.refresh_cookie_cross_site
    resp.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.REFRESH_TOKEN_DAYS * 86400,
        httponly=True,                     # no JavaScript can read it
        secure=cross_site or settings.ENV == "prod",
        samesite="none" if cross_site else "strict",
        path="/auth",
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, response: Response,
          db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == body.employee_id).first()

    # Constant-ish work on both paths, and one message for both failures, so
    # the endpoint is not a username oracle.
    ok = user is not None and user.is_active and verify_password(
        body.password, user.password_hash
    )
    if not ok:
        append_audit(
            db, user_id=user.id if user else None, action="login_failed",
            new_value=body.employee_id, ip_address=_client_ip(request),
        )
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Invalid employee ID or password"
        )

    from routers.auth_helpers import bind_install       # see §3.4
    install_id = bind_install(db, user)

    access = create_access_token(user.id, user.role, install_id)
    refresh = create_refresh_token(user.id, install_id, user.token_epoch)
    _set_refresh_cookie(response, refresh)

    append_audit(db, user_id=user.id, action="login", ip_address=_client_ip(request),
                 user_agent=request.headers.get("user-agent", "")[:240])

    return LoginResponse(
        access_token=access,
        expires_in=settings.ACCESS_TOKEN_HOURS * 3600,
        user=UserOut.model_validate(user),
        install_id=install_id,
    )


@router.post("/refresh", response_model=LoginResponse)
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        claims = decode_token(raw, expect=REFRESH)
    except TokenError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=f"Refresh {e}")

    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    # A password change invalidates every refresh token issued before it.
    if claims.get("epoch") != user.token_epoch:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session superseded")
    if user.install_id and claims.get("install_id") != user.install_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Device not recognised")

    # Rotate. A refresh token is single-use.
    new_refresh = create_refresh_token(user.id, user.install_id, user.token_epoch)
    _set_refresh_cookie(response, new_refresh)
    return LoginResponse(
        access_token=create_access_token(user.id, user.role, user.install_id),
        expires_in=settings.ACCESS_TOKEN_HOURS * 3600,
        user=UserOut.model_validate(user),
        install_id=user.install_id or "",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/auth")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


def _client_ip(request: Request) -> str | None:
    # Only trust the forwarded header when a reverse proxy is configured; an
    # unproxied deployment lets any client set it.
    if settings.ENV == "prod":
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()[:45]
    return request.client.host if request.client else None
```

### 8.4 routers/scans.py — the assessment path

```python
"""routers/scans.py"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from audit import append_audit
from config import settings
from database import get_db
from models import Finding, Inspection, Scan, ScanImage, User
from rbac import get_current_user, owned_scan
from schemas import ScanOut, VerdictCounts

router = APIRouter(prefix="/scans", tags=["scans"])

MAX_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024


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
```

### 8.5 build_context

```python
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
        panel_shape=scan.panel_shape,
        panel_height_mm=scan.panel_height_mm,
        panel_width_mm=scan.panel_width_mm,
        panel_diameter_mm=scan.panel_diameter_mm,
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
```

### 8.6 routers/admin.py — the override path

```python
@router.patch("/findings/{finding_id}")
def override_finding(
    finding_id: int,
    body: OverrideFindingRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """A human may disagree with the engine. The disagreement is recorded
    alongside the engine's verdict, never in place of it. C11.

    engine_verdict is protected by a database trigger as well (§10.3), so a
    stray UPDATE from a script cannot do what this endpoint refuses to do.
    """
    f = db.get(Finding, finding_id)
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Finding not found")

    old = f.human_verdict or f.engine_verdict
    f.human_verdict = body.human_verdict
    f.override_reason = body.override_reason
    f.overridden_by = user.id
    f.overridden_at = datetime.now(timezone.utc)
    db.commit()

    scan = db.get(Scan, f.scan_id)
    append_audit(
        db, inspection_id=scan.inspection_id, scan_id=scan.id, user_id=user.id,
        action="finding_overridden",
        old_value=f"{f.check_id}={old}",
        new_value=f"{f.check_id}={body.human_verdict}",
        reason=body.override_reason,
    )
    return {"finding_id": f.id, "engine_verdict": f.engine_verdict,
            "human_verdict": f.human_verdict}
```

---

## 9. REPORT GENERATION

### 9.1 Four outcomes, four colours

```python
"""report_generator.py"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from config import settings

# Four outcomes need four colours. v1.x had two, so not_assessed and
# out_of_scope both printed in violation red — telling an inspector that a
# package the engine could not read, and a package outside the Rules
# altogether, were both breaches.
RESULT_STYLE = {
    "compliant":     (colors.HexColor("#1B5E20"), "Compliant"),
    "violation":     (colors.HexColor("#B71C1C"), "Violation"),
    "not_assessed":  (colors.HexColor("#E65100"), "Not assessed"),
    "out_of_scope":  (colors.HexColor("#37474F"), "Outside these Rules"),
}
VERDICT_STYLE = {
    "pass":         (colors.HexColor("#1B5E20"), "Pass"),
    "fail":         (colors.HexColor("#B71C1C"), "Fail"),
    "not_assessed": (colors.HexColor("#E65100"), "Not assessed"),
}
```

Every colour pair above is checked against the contrast tokens in `08_UI_DESIGN.md` §2.1 by the unit test in `10_TESTING.md`, and every report is also required to remain readable in greyscale — which is why the label text is printed next to the colour rather than relied on alone. A colour-only encoding is unusable on a photocopied enforcement document.

### 9.2 The findings table

```python
def build_findings_table(findings: list) -> Table:
    """Nineteen rows. Always nineteen. With the denominator stated."""
    styles = getSampleStyleSheet()
    cell = ParagraphStyle("cell", parent=styles["BodyText"], fontSize=8, leading=10)

    data = [["#", "Check", "Verdict", "Observed / Reason", "Requirement"]]
    row_colours = []
    for i, f in enumerate(findings, start=1):
        verdict = f.human_verdict or f.engine_verdict
        colour, label = VERDICT_STYLE[verdict]
        row_colours.append((i, colour))
        detail = f.observed or f.reason or ""
        if f.human_verdict:
            detail += (
                f"<br/><i>Overridden by inspector: {f.override_reason}. "
                f"Engine verdict was {f.engine_verdict}.</i>"
            )
        data.append([
            f.check_id,
            Paragraph(f.title, cell),
            label,
            Paragraph(detail, cell),
            Paragraph((f.required or "") + _ledger_note(f), cell),
        ])

    t = Table(data, colWidths=[16 * mm, 42 * mm, 20 * mm, 55 * mm, 45 * mm],
              repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECEFF1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B0BEC5")),
    ]
    for row, colour in row_colours:
        style.append(("TEXTCOLOR", (2, row), (2, row), colour))
        style.append(("FONTNAME", (2, row), (2, row), "Helvetica-Bold"))
    t.setStyle(TableStyle(style))
    return t


def _ledger_note(f) -> str:
    if not f.ledger_ref:
        return ""
    return (
        f'<br/><font size="7" color="#546E7A">Legal basis for this threshold is '
        f'ledger {f.ledger_ref}, not yet verified against the gazette.</font>'
    )
```

### 9.3 The summary block and the disclaimer

```python
DISCLAIMER = (
    "This document is machine-generated from photographic evidence and from "
    "measurements recorded by the inspecting officer. It records observations "
    "under the Legal Metrology (Packaged Commodities) Rules 2011 as amended, "
    "the rule set applied being that in force on {rules_as_at}. Penalties "
    "under section 36 of the Legal Metrology Act 2009 stand as amended by the "
    "Jan Vishwas (Amendment of Provisions) Act 2026, in force from 1 May 2026; "
    "no monetary figure is stated here because the schedule has not been "
    "verified against the gazette (ledger L-12). "
    "Findings recorded as “not assessed” are not findings of "
    "compliance and must not be read as such. This document does not address "
    "requirements under the Food Safety and Standards Act 2006 or, where the "
    "package is a medical device, under the Medical Devices Rules 2017, both of "
    "which are administered by other authorities and are referred to them "
    "separately. It is not a determination of liability; that is for the "
    "adjudicating officer."
)
```

Version 1.x's disclaimer said "Penalty per LM Act as on 7 May 2026", which contradicts the 1 May 2026 commencement recorded everywhere else in the project, and said the report covered "not FSSAI / MDR 2017" while CHK17 and CHK14 both produce rows about exactly those two regimes. The wording above is consistent with both.

### 9.4 The QR code

```python
def verification_qr(inspection_id: int, chain_head: str) -> Path:
    """A resolvable https URL, and the audit chain head at time of generation.

    v1.x encoded "niyamnetra://verify/{id}" — a private URI scheme that no
    phone camera resolves and no browser opens, so the QR code did nothing.
    """
    import qrcode
    url = (
        f"{settings.PUBLIC_BASE_URL.rstrip('/')}"
        f"/verify?inspection={inspection_id}&head={chain_head[:16]}"
    )
    img = qrcode.make(url)
    out = settings.OUT_DIR / f"qr_{inspection_id}.png"
    img.save(out)
    return out
```

### 9.5 generate_docx

```python
def generate_docx(inspection, scans, findings_by_scan, out_path: Path) -> Path:
    """The Word equivalent. Same content, same four outcomes, same disclaimer.

    v1.x imported and called generate_docx from routers/reports.py and never
    defined it anywhere — section 7 of that file stopped at 7.1. Every request
    for a Word report raised ImportError.
    """
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    doc = Document()
    doc.core_properties.title = f"NiyamNetra inspection {inspection.id}"

    h = doc.add_heading("Inspection Report", level=0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER

    meta = doc.add_table(rows=0, cols=2)
    meta.style = "Light Grid Accent 1"
    for label, value in (
        ("Inspection", str(inspection.id)),
        ("Date", inspection.inspection_date.strftime("%d %B %Y")),
        ("Store", inspection.store.name),
        ("Inspector", inspection.inspector.full_name),
        ("Rules as at", inspection.scans[0].rules_as_at.strftime("%d %B %Y")
         if inspection.scans else "-"),
        ("Engine version", inspection.scans[0].engine_version
         if inspection.scans else "-"),
    ):
        row = meta.add_row().cells
        row[0].text, row[1].text = label, value

    for scan in scans:
        doc.add_heading(
            f"{scan.commodity_generic or 'Unidentified package'}"
            f"{f' — {scan.brand_name}' if scan.brand_name else ''}",
            level=1,
        )
        _colour, label = RESULT_STYLE[scan.overall_result]
        p = doc.add_paragraph()
        run = p.add_run(f"Result: {label}")
        run.bold = True
        run.font.color.rgb = RGBColor.from_string(
            {"compliant": "1B5E20", "violation": "B71C1C",
             "not_assessed": "E65100", "out_of_scope": "37474F"}[scan.overall_result]
        )
        rows = findings_by_scan[scan.id]
        # Denominator excludes CHK18 (the derived Section-36 tier); C5 — a package
        # scan reports "16 of 18", not "17 of 19". The table below still lists all rows.
        assessable_rows = [f for f in rows if f.check_id != "CHK18"]
        na = sum(1 for f in assessable_rows
                 if (f.human_verdict or f.engine_verdict) == "not_assessed")
        doc.add_paragraph(
            f"{len(assessable_rows) - na} of {len(assessable_rows)} checks assessed"
            + (f"; {na} could not be assessed on this evidence." if na else ".")
        )

        table = doc.add_table(rows=1, cols=4)
        table.style = "Light Grid Accent 1"
        for i, head in enumerate(("Check", "Verdict", "Observed / Reason", "Requirement")):
            table.rows[0].cells[i].text = head
        for f in rows:
            c = table.add_row().cells
            c[0].text = f"{f.check_id} {f.title}"
            c[1].text = VERDICT_STYLE[f.human_verdict or f.engine_verdict][1]
            c[2].text = f.observed or f.reason or ""
            c[3].text = f.required or ""

    doc.add_page_break()
    doc.add_heading("Notes and limitations", level=1)
    d = doc.add_paragraph(DISCLAIMER.format(
        rules_as_at=(inspection.scans[0].rules_as_at.strftime("%d %B %Y")
                     if inspection.scans else "the applicable date")
    ))
    d.runs[0].font.size = Pt(8)

    doc.save(out_path)
    return out_path
```

---

## 10. SECURITY & EVIDENCE INTEGRITY

`09_SECURITY.md` is the authority. This section gives only the backend code that implements it.

### 10.1 audit.py — the chain

```python
"""audit.py — append-only log with a hash chain over the payload."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import AuditLog

# Hashed in place of an absent predecessor on the genesis row. The COLUMN stays
# NULL; only the digest input is substituted. 06 §3.7.
GENESIS_PREV = "0"


def chain_hash(entry: AuditLog, hash_prev: str | None) -> str:
    """Canonical serialisation, then SHA-256.

    Two fields that v1.x left OUT of the hash: user_id and new_value. Leaving
    user_id unhashed lets an attacker reassign an action to another officer
    without breaking the chain. Leaving new_value unhashed lets them change
    what the action did. Between them they cover almost every tampering motive
    the chain exists to defeat.

    sort_keys and the compact separators are mandatory: without them a change
    in dictionary ordering or in whitespace produces a different digest, and
    every verification fails for a reason that looks exactly like tampering.

    On the genesis row the stored hash_prev column is NULL and the hashed value
    is the string "0". The stored value and the digest input differ in exactly
    this one place, so both sides must use the same substitution — hence the
    `or GENESIS_PREV` here and the identical expression in verify_chain().
    06 §3.7 and 09 §5.3 state the same rule.
    """
    payload = json.dumps(
        {
            "seq": entry.seq,
            "inspection_id": entry.inspection_id,
            "scan_id": entry.scan_id,
            "user_id": entry.user_id,
            "action": entry.action,
            "old_value": entry.old_value,
            "new_value": entry.new_value,
            "reason": entry.reason,
            "timestamp": entry.timestamp.isoformat(timespec="microseconds"),
            "hash_prev": hash_prev or GENESIS_PREV,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def append_audit(
    db: Session, *, action: str,
    inspection_id: int | None = None, scan_id: int | None = None,
    user_id: int | None = None, old_value: str | None = None,
    new_value: str | None = None, reason: str | None = None,
    ip_address: str | None = None, user_agent: str | None = None,
) -> AuditLog:
    last = db.query(AuditLog).order_by(AuditLog.seq.desc()).first()
    entry = AuditLog(
        seq=(last.seq + 1) if last else 1,
        inspection_id=inspection_id, scan_id=scan_id, user_id=user_id,
        action=action, old_value=old_value, new_value=new_value, reason=reason,
        ip_address=ip_address, user_agent=user_agent,
        timestamp=datetime.now(timezone.utc),
        hash_prev=last.hash_self if last else None,
    )
    entry.hash_self = chain_hash(entry, entry.hash_prev)
    db.add(entry)
    db.commit()
    return entry


def verify_chain(db: Session, start_seq: int = 1) -> dict:
    prev = None
    if start_seq > 1:
        anchor = db.query(AuditLog).filter(AuditLog.seq == start_seq - 1).first()
        prev = anchor.hash_self if anchor else None

    expected_seq = start_seq
    for e in db.query(AuditLog).filter(AuditLog.seq >= start_seq).order_by(AuditLog.seq):
        if e.seq != expected_seq:
            return {"intact": False, "failed_at": expected_seq,
                    "why": f"sequence gap: expected {expected_seq}, found {e.seq}"}
        if e.hash_prev != prev:
            return {"intact": False, "failed_at": e.seq, "why": "broken link"}
        if chain_hash(e, prev) != e.hash_self:
            return {"intact": False, "failed_at": e.seq, "why": "payload altered"}
        prev, expected_seq = e.hash_self, e.seq + 1

    return {"intact": True, "entries": expected_seq - start_seq, "head": prev}
```

### 10.2 Publishing the head

A hash chain in a database an attacker can write to protects nothing on its own: they rewrite every entry from the tampered point forward and the chain verifies perfectly. The defence is publishing the head where it cannot be silently revised.

```python
def publish_daily_head(db: Session) -> dict:
    """Append today's chain head to an append-only file, and print it on every
    report generated that day. A wholesale rewrite then contradicts a value
    that has already left the building."""
    from config import settings
    from datetime import date

    state = verify_chain(db)
    line = f"{date.today().isoformat()} {state.get('head') or 'EMPTY'}\n"
    (settings.OUT_DIR / "chain_heads.log").open("a", encoding="utf-8").write(line)
    return state
```

### 10.3 Immutability triggers

`Base.metadata.create_all` cannot emit these, which is why §1.4 requires Alembic.

```sql
-- SQLite: in an Alembic migration
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE TRIGGER findings_engine_verdict_immutable BEFORE UPDATE ON findings
WHEN OLD.engine_verdict IS NOT NEW.engine_verdict
BEGIN SELECT RAISE(ABORT, 'engine_verdict is written once'); END;
```

```sql
-- PostgreSQL: same intent, different mechanism
CREATE OR REPLACE FUNCTION deny_write() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION deny_write();

CREATE OR REPLACE FUNCTION deny_engine_verdict_change() RETURNS trigger AS $$
BEGIN
  IF NEW.engine_verdict IS DISTINCT FROM OLD.engine_verdict THEN
    RAISE EXCEPTION 'engine_verdict is written once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER findings_engine_verdict_immutable BEFORE UPDATE ON findings
FOR EACH ROW EXECUTE FUNCTION deny_engine_verdict_change();
```

### 10.4 citations.py — the ledger guard

```python
"""citations.py — never print a provision the project has not verified."""

# Every entry in 02 §15 that is not yet checked against the gazette.
UNVERIFIED = {
    "R12-13": "L-01", "R2m": "L-02", "R1sched": "L-03", "R7-nq": "L-04",
    "R5": "L-05", "R4sched": "L-06", "R7-card": "L-07", "R7-4-area": "L-08",
    "R8": "L-09", "R9": "L-10", "R7-2": "L-11", "S36": "L-12",
    "R6-10A": "L-13", "R5sched": "L-14", "R26a": "L-15",
}


def cite(key: str, descriptive: str) -> str:
    """Returns a pinpoint citation only where the provision is verified.

    Where it is not, returns the descriptive requirement plus the ledger
    reference. An inspector can act on 'the prohibited-qualifier provision in
    Rules 12-13'; nobody can defend 'Rule 12(6)' if the project has not read
    Rule 12(6).
    """
    ledger = UNVERIFIED.get(key)
    if ledger:
        return f"{descriptive} [{ledger} — unverified]"
    return descriptive
```

### 10.5 Outbound fetch, for the listing checks

```python
"""In listing_fetcher.py. Only CHK15 and CHK16 fetch anything."""
import ipaddress
import socket
from urllib.parse import urlparse

import httpx

ALLOWED_SCHEMES = {"https"}
BLOCKED_NETS = [
    ipaddress.ip_network(n) for n in (
        "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
        "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16",
        "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4",
        "::1/128", "fc00::/7", "fe80::/10",
    )
]


def resolve_and_validate(url: str) -> tuple[str, str]:
    """Resolve the hostname, reject private answers, and return the literal IP
    to connect to — so a DNS record that changes between the check and the
    connection cannot redirect the request inside the network."""
    parts = urlparse(url)
    if parts.scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"Only https is permitted; got {parts.scheme!r}")
    if not parts.hostname:
        raise ValueError("No hostname in URL")

    infos = socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)
    ip = ipaddress.ip_address(infos[0][4][0])
    if any(ip in net for net in BLOCKED_NETS) or not ip.is_global:
        raise ValueError(f"Refusing to fetch {parts.hostname}: resolves to {ip}")
    return str(ip), parts.hostname


def fetch_listing(url: str, timeout: float = 10.0) -> str:
    ip, host = resolve_and_validate(url)
    target = url.replace(f"//{host}", f"//{ip}", 1)
    with httpx.Client(
        follow_redirects=False,            # a 302 to 169.254.169.254 is the attack
        timeout=timeout,
        headers={"Host": host, "User-Agent": "NiyamNetra/2.0"},
        verify=True,
    ) as c:
        r = c.get(target, extensions={"sni_hostname": host})
        r.raise_for_status()
        return r.text[:2_000_000]
```

---

## 11. OVERFLOW HANDLING

Every degraded input, and what is recorded instead of a verdict. `11_working_overflow.md` is the authority; this table is the backend's obligations from it.

| Condition | Detected by | What is recorded | HTTP |
|---|---|---|---|
| Blurred or glared image | `assess_quality` | Image stored and flagged; nine text checks `not_assessed` with the quality reason | 201 |
| No front panel captured | `build_context` | All panel checks `not_assessed`; scan `not_assessed` | 200 |
| OCR unavailable (no model, OOM) | `run_ocr` → Tesseract → `engine="none"` | Nine text checks `not_assessed` with the engine reason | 200 |
| Panel under 400 px | `compute_scale` | Five millimetre checks `not_assessed`; scale reason recorded | 200 |
| No panel dimensions recorded | `pdp_area_cm2` | CHK06, CHK06b, CHK07, CHK09 `not_assessed` | 200 |
| Measurement inside uncertainty band | `compare_with_uncertainty` | `not_assessed` with both figures printed | 200 |
| GPS unavailable | client → `gps_accuracy_m` null | `geofence_status='unknown'` plus reason; inspection still valid | 201 |
| GPS accuracy worse than the geofence radius | `geofence` service | `geofence_status='unknown'`, distance and accuracy both recorded | 201 |
| Mock location flagged | client | `mock_location=True`; review item | 201 |
| Device clock skew over 5 minutes | `local_created_at` vs server time | `clock_skew_seconds` recorded; server time is authoritative | 201 |
| Offline record arriving twice | `resolve_duplicate` | Second row kept with `duplicate_of` set; excluded from every aggregate | 201 |
| Record edited while offline | client | `edited_offline=True`; enters the review queue | 200 |
| Near-duplicate image | banded pHash | Review item only — never a verdict, never a rejection | 201 |
| Upload over 25 MB | `upload_image` | Rejected; nothing stored | 413 |
| Pixel count over 80 million | `Image.MAX_IMAGE_PIXELS` | Rejected before decode | 422 |
| Undecodable file | `cv2.imdecode` returns None | Rejected | 422 |
| Second Schedule not transcribed | CHK10 | `not_assessed`, ledger L-05 | 200 |
| Net-quantity height table not transcribed | CHK06b | `not_assessed`, ledger L-04 | 200 |
| Rule 6(10A) not yet commenced | CHK16 | `not_assessed` with the commencement date | 200 |
| Package is a medical device | CHK14 | Phase 3 `not_assessed`; routed to the drug authority | 200 |
| Package out of Chapter II scope | CHK03 | Scan `out_of_scope`; all remaining checks `not_assessed` with the halt reason | 200 |
| Exempt small package | CHK02 | Scan `out_of_scope`; halt reason on every downstream row | 200 |
| A check raises an exception | `run_checks` | That one check `not_assessed` as an engine fault; the other eighteen stand | 200 |
| Refresh token replayed after password change | `token_epoch` mismatch | Rejected; audited | 401 |
| Token presented from another install | `install_id` mismatch | Rejected; audited | 401 |

The pattern throughout: **degradation produces a recorded `not_assessed`, not an error and not a pass.** The only 4xx responses are for inputs the system cannot store at all.

---

## 12. LOOPHOLE COVERAGE MAP

`12_SIH26034_NiyamNetra_loopholes.md` is the authority. This maps each family of entries to the module that answers it, so a reviewer can check the claim rather than take it.

| Loophole family | Answered by | Mechanism |
|---|---|---|
| Verdict laundering — an unassessable package reported as clean | §2.1, §7.6 | Four-state result with a `CHECK` constraint; `derive_result` cannot return `compliant` while any check is `not_assessed` |
| Silent check omission | §7.5, §7.6 | `run_checks` iterates a registry; `len(results) == 19` asserted; every gate has an explicit `else` |
| Unjustified `not_assessed` | §2.1, §7.6 | `ck_finding_reason_required` in the database plus an assertion in the runner |
| Evidence substitution after the fact | §5.1, §8.4 | Hash over stored bytes; `/scans/{id}/verify` rehashes on demand |
| Audit rewriting | §10.1, §10.2, §10.3 | Ten-field chain, published daily head, append-only triggers on both engines |
| Engine verdict laundering by a human | §2.1, §8.6, §10.3 | `engine_verdict` immutable; overrides are additive and require a reason |
| Measurement without scale | §5.3, §7.4 | `mm_per_pixel` mandatory; `scale_source='none'` blocks all five millimetre checks |
| Borderline measurement asserted as breach | §7.4 | `compare_with_uncertainty` returns `not_assessed` inside the error band |
| Statutory figures asserted without a source | §10.4 | `cite()` prints the descriptive requirement plus the ledger reference |
| Penalty amounts invented | §9.3, CHK18 | No rupee figure is printed anywhere; L-12 unverified |
| Scope creep into other regimes | CHK14, CHK17, §9.3 | Medical devices routed out; FSSAI advisory-only and severity-constrained |
| Retro-application of a rule | CHK16, §2.1 | `rules_as_at` on every scan; commencement checked before the obligation |
| Duplicate field work inflating statistics | §2.2, §2.3 | `duplicate_of` set rather than the row rejected; every aggregate filters it |
| Near-duplicate images treated as fraud | §5.4 | Review item only, with the legitimate-cause reasoning recorded |
| Cross-user data access | §3.3 | Ownership resolved from the row the path names, in the database; 404 not 403 |
| Session outliving its device | §3.2, §3.4, §8.3 | `install_id` in the token, verified per request; `token_epoch` on password change |
| Token theft from browser storage | §8.3 | Access token in memory only; refresh in an httpOnly cookie (Strict locally, None+Secure in prod cross-site) |
| SSRF via a listing URL | §10.5 | https only, resolve-then-connect-to-literal-IP, no redirects, private nets blocked |
| Decompression bomb | §1.3, §5.1 | 80-megapixel ceiling before decode |
| Dashboard and page disagreeing | §2.3 | `review_queue_size()` is the single definition used by both |
| Colour-only reporting | §9.1 | Four labelled outcomes; greyscale-legible; contrast tested |

### 12.1 What this backend does not attempt

Stated plainly, because a coverage map that claims everything is worthless.

Net quantity itself is not verified. Determining whether a package actually contains what it declares requires calibrated weighing under the First Schedule, and no photograph can substitute for it. CHK05 checks how the quantity is *expressed*; the tolerance bands in `02` §12.1 are ledger L-03 and are applied by a human with a balance.

Image forensics is not attempted. `09` §5.2 prohibits error-level analysis as a fraud indicator because its false-positive rate on ordinary phone JPEGs makes it worse than nothing in an evidentiary setting, and prohibits generative super-resolution outright: an upscaler invents plausible glyphs, and a report resting on invented text is not evidence of anything.

Contrast is measured but not adjudicated. Rule 9 sets no numeric threshold (ledger L-10), so the engine reports the ratio and leaves the statutory judgement where the Rules put it.

---

## 13. TESTING HOOKS

What the backend must expose so `10_TESTING.md` can assert on it without reaching into private state.

```python
# rules_engine.py
ALL_CHECK_IDS: tuple[str, ...]          # exactly 19, order-significant
CHECKS: list[tuple[str, Callable]]      # the registry itself
TABLE_I: tuple                           # so the ledger test can read the values
def run_checks(ctx) -> list[FindingResult]: ...        # pure; no database, no I/O
def derive_result(findings, ctx) -> ScanVerdict: ...   # pure
def min_height_mm(area_cm2, blown) -> float: ...       # pure
def pdp_area_cm2(ctx) -> tuple[float | None, str | None]: ...
def compare_with_uncertainty(m, minimum, u) -> tuple[Verdict, str]: ...

# audit.py
def chain_hash(entry, hash_prev) -> str: ...
def verify_chain(db, start_seq=1) -> dict: ...

# image_processor.py
def store_upload(raw, mime, inspection_id, scan_id) -> StoredImage: ...
def verify_stored_image(path, expected_sha256) -> bool: ...
def phash_bands(path) -> tuple[str, tuple[int, ...]]: ...   # PHASH_BANDS = 8
def split_bands(hexstr) -> tuple[int, ...]: ...
def hamming(a, b) -> int: ...

# citations.py
UNVERIFIED: dict[str, str]
def cite(key, descriptive) -> str: ...
```

`run_checks` and `derive_result` take a `CheckContext` and touch nothing else. That is deliberate: the entire rules engine is testable from a hand-built dataclass, with no database, no image, and no OCR model, which is what makes the degraded-data fixtures in `10_TESTING.md` cheap enough to run on every commit.

Twelve assertions the backend is built to satisfy, restated here as the contract:

Every scan yields nineteen findings. Every `not_assessed` carries a reason. No `fail` is `advisory`. `engine_verdict` is never updated. A `compliant` scan has zero `not_assessed`. A stored image rehashes to its recorded digest. A mutated `user_id` breaks the chain. A mutated `new_value` breaks the chain. A `seq` gap breaks the chain. `169.254.169.254` is refused. No token appears in `localStorage`. Both SQLite and PostgreSQL reject `overall_result='Good'`.

---

## 14. RUN CONFIGURATION

### 14.1 First run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32))" >> .env
# then fill in the rest of .env from ../Docs/14_env_example.md
```

### 14.2 Migrations, not create_all

```bash
alembic upgrade head        # creates tables, CHECK constraints, and triggers
python seed.py              # first users, stores, and the out-of-scope fixture
```

### 14.3 Serving

```bash
# Dev and demo, reachable from a phone on the same LAN. One worker.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Prod — multiple workers ONLY on PostgreSQL
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

`--workers 4` requires PostgreSQL. WAL lets SQLite readers proceed during a write; it does not let two writers proceed, so four processes writing scans, findings and audit rows to one file serialise on the write lock and begin returning `database is locked` under exactly the concurrency the workers were added for. Two further consequences of multiple workers are documented in `11` §2.7: in-memory rate limits and caches exist once per worker, so the effective limit is `4 ×` the configured one; and `seq` allocation for the audit chain must happen inside the inserting transaction, because two workers that both compute `MAX(seq)+1` will otherwise fork the chain on a naive retry.

`--host 0.0.0.0` is required for the Expo client: the default `127.0.0.1` binds to loopback only, so the phone cannot reach the API and the app fails with a network error that looks like a client bug. Run from inside `backend/` so `main:app` and the flat imports resolve.

Ports: this service on **8000**, the Vite portal on **5173**, the Expo dev server on **8081**. Not 19000 — that was the Expo classic port and SDK 54 does not use it.

### 14.4 Verification after a build

```bash
curl -s localhost:8000/health | python -m json.tool
# checks_registered must read 19. Anything else means a check failed to register,
# and the engine will silently produce short reports.

pytest -q
python -c "
from database import SessionLocal
from audit import verify_chain
print(verify_chain(SessionLocal()))
"
```

---

## 15. CORRECTIONS LOG — what version 1.x got wrong

| # | Where | Defect | Now |
|---|---|---|---|
| 1 | TOC vs body | Sections printed 1, 2, 3, 6, 4, 5, 7 against a TOC promising twelve | Fifteen sections, in order |
| 2 | §§8–12 | Security, overflow, loophole mapping, testing and deployment did not exist, while line 15 claimed "all 90 loophole solutions are mapped" | Written, §10–§14 |
| 3 | Layout vs imports | Tree showed `auth/`, `routers/`, `services/`; every import was flat. Neither resolved | Flat, matching the other six docs |
| 4 | `models.py` | Comment claimed 6 models; `scan_images` and `findings` absent; a spurious `rule_versions` present | Seven models, no version table |
| 5 | `scans` | `image_urls` / `image_hashes` as JSON — unindexable, so dedupe rehashed every image per upload | `scan_images` rows, banded pHash index |
| 6 | `scans` | `reasons` / `checklist` as JSON, aggregated with SQLite-only `json_each` | `findings` rows, engine-portable |
| 7 | `scans.status` | `String(10)` — cannot store the 12-character `not_assessed` | `String(16)`, four-state `CHECK` |
| 8 | Report queries | All six two-state `'Good'`/`'Bad'`; fenced `python` but containing SQL | SQLAlchemy, four-state, duplicate-filtered |
| 9 | `AuditLog` | Only a `details` JSON blob; no `seq`, `scan_id`, `old_value`, `new_value`, `reason`, `ip_address`. The chain formula appeared nowhere | Ten hashed fields, chain in §10.1 |
| 10 | `audit_logs.inspection_id` | `NOT NULL`, while the ERD recorded login and user actions that have no inspection | Nullable |
| 11 | Line 1124/1133 | `sha256` over the upload, then a resized re-encode written to disk. The stored hash could never be reproduced from the stored file | Store, read back, hash. §5.1 |
| 12 | Line 1201–1212 | Deskew and CLAHE computed into `img`, then OCR run on the original file path — the whole chain discarded | `run_ocr` receives the array |
| 13 | `deskew_image` | `np.where` int64 (row,col) into `minAreaRect` which needs float32 (x,y); `gray > 0` as a text mask | Otsu mask, `findNonZero`, float32 |
| 14 | PaddleOCR init | `use_gpu` deprecated, `show_log` removed in 2.8, `use_angle_cls` missing | Probed, `use_angle_cls=True` |
| 15 | §5 | Claimed 18 checks, implemented ~13, no CHK ids, no CHK06b, no CHK15/16 | 19 registered, asserted at import |
| 16 | Eight `if` branches | No `else` — the check row vanished silently | Every gate returns a row |
| 17 | Line 782 | Blurred image rejected with HTTP 400, losing the capture and the record | Stored and flagged, checks `not_assessed` |
| 18 | Verdict vocabulary | `Passed`/`Violation`/`Review`/`NA` in findings; `Good`/`Bad`/`Review` in scans | `pass`/`fail`/`not_assessed`; four-state scans |
| 19 | `check_mrp_rounding` | Returned `True` on every branch; 95–99 paise unhandled | Reports paise, ledger L-02, no invented breach |
| 20 | Font-size check | Derived a mm requirement from `pdp_area` alone, no scale; Table-I duplicated at two line ranges | Single `TABLE_I`, scale mandatory |
| 21 | `determine_violation_tier` | Every branch returned `improvement_notice` | Limb-aware; 36(2) goes to prosecution |
| 22 | `allowed_units` | Included `"N"` and `"U"` as SI units | Count units, Fourth Schedule, L-06 |
| 23 | `forbidden_words` | Three divergent copies in one file | One JSON file, TTL-cached |
| 24 | Disclaimer | "as on 7 May 2026" against 01.05.2026 elsewhere; "not FSSAI/MDR" while CHK17/CHK14 report on both | Rewritten, §9.3 |
| 25 | QR code | `niyamnetra://verify/{id}` — a scheme nothing resolves | https URL with the chain head |
| 26 | PDF colours | Two colours for four outcomes; `not_assessed` and `out_of_scope` printed as violation red | Four labelled outcomes, greyscale-legible |
| 27 | `create_all` | Cannot emit `CHECK` constraints or triggers, so the schema's guarantees were absent | Alembic, §14.2 |
| 28 | Missing imports | `os`, `date`, `deskew_image`, five schema classes | All defined; schemas in §4 |
| 29 | `require_owner_or_admin` | `user_id` bound as a query parameter, so the check was self-satisfied — and it was never attached to a route | `owned_inspection` / `owned_scan`, resolved from the database |
| 30 | JWT | 24 hours, single token, no `jti`, no `token_type`, no `install_id`; bare `Exception` → HTTP 500 on expiry | 12h access, 30d rotating refresh, `TokenError` → 401 |
| 31 | CORS | `exp://*` in `allow_origins`, which Starlette matches by equality | `allow_origin_regex` |
| 32 | `device_id` | Column present, never written, never verified | `install_id`, server-issued, verified per request |
| 33 | Upload limits | 5 MB cap and forced 1280 px downscale, destroying the resolution the mm checks need | 25 MB, no downscale, 80 MP bomb ceiling |
| 34 | Image upload | One `Scan` created per image, so a four-panel package produced four verdicts | Scan first, images attached |
| 35 | Lines 841–849, 924, 971 | Identical query run twice; `review_count=0` hard-coded; `under_review` permanently 0 because `"Review"` was never written | Single `review_queue_size()`, real counts |
| 36 | `generate_docx` | Imported and called; never defined | §9.5 |
| 37 | requirements.txt | Missing `pytesseract`, `ultralytics`, `pyzbar`, `pydantic-settings`, `alembic`; no system packages listed | §1.2, with apt/brew lines |
| 38 | `functools.lru_cache` on the catalog | No TTL, so an admin edit never took effect without a restart | `cachetools.TTLCache` |
| 39 | `PRAGMA foreign_keys` | Issued once in a script; per-connection, so pooled connections never had it and every FK was decorative | `@event.listens_for(engine, "connect")` |
| 40 | `Scan` | The five scope flags, both sticker sub-flags, `net_quantity_value`/`_unit` and `total_surface_area_cm2` lived only on the in-memory `CheckContext` and were never persisted, so CHK02/03/05/08/11/12/13/14 could not be reproduced or defended after the fact | Nine columns on `scans`, nullable by design |
| 41 | `Finding` | `FindingResult.limb` was computed and then dropped on persist, leaving `scans.violation_limb` unexplainable — the aggregate said 36(2) and no row said why | `findings.limb`, plus `ck_finding_limb_only_on_fail` |
| 42 | `phash_bands` | Four 16-bit bands were claimed to be a complete filter at Hamming distance 5 "by the pigeonhole principle". The bound is d ≤ bands − 1, so four bands guarantee only distance 3; bits {5, 9, 16, 38, 50} differ in all four bands at distance 5 and were silently unfindable | Eight 8-bit bands (`phash_b0`…`phash_b7`), complete through distance 7, with an assertion tying the threshold to the band count |
| 43 | §1.1 | Cited `13_…prompt….md`, which is not in the document set | Reference removed |

Confirmed clean in version 1.x and preserved: no hosted LLM service, no Gemini or GPT call, no S3, no IMEI, no row-level security predicated on a database role this application never assumes, and no claim that PyJWT signs a PDF. Local FS is primary with an optional best-effort Supabase mirror, OCR.space is an optional fallback when local OCR is absent, and `Backend/Dockerfile` exists for the Render deploy.

---

*End of Backend Architecture v2.1. This file's §4 is the schema of record — `06_DATABASE.md` documents it and must not diverge from it by a single column name. The other authorities are `02_NiyamNetra_Rules.md` for law, `03_NiyamNetra_Rules_Priority_Ordered.md` for check order, `09_SECURITY.md` for controls, and `12_SIH26034_NiyamNetra_loopholes.md` for the failure modes this design exists to close.*
