# NiyamNetra — App Build Prompts

### Smart India Hackathon 2026 · SIH26034 · Expo (React Native) app for inspectors and admins

**Version:** 1.0 | **Date:** 30 Aug 2026 | **Rules as at:** 2026-07-01
**Path:** C:\Skills\Projects\NiyamNetra\Docs\Frontend_App_prompts.md
**Scope:** Build prompts for the Expo mobile app only — the companion to `Frontend_Portal_Prompts.md`. No backend, no web portal. The app is packaged as an Android APK with EAS Build and talks to the **same** FastAPI backend as the portal, over the LAN.

---

## HOW TO USE THIS FILE

Paste one prompt at a time into your code tool. Each prompt is self-contained except for its visual specification, which it points at by section number.

**`08_UI_DESIGN.md` is authoritative for every colour, size, icon, string and state** — §5 for the app specifically, and §2 and §3 for the shared component library. This file carries no hex codes and no pixel values. If a value you need is not in `08`, stop and ask rather than inventing one.

**`Backend.md` is authoritative for every endpoint, request shape and response shape.** This app is a client of the same API the portal uses; it defines no new endpoints.

Five facts to hold throughout, because getting any of them wrong makes the build unusable:

1. **A check has three verdicts** — `pass`, `fail`, `not_assessed` — and `not_assessed` always carries a reason string shown in the row, never hidden. **A scan has four results** — `compliant`, `violation`, `not_assessed`, `out_of_scope`. Any tab, filter, chart or type that offers only two states is wrong. The user-facing words map as: *Good → Compliant / Pass*, *Bad → Violation*; the two states the word "Good/Bad" hides — `not_assessed` and `out_of_scope` — must still be reachable and counted.
2. **The engine runs 18 checks, `CHK01`–`CHK18`, plus sub-check `CHK06b` — nineteen rows.** A phone camera scan runs only **16 of 18**: `CHK15` and `CHK16` assess a web listing and a platform, which a package photo cannot. Every findings view states its denominator ("16 of 18 checks — package scan").
3. **The app has two roles, chosen by the account at login — not a selector.** The login response carries the role; the app renders the inspector navigator or the admin navigator from it. There is no "pick your role" screen: that would be an authorisation input the user controls. Every admin endpoint is enforced server-side and the app must behave correctly when a call it thought was permitted returns `403`.
4. **The token is bound to the install.** Login sends a server-issued `install_id`; the access token carries it as a claim and the server rejects a token presented from a different install. A token minted on the portal does not work in the app — the officer logs in on each device. This is the control that makes a stolen token useless off its device; do not try to share a session between portal and app.
5. **`EXPO_PUBLIC_API_BASE_URL` is inlined into the APK at build time.** A LAN IP baked into the APK only works on that LAN. For the hackathon demo that is fine — phone and laptop share one Wi-Fi — but never put a secret there, only a URL (see `14_env_example.md` §1).

---

## PROMPT 1 — PROJECT SETUP

Create an Expo (SDK 54) app and install the approved stack. Nothing outside this list may be added without a decision recorded in `07_Tech_Stack.md`.

```bash
npx create-expo-app@latest niyamnetra-app --template blank
cd niyamnetra-app
npx expo install expo-camera expo-location expo-secure-store expo-file-system expo-screen-capture expo-local-authentication
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs axios date-fns
npx expo install react-native-screens react-native-safe-area-context
```

- `expo-secure-store` holds the `install_id` and the refresh token, backed by the Android Keystore. Never `AsyncStorage` for either — `AsyncStorage` is plain, readable in a filesystem backup.
- `expo-file-system` holds queued evidence images, referenced by path. Images are **never** base64-encoded into a key-value store; that has a small quota and corrupts the queue on overflow (`09_SECURITY.md` §7).
- `expo-screen-capture` disables screenshots on evidence screens; `expo-local-authentication` gates resume from lock with PIN or biometric.
- There is **no `expo-image-picker`** in the inspector build — not installed and disabled, but absent. Evidence is captured live. The single-use capture token that would let the server reject an album upload is deferred (`06_DATABASE.md` §10, `scan_images.capture_token`), so today the absence of the picker *is* the control.

