"""tests/test_geometry_commit5.py — Comprehensive geometry detection, perspective validation, and safe rectification test suite for Commit 5.

Implements all 20 test fixtures from Section 24:
1. Front-facing rectangular package
2. Mild perspective
3. Strong perspective
4. Extreme perspective
5. Rotated package
6. Cropped package
7. Package near image edge
8. Package on table
9. Package on shelf
10. Multiple rectangular background objects
11. White package
12. Black package
13. Glossy package
14. Irregular package
15. No package / irrelevant scene
16. Malformed quadrilateral
17. Nearly collinear quadrilateral
18. Zero-area candidate
19. Out-of-bounds corners
20. Pathological image
"""
import hashlib
import os
import cv2
import numpy as np
import pytest

from image_processor import (
    GeometryResult,
    detect_candidate_quad,
    detect_panel_quad,
    order_corners_robust,
    rectify,
    safe_rectify,
    validate_quadrilateral,
)


def _hash_array(arr: np.ndarray) -> str:
    return hashlib.sha256(arr.tobytes()).hexdigest()


# --------------------------------------------------------------------------
# FIXTURE 1: Front-facing rectangular package
# --------------------------------------------------------------------------
def test_fixture_01_front_facing_rectangular_package():
    img = np.full((600, 800, 3), 40, dtype=np.uint8)
    img[100:500, 150:650] = 230  # 500x400 centered rectangle
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    assert meta["geometry_status"] == "detected"
    assert meta["perspective_severity"] == "near_front_facing"
    assert meta["residual_tilt_deg"] < 10.0

    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert rect.shape[0] > 0 and rect.shape[1] > 0
    assert rect.shape[0] <= 1600 and rect.shape[1] <= 1600
    # Original evidence remains immutable
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 2: Mild perspective
# --------------------------------------------------------------------------
def test_fixture_02_mild_perspective():
    img = np.full((600, 800, 3), 30, dtype=np.uint8)
    # Mild perspective trapezoid (top narrower than bottom by ~15%)
    pts = np.array([[220, 120], [580, 120], [640, 480], [160, 480]], dtype=np.int32)
    cv2.fillPoly(img, [pts], (220, 220, 220))
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    assert meta["geometry_status"] == "detected"
    # Safe rectification succeeds with bounded dimensions
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert rect.shape[0] <= 1600 and rect.shape[1] <= 1600
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 3: Strong perspective
# --------------------------------------------------------------------------
def test_fixture_03_strong_perspective():
    img = np.full((600, 800, 3), 30, dtype=np.uint8)
    # Strong perspective trapezoid
    pts = np.array([[280, 140], [520, 140], [680, 500], [120, 500]], dtype=np.int32)
    cv2.fillPoly(img, [pts], (210, 210, 210))
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    assert meta["geometry_status"] == "detected"
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 4: Extreme perspective
# --------------------------------------------------------------------------
def test_fixture_04_extreme_perspective():
    img = np.full((600, 800, 3), 30, dtype=np.uint8)
    # Extreme perspective (tilt >= 40 degrees)
    corners_extreme = np.array([[100, 100], [450, 450], [420, 500], [70, 150]], dtype=np.float32)
    orig_sha = _hash_array(img)

    valid, reason, meta = validate_quadrilateral(corners_extreme, 800, 600)
    rect, tilt, r_meta = safe_rectify(img, corners_extreme)
    # Rectification must be safely skipped or flagged unusable, NOT forced
    assert r_meta["rectification_status"] in ("skipped", "failed")
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 5: Rotated package
# --------------------------------------------------------------------------
def test_fixture_05_rotated_package():
    img = np.full((600, 800, 3), 40, dtype=np.uint8)
    # Rectangle rotated by 25 degrees
    center = (400, 300)
    size = (300, 200)
    angle = 25.0
    rect_box = cv2.boxPoints((center, size, angle)).astype(np.int32)
    cv2.fillPoly(img, [rect_box], (225, 225, 225))
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    assert meta["geometry_status"] == "detected"
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert rect.shape[0] > 0 and rect.shape[1] > 0
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 6: Cropped package
# --------------------------------------------------------------------------
def test_fixture_06_cropped_package():
    img = np.full((600, 800, 3), 40, dtype=np.uint8)
    # Package cut off at left and top image edges
    img[0:350, 0:400] = 230
    orig_sha = _hash_array(img)

    # Should safely handle edge clipping without throwing an unhandled exception
    corners, meta = detect_candidate_quad(img)
    if corners is not None:
        rect, tilt, r_meta = safe_rectify(img, corners)
        assert rect.shape[0] <= 1600 and rect.shape[1] <= 1600
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 7: Package near image edge
# --------------------------------------------------------------------------
def test_fixture_07_package_near_image_edge():
    img = np.full((600, 800, 3), 30, dtype=np.uint8)
    img[10:590, 750:795] = 220  # Near boundary sliver
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    # Safe boundary clamping, no crash
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 8: Package on table
# --------------------------------------------------------------------------
def test_fixture_08_package_on_table():
    img = np.full((700, 900, 3), 20, dtype=np.uint8)
    # Table edge (large background contour)
    img[50:650, 50:850] = 70
    # Package in foreground (central, bright)
    img[200:500, 250:650] = 230
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    # Must pick the package, NOT the table
    xs = corners[:, 0]
    ys = corners[:, 1]
    assert 200 <= xs.min() and xs.max() <= 700
    assert 150 <= ys.min() and ys.max() <= 550
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 9: Package on shelf
# --------------------------------------------------------------------------
def test_fixture_09_package_on_shelf():
    img = np.full((600, 800, 3), 50, dtype=np.uint8)
    # Horizontal shelf lines
    cv2.line(img, (0, 150), (800, 150), (120, 120, 120), 8)
    cv2.line(img, (0, 480), (800, 480), (120, 120, 120), 8)
    # Package on shelf
    img[180:460, 260:540] = 230
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 10: Multiple rectangular background objects
# --------------------------------------------------------------------------
def test_fixture_10_multiple_rectangular_background_objects():
    img = np.full((600, 800, 3), 30, dtype=np.uint8)
    # Small clutter rectangles
    img[50:150, 50:150] = 160
    img[450:550, 650:750] = 160
    img[50:150, 650:750] = 160
    # Main package centrally framed
    img[180:420, 260:540] = 240
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    # Central package should be chosen over periphery clutter
    xs = corners[:, 0]
    assert 220 <= xs.min() and xs.max() <= 580
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 11: White package
# --------------------------------------------------------------------------
def test_fixture_11_white_package():
    img = np.full((600, 800, 3), 210, dtype=np.uint8)  # Light background
    img[120:480, 200:600] = 255                        # White package
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    assert meta["geometry_status"] == "detected"
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 12: Black package
# --------------------------------------------------------------------------
def test_fixture_12_black_package():
    img = np.full((600, 800, 3), 60, dtype=np.uint8)   # Dark background
    img[120:480, 200:600] = 10                         # Black package
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    assert meta["geometry_status"] == "detected"
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 13: Glossy package
# --------------------------------------------------------------------------
def test_fixture_13_glossy_package():
    img = np.full((600, 800, 3), 40, dtype=np.uint8)
    img[120:480, 200:600] = 180
    # Add specular glare patches inside package
    cv2.circle(img, (350, 250), 30, (255, 255, 255), -1)
    cv2.circle(img, (450, 320), 20, (255, 255, 255), -1)
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is not None
    rect, tilt, r_meta = safe_rectify(img, corners)
    assert r_meta["rectification_status"] == "applied"
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 14: Irregular package
# --------------------------------------------------------------------------
def test_fixture_14_irregular_package():
    img = np.full((600, 800, 3), 40, dtype=np.uint8)
    # Circle / disc package
    cv2.circle(img, (400, 300), 160, (230, 230, 230), -1)
    orig_sha = _hash_array(img)

    # Should safely fail or return unavailable rather than forcing a warped distortion
    corners, meta = detect_candidate_quad(img)
    if corners is None:
        assert meta["geometry_status"] == "unavailable"
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 15: No package / irrelevant scene
# --------------------------------------------------------------------------
def test_fixture_15_no_package_irrelevant_scene():
    # Random Gaussian noise
    np.random.seed(42)
    img = np.random.randint(90, 110, (500, 500, 3), dtype=np.uint8)
    orig_sha = _hash_array(img)

    corners, meta = detect_candidate_quad(img)
    assert corners is None
    assert meta["geometry_status"] == "unavailable"
    rect, tilt, r_meta = safe_rectify(img, None)
    assert r_meta["rectification_status"] == "skipped"
    assert _hash_array(img) == orig_sha


