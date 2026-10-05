"""Backend/rules/schema.py — Versioned Legal Rule Pack Data Models (Phase 4A).

Follows Core Principles (Sections 3, 4, 24):
- Explicit legal source metadata for every rule (no anonymous rules).
- Effective-date awareness (effective_from, effective_to, amendment references).
- Declarative applicability specifications (physical package vs e-commerce listing,
  import status, perishable status, commodity categories, weight/volume limits).
- Declarative evaluation specifications.
- Strict validation: fails fast if any enabled rule lacks mandatory legal sources.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Literal

Severity = Literal["critical", "major", "minor", "advisory"]
Verdict = Literal["pass", "fail", "not_assessed"]
StatutoryLimb = Literal["36(1)", "36(2)", "both"]


@dataclass(slots=True)
class ApplicabilitySpec:
    """Defines the legal conditions under which a rule applies to an inspection."""
    inspection_sources: list[str] = field(default_factory=lambda: ["physical_package"])  # physical_package | ecommerce_listing
    target_commodities: list[str] = field(default_factory=lambda: ["all"])
    excluded_commodities: list[str] = field(default_factory=list)
    transaction_types: list[str] = field(default_factory=lambda: ["retail"])
    is_imported: bool | None = None          # True: imported only; False: domestic only; None: all
    is_perishable: bool | None = None        # True: perishable only; None: all
    is_medical_device: bool | None = None    # True: medical devices only; None: all
    has_sticker: bool | None = None          # True: sticker cases only; None: all
    max_weight_kg: float | None = None       # e.g., 25.0 kg under Rule 3
    max_volume_l: float | None = None        # e.g., 25.0 L under Rule 3
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ApplicabilitySpec:
        if not data:
            return cls()
        return cls(
            inspection_sources=data.get("inspection_sources", ["physical_package"]),
            target_commodities=data.get("target_commodities", ["all"]),
            excluded_commodities=data.get("excluded_commodities", []),
            transaction_types=data.get("transaction_types", ["retail"]),
            is_imported=data.get("is_imported"),
            is_perishable=data.get("is_perishable"),
            is_medical_device=data.get("is_medical_device"),
            has_sticker=data.get("has_sticker"),
            max_weight_kg=data.get("max_weight_kg"),
            max_volume_l=data.get("max_volume_l"),
            notes=data.get("notes"),
        )


@dataclass(slots=True)
class EvaluationSpec:
    """Defines how evidence is deterministically compared against the legal requirement."""
    method: str  # presence | format_unit | forbidden_words | threshold_comparison | date_format | placement_pdp | contrast_ratio | platform_feature | composite_derived
    parameters: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EvaluationSpec:
        if not data:
            return cls(method="presence")
        return cls(
            method=data.get("method", "presence"),
            parameters=data.get("parameters", {}),
        )


@dataclass(slots=True)
class LegalRuleDefinition:
    """Authoritative legal rule definition carrying complete statutory provenance."""
    rule_id: str                      # Unique identifier, e.g. RULE_LMPC_01_MANDATORY_DECLARATIONS
    code: str                         # Legacy / short check code, e.g. CHK01
    rule_pack_version: str            # e.g. 2026.07.v1
    title: str
    source_document: str              # e.g. Legal Metrology (Packaged Commodities) Rules, 2011
    source_rule: str                  # e.g. Rule 6(1)
    effective_from: str               # ISO date YYYY-MM-DD
    severity: Severity                # critical | major | minor | advisory
    applicability: ApplicabilitySpec
    required_evidence: list[str]      # e.g. ["ocr_evidence"]
    required_fields: list[str]        # e.g. ["mrp", "net_quantity"]
    evaluation_method: EvaluationSpec
    remediation: str                  # Actionable guidance on non-compliance
    enabled: bool = True
    amendment_reference: str | None = None
    effective_to: str | None = None   # None if currently in force
    statutory_limb: StatutoryLimb | None = None  # "36(1)" | "36(2)" | "both"
    ledger_ref: str | None = None     # Internal audit ledger ref, e.g. L-01

    @property
    def effective_from_date(self) -> date:
        return date.fromisoformat(self.effective_from)

    @property
    def effective_to_date(self) -> date | None:
        return date.fromisoformat(self.effective_to) if self.effective_to else None

    def is_effective_on(self, as_at: date) -> bool:
        """Verify whether rule is active and legally in force on the inspection date."""
        if not self.enabled:
            return False
        if as_at < self.effective_from_date:
            return False
        if self.effective_to_date and as_at > self.effective_to_date:
            return False
        return True

    def validate_metadata(self) -> list[str]:
        """Strict Section 24 validation: ensure no anonymous or legally incomplete rules exist."""
        errors: list[str] = []
        if not self.rule_id:
            errors.append("rule_id must not be empty")
        if not self.source_document or not self.source_document.strip():
            errors.append(f"{self.rule_id}: source_document is mandatory")
        if not self.source_rule or not self.source_rule.strip():
            errors.append(f"{self.rule_id}: source_rule is mandatory")
        if not self.effective_from:
            errors.append(f"{self.rule_id}: effective_from date is mandatory")
        else:
            try:
                date.fromisoformat(self.effective_from)
            except ValueError:
                errors.append(f"{self.rule_id}: effective_from '{self.effective_from}' must be ISO YYYY-MM-DD")
        if self.effective_to:
            try:
                date.fromisoformat(self.effective_to)
            except ValueError:
                errors.append(f"{self.rule_id}: effective_to '{self.effective_to}' must be ISO YYYY-MM-DD")
        if not self.rule_pack_version:
            errors.append(f"{self.rule_id}: rule_pack_version is mandatory")
        if not self.evaluation_method or not self.evaluation_method.method:
            errors.append(f"{self.rule_id}: evaluation_method.method is mandatory")
        if not self.remediation:
            errors.append(f"{self.rule_id}: remediation is mandatory")
        return errors

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> LegalRuleDefinition:
        app_data = data.get("applicability") or {}
        eval_data = data.get("evaluation_method") or {}
        return cls(
            rule_id=data["rule_id"],
            code=data.get("code", data["rule_id"]),
            rule_pack_version=data["rule_pack_version"],
            title=data["title"],
            source_document=data["source_document"],
            source_rule=data["source_rule"],
            effective_from=data["effective_from"],
            severity=data.get("severity", "major"),
            applicability=ApplicabilitySpec.from_dict(app_data) if isinstance(app_data, dict) else app_data,
            required_evidence=data.get("required_evidence", []),
            required_fields=data.get("required_fields", []),
            evaluation_method=EvaluationSpec.from_dict(eval_data) if isinstance(eval_data, dict) else eval_data,
            remediation=data.get("remediation", ""),
            enabled=data.get("enabled", True),
            amendment_reference=data.get("amendment_reference"),
            effective_to=data.get("effective_to"),
            statutory_limb=data.get("statutory_limb"),
            ledger_ref=data.get("ledger_ref"),
        )


@dataclass(slots=True)
class RulePack:
    """Complete collection of versioned legal rules under an authoritative gazette baseline."""
    rule_pack_version: str
    title: str
    description: str
    authority: str
    rules_as_at: str
    rules: list[LegalRuleDefinition] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def get_rule_by_id(self, rule_id: str) -> LegalRuleDefinition | None:
        for r in self.rules:
            if r.rule_id == rule_id or r.code == rule_id:
                return r
        return None

    def get_effective_rules(self, as_at: date) -> list[LegalRuleDefinition]:
        return [r for r in self.rules if r.is_effective_on(as_at)]

    def validate(self) -> list[str]:
        """Validate every rule in the rule pack and enforce uniqueness."""
        all_errors: list[str] = []
        seen_ids: set[str] = set()
        seen_codes: set[str] = set()

        for rule in self.rules:
            if rule.rule_id in seen_ids:
                all_errors.append(f"Duplicate rule_id detected: {rule.rule_id}")
            seen_ids.add(rule.rule_id)

            if rule.code in seen_codes:
                all_errors.append(f"Duplicate check code detected: {rule.code}")
            seen_codes.add(rule.code)

            all_errors.extend(rule.validate_metadata())

        return all_errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_pack_version": self.rule_pack_version,
            "title": self.title,
            "description": self.description,
            "authority": self.authority,
            "rules_as_at": self.rules_as_at,
            "metadata": self.metadata,
            "rules": [r.to_dict() for r in self.rules],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RulePack:
        rules = [LegalRuleDefinition.from_dict(r) for r in data.get("rules", [])]
        return cls(
            rule_pack_version=data.get("rule_pack_version", "unknown"),
            title=data.get("title", ""),
            description=data.get("description", ""),
            authority=data.get("authority", "Department of Consumer Affairs"),
            rules_as_at=data.get("rules_as_at", "2026-07-01"),
            metadata=data.get("metadata", {}),
            rules=rules,
        )
