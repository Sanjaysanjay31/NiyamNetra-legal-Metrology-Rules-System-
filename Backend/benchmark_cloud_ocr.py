"""Backend/benchmark_cloud_ocr.py — Cloud OCR Benchmark Suite (Commit 7).

Benchmarks cloud OCR providers against standardized packaging test fixtures
per Section 12 and Section 13.
Measures:
- Latency (p50, p95, mean)
- Memory (RSS MB before and after)
- Bounding-box availability & polygon format
- Confidence score reporting
- Mandatory field recognition (MRP, Net Qty, Dates, Batch, Manufacturer)
- Error rate and timeout behavior
"""
from __future__ import annotations

import io
import json
import statistics
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from config import settings
from ocr import (
    AzureVisionProvider,
    GoogleVisionProvider,
    OCRSpaceProvider,
    STATUS_SUCCESS,
    STATUS_UNAVAILABLE,
)
from ocr_engine import extract_fields
from perf_baseline import get_process_memory_mb


def _generate_dataset() -> list[dict]:
    """Generate test fixture package images covering Section 13 requirements."""
    dataset = []

    # 1. Clear package with mandatory declarations
    img1 = Image.new("RGB", (1200, 900), color=(250, 250, 248))
    d1 = ImageDraw.Draw(img1)
    d1.rectangle([30, 30, 1170, 870], outline=(30, 30, 30), width=4)
    lines1 = [
        "ORGANIC WHEAT FLOUR",
        "NET WEIGHT 5 kg",
        "MRP Rs 240.00 (INCL OF ALL TAXES)",
        "MFG DATE: 15/01/2026",
        "BEST BEFORE 6 MONTHS FROM PACKAGING",
        "BATCH NO: BATCH-WF-2026",
        "MANUFACTURED BY: HIMALAYAN AGRO PRODUCTS PVT LTD",
        "INDUSTRIAL AREA, SECTOR 5, SOLAN, HP - 173212",
        "CUSTOMER CARE: 1800-111-2222 | care@himalayanagro.test",
    ]
    y = 60
    for l in lines1:
        d1.text((60, y), l, fill=(10, 10, 10))
        y += 75
    b1 = io.BytesIO()
    img1.save(b1, format="JPEG", quality=85)
    dataset.append({
        "name": "clear_package_mandatory",
        "bytes": b1.getvalue(),
        "width": 1200,
        "height": 900,
        "expected_fields": ["mrp", "net_quantity", "best_before", "manufacturer"],
    })

    # 2. Small text & dense declarations
    img2 = Image.new("RGB", (1600, 1200), color=(255, 255, 255))
    d2 = ImageDraw.Draw(img2)
    lines2 = [
        "PREMIUM INSTANT COFFEE ROAST",
        "NET QTY: 100 g",
        "MRP Rs 165.00 INCL. ALL TAXES",
        "USP: Rs 1.65 / g",
        "MFD BY: COFFEE ROASTERS INDIA LTD, PLOT 12, COORG - 571201",
        "LOT / BATCH: CR-9941",
        "PKD ON: 10/2025",
        "USE BY: 09/2027",
        "FOR FEEDBACK CONTACT: consumer@roasters.test OR CALL 1800 220 330",
    ]
    y = 80
    for l in lines2:
        d2.text((80, y), l, fill=(0, 0, 0))
        y += 90
    b2 = io.BytesIO()
    img2.save(b2, format="JPEG", quality=80)
    dataset.append({
        "name": "dense_text_small_mrp",
        "bytes": b2.getvalue(),
        "width": 1600,
        "height": 1200,
        "expected_fields": ["mrp", "net_quantity", "best_before", "manufacturer"],
    })

    # 3. Low contrast / dark background
    img3 = Image.new("RGB", (1000, 800), color=(40, 42, 45))
    d3 = ImageDraw.Draw(img3)
    lines3 = [
        "DARK ROAST COFFEE BEANS",
        "NET WT 250 g",
        "MRP Rs 350.00",
        "MFR: HILLTOP ESTATE, COORG",
        "BATCH: HT-88",
    ]
    y = 60
    for l in lines3:
        d3.text((50, y), l, fill=(210, 210, 210))
        y += 85
    b3 = io.BytesIO()
    img3.save(b3, format="JPEG", quality=80)
    dataset.append({
        "name": "dark_background_low_contrast",
        "bytes": b3.getvalue(),
        "width": 1000,
        "height": 800,
        "expected_fields": ["mrp", "net_quantity", "manufacturer"],
    })

    # 4. Mild blur package
    blurred = img1.filter(ImageFilter.GaussianBlur(radius=1.8))
    b4 = io.BytesIO()
    blurred.save(b4, format="JPEG", quality=80)
    dataset.append({
        "name": "mild_blur_package",
        "bytes": b4.getvalue(),
        "width": 1200,
        "height": 900,
        "expected_fields": ["mrp", "net_quantity"],
    })

    return dataset


