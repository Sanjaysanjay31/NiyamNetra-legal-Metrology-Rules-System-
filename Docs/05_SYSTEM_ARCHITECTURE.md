# NiyamNetra — System Architecture

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Portal + Expo app + FastAPI

**Version:** 2.0 | **Date:** 30 Aug 2026 | **Supersedes:** 1.1 (see §10 for the corrections log)
**Scope:** Three-tier architecture, component responsibilities, end-to-end data flows, the API surface, three-terminal deployment, offline design

---

## 1. OVERVIEW

**Goal.** An evidence-backed Legal Metrology scanner that works in a dusty shop with no network, syncs to a supervisory dashboard, and produces a report that survives being read by someone who wants to discredit it.

That last clause is what drives every decision below. A demo only has to work; an enforcement tool has to be defensible when the trader's lawyer asks how a 2.1 mm measurement was obtained from a photograph, or why the report says "compliant" for a package the officer could not read.

```text
  ┌──────────────────────────┐
  │ Inspector phone          │
  │ Expo SDK 54 · camera     │──┐
  └──────────────────────────┘  │
                                │   ┌──────────────────────────────┐
  ┌──────────────────────────┐  ├──▶│ FastAPI  ·  port 8000        │
  │ Inspector / Admin laptop │  │   │ 0.0.0.0, so the LAN can see  │
  │ React 18 PWA · port 5173 │──┘   └──────────────┬───────────────┘
  └──────────────────────────┘                     │
                                                   ├──▶ SQLite (dev) / PostgreSQL (prod)
                                                   ├──▶ evidence/  byte-exact images + SHA-256
                                                   ├──▶ OpenCV → PaddleOCR → rules engine (19 checks)
                                                   └──▶ ReportLab PDF + python-docx
```

### 1.1 The four decisions everything else follows from

**One backend for both clients.** The portal and the Expo app call the same FastAPI on the same database with the same token format. Two backends means two rules engines, and two rules engines means two answers to the same question about the same package — which is the one thing an enforcement system cannot have.

**Local-first, Dockerfile present for Render.** Three terminals start in about thirty seconds and are the primary demo; a PaddleOCR plus PostgreSQL image pull is gigabytes over hackathon WiFi and hides the logs. `Backend/Dockerfile` exists for the Render deploy (Tesseract + libzbar on a slim Python image) — see `07_Tech_Stack.md` §0.1.

**Offline-first, but never offline-silent.** Both clients queue work locally and sync later. A record created or edited offline is flagged, and the flag survives the sync — because a finding entered from memory an hour after leaving the shop is weaker evidence than one captured at the counter, and the reviewing officer is entitled to know which they are looking at.

**Three verdicts, four results, nineteen rows.** Every check returns `pass`, `fail` or `not_assessed` with a mandatory reason on the third; every scan resolves to `compliant`, `violation`, `not_assessed` or `out_of_scope`; every scan produces exactly nineteen findings rows and the report states the denominator. `Good`, `Bad` and `Review` are abolished. This is the architectural constraint, not a UI preference — it appears in the database CHECK constraints, in the engine's registry assertion, in the API contract and in the PDF.

---

## 2. COMPONENTS

### 2.1 Tier 1A — Portal, React 18 + Vite 5

| Aspect | Detail |
|---|---|
| Stack | React 18, Vite 5, Tailwind **3.4 + PostCSS**, Lucide, React Router 6, Recharts 2.12, vite-plugin-pwa, idb 8 |
| Runs at | `http://localhost:5173` |
| Screens | Login · InspectorHome · ScopeIntake · Capture · FindingsReview (19 rows) · Records (filterable by all four results) · TodaysReport · AdminDashboard (5 cards) · InspectionsList · InspectionDetail · ReviewQueue · ManageInspectors |
| Offline | Service worker caches the app shell; **IndexedDB via `idb`** holds queued scans with image `Blob`s |
| Responsive | 375 px bottom tabs · 768 px collapsed sidebar · 1280 px 240 px sidebar |
| Auth state | Access token in a **module-scoped variable**; refresh token in an httpOnly cookie the browser sends automatically |

