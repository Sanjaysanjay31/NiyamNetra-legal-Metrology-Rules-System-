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
RULE_PACK_2026_07_FILE = RULE_PACKS_DIR / "lmpc_2026_v1.json"
RULE_PACK_2026_09_FILE = RULE_PACKS_DIR / "lmpc_2026_09_v1.json"
DEFAULT_RULE_PACK_FILE = RULE_PACK_2026_07_FILE
CURRENT_RULE_PACK_FILE = RULE_PACK_2026_09_FILE
FOURTH_AMENDMENT_EFFECTIVE_DATE = date(2026, 9, 21)


@cached(TTLCache(maxsize=16, ttl=300))
def load_rule_pack(
    rule_pack_path: str | Path | None = None,
    enforce_strict_validation: bool = True,
    as_at: date | str | None = None,
) -> RulePack:
    """Load and validate an authoritative versioned Legal Rule Pack (Section 3).

    TTLCache avoids re-reading disk on every scan while allowing updates
    without restarting the process.
    Supports resolution by:
    - explicit file path or filename
    - named version string ("2026.07.v1", "2026.09.v1", "latest", "current")
    - inspection effective date (as_at >= 2026-09-21 -> 2026.09.v1; as_at < 2026-09-21 -> 2026.07.v1)
    - default fallback to 2026.07.v1 maintaining backward compatibility with existing tests
    """
    path: Path
    if rule_pack_path:
        str_p = str(rule_pack_path).strip()
        if str_p in ("2026.07.v1", "2026_07", "2026.07"):
            path = RULE_PACK_2026_07_FILE
        elif str_p in ("2026.09.v1", "2026_09", "2026.09", "current", "latest"):
            path = RULE_PACK_2026_09_FILE
        elif (RULE_PACKS_DIR / str_p).exists():
            path = RULE_PACKS_DIR / str_p
        elif (RULE_PACKS_DIR / f"{str_p}.json").exists():
            path = RULE_PACKS_DIR / f"{str_p}.json"
        else:
            path = Path(rule_pack_path)
    elif as_at is not None:
        as_at_d = date.fromisoformat(as_at) if isinstance(as_at, str) else as_at
        if as_at_d >= FOURTH_AMENDMENT_EFFECTIVE_DATE:
            path = RULE_PACK_2026_09_FILE
        else:
            path = RULE_PACK_2026_07_FILE
    else:
        path = DEFAULT_RULE_PACK_FILE

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


def generate_rule_pack_report(
    rule_pack: RulePack | None = None,
    as_at: date | str | None = None,
) -> dict[str, Any]:
    """Generate developer-facing Rule Pack Validation Report (Section 26 & GSR 826(E) sync).

    Includes:
    - current active rule-pack version
    - previous pack version
    - Fourth Amendment notification date & effective date
    - number of enabled rules
    - number of category-specific rules
    - number of e-commerce rules
    - number of measurement rules
    - number of placement rules
    - new or changed rules count
    - removed or expired rules count
    - rules requiring manual interpretation
    - rules with visual evidence requirements
    - source references
    - unsupported/partial rules
    - effective-date ranges
    - latest effective amendment
    """
    pack = rule_pack or load_rule_pack(as_at=as_at)

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
        or r.evaluation_method.method in ("placement_pdp", "clear_space_check", "origin_marking_check")
    ]
    visual_evidence_rules = [
        r.rule_id for r in enabled_rules
        if "visual_symbol" in r.required_evidence
        or "calibration_scale" in r.required_evidence
        or "geometry_pdp" in r.required_evidence
    ]
    manual_interpretation_rules = [
        r.rule_id for r in enabled_rules
        if r.severity == "advisory"
        or (r.evaluation_method.parameters and r.evaluation_method.parameters.get("manual_review_on_missing") is True)
        or r.rule_id in ("RULE_LMPC_23_ORIGIN_MARKING_COSMETICS", "RULE_LMPC_17_FSSAI_ADVISORY_ALIGNMENT")
    ]

    sources = sorted({f"{r.source_document} ({r.source_rule})" for r in enabled_rules})

    partial_rules = [
        r.rule_id for r in enabled_rules
        if r.evaluation_method.method in ("schedule_lookup", "table_lookup_height")
    ]

    dates = [r.effective_from_date for r in enabled_rules]
    earliest_date = min(dates).isoformat() if dates else "unknown"
    latest_date = max(dates).isoformat() if dates else "unknown"

    # Identify version differentials relative to Fourth Amendment baseline
    if pack.rule_pack_version == "2026.09.v1":
        prev_version = "2026.07.v1"
        fourth_amendment_date = "2026-09-21"
        latest_effective_amendment = "2026-09-21"
        new_or_changed_rules = ["RULE_LMPC_23_ORIGIN_MARKING_COSMETICS"]
        removed_or_expired_rules = ["RULE_LMPC_6_8_ORIGIN_MARKING_HISTORICAL"]
    else:
        prev_version = None
        fourth_amendment_date = "2026-09-21"
        latest_effective_amendment = "2026-07-01"
        new_or_changed_rules = []
        removed_or_expired_rules = []

    return {
        "active_rule_pack_version": pack.rule_pack_version,
        "previous_rule_pack_version": prev_version,
        "fourth_amendment_date": fourth_amendment_date,
        "latest_effective_amendment": latest_effective_amendment,
        "title": pack.title,
        "authority": pack.authority,
        "rules_as_at": pack.rules_as_at,
        "total_rules": len(pack.rules),
        "enabled_rules_count": len(enabled_rules),
        "category_specific_rules_count": len(category_specific),
        "ecommerce_rules_count": len(ecommerce_rules),
        "measurement_rules_count": len(measurement_rules),
        "placement_rules_count": len(placement_rules),
        "new_or_changed_rules_count": len(new_or_changed_rules),
        "new_or_changed_rules": new_or_changed_rules,
        "removed_or_expired_rules_count": len(removed_or_expired_rules),
        "removed_or_expired_rules": removed_or_expired_rules,
        "rules_requiring_manual_interpretation": manual_interpretation_rules,
        "rules_with_visual_evidence_requirements": visual_evidence_rules,
        "effective_date_range": {
            "earliest": earliest_date,
            "latest": latest_date,
        },
        "source_references": sources,
        "partial_or_schedule_dependent_rules": partial_rules,
    }
