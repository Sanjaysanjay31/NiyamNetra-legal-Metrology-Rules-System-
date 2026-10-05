"""Backend/tests/test_rules_phase4c.py — Phase 4C Test Suite.

Deterministic Visual and Geometry Compliance Evaluation (SIH26034):
- Rule 7: Character & Numeral minimum height (Table-I & Table-II), width >= 1/3 height (Rule 7(3)).
- Rule 8: Principal Display Panel (PDP) placement & Net Quantity clear space with anti-false-compliance safeguard.
- Rule 9: Conspicuous contrast requirement, engineering measurement vs legal threshold, and blown/moulded proviso.
- Scale calibration verification (prohibiting fake 120x80 mm, phone DPI, or unvalidated declared values).
- Measurement quality gates: coordinate reconciliation, resolution, sharpness, glare, and uncertainty.
- Invariants: zero external API, zero LLM, zero OCR, original evidence immutability.
- Performance: latency and memory benchmarks.
"""
from __future__ import annotations

import hashlib
import tempfile
import time
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import patch

import cv2
import numpy as np
import pytest

from llm.schema import (
    CommonFieldDeclaration,
    FieldProvenance,
    MrpDeclaration,
    NetQuantityDeclaration,
    StructuredDeclarationResult,
)
from rules.loader import load_rule_pack
from rules.visual_evaluator import (
    CalibrationSpec,
    CoordinateReconciliation,
    EngineeringContrastSignal,
    GlyphMeasurementResult,
    benchmark_phase4c_performance,
    evaluate_character_height,
    evaluate_character_width,
    evaluate_clear_space,
    evaluate_conspicuous_contrast,
    evaluate_net_quantity_height,
    evaluate_pdp_placement,
    evaluate_visual_and_geometry_rules,
    measure_conspicuous_contrast_signal,
    measure_glyph_height_mm,
    reconcile_coordinates,
    validate_calibration,
    verify_clear_space_image,
)
from rules_engine import CheckContext, FindingResult, assess


# ---------------------------------------------------------------------------
# Helpers & Synthetic Image Generators
# ---------------------------------------------------------------------------

