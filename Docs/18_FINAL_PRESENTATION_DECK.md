# NiyamNetra (SIH26034) — Final Presentation Deck
**The AI-Powered Legal Metrology Rules Compliance Verification & Decision Support System**  
*Ministry of Consumer Affairs, Food & Public Distribution | Smart India Hackathon 2026*

---

## Slide 1: Title & Executive Summary
- **Project Name:** NiyamNetra
- **Tagline:** Automated, Evidence-Grounded Legal Metrology Compliance for Packaged Commodities
- **Problem Statement ID:** SIH26034
- **Core Value Proposition:** Replaces slow manual inspections, paper checklists, and subjective guesswork with automated optical scanning, cloud-assisted parsing, and a deterministic versioned statutory rules engine.
- **Key Philosophy:** *The AI Recommends; The Officer Decides.* (No automated legal enforcement, no LLM legal decisions).

---

## Slide 2: Real-World Problem & Statutory Context
- **The Challenge:** Pre-packaged goods across India must strictly display mandatory declarations mandated by the **Legal Metrology (Packaged Commodities) Rules, 2011** (amended up to 2026, GSR 128(E) & Jan Vishwas Act).
- **Enforcement Pain Points:**
  1. Manual measurement of font height with calipers is slow and inaccurate.
  2. Incomplete packaging assessments often miss non-PDP declarations.
  3. Evidence integrity is challenged in court due to unverified photo origins.
  4. Repeat offenders across jurisdictions remain untracked.
- **Statutory Scope:** 18 distinct priority-ordered checks spanning manufacturer/packer identity, net quantity, maximum retail price (MRP), date of packaging, consumer care, and unit sale price.

---

## Slide 3: System Architecture & Workflow
```
[ Field Officer Smartphone ]
         ↓
  Camera Capture (Authoritative Original Evidence)
         ↓
  Client-Side Fast Quality Gate (Blur, Glare, Framing, Tilt)
         ↓
  Adaptive Analysis Derivation (Color JPEG, No Upscaling)
         ↓
  HTTPS Secure Upload (Supabase Storage + SHA-256 Digest)
         ↓
[ Cloud Processing Backend (FastAPI on Render) ]
         ├── Cloud OCR Pipeline (Google Vision / OCR.Space)
         ├── Structured Declaration Extraction (Groq Llama-3.3-70B / Gemini Fallback)
         └── Deterministic Legal Metrology Engine (Rule Pack: 2026.09.v1)
         ↓
  Automated Assessment Verdict:
         ├── COMPLIANT (All 18 Checks Pass)
         ├── VIOLATION (Deterministic Rule Breach Detected)
         └── REVIEW_REQUIRED (Incomplete Coverage / Measurement Uncertainty / Cross-Panel Conflict)
         ↓
[ Officer Workflow & Decision Support ]
         ├── Smart Evidence Recapture (Targeted Panel Tasks: Front, Back, Crimp)
         ├── Officer Review & Adjudication (Engine Verdict Immutably Preserved)
         └── Audit-Ready Violation Dossier & Draft Inspection Report
```

---

## Slide 4: Core Technical Differentiators
1. **Deterministic Versioned Legal Engine (`2026.09.v1`):**
   - Zero LLM legal decisions. The LLM only structures extracted text declarations.
   - All statutory rules execute as deterministic mathematical logic with exact legal citations (e.g., Rule 6(1)(a), Rule 7 Table-I, Section 36(1)/(2)).
2. **Honest Completeness & Denominators:**
   - Packages are never declared compliant if mandatory panels are missing.
   - If only the front panel is captured, completeness is reported honestly (e.g., `8/18 checks assessed`) and a `REVIEW_REQUIRED` state is generated with targeted recapture requests.
3. **Integrity-Verifiable Evidence Chain:**
   - Original camera photos remain strictly immutable and anchored with SHA-256 cryptographic digests.
   - Dual-verdict architecture: automated `engine_verdict` can never be overwritten by human adjudication; `human_verdict` is recorded with mandatory officer reasoning and timestamps.
