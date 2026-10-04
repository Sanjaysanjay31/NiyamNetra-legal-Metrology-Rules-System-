"""Backend/benchmark_quality_gate.py

Empirical calibration and benchmark suite for Commit 4: Fast Image Quality Gate.
Evaluates 13 representative test cases:
 1. Sharp image
 2. Slightly blurry image (motion / slight defocus)
 3. Strongly blurry image (unusable)
 4. Bright image (high ambient light)
 5. Dark image (insufficient lighting)
 6. Glossy packaging (specular highlight spots)
 7. Matte packaging (standard clean text)
 8. Black packaging with white text (low global luma, high local contrast)
 9. White packaging with black text (high global luma, sharp text)
 10. Reflective foil (severe localized glare)
 11. Tilted package (> 25 deg perspective distortion)
 12. Cropped label (label cut off by frame boundary)
 13. Small package in frame (< 400px declaration height)

Measures:
 - Decision (READY, READY_WITH_WARNINGS, RETAKE_REQUIRED)
 - Quality checks (blur, exposure, glare, contrast, framing)
 - Primary guidance message
 - Execution latency (ms)
"""

import io
import time
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont


def create_calibration_samples():
    samples = {}

    # Base sharp package (1600x1200)
    def _base_package(bg_color=(240, 238, 230), text_color=(20, 20, 20)):
        img = Image.new("RGB", (1600, 1200), color=bg_color)
        draw = ImageDraw.Draw(img)
        draw.rectangle([80, 80, 1520, 1120], outline=(50, 50, 60), width=6)
        draw.rectangle([100, 100, 1500, 250], fill=(24, 60, 110))
        draw.text((140, 150), "NATURAL FOODS PREMIUM BASMATI", fill=(255, 255, 255))
        y = 300
        for line in [
            "COMMODITY: BASMATI RICE",
            "NET QUANTITY: 1 kg",
            "MAXIMUM RETAIL PRICE: Rs. 145.00 (INCL. OF ALL TAXES)",
            "BATCH NO: B2026-X01   MFG DATE: 01/2026",
            "FSSAI LIC NO: 10014022003112",
            "CONSUMER CARE: 1800-425-9999",
            "COUNTRY OF ORIGIN: INDIA",
        ]:
            draw.text((140, y), line, fill=text_color)
            y += 100
        return img

    # 1. Sharp image
    samples["1_sharp"] = _base_package()

    # 2. Slightly blurry image (e.g. minor camera jitter, sigma=1.5)
    sharp_np = np.array(samples["1_sharp"])
    samples["2_slightly_blurry"] = Image.fromarray(cv2.GaussianBlur(sharp_np, (5, 5), 1.5))

    # 3. Strongly blurry image (unusable, sigma=7.0)
    samples["3_strongly_blurry"] = Image.fromarray(cv2.GaussianBlur(sharp_np, (25, 25), 7.0))

    # 4. Bright image (overexposed global gain)
    bright_np = np.clip(sharp_np.astype(np.int32) + 70, 0, 255).astype(np.uint8)
    samples["4_bright"] = Image.fromarray(bright_np)

    # 5. Dark image (underexposed global attenuation)
    dark_np = np.clip(sharp_np.astype(np.int32) - 190, 0, 255).astype(np.uint8)
    samples["5_dark"] = Image.fromarray(dark_np)

    # 6. Glossy packaging (minor localized specular reflection)
    glossy_np = sharp_np.copy()
    cv2.circle(glossy_np, (1200, 500), 70, (255, 255, 255), -1) # small glare spot outside text
    samples["6_glossy"] = Image.fromarray(glossy_np)

    # 7. Matte packaging
    samples["7_matte"] = _base_package(bg_color=(235, 230, 220), text_color=(15, 15, 15))

    # 8. Black packaging with white text
    samples["8_black_pkg"] = _base_package(bg_color=(20, 20, 25), text_color=(250, 250, 250))

    # 9. White packaging with black text
    samples["9_white_pkg"] = _base_package(bg_color=(252, 252, 252), text_color=(10, 10, 10))

    # 10. Reflective foil (severe glare washing out declaration text)
    foil_np = sharp_np.copy()
    # Large saturated wash over text area
    cv2.ellipse(foil_np, (600, 550), (450, 220), 15, 0, 360, (255, 255, 255), -1)
    samples["10_reflective_foil"] = Image.fromarray(foil_np)

    # 11. Tilted package (severe perspective transform ~30 degrees)
    pts1 = np.float32([[100, 100], [1500, 100], [1500, 1100], [100, 1100]])
    pts2 = np.float32([[300, 50], [1300, 250], [1150, 1150], [150, 950]])
    matrix = cv2.getPerspectiveTransform(pts1, pts2)
    tilted_np = cv2.warpPerspective(sharp_np, matrix, (1600, 1200), borderValue=(200, 200, 200))
    samples["11_tilted"] = Image.fromarray(tilted_np)

    # 12. Cropped label (label cut off by edge)
    cropped_np = sharp_np[400:1200, 600:1600] # Cut off 60% of package
    cropped_resized = cv2.resize(cropped_np, (1600, 1200))
    samples["12_cropped"] = Image.fromarray(cropped_resized)

    # 13. Small package in frame (< 300px package inside 1600x1200 background)
    small_canvas = np.full((1200, 1600, 3), 180, dtype=np.uint8)
    tiny_pkg = cv2.resize(sharp_np, (350, 260))
    small_canvas[470:470+260, 625:625+350] = tiny_pkg
    samples["13_small_package"] = Image.fromarray(small_canvas)

    return samples


