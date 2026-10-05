"""Backend/llm/gemini_provider.py — Direct REST adapter for Google Gemini Cloud LLM Structured Extraction (Phase 3).

Features:
- Connects to Google Gemini API generateContent endpoint with response_mime_type: "application/json".
- Default model: gemini-2.5-flash-lite (high efficiency, free tier supported).
- Zero local ML frameworks (0MB model RAM; httpx only).
- Runs anti-hallucination validation on every response.
- Server-side credentials only (GEMINI_API_KEY).
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

logger = logging.getLogger("niyamnetra.llm.gemini")


class GeminiLLMProvider(BaseLLMProvider):
    name: str = "gemini"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_s: float | None = None,
    ):
        self.api_key = getattr(settings, "GEMINI_API_KEY", None) if api_key is None else api_key
        self.model_name = model or getattr(settings, "LLM_FALLBACK_MODEL", None) or getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash-lite")
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
                    "error": "Gemini API key not configured.",
                    "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                },
                raw_packaged_ocr=packaged_ocr,
            )

        endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{EXTRACTION_SYSTEM_PROMPT}\n\nOCR EVIDENCE INPUT:\n{packaged_ocr}"}
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.0,
            },
        }

        import httpx

        def _do_call():
            r = httpx.post(endpoint_url, json=payload, timeout=self.timeout_s)
            r.raise_for_status()
            return r

        tokens_in = 0
        tokens_out = 0

        try:
            resp = self._execute_with_retry(_do_call)
            data = resp.json()
            usage = data.get("usageMetadata") or {}
            tokens_in = usage.get("promptTokenCount", 0)
            tokens_out = usage.get("candidatesTokenCount", 0)

            cands = data.get("candidates") or []
            if not cands:
                return StructuredDeclarationResult(
                    metadata={
                        "llm_provider": self.name,
                        "llm_model": self.model_name,
                        "status": LLM_STATUS_FAILED,
                        "error": "Gemini returned empty candidate list",
                        "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                    },
                    raw_packaged_ocr=packaged_ocr,
                )

            part_text = cands[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            parsed_json = json.loads(part_text)
        except httpx.TimeoutException:
            logger.warning("[Gemini LLM] Request timed out after %.1fs", self.timeout_s)
            return StructuredDeclarationResult(
                metadata={
                    "llm_provider": self.name,
                    "llm_model": self.model_name,
                    "status": LLM_STATUS_FAILED,
                    "error": "Gemini LLM request timed out.",
                    "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                },
                raw_packaged_ocr=packaged_ocr,
            )
        except json.JSONDecodeError as jde:
            logger.warning("[Gemini LLM] Response was not valid JSON: %s", jde)
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
            logger.warning("[Gemini LLM] Error calling Gemini API: %s: %s", type(e).__name__, e)
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

        return self.validate_evidence_grounding(res, packaged_ocr)
