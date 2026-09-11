# NiyamNetra — Product Requirements Document

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Legal Metrology compliance scanner

**Version:** 2.0 | **Date:** 30 Aug 2026 | **Supersedes:** 1.1 (see §15 for the corrections log)
**Scope:** Goals and non-goals, personas, user stories, functional and non-functional requirements, data model, API surface, acceptance criteria, milestones, risks

---

## 1. EXECUTIVE SUMMARY

**The problem.** A Legal Metrology officer inspecting a retail shelf must check every packaged commodity against the mandatory declarations in Rule 6 of the Legal Metrology (Packaged Commodities) Rules 2011, and must check that each declaration is printed at the minimum character height set by Rule 7 Table-I for that package's principal display panel area. The declarations part is tedious. The typography part is close to impossible by eye — the thresholds are 1.0 mm to 6.0 mm and the officer is holding a sachet in a shop with poor light. Reports are paper, so patterns across shops and manufacturers are invisible.

**The product.** NiyamNetra is a responsive PWA plus an Expo field app over a FastAPI backend, with local OCR and a deterministic rules engine. It photographs the panel, rectifies it, establishes a millimetre-per-pixel scale from a known reference, reads the declarations, runs nineteen checks, and produces an evidence-backed PDF and DOCX with every finding cited to its provision. Every image is stored byte-for-byte and hashed; every action is appended to a verifiable chain.

**The engine recommends and the officer decides.** That is not a disclaimer, it is the architecture: the engine's verdict is written once and can never be edited, only overridden with a recorded reason, and both verdicts appear side by side in the report.

### 1.1 What "good" means for this product

The product's central claim is negative, and it is the reason to trust it: **NiyamNetra will not report a package as compliant unless every assessable check for its scan type was actually assessed (`assessed == total`).** A package scan without a listing honestly reports 16/18 (CHK15/CHK16 `not_assessed`) and resolves `not_assessed`, never `compliant`; with a listing the denominator is 18/18. Where it cannot assess something — no scale reference in the frame, glare across the declarations, a statutory threshold the project has not been able to verify against a primary source — it says so, names the reason, and puts the scan in a review queue.

The alternative product, the one that reports a clean verdict on an unreadable photograph, is worse than no product. Its output goes into an enforcement record over an officer's name, and nobody audits a pass.

### 1.2 Success metrics

| Metric | Target | How measured |
|---|---|---|
| Time per package | Under 3 minutes end to end, against roughly 15 manually | Stopwatch, ten packages, one officer |
| Scans reported compliant while any check was unassessed | **Zero** | Asserted by the test suite, not sampled |
| Abstentions carrying an actionable reason | 100% | Database CHECK constraint plus test |
| Evidence files that rehash to their recorded digest | 100% | `GET /scans/{id}/verify` over the whole corpus |
| Findings rows per scan | Exactly 19, always | Import-time assertion plus test |
| Paid or hosted AI dependencies in the core path | Zero | Dependency list |

No accuracy percentage appears here. Version 1.1 promised "detection accuracy 85%+" before a line of the engine existed. Nobody has run this against a labelled corpus, a single figure over nineteen unrelated checks would be meaningless even if measured, and an unsubstantiated accuracy claim about evidence quality is the same defect as citing a provision you have not read. See `10_TESTING.md` §12 for what may and may not be said in the submission.

---

## 2. GOALS AND NON-GOALS

**Goals.**

Detect, extract and validate the Rule 6 declarations from a photograph of the principal display panel. Measure character height, width ratio and clear space against Rule 7 Table-I and Rules 8 and 9, with an explicit scale and an explicit uncertainty. Determine scope correctly before assessing anything — Rule 3 exclusions, the Rule 26(a) small-package exemption, and the medical-device routing under the proviso to Rule 2(h). Produce a report that cites each finding and discloses every abstention. Maintain a searchable repository and a supervisory dashboard. Enforce role-based access and an append-only audit trail whose head is published outside the database.

**Non-goals for this version, each with the reason.**

*Verifying the net quantity itself.* The engine checks how the quantity is **declared** — units, qualifiers, prohibited words, character height. Whether the packet actually contains 500 g requires a calibrated weighing instrument and the Rule 5 error tolerances, which is ledger entry L-03 and unverified. A camera cannot weigh anything, and a tool that implied otherwise would invite exactly the challenge that discredits it.

*Full FSS Act compliance.* CHK17 reports the presence or absence of an FSSAI licence number as an **advisory observation only**. The FSS Act is not administered under the Legal Metrology Act, so a missing FSSAI number cannot be a Legal Metrology finding, and the engine will never return `fail` on that check.

*Full Medical Devices Rules 2017 assessment.* CHK14 detects a medical device and routes it. The declaration checks in phase 2 still run where they apply; the phase 3 typography checks return `not_assessed` because Table-I is not the applicable standard. The scan is not silently marked out of scope in its entirety.

*Counterfeit and content authenticity.* The system reads the label. It does not judge whether the label is genuine.

*Image forensics.* Deliberately excluded. Error-level analysis and similar techniques have a false-positive rate on ordinary JPEG re-encoding that makes them unusable as evidence, and an accusation of tampering is not something to generate probabilistically. Integrity comes from the hash and the chain instead.

