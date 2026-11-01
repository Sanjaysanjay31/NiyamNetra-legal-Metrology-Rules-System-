"""Backend/ocr/fallback.py — Resilient runtime OCR fallback chain provider.

Features:
- Dynamically iterates over configured, supported OCR providers.
- Primary OCR.space -> Secondary Azure AI Vision fallback.
- Bounded retries and deliberate handling of rate limits and transient errors.
- Automatically falls back on HTTP 403 (billing/auth), 401, 429, 5xx, timeouts,
  network errors, and STATUS_NO_TEXT.
- Skips unconfigured providers safely without attempting API calls.
- Returns real extracted text, provider identity, duration, and status from
  the succeeding fallback provider.
- If all providers fail, returns an explicit structured failure (never masks
  as a silent success or no-text).
- If no providers are configured, returns explicit configuration_error.
- Collects a safe diagnostic trace with zero credential leakage.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Sequence

from ocr.base import (
    BaseOCRProvider,
    OcrResult,
    STATUS_AUTH_ERROR,
    STATUS_BILLING_ERROR,
    STATUS_CONFIGURATION_ERROR,
    STATUS_INVALID_RESPONSE,
    STATUS_NETWORK_ERROR,
    STATUS_NO_TEXT,
    STATUS_PROVIDER_ERROR,
    STATUS_RATE_LIMITED,
    STATUS_SKIPPED,
    STATUS_SUCCESS,
    STATUS_TIMEOUT,
    STATUS_UNAVAILABLE,
)
from ocr.security import sanitize_sensitive_text

logger = logging.getLogger("niyamnetra.ocr.fallback")

# Statuses that trigger runtime fallback to next configured provider
FALLBACK_TRIGGER_STATUSES = {
    STATUS_AUTH_ERROR,        # HTTP 401, 403, billing disabled
    STATUS_BILLING_ERROR,     # Explicit billing / quota exhaustion
    STATUS_TIMEOUT,           # Network / HTTP timeout
    STATUS_RATE_LIMITED,      # HTTP 429
    STATUS_PROVIDER_ERROR,    # HTTP 5xx, connection drop, server crash
    STATUS_INVALID_RESPONSE,  # Corrupted or unexpected API response
    STATUS_UNAVAILABLE,       # Provider unreachable or unconfigured
    STATUS_NETWORK_ERROR,     # Connection dropped / DNS resolution failure
    STATUS_CONFIGURATION_ERROR, # Missing credentials or invalid config
}


def _status_to_category(status: str, failure_reason: str | None = None) -> str:
    categories = {
        STATUS_SUCCESS: "success",
        STATUS_AUTH_ERROR: "authentication_error",
        STATUS_BILLING_ERROR: "billing_error",
        STATUS_TIMEOUT: "timeout",
        STATUS_RATE_LIMITED: "rate_limited",
        STATUS_PROVIDER_ERROR: "provider_error",
        STATUS_INVALID_RESPONSE: "invalid_response",
        STATUS_NO_TEXT: "no_text",
        STATUS_UNAVAILABLE: "unavailable",
        STATUS_SKIPPED: "skipped_unconfigured",
        STATUS_CONFIGURATION_ERROR: "configuration_error",
        STATUS_NETWORK_ERROR: "network_error",
    }
    if status in categories:
        return categories[status]
    if failure_reason:
        r_lower = failure_reason.lower()
        if any(w in r_lower for w in ("apikey", "api key", "unauthorized", "invalid key", "auth")):
            return "authentication_error"
        if any(w in r_lower for w in ("billing", "billable", "quota", "credit")):
            return "billing_error"
        if any(w in r_lower for w in ("network", "connection", "connect")):
            return "network_error"
        if "timeout" in r_lower:
            return "timeout"
    return "unknown"


class FallbackOCRProvider(BaseOCRProvider):
    """Orchestrates an ordered fallback chain across configured Cloud OCR providers."""

    name: str = "auto"

    def __init__(
        self,
        candidates: Sequence[BaseOCRProvider] | None = None,
        provider_order: str | None = None,
    ):
        self._explicit_candidates = list(candidates) if candidates is not None else None
        self._provider_order = provider_order

    def get_candidates(self) -> list[BaseOCRProvider]:
        if self._explicit_candidates is not None:
            return self._explicit_candidates
        from ocr.factory import get_candidate_providers
        return get_candidate_providers(self._provider_order)

    def is_configured(self) -> bool:
        return any(c.is_configured() for c in self.get_candidates())

    def recognize(
        self,
        image_bytes: bytes,
        image_width: int | None = None,
        image_height: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> OcrResult:
        t0_total = time.perf_counter()
        candidates = self.get_candidates()
        attempts: list[dict[str, Any]] = []

        if not candidates:
            return OcrResult(
                engine="none",
                provider="none",
                status=STATUS_CONFIGURATION_ERROR,
                failure_reason="No OCR providers configured or available in candidate chain.",
                duration_ms=round((time.perf_counter() - t0_total) * 1000, 2),
                attempts=attempts,
            )

        last_no_text_result: OcrResult | None = None

        for candidate in candidates:
            # 1. Skip if unconfigured or unsupported
            if not candidate.is_configured():
                attempts.append({
                    "provider": candidate.name,
                    "status": STATUS_SKIPPED,
                    "category": "skipped_unconfigured",
                    "duration_ms": 0.0,
                    "failure_reason": f"Provider '{candidate.name}' skipped: required credentials not configured.",
                })
                logger.info("[OCR] Provider '%s' skipped: credentials not configured.", candidate.name)
                continue

            # 2. Attempt recognition
            t0_cand = time.perf_counter()
            try:
                result = candidate.recognize(
                    image_bytes=image_bytes,
                    image_width=image_width,
                    image_height=image_height,
                    options=options,
                )
            except Exception as exc:
                cand_dur = round((time.perf_counter() - t0_cand) * 1000, 2)
                safe_exc = sanitize_sensitive_text(str(exc))
                result = OcrResult(
                    engine=candidate.name,
                    provider=candidate.name,
                    status=STATUS_PROVIDER_ERROR,
                    failure_reason=f"Provider '{candidate.name}' unhandled exception: {type(exc).__name__}: {safe_exc}",
                    duration_ms=cand_dur,
                )

            # Ensure failure_reason is sanitized
            if result.failure_reason:
                result.failure_reason = sanitize_sensitive_text(result.failure_reason)

            cand_cat = _status_to_category(result.status, result.failure_reason)
            attempt_entry = {
                "provider": candidate.name,
                "status": result.status,
                "category": cand_cat,
                "duration_ms": result.duration_ms,
                "failure_reason": result.failure_reason,
            }
            attempts.append(attempt_entry)

            # 3. Success check — Return immediately without calling subsequent providers
            if result.status == STATUS_SUCCESS:
                try:
                    from ocr.diagnostics import record_provider_success
                    record_provider_success(candidate.name, result.duration_ms, len(result.lines))
                except Exception:
                    pass
                result.attempts = attempts
                result.duration_ms = round((time.perf_counter() - t0_total) * 1000, 2)
                logger.info(
                    "[OCR] Fallback chain succeeded with provider '%s' (line_count=%d, duration=%.2fms, total_attempts=%d)",
                    candidate.name,
                    len(result.lines),
                    result.duration_ms,
                    len(attempts),
                )
                return result

            # 4. Valid no-text check — Attempt Azure fallback if configured (Case 2)
            if result.status == STATUS_NO_TEXT:
                try:
                    from ocr.diagnostics import record_provider_success
                    record_provider_success(candidate.name, result.duration_ms, 0)
                except Exception:
                    pass
                last_no_text_result = result
                logger.info(
                    "[OCR] Provider '%s' completed with NO_TEXT (duration=%.2fms). Attempting fallback if next provider configured...",
                    candidate.name,
                    result.duration_ms,
                )
                continue

            # Record failure in telemetry
            try:
                from ocr.diagnostics import record_provider_failure, record_provider_fallback
                record_provider_failure(candidate.name, result.status, cand_cat, result.failure_reason, result.duration_ms)
                record_provider_fallback(candidate.name, "fallback_candidate", result.duration_ms)
            except Exception:
                pass

            # 5. Runtime failure eligible for fallback (Case 3 & Case 4)
            if result.status in FALLBACK_TRIGGER_STATUSES:
                logger.warning(
                    "[OCR] Provider '%s' failed (status=%s, reason=%s). Falling back to next candidate...",
                    candidate.name,
                    result.status,
                    result.failure_reason,
                )
                continue

            # Any other status: fallback
            continue

        # All providers exhausted without success
        total_dur = round((time.perf_counter() - t0_total) * 1000, 2)
        invoked_attempts = [a for a in attempts if a["category"] != "skipped_unconfigured"]

        # Case 7: No providers were configured
        if not invoked_attempts:
            overall_status = STATUS_CONFIGURATION_ERROR
            failure_summary = "All OCR providers skipped: no configured credentials found."
            return OcrResult(
                lines=[],
                engine="none",
                provider="none",
                status=overall_status,
                failure_reason=failure_summary,
                duration_ms=total_dur,
                attempts=attempts,
            )

        # Case 5: At least one provider returned valid NO_TEXT and no subsequent provider succeeded
        if last_no_text_result is not None:
            last_no_text_result.attempts = attempts
            last_no_text_result.duration_ms = total_dur
            return last_no_text_result

        # Case 6: All configured providers failed technically
        summary_parts = [
            f"{a['provider']} ({a['status']}: {a.get('failure_reason') or 'failed'})"
            for a in invoked_attempts
        ]
        failure_summary = f"All OCR providers failed: {'; '.join(summary_parts)}"
        if any(a["status"] == STATUS_AUTH_ERROR for a in invoked_attempts):
            overall_status = STATUS_AUTH_ERROR
        elif any(a["status"] == STATUS_BILLING_ERROR for a in invoked_attempts):
            overall_status = STATUS_BILLING_ERROR
        elif any(a["status"] == STATUS_TIMEOUT for a in invoked_attempts):
            overall_status = STATUS_TIMEOUT
        elif any(a["status"] == STATUS_RATE_LIMITED for a in invoked_attempts):
            overall_status = STATUS_RATE_LIMITED
        elif any(a["status"] == STATUS_NETWORK_ERROR for a in invoked_attempts):
            overall_status = STATUS_NETWORK_ERROR
        else:
            overall_status = STATUS_PROVIDER_ERROR

        try:
            from ocr.diagnostics import record_provider_failure
            record_provider_failure("chain", overall_status, "all_failed", failure_summary, total_dur)
        except Exception:
            pass

        logger.error("[OCR] %s (duration=%.2fms)", failure_summary, total_dur)
        return OcrResult(
            lines=[],
            engine="none",
            provider="none",
            status=overall_status,
            failure_reason=failure_summary,
            duration_ms=total_dur,
            attempts=attempts,
        )
