# NiyamNetra — Capacity, Load and Overflow

### Smart India Hackathon 2026 · Problem Statement SIH26034 · Volume, storage, queueing and offline limits

**Version:** 2.0 | **Date:** 30 Aug 2026 | **Supersedes:** 1.1 (see §7 for the corrections log)
**Scope:** Realistic volume arithmetic, eight overflow scenarios with the correct mitigation for each, backpressure policy, configuration, and load tests that measure something

---

## 1. THE GOVERNING RULE

**Capacity is never bought with evidence.**

Every mitigation in version 1.1 paid for headroom in exactly the currency this product cannot spend. It compressed captures to 800 KB and resized them to 1280 px *before upload*; it discarded four of five burst frames; it de-duplicated evidence files so two scans shared one image; it auto-deleted "Good" records after thirty days; and it put thumbnails in the report instead of the evidence images. Each of those makes the system faster and cheaper, and each of them destroys the thing an inspection exists to produce.

The 1280 px resize is the clearest case. The millimetre checks in `02` §7 are decided at the 0.5 mm level. A 1280 px wide capture of a 60 mm panel gives about 0.05 mm per pixel at best, and much worse once the panel occupies only part of the frame — so a 2.4 mm character and a 2.6 mm character become the same measurement, and the check that the whole product is built around stops working. The downscale happens on the phone, before the hash, before the upload, before anyone can notice.

The correct currency is **derived artifacts, indexes, pagination, streaming and backpressure**. Originals are immutable and never re-encoded. Anything cheap enough to throw away must be cheap enough to regenerate from the original, and must never be hashed as evidence.

Where capacity genuinely runs out, the system **refuses new work at the gate and says so**. It does not quietly degrade what it has already collected.

### 1.1 What the volume actually is

Version 1.1 sized the system for "50–100 shops per day, 1000 scans per day per officer". A Legal Metrology officer does not inspect fifty premises in a day; the day includes travel, seizure paperwork, sampling forms and statements. The plausible field day is 6–12 premises and 30–80 packages, and the arithmetic changes every conclusion below — most importantly, it removes any need for cold storage or row archiving in the first year.

| Quantity | Realistic | v1.1 assumed |
|---|---|---|
| Premises per officer-day | 6–12 | 50–100 |
| Packages per officer-day | 30–80 | 200–1000 |
| Images per package | 4–5 at capture resolution, ~3–4 MB each | 4 at 800 KB after downscale |
| Bytes per officer-day | **0.5–1.6 GB** | 1.6 GB *after* destroying the measurement |
| `findings` rows per officer-day | 570–1520 (19 per scan) | not considered |
| Ten officers, 250 working days | **1.2–4 TB**, ~3.8 M findings rows | 10 GB/day/officer claimed |

Two things follow. First, the honest answer to "what about a terabyte of evidence?" is a disk and a retention policy — a 4 TB drive costs less than one officer-day, and enforcement material is legally required to survive. Second, the row count that matters is `findings`, not `scans`: nineteen rows per scan is the whole point of the design, and it means the reporting queries must be indexed against `findings`, which §2.2 does.

For the hackathon itself the working set is a demo database of a few hundred scans. Everything below is written so the demo runs on a laptop and the design is defensible at a hundred times the volume.

### 1.2 What may be derived, and what may not be touched

| Artifact | Origin | Hashed as evidence | May be regenerated / deleted |
|---|---|---|---|
| Original capture | Camera, byte-for-byte as uploaded | **Yes — `scan_images.sha256`** | **Never** |
| Rectified copy fed to OCR | Derived, `.derived` infix | No | Yes, freely |
| Report display copy, ≤1600 px, EXIF stripped | Derived | No | Yes, freely |
| List thumbnail, ≤160 px | Derived | No | Yes, freely |
| Generated PDF / DOCX | Derived from findings | No | Yes, on any re-assessment |
| `findings` rows | Engine output | Chained via `audit_logs` | Replaced only by re-assessment, which is audited |

