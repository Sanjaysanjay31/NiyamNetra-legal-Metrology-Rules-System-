# NiyamNetra — Database Design

### Smart India Hackathon 2026 · Problem Statement SIH26034 · SQLite (dev) / PostgreSQL (prod)

**Version:** 3.0 | **Date:** 30 Aug 2026 | **Supersedes:** 2.0 (see §11 for the corrections log)
**Scope:** Entity model, all seven tables column-for-column, the DDL both engines actually receive, report queries, indexing, seed fixtures, retention.

---

## 0. THE ONE RULE THAT MAKES THIS DOCUMENT USABLE

**`Backend.md` §4 is the schema. This document describes it and must not diverge from it by a single column name.**

Version 2.0 of this file described a *different* schema from the SQLAlchemy models in `Backend.md` — different table columns, different names for the same concept, different login identity. Both documents were internally coherent and mutually incompatible: `users.email` here against `users.employee_id` there, `hash_current` here against `hash_self` there, `findings.verdict` here against `engine_verdict`/`human_verdict` there, a denormalised `scans.store_id`/`inspector_id`/`date` here against a normalised `scans.inspection_id` there. Any tool handed both would generate code that does not run, and a developer reading both would have no way to tell which half was real.

The models win, for two reasons. They are what Alembic autogenerates migrations from, so they are the only description that becomes an actual database. And `04` §7, `05` §2.4, `10` §3 and `11` §2.2 are already written against them, so aligning the models to this file would have required changing four documents instead of one.

Everything version 2.0 proposed that the models do not have is in **§10**, labelled as a proposal with the migration it would need. Nothing in §3 or §4 is aspirational: if it is here, it is a field on a model in `Backend.md`, and the column counts in §3 are checkable against that file.

**The schema is created by `alembic upgrade head` and by nothing else.** `Base.metadata.create_all()` emits tables and indexes but not the `CHECK` constraints declared in `__table_args__` on some dialect paths, and never the triggers in §4.4 — so a database built that way accepts `overall_result = 'Good'`, accepts a `not_assessed` finding with no reason, and lets `engine_verdict` be updated after the fact. It looks identical and enforces nothing.

---

## 1. DESIGN GOALS

1. **One ORM, two engines.** The models generate the schema for SQLite in development and PostgreSQL in production; only `DATABASE_URL` changes. Where raw SQL is unavoidable both dialects are given separately, because they genuinely differ — §4.4, §4.5 and §7.
2. **Evidence is a row, not a string.** Every image carries its own SHA-256, its banded perceptual hash, its capture time and its quality measurements. That needs a table, not a JSON array — §3.5.
3. **Three verdicts per check, four per scan.** The engine returns `pass`, `fail` or `not_assessed`; a scan is `compliant`, `violation`, `not_assessed` or `out_of_scope`. A boolean cannot represent what the engine computes, and `CHECK IN ('Good','Bad','Review')` forced every unassessable scan into one of three wrong answers.
4. **The denominator is stored.** `checks_total` and `checks_assessed` sit on every scan, so a partial assessment can never be read as a clean one.
5. **Findings are queryable.** Stored as JSON, "count the CHK06 failures this month" is a Python loop over every row — and `json_each` is SQLite-only, so the dashboard's second chart raises `OperationalError` the moment production is PostgreSQL.
6. **The inputs are stored, not just the outputs.** The officer's scope answers and the declared net quantity are columns on `scans`. A verdict whose inputs were not recorded cannot be re-run or defended.
7. **Append-only audit, with a chain that covers the actor and the new value.**
8. **Stores are entities.** Counting distinct premises visited requires a normalised store, not a name string.

**Seven tables:** `users`, `stores`, `inspections`, `scans`, `scan_images`, `findings`, `audit_logs`. Not five. The two that earlier drafts omitted are the two that carry the evidence and the verdicts.

---

## 2. ENTITY RELATIONSHIPS

```text
users
 ├──< inspections                  who inspected            (inspections.user_id)
 ├──< findings                     who overrode             (findings.overridden_by)
 └──< audit_logs                   who acted                (audit_logs.user_id)

stores
 └──< inspections                  many visits over time    (inspections.store_id)
      └──< scans                   many packages per visit  (scans.inspection_id)
           ├──< scan_images        4–5 panels, each independently hashed
           └──< findings           exactly 19 rows per scan, one per check

scans       ──> scans              self-reference           (scans.duplicate_of)
inspections ──< audit_logs         nullable: user-level actions have no inspection
scans       ──< audit_logs         nullable: inspection-level actions have no scan
```

| Relationship | Cardinality | Reason |
|---|---|---|
| users → inspections | 1:N | Every visit attributed to one officer |
| stores → inspections | 1:N | One premises, many visits on different dates |
| inspections → scans | 1:N | One visit, several packages |
| scans → scan_images | 1:N | Front, back, MRP panel, batch panel, barcode — each with its own hash |
| scans → findings | 1:N | Exactly one row per check attempted, nineteen per scan |
| scans → scans | 0:1 | `duplicate_of`, when the same package is re-photographed |
| users → audit_logs | 1:N | Every action attributed |

**There is no denormalised `store_id`, `inspector_id` or `date` on `scans`.** Version 2.0 put all three there "so that the daily report does not join through `inspections`", and paid for one saved join with three columns that can disagree with their parent. A scan re-parented to a corrected inspection then reports the wrong store on the daily total and the right one on the store breakdown, and nothing in the schema notices. The join is one indexed hop; §5 uses it throughout.

**`stores` has no `inspector_id`.** A premises is not owned by the officer who first entered it, and making the creator a `NOT NULL` foreign key means a second officer inspecting the same shop either creates a duplicate store or silently inherits someone else's attribution. Who visited it, and when, is `inspections`.

---

## 3. TABLES

Column-for-column against `Backend.md` §4. The count in each heading is checkable: 13 + 13 + 23 + 39 + 26 + 18 + 14 = **146 columns**.

### 3.1 `users` — 13 columns

Inspector and admin accounts, role-based access, install binding.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER / SERIAL | PK | |
| `employee_id` | VARCHAR(32) | UNIQUE NOT NULL, indexed | **The login identity** |
| `full_name` | VARCHAR(120) | NOT NULL | |
| `email` | VARCHAR(160) | NULL UNIQUE | Contact only — never the credential |
| `phone` | VARCHAR(20) | NULL | |
| `password_hash` | VARCHAR(128) | NOT NULL | bcrypt via Passlib, `bcrypt==4.0.1` |
| `role` | VARCHAR(16) | NOT NULL DEFAULT 'inspector', CHECK IN ('admin','inspector') | |
| `jurisdiction` | VARCHAR(120) | NULL | Assigned zone |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `install_id` | VARCHAR(64) | NULL, indexed | Server-issued random 32 bytes, hex |
| `install_bound_at` | TIMESTAMPTZ | NULL | When this install was bound |
| `token_epoch` | INTEGER | NOT NULL DEFAULT 0 | Bumped to invalidate live refresh tokens |
| `created_at` | TIMESTAMPTZ | DEFAULT now | |

**Login is by `employee_id`, not email.** A Legal Metrology officer has an official identifier; an email address is a contact detail that changes on transfer and that the officer may not have at all. Version 2.0 marked `email` as "Login identity" and made it `UNIQUE NOT NULL`, which excludes an officer without one and puts a mutable field on the authentication path. `POST /auth/login` takes `{employee_id, password}` only — `install_id` is server-issued via `bind_install` in `routers/auth_helpers.py` and returned in the login response, never sent in the request.