*Generative upscaling of any kind.* A super-resolution model asked to sharpen a 2 mm character invents plausible glyph edges. Measuring an invented edge and reporting a millimetre figure is fabricated evidence, whatever the intent.

---

## 3. PERSONAS

**Inspector — Legal Metrology Officer, field.** Late twenties to mid forties, Android phone, works in shops, godowns and weekly markets, frequently with no usable network. Needs a capture that takes seconds, a result they can read at a glance, and no typing. Their real pain is small print on a transparent bottle, a curved sachet, glare from a tube light, and the knowledge that a font-height judgement made by eye will not survive being questioned.

What they need from this product that no manual process gives them: a number with an uncertainty attached, and a record that the photograph has not changed since they took it.

**Admin / Controller — desktop, office.** Mid thirties to mid fifties, oversees dozens of officers. Needs trends, repeat-violator patterns by manufacturer and area, user management, and an export that holds up in a hearing. Needs to see which scans could not be assessed and why, because that number is a measure of field conditions and of training needs, not a failure to hide.

**Consumer — future phase, not in this version.** A consumer scanning the QR on a report verifies the **integrity of that record** — that the document corresponds to a chain entry that has not changed. It is not a public pass/fail lookup on a product, and framing it that way would imply an official endorsement the project does not have.

---

## 4. USER STORIES

**Inspector.**

I log in with my **employee ID** and password, on the device issued to me. The token is bound to that install, so a copied token is useless elsewhere.

I record the scope of the transaction *before* I photograph anything — retail or wholesale, the commodity category, whether the pack exceeds 25 kg or 25 L, whether it is a medical device. Asking me afterwards means the app has already assessed something it should not have.

I capture the front, back, MRP panel and batch panel through a guide box, with the camera as the only source. There is no gallery button, so nobody can suggest I photographed a screenshot.

I put a reference of known size in the frame — my ID card or a ₹5 coin — or I enter the panel height, so that a millimetre figure means something. If I skip this, the app tells me plainly which checks will come back unassessed.

The extracted fields appear with confidences and I correct what the OCR misread rather than typing everything.

I see **all nineteen checks**, grouped by phase, each with its verdict, what was observed, what the rule requires, and — where the engine abstained — the reason. Abstentions look different from failures, because they are different.

I can override any finding with a reason. The engine's original verdict stays visible beside mine.

I see today's work: stores visited, scans by each of the four results, and a date picker for earlier days.

I generate a PDF and an editable DOCX with the evidence images, the findings, my remarks, the timestamp and a verification QR.

I work with no network. My captures queue locally and sync when I have signal, and anything I edited while offline stays marked as such so my supervisor knows.

**Admin.**

I see five counts on the dashboard — compliant, violation, not assessed, out of scope, total — because four counts would make me guess the fifth and guess it wrong.

I see a review queue whose badge always matches its contents, and I work it.

I search the repository by manufacturer, product, shop, region, date and result to find repeat patterns.

I open any submitted inspection and see the original images, the extracted text, all nineteen findings read-only, the engine verdict beside any override, and the full audit timeline with old value, new value and reason.

I manage users — create, deactivate, assign area, see which install each account is bound to, and force re-authentication everywhere by incrementing that user's token epoch.

I **view** the rule catalogue with its effective dates and its hash. I cannot edit it, and I should not be able to: editing the catalogue would change the legal basis of inspections already recorded.

I verify the audit chain on demand and compare its head against the value published yesterday.

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Authentication and access control

Login by employee ID and password, bcrypt-hashed, 12-character minimum for new accounts and 8-character minimum at login. A 12-hour access token held in client memory only; a 30-day refresh token in an httpOnly cookie on the web (`SameSite=Strict` locally, `SameSite=None; Secure` in prod cross-site) and in the platform keystore on the phone. Every token carries `install_id`, `jti` and `token_type`, and `token_type` is checked on every decode — without it a refresh token is accepted as an access token and the twelve-hour limit silently becomes thirty days.

Two roles: Admin and Inspector. An inspector's scope is derived from their token by the server, never from a request parameter.

Device binding by a server-issued random 32-byte `install_id` stored in the platform keystore. Not IMEI, which apps cannot read on Android 10 or later.

Revocation by `token_epoch` on the user row: incrementing it invalidates every live refresh token for that account immediately. Refresh rotation is single-use with reuse detection — each refresh consumes its `jti`, and replaying a consumed `jti` is treated as theft and kills every session for that user.

Requests for a record the caller may not see return **404**, not 403, so the endpoint cannot be used to enumerate which records exist.

Government SSO is not implemented and is not claimed. Version 1.1's stories opened with "login with government SSO + OTP", which no part of the system does; a requirement nobody can build is not a requirement, it is a decoration on the document.

### 5.2 Inspection management

Create an inspection against an existing store (`store_id` only) with transaction type (`retail_sale`, `wholesale`, `institutional`, `industrial`, `packed_in_presence`, `export`, `other`), GPS coordinates and accuracy, and server-side date. New stores are created separately via `POST /stores` (admin-only). Scope intake happens here, before capture. Signature status is `signed`, `refused` or `unavailable`; scale source is `declared`, `id1_card`, `coin_5inr` or `none`.

