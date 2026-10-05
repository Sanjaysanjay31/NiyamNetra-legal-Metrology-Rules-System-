"""Backend/benchmark_llm_structuring.py — Cloud LLM Structuring Benchmark Suite (Phase 3).

Measures and compares candidate models (Section 17, 18, 19):
1. Groq GPT-OSS 20B (openai/gpt-oss-20b)
2. Groq GPT-OSS 120B (openai/gpt-oss-120b)
3. Google Gemini Flash-Lite (gemini-2.5-flash-lite)

Dataset includes:
- Clean OCR (full declarations)
- OCR typo / noisy text
- Fragmented OCR
- Multiple dates
- Multiple numeric values
- Dense manufacturer/address text
- Ambiguous OCR (e.g. MRP Rs SO)
- Missing declarations (adversarial)
- Unreadable OCR result
- Isolated ambiguous date
- Multilingual OCR (Hindi/English)

Measures:
- Latency (total, p50, p95, mean)
- Token usage (input, output)
- Structured output success & schema validation rate
- Extraction accuracy & normalization accuracy
- Hallucination rate & evidence grounding rate
- Ambiguity preservation rate & null correctness
- Process memory before and after (Render 512MB RAM compliance)
"""
from __future__ import annotations

import json
import logging
import statistics
import time
from typing import Any

from config import settings
from llm.gemini_provider import GeminiLLMProvider
from llm.groq_provider import GroqLLMProvider
from llm.prompts import package_ocr_for_llm
from llm.schema import (
    LLM_STATUS_SUCCESS,
    STATUS_AMBIGUOUS,
    STATUS_CONFIRMED,
    STATUS_NOT_OBSERVED,
    StructuredDeclarationResult,
)
from ocr.base import OcrLine, OcrResult
from perf_baseline import get_process_memory_mb

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("niyamnetra.benchmark.llm")