**On `install_id`.** An earlier draft specified "phone IMEI or browser fingerprint". IMEI has been unavailable to non-privileged Android applications since Android 10, so that half was not implementable, and fingerprinting is both unreliable and a privacy problem of its own. Instead the server issues a random 32-byte identifier on first launch, the client keeps it in the platform keystore, and a login presenting a different one is surfaced for admin attention. This is what makes account sharing visible — `12` §6 (#65, #66), `08` §4.9.

**On `token_epoch`.** Rotating `JWT_SECRET` invalidates every token for every user, which is right for a suspected key leak and much too broad for one compromised account. `token_epoch` is stamped into the refresh token and compared on use, so incrementing it logs out exactly one user's live sessions. There is no `failed_logins` or `locked_until` column: lockout by row invites a denial-of-service against a named officer, and the control that actually applies is `RATE_LIMIT_LOGIN_PER_MIN` per `employee_id` **and** per IP — `09` §2.3, `14` §3.5.

**Access token 12 hours, refresh token 30 days.** Twelve hours covers a full field shift, which matters because an officer in a no-network area cannot re-authenticate. The access token lives in client memory only; the refresh token is an httpOnly cookie on the portal (`SameSite=Strict` locally, `SameSite=None; Secure` in prod cross-site) and a keystore entry in the app. `token_type` is checked on every decode, so a refresh token cannot be presented as an access token. This figure is authoritative across `04`, `05`, `09`, `11` and `14`.

**Seed accounts use `@example.test`.** Not a `gov.in` domain the project does not control — `05` §5, `14` §8.

### 3.2 `stores` — 13 columns

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER / SERIAL | PK | |
| `name` | VARCHAR(160) | NOT NULL, indexed | |
| `store_type` | VARCHAR(40) | NULL | `kirana`, `supermarket`, `wholesale`, `warehouse`, … |
| `address` | TEXT | NULL | |
| `city` | VARCHAR(80) | NULL | |
| `district` | VARCHAR(80) | NULL | Jurisdiction rollups |
| `state` | VARCHAR(80) | NULL | |
| `pincode` | VARCHAR(10) | NULL | |
| `latitude` | FLOAT | NULL | Registered location |
| `longitude` | FLOAT | NULL | |
| `geofence_radius_m` | INTEGER | NOT NULL DEFAULT 150 | Per-store tolerance |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ | DEFAULT now | |

`geofence_radius_m` is per store, not global, because a 150 m default that is right for a kirana shop is wrong for a warehouse compound where the office and the stacking bays are 400 m apart. It is compared against `inspections.geofence_distance_m`, and the result is **recorded, never enforced** — §3.3.

`visit_count` is not a column. It is a denormalised counter with nothing keeping it correct, and it drifts on the first deleted or re-parented inspection. Derive it: `SELECT COUNT(*) FROM inspections WHERE store_id = ?`.

`pincode` is `VARCHAR`, not an integer. Indian PINs do not begin with zero, but treating an identifier as a number invites arithmetic on it and loses any leading zero the moment the data source changes.

### 3.3 `inspections` — 23 columns

One visit: one officer, one store, one date.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER / SERIAL | PK | |
| `user_id` | INTEGER | FK users.id NOT NULL, indexed | |
| `store_id` | INTEGER | FK stores.id NOT NULL, indexed | |
| `inspection_date` | DATE | NOT NULL DEFAULT today, indexed | **Server** date |
| `status` | VARCHAR(16) | NOT NULL DEFAULT 'draft', CHECK IN ('draft','submitted') | |
| `transaction_type` | VARCHAR(32) | NULL | `retail_sale`, `wholesale`, `institutional`, `industrial`, `packed_in_presence`, `export`, `other` |
| `in_scope` | BOOLEAN | NOT NULL | Always set at create: `transaction_type IN (retail_sale, packed_in_presence)` |
| `out_of_scope_reason` | TEXT | NULL | Set when `in_scope` is FALSE |
| `latitude` | FLOAT | NULL | Fix at the time of the visit |
| `longitude` | FLOAT | NULL | |
| `gps_accuracy_m` | FLOAT | NULL | The radius the fix is good to |
| `geofence_status` | VARCHAR(16) | NULL, CHECK IN ('inside','outside','unknown') | |
| `geofence_distance_m` | FLOAT | NULL | Metres from the registered point |
| `geofence_reason` | TEXT | NULL | Why, when outside or unknown |
| `mock_location` | BOOLEAN | NULL | Platform mock-location flag, as reported |
| `local_created_at` | TIMESTAMPTZ | NULL | Device clock at creation |
| `synced_at` | TIMESTAMPTZ | NULL | When the server received it |
| `clock_skew_seconds` | INTEGER | NULL | Server time minus device time |
| `edited_offline` | BOOLEAN | NOT NULL DEFAULT FALSE | |
| `signature_status` | VARCHAR(24) | NULL | `signed`, `refused`, `unavailable` |
| `notes` | TEXT | NULL | Free text |
| `created_at` | TIMESTAMPTZ | DEFAULT now | |
| `submitted_at` | TIMESTAMPTZ | NULL | |

**`in_scope` is always a boolean set at create — there is no NULL gate.** `routers/inspections.py:125` computes `in_scope = transaction_type in _RETAIL_TYPES` (`{"retail_sale", "packed_in_presence"}`) and `inspections.py:157-160` stores it directly, so every inspection row has TRUE or FALSE from the start and submission is never refused on a NULL scope. `transaction_type` drives it: `retail_sale` and `packed_in_presence` are IN-SCOPE (Chapter II applies); `wholesale`, `institutional`, `industrial`, `export` and `other` are out of scope at the inspection level, with per-package applicability still recorded by CHK03.

**Location is recorded, never enforced.** A fix inside the fence does not prove the officer was there, and a fix outside does not prove they were not — buildings, urban canyons and a cold GPS start all produce a bad fix at a real address. So `geofence_status` is stored with `gps_accuracy_m` and, when it is not `inside`, a reason. Blocking a submission on a geofence means an officer standing in the shop cannot record what they found, which is a worse failure than a wrong distance in a column. `mock_location` is stored the same way: a reported flag, not a rejection.

**`clock_skew_seconds` exists because the device clock is not evidence.** An offline capture carries `local_created_at`; the server records `synced_at` and the difference. A three-hour skew is not fraud — a phone that lost time in a basement does that — but it is the difference between "captured at 11:04" meaning something and meaning nothing.

**`signature_status`, not `signature_path`.** There is no image of a signature in this schema. Nothing in the stack cryptographically signs anything, and a stored squiggle asserting the trader agreed is an evidentiary claim the system cannot support. What is recorded is whether acknowledgement was signed, refused, or never requested — `05` §6, `09` §7.

### 3.4 `scans` — 39 columns

One package. The row is the whole reproducible record of one assessment: what was declared, what was measured, which catalogue judged it, and what the answer was.

**Identification**

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER / SERIAL | PK | |
| `inspection_id` | INTEGER | FK inspections.id NOT NULL, indexed | The only parent link |
| `commodity_generic` | VARCHAR(120) | NULL | Generic name, Rule 6(1)(b) |
| `brand_name` | VARCHAR(120) | NULL | |
| `commodity_category` | VARCHAR(60) | NULL | Values per `08` §4.2 |
| `batch_number` | VARCHAR(60) | NULL | |
| `barcode` | VARCHAR(64) | NULL, indexed | Decoded by pyzbar when present |

**Operator-declared inputs — the answers that decided the gates**

| Column | Type | Constraints | Description |
|---|---|---|---|
| `net_quantity_value` | FLOAT | NULL | As declared on the pack |
| `net_quantity_unit` | VARCHAR(12) | NULL | SI units and count units kept apart |
| `is_imported` | BOOLEAN | **NULL** | CHK12, country of origin, 6(1)(aa) |
| `is_perishable` | BOOLEAN | **NULL** | CHK13, best-before, 6(1)(da) |
| `is_medical_device` | BOOLEAN | **NULL** | CHK14, proviso to Rule 2(h) |
| `is_tobacco` | BOOLEAN | **NULL** | CHK02 tobacco carve-out under Rule 26(a); CHK17 is the FSSAI advisory |
| `has_sticker` | BOOLEAN | **NULL** | CHK11, 6(3)–6(4A) |
| `sticker_reduces_price` | BOOLEAN | NULL | Only meaningful when `has_sticker` |
| `sticker_covers_original` | BOOLEAN | NULL | Only meaningful when `has_sticker` |

**These five flags are nullable on purpose, and they are persisted rather than merely passed in.** NULL means "the officer was not asked, or did not answer", and that is exactly what makes the dependent check return `not_assessed` with a reason instead of `pass`. Version 2.0 kept `is_imported` and `is_perishable` on `inspections` with `DEFAULT FALSE` — one answer for a whole shop, and a default that silently asserts a domestic, non-perishable pack. They belong per package, and a default of FALSE turns an unasked question into a passing grade.

Before this revision the flags existed only on the in-memory `CheckContext` and were never written anywhere. The consequence is worth stating plainly: the answers that decided CHK02, CHK11, CHK12, CHK13 and CHK14 were discarded the moment the response was returned, so "why did country-of-origin pass?" had no answer six months later. `net_quantity_value` and `net_quantity_unit` were dropped the same way, which made CHK03, CHK05 and CHK08 unreproducible.

**Result**

| Column | Type | Constraints | Description |
|---|---|---|---|
| `overall_result` | VARCHAR(16) | NOT NULL DEFAULT 'not_assessed', CHECK IN ('compliant','violation','not_assessed','out_of_scope') | |
| `violation_limb` | VARCHAR(16) | NULL, CHECK IN ('36(1)','36(2)','both') | Which limb is engaged |
| `recommended_action` | VARCHAR(40) | NULL | Improvement notice / prosecution / none |
| `checks_total` | INTEGER | NOT NULL DEFAULT 18 | 18 assessable checks; CHK18 is the derived tier |
| `checks_assessed` | INTEGER | NOT NULL, CHECK `checks_assessed <= checks_total` | |

`recommended_action` never carries an amount. The Section 36 figures under Act 8 of 2026 are ledger entry **L-12** and unverified, and a printed rupee number is the single easiest thing for an opposing party to disprove — `02` §15, `04` §5.7.

**Panel geometry, Rule 7(4) and Rule 26(a)**

| Column | Type | Constraints | Description |
|---|---|---|---|
| `panel_shape` | VARCHAR(20) | NULL | `rectangular`, `cylindrical`, `other` |
| `panel_height_mm` | FLOAT | NULL | Declared, and the fallback scale reference |
| `panel_width_mm` | FLOAT | NULL | |
| `panel_diameter_mm` | FLOAT | NULL | Cylindrical packs |
| `pdp_area_cm2` | FLOAT | NULL | Principal display panel area |
| `total_surface_area_cm2` | FLOAT | NULL | **A different quantity** — see below |
| `is_blown_moulded` | BOOLEAN | NOT NULL DEFAULT FALSE | Selects the second Table-I column |

`pdp_area_cm2` and `total_surface_area_cm2` are not the same measurement and are not interchangeable. The Table-I character-height band and the Rule 26(a) small-package exemption read the **total** surface area of the package; Rule 7(4) reads the area of the principal display panel. Storing only one makes whichever check needed the other unreproducible, which is why both are columns.

**Measurement provenance**

| Column | Type | Constraints | Description |
|---|---|---|---|
| `mm_per_pixel` | FLOAT | NULL | NULL means no millimetre verdict was reachable |
| `scale_source` | VARCHAR(32) | NULL | `declared`, `id1_card`, `coin_5inr`, `none` |
| `mm_per_pixel_uncertainty` | FLOAT | NULL | Propagated into every height comparison |

A camera has no absolute scale. `mm_per_pixel` comes from a four-point homography over the panel and one of three references: the declared panel height, an ISO/IEC 7810 ID-1 card long edge at 85.60 mm (about 2%), or a ₹5 coin at 23 mm (about 5%). When `scale_source` is `none`, every typography check returns `not_assessed` — it does not fall back to a guess. A shortfall that lies inside the uncertainty band is also `not_assessed`: "2.1 mm ± 0.3 mm against a 2.5 mm minimum" is not a finding of fact, and reporting it as one is how a defensible measurement becomes an indefensible one.

**Rule provenance, deduplication, OCR**

| Column | Type | Constraints | Description |
|---|---|---|---|
| `rules_as_at` | DATE | NOT NULL | The date the catalogue spoke as of |
| `catalog_hash` | VARCHAR(64) | NOT NULL | SHA-256 of the catalogue file |
| `engine_version` | VARCHAR(16) | NOT NULL | |
| `duplicate_of` | INTEGER | FK scans.id NULL, indexed | Self-reference |
| `instances_recorded` | INTEGER | NOT NULL DEFAULT 1 | Packs of this line seen on shelf |
| `ocr_confidence_mean` | FLOAT | NULL | Mean over recognised fields |
| `ocr_text` | TEXT | NULL | Raw recognised text, for search |
| `created_at` | TIMESTAMPTZ | DEFAULT now | |

The `rules_as_at` / `catalog_hash` / `engine_version` triple is what makes a scan from today still explainable after the next amendment: the same inputs, the same catalogue hash and the same engine reproduce the same nineteen rows. A single `rule_version` enum cannot do this — `2017_amended` has no way to express "the 2017 amendments as they stood on 1 July 2026 with GSR 128(E) in force".

`instances_recorded` counts identical packs on the shelf without demanding nineteen more findings rows per pack. `duplicate_of` points at the first scan when the same package is photographed twice; every aggregate in §5 excludes `duplicate_of IS NOT NULL`, or the double-count guard in `12` §6 (#69) achieves nothing.

There are no `image_urls` and no `image_hashes` JSON columns. A hash inside a JSON array cannot be indexed, so duplicate detection over it degrades to a full scan and rehash of every row — once per upload. Images are rows. There are no `reasons`, `checklist` or `extracted_fields` JSON columns either, for the reason in §1 goal 5.

### 3.5 `scan_images` — 26 columns

One row per photograph. Four to five per scan, all attached to the same scan.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER / SERIAL | PK | |
| `scan_id` | INTEGER | FK scans.id NOT NULL, indexed | |
| `panel` | VARCHAR(24) | NOT NULL | `front`, `back`, `side`, `mrp`, `batch`, `other` |
| `sequence` | INTEGER | NOT NULL DEFAULT 0 | Second attempt at the same panel |
| `file_path` | VARCHAR(400) | NOT NULL | Relative to `EVIDENCE_DIR` |
| `byte_size` | INTEGER | NOT NULL | Bytes as written |
| `width_px` | INTEGER | NOT NULL | |
| `height_px` | INTEGER | NOT NULL | |
| `mime_type` | VARCHAR(40) | NOT NULL | Sniffed, not taken from the filename |
| `sha256` | VARCHAR(64) | NOT NULL, indexed | **Over the bytes on disk** |
| `phash` | VARCHAR(16) | NULL | 64-bit perceptual hash, hex |
| `phash_b0` … `phash_b7` | INTEGER | NULL, each indexed | Eight 8-bit bands — §6.3 |
| `captured_at` | TIMESTAMPTZ | NULL | From EXIF where available |
| `exif_stripped` | BOOLEAN | NOT NULL DEFAULT FALSE | True on derived copies only |
| `rectified` | BOOLEAN | NOT NULL DEFAULT FALSE | Homography applied to a derived copy |
| `residual_tilt_deg` | FLOAT | NULL | After rectification |
| `blur_variance` | FLOAT | NULL | Laplacian variance, recorded |
| `glare_ratio` | FLOAT | NULL | Saturated-pixel fraction, recorded |
| `created_at` | TIMESTAMPTZ | DEFAULT now | |

UNIQUE `(scan_id, panel, sequence)` — a second front-panel photograph is `sequence = 1`, not a silent overwrite of the first.

**`sha256` is computed by reading the file back off disk after it is written**, not over the request body in memory. The two differ whenever anything in the path re-encodes, and the hash that matters is the one over the bytes an inspector can later produce. `GET /scans/{id}/verify` re-reads every file and recomputes, which is the only form of the claim that means anything.

**EXIF stays in the original and is stripped only from derived copies.** `exif_stripped` on the original row is FALSE and stays FALSE. Version 1.x stripped on ingest for privacy, which destroyed the capture timestamp and orientation on the one copy that is evidence. Privacy is handled where the exposure is — the derived display copy and the report — and `12` §9 (#88) covers bystanders.

**`blur_variance` and `glare_ratio` are recorded, never grounds for rejection.** A blurred photograph of an illegible label is a fact about the package as found; refusing the upload discards it. The image is accepted with HTTP 201 and a quality note, the dependent checks return `not_assessed` citing image quality, and the scan lands in the review queue. Rejecting at the gate means the officer's only route is to not record the package at all.

`rectified` and `residual_tilt_deg` describe a **derived** copy, not this file. The original is never rewritten: §4.4 makes `scan_images` immutable in both engines, so a swapped `file_path` or `sha256` cannot be hidden.

### 3.6 `findings` — 18 columns

Exactly nineteen rows per scan: CHK01–CHK18 plus the sub-check CHK06b. A halted check writes a row carrying the halt reason; it is never skipped.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER / SERIAL | PK | |
| `scan_id` | INTEGER | FK scans.id NOT NULL, indexed | |
| `check_id` | VARCHAR(8) | NOT NULL, indexed | `CHK01`…`CHK18`, `CHK06b` |
| `title` | VARCHAR(160) | NOT NULL | Human-readable check name |
| `engine_verdict` | VARCHAR(16) | NOT NULL, CHECK IN ('pass','fail','not_assessed') | **Immutable** |
| `human_verdict` | VARCHAR(16) | NULL, same CHECK | The disagreement, recorded |
| `override_reason` | TEXT | NULL, required when `human_verdict` set | |
| `overridden_by` | INTEGER | FK users.id NULL | |
| `overridden_at` | TIMESTAMPTZ | NULL | |
| `severity` | VARCHAR(16) | NOT NULL, CHECK IN ('critical','major','minor','advisory') | |
| `reason` | TEXT | NULL, **required when `not_assessed`** | Why it could not be assessed |
| `limb` | VARCHAR(8) | NULL, CHECK: only on a `fail`, IN ('36(1)','36(2)') | |
| `observed` | TEXT | NULL | What was found, with uncertainty |
| `required` | TEXT | NULL | What the provision requires, descriptively |
| `citation` | VARCHAR(240) | NULL | Descriptive requirement; pinpoint only if verified |
| `ledger_ref` | VARCHAR(8) | NULL | `L-01`…`L-15` |
| `confidence` | FLOAT | NULL | OCR confidence for the field read |
| `created_at` | TIMESTAMPTZ | DEFAULT now | |

UNIQUE `(scan_id, check_id)` — one row per check per scan, so a re-assessment replaces rather than accumulates.

**`engine_verdict` and `human_verdict` are separate columns, and the first is immutable.** Version 2.0 had a single `verdict` that a supervisor's override wrote over, which destroys the only record of what the engine actually computed. An override is additive: the engine's answer stays, the human's answer sits beside it with a mandatory reason and an attributed author, and the report prints both. `effective_verdict` is a Python property, `human_verdict or engine_verdict` — not a column, because a stored copy of a derived value is one more thing to fall out of step.

**`reason` is mandatory on `not_assessed`, as a database constraint rather than a convention.** `CHECK (engine_verdict <> 'not_assessed' OR reason IS NOT NULL)` is the schema-level expression of the product's central promise: an abstention that does not say why is indistinguishable from a bug, and it is the row a judge will ask about.

Two further constraints exist because both states are incoherent and both were reachable in v1.x. `NOT (engine_verdict = 'fail' AND severity = 'advisory')` — an advisory item cannot be a failure, which is what kept CHK17 from ever returning `fail` on FSS Act matter. And `limb IS NULL OR (engine_verdict = 'fail' AND limb IN ('36(1)','36(2)'))` — a limb is a property of a failure. Before this revision `limb` was computed by each check, carried on `FindingResult`, and dropped on persist, so `scans.violation_limb` said `36(2)` and no row said which finding put it there.

**`citation` holds the descriptive requirement, not a pinpoint provision, unless that provision is verified.** Fifteen figures in this project are recorded as unverified in the ledger `L-01`…`L-15` in `02` §15, because the primary text could not be reached from this environment. `cite(key, descriptive)` prints the description plus `[L-xx — unverified]`, and `ledger_ref` stores which entry. Inventing a confident pinpoint citation for an unverified figure is the failure mode this column exists to prevent.

### 3.7 `audit_logs` — 14 columns

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER / SERIAL | PK | |
| `seq` | INTEGER | UNIQUE NOT NULL, indexed | Chain position, gapless |
| `inspection_id` | INTEGER | FK NULL, indexed | |
| `scan_id` | INTEGER | FK NULL, indexed | |
| `user_id` | INTEGER | FK users.id NULL, indexed | |
| `action` | VARCHAR(48) | NOT NULL | |
| `old_value` | TEXT | NULL | |
| `new_value` | TEXT | NULL | |
| `reason` | TEXT | NULL | |
| `ip_address` | VARCHAR(45) | NULL | IPv6 fits in 45 |
| `user_agent` | VARCHAR(240) | NULL | |
| `timestamp` | TIMESTAMPTZ | DEFAULT now | **Server** time |
| `hash_prev` | VARCHAR(64) | NULL | NULL only on the genesis row |
| `hash_self` | VARCHAR(64) | NOT NULL | |

`inspection_id` and `scan_id` are nullable. A login, a password change or an install rebind has neither, and v1.x declared them `NOT NULL` while its own action list included exactly those events — so they could not be written at all.

**The chain covers the actor and the new value.**

```python
def chain_hash(row: dict, hash_prev: str) -> str:
    payload = json.dumps({
        "seq":           row["seq"],
        "inspection_id": row["inspection_id"],
        "scan_id":       row["scan_id"],
        "user_id":       row["user_id"],          # who
        "action":        row["action"],
        "old_value":     row["old_value"],
        "new_value":     row["new_value"],        # what it became
        "reason":        row["reason"],
        "timestamp":     row["timestamp"].isoformat(),
        "hash_prev":     hash_prev,
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()
```

An earlier formula hashed only `action`, `old_value` and `timestamp`. That leaves the two fields an attacker would change — the actor and the new value — outside the digest, so the identity of who overrode a finding and the value they overrode it to could both be rewritten while every hash still verified. `sort_keys=True` and explicit separators matter as much as the field list: a chain whose digest depends on Python's dict ordering or on whitespace verifies today and fails after an unrelated refactor.

Verification walks from `seq = 1`, recomputing each `hash_self` from the row's own fields and its predecessor's hash. On the genesis row the **stored** `hash_prev` is NULL and the **hashed** value is the string `"0"` — the one place where the column and the digest input deliberately differ. Both halves have to agree on that substitution, so it is stated here rather than left to whichever of the two was written first: `chain_hash(row, hash_prev or "0")` at write time, the same expression at verify time.

**Published heads.** Once a day the current head `hash_self` and its `seq` are appended to a file outside the database, on a separate volume, with the operating-system timestamp. Without this, an attacker with write access rebuilds the chain from `seq = 1` with whatever content they prefer: internally consistent, fully verifying and entirely false. With published heads the rebuilt chain's head does not match yesterday's recorded value, and the discrepancy is visible to anyone holding the file.

**`seq` allocation is a single-writer operation.** It must be allocated inside the same transaction that computes `hash_prev` from the current head. Under `--workers 4` two workers can read the same head, and a naive retry recomputes `hash_prev` from a different predecessor and appends a **fork** that verifies locally and fails globally — `11` §2.7.

---

## 4. DDL

### 4.1 Where this DDL comes from

The models in `Backend.md` §4 are the source. `alembic revision --autogenerate` reads them and emits the migration; `alembic upgrade head` applies it. The SQL below is what that produces on SQLite, written out so it can be read and checked — it is documentation of the migration, not a script to run instead of one. If the two ever disagree, the models are right and this section is stale.

Three things Alembic does **not** autogenerate and which therefore live in the migration by hand: the triggers in §4.4 and §4.5, the composite indexes in §4.3 that no model declares, and the `CHECK` constraints on SQLite, where an added constraint requires a table rebuild through `batch_alter_table`.

### 4.2 SQLite — development

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id      VARCHAR(32)  NOT NULL UNIQUE,
  full_name        VARCHAR(120) NOT NULL,
  email            VARCHAR(160) UNIQUE,
  phone            VARCHAR(20),
  password_hash    VARCHAR(128) NOT NULL,
  role             VARCHAR(16)  NOT NULL DEFAULT 'inspector',
  jurisdiction     VARCHAR(120),
  is_active        BOOLEAN      NOT NULL DEFAULT 1,
  install_id       VARCHAR(64),
  install_bound_at DATETIME,
  token_epoch      INTEGER      NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_user_role CHECK (role IN ('admin','inspector'))
);

CREATE TABLE stores (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              VARCHAR(160) NOT NULL,
  store_type        VARCHAR(40),
  address           TEXT,
  city              VARCHAR(80),
  district          VARCHAR(80),
  state             VARCHAR(80),
  pincode           VARCHAR(10),
  latitude          REAL,
  longitude         REAL,
  geofence_radius_m INTEGER  NOT NULL DEFAULT 150,
  is_active         BOOLEAN  NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inspections (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER     NOT NULL REFERENCES users(id),
  store_id            INTEGER     NOT NULL REFERENCES stores(id),
  inspection_date     DATE        NOT NULL,
  status              VARCHAR(16) NOT NULL DEFAULT 'draft',
  transaction_type    VARCHAR(32),
  in_scope            BOOLEAN,
  out_of_scope_reason TEXT,
  latitude            REAL,
  longitude           REAL,
  gps_accuracy_m      REAL,
  geofence_status     VARCHAR(16),
  geofence_distance_m REAL,
  geofence_reason     TEXT,
  mock_location       BOOLEAN,
  local_created_at    DATETIME,
  synced_at           DATETIME,
  clock_skew_seconds  INTEGER,
  edited_offline      BOOLEAN     NOT NULL DEFAULT 0,
  signature_status    VARCHAR(24),
  notes               TEXT,
  created_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at        DATETIME,
  CONSTRAINT ck_insp_status CHECK (status IN ('draft','submitted')),
  CONSTRAINT ck_insp_txn CHECK (transaction_type IS NULL OR transaction_type IN
    ('retail_sale','wholesale','institutional','industrial','packed_in_presence','export','other')),
  CONSTRAINT ck_insp_geofence CHECK (geofence_status IS NULL OR geofence_status IN
    ('inside','outside','unknown')),
  CONSTRAINT ck_insp_signature CHECK (signature_status IS NULL OR signature_status IN
    ('signed','refused','unavailable')),
  -- An out-of-scope determination must say why. `IS NOT FALSE` rather than
  -- `= 1`, so the constraint text is identical on SQLite and PostgreSQL and
  -- so NULL — "not yet determined" — is not treated as out of scope.
  CONSTRAINT ck_insp_oos_reason CHECK
    (in_scope IS NOT FALSE OR out_of_scope_reason IS NOT NULL)
);
```

```sql
CREATE TABLE scans (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id            INTEGER     NOT NULL REFERENCES inspections(id),

  commodity_generic        VARCHAR(120),
  brand_name               VARCHAR(120),
  commodity_category       VARCHAR(60),
  batch_number             VARCHAR(60),
  barcode                  VARCHAR(64),

  net_quantity_value       REAL,
  net_quantity_unit        VARCHAR(12),
  is_imported              BOOLEAN,
  is_perishable            BOOLEAN,
  is_medical_device        BOOLEAN,
  is_tobacco               BOOLEAN,
  has_sticker              BOOLEAN,
  sticker_reduces_price    BOOLEAN,
  sticker_covers_original  BOOLEAN,

  overall_result           VARCHAR(16) NOT NULL DEFAULT 'not_assessed',
  violation_limb           VARCHAR(16),
  recommended_action       VARCHAR(40),
  checks_total             INTEGER     NOT NULL DEFAULT 18,
  checks_assessed          INTEGER     NOT NULL DEFAULT 0,

  panel_shape              VARCHAR(20),
  panel_height_mm          REAL,
  panel_width_mm           REAL,
  panel_diameter_mm        REAL,
  pdp_area_cm2             REAL,
  total_surface_area_cm2   REAL,
  is_blown_moulded         BOOLEAN     NOT NULL DEFAULT 0,

  mm_per_pixel             REAL,
  scale_source             VARCHAR(32),
  mm_per_pixel_uncertainty REAL,

  rules_as_at              DATE        NOT NULL,
  catalog_hash             VARCHAR(64) NOT NULL,
  engine_version           VARCHAR(16) NOT NULL,

  duplicate_of             INTEGER REFERENCES scans(id),
  instances_recorded       INTEGER     NOT NULL DEFAULT 1,
  ocr_confidence_mean      REAL,
  ocr_text                 TEXT,
  created_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT ck_scan_result CHECK (overall_result IN
    ('compliant','violation','not_assessed','out_of_scope')),
  CONSTRAINT ck_scan_limb CHECK (violation_limb IS NULL OR violation_limb IN
    ('36(1)','36(2)','both')),
  CONSTRAINT ck_scan_shape CHECK (panel_shape IS NULL OR panel_shape IN
    ('rectangular','cylindrical','other')),
  CONSTRAINT ck_scan_scale CHECK (scale_source IS NULL OR scale_source IN
    ('declared','id1_card','coin_5inr','none')),
  CONSTRAINT ck_scan_denominator CHECK (checks_assessed <= checks_total),
  -- A scan cannot be its own duplicate.
  CONSTRAINT ck_scan_not_self_dup CHECK (duplicate_of IS NULL OR duplicate_of <> id),
  -- A limb belongs to a violation and nothing else.
  CONSTRAINT ck_scan_limb_coherent CHECK (violation_limb IS NULL OR overall_result = 'violation'),
  -- 'compliant' is reachable only when every check was assessed. This is the
  -- product's central promise as a database invariant.
  CONSTRAINT ck_scan_compliant_complete CHECK
    (overall_result <> 'compliant' OR checks_assessed = checks_total)
);
```

The last constraint is the one worth pausing on. `overall_result = 'compliant'` requires `checks_assessed = checks_total`, so a partially assessed scan **cannot** be stored as compliant even if the application layer has a bug that tries. `04` §1.1 states the promise in prose; this is the same sentence in a form that survives a refactor.

`checks_total` is per scan type: 16 for a package scan without a listing (CHK15/CHK16 return `not_assessed` with a listing reason, so the scan honestly reports 16/18 and resolves `not_assessed`, never `compliant`), 18 with a listing. `compliant` therefore means `assessed == total` for that scan's denominator — not "18" as a magic constant. No stricter CHECK (e.g. `checks_total = 18`) is added: it would reject the honest 16/18 package scan and break the seed.

```sql
CREATE TABLE scan_images (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id           INTEGER     NOT NULL REFERENCES scans(id),
  panel             VARCHAR(24) NOT NULL,
  sequence          INTEGER     NOT NULL DEFAULT 0,
  file_path         VARCHAR(400) NOT NULL,
  byte_size         INTEGER     NOT NULL,
  width_px          INTEGER     NOT NULL,
  height_px         INTEGER     NOT NULL,
  mime_type         VARCHAR(40) NOT NULL,
  sha256            VARCHAR(64) NOT NULL,
  phash             VARCHAR(16),
  phash_b0          INTEGER,
  phash_b1          INTEGER,
  phash_b2          INTEGER,
  phash_b3          INTEGER,
  phash_b4          INTEGER,
  phash_b5          INTEGER,
  phash_b6          INTEGER,
  phash_b7          INTEGER,
  captured_at       DATETIME,
  exif_stripped     BOOLEAN     NOT NULL DEFAULT 0,
  rectified         BOOLEAN     NOT NULL DEFAULT 0,
  residual_tilt_deg REAL,
  blur_variance     REAL,
  glare_ratio       REAL,
  created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_image_slot UNIQUE (scan_id, panel, sequence),
  CONSTRAINT ck_img_panel CHECK (panel IN ('front','back','side','mrp','batch','other')),
  CONSTRAINT ck_img_bytes CHECK (byte_size > 0 AND width_px > 0 AND height_px > 0),
  CONSTRAINT ck_img_sha_len CHECK (length(sha256) = 64)
);
```

```sql
CREATE TABLE findings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id         INTEGER      NOT NULL REFERENCES scans(id),
  check_id        VARCHAR(8)   NOT NULL,
  title           VARCHAR(160) NOT NULL,
  engine_verdict  VARCHAR(16)  NOT NULL,
  human_verdict   VARCHAR(16),
  override_reason TEXT,
  overridden_by   INTEGER REFERENCES users(id),
  overridden_at   DATETIME,
  severity        VARCHAR(16)  NOT NULL,
  reason          TEXT,
  limb            VARCHAR(8),
  observed        TEXT,
  required        TEXT,
  citation        VARCHAR(240),
  ledger_ref      VARCHAR(8),
  confidence      REAL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_finding_per_check UNIQUE (scan_id, check_id),
  CONSTRAINT ck_finding_engine_verdict CHECK (engine_verdict IN
    ('pass','fail','not_assessed')),
  CONSTRAINT ck_finding_human_verdict CHECK (human_verdict IS NULL OR human_verdict IN
    ('pass','fail','not_assessed')),
  CONSTRAINT ck_finding_severity CHECK (severity IN
    ('critical','major','minor','advisory')),
  -- An abstention must say why.
  CONSTRAINT ck_finding_reason_required CHECK
    (engine_verdict <> 'not_assessed' OR reason IS NOT NULL),
  -- An advisory item cannot be a failure; a failure cannot be advisory.
  CONSTRAINT ck_finding_severity_coherent CHECK
    (NOT (engine_verdict = 'fail' AND severity = 'advisory')),
  -- An override must say why, and must name who made it.
  CONSTRAINT ck_finding_override_reason CHECK
    (human_verdict IS NULL OR (override_reason IS NOT NULL AND overridden_by IS NOT NULL)),
  -- A limb is a property of a failure.
  CONSTRAINT ck_finding_limb CHECK
    (limb IS NULL OR (engine_verdict = 'fail' AND limb IN ('36(1)','36(2)')))
);

CREATE TABLE audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seq           INTEGER     NOT NULL UNIQUE,
  inspection_id INTEGER REFERENCES inspections(id),
  scan_id       INTEGER REFERENCES scans(id),
  user_id       INTEGER REFERENCES users(id),
  action        VARCHAR(48) NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  ip_address    VARCHAR(45),
  user_agent    VARCHAR(240),
  timestamp     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hash_prev     VARCHAR(64),
  hash_self     VARCHAR(64) NOT NULL,
  CONSTRAINT ck_audit_seq CHECK (seq > 0),
  CONSTRAINT ck_audit_hash_len CHECK (length(hash_self) = 64)
);
```

### 4.3 Indexes

```sql
-- single-column: every foreign key, and the identity lookups
CREATE UNIQUE INDEX ix_user_employee   ON users (employee_id);
CREATE        INDEX ix_user_install    ON users (install_id);
CREATE        INDEX ix_store_name      ON stores (name);
CREATE        INDEX ix_insp_user       ON inspections (user_id);
CREATE        INDEX ix_insp_store      ON inspections (store_id);
CREATE        INDEX ix_insp_date       ON inspections (inspection_date);
CREATE        INDEX ix_scan_insp       ON scans (inspection_id);
CREATE        INDEX ix_scan_barcode    ON scans (barcode);
CREATE        INDEX ix_scan_dup        ON scans (duplicate_of);
CREATE        INDEX ix_img_scan        ON scan_images (scan_id);
CREATE        INDEX ix_img_sha         ON scan_images (sha256);
CREATE        INDEX ix_find_scan       ON findings (scan_id);
CREATE        INDEX ix_find_check      ON findings (check_id);
CREATE        INDEX ix_audit_insp      ON audit_logs (inspection_id);
CREATE        INDEX ix_audit_scan      ON audit_logs (scan_id);
CREATE        INDEX ix_audit_user      ON audit_logs (user_id);
CREATE UNIQUE INDEX ix_audit_seq       ON audit_logs (seq);

-- composite: the shape every report query actually filters on
CREATE INDEX ix_insp_date_user   ON inspections (inspection_date, user_id);
CREATE INDEX ix_insp_store_date  ON inspections (store_id, inspection_date);
CREATE INDEX ix_scan_result_made ON scans (overall_result, created_at);
CREATE INDEX ix_find_check_verd  ON findings (check_id, engine_verdict);
CREATE INDEX ix_find_scan_check  ON findings (scan_id, check_id);
CREATE INDEX ix_audit_ts         ON audit_logs (timestamp);

-- banded perceptual hash, §6.3 — eight bands, not four
CREATE INDEX ix_img_pb0 ON scan_images (phash_b0);
CREATE INDEX ix_img_pb1 ON scan_images (phash_b1);
CREATE INDEX ix_img_pb2 ON scan_images (phash_b2);
CREATE INDEX ix_img_pb3 ON scan_images (phash_b3);
CREATE INDEX ix_img_pb4 ON scan_images (phash_b4);
CREATE INDEX ix_img_pb5 ON scan_images (phash_b5);
CREATE INDEX ix_img_pb6 ON scan_images (phash_b6);
CREATE INDEX ix_img_pb7 ON scan_images (phash_b7);
```

**Every foreign key is indexed explicitly.** SQLite does not create these automatically, and a missing one turns the store-wise breakdown in §5.2 into a nested scan. PostgreSQL does not create them either — only the *referenced* side gets an index, from its primary key.

The composite indexes cost one line each and match the actual `WHERE` clauses. An earlier draft noted a composite "would be even faster" and declined it because single-column indexes suffice "for 1000 rows"; they do, and the demo query the judges watch is the one that must not stall.

### 4.4 Append-only enforcement — SQLite

Three tables are append-only, and one column inside a fourth is immutable. The application respects that; the database enforces it, because an integrity control that lives only in the service layer is one careless `session.merge()` away from being absent.

```sql
-- audit_logs: the chain is worthless if a row can be rewritten or removed.
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

-- scan_images: the stored bytes and their hash are the evidence.
CREATE TRIGGER img_no_update BEFORE UPDATE ON scan_images
BEGIN
  SELECT RAISE(ABORT, 'scan_images is append-only');
END;

CREATE TRIGGER img_no_delete BEFORE DELETE ON scan_images
BEGIN
  SELECT RAISE(ABORT, 'scan_images is append-only');
END;

-- findings: human_verdict may be written; engine_verdict may never change.
CREATE TRIGGER find_engine_immutable BEFORE UPDATE OF engine_verdict ON findings
WHEN NEW.engine_verdict <> OLD.engine_verdict
BEGIN
  SELECT RAISE(ABORT, 'engine_verdict is immutable; write human_verdict instead');
END;
```

`BEFORE UPDATE OF engine_verdict` is deliberate. A blanket `BEFORE UPDATE ON findings` would also block the override path, which is a legitimate write to `human_verdict`, `override_reason`, `overridden_by` and `overridden_at` on an existing row. The narrow form lets the override through and stops the rewrite.

`scan_images` has no delete trigger in some earlier drafts. It has one here: deleting the image row while the file stays on disk leaves evidence that nothing points to, and deleting it after removing the file destroys the only artefact a hearing can examine. Retention deletion, when it happens, is a documented administrative operation performed with triggers dropped and re-created — §9.

### 4.5 Append-only enforcement — PostgreSQL

Identical guarantees, different syntax. Two functions, reused across tables.

```sql
CREATE OR REPLACE FUNCTION deny_write() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION deny_engine_verdict_change() RETURNS trigger AS $$
BEGIN
  IF NEW.engine_verdict IS DISTINCT FROM OLD.engine_verdict THEN
    RAISE EXCEPTION 'engine_verdict is immutable; write human_verdict instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION deny_write();

CREATE TRIGGER img_append_only
  BEFORE UPDATE OR DELETE ON scan_images
  FOR EACH ROW EXECUTE FUNCTION deny_write();

CREATE TRIGGER find_engine_immutable
  BEFORE UPDATE ON findings
  FOR EACH ROW EXECUTE FUNCTION deny_engine_verdict_change();
```

Note the asymmetry in the last one: PostgreSQL has no `BEFORE UPDATE OF col` row-level equivalent that fires *only* on a change, so the check moves inside the function and `IS DISTINCT FROM` does the comparison — which, unlike `<>`, is correct when either side is NULL.

**Both dialects must be exercised in CI.** A trigger that exists only in the development engine is an integrity control that is absent in production. `10_TESTING.md` §7 runs the same five refusal tests against SQLite and, when `PG_TEST_URL` is exported, against PostgreSQL; unset, the PostgreSQL half skips loudly rather than passing vacuously.

Both sets are created by an Alembic revision using `op.execute()`. Autogenerate does not see triggers, so they are written by hand once and never regenerate away.

---

## 5. THE QUERIES THAT MATTER

Six queries carry the entire product. Every one of them reaches a store, an officer or a date **through `inspections`** — there is no shortcut column on `scans` (§2), so `JOIN inspections` appears in almost all of them. That join is the price of not having two contradictory answers to "which store was this?".

### 5.1 Dashboard headline counts

```sql
SELECT
  COUNT(*)                                                        AS scans_total,
  SUM(CASE WHEN s.overall_result = 'compliant'     THEN 1 ELSE 0 END) AS compliant,
  SUM(CASE WHEN s.overall_result = 'violation'     THEN 1 ELSE 0 END) AS violation,
  SUM(CASE WHEN s.overall_result = 'not_assessed'  THEN 1 ELSE 0 END) AS not_assessed,
  SUM(CASE WHEN s.overall_result = 'out_of_scope'  THEN 1 ELSE 0 END) AS out_of_scope
FROM scans s
JOIN inspections i ON i.id = s.inspection_id
WHERE i.inspection_date >= :from_date
  AND i.inspection_date <  :to_date
  AND s.duplicate_of IS NULL;
```

Four counters, not two. A dashboard that reports only `compliant` and `violation` silently folds abstentions into one of them, and the number the officer acts on stops matching the number the engine produced. `duplicate_of IS NULL` keeps a re-scan of the same pack from being counted twice; the duplicate row is kept, not deleted, so the de-duplication itself remains auditable.

The five counters sum to `scans_total` by construction, and `10_TESTING.md` asserts exactly that. If they ever do not, `ck_scan_result` has been bypassed.

### 5.2 Most-violated check across a period

```sql
SELECT f.check_id,
       f.title,
       COUNT(*) AS failures
FROM findings f
JOIN scans s       ON s.id = f.scan_id
JOIN inspections i ON i.id = s.inspection_id
WHERE f.engine_verdict = 'fail'
  AND i.inspection_date >= :from_date
  AND s.duplicate_of IS NULL
GROUP BY f.check_id, f.title
ORDER BY failures DESC
LIMIT 10;
```

Grouped on `engine_verdict`, deliberately. This chart answers "what does the engine keep finding", which is a statement about packaging in the market. The parallel chart that groups on `COALESCE(f.human_verdict, f.engine_verdict)` answers "what did officers ultimately record", which is a different question. `04_NiyamNetra_PRD.md` §6.2 requires the dashboard to label which of the two it is showing; an unlabelled mixture of the two is the easiest way to publish a misleading figure.

### 5.3 Store leaderboard

```sql
SELECT st.id,
       st.name,
       st.city,
       COUNT(DISTINCT i.id) AS inspections,
       COUNT(s.id)          AS scans,
       SUM(CASE WHEN s.overall_result = 'violation' THEN 1 ELSE 0 END) AS violations
FROM stores st
JOIN inspections i ON i.store_id = st.id
LEFT JOIN scans  s ON s.inspection_id = i.id AND s.duplicate_of IS NULL
WHERE i.inspection_date >= :from_date
GROUP BY st.id, st.name, st.city
HAVING scans > 0
ORDER BY violations DESC, scans DESC;
```

`LEFT JOIN` on `scans` so a visit that produced no scan still counts as an inspection; `HAVING scans > 0` then keeps such stores off a *violation-rate* leaderboard, where a zero denominator would either divide by zero or, worse, sort to the top as "0% violations".

**No violation rate is computed in SQL.** `04` §6.2 fixes the denominator as `violation / (compliant + violation)` — abstentions and out-of-scope packs are excluded from both halves — and that arithmetic lives in one Python function so the whole product cannot drift into two definitions of the same percentage.

### 5.4 One inspection, fully expanded

```sql
SELECT i.id            AS inspection_id,
       i.inspection_date,
       i.status,
       i.transaction_type,
       i.in_scope,
       i.out_of_scope_reason,
       i.geofence_status,
       i.geofence_distance_m,
       u.employee_id,
       u.full_name      AS inspector,
       st.name          AS store,
       st.city,
       s.id             AS scan_id,
       s.commodity_generic,
       s.brand_name,
       s.overall_result,
       s.violation_limb,
       s.recommended_action,
       s.checks_assessed,
       s.checks_total,
       s.rules_as_at,
       s.engine_version
FROM inspections i
JOIN users  u  ON u.id  = i.user_id
JOIN stores st ON st.id = i.store_id
LEFT JOIN scans s ON s.inspection_id = i.id
WHERE i.id = :inspection_id
ORDER BY s.id;
```

This is the report generator's source row set. `checks_assessed` and `checks_total` travel with every scan so the PDF can print "16 of 18 checks assessed" without recounting, and `rules_as_at` plus `engine_version` travel with it so a report regenerated next year states which catalogue produced the verdict rather than silently re-deciding it under new rules.

### 5.5 Review queue

```sql
SELECT s.id AS scan_id,
       i.inspection_date,
       st.name AS store,
       s.commodity_generic,
       s.checks_assessed,
       s.checks_total,
       COUNT(f.id) FILTER (WHERE f.engine_verdict = 'not_assessed') AS abstentions
FROM scans s
JOIN inspections i ON i.id = s.inspection_id
JOIN stores st     ON st.id = i.store_id
JOIN findings f    ON f.scan_id = s.id
WHERE s.overall_result = 'not_assessed'
   OR s.checks_assessed < s.checks_total
GROUP BY s.id, i.inspection_date, st.name, s.commodity_generic,
         s.checks_assessed, s.checks_total
ORDER BY abstentions DESC, i.inspection_date ASC;
```

`FILTER (WHERE …)` is standard SQL and works on PostgreSQL and on SQLite 3.30+ (2019). The SQLAlchemy expression is `func.count(Finding.id).filter(...)`, which emits the same clause on both.

The queue exists because `not_assessed` is a real outcome, not a failure of the engine. Something the machine declined to judge is precisely the thing a human should look at, and `04` §4.4 makes clearing it part of the workflow rather than an optional screen.

### 5.6 Audit chain verification

```sql
SELECT seq, hash_prev, hash_self
FROM audit_logs
ORDER BY seq;
```

Deliberately trivial. Verification is not a SQL problem: the service reads the rows in `seq` order, recomputes each `hash_self` from the row's own fields plus the previous row's hash, and stops at the first mismatch — §3.7 gives the function. A `WITH RECURSIVE` query that appears to verify the chain inside the database would be checking the stored hashes against each other, which they will always satisfy; only recomputation from the payload detects tampering.

---

## 6. INDEXING AND THE DUPLICATE LOOKUP

### 6.1 What is indexed, and why that set

Three categories, and nothing outside them:

1. **Every foreign key.** Neither engine creates these for you. The join in every query in §5 traverses one.
2. **The identity columns used for lookup** — `users.employee_id` (login), `scans.barcode` (repeat-product search), `scan_images.sha256` (evidence verification), `audit_logs.seq` (chain walk).
3. **The composite prefixes the report queries filter on**, listed in §4.3.

Nothing else. An index on `users.role` over six distinct values, or on `inspections.status` over five, costs write time and buys nothing a scan of a small table would not give. Indexes are added when a query plan shows they are needed, and the plan is checked with `EXPLAIN QUERY PLAN` on SQLite and `EXPLAIN (ANALYZE, BUFFERS)` on PostgreSQL — not guessed.

### 6.2 What is deliberately *not* indexed

`scans.ocr_text` gets no index in the base schema. It is the raw OCR dump, kept so a verdict can be re-explained; it is not a search surface at MVP scale, and full-text infrastructure over it (FTS5 on SQLite, `tsvector` plus GIN on PostgreSQL) is a §10 item with a named cost. An earlier draft specified a GIN index on `extracted_fields`, a JSONB column that does not exist in this schema at all — the structured extraction lives in `findings.observed` per check, which is where a query would actually look.

### 6.3 The banded perceptual-hash lookup

The naive duplicate search reads every stored image and rehashes it on every upload: O(n) disk reads per scan, which at a few thousand images takes longer than the inspection. The fix is to index the hash so candidates come from the database and only candidates are compared.

A 64-bit pHash is split into **eight 8-bit bands**, each in its own indexed integer column. Candidates are the rows agreeing exactly on at least one band; exact Hamming distance is then computed in Python over that small set.

The bound that makes this sound, stated precisely: *d* differing bits can touch at most *d* bands, so with *k* bands at least *k − d* bands remain bit-for-bit identical. The band index is therefore a **complete** filter — it misses nothing — exactly while **d ≤ k − 1**.

**This is why there are eight bands and not four.** Four 16-bit bands guarantee completeness only to distance 3, and the near-duplicate threshold in this project is 5. The gap is not theoretical: flip bits 5, 9, 16, 38 and 50 of any hash and all four 16-bit bands differ, so the `OR` matches nothing and a genuine near-duplicate at distance 5 is never even a candidate. Earlier drafts of `04` §9, `05` §2.4 and `Backend.md` §5.4 all asserted completeness at distance 5 over four bands "by the pigeonhole principle"; the assertion was false, and the consequence was a fraud control that appeared to work and quietly did not. Eight bands are complete through distance 7, which covers the threshold with margin.

The cost is candidate volume. An 8-bit band takes 256 values, so with *n* images the expected candidate set is about *n* × 8 / 256 = *n* / 32 rows, against *n* / 16 384 for four 16-bit bands. At demo scale — hundreds to a few thousand images — that is tens of rows compared bit by bit in microseconds, against a table scan and *n* file reads.

```sql
SELECT id, phash
FROM scan_images
WHERE scan_id <> :this_scan_id
  AND (phash_b0 = :b0 OR phash_b1 = :b1 OR phash_b2 = :b2 OR phash_b3 = :b3
    OR phash_b4 = :b4 OR phash_b5 = :b5 OR phash_b6 = :b6 OR phash_b7 = :b7);
-- exact Hamming distance is evaluated in application code over these rows only
```

`b0` is the most significant band, so band order is identical in both engines and a hash banded on SQLite matches the same hash banded on PostgreSQL.

The threshold and the band count are tied together in code (`assert PHASH_NEAR_DUPLICATE <= PHASH_BANDS - 1`, `Backend.md` §5.4), because raising the threshold without adding bands re-opens the same silent gap, and `10_TESTING.md` §7 asserts the completeness property against brute force over generated pairs at every distance from 1 to 7.

**A match opens a review item and never a verdict.** Two shelf-mates of the same SKU photographed a minute apart are legitimately within distance 5. The interface shows both images, both GPS fixes and both timestamps for a human to close; escalation to a fraud flag requires the travel-feasibility test in `12` §3 to fail as well. `09` §5.4 states the limit; nothing in the schema converts hash proximity into an allegation.

---

## 7. TWO ENGINES, ONE SCHEMA

SQLite in development and on the demo machine; PostgreSQL in production. The same models, the same migrations, the same tests.

### 7.1 Engine setup

```python
# db.py
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}
        if settings.DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
    future=True,
)

