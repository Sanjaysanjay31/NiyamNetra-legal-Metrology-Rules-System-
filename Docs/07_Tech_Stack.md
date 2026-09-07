# NiyamNetra — Tech Stack

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Every tool, version and command

**Version:** 3.0 | **Date:** 30 Aug 2026 | **Supersedes:** 2.1 (see §15 for the corrections log)
**Scope:** Prerequisites, per-tool install commands, the complete pinned dependency list, build order, version matrix, verification checklist

---

## 0. THE STACK IN ONE GLANCE

Three parts, all free and open-source, and the core runs with no internet after setup.

| Layer | What runs it | Port |
|---|---|---|
| Portal (web) | React 18 + Vite 5 + Tailwind 3.4 + Lucide + React Router 6 + Recharts + vite-plugin-pwa | 5173 |
| Expo app (mobile) | Expo SDK 54 + expo-camera + expo-secure-store + React Navigation 6 | 8081 |
| Backend (API) | FastAPI + Uvicorn + SQLAlchemy 2.0 + Pydantic 2 + PyJWT + Passlib | 8000 |
| Vision / OCR | OpenCV 4.9 + PaddleOCR 2.8 (primary) + Tesseract 5 (fallback) + YOLOv8 (optional) | — |
| Database | Supabase PostgreSQL (session pooler), REQUIRED, no SQLite fallback | — |
| Reports | ReportLab 4.1 (PDF) + python-docx 1.1 (Word) + qrcode | — |

### 0.1 What is deliberately absent, and why

This list is as load-bearing as the list above. Each of these was in the stack at some point and was removed for a stated reason. Adding one back reopens the problem.

**Docker for local dev.** Three terminals start in about thirty seconds; a PaddleOCR plus PostgreSQL image pull is gigabytes over hackathon WiFi, fails halfway, and hides the logs the judges want to see. There is no Compose file and no image build in CI — but `Backend/Dockerfile` exists for the Render deploy (Tesseract + libzbar on slim Python; see `render.yaml`).

**Hosted vision/LLM as primary** — Google Vision, Gemini, GPT, Claude, Azure OCR. Three independent reasons, and any one of them is sufficient. The venue network cannot be relied on, so a demo that calls out fails live. Evidence in an enforcement file cannot be shipped to a third-party endpoint that returns a differently-worded answer on the same image next month. And a generative model asked to read a blurry label will produce a plausible reading rather than reporting that it cannot read one — which is exactly the failure the whole three-state verdict model exists to prevent. OCR is local-first (PaddleOCR primary, Tesseract fallback); OCR.space is an optional fallback only when local OCR is absent (slim Render deploy, `OCR_SPACE_API_KEY`).

**Object stores as primary.** Local filesystem is the primary evidence store, hashed byte-for-byte. Supabase Storage is an optional best-effort mirror configured via `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_BUCKET` (`image_processor.store_upload`); a mirror failure never fails the scan. S3/MinIO/Cloudinary are not used.

**Generative upscaling and super-resolution of any kind.** A super-resolution model asked to sharpen a 2 mm letter invents plausible glyph edges. Measuring the invented edge and reporting a millimetre figure from it is fabricated evidence, whatever the intent.

**IMEI-based device binding.** Unavailable to apps since Android 10. `install_id` is a server-issued random value in the platform keystore instead — see `09_SECURITY.md` §4.

---

## 1. PREREQUISITES

| Tool | Why | Version | Get it | Setup | Verify |
|---|---|---|---|---|---|
| Node.js | Runs Vite and Expo tooling | 18 LTS or 20 LTS | nodejs.org | Install, restart the terminal | `node -v` → v18+, `npm -v` → 10+ |
| Python | FastAPI, OCR, rules engine | 3.10 or 3.11 | python.org | Windows: tick "Add Python to PATH". macOS: `brew install python@3.11` | `python --version` → 3.10+ |
| Git | Version control across six people | any current | git-scm.com | `git config --global user.name` / `user.email` | `git --version` |
| VS Code | Editor | current | code.visualstudio.com | Extensions: Python, Pylance, ES7+ React snippets, Tailwind CSS IntelliSense, Expo Tools | Extensions panel |
| Expo Go | Runs the app on a real phone with no APK build | current | Play Store / App Store | Phone and laptop on the **same** WiFi | Opens to "Scan QR code" |

**Python 3.12 is not supported.** PaddlePaddle 2.6 publishes no 3.12 wheel, so `pip install paddlepaddle` falls back to a source build that fails on most machines. Use 3.10 or 3.11 and this whole class of problem disappears.

### 1.1 System packages — the step that is always forgotten

Three Python packages here are thin wrappers around native binaries. `pip install` succeeds and the import fails at runtime, which is a confusing failure to debug at 2 a.m.

```bash
# Debian / Ubuntu / WSL
sudo apt-get update && sudo apt-get install -y \
    tesseract-ocr tesseract-ocr-hin libzbar0 libgl1 libglib2.0-0

# macOS
brew install tesseract tesseract-lang zbar

# Windows
#   Tesseract: install the UB-Mannheim build from
#     https://github.com/UB-Mannheim/tesseract/wiki  (tick the Hindi language data)
#     then add C:\Program Files\Tesseract-OCR to PATH
#   zbar: ships inside the pyzbar wheel on Windows — nothing extra to install
```