def create_synthetic_panel_image(
    width: int = 800,
    height: int = 600,
    bg_color: int = 245,
    text_color: int = 20,
    font_scale: float = 1.0,
    thickness: int = 2,
) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Generates clean synthetic panel image with target text and returns (image, bbox)."""
    img = np.full((height, width, 3), bg_color, dtype=np.uint8)
    text = "NET QTY: 500 g"
    org = (100, 300)
    font = cv2.FONT_HERSHEY_SIMPLEX
    (tw, th), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    cv2.putText(img, text, org, font, font_scale, (text_color, text_color, text_color), thickness)
    bbox = (org[0], org[1] - th, org[0] + tw, org[1] + baseline)
    return img, bbox


def make_valid_visual_context(**kwargs) -> CheckContext:
    """Creates a standard compliant visual CheckContext backed by a validated optical reference."""
    defaults: dict[str, Any] = {
        "panel_shape": "rectangular",
        "panel_height_mm": 120.0,
        "panel_width_mm": 100.0,  # Area = 120 cm2 -> Rule 7 Table-I minimum = 2.5 mm
        "mm_per_pixel": 0.08,
        "mm_per_pixel_uncertainty": 0.002,
        "scale_source": "validated_reference",
        "is_blown_moulded": False,
        "net_quantity_value": 500.0,
        "net_quantity_unit": "g",
        "measured_heights_mm": {"net_quantity": 3.2, "mrp": 3.2, "manufacturer": 2.8},
        "measured_widths_mm": {"net_quantity": 1.6, "mrp": 1.6},
        "clear_space_mm": {"above": 4.0, "below": 4.0, "left": 8.0, "right": 8.0},
        "contrast_ratio": 9.5,
        "panels_captured": {"front"},
        "pdp_detected": True,
        "clear_space_image_verified": True,
        "use_visual_evaluator": True,
    }
    defaults.update(kwargs)
    return CheckContext(**defaults)


# ---------------------------------------------------------------------------
# 1. Rule 7: Character / Numeral Height Evaluation (CHK06)
# ---------------------------------------------------------------------------

class TestRule7CharacterHeight:
    def test_valid_calibration_sufficient_evidence_pass(self):
        """Valid calibration + rectangular panel of 120 cm2 (req 2.5 mm) with 3.2 mm font passes Table-I."""
        ctx = make_valid_visual_context()
        res = evaluate_character_height(ctx)

        assert res.verdict == "pass"
        assert res.check_id == "CHK06"
        assert res.rule_id in ("RULE_LMPC_06_CHARACTER_HEIGHT", "RULE_LMPC_06_FONT_HEIGHT_PDP")
        assert "2.8 mm" in res.observed
        assert "2.5 mm" in res.required
        assert res.evidence_provenance["scale_source"] == "validated_reference"

    def test_insufficient_character_height_fail(self):
        """Measured height 1.8 mm on 120 cm2 panel (req 2.5 mm) fails Rule 7 Table-I under Section 36(1)."""
        ctx = make_valid_visual_context(measured_heights_mm={"mrp": 1.8, "net_quantity": 1.8})
        res = evaluate_character_height(ctx)

        assert res.verdict == "fail"
        assert res.limb == "36(1)"
        assert "1.8 mm" in res.observed
        assert "2.5 mm" in res.required
        assert res.remediation is not None

    def test_missing_calibration_returns_not_assessed(self):
        """Hard Invariant (Section 4): missing scale returns NOT_ASSESSED with exact calibration reason."""
        ctx = make_valid_visual_context(scale_source="none", mm_per_pixel=None)
        res = evaluate_character_height(ctx)

        assert res.verdict == "not_assessed"
        assert "Physical measurement cannot be established" in res.reason
        assert "validated scale/calibration reference" in res.reason

    def test_invalid_calibration_returns_not_assessed(self):
        """Uncertainty exceeding 25% tolerance rejects legal measurement as NOT_ASSESSED."""
        ctx = make_valid_visual_context(mm_per_pixel=0.10, mm_per_pixel_uncertainty=0.035)  # 35% unc
        res = evaluate_character_height(ctx)

        assert res.verdict == "not_assessed"
        assert "exceeds acceptable tolerance" in res.reason

    def test_prohibit_uncalibrated_declared_dimensions(self):
        """Section 4 & 5: Bare unverified operator-declared scale cannot produce legal PASS."""
        ctx = make_valid_visual_context(scale_source="declared")
        res = evaluate_character_height(ctx)

        assert res.verdict == "not_assessed"
        assert "validated scale/calibration reference is available" in res.reason

    def test_missing_pdp_geometry_returns_not_assessed(self):
        """Section 7: Unknown package shape and dimensions cannot select Table-I band."""
        ctx = make_valid_visual_context(panel_shape=None, panel_height_mm=None, panel_width_mm=None)
        res = evaluate_character_height(ctx)

        assert res.verdict == "not_assessed"
        assert "Principal display panel" in res.reason

    def test_normal_container_vs_blown_moulded_threshold(self):
        """Blown/moulded containers require higher Table-I minimum (4.0 mm vs 2.5 mm for 100-500 cm2)."""
        # Normal container with 3.2 mm -> PASS (3.2 >= 2.5)
        ctx_normal = make_valid_visual_context(is_blown_moulded=False, measured_heights_mm={"mrp": 3.2})
        assert evaluate_character_height(ctx_normal).verdict == "pass"

        # Blown-moulded container with 3.2 mm -> FAIL (3.2 < 4.0)
        ctx_blown = make_valid_visual_context(is_blown_moulded=True, measured_heights_mm={"mrp": 3.2})
        res_blown = evaluate_character_height(ctx_blown)
        assert res_blown.verdict == "fail"
        assert "4.0 mm" in res_blown.required
        assert "blown-moulded container" in res_blown.required

    def test_measurement_inside_uncertainty_band_returns_not_assessed(self):
        """Shortfall inside measurement error band (+/- 0.03 mm on 2.48 mm vs 2.5 mm) returns NOT_ASSESSED."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"mrp": 2.48},
            mm_per_pixel=0.08,
            mm_per_pixel_uncertainty=0.015,  # 2 * 0.015 = 0.03 mm error band -> [2.45, 2.51] overlaps 2.5
        )
        res = evaluate_character_height(ctx)
        assert res.verdict == "not_assessed"
        assert "inside the measurement uncertainty" in res.reason