The access token is never written to `localStorage`, `sessionStorage`, or any cookie JavaScript can read. Anything readable by script is readable by any script that gets injected, and a stolen access token is a valid inspector session for twelve hours. `10_TESTING.md` §9.2 asserts the absence.

Records screens filter by all four results, and the `not_assessed` filter is not buried behind an "advanced" toggle. A review queue nobody can find is a review queue nobody works.

### 2.2 Tier 1B — Expo app, SDK 54

| Aspect | Detail |
|---|---|
| Stack | Expo SDK 54, expo-camera, expo-location, **expo-secure-store**, expo-file-system, React Navigation 6, axios |
| Runs at | `exp://<LAN-IP>:8081` — Metro's port on SDK 54, **not** 19000 |
| Screens | Role-branched at login. **Inspector:** Login · InspectionScreen · ScanScreen · FindingsScreen · RecordsScreen · TodaysReportScreen. **Admin:** Login · RaidsToday · ManageInspectors · RecordsScreen · ReportsCalendar — no camera |
| Offline | Images queued in `expo-file-system`, metadata alongside; synced when connectivity returns |
| Secrets | `install_id` and the refresh token in the platform keystore via `expo-secure-store` |

**Two roles, one build, chosen by the account.** The APK ships both navigators; which one mounts is decided by the `role` on the authenticated account, not by a selector the user can flip. An inspector gets the capture flow (`expo-camera` live capture only, no gallery); an admin gets a read-mostly monitoring module — raids today across all inspectors, inspector management, store-wise records and a date-wise report calendar — with no camera dependency reachable. This mirrors the desktop split in §2.1 and is specified screen-by-screen in `Frontend_App_prompts.md`.

**No gallery.** `expo-image-picker` is not installed. Version 1.1 listed it and noted it was "disabled for Inspector per anti-fraud", which leaves the capability shipped and one conditional between a screenshot of a compliant label and the evidence chain. Absent beats disabled.

**The token is bound to the install.** Every token carries an `install_id` claim, and the server rejects a token presented from a different install. So a token minted on the portal does **not** work in the app: the officer logs in on each device. Version 1.1 advertised "login once, use both" as a feature — it is the absence of device binding, which is the control that makes a stolen token useless off the device it was issued to. See `09_SECURITY.md` §4.

### 2.3 Tier 2 — FastAPI

Flat module layout. Every Python file sits directly under `backend/`; only `routers/`, `rules/`, `evidence/`, `out/`, `alembic/` and `tests/` are directories. Version 1.1 drew `auth.py` at the root **and** `routers/auth.py`, which is an import collision, and drew nested service packages while every code sample in the project imported flat.

```text
backend/
├── main.py              # FastAPI app, CORS regex, security headers, /health
├── config.py            # pydantic-settings; validates JWT_SECRET at import
├── database.py          # engine, SessionLocal, get_db, SQLite pragma listener
├── models.py            # SEVEN tables (§2.4)
├── schemas.py           # Pydantic request/response models
├── password_handler.py  # password hashing (CryptContext bcrypt__rounds=12)
├── jwt_handler.py       # mint/decode, token_type enforced
├── rbac.py              # current_user, require_role, owned_inspection, owned_scan
├── image_processor.py   # store_upload, rectify, compute_scale, phash_bands
├── ocr_engine.py        # deskew, CLAHE, PaddleOCR, Tesseract fallback
├── rules_engine.py      # 19 checks, registry, derive_result
├── report_generator.py  # generate_pdf, generate_docx, verification_qr
├── audit.py             # chain_hash, append_audit, verify_chain
├── citations.py         # cite() — the unverified-provision guard
├── listing_fetcher.py   # SSRF-guarded outbound fetch for CHK15/CHK16
├── queries.py           # report aggregates, review_queue_size
├── seed.py
├── routers/             # auth.py · inspections.py · scans.py · reports.py · admin.py
├── rules/               # the 19 check FUNCTIONS (Python, not JSON)
├── evidence/            # {inspection_id}/ — byte-exact originals
├── out/                 # generated PDF/DOCX, chain_heads.log
├── alembic/             # migrations — the ONLY way the schema is created
└── tests/
```

