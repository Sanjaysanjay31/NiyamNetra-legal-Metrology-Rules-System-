# NiyamNetra - UI/UX Design System
### Smart India Hackathon 2026 - Problem Statement SIH26034 - Portal + Expo App
**Version:** 2.0 | **Date:** 29 Aug 2026 | **Revised:** 30 Aug 2026
**Path:** C:\Skills\Projects\NiyamNetra\Docs\08_UI_DESIGN.md
**Scope:** Design principles, colour and type system with measured contrast ratios, component library, every screen specified, accessibility

---

## 1. DESIGN PHILOSOPHY

**First impression goal:** a judge looks at the screen for three seconds and reads it as a working government product rather than a hackathon submission.

**Principles**

1. **Government trust, product polish.** Deep navy and teal with an Indian saffron accent, but modern spacing, restrained shadows and real hierarchy.
2. **Mobile first, desktop complete.** The inspector works one-handed in a dim shop; the admin works on a desktop with charts. Neither is a compromise of the other.
3. **Evidence first.** Every finding is one tap from the image crop it came from, because Legal Metrology enforcement is about evidence.
4. **One primary action per screen.** Scan, Submit, Approve - large and unmissable.
5. **Honest states.** The interface has three verdicts, not two. `Pass`, `Violation` and `Not assessed` are equally first-class, and the third is never disguised as either of the others. This is the single most important design constraint in the file - see §2.4.
6. **Vernacular ready.** English and Hindi from the first release, with Devanagari-capable type and no hard-coded strings.

**Reference points:** DigiLocker for institutional trust, Zerodha Kite for dense-data calm, Google Lens for camera guidance.

---

## 2. FOUNDATION

### 2.1 Colour palette, with measured contrast

Every ratio below was computed against the WCAG 2.1 relative-luminance formula, not estimated. Version 1.1 of this document asserted "contrast ratio ≥4.5:1 for text (checked)" and **six of its colours did not meet it.** The corrected values are in the third column. Where a colour is listed as decoration only, it must never carry text.

**Brand**

| Token | Hex | Use | Measured |
|---|---|---|---|
| Niyam Blue | `#0F2A44` | Headers, primary buttons, sidebar | 14.63:1 on white - pass |
| Netra Teal | `#0E7490` | Links, active states, secondary actions | 5.36:1 on white - pass |
| Saffron | `#F59E0B` | Accent bars, corner brackets, active indicators | **2.15:1 on white - decoration only, never text** |

Saffron on white was used for text in version 1.1. It fails badly. Where saffron must carry a label, put it on navy (`#F59E0B` on `#0F2A44` measures 6.81:1) or set the text in `#0F172A` on the saffron fill (8.31:1).

**Semantic - corrected**

| State | Fill | Border | Text (was) | Text (use) | Measured |
|---|---|---|---|---|---|
| Pass | `#ECFDF5` | `#A7F3D0` | ~~`#059669`~~ 3.58:1 | `#047857` | **5.21:1 - pass** |
| Violation | `#FEF2F2` | `#FECACA` | ~~`#DC2626`~~ 4.41:1 | `#B91C1C` | **5.91:1 - pass** |
| Review | `#FFFBEB` | `#FDE68A` | ~~`#D97706`~~ 3.07:1 | `#B45309` | **4.84:1 - pass** |
| Not assessed | `#F1F5F9` | `#CBD5E1` | `#475569` | `#475569` | 6.92:1 - pass |
| Info | `#F0F9FF` | `#BAE6FD` | ~~`#0284C7`~~ 3.84:1 | `#0369A1` | **5.57:1 - pass** |

The original four all sat in the 3.0-4.4 band - legible at large sizes, non-compliant at the 11-12 px the badges actually use. Since every badge in this system is small text, they had to be darkened.

The saturated versions remain correct for **icons, chart series and progress bars**, where the 3:1 non-text threshold applies: `#059669` 3.77:1, `#DC2626` 4.83:1, `#D97706` 3.19:1 on white all clear it. Keep them there; do not use them for badge labels.

**Neutrals**

| Token | Hex | Use | Measured |
|---|---|---|---|
| Page background | `#F8FAFC` | Page canvas | - |
| Surface | `#FFFFFF` | Cards, modals | - |
| Divider | `#E2E8F0` | Decorative rules between rows | 1.23:1 - decorative only |
| Control boundary | `#7E8EA3` | **Input, select and checkbox borders** | 3.34:1 on white - pass |
| Text primary | `#0F172A` | Headings, values | 17.85:1 - pass |
| Text secondary | `#475569` | Body, labels | 7.58:1 - pass |
| Text tertiary | `#64748B` | Timestamps, helper text | 4.76:1 - pass |
| ~~Text muted~~ | ~~`#94A3B8`~~ | **Removed** | 2.56:1 - fails |

Two neutral corrections matter. `#94A3B8` was specified for placeholders and timestamps at 2.56:1, which is unreadable for anyone with reduced acuity working on a sunlit phone - the exact condition of this product's use. It is replaced by `#64748B` throughout. Separately, WCAG 1.4.11 requires a 3:1 boundary on any control whose shape identifies it, and `#E2E8F0` at 1.23:1 does not provide one; form controls therefore take `#7E8EA3`, while `#E2E8F0` is retained for decorative dividers, which are exempt.

