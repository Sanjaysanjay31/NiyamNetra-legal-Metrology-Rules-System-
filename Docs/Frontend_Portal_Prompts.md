# NiyamNetra - Portal Build Prompts
### Smart India Hackathon 2026 - SIH26034 - React 18 + Vite 5 admin and inspector portal
**Version:** 2.0 | **Date:** 29 Aug 2026 | **Revised:** 30 Aug 2026
**Path:** C:\Skills\Projects\NiyamNetra\Docs\Frontend_Portal_Prompts.md
**Scope:** Build prompts for the web portal only. No backend, no Expo app.

---

## HOW TO USE THIS FILE

Paste one prompt at a time into your code tool. Each prompt is self-contained except for its visual specification, which it points at by section number.

**`08_UI_DESIGN.md` is authoritative for every colour, size, icon, string and state.** This file deliberately carries no hex codes and no pixel values. Version 1.0 duplicated them, drifted out of step, and ended up instructing the build tool to use six colours that fail the contrast standard the project claims to meet - including one line that told it to audit every screen *for* the non-compliant palette. Duplicated design values are worse than no design values, because the generator follows the concrete number over the reference.

So: **read the named section of `08_UI_DESIGN.md` and implement it exactly. Do not substitute values.** If a value you need is not in `08`, stop and ask rather than inventing one.

Two facts to hold throughout, because getting either wrong makes the build unusable:

**A check has three verdicts:** `pass`, `fail`, `not_assessed` - and `not_assessed` always carries a reason string that is displayed in the row, never hidden. **A scan has four results:** `compliant`, `violation`, `not_assessed`, `out_of_scope`. Any component, filter, chart, count or API type that offers only pass and fail is wrong. Version 1.0's dashboard showed four cards whose numbers summed exactly to the total, which is how unassessable scans silently inflate the compliant count.

**The engine runs 18 checks, CHK01 to CHK18, plus sub-check CHK06b - nineteen rows.** A package scan can only run 16 of the 18, because CHK15 and CHK16 need a web listing. Every findings view states its denominator.

---

## PROMPT 1 - PROJECT SETUP

Create a Vite React project and install the approved stack. Nothing outside this list may be added without a decision recorded in `07_Tech_Stack.md`.

```bash
npm create vite@latest niyamnetra-portal -- --template react
cd niyamnetra-portal
npm install react-router-dom@6 axios date-fns lucide-react recharts@2.12 idb@8
npm install -D tailwindcss@3.4 postcss autoprefixer vite-plugin-pwa
npx tailwindcss init -p
```

Tailwind is pinned to **3.4**, so the install is `tailwindcss postcss autoprefixer` with `npx tailwindcss init -p` and a `tailwind.config.js`. Do **not** install `@tailwindcss/vite` - that is the v4 plugin and v4 ignores `tailwind.config.js` by default. Version 1.0 specified 3.4 in one line and the v4 plugin in the next, which does not build.

`idb@8` is an explicit addition to the stack for the offline queue. Raw IndexedDB is workable but its callback API produces enough boilerplate to become its own defect surface; `idb` is a 1 kB promise wrapper with no transitive dependencies. Recorded here so the decision is traceable.

**`tailwind.config.js`:** define the semantic colour tokens by reading **`08_UI_DESIGN.md` §2.1** and transcribing that table. Every token there is accompanied by its measured contrast ratio. Transcribe the ratios into comments so a later edit cannot quietly regress one.

**`index.css`:** type scale from **§2.2**, spacing from **§2.3**. Load Inter, **Noto Sans Devanagari** (not plain Noto Sans, which is a Latin family and will not render Hindi) and JetBrains Mono. JetBrains Mono applies to every extracted value, hash and batch number, not only to price.

**`.env`:**

```ini
VITE_API_URL=http://localhost:8000
```

The backend listens on `8000` with `--host 0.0.0.0`; this portal runs on `5173`.

---

## PROMPT 2 - ROUTING, AUTH AND THE API CLIENT

### Token handling

**Do not put the access token in `localStorage`.** Version 1.0 did, in three separate places, and additionally read the user's *role* out of `localStorage` to decide what to render - an authorisation input taken from a store the user controls, readable by any injected script.

