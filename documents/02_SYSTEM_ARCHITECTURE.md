# System Architecture & Technical Design

**Document Code:** `DOC-02`  
**Applies to:** Complete NiyamNetra Platform  
**Architecture Classification:** Cloud-Assisted, Edge-Gated, Offline-Resilient Decision Support System  

---

## 1. Architectural Philosophy & Core Invariant

NiyamNetra is engineered around a strict separation of concerns designed to eliminate AI hallucination, ensure evidentiary integrity, and maintain statutory defensibility.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           THE CORE SYSTEM INVARIANT                          │
│                                                                              │
│    OCR READS  →  LLM STRUCTURES  →  RULES DECIDE  →  AGGREGATION ASSESSES   │
│                                                                              │
│                           →  OFFICER ADJUDICATES                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

1. **OCR Reads:** Optical Character Recognition engines transcribe raw text and word bounding boxes without interpreting legal meaning.
2. **LLM Structures:** High-speed cloud language models parse noisy OCR fragments into typed declaration schemas with strict provenance tracking. The LLM never decides compliance.
3. **Rules Decide:** A deterministic statutory rules engine evaluates mathematical, spatial, and boolean logic against statutory thresholds.
4. **Aggregation Assesses:** Package-level logic synthesizes individual checks across multiple photographed panels, computing overall result and actionable capture requests.
5. **Officer Adjudicates:** The authorized human officer reviews the evidence, resolves ambiguities, and signs off on the official record.

---

## 2. End-to-End Pipeline Data Flow

### 2.1 Architectural Flow at a Glance

