"""tests/test_round3_fix.py — rotation, tables, repeat-violators, range (no DB)."""
import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest


def test_revoked_jti_model_exists():
    from models import LoginAttempt, RevokedJti
    assert RevokedJti.__tablename__ == "revoked_jtis"
    assert LoginAttempt.__tablename__ == "login_attempts"


def test_refresh_is_single_use_code_path():
    # refresh_token must consult revoked_jtis and mint with jti present.
    import inspect
    from routers import auth
    src = inspect.getsource(auth.refresh_token)
    assert "RevokedJti" in src
    assert "reuse" in src
    from jwt_handler import create_refresh_token, decode_token, REFRESH
    tok = create_refresh_token(7, "install-x", 0)
    assert decode_token(tok, expect=REFRESH)["jti"]


def test_login_limiter_is_db_backed():
    import inspect
    from routers import auth
    src = inspect.getsource(auth._check_login_rate_limit)
    assert "LoginAttempt" in src
    assert "_LOGIN_ATTEMPTS" not in src


def test_rule_tables_validators():
    from routers.admin import _validate_nq_heights, _validate_second_schedule
    _validate_second_schedule({"biscuits": {"sizes": [50, 100, 200]}})
    _validate_nq_heights({"bands": [{"unit": "g", "upper": 200, "min_height_mm": 2.0}]})
    with pytest.raises(Exception):
        _validate_second_schedule({"biscuits": {"sizes": [-5]}})
    with pytest.raises(Exception):
        _validate_nq_heights({"bands": [{"unit": "furlong", "upper": 1, "min_height_mm": 1}]})
    with pytest.raises(Exception):
        _validate_nq_heights({})


def test_repeat_violators_and_range_routes_registered():
    from routers.admin import repeat_offenders
    from routers.reports import range_report
    assert callable(repeat_offenders) and callable(range_report)
    from queries import repeat_violators
    assert callable(repeat_violators)


def test_range_generators_accept_period_label():
    import inspect
    from report_generator import (generate_daily_csv, generate_daily_docx,
                                  generate_daily_pdf, generate_daily_xlsx)
    for fn in (generate_daily_pdf, generate_daily_docx, generate_daily_xlsx, generate_daily_csv):
        assert "period_label" in inspect.signature(fn).parameters