`libgl1` and `libglib2.0-0` are what `opencv-python` links against; without them `import cv2` fails with `libGL.so.1: cannot open shared object file` on a clean Linux box or container-based CI runner.

Verify all three:

```bash
tesseract --version                                   # 5.x
python -c "import cv2; print(cv2.__version__)"        # 4.9.x
python -c "from pyzbar import pyzbar; print('zbar ok')"
```

---

## 2. PORTAL — React 18 + Vite 5

One responsive codebase serves the inspector flow and the admin dashboard; layout and routes adapt to screen size and to the logged-in role, per `08_UI_DESIGN.md`.

```bash
npm create vite@latest niyamnetra-portal -- --template react
cd niyamnetra-portal
npm install
npm install react-router-dom@6 recharts@2.12 lucide-react axios date-fns idb
npm install -D tailwindcss@3.4 postcss autoprefixer vite-plugin-pwa
npm install -D vitest@1.4 @testing-library/react@14 @testing-library/jest-dom@6 jsdom@24
npx tailwindcss init -p
npm run dev            # http://localhost:5173
```

| Package | Purpose | Where used |
|---|---|---|
| react 18.2 + vite 5 | Every screen | all |
| tailwindcss **3.4** | Utility styling on the token set in `08` §2.1 | all |
| lucide-react | Icons, stroke 1.8 | buttons, cards, nav |
| react-router-dom 6 | Ten routes, role-guarded | `App.jsx` |
| recharts 2.12 | Dashboard bar and line charts | `AdminDashboard.jsx` only |
| vite-plugin-pwa 0.19 | Service worker, installable, offline shell | `vite.config.js` |
| axios 1.6 | HTTP client, refresh-on-401 interceptor | `src/api/client.js` |
| date-fns 3.6 | `format(new Date(), 'dd MMM yyyy')` | reports, calendar |
| **idb 8** | IndexedDB wrapper for the offline queue | `src/offline/db.js` |

### 2.1 Tailwind 3.4 with PostCSS — not the v4 plugin

Version 2.1 of this document said "Tailwind CSS 3.4" and then gave the install command for `@tailwindcss/vite`, which is the **Tailwind v4** plugin. It also said to write a `tailwind.config.js` with a `content` array, which is **v3** configuration. No combination of those instructions produces a working build: with 3.4 installed, `@tailwindcss/vite` does not exist to import; with v4 installed, the `content` array is ignored and `@tailwind base` is not the v4 entry syntax. This is the single most likely thing to cost the team an afternoon, so the correct v3.4 setup is written out in full.

```javascript
// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F2A44",        // see 08 §2.1 — these are the audited values
        teal: "#0E7490",
        compliant: "#1B5E20",
        violation: "#B71C1C",
        notAssessed: "#37474F",
        outOfScope: "#455A64",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
```

```javascript
// postcss.config.js  — created by `npx tailwindcss init -p`
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

```css
/* src/index.css — first three lines of the file, order matters */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

3.4 rather than v4 because `08_UI_DESIGN.md` and `Frontend_Portal_Prompts.md` are both written against v3 utility class names and a v3 config file, and because v4's CSS-first configuration would mean rewriting the token layer for no gain the project needs. If someone later moves to v4, all three of those documents move with it or none do.

### 2.2 The API client — no token in storage

```javascript
// src/api/client.js
import axios from "axios";

// The access token lives in a module-scoped variable and nowhere else.
// Not localStorage, not sessionStorage, not a non-httpOnly cookie: anything
// readable by JavaScript is readable by any script that gets injected, and a
// stolen access token is a valid inspector session for twelve hours.
// The refresh token is an httpOnly cookie the browser sends automatically and
// JavaScript can never read: SameSite=Strict locally, SameSite=None; Secure in
// prod (cross-site portal -> API). See 09_SECURITY.md §3.
let accessToken = null;
export const setAccessToken = (t) => { accessToken = t; };

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,          // required for the refresh cookie
});

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});
```

### 2.3 Verify

```bash
cd Frontend_Portal && npm run dev
# Local: http://localhost:5173/ with no errors
# The login screen renders and asks for an Employee ID — not an email address
npm run test          # Vitest passes, including the contrast suite in 10 §9.1
```

---

## 3. EXPO APP — SDK 54

Five screens, camera-first, no `android/` or `ios/` folders.

```bash
cd Frontend_App
npx expo install expo-camera expo-location expo-secure-store expo-file-system
npx expo install react-native-screens react-native-safe-area-context
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs axios
npx expo start         # Metro on 8081, QR points at exp://<LAN-IP>:8081
```