`main.py` does **not** call `Base.metadata.create_all()`. `create_all` cannot emit `CHECK` constraints or triggers, so a database built that way accepts `overall_result='Good'` and permits an `engine_verdict` to be rewritten after the fact — the two things the schema exists to forbid. `alembic upgrade head` is the only supported path.

CORS uses `allow_origin_regex`, not a list. `allow_origins` is exact-match, so version 1.1's `"exp://*"` and `"http://192.168.*.*:19000"` were literal strings no browser ever sends: the configuration blocked every origin it was written to allow. And `allow_credentials=True` with `allow_origins=["*"]` is rejected by browsers by specification, which the refresh cookie needs. See `Backend.md` §1.3.

### 2.4 Tier 3A — Database, seven tables

`users` · `stores` · `inspections` · `scans` · `scan_images` · `findings` · `audit_logs`

Version 1.1 said five, omitting `scan_images` and `findings` — the two that carry the evidence and the verdicts. Their absence is why version 1.x stored `image_hashes` and `rule_results` as JSON blobs on the `scans` row, which cannot be indexed, cannot be constrained, and made "count the failures of CHK06 this month" a Python loop over every row in the table. Full schema in `06_DATABASE.md`.

Three columns on `scans` replace the old `rule_version` enum: `rules_as_at` (the catalogue date applied), `catalog_hash` (the exact rule set), `engine_version`. An enum with values `2017_amended` and `2026` cannot express "the 2017 amendments as they stood on 1 July 2026 with GSR 128(E) in force", which is the thing an inspection actually needs to record, and it silently becomes wrong the next time the law moves.

SQLite gets a connect-event pragma listener. `PRAGMA foreign_keys` defaults to OFF and is per connection, so issuing it once in a setup script protects nothing — the pooled connections that serve requests never saw it.

### 2.5 Tier 3B — Vision and OCR

Rectify by four-point homography, deskew with Otsu and `minAreaRect`, CLAHE for glossy and transparent packs, then OCR on the **resulting array**. Version 1.1's pipeline computed the preprocessing into a variable and then called `ocr.ocr(image_path)` on the untouched file — every step ran at full cost and had no effect.

Blur and glare are **measured and recorded**, never a rejection. A Laplacian variance under threshold means the declarations may be unreadable; the image is still stored, still hashed, and the affected checks return `not_assessed` with the measured value in the reason. Rejecting the upload discards the capture, the GPS fix and the inspector's trip, and leaves no record that an unreadable package was found — which quietly biases every statistic toward the photogenic subset of the field.

Scale is explicit. `mm_per_pixel` comes from the declared panel height, an ISO/IEC 7810 ID-1 card (85.60 mm long edge) or a ₹5 coin (23 mm), each with its own uncertainty. A camera has no absolute scale: two photographs of the same 2.5 mm letter at different distances give different pixel heights. Without a scale reference the millimetre checks are undecidable and return `not_assessed`, and measurements print as "2.1 mm ± 0.3 mm against a 2.5 mm minimum".

### 2.6 Tier 3C — Rules engine

Nineteen checks — CHK01 to CHK18 plus the CHK06b sub-check — as **Python functions** in `backend/rules/`, registered in a table with an import-time assertion that the count is exactly nineteen with no duplicates. Order and provisions are fixed by `03_NiyamNetra_Rules_Priority_Ordered.md`.

Four phases. Phase 1 decides scope and can halt everything (CHK03 Rule 3, CHK02 Rule 26(a), CHK14 the Rule 2(h) proviso for medical devices). Phase 2 reads declarations. Phase 3 measures typography and needs a scale. Phase 4 derives the violation tier.

Not JSON rule files. Version 1.1 proposed one JSON file per rule with a `regex` and a `violation_tier`, which cannot express a five-band Table-I lookup over a PDP area computed three different ways by package geometry, or a measurement compared against an uncertainty band, or a check that halts the other eighteen. Its sample also hard-coded `violation_tier` per field, which is how version 1.x returned an improvement notice on every branch including a net-quantity misdeclaration — the tier is a function of the whole findings set and the limb engaged, not a property of one field.

A halt gives every downstream check a **row** carrying the halt reason. It does not skip them. A package outside Chapter II cannot *pass* a Chapter II declaration check, and reporting eighteen passes about obligations that never applied is a fabricated clean result.

### 2.7 Tier 3D — Reports