if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")     # per connection, not per database
        cur.execute("PRAGMA journal_mode=WAL")    # concurrent readers during a write
        cur.execute("PRAGMA synchronous=NORMAL")  # safe under WAL
        cur.execute("PRAGMA busy_timeout=5000")   # wait rather than raise on a lock
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
```

**`PRAGMA foreign_keys` is per connection, and off by default.** Issuing it once in a setup script leaves every pooled connection without it, which makes the whole referential structure of §4 decorative — a `findings` row can point at a `scan_id` that does not exist and SQLite will store it without complaint. The `connect` listener is the only placement that holds for every connection the pool ever opens, including ones created hours later. `10_TESTING.md` §7 asserts it by attempting an orphan insert and requiring an `IntegrityError`.

`check_same_thread=False` is required because FastAPI serves requests on a thread pool; the session is still per-request, created and closed by the `get_db` dependency.

### 7.2 Where the dialects genuinely differ

| Concern | SQLite | PostgreSQL |
|---|---|---|
| Primary key | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL` / `IDENTITY` |
| Timestamps | Text, no zone; `DateTime(timezone=True)` is advisory | `TIMESTAMPTZ`, real zone arithmetic |
| Adding a `CHECK` | Needs `op.batch_alter_table()` — table rebuild | `ALTER TABLE … ADD CONSTRAINT` |
| Append-only guard | `CREATE TRIGGER … RAISE(ABORT, …)` | `plpgsql` function + row trigger |
| Concurrency | One writer; WAL lets readers continue | MVCC, many writers |
| `--workers` | **1 only** | 4 is fine |
| Full text | FTS5 virtual table | `tsvector` + GIN |