GPS is **recorded, never enforced**. A geofence sounds like an anti-collusion control and is not one: assisted location in a concrete-walled godown is routinely hundreds of metres out, so a hard block stops real inspections while a determined bad actor spoofs the fix anyway. The coordinates and the reported accuracy are stored and shown to the reviewer.

Batch grouping compares barcode, batch code, MRP and date against earlier scans in the same inspection. A near-duplicate is flagged for review and the record is kept; it is never rejected and never silently merged.

Status: draft → submitted (the only two stored states; `signature_status` is separate).

### 5.3 Capture and evidence

Camera only for inspectors; `expo-image-picker` is not installed at all, rather than installed and disabled.

One scan carries images for the canonical panels — `front`, `back`, `side`, `mrp`, `batch`, `other` (`ALLOWED_PANELS` in `routers/scans.py`) — all attached to **one** scan. Barcode is a `Scan.barcode` field decoded by pyzbar, not a panel; `principal` is not a valid panel. Version 1.x created a scan per image, so a package photographed on four panels became four packages with four verdicts, three of them missing most declarations and therefore three spurious violations from one compliant pack.

Blur, darkness, glare and panel completeness are **measured and recorded**, never grounds for rejection. The measured value goes into the reason of every check it affects. An HTTP 400 here discards the capture, the GPS fix and the officer's trip to the shop, and leaves no trace that an unreadable package was found — which quietly biases every statistic toward the photogenic subset of the field.

On-screen guidance: guide box, roughly 15 cm working distance, dark backing for transparent packs, slight tilt to move glare off the print, hold steady.

Every stored image is byte-identical to the upload — no resize, no re-encode, no EXIF strip — and its SHA-256 is computed by reading the file back off disk after writing it. Any transformation between hashing and writing means the digest can never be reproduced from the stored file, so verification reports tampering on evidence nobody touched. `GET /scans/{id}/verify` recomputes every hash on demand.

Uploads are capped at 25 MB with a decompression-bomb guard. Not 5 MB with a forced downscale: the pixels are what the millimetre measurement is computed from, so downscaling before measurement destroys the only thing the measurement depends on.

### 5.4 Scale and measurement — the requirement version 1.1 did not have

No millimetre verdict may be reached without a scale reference. A camera has no absolute scale: two photographs of the same 2.5 mm character at different distances give different pixel heights. Version 1.1 asked for "font height per Table-I" with no mention of how a millimetre would be obtained from a photograph, which is the one part of this product that is genuinely hard.

The panel is rectified onto a flat plane by four-point homography. `mm_per_pixel` is derived from one of three sources, each with its own uncertainty: an ISO/IEC 7810 ID-1 card (85.60 mm long edge, about 2%), a ₹5 coin (23 mm, about 5%), or the operator-declared panel height. Where the panel occupies fewer than 400 pixels of height, or residual tilt exceeds 15°, no scale is established and the phase 3 checks return `not_assessed`.

Measurements are reported with their uncertainty — "2.1 mm ± 0.3 mm against a 2.5 mm minimum" — and a measurement falling inside its own uncertainty band of the threshold returns `not_assessed`, not a breach. A prosecution cannot rest on a difference smaller than the instrument's error, and asserting one invites the first defence lawyer to discredit the whole tool.

### 5.5 OCR and extraction

OpenCV preprocessing — rectify, deskew, CLAHE — feeding the **resulting array** to the OCR engine. PaddleOCR as primary, English and Hindi, models cached locally at setup so the path needs no network. Tesseract as fallback, then OCR.space as an optional fallback when local OCR is absent (slim Render deploy, `OCR_SPACE_API_KEY`). YOLOv8 optionally locates the panel so OCR ignores the shelf behind it.

No hosted LLM, anywhere, for any reason. Version 1.1 listed "optional Gemini Vision for transparent/curved/stylized" and repeated it as a risk mitigation. Three independent objections, each sufficient: the venue network cannot be relied on, so it fails live; evidence in an enforcement file cannot be sent to a third-party endpoint that may return different wording on the same image next month; and a generative model asked to read an illegible label produces a *plausible* reading rather than reporting that it cannot read one — manufacturing precisely the false confidence this product exists to eliminate.

Extracted fields: commodity name, manufacturer/packer/importer name and address, country of origin, net quantity value and unit, MRP, month and year of manufacture, best-before or use-by, consumer care phone or email, batch or lot, and language of the declarations. Each with a confidence and a bounding box. Low confidence produces `not_assessed` on the checks that depend on it, with the confidence in the reason.

Count units are handled separately from SI units. "N" and "U" denote a count of articles, not a mass or volume; version 1.x's single regex alternation treated them as interchangeable with grams, so "500 N" satisfied the net-quantity check as though it declared 500 newtons of biscuits.

Multi-angle merge takes the highest-confidence reading per field across panels, recording which image each value came from.

### 5.6 Rules engine

Nineteen findings rows per scan — CHK01 to CHK18 plus the CHK06b sub-check — as Python functions registered in a table with an import-time assertion on the count. Every check returns exactly one of `pass`, `fail`, `not_assessed`, and a reason is **mandatory** on the third, enforced both in the runner and by a database CHECK constraint.

Not JSON rule files. Version 1.1 specified configurable JSON with a regex and a `violation_tier` per rule, which cannot express a five-band Table-I lookup over a panel area computed three different ways by geometry, or a comparison against an uncertainty band, or a check that halts the other eighteen. Its per-field `violation_tier` is also how version 1.x came to return an improvement notice on every branch including a net-quantity misdeclaration — the tier is a function of the whole findings set and the limb engaged, not a property of one field.

