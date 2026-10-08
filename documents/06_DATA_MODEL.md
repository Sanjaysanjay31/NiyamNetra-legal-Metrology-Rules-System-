# Database Schema & Entity Data Model

**Document Code:** `DOC-06`  
**Applies to:** PostgreSQL (Production on Supabase) & SQLite (Development)  
**ORM Engine:** SQLAlchemy 2.0  
**Migration Framework:** Alembic (Migrations 0001 through 0009)  

---

## 1. Entity-Relationship Architecture

```text
┌─────────────────┐       conducts (1:N)        ┌─────────────────┐
│      User       │ ──────────────────────────> │   Inspection    │
│ (Field Officer) │                             │ (Store Session) │
└────────┬────────┘                             └────────┬────────┘
         │                                               │
         │ acts / traces (1:N)                           │ hosts / contains (1:N)
         ▼                                               ▼
┌─────────────────┐       traces (1:N)          ┌─────────────────┐
│    AuditLog     │ <────────────────────────── │      Scan       │
│ (SHA-256 Chain) │                             │ (Package Unit)  │
└─────────────────┘                             └────────┬────────┘
                                                         │
                                    ┌────────────────────┴────────────────────┐
                                    │ attaches (1:N)                          │ produces (1:N)
                                    ▼                                         ▼
                         ┌────────────────────┐                    ┌────────────────────┐
                         │     ScanImage      │                    │      Finding       │
                         │ (RAW SHA-256 + Crop│                    │ (26 Legal Checks)  │
                         └────────────────────┘                    └────────────────────┘
```

### Relational Entity Matrix

| Entity | Primary Key | Foreign Keys | Relationship / Cardinality | Description |
|---|---|---|---|---|
| **User** | `id` | None | `1:N` with Inspection, AuditLog, Finding overrides | Officers, supervisors, and central administrators |
| **Store** | `id` | None | `1:N` with Inspection | Retail establishments, supermarkets, warehouses |
| **Inspection** | `id` | `user_id`, `store_id` | `1:N` with Scan, AuditLog, ReportRecord | Store visit session with GPS geofencing |
| **Scan** | `id` | `inspection_id`, `duplicate_of` | `1:N` with ScanImage, Finding, AuditLog | Package evaluation unit with 3-state verdict |
| **ScanImage** | `id` | `scan_id` | `N:1` with Scan | RAW camera original bytes, SHA-256, and rectified crops |
| **Finding** | `id` | `scan_id` | `N:1` with Scan | Individual statutory rule findings (26 checks catalog) |
| **AuditLog** | `id` | `inspection_id`, `scan_id`, `user_id` | Append-only ledger | Cryptographic SHA-256 hash-chained tamper-evident log |
| **ReportRecord** | `id` | `inspection_id` | `N:1` with Inspection | Cryptographically signed PDF/DOCX inspection dockets |

---

## 2. Core Domain Entities

### 2.1 `User` (`users`)
Represents an authenticated field inspector, supervisory officer, or central administrator.
- **Key Columns:**
  - `id` (Integer, Primary Key)
  - `employee_id` (String(32), Unique, Indexed): Official identifier (e.g. `LM-TG-1042`, `LM-ADM-001`).
  - `role` (String(16)): Either `inspector` or `admin`. Enforced via CHECK constraint.
  - `password_hash` (String(128)): Passlib bcrypt hash (cost factor 12).
  - `install_id` (String(64), Nullable): 32-byte hex string generated on the client and bound during login.
  - `token_epoch` (Integer, Default 0): Incremented on password change or remote device reset, instantly invalidating active refresh tokens.

### 2.2 `Store` (`stores`)
Represents an inspected physical premise, warehouse, or retail shop.
- **Key Columns:**
  - `id` (Integer, Primary Key)
  - `name` (String(160)): Registered business name.
  - `address`, `city`, `district`, `state`, `pincode`: Normalized location descriptors.
  - `latitude`, `longitude` (Float): GPS coordinates used for geofence validation.
  - `geofence_radius_m` (Integer, Default 150): Authorized inspection perimeter in meters.

### 2.3 `Inspection` (`inspections`)
Represents a distinct enforcement visit conducted at a specific store by an officer.
- **Key Columns:**
  - `id` (Integer, Primary Key)
  - `user_id` (Integer, Foreign Key to `users.id`)
  - `store_id` (Integer, Foreign Key to `stores.id`)
  - `inspection_date` (Date): Canonical date of visit.
  - `status` (String(16)): `draft` -> `submitted`. Once submitted, scans and images are frozen.
  - `geofence_status` (String(16)): `verified`, `out_of_bounds`, or `unavailable`.
  - `edited_offline` (Boolean, Default False): Set if inspection was recorded in offline mode.
  - `clock_skew_seconds` (Integer, Nullable): Time delta between device clock and server clock at sync.