**`.env`** — only `EXPO_PUBLIC_*` keys are exposed to the bundle, and they are inlined at build time, so they may contain URLs only:

```ini
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:8000
```

Set the value to your machine's **LAN IP**, never `localhost` — `localhost` on the phone is the phone. Find it with `ipconfig` (Windows) or `ifconfig | grep inet`. The backend listens on `8000` with `--host 0.0.0.0`; the Expo dev server is on `8081` (not 19000 — that was Expo classic, unused by SDK 54). Confirm the backend's `CORS_ORIGIN_REGEX` admits your `192.168.x.x` origin (`14_env_example.md` §3.4).

**`app.json`** — set `android.package` (e.g. `gov.niyamnetra.app`), the camera and location permission strings, and `orientation: "portrait"`. Declare the camera and fine-location permissions with human-readable purpose strings.

---

## PROMPT 2 — NAVIGATION, AUTH, INSTALL BINDING AND THE API CLIENT

### Token and install handling

- On first launch, read `install_id` from `expo-secure-store`. If absent, the device is not yet registered: the value is issued by the **server** at registration and returned to the app, then written to secure store. Never generate it on the client, and never use the IMEI or a device fingerprint (`09_SECURITY.md` §3.3).
- **Login** — `POST /auth/login {employee_id, password}` (request only; `install_id` is server-issued via `bind_install` and returned in the response, then persisted to secure store) returns a 12-hour access token in the body and a 30-day refresh token, both bound to this `install_id`. Hold the **access token in memory only** (a module-scoped variable inside an `AuthContext`); write the **refresh token to `expo-secure-store`**.
- On cold start, call `POST /auth/refresh` once with the stored refresh token; success rehydrates the session, failure routes to login. `/auth/refresh` rotates the token and checks `token_epoch` and `install_id` server-side.
- The access token is discarded on background or lock and re-derived from the refresh token on resume. `POST /auth/logout` clears server state; also wipe the in-memory token and the stored refresh token.
- Read the **role** from the decoded access token to choose which navigator to render. That is presentation, not access control.

### `src/api/client.js`

An axios instance on `EXPO_PUBLIC_API_BASE_URL`. A request interceptor attaches the in-memory bearer token and an `Idempotency-Key` header on writes. A response interceptor catches `401`, calls `/auth/refresh` **once** (a single shared in-flight promise so queued requests do not stampede), replays the original request, and on a second failure clears the session and routes to login. It must also handle `403` gracefully — render "not permitted", not a crash.

### Navigators

A root stack decides on auth state: `Login` when signed out; otherwise the **role's** navigator.

```text
Inspector (bottom tabs, per 08 §5)          Admin (bottom tabs — mobile companion)
  Scan            (default)                    Raids           (today's totals, default)
  Pass            (compliant scans)            Inspectors      (list · add · deactivate)
  Violations                                   Records         (all inspectors, store-wise)
  Reports         (today + calendar)           Reports         (date-wise · filter by inspector)
  More            (profile/lang/queue/logout)  More            (profile/lang/logout)
```

The inspector tab set and its five-tab requirement are fixed by `08_UI_DESIGN.md` §5. The admin tab set is the mobile companion to the portal's admin screens; build it from `08` §2/§3 shared components and the admin information architecture in `Frontend_Portal_Prompts.md`, and do not invent visual values. The admin navigator has **no Scan tab** — admins do not capture evidence, and there is no camera in the admin build.

---

## PROMPT 3 — LOGIN AND APP LOCK (shared)

Build `LoginScreen` per `08_UI_DESIGN.md` §5 and the shared form controls in §2/§3.

