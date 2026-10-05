"""Backend/llm/base.py — Abstract LLM Provider, Retry Policy, & Anti-Hallucination Guard (Phase 3).

Features:
- Standardized BaseLLMProvider contract.
- Anti-hallucination validation (Section 20 & 21): rejects ungrounded extractions.
- Bounded transient retry policy (Section 26) with exponential backoff.
- Zero local ML dependencies (Render 512MB RAM requirement).
"""
from __future__ import annotations

import difflib
import logging
import re
import time
from abc import ABC, abstractmethod
from typing import Any

from llm.schema import (
    LLM_STATUS_FAILED,
    LLM_STATUS_SUCCESS,
    LLM_STATUS_UNAVAILABLE,
    STATUS_AMBIGUOUS,
    STATUS_CONFIRMED,
    STATUS_NOT_OBSERVED,
    StructuredDeclarationResult,
)

logger = logging.getLogger("niyamnetra.llm")


class BaseLLMProvider(ABC):
    """Abstract base class for LLM structured declaration extraction providers."""

    name: str = "base"
    model_name: str = "unknown"

    @abstractmethod
    def extract_declarations(
        self,
        packaged_ocr: str,
        evidence_meta: dict[str, Any] | None = None,
    ) -> StructuredDeclarationResult:
        """Call the cloud LLM to structure packaged OCR into a normalized result.

        Must NEVER raise unhandled exceptions; return a StructuredDeclarationResult with
        appropriate error status and metadata.
        """
        pass

    def _execute_with_retry(
        self,
        func,
        max_retries: int = 2,
        initial_backoff_s: float = 0.5,
    ) -> Any:
        """Bounded retry policy for transient HTTP 429, 5xx, or network timeouts (Section 26)."""
        retries = 0
        backoff = initial_backoff_s
        while True:
            try:
                return func()
            except Exception as e:
                is_transient = False
                err_str = str(e).lower()
                status_code = getattr(getattr(e, "response", None), "status_code", None)

                if status_code in (429, 500, 502, 503, 504):
                    is_transient = True
                    resp_headers = getattr(getattr(e, "response", None), "headers", {}) or {}
                    retry_after = resp_headers.get("retry-after") or resp_headers.get("Retry-After")
                    if retry_after:
                        try:
                            backoff = max(float(retry_after), backoff)
                        except (ValueError, TypeError):
                            backoff = max(backoff, 2.0)
                    elif status_code == 429:
                        backoff = max(backoff, 2.0)
                elif "timeout" in err_str or "connection" in err_str:
                    is_transient = True

                if is_transient and retries < max_retries:
                    retries += 1
                    logger.warning(
                        "[LLM Retry] Provider %s transient error: %s (attempt %d/%d). Backing off %.1fs.",
                        self.name, e, retries, max_retries, backoff,
                    )
                    time.sleep(backoff)
                    backoff *= 2.0
                    continue
                raise e

    def validate_evidence_grounding(
        self,
        result: StructuredDeclarationResult,
        packaged_ocr: str,
    ) -> StructuredDeclarationResult:
        """Strict anti-hallucination validation (Section 6, 20 & 21).

        Every confirmed non-null extracted declaration MUST be grounded in the source OCR text.
        If a field's source_text is missing or completely fabricated (not found in OCR lines),
        the field is demoted to status='not_observed', value=None.
        """
        # Build normalized tokens from all OCR lines in packaged_ocr
        ocr_lower = packaged_ocr.lower()

        def _is_grounded(source_text: str | None, value_str: str | None) -> bool:
            if not source_text and not value_str:
                return False
            # Check if source_text appears in the OCR lines
            if source_text:
                st_norm = re.sub(r"\s+", " ", source_text.strip().lower())
                if st_norm in ocr_lower:
                    return True
                # Fuzzy match for minor OCR tokenization/quote differences
                words = [w for w in re.findall(r"\w+", st_norm) if len(w) > 2]
                if words and all(w in ocr_lower for w in words):
                    return True

            # Check if value itself appears in OCR text
            if value_str:
                val_norm = str(value_str).strip().lower()
                if val_norm in ocr_lower:
                    return True

            return False

        # 1. Validate MRP
        if result.mrp.status == STATUS_CONFIRMED and result.mrp.value is not None:
            source = result.mrp.raw_text or (result.mrp.provenance.source_text if result.mrp.provenance else "")
            val_str = str(result.mrp.value)
            if not _is_grounded(source, val_str):
                logger.warning("[Anti-Hallucination] Rejected ungrounded MRP: value=%s, source='%s'", val_str, source)
                result.mrp.status = STATUS_NOT_OBSERVED
                result.mrp.value = None
                if result.mrp.provenance:
                    result.mrp.provenance.notes = "Rejected: ungrounded hallucination not found in OCR evidence"

        # 2. Validate Net Quantity
        if result.net_quantity.status == STATUS_CONFIRMED and result.net_quantity.value is not None:
            source = result.net_quantity.raw_text or (result.net_quantity.provenance.source_text if result.net_quantity.provenance else "")
            val_str = str(result.net_quantity.value)
            if not _is_grounded(source, val_str):
                logger.warning("[Anti-Hallucination] Rejected ungrounded Net Quantity: value=%s, source='%s'", val_str, source)
                result.net_quantity.status = STATUS_NOT_OBSERVED
                result.net_quantity.value = None
                result.net_quantity.unit = None
                if result.net_quantity.provenance:
                    result.net_quantity.provenance.notes = "Rejected: ungrounded hallucination not found in OCR evidence"

        # 3. Validate Parties
        for p in result.parties:
            if p.status == STATUS_CONFIRMED and p.name:
                source = p.raw_text or (p.provenance.source_text if p.provenance else "")
                if not _is_grounded(source, p.name):
                    logger.warning("[Anti-Hallucination] Rejected ungrounded party: name=%s, source='%s'", p.name, source)
                    p.status = STATUS_NOT_OBSERVED
                    p.name = None
                    p.address = None

        # 4. Validate Dates
        for d in result.dates:
            if d.status == STATUS_CONFIRMED and (d.raw_text or d.normalized_date):
                source = d.raw_text or (d.provenance.source_text if d.provenance else "")
                if not _is_grounded(source, d.normalized_date or d.raw_text):
                    logger.warning("[Anti-Hallucination] Rejected ungrounded date: date=%s, source='%s'", d.normalized_date, source)
                    d.status = STATUS_NOT_OBSERVED
                    d.normalized_date = None

        # 5. Validate Consumer Care
        cc = result.consumer_care
        if cc.status == STATUS_CONFIRMED and (cc.phone or cc.email or cc.address):
            source = cc.raw_text or (cc.provenance.source_text if cc.provenance else "")
            test_val = cc.phone or cc.email or cc.address or ""
            if not _is_grounded(source, test_val):
                logger.warning("[Anti-Hallucination] Rejected ungrounded consumer care: val=%s, source='%s'", test_val, source)
                cc.status = STATUS_NOT_OBSERVED
                cc.phone = None
                cc.email = None

        # 6. Validate Common Fields (commodity, country, batch)
        for cf_name, cf in [
            ("commodity_name", result.commodity_name),
            ("country_of_origin", result.country_of_origin),
            ("batch_number", result.batch_number),
            ("unit_sale_price", result.unit_sale_price),
            ("dimensions", result.dimensions),
        ]:
            if cf.status == STATUS_CONFIRMED and cf.value:
                source = cf.raw_text or (cf.provenance.source_text if cf.provenance else "")
                if not _is_grounded(source, cf.value):
                    logger.warning("[Anti-Hallucination] Rejected ungrounded %s: val=%s, source='%s'", cf_name, cf.value, source)
                    cf.status = STATUS_NOT_OBSERVED
                    cf.value = None

        return result