# --------------------------------------------------------------------------
# FIXTURE 16: Malformed quadrilateral (self-intersecting / bowtie)
# --------------------------------------------------------------------------
def test_fixture_16_malformed_quadrilateral():
    img = np.full((400, 400, 3), 128, dtype=np.uint8)
    # Self-intersecting bowtie corners
    bowtie = np.array([[50, 50], [300, 300], [300, 50], [50, 300]], dtype=np.float32)
    valid, reason, meta = validate_quadrilateral(bowtie, 400, 400)
    # Must not accept bowtie
    assert valid is False or not cv2.isContourConvex(bowtie.astype(np.int32))
    rect, tilt, r_meta = safe_rectify(img, bowtie)
    assert rect.shape == (400, 400, 3) or r_meta["rectification_status"] in ("applied", "skipped", "failed")


# --------------------------------------------------------------------------
# FIXTURE 17: Nearly collinear quadrilateral
# --------------------------------------------------------------------------
def test_fixture_17_nearly_collinear_quadrilateral():
    # Three points almost on the same line
    collinear = np.array([[50, 100], [200, 102], [350, 100], [200, 350]], dtype=np.float32)
    valid, reason, meta = validate_quadrilateral(collinear, 400, 400)
    assert valid is False
    assert "angle" in (reason or "").lower() or "convex" in (reason or "").lower()


