# Optical, Vision & Language Pipeline

**Document Code:** `DOC-04`  
**Applies to:** Image Ingestion, Quality Assessment, Geometry, Cloud OCR, and LLM Structuring  
**Performance Baseline:** Sub-2-Second End-to-End Latency Profile  

---

## 1. Dual-Artifact Evidentiary Guarantee

To eliminate evidence-tampering vulnerabilities in judicial proceedings, NiyamNetra enforces a strict dual-artifact separation between authoritative forensic evidence and operational analysis derivatives.

```
                  ┌──────────────────────────────────────────────┐
                  │            Camera Capture Event              │
                  └──────────────────────────────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
   ┌─────────────────────────────────┐       ┌─────────────────────────────────┐
   │    AUTHORITATIVE ORIGINAL       │       │    DERIVED ANALYSIS ARTIFACT    │
   ├─────────────────────────────────┤       ├─────────────────────────────────┤
   │ - Full camera resolution        │       │ - Max 1600 px along long edge   │
   │ - 100% byte-exact preservation  │       │ - Standardized 75% quality JPEG │
   │ - Never cropped, scaled, warped │       │ - Normalised EXIF orientation   │
   │ - Cryptographic SHA-256 digest  │       │ - Used strictly for OCR / LLM   │
   │ - Immutable audit anchor        │       │ - Distinct file path & URI      │
   └─────────────────────────────────┘       └─────────────────────────────────┘
```

1. **Authoritative Original Evidence:** Stored untouched at `data/images/{scan_id}/original_{uuid}.jpg`. The SHA-256 digest is calculated immediately upon byte ingestion and recorded in `scan_images.sha256`. It is never overwritten, compressed, or warped.
2. **Derived Analysis Artifact:** Generated adaptively on the client or server. If the original image width or height exceeds 1600 px, it is downscaled along the long edge while strictly preserving aspect ratio. Grayscale conversion is forbidden to ensure color-coded indicators (such as veg/non-veg dots under Rule 6(4A)(d)) remain assessable.

### End-to-End Processing Flow

```text
┌─────────────────────────────────┐
│   Live Mobile Optical Capture   │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│      Original RAW Image         │       │    Adaptive Analysis Derivative │
│  (Byte-Exact SHA-256 Digest)    │       │     (max 1600 px Color JPEG)    │
└─────────────────────────────────┘       └──────────────┬──────────────────┘
                                                         │
                                                         ▼
                                          ┌─────────────────────────────────┐
                                          │     Client Edge Quality Gate    │
                                          │  - Blur: Laplacian (>= 60)      │
                                          │  - Glare: Luma (<= 15%)         │
                                          └──────┬───────────────────▲──────┘
                                                 │                   │ (Retake Guidance)
                                 (Pass: Optimal) │                   │
                                                 ▼                   │
                                          ┌──────────────────────────┴──────┐
                                          │     HTTPS Multipart Upload      │
                                          └──────────────┬──────────────────┘
                                                         │
                                                         ▼
                                          ┌─────────────────────────────────┐
                                          │   4-Point Perspective Warp      │
                                          │  (Fronto-Parallel Planar Plane) │
                                          └──────────────┬──────────────────┘
                                                         │
                                                         ▼
                                          ┌─────────────────────────────────┐
                                          │       Cloud OCR Engine          │
                                          │ (Google Cloud Vision/OCR.space) │
                                          └──────────────┬──────────────────┘
                                                         │
                                                         ▼
                                          ┌─────────────────────────────────┐
                                          │    Cloud LLM Schema Structuring │
                                          │    (Groq Llama-3.3-70B DTO)     │
                                          └──────────────┬──────────────────┘
                                                         │
                                                         ▼
                                          ┌─────────────────────────────────┐
                                          │ Deterministic Statutory Engine  │
                                          │ (26 Legal Checks - Rule 2026.09)│
                                          └─────────────────────────────────┘
```

---

## 2. Fast Client-Side Quality Gate

Before transmitting megabytes of imagery over cellular networks, the client evaluates a fast heuristic quality gate (runtime: ~38 ms):

| Quality Metric | Evaluation Algorithm | Rejection Threshold | Remediation Guidance Surfaced |
|---|---|---|---|
| **Sharpness / Blur** | Variance of Laplacian operator | Score < 60.0 (Severe Blur) | *"Hold camera steady; focus on label text"* |
| **Specular Glare** | Percentage of pixels with Luma > 245 | Glare Area > 15.0% | *"Tilt package slightly to eliminate reflection"* |
| **Exposure (Underexposure)** | Mean Luma channel | Mean Luma < 35.0 | *"Move to brighter lighting or turn on torch"* |
| **Exposure (Overexposure)** | Mean Luma channel | Mean Luma > 240.0 | *"Reduce direct overhead lighting"* |
| **Edge Framing** | Bounding contour proximity to sensor border | Margin < 2% of frame | *"Move camera back; package edges clipped"* |
| **Package Tilt** | Minimum bounding box orientation angle | Absolute Tilt > 25.0° | *"Hold camera parallel to package panel"* |

**Quality States:**
- `READY`: All metrics within optimal bands. Auto-capture or instant upload allowed.
- `READY_WITH_WARNINGS`: Mild glare (5–15%) or mild blur (60–100). Proceed with advisory notification.
- `RETAKE_REQUIRED`: Image exceeds rejection thresholds. Upload blocked until retaken.

---

## 3. Geometry Detection & Perspective Rectification

Packages captured in the field frequently exhibit perspective skew due to viewing angles or non-planar surfaces.

