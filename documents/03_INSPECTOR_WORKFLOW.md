# Field Inspector & Officer Workflows

**Document Code:** `DOC-03`  
**Applies to:** Field Mobile App (`Frontend_App`) & Web Supervisory Portal (`Frontend_Portal`)  
**Audience:** Field Legal Metrology Officers, Adjudicating Officers, System Evaluators  

---

## 1. Overview of Operational Workflows

NiyamNetra models four distinct real-world inspection workflows encountered during statutory market surveillance:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CORE OPERATIONAL WORKFLOWS                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Standard Compliant Inspection   ──  Fast-path single/multi-panel    │
│ 2. Review-Required & Recapture     ──  Gaps, ambiguities, low contrast │
│ 3. Disconnected Offline Inspection ──  Godowns, mandis, no connectivity│
│ 4. Adjudication & Enforcement      ──  Section 36 dossiers & notices   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Workflow 1: Standard Compliant Inspection

This is the standard fast-path workflow for a compliant or straightforward pre-packaged commodity.

| Step | Actor / Participant | Action & Data Payload | Technical Invariant |
|:---:|---|---|---|
| **1** | Field Inspector ➔ Mobile App | Enters Employee ID (`LM-TG-XXXX`) & credentials | Authenticates device binding & role authorization |
| **2** | Mobile App ➔ FastAPI Gateway | `POST /auth/login` (with `install_id`) | HTTP 200 OK + Bearer JWT token |
| **3** | Field Inspector ➔ Mobile App | Selects registered store & taps "Start Inspection" | Geofenced proximity check ($\le 100\text{ m}$) |
| **4** | Mobile App ➔ FastAPI Gateway | `POST /inspections` (store ID, GPS coordinates) | HTTP 201 Created (`inspection_id`) |
| **5** | Field Inspector ➔ Mobile App | Points camera at Principal Display Panel (Front) | Immutable RAW photo saved locally with SHA-256 |
| **6** | Mobile App ➔ Edge Quality Gate | Heuristic analysis (blur variance, glare, framing) | Quality Status: `READY` (~38 ms) |
| **7** | Field Inspector ➔ Mobile App | Captures Information Panel (Back / Crimp) | Quality Status: `READY` |
| **8** | Mobile App ➔ FastAPI Gateway | `POST /inspections/{id}/scans` + upload images | HTTP 201 Created; SHA-256 verified on disk |
| **9** | Mobile App ➔ FastAPI Gateway | `POST /scans/{scan_id}/assess` | Triggers Cloud OCR ➔ Cloud LLM ➔ 26 Rules |
| **10** | Rules Engine ➔ Mobile App | Assessment Payload: `COMPLIANT` | All 26 statutory checks satisfied |
| **11** | Mobile App ➔ Field Inspector | Renders green "COMPLIANT" banner | Official record anchored in audit ledger |

### Screen Progression:
1. `LoginScreen`: Officer enters official Employee ID and password. Authenticates device binding.
2. `InspectionScreen`: Displays active stores within geofenced proximity. Officer initiates visit.
3. `CameraCaptureScreen`: Live camera viewport with bounding guidelines and optical calibration marker indicators.
4. `QualityFeedbackModal`: Displays non-blocking green confirmation banner when image sharpness and lighting are optimal.
5. `AssessmentResultScreen`: Displays green `COMPLIANT` status with full itemized breakdown (18/18 active checks passed).

---

## 3. Workflow 2: Review-Required & Smart Recapture Flow

When a package is captured partially, or when declarations suffer from specular glare or optical uncertainty, NiyamNetra automatically initiates the smart recapture loop:

