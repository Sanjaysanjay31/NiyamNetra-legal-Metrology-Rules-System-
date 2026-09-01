# NiyamNetra — Environment Variables Reference

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Every variable, where it comes from, and what breaks without it

**Version:** 2.0 | **Date:** 30 Aug 2026 | **Supersedes:** 1.1 (see §9 for the corrections log)
**Template file:** `backend/.env.example` — committed to Git. The real `backend/.env` is not.

---

## 1. HOW CONFIGURATION WORKS IN THIS PROJECT

Configuration is a **typed `Settings` class** in `backend/config.py`, built on `pydantic-settings`, and it is the only source of configuration in the backend. There is no `load_dotenv()` and no bare `os.getenv()` anywhere. That matters for three reasons.

Values are **parsed and validated at import time**, so a missing or malformed setting stops the process on line one with a message naming the field, rather than surfacing at 11 p.m. as a `TypeError` on `None`.

`JWT_SECRET` has **no default**. A default secret is worse than a missing one: the application starts, everything works, and the tokens are signed with a key that is in the repository. A validator additionally rejects anything shorter than 32 characters and anything on a placeholder list (`change_me`, `secret`, `niyamnetra`, `sih2026`, …), because a weak secret produces exactly the same working demo as a strong one.

The model is configured **`extra="forbid"`**. A key in `.env` that is not a field on `Settings` is an error, not a silently ignored line. This is the behaviour to know about before editing `.env`: adding a variable that "looks like it should exist" will stop the backend. Every key below is a real field; nothing else may be added without adding the field first.

Three files, three scopes:

| File | Read by | Committed |
|---|---|---|
| `backend/.env` | `Settings` in `config.py` | **No** |
| `Frontend_Portal/.env` | Vite at build time; only `VITE_*` keys are exposed | **No** |
| `Frontend_App/.env` | Expo at build time; only `EXPO_PUBLIC_*` keys are exposed | **No** |

The two client files hold URLs only. Neither client has, needs, or may ever be given `JWT_SECRET` — the secret signs and verifies tokens on the server, and a client that held it could mint its own. Version 1.1's instruction to "use the same `JWT_SECRET` for Portal and Expo App" describes an architecture in which authentication does not work.

`VITE_*` and `EXPO_PUBLIC_*` values are **inlined into the shipped bundle** and are readable by anyone with the app. Only put URLs there.

---

## 2. FIVE-MINUTE SETUP

```bash
cd backend
cp .env.example .env                                        # Windows: copy .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"    # paste as JWT_SECRET
alembic upgrade head                                        # creates the schema
python seed.py                                              # first users and stores
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Then confirm the configuration actually loaded, rather than assuming it:

```bash
curl -s localhost:8000/health | python -m json.tool
```

`checks_registered` must read **19** and `rules_as_at` must read the date you expect. Do not proceed past a wrong number on either: a nineteen that reads eighteen means a check failed to register and every report from then on is quietly short.

Only **one** value must be filled by hand for a local run: `JWT_SECRET`. Every other field has a working default. Two more are needed the moment a phone is involved — `EXPO_PUBLIC_API_BASE_URL` and the LAN address in `CORS_ORIGIN_REGEX`.

Do not generate the secret from a website. Version 1.1 suggested an online generator as one of three options; a secret produced by a third party, transmitted over the network and pasted into a project is not a secret, and the two local commands are no harder.

---

## 3. BACKEND VARIABLES

Every field of `Settings`, in declaration order. "Required" means there is no default.

### 3.1 Application

| Key | Default | Notes |
|---|---|---|
| `ENV` | `dev` | `dev` or `prod`. Chooses cookie `Secure`, log verbosity, and whether tracebacks are returned |
| `APP_NAME` | `NiyamNetra` | Appears in report headers |
| `PUBLIC_BASE_URL` | `http://localhost:8000` | **Origin of the verification QR** |

`PUBLIC_BASE_URL` is the one to change before a public demo. The QR printed on every report is `{PUBLIC_BASE_URL}/verify/{token}`, so if it still says `localhost` the trader scans a code that resolves to their own phone. It is `https` and a real hostname in production, and it is not a custom scheme — the person most likely to scan the code is the trader, who does not have the app installed.