- The access token lives in **React state only**, inside an `AuthContext`. It does not survive a reload, and it does not need to.
- The refresh token is set by the backend as an **httpOnly, SameSite=Strict cookie** and is never visible to JavaScript.
- On mount, `AuthProvider` calls `POST /auth/refresh` once with `withCredentials: true`. Success rehydrates the session; failure routes to login. This is what replaces reading a token off disk.
- Access token lifetime is **12 hours**, refresh **30 days**. Do not hard-code either in the client; both come from the server.

The role *may* be read from the decoded access token to decide which navigation to render. That is a presentation choice and it is fine. It is not access control: every admin endpoint is enforced server-side, and the portal must behave correctly when a request it thought was permitted returns 403.

### `src/api/client.js`

Axios instance on `VITE_API_URL` with `withCredentials: true`. A request interceptor attaches the in-memory bearer token. A response interceptor catches `401`, calls `/auth/refresh` **once**, replays the original request, and on a second failure clears the context and routes to login. Guard against the refresh storm: a single in-flight refresh promise shared by all queued requests.

### Routes

```text
/login                       public
/inspector                   inspector home
/inspector/new               new inspection - scope gate first
/inspector/capture           camera capture
/inspector/review            findings review
/inspector/pass              pass list
/inspector/violations        violation list
/inspector/not-assessed      not-assessed list
/inspector/report            today's report
/admin                       dashboard
/admin/inspections           inspections list
/admin/inspections/:id       inspection detail
/admin/inspectors            manage inspectors
/admin/rules                 rule catalogue with verification status
/admin/audit                 audit log with chain verification
/admin/review                review queue
/admin/reports               reports
```

`/inspector/not-assessed`, `/admin/rules`, `/admin/audit` and `/admin/review` are the four routes version 1.0 omitted. Three of them were named in its own sidebar, so half the admin navigation would have rendered dead links.

`ProtectedRoute` takes a required role, reads the role from context, and renders a redirect when it does not match. `AdminRoute` wraps it.

**There is no registration route.** Accounts are created by an admin from `/admin/inspectors`. Version 1.0 shipped a public `/register` screen carrying a role dropdown that let the caller choose `Admin`, hidden by a client-side check - which is not a check.

**Files:** `main.jsx`, `App.jsx`, `context/AuthContext.jsx`, `api/client.js`, `api/endpoints.js`, `components/ProtectedRoute.jsx`, `components/AdminRoute.jsx`, `components/Layout.jsx`, `components/Sidebar.jsx`, `components/Header.jsx`.

Sidebar and header per **§3.5**. Note two things that section is specific about: the active-item fill measures 1.27:1 against the sidebar and therefore cannot carry the state on its own, so the border and the weight change do the work; and the header carries the **sync badge** alongside search, avatar, role and notifications.

---

## PROMPT 3 - LOGIN

Implement **`08_UI_DESIGN.md` §4.1** exactly. Five things in that section are corrections of version 1.0 and are easy to reintroduce by habit:

1. **No role selector.** The role is a property of the account, resolved from the token. Offering Inspector / Admin pills at the login screen advertises the privilege structure to anyone who loads the page, and a client-selected role is not RBAC.
2. **No statistics block.** Version 1.0 printed "1,200+ Inspections | 150+ Violations Caught" on the first screen a judge sees - a fabricated figure that invites the one question the team cannot answer. If a public statistics endpoint exists and returns data, render it with its scope label; if it returns nothing, omit the block.
3. **Demo credentials behind `import.meta.env.DEV`,** so they cannot ship, on `@example.test` addresses. Not `gov.in` - the project does not control that domain, and version 1.0's addresses were additionally misspelt `niyampatra`, so they would not have matched any seeded account.
4. **No shake animation on error.** Motion on error is a vestibular trigger and communicates nothing the text does not.
5. **The disclaimer text is the one in §4.1 verbatim.** Version 1.0's string conflated the Rules with an amending Act.

Include the one-time-code field for accounts with second-factor enabled, and "Remember this device" as a control distinct from "Remember me" - the first initiates the device-binding approval flow in §4.9, the second only persists the email.

**Files:** `pages/Login.jsx`, `components/OtpField.jsx`.

---

## PROMPT 4 - NEW INSPECTION

Implement **§4.2** exactly.

