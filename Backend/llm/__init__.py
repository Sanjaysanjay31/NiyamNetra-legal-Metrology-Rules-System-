"""Backend/llm package — Evidence-Grounded Packaging Declaration Structuring (Phase 3)."""
from llm.base import BaseLLMProvider
from llm.factory import (
    compute_llm_cache_hash,
    get_llm_provider,
    structure_inspection_ocr,
)
from llm.gemini_provider import GeminiLLMProvider
from llm.groq_provider import GroqLLMProvider
from llm.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    package_ocr_for_llm,
)
from llm.schema import (
    LLM_STATUS_AMBIGUOUS,
    LLM_STATUS_FAILED,
    LLM_STATUS_PENDING,
    LLM_STATUS_SUCCESS,
    LLM_STATUS_UNAVAILABLE,
    STATUS_AMBIGUOUS,
    STATUS_CONFIRMED,
    STATUS_NOT_OBSERVED,
    STATUS_UNASSESSABLE,
    CandidateItem,
    CommonFieldDeclaration,
    ConsumerCareDeclaration,
    DateDeclaration,
    FieldProvenance,
    MrpDeclaration,
    NetQuantityDeclaration,
    PartyDeclaration,
    StructuredDeclarationResult,
)

__all__ = [
    "BaseLLMProvider",
    "GroqLLMProvider",
    "GeminiLLMProvider",
    "get_llm_provider",
    "structure_inspection_ocr",
    "compute_llm_cache_hash",
    "EXTRACTION_SYSTEM_PROMPT",
    "PROMPT_VERSION",
    "SCHEMA_VERSION",
    "package_ocr_for_llm",
    "CandidateItem",
    "FieldProvenance",
    "MrpDeclaration",
    "NetQuantityDeclaration",
    "DateDeclaration",
    "PartyDeclaration",
    "ConsumerCareDeclaration",
    "CommonFieldDeclaration",
    "StructuredDeclarationResult",
    "STATUS_CONFIRMED",
    "STATUS_AMBIGUOUS",
    "STATUS_NOT_OBSERVED",
    "STATUS_UNASSESSABLE",
    "LLM_STATUS_SUCCESS",
    "LLM_STATUS_AMBIGUOUS",
    "LLM_STATUS_PENDING",
    "LLM_STATUS_UNAVAILABLE",
    "LLM_STATUS_FAILED",
]
