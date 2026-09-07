# Package rules (PACKAGE source) — shim.
# Full logic lives in rules_engine.py (single-file engine, 1384 lines).
# This module re-exports the shared types so `from rules_engine_package
# import FindingResult` works today, and is the landing spot for the
# category split when it lands (see rules_engine.py SPLIT NOTE 2026-09-06).
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