### 3.2 Database

| Key | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///<backend>/niyamnetra.db` | One URL change switches engines |

SQLite for development and for the demo; PostgreSQL for production. The same SQLAlchemy models generate the DDL for both, which is why `06` presents both dialects rather than one block claiming to be portable.

```text
sqlite:///./niyamnetra.db                                   # relative — three slashes then a dot
postgresql+psycopg://niyamnetra:PASSWORD@localhost:5432/niyamnetra
```

The schema is created by **`alembic upgrade head`**, never by `Base.metadata.create_all()`. `create_all` skips the `CHECK` constraints and triggers that carry the project's guarantees — that a `not_assessed` finding must have a reason, that `engine_verdict` cannot be updated, that `checks_assessed <= checks_total`, that `audit_logs` is append-only. A database built with `create_all` looks identical and enforces none of it.

`postgresql+psycopg` selects psycopg 3, which is what `07` pins. A bare `postgresql://` URL asks SQLAlchemy for psycopg2, which is not installed.

### 3.3 Authentication

| Key | Default | Notes |
|---|---|---|
| `JWT_SECRET` | **required, no default** | ≥32 chars, not a placeholder; validated at import |
| `JWT_ALGORITHM` | `HS256` | HMAC-SHA256, symmetric |
| `ACCESS_TOKEN_HOURS` | `12` | Held in client memory only |
| `REFRESH_TOKEN_DAYS` | `30` | httpOnly `SameSite=Strict` cookie / platform keystore |
| `REFRESH_COOKIE_NAME` | `nn_refresh` | Scoped to `/auth` |

Twelve hours, because it covers a full field shift and an inspector in a no-network area cannot re-authenticate. Version 1.1 specified a single `JWT_EXPIRE_HOURS=24` and other drafts said 15 minutes; **12 hours access and 30 days refresh is the settled figure** and `05`, `06`, `09` and `Backend.md` all state it.

Rotating `JWT_SECRET` invalidates every token everywhere, which is the correct response to a suspected leak. Revoking one user is `token_epoch` on their row instead.

The bcrypt cost factor is set in `auth_utils.py`, not in `.env` — passlib records the cost inside each hash, so old hashes keep verifying after a change, and this is not a knob that benefits from being turned in the field. Note also that bcrypt truncates input at 72 bytes; `09` §2.2 covers the pre-hash.

### 3.4 CORS

| Key | Default | Notes |
|---|---|---|
| `CORS_ORIGIN_REGEX` | see below | A **regex**, matched by Starlette against the `Origin` header |

```text
^(https?://localhost:(5173|8081)|https?://127\.0\.0\.1:(5173|8081)|https?://192\.168\.\d{1,3}\.\d{1,3}:(5173|8081)|exp://.*)$
```

Version 1.1 used `allow_origins=["http://localhost:5173","exp://*", …]`. `allow_origins` is an **exact string comparison**; Starlette does not expand `*` inside an entry, so `exp://*` matched no origin at all and blocked every request it was written to allow. `allow_origin_regex` is the parameter that takes a pattern. Separately, `allow_origins=["*"]` with `allow_credentials=True` is forbidden by the CORS specification and the refresh cookie would be dropped.

The `192.168.\d+\.\d+` branch is why no LAN IP needs editing on most networks. Find yours with `ipconfig` (Windows) or `ifconfig | grep inet` (macOS/Linux); if it is on a `10.` or `172.` network, add a branch.

**CORS is a browser mechanism.** The Expo app sends no `Origin` header, so none of this applies to it — an Expo "network request failed" is a wrong host or a firewall, never CORS. Version 1.1 attributed Expo failures to CORS and sent people editing the wrong setting. The `exp://.*` branch is there only for the dev-client web preview.

Expo's dev server is on **8081**. Not 19000, which was the Expo classic port; SDK 54 does not use it.

### 3.5 Evidence and capacity

