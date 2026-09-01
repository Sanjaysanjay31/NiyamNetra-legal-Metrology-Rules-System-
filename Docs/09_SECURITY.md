# NiyamNetra - Security Architecture
### Smart India Hackathon 2026 - Problem Statement SIH26034 - Threats and Controls
**Version:** 2.1 | **Date:** 30 Aug 2026 | **Revised:** 30 Aug 2026
**Path:** C:\Skills\Projects\NiyamNetra\Docs\09_SECURITY.md
**Scope:** Threat model, authentication and authorisation, evidence integrity, hash-linked audit trail, API hardening, SSRF and injection defence, offline sync security, report integrity, DPDP Act 2023 position

---

## 1. SECURITY PHILOSOPHY

NiyamNetra produces material that may be handed to a shopkeeper as a notice and, later, tendered in a prosecution. That single fact sets the standard for every control in this document: an integrity claim we cannot demonstrate on demand is worse than no claim at all, because it invites a challenge we lose. The system therefore prefers controls that are cheap to verify in front of a sceptical reader — a recomputable hash, an append-only chain, a stored reason for every override — over controls that sound impressive but cannot be exhibited.

Three consequences follow, and they explain most of the design decisions below.

First, **nothing silently passes**. Every check returns `pass`, `fail` or `not_assessed`, and `not_assessed` carries a mandatory reason. A check that could not run says so. This is a security property, not merely a UX one: a control that degrades into a default `pass` when a photograph is blurred is an integrity failure dressed as a feature.

Second, **the client is never trusted for anything that matters**. Timestamps, verdicts, identity and sequence numbers are server-authoritative. The client is a capture device and a rendering surface.

Third, **the app is strictly offline and stays that way**. No hosted vision model, no hosted language model, no cloud object store, no external service in the evidence path. This is partly a procurement and connectivity reality for field work, and partly an evidence argument: every transformation applied to an image must be one we can name, reproduce and defend, which rules out anything that generates pixels rather than adjusting them.

---

## 2. THREAT MODEL

Threats T1 to T10 were carried forward from v1.1 with their controls corrected. T11 to T15 are new in v2.0; T11, T12 and T13 in particular were absent from the v1.1 model, and document 12 §7 records SSRF as the most serious unaddressed vulnerability in the design as it then stood.

| ID | Threat | Vector | Primary control | Residual risk |
|----|--------|--------|-----------------|---------------|
| T1 | Inspector impersonation | Stolen or shared credentials | bcrypt password hashing, device-bound `install_id`, admin approval on device change | Coerced legitimate login |
| T2 | Evidence substitution | Replacing a stored image after upload | SHA256 over bytes as stored, recomputed on read; immutable rows and files | Substitution before capture (staged photograph) |
| T3 | Record tampering | Direct database edit or API replay | Hash-linked append-only audit chain, externally published head hash | Full-stack compromise with chain rebuild, detectable via published head |
| T4 | Location falsification | Mock location provider | Server-side geofence against registered store coordinates | Mock GPS is trivially available on Android; treat location as corroborating, never as proof |
| T5 | Image reuse across stores | Same photograph submitted for many premises | Perceptual hash review item, banded index lookup | Legitimate collisions require human adjudication |
| T6 | Offline verdict manipulation | Editing a queued record before sync | Single-use capture tokens, per-batch signature, server-authoritative timestamps | Device-level compromise |
| T7 | Report forgery | Editing a downloaded PDF | Report byte hash recorded in the audit chain, QR pointing at an HTTPS verification endpoint | An offline reader cannot verify without reaching the endpoint |
| T8 | Privilege escalation | Inspector calling an admin route | Dependency-enforced role checks at the API layer | Misconfigured new route; covered by route inventory test |
| T9 | Credential interception | Token capture on shared WiFi | HTTPS in production, refresh token in an httpOnly cookie, access token in memory only | Compromised device |
| T10 | Data loss | Storage failure | Local filesystem and database backups with verified restore drill | Site loss without off-site copy |
| T11 | SSRF via operator-supplied listing URL | E-commerce checks fetch a typed URL | Scheme allowlist, resolve-then-connect IP validation, domain allowlist, no redirects, unprivileged worker | Allowlisted marketplace serving hostile content |
| T12 | XSS leading to token theft | OCR text and typed store names rendered in the portal | React default escaping, no `dangerouslySetInnerHTML`, strict CSP without `unsafe-inline`, token in memory | Injection into a non-React surface such as a generated report |
| T13 | IDOR / broken object-level authorisation | Guessing another inspector's record id | Query-level scoping to the authenticated principal | New endpoint written without scoping; covered by test |
| T14 | Sync-queue poisoning | Replayed or forged offline batch | Idempotency keys, single-use capture tokens, per-batch signature | Signing key extracted from a rooted device |
| T15 | Upload denial of service | Oversized, over-numerous or decompression-bomb images | Size cap, count cap, per-account rate limit, Pillow `MAX_IMAGE_PIXELS` guard | Distributed abuse from many valid accounts |

### 2.1 T11 - SSRF via an operator-supplied listing URL

The e-commerce checks (the two that need a web listing) fetch a URL that an operator types into a form. Unmitigated, this is a request forgery primitive pointed at our own infrastructure: the operator types `http://169.254.169.254/latest/meta-data/`, or an internal hostname, or `http://127.0.0.1:8000/admin/...`, and the backend obligingly fetches it and shows the operator the response. Cloud metadata endpoints are the classic target because they hand out credentials to anyone who asks from the right network position.