| Package | Purpose | Where used |
|---|---|---|
| expo-camera ~15 | Live capture with the guide box; the only image source | `ScanScreen.js` |
| expo-location ~17 | GPS fix recorded with the inspection; never blocks a capture | `InspectionScreen.js` |
| **expo-secure-store ~13** | Keystore-backed storage for `install_id` and the refresh token | `auth/storage.js` |
| expo-file-system ~17 | Queues captured images while offline | `offline/queue.js` |
| React Navigation 6 | Five screens, bottom tabs | `App.js` |
| axios 1.6 | Same API, reached over the LAN IP | `api/client.js` |

### 3.1 Port 8081, not 19000

`exp://<LAN-IP>:19000` was the Expo *classic* port. SDK 54 uses the Metro dev server on **8081** and printing 19000 anywhere sends the team hunting a port nothing is listening on. If 8081 is already taken, Expo offers the next free port and prints it — read the terminal rather than assuming.

### 3.2 No gallery, at all

`expo-image-picker` is **not** installed, and this is deliberate. Version 2.1 listed it and then noted it was "disabled for Inspector per anti-fraud", which is the weakest possible form of the control: the capability ships and one conditional stands between a gallery image and the evidence chain. If the package is absent, a screenshot of a compliant label cannot enter the system at all, and no code review is required to keep it that way. The button is absent from the UI too, not disabled — see `08_UI_DESIGN.md` §4.

### 3.3 Token storage on the phone

```javascript
// auth/storage.js
import * as SecureStore from "expo-secure-store";

// AsyncStorage is a plain unencrypted file in the app sandbox, readable on any
// rooted or jailbroken device and often included in device backups. The refresh
// token is a 30-day credential for a government enforcement account, so it goes
// in the platform keystore. The 12-hour access token stays in memory only.
export const saveRefresh = (t) => SecureStore.setItemAsync("nn_refresh", t);
export const loadRefresh = () => SecureStore.getItemAsync("nn_refresh");
export const saveInstallId = (id) => SecureStore.setItemAsync("nn_install_id", id);
```

### 3.4 Layout and verification

```text
niyamnetra-app/
├── app.json          # camera + location permission strings, portrait lock
├── App.js            # NavigationContainer
├── api/client.js     # axios, baseURL = http://<LAN-IP>:8000
├── auth/storage.js   # SecureStore
├── offline/queue.js  # expo-file-system queue
└── screens/          # LoginScreen, InspectionScreen, ScanScreen,
                      # FindingsScreen, TodaysReportScreen
```

```bash
npx expo start
# Metro waiting on exp://192.168.1.5:8081 with a QR code
# Set api/client.js baseURL to http://192.168.1.5:8000 — NOT localhost, which on
# the phone means the phone itself.
# Find the LAN IP:  Windows `ipconfig` -> Wireless LAN IPv4
#                   macOS  `ifconfig en0 | grep inet`
```

Do not run `npx expo prebuild`. It generates `android/` and `ios/` folders that nothing here needs and that will not be committed.

---

## 4. BACKEND — FastAPI

```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Windows
source venv/bin/activate         # macOS / Linux
pip install -r requirements.txt
alembic upgrade head             # creates the schema WITH its constraints
python seed.py                   # demo users and stores
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

`--host 0.0.0.0` and not the default `127.0.0.1`, or the phone on the LAN cannot reach the API and every request from Expo times out with no useful error.

`alembic upgrade head` and never `Base.metadata.create_all()`. `create_all` cannot emit `CHECK` constraints or triggers, so a database built that way will happily accept `overall_result='Good'` and will allow an `engine_verdict` to be rewritten after the fact — the two things the schema exists to forbid. See `06_DATABASE.md` §3.

| Tool | Purpose | Notes |
|---|---|---|
| FastAPI 0.110 | REST API, Swagger at `/docs` | `main.py` + `routers/` |
| Uvicorn 0.29 | ASGI server | `[standard]` extras for websockets and httptools |
| Pydantic 2.6 | Request and response validation | `schemas.py` |
| pydantic-settings 2.2 | Typed settings from `.env` | `config.py` — v2 moved `BaseSettings` out of pydantic |
| SQLAlchemy 2.0 | ORM over SQLite and PostgreSQL | `models.py`, `database.py` |
| Alembic 1.13 | Migrations; the only way the schema is created | `alembic/` |
| PyJWT 2.8 | Access and refresh tokens | `jwt_handler.py` |
| Passlib + bcrypt | Password hashing | `password_handler.py` (`CryptContext` `bcrypt__rounds=12`) |
| python-multipart | Multipart file upload parsing | required by `UploadFile` |
| cachetools 5.3 | `TTLCache` for the listing fetch | `11` §2.6 |

### 4.1 CORS — a regex, because globs are not a thing

```python
# main.py
from fastapi.middleware.cors import CORSMiddleware