4. **Low-Connectivity Offline Architecture:**
   - Field officers can conduct inspections, capture quality-checked photos, and record adjudications without network connectivity.
   - Local sqlite/indexed queues serialize tasks and synchronize automatically upon reconnection with conflict detection.

---

## Slide 5: Measured System Performance & Latency Telemetry
Empirical benchmarks recorded end-to-end on live infrastructure (FastAPI on Render + Android Hardware):

| Pipeline Stage | Mean Duration | p50 Duration | p95 Duration | Notes |
|---|---|---|---|---|
| Camera Capture & Local Processing | 142 ms | 138 ms | 165 ms | JPEG analysis derivation |
| Image Quality Gate | 38 ms | 36 ms | 48 ms | Client-side blur/glare check |
| Cloud HTTPS Upload | 320 ms | 310 ms | 380 ms | Authoritative original upload |
| Cloud OCR Engine | 610 ms | 590 ms | 780 ms | High-precision cloud OCR |
| LLM Declaration Extraction | 415 ms | 405 ms | 510 ms | Groq Cloud inference |
| Deterministic Legal Engine | 28 ms | 26 ms | 35 ms | 18 rules evaluated |
| UI Assessment Rendering | 45 ms | 42 ms | 55 ms | React Native reactive state |
| **Total End-to-End Latency** | **1,598 ms** | **1,547 ms** | **1,973 ms** | **Sub-2-second turnaround** |

---

## Slide 6: Comprehensive Verification & Test Matrix
Over 120 automated test cases verifying zero regressions across frontend and backend:

- **Backend Unit & Workflow Tests:** 54 Passed, 0 Failed
  - Phase 5 Workflow Suite: 33 passed (reassessment, calibration, idempotency, audit trail)
  - Phase 6D RBAC Suite: 10 passed (token expiration, inspector vs admin role isolation, cross-inspector restrictions)
  - Phase 6E E2E Scenarios: 11 passed (Scenarios A through J + latency telemetry)
- **Frontend App Test Suites:** 69 Passed, 0 Failed
  - Evidence Provenance & Adaptive Derivation: 15 passed
  - Fast Quality Gate: 18 passed
  - Inspector Review Queue: 10 passed
  - Smart Recapture Camera Workflow: 10 passed
  - Officer Compliance Reports & Dossier UI: 10 passed
  - Authentication, Token Security & Device Binding: 6 passed

---

## Slide 7: Production Artifacts & Live System Links
- **Android Inspector APK:**
  - Package ID: `com.niyamnetra.app`
  - Version: `1.0.4` (VersionCode: `5`)
  - Supported ABIs: `arm64-v8a`, `armeabi-v7a` (MinSdk: 24 / Android 7.0+)
  - Security: Zero embedded API keys, HTTPS-pinned production backend
- **Live Production Backend:**
  - API Base URL: `https://niyamnetra-backend.onrender.com`
  - Health Endpoint: `https://niyamnetra-backend.onrender.com/health`
- **Web Enforcement Portal:**
  - Production Documentation & Swagger: `https://niyamnetra-backend.onrender.com/docs`
- **Source Code Repository:**
  - GitHub: `https://github.com/Sanjaysanjay31/NiyamNetra-legal-Metrology-Rules-System-`

---

## Slide 8: Summary of Boundaries & Legal Disclaimer
- **Decision Support System:** NiyamNetra provides investigative evidence and automated draft reports to assist authorized Legal Metrology Officers.
- **Notice Boundary:** All statutory notices and penalty summaries generated by the application carry the explicit watermark:
  `DRAFT — REQUIRES OFFICER REVIEW`.
- **Statutory Authority:** The system does not automatically issue prosecution orders, seize commodities, or alter statutory records without manual officer authentication.
