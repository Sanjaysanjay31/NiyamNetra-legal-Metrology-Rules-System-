"""tests/test_demo_props.py — Unit tests for SIH 2026 Grand Finale Demo Props & Multilingual OCR."""
import os
import pytest

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from demo_props import evaluate_demo_props, build_prop_context, PROPS
from rules_engine import assess
from ocr_engine import (
    extract_fields,
    OcrLine,
    OcrResult,
    SUPPORTED_INDIC_LANGS,
)


def test_demo_props_runner_passes():
    """All 3 physical demo props evaluate deterministically with 100% expected findings."""
    assert evaluate_demo_props() is True


def test_prop1_compliant_zero_violations():
    """Prop 1 (Britannia Glucose Biscuits) must have zero failing checks and no penalties."""
    ctx = build_prop_context("PROP_COMPLIANT")
    findings, verdict, prov = assess(ctx)

    failing = [f for f in findings if f.verdict == "fail"]
    assert len(failing) == 0
    assert verdict.failed == 0
    assert verdict.passed >= 12
    # Verify Section 36 penalty check CHK18 has no breach
    chk18 = next(f for f in findings if f.check_id == "CHK18")
    assert chk18.verdict != "fail"


def test_prop2_missing_mrp_and_care_triggers_section_36_1():
    """Prop 2 (CrispyBite Potato Chips) must fail CHK01 and CHK18 under Section 36(1)."""
    ctx = build_prop_context("PROP_MISSING_DECLARATIONS")
    findings, verdict, prov = assess(ctx)

    assert verdict.overall_result == "violation"
    assert verdict.violation_limb == "36(1)"
    failing_ids = [f.check_id for f in findings if f.verdict == "fail"]
    assert "CHK01" in failing_ids
    assert "CHK18" in failing_ids

    chk01 = next(f for f in findings if f.check_id == "CHK01")
    obs = chk01.observed or chk01.reason or ""
    assert "Retail sale price" in obs
    assert "Consumer care contact" in obs


def test_prop3_undersized_font_triggers_table_i_shortfall():
    """Prop 3 (ChocoDelight Cookies) must fail CHK06 due to font height 1.1mm < 2.5mm."""
    ctx = build_prop_context("PROP_UNDERSIZED_FONT")
    findings, verdict, prov = assess(ctx)

    assert verdict.overall_result == "violation"
    assert verdict.violation_limb == "36(1)"
    failing_ids = [f.check_id for f in findings if f.verdict == "fail"]
    assert "CHK06" in failing_ids
    assert "CHK18" in failing_ids

    chk06 = next(f for f in findings if f.check_id == "CHK06")
    assert "1.1 mm" in chk06.observed
    assert "2.5 mm" in chk06.observed


def test_multilingual_indic_ocr_mappings():
    """PaddleOCR Indic language code mappings must support standard scheduled languages."""
    assert SUPPORTED_INDIC_LANGS["hi"] == "hi"
    assert SUPPORTED_INDIC_LANGS["telugu"] == "te"
    assert SUPPORTED_INDIC_LANGS["tamil"] == "ta"
    assert SUPPORTED_INDIC_LANGS["bengali"] == "bn"


def test_multilingual_indic_regex_extraction_hindi():
    """Extract mandatory declarations from Hindi/Devanagari label OCR text."""
    lines = [
        OcrLine(text="पारले जी ग्लूकोज बिस्कुट", confidence=0.95, box=[[0, 0], [100, 0], [100, 20], [0, 20]], height_px=20),
        OcrLine(text="शुद्ध मात्रा: 100 ग्राम", confidence=0.96, box=[[0, 25], [100, 25], [100, 45], [0, 45]], height_px=20),
        OcrLine(text="अधिकतम खुदरा मूल्य: रु. 10.00", confidence=0.94, box=[[0, 50], [100, 50], [100, 70], [0, 70]], height_px=20),
        OcrLine(text="सभी कर सहित", confidence=0.93, box=[[0, 75], [100, 75], [100, 95], [0, 95]], height_px=20),
        OcrLine(text="उत्पादक: ब्रिटानिया इंडस्ट्रीज लिमिटेड", confidence=0.92, box=[[0, 100], [100, 100], [100, 120], [0, 120]], height_px=20),
        OcrLine(text="उपभोक्ता सेवा: care@britannia.co.in", confidence=0.91, box=[[0, 125], [100, 125], [100, 145], [0, 145]], height_px=20),
        OcrLine(text="Country of Origin: India", confidence=0.95, box=[[0, 150], [100, 150], [100, 170], [0, 170]], height_px=20),
    ]
    ocr = OcrResult(lines=lines, engine="paddle", mean_confidence=0.94)
    fields = extract_fields(ocr)

    assert fields["net_quantity"].found is True
    assert fields["net_quantity"].value == "100"
    assert fields["net_quantity_unit"].value == "ग्राम"

    assert fields["mrp"].found is True
    assert "10" in str(fields["mrp"].value)
    assert fields["mrp_inclusive_wording"].found is True

    assert fields["country_of_origin"].found is True
    assert fields["country_of_origin"].value == "India"

    assert fields["consumer_care"].found is True


def test_multilingual_indic_regex_extraction_telugu():
    """Extract mandatory declarations from Telugu regional label OCR text."""
    lines = [
        OcrLine(text="బ్రిటానియా బిస్కెట్లు", confidence=0.94, box=[[0, 0], [100, 0], [100, 20], [0, 20]], height_px=20),
        OcrLine(text="పరిమాణం: 200 g", confidence=0.95, box=[[0, 25], [100, 25], [100, 45], [0, 45]], height_px=20),
        OcrLine(text="ధర: రూ. 25.00", confidence=0.93, box=[[0, 50], [100, 50], [100, 70], [0, 70]], height_px=20),
        OcrLine(text="అన్ని పన్నులతో కలిపి", confidence=0.92, box=[[0, 75], [100, 75], [100, 95], [0, 95]], height_px=20),
        OcrLine(text="వినియోగదారు సహాయం: 1800-425-4444", confidence=0.91, box=[[0, 100], [100, 100], [100, 120], [0, 120]], height_px=20),
        OcrLine(text="Country of Origin: India", confidence=0.94, box=[[0, 125], [100, 125], [100, 145], [0, 145]], height_px=20),
    ]
    ocr = OcrResult(lines=lines, engine="paddle", mean_confidence=0.94)
    fields = extract_fields(ocr)

    assert fields["net_quantity"].found is True
    assert fields["net_quantity"].value == "200"
    assert fields["net_quantity_unit"].value == "g"

    assert fields["mrp"].found is True
    assert "25" in str(fields["mrp"].value)
    assert fields["mrp_inclusive_wording"].found is True

    assert fields["country_of_origin"].found is True
    assert fields["country_of_origin"].value == "India"
    assert fields["consumer_care"].found is True
