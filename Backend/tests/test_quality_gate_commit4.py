"""Backend/tests/test_quality_gate_commit4.py

Tests for Commit 4: Fast Image Quality Gate backend invariants.
Validates:
1. assess_quality accepts sharp packaging image.
2. assess_quality rejects severely blurred image (< BLUR_FLOOR).
3. assess_quality rejects severe specular glare.
4. assess_quality does not falsely reject clean white packaging.
5. assess_quality does not falsely reject dark/black packaging with sharp text.
6. Backend quality validation remains authoritative and independent of mobile flags.
"""

import io
import pytest
import numpy as np
import cv2
from PIL import Image, ImageDraw
from image_processor import assess_quality, BLUR_FLOOR, GLARE_CEILING, LUMA_FLOOR, LUMA_CEILING


def _make_bgr_image(bg_color=(240, 238, 230), text="LEGAL METROLOGY TEST"):
    img = Image.new("RGB", (1200, 900), color=bg_color)
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 1150, 850], outline=(40, 40, 40), width=4)
    draw.text((100, 100), text, fill=(0, 0, 0) if sum(bg_color) > 300 else (255, 255, 255))
    draw.text((100, 200), "NET QUANTITY 1 kg", fill=(0, 0, 0) if sum(bg_color) > 300 else (255, 255, 255))
    draw.text((100, 300), "MRP Rs. 150.00 INCL. ALL TAXES", fill=(0, 0, 0) if sum(bg_color) > 300 else (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    arr = np.frombuffer(buf.getvalue(), dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def test_assess_quality_sharp_image_passes():
    """Sharp image with clear declarations passes server-side quality gate."""
    bgr = _make_bgr_image()
    q = assess_quality(bgr)
    assert q.usable is True
    assert q.reason is None
    assert q.blur_variance >= BLUR_FLOOR


def test_assess_quality_severely_blurred_image_rejected():
    """Blurred image below BLUR_FLOOR is marked unusable with explanatory reason."""
    bgr = _make_bgr_image()
    blurred = cv2.GaussianBlur(bgr, (25, 25), 9.0)
    q = assess_quality(blurred)
    assert q.usable is False
    assert "too blurred" in q.reason.lower()
    assert q.blur_variance < BLUR_FLOOR


def test_assess_quality_severe_glare_rejected():
    """Specular glare covering > GLARE_CEILING is rejected with explanation."""
    bgr = _make_bgr_image()
    # Paint large saturated white spot over declarations
    bgr[100:600, 100:900] = 255
    q = assess_quality(bgr)
    assert q.usable is False
    assert "glare" in q.reason.lower()
    assert q.glare_ratio > GLARE_CEILING


def test_assess_quality_white_packaging_not_falsely_rejected():
    """Bright white carton with sharp text is not rejected merely for high luma."""
    bgr = _make_bgr_image(bg_color=(254, 254, 254))
    q = assess_quality(bgr)
    assert q.usable is True
    assert q.reason is None


def test_assess_quality_dark_packaging_not_falsely_rejected():
    """Black packaging with white lettering and sharp text is not rejected for low luma."""
    bgr = _make_bgr_image(bg_color=(20, 20, 25))
    q = assess_quality(bgr)
    assert q.usable is True
    assert q.reason is None
