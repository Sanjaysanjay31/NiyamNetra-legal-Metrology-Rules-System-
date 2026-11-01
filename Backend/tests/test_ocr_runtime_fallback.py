"""Backend/tests/test_ocr_runtime_fallback.py — Tests for Module 1: Runtime OCR provider fallback.

Verifies:
1. Primary OCR.space returns 403; Azure Vision succeeds.
2. Primary provider times out; a configured fallback succeeds.
3. All providers fail and a structured failure is returned.
4. A missing fallback credential causes a safe skip (unconfigured provider is never called).
5. No secret appears in logs, diagnostic traces, or serialized errors.
6. Failed provider results are not cached as successful extractions.
7. Candidate ordering and explicit provider configuration are respected.
"""
from __future__ import annotations

import logging
from unittest.mock import MagicMock, patch

import pytest

from config import settings
from ocr.base import (
    BaseOCRProvider,
    OcrLine,
    OcrResult,
    OcrWord,
    STATUS_AUTH_ERROR,
    STATUS_PROVIDER_ERROR,
    STATUS_SKIPPED,
    STATUS_SUCCESS,
    STATUS_TIMEOUT,
    STATUS_UNAVAILABLE,
)
from ocr.fallback import FallbackOCRProvider
from ocr.factory import get_candidate_providers, get_ocr_provider
from ocr.ocr_space import OCRSpaceProvider
from ocr.azure_vision import AzureVisionProvider
from ocr.security import sanitize_sensitive_text
from ocr_engine import run_ocr
from routers.scans import _lines_to_cache


class ControlledMockProvider(BaseOCRProvider):
    """Test double implementing BaseOCRProvider with controlled responses."""

    def __init__(
        self,
        name: str,
        configured: bool = True,
        result: OcrResult | None = None,
        exc: Exception | None = None,
    ):
        self.name = name
        self._configured = configured
        self._result = result
        self._exc = exc
        self.call_count = 0

    def is_configured(self) -> bool:
        return self._configured

    def recognize(self, image_bytes, image_width=None, image_height=None, options=None):
        self.call_count += 1
        if self._exc:
            raise self._exc
        if self._result is not None:
            return self._result
        return OcrResult(engine=self.name, provider=self.name, status=STATUS_SUCCESS)


# ---------------------------------------------------------------------------
# 1. Primary OCR.space returns 403; Azure Vision succeeds
# ---------------------------------------------------------------------------
def test_ocr_space_403_fallback_azure_succeeds():
    p_ocrspace = ControlledMockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(
            engine="ocr_space",
            provider="ocr_space",
            status=STATUS_AUTH_ERROR,
            failure_reason="OCR.space HTTP 403: Forbidden.",
            duration_ms=120.0,
        ),
    )
    p_azure = ControlledMockProvider(
        name="azure",
        configured=True,
        result=OcrResult(
            lines=[
                OcrLine(text="PARLE-G BISCUITS", confidence=None, box=[[0.0, 0.0], [10.0, 0.0], [10.0, 5.0], [0.0, 5.0]]),
                OcrLine(text="MRP Rs 10.00", confidence=None, box=[[0.0, 10.0], [10.0, 10.0], [10.0, 15.0], [0.0, 15.0]]),
            ],
            engine="azure",
            provider="azure",
            status=STATUS_SUCCESS,
            duration_ms=350.0,
        ),
    )

    fallback = FallbackOCRProvider(candidates=[p_ocrspace, p_azure])
    res = fallback.recognize(b"fake_jpeg_bytes")

    assert res.status == STATUS_SUCCESS
    assert res.engine == "azure"
    assert res.provider == "azure"
    assert len(res.lines) == 2
    assert "PARLE-G BISCUITS" in res.full_text
    assert p_ocrspace.call_count == 1
    assert p_azure.call_count == 1

    # Diagnostic trace verification
    assert len(res.attempts) == 2
    assert res.attempts[0]["provider"] == "ocr_space"
    assert res.attempts[0]["status"] == STATUS_AUTH_ERROR
    assert res.attempts[0]["category"] == "authentication_error"
    assert res.attempts[1]["provider"] == "azure"
    assert res.attempts[1]["status"] == STATUS_SUCCESS
    assert res.attempts[1]["category"] == "success"


# ---------------------------------------------------------------------------
# 2. Primary provider times out; a configured fallback succeeds
# ---------------------------------------------------------------------------
def test_primary_timeout_fallback_succeeds():
    p_primary = ControlledMockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(
            engine="ocr_space",
            provider="ocr_space",
            status=STATUS_TIMEOUT,
            failure_reason="OCR.space request timed out after 12.0s.",
            duration_ms=12000.0,
        ),
    )
    p_fallback = ControlledMockProvider(
        name="azure",
        configured=True,
        result=OcrResult(
            lines=[OcrLine(text="NET QTY 500g", confidence=0.95)],
            engine="azure",
            provider="azure",
            status=STATUS_SUCCESS,
            duration_ms=400.0,
        ),
    )

    fallback = FallbackOCRProvider(candidates=[p_primary, p_fallback])
    res = fallback.recognize(b"fake_jpeg_bytes")

    assert res.status == STATUS_SUCCESS
    assert res.engine == "azure"
    assert len(res.lines) == 1
    assert "NET QTY 500g" in res.full_text
    assert len(res.attempts) == 2
    assert res.attempts[0]["status"] == STATUS_TIMEOUT
    assert res.attempts[1]["status"] == STATUS_SUCCESS


