"""idempotency.py — durable replay for offline-created resources.

The App sends an Idempotency-Key with every write (Frontend_App/api/client.js)
and reuses the queue item's id across sync retries (offline/SyncProvider.js).
Until now the header was only CORS-allowlisted in main.py: the server never
recorded it, so a retried POST whose response was lost on a dying connection
created a SECOND inspection/scan. 09 §T14 and 11 §2.4 name the idempotency
key as the control; this module makes it one.

Only 2xx responses are stored for replay. A failed attempt leaves the key
unused, so the client's retry is a first attempt as far as the server is
concerned.
"""
from __future__ import annotations

import json as _json
from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import IdempotencyKey, utcnow

_HEADER = "Idempotency-Key"

# Replay window. The client queue purges synced items immediately, so a key
# older than this can only be an abuse probe, not an honest retry.
RETENTION_DAYS = 7


def idempotency_key(request: Request) -> str | None:
    """The cleaned header, or None. Absent key = plain, non-replayed request."""
    raw = (request.headers.get(_HEADER) or "").strip()
    if not raw:
        return None
    # Bounded key: it is a primary-key column, so absurd input is a 422, never a DB error.
    if len(raw) > 64:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Idempotency-Key exceeds 64 characters")
    return raw


def _fingerprint(request: Request) -> str:
    # Method + path. Bodies are deliberately NOT fingerprinted: the client
    # retries the identical body, and JSON key-order drift would otherwise
    # turn an honest retry into a false "key reuse" conflict.
    return f"{request.method} {request.url.path}"


def replay_or_open(db: Session, request: Request, user_id: int,
                   key: str | None):
    """(stored, is_new). stored is (status_code, body_dict) when the key has a
    recorded response; is_new=True means the caller must run the handler and
    close_idempotent() with the result."""
    if key is None:
        return None, True
    row = db.get(IdempotencyKey, key)
    if row is not None:
        if row.fingerprint != _fingerprint(request) or row.user_id != user_id:
            # Same key presented for a different endpoint or a different
            # account: ambiguous replay. Never hand back someone else's (or
            # some other route's) stored response — RFC-draft behaviour is 422.
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Idempotency-Key was already used for a different request",
            )
        try:
            body = _json.loads(row.response_body)
        except Exception:
            return None, True  # unparseable stored row: treat as absent
        return (row.status_code, body), False
    return None, True


def close_idempotent(db: Session, request: Request, user_id: int,
                     key: str | None, status_code: int, body: dict) -> None:
    """Record a 2xx response under the key.

    Best-effort by design: two workers racing on the same key hit the PK
    constraint; the loser rolls back and DISCARDS its duplicate work — the
    winner's response is what replays. That is the property the key exists
    for, so the race is a success condition, not an error.
    """
    if key is None or not (200 <= status_code < 300):
        return
    try:
        db.add(IdempotencyKey(
            key=key, user_id=user_id, fingerprint=_fingerprint(request),
            status_code=status_code,
            response_body=_json.dumps(body, default=str),
        ))
        # Opportunistic prune so the table cannot grow without bound.
        _cut = utcnow() - timedelta(days=RETENTION_DAYS)
        db.query(IdempotencyKey).filter(IdempotencyKey.created_at < _cut).delete()
        db.commit()
    except IntegrityError:
        db.rollback()
    except Exception:
        # A replay-store failure must never fail the real request.
        db.rollback()