**The scope card comes first, before the establishment details,** because its answer can end the inspection immediately. The transaction type - retail, institutional, industrial, or packed in the purchaser's presence - decides whether Chapter II applies at all. Without this control the engine cannot run its scope gate, and every counter-weighed kilo of rice becomes a false violation. The out-of-scope path records the inspection with its reason and stops; it is a successful outcome, not an abandoned form.

The category dropdown carries **all fifteen** categories in §4.2, not the seven of version 1.0. The four that matter most for routing are cement, fertiliser and agricultural produce, which sit under a 50 kg rather than 25 kg threshold, and **medical device**, which routes the metrology checks to `not_assessed` under the 2025 proviso to Rule 2(h). A category list missing medical device means that routing can never fire.

GPS: display the **accuracy radius**, suppress the geofence test when accuracy is worse than 100 m rather than failing it, and where the fix falls outside the store's fence require a reason plus a photograph of the shop board, filed as `outside_with_justification`. Do **not** offer free-text coordinate entry - version 1.0's "manual correct allowed" lets an inspector type any location and leaves no audit path.

Date is the **server** date. An admin may amend it, and the amendment requires a reason and is written to the audit log.

**Files:** `pages/NewInspection.jsx`, `components/ScopeCard.jsx`, `components/GpsField.jsx`, `components/CategorySelect.jsx`.

---

## PROMPT 5 - CAMERA CAPTURE

Implement **§4.3** exactly. Four points carry more weight than the rest:

**There is no gallery control in the inspector build - absent, not disabled.** Version 1.0 rendered a greyed button with a tooltip explaining the anti-fraud rule, which is one devtools toggle from enabled and advertises the bypass in the tooltip. The portal captures through the live camera (`getUserMedia`) with no file input anywhere, and the app ships without `expo-image-picker`. The server-side capture token that would let the backend reject an upload from an album is deferred with `scan_images.capture_token` (`06_DATABASE.md` §10) - so today the control is the UI, and the UI must make album import impossible, not inconvenient.

**Advance requires front and back,** not front and price. A required declaration may lawfully sit on either panel, so a missing-declaration finding may only be asserted from a capture proven complete.

**The panel-dimension step is mandatory and it is not optional UI polish.** Paired millimetre inputs for panel height and width, plus a shape selector - rectangular, cylindrical, other - because Rule 7(4) computes the principal display panel area differently for each, and because pixels cannot become millimetres without a scale. Version 1.0 had no dimension field anywhere while charting "font size" violations, which is a claim with nothing behind it.

**The live quality strip needs all its thresholds,** including the two version 1.0 omitted: panel height under 400 px ("move closer - text too small to measure") and mean luminance under 50 ("too dark - flash on"). Saying this during capture is far cheaper than returning `not_assessed` afterwards. Use the exact threshold table in §4.3; do not invent numbers, and do not seize the camera with a countdown modal.

**Files:** `pages/CameraCapture.jsx`, `components/QualityStrip.jsx`, `components/PanelDimensions.jsx`, `components/CaptureGuide.jsx`, `components/PanelProgress.jsx`.

---

## PROMPT 6 - FINDINGS REVIEW

Implement **§4.4** and the finding row in **§3.2** exactly. This is the primary decision surface in the product and version 1.0 got the arithmetic of it wrong in four ways:

- **Nineteen rows, not "6-9".** Grouped under Scope, Presence, Content and Metrology, in the order the law applies them, with short-circuited rows collapsed and each carrying its reason.
- **Four counts in the summary strip,** not three: pass, violation, review, **not assessed**.
- **A stated denominator** in the header - "16 of 18 checks - package scan" - so a 16-check scan cannot read as a complete assessment.
- **Every row shows its `CHK` identifier,** which is also the key into the message catalogue in §6.

Verdict badges carry **icon plus word plus colour**, never colour alone: `CheckCircle`, `XCircle`, `Clock`, `HelpCircle`. `AlertTriangle` is reserved for system warnings and must not appear on a verdict. Verify by rendering the list in greyscale - every verdict must remain identifiable.

The override control offers all three verdicts including `not_assessed`, requires a written reason **in either direction**, keeps the engine's original verdict on the record beside the officer's, and writes the change to the audit log. Version 1.0 required a reason only when overriding to violation, so an officer clearing a genuine finding left no trace.