The `--workers` row is the one that bites. Two Uvicorn workers on one SQLite file will produce `database is locked` under any real load, and — worse for this project — `audit_logs.seq` allocation is a read-max-then-insert sequence that is only single-writer-safe. `14_env_example.md` §2 gives the development command with no `--workers` flag for exactly this reason, and `Backend.md` §14.3 qualifies `--workers 4` as PostgreSQL-only.

Store timestamps in UTC and format at the edge. SQLite does not enforce it, PostgreSQL does, and code written against SQLite's tolerance breaks on the engine that is strict.

### 7.3 The migration path from SQLite to PostgreSQL

There is none, and that is deliberate. The demo database is not migrated into production; production starts empty and `alembic upgrade head` builds it. Anything else means copying seed rows written for a demonstration into an enforcement record.

What *is* required is that both engines are built by the same revisions and tested. `10_TESTING.md` runs the full suite against SQLite on every commit and against PostgreSQL when `PG_TEST_URL` is exported in the shell; unset, the PostgreSQL half skips loudly rather than passing vacuously. Two things in this schema exist only because a migration wrote them by hand — the triggers in §4.4/§4.5 and the composite indexes in §4.3 — and both are the kind of object that autogenerate does not see and CI on one engine would never miss.

### 7.4 Row-level security is not used