The mitigation is layered, and the ordering of the layers is the part that is easy to get wrong.

```python
import ipaddress, socket
from urllib.parse import urlparse

ALLOWED_HOSTS = {"amazon.in", "www.amazon.in", "flipkart.com", "www.flipkart.com"}
BLOCKED_NETS = [
    ipaddress.ip_network("10.0.0.0/8"), ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"), ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"), ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"), ipaddress.ip_network("fe80::/10"),
]

def resolve_and_validate(url: str) -> str:
    parts = urlparse(url)
    if parts.scheme != "https":
        raise ValueError("only https listing URLs are accepted")
    if parts.hostname not in ALLOWED_HOSTS:
        raise ValueError("host is not an allowlisted marketplace")
    infos = socket.getaddrinfo(parts.hostname, 443, proto=socket.IPPROTO_TCP)
    addrs = {info[4][0] for info in infos}
    for addr in addrs:
        ip = ipaddress.ip_address(addr)
        if any(ip in net for net in BLOCKED_NETS) or not ip.is_global:
            raise ValueError(f"host resolves to a non-public address: {addr}")
    return sorted(addrs)[0]  # connect to this literal IP, not to the name
```

The controls, and why each exists:

- **https-only scheme allowlist.** Blocking `file://`, `gopher://` and `ftp://` removes local file disclosure and protocol-smuggling entirely rather than trying to sanitise it.
- **Resolve DNS, validate the resolved IP, then connect to that literal address.** Validating the hostname alone is useless because an attacker controls what their name resolves to. Connecting by name after validating would reopen the same hole through DNS rebinding: the first lookup returns a public address, the second returns `169.254.169.254`. Resolving once and connecting to the resolved literal closes that window.
- **No redirect following.** A 302 to an internal address bypasses every check performed on the original URL.
- **Domain allowlist of known marketplaces.** The checks only have meaning against a listing on a marketplace we understand, so restricting to those domains costs nothing and removes the general-purpose fetcher.
- **Short timeout and a hard response size cap.** Prevents the fetcher being used to tie up workers or to stream unbounded data into memory.
- **The fetch runs in a worker with no ambient credentials** and no access to internal service networks, so a bypass yields a response from the public internet and nothing else.

### 2.2 T12 - XSS leading to token theft

OCR output is attacker-influenced text: a label can be printed with `<img src=x onerror=...>` on it, and operators type store names by hand. Both are rendered in the portal. React escapes interpolated content by default, so the risk is entirely in the exceptions we might make. The rules are therefore stated as prohibitions:

1. **Never `dangerouslySetInnerHTML`** anywhere in the portal. There is no requirement in this application that needs it; highlighting OCR spans is done with element nodes and CSS, not with an HTML string.
2. **A strict Content-Security-Policy with no `unsafe-inline`.** Without it, a single injection that reaches the DOM executes; with it, inline script is refused even if an escaping bug exists. `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
3. **The access token lives in JavaScript memory only.** This is why the token storage decision in §3.2 is a defence against XSS rather than a convenience: injected script cannot read a variable it has no reference to, whereas `localStorage` is readable by any script on the origin. The refresh token sits in an httpOnly cookie, which script cannot read either.

### 2.3 T13 - IDOR / broken object-level authorisation

Every endpoint that accepts an identifier must scope its query to the authenticated principal, rather than fetching the object and then checking it. Filtering after the fetch leaks existence through timing and error differences and, more importantly, is the pattern that gets forgotten under deadline.

```python
# WRONG - `user_id` has no path placeholder, so FastAPI parses it as a QUERY
# parameter. The caller supplies their own id, the comparison always succeeds,
# and the dependency is vacuous while looking like a real authorisation check.
def require_owner_or_admin(user_id: int, current_user=Depends(get_current_user)):
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(403)

