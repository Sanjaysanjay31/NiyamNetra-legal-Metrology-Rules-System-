"""Backend/tests/test_rules_phase4d.py — Phase 4D Test Suite.

Multi-Panel Evidence Aggregation & Final Assessment (SIH26034):
- Multi-panel evidence aggregation with complete provenance retention.
- Cross-panel declaration consistency (MRP dual pricing, Net Quantity, Dates, Parties, Commodity).
- Strict conflict detection & StatutoryConflict model (REVIEW_REQUIRED; zero silent selection).
- Finding deduplication with deterministic precedence (FAIL outranks PASS/NOT_ASSESSED).
- Rule result precedence and explicit Assessment Completeness (COMPLETE vs PARTIAL).
- Incomplete package panel coverage prevention (partial coverage can NEVER be COMPLIANT).
- Audit-ready Violation Dossier (Section 36 limbs 36(1)/36(2), deterministic inspector explanations).
- Audit-ready Review Dossier (actionable review items for conflicts, unassessed rules, incomplete coverage).
- Actionable structured Capture Requests (guidance for field inspectors).
- Full JSON serialization compatibility.
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

import pytest

from llm.schema import (
    CommonFieldDeclaration,
    DateDeclaration,
    FieldProvenance,
    MrpDeclaration,
    NetQuantityDeclaration,
    PartyDeclaration,
    StructuredDeclarationResult,
)
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
from rules_engine import CheckContext, FindingResult


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

def _make_dummy_finding(
    check_id: str,
    verdict: str,
    title: str = "Test Rule",
    rule_id: str | None = None,
    limb: str | None = None,
    panel: str = "front",
    reason: str | None = None,
    severity: str = "critical",
) -> FindingResult:
    return FindingResult(
        check_id=check_id,
        title=title,
        verdict=verdict,  # type: ignore
        severity=severity,  # type: ignore
        rule_id=rule_id or f"RULE_{check_id}",
        rule_pack_version="2026.07.v1",
        citation="Legal Metrology (Packaged Commodities) Rules, 2011",
        ledger_ref="RULE_LEDGER_01",
        limb=limb if verdict == "fail" else None,
        reason=reason or (f"{check_id} failed" if verdict == "fail" else (f"{check_id} unassessed" if verdict == "not_assessed" else None)),
        observed="Observed 500 g" if verdict == "pass" else "Missing declaration",
        required="Mandatory declaration required",
        remediation="Ensure declaration is printed conspicuously on PDP",
        evidence_provenance={
            "source_panel": panel,
            "source_text": "sample text",
            "bbox": [10, 10, 100, 50],
        },
    )


# ---------------------------------------------------------------------------
# 1. Deterministic Text & Semantic Normalization
# ---------------------------------------------------------------------------

def test_normalize_party_text():
    # Corporate abbreviations
    t1 = "Acme Foods Pvt. Ltd., Plot No. 12, Indl Area, Rd 4, Dist Thane"
    t2 = "ACME FOODS PRIVATE LIMITED, Plot 12, Industrial Area, Road 4, District Thane"
    assert normalize_party_text(t1) == normalize_party_text(t2)

    # Distinct parties do not normalize to the same string
    p1 = "Acme Foods Pvt Ltd"
    p2 = "Zenith Agro Industries Limited"
    assert normalize_party_text(p1) != normalize_party_text(p2)

    # Empty / None handling
    assert normalize_party_text(None) == ""
    assert normalize_party_text("") == ""


def test_normalize_commodity_name():
    c1 = "Refined Wheat Flour (Maida)"
    c2 = "refined wheat flour  maida "
    assert normalize_commodity_name(c1) == normalize_commodity_name(c2)

    # Materially different
    assert normalize_commodity_name("Basmati Rice") != normalize_commodity_name("Wheat Flour")


def test_normalize_date_semantic():
    assert normalize_date_semantic("2026-03-15") == "2026-03-15"
    assert normalize_date_semantic("15/03/2026") == "2026-03-15"
    assert normalize_date_semantic("03/2026") == "2026-03"
    assert normalize_date_semantic("2026-03") == "2026-03"
    assert normalize_date_semantic(None) == ""


# ---------------------------------------------------------------------------
# 2. Cross-Panel Consistency: Retail Sale Price (MRP)
# ---------------------------------------------------------------------------

def test_cross_panel_mrp_conflict_detected():
    """Conflicting MRP values across panels (e.g. ₹260 on front vs ₹280 on back) must produce a StatutoryConflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            mrp=MrpDeclaration(
                value=260.0,
                currency="INR",
                raw_text="MRP Rs. 260",
                provenance=FieldProvenance(source_panel="front", source_text="MRP Rs. 260"),
            ),
        ),
        "back": StructuredDeclarationResult(
            mrp=MrpDeclaration(
                value=280.0,
                currency="INR",
                raw_text="MRP Rs. 280",
                provenance=FieldProvenance(source_panel="back", source_text="MRP Rs. 280"),
            ),
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_MRP_001",
        panel_declarations=panel_declarations,
    )

    assert len(conflicts) == 1
    c = conflicts[0]
    assert c.field == "mrp"
    assert c.severity == "critical"
    assert "260" in c.reason and "280" in c.reason
    assert c.resolution_status == "unresolved"
    assert len(c.evidence_refs) == 2