| Step | Actor / Participant | Action & Data Payload | System Outcome |
|:---:|---|---|---|
| **1** | Inspector ➔ Mobile App | Captures Front Panel only & taps "Assess" | Single panel submitted |
| **2** | Mobile App ➔ Backend Gateway | `POST /scans/{id}/assess` | Initial statutory evaluation executed |
| **3** | Backend Gateway ➔ Mobile App | Verdict: `REVIEW_REQUIRED` (Completeness: 11/26 Assessed) | 15 checks `NOT_ASSESSED` (Back Panel missing) |
| **4** | Backend Gateway ➔ Mobile App | Auto-generates Capture Request: `CAP_69_46_back_missing` | Guided recapture task surfaced |
| **5** | Mobile App ➔ Inspector | Alert: *"Review Required: Back Panel Evidence Missing"* | Targeted guidance with camera reticle |
| **6** | Inspector ➔ Mobile App | Re-aligns camera and photographs Back Panel | High-sharpness capture saved |
| **7** | Mobile App ➔ Backend Gateway | `POST /scans/{id}/images` (panel: `back`, `linked_task_id`) | Uploads missing evidence |
| **8** | Mobile App ➔ Backend Gateway | `POST /recapture/inspections/{id}/reassess` | Re-evaluates package with multi-panel context |
| **9** | Backend Gateway ➔ Mobile App | If compliant: `COMPLIANT`. If sticker overprint: `VIOLATION` | Defect attributed to Rule 6(1)(da) |
| **10** | Backend Gateway ➔ Web Portal | Surfaces in Officer Review Queue (`/review/queue`) | Adjudicating officer reviews crops & signs |

### Actionable Capture Tasks:
- If net quantity numeral height cannot be computed due to missing calibration, the app presents:  
  **`CAP_CALIBRATION_REQUIRED`**: *"Place standard ID card or 5 Rupee coin alongside label."*
- If the back panel was omitted during intake, the app presents:  
  **`CAP_BACK_PANEL_MISSING`**: *"Capture back panel showing manufacturer address and consumer care."*

---

## 4. Workflow 3: Disconnected Offline Field Inspection

In godowns, basements, or remote locations with zero cellular coverage, field officers can continue their work uninterrupted:

```
[ Field Officer in Offline Godown ]
               │
               ▼
   1. Offline Local Capture
      - Officer takes photographs of packaging panels
      - App persists original high-res RAW photos to local file system
      - Quality gate runs entirely locally on-device
               │
               ▼
   2. Local SQLite Enqueueing
      - Inspection record saved locally with client UUID
      - Tasks marked with state: QUEUED_OFFLINE
      - Client timestamp recorded with monotonic counter
               │
               ▼
   3. Inspector Exits Godown & Regains Connectivity
      - App background network listener detects active internet
      - Sync engine initiates automated flush
               │
               ▼
   4. Server-Side Idempotent Ingestion
      - Sends POST /inspections and POST /scans with Idempotency-Key
      - Server calculates clock_skew_seconds between device and server
      - Images uploaded, verified via SHA-256, and assessed
               │
               ▼
   5. Notification of Completed Assessment
      - Inspector receives push/haptic notification of final verdict
```

---

## 5. Workflow 4: Adjudication & Enforcement Reporting

When an inspection reveals confirmed statutory non-compliance, the platform assists the officer in building a defensible legal dossier:

1. **Automatic Limb Categorization:**
   - The engine automatically maps findings to Section 36 limbs:
     - **Section 36(1):** Non-standard packaging, missing mandatory declarations, improper font sizes, omission of manufacturing dates.
     - **Section 36(2):** Discrepancies in declared quantity vs actual contents (short weight/volume).
2. **Advisory Action Recommendation:**
   - Based on the Jan Vishwas Act (Act 18 of 2023) tiers:
     - First offense (minor/technical defect): Advisory recommendation to issue **Notice for Rectification**.
     - Substantive violation (deceptive dual pricing, missing origin): Advisory recommendation for **Compounding or Formal Prosecution**.
3. **Report Generation:**
   - Officer triggers report export via `POST /reports/inspections/{id}/pdf`.
   - Backend assembles:
     - Official header with Department seal and jurisdiction.
     - Store premises details and GPS geofence verification summary.
     - Complete itemized checklist with governing rule citations.
     - Annotated high-resolution photo evidence crops.
     - Officer signature block and cryptographic verification QR code.