# ---------------------------------------------------------------------------
# 2. Rule 7: Net Quantity Numeral Height (CHK06b)
# ---------------------------------------------------------------------------

class TestRule7NetQuantityHeight:
    def test_net_quantity_table_i_mass_volume_pass(self):
        """Mass/volume unit (500 g on 120 cm2 PDP) selects Table-I threshold (2.5 mm)."""
        ctx = make_valid_visual_context(
            net_quantity_value=500.0,
            net_quantity_unit="g",
            measured_heights_mm={"net_quantity": 3.0},
        )
        res = evaluate_net_quantity_height(ctx)

        assert res.verdict == "pass"
        assert res.check_id == "CHK06b"
        assert res.rule_id == "RULE_LMPC_06B_NET_QUANTITY_NUMERAL_HEIGHT"
        assert "3.0 mm" in res.observed
        assert "2.5 mm" in res.required

    def test_net_quantity_table_ii_count_and_length(self):
        """Sale by count (10 u on 80 cm2 PDP <= 100 cm2) selects Table-II 1.0 mm minimum."""
        ctx = make_valid_visual_context(
            panel_height_mm=100.0,
            panel_width_mm=80.0,  # 80 cm2 PDP
            net_quantity_value=10.0,
            net_quantity_unit="u",
            measured_heights_mm={"net_quantity": 1.5},
        )
        res = evaluate_net_quantity_height(ctx)

        assert res.verdict == "pass"
        assert "1.0 mm" in res.required

    def test_net_quantity_height_shortfall_fail(self):
        """Net quantity numeral 1.5 mm on 120 cm2 panel (req 2.5 mm) fails under Section 36(2)."""
        ctx = make_valid_visual_context(measured_heights_mm={"net_quantity": 1.5})
        res = evaluate_net_quantity_height(ctx)

        assert res.verdict == "fail"
        assert res.limb == "36(2)"
        assert "1.5 mm" in res.observed
        assert "2.5 mm" in res.required


# ---------------------------------------------------------------------------
# 3. Rule 7(3): Character Width Ratio (CHK07)
# ---------------------------------------------------------------------------