```text
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│  1. FIELD MOBILE APP    │ ──> │  2. SECURE API GATEWAY  │ ──> │  3. OPTICAL & AI CLOUD  │
│  - Expo SDK 54 Android  │     │  - FastAPI (Python 3.11)│     │  - Cloud Vision OCR     │
│  - Edge Quality Gate    │     │  - Bearer JWT & Devices │     │  - Groq Llama-3.3-70B   │
│  - RAW SHA-256 Storage  │     │  - Idempotent Sync Queue│     │  - Structured JSON DTO  │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
                                                                             │
                                                                             ▼
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│  6. SUPERVISORY PORTAL  │ <── │  5. PERSISTENCE & AUDIT │ <── │  4. STATUTORY ENGINE    │
│  - Web Review Queue     │     │  - PostgreSQL (Supabase)│     │  - Rule Pack 2026.09.v1 │
│  - Officer Adjudication │     │  - Supabase S3 Storage  │     │  - 26 Statutory Checks  │
│  - Section 36 PDF Docket│     │  - SHA-256 Audit Ledger │     │  - Table-I Font Heights │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

### 2.2 Detailed Multi-Tier Architectural Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                             TIER 1: FIELD MOBILE EDGE CLIENT                                │
│                     (React Native · Expo SDK 54 · Standalone Android APK)                   │
├───────────────────────────────┬───────────────────────────────┬─────────────────────────────┤
│      CAMERA VIEWPORT          │     FORENSIC STORAGE          │      EDGE QUALITY GATE      │
│  - Live optical guidance      │  - Raw image bit-for-bit      │  - Blur: Laplacian (>= 60)  │
│  - Multi-panel capture        │  - SHA-256 digest anchor      │  - Glare: Luma <= 15%       │
│  - Reference scale marker     │  - Adaptive JPEG (<=1600px)   │  - Auto-retake guidance     │
└───────────────┬───────────────┴───────────────┬───────────────┴───────────────▲─────────────┘
                │                               │                               │ (Retake)
                ▼                               ▼                               │
┌───────────────────────────────────────────────────────────────────────────────┴─────────────┐
│                          TIER 2: TRANSPORT & OFFLINE RESILIENCE                             │
│                  (Local SQLite Queue · HTTPS Multipart · Render Gateway)                    │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  • Offline SQLite FIFO Queue (UUIDv4 tracking)   • Bearer JWT & Device install_id binding   │
│  • Idempotency-Key header (zero duplicate scans)  • Automatic retry on network reconnection │
└───────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                         TIER 3: OPTICAL & COGNITIVE AI PROCESSING                           │
│              (OpenCV Homography · Google Cloud Vision · Groq Llama-3.3-70B)                 │
├───────────────────────────────┬───────────────────────────────┬─────────────────────────────┤
│    PERSPECTIVE RECTIFY        │        CLOUD OCR ENGINE       │     CLOUD LLM STRUCTURING   │
│  - 4-point contour detection  │  - High-precision lines       │  - Zero legal decision role │
│  - Fronto-parallel warp       │  - Word-level bounding boxes  │  - Extracts typed JSON      │
│  - Millimeter scale factor    │  - Optical confidence scores  │  - Strict field provenance  │
└───────────────────────────────┴───────────────┬───────────────┴─────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                     TIER 4: DETERMINISTIC STATUTORY RULE ENGINE                             │
│             (Python 3.11 · Rule Pack 2026.09.v1 · Fourth Amendment G.S.R. 826(E))           │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  • 26 Statutory Rules: Declarations, MRP/USP math, Net Qty units, Consumer Care, Dates     │
│  • Rule 7 Table-I: Millimeter font height validation based on Area of Principal Display     │
│  • Multi-Panel Synthesis: Cross-panel conflict detection, dual pricing, MRP sticker check   │
└───────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                │
                     ┌──────────────────────────┼──────────────────────────┐
                     │ (All 26 Pass)            │ (Gaps / Blur)            │ (Confirmed Defect)
                     ▼                          ▼                          ▼
            ┌─────────────────┐       ┌───────────────────┐       ┌───────────────────┐
            │    COMPLIANT    │       │  REVIEW_REQUIRED  │       │     VIOLATION     │
            │   (Green Path)  │       │   (Amber Path)    │       │    (Red Path)     │
            └────────┬────────┘       └─────────┬─────────┘       └─────────┬─────────┘
                     │                          │                           │
                     │                 ┌────────┴────────┐                  │
                     │                 ▼                 ▼                  │
                     │        ┌─────────────────┐ ┌───────────────┐         │
                     │        │ RECAPTURE TASK  │ │ OFFICER QUEUE │         │
                     │        │ (Missing Panel) │ │ (Web Portal)  │         │
                     │        └────────┬────────┘ └───────┬───────┘         │
                     │                 │                  │                 │
                     │                 ▼                  ▼                 │
                     │          (Feeds Tier 1)    (Officer Verdict)         │
                     │                                    │                 │
                     │                                    ▼                 ▼
┌────────────────────┴──────────────────────────────────────────────────────┴─────────────────┐
│                      TIER 5 & 6: PERSISTENCE, GOVERNANCE & ENFORCEMENT                      │
│                (PostgreSQL · Supabase S3 · Cryptographic Ledger · PDF Docket)               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  • Immutable engine_verdict + auditable human_verdict with mandatory override justification │
│  • Append-Only Cryptographic Audit Ledger (SHA-256 hash-chain across all state events)      │
│  • Section 36 Violation Dossier: Limb 36(1) Labeling Defects vs Limb 36(2) Short Quantity    │
│  • Official Inspection Docket: High-res PDF/DOCX with QR code linking to verification URL   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Step-by-Step Data Flow Pipeline

| Stage | Operational Component | Key Actions & Invariants | Evidentiary Output |
|---|---|---|---|
| **1. Edge Optical Capture** | Android APK (`expo-camera`) | Officer points camera at package panels. Quality gate analyzes blur (Laplacian $\ge 60$) and specular glare ($\le 15\%$) in **~38 ms**. | Byte-exact RAW photo stored with SHA-256 digest; normalized analysis JPEG ($\le 1600\text{ px}$). |
| **2. Transport & Ingestion** | Local SQLite + FastAPI Gateway | Persists to offline FIFO queue with client UUIDv4 and `Idempotency-Key`. Transmits via HTTPS with Bearer JWT. | Zero duplicate visits; exactly-once server ingestion. |
| **3. Perspective & OCR** | OpenCV + Google Vision API | Detects 4-point panel quad; applies planar homography warp. High-precision OCR tokenizes words and polygon coordinates. | Fronto-parallel rectified crop + word-level bounding coordinates. |
| **4. Cognitive Structuring** | Groq Llama-3.3-70B | Normalizes raw OCR fragments into typed Pydantic JSON schema with strict provenance. **Zero legal decisions made.** | Typed declaration DTO with exact bounding box citations. |
| **5. Deterministic Evaluation** | Python Rule Pack `2026.09.v1` | Evaluates 26 statutory checks, Rule 7 Table-I millimeter font heights, and multi-panel conflict detection. | Three-state assessment outcome (`COMPLIANT`, `VIOLATION`, `REVIEW_REQUIRED`). |
| **6. Supervisory Enforcement** | React Web Portal + PDF Generator | Generates targeted recapture tasks for missing panels, queues ambiguities for officer review, and creates Section 36 dockets. | Digitally verifiable PDF/DOCX inspection docket with QR verification URL. |

---

## 3. Tiered System Architecture

### 3.1 Client Tier (Tier 1)

#### 1. Inspector Field Mobile App (`Frontend_App`)
- **Framework:** React Native with Expo SDK 54, packaged as a standalone Android release APK (`NiyamNetra-v1.0.4-release.apk`).
- **Target OS:** Android 7.0 (API 24) through Android 16 (API 36); fully aligned for Android 15 16 KB memory page sizes.
- **Hardware Integration:** Direct `expo-camera` access (no gallery picker to eliminate pre-staged photo fraud), `expo-location` for store geofencing, `expo-secure-store` for cryptographic token storage.
- **Client Processing:** Performs instant heuristic quality analysis (blur, glare, luma histogram) and generates the derived analysis JPEG prior to transmission.
- **Offline Engine:** Local SQLite storage with automatic background synchronization via an idempotent retry queue.

#### 2. Supervisory Web Portal (`Frontend_Portal`)
- **Framework:** React 18, Vite 5, Tailwind CSS, Lucide icons, Recharts data visualization.
- **Deployment:** Vercel edge network as a static Single Page Application (PWA).
- **Functionality:** Central dashboard for State Controllers and District Officers. Surfaces raid logs, inspector activity, district-wise violation tallies, the Officer Review Queue, and digital report generation.

---

### 3.2 Application Tier (Tier 2) — FastAPI Backend

- **Runtime:** Python 3.11 running under Uvicorn/Gunicorn on Render web services.
- **Architecture:** Modular FastAPI application with structured routers:
  - `routers/auth.py`: JWT issuance, device installation binding, token rotation.
  - `routers/inspections.py`: Store directory, inspection lifecycle, geofence verification.
  - `routers/scans.py`: Multi-panel image upload, image verification, scan assessment.
  - `routers/review.py`: Officer review queue, finding overrides, cross-panel conflict resolution.
  - `routers/recapture.py`: Generation of targeted panel tasks, fulfillment tracking, reassessment.
  - `routers/enforcement.py`: Section 36 violation dossiers, advisory action recommendations.
  - `routers/reports.py`: Cryptographically signed PDF/DOCX generation with QR verification.
  - `routers/admin.py`: User management, device unbinding, audit chain verification.

---

### 3.3 Data & Storage Tier (Tier 3) — Supabase Infrastructure

- **Database Engine:** PostgreSQL 15+ managed via Supabase AWS session pooler (port 5432).
- **ORM & Migrations:** SQLAlchemy 2.0 with Alembic migration versioning (Migrations 0001 through 0009).
- **Object Storage:** S3-compatible Supabase Storage bucket (`NiyamNetra_Images`) storing raw original photos and derived rectified panel crops.
- **Audit Ledger:** Append-only database table (`audit_logs`) maintaining a SHA-256 hash-chained cryptographic ledger of every scan creation, assessment, override, and sync event.

---

## 4. Optical & AI Pipeline Separation

To ensure absolute reliability in field conditions, the optical and extraction pipeline is divided into clear functional boundaries:

| Layer | Technology | Responsibility | Invariant |
|---|---|---|---|
| **Image Rectification** | OpenCV (`cv2`) | Detects panel contour quadrilateral, calculates homography matrix, rectifies perspective distortion | Deterministic matrix transform; no pixels synthesized |
| **Cloud OCR** | Google Cloud Vision / OCR.space | High-precision optical character recognition, returning line text and word bounding boxes | Raw transcription only; zero legal filtering |
| **Cloud LLM Extraction** | Groq Llama-3.3-70B (Gemini Flash fallback) | Ingests transcribed text blocks and outputs structured JSON conforming to `StructuredDeclarationResult` | Extraction grounded strictly in OCR text; zero legal adjudication |
| **Deterministic Rule Engine** | Python 3.11 (`rules_engine.py` + `rules/`) | Evaluates 26 statutory rules using mathematical, boolean, and geometry logic | 100% reproducible; identical inputs always produce identical findings |

---

## 5. Dual-Verdict & Governance Architecture

A foundational architectural requirement of NiyamNetra is that **automated AI findings can never overwrite human authority, and human decisions can never rewrite algorithmic findings**.

```
                           ┌──────────────────────────┐
                           │   Algorithmic Engine     │
                           └──────────────────────────┘
                                        │
                                        ▼
                           ┌──────────────────────────┐
                           │   engine_verdict (C11)   │
                           │ (pass / fail / not_assessed)
                           │   IMMUTABLE DB RECORD    │
                           └──────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
     Inspector Accepts Finding              Officer Overrides Finding
                    │                                       │
                    ▼                                       ▼
       ┌─────────────────────────┐             ┌─────────────────────────┐
       │   human_verdict = NULL  │             │   human_verdict = pass  │
       │  effective = engine     │             │  effective = human      │
       └─────────────────────────┘             │  mandatory officer_note │
                                               │  cryptographic audit log│
                                               └─────────────────────────┘
