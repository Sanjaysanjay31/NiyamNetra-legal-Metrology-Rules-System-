"""Backend/rules/__init__.py — Versioned Legal Rule Pack System (Phase 4).

Clean exports for declarative, date-aware, and evidence-grounded Legal Metrology rule packs.
"""
from __future__ import annotations

from rules.aggregation import (
    AssessmentCompleteness,
    CaptureRequest,
    EvidenceReference,
    EvidenceSummary,
    InspectionAssessment,
    ReviewDossier,
    ReviewItem,
    StatutoryConflict,
    ViolationDossier,
    ViolationItem,
    aggregate_inspection_assessment,
    deduplicate_findings,
    detect_cross_panel_conflicts,
    determine_assessment_completeness,
    generate_actionable_capture_requests,
    generate_review_dossier,
    generate_violation_dossier,
    normalize_commodity_name,
    normalize_date_semantic,
    normalize_party_text,
)
from rules.benchmark import benchmark_phase4_end_to_end
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
    "AssessmentCompleteness",
    "CaptureRequest",
    "EvaluationSpec",
    "EvidenceReference",
    "EvidenceSummary",
    "InspectionAssessment",
    "LegalRuleDefinition",
    "ReviewDossier",
    "ReviewItem",
    "RulePack",
    "Severity",
    "StatutoryConflict",
    "StatutoryLimb",
    "Verdict",
    "ViolationDossier",
    "ViolationItem",
    "aggregate_inspection_assessment",
    "benchmark_phase4_end_to_end",
    "deduplicate_findings",
    "detect_cross_panel_conflicts",
    "determine_assessment_completeness",
    "generate_actionable_capture_requests",
    "generate_review_dossier",
    "generate_rule_pack_report",
    "generate_violation_dossier",
    "load_rule_pack",
    "normalize_commodity_name",
    "normalize_date_semantic",
    "normalize_party_text",
]
