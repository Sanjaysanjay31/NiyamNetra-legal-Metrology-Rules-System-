# NiyamNetra — Project Overview

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Orientation & Single Entry Point

**Version:** 2.0 | **Date:** 30 Aug 2026 | **Supersedes:** 1.x (see §13 for the corrections log)
**Path:** C:\Skills\Projects\NiyamNetra\Docs\01_NiyamNetra_PROJECT_OVERVIEW.md
**Rules as at:** 2026-07-01
**Scope:** The official problem statement, our interpretation of it, the personas and workflows, the technology stack, a summary of the data and compliance models, the MVP boundary and non-goals, and a map to the authoritative documents.

---

## 0. How to read this document

This overview is the **map**, not the territory. It exists so that a reader — human or AI tool — can understand the whole system in one pass and then know exactly which document to open for detail. It deliberately summarises; it does not define.

Where this overview and a specialised document disagree, **the specialised document wins** and this file is the one to correct. In particular:

- The database schema of record is **`Backend.md` §4** (the SQLAlchemy models), mirrored in **`06_DATABASE.md`**.
- The exact compliance-check order, inputs and outputs are defined in **`03_NiyamNetra_Rules_Priority_Ordered.md`**.
- The legal text and its interpretation live in **`02_NiyamNetra_Rules.md`**.
- Security, authentication and the audit ledger are defined in **`09_SECURITY.md`**.

If you find a contradiction, treat it as a defect in whichever document is *less* specific — usually this one — and flag it rather than silently following the summary.

---

## 1. Problem statement (official)

The following is the official problem statement as published, reproduced without alteration of wording.

- **PS Number:** SIH26034
- **Title:** Software System to check compliance of Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011 by scanning products, images and labels.
- **Organization:** Ministry of Consumer Affairs, Food & Public Distribution
- **Department:** Department of Consumer Affairs
- **Theme:** Miscellaneous
- **Category:** Software
- **Dataset / reference:** https://consumeraffairs.gov.in/pages/legal-metrology-act and the Legal Metrology (Packaged Commodities) Rules, 2011 (GSR 202(E) dated 07.03.2011, as amended)

### 1.1 Background (official)

- Packaged commodities are widely sold via retail stores, supermarkets and e-commerce across India.
- Under the Legal Metrology Act 2009 and the Packaged Commodities Rules 2011, every package must bear mandatory declarations: name and address of the manufacturer / packer / importer, net quantity, Maximum Retail Price (MRP), month and year of manufacture / packing / import, consumer-care details and other prescribed declarations, in the specified format and manner.
- These declarations ensure transparency, fair trade and consumer protection.
- Because of the large volume and variety of packages, manual inspection by enforcement agencies is time-consuming and resource-intensive.
- Non-compliance — missing declarations, incorrect font sizes, improper MRP — is observed frequently.

### 1.2 Description (official)

- Develop a software application capable of scanning packaged-commodity labels, product images and product information to automatically assess compliance with the LM (Packaged Commodities) Rules 2011.

### 1.3 The system should be capable of (official — 8 points)

- Scanning and analyzing images of packaged commodities.
- Detecting mandatory declarations prescribed under the LM rules.
- Checking correctness, completeness and placement of declarations.
- Identifying missing or non-compliant declarations.
- Checking readability and font-size requirements.
- Generating compliance reports and violation summaries.
- Maintaining a repository of scanned products and compliance history.
- Providing dashboards for enforcement officials.

### 1.4 Expected solution (official — 7 points)

- A user-friendly web and/or mobile software application.
- Automated extraction and validation of mandatory declarations.
- Rule-based compliance checking for the LM (Packaged Commodities) Rules 2011.
- Generation of digital compliance reports in PDF and editable formats.
- A dashboard for monitoring inspections, violations and product-compliance details.
- Search and retrieval of previously scanned products and reports.
- Technical documentation describing the software architecture and deployment framework.

### 1.5 Key functional requirements (official — 10 points)

- Image upload and product-scanning functionality.
- Extraction of declarations from labels and detection of mandatory declarations.
- Font-size and readability analysis.
- Detection of missing, misleading or non-standard declarations.
- Generation of compliance / non-compliance reports.
- Attachment of photographs and supporting evidence.
- A repository of scanned products and inspection history.
- Role-based user access and secure authentication.
- A dashboard for monitoring compliance status and enforcement activities.
- Export of reports to PDF and editable formats.

