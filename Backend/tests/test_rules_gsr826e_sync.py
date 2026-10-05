"""Backend/tests/test_rules_gsr826e_sync.py — Fourth Amendment Legal-Source Synchronization Tests.

Gazette Instrument:
- Legal Metrology (Packaged Commodities) Fourth Amendment Rules, 2026
- Notification: G.S.R. 826(E), dated 21 September 2026
- Effective Date: 2026-09-21
- Substantive changes:
  1. Inserts clause (d) into Rule 6(4A) for soaps, shampoos, toothpastes, cosmetics, toiletries:
     - Green dot for vegetarian origin
     - Red or brown dot for non-vegetarian origin
     - Located at top of Principal Display Panel (PDP)
  2. Omits former Rule 6(8)
- Critical Legal Interpretation:
  Parent Rule 6(4A) introductory language is permissive ('Nothing in these rules shall preclude...').
  Statutory enforceability of omission is ambiguous under Section 36(1); system models missing dot
  as not_assessed (MANUAL_REVIEW) with limb=None, never converting legal ambiguity into false FAIL.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path
import pytest

from rules import (
    evaluate_origin_marking,
    evaluate_visual_and_geometry_rules,
    generate_rule_pack_report,
    load_rule_pack,
)
from rules_engine import CheckContext, FindingResult


# ===========================================================================
# 1. Historical Reproducibility & Timeline Verification (Section 15)
# ===========================================================================

def test_1_inspection_2026_07_01_uses_previous_pack():
    """Test 1: Inspection on 2026-07-01 resolves to previous applicable pack (2026.07.v1)."""
    pack = load_rule_pack(as_at=date(2026, 7, 1))
    assert pack.rule_pack_version == "2026.07.v1"
    assert pack.rules_as_at == "2026-07-01"


def test_2_inspection_2026_09_20_does_not_use_fourth_amendment():
    """Test 2: Inspection on 2026-09-20 (day before amendment) does NOT use Rule 6(4A)(d)."""
    pack_v2 = load_rule_pack("2026.09.v1")
    rule_new = pack_v2.get_rule_by_id("RULE_LMPC_23_ORIGIN_MARKING_COSMETICS")
    assert rule_new is not None
    assert rule_new.effective_from == "2026-09-21"

    # Rule 6(4A)(d) must NOT be active on 2026-09-20
    assert rule_new.is_effective_on(date(2026, 9, 20)) is False

    # Check code resolution on 2026-09-20 resolves to historical Rule 6(8)
    rule_resolved = pack_v2.get_rule_by_id("CHK23", as_at=date(2026, 9, 20))
    assert rule_resolved is not None
    assert rule_resolved.rule_id == "RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL"
    assert rule_resolved.is_effective_on(date(2026, 9, 20)) is True


def test_3_inspection_2026_09_21_uses_fourth_amendment():
    """Test 3: Inspection on 2026-09-21 activates Rule 6(4A)(d)."""
    pack_v2 = load_rule_pack("2026.09.v1")
    rule_new = pack_v2.get_rule_by_id("RULE_LMPC_23_ORIGIN_MARKING_COSMETICS")
    assert rule_new.is_effective_on(date(2026, 9, 21)) is True

    # Rule lookup for CHK23 on 2026-09-21 returns Rule 6(4A)(d)
    rule_active = pack_v2.get_rule_by_id("CHK23", as_at=date(2026, 9, 21))
    assert rule_active is not None
    assert rule_active.rule_id == "RULE_LMPC_23_ORIGIN_MARKING_COSMETICS"
    assert rule_active.source_rule == "Rule 6(4A)(d)"

    # Historical Rule 6(8) must be EXPIRED on 2026-09-21
    rule_hist = pack_v2.get_rule_by_id("RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL")
    assert rule_hist.is_effective_on(date(2026, 9, 21)) is False


def test_4_inspection_2026_09_22_continues_amended_provision():
    """Test 4: Inspection on 2026-09-22 continues using the Fourth Amendment provision."""
    pack_v2 = load_rule_pack("2026.09.v1")
    rule_new = pack_v2.get_rule_by_id("RULE_LMPC_23_ORIGIN_MARKING_COSMETICS")
    assert rule_new.is_effective_on(date(2026, 9, 22)) is True

    rule_active = pack_v2.get_rule_by_id("CHK23", as_at=date(2026, 9, 22))
    assert rule_active.rule_id == "RULE_LMPC_23_ORIGIN_MARKING_COSMETICS"


def test_5_historical_rule_6_8_behavior_reproducible():
    """Test 5: Historical Rule 6(8) behavior remains reproducible for pre-2026-09-21 dates.

    Under former Rule 6(8), an affirmative mandate existed. Complete package coverage
    with an unobserved symbol produced a FAIL under Section 36(1).
    """
    ctx_historical = CheckContext(
        commodity_generic="Shampoo",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=False,
        panels_captured={"front", "back"},
        rules_as_at=date(2026, 8, 15),  # Historical date under Rule 6(8)
    )
    res = evaluate_origin_marking(ctx_historical)
    assert res.verdict == "fail"
    assert res.limb == "36(1)"
    assert res.rule_id == "RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL"
    assert "former Rule 6(8)" in res.required


def test_6_future_pack_cannot_retroactively_rewrite_historical_findings():
    """Test 6: Historical evaluation results cannot be retroactively rewritten by future rule packs."""
    # Historical inspection stored on 2026-08-01
    historical_stored_result = {
        "check_id": "CHK23",
        "rule_id": "RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL",
        "verdict": "fail",
        "limb": "36(1)",
        "rule_pack_version": "2026.09.v1",
        "rules_as_at": "2026-08-01",
    }

    # Running post-amendment evaluation does NOT modify stored dictionary
    ctx_current = CheckContext(
        commodity_generic="Shampoo",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=False,
        panels_captured={"front", "back"},
        rules_as_at=date(2026, 9, 25),
    )
    current_res = evaluate_origin_marking(ctx_current)
    assert current_res.verdict == "not_assessed"
    assert current_res.rule_id == "RULE_LMPC_23_ORIGIN_MARKING_COSMETICS"

    # Verify historical stored finding is completely untouched
    assert historical_stored_result["verdict"] == "fail"
    assert historical_stored_result["rule_id"] == "RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL"
    assert historical_stored_result["limb"] == "36(1)"


# ===========================================================================
# 2. Rule Pack Timeline & Validation (Section 5 & 16)
# ===========================================================================

def test_no_overlapping_effective_windows_for_chk23():
    """CHK23 historical and current provisions must have strictly disjoint effective windows."""
    pack_v2 = load_rule_pack("2026.09.v1")
    chk23_rules = [r for r in pack_v2.rules if r.code == "CHK23"]
    assert len(chk23_rules) == 2

    r_hist = next(r for r in chk23_rules if r.rule_id == "RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL")
    r_new = next(r for r in chk23_rules if r.rule_id == "RULE_LMPC_23_ORIGIN_MARKING_COSMETICS")

    assert r_hist.effective_to == "2026-09-20"
    assert r_new.effective_from == "2026-09-21"
    assert r_hist.effective_to_date < r_new.effective_from_date


def test_no_gap_in_chk23_timeline():
    """Historical rule ends 2026-09-20 and new rule begins 2026-09-21 with exactly zero days gap."""
    pack_v2 = load_rule_pack("2026.09.v1")
    r_hist = pack_v2.get_rule_by_id("RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL")
    r_new = pack_v2.get_rule_by_id("RULE_LMPC_23_ORIGIN_MARKING_COSMETICS")

    delta = r_new.effective_from_date - r_hist.effective_to_date
    assert delta.days == 1


def test_rule_pack_validate_zero_errors_for_2026_09_v1():
    """The new 2026.09.v1 rule pack must validate with 0 errors under Section 24 rules."""
    pack_v2 = load_rule_pack("2026.09.v1", enforce_strict_validation=True)
    errors = pack_v2.validate()
    assert errors == []
    assert len(pack_v2.rules) == 26


# ===========================================================================
# 3. Category Applicability (Section 8)
# ===========================================================================

@pytest.mark.parametrize("category", [
    "soap", "Soap", "shampoo", "SHAMPOO", "toothpaste", "Toothpaste",
    "cosmetics", "Cosmetic", "toiletries", "skin_care", "hair_care",
])
def test_category_applicable_personal_care_products(category: str):
    """Rule 6(4A)(d) applies to soaps, shampoos, toothpastes, cosmetics, and toiletries."""
    ctx = CheckContext(
        commodity_generic=category,
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=True,
        origin_symbol_panel="front",
        origin_symbol_colour="green",
        origin_symbol_placement="top_pdp",
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "pass"
    assert res.check_id == "CHK23"


@pytest.mark.parametrize("non_applicable_commodity", [
    "Biscuits", "Wheat Flour", "Atta", "Basmati Rice", "Tea",
    "Packaged Drinking Water", "Refined Sunflower Oil", "LED Television",
    "Garments", "Shoe Polish", "Cement", "Detergent Powder",
])
def test_category_non_applicable_commodities_return_pass(non_applicable_commodity: str):
    """Commodities outside cosmetics/toiletries scope must return PASS (rule does not apply)."""
    ctx = CheckContext(
        commodity_generic=non_applicable_commodity,
        product_origin="vegetarian",
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "pass"
    assert "does not apply" in res.observed


def test_category_unknown_returns_not_assessed():
    """If product category is unknown or None, rule returns NOT_ASSESSED, never false FAIL."""
    ctx = CheckContext(
        commodity_generic="",
        product_origin="vegetarian",
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "not_assessed"
    assert "category could not be established" in res.reason


# ===========================================================================
# 4. Origin & PDP Evidence Safeguards (Sections 9, 10, 11, 12)
# ===========================================================================

def test_unknown_origin_returns_not_assessed():
    """If product origin (veg vs non-veg) is unknown, return NOT_ASSESSED; never guess."""
    ctx = CheckContext(
        commodity_generic="Toothpaste",
        product_origin="unknown",
        pdp_surface_established=True,
        established_pdp_panel="front",
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "not_assessed"
    assert "origin" in res.reason.lower()


def test_unestablished_pdp_returns_not_assessed():
    """If PDP surface is not affirmatively established, return NOT_ASSESSED."""
    ctx = CheckContext(
        commodity_generic="Toothpaste",
        product_origin="vegetarian",
        pdp_surface_established=False,  # Unestablished!
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "not_assessed"
    assert "PDP" in res.reason


def test_symbol_outside_pdp_returns_fail():
    """If origin symbol is placed on a panel other than the PDP, return FAIL."""
    ctx = CheckContext(
        commodity_generic="Face Wash",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=True,
        origin_symbol_panel="back",  # Back, not front PDP!
        origin_symbol_colour="green",
        origin_symbol_placement="top",
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "fail"
    assert "not on established PDP" in res.observed


def test_symbol_not_at_top_of_pdp_returns_fail():
    """If origin symbol is at the bottom of PDP, return FAIL under Rule 6(4A)(d)."""
    ctx = CheckContext(
        commodity_generic="Toothpaste",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=True,
        origin_symbol_panel="front",
        origin_symbol_colour="green",
        origin_symbol_placement="bottom_pdp",  # Bottom instead of top!
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "fail"
    assert "not at the top" in res.observed


def test_symbol_placement_unestablished_returns_not_assessed():
    """If symbol is detected on PDP but placement relative to top is unknown, return NOT_ASSESSED."""
    ctx = CheckContext(
        commodity_generic="Toothpaste",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=True,
        origin_symbol_panel="front",
        origin_symbol_colour="green",
        origin_symbol_placement=None,  # Placement unverified!
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "not_assessed"
    assert "placement" in res.reason.lower()


# ===========================================================================
# 5. Colour Evaluation & Evidence Grounding (Section 11)
# ===========================================================================

def test_vegetarian_with_green_dot_passes():
    """Vegetarian cosmetic with green dot at top of PDP yields PASS."""
    ctx = CheckContext(
        commodity_generic="Body Lotion",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=True,
        origin_symbol_panel="front",
        origin_symbol_colour="green",
        origin_symbol_placement="top_pdp",
        origin_symbol_image_id="img_101",
        origin_symbol_bbox=[100, 20, 140, 60],
        origin_symbol_engineering_signal={"dominant_hue": 120, "chroma": 0.8},
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "pass"
    assert res.evidence_provenance["source_panel"] == "front"
    assert res.evidence_provenance["source_image_id"] == "img_101"
    assert res.evidence_provenance["observed_colour"] == "green"


def test_vegetarian_with_red_or_brown_dot_fails():
    """Vegetarian cosmetic displaying red or brown dot yields confirmed FAIL."""
    for wrong_colour in ["red", "brown", "red_dot", "brown_dot"]:
        ctx = CheckContext(
            commodity_generic="Shampoo",
            product_origin="vegetarian",
            pdp_surface_established=True,
            established_pdp_panel="front",
            origin_symbol_detected=True,
            origin_symbol_panel="front",
            origin_symbol_colour=wrong_colour,
            origin_symbol_placement="top_pdp",
            rules_as_at=date(2026, 9, 21),
        )
        res = evaluate_origin_marking(ctx)
        assert res.verdict == "fail"
        assert "instead of required green dot" in res.observed


def test_non_vegetarian_with_red_or_brown_dot_passes():
    """Non-vegetarian cosmetic with red or brown dot at top of PDP yields PASS."""
    for valid_colour in ["red", "brown", "red_dot", "brown_dot"]:
        ctx = CheckContext(
            commodity_generic="Skin Cream",
            product_origin="non_vegetarian",
            pdp_surface_established=True,
            established_pdp_panel="front",
            origin_symbol_detected=True,
            origin_symbol_panel="front",
            origin_symbol_colour=valid_colour,
            origin_symbol_placement="top_pdp",
            rules_as_at=date(2026, 9, 21),
        )
        res = evaluate_origin_marking(ctx)
        assert res.verdict == "pass"


def test_non_vegetarian_with_green_dot_fails():
    """Non-vegetarian cosmetic displaying green dot yields confirmed FAIL."""
    ctx = CheckContext(
        commodity_generic="Skin Cream",
        product_origin="non_vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=True,
        origin_symbol_panel="front",
        origin_symbol_colour="green",
        origin_symbol_placement="top_pdp",
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "fail"
    assert "instead of required red or brown dot" in res.observed


def test_uncertain_colour_signal_returns_not_assessed():
    """No manufactured statutory RGB threshold: ambiguous colour returns NOT_ASSESSED."""
    ctx = CheckContext(
        commodity_generic="Shampoo",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=True,
        origin_symbol_panel="front",
        origin_symbol_colour="unknown",
        origin_symbol_placement="top_pdp",
        rules_as_at=date(2026, 9, 21),
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "not_assessed"
    assert "colour" in res.reason.lower()


# ===========================================================================
# 6. Critical Legal-Interpretation & Sanction Safeguards (Sections 3 & 13)
# ===========================================================================

def test_missing_dot_under_rule_6_4a_d_is_manual_review_not_false_fail():
    """Section 3: Parent Rule 6(4A) is permissive. Missing dot must NOT yield automated FAIL.

    Missing origin dot evaluates to not_assessed with explicit MANUAL_REVIEW guidance
    and zero Section 36 offence limbs.
    """
    ctx = CheckContext(
        commodity_generic="Toothpaste",
        product_origin="vegetarian",
        pdp_surface_established=True,
        established_pdp_panel="front",
        origin_symbol_detected=False,  # Dot not present
        panels_captured={"front", "back"},
        rules_as_at=date(2026, 9, 21),  # Fourth Amendment active
    )
    res = evaluate_origin_marking(ctx)
    assert res.verdict == "not_assessed"
    assert res.limb is None  # Section 13: Zero manufactured Section 36 limbs
    assert "MANUAL_REVIEW" in res.reason
    assert "permissive non-preclusion provision" in res.reason


def test_no_invented_sanctions_in_rule_pack():
    """Section 13: RULE_LMPC_23_ORIGIN_MARKING_COSMETICS carries null statutory_limb."""
    pack_v2 = load_rule_pack("2026.09.v1")
    rule = pack_v2.get_rule_by_id("RULE_LMPC_23_ORIGIN_MARKING_COSMETICS")
    assert rule.statutory_limb is None
    assert rule.severity == "advisory"


# ===========================================================================
# 7. Rule Coverage Report Verification (Section 14)
# ===========================================================================

def test_rule_coverage_report_for_2026_09_v1():
    """Section 14: Report shows 2026.09.v1 baseline with Fourth Amendment metrics."""
    pack_v2 = load_rule_pack("2026.09.v1")
    report = generate_rule_pack_report(pack_v2)

    assert report["active_rule_pack_version"] == "2026.09.v1"
    assert report["previous_rule_pack_version"] == "2026.07.v1"
    assert report["fourth_amendment_date"] == "2026-09-21"
    assert report["latest_effective_amendment"] == "2026-09-21"
    assert report["effective_date_range"]["latest"] == "2026-09-21"

    # Rule differentials
    assert report["new_or_changed_rules_count"] == 1
    assert "RULE_LMPC_23_ORIGIN_MARKING_COSMETICS" in report["new_or_changed_rules"]
    assert report["removed_or_expired_rules_count"] == 1
    assert "RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL" in report["removed_or_expired_rules"]

    # Manual review & visual requirements
    assert "RULE_LMPC_23_ORIGIN_MARKING_COSMETICS" in report["rules_requiring_manual_interpretation"]
    assert "RULE_LMPC_23_ORIGIN_MARKING_COSMETICS" in report["rules_with_visual_evidence_requirements"]