Order, with phase 1 first because scope must be settled before anything is assessed:

| # | Check | Phase | Subject | Provision | Halts |
|---|---|---|---|---|---|
| 1 | CHK03 | 1 | Chapter II applicability — over 25 kg/25 L, industrial, institutional (`packed_in_presence` is OUT of scope per `_RETAIL_TYPES = {retail_sale}`) | Rule 3 | all |
| 2 | CHK02 | 1 | Small-package exemption, 10 g / 10 ml, with the tobacco carve-out | Rule 26(a) | all |
| 3 | CHK14 | 1 | Medical device → Medical Devices Rules 2017 | Rule 2(h) proviso | phase 3 |
| 4 | CHK01 | 2 | All Rule 6(1)(a)–(g) and 6(2) declarations present | Rule 6 | — |
| 5 | CHK04 | 2 | MRP form, rounding, no dual MRP | 6(1)(e), 2(m), 6(2A) | — |
| 6 | CHK05 | 2 | Net quantity units and prohibited qualifiers | Rules 12–13 | — |
| 7 | CHK11 | 2 | A sticker may only reduce the MRP | 6(3)–6(4A) | — |
| 8 | CHK12 | 2 | Country of origin, imported goods | 6(1)(aa) | — |
| 9 | CHK13 | 2 | Best-before, perishables | 6(1)(da) | — |
| 10 | CHK10 | 2 | Prescribed standard pack size | Rule 5, Second Schedule | — |
| 11 | CHK17 | 2 | FSSAI licence — **advisory only** | FSS Act | — |
| 12 | CHK06 | 3 | Character height, Table-I | Rule 7(2) | — |
| 13 | CHK06b | 3 | Net-quantity-specific minimum height | Rule 7, ledger L-04 | — |
| 14 | CHK07 | 3 | Width at least one third of height, excepting `1 i I l` | Rule 7(3) | — |
| 15 | CHK09 | 3 | Clear space around the net quantity | Rule 8 | — |
| 16 | CHK08 | 3 | Contrasting colour | Rule 9 | — |
| 17 | CHK15 | 2 | E-commerce listing shows the 6(1) declarations except month and year | Rule 6(10) | — |
| 18 | CHK16 | 2 | Platform country-of-origin filter, in force 01.07.2026 | Rule 6(10A) | — |
| 19 | CHK18 | 4 | Violation limb and graduated action under Section 36 | Section 36 | — |

A halt gives every downstream check a **row carrying the halt reason**. It does not skip them. A package outside Chapter II cannot *pass* a Chapter II declaration check, and eighteen passes about obligations that never applied is a fabricated clean result.

A mobile package scan reaches 16 of the 18 assessable checks: CHK15 and CHK16 need a web listing, so they return `not_assessed` and the report states the denominator rather than implying a full assessment.

An engine fault inside one check degrades that one row to `not_assessed` with the error in the reason. It never shortens the findings set and never reads as compliance.

### 5.7 Verdicts, results and the legal ledger

Scan results are exactly four: `compliant`, `violation`, `not_assessed`, `out_of_scope`. `compliant` requires zero abstentions among the assessable checks for its scan type (`assessed == total`: 16/16 for a package scan without a listing, 18/18 with one). `Good`, `Bad`, `Review`, `NA` and `Passed` are abolished and the database rejects them on both engines.

Where a statutory figure could not be verified against a primary source, the check cites the **descriptive requirement** and discloses that the pinpoint provision is unverified, keyed to ledger entries L-01 to L-15 in `02_NiyamNetra_Rules.md` §15. No rupee penalty figure is printed anywhere, because the Section 36 amounts under Act 8 of 2026 are ledger entry L-12 and unverified — and a wrong penalty in a document handed to a trader is worse than no penalty at all.

This is a product requirement, not a caveat. An officer can defend a described requirement in front of an adjudicating authority. Nobody can defend a sub-rule number the tool invented.

### 5.8 Review, override and reporting

The findings screen shows all nineteen rows grouped by phase, each linking to the evidence crop it was decided on. Abstentions are visually distinct from failures.

An override is **additive**: `human_verdict` and a mandatory `override_reason` are written alongside an `engine_verdict` the database will not permit to be updated, on either engine. The override is audited with old value, new value and reason.

Reports in PDF and editable DOCX carry the package details, all nineteen findings with citations, the evidence images with bounding boxes, the officer's remarks, the timestamp, a verification QR and a disclaimer that reads its catalogue date from `rules_as_at` rather than a hard-coded string.

Four outcomes, four colours, and **every colour prints its label**, because enforcement documents get photocopied and a colour-only encoding is unreadable the moment that happens. Printing `not_assessed` and `out_of_scope` both in violation red tells an officer that an unreadable package and an out-of-scope package were both breaches.

The QR is an `https` URL from configuration carrying the audit-chain head. Not a custom scheme — the person most likely to scan it is the trader, who does not have the app.

### 5.9 Repository and search

Search by commodity, brand, manufacturer, store, region, date, result and catalogue hash. Filters for today, a date range via the calendar picker, inspector, result and area. Counts of stores visited and packages scanned, split across all four results per date and per store. Duplicates are excluded from aggregates and retained as records.