---

## 2. Our interpretation and solution

### 2.1 The problem, concretely

An enforcement officer may visit dozens of shops in a day. Each shop stocks ten to twenty packaged products, and each product carries six to nine mandatory declarations under Rule 6, a font-size requirement under Rule 7 Table-I, a placement requirement under Rule 8 and a manner-of-declaration requirement under Rule 9. Reading small print on a transparent bottle or a curved, glare-prone pouch is slow and error-prone; paper reports are easily lost; and there is no systematic way to detect repeat offenders across visits.

### 2.2 What NiyamNetra is

NiyamNetra is an offline-capable Legal Metrology inspection assistant with three parts that share one backend:

- A responsive web **Portal** (React + Vite, PWA) used by Admins and Inspectors on desktop.
- A **field app** (Expo / React Native, packaged as an Android APK) used by Inspectors to scan products in the field and by Admins to monitor on the move — the role is selected by the account at login. Build prompts are in `Frontend_App_prompts.md`.
- A single **FastAPI backend** serving both, runnable without Docker.

The end-to-end flow: an inspector authenticates, creates an inspection (shop, GPS, date, product category), captures package photos with on-device quality checks, and the system reads the label with a local offline OCR pipeline. It extracts MRP, net quantity, dates, manufacturer address, batch and consumer-care fields with confidence scores and bounding boxes, then runs the rule engine. The engine returns a per-check verdict with the governing rule reference and an image crop as evidence. The officer reviews every flagged item, accepts or overrides it with a reason and optional extra photo, and submits an official record written to an append-only audit ledger. The system then generates PDF and Word reports containing the product details, the checklist, the annotated evidence images, the officer's remarks, a timestamp and a QR code for verification.

### 2.3 What NiyamNetra is *not*

This is **not** a food-quality or food-safety tool. It does not test ingredients, contamination, freshness, taste or adulteration. It checks only consumer-information and package-declaration compliance under the LM Rules 2011 — whether the required information is present, readable, correctly formatted and supported by photographic evidence. Food-specific labelling under FSSAI and medical-device labelling under MDR 2017 are out of scope and are declared as such on every report.

### 2.4 The verdict vocabulary (canonical)

Two small vocabularies are used consistently across the whole system. Getting them right matters, because "we could not tell" is not the same as "it passed."

- **Per-check verdict** — every individual check resolves to one of three states: `pass`, `fail`, or `not_assessed` (the input needed to decide was missing or too low-confidence).
- **Per-scan result** — a whole scan resolves to one of four states: `compliant`, `violation`, `not_assessed`, or `out_of_scope` (a gate such as small-package or industrial-pack exemption removed the package from assessment).

The engine never invents a pass. If a declaration could not be read, the check is `not_assessed` and the scan cannot be `compliant` until it is resolved. The exact resolution rules live in `03`.

### 2.5 Design principle

The AI produces a **recommendation, not a legal verdict.** The officer reviews every flagged item, accepts or overrides it with a reason, adds remarks and submits the official record. Every such action is written to the hash-chained audit ledger, so the human decision — not the model output — is what the record attests to.

### 2.6 What sets this apart

- **Stores-visited tracking**, not just a scan count: a `stores` table plus a calendar date picker gives a genuine coverage metric.
- **A court-oriented evidence chain**: SHA-256 per image, GPS, an append-only hash-chained ledger and QR verification.
- **Offline-first**: the PWA and field app keep working where there is no network, and sync when connectivity returns.
- **Rule versioning per inspection**, so amendments (2017, 2025, 2026) are handled without rewriting history.
- **Adversarial analysis**: ninety documented loopholes, each with an optimised solution implementable inside the offline, zero-paid-API stack (see `12`).

---

## 3. Project identity

- **Name:** NiyamNetra — *Niyam* (rule) + *Netra* (eye) = "the eye of the rules," the eye that watches whether the rules are followed. Sanskrit, easy to pronounce, with a government feel and a startup polish.
- **Tagline:** *The AI Eye for Legal Metrology Compliance.*
- **Logo concept:** an eye icon with a weighing scale inside it, the pupil formed by a packet outline; outer ring in Niyam Blue `#0F2A44`, inner in Netra Teal `#0E7490`, a saffron accent dot `#F59E0B` at the top-right — an eye watching a packet. See `08_UI_DESIGN.md` for the design system.
- **Domain (future):** niyamnetra.gov.in

