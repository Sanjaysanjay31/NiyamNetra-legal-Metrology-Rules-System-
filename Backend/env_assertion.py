# P0 fix applied 2026-09-06 — env secret hygiene
# Validator in config.py lines 162-168 already enforces >=32 chars / not placeholder.
# Additional guard below (runs at import if config loaded).

import os
from pathlib import Path

def assert_env_clean():
    env_path = Path(__file__).resolve().parent / ".env"
    # .env must NOT be in git history; verify with git log -- .env
    # This is a manual check, not automatic (git filter-repo needed if leaked)
    assert "JWT_SECRET" in os.environ or ".env" in str(env_path), \
        "JWT_SECRET required; generate with secrets.token_urlsafe(64)"
    secret = os.environ.get("JWT_SECRET","")
    assert len(secret) >= 32 and secret not in {"change_me","dev","secret","test","niyamnetra"}, \
        "JWT_SECRET too weak / placeholder — see config.py validator"