### 5.10 Dashboard

Five cards: total, compliant, violation, not assessed, out of scope. Charts: violations by check, trend over a period, breakdown by area and by manufacturer. A review queue whose badge is computed by the same query that renders the queue, so the two cannot disagree. Recent activity. Export to CSV and a PDF summary.

Aggregates are SQL over the `findings` table on PostgreSQL — not a Python loop over a JSON blob, and not SQLite-only `json_each`, which is how version 1.x's second chart came to raise `OperationalError` the moment the project moved to the PostgreSQL it claims to support in production.

### 5.11 Audit

Append-only chain over ten fields including `user_id` and `new_value`, with canonical serialisation — sorted keys, compact separators — so that a dictionary-ordering change cannot be mistaken for tampering. Verification distinguishes a sequence gap from a broken link from an altered payload. The chain head is published to a file outside the database daily, because a chain inside a database an attacker can write to protects nothing on its own: they rewrite from the tampered point and it verifies perfectly. The defence is that yesterday's head has already left the building.

---

## 6. NON-FUNCTIONAL REQUIREMENTS

**Offline.** Both clients queue work locally — IndexedDB with image `Blob`s on the web, the filesystem on the phone — and sync idempotently on a client-generated scan UUID, so a retry after a timeout that actually succeeded does not create a second record. Records created or edited offline stay flagged through the sync.

**Security.** Summarised in §5.1 and specified in `09_SECURITY.md`. Two things version 1.1 required that are **not** implemented and should not be: PDF digital signatures, because nothing in the stack signs a PDF and a document asserting a signature that does not exist is worse than one making no claim; and PostgreSQL row-level security, because RLS binds to a database role and this application connects as one role for all users, so the policies would block everything or nothing. Authorisation is in the application layer and tested for IDOR directly.

**Portability.** Supabase PostgreSQL via the session pooler is REQUIRED (`DATABASE_URL`, `postgresql+psycopg://`, no default, no SQLite fallback). Every schema-level test runs against PostgreSQL. No Compose file — version 1.1 asked twice for "Compose one-command run" — but `Backend/Dockerfile` exists for the Render deploy (Tesseract + libzbar). Local filesystem is the primary evidence store with an optional best-effort Supabase mirror (`SUPABASE_*`).

**Usability.** Mobile-first responsive, guide overlays, Hindi and English, contrast ratios audited against the token pairs the UI actually renders and asserted by a unit test rather than promised in a build prompt.

**Data retention.** Five years, per the record-keeping expectation for enforcement material, with a documented backup of the database and the evidence directory together — the hashes are meaningless if the files are restored separately.

**No hosted LLM, no primary object store, no IMEI, no generative upscaling.** Local FS primary with an optional Supabase mirror, OCR.space only as a fallback when local OCR is absent, `Backend/Dockerfile` present for Render. Each with its reason in `07_Tech_Stack.md` §0.1.

**Performance.** Stated as shape, not as numbers. OCR dominates and is CPU-bound, so assessment is a separate API call from upload: the officer is not watching a spinner while four images are processed, and a slow assessment cannot time out an upload that already holds the evidence. Aggregates are indexed SQL. Images are files with hashes in the database, never BLOBs. Duplicate search uses eight indexed 8-bit hash bands rather than a table scan, which is a complete filter — not merely a fast one — for every Hamming distance up to seven, because *d* differing bits touch at most *d* bands and so leave *bands − d* identical. Four 16-bit bands, specified in an earlier draft, guarantee that only to distance 3 and therefore missed pairs at the threshold of 5. Version 1.1's "OCR 3-5 sec", "dashboard <2 sec for 1000 records" and "99% uptime for demo" were never measured; measure on the demo machine and then state the figures with the machine attached.

---

## 7. DATA MODEL

Seven tables. Version 1.1 listed five, omitting the two that carry the evidence and the verdicts — which is why version 1.x kept image hashes and rule results as JSON blobs on the scan row, unindexable, unconstrainable, and turning "how often did CHK06 fail this month" into a Python loop over the whole table.

**users** — id, employee_id (unique), full_name, email, phone, password_hash, role, jurisdiction, is_active, install_id, install_bound_at, token_epoch, created_at.

**stores** — id, name, store_type, address, city, district, state, pincode, latitude, longitude, geofence_radius_m, is_active, created_at.

**inspections** — id, user_id, store_id, inspection_date, status, transaction_type, in_scope, out_of_scope_reason, latitude, longitude, gps_accuracy_m, geofence_status, geofence_distance_m, geofence_reason, mock_location, local_created_at, synced_at, clock_skew_seconds, edited_offline, signature_status, notes, created_at, submitted_at.

**scans** — id, inspection_id, commodity_generic, brand_name, commodity_category, batch_number, barcode, **net_quantity_value, net_quantity_unit, is_imported, is_perishable, is_medical_device, is_tobacco, has_sticker, sticker_reduces_price, sticker_covers_original** (each nullable, so "unknown" is distinguishable from "no", and each *persisted* rather than only passed to the engine — a scope decision nobody can reproduce is a scope decision nobody can defend), overall_result, violation_limb, recommended_action, checks_total, checks_assessed, panel_shape, panel_height_mm, panel_width_mm, panel_diameter_mm, pdp_area_cm2, total_surface_area_cm2, is_blown_moulded, mm_per_pixel, scale_source, mm_per_pixel_uncertainty, rules_as_at, catalog_hash, engine_version, duplicate_of, instances_recorded, ocr_confidence_mean, ocr_text, created_at.