def test_cross_panel_mrp_matching_no_conflict():
    """Identical MRP values across front and back panels should not trigger a conflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            mrp=MrpDeclaration(
                value=250.0,
                currency="INR",
                raw_text="MRP Rs. 250",
                provenance=FieldProvenance(source_panel="front"),
            ),
        ),
        "back": StructuredDeclarationResult(
            mrp=MrpDeclaration(
                value=250.0,
                currency="INR",
                raw_text="MRP Rs. 250",
                provenance=FieldProvenance(source_panel="back"),
            ),
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_MRP_002",
        panel_declarations=panel_declarations,
    )
    assert len(conflicts) == 0


# ---------------------------------------------------------------------------
# 3. Cross-Panel Consistency: Net Quantity
# ---------------------------------------------------------------------------

def test_cross_panel_net_quantity_conflict_detected():
    """Conflicting Net Quantity (5 kg on front vs 4 kg on side) must produce a StatutoryConflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            net_quantity=NetQuantityDeclaration(
                value=5.0,
                unit="kg",
                raw_text="Net Qty: 5 kg",
                normalized_value=5.0,
                normalized_unit="kg",
                provenance=FieldProvenance(source_panel="front"),
            ),
        ),
        "side": StructuredDeclarationResult(
            net_quantity=NetQuantityDeclaration(
                value=4.0,
                unit="kg",
                raw_text="Net Qty: 4 kg",
                normalized_value=4.0,
                normalized_unit="kg",
                provenance=FieldProvenance(source_panel="side"),
            ),
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_NQ_001",
        panel_declarations=panel_declarations,
    )

    assert len(conflicts) == 1
    c = conflicts[0]
    assert c.field == "net_quantity"
    assert c.severity == "critical"
    assert "5" in c.reason and "4" in c.reason


# ---------------------------------------------------------------------------
# 4. Cross-Panel Consistency: Dates
# ---------------------------------------------------------------------------

def test_cross_panel_date_consistency_conflicting_mfg():
    """Conflicting MFG dates across panels must produce a StatutoryConflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            dates=[
                DateDeclaration(
                    date_type_candidate="mfg",
                    normalized_date="2026-01-15",
                    status="confirmed",
                    raw_text="MFG: 15/01/2026",
                    provenance=FieldProvenance(source_panel="front"),
                )
            ]
        ),
        "back": StructuredDeclarationResult(
            dates=[
                DateDeclaration(
                    date_type_candidate="mfg",
                    normalized_date="2026-03-20",
                    status="confirmed",
                    raw_text="MFG: 20/03/2026",
                    provenance=FieldProvenance(source_panel="back"),
                )
            ]
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_DATE_001",
        panel_declarations=panel_declarations,
    )

    assert len(conflicts) == 1
    assert conflicts[0].field == "date_mfg"
    assert conflicts[0].severity == "major"


def test_cross_panel_date_consistency_different_types_coexisting():
    """Different statutory date types (MFG on front and EXP on back) are legally expected to coexist; no conflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            dates=[
                DateDeclaration(
                    date_type_candidate="mfg",
                    normalized_date="2026-01-15",
                    status="confirmed",
                    raw_text="MFG: 15/01/2026",
                    provenance=FieldProvenance(source_panel="front"),
                )
            ]
        ),
        "back": StructuredDeclarationResult(
            dates=[
                DateDeclaration(
                    date_type_candidate="exp",
                    normalized_date="2026-12-31",
                    status="confirmed",
                    raw_text="EXP: 31/12/2026",
                    provenance=FieldProvenance(source_panel="back"),
                )
            ]
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_DATE_002",
        panel_declarations=panel_declarations,
    )
    assert len(conflicts) == 0