Where every assessed check passed, the message is "All **assessed** declarations compliant" followed immediately by the count that could not be assessed and a pointer to their reasons. Congratulating the officer while five checks are unresolved is how a false assurance reaches a report.

Submit gate: where a violation is present, submit additionally requires two images and the representative's signature or a recorded refusal. No select-all.

**Files:** `pages/FindingsReview.jsx`, `components/FindingRow.jsx`, `components/VerdictBadge.jsx`, `components/ConfidenceBadge.jsx`, `components/OverrideDialog.jsx`, `components/PhaseGroup.jsx`.

Confidence bands per **§3.4**: three bands, and the lowest is labelled "low confidence" rather than mapped onto a verdict, because a low-confidence reading is a warning about the photograph, not about the pack.

---

## PROMPT 7 - RESULT LISTS

Three lists sharing one component: pass, violation, **not assessed**. Implement the record card in **§3.2** and the list behaviour in **§4.5**.

Call them what §4.5 calls them - "Pass" and "Violations". Version 1.0 called them "Good" and "Bad Records", which attaches a moral judgement about a shopkeeper to an OCR result.

Filters include all four result states. Empty states per **§8** - and note specifically that the violations empty state uses a neutral `CheckCircle` with "No violations recorded today", not version 1.0's red `AlertTriangle` on "No violations - Great job!". A danger icon on a neutral outcome trains the officer to ignore the icon that matters, and congratulating them for finding nothing rewards the wrong thing.

Repeat instances display as "2nd instance recorded in this system", per §4.5, rather than as a statutory penalty tier - because the tier depends on the person's full history and not only on what this system has seen.

**Files:** `pages/ResultList.jsx`, `components/RecordCard.jsx`, `components/ResultFilter.jsx`, `components/EmptyState.jsx`.

---

## PROMPT 8 - TODAY'S REPORT

Implement **§4.6**. Stat cards per **§3.2**, date picker per **§3.3** - 44 px minimum on every cell and control, which resolves version 1.0's 36 px calendar cells and 40 px inputs against its own "≥48px" claim.

Counts are four-state. Trends appear **only** where a prior period exists with data - never a placeholder percentage. Progress bars appear only where a denominator is defined; version 1.0 drew bars at 60% and 66% of nothing, which implies a quota the inspector is being measured against.

Calendar dots per §4.6: green where all assessed checks passed, the violation colour where any violation exists, and the review colour where scans could not be assessed. No bisected half-green half-red dot - a 6 px dot split by hue on the red-green axis is unreadable for the most common form of colour blindness.

**Files:** `pages/TodaysReport.jsx`, `components/StatCard.jsx`, `components/StoreBreakdown.jsx`, `components/InspectionCalendar.jsx`.

**API:** `GET /reports/today?date=YYYY-MM-DD` →

```json
{
  "stores_visited": 5,
  "scans": { "total": 18, "compliant": 9, "violation": 4,
             "not_assessed": 3, "out_of_scope": 2 },
  "checks": { "assessed": 268, "total": 288 },
  "stores": [ { "store_id": 1, "store_name": "...", "scans": 6,
                "compliant": 3, "violation": 2, "not_assessed": 1,
                "first_scan": "...", "last_scan": "..." } ]
}
```

---

## PROMPT 9 - ADMIN DASHBOARD

Implement **§4.7**. **Five cards, not four:** total inspections, compliant, violations, under review, and **not assessed**. Version 1.0 had four, and its own sample numbers summed exactly to the total - the demonstration of the defect, since unassessable scans had nowhere to go but into one of the other counts.

Charts: the series colours in §4.7 are the ones that clear 3:1, and **every bar is also labelled** so the chart is readable without colour. Every chart states its date range and record count in a caption - an unlabelled chart is not evidence.

Include the chart §4.7 calls for that version 1.0 did not have: **which checks most often could not be assessed**. It is the single most useful diagnostic the system produces, because it says where capture guidance must improve.

Repeat-violator handling per §4.7: where a prior record exists within 50 m under a different proprietor name, surface the note. Never auto-merge - a genuine change of ownership is lawful and common.

Tables: hover only, no striping. Version 1.0 set the hover colour and the odd-row stripe to the same value, so hovering half the rows did nothing.

**API:** `GET /admin/dashboard/stats?period=week` →