`Backend.md` §5 already implements this split, and the EXIF handling follows from it: the original keeps its EXIF because stripping it would change the bytes and break the hash, while the derived copies that leave the system are stripped, which is where the privacy exposure actually is.

---

## 2. THE EIGHT SCENARIOS

### 2.1 Evidence storage growth

**What happens.** Ten officers fill 1.2–4 TB a year, and the directory grows monotonically because nothing may be deleted inside the five-year retention period.

**The wrong fixes, and why.** *Compress at capture* destroys the measurement (§1). *De-duplicate identical files across scans* is worse than it looks: a perceptual hash collision is not proof of identity — two sachets of the same brand from the same shelf legitimately produce near-identical images — so pointing two scans at one file makes the second scan's evidence a copy of the first's, which is exactly the accusation the hash exists to defeat. *Auto-delete after thirty days* deletes enforcement material, and version 1.1 proposed deleting it **selectively by verdict** ("delete oldest Good records, keep Bad for five years"), which produces a corpus in which the retained evidence is systematically the incriminating half.

**The correct mitigation.** Originals immutable, stored on the filesystem with paths and digests in the database — never as BLOBs, which is why `06` has no BLOB column. Derived copies written beside them and regenerable at any time, so the derived directory can be emptied under pressure with no loss. Free space checked before an inspection is opened, not mid-capture:

```python
# health.py — a capacity check that fails at the gate, never mid-capture
import shutil
from fastapi import HTTPException

def evidence_free_gb() -> float:
    return shutil.disk_usage(settings.EVIDENCE_DIR).free / (1024 ** 3)

def assert_capacity_for_new_inspection() -> None:
    """Refuse to START work there is no room to finish.

    The failure must land here and nowhere else. A 507 raised on the third
    image of a five-image package leaves a scan with partial evidence, a
    findings set that will read `not_assessed` for reasons that have nothing
    to do with the package, and an officer standing in a shop with no way to
    record what they found.
    """
    free = evidence_free_gb()
    if free < settings.EVIDENCE_MIN_FREE_GB:
        raise HTTPException(
            507,
            detail=(f"Evidence store has {free:.1f} GB free, below the "
                    f"{settings.EVIDENCE_MIN_FREE_GB} GB floor. New inspections are "
                    f"blocked; captures already in progress will complete."),
        )
```

`GET /health` reports `evidence_free_gb` so the block is visible before an officer leaves the office, and the admin dashboard shows a banner from the same value. Retention is five years for **all** records regardless of verdict, per `06` §9, and it is a policy decision rather than a citation — the Seventh Schedule prescribes forms, not a retention period.

SQLite maintenance is `VACUUM INTO '/backup/niyamnetra-YYYYMMDD.db'`, which takes a consistent snapshot without stopping the service. A bare `VACUUM` takes an exclusive lock and rewrites the file in place; running it "weekly" as version 1.1 suggested will one day run during a sync.

### 2.2 Database growth

**What happens.** 3.8 M `findings` rows a year against 200 K `scans`. Unindexed, "violations by check this month" scans the larger table.

**The wrong fixes.** Version 1.1's four index statements — `scans(date)`, `scans(inspector_id)`, `scans(store_id)`, `scans(date, inspector_id)` — name **columns that do not exist**. `scans` holds `inspection_id` and `created_at`; the date, the officer and the store live on `inspections`. Copy those statements into a migration and it fails on the first one. Its archiving plan is worse: `INSERT INTO scans_archive SELECT … ; DELETE FROM scans WHERE date < …` orphans or cascades every `findings`, `scan_images` and `audit_logs` row that references those scans, so the "archive" step silently destroys the evidence rows and breaks the audit chain.

**The correct mitigation — the composite indexes reporting actually needs**, on real columns, added by an Alembic revision:

```sql
-- Reporting composites. Single-column indexes on the FKs are already declared
-- by index=True on the models; these are the ones the report queries need.
CREATE INDEX ix_insp_date_user   ON inspections (inspection_date, user_id);
CREATE INDEX ix_insp_store_date  ON inspections (store_id, inspection_date);
CREATE INDEX ix_scan_result_made ON scans (overall_result, created_at);
CREATE INDEX ix_find_check_verd  ON findings (check_id, engine_verdict);
CREATE INDEX ix_find_scan_check  ON findings (scan_id, check_id);
```

**Keyset pagination, not `OFFSET`.** `LIMIT 20 OFFSET 20000` makes the engine walk and discard twenty thousand rows, so page one thousand is a thousand times more expensive than page one, and a row inserted during paging shifts every later page by one and hides a record:

```sql
-- page 1
SELECT id, commodity_generic, overall_result, created_at
FROM scans WHERE inspection_id = :insp ORDER BY id DESC LIMIT 20;
-- page n: cursor is the last id of the previous page
SELECT id, commodity_generic, overall_result, created_at
FROM scans WHERE inspection_id = :insp AND id < :cursor ORDER BY id DESC LIMIT 20;
```

**Weekly buckets without dialect-specific SQL.** `strftime('%Y-%W', …)` is SQLite-only and `date_trunc('week', …)` is PostgreSQL-only; a query written with either fails on the other engine, which is precisely how version 1.x's second dashboard chart came to raise `OperationalError` on the database the project claims for production. Group by the date column, which both engines index, and roll up in Python over at most 366 rows:

```python
rows = db.execute(
    select(Inspection.inspection_date, func.count(Scan.id))
    .join(Scan, Scan.inspection_id == Inspection.id)
    .where(Inspection.inspection_date >= start)
    .group_by(Inspection.inspection_date)
).all()

buckets: dict[date, int] = {}
for d, n in rows:                       # ≤366 rows for a full year
    buckets[d - timedelta(days=d.weekday())] = buckets.get(
        d - timedelta(days=d.weekday()), 0) + n
```

No archive table. At the volumes in §1.1 the indexes carry the load for years, and every row is legally required to stay reachable. If a partition is ever needed, PostgreSQL declarative partitioning by `inspection_date` keeps the foreign keys intact — which the copy-and-delete approach does not.

### 2.3 Request concurrency around OCR

**What happens.** OCR is CPU-bound and takes seconds. Several officers submit at once and the work queues.

**The wrong fixes.** *Burst five frames, upload the sharpest, discard four* destroys four captures of the panel — and the discarded frames are exactly what a second opinion would want when the retained one is disputed. *Return 202 and poll `GET /scans/{id}/status`* introduces an endpoint that appears in no API surface in this document set, and `BackgroundTasks` has no durable queue behind it: a worker restart loses the task silently, leaving a scan that is never assessed, has no findings rows, and shows "processing" forever. *Rate-limit ten requests per minute per inspector* blocks the intended user — one package is five or six calls, so the third package in a minute is refused.

**The correct mitigation.** All captured frames are uploaded and retained; the sharpest is *selected for measurement* by `blur_variance`, and the others stay as `scan_images` rows with their own hashes. Upload and assessment are separate calls, so the evidence is committed and hashed before any processing can fail, and a slow assessment cannot time out an upload. Assessment stays synchronous — the officer is looking at the phone and wants the answer — with bounded concurrency and the blocking work off the event loop:

```python
# rules_engine entry point — bounded, honest under saturation
ASSESS_SEM = asyncio.Semaphore(settings.ASSESS_CONCURRENCY)   # default: cpu_count()

@router.post("/scans/{scan_id}/assess")
async def assess(scan_id: int, user: User = Depends(current_user)):
    try:
        await asyncio.wait_for(ASSESS_SEM.acquire(),
                               timeout=settings.ASSESS_QUEUE_WAIT_S)
    except asyncio.TimeoutError:
        # 503 + Retry-After, never a 200 with a short findings set.
        raise HTTPException(503, detail="Assessment queue is full; retry shortly.",
                            headers={"Retry-After": "10"})
    try:
        # PaddleOCR and OpenCV are blocking C extensions. Called directly in an
        # async handler they stall the event loop for every other request,
        # including the health check.
        ctx = await asyncio.to_thread(build_context, scan_id)
        return await asyncio.to_thread(run_and_persist, ctx)
    finally:
        ASSESS_SEM.release()
```