```

1. **`engine_verdict`:** Stamped by the deterministic legal rule engine into the `findings` table. Protected by database-level update constraints and code-level immutability.
2. **`human_verdict`:** Stored in a separate column (`findings.human_verdict`) alongside `findings.override_reason` and `findings.overridden_by`.
3. **Effective Verdict:** Dynamically resolved as `effective_verdict = human_verdict if human_verdict is not None else engine_verdict`. Both values are printed transparently in every inspection dossier.

---

## 6. Offline-First Synchronization Architecture

Field officers frequently operate in environments without cellular connectivity. NiyamNetra implements an offline-first architecture with the following guarantees:

1. **Local Authoritative Evidence:** All original images are persisted directly to local storage (`expo-file-system`) and indexed in a local SQLite database before any network call.
2. **Deterministic Enqueueing:** Visits, captures, and adjudications are queued with a cryptographically secure client-generated `Idempotency-Key` (UUIDv4).
3. **Safe Replay:** When network connectivity is restored, the queue worker flushes pending actions in chronological order. The server idempotency cache (`idempotency_keys` table) ensures network retries never create duplicate inspections or scans.
4. **Clock Skew Tracking:** Client timestamps are recorded alongside server arrival timestamps (`clock_skew_seconds`), ensuring offline inspection timelines remain audit-verifiable.