| Key | Default | Notes |
|---|---|---|
| `EVIDENCE_DIR` | `backend/evidence` | Originals. Outside the source tree in production |
| `OUT_DIR` | `backend/out` | Derived copies, reports, published chain head |
| `MAX_UPLOAD_MB` | `25` | Per image |
| `MAX_IMAGE_PIXELS` | `80_000_000` | Decompression-bomb ceiling |
| `MIN_PANEL_PIXEL_HEIGHT` | `400` | Below this, no scale; phase 3 is `not_assessed` |
| `MAX_RESIDUAL_TILT_DEG` | `15.0` | Above this, rectification is not trusted |
| `EVIDENCE_MIN_FREE_GB` | `5.0` | Below this, **new inspections** are refused with 507 |
| `DERIVED_MAX_WIDTH_PX` | `1600` | Display copies only |
| `ASSESS_CONCURRENCY` | `0` → `os.cpu_count()` | Parallel assessments |
| `ASSESS_QUEUE_WAIT_S` | `20` | Then 503 with `Retry-After` |
| `RATE_LIMIT_LOGIN_PER_MIN` | `5` | Per `employee_id` and per IP |
| `RATE_LIMIT_API_PER_MIN` | `300` | Per user; a loop guard, not a throttle |
| `DASHBOARD_CACHE_TTL_SECONDS` | `60` | Never applied to the review-queue badge |

**Twenty-five megabytes, and no width limit.** Version 1.1 set `MAX_IMAGE_SIZE_MB=5` and downscaled every upload to 1280 px. The millimetre checks are decided at the 0.5 mm level, and a 1280 px capture of a 60 mm panel resolves about 0.05 mm per pixel at best — so downscaling before measurement destroys the only thing the measurement depends on. Originals are stored at capture resolution and never re-encoded; the *display* copy is derived, capped at `DERIVED_MAX_WIDTH_PX`, and never measured. The decompression-bomb risk that motivated the old cap is handled by `MAX_IMAGE_PIXELS`, which rejects hostile files without degrading honest ones.

`EVIDENCE_DIR` belongs on a volume that is backed up **together with the database**. The hashes are meaningless if the files and the rows are restored from different points in time.

Capacity behaviour and the reasoning behind each default are in `11` §2 and §4.

### 3.6 OCR

| Key | Default | Notes |
|---|---|---|
| `OCR_LANGS` | `en,hi` | Comma-separated; **one reader is constructed per language** |
| `OCR_MIN_CONFIDENCE` | `0.60` | Below this a field is unread; dependent checks become `not_assessed` |
| `TESSERACT_CMD` | `None` | Explicit path when `tesseract` is not on `PATH` (usual on Windows) |

`en,hi` is a list this project splits, not a value passed through. `PaddleOCR(lang="en+hi")` is not valid — PaddleOCR takes one language per instance, so version 1.1's `PADDLEOCR_LANG=en+hi` raises on construction. Hindi uses the `devanagari` recognition model.

**Cache the models during setup, not on demo morning.** First construction downloads roughly 100 MB to `~/.paddleocr`:

```bash
python -c "from paddleocr import PaddleOCR; PaddleOCR(lang='en'); PaddleOCR(lang='devanagari')"
```

Do this on the machine that will run the demo, on a network that works. An OCR engine that reaches for a download during a judged run is the most avoidable failure in the project.

`OCR_MIN_CONFIDENCE` is a real product setting, not a tuning knob: lowering it does not improve accuracy, it converts honest abstentions into confident guesses.

### 3.7 Rules

| Key | Default | Notes |
|---|---|---|
| `RULES_AS_AT` | `2026-07-01` | The date the catalogue speaks as of |
| `RULES_CATALOG` | `backend/rules/catalog_2026_07_01.json` | Hashed into every scan |
| `ENGINE_VERSION` | `2.0.0` | Recorded on every scan |

`2026-07-01` is the date **GSR 128(E) came into force**, which switches on the Rule 6(10A) platform country-of-origin filter in CHK16. Change it and CHK16 changes behaviour, so it is recorded on every scan alongside `catalog_hash` and `ENGINE_VERSION`. That triple is what lets an inspection made today still be explained after the next amendment — and it is why `rule_version` as an enum was removed: `2017_amended` cannot express "the 2017 amendments as they stood on 1 July 2026 with GSR 128(E) in force".