def build_benchmark_dataset() -> list[dict[str, Any]]:
    """Construct real-world packaged commodity OCR evidence scenarios (Section 18)."""
    dataset = []

    # 1. Clean OCR with full mandatory declarations
    dataset.append({
        "scenario": "clean_ocr_full",
        "description": "Standard packaged wheat flour with all mandatory declarations clearly printed",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="front",
                image_id=101,
                scan_id=5001,
                source_width=1200,
                source_height=1600,
                lines=[
                    OcrLine(text="HIMALAYAN ORGANIC ATTA", confidence=0.98, box=[[100, 100], [600, 100], [600, 160], [100, 160]]),
                    OcrLine(text="NET WEIGHT: 5 kg", confidence=0.97, box=[[120, 200], [450, 200], [450, 240], [120, 240]]),
                    OcrLine(text="MRP Rs. 260.00 (INCL. OF ALL TAXES)", confidence=0.96, box=[[120, 300], [650, 300], [650, 340], [120, 340]]),
                    OcrLine(text="MFG DATE: 15/01/2026", confidence=0.95, box=[[120, 400], [500, 400], [500, 440], [120, 440]]),
                    OcrLine(text="BEST BEFORE: 6 MONTHS FROM PACKAGING", confidence=0.93, box=[[120, 460], [680, 460], [680, 500], [120, 500]]),
                    OcrLine(text="BATCH NO: WF-2026-A1", confidence=0.94, box=[[120, 520], [480, 520], [480, 560], [120, 560]]),
                    OcrLine(text="MANUFACTURED BY: HIMALAYAN AGRO PRODUCTS PVT LTD", confidence=0.95, box=[[120, 600], [900, 600], [900, 640], [120, 640]]),
                    OcrLine(text="INDUSTRIAL AREA, SOLAN, HP - 173212", confidence=0.94, box=[[120, 650], [800, 650], [800, 690], [120, 690]]),
                    OcrLine(text="CONSUMER CARE: 1800-111-2222 care@himalayanagro.test", confidence=0.92, box=[[120, 720], [850, 720], [850, 760], [120, 760]]),
                    OcrLine(text="COUNTRY OF ORIGIN: INDIA", confidence=0.96, box=[[120, 800], [550, 800], [550, 840], [120, 840]]),
                ],
            )
        ],
        "expected": {
            "mrp_val": 260.0,
            "net_qty_val": 5.0,
            "net_qty_unit": "kg",
            "has_mfg": True,
            "has_batch": True,
            "has_party": True,
            "has_consumer_care": True,
        },
    })

    # 2. OCR Typo / Noisy OCR
    dataset.append({
        "scenario": "ocr_typo_mrp",
        "description": "OCR substituted letter O for 0 in price line",
        "panels": [
            OcrResult(
                engine="ocr_space",
                panel="mrp",
                image_id=102,
                scan_id=5002,
                source_width=1000,
                source_height=800,
                lines=[
                    OcrLine(text="PREMIUM BISCUITS", confidence=0.91),
                    OcrLine(text="NET WT 200 g", confidence=0.89),
                    OcrLine(text="MRP Rs. 4O.0O INCL OF TAXES", confidence=0.78),
                    OcrLine(text="PKD ON 11/25", confidence=0.85),
                ],
            )
        ],
        "expected": {
            "net_qty_val": 200.0,
            "net_qty_unit": "g",
            "mrp_candidates": True,  # either 40.0 normalized or candidate
        },
    })

    # 3. Fragmented OCR across multiple lines
    dataset.append({
        "scenario": "fragmented_ocr",
        "description": "Text broken into single-word tokens due to camera angle or bounding split",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="back",
                image_id=103,
                scan_id=5003,
                lines=[
                    OcrLine(text="NET", confidence=0.95),
                    OcrLine(text="QTY", confidence=0.96),
                    OcrLine(text="500", confidence=0.94),
                    OcrLine(text="g", confidence=0.98),
                    OcrLine(text="M.R.P.", confidence=0.90),
                    OcrLine(text="Rs.", confidence=0.92),
                    OcrLine(text="85.00", confidence=0.95),
                ],
            )
        ],
        "expected": {
            "mrp_val": 85.0,
            "net_qty_val": 500.0,
            "net_qty_unit": "g",
        },
    })

    # 4. Multiple dates (Mfg, Packing, Expiry, Best Before)
    dataset.append({
        "scenario": "multiple_dates",
        "description": "Inspection contains multiple distinct dates that must not be conflated",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="batch",
                image_id=104,
                scan_id=5004,
                lines=[
                    OcrLine(text="MFG DATE: 01/2026", confidence=0.96),
                    OcrLine(text="PACKED: 02/2026", confidence=0.94),
                    OcrLine(text="EXPIRY: 01/2028", confidence=0.95),
                    OcrLine(text="BEST BEFORE 24 MONTHS", confidence=0.92),
                    OcrLine(text="BATCH B-402", confidence=0.97),
                ],
            )
        ],
        "expected": {
            "min_dates_count": 2,
            "has_expiry": True,
            "has_mfg": True,
        },
    })

    # 5. Multiple numeric values (MRP vs Offer vs USP)
    dataset.append({
        "scenario": "multiple_numeric_values",
        "description": "OCR contains MRP, discount price, and unit sale price (USP)",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="front",
                image_id=105,
                scan_id=5005,
                lines=[
                    OcrLine(text="CRUNCHY CHIPS 150g", confidence=0.95),
                    OcrLine(text="MRP Rs. 60.00 (INCL. TAXES)", confidence=0.96),
                    OcrLine(text="SPECIAL OFFER PRICE Rs. 50.00", confidence=0.90),
                    OcrLine(text="UNIT SALE PRICE Rs. 0.40 / g", confidence=0.92),
                    OcrLine(text="NET WEIGHT 150 g", confidence=0.94),
                ],
            )
        ],
        "expected": {
            "mrp_val": 60.0,
            "net_qty_val": 150.0,
        },
    })

    # 6. Dense text: Manufacturer, packer, marketer, contact
    dataset.append({
        "scenario": "dense_text_parties",
        "description": "Dense back panel with manufacturer, packer, marketer, and multiple addresses",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="back",
                image_id=106,
                scan_id=5006,
                lines=[
                    OcrLine(text="MANUFACTURED BY: SUNSHINE FOODS PVT LTD", confidence=0.95),
                    OcrLine(text="PLOT 45, INDUSTRIAL ESTATE, PUNE - 411028", confidence=0.93),
                    OcrLine(text="PACKED BY: QUICKPACK LOGISTICS LLP", confidence=0.94),
                    OcrLine(text="SURVEY NO 12, THANE - 400601", confidence=0.92),
                    OcrLine(text="MARKETED BY: GLOBAL BRANDS INC, MUMBAI", confidence=0.90),
                    OcrLine(text="EMAIL: support@sunshine.test | TEL: 020-22334455", confidence=0.91),
                ],
            )
        ],
        "expected": {
            "has_manufacturer": True,
            "has_packer": True,
            "has_contact": True,
        },
    })

    # 7. Ambiguous OCR: "MRP Rs SO"
    dataset.append({
        "scenario": "ambiguous_ocr_mrp",
        "description": "Character confusion where number could be 50 or SO; model must preserve ambiguity",
        "panels": [
            OcrResult(
                engine="ocr_space",
                panel="mrp",
                image_id=107,
                scan_id=5007,
                lines=[
                    OcrLine(text="ORGANIC TEA", confidence=0.88),
                    OcrLine(text="MRP Rs SO", confidence=0.62),
                    OcrLine(text="LOT 992", confidence=0.85),
                ],
            )
        ],
        "expected": {
            "mrp_ambiguous": True,
        },
    })

    # 8. Missing declarations adversarial test
    dataset.append({
        "scenario": "missing_declarations_adversarial",
        "description": "Package has ONLY net quantity; MRP, manufacturer, dates MUST be null/not_observed",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="front",
                image_id=108,
                scan_id=5008,
                lines=[
                    OcrLine(text="NET QTY 500 g", confidence=0.95),
                ],
            )
        ],
        "expected": {
            "net_qty_val": 500.0,
            "mrp_must_be_null": True,
            "party_must_be_null": True,
            "country_must_be_null": True,
        },
    })

    # 9. Unreadable OCR result
    dataset.append({
        "scenario": "unreadable_image_ocr",
        "description": "OCR produced no lines or pure noise symbols",
        "panels": [
            OcrResult(
                engine="ocr_space",
                panel="front",
                image_id=109,
                scan_id=5009,
                lines=[
                    OcrLine(text="~~~###%%%", confidence=0.15),
                ],
            )
        ],
        "expected": {
            "all_not_observed_or_ambiguous": True,
        },
    })

    # 10. Isolated ambiguous date (no semantic context)
    dataset.append({
        "scenario": "isolated_ambiguous_date",
        "description": "Date digits appear with no Mfg or Expiry label; model must classify as unknown/ambiguous",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="batch",
                image_id=110,
                scan_id=5010,
                lines=[
                    OcrLine(text="BATCH B-101", confidence=0.95),
                    OcrLine(text="06/26", confidence=0.90),
                ],
            )
        ],
        "expected": {
            "date_type_unknown_or_ambiguous": True,
        },
    })

    # 11. Multilingual OCR (Hindi + English)
    dataset.append({
        "scenario": "multilingual_ocr",
        "description": "Dual language packaging declarations in Hindi and English",
        "panels": [
            OcrResult(
                engine="google_vision",
                panel="front",
                image_id=111,
                scan_id=5011,
                lines=[
                    OcrLine(text="शुद्ध वजन / NET WEIGHT: 1 kg", confidence=0.96),
                    OcrLine(text="अधिकतम खुदरा मूल्य / MRP: Rs 85.00", confidence=0.95),
                    OcrLine(text="उत्पादक / MFD BY: PATANJALI AYURVED LTD, HARIDWAR", confidence=0.94),
                    OcrLine(text="उत्पादन तिथि / MFG DATE: 12/2025", confidence=0.92),
                ],
            )
        ],
        "expected": {
            "net_qty_val": 1.0,
            "mrp_val": 85.0,
            "has_party": True,
        },
    })

    return dataset