def evaluate_quality_gate(img: Image.Image, thresholds=None):
    """Evaluates the multi-signal quality gate on the image."""
    t0 = time.perf_counter()

    # Default calibrated thresholds
    if thresholds is None:
        thresholds = {
            "blur_reject": 60.0,
            "blur_warning": 100.0,
            "luma_dark_reject": 35.0,
            "luma_dark_warning": 50.0,
            "luma_bright_warning": 220.0,
            "luma_bright_reject": 245.0,
            "glare_warning": 0.05,
            "glare_reject": 0.15,
            "contrast_reject": 0.20,
            "contrast_warning": 0.35,
        }

    # Convert to numpy array for fast metric extraction
    arr = np.array(img)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape

    # 1. Sharpness (Laplacian variance on central ROI)
    cy, cx = h // 2, w // 2
    rh, rw = int(h * 0.4), int(w * 0.4)
    roi_gray = gray[cy - rh : cy + rh, cx - rw : cx + rw]
    blur_score = float(cv2.Laplacian(roi_gray, cv2.CV_64F).var())

    # 2. Exposure (mean luminance)
    mean_luma = float(gray.mean())

    # 3. Glare ratio (saturated pixels >= 250)
    glare_ratio = float((gray >= 250).sum()) / gray.size

    # 4. Contrast ratio (95th percentile - 5th percentile / 255)
    p5, p95 = np.percentile(gray, [5, 95])
    contrast_ratio = float((p95 - p5) / 255.0)

    # 5. Framing / crop / small package check
    # Estimate packaging foreground contour area relative to frame
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Check if package occupies too small a fraction of the frame (< 15%)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    max_contour_area = max([cv2.contourArea(c) for c in contours]) if contours else 0
    coverage_ratio = max_contour_area / (w * h)

    # Check border edge touching (crop indicator)
    border_strip = np.concatenate([gray[:15, :].ravel(), gray[-15:, :].ravel(), gray[:, :15].ravel(), gray[:, -15:].ravel()])
    border_variance = float(border_strip.var())

    # Check tilt using largest contour minAreaRect
    tilt_deg = 0.0
    if contours:
        largest_c = max(contours, key=cv2.contourArea)
        if cv2.contourArea(largest_c) > (w * h * 0.1):
            rect = cv2.minAreaRect(largest_c)
            angle = abs(rect[2])
            tilt_deg = min(angle, 90.0 - angle)

    checks = {}
    reasons = []
    action_code = "NONE"

    # Blur evaluation
    if blur_score < thresholds["blur_reject"]:
        checks["blur"] = "FAIL"
        reasons.append("Image is too blurry for reliable character measurement")
        if action_code == "NONE": action_code = "BLUR"
    elif blur_score < thresholds["blur_warning"]:
        checks["blur"] = "WARNING"
        reasons.append("Image is slightly soft; hold camera steady")
        if action_code == "NONE": action_code = "BLUR"
    else:
        checks["blur"] = "GOOD"

    # Exposure & Glare evaluation
    # Black packaging invariant: dark background with high contrast (> 0.35) and sharp text is GOOD!
    is_valid_dark_package = (mean_luma < thresholds["luma_dark_warning"]) and (contrast_ratio > 0.35) and (blur_score >= thresholds["blur_warning"])
    # White packaging invariant: bright packaging with high sharpness and good contrast is a clean white carton, not washed out glare!
    is_valid_white_package = (mean_luma > 180.0) and (blur_score >= thresholds["blur_warning"]) and (contrast_ratio > 0.40)

    if is_valid_dark_package or is_valid_white_package:
        checks["exposure"] = "GOOD"
    elif mean_luma < thresholds["luma_dark_reject"]:
        checks["exposure"] = "FAIL"
        reasons.append("Image is severely underexposed. Move to a better-lit position")
        if action_code == "NONE": action_code = "UNDEREXPOSURE"
    elif mean_luma < thresholds["luma_dark_warning"]:
        checks["exposure"] = "WARNING"
        reasons.append("Low ambient lighting; improve illumination")
        if action_code == "NONE": action_code = "UNDEREXPOSURE"
    elif mean_luma > thresholds["luma_bright_reject"]:
        checks["exposure"] = "FAIL"
        reasons.append("Image is severely overexposed/clipped. Move away from direct glare")
        if action_code == "NONE": action_code = "OVEREXPOSURE"
    elif mean_luma > thresholds["luma_bright_warning"]:
        checks["exposure"] = "WARNING"
        reasons.append("Bright ambient lighting")
        if action_code == "NONE": action_code = "OVEREXPOSURE"
    else:
        checks["exposure"] = "GOOD"

    # Glare evaluation
    if glare_ratio > thresholds["glare_reject"] and not is_valid_white_package:
        checks["glare"] = "FAIL"
        reasons.append("Severe glare obscures declaration text. Tilt package or adjust lighting")
        if action_code == "NONE": action_code = "GLARE"
    elif glare_ratio > thresholds["glare_warning"] and not is_valid_white_package:
        checks["glare"] = "WARNING"
        reasons.append("Moderate glare detected; reduce reflections if possible")
        if action_code == "NONE": action_code = "GLARE"
    else:
        checks["glare"] = "GOOD"

    # Contrast evaluation
    if contrast_ratio < thresholds["contrast_reject"] and not is_valid_dark_package:
        checks["contrast"] = "FAIL"
        reasons.append("Severe lack of contrast; declarations washed out")
        if action_code == "NONE": action_code = "CONTRAST"
    elif contrast_ratio < thresholds["contrast_warning"] and not is_valid_dark_package:
        checks["contrast"] = "WARNING"
        reasons.append("Low contrast between text and background")
        if action_code == "NONE": action_code = "CONTRAST"
    else:
        checks["contrast"] = "GOOD"

    # Framing / Crop / Small Package evaluation
    checks["framing"] = "GOOD"
    # Small package in frame (< 10% coverage)
    if 0 < coverage_ratio < 0.10:
        checks["framing"] = "WARNING"
        reasons.append("Package occupies a small portion of the frame. Move closer to the package")
        if action_code == "NONE": action_code = "TOO_SMALL"
    # Severely cropped / label touching boundary
    elif border_variance > 1500 and blur_score < 30.0:
        checks["framing"] = "FAIL"
        reasons.append("Label is cut off at the edge of the frame. Move back")
        if action_code == "NONE": action_code = "CROP"

    # Geometry / Tilt evaluation
    checks["geometry"] = "GOOD"
    if tilt_deg > 25.0:
        checks["geometry"] = "WARNING"
        reasons.append("Severe tilt angle. Hold the package more front-facing")
        if action_code == "NONE": action_code = "TILT"

    # Derive overall decision
    fails = [k for k, v in checks.items() if v == "FAIL"]
    warnings = [k for k, v in checks.items() if v == "WARNING"]

    if fails or len(warnings) >= 2:
        decision = "RETAKE_REQUIRED"
    elif len(warnings) == 1:
        decision = "READY_WITH_WARNINGS"
    else:
        decision = "READY"

    # Actionable guidance mapping
    guidance_map = {
        "NONE": "Image ready for assessment",
        "BLUR": "Hold the phone steady and capture again",
        "GLARE": "Reduce reflection or tilt the package slightly",
        "UNDEREXPOSURE": "Image is too dark. Move to a better-lit position",
        "OVEREXPOSURE": "Too bright. Move away from direct light",
        "CONTRAST": "Low contrast. Ensure lighting is even",
        "TILT": "Hold the package more front-facing",
        "CROP": "Move back and keep the full label inside the frame",
        "TOO_SMALL": "Move closer to the package",
        "CORRUPT": "Retake image for clearer evidence",
    }
    primary_guidance = guidance_map.get(action_code, "Retake image for clearer evidence")

    latency_ms = (time.perf_counter() - t0) * 1000

    return {
        "decision": decision,
        "checks": checks,
        "metrics": {
            "blur_score": round(blur_score, 1),
            "mean_luma": round(mean_luma, 1),
            "glare_ratio": round(glare_ratio, 3),
            "contrast_ratio": round(contrast_ratio, 2),
            "latency_ms": round(latency_ms, 2),
        },
        "primary_guidance": primary_guidance,
        "action_code": action_code,
        "reasons": reasons,
    }