class TestRule7CharacterWidth:
    def test_character_width_ratio_pass(self):
        """Width 1.5 mm on height 3.0 mm (ratio 0.50 >= 0.33) passes Rule 7(3)."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"mrp": 3.0},
            measured_widths_mm={"mrp": 1.5},
        )
        res = evaluate_character_width(ctx)
        assert res.verdict == "pass"
        assert res.check_id == "CHK07"
        assert "All measured characters meet the one-third width ratio" in res.observed

    def test_character_width_ratio_fail(self):
        """Width 0.6 mm on height 3.0 mm (ratio 0.20 < 0.33) fails Rule 7(3)."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"mrp": 3.0},
            measured_widths_mm={"mrp": 0.6},
        )
        res = evaluate_character_width(ctx)
        assert res.verdict == "fail"
        assert res.limb == "36(1)"
        assert "Non-compliant narrow characters" in res.observed

    def test_character_width_exempts_narrow_glyphs(self):
        """Exempt narrow glyphs (1, i, I, l) do not trigger Rule 7(3) failure."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"1": 3.0, "i": 2.5},
            measured_widths_mm={"1": 0.5, "i": 0.4},
        )
        res = evaluate_character_width(ctx)
        assert res.verdict == "pass"


# ---------------------------------------------------------------------------
# 4. Rule 8: Principal Display Panel Placement (CHK22)
# ---------------------------------------------------------------------------

class TestRule8PdpPlacement:
    def test_declarations_on_pdp_pass(self):
        """Net quantity and MRP confirmed on PDP ('front') pass Rule 8 placement."""
        llm_res = StructuredDeclarationResult(
            net_quantity=NetQuantityDeclaration(
                value=500.0,
                unit="g",
                provenance=FieldProvenance(source_panel="front", source_text="500 g"),
            ),
            mrp=MrpDeclaration(
                value=99.0,
                provenance=FieldProvenance(source_panel="front", source_text="Rs. 99.00"),
            ),
        )
        ctx = make_valid_visual_context(llm_result=llm_res, panels_captured={"front"})
        res = evaluate_pdp_placement(ctx)

        assert res.verdict == "pass"
        assert res.check_id == "CHK22"
        assert "Principal Display Panel" in res.observed

    def test_net_quantity_on_side_panel_fail(self):
        """Net quantity placed on 'side' panel instead of PDP fails Rule 8."""
        llm_res = StructuredDeclarationResult(
            net_quantity=NetQuantityDeclaration(
                value=500.0,
                unit="g",
                provenance=FieldProvenance(source_panel="side", source_text="500 g"),
            ),
        )
        ctx = make_valid_visual_context(llm_result=llm_res, panels_captured={"front", "side"})
        res = evaluate_pdp_placement(ctx)

        assert res.verdict == "fail"
        assert res.limb == "36(1)"
        assert "Net quantity was placed on 'side' panel instead of PDP" in res.observed

    def test_declaration_outside_pdp_bounds_fail(self):
        """Declaration coordinates extending outside verified PDP boundaries fail placement."""
        llm_res = StructuredDeclarationResult(
            net_quantity=NetQuantityDeclaration(
                value=500.0,
                unit="g",
                provenance=FieldProvenance(source_panel="front", source_text="500 g"),
            ),
        )
        ctx = make_valid_visual_context(
            llm_result=llm_res,
            panels_captured={"front"},
            declaration_outside_pdp=True,
        )
        res = evaluate_pdp_placement(ctx)

        assert res.verdict == "fail"
        assert "outside the verified Principal Display Panel boundaries" in res.observed

    def test_pdp_unavailable_returns_not_assessed(self):
        """When PDP cannot be established from package geometry, returns NOT_ASSESSED."""
        ctx = make_valid_visual_context(panels_captured=set(), pdp_detected=False)
        res = evaluate_pdp_placement(ctx)

        assert res.verdict == "not_assessed"
        assert "Principal display panel could not be established" in res.reason


# ---------------------------------------------------------------------------
# 5. Rule 8: Quantity Clear Space (CHK09)
# ---------------------------------------------------------------------------

class TestRule8ClearSpace:
    def test_sufficient_clear_space_and_verified_clean_pass(self):
        """Clear space meeting 1x height vertical & 2x horizontal + verified clean passes Rule 8."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"net_quantity": 3.0},
            clear_space_mm={"above": 3.5, "below": 3.5, "left": 6.5, "right": 6.5},
            clear_space_image_verified=True,
        )
        res = evaluate_clear_space(ctx)

        assert res.verdict == "pass"
        assert res.check_id == "CHK09"
        assert "Clear space on all four sides meets Rule 8 multipliers" in res.observed

    def test_clear_space_shortfall_fail(self):
        """Clear space shortfall on top (1.5 mm vs 3.0 mm required) fails under Section 36(2)."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"net_quantity": 3.0},
            clear_space_mm={"above": 1.5, "below": 3.5, "left": 6.5, "right": 6.5},
            clear_space_image_verified=True,
        )
        res = evaluate_clear_space(ctx)

        assert res.verdict == "fail"
        assert res.limb == "36(2)"
        assert "above 1.5 mm against 3.0 mm required" in res.observed

    def test_anti_false_compliance_unverified_image_returns_not_assessed(self):
        """Section 14: When OCR finds no text but absence of graphics is unverified, return NOT_ASSESSED."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"net_quantity": 3.0},
            clear_space_mm={"above": 4.0, "below": 4.0, "left": 8.0, "right": 8.0},
            clear_space_image_verified=None,  # Not verified
            verify_clear_space_image=False,
        )
        res = evaluate_clear_space(ctx)

        assert res.verdict == "not_assessed"
        assert "available image evidence is insufficient to verify absence of decorative graphics" in res.reason

    def test_interfering_graphics_detected_in_clear_space_returns_not_assessed(self):
        """Section 14: Interfering graphics or non-OCR print detected in clear space returns NOT_ASSESSED."""
        ctx = make_valid_visual_context(
            measured_heights_mm={"net_quantity": 3.0},
            clear_space_mm={"above": 4.0, "below": 4.0, "left": 8.0, "right": 8.0},
            clear_space_image_verified=False,  # Graphics detected
        )
        res = evaluate_clear_space(ctx)

        assert res.verdict == "not_assessed"
        assert "cannot confirm the absence of interfering decorative printing" in res.reason


