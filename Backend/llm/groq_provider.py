"""Backend/llm/groq_provider.py — Direct REST adapter for Groq Cloud LLM Structured Extraction (Phase 3).

Features:
- Connects to Groq OpenAI-compatible Chat Completions API with response_format={"type": "json_object"}.
- Default model: openai/gpt-oss-20b (~300ms ultra-fast inference).
- Zero local ML frameworks (0MB model RAM; httpx only).
- Runs anti-hallucination validation on every response.
- Server-side credentials only (GROQ_API_KEY).
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from config import settings
from llm.base import BaseLLMProvider
from llm.prompts import EXTRACTION_SYSTEM_PROMPT
from llm.schema import (
    LLM_STATUS_FAILED,
    LLM_STATUS_SUCCESS,
    LLM_STATUS_UNAVAILABLE,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    StructuredDeclarationResult,
)

logger = logging.getLogger("niyamnetra.llm.groq")


class GroqLLMProvider(BaseLLMProvider):
    name: str = "groq"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        endpoint_url: str | None = None,
        timeout_s: float | None = None,
    ):
        self.api_key = getattr(settings, "GROQ_API_KEY", None) if api_key is None else api_key
        self.model_name = model or getattr(settings, "LLM_MODEL", None) or "openai/gpt-oss-20b"
        self.endpoint_url = endpoint_url or "https://api.groq.com/openai/v1/chat/completions"
        self.timeout_s = timeout_s or getattr(settings, "LLM_TIMEOUT_S", 12.0)

    def extract_declarations(
        self,
        packaged_ocr: str,
        evidence_meta: dict[str, Any] | None = None,
    ) -> StructuredDeclarationResult:
        t0 = time.perf_counter()
        started_at = time.time()

        if not self.api_key:
            return StructuredDeclarationResult(
                metadata={
                    "llm_provider": self.name,
                    "llm_model": self.model_name,
                    "llm_prompt_version": PROMPT_VERSION,
                    "llm_schema_version": SCHEMA_VERSION,
                    "status": LLM_STATUS_UNAVAILABLE,
                    "error": "Groq API key not configured.",
                    "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                },
                raw_packaged_ocr=packaged_ocr,
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": packaged_ocr},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
        }

        import httpx

        def _do_call():
            r = httpx.post(self.endpoint_url, headers=headers, json=payload, timeout=self.timeout_s)
            r.raise_for_status()
            return r

        tokens_in = 0
        tokens_out = 0

        try:
            resp = self._execute_with_retry(_do_call)
            data = resp.json()
            usage = data.get("usage") or {}
            tokens_in = usage.get("prompt_tokens", 0)
            tokens_out = usage.get("completion_tokens", 0)
            content_str = data["choices"][0]["message"]["content"]
            parsed_json = json.loads(content_str)
        except httpx.TimeoutException:
            logger.warning("[Groq LLM] Request timed out after %.1fs", self.timeout_s)
            return StructuredDeclarationResult(
                metadata={
                    "llm_provider": self.name,
                    "llm_model": self.model_name,
                    "status": LLM_STATUS_FAILED,
                    "error": "Groq LLM request timed out.",
                    "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                },
                raw_packaged_ocr=packaged_ocr,
            )
        except json.JSONDecodeError as jde:
            logger.warning("[Groq LLM] Response was not valid JSON: %s", jde)
            return StructuredDeclarationResult(
                metadata={
                    "llm_provider": self.name,
                    "llm_model": self.model_name,
                    "status": LLM_STATUS_FAILED,
                    "error": f"Invalid JSON response: {jde}",
                    "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                },
                raw_packaged_ocr=packaged_ocr,
            )
        except Exception as e:
            logger.warning("[Groq LLM] Error calling Groq API: %s: %s", type(e).__name__, e)
            return StructuredDeclarationResult(
                metadata={
                    "llm_provider": self.name,
                    "llm_model": self.model_name,
                    "status": LLM_STATUS_FAILED,
                    "error": f"{type(e).__name__}: {e}",
                    "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                },
                raw_packaged_ocr=packaged_ocr,
            )

        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        completed_at = time.time()

        # Build StructuredDeclarationResult from JSON
        res = StructuredDeclarationResult.from_dict(parsed_json)
        res.raw_packaged_ocr = packaged_ocr
        res.metadata = {
            "llm_provider": self.name,
            "llm_model": self.model_name,
            "llm_prompt_version": PROMPT_VERSION,
            "llm_schema_version": SCHEMA_VERSION,
            "llm_started_at": started_at,
            "llm_completed_at": completed_at,
            "llm_duration_ms": duration_ms,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "status": LLM_STATUS_SUCCESS,
        }
        if evidence_meta:
            res.metadata.update(evidence_meta)

        # Enforce anti-hallucination grounding
        return self.validate_evidence_grounding(res, packaged_ocr)