- Fields: **Employee ID** and password — never email. The employee number is what appears on the officer's identity card and on the paperwork (`05_SYSTEM_ARCHITECTURE.md` §7).
- There is **no register screen and no role picker** in the app. Accounts are provisioned by an admin; the role comes from the login response.
- Submit calls `POST /auth/login {employee_id, password}`. On the very first launch of an unregistered install, follow `Backend.md` §3 for how the server issues and returns the `install_id` via `bind_install`; persist it to `expo-secure-store` before storing tokens.
- Show a single generic error on failure ("Employee ID or password is incorrect"); never reveal which field was wrong. There is deliberately no client lockout — a lockout keyed on a named officer's ID is a denial-of-service against that officer; the server rate-limits per `employee_id` and per IP instead (`09_SECURITY.md`).

**App lock.** After a short idle period, and on every resume from background, gate the app behind `expo-local-authentication` (PIN or biometric). This is the control that matters when a phone is set down on a shop counter mid-inspection. On lock, drop the in-memory access token; on unlock, silently refresh. Enable `expo-screen-capture` prevention on every screen that shows evidence images or extracted values.

---

## PROMPT 4 — INSPECTOR: THE SCAN FLOW

Build the `Scan` tab as the full-screen capture flow of `08_UI_DESIGN.md` §4.3 and §5.

- **Camera** via `expo-camera`, with the guide overlay, the live quality strip (blur, glare, framing) and the panel-dimension step. There is **no gallery control** — capture is live only.
- **Capture** takes a burst of five frames and keeps the sharpest (highest Laplacian variance). Provide flash auto/on/off, retake, and a haptic tick on shutter. Capture the standard panels — front, back and the price/date panel — with a thumbnail row showing progress; each frame is written to `expo-file-system` and referenced by path.
- **The panel-dimension step is not optional.** Rule 7 font height cannot be assessed without the principal-display-panel area; the flow must collect it (measured or entered) or the font check reports `not_assessed` with that reason — it must never silently pass.
- **Capture token (deferred, honest).** Each capture *should* obtain a single-use capture token that the upload must present. The column and the offline challenge are deliberately deferred (`06_DATABASE.md` §10), so today the server does not enforce one; the reason no gallery import exists is the scope note in Prompt 3 — the picker is absent, and an absent source cannot feed the evidence chain.
- **GPS** is auto-filled from `expo-location` with a manual correction and a map pin, and the date is server time. If location permission is denied, record the reason and let the inspection proceed — do not block field work on a permission.
- **Duplicate check.** After extraction, the backend compares the image against earlier scans using the eight-band perceptual hash and the batch number, and returns a possible-duplicate flag. Surface it as a review prompt — "looks like a scan from earlier today" — that the officer can dismiss for a genuinely new batch. It is a review item, never an automatic verdict.

---

## PROMPT 5 — INSPECTOR: FINDINGS REVIEW AND SUBMIT

After upload, `POST /inspections/{id}/scans` returns the scan result and the findings. Build the review per `08_UI_DESIGN.md` §5 (compact 56 px rows) and §2.4 (the verdict badge).

- Render **all nineteen findings rows**. Each row carries an **icon and the word** — `pass`, `fail` or `not_assessed` — plus its colour; a coloured dot alone is prohibited (`08` §5). Each row shows the rule reference (for example "MRP missing — Rule 6(1)(e)"), a confidence badge and a tap-to-expand image crop.
- A `not_assessed` row always shows its reason string. The header states the denominator — "16 of 18 checks — package scan" — so a package scan is never mistaken for a full audit, and the two checks that need a web listing are shown as `not_assessed` for this source, not hidden.
- **Override.** The officer confirms or overrides each flagged item with a reason (a required dropdown plus free-text) and may attach an extra photo. The overall scan result (`compliant` / `violation` / `not_assessed` / `out_of_scope`) is derived from the findings after overrides.
- **Submit** posts the review to `POST /inspections/{id}/submit`; the submission and every override are written to the append-only audit ledger server-side. A sticky 48 px submit button is always reachable. If offline, submit enqueues locally (Prompt 7) rather than failing.