Rate limits are set where the threat is, not where the traffic is: **5 login attempts per minute** per `employee_id` and per IP, against credential stuffing, and a generous per-user ceiling (default 300/min) on everything else purely to bound accidental loops. A 429 on a login is a security control; a 429 on an inspector's fourth package is a bug.

### 2.4 Offline queue

**What happens.** No signal for two days, 60–160 packages captured, 0.5–3 GB pending, then everything wants to upload at once.

**The wrong fixes.** *`AsyncStorage`* is not in this project's stack — `07` specifies `expo-secure-store` for secrets and `expo-file-system` for files — and its Android backing store has a low single-digit-MB default limit, so version 1.1's own plan of "`{image_base64, …}` in AsyncStorage" fails after about five images. Base64 also inflates every image by a third for no benefit. *Priority: violations first* is not implementable: the verdict is computed on the server from the images being uploaded, so the client sorting its queue by verdict is sorting by a value it cannot possibly have. *Server wins on conflict, skip the duplicate* silently discards a field record — the two captures may be two genuinely different packets from the same shelf, and the one the server saw first is not more likely to be correct.

**The correct mitigation.** Images as files (`expo-file-system` on the phone, `idb` object store holding `Blob`s in the portal), metadata in a manifest file beside them, and nothing base64-encoded at any point. Upload in capture order, oldest first, **one inspection at a time** with exponential backoff on failure, so a flaky tower degrades throughput instead of losing records. Progress is reported per item, and the UI stays usable.

Idempotency by a client-generated key, because the failure mode that matters is a request that succeeded and whose response was lost:

```text
POST /scans            Idempotency-Key: 9f3c…  (UUIDv4, generated at capture)
POST /scans/{id}/images  Idempotency-Key: …    (one per panel per sequence)
```

The server stores the key and returns the original response for a repeat, so a retry after a timeout cannot create a second scan. This is specified here and belongs in `Backend.md` §8 as a small addition; the `UniqueConstraint("scan_id","panel","sequence")` already on `ScanImage` provides the same protection for images today.

A near-duplicate detected by pHash band match is recorded as a **review item with both copies retained** and `duplicate_of` set; aggregates exclude duplicates, records keep them. Nothing is ever silently merged or dropped.

Background Sync is registered where available and treated as an optimisation only: it does not exist on iOS Safari, so a visible "Sync now" affordance and an on-launch sync are the actual mechanism.

### 2.5 Report generation

**What happens.** An inspection with 50 packages holds 200–250 originals at 3–4 MB. Embedding them all produces a document too large to open on a phone, and building it in memory first is what actually falls over.

**The wrong fix.** Version 1.1 embedded evidence images "only for Bad records — Good needs only one thumbnail". A compliant finding is exactly the one somebody may later dispute, and a report whose evidence appendix contains only the violations cannot be used to defend a clean verdict. It also quoted "~17 MB PDF, not 160 MB — 9× smaller", a figure for a document nobody had generated.

**The correct mitigation.** The report embeds **derived display copies** — rectified, ≤1600 px, EXIF stripped, quality 85 — for every scan and every panel, plus the cropped region behind each `fail` and each `not_assessed`. Originals are never embedded and never need to be: the report prints each image's `sha256` and the URL of `GET /scans/{id}/verify`, so anyone can obtain the original bytes and confirm they match. That is a stronger evidentiary position than a fat PDF, and a much smaller one.

Generation streams page by page through `StreamingResponse` rather than assembling the document in memory.

Caching is keyed on content, not on the inspection id:

```python
# Cache key must change when anything the report renders changes.
key = sha256("|".join([
    str(inspection.id),
    inspection.status,
    str(max_findings_mtime),      # bumped by every assess and every override
    scan_count_and_max_scan_id,
    catalog_hash,
    engine_version,
    TEMPLATE_VERSION,
]).encode()).hexdigest()
```