PostgreSQL RLS is the obvious-looking answer to "an officer should see only their own jurisdiction", and it does not fit this application. **RLS keys off the database role, and this application connects as one service account for every user.** Every request would arrive as the same role, so every policy would evaluate identically and the feature would be inert — while creating the impression that access control is enforced at the storage layer when it is not.

Authorisation is in the service layer, where the identity actually is: the JWT subject resolves to a `users` row, and every query that reads inspections is filtered by `user_id` or `jurisdiction` before it leaves the repository function. `09_SECURITY.md` §3 owns that logic and §7 tests it by calling each endpoint as a second officer and requiring HTTP 403 rather than an empty list — an empty result set is indistinguishable from "no data" and hides a broken filter.

Making RLS work would mean one database role per officer, provisioned at user creation and dropped at deactivation, plus connection pooling per role. That is a substantial operational surface for a system whose entire authorisation model is two roles and a jurisdiction string.

---

## 8. SEED DATA

`seed.py` runs once after `alembic upgrade head` and is idempotent — it checks for an existing `employee_id` before inserting, so running it twice does not double the demo corpus.

### 8.1 What the seed must contain

Not "a few sample rows". The seed is the fixture the demonstration runs on and the fixture several tests read, so it must exercise every state the schema permits:

- both roles, `admin` and `inspector`
- at least three stores across two districts, with **different** `geofence_radius_m` values, so the per-store radius in §3.2 is visibly not a global constant
- **all four `overall_result` values** — `compliant`, `violation`, `not_assessed`, `out_of_scope` — because a screen or a query that has never seen `not_assessed` is a screen that will render it wrongly on the day it appears
- one `violation` carrying `violation_limb = '36(2)'` and a `findings` row with the matching `limb`, so `ck_scan_limb_coherent` and `ck_finding_limb_only_on_fail` are both satisfied by real data rather than only by the tests
- one scan with `checks_assessed < checks_total` and a `not_assessed` finding whose `reason` is populated, which is what puts a row in the §5.5 review queue
- one `out_of_scope` inspection with `in_scope = False` and a populated `out_of_scope_reason`
- one duplicate pair: two `scan_images` rows within Hamming distance 5, with `duplicate_of` set on the later scan

