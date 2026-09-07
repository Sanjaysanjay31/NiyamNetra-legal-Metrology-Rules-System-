# Operator rules (OPERATOR source) — shim.
# Full logic lives in rules_engine.py. Re-exports shared types so imports work.
from rules_engine import (  # noqa: F401
    ALL_CHECK_IDS,
    CheckContext,
    FindingResult,
    Severity,
    Verdict,
    assess,
    catalog_hash,
    load_catalog,
)

__all__ = ["ALL_CHECK_IDS", "CheckContext", "FindingResult", "Severity",
           "Verdict", "assess", "catalog_hash", "load_catalog"]