## 4. Users and personas

**Inspector (Legal Metrology field officer).** Works on an Android phone in shops, warehouses and markets, often with poor network and one hand free. Needs a fast scan (a few seconds), a clear compliant / violation / needs-review outcome with image evidence, minimal typing, offline operation and Hindi/English labels. The core pain is reading small print on transparent or curved packaging under glare.

**Admin / Controller (state or central).** Monitors many inspectors, primarily from a desktop and, on the move, from the field app's read-mostly admin module. Needs a dashboard with total inspections, violations by type, trends over time, repeat-offender tracking by manufacturer / brand / area, user management, rule-version management and court-ready export. The core pain is a lack of visibility into the field, lost paper reports and no pattern detection.

**Consumer (future phase, optional).** Would scan a public QR to verify a product and could raise a challenge. Excluded from the MVP to keep the field app lightweight; shown as Phase 2 in the pitch.

---

## 5. Workflows

### 5.1 Inspector / enforcement-officer workflow (field — Portal + field app)

1. **Secure login.** The inspector signs in with their `employee_id` and password; the server issues a short-lived access token and a longer-lived refresh token, and binds the session to a server-issued `install_id`. The system records who is performing the inspection.
2. **Start inspection.** The inspector creates an inspection record: shop / establishment name, GPS auto-filled from the device (with manual correction), the date from server time, and a product-category selection that surfaces the relevant Second-Schedule hint. Seller details are optional.
3. **Capture evidence.** The inspector captures package photos — typically front, back, side and the price/date panel with barcode — using an on-screen guide box with real-time blur / glare / framing feedback and a burst mode that keeps the sharpest frame.
4. **Identify product and batch.** The app reads the barcode and the label text, then compares product name, variant, pack size, batch/lot code, MRP and date against earlier scans using a perceptual-hash lookup and the batch number. A likely duplicate is flagged for review but a genuinely new batch is still allowed.
5. **Extract declarations.** The image pipeline (crop to the principal display panel, deskew, contrast-enhance) feeds the offline OCR, which returns visible text with confidence and bounding boxes. The backend parses MRP, quantity, date, address, consumer care and batch into structured fields.
6. **Run compliance checks.** The rule engine runs the eighteen checks in their defined order — gates first (small-package and industrial-pack exemptions), then the Rule 6 field checks, then Rule 7 font size, then Rule 8/9 — producing a per-check verdict and an overall scan result, plus a violation tier where applicable. See `03`.
7. **Review findings.** The officer sees a checklist, one row per check (nineteen rows in total), each showing `pass` / `fail` / `not_assessed`, a link to the annotated image crop, a confidence badge and the governing rule reference (for example, "MRP missing — Rule 6(1)(e)").
8. **Decide and submit.** The officer confirms or overrides each flagged item with a reason and remarks, attaches any extra photos, and submits. The submission and every override are written to the append-only audit ledger.
9. **Generate report.** The system produces a PDF (ReportLab) and an editable Word document (python-docx) containing the product-details table, the colour-coded checklist, the annotated evidence images, the findings, the remarks, a timestamp, a QR code linking to the verification view, and the scope disclaimer.

### 5.2 Admin / Controller workflow (desktop Portal)

- **Monitor the dashboard.** Total inspections; compliant / violation / needs-review counts; top violation categories; recent activity; and trends by period, location, brand and category.
- **Review inspection records.** Open a submitted inspection to examine the original images with zoom and bounding boxes, the raw OCR text, the rule results, the officer's remarks, the generated documents and the audit timeline.
- **Track repeat patterns.** Search the repository by manufacturer, packer, product, shop, region or declaration type to surface recurring violations.
- **Manage users and access.** Create or deactivate Inspector / Admin accounts, assign an area, manage the `install_id` binding, and ensure each user sees only permitted screens.
- **Manage rule versions.** Update the JSON rule set when the law changes, keeping effective dates and history, and record which version was used for each inspection.
- **Export and audit.** Download PDF / Word and CSV; the audit log shows who created, reviewed, changed or approved each record, with `hash_prev` / `hash_self` and the source IP.

### 5.3 Consumer workflow (future Phase 2 — not in the MVP)

Scan a public QR on the shelf, see any mismatch between the official result and the consumer's own scan, and file a challenge. Shown as Phase 2 to explain why the public role is out of the MVP.