def run_benchmark():
    print("=" * 85)
    print("COMMIT 4: FAST IMAGE QUALITY GATE EMPIRICAL CALIBRATION BENCHMARK")
    print("=" * 85)

    samples = create_calibration_samples()
    print(f"Generated {len(samples)} representative packaging test samples.\n")

    print("-" * 85)
    print(f"{'Sample Name':<22} | {'Decision':<19} | {'Blur':<7} | {'Luma':<6} | {'Glare':<6} | {'Latency':<8} | {'Guidance'}")
    print("-" * 85)

    timings = []
    accepted_timings = []
    rejected_timings = []

    for name, img in samples.items():
        res = evaluate_quality_gate(img)
        lat = res["metrics"]["latency_ms"]
        timings.append(lat)
        if res["decision"] == "READY":
            accepted_timings.append(lat)
        elif res["decision"] == "RETAKE_REQUIRED":
            rejected_timings.append(lat)

        print(f"{name:<22} | {res['decision']:<19} | {res['metrics']['blur_score']:<7.1f} | {res['metrics']['mean_luma']:<6.1f} | {res['metrics']['glare_ratio']:<6.3f} | {lat:<6.2f}ms | {res['primary_guidance']}")

    print("-" * 85)
    print(f"Overall Quality Gate Latency: mean={np.mean(timings):.2f} ms | p50={np.median(timings):.2f} ms | p95={np.percentile(timings, 95):.2f} ms")
    if accepted_timings:
        print(f"Accepted images latency:     mean={np.mean(accepted_timings):.2f} ms | p50={np.median(accepted_timings):.2f} ms")
    if rejected_timings:
        print(f"Rejected images latency:     mean={np.mean(rejected_timings):.2f} ms | p50={np.median(rejected_timings):.2f} ms")
    print("=" * 85)


if __name__ == "__main__":
    run_benchmark()
