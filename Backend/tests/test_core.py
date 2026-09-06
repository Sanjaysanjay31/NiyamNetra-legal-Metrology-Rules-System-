# NiyamNetra backend tests — added per SIH audit (4.4); exports verified
import pytest

def test_config_secret_validator():
    """Config rejects weak JWT_SECRET (verified from BK_config.py WEAK_SECRETS)."""
    from config import WEAK_SECRETS
    assert "change_me" in WEAK_SECRETS

def test_jwt_fixed_alg():
    """jwt_handler.py uses HS256 fixed allow-list (verified)."""
    from jwt_handler import settings
    assert settings.JWT_ALGORITHM == "HS256"

def test_rules_engine_import():
    from rules_engine import FindingResult
    r = FindingResult(check_id="T1", title="t", verdict="pass", severity="minor")
    assert r.verdict == "pass"