# ---------------------------------------------------------------------------
# 5. Cross-Panel Consistency: Parties
# ---------------------------------------------------------------------------

def test_cross_panel_party_conflict_detected():
    """Conflicting manufacturer names across panels must produce a StatutoryConflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            parties=[
                PartyDeclaration(
                    party_type="manufacturer",
                    name="Acme Foods Private Limited",
                    provenance=FieldProvenance(source_panel="front"),
                )
            ]
        ),
        "back": StructuredDeclarationResult(
            parties=[
                PartyDeclaration(
                    party_type="manufacturer",
                    name="Zenith Agro Industries",
                    provenance=FieldProvenance(source_panel="back"),
                )
            ]
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_PARTY_001",
        panel_declarations=panel_declarations,
    )

    assert len(conflicts) == 1
    assert conflicts[0].field == "party_manufacturer_name"
    assert conflicts[0].severity == "major"


def test_cross_panel_party_normalized_matching():
    """Equivalent party names with differences only in abbreviations / casing should not produce conflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            parties=[
                PartyDeclaration(
                    party_type="manufacturer",
                    name="Acme Foods Pvt. Ltd., Indl Area",
                    provenance=FieldProvenance(source_panel="front"),
                )
            ]
        ),
        "back": StructuredDeclarationResult(
            parties=[
                PartyDeclaration(
                    party_type="manufacturer",
                    name="ACME FOODS PRIVATE LIMITED, Industrial Area",
                    provenance=FieldProvenance(source_panel="back"),
                )
            ]
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_PARTY_002",
        panel_declarations=panel_declarations,
    )
    assert len(conflicts) == 0


# ---------------------------------------------------------------------------
# 6. Finding Deduplication
# ---------------------------------------------------------------------------

def test_deduplicate_findings_fail_outranks_pass():
    """If the same rule has both a FAIL and a PASS across different lines/panels, FAIL wins and supporting evidence is merged."""
    f1 = _make_dummy_finding("CHK04", "pass", title="MRP Declaration", panel="front")
    f2 = _make_dummy_finding("CHK04", "fail", title="MRP Declaration", panel="back", reason="MRP missing inclusive statement")

    deduped = deduplicate_findings([f1, f2])
    assert len(deduped) == 1
    assert deduped[0].verdict == "fail"
    assert deduped[0].check_id == "CHK04"
    prov = getattr(deduped[0], "evidence_provenance", {}) or {}
    assert "supporting_evidence" in prov
    assert len(prov["supporting_evidence"]) == 2


def test_deduplicate_findings_pass_outranks_not_assessed():
    """If a rule was NOT_ASSESSED on one panel but passed on another (e.g. PDP), PASS wins."""
    f1 = _make_dummy_finding("CHK05", "not_assessed", title="Net Quantity", panel="side")
    f2 = _make_dummy_finding("CHK05", "pass", title="Net Quantity", panel="front")

    deduped = deduplicate_findings([f1, f2])
    assert len(deduped) == 1
    assert deduped[0].verdict == "pass"


# ---------------------------------------------------------------------------
# 7. Assessment Completeness Model
# ---------------------------------------------------------------------------