Setting `RULES_AS_AT` to a future date does not make the engine forward-looking. It makes it cite provisions that were not in force when the photograph was taken.

---

## 4. CLIENT VARIABLES

### 4.1 Portal — `Frontend_Portal/.env`

| Key | Example | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Read as `import.meta.env.VITE_API_BASE_URL` |

The name is `VITE_API_BASE_URL`, matching `07` §2.2. Only the `VITE_` prefix is exposed to client code — a variable without it is invisible in the browser, which is a feature and the reason no secret ever gets one.

### 4.2 Expo app — `Frontend_App/.env`

| Key | Example | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `http://192.168.1.5:8000` | **LAN IP**, never `localhost` |

The `EXPO_PUBLIC_` prefix is mandatory from SDK 49 onward; without it the value is `undefined` at runtime. Version 1.1's `EXPO_API_URL` would silently read as undefined and the app would call `undefined/auth/login`.

`localhost` on a phone means the phone. The API is on the laptop, so it must be the laptop's LAN address, both devices must be on the same network, and the backend must be bound with `--host 0.0.0.0` — the default `127.0.0.1` accepts loopback only, and the resulting failure looks like a client bug.

Restart the dev server after changing either file. Vite and Expo inline these at build time; a running server keeps the old value.

---

## 5. COMPLETE `.env.example`

```ini
# ---------------------------------------------------------------- backend/.env
# Copy to backend/.env and fill JWT_SECRET. Everything else has a default.
# Settings is extra="forbid": a key that is not a field here will stop the app.

ENV=dev
APP_NAME=NiyamNetra
PUBLIC_BASE_URL=http://localhost:8000

DATABASE_URL=sqlite:///./niyamnetra.db
# DATABASE_URL=postgresql+psycopg://niyamnetra:PASSWORD@localhost:5432/niyamnetra

# REQUIRED. python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_HOURS=12
REFRESH_TOKEN_DAYS=30
REFRESH_COOKIE_NAME=nn_refresh

# A regex, not a glob. Add a branch for a 10.x or 172.x LAN.
CORS_ORIGIN_REGEX=^(https?://localhost:(5173|8081)|https?://127\.0\.0\.1:(5173|8081)|https?://192\.168\.\d{1,3}\.\d{1,3}:(5173|8081)|exp://.*)$

EVIDENCE_DIR=./evidence
OUT_DIR=./out
MAX_UPLOAD_MB=25
MAX_IMAGE_PIXELS=80000000
MIN_PANEL_PIXEL_HEIGHT=400
MAX_RESIDUAL_TILT_DEG=15.0
EVIDENCE_MIN_FREE_GB=5.0
DERIVED_MAX_WIDTH_PX=1600

ASSESS_CONCURRENCY=0
ASSESS_QUEUE_WAIT_S=20
RATE_LIMIT_LOGIN_PER_MIN=5
RATE_LIMIT_API_PER_MIN=300
DASHBOARD_CACHE_TTL_SECONDS=60

OCR_LANGS=en,hi
OCR_MIN_CONFIDENCE=0.60
# TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

RULES_AS_AT=2026-07-01
RULES_CATALOG=./rules/catalog_2026_07_01.json
ENGINE_VERSION=2.0.0
```

```ini
# ------------------------------------------------------- Frontend_Portal/.env
VITE_API_BASE_URL=http://localhost:8000
```

```ini
# ---------------------------------------------------------- Frontend_App/.env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:8000
```

Test-only, exported in the shell rather than written to `.env`, because it is not a `Settings` field:

```bash
export PG_TEST_URL=postgresql+psycopg://niyamnetra:PASSWORD@localhost:5432/niyamnetra_test
```

Unset, the PostgreSQL half of the suite **skips loudly** rather than passing vacuously — `10_TESTING.md` §2.1.

---

## 6. WHAT IS DELIBERATELY ABSENT

No `SUPABASE_DB_URL`, no `CLOUDINARY_URL`, no `AWS_*`, no `GEMINI_API_KEY`, no `OPENAI_API_KEY`, no `GOOGLE_APPLICATION_CREDENTIALS`, no `FIREBASE_*`, no `SENTRY_DSN`, no `REDIS_URL`.