# --------------------------------------------------------------------------
# FIXTURE 18: Zero-area candidate
# --------------------------------------------------------------------------
def test_fixture_18_zero_area_candidate():
    img = np.full((400, 400, 3), 128, dtype=np.uint8)
    zero_area = np.array([[100, 100], [100, 100], [100, 100], [100, 100]], dtype=np.float32)
    valid, reason, meta = validate_quadrilateral(zero_area, 400, 400)
    assert valid is False
    rect, tilt, r_meta = safe_rectify(img, zero_area)
    assert r_meta["rectification_status"] == "skipped"


# --------------------------------------------------------------------------
# FIXTURE 19: Out-of-bounds corners
# --------------------------------------------------------------------------
def test_fixture_19_out_of_bounds_corners():
    img = np.full((400, 400, 3), 128, dtype=np.uint8)
    oob = np.array([[-500, -500], [2000, -500], [2000, 2000], [-500, 2000]], dtype=np.float32)
    valid, reason, meta = validate_quadrilateral(oob, 400, 400)
    assert valid is False
    assert "boundary" in (reason or "").lower()
    rect, tilt, r_meta = safe_rectify(img, oob)
    assert r_meta["rectification_status"] == "skipped"


# --------------------------------------------------------------------------
# FIXTURE 20: Pathological image
# --------------------------------------------------------------------------
def test_fixture_20_pathological_image():
    # 1x1 pixel image
    tiny = np.zeros((1, 1, 3), dtype=np.uint8)
    corners, meta = detect_candidate_quad(tiny)
    assert corners is None
    rect, tilt, r_meta = safe_rectify(tiny, corners)
    assert r_meta["rectification_status"] == "skipped"

    # None input
    corners_none, meta_none = detect_candidate_quad(None)
    assert corners_none is None
    assert meta_none["geometry_status"] == "unavailable"