# allow_origins is an EXACT-MATCH list. "exp://*" and "http://192.168.*.*:8081"
# are not patterns to Starlette — they are literal strings that no browser will
# ever send, so version 2.1's configuration blocked every request it was
# written to allow. Wildcards need allow_origin_regex.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,          # required: the refresh cookie
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
```

`allow_credentials=True` and `allow_origins=["*"]` are mutually exclusive by specification — browsers reject the combination outright — which is a second reason the wildcard list could never have worked. The regex is defined once in `config.py`; see `Backend.md` §1.3.

### 4.2 Tokens

Twelve-hour access token held in client memory, thirty-day refresh token in an httpOnly cookie. Not the single 24-hour token version 2.1 described in two places: a 24-hour token cannot be revoked, cannot be rotated, and has to be stored somewhere readable to survive an app restart. Claims are `sub, role, install_id, jti, token_type, iat, exp`; the `token_type` claim is checked on every decode, because without it a refresh token is accepted as an access token and the twelve-hour limit silently becomes thirty days. Details in `09_SECURITY.md` §3 and `Backend.md` §3.2.

### 4.3 requirements.txt — complete and pinned

Every package here is imported by code in `Backend.md`. Version 2.1's list omitted eleven of them, including `paddlepaddle` — without which `from paddleocr import PaddleOCR` raises `ModuleNotFoundError` on a clean machine, which is precisely the machine you set up on demo morning.

```text
# --- web ---
fastapi==0.110.0
uvicorn[standard]==0.29.0
python-multipart==0.0.9

# --- data ---
sqlalchemy==2.0.27
alembic==1.13.1
pydantic==2.6.4
pydantic-settings==2.2.1
python-dotenv==1.0.1
psycopg[binary]==3.1.18          # PostgreSQL only; harmless in dev

# --- auth ---
pyjwt==2.8.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1                    # PIN: passlib 1.7.4 reads bcrypt.__about__,
                                 # which bcrypt 4.1 removed. Unpinned, every
                                 # password hash raises AttributeError.
cryptography==42.0.5

# --- vision and OCR ---
opencv-python-headless==4.9.0.80 # headless: no GUI libs, smaller, same cv2 API
numpy==1.26.4                    # PIN: paddle 2.6 is not built against numpy 2.x
paddlepaddle==2.6.1              # the engine PaddleOCR runs on — NOT optional
paddleocr==2.8.1
pytesseract==0.3.10              # wrapper; needs the tesseract binary (§1.1)
Pillow==10.3.0
imagehash==4.3.1                 # perceptual hash for duplicate review
pyzbar==0.1.9                    # barcode / QR read; needs libzbar0 (§1.1)
ultralytics==8.1.34              # YOLOv8, optional PDP crop

# --- reports ---
reportlab==4.1.0
python-docx==1.1.2
qrcode[pil]==8.0

# --- runtime utilities ---
cachetools==5.3.3                # TTLCache. functools.lru_cache has no TTL and
                                 # would serve a cached listing page forever.
httpx==0.27.0                    # outbound listing fetch, SSRF-guarded

# --- tests ---
pytest==8.1.1
pytest-cov==5.0.0
freezegun==1.4.0
```

`opencv-python-headless` rather than `opencv-python`: the code never opens a window, and the headless wheel drops the GUI dependencies that cause the `libGL.so.1` failure on servers and CI runners. If you want `cv2.imshow` for local debugging, install the full wheel in your own venv and leave the pin alone.

### 4.4 Verify

```bash
curl -s http://localhost:8000/health | python -m json.tool
# {"status":"ok","checks_registered":19,"rules_as_at":"2026-07-01","catalog_hash":"..."}
```

`checks_registered` must read **19**. Anything else means a check failed to register and every report the system produces will be silently short — the exact defect the registry assertion in `Backend.md` §7 exists to catch. Do not proceed past a wrong number here.

Then open `http://localhost:8000/docs` and log in through Swagger with the seeded credentials printed by `seed.py`. Those are `@example.test` addresses with generated passwords; there are no `@gov.in` credentials anywhere in this project, and no password is `123456`. See `06_DATABASE.md` §9.

---

## 5. VISION AND OCR

| Tool | Purpose | Notes |
|---|---|---|
| OpenCV 4.9 | Rectify the panel by homography, deskew, CLAHE, blur and glare measurement, contrast sampling | `image_processor.py` |
| PaddleOCR 2.8 | Primary OCR, English + Hindi, fully local after first model download | `ocr_engine.py` |
| Tesseract 5 | Fallback when PaddleOCR returns nothing | `ocr_engine.py` |
| YOLOv8 | Optional: locate the PDP so OCR ignores the shelf behind it | add only after the core path works |

### 5.1 Cache the models before demo day

```bash
python - <<'PY'
from paddleocr import PaddleOCR
PaddleOCR(lang="en", use_angle_cls=True)      # ~100 MB into ~/.paddleocr
PaddleOCR(lang="hi", use_angle_cls=True)
print("models cached")
PY
```

Run this at setup, never during a demo. After it completes the OCR path needs no network at all. `use_angle_cls=True` matters: without angle classification a label photographed upside down returns nothing, and a package on a shelf is very often upside down.

### 5.2 The two version traps

`show_log` was a required constructor argument in PaddleOCR 2.7 and was removed in 2.8, so a hard-coded `show_log=False` breaks on 2.8 and its absence spams the logs on 2.7. The code probes `inspect.signature(PaddleOCR.__init__)` and passes it only if it exists. Second: PaddlePaddle 2.6 is not built against NumPy 2.x, and an unpinned `numpy` resolves to 2.x, producing an import-time ABI error that reads like a corrupt install. Both pins are in §4.3 for this reason.