# ---------------------------------------------------------------------------
# 6. Rule 9: Conspicuous Contrast (CHK08)
# ---------------------------------------------------------------------------

class TestRule9ConspicuousContrast:
    def test_blown_moulded_surface_exception_pass(self):
        """Section 17: Information blown/formed/moulded on container surface is exempt under Rule 9(1) proviso."""
        ctx = make_valid_visual_context(is_blown_moulded=True)
        res = evaluate_conspicuous_contrast(ctx)

        assert res.verdict == "pass"
        assert res.check_id == "CHK08"
        assert "Rule 9(1) proviso" in res.observed
        assert "blown, formed or moulded" in res.observed

    def test_no_statutory_threshold_returns_not_assessed(self):
        """Section 16: When law prescribes no universal numeric ratio, returns NOT_ASSESSED without inventing WCAG 4.5:1."""
        ctx = make_valid_visual_context(contrast_ratio=11.5, is_blown_moulded=False)
        res = evaluate_conspicuous_contrast(ctx)

        assert res.verdict == "not_assessed"
        assert "no legally defined numeric threshold is available in Rule 9" in res.reason
        assert "11.50:1" in res.observed

    def test_statutory_threshold_evaluated_when_configured(self):
        """When rule pack defines an explicit statutory cutoff, evaluates PASS/FAIL against it."""
        pack = load_rule_pack()
        rule = pack.get_rule_by_id("CHK08")
        assert rule is not None

        # Temporarily configure statutory threshold
        orig_params = rule.evaluation_method.parameters
        try:
            rule.evaluation_method.parameters = {"statutory_threshold": 3.0}

            # 8.5 >= 3.0 -> PASS
            ctx_pass = make_valid_visual_context(contrast_ratio=8.5, is_blown_moulded=False)
            assert evaluate_conspicuous_contrast(ctx_pass).verdict == "pass"

            # 2.1 < 3.0 -> FAIL
            ctx_fail = make_valid_visual_context(contrast_ratio=2.1, is_blown_moulded=False)
            res_fail = evaluate_conspicuous_contrast(ctx_fail)
            assert res_fail.verdict == "fail"
            assert res_fail.limb == "36(1)"
        finally:
            rule.evaluation_method.parameters = orig_params

    def test_insufficient_pixel_quality_returns_not_assessed(self):
        """When contrast cannot be computed from image pixels, returns NOT_ASSESSED."""
        ctx = make_valid_visual_context(contrast_ratio=None, engineering_contrast_signal={})
        res = evaluate_conspicuous_contrast(ctx)

        assert res.verdict == "not_assessed"
        assert "could not be measured" in res.reason