## 6. Technology stack

Detailed, version-pinned install instructions live in `07_Tech_Stack.md`. This is the summary.

**Frontend Portal (Inspector + Admin, one responsive codebase).** React 18 + Vite 5, Tailwind CSS 3.4, Lucide icons, React Router 6, Recharts for the Admin charts, `vite-plugin-pwa` for offline-first behaviour (service worker + IndexedDB), and Axios with a Bearer-token interceptor to the FastAPI backend.

**Field app (Inspector scan + Admin monitoring).** Expo SDK 54 with `expo-camera` for live capture (inspectors only), React Navigation 6, `expo-secure-store` for the install-bound refresh token, and an on-device offline queue (persisted with `expo-file-system`) that flushes to the backend when connectivity returns. There is no gallery picker in the inspector build — evidence is captured live, not uploaded from an album. The role is chosen by the account at login: inspectors get the capture flow, admins get a read-mostly monitoring module with no camera. Build prompts are in `Frontend_App_prompts.md`.

**Backend (single API for both).** FastAPI 0.110 + Uvicorn, Pydantic 2.6 (settings are `extra="forbid"`), SQLAlchemy 2.0 as the ORM, and Alembic for migrations. Authentication uses PyJWT with Passlib/bcrypt for password hashing.

**AI / OCR engine.** OpenCV for pre-processing (crop to the principal display panel, deskew, contrast enhancement, blur and glare detection); PaddleOCR as the primary offline English + Hindi engine, with Tesseract as a fallback; optional YOLO-based label detection once the core works.

**Rule engine.** Python regular expressions for the field patterns (MRP, quantity, date) plus JSON rule files carrying `source_act`, `rule_reference`, `effective_date`, `violation_tier` and scope flags, loaded at startup. spaCy is optional for address / phone extraction if regex proves insufficient.

**Database and storage.** SQLite for development (a single file, zero setup) and PostgreSQL for production — the same SQLAlchemy code, with `DATABASE_URL` the only change. Uploaded images and generated reports are stored on the local filesystem, each image carrying a SHA-256 hash. There is no object-store dependency in the MVP.

**Reports.** ReportLab for PDF and python-docx for the editable Word document, each with the annotated evidence images and a QR verification code.

The schema is always created and evolved with Alembic, never by `Base.metadata.create_all()`, because the latter skips the CHECK constraints and triggers that enforce the compliance invariants:

```bash
# one-time, and after every model change
alembic upgrade head
```

The three processes run in three terminals, without Docker:

```bash
# Terminal 1 — backend
cd backend && alembic upgrade head && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Portal
cd niyamnetra-portal && npm install && npm run dev

# Terminal 3 — field app
cd niyamnetra-app && npm install && npx expo start
```

Binding the backend to `0.0.0.0` lets the field app reach it over the LAN. Note that `--workers > 1` is a PostgreSQL-only option: on SQLite the single-writer model and the audit-sequence allocation require a single worker.

### 6.1 Authentication summary

Authentication is defined in full in `09_SECURITY.md`; the shape is:

- Login is by **`employee_id`**, not email — officers are provisioned by ID.
- The session is bound to a server-issued **`install_id`** (32 random bytes), not a device IMEI or client-supplied ID.
- Tokens: a **12-hour** access token and a **30-day** refresh token, with a per-user **`token_epoch`** so an administrator can invalidate all of a user's sessions at once.
- There is deliberately **no `failed_logins` / `locked_until`** lockout, because a lockout keyed on a named officer's ID would let an attacker deny that officer access. Rate-limiting per `employee_id` and per IP is used instead.

## 7. Data model (summary)

The schema of record is `Backend.md` §4 (the SQLAlchemy models), mirrored table-for-table in `06_DATABASE.md`. There are **seven tables**:

| Table | Purpose |
|-------|---------|
| `users` | Officers and admins; login by `employee_id`, role, area, active flag, `token_epoch`. |
| `stores` | Establishments visited, with location and a visit count — the basis of the coverage metric. |
| `inspections` | One visit: store, inspector, date, category, scope flags, status, rule version, overall result. |
| `scans` | One product within an inspection: extracted fields, the four-state result, batch, PDP area, violation tier. |
| `scan_images` | Individual photos: filesystem path, SHA-256, and the perceptual-hash bands (`phash_b0`…`phash_b7`). |
| `findings` | One row per check per scan (nineteen rows), each with a `pass` / `fail` / `not_assessed` verdict, the rule reference, the `limb`, and any override reason. |
| `audit_logs` | The append-only ledger: `action`, old / new value, reason, timestamp, IP, `hash_prev` and `hash_self`. |

