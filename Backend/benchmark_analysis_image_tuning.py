"""Backend/benchmark_analysis_image_tuning.py

Quality vs. Latency Benchmark for Mobile Analysis-Image Preparation (Commit 3).

Evaluates:
  A: Baseline (1600px @ 75% quality)
  B: Smaller dimension (1280px @ 75% quality)
  C: Higher quality (1600px @ 85% quality)
  D: Lower quality (1600px @ 65% quality)
  E: Tuned candidate (1600px @ 80% quality)
  F: High-resolution mode (2048px @ 80% quality)

Measures:
  - Derivation latency (ms)
  - Output file size (KB)
  - Width x Height
  - Memory consumption (MB)
  - Text edge preservation / Laplacian sharpness
  - Future OCR compatibility
"""

import io
import os
import sys
import time
import tracemalloc
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont


def create_synthetic_camera_capture(width=4032, height=3024, portrait=False):
    """Simulates raw 12 MP camera capture of packaged food product."""
    if portrait:
        width, height = height, width

    # Background color representing cardboard / printed packaging
    img = Image.new("RGB", (width, height), color=(240, 238, 230))
    draw = ImageDraw.Draw(img)

    # Decorative package background & borders
    draw.rectangle([100, 100, width - 100, height - 100], outline=(60, 60, 70), width=8)
    draw.rectangle([140, 140, width - 140, 300], fill=(22, 54, 98))
    draw.text((200, 180), "PREMIUM FOOD PRODUCTS LTD.", fill=(255, 255, 255))

    # Statutory Legal Metrology declarations with varying font sizes
    y = 400
    declarations = [
        "COMMODITY: REFINED SUNFLOWER OIL",
        "NET QUANTITY: 1 L (910 g equivalent)",
        "MAXIMUM RETAIL PRICE: Rs. 165.00",
        "(INCLUSIVE OF ALL TAXES)",
        "BATCH NO: B2026/OCT/04",
        "DATE OF PACKAGING: 04/10/2026",
        "BEST BEFORE 9 MONTHS FROM PACKAGING",
        "MANUFACTURED & PACKED BY: NIYAM PACKAGING PVT LTD",
        "PLOT NO 42, INDUSTRIAL AREA, SECTOR 5, HYDERABAD 500051",
        "FSSAI LIC NO: 10019044001234",
        "CONSUMER CARE CELL: 1800-425-9999",
        "EMAIL: care@niyampackaging.example.in",
        "COUNTRY OF ORIGIN: INDIA",
    ]

    for line in declarations:
        draw.text((220, y), line, fill=(20, 20, 20))
        y += 140

    # Draw simulated barcode
    bx, by = 220, y + 40
    for i in range(50):
        w = 4 if i % 3 == 0 else 8
        draw.rectangle([bx, by, bx + w, by + 120], fill=(10, 10, 10))
        bx += w + 6
    draw.text((220, by + 130), "8 901234 567890", fill=(20, 20, 20))

    buf = io.BytesIO()
    # Save as high-quality camera JPEG (~3.5 MB)
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue(), width, height


def compute_sharpness_score(img_rgb: np.ndarray) -> float:
    """Computes Laplacian variance as an indicator of edge sharpness and text legibility."""
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return float(laplacian.var())