def test_assessment_completeness_partial_coverage():
    """Physical package with only front panel captured cannot be certified COMPLETE or COMPLIANT."""
    findings = [
        _make_dummy_finding("CHK01", "pass"),
        _make_dummy_finding("CHK04", "pass"),
        _make_dummy_finding("CHK05", "pass"),
    ]

    completeness = determine_assessment_completeness(
        findings=findings,
        captured_panels={"front"},
        inspection_source="physical_package",
    )

    assert completeness.status == "PARTIAL"
    assert completeness.coverage_sufficient is False
    assert "back/side" in completeness.missing_panels


def test_assessment_completeness_complete_coverage():
    """Physical package with front and back panels captured and all passes is COMPLETE."""
    findings = [
        _make_dummy_finding("CHK01", "pass"),
        _make_dummy_finding("CHK04", "pass"),
        _make_dummy_finding("CHK05", "pass"),
    ]

    completeness = determine_assessment_completeness(
        findings=findings,
        captured_panels={"front", "back"},
        inspection_source="physical_package",
    )

    assert completeness.status == "COMPLETE"
    assert completeness.coverage_sufficient is True
    assert len(completeness.missing_panels) == 0


# ---------------------------------------------------------------------------
# 8. Master Aggregator: aggregate_inspection_assessment
# ---------------------------------------------------------------------------

def test_aggregate_assessment_compliant():
    """Complete multi-panel inspection with all rules passing and zero conflicts yields COMPLIANT."""
    findings = [
        _make_dummy_finding("CHK01", "pass", title="Commodity Name"),
        _make_dummy_finding("CHK04", "pass", title="MRP Declaration"),
        _make_dummy_finding("CHK05", "pass", title="Net Quantity Declaration"),
        _make_dummy_finding("CHK06", "pass", title="Date of Manufacture"),
        _make_dummy_finding("CHK07", "pass", title="Manufacturer Name & Address"),
        _make_dummy_finding("CHK08", "pass", title="Consumer Care Details"),
        _make_dummy_finding("CHK09", "pass", title="Numeral Height & Placement"),
    ]

    ctx = CheckContext(
        panels_captured={"front", "back"},
        pdp_surface_established=True,
        established_pdp_panel="front",
        scale_source="id1_card",
        mm_per_pixel=0.12,
    )

    assessment = aggregate_inspection_assessment(
        inspection_id="INSP_COMP_001",
        findings=findings,
        captured_panels={"front", "back"},
        ctx=ctx,
    )

    assert assessment.overall_verdict == "COMPLIANT"
    assert assessment.assessment_completeness.status == "COMPLETE"
    assert assessment.total_rules == 7
    assert assessment.passed_rules == 7
    assert assessment.failed_rules == 0
    assert assessment.not_assessed_rules == 0
    assert len(assessment.conflicts) == 0
    assert assessment.violation_dossier is None
    assert assessment.review_dossier is None
    assert assessment.evidence_summary.pdp_established is True
    assert assessment.evidence_summary.scale_source == "id1_card"


def test_aggregate_assessment_violation_with_dossier():
    """Confirmed failure yields VIOLATION verdict and an audit-ready ViolationDossier with statutory limbs."""
    findings = [
        _make_dummy_finding("CHK01", "pass", title="Commodity Name"),
        _make_dummy_finding("CHK04", "fail", title="MRP Declaration", limb="36(1)", reason="Missing MRP declaration"),
        _make_dummy_finding("CHK05", "pass", title="Net Quantity"),
    ]

    assessment = aggregate_inspection_assessment(
        inspection_id="INSP_VIOL_001",
        findings=findings,
        captured_panels={"front", "back"},
    )

    assert assessment.overall_verdict == "VIOLATION"
    assert assessment.failed_rules == 1
    assert assessment.violation_dossier is not None

    dossier = assessment.violation_dossier
    assert dossier.total_violations == 1
    assert "36(1)" in dossier.affected_limbs
    assert "Section 36(1)" in dossier.statutory_summary
    v_item = dossier.violations[0]
    assert v_item.rule_code == "CHK04"
    assert v_item.statutory_limb == "36(1)"
    assert "Violation under" in v_item.inspector_explanation
    assert v_item.legal_provenance["statutory_limb"] == "36(1)"