Two schema facts are worth stating in the overview because they are easy to get wrong:

- **Duplicate detection uses eight 8-bit perceptual-hash bands** (`phash_b0`…`phash_b7`). Splitting a 64-bit hash into *k* bands gives a *complete* near-duplicate filter — an `OR` across the band columns that misses nothing — only while the Hamming distance `d ≤ k − 1`. The near-duplicate threshold is 5, so eight bands (complete through distance 7) are required. An earlier design used four 16-bit bands and claimed completeness at distance 5 "by the pigeonhole principle"; that is false — four bands are complete only through distance 3. See `06_DATABASE.md` §6.3.
- **The audit ledger genesis row** stores `hash_prev = NULL` but hashes the literal string `"0"` (the `GENESIS_PREV` constant). The write path and the verify path must use the identical substitution, or verification of the first row fails.

The indexes that keep the "Today's Report" queries fast, the six reporting queries, and the trigger definitions are in `06_DATABASE.md`.

---

## 8. Compliance model (summary)

The engine runs **eighteen checks**, producing **nineteen findings rows** — `CHK01` through `CHK18`, plus `CHK06b` (a net-quantity-specific minimum-height sub-check that reports under `CHK06`). The full order, inputs, preconditions and short-circuit conditions are in `03_NiyamNetra_Rules_Priority_Ordered.md`; the check IDs are stable and are referenced by `04`, `06` and `10` — they must not be renumbered.

Not every check applies to every scan. A camera scan of a physical package runs the `PACKAGE` and `OPERATOR` checks; the `LISTING` and `PLATFORM` checks (`CHK15`, `CHK16`) assess a web listing and a marketplace and are run from a separate URL-scan entry point in the Portal. A report therefore states which set ran — for example, "16 of 18 checks — package scan" — and never presents a package scan as a full eighteen-check audit. A short-circuit (an exemption gate firing) still accounts for all eighteen checks by marking the remainder `not_assessed`, so a report is never silently truncated.

---

## 9. Legal basis (summary)

The authoritative legal reference is `02_NiyamNetra_Rules.md`; this is the orientation.

- **Parent Act:** the Legal Metrology Act 2009, under which Section 52 empowers the 2011 Rules. The Jan Vishwas amendments (2023 and 2026) move a range of offences toward a fine-only / improvement-notice regime; Section 36 sets the improvement-notice-then-penalty structure. This overview does not print penalty amounts — they change with amendment and are stated, with their effective dates, only in `02`.
- **Core 2011 Rules:** Rule 6 (the mandatory declarations), Rule 7 (the single Table-I font sizes, effective 01.01.2018), Rule 8 (clear space / placement), Rule 9 (manner of declaration), Rules 11–13 (net quantity), Rule 3 (applicability) and Rule 26 (small-package exemptions).
- **Amendments tracked:** GSR 629(E) 2017, the 2025 medical-devices amendment, and the e-commerce country-of-origin filter under Rule 6(10A) from 01.07.2026 (GSR 128(E), 13.02.2026).
- **Schedules:** the Second Schedule (standard pack sizes), the Sixth (corrected average, `Xc = avg + σ × C`) and the Seventh (report forms A/B).
- **Scope boundary:** food-specific labelling (FSSAI) and medical-device labelling (MDR 2017) are out of scope and are declared as such on every report.

## 10. Repository and reports

The repository is searchable by product, brand, manufacturer, shop, region, date, result and rule version. Every scan retains its image paths with SHA-256 hashes, the raw OCR text, the extracted fields, and the per-check findings with their evidence bounding boxes. Reports are generated as PDF (ReportLab) and editable Word (python-docx), each carrying the annotated evidence images and a QR code that links to a verification view keyed on the record's ledger hash. The MVP does **not** digitally sign the PDF — integrity is established by the hash-chained ledger and the QR verification, not by an embedded signature.

---

## 11. MVP scope and non-goals

**In scope for the hackathon MVP.** Demonstrate the full path for two categories (biscuits and personal care): validate the high-value declarations (MRP, net quantity, date, manufacturer, consumer care), group by batch, run officer review with override, generate PDF and Word reports, provide searchable history, and show the Admin dashboard with charts and a calendar-driven "Today's Report" that includes the stores-visited count.