# RIGHT - scope the query itself to the authenticated principal.
@router.get("/inspections/{inspection_id}")
def get_inspection(inspection_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    q = select(Inspection).where(Inspection.id == inspection_id)
    if user.role != "admin":
        q = q.where(Inspection.inspector_id == user.id)
    row = db.execute(q).scalar_one_or_none()
    if row is None:
        raise HTTPException(404)  # same response whether absent or not ours
```

A missing row and a row belonging to someone else both return 404, so the API does not confirm that a record exists to a caller who may not see it.

### 2.4 T14 - Sync-queue poisoning

The offline queue is a batch of records the server did not observe being created, which makes it the softest input in the system. Four controls together make a forged or replayed batch impractical: a **single-use capture token** issued when a scan is started and consumed on sync, so a record cannot be minted from nothing; **server-authoritative timestamps**, with the client-supplied time stored separately as a claim rather than as fact; an **idempotency key** per record so a replayed batch is absorbed rather than duplicated; and a **per-batch signature** over the canonicalised payload using the device key, so a batch reassembled in transit fails verification. A record whose client timestamp and server receipt time diverge implausibly is flagged for review rather than rejected, because a genuinely long offline shift produces exactly that pattern.

### 2.5 T15 - Upload denial of service

Uploads are capped on **size** (per file), on **count** (per scan and per batch), and by a **per-account rate limit**. Separately, decompression bombs are guarded explicitly: a small PNG can declare enormous dimensions and exhaust memory during decode, before any of our own validation sees an image object.

```python
from PIL import Image
Image.MAX_IMAGE_PIXELS = 80_000_000  # decode refuses beyond this, raising rather than allocating
```

---

## 3. AUTHENTICATION

### 3.1 Password security

Passwords are hashed with Passlib and bcrypt at cost factor 12 and never stored in reversible form; registration calls `pwd_context.hash(...)` and login calls `pwd_context.verify(...)`. The cost factor is the control: it makes an offline attack against a stolen `users` table expensive per guess rather than free. Policy is a minimum of eight characters containing at least one letter and one digit, enforced in the Pydantic schema so that it is applied uniformly by every caller rather than per route.

### 3.2 JWT tokens

| Property | Value | Why |
|----------|-------|-----|
| Access token lifetime | 12 hours | Covers a full field shift with no network; a shorter life would strand an inspector mid-inspection |
| Refresh token lifetime | 30 days | Bounded re-authentication interval for a field device |
| Access token storage | Client memory only | Unreadable by injected script; never `localStorage` or `sessionStorage` |
| Refresh token storage | httpOnly, `Secure`, `SameSite=Strict` cookie | Script cannot read it, and it is not attached to cross-site requests |
| Algorithm | HS256 with a secret from the environment | Single trust domain; no key distribution requirement |
| Binding | `install_id`, revocable per device | A stolen token is useless from another install |

The payload is exactly `sub`, `role`, `install_id`, `jti`, `token_type`, `iat`, `exp`. The `token_type` claim is load-bearing rather than decorative: without it, a 30-day refresh token is structurally indistinguishable from an access token and can be presented as one, silently converting the refresh lifetime into the access lifetime. Every access-path dependency asserts `token_type == "access"` and rejects anything else. `jti` gives per-token revocation, which is what makes "revoke this device" a real operation.

The v1.1 design stored the token in `localStorage` on the portal and `AsyncStorage` in the app, used a single 24-hour token with no refresh, and put `user_id` and `email` in the payload. All of that is superseded above.

A startup assertion refuses to run with a placeholder secret, because the failure mode otherwise is silent and total: every token in the system is forgeable by anyone who has read the repository.

```python
SHIPPED_DEFAULT = "niyamnetra_secret_2026_sih"

def assert_jwt_secret_is_safe(secret: str | None) -> None:
    if not secret or secret == SHIPPED_DEFAULT or len(secret) < 32:
        raise RuntimeError(
            "JWT_SECRET is missing, too short, or still the shipped default - refusing to start"
        )

assert_jwt_secret_is_safe(settings.JWT_SECRET)  # called during application startup
```

### 3.3 Device binding

Each account is bound to a server-issued random 32-byte `install_id`, generated on first registration of a device and held in the platform keystore — Android Keystore via `expo-secure-store`, iOS Keychain — so it is not readable from application storage or from a filesystem backup. A change of `install_id` requires administrator approval, which is what turns credential sharing into a visible event rather than an invisible one.

Two identifiers proposed in v1.1 are deleted and must not return. **IMEI** has not been available to ordinary Android applications since Android 10 — `getImei()` throws for non-privileged callers — so any design that depends on it simply does not run. **Browser fingerprinting** is both unreliable, changing with a browser update or a new window size, and a privacy problem we have no lawful basis to create. Where stronger device assurance is genuinely needed, the honest mechanisms are the platform attestation services: **Play Integrity API** on Android and **DeviceCheck** on iOS.

### 3.4 Government SSO (future)

Production integration with Parichay, with OTP to a registered official number, is the intended path. It is recorded here as future work and no part of the current design depends on it.

---

## 4. AUTHORISATION

### 4.1 Authorisation lives in the API layer

**PostgreSQL Row Level Security has been removed from this design.** v1.1 proposed RLS policies on `scans`, including a call to a `current_user_id()` function that does not exist in PostgreSQL and was never defined by us. The deeper problem is that RLS cannot work in this architecture at all: the application connects to the database as a single service account, so from the database's point of view every request arrives as the same principal and no policy can distinguish one inspector from another. The identity a policy would need lives in the JWT, which the database never sees. A `SET app.current_user_id` per request would only re-encode application-layer trust as a database setting the application itself controls — the appearance of a second enforcement layer without the substance. Authorisation is therefore enforced once, in the API layer, by scoping every query to the authenticated principal as shown in §2.3.

### 4.2 Roles

**Admin** (Controller, State or Central) may see all inspections, manage users, manage rules, adjudicate findings, view dashboards and export any report. **Inspector** (field officer) may create inspections, capture scans, view their own inspections and reports, and propose overrides; they may not see another inspector's data and may not manage users or rules.

### 4.3 Enforcement layers

The portal and the mobile app hide administrative surfaces when the role is not `admin`, but this is presentation only and is never relied upon — a hidden button is not an access control. Enforcement is a FastAPI dependency on every route: `Depends(get_current_admin)` for administrative routes, which raises 403 for any other role, and principal-scoped queries everywhere else. A route inventory test asserts that every registered route resolves a `get_current_user` dependency, so a new endpoint added without one fails the suite instead of shipping open.

### 4.4 Permission matrix

| Capability | Inspector | Admin |
|-----------|-----------|-------|
| Create inspection | Yes | Yes |
| Capture scan | Yes | No |
| View own inspections and findings | Yes | Yes (all) |
| View another inspector's data | No | Yes |
| Manage inspectors | No | Yes |
| Manage rules and rule versions | No | Yes |
| Adjudicate a finding | Propose only | Yes |
| View audit log | Own entries | All |
| Export report | Own | All |

Seed accounts use the `@example.test` domain. A seeded account must never carry a `gov.in` address, because a demonstration credential that looks official is a credential someone will eventually treat as official.

---

## 5. EVIDENCE INTEGRITY

### 5.1 The hash is computed over the bytes as stored

The SHA256 recorded in `scan_images.sha256` is computed over the exact byte sequence that remains on disk. This corrects the most dangerous ambiguity in v1.1: hashing an upload and then re-encoding, resizing or stripping metadata from the file that is kept makes the stored hash unreproducible, which defeats the entire court-readiness argument at the first moment anyone tries to check it. The original file is kept verbatim, and display or thumbnail copies are derived into separate files with their own hashes.

```python
raw = await upload.read()
sha256 = hashlib.sha256(raw).hexdigest()
dest.write_bytes(raw)          # stored verbatim - the hash above describes this file
make_display_copy(raw, other)  # derived separately, never overwrites the original
```

For the same reason, GPS and capture time are **not** written into the stored file's EXIF. They are stored in database columns. Writing metadata into the evidence file after hashing would change the bytes and break verification; writing it before hashing would mean the hash covers a file we modified, which is exactly the claim we are trying to avoid making.

On retrieval the hash is recomputed from disk and compared. A mismatch blocks the view, raises a `tamper_detected` entry in the audit log naming the scan and image, and surfaces on the administrator dashboard. Hashes live on `scan_images` rows, one per image, not in a JSON array on `scans` — a JSON blob cannot be indexed, constrained or made immutable per row.

### 5.2 Permitted processing is classical and non-generative

Only CLAHE contrast equalisation, unsharp masking, deskew and four-point perspective rectification may be applied, and every operation applied to a derived copy is recorded in `scan_images.enhancements`. The boundary is not stylistic. **Generative super-resolution is prohibited outright** because it invents glyphs: a model asked to sharpen an illegible net-quantity declaration will produce plausible characters that were never printed, and a finding built on invented characters is a fabricated finding. **Error Level Analysis is likewise removed** — it is unreliable on images that a phone camera pipeline has already re-encoded, and its failure mode is confident nonsense, which is the worst possible property for something offered as tamper evidence. Sticker and overlay detection stays, but is presented as a prompt for the officer to inspect the packet physically, not as a determination.

### 5.3 Immutability of evidence rows and files

Rows in `scans`, `scan_images` and `findings` are immutable once written, and stored evidence files are never modified in place; corrections are new rows with an audit entry recording the reason. Immutability is enforced by database triggers in **both** engines. A trigger that exists only in SQLite development is an integrity control that is absent from production, which is precisely where it is needed.

```sql
-- SQLite (development)
CREATE TRIGGER scan_images_no_update BEFORE UPDATE ON scan_images
BEGIN SELECT RAISE(ABORT, 'scan_images is immutable'); END;

-- PostgreSQL (production) - same guarantee, same tables
CREATE FUNCTION deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: update and delete are refused', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER scan_images_no_update BEFORE UPDATE OR DELETE ON scan_images
FOR EACH ROW EXECUTE FUNCTION deny_mutation();
```

### 5.4 Perceptual hashing opens a review item, never an accusation

A pHash match raises a **review item** for a human to adjudicate. It never asserts fraud and no verdict is derived from it, because the same product photographed twice in good faith — the same brand, the same shelf, the same lighting — collides legitimately. Treating a collision as proof of reuse would generate accusations we cannot sustain.

Lookup uses a banded index rather than a full-table scan per upload. The 64-bit hash is split into **eight 8-bit bands**, each stored in its own indexed column; candidates are those sharing at least one band, and exact Hamming distance is computed only over that candidate set.

Eight and not four, because the completeness bound is *distance ≤ bands − 1*: d differing bits touch at most d bands, so k − d bands survive identical. Four bands would guarantee nothing above distance 3, and the near-duplicate threshold here is 5 — bits {5, 9, 16, 38, 50} differ in all four 16-bit bands at distance 5, so that pair would never become a candidate and the control would silently miss exactly the case it exists for. `06_DATABASE.md` §6.3 carries the arithmetic and `10_TESTING.md` §7 tests it against brute force.

```sql
SELECT id, phash FROM scan_images
WHERE phash_b0 = :b0 OR phash_b1 = :b1 OR phash_b2 = :b2 OR phash_b3 = :b3
   OR phash_b4 = :b4 OR phash_b5 = :b5 OR phash_b6 = :b6 OR phash_b7 = :b7;
-- exact Hamming distance is then evaluated in application code over these rows only
```

An identical `sha256` is a separate and stronger signal: the same *file* was submitted twice, which is a fact rather than an inference. It is still adjudicated by a human, because re-uploading the same capture is a common honest mistake.

### 5.5 Location and time binding

Capture location comes from `expo-location` or the browser geolocation API and is checked server-side against the registered store coordinates by haversine distance, with submissions outside the geofence blocked and the distance recorded. Time is server time; the client's clock is stored as a claim, never as the record. Location is corroborating evidence and is documented as such: mock location providers are freely available, so a passing geofence check raises confidence but proves nothing on its own, and no finding rests on it.

### 5.6 Non-repudiation

The shop owner's on-screen signature and an acknowledgement photograph are hashed, stored as evidence rows and referenced in the report, so presence at the inspection is attested rather than asserted.

---

## 6. AUDIT TRAIL - HASH-LINKED APPEND-ONLY CHAIN

This is a hash-linked log, not a blockchain: there is no distributed consensus, and the security it provides is detection of alteration, not prevention. Saying so plainly is better than an overclaim a judge or an examiner can puncture in one question.

### 6.1 Table and append-only enforcement

`audit_logs` holds `id`, `seq`, `inspection_id`, `scan_id`, `user_id`, `action`, `old_value`, `new_value`, `reason`, `ip_address`, `user_agent`, `timestamp` (server time), `hash_prev` and `hash_self` — fourteen columns, exactly as in `06_DATABASE.md` §3.7 and `Backend.md` §4. The application only ever inserts. `UPDATE` and `DELETE` are refused by triggers in both SQLite and PostgreSQL, using the same pattern as §5.3.

The column is `hash_self`, not `hash_current`. Earlier revisions of this file used both names in the same document; the models and the migration say `hash_self`, so code written against `hash_current` raises `AttributeError` on the first verification run.

### 6.2 The chain hash - corrected

```python
import hashlib, json

GENESIS_PREV = "0"   # hashed in place of an absent predecessor; the COLUMN stays NULL

def chain_hash(row: dict, hash_prev: str | None) -> str:
    payload = {
        "seq": row["seq"],
        "inspection_id": row["inspection_id"],
        "scan_id": row["scan_id"],
        "user_id": row["user_id"],
        "action": row["action"],
        "old_value": row["old_value"],
        "new_value": row["new_value"],
        "reason": row["reason"],
        "timestamp": row["timestamp"],
        "hash_prev": hash_prev or GENESIS_PREV,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

**The v1.1 formula omitted `user_id` and `new_value`, and that omission was fatal.** Any field outside the hash can be rewritten while the chain still verifies cleanly. Omitting those two fields meant an attacker could change *who* performed an action and *what the value became* — the only two facts the log exists to record — and every verification pass would report the chain as intact. The corrected payload covers every field in the row, including `seq`, so reordering is also detectable.

**Canonical serialisation is not optional.** Without `sort_keys=True` and `separators=(",", ":")`, an incidental change in dictionary ordering or in whitespace produces a different hash for identical data. Verification then fails, and the failure is indistinguishable from tampering — a false alarm that destroys confidence in every true one.

### 6.3 Verification

Verification walks the whole log from `seq = 1`, recomputing each `hash_self` from the row's own fields and the previous row's hash. On the genesis row the stored `hash_prev` is NULL and the hashed value is the string `"0"` — write and verify must use the same substitution, which is why `GENESIS_PREV` is a named constant rather than a literal typed twice.

**A gap in `seq` is itself a failure.** Deleting a row and its successors leaves a shorter chain that verifies perfectly, so verifying links alone is not enough; the sequence must be dense from 1 to the current head. A verification run reports the first failing `seq` and the reason (link mismatch, sequence gap, or head mismatch) rather than a bare pass or fail, because an investigator needs to know where the log stopped being trustworthy.

### 6.4 Daily head hash publication

Once a day, the current head `hash_self` and its `seq` are appended to a file **outside the database**, on a separate volume, with the operating system timestamp. This is what makes wholesale replacement detectable. Without it, an attacker with write access simply rebuilds the entire chain from `seq = 1` with whatever content they prefer: internally consistent, fully verifying, and completely false. With published heads, the rebuilt chain's head does not match yesterday's recorded value, and the discrepancy is visible to anyone holding the file. The v1.1 design hashed a table dump and emailed it, which is weaker in the one respect that matters, since it establishes no independent per-day anchor for the sequence itself.

### 6.5 What is logged

Every state transition: inspection created and submitted, scan captured, finding recorded, override proposed, override adjudicated, report generated, tamper detected, device binding changed, account created or deactivated. Overrides carry `old_value`, `new_value` and a mandatory `reason`; a verdict change without a stored reason cannot be written.

---

## 7. API SECURITY

### 7.1 Input validation

Pydantic validates every request body and query at the boundary, so malformed input is rejected with 422 before any business logic runs: email format, ten-digit phone, minimum-length store name, enumerated verdict values. Verdicts are validated against the closed set `pass`, `fail`, `not_assessed` for a check and `compliant`, `violation`, `not_assessed`, `out_of_scope` for a scan, and a `not_assessed` value without a reason is a validation error rather than a defaulted blank.

### 7.2 File upload security

Extension restricted to `.jpg`, `.jpeg`, `.png`; MIME type checked; size capped; per-scan and per-batch count capped; dimensions sanity-checked; `Image.MAX_IMAGE_PIXELS` set as in §2.5. Files are written under a server-generated `uuid4()` name, never a client-supplied one, which eliminates path traversal by construction rather than by sanitisation. Local virus scanning with ClamAV is optional and, if enabled, runs against local signature files with no network fetch.

### 7.3 Rate limiting

A per-account limit with a `Retry-After` header on 429 covers both burst upload abuse and login guessing. Login attempts are additionally limited per account identifier so that a lockout on one account cannot be induced from another's traffic.

### 7.4 Replay protection and idempotency

Mutating requests carry a client-generated idempotency key which the server records; a repeat of the same key returns the original outcome instead of creating a second record. Offline batches additionally carry a per-batch signature and single-use capture tokens as described in §2.4. This matters most on flaky field connectivity, where a client legitimately retries a request whose response it never saw.

### 7.5 CORS

The portal runs on Vite at `5173`, the Expo development server on `8081`, and FastAPI on `8000` bound with `--host 0.0.0.0` so a phone on the same LAN can reach it.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_origin_regex=r"^(exp://[\w.\-]+(:\d+)?|http://192\.168\.\d{1,3}\.\d{1,3}:(5173|8081))$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)
```

Variable origins must go in `allow_origin_regex`. Starlette does **not** interpret glob patterns in `allow_origins`, so the v1.1 entry `exp://*` would never have matched any origin and LAN and Expo requests would have failed with an opaque CORS error. `allow_origins=["*"]` with `allow_credentials=True` is never used, since browsers reject the combination and it would defeat the point of the cookie.

### 7.6 Transport

HTTPS in production with `Secure` on all cookies and HSTS. Local development over HTTP on `localhost` is acceptable; the cookie flags are environment-driven so that development convenience cannot leak into a deployed configuration.

---

## 8. OFFLINE AND SYNC SECURITY

Queued scans are held with `is_synced = false`, images written to the filesystem via `expo-file-system` and referenced by path — never base64 inside AsyncStorage, which has a small quota and would corrupt the queue on overflow. Each queued record carries its single-use capture token, its idempotency key and its client timestamp claim.

Sync uploads in small throttled batches, prioritising records with `violation` verdicts so the most consequential evidence lands first. The server verifies the batch signature, consumes capture tokens, applies idempotency keys, stamps its own receipt time and recomputes every verdict server-side from the stored findings; a client-asserted verdict is never accepted as authoritative. Conflicts resolve server-first, with the client shown a clear notice, and a record that was edited while queued is flagged for administrative review rather than being silently accepted or silently dropped.

---

## 9. REPORT SECURITY

### 9.1 Signing and verification

**v1.1 claimed the PDF was "digitally signed with server RSA private key via PyJWT or cryptography library". The PyJWT clause is deleted: PyJWT signs JWTs and has no capability to sign a PDF.** Two honest options remain.

The first is a real signature: **`pyhanko`** produces a PAdES-conformant signature embedded in the PDF, which a standard reader validates and displays. This is the stronger option and the correct choice if a certificate is available.

The second is simpler and adequate for this project: compute **SHA256 over the final report bytes**, record that digest in the audit chain as a `report_generated` entry, and embed a QR code encoding an **HTTPS verification URL plus the digest**. Verification recomputes the digest of the stored report and compares. What this proves is bounded and should be stated as such: it proves the file in someone's hand is byte-identical to the one whose digest we logged at generation time. It does not prove authorship cryptographically, and a reader with no network access cannot check it at all.

Two claims are explicitly not made. No `.gov.in` verification domain appears anywhere, because the project does not own one and printing an address we do not control is a broken promise on the face of the document; the verification host is a deployment parameter. And a private URI scheme such as `niyamnetra://verify/...` is **not** a verification mechanism — it opens our own app if our app is installed, and does nothing at all for a court, a shopkeeper or anyone else without it.

### 9.2 Word output

The `python-docx` output carries the same digest and QR in its footer but is explicitly a working draft: a `.docx` is trivially editable, so the PDF is the artefact whose digest is logged.

### 9.3 Legal citations in anything a shopkeeper or court receives

Document 02 §15 holds the legal verification ledger, entries **L-01 to L-15, all currently UNVERIFIED** because primary sources were unreachable during preparation. No pinpoint provision number may be printed in a notice, report or export unless its ledger entry is marked verified; while it is unverified, the descriptive requirement prints instead — "maximum retail price not declared on the principal display panel" rather than a rule and sub-rule number. This is enforced in the citation helper, not left to editorial care, because a shopkeeper handed a notice citing the wrong provision has a complete defence, and a control that depends on nobody making a mistake in a hurry is not a control.

```python
def cite(entry_id: str, descriptive: str) -> str:
    entry = LEDGER[entry_id]
    return entry.pinpoint if entry.verified else descriptive
```

### 9.4 Report footer

Every report footer states the scope and rule version applied — Legal Metrology (Packaged Commodities) Rules 2011 as amended, and not FSSAI or other regimes — records that penalty provisions are subject to current notifications, and gives the verification URL. Every inspection stores its `rule_version` so a historic inspection remains judgeable under the rules in force at the time.

---

## 10. DATABASE AND HOST SECURITY

Seven tables, and no others: `users`, `stores`, `inspections`, `scans`, `scan_images`, `findings`, `audit_logs`.

Development uses SQLite with the database file at mode `600`, dumped to a dated backup on a schedule, with an occasional `VACUUM`. Production uses PostgreSQL installed directly from postgresql.org — **no Docker anywhere in this project** — with a dedicated database role, a connection string held in the environment rather than in code, and `pg_dump` to local and off-site media with a periodic restore drill. A backup that has never been restored is a hypothesis, not a backup.

Every reference to Supabase, S3, Glacier and Object Lock has been removed from this design. They are hosted services, and the system is strictly offline; retention and immutability are provided by the append-only triggers, the audit chain and the published head hashes described above.

Secrets live in `.env`, which is git-ignored alongside `niyamnetra.db`, `uploads/` and `reports/`; `.env.example` carries placeholders only. `JWT_SECRET` must be at least 32 random characters and the startup assertion in §3.2 enforces that it is not the shipped default.

The permitted offline stack is exactly OpenCV 4.9, PaddleOCR 2.8, Tesseract 5, YOLOv8, pyzbar, imagehash and SQLite or PostgreSQL. No hosted vision or language model participates in any part of the pipeline.

---

## 11. MOBILE DEVICE SECURITY

The `install_id` and refresh material are held in `expo-secure-store`, backed by the Android Keystore or the iOS Keychain, so they survive neither a filesystem copy nor an unencrypted backup. The application locks after a short idle period and requires a PIN or biometric to resume, which is the control that matters when a phone is put down on a counter mid-inspection. Screen capture is disabled on evidence screens via `expo-screen-capture`. The access token is held in memory and is discarded on background or lock; the claim in v1.1 that "JWT is not sensitive as it expires 24h" is withdrawn, since a bearer token is exactly as sensitive as the account it opens for as long as it is valid.

---

## 12. DATA PROTECTION - DPDP ACT 2023

The system processes personal data: inspector identities, shop and proprietor details, precise locations, and photographs taken in public retail premises.

**The five-year retention period is an administrative decision, and this corrects a wrong citation in v1.1.** v1.1 stated that five-year retention was required "as per Seventh Schedule". The Seventh Schedule prescribes **forms**, not retention periods, so the citation was simply incorrect even though the period itself is defensible — it aligns with the limitation and appeal horizons an enforcement record needs to outlive. The period is therefore recorded as a documented administrative decision with its rationale, not as a statutory requirement, and the corresponding ledger entry remains UNVERIFIED until a primary source is obtained.

Retention is set per record type rather than applied uniformly, because DPDP's storage-limitation principle asks how long *this* category of data needs to be kept, not how long the longest-lived category does.

| Record type | Retention | Rationale |
|-------------|-----------|-----------|
| Findings, verdicts, audit log | Five years | Enforcement and appeal horizon; audit rows are append-only and cannot be pruned selectively without breaking the chain |
| Evidence images tied to a violation | Five years | Part of the evidentiary record |
| Evidence images for a compliant scan | Shorter, configured period | No enforcement purpose survives the assessment |
| Precise device location | Retained with the scan; not aggregated into inspector movement histories | Location is collected to place a scan, not to track a person |
| Authentication logs | Short operational window | Security monitoring only |

**Incidental capture of bystanders** needs a stated position rather than silence. A shelf photograph taken in a shop may include a member of the public in frame. The position is: capture is limited to the packet and its label, framing guidance directs the camera at the principal display panel, faces appearing incidentally are not detected, indexed, matched or searched in any way, and no biometric processing of any kind occurs anywhere in the pipeline. Incidentally captured images that carry no enforcement purpose fall under the shorter retention above. Data-subject requests are handled through the administrator, with the constraint recorded honestly: an audit row cannot be deleted without breaking the chain, so a request touching audit content is answered by restricting access rather than by erasure, and the reason is documented.

---

## 13. INCIDENT RESPONSE

Detection combines the daily chain verification and head-hash comparison, evidence hash mismatches on read, review items from perceptual-hash collisions, geofence failures, and outlier review of verdict distributions per inspector. Outlier review is comparative and threshold-free in this document: no target rate or expected pass proportion is stated, because we have no measured baseline and a number invented for a document would become a number quoted in a meeting.

On detection, the administrator dashboard raises a banner naming the affected inspection and the specific failure, the inspection is locked against further modification, and unlocking requires a Central Admin action with a recorded reason, which itself lands in the audit log. Recovery restores from a verified backup, re-verifies the chain from `seq = 1` against the published head hashes, and regenerates affected reports with new logged digests. The incident record states plainly what was and was not established, since an overstated all-clear is a liability in exactly the proceeding this system exists to support.

---

## 14. VERDICT VOCABULARY AND ASSESSMENT SCOPE

Verdicts are a closed vocabulary. A check returns `pass`, `fail` or `not_assessed`, and `not_assessed` **must** carry a reason. A scan resolves to `compliant`, `violation`, `not_assessed` or `out_of_scope`. The Good / Bad / Review triple used in v1.1 is abolished throughout, in the database, the API and both clients: it conflated "we assessed this and it failed" with "we could not assess this", which is the exact conflation that turns an unreadable photograph into a passing packet.

There are 18 checks, CHK01 to CHK18, plus sub-check CHK06b, giving **19 findings rows** for a complete assessment. A mobile package scan runs **16 of the 18**: CHK15 (e-commerce listing declarations) and CHK16 (platform duty) require a web listing, and on a mobile-only scan both are recorded as `not_assessed` with the reason "no e-commerce listing supplied" rather than omitted. Recording the gap is the security-relevant part, because a missing row is indistinguishable from a check that quietly passed.

---

## 15. VERIFICATION CHECKLIST

Each item is a demonstration, performed against stated fixtures. No accuracy, latency or throughput figure appears in this document, because none has been measured against a fixture we can name; a number without a fixture is a number we would have to withdraw under questioning.

| # | Demonstration | Expected result |
|---|---------------|-----------------|
| 1 | Login with a wrong password | 401, no token issued, attempt rate-limited |
| 2 | Present a refresh token on an access-protected route | 401 - `token_type` assertion fails |
| 3 | Start the app with the shipped default `JWT_SECRET` | Startup aborts with the assertion message |
| 4 | Inspector requests an admin route | 403 |
| 5 | Inspector requests another inspector's inspection by id | 404, identical to a non-existent id |
| 6 | Alter a stored evidence file on disk, then read it back | Hash mismatch, view blocked, `tamper_detected` logged |
| 7 | Attempt `UPDATE` on `scan_images` and on `audit_logs`, in both engines | Refused by trigger in SQLite and PostgreSQL |
| 8 | Edit an old audit row's `user_id`, then verify | Chain fails at that `seq` |
| 9 | Delete audit rows from the tail, then verify | Sequence gap and head-hash mismatch reported |
| 10 | Submit a listing URL resolving to `169.254.169.254` | Rejected before any connection is attempted |
| 11 | Submit a store name containing markup, then view it in the portal | Rendered as literal text; CSP blocks inline script |
| 12 | Upload a small file declaring enormous dimensions | Refused by the `MAX_IMAGE_PIXELS` guard |
| 13 | Replay a synced offline batch | Absorbed by idempotency keys, no duplicate records |
| 14 | Scan offline, then reconnect | Batch syncs, server timestamps applied, client claim retained separately |
| 15 | Generate a report while every ledger entry is UNVERIFIED | Descriptive requirements print, no pinpoint provision numbers |

---

## 16. CORRECTIONS MADE IN VERSION 2.0

Recorded so that a future editor cannot reintroduce a defect that has already been removed once.

| Area | v1.1 defect | v2.0 position |
|------|-------------|---------------|
| Audit hash | Payload omitted `user_id` and `new_value` | All fields hashed, including `seq`; canonical JSON mandated |
| Audit integrity | No external per-day anchor | Head hash published daily outside the database |
| Authorisation | PostgreSQL RLS with a fictional `current_user_id()` | RLS removed; query-level scoping in the API layer |
| PDF signing | "signed with RSA via PyJWT" | PyJWT clause deleted; `pyhanko` or logged digest plus QR |
| Verification domain | `verify.niyamnetra.gov.in` | Removed; the project does not own a `.gov.in` domain |
| Device binding | IMEI or browser fingerprint | Server-issued 32-byte `install_id`; Play Integrity or DeviceCheck for stronger assurance |
| Token storage | `localStorage` and `AsyncStorage`, 24h single token | 12h access token in memory, 30d refresh token in an httpOnly cookie |
| Token payload | No `token_type` | `token_type` asserted on every access path |
| CORS | `exp://*` in `allow_origins` | `allow_origin_regex`; Starlette does not glob |
| Ports | Expo `19000` implied | Expo `8081`, Vite `5173`, FastAPI `8000` |
| Evidence hashing | Re-encode after hashing left implicit | Hash covers bytes as stored; derived copies separate; no EXIF written into the original |
| Image processing | ELA and enhancement unbounded | ELA and generative super-resolution prohibited; classical operations only, all recorded |
| Immutability | Trigger shown for SQLite only | Triggers in both engines |
| Duplicate detection | Full-table pHash scan, framed as duplicate proof | Banded index; opens a review item only |
| Verdicts | Good / Bad / Review | `pass` / `fail` / `not_assessed` and `compliant` / `violation` / `not_assessed` / `out_of_scope` |
| Storage and retention | S3 Glacier, Object Lock | Removed; local storage with triggers and published head hashes |
| Retention citation | "5 years per Seventh Schedule" | Administrative decision; the Seventh Schedule prescribes forms, not retention |
| Legal citations | Pinpoint rule numbers printed freely | Ledger-gated; descriptive text prints while an entry is UNVERIFIED |
| Metrics | Invented pass-rate baseline in anomaly detection | All unmeasured figures removed |
| Threat model | No SSRF, XSS, IDOR, sync poisoning or upload DoS | T11 to T15 added with mitigations |
| Data protection | No DPDP section | §12 added, including per-record-type retention and incidental capture |
| Audit column name | `hash_current` used in §6.1, §6.3 and §6.4 against `hash_self` in the models | `hash_self` throughout; `user_agent` added to the column list, which was also short by one |
| Genesis row | `hash_prev = "0"` stated in prose while the code hashed `""` | `GENESIS_PREV` constant; column NULL, digest input `"0"`, one rule stated in both places |
| Banded pHash | Four 16-bit bands, claimed complete at Hamming distance 5 | Eight 8-bit bands; the bound is distance ≤ bands − 1, so four guaranteed only 3 and the control silently missed pairs at 4 and 5 |

---

**End of Security Architecture.** Implement authentication, authorisation, evidence hashing and the audit chain from this document, and answer integrity questions from it — every claim here is one that can be demonstrated on request.