def test_aggregate_assessment_review_required_due_to_conflict():
    """Presence of an unresolved statutory conflict forces REVIEW_REQUIRED regardless of passing rules."""
    findings = [
        _make_dummy_finding("CHK01", "pass"),
        _make_dummy_finding("CHK04", "pass"),
        _make_dummy_finding("CHK05", "pass"),
    ]

    panel_declarations = {
        "front": StructuredDeclarationResult(
            mrp=MrpDeclaration(value=260.0, provenance=FieldProvenance(source_panel="front", source_text="₹260")),
        ),
        "back": StructuredDeclarationResult(
            mrp=MrpDeclaration(value=280.0, provenance=FieldProvenance(source_panel="back", source_text="₹280")),
        ),
    }

    assessment = aggregate_inspection_assessment(
        inspection_id="INSP_REV_001",
        findings=findings,
        captured_panels={"front", "back"},
        panel_declarations=panel_declarations,
    )

    assert assessment.overall_verdict == "REVIEW_REQUIRED"
    assert len(assessment.conflicts) == 1
    assert assessment.review_dossier is not None
    assert assessment.review_dossier.unresolved_conflicts_count == 1
    assert any(item.review_type == "conflict" for item in assessment.review_dossier.review_items)


def test_aggregate_assessment_partial_coverage_never_compliant():
    """If only front panel is captured, verdict must be REVIEW_REQUIRED, never COMPLIANT."""
    findings = [
        _make_dummy_finding("CHK01", "pass"),
        _make_dummy_finding("CHK04", "pass"),
        _make_dummy_finding("CHK05", "pass"),
    ]

    assessment = aggregate_inspection_assessment(
        inspection_id="INSP_PARTIAL_001",
        findings=findings,
        captured_panels={"front"},  # Missing back/side panel
    )

    assert assessment.overall_verdict == "REVIEW_REQUIRED"
    assert assessment.assessment_completeness.status == "PARTIAL"
    assert assessment.assessment_completeness.coverage_sufficient is False
    assert len(assessment.actionable_capture_requests) > 0
    cap_req = assessment.actionable_capture_requests[0]
    assert cap_req.target_panel == "back"
    assert cap_req.priority == "high"


def test_aggregate_assessment_out_of_scope():
    """Wholesale or institutional transactions are marked OUT_OF_SCOPE."""
    ctx = CheckContext(
        transaction_type="institutional",
        halted="CHK02",
    )
    findings = [_make_dummy_finding("CHK02", "pass")]

    assessment = aggregate_inspection_assessment(
        inspection_id="INSP_OOS_001",
        findings=findings,
        ctx=ctx,
    )

    assert assessment.overall_verdict == "OUT_OF_SCOPE"


# ---------------------------------------------------------------------------
# 9. Actionable Capture Guidance
# ---------------------------------------------------------------------------

def test_actionable_capture_requests_scale_and_clear_space():
    """Identifies uncalibrated geometry and generates actionable scale card capture request."""
    findings = [
        _make_dummy_finding("CHK07", "not_assessed", title="Numeral Height", reason="Scale calibration unavailable"),
        _make_dummy_finding("CHK09", "not_assessed", title="Clear Space", reason="Interfering glare"),
    ]
    completeness = AssessmentCompleteness(status="PARTIAL", missing_panels=["back"])

    requests = generate_actionable_capture_requests(
        findings=findings,
        completeness=completeness,
        conflicts=[],
    )

    req_ids = [r.request_id for r in requests]
    assert "CAP_PANEL_BACK" in req_ids
    assert "CAP_SCALE_REFERENCE" in req_ids
    assert "CAP_CLEAR_SPACE_CLEAN" in req_ids

    scale_req = next(r for r in requests if r.request_id == "CAP_SCALE_REFERENCE")
    assert "ID-1" in scale_req.expected_declaration_or_evidence or "5-INR" in scale_req.expected_declaration_or_evidence


# ---------------------------------------------------------------------------
# 10. Complete Serialization & Additional Edge Cases
# ---------------------------------------------------------------------------