**scan_images** — id, scan_id, panel, sequence, file_path, byte_size, width_px, height_px, mime_type, **sha256**, phash, phash_b0–b7, captured_at, exif_stripped, rectified, residual_tilt_deg, blur_variance, glare_ratio, created_at.

**findings** — id, scan_id, check_id, title, **engine_verdict**, human_verdict, override_reason, overridden_by, overridden_at, severity, reason, **limb**, observed, required, citation, ledger_ref, confidence, created_at.

**audit_logs** — id, seq (unique), inspection_id, scan_id, user_id, action, old_value, new_value, reason, ip_address, user_agent, timestamp, hash_prev, hash_self.

The five scope flags on `scans` are nullable on purpose and are **persisted, not merely passed in**. They are the officer's answers that decided CHK02, CHK11, CHK12, CHK13 and CHK14, so a scan whose flags are not stored cannot be re-assessed or defended six months later: "why did country-of-origin pass?" has no answer if nothing records that the officer said the pack was domestic. Nullable, because "the officer did not know" must be storable and must produce `not_assessed` rather than being silently read as "no".

Three fields replace the old `rule_version` enum: `rules_as_at`, `catalog_hash`, `engine_version`. An enum with values like `2017_amended` cannot express "the 2017 amendments as they stood on 1 July 2026 with GSR 128(E) in force", which is the thing an inspection actually needs to record, and it becomes silently wrong the next time the law moves.

`store_id` throughout, and `stores.name` rather than a second spelling — version 1.1 used `shop_name`, `shop_id` and `store_id` for the same two things in one document. Column names here are the SQLAlchemy models in `Backend.md` §2, which are what Alembic generates from and therefore the single source of truth; `06_DATABASE.md` carries the DDL and the constraints.

---

## 8. API SURFACE

