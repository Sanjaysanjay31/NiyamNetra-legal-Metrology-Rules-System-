"""demo_props.py — Physical Demonstration Props Generator & Evaluator for SIH 2026.

Implements the 3 recommended Grand Finale physical demo props:
  1. Prop 1 (Fully Compliant): Standard biscuit pack with all Rule 6 declarations and correct Table-I font height.
  2. Prop 2 (Missing Declarations): Pack with missing MRP and missing consumer care contact (triggers Section 36(1) violation).
  3. Prop 3 (Undersized Font): Pack on large PDP where character height is below Rule 7 Table-I minimum (triggers Table-I shortfall).

Usage:
  python demo_props.py --generate   # Generate printable sample label images
  python demo_props.py --eval       # Run rules engine assessment against all 3 props
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from ocr_engine import ExtractedField, OcrLine, OcrResult
from rules_engine import CheckContext, assess


OUTPUT_DIR = Path(__file__).parent / "fixtures" / "demo_props"


@dataclass
class DemoProp:
    name: str
    code: str
    commodity: str
    net_qty: float
    unit: str
    pdp_area_cm2: float
    expected_result: str
    expected_failing_checks: list[str]
    description: str


PROPS = [
    DemoProp(
        name="Prop 1: Britannia Glucose Biscuits (Fully Compliant)",
        code="PROP_COMPLIANT",
        commodity="Biscuits",
        net_qty=100.0,
        unit="g",
        pdp_area_cm2=85.0,  # Table-I requires 1.5 mm min height for 50-100 cm2
        expected_result="clean",
        expected_failing_checks=[],
        description="Every Rule 6 declaration present, MRP inclusive of taxes, font height 2.6 mm exceeds 1.5 mm minimum.",
    ),
    DemoProp(
        name="Prop 2: CrispyBite Potato Chips (Missing MRP & Consumer Care)",
        code="PROP_MISSING_DECLARATIONS",
        commodity="Potato Chips",
        net_qty=50.0,
        unit="g",
        pdp_area_cm2=60.0,
        expected_result="violation",
        expected_failing_checks=["CHK01", "CHK18"],
        description="Missing MRP and missing consumer care contact. Triggers immediate Section 36(1) violation.",
    ),
    DemoProp(
        name="Prop 3: ChocoDelight Cookies (Undersized Font Shortfall)",
        code="PROP_UNDERSIZED_FONT",
        commodity="Cookies",
        net_qty=250.0,
        unit="g",
        pdp_area_cm2=150.0,  # Table-I (100-500 cm2) requires 2.5 mm minimum
        expected_result="violation",
        expected_failing_checks=["CHK06", "CHK18"],
        description="Large panel requiring 2.5 mm character height, but printed at only 1.1 mm. Triggers Rule 7 Table-I violation.",
    ),
]


def generate_prop_images(target_dir: Path = OUTPUT_DIR) -> dict[str, Path]:
    """Generates high-contrast printable dummy labels for all 3 props."""
    target_dir.mkdir(parents=True, exist_ok=True)
    generated = {}

    # Helper: draw label card
    def create_label(lines: list[tuple[str, int, tuple[int, int, int]]], width=800, height=600):
        img = Image.new("RGB", (width, height), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        # Outer package border
        draw.rectangle([(10, 10), (width - 10, height - 10)], outline=(30, 41, 59), width=3)
        y = 30
        for text, size, color in lines:
            try:
                font = ImageFont.truetype("arial.ttf", size)
            except Exception:
                font = ImageFont.load_default()
            draw.text((40, y), text, fill=color, font=font)
            y += size + 14
        return img

    # Prop 1 Image
    p1 = create_label([
        ("BRITANNIA GLUCOSE BISCUITS", 30, (0, 51, 102)),
        ("Commodity: Biscuits", 20, (30, 41, 59)),
        ("Net Qty: 100 g", 22, (0, 0, 0)),
        ("M.R.P. Rs. 10.00 (inclusive of all taxes)", 22, (0, 0, 0)),
        ("Mfg Date: 08/2026   |   Batch No: B-2026-X01", 18, (30, 41, 59)),
        ("Best Before: 6 months from packaging", 18, (30, 41, 59)),
        ("Manufactured by: Britannia Industries Ltd, Plot 42, Hyderabad 500001", 16, (50, 50, 50)),
        ("Consumer Care: care@britannia.co.in | Tel: 1800-425-4444", 16, (50, 50, 50)),
        ("Country of Origin: India", 18, (0, 100, 0)),
    ])
    p1_path = target_dir / "prop1_compliant.jpg"
    p1.save(p1_path, quality=95)
    generated["PROP_COMPLIANT"] = p1_path

    # Prop 2 Image (Missing MRP & Consumer Care)
    p2 = create_label([
        ("CRISPYBITE POTATO CHIPS", 30, (180, 0, 0)),
        ("Commodity: Potato Chips", 20, (30, 41, 59)),
        ("Net Quantity: 50 g", 22, (0, 0, 0)),
        ("[VIOLATION: NO MRP PRINTED ON PANEL]", 20, (220, 38, 38)),
        ("Mfg Date: 08/2026   |   Batch No: CP-992", 18, (30, 41, 59)),
        ("Best Before: 4 months from packaging", 18, (30, 41, 59)),
        ("Manufactured by: Crispy Foods Pvt Ltd, Industrial Area, Hyderabad", 16, (50, 50, 50)),
        ("[VIOLATION: NO CONSUMER CARE CONTACT DETAILS]", 18, (220, 38, 38)),
        ("Country of Origin: India", 18, (0, 100, 0)),
    ])
    p2_path = target_dir / "prop2_missing_declarations.jpg"
    p2.save(p2_path, quality=95)
    generated["PROP_MISSING_DECLARATIONS"] = p2_path

    # Prop 3 Image (Undersized Font)
    p3 = create_label([
        ("CHOCODELIGHT COOKIES - FAMILY PACK", 32, (102, 51, 0)),
        ("Commodity: Chocolate Cookies", 18, (30, 41, 59)),
        ("Net Qty: 250 g", 12, (0, 0, 0)),  # Intentionally tiny font
        ("M.R.P. Rs. 85.00 (incl. of all taxes)", 12, (0, 0, 0)),  # Tiny font
        ("Mfg Date: 07/2026   |   Batch: CD-7712", 10, (50, 50, 50)),
        ("Best Before: 9 months", 10, (50, 50, 50)),
        ("Manufactured by: Delight Bakers, Mumbai 400001", 10, (50, 50, 50)),
        ("Consumer Care: help@chocodelight.in | +91 9123456780", 10, (50, 50, 50)),
        ("Country of Origin: India", 12, (0, 100, 0)),
    ])
    p3_path = target_dir / "prop3_undersized_font.jpg"
    p3.save(p3_path, quality=95)
    generated["PROP_UNDERSIZED_FONT"] = p3_path

    return generated


def build_prop_context(prop_code: str) -> CheckContext:
    """Builds a deterministic CheckContext representing each physical demo prop."""
    if prop_code == "PROP_COMPLIANT":
        # Prop 1: 100g biscuits, 85 cm2 PDP, font height 2.6mm (scale 0.05 mm/px)
        return CheckContext(
            transaction_type="retail_sale",
            commodity_generic="Biscuits",
            commodity_category="packaged_food",
            net_quantity_value=100.0,
            net_quantity_unit="g",
            is_imported=False,
            is_perishable=True,
            is_medical_device=False,
            is_tobacco=False,
            has_sticker=False,
            panel_shape="rectangular",
            panel_height_mm=100.0,
            panel_width_mm=85.0,
            total_surface_area_cm2=280.0,
            mm_per_pixel=0.05,
            scale_source="declared",
            ocr_available=True,
            image_usable=True,
            fields={
                "manufacturer": ExtractedField("Britannia Industries Ltd, Hyderabad", 0.95, "Manufactured by: Britannia Industries Ltd", True),
                "commodity": ExtractedField("Biscuits", 0.92, "Commodity: Biscuits", True),
                "net_quantity": ExtractedField("100", 0.96, "Net Qty: 100 g", True),
                "net_quantity_unit": ExtractedField("g", 0.96, "g", True),
                "mrp": ExtractedField("10.00", 0.94, "M.R.P. Rs. 10.00 (inclusive of all taxes)", True),
                "mrp_inclusive_wording": ExtractedField("present", 0.95, "inclusive of all taxes", True),
                "date_of_manufacture": ExtractedField("08/2026", 0.91, "Mfg Date: 08/2026", True),
                "best_before": ExtractedField("6 months", 0.90, "Best Before: 6 months", True),
                "consumer_care": ExtractedField("1800-425-4444", 0.93, "Consumer Care: 1800-425-4444", True),
                "country_of_origin": ExtractedField("India", 0.95, "Country of Origin: India", True),
            },
            measured_heights_mm={"mrp": 2.6, "net_quantity": 2.6, "manufacturer": 2.2},
            measured_widths_mm={"mrp": 1.5, "net_quantity": 1.5},
            clear_space_mm={"mrp": 3.0, "net_quantity": 3.0},
            contrast_ratio=12.5,
        )

    elif prop_code == "PROP_MISSING_DECLARATIONS":
        # Prop 2: Missing MRP & Consumer Care
        return CheckContext(
            transaction_type="retail_sale",
            commodity_generic="Potato Chips",
            commodity_category="packaged_food",
            net_quantity_value=50.0,
            net_quantity_unit="g",
            is_imported=False,
            is_perishable=True,
            is_medical_device=False,
            is_tobacco=False,
            has_sticker=False,
            panel_shape="rectangular",
            panel_height_mm=80.0,
            panel_width_mm=75.0,
            total_surface_area_cm2=220.0,
            mm_per_pixel=0.05,
            scale_source="declared",
            ocr_available=True,
            image_usable=True,
            fields={
                "manufacturer": ExtractedField("Crispy Foods Pvt Ltd, Hyderabad", 0.92, "Manufactured by: Crispy Foods", True),
                "commodity": ExtractedField("Potato Chips", 0.90, "Commodity: Potato Chips", True),
                "net_quantity": ExtractedField("50", 0.94, "Net Quantity: 50 g", True),
                "net_quantity_unit": ExtractedField("g", 0.94, "g", True),
                "mrp": ExtractedField(None, None, None, False),  # MISSING
                "date_of_manufacture": ExtractedField("08/2026", 0.91, "Mfg Date: 08/2026", True),
                "best_before": ExtractedField("4 months", 0.89, "Best Before: 4 months", True),
                "consumer_care": ExtractedField(None, None, None, False),  # MISSING
                "country_of_origin": ExtractedField("India", 0.93, "Country of Origin: India", True),
            },
            measured_heights_mm={"net_quantity": 2.4, "manufacturer": 2.0},
            measured_widths_mm={"net_quantity": 1.4},
            clear_space_mm={"net_quantity": 2.5},
            contrast_ratio=11.0,
        )

    elif prop_code == "PROP_UNDERSIZED_FONT":
        # Prop 3: 150 cm2 PDP (requires 2.5 mm min height per Table-I), but measured at 1.1 mm
        return CheckContext(
            transaction_type="retail_sale",
            commodity_generic="Cookies",
            commodity_category="packaged_food",
            net_quantity_value=250.0,
            net_quantity_unit="g",
            is_imported=False,
            is_perishable=True,
            is_medical_device=False,
            is_tobacco=False,
            has_sticker=False,
            panel_shape="rectangular",
            panel_height_mm=150.0,
            panel_width_mm=100.0,  # Area = 150 cm2 -> Table-I minimum = 2.5 mm
            total_surface_area_cm2=450.0,
            mm_per_pixel=0.05,
            scale_source="declared",
            ocr_available=True,
            image_usable=True,
            fields={
                "manufacturer": ExtractedField("Delight Bakers, Mumbai", 0.92, "Manufactured by: Delight Bakers", True),
                "commodity": ExtractedField("Chocolate Cookies", 0.91, "Commodity: Chocolate Cookies", True),
                "net_quantity": ExtractedField("250", 0.93, "Net Qty: 250 g", True),
                "net_quantity_unit": ExtractedField("g", 0.93, "g", True),
                "mrp": ExtractedField("85.00", 0.92, "M.R.P. Rs. 85.00 (incl. of all taxes)", True),
                "mrp_inclusive_wording": ExtractedField("present", 0.92, "incl. of all taxes", True),
                "date_of_manufacture": ExtractedField("07/2026", 0.88, "Mfg Date: 07/2026", True),
                "best_before": ExtractedField("9 months", 0.89, "Best Before: 9 months", True),
                "consumer_care": ExtractedField("help@chocodelight.in", 0.91, "Consumer Care: help@chocodelight.in", True),
                "country_of_origin": ExtractedField("India", 0.94, "Country of Origin: India", True),
            },
            # Measured 1.1 mm vs required 2.5 mm -> triggers CHK06 Table-I failure!
            measured_heights_mm={"mrp": 1.1, "net_quantity": 1.1, "manufacturer": 1.1},
            measured_widths_mm={"mrp": 0.6, "net_quantity": 0.6},
            clear_space_mm={"mrp": 2.0, "net_quantity": 2.0},
            contrast_ratio=10.5,
        )

    raise ValueError(f"Unknown prop code: {prop_code}")


def evaluate_demo_props() -> bool:
    """Evaluates all 3 props against rules_engine.assess and validates expected outcomes."""
    all_passed = True
    print("\n" + "=" * 70)
    print("  NIYAMNETRA SIH 2026 — DEMO PROPS EVALUATION RUNNER")
    print("=" * 70 + "\n")

    for prop in PROPS:
        print(f"[*] Evaluating: {prop.name}")
        ctx = build_prop_context(prop.code)
        findings, verdict, prov = assess(ctx)

        failing_checks = [f.check_id for f in findings if f.verdict == "fail"]
        if prop.expected_result == "clean":
            result_ok = (verdict.failed == 0 and len(failing_checks) == 0)
            expected_display = "CLEAN (0 VIOLATIONS)"
            observed_display = f"{verdict.overall_result.upper()} ({verdict.failed} FAILS, {verdict.passed} PASSES)"
        else:
            result_ok = (verdict.overall_result == prop.expected_result)
            expected_display = prop.expected_result.upper()
            observed_display = verdict.overall_result.upper()

        checks_ok = set(failing_checks) == set(prop.expected_failing_checks)

        status_str = "PASS [OK]" if (result_ok and checks_ok) else "FAIL [MISMATCH]"
        print(f"    Expected: {expected_display} | Observed: {observed_display}")
        print(f"    Checks Assessed: {verdict.checks_assessed}/{verdict.checks_total} (Passed: {verdict.passed}, Failed: {verdict.failed}, Unassessed: {verdict.not_assessed})")
        if failing_checks:
            print(f"    Failing Checks: {failing_checks}")
            for f in findings:
                if f.verdict == "fail":
                    print(f"      - [{f.check_id}] {f.title}: {f.reason or f.observed}")
        else:
            print("    Zero violations found across all assessable Rule 6/7 provisions.")

        print(f"    Status: {status_str}\n")
        if not (result_ok and checks_ok):
            all_passed = False

    print("=" * 70)
    if all_passed:
        print("  ALL 3 DEMO PROPS SUCCESSFULLY VALIDATED ACCORDING TO RULES ENGINE!")
    else:
        print("  WARNING: One or more props did not match expected verdicts.")
    print("=" * 70 + "\n")
    return all_passed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NiyamNetra Demo Props Tool")
    parser.add_argument("--generate", action="store_true", help="Generate printable prop label images")
    parser.add_argument("--eval", action="store_true", help="Evaluate props with rules engine")
    args = parser.parse_args()

    if args.generate or (not args.generate and not args.eval):
        paths = generate_prop_images()
        print(f"Generated {len(paths)} prop label images in: {OUTPUT_DIR}")
        for code, path in paths.items():
            print(f"  - {code}: {path.name}")

    if args.eval or (not args.generate and not args.eval):
        ok = evaluate_demo_props()
        sys.exit(0 if ok else 1)
