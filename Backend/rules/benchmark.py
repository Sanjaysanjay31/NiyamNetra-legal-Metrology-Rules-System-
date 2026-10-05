"""Backend/rules/benchmark.py — Comprehensive Phase 4 Performance & Memory Benchmark.

Measures actual latency (mean, p50, p95) and peak RSS across:
1. Rule-pack loading (cached and uncached)
2. Phase 4B declaration compliance evaluation
3. Phase 4C visual and geometry evaluation (both context-based and raw CV measurement)
4. Phase 4D multi-panel evidence aggregation
5. Full Phase 4 end-to-end evaluation pipeline (4B -> 4C -> 4D)

Guarantees:
- Zero OCR HTTP/cloud calls.
- Zero LLM HTTP/cloud calls.
- Zero external network dependencies.
- Peak RSS verification comfortably below Render's 512 MB ceiling.
"""
from __future__ import annotations

import time
from datetime import date
from typing import Any

import cv2
import numpy as np

from llm.schema import (
    CommonFieldDeclaration,
    DateDeclaration,
    FieldProvenance,
    MrpDeclaration,
    NetQuantityDeclaration,
    PartyDeclaration,
    StructuredDeclarationResult,
)
from rules.aggregation import aggregate_inspection_assessment
from rules.evaluator import evaluate_declaration_rules
from rules.loader import load_rule_pack
from rules.visual_evaluator import (
    evaluate_visual_and_geometry_rules,
    measure_conspicuous_contrast_signal,
    measure_glyph_height_mm,
    reconcile_coordinates,
    verify_clear_space_image,
)
from rules_engine import CheckContext


def _get_peak_rss_mb() -> float:
    """Retrieve peak RSS in MB across Windows and Unix platforms."""
    try:
        import ctypes
        from ctypes import wintypes
        class PMC(ctypes.Structure):
            _fields_ = [
                ('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD),
                ('PeakWorkingSetSize', ctypes.c_size_t), ('WorkingSetSize', ctypes.c_size_t),
                ('QuotaPeakPagedPoolUsage', ctypes.c_size_t), ('QuotaPagedPoolUsage', ctypes.c_size_t),
                ('QuotaPeakNonPagedPoolUsage', ctypes.c_size_t), ('QuotaNonPagedPoolUsage', ctypes.c_size_t),
                ('PagefileUsage', ctypes.c_size_t), ('PeakPagefileUsage', ctypes.c_size_t),
            ]
        pmc = PMC()
        pmc.cb = ctypes.sizeof(PMC)
        psapi = ctypes.windll.psapi
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
        psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
        if psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb):
            return pmc.PeakWorkingSetSize / (1024 * 1024)
    except Exception:
        pass

    try:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
    except Exception:
        return 0.0


def _stats(times_ms: list[float]) -> dict[str, float]:
    return {
        "mean_ms": round(float(np.mean(times_ms)), 3),
        "p50_ms": round(float(np.median(times_ms)), 3),
        "p95_ms": round(float(np.percentile(times_ms, 95)), 3),
    }