PDF via ReportLab, the same content as an editable `.docx` via python-docx. Four outcomes, four colours, and **every colour carries its label** — enforcement documents get photocopied, and a colour-only encoding is unreadable the moment that happens. Printing `not_assessed` and `out_of_scope` both in violation red tells an officer that an unreadable package and an out-of-scope package were both breaches.

No rupee figure is printed. The Section 36 amounts under Act 8 of 2026 are ledger entry **L-12** and unverified, and a wrong penalty in a document handed to a trader is worse than no penalty. The disclaimer reads the catalogue date from `rules_as_at` rather than hard-coding a date string that becomes false the day the catalogue is updated.

The QR is an `https` URL from `PUBLIC_BASE_URL` (default `http://localhost:8000`; `https` real host in production) carrying the audit-chain head. Not a custom scheme: the person most likely to scan it is the trader, who does not have the app, and `niyamnetra://verify/{id}` does nothing in a phone camera. There is no `verify.niyamnetra.gov.in` — nobody on this team can register a `gov.in` domain, and printing one implies an official endorsement the project does not have.

---

## 3. DATA FLOW

### 3.1 Flow 1 — an inspector scan, from shutter to record

1. Inspector opens Expo Go, scans the QR from `npx expo start`, logs in with an **Employee ID** and password. The server verifies the bcrypt hash and returns a 12-hour access token plus a 30-day refresh token bound to this `install_id`. The access token stays in memory; the refresh token goes to the keystore.

2. `POST /inspections {store_id, transaction_type, gps, ...}` opens an inspection (`store_id` only; new stores via separate `POST /stores`, admin-only per `routers/inspections.py:94-110`). Scope is captured **before** any photograph — transaction type, commodity category, whether the package exceeds 25 kg or 25 L, whether it is a medical device. Asking afterwards means an out-of-scope package has already been photographed and assessed.

3. `POST /scans` creates the scan row: commodity, declared net quantity, panel shape and dimensions, import and perishability status, and the scale reference the inspector is using.

4. `POST /scans/{id}/images` once per panel — `front`, `back`, `side`, `mrp`, `batch`, `other` (`ALLOWED_PANELS` in `routers/scans.py`; barcode is `Scan.barcode`, not a panel). Each upload is stored **byte-for-byte**, then read back off disk and hashed. One scan, many images.

   Version 1.x created a new `Scan` per uploaded image, so a package photographed on four panels became four packages with four independent verdicts, three of them missing most of the declarations and therefore three spurious violations from one compliant package.

5. `POST /scans/{id}/assess` runs the pipeline: rectify, scale, OCR, then all nineteen checks. Idempotent by replacement — re-assessing deletes the prior findings and writes a fresh set, and the replacement is audited, so a re-run cannot be used to quietly launder a verdict.

6. The response carries nineteen findings, the four-state result, the counts, the denominator, and `mm_per_pixel` with its uncertainty.

7. FindingsScreen shows all nineteen rows grouped by phase, each with its verdict, the observed value, the requirement, the reason where it abstained, and a crop of the evidence. `not_assessed` rows are visually distinct from failures.

8. The inspector may override a finding, with a **mandatory reason**. The override is additive: `engine_verdict` is preserved and displayed beside the human verdict, and the database refuses to update `engine_verdict` at all. An officer who disagrees with the engine leaves a record of the disagreement, not a rewritten history.

9. `POST /inspections/{id}/submit` seals it: status to `submitted`, an audit entry appended to the hash chain, PDF and DOCX generated into `out/`.

10. TodaysReport aggregates: distinct stores visited, scans by each of the four results, store-wise breakdown. Duplicates are excluded from the counts but retained as records.

### 3.2 Flow 2 — the degraded capture, which is the common case

Same path, glare across the panel, no OCR result, dimension step skipped. The upload is **accepted** (201, with `usable: false` and the measured quality note), the hash is recorded, and the assessment returns `not_assessed` overall with thirteen or more rows each carrying a reason a person can act on: "no scale reference was identified, so character height could not be measured", "OCR returned no text regions".

The inspection is in the review queue, the trip is recorded, and nothing was fabricated. Version 1.x returned HTTP 400 here and threw the whole thing away.

