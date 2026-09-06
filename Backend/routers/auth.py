"""routers/auth.py"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field, field_validator

from audit import append_audit
from config import settings
from database import get_db
from jwt_handler import (
    ACCESS, REFRESH, TokenError, create_access_token, create_refresh_token, decode_token,
)
from models import User
from password_handler import hash_password, verify_password
from rbac import get_current_user
from schemas import LoginRequest, LoginResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# Simple in-memory login rate limiter: per employee_id+IP, max 5 attempts per
# 60s sliding window. Returns 429 with Retry-After when exceeded. No new deps.
# Note: per-process memory only; a multi-worker deploy would need a shared
# store (e.g. Redis) for a global limit. This is a brute-force brake, not a
# distributed throttle. Bounded to 1000 keys (LRU eviction of oldest) with
# periodic prune of empty buckets so a key-enumeration flood cannot grow memory
# without bound.
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_WINDOW_S = 60.0
_LOGIN_MAX_PER_WINDOW = 5
_LOGIN_MAX_KEYS = 1000


def _login_rate_key(employee_id: str, ip: str | None) -> str:
    return f"{(employee_id or '').strip().lower()}|{(ip or 'unknown')}"


def _check_login_rate_limit(employee_id: str, ip: str | None) -> None:
    now = time.time()
    key = _login_rate_key(employee_id, ip)
    hits = _LOGIN_ATTEMPTS.get(key, [])
    # Prune outside the sliding window.
    hits = [t for t in hits if now - t < _LOGIN_WINDOW_S]
    if len(hits) >= _LOGIN_MAX_PER_WINDOW:
        retry_after = int(_LOGIN_WINDOW_S - (now - hits[0])) + 1
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts; try again shortly",
            headers={"Retry-After": str(max(retry_after, 1))},
        )
    hits.append(now)
    _LOGIN_ATTEMPTS[key] = hits
    # Bound memory: evict oldest keys past the cap, and opportunistically
    # drop buckets that have fully expired.
    if len(_LOGIN_ATTEMPTS) > _LOGIN_MAX_KEYS:
        # dicts preserve insertion order: pop oldest first (LRU approx).
        for _old in list(_LOGIN_ATTEMPTS.keys())[: len(_LOGIN_ATTEMPTS) - _LOGIN_MAX_KEYS]:
            _LOGIN_ATTEMPTS.pop(_old, None)
        # Periodic prune of empty/expired buckets.
        for _k in list(_LOGIN_ATTEMPTS.keys())[:200]:
            _v = _LOGIN_ATTEMPTS.get(_k, [])
            _v = [t for t in _v if now - t < _LOGIN_WINDOW_S]
            if not _v:
                _LOGIN_ATTEMPTS.pop(_k, None)
            elif len(_v) != len(_LOGIN_ATTEMPTS.get(_k, [])):
                _LOGIN_ATTEMPTS[_k] = _v


def _set_refresh_cookie(resp: Response, token: str) -> None:
    # SameSite=None is only honoured together with Secure, so the two flags move
    # as one. See config.REFRESH_COOKIE_CROSS_SITE for why and for the trade-off.
    cross_site = settings.refresh_cookie_cross_site
    resp.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.REFRESH_TOKEN_DAYS * 86400,
        httponly=True,                     # no JavaScript can read it
        secure=cross_site or settings.ENV == "prod",   # over http on the LAN in dev
        samesite="none" if cross_site else "strict",
        path="/auth",
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, response: Response,
          db: Session = Depends(get_db)):
    _check_login_rate_limit(body.employee_id, _client_ip(request))
    user = db.query(User).filter(User.employee_id == body.employee_id).first()

    # Constant-ish work on both paths, and one message for both failures, so
    # the endpoint is not a username oracle.
    ok = user is not None and user.is_active and verify_password(
        body.password, user.password_hash
    )
    if not ok:
        append_audit(
            db, user_id=user.id if user else None, action="login_failed",
            new_value=body.employee_id, ip_address=_client_ip(request),
        )
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Invalid employee ID or password"
        )

    from routers.auth_helpers import bind_install       # see §3.4
    install_id = bind_install(db, user)

    access = create_access_token(user.id, user.role, install_id)
    refresh = create_refresh_token(user.id, install_id, user.token_epoch)
    _set_refresh_cookie(response, refresh)

    append_audit(db, user_id=user.id, action="login", ip_address=_client_ip(request),
                 user_agent=request.headers.get("user-agent", "")[:240])

    return LoginResponse(
        access_token=access,
        expires_in=settings.ACCESS_TOKEN_HOURS * 3600,
        user=UserOut.model_validate(user),
        install_id=install_id,
    )


@router.post("/refresh", response_model=LoginResponse)
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        claims = decode_token(raw, expect=REFRESH)
    except TokenError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=f"Refresh {e}")

    try:
        refresh_uid = int(claims["sub"])
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh invalid")
    user = db.get(User, refresh_uid)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    # A password change invalidates every refresh token issued before it.
    if claims.get("epoch") != user.token_epoch:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session superseded")
    if user.install_id and claims.get("install_id") != user.install_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Device not recognised")

    # Rotation issues a new token; the old token remains valid until expiry.
    # This is NOT single-use (no jti denylist); revocation is via token_epoch
    # bump on logout / password change / install reset.
    new_refresh = create_refresh_token(user.id, user.install_id, user.token_epoch)
    _set_refresh_cookie(response, new_refresh)
    return LoginResponse(
        access_token=create_access_token(user.id, user.role, user.install_id),
        expires_in=settings.ACCESS_TOKEN_HOURS * 3600,
        user=UserOut.model_validate(user),
        install_id=user.install_id or "",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Revoke all refresh tokens for this user (token_epoch bump) and clear
    the refresh cookie. Idempotent: with no/invalid cookie the cookie is still
    cleared and no error is raised."""
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if raw:
        try:
            claims = decode_token(raw, expect=REFRESH)
        except TokenError:
            claims = None
        if claims is not None:
            try:
                uid = int(claims.get("sub"))
            except (ValueError, TypeError, OverflowError):
                uid = None
            if uid is not None:
                user = db.get(User, uid)
                if user is not None:
                    user.token_epoch += 1
                    db.commit()
                    append_audit(
                        db, user_id=user.id, action="logout",
                        ip_address=_client_ip(request),
                    )
    # The delete must repeat the attributes the cookie was SET with, or the
    # browser treats it as a different cookie and the old one survives logout.
    cross_site = settings.refresh_cookie_cross_site
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path="/auth",
        httponly=True,
        secure=cross_site or settings.ENV == "prod",
        samesite="none" if cross_site else "strict",
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=8, max_length=72)
    new_password: str = Field(min_length=12, max_length=72)

    @field_validator("new_password", mode="after")
    @classmethod
    def _strong(cls, v: str) -> str:
        # Same letter+digit rule as CreateUserRequest: an admin-created
        # password and a self-chosen one must meet the same bar.
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one letter and one digit")
        return v


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordRequest, request: Request,
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Verify the old password, set the new one, and bump token_epoch so every
    refresh token issued before now is dead (§3.2). The current access token
    keeps working until it expires; the client should re-login to rotate it."""
    if not verify_password(body.old_password, user.password_hash):
        append_audit(db, user_id=user.id, action="password_change_failed",
                     ip_address=_client_ip(request))
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="Old password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.token_epoch += 1
    db.commit()
    append_audit(db, user_id=user.id, action="password_changed",
                 ip_address=_client_ip(request))


def _client_ip(request: Request) -> str | None:
    # Only trust the forwarded header when a reverse proxy is configured; an
    # unproxied deployment lets any client set it. With TRUSTED_PROXY_COUNT
    # proxies (Render default 1), take the entry at index -count from the
    # right — the left-most entries are client-controlled and must not be
    # trusted (spoofing [0] lets any client forge its IP for rate limits).
    if settings.ENV == "prod":
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            parts = [p.strip() for p in fwd.split(",") if p.strip()]
            if parts:
                try:
                    count = max(1, int(getattr(settings, "TRUSTED_PROXY_COUNT", 1) or 1))
                except Exception:
                    count = 1
                idx = max(0, len(parts) - count)
                return parts[idx][:45]
    return request.client.host if request.client else None
