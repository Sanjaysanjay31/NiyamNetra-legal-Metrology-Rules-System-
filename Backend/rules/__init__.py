"""Backend/rules/__init__.py — Versioned Legal Rule Pack System (Phase 4).

Clean exports for declarative, date-aware, and evidence-grounded Legal Metrology rule packs.
"""
from __future__ import annotations

from rules.loader import generate_rule_pack_report, load_rule_pack
from rules.schema import (
    ApplicabilitySpec,
    EvaluationSpec,
    LegalRuleDefinition,
    RulePack,
    Severity,
    StatutoryLimb,
    Verdict,
)

__all__ = [
    "ApplicabilitySpec",
    "EvaluationSpec",
    "LegalRuleDefinition",
    "RulePack",
    "Severity",
    "StatutoryLimb",
    "Verdict",
    "generate_rule_pack_report",
    "load_rule_pack",
]