**Auth.** `POST /auth/login {employee_id, password}` (request only — `install_id` is server-issued via `bind_install` in `routers/auth_helpers.py` and returned in the response) · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`

**Inspections.** `POST /inspections` · `GET /inspections` (server-scoped) · `GET /inspections/{id}` · `POST /inspections/{id}/submit`

**Scans.** `POST /inspections/{id}/scans` · `POST /scans/{id}/images` · `PATCH /scans/{id}` (declared scope flags: `commodity_generic`, `brand_name`, `commodity_category`, `batch_number`, `net_quantity_value/unit`, `is_imported`, `is_perishable`, `is_medical_device`, `is_tobacco`, `has_sticker`, `sticker_reduces_price`, `sticker_covers_original`) · `POST /scans/{id}/listing {url}` (SSRF-guarded fetch for CHK15/CHK16) · `POST /scans/{id}/assess` · `GET /scans/{id}` · `GET /scans/{id}/verify` · `PATCH /admin/findings/{id}`

**Reports.** `GET /reports/inspections/{id}/pdf` · `.../docx` · `GET /reports/today` (+ `GET /reports/today.pdf`)

**Admin.** `GET /admin/dashboard` · `GET /admin/review-queue` · `GET /admin/audit` (paginated, chain verification folded in as `chain_intact`/`chain_head`) · `POST /admin/users` · `GET /admin/users` · `PATCH /admin/users/{id}` · `GET /admin/rules` *(read-only)*

**Health.** `GET /health` — returns `checks_registered`, which must read 19.

Four changes from version 1.1 worth stating explicitly. Scanning is three calls, not one, so evidence is stored and hashed before any processing can fail. There is no `?inspectorId=` filter — a filter the caller supplies is not an access control, because the caller can supply somebody else's id. `/admin/dashboard`, not `/admin/dashboard/stats`. And there is no `PUT /admin/rules`: version 1.1 offered rule-version editing, which would let a signed-in admin change the legal basis of inspections already recorded; the catalogue is versioned in code and each scan stores the hash it was assessed under.

Full request and response shapes in `Backend.md` §8.

---

## 9. SCREENS

**Inspector.** Login (employee ID) · Home · **Scope intake** · Capture with guide box · Extracted fields review · Findings, nineteen rows with the denominator stated · Remarks · Submit · Records, filterable across all four results · Today's Report · Calendar picker.

**Admin.** Login · Dashboard, five cards plus charts · Inspections table with search and filters · Inspection detail with images, extracted text, nineteen findings and the audit timeline · Review queue · Manage inspectors · Rule catalogue, read-only · Audit log with chain verification · Export.

Both roles run on the desktop Portal; the Expo field app carries the same two roles, chosen by the account at login. Inspectors get the capture flow on the app; admins get a read-mostly monitoring subset — raids today, inspector management, store-wise records and a date-wise report calendar — with no camera. The app screens are specified in `Frontend_App_prompts.md`.

Design system, tokens and the audited contrast pairs are in `08_UI_DESIGN.md`. Breakpoints 375 / 768 / 1280.

---

## 10. LEGAL MAPPING

Every finding shows its provision, and where the provision is unverified it shows the descriptive requirement plus its ledger reference and the word "unverified". Reports carry the source Act, the catalogue date and the catalogue hash. The disclaimer states what was assessed and what was not — including that CHK17 is advisory and that medical devices are routed to the Medical Devices Rules 2017. Version 1.1's disclaimer claimed the report covers "not FSSAI/MDR 2017" while the engine does report on both, which is a false statement about the tool's own scope.

Section 36 governs the limb and the graduated action: the net-quantity limb under 36(2) recommends prosecution on that limb; a critical or three-or-more major declaration failure recommends prosecution under 36(1); otherwise an improvement notice under Section 15. No amounts.

---

## 11. ACCEPTANCE CRITERIA

The product is accepted when all of the following hold. Each maps to a test in `10_TESTING.md`.

Every fixture, clean or degraded, produces exactly nineteen findings rows. Every `not_assessed` carries a reason longer than a token phrase. No scan is reported `compliant` while any assessable check is unassessed — verified on a fixture that is fully compliant except that OCR failed. A package outside Chapter II yields `out_of_scope` with eighteen rows explaining why, and does not appear in the compliant count. A domestic package with no country of origin **passes** CHK12 rather than producing no row at all, and the same holds for a non-perishable pack on CHK13 and a non-tobacco sachet on CHK02.

No millimetre verdict is reached without a scale reference. A shortfall smaller than the measurement uncertainty returns `not_assessed`.

A stored evidence file is byte-identical to the upload and rehashes to its recorded digest; appending one byte is detected. Mutating any of the ten hashed audit fields — including `user_id` and `new_value` — breaks the chain, and a wholesale rewrite contradicts the published head. `engine_verdict` cannot be updated on either engine, and an override without a reason is refused.

An inspector cannot read another inspector's inspection, including by supplying their own id as a query parameter, and the refusal is a 404. No access token appears in browser storage. The outbound listing fetch refuses private and link-local addresses, hostnames resolving to them, and redirects.

Both database engines reject `Good`, `Bad` and `Review`, and accept all four valid results. A blurred capture is stored with a quality note and returns 201, not 400.

Version 1.1's criteria were "20 sample labels", "5 biscuits (2 Good, 3 Bad)", "10 images in <30 seconds" and "RLS test" — three unmeasured counts and one test of a control that does not exist.

---

## 12. MILESTONES

**Day 1, morning — skeleton.** FastAPI, Alembic, Supabase PostgreSQL (pooler), portal shell, blank Expo app, all talking. `alembic upgrade head` succeeds and `/health` reports `checks_registered: 19` even with every check a stub, because the registry assertion is what later prevents a silently short report. Login from both clients; create an inspection end to end.

**Day 1, afternoon — evidence and OCR.** `store_upload` with its hash and `/verify` **first**, because the integrity guarantee is far easier to build than to retrofit. Then rectification, scale, and OCR as one function returning fields with confidences and boxes. Test on five real packs including a transparent bottle and a curved pouch, plus one deliberately awful photograph — the awful one is the important test, because it must be stored and flagged rather than rejected.

**Day 1, night — rules engine.** Nineteen check functions in phase order, three-state with mandatory reasons. Run the completeness tests before wiring anything to the UI; at that point the suite can already prove no fixture yields fewer than nineteen rows and that a partially assessed package is never compliant.

**Day 2, morning — review and reports.** Findings UI with four states, override with reason, ReportLab and python-docx with labelled outcomes, the stated denominator, ledger notes and the QR. Print one in greyscale and look at it.

**Day 2, afternoon — dashboard and repository.** Five cards, charts from indexed SQL, review queue, calendar picker, role scoping.

**Day 2, night — polish.** Three terminals, seed data covering all four results including at least one `not_assessed` and one `out_of_scope`, offline queue, the manual script in `10_TESTING.md` §11 run start to finish, demo recording. Seed data that is only clean packages and clean violations demonstrates a system that does not exist.

---

## 13. RISKS

**OCR fails on transparent, curved or stylised packs.** Dark backing prompt, homography rectification, CLAHE, burst capture, Tesseract fallback — and where it still fails, `not_assessed` with the reason. The mitigation is not a cloud model; it is that failure is reported honestly. This is the risk version 1.1 answered with "Gemini Vision fallback", which trades an honest abstention for a confident guess.

**No network in the field.** Offline-first on both clients, with flags that survive the sync.

**The law moves.** Fifteen unverified figures are enumerated in the ledger and cited descriptively until someone reads the primary source. `rules_as_at` and `catalog_hash` on every scan mean an assessment records the rules it was made under, so a later amendment does not silently rewrite history. `WebSearch` and outbound fetch are unavailable in this environment, so no statutory figure has been altered on the strength of a secondary source.

**A measurement is challenged.** Explicit scale, explicit uncertainty, `not_assessed` inside the band, the reference source recorded, and the original bytes retrievable and hash-verifiable.

**Collusion or interference with a record.** Camera-only capture, no gallery, install-bound tokens, engine verdicts that cannot be edited, overrides that require a reason and are audited, an append-only chain over ten fields, a daily published head, and duplicate detection that surfaces for review rather than deciding. Not a geofence — see §5.2.

**Over-claiming.** The largest reputational risk in the submission, and the one version 1.1 realised: an invented accuracy figure or a fabricated citation is the first thing a knowledgeable judge tests. §1.2 and `10_TESTING.md` §12 bound what may be said.

---

## 14. APPENDICES

Primary sources: Legal Metrology Act 2009 and the Legal Metrology (Packaged Commodities) Rules 2011 with amendments, via the Department of Consumer Affairs and India Code. Every figure taken from a secondary source is in the ledger as unverified until a primary source is read.

Licences: PaddleOCR Apache 2.0, Tesseract Apache 2.0, OpenCV Apache 2.0, FastAPI MIT, ReportLab BSD, PostgreSQL PostgreSQL Licence. Nothing here is copyleft-encumbered for this use, and nothing is paid.

Nothing in this document constitutes legal advice, and no output of this system is a determination of liability. The engine recommends; the officer decides; the adjudicating authority adjudicates.

---

## 15. CORRECTIONS LOG — what version 1.1 got wrong

| # | Where | Defect | Now |
|---|---|---|---|
| 1 | §1, §11 | "detection accuracy 85%+ on Good/Bad" | No accuracy claim; §1.2 metrics are checkable |
| 2 | §5.4, §13 | "optional Gemini Vision" and "Gemini Vision fallback" | Removed; §5.5 gives three reasons |
| 3 | Throughout | `Good/Bad/Review`, `Passed/Violation/NA/Needs Review` | Four results, three verdicts |
| 4 | §5.5 | "18 checks", presence check listed first, ahead of the scope exemptions | 19 rows, phase 1 first; §5.6 |
| 5 | §5.5 | JSON rules with per-rule `violation_tier` | Python functions; tier derived from the findings set |
| 6 | §5.5 | "Rule 12(6),13" · "Rule 9(1)(b)" · "Rule 8(1)" · "Rule 6(3)-6(4)" | Rules 12–13 (L-01) · Rule 9 · Rule 8 · 6(3)–6(4A) |
| 7 | — | No scale, no uncertainty, no rectification requirement at all | §5.4, the product's hardest requirement |
| 8 | — | No legal ledger; provisions asserted as settled | §5.7, L-01 to L-15, no penalty amounts |
| 9 | §5.3 | "blur Laplacian <100 reject" | Measured and recorded; 201 not 400 |
| 10 | §5.3 | 4–5 photos "per inspection"; one scan per image in the API | One scan, many `scan_images` |
| 11 | §5.3, §7 | Single `image_hash` on the scan; `device_id` | `scan_images.sha256`; `install_id` |
| 12 | §5.1 | "Session expiry 24h" | 12-hour access, 30-day refresh, `token_type` checked |
| 13 | §5.1, §6, §11 | Row Level Security in three places | Application-layer authorisation, IDOR-tested |
| 14 | §5.1, §4 | "government SSO + OTP" | Not implemented, not claimed |
| 15 | §5.6, §6 | "PDF digital signature" | Removed; chain head in the QR |
| 16 | §5.6, §10 | Disclaimer "not FSSAI/MDR 2017" while the engine reports both; hard-coded "as on 7 May 2026" | Corrected scope; reads `rules_as_at` |
| 17 | §7 | Five tables; `shop_id` and `store_id` for the same column; `status`/`reasons`/`extracted_fields` JSON | Seven tables; `store_id`; `findings` rows |
| 18 | §7, §4 | `rule_version` enum; admin rule editing | `rules_as_at` + `catalog_hash` + `engine_version`; read-only catalogue |
| 19 | §8 | `/dashboard/stats`, `?inspectorId=`, `PUT /admin/rules`, one-call scan | §8, corrected surface |
| 20 | §8, §5.1 | Login by email | Login by `employee_id` |
| 21 | §5.8 | Four cards, no `not_assessed` count | Five cards |
| 22 | §5.8 | Violations "by parsing rule_results JSON in Python" | Indexed SQL on `findings`, both engines |
| 23 | §6, §12 | "Compose one-command run", twice, in a stack with no Docker | Three terminals |
| 24 | §6, §11 | "OCR 3-5 sec", "<2 sec for 1000 records", "99% uptime", "10 images in <30 s" | Design shape stated; measurement method given |
| 25 | §2 | Medical device "route and flag out of scope" | CHK14 halts phase 3 only; the scan is not out of scope entirely |
| 26 | §2 | FSSAI as a "disclaimer" with an optional check | CHK17, advisory, can never return `fail` |
| 27 | §3 | Consumer "verify Pass vs Fail" by public QR | QR verifies record integrity, not product status |
| 28 | §5.2 | No GPS policy; §13 proposed "GPS fencing" | Recorded, never enforced, with the reason |
| 29 | §13 | "Server wins" implied by duplicate pHash mitigation | Near-duplicate is a review item; both copies kept |
| 30 | §14 | Cloudinary listed as a reference | Removed with the rest of the object stores |
| 31 | §2 | Image forensics and net-quantity verification not addressed as non-goals | §2, both stated with reasons |

---

*End of Product Requirements Document v2.0. Requirements here are realised by `05_SYSTEM_ARCHITECTURE.md`, `06_DATABASE.md`, `Backend.md` and `Frontend_Portal_Prompts.md`, constrained by `02_NiyamNetra_Rules.md` and `09_SECURITY.md`, and accepted by `10_TESTING.md`.*