# ---------------------------------------------------------------------------
# 3. All providers fail and a structured failure is returned
# ---------------------------------------------------------------------------
def test_all_providers_fail_structured_failure():
    p1 = ControlledMockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(
            engine="ocr_space",
            provider="ocr_space",
            status=STATUS_AUTH_ERROR,
            failure_reason="OCR.space HTTP 403: Forbidden",
            duration_ms=100.0,
        ),
    )
    p2 = ControlledMockProvider(
        name="azure",
        configured=True,
        result=OcrResult(
            engine="azure",
            provider="azure",
            status=STATUS_PROVIDER_ERROR,
            failure_reason="Azure Vision HTTP 503: Service Unavailable",
            duration_ms=50.0,
        ),
    )

    fallback = FallbackOCRProvider(candidates=[p1, p2])
    res = fallback.recognize(b"fake_jpeg_bytes")

    assert res.status in (STATUS_AUTH_ERROR, STATUS_PROVIDER_ERROR)
    assert res.engine == "none"
    assert res.provider == "none"
    assert len(res.lines) == 0
    assert "All OCR providers failed" in res.failure_reason
    assert "ocr_space" in res.failure_reason
    assert "azure" in res.failure_reason
    assert len(res.attempts) == 2


# ---------------------------------------------------------------------------
# 4. A missing fallback credential causes a safe skip
# ---------------------------------------------------------------------------
def test_missing_credential_safe_skip():
    p_primary = ControlledMockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(
            engine="ocr_space",
            provider="ocr_space",
            status=STATUS_AUTH_ERROR,
            failure_reason="OCR.space HTTP 401",
        ),
    )
    p_unconfigured = ControlledMockProvider(
        name="azure",
        configured=False,  # Credentials missing
    )

    fallback = FallbackOCRProvider(candidates=[p_primary, p_unconfigured])
    res = fallback.recognize(b"fake_jpeg_bytes")

    assert p_primary.call_count == 1
    assert p_unconfigured.call_count == 0  # CRITICAL: Skipped without calling recognize
    assert len(res.attempts) == 2
    assert res.attempts[1]["provider"] == "azure"
    assert res.attempts[1]["status"] == STATUS_SKIPPED
    assert res.attempts[1]["category"] == "skipped_unconfigured"


# ---------------------------------------------------------------------------
# 5. No secret appears in logs or serialized errors
# ---------------------------------------------------------------------------
def test_no_secrets_in_diagnostics_or_failure_reasons(caplog):
    secret_key = "SecretAzureApiKey99887766"
    leak_url = f"https://my-resource.cognitiveservices.azure.com/?key={secret_key}"
    
    p_leaky = ControlledMockProvider(
        name="ocr_space",
        configured=True,
        result=OcrResult(
            engine="ocr_space",
            provider="ocr_space",
            status=STATUS_AUTH_ERROR,
            failure_reason=f"Failed connection to {leak_url}",
        ),
    )
    p_fallback = ControlledMockProvider(
        name="azure",
        configured=True,
        result=OcrResult(
            engine="azure",
            provider="azure",
            status=STATUS_PROVIDER_ERROR,
            failure_reason="Failed with apikey=SecretAzureKey12345678 and Bearer superSecretToken12345",
        ),
    )

    fallback = FallbackOCRProvider(candidates=[p_leaky, p_fallback])
    with caplog.at_level(logging.INFO):
        res = fallback.recognize(b"bytes")

    # Verify result failure reason
    assert secret_key not in res.failure_reason
    assert "SecretAzureKey12345678" not in res.failure_reason
    assert "superSecretToken12345" not in res.failure_reason

    # Verify diagnostic trace
    for attempt in res.attempts:
        reason = attempt.get("failure_reason") or ""
        assert secret_key not in reason
        assert "SecretAzureKey12345678" not in reason
        assert "superSecretToken12345" not in reason

    # Verify logs
    assert secret_key not in caplog.text
    assert "SecretAzureKey12345678" not in caplog.text
    assert "superSecretToken12345" not in caplog.text


# ---------------------------------------------------------------------------
# 6. Failed provider result is not cached as successful extraction
# ---------------------------------------------------------------------------
def test_failed_provider_result_not_cached():
    failed_ocr = OcrResult(
        lines=[],
        engine="none",
        status=STATUS_AUTH_ERROR,
        failure_reason="OCR.space HTTP 403: Billing is disabled",
    )
    cached = _lines_to_cache(failed_ocr)
    assert cached is None  # Must never cache empty or failed result


# ---------------------------------------------------------------------------
# 7. Candidate sequence respects provider order configuration
# ---------------------------------------------------------------------------
def test_candidate_provider_ordering():
    custom_order = "azure,ocr_space"
    candidates = get_candidate_providers(custom_order)
    names = [c.name for c in candidates]
    assert names == ["azure", "ocr_space"]


# ---------------------------------------------------------------------------
# 8. Explicit provider request bypasses fallback chain & rejects google_vision
# ---------------------------------------------------------------------------
def test_explicit_provider_selection():
    p_explicit = get_ocr_provider("ocr_space")
    assert isinstance(p_explicit, OCRSpaceProvider)
    assert not isinstance(p_explicit, FallbackOCRProvider)

    p_auto = get_ocr_provider("auto")
    assert isinstance(p_auto, FallbackOCRProvider)

    with pytest.raises(ValueError, match="Unsupported OCR provider 'google_vision'"):
        get_ocr_provider("google_vision")