**Gradients and elevation**

- Login panel: `linear-gradient(135deg, #0F2A44 0%, #0E7490 100%)`
- Card: `0 1px 3px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.05)`
- Card hover: `0 4px 12px rgba(0,0,0,.08), 0 10px 25px rgba(15,42,68,.08)`
- Modal: `0 20px 50px rgba(0,0,0,.15)`

### 2.1a Dark theme, measured

Version 1.1 deferred dark mode on the grounds that "the contrast table would need recomputing, and shipping it unmeasured would repeat this document's original mistake." It has now been recomputed. The dark palette is derived from Niyam Blue rather than from neutral grey, so the night interface reads as the same instrument, and every pair below was measured by the same `scripts/contrast-test.mjs` that gates the light theme - the check fails the build if any pair regresses or if any annotated ratio no longer reproduces from the token hex.

Thresholds are unchanged: 4.5:1 for text on its background, 3.0:1 for a control boundary, status graphic, chart series or focus ring. Dividers and badge outlines remain decorative and carry no ratio, because state is encoded by icon and word as well as colour (§2.4).

**Canvas, surface and text**

| Token | Hex | Measured |
|---|---|---|
| Canvas | `#0A1120` | - |
| Surface | `#111C2E` | - |
| Raised surface | `#18263C` | - |
| Text primary | `#E9EFF8` | 14.78:1 on surface, 16.31:1 on canvas - pass |
| Text secondary | `#B7C4D8` | 9.68:1 on surface - pass |
| Text tertiary | `#93A3BC` | 6.67:1 on surface, 5.94:1 on raised - pass |
| Rail label | `#B7C4D8` | 10.38:1 on the rail - pass |
| Control boundary | `#63779A` | 3.77:1 on surface - pass |
| Divider | `#26364F` | 1.40:1 - decorative only |

**Semantic states** - a dark tinted fill with a light label. Each text tone is verified against both its own fill and the plain surface, because these colours also set inline text outside a badge.

| State | Fill | Text | Text measured | Graphic | On surface |
|---|---|---|---|---|---|
| Pass | `#0A2A20` | `#6FE7B6` | 10.10:1 on fill - pass | `#34D399` | 8.89:1 - pass |
| Violation | `#2C1215` | `#FCA5A5` | 9.19:1 on fill - pass | `#F87171` | 6.18:1 - pass |
| Review | `#2B1D06` | `#FCD34D` | 11.37:1 on fill - pass | `#FBBF24` | 10.23:1 - pass |
| Not assessed | `#1B2637` | `#C6D1E2` | 9.88:1 on fill - pass | `#93A3BC` | 6.67:1 - pass |
| Info | `#0A2334` | `#7DD3FC` | 9.67:1 on fill - pass | `#38BDF8` | 7.97:1 - pass |

The four accents (Teal, Saffron, Indigo, Evergreen) are each measured in both themes and expressed as five roles - a graphic tone ≥3:1, a text tone ≥4.5:1, a label ≥4.5:1 sitting on the accent fill, a soft selected-state background, and a focus ring ≥3:1 - because no single hex satisfies both the text and non-text thresholds. Saffron is the standing example: it clears 3:1 as a graphic yet measures 2.15:1 as text on white, the exact failure §2.1 records. The measured values for all four live beside the tokens in `src/theme/tokens.css`. Theme selection is light, dark or system-follow with the accent chosen independently, both applied as `data-theme` and `data-accent` on the root element.

### 2.2 Typography

**Families:** Inter for Latin; Noto Sans Devanagari for Hindi, declared in the same `font-family` stack so mixed strings render without a visible seam; JetBrains Mono for batch numbers, hashes and extracted values, where character disambiguation is the whole point.

| Role | Size | Weight |
|---|---|---|
| Display | 32 / 24 mobile | Bold |
| H1 | 24 / 20 mobile | Bold |
| H2 | 20 | Semibold |
| H3 | 16 | Semibold |
| Body | 14 | Regular |
| Caption | 12 | Medium |
| Legal | 11 | Regular |

Line height 1.5 body, 1.2 headings. **11 px is the floor**, permitted only for the statutory disclaimer and never for a value the officer must act on. Support text scaling to 200% without loss of function - `rem` units, no fixed-height text containers.

### 2.3 Spacing, radius, icons

8 px grid: 4, 8, 12, 16, 24, 32, 48. Radius 8 small, 12 card, 16 hero, `9999px` pill. Lucide icons at 20 px navigation, 16 px inline, 24 px empty state, stroke 1.8.

### 2.4 State encoding - never colour alone

Roughly one man in twelve has a colour vision deficiency, and red-green is the common axis - exactly the axis a pass-fail interface uses. Every verdict is therefore encoded **three** ways, and must remain distinguishable in greyscale:

| Verdict | Icon | Word | Colour |
|---|---|---|---|
| Pass | `CheckCircle` | "Pass" | `#047857` on `#ECFDF5` |
| Violation | `XCircle` | "Violation" | `#B91C1C` on `#FEF2F2` |
| Review | `Clock` | "Review" | `#B45309` on `#FFFBEB` |
| Not assessed | `HelpCircle` | "Not assessed" | `#475569` on `#F1F5F9` |