### 8.2 Accounts

```python
SEED_USERS = [
    # employee_id, full_name, email, role, jurisdiction
    ("LM-ADM-001", "Seed Administrator", "admin@example.test",     "admin",     None),
    ("LM-TG-1042", "Inspector One",      "inspector1@example.test","inspector", "Hyderabad North"),
    ("LM-TG-1043", "Inspector Two",      "inspector2@example.test","inspector", "Hyderabad South"),
]

def seed_users(db):
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    for employee_id, name, email, role, zone in SEED_USERS:
        if db.query(User).filter_by(employee_id=employee_id).first():
            continue
        db.add(User(
            employee_id=employee_id, full_name=name, email=email,
            phone=None, role=role, jurisdiction=zone,
            password_hash=pwd.hash(os.environ["SEED_PASSWORD"]),
            is_active=True, token_epoch=0,
        ))
    db.commit()
```

**The password comes from the environment, and the script refuses to run without it.** `os.environ[...]` raises `KeyError` rather than defaulting, which is the intended behaviour: a seed script with a literal password in it puts that password in version control, and every deployment that ever ran the script then shares it. Version 2.0 seeded `Test@1234` inline. `14_env_example.md` §2 documents `SEED_PASSWORD` as a shell variable for the seeding step, deliberately not a `Settings` field — the application has no reason to read it at runtime, and `Settings` is `extra="forbid"`, so adding it to `.env` would stop the app from starting.