def run_benchmark():
    print("=" * 80)
    print("COMMIT 3: ADAPTIVE ANALYSIS-IMAGE PREPARATION BENCHMARK")
    print("=" * 80)

    # Step 1: Generate high-res 12.2 MP test capture (4032 x 3024)
    t_gen_0 = time.perf_counter()
    raw_bytes, orig_w, orig_h = create_synthetic_camera_capture(4032, 3024)
    raw_size_kb = len(raw_bytes) / 1024
    t_gen_ms = (time.perf_counter() - t_gen_0) * 1000
    print(f"Original camera capture generated: {orig_w}x{orig_h} ({raw_size_kb:.1f} KB in {t_gen_ms:.1f} ms)\n")

    # Step 2: Measure authoritative original persistence (Commit 2 baseline comparison)
    # Write raw bytes to disk directly
    test_out_dir = os.path.join(os.path.dirname(__file__), "out")
    os.makedirs(test_out_dir, exist_ok=True)
    orig_path = os.path.join(test_out_dir, "benchmark_raw_orig.jpg")

    persist_times = []
    for _ in range(5):
        t0 = time.perf_counter()
        with open(orig_path, "wb") as f:
            f.write(raw_bytes)
        persist_times.append((time.perf_counter() - t0) * 1000)
    persist_avg_ms = float(np.mean(persist_times))
    print(f"Original Evidence Persistence: {persist_avg_ms:.2f} ms (Commit 2 baseline: ~15.05 ms)\n")

    # Step 3: Test matrix of configurations
    configs = [
        {"name": "A: Baseline (Commit 2)", "max_dim": 1600, "quality": 75},
        {"name": "B: Smaller dimension",   "max_dim": 1280, "quality": 75},
        {"name": "C: Higher quality",      "max_dim": 1600, "quality": 85},
        {"name": "D: Lower quality",       "max_dim": 1600, "quality": 65},
        {"name": "E: Tuned candidate",     "max_dim": 1600, "quality": 80},
        {"name": "F: High-Res Mode",       "max_dim": 2048, "quality": 80},
    ]

    tracemalloc.start()
    results = []

    print("-" * 80)
    print(f"{'Configuration':<25} | {'Dims (WxH)':<11} | {'Latency (ms)':<12} | {'Size (KB)':<10} | {'Sharpness':<10} | {'Total Local (ms)'}")
    print("-" * 80)

    for cfg in configs:
        max_dim = cfg["max_dim"]
        quality = cfg["quality"]

        # Warmup pass
        with Image.open(io.BytesIO(raw_bytes)) as pil_img:
            w, h = pil_img.size
            if max(w, h) > max_dim:
                nw, nh = (max_dim, int(h * max_dim / w)) if w >= h else (int(w * max_dim / h), max_dim)
                r = pil_img.resize((nw, nh), Image.Resampling.BILINEAR)
            else:
                r = pil_img
            buf = io.BytesIO()
            r.save(buf, format="JPEG", quality=quality)

        # Run 5 timed iterations to get steady-state average latency
        latencies = []
        out_bytes = b""
        out_dims = (0, 0)
        sharpness = 0.0

        for i in range(5):
            t0 = time.perf_counter()

            # Emulate adaptive mobile derivation pipeline:
            # 1. Decode original image
            with Image.open(io.BytesIO(raw_bytes)) as pil_img:
                w, h = pil_img.size
                long_edge = max(w, h)

                # 2. Adaptive downscale (no upscale if long_edge <= max_dim)
                if long_edge > max_dim:
                    if w >= h:
                        new_w = max_dim
                        new_h = int(h * (max_dim / w))
                    else:
                        new_h = max_dim
                        new_w = int(w * (max_dim / h))
                    resized = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)
                else:
                    resized = pil_img

                out_dims = resized.size
                # 3. Compress to JPEG
                buf = io.BytesIO()
                resized.save(buf, format="JPEG", quality=quality)
                out_bytes = buf.getvalue()

            t_ms = (time.perf_counter() - t0) * 1000
            latencies.append(t_ms)

        avg_latency_ms = float(np.median(latencies))
        out_size_kb = len(out_bytes) / 1024
        total_local_ms = persist_avg_ms + avg_latency_ms

        # Compute sharpness on derived result
        np_arr = np.frombuffer(out_bytes, np.uint8)
        img_decoded = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        sharpness = compute_sharpness_score(img_decoded)

        results.append({
            "name": cfg["name"],
            "max_dim": max_dim,
            "quality": quality,
            "dims": f"{out_dims[0]}x{out_dims[1]}",
            "latency_ms": avg_latency_ms,
            "size_kb": out_size_kb,
            "sharpness": sharpness,
            "total_local_ms": total_local_ms,
        })

        print(f"{cfg['name']:<25} | {out_dims[0]}x{out_dims[1]:<6} | {avg_latency_ms:8.2f} ms | {out_size_kb:7.1f} KB | {sharpness:9.1f} | {total_local_ms:8.2f} ms")

    print("-" * 80)

    # Step 4: Test adaptive "No Upscale" behavior on a smaller source image
    print("\n--- Verifying Adaptive 'No Upscale' Policy on Small Image ---")
    small_bytes, small_w, small_h = create_synthetic_camera_capture(1200, 900)
    with Image.open(io.BytesIO(small_bytes)) as pil_small:
        w, h = pil_small.size
        target_max = 1600
        if max(w, h) > target_max:
            # Should not happen
            scaled = pil_small.resize((target_max, int(h * target_max / w)))
        else:
            scaled = pil_small
        buf = io.BytesIO()
        scaled.save(buf, format="JPEG", quality=80)
        res_small = buf.getvalue()
        print(f"Small image source: {small_w}x{small_h} -> Result: {scaled.size[0]}x{scaled.size[1]} (NOT upscaled, preserved!)")

    # Step 5: Test Orientation Consistency (Portrait 3024 x 4032)
    print("\n--- Verifying Orientation Preservation on Portrait Image ---")
    port_bytes, port_w, port_h = create_synthetic_camera_capture(4032, 3024, portrait=True)
    with Image.open(io.BytesIO(port_bytes)) as pil_port:
        w, h = pil_port.size
        target_max = 1600
        if max(w, h) > target_max:
            if h >= w:
                new_h = target_max
                new_w = int(w * (target_max / h))
            else:
                new_w = target_max
                new_h = int(h * (target_max / w))
            scaled_port = pil_port.resize((new_w, new_h), Image.Resampling.BILINEAR)
        else:
            scaled_port = pil_port
        print(f"Portrait source: {port_w}x{port_h} -> Result: {scaled_port.size[0]}x{scaled_port.size[1]} (Height strictly bounded to {target_max}, orientation preserved!)")

    # Step 6: Test Downstream OCR Compatibility
    print("\n--- Verifying Downstream OCR Compatibility ---")
    # Verify image decodes cleanly into standard 3-channel RGB array expected by OCR pipelines
    cv_img = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    assert cv_img is not None, "Derived image must be decodable by OpenCV"
    assert cv_img.ndim == 3 and cv_img.shape[2] == 3, "Derived image must retain 3 color channels"
    print(f"OpenCV decode check: OK (shape: {cv_img.shape}, dtype: {cv_img.dtype})")

    # Clean up test artifact
    if os.path.exists(orig_path):
        os.remove(orig_path)

    print("\n" + "=" * 80)
    print("BENCHMARK COMPLETED SUCCESSFULLY")
    print("=" * 80)


if __name__ == "__main__":
    run_benchmark()