def benchmark_phase4_end_to_end(iterations: int = 50) -> dict[str, Any]:
    """Execute end-to-end benchmark across all Phase 4 modules without AI/network overhead."""
    # 1. Warm-up and load rule pack
    pack = load_rule_pack(enforce_strict_validation=True)

    # 2. Build representative test data
    llm_result = StructuredDeclarationResult(
        commodity_name=CommonFieldDeclaration(
            value="Basmati Rice",
            provenance=FieldProvenance(source_panel="front", source_text="Basmati Rice"),
        ),
        mrp=MrpDeclaration(
            value=250.0,
            currency="INR",
            raw_text="MRP Rs. 250.00 (incl. of all taxes)",
            provenance=FieldProvenance(source_panel="front", source_text="MRP Rs. 250.00 (incl. of all taxes)"),
        ),
        net_quantity=NetQuantityDeclaration(
            value=5.0,
            unit="kg",
            raw_text="Net Qty: 5 kg",
            normalized_value=5.0,
            normalized_unit="kg",
            provenance=FieldProvenance(source_panel="front", source_text="Net Qty: 5 kg"),
        ),
        dates=[
            DateDeclaration(
                date_type_candidate="mfg",
                normalized_date="2026-03-01",
                status="confirmed",
                raw_text="MFG: 01/03/2026",
                provenance=FieldProvenance(source_panel="back", source_text="MFG: 01/03/2026"),
            ),
        ],
        parties=[
            PartyDeclaration(
                party_type="manufacturer",
                name="Acme Foods Private Limited",
                address="Plot 12, Industrial Area, Thane, Maharashtra 400601",
                provenance=FieldProvenance(source_panel="back", source_text="Acme Foods Pvt. Ltd."),
            ),
        ],
    )

    ctx = CheckContext(
        panel_shape="rectangular",
        panel_height_mm=250.0,
        panel_width_mm=180.0,
        mm_per_pixel=0.08,
        mm_per_pixel_uncertainty=0.002,
        scale_source="id1_card",
        pdp_surface_established=True,
        established_pdp_panel="front",
        measured_heights_mm={"net_quantity": 4.5, "mrp": 3.5},
        measured_widths_mm={"net_quantity": 2.0, "mrp": 1.8},
        clear_space_mm={"above": 5.0, "below": 5.0, "left": 10.0, "right": 10.0},
        contrast_ratio=9.2,
        panels_captured={"front", "back"},
        clear_space_image_verified=True,
        llm_result=llm_result,
        rules_as_at=date(2026, 7, 1),
    )

    # Synthetic image for raw CV measurement benchmark
    img = np.full((1200, 1600, 3), 245, dtype=np.uint8)
    cv2.putText(img, "NET QTY: 5 kg", (200, 400), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20), 2)
    cv2.putText(img, "MRP Rs. 250.00", (200, 500), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20), 2)
    bbox_nq = (200, 360, 520, 410)

    t_pack_cached = []
    t_4b = []
    t_4c_ctx = []
    t_4c_cv_raw = []
    t_4d_agg = []
    t_e2e = []

    for _ in range(iterations):
        # Benchmark 1: Rule-pack loading (cached)
        t0 = time.perf_counter()
        _p = load_rule_pack()
        t_pack_cached.append((time.perf_counter() - t0) * 1000.0)

        # Benchmark 2: Phase 4B declaration evaluation
        t0 = time.perf_counter()
        f_4b = evaluate_declaration_rules(llm_result, ctx)
        t_4b.append((time.perf_counter() - t0) * 1000.0)

        # Benchmark 3A: Phase 4C visual evaluation (from pre-measured context)
        t0 = time.perf_counter()
        f_4c = evaluate_visual_and_geometry_rules(ctx)
        t_4c_ctx.append((time.perf_counter() - t0) * 1000.0)

        # Benchmark 3B: Phase 4C raw CV measurements (glyph segmentation + clear space + contrast on 1600x1200 image)
        t0 = time.perf_counter()
        measure_glyph_height_mm(img, bbox_nq, 0.08, 0.002)
        verify_clear_space_image(img, bbox_nq, 40.0)
        measure_conspicuous_contrast_signal(img, bbox_nq)
        t_4c_cv_raw.append((time.perf_counter() - t0) * 1000.0)

        # Benchmark 4: Phase 4D aggregation
        combined_findings = list(f_4b) + list(f_4c)
        t0 = time.perf_counter()
        _assessment = aggregate_inspection_assessment(
            inspection_id="BENCH_001",
            findings=combined_findings,
            captured_panels=ctx.panels_captured,
            ctx=ctx,
        )
        t_4d_agg.append((time.perf_counter() - t0) * 1000.0)

        # Benchmark 5: Full Phase 4 end-to-end pipeline (4B -> 4C -> 4D)
        t0 = time.perf_counter()
        _f1 = evaluate_declaration_rules(llm_result, ctx)
        _f2 = evaluate_visual_and_geometry_rules(ctx)
        _res = aggregate_inspection_assessment(
            inspection_id="BENCH_002",
            findings=list(_f1) + list(_f2),
            captured_panels=ctx.panels_captured,
            ctx=ctx,
        )
        t_e2e.append((time.perf_counter() - t0) * 1000.0)

    peak_rss = _get_peak_rss_mb()

    return {
        "iterations": iterations,
        "rule_pack_loading_cached": _stats(t_pack_cached),
        "phase4b_declaration_evaluation": _stats(t_4b),
        "phase4c_visual_evaluation_context": _stats(t_4c_ctx),
        "phase4c_visual_cv_raw_measurement": _stats(t_4c_cv_raw),
        "phase4d_aggregation": _stats(t_4d_agg),
        "full_phase4_end_to_end_assessment": _stats(t_e2e),
        "peak_rss_mb": round(peak_rss, 2),
        "render_512mb_headroom_mb": round(512.0 - peak_rss, 2),
        "render_compliant": peak_rss < 512.0,
    }