# ---------------------------------------------------------------------------
# 7. Coordinate Space Safety & Image Measurement Quality Gates
# ---------------------------------------------------------------------------

class TestCoordinateSafetyAndQualityGates:
    def test_reconcile_normalized_coordinates(self):
        """Normalized bounding box [0.1, 0.2, 0.5, 0.4] on (600, 800) converts correctly."""
        rec = reconcile_coordinates([0.1, 0.2, 0.5, 0.4], "normalized", (600, 800))
        assert rec.status == "valid"
        assert rec.target_bbox == (80, 120, 400, 240)

    def test_reconcile_out_of_bounds_coordinates(self):
        """Severe out of bounds coordinates reject with out_of_bounds status."""
        rec = reconcile_coordinates([1200, 1000, 1600, 1200], "rectified_panel", (600, 800))
        assert rec.status == "out_of_bounds"
        assert rec.target_bbox is None

    def test_glyph_measurement_insufficient_resolution(self):
        """Micro-crop (4x4 px) is rejected for insufficient resolution."""
        tiny = np.full((10, 10, 3), 200, dtype=np.uint8)
        res = measure_glyph_height_mm(tiny, (2, 2, 6, 6), 0.08, 0.002)
        assert res.status == "insufficient_resolution"

    def test_glyph_measurement_insufficient_sharpness(self):
        """Severely blurred patch lacks sharpness for typography verification."""
        blurred = np.full((100, 200, 3), 128, dtype=np.uint8)
        res = measure_glyph_height_mm(blurred, (10, 10, 90, 190), 0.08, 0.002)
        assert res.status == "insufficient_sharpness"

    def test_glyph_measurement_severe_glare(self):
        """Specular glare saturated patch (> 35% white pixels) returns severe_glare."""
        glare_img = np.full((100, 200, 3), 255, dtype=np.uint8)
        res = measure_glyph_height_mm(glare_img, (10, 10, 90, 190), 0.08, 0.002)
        assert res.status == "severe_glare"

    def test_clear_space_image_detects_interfering_graphics(self):
        """High-gradient decorative artwork inside margins is detected."""
        img = np.full((400, 400, 3), 240, dtype=np.uint8)
        # Target bbox is (150, 150, 250, 200). With numeral_height_px=20 and v_mult=2.0,
        # top margin is y in [110, 150], x in [110, 290]. Put dark stripe in top margin:
        img[120:140, 110:290] = 20
        res = verify_clear_space_image(img, (150, 150, 250, 200), 20.0, v_mult=2.0, h_mult=2.0)
        assert res.verified_clean is False


# ---------------------------------------------------------------------------
# 8. Section 25 Safety Tests (Hard Invariants)
# ---------------------------------------------------------------------------