### 3.3 Flow 3 — admin review

Admin logs in on the portal, `GET /admin/dashboard` returns **five** counts — `compliant`, `violation`, `not_assessed`, `out_of_scope`, `total` — plus `violations_by_check` and `review_queue`. The aggregates are SQL over the `findings` table, on both engines. Version 1.x computed violation counts by parsing a JSON blob in Python, and its one SQL attempt used SQLite-only `json_each`, so the dashboard's second chart raised `OperationalError` the moment the project moved to the PostgreSQL it claims to support in production.

`review_queue` is computed from the same query that drives the review-queue page, so the badge and the page cannot disagree. Version 1.x hard-coded `review_count=0` in one place and computed it in another.

Opening an inspection shows the image carousel with bounding boxes, the extracted fields with confidences, all nineteen findings read-only with the engine verdict beside any override, and the audit timeline with old value, new value and reason on every entry.

### 3.4 Flow 4 — offline, and what happens on conflict

The client detects loss of connectivity, shows a persistent banner, and queues captures locally with images as `Blob`s in IndexedDB (portal) or files (Expo). On reconnection a background sync posts the queue with retry.

A record created offline is flagged. A record **edited** offline carries `edited_offline`, and that flag reaches the reviewer.

On conflict the local copy becomes a **review item**. It is not discarded. Version 1.1 specified "server wins if duplicate, client shows sync conflict — server version kept", which silently destroys field evidence: the two records may be two genuinely different packages from the same shelf, and the one the server happens to have seen first is not more likely to be correct. A near-duplicate detected by perceptual hash means a human should look, and nothing more — it is never an automatic rejection and never a verdict.

---

## 4. API SURFACE

Base URL is `http://localhost:8000` from the portal and `http://<LAN-IP>:8000` from the phone — never `localhost` from the phone, which means the phone itself.

**Auth.** `POST /auth/login {employee_id, password}` → access token in the body, refresh token as an httpOnly cookie scoped to `/auth` (`SameSite=Strict` locally, `SameSite=None; Secure` in prod when the portal and API are cross-site — `config.refresh_cookie_cross_site`). `POST /auth/refresh` rotates, checking `token_epoch` and `install_id`. `POST /auth/logout` clears the cookie. `GET /auth/me`. Login is by **employee ID**, not email: an inspector has an employee number on their identity card, and it is the identifier that appears on the paperwork.

**Inspections.** `POST /inspections {store_id, transaction_type, gps_lat, gps_lng, notes}` (`store_id` only; `POST /stores` admin-only creates a store). `GET /inspections` — filtered by date, result and store, **scoped to the caller by the server**. `GET /inspections/{id}`. `POST /inspections/{id}/submit`.

There is no `?inspectorId=` parameter. Version 1.1 had one, and it was the whole authorisation hole: a filter the caller supplies is not a control, because the caller can supply somebody else's id. Scope is derived from the token, and a request for a record the caller may not see returns **404, not 403**, so the endpoint is not an existence oracle.

**Scans.** `POST /inspections/{id}/scans` · `POST /scans/{id}/images` · `PATCH /scans/{id}` (declared scope flags: `commodity_generic`, `brand_name`, `commodity_category`, `batch_number`, `net_quantity_value/unit`, `is_imported`, `is_perishable`, `is_medical_device`, `is_tobacco`, `has_sticker`, `sticker_reduces_price`, `sticker_covers_original`) · `POST /scans/{id}/listing {url}` (SSRF-guarded fetch for CHK15/CHK16) · `POST /scans/{id}/assess` · `GET /scans/{id}` · `GET /scans/{id}/verify` (rehashes every stored file) · `PATCH /admin/findings/{id}` (override, reason mandatory).

**Reports.** `GET /reports/inspections/{id}/pdf` · `.../docx` · `GET /reports/today` (+ `GET /reports/today.pdf`).

**Admin.** `GET /admin/dashboard` (note: not `/admin/dashboard/stats`) · `GET /admin/review-queue` · `GET /admin/audit` (paginated, chain verification folded in as `chain_intact`/`chain_head`) · `POST /admin/users` · `GET /admin/users` · `GET /admin/rules` (read-only).

