# NiyamNetra — Legal Metrology Compliance Platform

**Automated pre-packaged commodity compliance scanner and decision-support system for the Legal Metrology (Packaged Commodities) Rules, 2011.**  
*Smart India Hackathon 2026 · Problem Statement SIH26034 · Ministry of Consumer Affairs, Food & Public Distribution*

[![Backend API](https://img.shields.io/badge/Backend-FastAPI_0.110-009688?logo=fastapi)](https://niyamnetra-backend.onrender.com)
[![Web Portal](https://img.shields.io/badge/Web_Portal-Vercel_SPA-black?logo=vercel)](https://niyamnetra-legal-metrology-rules.vercel.app)
[![Release APK](https://img.shields.io/badge/Release_APK-v1.0.4_(Build_5)-success?logo=android)](release/NiyamNetra-v1.0.4-release.apk)
[![Rules Pack](https://img.shields.io/badge/Statutory_Pack-2026.09.v1_(26_Rules)-blue)](documents/05_LEGAL_COMPLIANCE_ENGINE.md)
[![Backend Tests](https://img.shields.io/badge/Backend_Regression-428_Passed-brightgreen)](documents/10_TESTING_AND_QUALITY.md)
[![Frontend Tests](https://img.shields.io/badge/Frontend_Regression-69_Passed-brightgreen)](documents/10_TESTING_AND_QUALITY.md)

> **Core System Invariant:**  
> **OCR READS → LLM STRUCTURES → RULES DECIDE → AGGREGATION ASSESSES → OFFICER ADJUDICATES**  
> NiyamNetra assists Legal Metrology enforcement officers by replacing manual calipers and paper checklists with sub-2-second optical scanning, cloud OCR, structured entity normalization, and a strictly deterministic 26-rule statutory engine.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Key Capabilities](#2-key-capabilities)
3. [System Architecture](#3-system-architecture)
4. [How It Works](#4-how-it-works)
5. [Technology Stack](#5-technology-stack)
6. [Repository Structure](#6-repository-structure)
7. [Quick Start](#7-quick-start)
8. [Production Links](#8-production-links)
9. [APK & Release Information](#9-apk--release-information)
10. [Documentation Map](#10-documentation-map)
11. [Testing & Verification](#11-testing--verification)
12. [Operational Boundaries](#12-operational-boundaries)
13. [License](#13-license)

---

## 1. Overview

Under Chapter II of the **Legal Metrology (Packaged Commodities) Rules, 2011**, all pre-packaged goods sold in India must display mandatory consumer declarations: manufacturer details, net quantity, Maximum Retail Price (MRP), Unit Sale Price (USP), packing date, consumer care info, and minimum numeral font heights under Rule 7 Table-I.

Manual field enforcement is time-consuming, subjective, and prone to legal challenges regarding evidence authenticity. **NiyamNetra** automates label evaluation while upholding strict evidentiary integrity:
- **Zero LLM Legal Rulings:** Cloud LLMs strictly structure raw OCR text into typed JSON; 100% deterministic code evaluates the law.
- **Honest Denominators:** Denominators are always stated explicitly (e.g. `26 registered checks`). Partial assessments are never marked as compliant passes.
- **Integrity-Verifiable Evidence:** Raw camera photos are preserved untouched with cryptographic SHA-256 digests and append-only database ledgers.
- **The AI Recommends; The Officer Decides:** Algorithmic verdicts (`engine_verdict`) are permanently immutable. Officer overrides (`human_verdict`) are logged separately with mandatory legal justification.

---

## 2. Key Capabilities

- **Sub-2-Second Turnaround:** Mean end-to-end evaluation latency of **1,598 ms** (p50: 1,547 ms, p95: 1,973 ms).
- **Edge Quality Gate:** Heuristic client-side analysis (sharpness, glare, luma, framing) in ~38 ms, preventing unreadable uploads.
- **Fourth Amendment Currency:** Loaded with rule pack `2026.09.v1` incorporating G.S.R. 826(E) dated 21.09.2026 and the Jan Vishwas Act.
- **Smart Recapture Loop:** Automatically surfaces actionable panel capture requests when packaging evidence is incomplete.
- **Offline-First Synchronization:** Local SQLite persistence with cryptographic `Idempotency-Key` headers for duplicate-free sync upon reconnection.
- **Section 36 Enforcement Dossiers:** Categorizes findings under Section 36(1) (packaging defects) vs Section 36(2) (short quantity).

---

## 3. System Architecture

```mermaid
flowchart LR
    A[Mobile Camera] --> B[Edge Quality Gate]
    B --> C[Cloud OCR]
    C --> D[Cloud LLM Structuring]
    D --> E[Deterministic Rule Engine\n(2026.09.v1 - 26 Rules)]
    E --> F[Multi-Panel Synthesis]
    F --> G[Officer Review Queue]
    G --> H[Enforcement Dossier & PDF Docket]
```

---

## 4. How It Works

1. **Capture:** The inspector captures package panels (Front, Back, MRP/Batch) via the mobile app. Original RAW photos are preserved with SHA-256 hashes.
2. **Quality Validation:** The client quality gate checks blur, glare, and exposure. If unreadable, the officer is guided to retake immediately.
3. **Transcription & Structuring:** High-precision Cloud OCR transcribes text; Cloud LLM (Groq Llama-3.3-70B) normalizes declarations into structured JSON with field-level bounding boxes.
4. **Deterministic Evaluation:** The Python statutory engine evaluates 26 rules against declared geometry and optical calibration references.
5. **Review & Adjudication:** Incomplete panels trigger targeted recapture tasks. Ambiguities appear in the Officer Review Queue.
6. **Docket Generation:** The officer signs off, exporting an official PDF inspection docket featuring high-resolution annotated crops and a cryptographic QR verification link.

---

## 5. Technology Stack

- **Mobile Client:** React Native, Expo SDK 54, `expo-camera`, `expo-secure-store`, Standalone Android APK (ARM64/ARMv7, Android 15 16 KB page-size aligned).
- **Web Portal:** React 18, Vite 5, Tailwind CSS, Lucide icons, Recharts, Responsive PWA.
- **Backend API:** FastAPI (Python 3.11), SQLAlchemy 2.0 ORM, Pydantic v2, Uvicorn/Gunicorn.
- **Database & Storage:** PostgreSQL 15+ (Supabase connection pooler), Supabase S3-compatible Object Storage for evidence files.
- **Optical & AI:** Cloud OCR (Google Cloud Vision / OCR.space), Cloud LLM (Groq Llama-3.3-70B / Google Gemini fallback).

---

## 6. Repository Structure

```text
├── README.md                      # Primary repository entry point
├── documents/                     # Authoritative comprehensive documentation
│   ├── 00_PROJECT_BRIEF.md        # 2-minute executive brief
│   ├── 01_PRODUCT_SCOPE.md        # Functional boundaries & personas
│   ├── 02_SYSTEM_ARCHITECTURE.md  # Detailed technical architecture
│   ├── 03_INSPECTOR_WORKFLOW.md   # Field officer user journeys
│   ├── 04_IMAGE_OCR_LLM_PIPELINE.md # Dual-artifact & AI pipeline
│   ├── 05_LEGAL_COMPLIANCE_ENGINE.md# 26 statutory rules & Table-I logic
│   ├── 06_DATA_MODEL.md           # 12 SQLAlchemy models & migrations
│   ├── 07_API_AND_INTEGRATION.md  # REST API specification
│   ├── 08_SECURITY_AND_PRIVACY.md # Threat model & tamper-evident chain
│   ├── 09_OFFLINE_SYNC_AND_EVIDENCE.md # Offline queue & idempotency
│   ├── 10_TESTING_AND_QUALITY.md  # 428 backend & 69 frontend tests
│   ├── 11_DEPLOYMENT_AND_ENVIRONMENT.md # Deployment runbook & env vars
│   ├── 12_RULE_COVERAGE_AND_LIMITATIONS.md # Rule coverage & limits
│   ├── 13_RELEASE_AND_OPERATIONS.md# Release docket & health checks
│   ├── 14_DEMO_AND_PRESENTATION.md# Presentation script & judge Q&A
│   └── archive/                   # Selected historical engineering records
├── Backend/                       # FastAPI application & statutory engine
├── Frontend_App/                  # React Native / Expo field mobile application
├── Frontend_Portal/               # React 18 / Vite supervisory web dashboard
└── release/                       # Production release APK artifacts
```

---

## 7. Quick Start

Run the entire platform locally across three terminals:

```bash
# Terminal 1: Backend API
cd Backend
python -m venv niyamnetra_venv
.\niyamnetra_venv\Scripts\Activate.ps1  # Linux/macOS: source niyamnetra_venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                  # Configure DATABASE_URL & JWT_SECRET
alembic upgrade head
python seed.py
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Web Portal
cd Frontend_Portal
npm install
npm run dev                           # Open http://localhost:5173

# Terminal 3: Mobile Field App
cd Frontend_App
npm install
npx expo start                        # Scan QR with Expo Go
```

---

## 8. Production Links

| Resource | URL |
|---|---|
| **Production Backend API** | `https://niyamnetra-backend.onrender.com` |
| **System Health Endpoint** | `https://niyamnetra-backend.onrender.com/health` |
| **Interactive API Documentation** | `https://niyamnetra-backend.onrender.com/docs` |
| **Web Supervisory Portal** | `https://niyamnetra-legal-metrology-rules.vercel.app` |
| **GitHub Source Repository** | `https://github.com/Sanjaysanjay31/NiyamNetra-legal-Metrology-Rules-System-` |

---

## 9. APK & Release Information

| Parameter | Authoritative Release Specification |
|---|---|
| **Release Artifact** | [`release/NiyamNetra-v1.0.4-release.apk`](release/NiyamNetra-v1.0.4-release.apk) |
| **Package Name** | `com.niyamnetra.app` |
| **Version Name / Code** | `1.0.4` / Build `5` |
| **Signing Scheme** | APK Signature Scheme v2 |
| **Certificate Fingerprint** | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| **APK SHA-256 Digest** | `DB6897E8FB05CA062C3E44839C9605B998F0FD533481F9F8F62C3D141BF366BA` |
| **Page-Size Alignment** | Android 15 16 KB Page-Size Aligned (`zipalign` verified) |

---

## 10. Documentation Map

For detailed architectural, statutory, and operational specifications, consult the comprehensive documentation suite in [`documents/`](documents/):

- [**00_PROJECT_BRIEF.md**](documents/00_PROJECT_BRIEF.md): Executive summary & 2-minute project brief.
- [**01_PRODUCT_SCOPE.md**](documents/01_PRODUCT_SCOPE.md): Functional boundary, personas, and statutory requirements.
- [**02_SYSTEM_ARCHITECTURE.md**](documents/02_SYSTEM_ARCHITECTURE.md): Component diagrams, data flows, and design invariants.
- [**03_INSPECTOR_WORKFLOW.md**](documents/03_INSPECTOR_WORKFLOW.md): Step-by-step field officer and review queue journeys.
- [**04_IMAGE_OCR_LLM_PIPELINE.md**](documents/04_IMAGE_OCR_LLM_PIPELINE.md): Dual-artifact evidence, OCR, and LLM structuring.
- [**05_LEGAL_COMPLIANCE_ENGINE.md**](documents/05_LEGAL_COMPLIANCE_ENGINE.md): 26 statutory rules, Table-I font heights, and Fourth Amendment baseline.
- [**06_DATA_MODEL.md**](documents/06_DATA_MODEL.md): 12 SQLAlchemy models, ER diagram, and Alembic migrations.
- [**07_API_AND_INTEGRATION.md**](documents/07_API_AND_INTEGRATION.md): Complete OpenAPI 3.1 endpoint reference.
- [**08_SECURITY_AND_PRIVACY.md**](documents/08_SECURITY_AND_PRIVACY.md): Threat model (T1–T15), cryptographic evidence chain, and DPDP Act.
- [**09_OFFLINE_SYNC_AND_EVIDENCE.md**](documents/09_OFFLINE_SYNC_AND_EVIDENCE.md): Local SQLite queues, idempotency, and clock skew tracking.
- [**10_TESTING_AND_QUALITY.md**](documents/10_TESTING_AND_QUALITY.md): 428 backend tests, 69 frontend tests, and 10 E2E scenarios.
- [**11_DEPLOYMENT_AND_ENVIRONMENT.md**](documents/11_DEPLOYMENT_AND_ENVIRONMENT.md): Production deployment runbook & sanitized environment variables.
- [**12_RULE_COVERAGE_AND_LIMITATIONS.md**](documents/12_RULE_COVERAGE_AND_LIMITATIONS.md): Exact statutory coverage and physical constraints.
- [**13_RELEASE_AND_OPERATIONS.md**](documents/13_RELEASE_AND_OPERATIONS.md): Operational runbook, health verification, and release gates.
- [**14_DEMO_AND_PRESENTATION.md**](documents/14_DEMO_AND_PRESENTATION.md): Live demo storyline, key talking points, and evaluator Q&A.

---

## 11. Testing & Verification

NiyamNetra maintains a 100% passing test discovery with zero regressions:
- **Backend Tests:** **428 passed, 0 failed** in 100.43s (`pytest -q`).
- **Frontend Tests:** **69 passed, 0 failed** across all 6 test suites (`node run_all_tests.js`).
- **E2E Integration Scenarios:** 10 canonical scenarios passing (`test_phase6e_e2e_scenarios.py`).
- **Hardware Verified:** Installed and verified on physical Android hardware across clean install and upgrade flows.

---

## 12. Operational Boundaries

- **Decision-Support Only:** NiyamNetra assists enforcement officers; it never issues self-executing legal notices or fines.
- **Labeling Declarations Only:** Packaging compliance under the LM Rules, 2011. Does not conduct chemical food safety analysis (governed separately by FSSAI).
- **Physical Scale Requirement:** Typography height verification under Rule 7 Table-I strictly requires an optical calibration standard (ID-1 card or coin).

---

## 13. License

Developed for the **Smart India Hackathon 2026 (Problem Statement SIH26034)** under the Department of Consumer Affairs, Ministry of Consumer Affairs, Food & Public Distribution, Government of India.
