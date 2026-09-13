# NiyamNetra — Production Deployment Guide

**Version:** 2.0  
**Date:** September 2026  
**Audience:** DevOps Engineers, System Administrators, Hackathon Evaluators  
**Applies to:** Backend (FastAPI), Frontend Portal (React/Vite), Frontend Mobile App (Expo/React Native), and Supabase Infrastructure.

---

## 1. System Architecture & Production Topology

NiyamNetra is architected as a lightweight, cloud-ready, zero-Docker deployment designed to run efficiently on free/entry-tier cloud services (Render, Vercel, Supabase) while sustaining full offline-first field capability for enforcement officers.

```
                  +-------------------------------------------------------+
                  |                 Cloud Infrastructure                  |
                  |                                                       |
+--------------+  |  +--------------------+        +--------------------+ |
|   Field App  |---->|   FastAPI Backend  |------->| Supabase PostgreSQL| |
|  (Android    |  |  |  (Render Free/Paid)|        |   (Session Pooler) | |
|   Expo APK)  |  |  |                    |        +--------------------+ |
+--------------+  |  |  - Python 3.11     |                  |            |
                  |  |  - 19 Rules Checks |        +--------------------+ |
+--------------+  |  |  - Cloud OCR Fallbk|------->|  Supabase Storage  | |
| Web Portal   |---->|  - Audit Ledger    |        | (Evidence Bucket)  | |
|  (Vercel SPA)|  |  +--------------------+        +--------------------+ |
+--------------+  |           |                                           |
                  |           v                                           |
                  |  +--------------------+                               |
                  |  | Vision / OCR APIs  |                               |
                  |  | (Google / OCR.space|                               |
                  |  +--------------------+                               |
                  +-------------------------------------------------------+
```

| Tier | Technology | Hosting Target | Primary Artifact / Port |
| :--- | :--- | :--- | :--- |
| **Backend** | FastAPI + SQLAlchemy 2.0 | Render (Web Service) | `uvicorn main:app --port $PORT` |
| **Database** | PostgreSQL 15+ | Supabase (AWS Pooler) | Port `5432` (Session Mode) |
| **Storage** | Object Storage S3-compatible | Supabase Storage | Bucket: `NiyamNetra_Images` |
| **Web Portal** | React 18 + Vite 5 + Tailwind CSS | Vercel (Edge Network) | Static SPA (`dist/`) |
| **Mobile App** | React Native + Expo SDK 54 | Android APK (EAS Build) | Standalone APK |

---

## 2. Prerequisites & Credentials Checklist

Before deploying, ensure you have the following credentials and tools ready:

### Accounts & Services
- [x] **Supabase Project**: Database connection URI and Service Role API Key.
- [x] **Render Account**: Connected to your Git repository.
- [x] **Vercel Account**: Connected to your Git repository.
- [x] **Expo / EAS Account**: For compiling the mobile Android APK (`npm install -g eas-cli`).
- [x] **Cloud OCR Key** *(Recommended for Render 512MB RAM tier)*:
  - Google Cloud Vision API Key (recommended: 1,000 free scans/mo), OR
  - OCR.space Free API Key (free tier: 25,000 requests/mo).

---

## 3. Database Setup & Initialization (Supabase)

### 3.1 Critical IPv4 Pooler Configuration
> [!CAUTION]
> **Supabase Direct Connection Pitfall**:  
> Supabase direct host (`db.<project-ref>.supabase.co:5432`) resolves **exclusively over IPv6**. Standard container hosts (like Render free tier) communicate over IPv4 only. Attempting to use the direct host on Render will trigger `psycopg.OperationalError: connection failed: Network is unreachable`.

**Always use the Supabase IPv4 Pooler host**:
```
postgresql+psycopg://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```
- **Port 5432 (Session Mode)**: **Required**. Supports prepared statements used by `psycopg3`.
- **Port 6543 (Transaction Mode)**: Do **not** use port 6543, as pgbouncer transaction pooling rejects named prepared statements.

### 3.2 Storage Bucket Setup
1. In the Supabase Dashboard, navigate to **Storage**.
2. Create a bucket named: `NiyamNetra_Images`.
3. Set public access or ensure the service role key has read/write permissions.

