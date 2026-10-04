"""benchmark_geometry.py — Empirical benchmark for Commit 5 geometry hardening.

Measures:
- Candidate quad detection latency (p50, p95)
- Quad validation latency (p50, p95)
- Homography & rectification latency (p50, p95)
- Total geometry latency (p50, p95)
- Output dimensions & memory usage
- Success rate on valid packages
- Safe failure rate on invalid/irrelevant scenes
"""
import os
import sys
import time
import cv2
import numpy as np

# Ensure Backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from image_processor import (
    detect_candidate_quad,
    order_corners_robust,
    safe_rectify,
    validate_quadrilateral,
)
from perf_baseline import get_process_memory_mb


def _generate_synthetic_workloads():
    """Generates a representative set of synthetic inspection workloads."""
    workloads = []

    # 1. Front-facing clean package (1600x1200)
    w1 = np.full((1200, 1600, 3), 40, dtype=np.uint8)
    w1[200:1000, 300:1300] = 230
    workloads.append(("front_facing_1600x1200", w1, True))

    # 2. Mild perspective box (800x600)
    w2 = np.full((600, 800, 3), 30, dtype=np.uint8)
    pts2 = np.array([[220, 120], [580, 120], [640, 480], [160, 480]], dtype=np.int32)
    cv2.fillPoly(w2, [pts2], (220, 220, 220))
    workloads.append(("mild_perspective_800x600", w2, True))

    # 3. Rotated package (800x600, 20 deg)
    w3 = np.full((600, 800, 3), 40, dtype=np.uint8)
    box3 = cv2.boxPoints(((400, 300), (320, 240), 20.0)).astype(np.int32)
    cv2.fillPoly(w3, [box3], (235, 235, 235))
    workloads.append(("rotated_package_800x600", w3, True))

    # 4. Package on shelf (800x600 with shelf clutter)
    w4 = np.full((600, 800, 3), 50, dtype=np.uint8)
    cv2.line(w4, (0, 150), (800, 150), (120, 120, 120), 8)
    cv2.line(w4, (0, 480), (800, 480), (120, 120, 120), 8)
    w4[180:460, 260:540] = 230
    workloads.append(("package_on_shelf_800x600", w4, True))

    # 5. Low-contrast white package (800x600)
    w5 = np.full((600, 800, 3), 210, dtype=np.uint8)
    w5[120:480, 200:600] = 255
    workloads.append(("white_package_800x600", w5, True))

    # 6. Cluttered table scene with foreground pack (900x700)
    w6 = np.full((700, 900, 3), 25, dtype=np.uint8)
    w6[50:650, 50:850] = 70  # Table
    w6[200:500, 250:650] = 230  # Pack
    workloads.append(("table_foreground_pack_900x700", w6, True))

    # 7. Blank / no package (uniform 600x600) -> Safe failure expected
    w7 = np.full((600, 600, 3), 128, dtype=np.uint8)
    workloads.append(("uniform_blank_600x600", w7, False))

    # 8. Random textured clutter (500x500) -> Safe failure expected
    np.random.seed(42)
    w8 = np.random.randint(80, 120, (500, 500, 3), dtype=np.uint8)
    workloads.append(("random_clutter_500x500", w8, False))

    return workloads


