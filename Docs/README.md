# NiyamNetra — The AI Eye for Legal Metrology Compliance

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Packaged-commodity compliance scanner

**Version:** 2.0 | **Date:** 30 Aug 2026 | **Rules as at:** 2026-07-01
**Ministry:** Ministry of Consumer Affairs, Food & Public Distribution — Department of Consumer Affairs
**Theme:** Miscellaneous · **Category:** Software

NiyamNetra scans packaged-commodity labels, reads them with an offline OCR pipeline, checks them against the Legal Metrology (Packaged Commodities) Rules 2011, and produces evidence-backed reports. It runs as a responsive web Portal, a minimal Expo field app, and a single FastAPI backend — no Docker required.

> This README is the repository entry point. Each area is defined in depth by a document under `Docs/` (see the [documentation map](#documentation)). Where this file and a specialised document disagree, the specialised document is authoritative.

---

## Demo — the 30-second walkthrough

- An inspector scans a transparent bottle; the app detects glare and prompts "place dark paper behind," then enhances and reads the label.
- An inspector scans a curved pouch; the app requests additional angles, rectifies the image and reads it.
- A packet with no MRP is flagged as a **violation** — "MRP missing — Rule 6(1)(e)" — with a red-boxed image crop as evidence.
- The Today's Report shows stores visited and products scanned with a `compliant` / `violation` / `needs-review` split and a store-wise breakdown; a calendar picker marks dates that have data.
- The Admin dashboard shows violations by type, trends over time and recent activity.
- A PDF report is generated with the checklist, annotated evidence images, a QR verification code and the scope disclaimer.

---

## Problem statement (summary)

Every packaged commodity sold in India must carry the mandatory declarations required by the Legal Metrology (Packaged Commodities) Rules 2011 — manufacturer / packer / importer address, net quantity, MRP inclusive of all taxes, the month and year of manufacture, consumer-care details, country of origin for imports and best-before for perishables — together with the font sizes of Rule 7 Table-I, the clear space of Rule 8 and the manner-of-declaration of Rule 9. Manual inspection is slow, paper reports are lost, and there is no systematic detection of repeat offenders. NiyamNetra scans package photos, reads them via OCR, runs the compliance checks in a defined priority order, and generates evidence-backed PDF/Word reports with a dashboard, a searchable repository and role-based access.

---

## Solution — NiyamNetra

- A responsive **Portal** (React + Vite, PWA) for Inspectors and Admins on desktop, an **Expo** app (React Native, packaged as an Android APK) for inspectors (scanning) and admins (on-the-move monitoring), and a single **FastAPI** backend for all of them — no Docker; Supabase PostgreSQL (session pooler) REQUIRED via `DATABASE_URL`, no SQLite fallback.
- **Inspector flow:** log in by `employee_id`, create an inspection (shop, GPS, date, category), capture package photos with a guide box and on-device blur/glare/framing checks, read the label with the offline OCR pipeline, run the compliance checks, review a checklist (`pass` / `fail` / `not_assessed` per check, with an image crop and rule reference), override with a reason where needed, and submit. Works offline and syncs when connectivity returns.
- **Admin flow:** a dashboard with violation and trend charts, a searchable repository (manufacturer, product, shop, region, date, result), an inspection detail view with an image carousel and audit timeline, inspector management, rule-version management and PDF/Word/CSV export.
- **The AI recommends; the officer decides.** Every flagged item links to an image crop; every submission and override is written to an append-only, hash-chained audit ledger, and every image carries a SHA-256 hash.

Two vocabularies are used consistently. A **check** resolves to `pass`, `fail` or `not_assessed`; a **scan** resolves to `compliant`, `violation`, `not_assessed` or `out_of_scope`. "We could not read it" is never silently treated as a pass.

---

## Tech stack — all free / open-source

- **Portal:** React 18 · Vite 5 · Tailwind CSS 3.4 · Lucide · React Router 6 · Recharts · `vite-plugin-pwa` · Axios.
- **Expo app (APK):** Expo SDK 54 · `expo-camera` · `expo-location` · `expo-secure-store` (install-bound refresh token) · `expo-file-system` (on-device offline queue) · React Navigation 6 · Axios. Role is chosen by the account at login; there is no gallery picker in the inspector build (evidence is captured live), and the admin module has no camera. Build prompts: `Docs/Frontend_App_prompts.md`.
- **Backend:** FastAPI 0.110 · Uvicorn · SQLAlchemy 2.0 · **Alembic** (migrations) · Pydantic 2.6 · PyJWT · Passlib/bcrypt · python-multipart · qrcode.
- **AI / OCR:** OpenCV 4.9 · PaddleOCR 2.8 (primary, offline) · Tesseract 5 (fallback) · optional YOLO for label detection.
- **Rule engine:** Python `re` · JSON rule catalog (`rules/catalog_2026_07_01.json` + `rules/forbidden_words.json`) · optional spaCy.
- **Database:** Supabase PostgreSQL REQUIRED — `DATABASE_URL` (`postgresql+psycopg://`, session pooler, no default). No SQLite fallback.
- **Reports:** ReportLab 4.1 (PDF) · python-docx 1.1 (Word).
- **Run:** three terminals — backend on `0.0.0.0:8000`, Portal on `5173`, Expo dev server on `8081`. No Docker.

---

## Quick start — three terminals, no Docker

**Prerequisites:** Node.js 18+, Python 3.10+, Git, VS Code, the Expo Go app on a phone that shares the laptop's Wi-Fi. Tesseract must be installed at the OS level (see `Docs/Backend.md` §0.3).

### Terminal 1 — backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -c "from paddleocr import PaddleOCR; PaddleOCR(lang='en')"   # cache models once, for offline use
cp ../.env.example .env                            # then set JWT_SECRET (below) and the LAN address in CORS_ORIGIN_REGEX
python -c "import secrets; print(secrets.token_hex(32))"   # paste as JWT_SECRET (required, no default, >=32 chars)
alembic upgrade head                               # creates tables, CHECK constraints and triggers
python seed.py                                     # first users, stores, and the out-of-scope fixture
uvicorn main:app --reload --host 0.0.0.0 --port 8000
# verify: curl -s localhost:8000/health  ->  checks_registered must read 19
```

The schema is created only by `alembic upgrade head`, never by `Base.metadata.create_all()`, which would skip the CHECK constraints and triggers that enforce the compliance invariants. Run uvicorn from inside `backend/` so the flat imports resolve, and bind `0.0.0.0` so the phone can reach the API over the LAN.

### Terminal 2 — Portal

```bash
cd niyamnetra-portal
npm install
npm run dev            # http://localhost:5173
```

Log in with the demo `employee_id` and password printed by `seed.py` (an inspector account and an admin account are created).

### Terminal 3 — Expo field app

```bash
cd niyamnetra-app
npm install
# set EXPO_PUBLIC_API_BASE_URL to http://<your-LAN-IP>:8000, and add that origin to CORS_ORIGIN_REGEX on the backend
npx expo start         # scan the QR with Expo Go on the same Wi-Fi
```

CORS is matched by a regex (`CORS_ORIGIN_REGEX`), not an exact list — an `exp://*` entry in an exact-match list matches nothing. Ports are 8000 (API), 5173 (Vite) and 8081 (Expo dev server); the old Expo classic port 19000 is not used by SDK 54.

---

## Features

**Inspector (Portal + Expo app)**

- Login by `employee_id`, with the session bound to a server-issued `install_id`; a 12-hour access token and a 30-day refresh token.
- Start an inspection with shop name, auto-filled GPS, server date and a product category that surfaces the relevant Second-Schedule hint.
- Capture package photos with a guide box and real-time blur / glare / framing feedback, plus a burst mode that keeps the sharpest frame.
- OCR extraction — crop to the principal display panel, deskew, contrast-enhance, then PaddleOCR with per-field regex — returning structured fields with confidence and bounding boxes.
- The rule engine runs **eighteen checks** (producing **nineteen findings rows**, `CHK01`–`CHK18` plus `CHK06b`) in a defined order: exemption gates first, then the Rule 6 fields, then Rule 7 font size, then Rule 8/9, then the violation tier.
- Checklist review with `pass` / `fail` / `not_assessed` per check, each with a rule reference, a confidence badge and a link to the annotated image crop; override with a reason; submit to the audit ledger.
- Compliant / violation record tabs and a Today's Report with stores-visited and scan counts, a store-wise breakdown and a calendar picker that marks dates with data.
- Offline-first: a PWA service worker with IndexedDB, and an on-device queue in the Expo app that flushes to the backend when connectivity returns.

**Admin (Portal)**

- A dashboard with summary cards, a violations-by-type chart, a trend chart, recent activity and a top-offenders list, with PDF/Word/CSV export.
- An inspections list with search across manufacturer / product / shop / region / date / result, and pagination.
- An inspection detail view with a zoomable image carousel, the fields table, a read-only checklist, PDF/Word buttons with QR, and an audit timeline showing `hash_prev` / `hash_self` and the source IP.
- Inspector management (create / deactivate, assign area) and rule management (JSON with effective dates and history).

**Reports**

- PDF (ReportLab) and editable Word (python-docx), each with the product-details table, the colour-coded checklist, the annotated evidence images, remarks, a timestamp, a QR code linking to the verification view, and the scope disclaimer. Integrity is established by the hash-chained ledger and QR verification; the MVP does not embed a digital signature.

---

## Project structure

```text
NiyamNetra/
├── niyamnetra-portal/        # React + Vite Portal (Inspector + Admin)
├── niyamnetra-app/           # Expo app (APK) — Inspector (scan) + Admin (monitoring)
├── backend/                  # FastAPI — flat module layout (no app/ package)
│   ├── main.py               # app, middleware, router registration
│   ├── config.py             # pydantic-settings
│   ├── database.py           # engine, SessionLocal, get_db, PRAGMA listener
│   ├── models.py             # 7 SQLAlchemy ORM models
│   ├── schemas.py            # Pydantic request/response models
│   ├── jwt_handler.py        # access/refresh mint + verify
│   ├── password_handler.py   # bcrypt hash + verify
│   ├── rbac.py               # get_current_user, require_role, ownership checks
│   ├── image_processor.py    # store-then-hash, rectify, scale, pHash bands
│   ├── ocr_engine.py         # PaddleOCR + Tesseract fallback + field extraction
│   ├── rules_engine.py       # the 18 checks, returns 19 findings
│   ├── report_generator.py   # PDF + DOCX
│   ├── audit.py              # chain_hash, append_audit
│   ├── seed.py               # first-run users, stores, demo fixtures
│   ├── alembic/versions/     # CHECK constraints and triggers live here
│   ├── routers/              # auth, inspections, scans, reports, admin
│   ├── rules/                # catalog_2026_07_01.json, forbidden_words.json
│   ├── evidence/             # image storage (gitignored): {inspection_id}/{scan_id}/{image_id}.jpg
│   └── out/                  # generated PDF/DOCX (gitignored)
├── Docs/                     # the documentation set (see below)
├── .env.example
├── .gitignore                # .env, *.db, evidence/, out/, node_modules/, venv/
└── README.md                 # this file
```

The backend uses a **flat** module layout — modules sit directly under `backend/`, and only `routers/` is a package. There is no `app/` directory. The full rationale is in `Docs/Backend.md` §1.

---

## Legal compliance (summary)

The authoritative legal reference is `Docs/02_NiyamNetra_Rules.md`; the executable check order is `Docs/03_NiyamNetra_Rules_Priority_Ordered.md`.

- **Core 2011 Rules:** Rule 6 (the mandatory declarations), Rule 7 (the single Table-I font sizes, effective 01.01.2018), Rule 8 (clear space), Rule 9 (manner), Rules 11–13 (net quantity), Rule 3 (applicability) and Rule 26 (small-package exemptions).
- **Amendments tracked:** GSR 629(E) 2017, the 2025 medical-devices amendment, and the e-commerce country-of-origin filter under Rule 6(10A) from 01.07.2026. The Jan Vishwas amendments (2023, 2026) move offences toward an improvement-notice-then-penalty regime under Section 36.
- **Checks:** eighteen checks producing nineteen findings rows, run in priority order — presence (Rule 6), small-package and industrial gates, MRP format / rounding / dual, quantity SI / forbidden words, font (Table-I), width, contrasting colour, clear space, standard pack, sticker, country of origin, best-before, medical-device routing, e-commerce listing and filter, FSSAI boundary, and the violation tier.
- **Penalty amounts are not printed here.** They change with amendment and are stated, with their effective dates, only in `Docs/02_NiyamNetra_Rules.md`, to be verified against indiacode.nic.in before any enforcement use.
- **Scope disclaimer on every report:** the LM Rules 2011 only — not FSSAI food labelling, not MDR 2017 device labelling.

---

## API (brief)

The full contract is in `Docs/04_NiyamNetra_PRD.md`. The shape:

```text
POST /auth/login          {employee_id, password}          -> {access_token, user, install_id} (refresh in httpOnly cookie)
POST /inspections         {store_id, transaction_type, gps, notes} -> {inspection_id}
POST /inspections/{id}/scans                          -> {scan_id} (one scan per package)
POST /scans/{id}/images   (multipart, one per panel)      -> {image_id, sha256, usable}
POST /scans/{id}/assess                               -> {result, findings[19], counts}
PATCH /admin/findings/{id}  {human_verdict, override_reason} -> override (engine verdict untouched)
GET  /admin/dashboard                                 -> {counts, top_failed_checks, trend, review_queue}
GET  /reports/today.pdf | /reports/inspections/{id}/pdf   -> file download
GET  /health                                          -> {status, checks_registered}   # must be 19
```

Portal reads `VITE_API_BASE_URL` (not `VITE_API_URL`). Full contract in `Docs/Backend.md` §8.

Scan results use the four-state vocabulary (`compliant` / `violation` / `not_assessed` / `out_of_scope`); a `result` filter accepts those values.

---

## Database (brief)

The schema of record is `Docs/Backend.md` §4, mirrored in `Docs/06_DATABASE.md`.

- **Seven tables:** `users`, `stores`, `inspections`, `scans`, `scan_images`, `findings`, `audit_logs`.
- `scan_images` stores eight 8-bit perceptual-hash bands (`phash_b0`…`phash_b7`) for duplicate detection — complete through Hamming distance 7, which the near-duplicate threshold of 5 requires.
- `audit_logs` is append-only, chaining `hash_prev` → `hash_self`; the genesis row hashes the literal `"0"`.
- Supabase PostgreSQL only. `--workers > 1` is supported; there is no SQLite single-writer constraint, and the audit `seq` is allocated inside the inserting transaction.

---

## Testing (brief)

The strategy and suite are in `Docs/10_TESTING.md`.

- **Unit (pytest):** the rule engine (MRP, quantity SI, date, small-package, Table-I font), the banded pHash completeness bound, and the audit-chain hashing.
- **Integration:** auth, inspection creation, scan upload, report generation and dashboard endpoints.
- **End-to-end:** an inspector scan via Expo Go, through the Portal, to the Admin dashboard, including the offline path.
- **Performance and security:** concurrency, query latency, RBAC (403), tamper detection on the ledger.

---

## Deployment

Local, three-terminal running is the primary mode for the demo — the most reliable, with nothing to pull or wait for. An optional public deployment can put the Portal on a static host, the backend on a container host (`uvicorn main:app --host 0.0.0.0 --port $PORT`), and PostgreSQL on a managed service (change `DATABASE_URL`); the core still works offline without any of these.

---

## Documentation

The `Docs/` set is the single source of truth:

| File | Contents |
|------|----------|
| `01_NiyamNetra_PROJECT_OVERVIEW.md` | Orientation and the map to every other document. |
| `02_NiyamNetra_Rules.md` | The legal reference — Act, Rules and Schedules. |
| `03_NiyamNetra_Rules_Priority_Ordered.md` | The executable check order (18 checks / 19 rows). |
| `04_NiyamNetra_PRD.md` | Product requirements, API surface, acceptance criteria. |
| `05_SYSTEM_ARCHITECTURE.md` | Tiers, data flows, deployment, offline behaviour. |
| `06_DATABASE.md` | Schema narrative and DDL, mirroring `Backend.md` §4. |
| `07_Tech_Stack.md` | Version-pinned install commands. |
| `08_UI_DESIGN.md` | The design system and every screen. |
| `09_SECURITY.md` | Threats, authentication, authorization, the audit ledger. |
| `10_TESTING.md` | Test strategy and suite. |
| `11_working_overflow.md` | Overflow / edge-case handling. |
| `12_SIH26034_NiyamNetra_loopholes.md` | Ninety loopholes, each with a solution. |
| `14_env_example.md` | Every environment variable and what breaks without it. |
| `Backend.md` | Backend implementation and the schema of record (§4). |
| `Frontend_Portal_Prompts.md` | Portal build prompts. |
| `Frontend_App_prompts.md` | Expo app (APK) build prompts — inspector and admin. |

---

## Highlights

- One backend for the Portal and the Expo app — a single, coherent system.
- A court-oriented evidence chain: SHA-256 per image, GPS, an append-only hash-chained ledger and QR verification.
- Stores-visited tracking with a calendar picker — a genuine coverage metric, not just a scan count.
- Offline-first operation for shops with no network.
- Rule versioning per inspection, so the 2017 / 2025 / 2026 amendments are handled without rewriting history.
- Ninety documented loopholes, each with an optimised solution inside the offline, zero-paid-API stack.

---

## License and references

- **References:** Department of Consumer Affairs (Legal Metrology), PaddleOCR (Apache 2.0), PostgreSQL.
- Legal thresholds must be verified against indiacode.nic.in for post-January-2026 amendments before any real enforcement use.
- **License:** MIT for the hackathon; government deployment per Ministry guidelines.

---

**End of README.** This file is the repository entry point and the SIH submission summary; it lives at the project root as `README.md`.