```json
{
  "total": 1248, "compliant": 812, "violation": 298,
  "under_review": 58, "not_assessed": 80,
  "checks_assessed": 21400, "checks_total": 22464,
  "violations_by_check": [ { "check_id": "CHK04", "title": "...", "count": 45 } ],
  "not_assessed_by_check": [ { "check_id": "CHK06", "reason": "...", "count": 61 } ],
  "trends": [ { "date": "2026-08-24", "total": 40, "violation": 9 } ],
  "recent": [ ]
}
```

`not_assessed` is a required key. Version 1.0's contract omitted it, which made the fifth card unbuildable regardless of the design.

**Files:** `pages/AdminDashboard.jsx`, `components/ViolationChart.jsx`, `components/NotAssessedChart.jsx`, `components/TrendChart.jsx`, `components/ChartCaption.jsx`.

---

## PROMPT 10 - INSPECTIONS LIST AND DETAIL

Implement **§4.8**.

Status filters carry four states. The rule-version tag is a **date** - "Rules as at 2026-08-30" - not "v2017"; the amendments are cumulative, so no single version label describes a real scan. Where the pack's printed manufacture date precedes an amendment that was in force at inspection, show the inline note in §4.8, because the selling offence is judged on the sale date.

Evidence integrity per §4.8: each image shows its abbreviated SHA256 with a re-verify action, and on mismatch the image is **replaced** by the mismatch panel with its exact wording, plus an alert. An integrity check whose failure is easy to miss is not an integrity check.

**Files:** `pages/InspectionsList.jsx`, `pages/InspectionDetail.jsx`, `components/EvidenceCarousel.jsx`, `components/HashVerify.jsx`, `components/AuditTimeline.jsx`, `components/ExtractedFieldsTable.jsx`.

The extracted-fields table column is `provision`, and where a citation is unverified it prints the descriptive requirement instead of a pinpoint reference. Every legal reference in this portal flows from the rule catalogue and its verification flag - the portal never hard-codes a provision number in a component. A shopkeeper handed a notice citing the wrong provision has a complete defence, which is why this is a build rule and not a preference.

---

## PROMPT 11 - MANAGE INSPECTORS

Implement **§4.9**. Version 1.0 had a thin version of this screen; the additions that matter are **approve a device change** - the control that makes account sharing visible - and **reset password** as a separate audited action rather than an admin typing a password into a create form.

Per-row activity expands to inspections filed, mean time on task, anomalies, and override rate **presented as a position in the district distribution, never as a score or a ranking**. The intent is a supervisory conversation, not a leaderboard.

**Files:** `pages/ManageInspectors.jsx`, `components/InspectorRow.jsx`, `components/DeviceApproval.jsx`, `components/CreateInspectorDialog.jsx`.

---

## PROMPT 12 - RULES, AUDIT LOG AND REVIEW QUEUE

The three screens version 1.0's sidebar promised and never specified, which would have left them to be invented at build time.

**Rules** - **§4.10**. The check catalogue with each entry's verification status, a `Not verified` badge, and the line explaining that such a finding prints the descriptive requirement rather than a pinpoint citation. This screen is where the citation discipline becomes visible to the people relying on it.

**Audit log** - **§4.11**. Reverse-chronological, virtualised, each entry showing its abbreviated chain hash, with a **Verify chain** action reporting either "Chain intact - N entries verified" or the exact index at which the chain breaks.

**Review queue** - **§4.12**. Items: duplicate evidence, outside geofence, unreliable fix, edited offline, clock skew, engine override, possible re-registration. Each resolves to Accept or Escalate with an audited note. The header notification bell counts these, so without this screen the count has no destination.

**Files:** `pages/Rules.jsx`, `pages/AuditLog.jsx`, `pages/ReviewQueue.jsx`, `components/VerificationBadge.jsx`, `components/ChainVerify.jsx`, `components/ReviewItem.jsx`.

---

## PROMPT 13 - OFFLINE AND PWA

`vite-plugin-pwa` with an `idb` queue. Sync strip per **§3.6**.

**Conflict resolution is not "server wins".** An inspection edited offline lands in the review queue as an `edited_offline` item presenting the local revision history against the synced record, for a human to resolve. Version 1.0 silently overwrote the inspector's field work.

