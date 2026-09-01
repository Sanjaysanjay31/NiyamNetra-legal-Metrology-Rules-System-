"""jwt_handler.py — mint and verify. PyJWT 2.8."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError

from config import settings

ACCESS, REFRESH = "access", "refresh"


def _mint(payload: dict, ttl: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    body = {
        **payload,
        "token_type": token_type,
        "jti": secrets.token_hex(16),
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(body, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int, role: str, install_id: str | None) -> str:
    return _mint(
        {"sub": str(user_id), "role": role, "install_id": install_id},
        timedelta(hours=settings.ACCESS_TOKEN_HOURS),
        ACCESS,
    )


def create_refresh_token(user_id: int, install_id: str | None, epoch: int) -> str:
    return _mint(
        {"sub": str(user_id), "install_id": install_id, "epoch": epoch},
        timedelta(days=settings.REFRESH_TOKEN_DAYS),
        REFRESH,
    )


class TokenError(Exception):
    """Raised for every invalid token. Callers translate this to HTTP 401."""


def decode_token(token: str, expect: str) -> dict:
    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],   # a list, never a bare string
            options={"require": ["exp", "iat", "sub", "token_type"]},
        )
    except ExpiredSignatureError as e:
        raise TokenError("expired") from e
    except InvalidTokenError as e:
        raise TokenError("invalid") from e

    # Without this, a refresh token is accepted as an access token and the
    # 12-hour limit becomes 30 days.
    if claims.get("token_type") != expect:
        raise TokenError(f"wrong token type: expected {expect}")
    return claims