Version 1.1 documented Supabase and Cloudinary as deployment options. Both are third-party custody of evidence: an image in an enforcement file that lives in someone else's bucket, under a URL that may be public and a retention policy the department does not control, cannot be produced in a hearing with a straight face. `07` §0.1 gives the full reasoning for each exclusion, including why no hosted vision or language model appears anywhere in the pipeline.

There is no `DOCKER_*` or Compose configuration. There is no `BACKEND_HOST` or `BACKEND_PORT` either: those are `uvicorn` command-line flags, and a variable that looks like it binds the socket but does not is worse than no variable. And there is no `MAX_SCANS_PER_DAY_PER_INSPECTOR` — a configuration key that caps an officer's lawful work.

---

## 7. `.gitignore`

```gitignore
# secrets
.env
.env.local
*/.env

# database
*.db
*.db-journal
*.db-wal
*.db-shm

# evidence and generated output — never in Git
backend/evidence/
backend/out/

# python
__pycache__/
*.pyc
venv/
.venv/
.pytest_cache/
.ruff_cache/

# node / expo
node_modules/
dist/
.expo/
.vite/

# model cache
.paddleocr/
```

`.env.example` **is** committed — it is the template. `alembic/versions/` **is** committed: the migrations are the schema's history, and a project that ignores them has no reproducible database.

`backend/evidence/` is excluded for two independent reasons. It is large, and it contains photographs of premises and of bystanders, which under the Digital Personal Data Protection Act 2023 do not belong in a public repository. If evidence has already been committed, removing it from the working tree is not enough — it stays in the history until the history is rewritten.

If `.env` has ever been committed, rotate `JWT_SECRET` and the database password. Deleting the file in a later commit leaves both readable in the history.

---

## 8. VERIFICATION CHECKLIST

Run these in order. Each one fails loudly when the corresponding variable is wrong.

```bash
cd backend
python -c "from config import get_settings; s=get_settings(); print(s.ENV, s.RULES_AS_AT, s.EVIDENCE_DIR)"
# ValidationError naming the field  →  that field is missing or malformed.
# "JWT_SECRET must be at least 32 characters"  →  the validator did its job.

alembic upgrade head && alembic current      # prints a revision, not "None"
python -c "import sqlite3;print(sqlite3.connect('niyamnetra.db').execute(
  \"select count(*) from sqlite_master where type='trigger'\").fetchone())"
# 0 triggers means the schema was built with create_all — drop it and migrate.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
curl -s localhost:8000/health | python -m json.tool
# checks_registered: 19   ·   rules_as_at: the date you expect
```

- Portal at `http://localhost:5173` logs in with the seeded **employee ID** — `seed.py` creates `LMO-0001` on an `@example.test` address, never a `gov.in` one, because a seeded credential on a real government domain in a public repository is a phishing kit with a working template.
- Expo on a phone on the same Wi-Fi logs in through the LAN IP. Failure here is the host or the firewall, not CORS.
- `POST` an image and confirm `GET /scans/{id}/verify` reports the hash matching — this proves `EVIDENCE_DIR` is writable and that nothing re-encoded the file on the way in.
- Generate a report and scan the QR: it must resolve through `PUBLIC_BASE_URL` to a real host, not to `localhost`.
- Deliberately break one thing: set `JWT_SECRET=secret` and confirm the process refuses to start. A configuration guard nobody has watched fire is not known to work.

---

## 9. CORRECTIONS LOG — what version 1.1 got wrong