```text
┌──────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Raw Panel Image │ ──> │ Canny Edge & Dilate │ ──> │ 4-Point Quad Contour│
└──────────────────┘     └─────────────────────┘     └──────────┬──────────┘
                                                                │
                                                                ▼
┌──────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ Rectified Plane  │ <── │ Perspective Warp    │ <── │ Homography Matrix H │
└──────────────────┘     └─────────────────────┘     └─────────────────────┘
```

1. **Panel Quad Detection (`detect_panel_quad`):** Identifies the quadrilateral bounding the package display panel.
2. **Perspective Rectification (`rectify`):** Applies a four-point perspective homography warp, transforming angled display surfaces into a flattened, fronto-parallel coordinate plane.
3. **Principal Display Panel (PDP) Calculation:**
   - **Rectangular packages:** Area = Height × Width
   - **Cylindrical containers:** Area = 40% of (Height × Circumference) = $0.40 \times H \times (\pi \times D)$
   - **Blown-moulded / Special shapes:** Area calculated based on total surface area formula under Rule 7 Table-I.
4. **Physical Scale Computation (`compute_scale`):**
   - Matches detected reference objects (ID-1 card = 85.60 mm width; 5 INR coin = 23.00 mm diameter).
   - Computes millimeter-per-pixel factor: $\text{mm\_per\_pixel} = \frac{\text{Known Dimension (mm)}}{\text{Detected Bounding Pixels}}$.

---

## 4. Cloud OCR Pipeline Abstraction

NiyamNetra abstracts OCR behind a pluggable interface (`ocr_engine.py` / `ocr/`):

- **Primary Cloud Provider:** Google Cloud Vision API / OCR.space API.
- **Output Schema (`OcrResult`):**
  - `full_text`: Concatenated plain text of all recognized lines.
  - `lines`: Array of line strings with associated polygon coordinates.
  - `words`: Array of individual words with bounding boxes `[ymin, xmin, ymax, xmax]` normalized to image dimensions.
  - `mean_confidence`: Average optical recognition confidence (0.0 to 1.0).

---

## 5. Evidence-Grounded Cloud LLM Structuring

The output of optical character recognition on real-world packaging is frequently noisy, disjointed, or fragmented across lines. NiyamNetra utilizes an evidence-grounded Cloud LLM (Groq Llama-3.3-70B with Google Gemini Flash fallback) strictly for **entity extraction and semantic normalization**.

### 5.1 Strict Extraction Invariant
The LLM is prompted with strict JSON schema constraints. It is forbidden from guessing, completing missing numbers, or asserting legality.

```json
{
  "commodity_name": "Refined Sunflower Oil",
  "brand_name": "Fortune",
  "manufacturer_name": "Adani Wilmar Limited",
  "manufacturer_address": "Fortune House, Near Navrangpura Railway Crossing, Ahmedabad 380009",
  "net_quantity": {
    "value": 1.0,
    "unit": "L",
    "raw_text": "1 Litre / 910 g"
  },
  "mrp": {
    "currency": "INR",
    "amount": 145.0,
    "raw_text": "MRP Rs. 145.00 (incl. of all taxes)"
  },
  "dates": {
    "mfg_date": "2026-08-15",
    "expiry_date": "2027-05-15"
  },
  "consumer_care": {
    "phone": "1800-233-9999",
    "email": "customercare@adaniwilmar.in"
  },
  "country_of_origin": "India"
}
```

### 5.2 Field Provenance & Grounding
Every extracted entity carries an explicit `FieldProvenance` record:
- `source_line`: Exact OCR line from which the value was extracted.
- `panel`: Source panel (`front`, `back`, `mrp`, `batch`).
- `confidence`: Optical and extraction confidence score.
- `bbox`: Bounding box coordinates on the derived analysis image.

---

## 6. Security & Credential Isolation

To prevent credential leakage:
1. **Zero Client-Side AI Keys:** The mobile app bundle (`NiyamNetra-v1.0.4-release.apk`) contains zero OCR API keys, Groq tokens, or Gemini credentials. All AI calls execute strictly server-side within the protected Render backend environment.
2. **SSRF-Guarded Outbound Fetching:** When evaluating e-commerce product links (Rules 6(10) & 6(10A)), the backend resolves DNS names through an IP-validation sandbox, blocking private IP ranges (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.169.254`) and preventing Server-Side Request Forgery.

---

## 7. Measured Production Latency Telemetry

Measured across 10 repeated full-pipeline evaluations on live Render FastAPI infrastructure and physical Android hardware:

| Stage | Operation | Mean Duration | p50 Duration | p95 Duration |
|---|---|---|---|---|
| 1 | Camera Capture & Analysis Derivation | 142 ms | 138 ms | 165 ms |
| 2 | Fast Quality Gate Evaluation | 38 ms | 36 ms | 48 ms |
| 3 | HTTPS Upload & SHA-256 Storage | 320 ms | 310 ms | 380 ms |
| 4 | Cloud OCR Pipeline | 610 ms | 590 ms | 780 ms |
| 5 | Cloud LLM Structuring (Groq) | 415 ms | 405 ms | 510 ms |
| 6 | Deterministic Statutory Rule Engine | 28 ms | 26 ms | 35 ms |
| 7 | UI Reactive State & Rendering | 45 ms | 42 ms | 55 ms |
| **Total** | **Composite Turnaround** | **1,598 ms** | **1,547 ms** | **1,973 ms** |

*Result:* Turnaround is consistently sub-2-second, enabling seamless field operation without officer delay.