Font size is a **phased capability with a risk flag**, not an exact-millimetre verdict, until on-image calibration is complete — the report shows, for example, "Font risk: estimated 1.2 mm, ~2.5 mm required — verify with a scale," referencing Rule 7 Table-I.

**Non-goals (explicitly out of scope).**

- Food quality, safety, ingredients, contamination or adulteration testing.
- FSSAI food-labelling checks and MDR 2017 medical-device labelling verdicts.
- The public/consumer role (Phase 2).
- Any paid or cloud OCR/AI API — the pipeline is fully offline.
- Digital signing of report PDFs (integrity is via the ledger + QR).

---

## 12. Related documents

This set is the single source of truth. Each document owns its domain; this overview only points to them.

| Document | Owns |
|----------|------|
| `02_NiyamNetra_Rules.md` | The legal reference — Act, Rules 1–34 and Schedules. |
| `03_NiyamNetra_Rules_Priority_Ordered.md` | The executable check order — the eighteen checks / nineteen rows. |
| `04_NiyamNetra_PRD.md` | Product requirements — goals, personas, user stories, functional and non-functional requirements, API surface, acceptance criteria. |
| `05_SYSTEM_ARCHITECTURE.md` | The tiers, data flows, deployment and offline behaviour. |
| `06_DATABASE.md` | The schema narrative and DDL, mirroring `Backend.md` §4. |
| `07_Tech_Stack.md` | Version-pinned install commands for every tool. |
| `08_UI_DESIGN.md` | The design system — colours, components and every screen. |
| `09_SECURITY.md` | Threats, authentication, authorization and the audit ledger. |
| `10_TESTING.md` | Test strategy and the concrete test suite. |
| `11_working_overflow.md` | Overflow / edge-case scenarios. |
| `12_SIH26034_NiyamNetra_loopholes.md` | Ninety loopholes, each with an optimised solution. |
| `14_env_example.md` | Every environment variable, its source and what breaks without it. |
| `Backend.md` | The backend implementation and the **schema of record** (§4). |
| `Frontend_Portal_Prompts.md` | Portal build prompts. |
| `README.md` | The repository entry point. |

---

## 13. Corrections log — what earlier versions got wrong

Version 2.0 is a full rewrite. The substantive corrections against v1.x:

- **Verdict vocabulary.** Replaced the binary "Good/Bad" with the canonical three-state check verdict (`pass` / `fail` / `not_assessed`) and four-state scan result (`compliant` / `violation` / `not_assessed` / `out_of_scope`).
- **Check count.** Corrected "18 checks" as a scan count to "eighteen checks, nineteen findings rows" (CHK01–CHK18 + CHK06b), and noted that a package scan runs 16 of 18.
- **Tables.** Corrected "5 tables" to the actual **seven** (`users`, `stores`, `inspections`, `scans`, `scan_images`, `findings`, `audit_logs`).
- **Perceptual hash.** Replaced the false four-band pigeonhole claim with the correct eight 8-bit bands and the `d ≤ k − 1` completeness bound.
- **Ledger column.** Corrected `hash_current` to `hash_self`, and documented the `GENESIS_PREV = "0"` genesis-row rule.
- **Authentication.** Removed "government SSO + OTP," email login, "24h JWT" and `device_id` binding; stated the actual model (login by `employee_id`, server-issued `install_id`, 12h/30d tokens, `token_epoch`, no lockout).
- **Penalties.** Removed printed rupee penalty amounts; penalty figures live only in `02` with their effective dates.
- **Branding.** Removed the "PackSure AI" alternate name and the "Winning Solution" framing.
- **Stack.** Removed MinIO (local filesystem instead) and PDF digital signing (ledger + QR instead); added Alembic and the `alembic upgrade head` rule.
- **Dangling reference.** Removed the reference to the deleted `13_…_prompt_for_full_development…` document.
- **Authority.** Inverted the old supremacy clause: this overview defers to the specialised documents rather than overriding them.
- **Formatting.** Fixed broken single-space list nesting throughout, added fenced code blocks and tables, and broke up over-long lines.

---

**End of Project Overview.** This document is an orientation map. It defers to the specialised documents named in §12; where it disagrees with them, they are authoritative and this file is the one to correct.