Version 1.1 cached by inspection id alone. Re-assessment replaces the findings rows, so with that key an officer who corrected an OCR error and re-assessed, or a supervisor who overrode a finding, would download **the pre-override PDF** — a stale enforcement document served as current. That is an evidence defect wearing a performance optimisation's clothes, and it is the reason this cache key includes a findings fingerprint.

### 2.6 Dashboard

**What happens.** Charts over hundreds of thousands of rows; a hundred-bar chart nobody can read.

**The wrong fixes.** *`functools.lru_cache`* has no TTL, so the first admin of the day pins the dashboard to that moment until the process restarts — and applied to a method it retains `self` and leaks the session. *Redis* is not in the stack. *`visx`* is not in the stack. Aggregating by `violation_type` names a column that does not exist; check identity lives in `findings.check_id`.

**The correct mitigation.** Aggregate in SQL over `findings`, with the top-N and the remainder both computed in the database:

```sql
SELECT f.check_id, COUNT(*) AS n
FROM findings f
JOIN scans s       ON s.id = f.scan_id
JOIN inspections i ON i.id = s.inspection_id
WHERE i.inspection_date >= :start
  AND f.engine_verdict = 'fail'
  AND s.duplicate_of IS NULL
GROUP BY f.check_id
ORDER BY n DESC;
```

Nineteen possible values means nineteen rows at most, so the chart takes the top ten and sums the rest into "others" without a second query. Recent activity is `LIMIT 10` in SQL. Tables paginate by keyset. `isAnimationActive={false}` on the large series.

Caching uses a TTL cache with a bound, per worker:

```python
from cachetools import TTLCache
_dash = TTLCache(maxsize=64, ttl=settings.DASHBOARD_CACHE_TTL_SECONDS)  # default 60
```

With *N* workers there are *N* independent caches, so the observed staleness window is up to the TTL regardless of which worker answers — acceptable for a trend chart at a 60-second TTL.

**The review-queue badge is never cached.** `08` requires the badge to equal the contents of the queue, and a cached count against a live list is how the two come to disagree — the officer clicks a badge showing four and finds three items, which reads as a lost record.

### 2.7 Workers, and the state that does not survive them

**What happens.** `uvicorn main:app --workers 4` is the obvious throughput answer, and it quietly breaks three things.

**SQLite plus four workers is worse than one.** WAL lets readers proceed during a write; it does not let two writers proceed. Four processes writing scans, findings and audit rows to one file serialise on the write lock and start returning `database is locked` under exactly the concurrency the workers were added for. So: **one worker on SQLite** for development and the demo, multiple workers only on PostgreSQL. `Backend.md` §14's run line shows `--workers 4` and needs the same qualification.

**In-memory state multiplies by the worker count.** A rate limiter holding counters in a dict permits `4 × limit` with four workers, and the caches in §2.6 diverge. Both are acceptable if the multiplication is *known*; the failure is asserting "10 requests per minute" while shipping forty.

**Sequence allocation is the one that corrupts data.** The audit chain reads `MAX(seq)` and writes `MAX(seq)+1`. Two workers reading concurrently both compute the same next value; the `UNIQUE` constraint on `seq` rejects one, which is the constraint doing its job — but a naive retry recomputes `hash_prev` from a different predecessor and appends a **fork** that verifies locally and fails globally. Allocation must happen inside the same transaction that inserts the row, under `SELECT … FOR UPDATE` on PostgreSQL or the write lock on SQLite, and a rejected insert must re-read the head rather than reuse the hash it already computed.