---

## PROMPT 6 — INSPECTOR: RECORDS, TODAY'S REPORT AND DATE-WISE VIEW

Build the `Pass`, `Violations` and `Reports` tabs and a reachable not-assessed list per `08_UI_DESIGN.md` §5 and the list/card components in §3.

- **Pass tab** — the inspector's `compliant` scans; **Violations tab** — their `violation` scans. Each item shows the product image thumbnail, the shop, the time, the result badge (icon + word) and, for a violation, the reason pills (for example "MRP missing — Rule 6(1)(e)"). Both are read-only. A `not_assessed` list is reachable from Reports or More — these scans are neither pass nor fail and must not be dropped from the counts.
- **Today's Report** — cards for **Stores Visited** and **Products Scanned**, the latter split by result (`compliant` / `violation` / `not_assessed`), with a store-wise breakdown beneath. Data comes from the backend's report endpoints (`Backend.md` §8, `06_DATABASE.md` §5); the stores count is `COUNT(DISTINCT store_id)` for the day, not a scan count.
- **Calendar picker (date-wise).** A calendar marks dates that have data with a dot; tapping a date shows that date's report in the same layout as Today. Presets for Today and Yesterday. This is the inspector's own history; the admin sees everyone's (Prompt 8).
- **Search and filter** by date and result across the inspector's own records.

---

## PROMPT 7 — OFFLINE QUEUE AND SYNC (inspector)

The field is where the network is worst, so capture must never depend on it. Build the queue per `09_SECURITY.md` §7.

- A scan captured offline is held locally with `is_synced = false`. Its images live on `expo-file-system` referenced by path — never base64 in a key-value store. Each queued record carries its **single-use capture token**, an **idempotency key**, and a **client timestamp claim** so the server can record when the capture actually happened.
- A visible **offline indicator** and a **queue badge** (count pending) live in the header and the More tab. The inspector always knows what has not yet reached the server.
- **Sync** runs automatically when connectivity returns, in batches, throttled, **violations first** so the highest-value evidence lands soonest. Each record is posted with its idempotency key, so a retry after a half-succeeded upload does not create a duplicate.
- **Conflict handling is not "server wins."** Version 1.x discarded field work by letting the server overwrite the queued record; a submitted inspection is the officer's attested work and must survive. On conflict, keep the field record and surface the divergence for review rather than silently dropping it.
- **Low-storage guard.** Below the configured free-space floor (`EVIDENCE_MIN_FREE_GB`, `14_env_example.md`), warn and stop accepting new captures rather than corrupting the queue.

---

## PROMPT 8 — ADMIN: THE MOBILE MONITORING MODULE

The admin navigator is a read-mostly companion to the desktop portal, for monitoring on the move. It has **no camera and no scan flow.** Build each screen from `08_UI_DESIGN.md` §2/§3 shared components and the admin information architecture in `Frontend_Portal_Prompts.md`; where `08` §5 does not yet specify an admin-app screen, follow the corresponding portal admin screen's layout and do not invent visual values.

- **Raids (default tab)** — today's totals across all inspectors: total stores raided and total products scanned, split by result (`compliant` / `violation` / `not_assessed`). Tapping a card drills into the contributing records.
- **Inspectors** — the list of inspectors with active/inactive state; add a new inspector (create the account and role server-side) and deactivate one. If an inspector has requested a new `install_id` (a device change), that request appears here for **admin approval** — this is the control that turns credential sharing into a visible event (`09_SECURITY.md` §3.3).
- **Filter by inspector** — a typeahead on inspector name that scopes every list and report below to that inspector.
- **Records** — all inspectors' `compliant` / `violation` / `not_assessed` scans, grouped **store-wise**, each item read-only with image, shop, inspector, time, result badge and reasons.
- **Reports (date-wise)** — a calendar picker with data dots covering all inspectors, showing the selected date's totals with the store-wise breakdown, combinable with the inspector filter.
- **Export / share** — a report can be shared as PDF or CSV via the OS share sheet, pulling the file the backend generates (`Backend.md` §8). No new report format is defined here.
- Every admin call is server-enforced; a `403` renders as "not permitted", and no admin control is trusted client-side.