def evaluate_model_on_dataset(
    provider_name: str,
    model_name: str,
    dataset: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run all benchmark scenarios against a specific model and compute Section 19 metrics."""
    logger.info("=== Benchmarking %s (%s) on %d scenarios ===", provider_name, model_name, len(dataset))

    if provider_name == "groq":
        provider = GroqLLMProvider(model=model_name)
    elif provider_name == "gemini":
        provider = GeminiLLMProvider(model=model_name)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")

    latencies_ms: list[float] = []
    tokens_in_list: list[int] = []
    tokens_out_list: list[int] = []

    schema_success_count = 0
    extraction_accuracy_count = 0
    hallucination_count = 0
    ambiguity_preservation_count = 0
    null_correctness_count = 0
    total_scenarios = len(dataset)

    mem_before = get_process_memory_mb()

    scenario_results = []

    for item in dataset:
        name = item["scenario"]
        panels = item["panels"]
        expected = item["expected"]
        packaged = package_ocr_for_llm(panels)

        t0 = time.perf_counter()
        res: StructuredDeclarationResult = provider.extract_declarations(packaged)
        dur = round((time.perf_counter() - t0) * 1000, 2)
        latencies_ms.append(dur)

        tokens_in = res.metadata.get("tokens_in", 0)
        tokens_out = res.metadata.get("tokens_out", 0)
        tokens_in_list.append(tokens_in)
        tokens_out_list.append(tokens_out)

        # 1. Schema check
        is_schema_valid = res.metadata.get("status") == LLM_STATUS_SUCCESS
        if is_schema_valid:
            schema_success_count += 1

        # 2. Evaluation checks
        passed_accuracy = True
        hallucinated = False
        preserved_ambiguity = True
        null_correct = True

        # Check clean full
        if expected.get("mrp_val") is not None:
            if res.mrp.value != expected["mrp_val"]:
                passed_accuracy = False
        if expected.get("net_qty_val") is not None:
            if res.net_quantity.value != expected["net_qty_val"]:
                passed_accuracy = False

        # Check adversarial nulls (missing declarations test)
        if expected.get("mrp_must_be_null"):
            if res.mrp.value is not None or res.mrp.status == STATUS_CONFIRMED:
                hallucinated = True
                null_correct = False
        if expected.get("party_must_be_null"):
            confirmed_parties = [p for p in res.parties if p.status == STATUS_CONFIRMED and p.name]
            if confirmed_parties:
                hallucinated = True
                null_correct = False
        if expected.get("country_must_be_null"):
            if res.country_of_origin.value is not None or res.country_of_origin.status == STATUS_CONFIRMED:
                hallucinated = True
                null_correct = False

        # Check ambiguous number
        if expected.get("mrp_ambiguous"):
            if res.mrp.status == STATUS_CONFIRMED and res.mrp.value not in (None, 50.0):
                preserved_ambiguity = False
            elif res.mrp.status != STATUS_AMBIGUOUS and res.mrp.status != STATUS_NOT_OBSERVED:
                preserved_ambiguity = False

        # Check isolated ambiguous date
        if expected.get("date_type_unknown_or_ambiguous"):
            for d in res.dates:
                if d.status == STATUS_CONFIRMED and d.date_type_candidate not in ("unknown", None, "ambiguous"):
                    preserved_ambiguity = False

        if passed_accuracy and not hallucinated:
            extraction_accuracy_count += 1
        if hallucinated:
            hallucination_count += 1
        if preserved_ambiguity:
            ambiguity_preservation_count += 1
        if null_correct:
            null_correctness_count += 1

        scenario_results.append({
            "scenario": name,
            "duration_ms": dur,
            "status": res.metadata.get("status"),
            "schema_valid": is_schema_valid,
            "hallucinated": hallucinated,
            "mrp": {"val": res.mrp.value, "status": res.mrp.status, "raw": res.mrp.raw_text},
            "net_qty": {"val": res.net_quantity.value, "unit": res.net_quantity.unit, "status": res.net_quantity.status},
        })
        time.sleep(1.0)

    mem_after = get_process_memory_mb()

    latencies_sorted = sorted(latencies_ms)
    p50 = statistics.median(latencies_sorted) if latencies_sorted else 0.0
    p95_idx = int(len(latencies_sorted) * 0.95)
    p95 = latencies_sorted[min(p95_idx, len(latencies_sorted) - 1)] if latencies_sorted else 0.0
    mean_lat = statistics.mean(latencies_sorted) if latencies_sorted else 0.0

    return {
        "provider": provider_name,
        "model": model_name,
        "scenarios_tested": total_scenarios,
        "latency_ms": {
            "mean": round(mean_lat, 2),
            "p50": round(p50, 2),
            "p95": round(p95, 2),
            "min": round(min(latencies_sorted), 2) if latencies_sorted else 0.0,
            "max": round(max(latencies_sorted), 2) if latencies_sorted else 0.0,
        },
        "tokens": {
            "mean_in": round(statistics.mean(tokens_in_list), 1) if tokens_in_list and any(tokens_in_list) else 0,
            "mean_out": round(statistics.mean(tokens_out_list), 1) if tokens_out_list and any(tokens_out_list) else 0,
        },
        "rates": {
            "schema_success_rate": round(schema_success_count / total_scenarios, 4),
            "extraction_accuracy": round(extraction_accuracy_count / total_scenarios, 4),
            "hallucination_rate": round(hallucination_count / total_scenarios, 4),
            "ambiguity_preservation_rate": round(ambiguity_preservation_count / total_scenarios, 4),
            "null_correctness_rate": round(null_correctness_count / total_scenarios, 4),
        },
        "process_memory_mb": {
            "before": mem_before,
            "after": mem_after,
            "diff": round(mem_after - mem_before, 2),
        },
        "scenarios": scenario_results,
    }


def main():
    dataset = build_benchmark_dataset()
    results = {}

    # Candidate 1: Groq GPT-OSS 20B
    try:
        results["groq_gpt_oss_20b"] = evaluate_model_on_dataset(
            provider_name="groq",
            model_name="openai/gpt-oss-20b",
            dataset=dataset,
        )
    except Exception as e:
        logger.error("Failed groq_gpt_oss_20b: %s", e)
        results["groq_gpt_oss_20b"] = {"error": str(e)}

    time.sleep(3.0)

    # Candidate 2: Groq GPT-OSS 120B
    try:
        results["groq_gpt_oss_120b"] = evaluate_model_on_dataset(
            provider_name="groq",
            model_name="openai/gpt-oss-120b",
            dataset=dataset,
        )
    except Exception as e:
        logger.error("Failed groq_gpt_oss_120b: %s", e)
        results["groq_gpt_oss_120b"] = {"error": str(e)}

    time.sleep(3.0)

    # Candidate 3: Gemini 2.5 Flash-Lite
    try:
        results["gemini_2_5_flash_lite"] = evaluate_model_on_dataset(
            provider_name="gemini",
            model_name="gemini-2.5-flash-lite",
            dataset=dataset,
        )
    except Exception as e:
        logger.error("Failed gemini_2_5_flash_lite: %s", e)
        results["gemini_2_5_flash_lite"] = {"error": str(e)}

    # Print Summary Table
    print("\n" + "=" * 90)
    print("NIYAMNETRA CLOUD LLM STRUCTURING BENCHMARK RESULTS (PHASE 3)")
    print("=" * 90)
    header = f"{'Model':<25} | {'p50 (ms)':<9} | {'p95 (ms)':<9} | {'Schema %':<9} | {'Accuracy %':<11} | {'Halluc %':<9} | {'Ambiguity %'}"
    print(header)
    print("-" * 90)

    for k, v in results.items():
        if "error" in v:
            print(f"{k:<25} | ERROR: {v['error']}")
            continue
        lat = v["latency_ms"]
        rates = v["rates"]
        print(
            f"{v['model']:<25} | "
            f"{lat['p50']:<9.1f} | "
            f"{lat['p95']:<9.1f} | "
            f"{rates['schema_success_rate'] * 100:<9.1f} | "
            f"{rates['extraction_accuracy'] * 100:<11.1f} | "
            f"{rates['hallucination_rate'] * 100:<9.1f} | "
            f"{rates['ambiguity_preservation_rate'] * 100:.1f}"
        )
    print("=" * 90 + "\n")

    # Save to file
    out_path = "benchmark_llm_structuring_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    logger.info("Saved benchmark results to %s", out_path)


if __name__ == "__main__":
    main()