Store evidence as **Blobs, not base64** - base64 inflates the payload by about a third and Blob is the correct IndexedDB type. Queue a compressed copy first so the record lands on a weak connection, then backfill the full-resolution original. A single compressed copy means the evidentiary original never exists.

Include the **capacity warning** at 80% of the offline cap. An inspector who does not know the queue is full loses a day's work.

**Files:** `db/queue.js`, `hooks/useOnlineStatus.js`, `hooks/useSyncQueue.js`, `components/SyncStrip.jsx`, `components/StorageWarning.jsx`.

---

## PROMPT 14 - ACCESSIBILITY AND LANGUAGE

Version 1.0 had no accessibility section at all. Implement **§6** and **§7** as acceptance criteria, not aspirations:

- Focus ring per §3.1, at 3 px with 2 px offset, **never removed**.
- Full keyboard operation. All four modal surfaces trap focus and restore it on close.
- Table sort state announced. Live regions for the quality strip and sync state.
- Readable at 200% text scaling without horizontal scrolling.
- All motion suppressed under `prefers-reduced-motion`.
- Alt text on every evidence image naming the panel.
- **English and Hindi from the first release.** No hard-coded strings; finding text comes from a message catalogue keyed by check identifier. Language switch in More.

**Files:** `i18n/en.json`, `i18n/hi.json`, `i18n/index.js`, `hooks/useReducedMotion.js`, `components/LanguageSwitch.jsx`.

---

## PROMPT 15 - VERIFICATION

Not polish - these are the checks that catch the defects this document exists to prevent.

1. **Contrast.** A unit test asserting the measured ratio of every token pair in §2.1. §6 requires it, because version 1.1 of the design claimed a standard it failed on six pairs.
2. **Greyscale.** Render the findings list, the record cards and the calendar in greyscale. Every state must remain identifiable.
3. **Four states everywhere.** Grep the source for `'Good'`, `'Bad'`, `'Review'`, `nonCompliant` and `underReview` used as a complete set. Every count, filter, badge and chart handles four results and three verdicts.
4. **Nineteen rows.** A fixture with 19 findings including at least one `not_assessed` with a reason, one override, and one short-circuited phase.
5. **No token in storage.** Assert `localStorage` and `sessionStorage` are empty of anything token-shaped after login.
6. **Dead routes.** Every sidebar item resolves to a mounted route.
7. **44 px.** Assert the computed height of every interactive element.
8. **Keyboard.** Complete one inspection end to end without a mouse.
9. **Degraded data.** Render every screen against a fixture where OCR returned nothing, GPS never fixed, and nine checks are `not_assessed`. This is the state the product will most often be in, and version 1.0 specified no screen for it.

```bash
npm run dev          # http://localhost:5173
npm run build && npm run preview
```

Run against the live backend on `http://localhost:8000`, not mocks. Mocks return the shape you expected; the backend returns the shape it has.

---

## WHAT CHANGED IN VERSION 2.0

Version 1.0 duplicated roughly two-thirds of `08_UI_DESIGN.md` and then fell out of step with it, so the build tool received contradictory instructions in the same prompt - a reference to `08` in one bullet and a forbidden hex code in the next. It follows the hex code. Every duplicated visual value is now a pointer.

Substantively corrected: six colours that fail WCAG; `#94A3B8` used for the statutory disclaimer and the provision reference, unreadable on a sunlit phone, which is the condition of this product's use; the two-state Good/Bad model throughout, including a dashboard contract with no field for the fifth state; "6-9 checklist rows" against an engine that returns nineteen; a red `AlertTriangle` on a success message; the login role selector, the fabricated statistics, the ungated `gov.in` demo credentials and the public registration screen; JWTs in `localStorage` with the role read from there too; a Tailwind version that does not build; four sidebar promises with no screens behind them; the missing panel-dimension step that made the font-height check unmeasurable; a disabled rather than absent gallery control; "server wins" sync that discarded field work; and the complete absence of accessibility and Hindi.

The file is now about a third shorter and says nothing that `08` says better.

---

**End of Portal Build Prompts.** Companion documents: `08_UI_DESIGN.md` for every visual decision, `Backend.md` for the API this portal consumes, `Frontend_App_prompts.md` for the Expo mobile app, and `README.md` for the run model.
