"""audit.py — append-only log with a hash chain over the payload."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import AuditLog

# Hashed in place of an absent predecessor on the genesis row. The COLUMN stays
# NULL; only the digest input is substituted. 06 §3.7.
GENESIS_PREV = "0"


def _canonical_timestamp(ts: datetime) -> str:
    """SQLite strips timezone; PostgreSQL keeps it. Normalise to UTC-aware ISO
    with microseconds so chain_hash is stable across engines and across the
    write/read boundary. Without this, genesis always fails on SQLite."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.isoformat(timespec="microseconds")


def chain_hash(entry: AuditLog, hash_prev: str | None) -> str:
    """Canonical serialisation, then SHA-256.

    Two fields that v1.x left OUT of the hash: user_id and new_value. Leaving
    user_id unhashed lets an attacker reassign an action to another officer
    without breaking the chain. Leaving new_value unhashed lets them change
    what the action did. Between them they cover almost every tampering motive
    the chain exists to defeat.

    sort_keys and the compact separators are mandatory: without them a change
    in dictionary ordering or in whitespace produces a different digest, and
    every verification fails for a reason that looks exactly like tampering.

    On the genesis row the stored hash_prev column is NULL and the hashed value
    is the string "0". The stored value and the digest input differ in exactly
    this one place, so both sides must use the same substitution — hence the
    `or GENESIS_PREV` here and the identical expression in verify_chain().
    06 §3.7 and 09 §5.3 state the same rule.
    """
    payload = json.dumps(
        {
            "seq": entry.seq,
            "inspection_id": entry.inspection_id,
            "scan_id": entry.scan_id,
            "user_id": entry.user_id,
            "action": entry.action,
            "old_value": entry.old_value,
            "new_value": entry.new_value,
            "reason": entry.reason,
            "timestamp": _canonical_timestamp(entry.timestamp),
            "hash_prev": hash_prev or GENESIS_PREV,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def append_audit(
    db: Session, *, action: str,
    inspection_id: int | None = None, scan_id: int | None = None,
    user_id: int | None = None, old_value: str | None = None,
    new_value: str | None = None, reason: str | None = None,
    ip_address: str | None = None, user_agent: str | None = None,
    commit: bool = True,
) -> AuditLog:
    """Append one hash-chained row.

    Seq allocation races under concurrency (two writers can read the same
    max seq). Retry up to 3 times on IntegrityError: rollback, re-read max
    seq, retry. commit=False flushes only so the caller can batch the audit
    row into its own single commit (used by assess_scan for the
    assessment_rerun row, avoiding a double-commit where the audit commits
    before the findings it describes).
    """
    last_exc: Exception | None = None
    for _attempt in range(3):
        try:
            last = db.query(AuditLog).order_by(AuditLog.seq.desc()).first()
            entry = AuditLog(
                seq=(last.seq + 1) if last else 1,
                inspection_id=inspection_id, scan_id=scan_id, user_id=user_id,
                action=action, old_value=old_value, new_value=new_value, reason=reason,
                ip_address=ip_address, user_agent=user_agent,
                timestamp=datetime.now(timezone.utc),
                hash_prev=last.hash_self if last else None,
            )
            entry.hash_self = chain_hash(entry, entry.hash_prev)
            db.add(entry)
            if commit:
                db.commit()
            else:
                db.flush()
            return entry
        except IntegrityError as e:
            db.rollback()
            last_exc = e
            continue
    db.rollback()
    raise last_exc  # type: ignore[misc]


def verify_chain(db: Session, start_seq: int = 1) -> dict:
    prev = None
    if start_seq > 1:
        anchor = db.query(AuditLog).filter(AuditLog.seq == start_seq - 1).first()
        prev = anchor.hash_self if anchor else None

    expected_seq = start_seq
    for e in db.query(AuditLog).filter(AuditLog.seq >= start_seq).order_by(AuditLog.seq):
        if e.seq != expected_seq:
            return {"intact": False, "failed_at": expected_seq,
                    "why": f"sequence gap: expected {expected_seq}, found {e.seq}"}
        if e.hash_prev != prev:
            return {"intact": False, "failed_at": e.seq, "why": "broken link"}
        if chain_hash(e, prev) != e.hash_self:
            return {"intact": False, "failed_at": e.seq, "why": "payload altered"}
        prev, expected_seq = e.hash_self, e.seq + 1

    return {"intact": True, "entries": expected_seq - start_seq, "head": prev}


def publish_daily_head(db: Session) -> dict:
    """Append today's chain head to an append-only file, and print it on every
    report generated that day. A wholesale rewrite then contradicts a value
    that has already left the building. 10 §10.2.

    Disk errors are logged, never raised: a full OUT_DIR must not turn a
    report request into a 500.
    """
    from config import settings
    from datetime import date

    state = verify_chain(db)
    line = f"{date.today().isoformat()} {state.get('head') or 'EMPTY'}\n"
    try:
        settings.OUT_DIR.mkdir(parents=True, exist_ok=True)
        (settings.OUT_DIR / "chain_heads.log").open("a", encoding="utf-8").write(line)
    except OSError as e:
        import logging
        logging.getLogger(__name__).warning("chain head publish failed: %s", e)
    return state