| # | Where | Defect | Now |
|---|---|---|---|
| 1 | §1, §5 | `load_dotenv()` plus `os.getenv` | Typed `pydantic-settings`; validated at import |
| 2 | §1 | `.env` at the repository root | `backend/.env`; clients have their own |
| 3 | §3.2 | "Generate `JWT_SECRET` via an online generator" | Local `secrets.token_hex(32)` only |
| 4 | §3.2 | Implied default; no strength requirement | No default, ≥32 chars, placeholder list rejected |
| 5 | §3.2 | "Use the same `JWT_SECRET` for Portal and Expo App" | Server-side only; a client cannot hold it |
| 6 | §3.3 | `JWT_EXPIRE_HOURS=24`, one token lifetime | `ACCESS_TOKEN_HOURS=12`, `REFRESH_TOKEN_DAYS=30` |
| 7 | §3.4 | `allow_origins=[…,"exp://*"]` — a glob in an exact-match list | `CORS_ORIGIN_REGEX` |
| 8 | §3.4 | `allow_credentials=True` alongside a wildcard origin | Regex origins; the refresh cookie survives |
| 9 | §3.4 | Expo port `19000` | `8081` — SDK 54 |
| 10 | §3.4 | Expo network failures attributed to CORS | Expo sends no `Origin`; CORS cannot be the cause |
| 11 | §3.1 | Schema by `Base.metadata.create_all` | `alembic upgrade head`; `create_all` skips the constraints |
| 12 | §3.1 | `postgresql://` URL with psycopg 3 pinned | `postgresql+psycopg://` |
| 13 | §3.6 | `VITE_API_URL` | `VITE_API_BASE_URL`, matching `07` §2.2 |
| 14 | §3.7 | `EXPO_API_URL` — no `EXPO_PUBLIC_` prefix, so `undefined` | `EXPO_PUBLIC_API_BASE_URL` |
| 15 | §3.8 | `PADDLEOCR_LANG=en+hi` — raises on construction | `OCR_LANGS=en,hi`; one reader per language |
| 16 | §3.9 | `UPLOADS_DIR` / `REPORTS_DIR`; `file.save(...)` | `EVIDENCE_DIR` / `OUT_DIR`; hash read back off disk |
| 17 | §3.10 | `MAX_IMAGE_SIZE_MB=5` with a 1280 px downscale | `MAX_UPLOAD_MB=25`, no width cap, `MAX_IMAGE_PIXELS` guard |
| 18 | §3.11 | `BCRYPT_ROUNDS` as an env knob | Set in `auth_utils.py`; cost is recorded in the hash |
| 19 | §3.12, §4.3 | `SUPABASE_DB_URL`, `CLOUDINARY_URL` | Removed — third-party custody of evidence (§6) |
| 20 | §3.5 | `BACKEND_HOST` / `BACKEND_PORT` as variables | Uvicorn flags; they never bound the socket |
| 21 | — | `PUBLIC_BASE_URL` absent, so the QR pointed at `localhost` | §3.1, with the reason |
| 22 | — | `RULES_AS_AT`, `RULES_CATALOG`, `ENGINE_VERSION` absent | §3.7; the triple recorded on every scan |
| 23 | — | Every capacity key absent | §3.5, matching `11` §4 |
| 24 | — | `TESSERACT_CMD` absent; the fallback silently unavailable on Windows | §3.6 |
| 25 | — | `PG_TEST_URL` absent; the PostgreSQL suite silently never ran | §5, exported in the shell |
| 26 | §6 | `.gitignore` missing `evidence/`, `out/`, `*.db-wal`, `*/.env` | §7, with the DPDP Act reason |
| 27 | §6 | `alembic/versions` not addressed | §7 — committed, explicitly |
| 28 | §8 | Login check used `inspector@niyamnetra.gov.in` | Seeded `LMO-0001` on `@example.test` |
| 29 | §8 | Checklist verified only that the file exists | §8 imports `Settings`, counts triggers, checks `/health`, and breaks a value on purpose |
| 30 | §5 | "Use the same `JWT_SECRET` across laptops if sharing a backend" | Each developer generates their own; nothing is shared |
| 31 | §2 | "Only 3 variables: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`" | One: `JWT_SECRET`. Two more when a phone is involved |
| 32 | §1 | `.gitignore` listed `uploads/`, `reports/` — directories that do not exist | `backend/evidence/`, `backend/out/` |

---

*End of Environment Variables Reference v2.0. Field names and defaults are the `Settings` class in `Backend.md` §3, which is authoritative; capacity values are explained in `11` §2; the security reasoning is in `09_SECURITY.md`; the exclusions in §6 are argued in `07_Tech_Stack.md` §0.1.*