### 3.3 Running Migrations & Seeding
From your development workstation or CI/CD runner:

```bash
cd Backend
# Activate virtual environment
source venv/bin/activate  # Or: .\venv\Scripts\activate on Windows

# 1. Apply Alembic schema migrations (creates tables, CHECK constraints, audit triggers)
alembic upgrade head

# 2. Seed clean production base data (Roles, Admin, Sample Inspectors, Sample Stores)
python seed.py --base
```

#### Seeding Modes:
- `python seed.py --base` (**Production Mode**): Creates official system users (`LM-ADM-001`, `LM-TG-1042`, etc.) and real-world sample store locations in Telangana and Delhi. Does **not** insert any mock inspections, fake violations, or dummy audit rows.
- `python seed.py` (**Demonstration Mode**): Inserts the base data plus pre-recorded mock inspections and violations across major brands for hackathon demonstration.

---

## 4. Backend Deployment (Render)

The repository provides a complete Render Blueprint configuration at the root: [`render.yaml`](file:///c:/Skills/Projects/NiyamNetra/render.yaml).

### 4.1 Deployment via Blueprint (Recommended)
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New** &rarr; **Blueprint**.
3. Connect the `NiyamNetra` repository.
4. Render detects `render.yaml` and populates the service configuration automatically.
5. In the Environment Variables prompt, supply the uncommitted secrets:
   - `DATABASE_URL`: Your Supabase IPv4 Session Pooler URI.
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_KEY`: Your Supabase Service Role Key.
   - `PUBLIC_BASE_URL`: `https://niyamnetra-backend.onrender.com` (update after initial service creation).
   - `CORS_ORIGIN_REGEX_PROD`: `^https://.*\.vercel\.app$` (or your custom domain).
   - `GOOGLE_VISION_API_KEY` or `OCR_SPACE_API_KEY`: Cloud OCR key.
6. Click **Apply**.

### 4.2 Manual Web Service Configuration
If configuring manually via the Render UI:
- **Service Type**: Web Service
- **Environment**: Python
- **Root Directory**: `Backend`
- **Build Command**: `pip install -r requirements-render.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path**: `/health`
- **Plan**: Free (512MB RAM) or Starter (1GB RAM)

### 4.3 Key Environment Variables Reference

| Variable | Recommended Production Value | Purpose |
| :--- | :--- | :--- |
| `ENV` | `prod` | Activates secure SameSite=None cookies and strict CORS. |
| `DATABASE_URL` | `postgresql+psycopg://...:5432/postgres` | Supabase IPv4 session pooler connection. |
| `JWT_SECRET` | *Generated 64-char hex* | Signing key for auth access & refresh tokens. |
| `PUBLIC_BASE_URL` | `https://niyamnetra-backend.onrender.com` | Base URL used for report verification QR codes. |
| `CORS_ORIGIN_REGEX_PROD` | `^https://.*\.vercel\.app$` | Restricts browser origins in production. |
| `OCR_PROVIDER` | `auto` | Cascades: Google Vision &rarr; OCR.space &rarr; local. |
| `DISABLE_PADDLE` | `1` | Disables heavy 1.5GB PaddleOCR memory overhead on 512MB containers. |
| `SUPABASE_BUCKET` | `NiyamNetra_Images` | Bucket name for evidence image mirror. |

### 4.4 Health Verification
Once deployed, verify the service in terminal:
```bash
curl -s https://niyamnetra-backend.onrender.com/health
```
Expected response:
```json
{"status":"ok","checks_registered":19}
```

---

## 5. Web Portal Deployment (Vercel)

The Web Portal is configured at the root via [`vercel.json`](file:///c:/Skills/Projects/NiyamNetra/vercel.json).

### 5.1 Root Configuration
```json
{
  "buildCommand": "cd Frontend_Portal && npm run build",
  "outputDirectory": "Frontend_Portal/dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 5.2 Deploying via Vercel Dashboard
1. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
2. Import the `NiyamNetra` repository.
3. Keep **Root Directory** as `./` (the root `vercel.json` coordinates the build).
4. In **Environment Variables**, configure:
   - `VITE_API_BASE_URL`: `https://niyamnetra-backend.onrender.com`
5. Click **Deploy**.

### 5.3 Verifying Local Build
Before pushing to Git, verify that the frontend builds cleanly without errors:
```bash
cd Frontend_Portal
npm run build
```
The output should compile into `Frontend_Portal/dist/` in under 10 seconds with 0 errors.

---

## 6. Mobile Field App Deployment (Expo & EAS)

The mobile application is built with Expo SDK 54 and can be compiled into a standalone Android APK for distribution to field inspectors.

### 6.1 Configuration
1. Open [`Frontend_App/api/config.js`](file:///c:/Skills/Projects/NiyamNetra/Frontend_App/api/config.js):
   - Ensure `ACTIVE_BACKEND = 'render'`.
   - `RENDER_API_URL = 'https://niyamnetra-backend.onrender.com'`
2. Open [`Frontend_App/eas.json`](file:///c:/Skills/Projects/NiyamNetra/Frontend_App/eas.json):
   - The `preview` and `production` profiles are set to build standalone `.apk` packages:
   ```json
   "preview": {
     "distribution": "internal",
     "android": { "buildType": "apk" },
     "env": {
       "EXPO_PUBLIC_API_BASE_URL": "https://niyamnetra-backend.onrender.com"
     }
   }
   ```

### 6.2 Compiling the Android APK
Run EAS Build from terminal:
```bash
cd Frontend_App

# Login to Expo
npx eas login

# Build standalone Android APK
npx eas build -p android --profile preview
```
Once compilation finishes, EAS provides a direct download link and QR code to install the `.apk` on inspector devices.

### 6.3 Offline-First Queue & Sync Behavior
- **Reachability Check**: The app probes `GET /health` with a strict 4-second timeout. If unreachable or unacknowledged, it remains in offline mode.
- **Local SQLite Queue**: Completed inspections, scans, and captured evidence are saved locally on the device when offline.
- **Auto-Sync Loop**: When connectivity is restored, the `SyncProvider` flushes queued inspections to `POST /inspections` and `POST /scans/{id}/assess`.
- **Dead-Letter Handling**: If an inspection fails validation on sync, it is flagged in the dead-letter queue and an action button ("Retry failed") is displayed on the `SyncStrip` banner.

---

## 7. Production Verification & Go-Live Checklist

Complete this checklist prior to production go-live:

- [ ] **Backend Health**: `GET /health` returns `checks_registered: 19`.
- [ ] **Alembic Invariants**: Database tables, foreign keys, and CHECK constraints verified in Supabase SQL editor.
- [ ] **Storage Mirror**: Uploading a test scan saves the original image to `NiyamNetra_Images` in Supabase Storage with SHA-256 hash intact.
- [ ] **Clean Data**: Verify that `AdminDashboard` displays 0 for empty states, `—` for uncalculated metrics, and no mock banners or fake chips appear.
- [ ] **CORS Verification**: Portal running on Vercel (`https://niyamnetra-*.vercel.app`) can authenticate against Render backend with `withCredentials: true`.
- [ ] **Mobile Sign-In**: Inspector can authenticate with `LM-TG-1042` on mobile APK without demo prompt aids.
- [ ] **Evidence Integrity**: Audit trail logs every action with cryptographic hash chain (`hash_prev` &rarr; `hash_self`).
- [ ] **Statutory Reports**: Generated PDF/DOCX reports contain proper Legal Metrology 2011 citations, QR verification URLs pointing to `PUBLIC_BASE_URL`, and statutory disclaimers.

---

## 8. Operational Maintenance

### 8.1 JWT Secret Rotation
To invalidate all issued active sessions:
1. Generate a new secret: `python -c "import secrets; print(secrets.token_hex(32))"`.
2. Update `JWT_SECRET` in Render Environment Variables.
3. Service automatically restarts; all active inspectors and administrators must re-authenticate.

### 8.2 Rule Catalog Updates
When Department of Consumer Affairs issues new statutory notifications:
1. Add new version catalog in `Backend/rules/catalog_YYYY_MM_DD.json`.
2. Update `DEFAULT_RULE_VERSION` in `Backend/config.py`.
3. Historic inspections preserve their immutable rule version identifier (`rule_version_applied`), guaranteeing full legal auditability.