```bash
# development / demo — SQLite
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# production — PostgreSQL only
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 2.8 Phone storage

**What happens.** Two days offline at 60 packages a day is 0.5–1.5 GB of pending captures on a phone that may have 4 GB free.

**The wrong fixes.** Base64 in a key-value store, as in §2.4. *Store only thumbnails offline* means the evidence never existed — the original is the only thing that can be hashed, and a thumbnail cannot be measured.

**The correct mitigation.** Originals as files under `FileSystem.documentDirectory + "pending/"`, one directory per pending inspection, with a small JSON manifest. Free space checked with `FileSystem.getFreeDiskStorageAsync()` **before** the capture screen opens, with a warning banner below 2 GB and a hard block below 500 MB that says what to do ("14 inspections pending, about 900 MB — sync when you have signal"). Local files are deleted only after the server has acknowledged the upload *and* returned the matching `sha256`, so a partially completed sync never loses the original. Nothing is dropped to make room; the app refuses to start new work instead.

---

## 3. BACKPRESSURE POLICY

| Resource | Signal | Response | Never |
|---|---|---|---|
| Server evidence disk | `evidence_free_gb` under floor | 507 on new inspections, banner on the dashboard, in-flight captures complete | Delete or downscale stored evidence |
| Assessment CPU | Semaphore wait exceeds `ASSESS_QUEUE_WAIT_S` | 503 with `Retry-After` | Return 200 with fewer than 19 findings |
| Login endpoint | 5/min per `employee_id` or IP | 429 with `Retry-After` | Lock the account permanently |
| Other endpoints | 300/min per user | 429 | Throttle a legitimate capture sequence |
| Upload size | Over `MAX_UPLOAD_MB` (25) | 413, naming the limit | Silently downscale to fit |
| Pixel count | Over `MAX_IMAGE_PIXELS` | 413, decompression-bomb guard | Reject an honest large capture |
| Phone free space | Under 2 GB warn, 500 MB block | Banner, then block new captures | Delete pending originals |
| Offline queue depth | Any | Upload oldest first, one at a time, backoff | Flood, or reorder by verdict |
| Report size | Any | Derived display copies + hashes + verify URL | Omit evidence for compliant scans |

The pattern is the same everywhere: **refuse at the entrance, in a way the user can act on.** A rejection an officer can read and respond to is recoverable; a silent degradation of stored evidence is not.

---

## 4. CONFIGURATION

These keys are the capacity subset of the `Settings` class in `Backend.md` §3 and must match `14_env_example.md` exactly. `Settings` is configured `extra="forbid"`, so a key in `.env` that is not a field on `Settings` stops the application at startup — which is the desired behaviour, and the reason nothing invented locally may appear in `.env`.

| Key | Default | Meaning |
|---|---|---|
| `MAX_UPLOAD_MB` | `25` | Per-image cap. Not 5 — see §1 |
| `MAX_IMAGE_PIXELS` | `80_000_000` | Decompression-bomb guard |
| `EVIDENCE_DIR` | `backend/evidence` | Originals; never inside the source tree in production |
| `OUT_DIR` | `backend/out` | Derived copies, generated reports, published chain head |
| `EVIDENCE_MIN_FREE_GB` | `5.0` | Below this, new inspections are refused |
| `DERIVED_MAX_WIDTH_PX` | `1600` | Display copies only; the original is never resized |
| `ASSESS_CONCURRENCY` | `0` → `os.cpu_count()` | Parallel assessments |
| `ASSESS_QUEUE_WAIT_S` | `20` | Then 503 with `Retry-After` |
| `RATE_LIMIT_LOGIN_PER_MIN` | `5` | Per `employee_id` and per IP |
| `RATE_LIMIT_API_PER_MIN` | `300` | Per user; a loop guard, not a throttle |
| `DASHBOARD_CACHE_TTL_SECONDS` | `60` | Per worker. Never applied to the review-queue badge |
| `MIN_PANEL_PIXEL_HEIGHT` | `400` | Below this no scale is established (§2.1 of `02` §7.4) |

Three values deliberately are **not** environment variables. The report cache lives under `OUT_DIR` and needs no key of its own. The client-side pending-queue warning threshold (10 items) belongs to the app, not the server. And the five-year retention period is a policy in `06` §9 that no code reads — a retention knob in `.env` invites someone to shorten it.

Removed from version 1.1: `MAX_IMAGE_SIZE_MB=5`, `MAX_STORAGE_GB=10` with its auto-delete behaviour, `MAX_SCANS_PER_DAY_PER_INSPECTOR=1000` (a cap on an officer's lawful work), `BATCH_SYNC_SIZE=10`, `OFFLINE_QUEUE_MAX=10` (a limit that discards captures) and `DB_ARCHIVE_DAYS=30`.

---

## 5. LOAD TESTS THAT MEASURE SOMETHING

Version 1.1's load test was `ab -n 100 -c 10 http://localhost:8000/docs`. That measures how fast FastAPI serves a static Swagger page; it touches no database, no image, and no OCR. Delete it.

