"""Backend/rules/loader.py — Versioned Rule Pack Loader & Report Generator (Phase 4A).

Follows Core Principles (Sections 3, 4, 24, 26):
- Loads versioned rule pack JSON files deterministically.
- Validates every production rule carries complete statutory provenance (Section 24).
- Provides developer-facing Rule Pack Validation Report (Section 26).
- Zero local ML dependencies.
"""
from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

from cachetools import TTLCache, cached

from rules.schema import LegalRuleDefinition, RulePack

logger = logging.getLogger("niyamnetra.rules")

RULE_PACKS_DIR = Path(__file__).resolve().parent / "rule_packs"
DEFAULT_RULE_PACK_FILE = RULE_PACKS_DIR / "lmpc_2026_v1.json"


@cached(TTLCache(maxsize=16, ttl=300))
def load_rule_pack(
    rule_pack_path: str | Path | None = None,
    enforce_strict_validation: bool = True,
) -> RulePack:
    """Load and validate an authoritative versioned Legal Rule Pack (Section 3).

    TTLCache avoids re-reading disk on every scan while allowing updates
    without restarting the process.
    """
    path = Path(rule_pack_path) if rule_pack_path else DEFAULT_RULE_PACK_FILE
    if not path.exists():
        raise FileNotFoundError(f"Rule pack file not found at: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    pack = RulePack.from_dict(data)

    if enforce_strict_validation:
        errors = pack.validate()
        if errors:
            err_msg = (
                f"Rule pack '{pack.rule_pack_version}' failed statutory validation "
                f"({len(errors)} error(s)):\n - " + "\n - ".join(errors)
            )
            logger.error(err_msg)
            raise ValueError(err_msg)

    logger.info(
        "[Rule Pack] Successfully loaded rule pack '%s' (%s) with %d rules.",
        pack.rule_pack_version, pack.title, len(pack.rules),
    )
    return pack


def generate_rule_pack_report(rule_pack: RulePack | None = None) -> dict[str, Any]:
    """Generate developer-facing Rule Pack Validation Report (Section 26).

    Includes:
    - current active rule-pack version
    - number of enabled rules
    - number of category-specific rules
    - number of e-commerce rules
    - number of measurement rules
    - number of placement rules
    - source references
    - unsupported/partial rules
    - effective-date ranges
    """
    pack = rule_pack or load_rule_pack()

    enabled_rules = [r for r in pack.rules if r.enabled]
    category_specific = [
        r for r in enabled_rules
        if r.applicability.is_imported is not None
        or r.applicability.is_perishable is not None
        or r.applicability.is_medical_device is not None
        or r.applicability.target_commodities != ["all"]
    ]
    ecommerce_rules = [
        r for r in enabled_rules
        if "ecommerce_listing" in r.applicability.inspection_sources
    ]
    measurement_rules = [
        r for r in enabled_rules
        if "calibration_scale" in r.required_evidence
        or r.evaluation_method.method in ("table_lookup_height", "clear_space_check")
    ]
    placement_rules = [
        r for r in enabled_rules
        if "geometry_pdp" in r.required_evidence
        or r.evaluation_method.method in ("placement_pdp", "clear_space_check")
    ]

    sources = sorted({f"{r.source_document} ({r.source_rule})" for r in enabled_rules})

    # Unsupported / partial rules: rules where external schedule is missing or requires calibrated gauge
    partial_rules = [
        r.rule_id for r in enabled_rules
        if r.evaluation_method.method in ("schedule_lookup", "table_lookup_height")
    ]

    dates = [r.effective_from_date for r in enabled_rules]
    earliest_date = min(dates).isoformat() if dates else "unknown"
    latest_date = max(dates).isoformat() if dates else "unknown"

    return {
        "active_rule_pack_version": pack.rule_pack_version,
        "title": pack.title,
        "authority": pack.authority,
        "rules_as_at": pack.rules_as_at,
        "total_rules": len(pack.rules),
        "enabled_rules_count": len(enabled_rules),
        "category_specific_rules_count": len(category_specific),
        "ecommerce_rules_count": len(ecommerce_rules),
        "measurement_rules_count": len(measurement_rules),
        "placement_rules_count": len(placement_rules),
        "effective_date_range": {
            "earliest": earliest_date,
            "latest": latest_date,
        },
        "source_references": sources,
        "partial_or_schedule_dependent_rules": partial_rules,
    }