Note the icon choice: `XCircle` for a violation, not `AlertTriangle`, so that the triangle stays reserved for system warnings and does not appear in celebratory empty states - see §8.

Version 1.1 specified a bare "status dot green/red/amber" in the Expo checklist row. A coloured dot alone is exactly the pattern this section prohibits. Every row carries the icon and the word.

### 2.5 Touch targets

Version 1.1 required "≥48px for mobile buttons" while specifying 40 px inputs and 36 px calendar cells. Resolved: **44 px minimum for every interactive element**, 48 px for the primary action on a screen. Inputs are 44 px tall, calendar day cells 44×44. Where a visual element must be smaller, the tap target is padded out to 44 px without changing what is drawn.

---

## 3. COMPONENT LIBRARY

### 3.1 Buttons

**Primary** - `#0F2A44` fill, white label, 12/24 padding, radius 8, 14 px semibold, 48 px tall, full width on mobile. Hover `#0C2236`. Active scale 0.98. Disabled `#E2E8F0` fill with `#64748B` label. A disabled primary button always carries adjacent helper text saying what is missing - a dead button with no explanation is the most common cause of a stalled inspection.

**Secondary** - white fill, `#7E8EA3` border, `#0F2A44` label. Hover border `#0F2A44`, fill `#F8FAFC`.

**Danger** - `#B91C1C` fill, white label. Reserved for destructive or accusatory actions, and always behind a confirmation.

**Ghost** - no fill, `#475569` label, hover `#F1F5F9`.

Focus ring on all four: 3 px `#0E7490` at 2 px offset, 5.36:1 against white - visible, and never removed.

### 3.2 Cards

**Stat card** - white, `#E2E8F0` border, radius 12, padding 16. Icon in a tinted circle top left, trend delta top right, value 24 px bold `#0F172A`, label 12 px `#475569`, 4 px progress bar at the base. A trend is shown only when there is a prior period to compare - never a placeholder percentage.

**Record card** - 80×80 image left, radius 8, `object-cover`. Right: product 14 px semibold, shop 12 px `#475569`, time 11 px `#64748B`, verdict badge top right per §2.4. Violations additionally take a 3 px `#B91C1C` left border. Hover lifts; tap opens the detail with the image carousel.

**Finding row** - the most important component in the system, since it is where the officer's decision is actually made.
- Left 40%: check identifier and field name 14 px semibold (`CHK04 - Retail sale price`), provision reference 11 px `#64748B`, one-line requirement 12 px `#475569`.
- Centre 35%: extracted value 14 px mono bold, confidence badge, and where confidence is below 0.60 the raw OCR snippet in a `#F1F5F9` box.
- Right 25%: verdict badge, override control, and `View evidence` opening the crop with its bounding box.
- **Where the verdict is `Not assessed` the reason is displayed in the row, not hidden behind an expander** - "resolution insufficient for a millimetre measurement" is the officer's cue to retake, and burying it wastes the visit.
- Expanded: 200 px crop with overlay, measured value with uncertainty where applicable (`2.1 mm ± 0.3 mm against a 2.5 mm minimum`), officer remarks.

### 3.3 Inputs

44 px tall, `#7E8EA3` border, radius 8, 12 px padding, 14 px text, placeholder `#64748B`. Focus: `#0E7490` border with a 3 px ring. Error: `#B91C1C` border with helper text below - no shake animation, since motion on error is a vestibular trigger and communicates nothing the text does not. Success: `#047857` border with a check.

**Select** - same shell, chevron right, options panel with modal shadow, 200 px max height, selected row `#0F2A44` with white text. Native picker on mobile.

**Date picker** - calendar icon trigger, modal with month header and arrows, 7×6 grid of 44×44 cells, today outlined 2 px `#0E7490`, selected filled `#0F2A44`, dates holding data marked with a 6 px dot beneath - green where all passed, `#B91C1C` where any violation exists. Preset pills: Today, Yesterday, Last 7 days, Last 30 days. Fully keyboard navigable with arrow keys.

**Dimension input** - a paired numeric field for panel height and width in millimetres, with a unit suffix and a "why is this needed" affordance explaining that Table-I bands by printed area and that the entry supplies the pixel-to-millimetre scale. Required before any font-height check can run - see §4.3.

### 3.4 Badges

Verdict badges follow §2.4 exactly: icon 12 px, label 11 px medium, fill and text per the corrected table, 1 px border, pill radius, 2/8 padding.

**Confidence badge** - `≥0.90` `#047857` on `#ECFDF5`; `0.60-0.89` `#B45309` on `#FFFBEB`; `<0.60` `#475569` on `#F1F5F9` with the label "low confidence", because a low-confidence reading is not a warning about the pack, it is a warning about the photograph.

**Reason tag** - pill, `#FEF2F2` fill, `#B91C1C` text 11 px, `XCircle` 12 px left.

**Sync badge** - `#0369A1` on `#F0F9FF` with a count, `"3 pending"`. Tap opens the sync queue.