**Assessment throughput.** Seed 20 inspections with real captures. Fire `POST /scans/{id}/assess` at concurrency 1, 4 and 16. Record p50 and p95 latency, the count of 503s, and CPU. The pass condition is not a latency number — it is that **every response is either a complete 19-finding assessment or a 503**, with nothing in between.

**Report generation.** One inspection with 50 scans and 250 images. Generate the PDF cold, then warm. Record size, wall time and peak RSS. Then override one finding and regenerate: the document must change, which is the §2.5 cache-key test.

**Query cost at volume.** Script 200 K scans and 3.8 M findings rows — metadata only, no image files. Run all five report queries plus the dashboard aggregate on both SQLite and PostgreSQL with `EXPLAIN QUERY PLAN` / `EXPLAIN ANALYZE`. The pass condition is that no plan contains a full scan of `findings`.

**Keyset pagination.** Page to record 100 000 and confirm the per-page cost is flat. With `OFFSET` it will not be, which is the point of the test.

**Offline drain.** Queue 40 captures with the network off. Restore it and confirm all 40 arrive exactly once, in capture order, with matching digests, and that killing the app mid-sync loses nothing. Then replay one upload with the same `Idempotency-Key` and confirm no second row.

**Disk floor.** Set `EVIDENCE_MIN_FREE_GB` above the actual free space. Confirm `POST /inspections` returns 507 with a readable message, an in-progress capture still completes, and `/health` reports the condition.

**Every figure is reported with the machine attached** — CPU, RAM, Python version, engine — because a p95 without a machine is not a measurement. Version 1.1's "OCR 3-5 sec", "Today's Report <50 ms", "dashboard <1 sec" and "PDF ~17 MB" were written before any of it existed.

---

## 6. ANSWERING THE SCALABILITY QUESTION

When a judge asks "what happens at a thousand scans a day", the answer is arithmetic before architecture.

A thousand scans is twelve to thirty officer-days of real work, so it is a district's daily total rather than one officer's. It is 19 000 `findings` rows and roughly 15 GB of evidence per day. The rows are indexed and the queries are keyset-paginated, so the database does not notice. The evidence is 5 TB a year, which is a disk and a documented backup, and it must be kept because it is enforcement material. Assessment is CPU-bound at a few seconds per scan, so a thousand scans is about an hour of one core — a second worker on PostgreSQL, not a redesign.

Then the part worth saying out loud: **the system's response to overload is to refuse work, not to lower its standards.** Under pressure it will not compress an image, drop a frame, skip a check, shorten a findings set, or serve a cached report that predates an override. There is a test for each of those, and that is the scalability claim — not a throughput number.

---

## 7. CORRECTIONS LOG — what version 1.1 got wrong