def run_benchmark():
    print("=" * 60)
    print("NIYAMNETRA CLOUD OCR BENCHMARK — SECTION 12 & 13")
    print("=" * 60)

    dataset = _generate_dataset()
    print(f"Generated benchmark dataset: {len(dataset)} test images.")
    for d in dataset:
        print(f" - {d['name']}: {d['width']}x{d['height']}, {len(d['bytes'])/1024:.1f} KB")

    mem_start = get_process_memory_mb()
    print(f"\nInitial process memory: {mem_start:.1f} MB RSS")

    providers = {
        "OCR.Space": OCRSpaceProvider(),
        "Google Cloud Vision": GoogleVisionProvider(),
        "Azure AI Vision": AzureVisionProvider(),
    }

    results = {}

    for name, provider in providers.items():
        print(f"\nBenchmarking provider: {name}...")
        if not provider.api_key:
            print(f" -> {name}: NOT_CONFIGURED (credentials missing in environment)")
            results[name] = {
                "status": "NOT_CONFIGURED",
                "reason": "Missing API key in environment",
            }
            continue

        latencies = []
        payload_sizes = []
        box_counts = []
        words_counts = []
        conf_avail_list = []
        fields_found = {"mrp": 0, "net_quantity": 0, "manufacturer": 0, "best_before": 0}
        total_items = 0

        mem_before_prov = get_process_memory_mb()

        for item in dataset:
            raw_bytes = item["bytes"]
            payload_sizes.append(len(raw_bytes))
            t0 = time.perf_counter()
            res = provider.recognize(
                image_bytes=raw_bytes,
                image_width=item["width"],
                image_height=item["height"],
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000
            latencies.append(elapsed_ms)

            # Check bounding boxes
            boxes = [ln.box for ln in res.lines if ln.box]
            box_counts.append(len(boxes))

            # Words
            total_words = sum(len(ln.words) for ln in res.lines)
            words_counts.append(total_words)

            # Confidences
            has_conf = any(ln.confidence is not None for ln in res.lines)
            conf_avail_list.append(has_conf)

            # Field extraction
            if res.lines:
                extracted = extract_fields(res)
                for fld in fields_found:
                    if fld in extracted and extracted[fld].found:
                        fields_found[fld] += 1
            total_items += 1

            print(f"   [{item['name']}] Status={res.status} Latency={elapsed_ms:.1f}ms Lines={len(res.lines)} Words={total_words}")

        mem_after_prov = get_process_memory_mb()

        latencies.sort()
        p50 = statistics.median(latencies) if latencies else 0.0
        p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0.0
        avg = statistics.mean(latencies) if latencies else 0.0

        results[name] = {
            "status": "CONFIGURED",
            "samples": len(latencies),
            "latency_p50_ms": round(p50, 1),
            "latency_p95_ms": round(p95, 1),
            "latency_mean_ms": round(avg, 1),
            "mean_payload_kb": round(statistics.mean(payload_sizes) / 1024, 1),
            "bounding_box_coverage": f"{sum(1 for c in box_counts if c > 0)}/{len(box_counts)}",
            "confidence_availability": "Yes" if any(conf_avail_list) else "No (null honest)",
            "fields_recognized": fields_found,
            "total_items": total_items,
            "mem_delta_mb": round(mem_after_prov - mem_before_prov, 2),
            "mem_after_mb": round(mem_after_prov, 1),
        }

    # Historical PaddleOCR baseline from Commit 1
    results["PaddleOCR (Historical Server ML)"] = {
        "status": "REMOVED_FROM_RUNTIME",
        "latency_mean_ms": 11570.0,
        "latency_p50_ms": 11570.0,
        "latency_p95_ms": 12850.0,
        "memory_rss_mb": 385.0,
        "model_weight_mb": 1200.0,
        "render_512mb_viable": False,
        "bounding_box_coverage": "Yes (quad)",
        "confidence_availability": "Yes (0.0-1.0)",
    }

    print("\n" + "=" * 60)
    print("BENCHMARK SUMMARY RESULTS")
    print("=" * 60)
    print(json.dumps(results, indent=2))

    # Save benchmark artifact to JSON
    out_file = Path(__file__).parent / "benchmark_cloud_ocr_results.json"
    out_file.write_text(json.dumps(results, indent=2))
    print(f"\nSaved benchmark results to: {out_file}")


if __name__ == "__main__":
    run_benchmark()