---

## PROMPT 9 — SHARED: THE "MORE" TAB, LANGUAGE AND ACCESSIBILITY

The fifth tab is not optional; without it the app has no route to profile, language, the sync queue or logout (`08_UI_DESIGN.md` §5).

- **More** carries: the signed-in officer's profile (name, employee ID, role, area — read-only), the language toggle, the sync queue (inspector) with pending count and a manual "sync now", and logout.
- **Language.** English and Hindi. Load **Noto Sans Devanagari** for Hindi — plain Noto Sans is a Latin family and will not render Devanagari. Every statutory string, rule reference and disclaimer must render legibly in both.
- **Accessibility.** Verdict badges expose the **word**, not the colour; every form control is labelled; the findings list is a proper table with headers; live regions announce capture-quality changes and sync-state changes. Text must stay legible on a sunlit phone — honour the contrast tokens in `08` §2.1 and never use the low-contrast greys for statutory text.

---

## PROMPT 10 — BUILD THE ANDROID APK WITH EAS

Package the app as an installable APK with EAS Build.

```bash
npm install -g eas-cli
eas login
eas build:configure
# eas.json — add a "preview" profile that emits an APK (not an AAB):
#   { "build": { "preview": { "android": { "buildType": "apk" },
#     "env": { "EXPO_PUBLIC_API_BASE_URL": "http://<reachable-host>:8000" } } } }
eas build -p android --profile preview
```

- **`EXPO_PUBLIC_API_BASE_URL` is inlined at build time.** An APK built with a `192.168.x.x` address only reaches the backend on that same Wi-Fi. That is correct for a demo where phone and laptop share a network; for an APK that must work elsewhere, build it against a host the phone can actually reach (a tunnel, a LAN-stable address, or a deployed backend) and add that origin to the backend's `CORS_ORIGIN_REGEX`.
- HTTP (not HTTPS) to a LAN IP requires Android cleartext to be permitted for that host; scope it to the demo host in `app.json` rather than enabling cleartext globally. In production the backend is HTTPS and this does not arise.
- The camera, secure store, file system, screen-capture block and local-auth all require a real build (a development build or the APK) — they do not all work in a bare Expo Go session. Test the capture and offline paths on the APK, not only in Expo Go.
- The offline model still holds on the APK: a scan captured with no network queues locally and syncs when the backend is reachable again.

---

## WHAT THIS DOCUMENT ADDS

This is a new document (v1.0), the app-side companion to `Frontend_Portal_Prompts.md`. Two things here extend the earlier canon deliberately, and the rest of the set has been reconciled to match:

- **The app now serves both roles.** Earlier drafts described the Expo app as inspector-only. This document adds an admin **mobile monitoring module** (Prompt 8) — read-mostly, no camera — as a companion to the desktop portal, and `01`, `04`, `05` and `README.md` now describe the app as dual-role, selected by the account at login.
- **"Good/Bad" is mapped, not adopted.** The request framed records as Good/Bad; this document holds the canonical vocabulary — three check verdicts and four scan results — and maps Good→compliant/pass and Bad→violation, while keeping `not_assessed` and `out_of_scope` visible and counted. A two-state model would let unassessable scans silently inflate the compliant count.

Everything visual defers to `08_UI_DESIGN.md`; every endpoint defers to `Backend.md`. Where this file disagrees with either, that file wins and this one is the one to correct.

---

**End of App Build Prompts.** Companion documents: `08_UI_DESIGN.md` for every visual decision (§5 for the app), `Backend.md` for the API this app consumes, `Frontend_Portal_Prompts.md` for the web portal, `09_SECURITY.md` for the token, install-binding and offline-queue rules, and `README.md` for the run model.