| # | Where | Defect | Now |
|---|---|---|---|
| 1 | §2.1 L1 | Compress to 800 KB and resize to 1280 px **before upload** | Originals at capture resolution; derived copies only (§1) |
| 2 | §2.1 L1, §2.3 | Burst 5, keep sharpest, **discard 4** | All frames retained; sharpest selected for measurement |
| 3 | §2.1 L2 | Reject images over 5 MB with an error | `MAX_UPLOAD_MB=25` plus a pixel-count guard |
| 4 | §2.1 L2 | pHash duplicate → **reuse the existing file** | Never; a collision is not identity (§2.1) |
| 5 | §2.1 L3 | Auto-delete "oldest Good records"; keep "Bad" 5 years | Five years for all records, all verdicts |
| 6 | §2.1 L3 | Cold storage on **Supabase Storage** | Not in the stack; local disk plus backup |
| 7 | §2.1 L3 | Weekly bare `VACUUM` | `VACUUM INTO` snapshot; no exclusive lock |
| 8 | §2.2 | Four `CREATE INDEX` statements on **columns that do not exist** | Real composites on `inspections`/`scans`/`findings` |
| 9 | §2.2 | `scans_archive` by INSERT-then-DELETE | No archive; it would orphan findings, images and audit rows |
| 10 | §2.2 | `LIMIT 20 OFFSET n` pagination | Keyset pagination |
| 11 | §2.2, §2.6 | `strftime('%Y-%W', …)` and `date('now','-7 days')` — SQLite-only | Group by date in SQL, bucket in Python |
| 12 | §2.3 | `POST /inspections/{id}/scans` doing upload and OCR in one call | `POST /scans` → `/images` → `/assess` |
| 13 | §2.3 | `BackgroundTasks` + 202 + `GET /scans/{id}/status` | Synchronous bounded assess; no undurable queue, no phantom endpoint |
| 14 | §2.3 | Rate limit 10/min per inspector | 5/min on login; 300/min elsewhere |
| 15 | §2.3 | Blocking OCR called directly in an async handler | `asyncio.to_thread` |
| 16 | §2.4, §2.8 | `AsyncStorage`, and images as base64 | `expo-file-system` files; no base64 anywhere |
| 17 | §2.4 | Sync priority "Bad records first" | Capture order; the client has no verdict to sort by |
| 18 | §2.4 | "Server wins, skipping duplicate" | Review item, both copies retained, `duplicate_of` set |
| 19 | §2.4 | Background Sync presented as reliable | Optimisation only; absent on iOS Safari |
| 20 | §2.4 | No idempotency; a lost response creates a second scan | `Idempotency-Key` on `POST /scans` and `/images` |
| 21 | §2.5 | Evidence images "only for Bad records" | Display copies for every scan, plus crops for fails and abstentions |
| 22 | §2.5 | Report cache keyed on inspection id | Keyed on findings fingerprint, catalogue hash and template version |
| 23 | §2.6 | `functools.lru_cache`; Redis; `visx`; `violation_type` column | `cachetools.TTLCache`; `findings.check_id`; no new dependencies |
| 24 | §2.6 | Dashboard counts cached uniformly | Review-queue badge never cached; it must match its contents |
| 25 | §2.7 | `--workers 4` with SQLite | One worker on SQLite; four only on PostgreSQL |
| 26 | §2.7 | Per-worker state not considered | Documented: limits and caches multiply; `seq` allocation is transactional |
| 27 | §3, §2.1 | Overflow handled mid-request | Refused at the gate with an actionable message |
| 28 | §4 | `MAX_SCANS_PER_DAY_PER_INSPECTOR`, `OFFLINE_QUEUE_MAX` | Removed; neither may cap lawful work or discard captures |
| 29 | §5 | `ab` against `/docs`; Postman for concurrency | Six tests that touch the database, the images and the engine |
| 30 | §1, §5, §6 | "50–100 shops/day", "1000 scans/day/officer", "<50 ms", "~17 MB" | Realistic arithmetic; figures reported with the machine |
| 31 | §2.1, §2.5 | Thumbnails treated as evidence substitutes | §1.2 separates evidence from derived artifacts |
| 32 | §6 | "Why this wins SIH", built on the invented figures | Arithmetic first, then the refusal-not-degradation claim |

---

*End of Capacity, Load and Overflow v2.0. Volumes here follow `04_NiyamNetra_PRD.md` §1.2 and §6; column names follow the models in `Backend.md` §2; the evidence rules follow `09_SECURITY.md`; the tests extend `10_TESTING.md`.*
