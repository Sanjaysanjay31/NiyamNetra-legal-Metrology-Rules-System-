"""Backend/tests/test_rule_pack_phase4a.py — Unit Tests for Versioned Legal Rule Pack (Phase 4A).

Validates:
1. Complete rule pack loading and structure (Section 3 & 4)
2. Strict statutory provenance: no anonymous rules permitted (Section 24)
3. Fail-fast validation behavior on missing legal metadata
4. Effective date range resolution and amendment awareness
5. Section 26 developer-facing Rule Pack Validation Report
6. Seamless backward compatibility with rules_engine assessment
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
import pytest

from rules import (
    ApplicabilitySpec,
    EvaluationSpec,
    LegalRuleDefinition,
    RulePack,
    generate_rule_pack_report,
    load_rule_pack,
)
from rules_engine import CheckContext, assess, run_checks


def test_load_default_rule_pack():
    """Rule pack loads successfully with official authority, version, and >= 20 rules."""
    pack = load_rule_pack()
    assert pack.rule_pack_version == "2026.07.v1"
    assert "Department of Consumer Affairs" in pack.authority
    assert len(pack.rules) >= 20
    assert pack.rules_as_at == "2026-07-01"


def test_strict_legal_metadata_validation():
    """Every rule must contain non-empty statutory sources, effective dates, and remediation (Section 24)."""
    pack = load_rule_pack()
    errors = pack.validate()
    assert len(errors) == 0, f"Validation errors found: {errors}"

    for r in pack.rules:
        assert r.source_document.strip() != ""
        assert r.source_rule.strip() != ""
        assert r.effective_from.strip() != ""
        assert r.evaluation_method.method.strip() != ""
        assert r.remediation.strip() != ""
        assert r.rule_pack_version == pack.rule_pack_version


def test_fail_fast_on_missing_source_metadata():
    """A rule lacking source_document or source_rule must fail validation fast (Section 24)."""
    bad_rule = LegalRuleDefinition(
        rule_id="RULE_ANONYMOUS_TEST",
        code="CHK99",
        rule_pack_version="2026.07.v1",
        title="Fake anonymous test rule",
        source_document="",  # Missing!
        source_rule="",      # Missing!
        effective_from="2026-01-01",
        severity="critical",
        applicability=ApplicabilitySpec(),
        required_evidence=["ocr_evidence"],
        required_fields=["mrp"],
        evaluation_method=EvaluationSpec(method="presence"),
        remediation="",      # Missing!
    )

    errors = bad_rule.validate_metadata()
    assert len(errors) >= 3
    assert any("source_document" in err for err in errors)
    assert any("source_rule" in err for err in errors)
    assert any("remediation" in err for err in errors)

    bad_pack = RulePack(
        rule_pack_version="2026.07.v1",
        title="Invalid Pack",
        description="",
        authority="Test",
        rules_as_at="2026-07-01",
        rules=[bad_rule],
    )
    pack_errors = bad_pack.validate()
    assert len(pack_errors) >= 3


def test_effective_date_resolution():
    """Rules are effective-date aware: future rules must not be active before their commencement."""
    pack = load_rule_pack()

    # Rule 6(10A) platform filter commences on 2026-07-01
    origin_filter_rule = pack.get_rule_by_id("RULE_LMPC_16_PLATFORM_ORIGIN_FILTER")
    assert origin_filter_rule is not None
    assert origin_filter_rule.effective_from == "2026-07-01"

    # Effective on or after commencement
    assert origin_filter_rule.is_effective_on(date(2026, 7, 1)) is True
    assert origin_filter_rule.is_effective_on(date(2026, 8, 1)) is True

    # NOT effective before commencement
    assert origin_filter_rule.is_effective_on(date(2026, 6, 30)) is False
    assert origin_filter_rule.is_effective_on(date(2025, 1, 1)) is False


def test_rule_lookup_by_code_and_id():
    """Lookups succeed by both canonical rule ID and legacy short code."""
    pack = load_rule_pack()
    by_id = pack.get_rule_by_id("RULE_LMPC_01_MANDATORY_DECLARATIONS")
    by_code = pack.get_rule_by_id("CHK01")
    assert by_id is not None
    assert by_code is not None
    assert by_id.rule_id == by_code.rule_id


def test_generate_rule_pack_report():
    """Developer-facing Section 26 report contains all required metrics."""
    report = generate_rule_pack_report()

    assert report["active_rule_pack_version"] == "2026.07.v1"
    assert report["total_rules"] >= 20
    assert report["enabled_rules_count"] >= 20
    assert report["category_specific_rules_count"] > 0
    assert report["ecommerce_rules_count"] >= 2
    assert report["measurement_rules_count"] >= 2
    assert report["placement_rules_count"] >= 2

    assert "earliest" in report["effective_date_range"]
    assert "latest" in report["effective_date_range"]
    assert len(report["source_references"]) > 0

    # Print summary report for visibility
    print("\n" + "=" * 70)
    print("RULE PACK VALIDATION REPORT (PHASE 4A)")
    print("=" * 70)
    print(f"Active Version:    {report['active_rule_pack_version']}")
    print(f"Total Rules:       {report['total_rules']}")
    print(f"Enabled Rules:     {report['enabled_rules_count']}")
    print(f"Category Specific: {report['category_specific_rules_count']}")
    print(f"E-Commerce Rules:  {report['ecommerce_rules_count']}")
    print(f"Measurement Rules: {report['measurement_rules_count']}")
    print(f"Placement Rules:   {report['placement_rules_count']}")
    print(f"Effective Dates:   {report['effective_date_range']['earliest']} to {report['effective_date_range']['latest']}")
    print("=" * 70 + "\n")


def test_rule_pack_provenance_in_assessment():
    """assess() outputs rule_pack_version in provenance and preserves backward compatibility."""
    ctx = CheckContext(ocr_available=True)
    findings, verdict, provenance = assess(ctx)

    assert "rule_pack_version" in provenance
    assert provenance["rule_pack_version"] == "2026.07.v1"
    assert isinstance(findings, list)
    assert len(findings) == 19
    assert verdict is not None