### 3.5 Navigation

**Portal header** - 64 px, white, `#E2E8F0` bottom border, sticky. Logo left; right holds the sync badge, a notification bell with an unread dot, and the user menu showing name and role. Hamburger at mobile widths.

**Admin sidebar** - 240 px, `#0F2A44`, collapsing to 64 px icons at tablet. Items: Dashboard, Inspections, Review Queue, Reports, Manage Inspectors, Rules, Audit Logs. Inactive labels `#CBD5E1` (9.86:1 on navy); active is white **semibold** with a 3 px saffron left border. The active fill `#1E3A5F` measures only 1.27:1 against the sidebar, so it is invisible on a dim screen and cannot be the sole indicator - the border and the weight change carry it. Version 1.1 relied on the fill.

**Bottom tabs (Expo and mobile PWA)** - 64 px, white, `#E2E8F0` top border, **five** tabs. The inspector build carries Scan (`Camera`), Pass (`CheckCircle`), Violations (`XCircle`), Reports (`BarChart`), More (`Menu`); the admin build swaps in Raids, Inspectors and Records for the first three and drops the camera (§5.2). Active `#0F2A44` with a 2 px top indicator; inactive `#64748B`. The fifth tab is not optional - version 1.1 shipped four tabs and left the mobile app with no route to profile, language, sync queue or logout at all.

**More sheet** - Profile, Language (English / हिंदी), Sync queue with pending count and storage remaining, Server time with device skew, Help, Logout.

### 3.6 Sync and capacity strip

A persistent element beneath the mobile header, hidden only when online with an empty queue:
- Offline: `#FFFBEB` fill, `#92400E` text (6.84:1), `WifiOff`, "Offline - 3 inspections will sync when connected".
- Syncing: `#F0F9FF`, `#0369A1`, progress, "Syncing 2 of 3".
- Storage: at 80% of the offline cap, "Storage 82% - sync soon to free space".