### 5.3 Preprocessing feeds the engine, not the file path

```python
# ocr_engine.py — the shape of the pipeline
def read_panel(bgr):
    rect = rectify(bgr)          # four-point homography onto a flat plane
    gray = deskew(rect)          # Otsu -> findNonZero -> minAreaRect
    enh  = clahe(gray)           # local contrast, for transparent and glossy packs
    return run_ocr(enh)          # the ARRAY goes to the engine
```

Version 2.1's outline computed a deskewed, CLAHE-enhanced image and then called `ocr.ocr(image_path)`, passing the path of the untouched file on disk. Every line of preprocessing was computed and discarded — the pipeline looked complete, ran at full cost, and had no effect on the result. Pass the array.

### 5.4 Blur is measured and recorded, never a rejection

A Laplacian variance below the threshold means the declarations may be unreadable. It does **not** mean the upload is refused. Version 2.1 said "if blur<100 reject", which throws away the capture, the GPS fix and the inspector's trip to the shop, and leaves no record that an unreadable package was ever found — quietly biasing every statistic toward the photogenic subset of the field. The image is stored, its hash recorded, and the affected checks return `not_assessed` with the measured value in the reason. See `11_working_overflow.md`.

### 5.5 Regex extraction, and the unit that is not a unit

```python
QTY = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|g|mg|l|ml|m|cm|mm)\b", re.I)
COUNT = re.compile(r"(\d+)\s*(N|U|nos?\.?|pieces?)\b", re.I)   # a COUNT, not SI
```

Version 2.1 put `N` and `U` in the same alternation as `g|kg|ml|l`. They denote a count of articles, not a mass or volume, so a package declared "500 N" satisfied the net-quantity check as though it had declared 500 newtons of biscuits. Counts are matched separately and routed to ledger entry **L-06**, which is unverified, so the check abstains rather than guessing.

---

## 6. RULES ENGINE

Nineteen findings rows per scan — CHK01 to CHK18 plus the CHK06b sub-check — in the phase order fixed by `03_NiyamNetra_Rules_Priority_Ordered.md`. Each check is a **Python function** in `backend/rules/`, registered in a table with an import-time count assertion.

Not JSON rule files. Version 2.1 proposed storing each rule as JSON with a `regex` and a `violation_tier`, which sounds like clean data-driven design and cannot express what these checks actually do: Table-I is a five-band lookup over a PDP area computed three different ways depending on package geometry; the character-height check needs a millimetre-per-pixel scale and an uncertainty band; CHK03 halts the other eighteen checks. None of that is a regex. Worse, the sample JSON hard-coded `"violation_tier": "improvement_notice"` per field, which is how version 1.x ended up returning an improvement notice on every branch including a net-quantity misdeclaration — the tier is a function of the whole findings set and the limb engaged, not a property of one field.

Each check returns one of exactly three verdicts:

| Verdict | Meaning |
|---|---|
| `pass` | The requirement was evaluated and met |
| `fail` | The requirement was evaluated and breached |
| `not_assessed` | The requirement could not be evaluated — **a reason is mandatory** |

And a scan resolves to exactly one of four results: `compliant`, `violation`, `not_assessed`, `out_of_scope`. `Good`, `Bad`, `Review`, `NA` and `Passed` are abolished project-wide and the database rejects them on both engines. Interfaces in `Backend.md` §13.

---

## 7. DATABASE AND STORAGE

| Tool | Purpose | How |
|---|---|---|
| Supabase PostgreSQL 15+ | Only supported database (session pooler, REQUIRED) | `DATABASE_URL=postgresql+psycopg://postgres.<REF>:<PW>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require` — no SQLite fallback |
| Local filesystem | Evidence images and generated reports | `backend/evidence/{inspection_id}/`, `backend/out/` |

### 7.1 SQLite pragmas are per connection

```python
@event.listens_for(engine, "connect")
def _pragmas(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")     # defaults to OFF
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.close()
```

`PRAGMA foreign_keys` defaults to OFF in SQLite and its state belongs to one connection. Issued once in a setup script it protects nothing, because the pooled connections that serve real requests never saw it and every declared foreign key is decorative. It has to be a connect-event listener.

### 7.2 Evidence: write the bytes, then hash what was written

The stored file is byte-identical to the upload. No resize, no re-encode, no EXIF strip, no compression — and the SHA-256 is computed by reading the file back off disk after writing it. Any transformation between hashing and writing means the recorded digest can never be reproduced from the stored evidence, so `/scans/{id}/verify` reports tampering on a file nobody touched. That is not a cosmetic bug: it fails on the first verification anyone attempts, which is exactly when the integrity claim matters. Derived copies for display may be resized freely; they are not evidence and are not hashed. See `Backend.md` §5.1 and the regression test in `10_TESTING.md` §7.1.