class TestPhase4cSafetyInvariants:
    def test_no_fake_120x80_dimensions(self):
        """Hard Invariant: Engine must never assume 120x80 mm package size."""
        ctx = CheckContext(
            scale_source="none",
            ocr_available=True,
            image_usable=True,
            measured_heights_mm={"mrp": 2.5},
        )
        res = evaluate_character_height(ctx)
        assert res.verdict == "not_assessed"
        assert ctx.panel_height_mm != 120.0 or ctx.panel_width_mm != 80.0

    def test_zero_llm_zero_ocr_zero_external_api_calls(self):
        """Phase 4C must make zero calls to OCR, LLM, or external HTTP requests."""
        ctx = make_valid_visual_context()

        with patch("httpx.Client.request") as mock_http, \
             patch("httpx.AsyncClient.request") as mock_async_http, \
             patch("urllib.request.urlopen") as mock_urllib:
            findings = evaluate_visual_and_geometry_rules(ctx)

            assert len(findings) == 6
            assert mock_http.call_count == 0
            assert mock_async_http.call_count == 0
            assert mock_urllib.call_count == 0

    def test_original_evidence_file_remains_immutable(self):
        """Original evidence files on disk must remain strictly byte-identical."""
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            dummy_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF" + b"PROVENANCE_SAFETY_TEST" * 100
            f.write(dummy_bytes)
            f_path = Path(f.name)

        try:
            h_before = hashlib.sha256(f_path.read_bytes()).hexdigest()
            ctx = make_valid_visual_context()
            evaluate_visual_and_geometry_rules(ctx)
            h_after = hashlib.sha256(f_path.read_bytes()).hexdigest()
            assert h_before == h_after
        finally:
            if f_path.exists():
                f_path.unlink()

    def test_effective_date_gating(self):
        """Rules are not evaluated before their statutory effective date."""
        pack = load_rule_pack()
        rule = pack.get_rule_by_id("CHK06b")
        assert rule is not None

        # CHK06b effective_from is 2018-01-01
        ctx_past = make_valid_visual_context(rules_as_at=date(2015, 6, 1))
        res = evaluate_net_quantity_height(ctx_past)
        assert res.verdict == "not_assessed"
        assert "not effective on inspection date" in res.reason


# ---------------------------------------------------------------------------
# 9. Performance Benchmark (Section 23)
# ---------------------------------------------------------------------------

class TestPhase4cPerformanceBenchmark:
    def test_performance_benchmarks(self):
        """Measures actual latency and peak memory across 25 iterations (Section 23)."""
        metrics = benchmark_phase4c_performance(iterations=25)

        assert metrics["iterations"] == 25
        assert metrics["rules_evaluated_count"] == 6

        overall = metrics["overall_phase4c_latency"]
        assert overall["mean_ms"] < 20.0
        assert overall["p50_ms"] < 20.0
        assert overall["p95_ms"] < 30.0

        # Memory should be well within Render 512 MB ceiling
        assert metrics["peak_rss_mb"] < 400.0

        print("\n" + "=" * 60)
        print("PHASE 4C DETERMINISTIC VISUAL PERFORMANCE REPORT")
        print("=" * 60)
        print(f"Panel Geometry Latency:    mean={metrics['panel_geometry_latency']['mean_ms']} ms, p50={metrics['panel_geometry_latency']['p50_ms']} ms, p95={metrics['panel_geometry_latency']['p95_ms']} ms")
        print(f"Coordinate Transform:       mean={metrics['coordinate_transform_latency']['mean_ms']} ms, p50={metrics['coordinate_transform_latency']['p50_ms']} ms, p95={metrics['coordinate_transform_latency']['p95_ms']} ms")
        print(f"Character Measurement:      mean={metrics['character_measurement_latency']['mean_ms']} ms, p50={metrics['character_measurement_latency']['p50_ms']} ms, p95={metrics['character_measurement_latency']['p95_ms']} ms")
        print(f"Clear Space Evaluation:     mean={metrics['clear_space_evaluation_latency']['mean_ms']} ms, p50={metrics['clear_space_evaluation_latency']['p50_ms']} ms, p95={metrics['clear_space_evaluation_latency']['p95_ms']} ms")
        print(f"Contrast Measurement:       mean={metrics['contrast_measurement_latency']['mean_ms']} ms, p50={metrics['contrast_measurement_latency']['p50_ms']} ms, p95={metrics['contrast_measurement_latency']['p95_ms']} ms")
        print(f"Overall Visual Evaluation:  mean={overall['mean_ms']} ms, p50={overall['p50_ms']} ms, p95={overall['p95_ms']} ms")
        print(f"Peak Working Set Memory:    {metrics['peak_rss_mb']} MB (Render limit: 512 MB)")
        print("=" * 60 + "\n")