def test_cross_panel_commodity_conflict_detected():
    """Conflicting commodity names across panels must produce a StatutoryConflict."""
    panel_declarations = {
        "front": StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(
                value="Basmati Rice",
                provenance=FieldProvenance(source_panel="front"),
            ),
        ),
        "back": StructuredDeclarationResult(
            commodity_name=CommonFieldDeclaration(
                value="Wheat Flour",
                provenance=FieldProvenance(source_panel="back"),
            ),
        ),
    }

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_COMM_001",
        panel_declarations=panel_declarations,
    )

    assert len(conflicts) == 1
    assert conflicts[0].field == "commodity_name"
    assert "Basmati Rice" in conflicts[0].reason and "Wheat Flour" in conflicts[0].reason


def test_candidates_in_llm_result_conflict_detection():
    """StructuredDeclarationResult with candidates across panels triggers conflict detection."""
    from llm.schema import CandidateItem

    llm_res = StructuredDeclarationResult(
        mrp=MrpDeclaration(
            value=260.0,
            provenance=FieldProvenance(source_panel="front", source_text="₹260"),
            candidates=[
                CandidateItem(value="280.0", panel="back", raw_text="₹280"),
            ],
        ),
        net_quantity=NetQuantityDeclaration(
            value=5.0,
            unit="kg",
            provenance=FieldProvenance(source_panel="front", source_text="5 kg"),
            candidates=[
                CandidateItem(value="4 kg", panel="side", raw_text="4 kg"),
            ],
        ),
    )

    conflicts = detect_cross_panel_conflicts(
        inspection_id="INSP_CAND_001",
        llm_result=llm_res,
    )

    fields = [c.field for c in conflicts]
    assert "mrp" in fields
    assert "net_quantity" in fields


def test_deduplicate_findings_empty_and_not_assessed_only():
    """Deduplication handles empty list and resolves multiple NOT_ASSESSED findings."""
    assert deduplicate_findings([]) == []

    f1 = _make_dummy_finding("CHK05", "not_assessed", title="Net Quantity", panel="front")
    f2 = _make_dummy_finding("CHK05", "not_assessed", title="Net Quantity", panel="back")

    deduped = deduplicate_findings([f1, f2])
    assert len(deduped) == 1
    assert deduped[0].verdict == "not_assessed"
    prov = getattr(deduped[0], "evidence_provenance", {}) or {}
    assert "supporting_evidence" in prov
    assert len(prov["supporting_evidence"]) == 2


def test_multi_image_evidence_summary():
    """EvidenceSummary preserves panel images and coordinate provenance."""
    class DummyImage:
        def __init__(self, id, panel, file_path, sha256):
            self.id = id
            self.panel = panel
            self.file_path = file_path
            self.sha256 = sha256

    images = [
        DummyImage(1, "front", "/path/to/front.jpg", "sha_front_123"),
        DummyImage(2, "back", "/path/to/back.jpg", "sha_back_456"),
    ]

    findings = [_make_dummy_finding("CHK01", "pass")]
    assessment = aggregate_inspection_assessment(
        inspection_id="INSP_IMG_001",
        findings=findings,
        images=images,
        captured_panels={"front", "back"},
    )

    ev = assessment.evidence_summary
    assert ev.total_panels_captured == 2
    assert "front" in ev.images_by_panel
    assert "back" in ev.images_by_panel
    assert ev.images_by_panel["front"][0]["sha256"] == "sha_front_123"


def test_inspection_assessment_json_serialization():
    """Validates that InspectionAssessment serializes cleanly to a dictionary and valid JSON."""
    findings = [
        _make_dummy_finding("CHK01", "fail", title="Commodity Name", limb="36(1)"),
        _make_dummy_finding("CHK04", "pass", title="MRP Declaration"),
    ]

    assessment = aggregate_inspection_assessment(
        inspection_id="INSP_SERIALIZE_001",
        findings=findings,
        captured_panels={"front", "back"},
    )

    d = assessment.to_dict()
    assert isinstance(d, dict)
    assert d["inspection_id"] == "INSP_SERIALIZE_001"
    assert d["overall_verdict"] == "VIOLATION"
    assert "violation_dossier" in d
    assert d["violation_dossier"]["total_violations"] == 1

    # Verify JSON encoding succeeds without errors
    json_str = json.dumps(d)
    assert isinstance(json_str, str)
    assert "INSP_SERIALIZE_001" in json_str