Version 2.1's "compress 5 MB → 800 KB" instruction breaks this twice over: it changes the bytes the hash describes, and it destroys the pixel detail the millimetre measurement is computed from. A 2.5 mm character height measured on a downscaled JPEG is a number with no evidentiary meaning.

---

## 8. REPORTS

| Tool | Purpose |
|---|---|
| ReportLab 4.1 | The PDF: header, package details, nineteen findings rows, evidence images with boxes, officer remarks, timestamp, QR, disclaimer |
| python-docx 1.1 | The same report as an editable `.docx` so the officer can add remarks offline |
| qrcode[pil] 8.0 | Verification QR carrying the audit-chain head |

### 8.1 Four outcomes, four labels, legible in greyscale

Every verdict prints its label beside its colour. Enforcement documents get photocopied and faxed, and a colour-only encoding is unreadable the moment that happens. `not_assessed` and `out_of_scope` get their own colours and labels — printing both in violation red tells an inspecting officer that an unreadable package and an out-of-scope package were both breaches.

### 8.2 The disclaimer

The report says which rules were applied, states the catalogue date held in `rules_as_at`, and notes that unverified thresholds are marked. It does **not** print a rupee penalty figure, because the Section 36 amounts under Act 8 of 2026 are ledger entry **L-12** and unverified — and a wrong penalty in a document handed to a trader is worse than no penalty at all.

Version 2.1's disclaimer text was wrong in two ways: it hard-coded "as on 7 May 2026" as a fixed string, which silently becomes a false statement the day the catalogue is updated; and it claimed the report covers "not FSSAI/MDR 2017", when CHK17 does report an FSSAI observation as advisory and CHK14 does route medical devices to MDR 2017. The corrected text is in `Backend.md` §9.

### 8.3 The QR code

```python
url = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/verify/{inspection_id}?head={chain_head[:16]}"
```

An `https` URL from `PUBLIC_BASE_URL` (default `http://localhost:8000`; `https` real host in production), so a phone camera can open it. Not `niyamnetra://verify/{id}`, which does nothing on a phone without the app installed — and the person most likely to scan the QR is the trader, who does not have the app. `PUBLIC_BASE_URL` has a localhost default for local runs; there is no `verify.niyamnetra.gov.in`, nobody on this team can register a `gov.in` domain, and printing one on an enforcement document implies an official endorsement the project does not have.

---

## 9. AUTH AND SECURITY

| Tool | Purpose |
|---|---|
| PyJWT 2.8 | 12-hour access token, 30-day refresh token, `token_type` checked on decode |
| Passlib + bcrypt 4.0.1 | Password hashing, 12-char minimum for new accounts and 8-char minimum at login |
| FastAPI dependencies | `current_user`, `require_role`, `owned_inspection`, `owned_scan` |

Ownership is resolved from the row the URL path names, never from a request parameter. Version 2.1's sketch — `if current_user.id != inspector_id: raise 403` — is the vacuous check: `inspector_id` arrives from the request, so the caller supplies their own id and passes while the path still addresses somebody else's record. And the answer is **404, not 403**, so the endpoint is not an existence oracle for records the caller may not see. Full treatment in `09_SECURITY.md`; the regression test is `10_TESTING.md` §8.3.

---

## 10. VERSION CONTROL AND TESTING

| Tool | Purpose | Notes |
|---|---|---|
| Git + GitHub | Six people, one repo | No Compose file, no image build in CI |
| pytest 8.1 + httpx | Backend suite — **required, not optional** | `pytest -q` |
| Vitest + React Testing Library | Portal suite, including the contrast test | `npm run test` |
| Swagger UI at `/docs` | Interactive API exploration | Ships with FastAPI |

Swagger replaces Postman for this project. Version 2.1 required a `NiyamNetra.postman_collection.json` that was never written, so the instruction was unfollowable; and a collection file drifts from the API the moment a route changes, whereas `/docs` is generated from the code and cannot. If someone prefers Bruno or Postman, that is a personal preference and not a project dependency.

The test suite is required rather than optional because the invariants it asserts are the project's entire claim to being usable in enforcement. `10_TESTING.md` names fifteen of them; the load-bearing one is that no scan can be reported compliant while any of its nineteen checks is unassessed.

---

## 11. OPTIONAL PUBLIC DEMO HOSTING

Three local terminals are the primary demo and the most reliable one. Free hosting tiers cold-start slowly and pick the worst moment to do it. Provide a public link only if judges ask for one.

| Tool | Hosts | Note |
|---|---|---|
| Static host (Vercel / Render static) | The portal | Root `Frontend_Portal`, build `npm run build:render`, output `dist` |
| Render free tier (Python runtime) | The API only | `rootDir: Backend`, build `pip install -r requirements-render.txt` (slim), start `uvicorn main:app --host 0.0.0.0 --port $PORT` (see `render.yaml`) |

Do NOT install full `requirements.txt` on Render: it pulls PaddleOCR (~1.5 GB) and the free instance OOMs or times out — the slim `requirements-render.txt` drops PaddleOCR/PaddlePaddle, pytesseract and pyzbar for exactly this reason.