**Two inspectors, in different jurisdictions, on purpose.** One inspector cannot demonstrate that jurisdiction filtering works; the second exists so `09` §7 can call each endpoint as the wrong officer and require HTTP 403.

Seed emails use `@example.test`, a domain reserved by RFC 6761 that can never resolve. `inspector@niyamnetra.gov.in` in an earlier draft was a plausible-looking address in a namespace the project does not control.

### 8.3 Stores

```python
SEED_STORES = [
    # name, store_type, city, district, state, pincode, lat, lon, radius_m
    ("Sri Balaji Supermarket", "supermarket", "Hyderabad", "Hyderabad",
     "Telangana", "500001", 17.3850, 78.4867, 150),
    ("Anand General Store",    "kirana",      "Hyderabad", "Hyderabad",
     "Telangana", "500029", 17.4126, 78.4482, 100),
    ("Vasavi Wholesale Depot", "wholesale",   "Sangareddy", "Sangareddy",
     "Telangana", "502001", 17.6250, 78.0800, 400),   # compound, wider fence
]
```

The depot's 400 m radius is the point of the third row: a wholesale compound where the gate, the office and the storage sheds are hundreds of metres apart cannot share a radius with a kirana shop, and a global `GEOFENCE_RADIUS_M` would mark every legitimate visit to one of them as outside. `pincode` is a string — `"500001"` — because it is an identifier, not a quantity, and leading zeros in other states are real.

### 8.4 Inspections and scans

```python
def seed_inspections(db, inspectors, stores):
    today = date.today()

    # 1. compliant — every check assessed
    a = Inspection(user_id=inspectors[0].id, store_id=stores[0].id,
                   inspection_date=today, status="submitted",
                   transaction_type="retail_sale", in_scope=True,
                   latitude=17.3851, longitude=78.4866, gps_accuracy_m=8.0,
                   geofence_status="inside", geofence_distance_m=12.0,
                   signature_status="signed", edited_offline=False,
                   submitted_at=utcnow())
    db.add(a); db.flush()
    db.add(Scan(inspection_id=a.id, commodity_generic="biscuits",
                brand_name="Seed Brand", net_quantity_value=100.0,
                net_quantity_unit="g", is_imported=False, is_perishable=True,
                is_medical_device=False, is_tobacco=False, has_sticker=False,
                overall_result="compliant", recommended_action="none",
                checks_total=18, checks_assessed=18,
                panel_shape="rectangular", panel_height_mm=120.0,
                panel_width_mm=80.0, pdp_area_cm2=96.0,
                total_surface_area_cm2=310.0, is_blown_moulded=False,
                mm_per_pixel=0.052, scale_source="declared",
                mm_per_pixel_uncertainty=0.004,
                rules_as_at=date(2026, 7, 1), engine_version="2.0"))

    # 2. violation under s.36(2) — a false net-quantity declaration
    b = Inspection(user_id=inspectors[0].id, store_id=stores[1].id,
                   inspection_date=today, status="submitted",
                   transaction_type="retail_sale", in_scope=True,
                   geofence_status="outside", geofence_distance_m=210.0,
                   geofence_reason="premises entrance behind the plotted point",
                   signature_status="refused", edited_offline=False,
                   submitted_at=utcnow())
    db.add(b); db.flush()
    scan_b = Scan(inspection_id=b.id, commodity_generic="edible oil",
                  brand_name="Seed Oils", net_quantity_value=1000.0,
                  net_quantity_unit="ml", is_imported=False,
                  is_medical_device=False, is_tobacco=False, has_sticker=True,
                  sticker_reduces_price=False, sticker_covers_original=True,
                  overall_result="violation", violation_limb="36(2)",
                  recommended_action="prosecution",
                  checks_total=18, checks_assessed=18,
                  rules_as_at=date(2026, 7, 1), engine_version="2.0")
    db.add(scan_b); db.flush()
```

`geofence_status="outside"` on a **submitted** inspection is deliberate. Location is recorded and never enforced (§3.3); a seed in which every visit is neatly inside the fence teaches the reader the opposite of the rule, and the `geofence_reason` shows what the officer's explanation looks like in the record. `signature_status="refused"` is there for the same reason — refusal is a normal outcome and the report must render it.

### 8.5 Findings, including the two the schema is strictest about

```python
    # the failing finding that explains scan_b.violation_limb
    db.add(Finding(
        scan_id=scan_b.id, check_id="CHK08",
        title="Net quantity declaration",
        engine_verdict="fail", severity="critical", limb="36(2)",
        observed="declared 1000 ml; measured 942 ml",
        required="declared quantity within the First Schedule error",
        citation="Rule 12 read with the First Schedule",
        ledger_ref="L-03", confidence=0.91,
    ))

    # 3. not_assessed — the review-queue case
    c = Inspection(user_id=inspectors[1].id, store_id=stores[2].id,
                   inspection_date=today, status="submitted",
                   transaction_type="institutional", in_scope=True,
                   signature_status="unavailable", submitted_at=utcnow())
    db.add(c); db.flush()
    scan_c = Scan(inspection_id=c.id, commodity_generic="detergent powder",
                  overall_result="not_assessed",
                  recommended_action="review",
                  checks_total=18, checks_assessed=16,
                  panel_shape="cylindrical", panel_diameter_mm=90.0,
                  scale_source="none",
                  rules_as_at=date(2026, 7, 1), engine_version="2.0")
    db.add(scan_c); db.flush()
    db.add(Finding(
        scan_id=scan_c.id, check_id="CHK06",
        title="Character height against Table-I",
        engine_verdict="not_assessed", severity="major",
        reason="no scale reference: panel dimensions not supplied and no "
               "reference object in frame, so millimetres cannot be derived "
               "from pixels",
        required="minimum height per Table-I for the computed PDP area",
        citation="Rule 7 read with Table-I", ledger_ref="L-11",
    ))

    # 4. out_of_scope — Rule 3 exclusion, with the mandatory reason
    d = Inspection(user_id=inspectors[1].id, store_id=stores[2].id,
                   inspection_date=today, status="submitted",
                   transaction_type="industrial", in_scope=False,
                   out_of_scope_reason="Rule 3: package intended for "
                                       "industrial consumer, not retail sale",
                   signature_status="unavailable", submitted_at=utcnow())
    db.add(d); db.flush()
    db.add(Scan(inspection_id=d.id, commodity_generic="bulk citric acid",
                overall_result="out_of_scope",
                recommended_action="none",
                checks_total=18, checks_assessed=1,
                rules_as_at=date(2026, 7, 1), engine_version="2.0"))
    db.commit()
```

Three constraints in §4.2 are exercised by these rows and would reject a careless edit to them: the `not_assessed` finding must carry a `reason` (`ck_finding_reason_required`); the out-of-scope inspection must carry an `out_of_scope_reason` (`ck_insp_oos_reason`); and neither `scan_c` nor the out-of-scope scan may be labelled `compliant` while `checks_assessed < checks_total` (`ck_scan_compliant_complete`). A seed that runs is therefore a small proof that the guarantees are live — which is why `10_TESTING.md` §3 imports these fixtures rather than building its own.

The `CHK06` reason is written the way every abstention should be: it names the missing input, not the failure. "Could not assess" tells an officer nothing; "no scale reference — supply the panel dimensions or lay a card in frame" tells them what to do on the next capture.

Note `checks_assessed=1` on the out-of-scope scan. The scope gate (CHK03) *was* assessed and returned a determination; the other eighteen carry the halt reason and are `not_assessed`, so the denominator is untouched and `04` §1.1's "19 of 19 rows always exist" still holds.

---

## 9. BACKUP, VERIFICATION AND RETENTION

### 9.1 The database

```bash
# SQLite — consistent copy of a live database, unlike `cp`
sqlite3 niyamnetra.db "VACUUM INTO '/backup/niyamnetra-$(date +%F).db'"

# PostgreSQL — logical dump plus continuous WAL archiving for point-in-time recovery
pg_dump --format=custom --file=/backup/niyamnetra-$(date +%F).dump niyamnetra
```

`VACUUM INTO` is the SQLite-correct operation. `cp` on a database with an open WAL can capture a torn state, and the copy will open without complaint and be missing the most recent transactions — the failure is silent, which is the worst kind. `pg_dump` alone gives a nightly floor; WAL archiving is what makes recovery to a specific minute possible, and an enforcement record needs the second one.

### 9.2 The evidence files

The database holds paths and hashes; the images are files, so they need their own copy. `rsync -a --checksum`, then **re-verify at the destination**:

```bash
rsync -a --checksum /var/niyamnetra/evidence/ /backup/evidence/
python -m tools.verify_evidence --root /backup/evidence   # re-reads and re-hashes
```

Re-verification is not optional ceremony. `sha256` in `scan_images` was computed by reading the file back off disk (§3.5); the only way to know the backup is usable is to perform the same read against the copy and compare. A backup of evidence that has never been hash-verified is a directory of files that are *probably* the evidence.

### 9.3 The audit chain head

The last `hash_self` in `audit_logs` is published daily — written to an append-only log outside the database, and in a deployment that wants more, mailed to a second party. The chain proves internal consistency; a published head is what makes retrospective rewriting detectable, because an attacker who rebuilds the whole chain still cannot match a hash that was recorded elsewhere yesterday. §3.7 gives the recomputation function and §5.6 explains why verification cannot be a query.