### 2.4 `Scan` (`scans`)
Represents a single packaged commodity inspected during a visit.
- **Key Columns:**
  - `id` (Integer, Primary Key)
  - `inspection_id` (Integer, Foreign Key to `inspections.id`)
  - `commodity_generic`, `brand_name`, `batch_number`: Package labeling details.
  - `overall_result` (String(16)): `compliant`, `violation`, `not_assessed`, or `out_of_scope`.
  - `violation_limb` (String(16), Nullable): Legal Metrology Act limb (`36(1)` or `36(2)`).
  - `checks_total` (Integer): Total statutory rules in active rule pack (26).
  - `checks_assessed` (Integer): Count of checks that resolved to `pass` or `fail`.
  - `rule_pack_version` (String(32)): Active rule pack version tag (`2026.09.v1`).
  - `catalog_hash` (String(64)): SHA-256 digest of active statutory rule pack catalog.
  - `duplicate_of` (Integer, Foreign Key to `scans.id`, Nullable): Set if visual similarity exceeds threshold.

### 2.5 `ScanImage` (`scan_images`)
Represents a captured packaging panel photo attached to a scan.
- **Key Columns:**
  - `id` (Integer, Primary Key)
  - `scan_id` (Integer, Foreign Key to `scans.id`)
  - `panel` (String(16)): `front`, `back`, `side`, `mrp`, `batch`, `principal`, or `other`.
  - `sha256` (String(64), Unique): Cryptographic hash of original un-modified camera photo.
  - `file_path` (String(512)): Filesystem or storage URI for raw camera original.
  - `analysis_file_path` (String(512), Nullable): URI for derived analysis JPEG.
  - `rectified_file_path` (String(512), Nullable): URI for homography-rectified crop.
  - `width_px`, `height_px`: Dimensions of original image.
  - `rectified` (Boolean, Default False): Set if perspective correction succeeded.

### 2.6 `Finding` (`findings`)
Represents an individual statutory check evaluation on a scan.
- **Key Columns:**
  - `id` (Integer, Primary Key)
  - `scan_id` (Integer, Foreign Key to `scans.id`)
  - `check_id` (String(16)): Statutory code (e.g. `CHK01`, `CHK06`, `CHK23`).
  - `title` (String(200)): Statutory rule title.
  - `engine_verdict` (String(16)): Algorithmic verdict (`pass`, `fail`, `not_assessed`). **IMMUTABLE.**
  - `human_verdict` (String(16), Nullable): Officer override verdict (`pass`, `fail`, `not_assessed`).
  - `override_reason` (Text, Nullable): Mandatory officer justification (minimum 10 characters).
  - `severity` (String(16)): `critical`, `major`, `minor`, or `advisory`.
  - `citation` (String(160)): Specific statutory citation (e.g. *Rule 7(1) read with Table-I*).
  - `ledger_ref` (String(16)): Internal legal ledger reference (e.g. `L-03`).

### 2.7 `AuditLog` (`audit_logs`)
Append-only cryptographic ledger tracking every system action.
- **Key Columns:**
  - `id` (Integer, Primary Key)
  - `inspection_id`, `scan_id`, `user_id`: Context foreign keys.
  - `action` (String(40)): Action type (e.g. `scan_created`, `assessment_rerun`, `finding_override`).
  - `hash_self` (String(64)): SHA-256 hash over `[hash_prev + user_id + action + timestamp + payload]`.
  - `hash_prev` (String(64)): Hash of previous audit ledger row, creating an unbroken hash chain.
  - `timestamp` (DateTime): UTC server arrival time.

---

## 3. Supporting Security & Operational Entities

- **`RevokedJti` (`revoked_jtis`):** Tracks invalidated JWT token IDs (`jti`) upon explicit logout.
- **`LoginAttempt` (`login_attempts`):** IP and username tracking for distributed rate limiting and brute-force lockout.
- **`ReportRecord` (`report_records`):** Archive metadata for generated PDF/DOCX inspection dockets.
- **`IdempotencyKey` (`idempotency_keys`):** Caches incoming client `Idempotency-Key` headers for 24 hours to guarantee exactly-once processing during offline queue replays.
- **`RuleVersionState` (`rule_version_states`):** Tracks dynamic rule pack catalog status, active version tags, and catalog SHA-256 hashes.

---

## 4. Alembic Migration History

| Migration ID | Filename | Scope of Schema Changes |
|---|---|---|
| `0001` | `0001_initial_schema.py` | Core seven tables: users, stores, inspections, scans, scan_images, findings, audit_logs. |
| `0002` | `0002_add_revoked_jtis_table.py` | JWT revocation blacklist table for secure session logout. |
| `0003` | `0003_add_login_attempts_table.py` | Brute force protection and IP rate-limiting tracking. |
| `0004` | `0004_add_report_records_table.py` | Storage of compiled inspection PDF reports and cryptographic QR digests. |
| `0005` | `0005_add_idempotency_keys_table.py` | Idempotency key tracking for resilient offline batch replays. |
| `0006` | `0006_immutable_evidence_triggers.py` | Database-level triggers preventing deletion or modification of `scan_images`. |
| `0007` | `0007_immutable_findings_triggers.py` | Database-level triggers preventing direct updates to `findings.engine_verdict`. |
| `0008` | `0008_add_rule_version_states_table.py` | Version tracking and catalog hashing for dynamic rule packs. |
| `0009` | `0009_add_missing_phase2_to_phase6_columns.py` | Adds `rule_pack_version`, LLM metadata, and perceptual similarity columns to PostgreSQL. |