Local filesystem remains the primary evidence store; Supabase Storage is only an optional best-effort mirror (`SUPABASE_*` in `render.yaml`), and the audit chain stays in the database with published head hashes. Cloudinary is not used. Putting the primary record on a free tier whose data residency and retention nobody has read is a worse problem than not having a public link.

Render's free tier sleeps after inactivity, so a cold API takes tens of seconds to answer the first request. If you demo from a hosted link, wake it deliberately a few minutes beforehand.

---

## 12. BUILD ORDER

**Step 1 — the skeleton, no vision.** FastAPI + Alembic + Supabase PostgreSQL (pooler) + the portal shell + a blank Expo app, all talking. `alembic upgrade head` must succeed and `/health` must report `checks_registered: 19` — even with every check a stub — because the registry assertion is the thing that later prevents a silently short report. Log in from the portal at `localhost:5173` and from Expo Go over the LAN IP, and confirm both reach the same API and receive a token. Create an inspection end to end before adding anything clever.

**Step 2 — the image and OCR pipeline.** `store_upload` first, with its hash and its verify endpoint, because the evidence guarantee is easier to build than to retrofit. Then rectification, scale and OCR as one function returning structured fields with confidence and bounding boxes. Test on five real packets including a transparent bottle and a curved pouch, and on one deliberately awful photograph — the awful one is the important test, because it must be *stored and flagged*, not rejected.

**Step 3 — the rules engine.** Nineteen check functions in the phase order from `03`, each returning three-state with a mandatory reason on abstention. Run the completeness tests from `10_TESTING.md` §4 before wiring any of it to the UI: at this point the suite can already prove that no fixture produces fewer than nineteen rows and that a partially-assessed package is never reported compliant.

**Step 4 — reports.** ReportLab and python-docx once the findings shape is stable, with four labelled outcomes, the stated denominator, the ledger notes and the QR. Print one in greyscale and look at it.

**Step 5 — polish.** Three terminals up, seeded data covering all four outcomes including at least one `not_assessed` and one `out_of_scope`, the offline queue, the review queue, and the manual script in `10_TESTING.md` §11 run start to finish. Seed data that is only clean packages and clean violations demos a system that does not exist.

---

## 13. VERSION MATRIX

| Tool | Pin | Why this version |
|---|---|---|
| Node.js | 18 or 20 LTS | Required by Vite 5 and Expo 51 |
| Python | 3.10 or 3.11 | PaddlePaddle 2.6 publishes no 3.12 wheel |
| React | 18.2 | Expo 51's React version |
| Vite | 5.x | Current stable |
| **Tailwind** | **3.4 + PostCSS** | `08` and the build prompts are written against v3 classes and config |
| Expo SDK | 54 | Metro on 8081 |
| FastAPI | 0.110.0 | Pydantic 2 native |
| Uvicorn | 0.29.0 | `[standard]` extras |
| SQLAlchemy | 2.0.27 | 2.0 declarative style |
| Alembic | 1.13.1 | Emits CHECK constraints, which `create_all` cannot |
| Pydantic | 2.6.4 | With `pydantic-settings` 2.2 for config |
| **bcrypt** | **4.0.1** | 4.1 removed `__about__`, which passlib 1.7.4 reads |
| **numpy** | **1.26.4** | PaddlePaddle 2.6 is not built against NumPy 2.x |
| PaddlePaddle | 2.6.1 | The engine PaddleOCR needs |
| PaddleOCR | 2.8.1 | `show_log` removed here; the code probes for it |
| OpenCV | 4.9.0.80 headless | No GUI libs, no `libGL` failure |
| Tesseract | 5.x + `hin` data | Fallback OCR |
| ReportLab | 4.1.0 | PDF |
| python-docx | 1.1.2 | Word |
| PostgreSQL | 15+ | Production |

---

## 14. VERIFICATION CHECKLIST

Work down this list in order; each line assumes the ones above it passed.

- [ ] `node -v` → v18+ · `python --version` → 3.10 or 3.11 (**not** 3.12)
- [ ] `tesseract --version` → 5.x · `python -c "import cv2"` → no `libGL` error · `python -c "from pyzbar import pyzbar"` → clean
- [ ] `pip install -r requirements.txt` completes with no resolver conflict
- [ ] `python -c "import paddle, paddleocr; print('ok')"` → `ok` (this is the pin that catches NumPy 2.x)
- [ ] `alembic upgrade head` succeeds and `alembic current` shows the head revision
- [ ] `uvicorn main:app --host 0.0.0.0 --port 8000` → serving on `0.0.0.0:8000`
- [ ] `curl localhost:8000/health` → **`checks_registered: 19`**
- [ ] `http://localhost:8000/docs` → Swagger lists `/auth/login`, `/inspections`, `/scans`, `/admin/dashboard`
- [ ] Login through Swagger with a seeded `@example.test` account returns an access token
- [ ] `npm run dev` in the portal → `localhost:5173`, login screen asks for an **Employee ID**
- [ ] Portal login succeeds and DevTools → Application shows **no token in localStorage or sessionStorage**
- [ ] `npx expo start` → QR at `exp://<LAN-IP>:**8081**`, Expo Go loads the login screen
- [ ] Expo login succeeds against `http://<LAN-IP>:8000` (not `localhost`)
- [ ] Scan one package end to end → **19 findings rows** and a stated denominator
- [ ] Scan one deliberately unreadable package → stored, `not_assessed`, reasons present, **no 4xx**
- [ ] `GET /scans/{id}/verify` → `all_intact: true`
- [ ] `pytest -q` passes · `npm run test` passes

