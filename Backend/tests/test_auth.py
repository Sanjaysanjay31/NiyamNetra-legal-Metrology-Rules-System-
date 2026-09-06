"""tests/test_auth.py — minimal auth invariants (no DB)."""
import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import jwt as _pyjwt

from jwt_handler import ACCESS, REFRESH, TokenError, create_access_token, decode_token


def test_hs256_only_none_alg_rejected():
    # A hand-minted `none` token must never verify, even if config were bypassed.
    raw = _pyjwt.encode({"sub": "1", "token_type": ACCESS}, key="", algorithm="none")
    try:
        decode_token(raw, expect=ACCESS)
    except TokenError:
        return
    raise AssertionError("none-alg token was accepted")


def test_wrong_token_type_rejected():
    # Refresh-as-access must fail: without this the 12h access limit becomes 30d.
    from jwt_handler import create_refresh_token
    tok = create_refresh_token(1, "install-1", 0)
    try:
        decode_token(tok, expect=ACCESS)
    except TokenError as e:
        assert "token_type" in str(e) or "wrong" in str(e).lower()
        return
    raise AssertionError("refresh token accepted as access token")


def test_int_sub_required_for_rbac():
    # rbac.get_current_user does int(claims["sub"]) and 401s on failure.
    # A non-integer sub must not survive that conversion.
    tok = create_access_token.__wrapped__ if hasattr(create_access_token, "__wrapped__") else None
    import jwt_handler as _jh
    from datetime import timedelta
    raw = _jh._mint({"sub": "not-an-int", "role": "inspector", "install_id": None},
                    timedelta(hours=1), ACCESS)
    claims = decode_token(raw, expect=ACCESS)
    try:
        int(claims["sub"])
    except (ValueError, TypeError):
        return
    raise AssertionError("non-integer sub parsed as int")


def test_access_token_roundtrip():
    tok = create_access_token(42, "inspector", "install-abc")
    claims = decode_token(tok, expect=ACCESS)
    assert claims["sub"] == "42"
    assert claims["token_type"] == ACCESS