Required by the field-device constraints in `12` §9 (#89). An inspector who does not know the queue is full loses a day's work.

---

## 4. PORTAL SCREENS

### 4.1 Login

Split 50/50 on desktop, stacked on mobile.

**Left panel** - brand gradient with a subtle dot overlay, 80 px eye logo, "NiyamNetra" 32 px white bold, tagline "The AI eye for Legal Metrology compliance" at 14 px white 80%. Beneath it, live counts fetched from the public statistics endpoint, each labelled with its scope: "1,248 inspections recorded · 298 violations found". **Where the endpoint returns nothing, the block is omitted.** Version 1.1 hard-coded "1,200+ Inspections | 150+ Violations Caught" - a fabricated figure on the first screen a judge sees, which invites the one question the team cannot answer.

**Right panel** - white card, 400 px max, padding 32, radius 16.
- "Sign in" 20 px bold, "Legal Metrology compliance inspection" 14 px `#475569`.
- Email with `Mail` icon; password with `Lock` and a visibility toggle; "Remember this device"; "Forgot password".
- **No role selector.** Version 1.1 offered Inspector / Admin pills. The role is a property of the account, resolved server-side from the credentials and returned in the token; asking the user to pick one invites a mismatch error that means nothing to them, and it advertises the privilege structure to anyone at the login screen. After authentication the app routes by the role in the token.
- Primary button, 48 px, full width, "Sign in", with a spinner and a disabled state during the request.
- One-time code field appears after a correct password for accounts with second-factor enabled.
- Footer: 11 px `#64748B`, "Assesses declarations under the Legal Metrology (Packaged Commodities) Rules 2011 as amended. Not a statutory notice." The version 1.1 string, "LM Rules 2011 only, as per Jan Vishwas 2026", conflated the Rules with an amending Act and was not a usable disclaimer.

**Demo credentials** - rendered only when `import.meta.env.DEV` is true, in an `#F0F9FF` box. Never present in a production bundle, and the seeded accounts use an `example.test` domain rather than a `gov.in` address the project does not control.

### 4.2 New inspection - scope and context

**Header** - "New inspection", with "Step 1 of 4" dots.

**Scope card - first, because it can end the inspection immediately**
- **Transaction type** (required): Retail sale · Institutional consumer · Industrial consumer · Quantity determined in the purchaser's presence. Selecting any of the last three shows an inline notice that Chapter II of the Rules does not apply and offers "Record as out of scope", which files a single-line record and returns home. Without this control the engine cannot perform its scope gate at all, and every counter-weighed kilo of rice becomes a false violation - see `12` §5 (#48, #50).
- **Product category** (required): Packaged food · Beverage · Edible oil · Biscuits and confectionery · Tea and coffee · Packaged drinking water · Soap and detergent · Cosmetic · **Medical device** · Cement · Fertiliser · Agricultural produce · Textile · Electronic goods · Other. Medical device routes the metrology checks to `Not assessed` under the 2025 proviso to Rule 2(h); cement, fertiliser and agricultural produce carry the 50 kg threshold rather than 25 kg. Version 1.1 listed six categories and omitted Medical Device entirely, so that routing could never fire.

**Establishment card**
- Shop or establishment name, required, with `Store` icon.
- Location: GPS with **accuracy radius shown** - "12.9716, 77.5946 · ±18 m". Above 100 m accuracy the field reads "Fix unreliable - ±340 m" and the geofence test is suppressed as meaningless. Where the fix places the inspector outside the registered store's 100 m fence, a reason field and a shop-board photograph are required and the record is filed as `outside_with_justification` rather than blocked. Blocking here would strand every inspector inside a concrete-walled shop - see `12` §1 (#8).
- Date: server date, read-only for inspectors, editable by admins with a reason.
- Seller details, collapsible: manufacturer, packer or importer name and address.

**Footer** - "Next: capture evidence", disabled until required fields are complete, with helper text naming what is outstanding.

### 4.3 Camera capture - the hero screen

**Top bar** - back, "Capture evidence", panel counter, help.

**Guide overlay** - 2 px dashed `#0E7490`, radius 12, 4:3, 80% width, with L-shaped saffron corner brackets 3 px (6.81:1 against a dark preview). Top label "Place the pack inside the frame"; bottom label naming the current panel.

**Live quality strip** - directly beneath the frame, one line, updating on sampled frames rather than every frame to protect battery and thermal headroom:

| Condition | Message | Colour |
|---|---|---|
| Laplacian variance < 100 | "Too blurred - hold steady" | `#B91C1C` + haptic |
| Saturated cluster > 15% of panel | "Glare - tilt away from the light" | `#B45309` |
| Mean luminance < 50 | "Too dark - flash on" | `#B45309` |
| Panel < 400 px tall | "Move closer - text too small to measure" | `#B45309` |
| Corners not all detected | "Whole panel not visible" | `#B45309` |
| All clear | "Ready" | `#047857` |

The 400 px condition exists because below it a millimetre claim is not defensible, and it is far cheaper to say so during capture than to return `Not assessed` afterwards.

**Panel dimensions step** - after the front panel is captured, a required `Dimension input` for the panel's height and width in millimetres, with a shape selector (rectangular, cylindrical, other) since Rule 7(4) computes the area differently for each; cylindrical additionally asks for diameter. Explanatory text: "Needed to compute printed area and to convert pixels to millimetres." Optionally, "Place a bank card or a ₹5 coin in frame" gives a second, independent scale that the pipeline cross-checks within 5%. **Without this step nothing in the character-height family can run**, and version 1.1 had no field for it anywhere while still promising a font-size check.

**Controls** - shutter 72 px, `#0F2A44` ring on white, capturing a burst of five frames and keeping the sharpest. Flash auto/on/off. Retake. **No gallery control exists in either client** - not disabled, absent: the portal captures through `getUserMedia` with no file input, and the app ships without `expo-image-picker`. Server-side capture enforcement via a single-use capture token remains deferred with `scan_images.capture_token` (`06_DATABASE.md` §10; `12` §1, #5 records the intent), so today the control is entirely client-side and must stay absent, not merely hidden.

**Thumbnail row** - slots for Front, Back, Side, Price panel. Empty slots show a dashed placeholder; filled slots show a 60×60 crop with a check and a delete affordance. Progress dots below.

**Advance rule** - "Next: review" requires front **and** back at minimum, because a required declaration may lawfully sit on either and a missing-declaration finding may only be asserted from a capture proven complete. A single-panel capture yields `Not assessed`, reason "only one panel captured", and the button label says so.

**Transparent substrate hint** - for beverage, water and edible oil categories, or when the frame is detected as low-contrast, an `#F0F9FF` tip card: "Place anything dark behind the bottle so white printing becomes readable."

### 4.4 Findings review

**Header** - "Review findings", with "Engine recommendation - the officer's decision is final" 12 px `#475569`.

**Summary strip - four counts, not three**

`Pass 11 · Violation 2 · Review 1 · Not assessed 5`

Version 1.1 showed three counts against a checklist of "6-9 rows". Both numbers were wrong. The engine runs **eighteen checks with one sub-check, nineteen rows**, identified `CHK01` through `CHK18` plus `CHK06b`, and the fourth count is the one that keeps the report honest. A package scan cannot run `CHK15` or `CHK16` at all - those are listing and platform checks - so the header states the denominator explicitly: **"16 of 18 checks - package scan"**.

**Rows** - one `Finding row` per check in the phase order fixed by `03` §4, grouped under phase headings (Scope, Presence, Content, Metrology) so that the officer reads them in the order the law applies them. Rows short-circuited by an earlier phase render collapsed with their reason.

**Override** - the officer may set any verdict. Overriding an engine `Violation` to `Pass`, or the reverse, requires a written reason before submit enables. Both verdicts are retained on the record and written to the audit log. Overrides are legitimate and expected - the engine is frequently wrong about a curved pack - so the interaction is quick and not framed as an exception; what it is not is silent.

**Footer** - sticky. "Save draft" ghost left; "Submit inspection" primary right, disabled until every non-short-circuited row has been acknowledged, with helper text "3 findings awaiting acknowledgement". No select-all. Where a `Violation` is present, submit additionally requires two images and the representative's signature or a recorded refusal.

**All-pass state** - `CheckCircle` 48 px `#047857`, "All assessed declarations compliant", and immediately below in `#475569`: "5 checks could not be assessed - see reasons above." Congratulating the officer while five checks are unresolved is how a false assurance reaches a report.

### 4.5 Pass and Violation lists

**Pass tab** - header with count badge; stats card "Today 8 · Total 12" with a progress bar; `Record card` list; detail opens a four-image carousel, the extracted-field table and report download.

**Violation tab** - header with count badge; stats card with the leading violation type; cards with the `#B91C1C` left border and reason tags beneath the product name. Detail adds the reason list, crops with violation boxes, officer remarks, and the Section 36 tier - displayed as **"2nd instance recorded in this system"** rather than as a bare tier, since the statutory tier depends on the person's full history and not only on what NiyamNetra has seen.

**Filter bar** - search, plus horizontally scrollable pills for date, shop and category. Active pill `#0F2A44` with white text.

### 4.6 Daily report and calendar

**Header** - "Reports", the selected date, a calendar trigger top right.

**Stat grid** - 2×2 mobile, 4×1 desktop: Stores visited, Products scanned, Compliant, Violations. Icons in tinted circles, values 24 px bold, trend against the previous day only where that day has data.

**Store breakdown** - a card per store: name and location with `MapPin`, time range, scan count with pass and violation counts, chevron. Expanding lists the products with 40×40 thumbnails, verdict badges and reason tags. Coverage ratio is shown where a shelf photograph exists: "8 of ~14 packs visible on shelf scanned" - a supervisory signal, not an accusation (`12` §6, #59).

**Calendar modal** - 320 px card, radius 16, fade and scale in 200 ms. Month header with arrows and a "Today" action; preset pills; 7×6 grid of 44×44 cells with data dots; "Show report" and "Cancel". Escape closes; focus is trapped and returns to the trigger.

**Empty date** - `Calendar` illustration, "No inspections recorded on 28 Aug 2026".

### 4.7 Admin dashboard

Sidebar plus `#F8FAFC` content at 24 px padding.

**Stat row - five cards**

Total inspections · Compliant · Violations · Under review · **Not assessed**

The fifth card is required by the three-state model: a scan where nine checks could not be assessed is neither compliant nor a violation, and a four-card dashboard has nowhere to put it, so those scans silently inflate one of the other counts. Each card shows a value, a share of total and a trend where a prior period exists.

**Charts** - two columns, 280 px tall, Recharts.
- Violations by type, bar. Series colours from the 3:1-compliant set: `#0E7490`, `#B91C1C`, `#B45309`, `#047857`, `#7C3AED`. Every bar is also labelled, so the chart is readable without colour.
- Results over time, **four stacked areas** in the verdict colours - compliant, violation, not assessed, and review where present - with a Daily / Weekly / Monthly toggle and a shared legend so the stack reads without hovering. Version 1.1 specified a single total line with a 20% area fill; it is drawn as a stack instead, because a line of totals hides the one movement an administrator must catch - a week where the not-assessed share doubles is a capture problem, and a total line renders it as an ordinary busy week.
- Filters above both: period pills, location, category. Every chart states its date range and record count in a caption - an unlabelled chart is not evidence.

**Recent inspections table** - product with 32×32 thumbnail, shop, inspector, date, verdict badge, action. Row hover `#F8FAFC`, ten per page. Sortable headers with an announced sort state.

**Repeat violators** - name, violation count badge, most recent date, and where the address-proximity match in `12` §6 (#70) fires, an inline note: "A prior record exists within 50 m under a different proprietor name." Never auto-merged; surfaced for the officer.

**Export** - PDF summary, Excel, CSV.

### 4.8 Inspections list and detail

**List** - search, filter pills for verdict, date and inspector, sort control, and a card/table view toggle.

**Detail** - product name, verdict badge, shop, date, inspector, and a rule-version tag showing the instrument state applied, labelled by date rather than the bare "v2017" of version 1.1: `Rules as at 2026-08-30`. Where the pack's printed manufacture date precedes an amendment in force at inspection, an inline note says so, because the selling offence is judged on the sale date and the manufacture date is mitigation for the officer to weigh, not an automatic exemption (`12` §5, #57).

Image carousel with pinch zoom and an OCR-overlay toggle. Extracted fields table: field, value, confidence, provision, verdict. Read-only findings list. Actions: download PDF, download Word, approve or reject with a reason. Audit trail as a vertical timeline showing actor, action, server time and location for every event, including every override.

**Evidence integrity strip** - for each image, the stored SHA256 abbreviated, with a re-verify action that recomputes and compares. A mismatch replaces the image with a `#FEF2F2` panel reading "Evidence hash mismatch - this image has been altered since upload" and raises an alert.

### 4.9 Manage inspectors (admin)

Promised by the sidebar in version 1.1 and never specified, which would have left it to be invented at build time.

Table of accounts: name, email, district, role, status, last active, bound device. Actions: create (there is no self-registration), deactivate, reset password, and **approve a device change** - a login from a new install is held pending until an admin approves it, which is the control that makes account sharing visible (`12` §6, #65, #66). Each row expands to activity: inspections filed, override rate against the district median, mean time on task, and any anomalies. The override-rate figure is presented as a distribution position, not a score, and never as a ranking - the intent is a supervisory conversation, not a leaderboard that would reward passing everything.

### 4.10 Rules (admin, read-mostly)

Table of the check catalogue: check identifier, provision, descriptive requirement, instrument, **verification status**, and whether the check is currently enabled. Entries whose citation is unverified render with a `Not verified` badge and an explanatory line: "This finding will print the descriptive requirement rather than a pinpoint citation." That surface is what makes the citation discipline in `02` §1.1 visible to the people relying on it, rather than a convention buried in the code. Admins may attach a source reference and mark an entry verified; the change is audited. Rule text itself is not editable in the MVP.

### 4.11 Audit log (admin)

Reverse-chronological, virtualised list: server time, actor, action, target, and the abbreviated chain hash. Filters by actor, action type and date range. A **Verify chain** action recomputes the SHA256 chain from the genesis entry and reports either "Chain intact - 12,480 entries verified" or the exact index where it breaks, in `#FEF2F2`. Entries are never editable and never deletable from this or any other surface - the list has no row actions beyond viewing the linked record.

### 4.12 Review queue (admin)

The destination for everything the system flags but must not decide alone:

| Item | Raised by | Presented as |
|---|---|---|
| Duplicate evidence suspected | pHash within Hamming 5 | Both images side by side, both fixes, both times, implied travel speed |
| Outside geofence | Fix beyond 100 m | Distance, accuracy radius, stated reason, shop-board photograph, map extract |
| Unreliable fix | Accuracy > 100 m | Same, with the distance test marked not applicable |
| Edited while offline | `edited_offline` flag | Local revision history against the synced record |
| Clock skew | EXIF against server time | Divergence in seconds |
| Engine override | Officer changed a verdict | Both verdicts and the written reason |
| Possible re-registration | Address proximity match | Both store records and their histories |

Each item resolves to "Accept" or "Escalate" with a note, and the resolution is audited. A duplicate-evidence item is **never** labelled fraud in the interface - two honest photographs of the same SKU on the same white shelf can collide, and an interface that accuses an officer on a hash match will be abandoned within a week (`12` §1, #9).

---

## 5. EXPO APP

The app carries both roles in one build and routes by the role in the token after login (§4.1), exactly as the portal does. The inspector build is six screens; the admin build is a read-mostly monitoring module with no camera. All of it shares the portal's tokens, components and API.

**Login** - full screen, logo above the card, otherwise identical to §4.1 including the absence of a role selector.

### 5.1 Inspector

**Scan (default tab)** - the §4.3 flow full-screen: guide overlay, live quality strip, panel-dimension step, burst shutter, thumbnail row. Then the findings review in a compact form - 56 px rows carrying icon, word and colour per §2.4, tapping to expand - and a sticky 48 px submit.

**Pass** and **Violations** - list-only with search, pull to refresh and infinite scroll.

**Reports** - the §4.6 stat grid, store breakdown and the shared calendar component.

**More** - per §3.5: profile, language, sync queue, server time and skew, help, logout.

**Field behaviour** - the §3.6 sync strip is always available. The camera preview stops whenever capture is not active. OCR runs server-side when a network is present and falls back to on-device processing when it is not. Evidence uploads lazily: a compressed copy syncs first so the record lands on a weak connection, and the full-resolution original backfills later, with the queue depth and remaining storage visible on the home screen.

### 5.2 Admin (read-mostly monitoring)

The admin build swaps the bottom tabs to **Raids** (`Activity`), **Inspectors** (`Users`), **Records** (`FileText`), **Reports** (`BarChart`) and **More** (`Menu`) - no Scan tab, because no camera dependency is reachable in this role. **Raids today** shows total stores and scans across all inspectors with the four-result split; **Inspectors** lists officers with their bound install and create / deactivate / approve-install actions (mirroring §4.9); **Records** is the store-wise repository filtered by inspector, date and result; **Reports** is the §4.6 calendar and stat grid aggregated across the team. Every list is read-only on the phone - user creation and rule viewing that need care stay primary on the desktop portal. Screen-by-screen build prompts are in `Frontend_App_prompts.md`.

---

## 6. RESPONSIVE AND ACCESSIBILITY

**Breakpoints** - mobile 375-767 (bottom tabs, stacked cards and charts), tablet 768-1279 (sidebar collapsed to icons, two-column charts), desktop 1280+ (240 px sidebar, three-column card grid, full tables).

**Target: WCAG 2.1 level AA.** What that requires here, stated as testable claims rather than as an assertion of compliance:

- **Text contrast** - every text-on-background pair in §2.1 and §2.1a has a measured ratio recorded beside it. The six failures found in version 1.1 are corrected there. `scripts/contrast-test.mjs` recomputes every pair from the actual token hex - across both themes and all four accents, 84 pairs in all - and fails the build if any drops below its threshold or if any annotated ratio no longer reproduces, so a future colour change cannot quietly reintroduce a failure. This is the check that was claimed in version 1.1 and not performed.
- **Non-text contrast** - control boundaries at `#7E8EA3` (3.34:1); chart series and status icons from the 3:1-compliant set; the focus ring at 5.36:1.
- **Colour independence** - §2.4. Verified by rendering the findings list in greyscale; every verdict stays identifiable because the CheckRibbon carries it in bar height and solid-versus-dashed fill, and every badge and row carries the icon and the word, not the colour alone.
- **Keyboard** - every action reachable and operable, visible focus throughout, focus trapped in modals and restored on close, no keyboard traps.
- **Screen readers** - labelled form controls; verdict badges expose the word, not the colour; the findings list is a table with proper headers; live regions announce the capture-quality state and sync changes.
- **Motion** - honour `prefers-reduced-motion` by disabling transforms and transitions. No error shake.
- **Text scaling** - functional to 200% with no clipping and no loss of action.
- **Targets** - 44 px minimum per §2.5.
- **Alt text** - descriptive and specific: "Front panel of a biscuit packet showing the price declaration", not "image".

**Language** - English and Hindi at minimum, selected in More, applied to the interface and to the generated report. Finding text lives in a message catalogue keyed by check identifier, so adding Tamil or Bengali is a data change and not a code change. A report a trader cannot read cannot inform them of anything, which is the report's whole purpose (`12` §9, #90).

**Dark mode** - implemented and measured (§2.1a). Deferred in version 1.1 because the contrast table would have needed recomputing; that recomputation is done and gated by the same test as the light theme, so the dark palette ships with every pair measured, alongside a light / dark / system toggle and four selectable accents.

---

## 7. MOTION

Page transition fade 200 ms. Card hover lift 4 px, 200 ms. Button press scale 0.98. Shutter scale 0.95 with a 100 ms white flash and haptic. Verdict badge colour transition 300 ms. Bars grow from zero over 800 ms with stagger. Calendar modal fade and scale 95→100% over 200 ms. Toast slides from the top in 300 ms and auto-dismisses after 3 s - except errors, which persist until dismissed, since an error the user missed is an error unhandled. Everything here is suppressed under `prefers-reduced-motion`.

---

## 8. EMPTY AND ERROR STATES

**No compliant records yet** - `CheckCircle` 64 px `#CBD5E1`, "No inspections recorded yet", "Start scanning to see results here", primary "Scan now".

**No violations recorded** - `CheckCircle` 64 px `#CBD5E1`, "No violations recorded today". Version 1.1 used a **red `AlertTriangle`** with "No violations - Great job!". Two faults: a danger icon on a neutral outcome trains the officer to ignore the icon that matters, and congratulating them for finding nothing rewards the wrong thing. Finding no violations is a fact about the shelf, not a performance.

**No results for a filter** - `Search` 48 px, "No results for 'Ramesh'", "Adjust the filters or clear them", clear action.

**Offline** - the §3.6 strip. `#FFFBEB` on `#92400E` at 6.84:1.

**Upload failed** - persistent toast, "Upload failed - queued for retry", with a manual retry. The record is never lost to a failed upload; it returns to the queue.

**Evidence hash mismatch** - `#FEF2F2` panel replacing the image, "This image has been altered since upload", with a link to the audit entry.

**Not found** - `FileQuestion` 64 px, "Inspection not found", with a link back to the list.

---

## 9. BRAND

**Logo** - an eye whose pupil is a packet outline; outer stroke `#0F2A44`, inner `#0E7490`, saffron accent dot. **Wordmark** - "Niyam" in `#0F2A44`, "Netra" in `#0E7490`, 20 px bold. **Favicon** - the eye alone. **App icon** - white eye on the brand gradient with the saffron dot.

---

## 10. WHY THIS DESIGN HOLDS UP UNDER QUESTIONING

The version 1.1 summary claimed a wow factor. That is not what a technical panel probes. What survives a question is this:

**The interface has three verdicts because the engine has three.** Every competing submission will show pass and fail. When a judge asks what happens to a curved bottle in bad light, this design has a specific, visible answer - `Not assessed`, with the reason in the row and the count on the dashboard - rather than a confident wrong colour.

**Contrast was measured, not asserted.** Six colours failed the standard this document previously claimed to meet, and the measured ratios are recorded beside every token with a test enforcing them. Being able to say which six, and what they now measure, is worth more than any gradient.

**The scope gate comes before the camera.** Asking the transaction type first means counter-weighed grain and industrial drums leave the flow in one tap instead of generating eighteen meaningless checks. It is the cheapest correctness win in the product and it is a screen, not an algorithm.

**The measurement inputs exist.** Panel dimensions and shape are collected because Table-I bands by printed area and because millimetres cannot be derived from pixels without a scale. A font-height check with no dimension field is a claim with nothing behind it.

**The defences are built not to misfire.** An advisory geofence, a duplicate check that opens a review rather than an accusation, a queue-depth indicator, no punitive timer. Seventeen of the ninety risks in `12` exist purely to stop the system harming honest users, and the interface is where most of them are resolved.

**Portal and app are one system.** Shared tokens, components, API and token model - which is why the calendar, the findings row and the verdict badge are specified once here and used in both.

---

**End of UI/UX Design System.** Every colour has a measured ratio, every screen the sidebar promises is specified, and every verdict is legible without colour. Build from this without inventing values.