`/admin/rules` is read-only and there is no `PUT`. Version 1.1 offered "update rule version", which would let a signed-in admin change the legal basis of inspections already recorded. The rule catalogue is versioned in code with a `catalog_hash`, and each scan stores the hash it was assessed under, so what the law said at assessment time is fixed and auditable rather than editable.

**Everything except `/auth/login`, `/auth/refresh` and `/health` requires a bearer token.** Ownership is resolved from the row the path names.

Full inventory with request and response shapes in `Backend.md` §8.

---

## 5. DEPLOYMENT — THREE TERMINALS

**Terminal 1 — backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -c "from paddleocr import PaddleOCR; PaddleOCR(lang='en', use_angle_cls=True)"
alembic upgrade head
python seed.py
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
curl -s localhost:8000/health     # checks_registered MUST read 19
```

**Terminal 2 — portal**

```bash
cd niyamnetra-portal
npm install
npm run dev                        # http://localhost:5173
```

**Terminal 3 — Expo**

```bash
cd niyamnetra-app
npx expo start                     # QR at exp://<LAN-IP>:8081
# Set api/client.js baseURL to http://<LAN-IP>:8000
# Windows: ipconfig -> Wireless LAN IPv4     macOS: ifconfig en0 | grep inet
```

`--host 0.0.0.0`, not the default `127.0.0.1`, or the phone on the LAN cannot reach the API. `checks_registered: 19` before anything else: a wrong number means a check failed to register and every report will be silently short.

Environment variables and their constraints are in `14_env_example.md`. `JWT_SECRET` has no default and `config.py` rejects at import anything shorter than 32 characters or drawn from a known-weak set — version 1.1 printed `JWT_SECRET=niyamnetra_secret_2026_sih` in the document body, which means it is now in the repository, in every clone, and in the submission PDF.

**Optional public hosting.** Render hosts the backend only (`rootDir: Backend`, build `pip install -r requirements-render.txt` slim, start `uvicorn main:app --host 0.0.0.0 --port $PORT` — see `render.yaml`). The Portal is a separate static host built with `npm run build:render`. Do NOT install full `requirements.txt` on Render: it pulls PaddleOCR (~1.5 GB) and the free instance OOMs or times out. Local filesystem is the primary evidence store; Supabase Storage is an optional best-effort mirror configured via `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_BUCKET` (`image_processor.store_upload`), and OCR.space is an optional fallback when local OCR (PaddleOCR/Tesseract) is absent (`OCR_SPACE_API_KEY`). See `07_Tech_Stack.md` §11.

---

## 6. SECURITY ARCHITECTURE

| Control | Implementation |
|---|---|
| Passwords | bcrypt via Passlib, `bcrypt==4.0.1` pinned, 12-char minimum for new accounts (`CreateUserRequest` / change-password) and 8-char minimum at login (`LoginRequest`) |
| Tokens | 12-hour access in client memory · 30-day refresh in an httpOnly cookie or keystore · `token_type` checked on every decode |
| Device binding | Server-issued random 32-byte `install_id` in the platform keystore — **never IMEI**, unavailable to apps since Android 10 |
| Revocation | `token_epoch` on the user; incrementing it invalidates every live refresh token |
| RBAC | Ownership resolved from the row the path names; 404 for records the caller may not see |
| Evidence | Store the bytes, read them back, hash what was written; `GET /scans/{id}/verify` recomputes |
| Audit | Append-only chain over ten fields including `user_id` and `new_value`, canonical JSON, daily head published outside the database |
| Transport | CORS by regex, `allow_credentials=True`, CSP `default-src 'self'`, `frame-ancestors 'none'` |
| Uploads | 25 MB cap, `MAX_IMAGE_PIXELS` guard against decompression bombs, MIME sniffed not trusted |
| Outbound | Only CHK15/CHK16 fetch; https only, private and link-local ranges blocked, redirects not followed |

**Two things version 1.1 claimed that are not implemented, and should not be.**

*"PDF digitally signed with server key."* Nothing in the stack signs a PDF. PyJWT signs JWTs; it has no PDF capability, and a document asserting a signature that does not exist is worse than one that makes no claim — the first thing an opponent checks is the claim you made. Integrity comes from the audit chain, its published daily head, and the QR that carries that head. Removed in `09_SECURITY.md` §9.1.

*"Row Level Security in PostgreSQL."* RLS binds to a database role. This application connects as one role for all users, so RLS policies would either block everything or nothing. Authorisation is in the application layer, tested by the IDOR suite in `10_TESTING.md` §8.3.

Also removed: `device_id` as an offline signature (it was IMEI-derived), and "verified on retrieval" against `scans.image_hashes`, a column that no longer exists — per-image hashes live on `scan_images`.

---

## 7. OFFLINE ARCHITECTURE

**Portal.** vite-plugin-pwa generates the service worker for the app shell. Queued scans go to **IndexedDB via `idb`**, images as `Blob`s. Not `localStorage`: it holds strings only, so an image has to be base64-encoded, inflating it by a third, and the 5–10 MB origin quota is exhausted by two photographs.

**Expo.** Images in `expo-file-system`, metadata alongside, connectivity watched, a banner while offline, background sync on reconnection. Not `AsyncStorage` for credentials — it is an unencrypted file in the app sandbox, readable on a rooted device and often included in device backups.

**Queue semantics.** Append-only with retry and backoff. A queued item is removed only after the server acknowledges it. Sync is idempotent, keyed on a client-generated scan UUID, so a retry after a timeout that actually succeeded does not create a second record.

**Conflict.** Review item, both copies retained, `edited_offline` preserved through the sync. §3.4.

---

## 8. PERFORMANCE

The honest statement is about *shape*, not numbers. Version 1.1 asserted "PaddleOCR 3-5 sec per image on laptop i5", "Today's Report <10ms for 1000 scans", "PDF generation <10 sec" and "Recharts 1000 points <2 sec". None were measured, and quoting an unmeasured figure in a submission is the same defect as citing an unverified provision.

What is designed for, and what to measure once it runs:

OCR dominates the request and is CPU-bound, so assessment is a separate call from upload — the inspector is not left staring at a spinner while four images are processed, and a slow assessment cannot time out an upload that already holds the evidence.

Report aggregates are SQL over `findings` with covering indexes on `(scan_id, check_id)`, `(check_id, engine_verdict)`, `(inspection_date, user_id)` and the eight pHash bands. Nothing is aggregated by looping in Python.

Images are files with hashes in the database, never BLOBs, so a report query never drags megabytes through the ORM. Display thumbnails are derived copies and are not hashed.

Perceptual-hash duplicate search uses eight indexed 8-bit bands rather than scanning the table. The completeness bound is *distance ≤ bands − 1*: *d* differing bits touch at most *d* bands, so *bands − d* remain identical and the `OR` over the band columns cannot miss a pair. Eight bands therefore cover every distance up to seven, comfortably above the near-duplicate threshold of 5. An earlier draft used four 16-bit bands and claimed the same completeness at 5, which is false — four bands guarantee only distance 3, and `06_DATABASE.md` §6.3 gives a five-bit counterexample that all four bands miss.

Measure with `pytest --durations`, the browser performance panel, and a seeded database an order of magnitude larger than the demo set. Then put the measured numbers in, with the machine they came from.

---

## 9. WHAT THIS ARCHITECTURE ACTUALLY DEFENDS

One backend and one rules engine, so the same package cannot get two answers.

Nineteen rows on every scan, with a stated denominator and a mandatory reason on every abstention — so a package that could not be assessed can never be reported as compliant. This is the claim the whole design serves, and `10_TESTING.md` §4.5 is the test that proves it.

Measurement with an explicit scale and an explicit uncertainty, so a millimetre figure in a report can be defended, and a shortfall smaller than the instrument's error is reported as inconclusive rather than as a breach.

Evidence stored byte-for-byte and hashed from what was written, so `/verify` returns the truth on the first attempt by someone hostile.

An audit chain over ten fields including who acted and what changed, with the head published outside the database — so a wholesale rewrite by someone with write access still contradicts a value that left the building yesterday.

An engine verdict that cannot be edited, only overridden with a reason, so disagreement is recorded rather than hidden.

A catalogue date and hash on every scan, so what the law said when the assessment was made is fixed and auditable.

---

## 10. CORRECTIONS LOG — what version 1.1 got wrong

| # | Where | Defect | Now |
|---|---|---|---|
| 1 | §2.4, §3 | "5 tables" — `scan_images` and `findings` missing, so hashes and verdicts lived in JSON blobs | Seven tables; §2.4 |
| 2 | Throughout | `status Good/Bad`, `Passed/Violation/NA/Review`, "4 cards", "6-9 rows" | Three verdicts, four results, 19 rows, 5 cards |
| 3 | §2.2, §3.1 | `exp://LAN_IP:19000` | 8081 |
| 4 | §2.2, §7 | `AsyncStorage` for the JWT and offline data | `expo-secure-store` + `expo-file-system` |
| 5 | §2.1 | "localStorage for token" | Module-scoped variable; httpOnly refresh cookie |
| 6 | §2.2 | `expo-image-picker` installed then "disabled for Inspector" | Not installed |
| 7 | §2.2 | "Same JWT — login once, use both" | `install_id` binding; per-device login |
| 8 | §2.3 | `auth.py` at root **and** `routers/auth.py`; nested services against flat imports | Flat layout, one `password_handler.py` |
| 9 | §2.3 | `main.py` "create tables" | `alembic upgrade head`, with the reason |
| 10 | §2.3, §5 | CORS `allow_origins=["exp://*","http://192.168.*.*:19000"]` | `allow_origin_regex` |
| 11 | §2.5 | "blur Laplacian <100 reject" | Measured, stored, `not_assessed` |
| 12 | §2.5 | Preprocessing computed then `ocr.ocr(image_path)` | The array is passed |
| 13 | §2.5 | No scale concept at all; font checks with no reference length | `mm_per_pixel`, sources, uncertainty |
| 14 | §2.6, §3.1 | JSON rule files with per-field `violation_tier` | Python check functions; tier derived |
| 15 | §2.6 | 18 checks; halted checks skipped | 19 rows; halts carry a reason |
| 16 | §2.7 | Disclaimer hard-coded "as on 7 May 2026"; claimed "not FSSAI/MDR 2017" | Reads `rules_as_at`; corrected scope |
| 17 | §2.7 | `https://verify.niyamnetra.gov.in/{hash}` | `PUBLIC_BASE_URL`, localhost default, `https` real host in prod |
| 18 | §3.1 | One `Scan` per uploaded image | One scan, many `scan_images` |
| 19 | §3.1, §5 | `inspector@niyamnetra.gov.in` / `123456`; login by email | `@example.test`; login by `employee_id` |
| 20 | §3.3, §4 | `/admin/dashboard/stats`; four counts; violations parsed from JSON in Python | `/admin/dashboard`; five counts; SQL over `findings` |
| 21 | §4 | `GET /inspections?inspectorId=2` | Scope from the token; 404 not 403 |
| 22 | §4 | `PUT /admin/rules/{id}` — editable legal basis | Read-only catalogue with `catalog_hash` |
| 23 | §5 | `JWT_SECRET=niyamnetra_secret_2026_sih` printed in the document | No default; validator rejects weak values |
| 24 | §5 | Supabase and Cloudinary in the production path | Removed |
| 25 | §6 | "JWT 24h expiry" | 12-hour access + 30-day refresh |
| 26 | §6 | "PDF digitally signed with server key" — nothing signs a PDF | Removed; chain head in the QR |
| 27 | §6 | "Row Level Security in PostgreSQL" — single connection role | Application-layer authorisation |
| 28 | §6 | `scans.image_hashes`; `device_id` signature; 5 MB cap | `scan_images.sha256`; `install_id`; 25 MB |
| 29 | §7 | "Server wins if duplicate" | Review item, both copies retained |
| 30 | §8 | Four unmeasured performance figures | Design shape stated; measurement method given |
| 31 | §9 | "Rule versioning per 2017/2025/2026" enum | `rules_as_at` + `catalog_hash` + `engine_version` |
| 32 | §1, §2.3, §5 | Unfenced diagram, `python` and `bash` blocks with no fence at all | All fenced with language tags |

---

*End of System Architecture v2.0. The module layout here must match `Backend.md` §1.1, the schema `06_DATABASE.md`, the controls `09_SECURITY.md`, and the install commands `07_Tech_Stack.md`.*