def run_benchmark(iterations: int = 15):
    print("=" * 70)
    print("NiyamNetra Commit 5: Geometry & Rectification Empirical Benchmark")
    print(f"Iterations per workload: {iterations}")
    print("=" * 70)

    workloads = _generate_synthetic_workloads()
    mem_start = get_process_memory_mb()

    detect_times = []
    validate_times = []
    rectify_times = []
    total_times = []

    valid_detected_count = 0
    valid_total = 0
    safe_fail_count = 0
    invalid_total = 0

    workload_summary = []

    for name, img, should_detect in workloads:
        h, w = img.shape[:2]
        w_detect_times = []
        w_validate_times = []
        w_rectify_times = []
        w_total_times = []
        out_dims = "N/A"
        final_geom_status = "unavailable"
        final_rect_status = "skipped"

        for _ in range(iterations):
            t0 = time.perf_counter()

            # 1. Detection
            t_d0 = time.perf_counter()
            corners, meta = detect_candidate_quad(img)
            t_d1 = time.perf_counter()
            d_ms = (t_d1 - t_d0) * 1000.0

            # 2. Validation
            t_v0 = time.perf_counter()
            if corners is not None:
                is_valid, reason, v_meta = validate_quadrilateral(corners, w, h)
            else:
                is_valid, reason = False, "None"
            t_v1 = time.perf_counter()
            v_ms = (t_v1 - t_v0) * 1000.0

            # 3. Rectification
            t_r0 = time.perf_counter()
            if corners is not None and is_valid:
                rect, tilt, r_meta = safe_rectify(img, corners)
                final_rect_status = r_meta.get("rectification_status", "applied")
                out_dims = f"{rect.shape[1]}x{rect.shape[0]}"
            else:
                rect, tilt, r_meta = safe_rectify(img, None)
                final_rect_status = "skipped"
                out_dims = "skipped"
            t_r1 = time.perf_counter()
            r_ms = (t_r1 - t_r0) * 1000.0

            t_tot = (time.perf_counter() - t0) * 1000.0

            w_detect_times.append(d_ms)
            w_validate_times.append(v_ms)
            w_rectify_times.append(r_ms)
            w_total_times.append(t_tot)

            detect_times.append(d_ms)
            validate_times.append(v_ms)
            rectify_times.append(r_ms)
            total_times.append(t_tot)

            final_geom_status = meta.get("geometry_status", "unavailable")

        if should_detect:
            valid_total += 1
            if final_geom_status == "detected":
                valid_detected_count += 1
        else:
            invalid_total += 1
            if final_geom_status in ("unavailable", "failed"):
                safe_fail_count += 1

        workload_summary.append({
            "name": name,
            "input_dim": f"{w}x{h}",
            "detect_ms": float(np.median(w_detect_times)),
            "validate_ms": float(np.median(w_validate_times)),
            "rectify_ms": float(np.median(w_rectify_times)),
            "total_ms": float(np.median(w_total_times)),
            "geom_status": final_geom_status,
            "rect_status": final_rect_status,
            "out_dim": out_dims,
        })

    mem_end = get_process_memory_mb()

    # Overall Percentiles
    p50_det = float(np.percentile(detect_times, 50))
    p95_det = float(np.percentile(detect_times, 95))

    p50_val = float(np.percentile(validate_times, 50))
    p95_val = float(np.percentile(validate_times, 95))

    p50_rec = float(np.percentile(rectify_times, 50))
    p95_rec = float(np.percentile(rectify_times, 95))

    p50_tot = float(np.percentile(total_times, 50))
    p95_tot = float(np.percentile(total_times, 95))

    success_rate = (valid_detected_count / valid_total * 100.0) if valid_total else 100.0
    safe_failure_rate = (safe_fail_count / invalid_total * 100.0) if invalid_total else 100.0

    print("\nPER-WORKLOAD BREAKDOWN (Median Latencies):")
    print(f"{'Workload':<30} {'Input':<12} {'Detect':<9} {'Valid':<8} {'Rect':<8} {'Total':<9} {'Status':<12} {'Output':<10}")
    print("-" * 104)
    for w in workload_summary:
        print(f"{w['name']:<30} {w['input_dim']:<12} {w['detect_ms']:>6.2f}ms {w['validate_ms']:>6.3f}ms {w['rectify_ms']:>6.2f}ms {w['total_ms']:>6.2f}ms {w['geom_status']:<12} {w['out_dim']:<10}")

    print("\n" + "=" * 70)
    print("OVERALL AGGREGATED METRICS")
    print("=" * 70)
    print(f"Candidate Detection Latency : p50 = {p50_det:.2f} ms | p95 = {p95_det:.2f} ms")
    print(f"Quad Validation Latency     : p50 = {p50_val:.3f} ms | p95 = {p95_val:.3f} ms")
    print(f"Rectification Warp Latency  : p50 = {p50_rec:.2f} ms | p95 = {p95_rec:.2f} ms")
    print(f"TOTAL Geometry Processing   : p50 = {p50_tot:.2f} ms | p95 = {p95_tot:.2f} ms")
    print(f"Memory Footprint            : Before = {mem_start:.1f} MB | After = {mem_end:.1f} MB (Delta = {mem_end - mem_start:+.1f} MB)")
    print(f"Packaging Detection Rate    : {success_rate:.1f}% ({valid_detected_count}/{valid_total})")
    print(f"Safe Failure Rate           : {safe_failure_rate:.1f}% ({safe_fail_count}/{invalid_total})")
    print("=" * 70)

    # Return structured dict for testing / assertions
    return {
        "p50_detect_ms": p50_det,
        "p95_detect_ms": p95_det,
        "p50_validate_ms": p50_val,
        "p95_validate_ms": p95_val,
        "p50_rectify_ms": p50_rec,
        "p95_rectify_ms": p95_rec,
        "p50_total_ms": p50_tot,
        "p95_total_ms": p95_tot,
        "mem_start_mb": mem_start,
        "mem_end_mb": mem_end,
        "success_rate": success_rate,
        "safe_failure_rate": safe_failure_rate,
    }


if __name__ == "__main__":
    run_benchmark(iterations=15)