### 9.4 Restore, weekly

Restore the previous night's backup into a scratch database, run the chain verification end to end, and re-hash a sample of evidence files against the restored rows. **An untested backup is an assumption.** The test is scripted, and it is the only thing that distinguishes a backup policy from a backup intention.

### 9.5 Retention: five years, by administrative decision

Inspection records, findings, evidence and audit rows are kept for **five years**. This figure is an administrative choice made for this project, not a statutory period, and it is stated that way on purpose. An earlier draft attributed it to the Seventh Schedule of the Legal Metrology (Packaged Commodities) Rules 2011; the Seventh Schedule does not prescribe a retention period for inspection records, and a document that miscites a schedule invites every other citation in it to be doubted. Where a real period applies it comes from the department's own records policy, and the number here should be replaced by that policy when it is obtained.

Reconciling with the **Digital Personal Data Protection Act 2023**: the Act's storage-limitation principle requires personal data to be erased when the purpose is served, and it exempts processing for the performance of a statutory function by the State. Enforcement records fall in the exempt category, so five years is defensible — but the *bystander* faces and personal details that arrive incidentally in a photograph do not, which is why `12` §9 (#88) blurs faces in derived copies and why `exif_stripped` applies to derived copies rather than to the original.

Deletion at end of retention is a **documented administrative operation**, not a background job. `scan_images` and `audit_logs` are append-only in both engines (§4.4, §4.5), so purging requires dropping the triggers, performing the deletion, re-creating the triggers, and recording the operation — including the range purged — in the audit log that survives it. A retention cron with permission to delete evidence is indistinguishable from an attacker with the same permission.

---

## 10. CONSIDERED AND NOT IMPLEMENTED

Version 2.0 of this document described columns that do not exist in `Backend.md` §4. Deleting them silently would lose the thinking behind them, so each is recorded here with the reason it is out and what adding it would cost. Every one of them is an Alembic revision away; none is a redesign.

| Column | Proposed on | Why it is not in the schema |
|---|---|---|
| `scans.product_name` | scans | Two names for one thing. `commodity_generic` plus `brand_name` is the split the checks actually read — Rule 6 requires the commodity's *generic* name, and a single free-text field cannot answer that. |
| `scans.mrp_value`, `mfg_month_year` | scans | Extracted values belong in `findings.observed` for the check that read them, with the citation and confidence attached. Duplicating them on `scans` creates two answers to "what was the MRP?" and no rule for which wins. |
| `scans.extracted_fields` (JSONB) | scans | Unindexable on SQLite, and it re-creates the JSON-blob design §0 exists to remove. `ocr_text` keeps the raw dump for explanation; structure lives in `findings`. |
| `findings.measured_value`, `measured_uncertainty`, `threshold_value` | findings | Real requirement, wrong shape: only four of nineteen checks measure anything, so the columns are NULL on the other fifteen. `observed` and `required` are strings written by the check — "2.1 mm ± 0.3 mm" and "2.5 mm minimum" — which the report prints verbatim without a formatting layer. |
| `findings.bbox`, `evidence_image_id` | findings | Highlighting the region of the label that failed is the single best future addition to this schema. It needs the OCR pipeline to return stable per-field boxes in rectified coordinates first; storing a box the viewer cannot map back to a pixel is worse than storing none. |
| `findings.provision`, `findings.detail` | findings | Renamed, not dropped: `citation` carries the provision (through `cite()`, so an unverified figure prints its ledger tag) and `reason` carries the detail. Two spellings of the same field is how one of them stops being populated. |
| `scan_images.dhash` | scan_images | A second hash family only matters where a hash proximity auto-escalates, and none does — a pHash match opens a review item and nothing else. The corroborating signals that exist are stronger: an identical `sha256` is byte-identical reuse as a fact rather than an inference, and the travel-feasibility test in `12` §3 uses fixes and timestamps already stored. `12` §9 (#9) was amended to name those instead. |
| `scan_images.panel_px_height` | scan_images | Derivable. `height_px` is stored, and the panel's pixel extent is a property of the rectified derived copy, not of the original file this row describes. |
| `scan_images.exif_datetime` | scan_images | Same field twice. `captured_at` *is* the EXIF timestamp where one exists. |
| `scan_images.server_received_at` | scan_images | `created_at` is the server clock at insert. A second server-side timestamp within microseconds of the first is noise. |
| `scan_images.enhancements` | scan_images | Enhancement history belongs to the derived copy, and derived copies are regenerable artefacts, not evidence. Recording a pipeline's parameters against the original invites the reading that the original was modified. |
| `scan_images.latitude`, `longitude` | scan_images | Per-image GPS. Location is a property of the visit, and it is on `inspections`. Four fixes for one package produce four slightly different answers and no rule for choosing. |
| `scan_images.capture_token` | scan_images | A server-issued token proving the photograph came from the app rather than the gallery. Genuinely useful and genuinely hard: it needs a capture-time challenge the client cannot forge offline, which is precisely the condition under which the app must keep working. Deferred rather than half-built. |
| `stores.address_normalised` | stores | Needs a geocoding service. `address` plus `city`/`district`/`state`/`pincode` is enough to identify premises for an inspection. |
| `stores.registration_no`, `proprietor_name` | stores | Neither is known at capture time in the field, and a column that is empty on every row is a column that trains its users to skip it. They belong to a premises registry this project does not own. |
| `stores.visit_count` | stores | A denormalised counter that goes stale the first time an inspection is deleted or re-parented. `COUNT(*)` over an indexed FK, §5.3. |
| `inspections.signature_path` | inspections | A path implies a stored signature image, which is biometric-adjacent personal data collected for no check. `signature_status` records what happened — `signed`, `refused`, `unavailable` — which is the fact the report needs. |
| `users.failed_logins`, `locked_until` | users | Lockout by row is a denial-of-service against a named officer: anyone who knows an `employee_id` can lock them out of the field. Rate limiting per `employee_id` and per IP is the control that applies — `09` §2.3. |
| `users.install_approved_at` | users | Implies an approval workflow that does not exist. A login from an unrecognised `install_id` is surfaced for admin attention; it does not block the officer, because blocking one in the field on a device-identity heuristic is worse than the account sharing it detects. |

Two things in the table are worth separating from the rest, because they are *deferred*, not rejected: `findings.bbox` with `evidence_image_id`, and `scan_images.capture_token`. Both are the right idea. Both need a component that does not exist yet — stable per-field OCR boxes in rectified coordinates for the first, an offline-capable capture attestation for the second — and both would be one additive revision each when that component lands.

---

## 11. CORRECTIONS LOG — what version 2.0 got wrong

Version 2.0 was internally coherent and described a database that no other document in the set agreed with. The single decision of this revision — §0 — is that `Backend.md` §4 is the schema and this file documents it. Everything below follows from that.

| # | Where | Defect in v2.0 | Now |
|---|---|---|---|
| 1 | whole document | Described a schema divergent from the SQLAlchemy models in `Backend.md`, which are what Alembic migrates from. Two coherent, incompatible schemas in one project | `Backend.md` §4 is the schema of record; this file is column-for-column against it (§0) |
| 2 | `users` | Login by `email`, marked `UNIQUE NOT NULL` — a mutable contact field on the authentication path, excluding any officer without one | Login by `employee_id`; `email` nullable and contact-only (§3.1) |
| 3 | `audit_logs` | Column named `hash_current`; the chain code also hashed `""` for the genesis row while the prose said `"0"` | `hash_self`, matching the model; `GENESIS_PREV` names the one substitution, applied identically at write and verify (§3.7) |
| 4 | `findings` | A single `verdict` column, so a human override overwrote the engine's finding and the original was lost | `engine_verdict` (immutable) and `human_verdict` (nullable), with `effective_verdict` a Python property (§3.6) |
| 5 | `scans` | Denormalised `store_id`, `inspector_id` and `date`, which a re-parented scan makes disagree with the inspection it belongs to | Reached through `inspection_id` only; no shortcut columns (§2, §3.4) |
| 6 | `scans` | The five scope flags, both sticker sub-flags, `net_quantity_value`/`_unit` and `total_surface_area_cm2` were not columns at all — they lived on the in-memory `CheckContext` and were never persisted | Nine columns on `scans`, nullable by design, so every scope decision is reproducible (§3.4) |
| 7 | `findings` | No `limb` column, so `scans.violation_limb` said `36(2)` and no row explained which failure engaged it | `findings.limb`, set only on a `fail`, guarded by `ck_finding_limb_only_on_fail` (§3.6) |
| 8 | five tables | Only five tables; `scan_images` and `findings` were folded into JSON columns on `scans` | Seven tables — the two that carry the evidence and the verdicts are first-class (§1, §2) |
| 9 | `scan_images` | Perceptual hash stored as four 16-bit bands, claimed complete at Hamming distance 5 | Eight 8-bit bands; the bound is *distance ≤ bands − 1*, so four covered only 3 and missed real pairs at 5 (§6.3) |
| 10 | schema creation | `Base.metadata.create_all()` shown as the setup step | `alembic upgrade head`; `create_all` skips the `CHECK` constraints and every trigger (§0, §4.1) |
| 11 | integrity | `CHECK` constraints and append-only triggers described in prose, not written | Full DDL for both engines (§4.2, §4.4, §4.5), plus three new guarantees: `ck_scan_compliant_complete`, `ck_finding_limb_only_on_fail`, `ck_insp_oos_reason` |
| 12 | `PRAGMA foreign_keys` | Issued once in a script, so pooled connections never had it and every foreign key was decorative | `@event.listens_for(engine, "connect")` (§7.1) |
| 13 | report queries | Written two-state (`Good`/`Bad`) and fenced `python` while containing SQL | Four-state, duplicate-filtered, joined through `inspections`, in SQLAlchemy (§5) |
| 14 | retention | Attributed the five-year period to the Seventh Schedule, which prescribes no such thing | Stated as an administrative decision, reconciled with the DPDP Act 2023 exemption (§9.5) |
| 15 | orphan columns | ~25 columns that no other document referenced, presented as the schema | Moved to §10 as proposals, each with its reason and the Alembic revision it would need |

Confirmed sound in v2.0 and preserved: the banded-hash *idea* (corrected to eight bands), the append-only *intent* (now written as triggers), `VACUUM INTO` for SQLite backup, the RLS refusal, and the read-back-off-disk evidence hash.

---

*End of Database Design v3.0. `Backend.md` §4 is the schema of record; if this file and the models ever disagree on a column, the models are right and this file is the bug. Law is in `02_NiyamNetra_Rules.md`, check order in `03_NiyamNetra_Rules_Priority_Ordered.md`, controls in `09_SECURITY.md`, and the failure modes this schema defends against in `12_SIH26034_NiyamNetra_loopholes.md`.*
