---

## 15. CORRECTIONS LOG — what version 2.1 got wrong

| # | Where | Defect | Now |
|---|---|---|---|
| 1 | §2 | "Tailwind 3.4" installed via `@tailwindcss/vite`, which is the v4 plugin, alongside a v3 `content` array — no combination builds | §2.1, Tailwind 3.4 + PostCSS written out in full |
| 2 | §3 | `exp://LAN_IP:19000` in two places — the Expo *classic* port | 8081, with the reason |
| 3 | §3 | `expo-image-picker` installed, then "disabled for Inspector per anti-fraud" | Not installed at all; §3.2 |
| 4 | §3 | `AsyncStorage.setItem('token', jwt)` — unencrypted, backed up | `expo-secure-store`; §3.3 |
| 5 | §2 | "Bearer token from localStorage" in the portal | Module-scoped variable; §2.2 |
| 6 | §4 | `allow_origins=["exp://*","http://192.168.*.*:19000"]` — exact-match list, so it allowed nothing | `allow_origin_regex`; §4.1 |
| 7 | §4, §9 | JWT "exp 24h", stated twice | 12-hour access + 30-day refresh, `token_type` checked |
| 8 | §4 | requirements.txt missing `paddlepaddle`, `pytesseract`, `imagehash`, `Pillow`, `pyzbar`, `ultralytics`, `alembic`, `pydantic-settings`, `cachetools`, `cryptography`, `httpx` | §4.3, complete |
| 9 | §4 | No `bcrypt` pin against `passlib==1.7.4` | `bcrypt==4.0.1`, with the reason |
| 10 | §4 | No `numpy` pin; paddle 2.6 breaks on NumPy 2.x | `numpy==1.26.4` |
| 11 | §1 | No system packages listed at all — tesseract, zbar and libGL all fail at import | §1.1, three platforms |
| 12 | §1, §13 | "Python 3.10+" with no upper bound; 3.12 has no paddle wheel | 3.10 or 3.11, stated |
| 13 | §4, §10 | `admin@niyamnetra.gov.in` / `123456` in two places | `@example.test`, generated passwords |
| 14 | §8 | `https://verify.niyamnetra.gov.in/{hash}` — a domain the team cannot register | `PUBLIC_BASE_URL` from config (localhost default, `https` real host in prod) |
| 15 | §7 | MinIO listed as optional S3-style storage | Removed; §0.1 |
| 16 | §11 | Supabase and Cloudinary as hosting options | Removed; §11 |
| 17 | §5 | "if blur<100 reject" | Measured and recorded as `not_assessed`; §5.4 |
| 18 | §7 | "compress 5MB->800KB" | Prohibited — breaks the hash and the measurement; §7.2 |
| 19 | §5 | Pipeline computed preprocessing then called `ocr.ocr(image_path)` | Pass the array; §5.3 |
| 20 | §5 | Net-quantity regex `(g|kg|ml|l|N|U)` treats counts as SI | Separate `COUNT` pattern → L-06; §5.5 |
| 21 | §6 | JSON rule files with per-field `regex` and hard-coded `violation_tier: improvement_notice` | Python check functions; tier derived from the findings set; §6 |
| 22 | §6, §12 | `status Passed/Violation/NA/Review`, "18 checks", "Good packet / Bad packet" | Three verdicts, four results, 19 rows |
| 23 | §4, §5 | No `alembic`; schema implicitly created by `create_all`, which cannot emit CHECK constraints | `alembic upgrade head`, stated as mandatory |
| 24 | §7 | No SQLite pragma listener, so foreign keys were off on every pooled connection | §7.1 |
| 25 | §8 | Disclaimer hard-coded "as on 7 May 2026" and claimed "not FSSAI/MDR 2017" | Reads `rules_as_at`; corrected scope wording |
| 26 | §8 | QR pointed at `niyamnetra://` — dead on any phone without the app | `https` URL with the chain head |
| 27 | §10 | Pytest "(Optional)", `tests/test_rules.py`, and a required Postman collection that never existed | Suite required, filenames per `Backend.md` §1.1, Swagger replaces Postman |
| 28 | §4 | `opencv-python` on servers with no GUI libraries | `opencv-python-headless` |
| 29 | §2 | No `idb` for the offline queue despite the PWA claim | `idb@8` listed |
| 30 | §14 | Checklist ended at "ReportLab imports OK" | Ends at 19 registered checks, an unreadable-package path, and both test suites |

---

*End of Tech Stack v3.0. Install commands here must agree with `14_env_example.md`; the code these packages support is specified in `Backend.md` and `Frontend_Portal_Prompts.md`.*
