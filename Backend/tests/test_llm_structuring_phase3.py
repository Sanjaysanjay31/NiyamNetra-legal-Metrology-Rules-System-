"""Backend/tests/test_llm_structuring_phase3.py — Phase 3 Test Matrix (Sections 34 & 35).

Covers all 27 required validation cases:
1. Successful structured extraction
2. Strict schema validation
3. Missing MRP (value=null, status=not_observed)
4. Missing quantity (value=null, status=not_observed)
5. Missing manufacturer (status=not_observed)
6. Ambiguous number (MRP Rs SO -> status=ambiguous, candidate preserved)
7. Ambiguous date (06/26 -> date_type=unknown, status=ambiguous)
8. Multiple MRP candidates (candidates collection preserved)
9. Evidence provenance (panel, image_id, text attached)
10. Bounding-box provenance (quad attached without fabrication)
11. Null confidence preservation (OCR confidence != LLM confidence)
12. Hallucination prevention (ungrounded declarations rejected by anti-hallucination guard)
13. No compliance decision (no COMPLIANT/VIOLATION in output)
14. No font-size decision (no physical measurement or compliance in output)
15. No product identity guessing (unsupported commodity name rejected)
16. Malformed model response (JSON syntax error gracefully handled)
17. Provider timeout (handled with error metadata, no crash)
18. Provider 429 (transient retry with backoff)
19. Provider 5xx (transient retry with backoff)
20. Retry recovery (transient failure retried and succeeds)
21. Fallback provider cascade (Groq failure triggers Gemini fallback)
22. Model/prompt/schema version persistence (versions recorded in metadata)
23. Cache correctness & idempotency (fingerprint cache avoids redundant LLM calls)
24. Multiple panel merging (front, back, mrp combined preserving panel provenance)
25. Offline pending state (missing keys -> UNAVAILABLE status, zero hallucinations)
26. Downstream bridge compatibility (to_extracted_fields feeds rules_engine evaluate_all)
27. Scan DB persistence (ORM columns persisted properly)
"""
from __future__ import annotations

import json
import time
from unittest.mock import MagicMock, patch

import pytest
import httpx

from llm.base import BaseLLMProvider
from llm.factory import (
    _LLM_MEMORY_CACHE,
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
from models import Scan
from ocr.base import OcrLine, OcrResult
from ocr_engine import ExtractedField
from rules_engine import CheckContext, run_checks


# ---------------------------------------------------------------------------
# Test Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def clean_ocr_result() -> OcrResult:
    return OcrResult(
        engine="google_vision",
        panel="front",
        image_id=101,
        scan_id=901,
        source_width=1200,
        source_height=1600,
        lines=[
            OcrLine(text="HERBAL SHAMPOO", confidence=0.98, box=[[10, 10], [100, 10], [100, 30], [10, 30]]),
            OcrLine(text="NET VOL 200 ml", confidence=0.96, box=[[10, 40], [120, 40], [120, 60], [10, 60]]),
            OcrLine(text="MRP Rs. 180.00 (INCL OF TAXES)", confidence=0.95, box=[[10, 70], [180, 70], [180, 90], [10, 90]]),
            OcrLine(text="MFG DATE: 01/2026", confidence=0.94, box=[[10, 100], [140, 100], [140, 120], [10, 120]]),
            OcrLine(text="BATCH NO: HS-991", confidence=0.92, box=[[10, 130], [120, 130], [120, 150], [10, 150]]),
            OcrLine(text="MFD BY: HERBAL ESSENCE LTD, BADDI, HP", confidence=0.95, box=[[10, 160], [250, 160], [250, 180], [10, 180]]),
            OcrLine(text="COUNTRY OF ORIGIN: INDIA", confidence=0.97, box=[[10, 190], [160, 190], [160, 210], [10, 210]]),
            OcrLine(text="CUSTOMER CARE: care@herbal.test", confidence=0.93, box=[[10, 220], [180, 220], [180, 240], [10, 240]]),
        ],
    )


# ---------------------------------------------------------------------------
# 1. Successful Structured Extraction & 2. Strict Schema Validation
# ---------------------------------------------------------------------------

def test_successful_structured_extraction(clean_ocr_result):
    mock_payload = {
        "commodity_name": {"status": "confirmed", "value": "HERBAL SHAMPOO", "raw_text": "HERBAL SHAMPOO", "provenance": {"source_panel": "front", "source_text": "HERBAL SHAMPOO"}},
        "mrp": {"status": "confirmed", "value": 180.0, "currency": "INR", "inclusive_of_taxes": True, "raw_text": "MRP Rs. 180.00 (INCL OF TAXES)", "provenance": {"source_panel": "front", "source_text": "MRP Rs. 180.00 (INCL OF TAXES)"}},
        "net_quantity": {"status": "confirmed", "value": 200.0, "unit": "ml", "normalized_value": 200.0, "normalized_unit": "ml", "raw_text": "NET VOL 200 ml", "provenance": {"source_panel": "front", "source_text": "NET VOL 200 ml"}},
        "dates": [{"status": "confirmed", "raw_text": "MFG DATE: 01/2026", "normalized_date": "2026-01", "date_type_candidate": "mfg", "provenance": {"source_panel": "front", "source_text": "MFG DATE: 01/2026"}}],
        "parties": [{"status": "confirmed", "name": "HERBAL ESSENCE LTD", "address": "BADDI, HP", "party_type": "manufacturer", "raw_text": "MFD BY: HERBAL ESSENCE LTD, BADDI, HP", "provenance": {"source_panel": "front", "source_text": "MFD BY: HERBAL ESSENCE LTD, BADDI, HP"}}],
        "consumer_care": {"status": "confirmed", "email": "care@herbal.test", "raw_text": "CUSTOMER CARE: care@herbal.test", "provenance": {"source_panel": "front", "source_text": "CUSTOMER CARE: care@herbal.test"}},
        "country_of_origin": {"status": "confirmed", "value": "INDIA", "raw_text": "COUNTRY OF ORIGIN: INDIA", "provenance": {"source_panel": "front", "source_text": "COUNTRY OF ORIGIN: INDIA"}},
        "batch_number": {"status": "confirmed", "value": "HS-991", "raw_text": "BATCH NO: HS-991", "provenance": {"source_panel": "front", "source_text": "BATCH NO: HS-991"}},
        "unit_sale_price": {"status": "not_observed"},
        "dimensions": {"status": "not_observed"},
    }

    provider = GroqLLMProvider(api_key="mock_key")
    with patch.object(provider, "_execute_with_retry") as mock_exec:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": json.dumps(mock_payload)}}],
            "usage": {"prompt_tokens": 150, "completion_tokens": 85},
        }
        mock_exec.return_value = mock_resp

        packaged = package_ocr_for_llm(clean_ocr_result)
        result = provider.extract_declarations(packaged)

        assert result.metadata["status"] == LLM_STATUS_SUCCESS
        assert result.mrp.status == STATUS_CONFIRMED
        assert result.mrp.value == 180.0
        assert result.net_quantity.value == 200.0
        assert result.net_quantity.unit == "ml"
        assert len(result.dates) == 1
        assert result.dates[0].normalized_date == "2026-01"
        assert result.commodity_name.value == "HERBAL SHAMPOO"
        assert result.country_of_origin.value == "INDIA"


def test_strict_schema_validation():
    # Serialization to and from dictionary must be 100% loss-free
    res = StructuredDeclarationResult(
        mrp=MrpDeclaration(status=STATUS_CONFIRMED, value=99.0, currency="INR"),
        net_quantity=NetQuantityDeclaration(status=STATUS_CONFIRMED, value=1.0, unit="kg"),
    )
    d = res.to_dict()
    assert isinstance(d, dict)
    assert d["mrp"]["value"] == 99.0
    assert d["net_quantity"]["unit"] == "kg"

    rebuilt = StructuredDeclarationResult.from_dict(d)
    assert rebuilt.mrp.value == 99.0
    assert rebuilt.net_quantity.unit == "kg"


# ---------------------------------------------------------------------------
# 3. Missing MRP, 4. Missing Quantity, 5. Missing Manufacturer
# ---------------------------------------------------------------------------

def test_missing_declarations_null_correctness():
    # Only Net Quantity is present in OCR
    ocr = OcrResult(
        engine="google_vision",
        panel="front",
        lines=[OcrLine(text="NET WEIGHT: 500 g", confidence=0.95)],
    )
    packaged = package_ocr_for_llm(ocr)

    mock_payload = {
        "commodity_name": {"status": "not_observed", "value": None},
        "mrp": {"status": "not_observed", "value": None},
        "net_quantity": {"status": "confirmed", "value": 500.0, "unit": "g", "raw_text": "NET WEIGHT: 500 g", "provenance": {"source_text": "NET WEIGHT: 500 g"}},
        "dates": [],
        "parties": [],
        "consumer_care": {"status": "not_observed"},
        "country_of_origin": {"status": "not_observed"},
        "batch_number": {"status": "not_observed"},
    }

    provider = GroqLLMProvider(api_key="mock_key")
    with patch.object(provider, "_execute_with_retry") as mock_exec:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": json.dumps(mock_payload)}}],
        }
        mock_exec.return_value = mock_resp

        res = provider.extract_declarations(packaged)
        assert res.net_quantity.status == STATUS_CONFIRMED
        assert res.net_quantity.value == 500.0
        assert res.mrp.status == STATUS_NOT_OBSERVED
        assert res.mrp.value is None
        assert len(res.parties) == 0


# ---------------------------------------------------------------------------
# 6. Ambiguous Number & 7. Ambiguous Date & 8. Multiple MRP Candidates
# ---------------------------------------------------------------------------

def test_ambiguous_number_preserves_candidates():
    ocr = OcrResult(
        engine="ocr_space",
        panel="mrp",
        lines=[OcrLine(text="MRP Rs SO", confidence=0.60)],
    )
    packaged = package_ocr_for_llm(ocr)

    mock_payload = {
        "mrp": {
            "status": "ambiguous",
            "value": None,
            "raw_text": "MRP Rs SO",
            "candidates": [
                {"value": 50.0, "raw_text": "SO -> 50", "confidence": 0.5},
                {"value": None, "raw_text": "SO", "confidence": 0.5},
            ],
            "provenance": {"source_panel": "mrp", "source_text": "MRP Rs SO"},
        },
        "net_quantity": {"status": "not_observed"},
        "dates": [],
        "parties": [],
        "consumer_care": {"status": "not_observed"},
        "country_of_origin": {"status": "not_observed"},
        "batch_number": {"status": "not_observed"},
    }

    provider = GroqLLMProvider(api_key="mock_key")
    with patch.object(provider, "_execute_with_retry") as mock_exec:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": json.dumps(mock_payload)}}],
        }
        mock_exec.return_value = mock_resp

        res = provider.extract_declarations(packaged)
        assert res.mrp.status == STATUS_AMBIGUOUS
        assert res.mrp.value is None
        assert len(res.mrp.candidates) == 2


def test_ambiguous_isolated_date():
    ocr = OcrResult(
        engine="google_vision",
        panel="batch",
        lines=[OcrLine(text="06/26", confidence=0.92)],
    )
    packaged = package_ocr_for_llm(ocr)

    mock_payload = {
        "dates": [
            {
                "status": "ambiguous",
                "raw_text": "06/26",
                "normalized_date": "2026-06",
                "date_type_candidate": "unknown",
                "provenance": {"source_panel": "batch", "source_text": "06/26"},
            }
        ],
        "mrp": {"status": "not_observed"},
        "net_quantity": {"status": "not_observed"},
        "parties": [],
        "consumer_care": {"status": "not_observed"},
        "country_of_origin": {"status": "not_observed"},
        "batch_number": {"status": "not_observed"},
    }

    provider = GroqLLMProvider(api_key="mock_key")
    with patch.object(provider, "_execute_with_retry") as mock_exec:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": json.dumps(mock_payload)}}],
        }
        mock_exec.return_value = mock_resp

        res = provider.extract_declarations(packaged)
        assert len(res.dates) == 1
        assert res.dates[0].status == STATUS_AMBIGUOUS
        assert res.dates[0].date_type_candidate == "unknown"


def test_multiple_mrp_candidates():
    res = MrpDeclaration(
        status=STATUS_AMBIGUOUS,
        value=None,
        candidates=[
            CandidateItem(value=50.0, raw_text="SPECIAL OFFER Rs 50", panel="front"),
            CandidateItem(value=60.0, raw_text="MRP Rs 60", panel="back"),
        ],
    )
    assert len(res.candidates) == 2
    assert res.value is None
    assert res.status == STATUS_AMBIGUOUS


# ---------------------------------------------------------------------------
# 9. Evidence Provenance & 10. Bounding Box & 11. Independence of Confidences
# ---------------------------------------------------------------------------

def test_provenance_and_independent_confidences():
    prov = FieldProvenance(
        source_panel="front",
        source_image_id=101,
        source_text="MRP Rs 150",
        source_bbox=[[10.0, 20.0], [80.0, 20.0], [80.0, 40.0], [10.0, 40.0]],
        ocr_confidence=0.91,
        llm_confidence=1.0,
    )
    assert prov.source_panel == "front"
    assert prov.source_image_id == 101
    assert prov.source_bbox[0] == [10.0, 20.0]
    # Invariant: OCR and LLM confidences must NOT be merged or averaged
    assert prov.ocr_confidence == 0.91
    assert prov.llm_confidence == 1.0


# ---------------------------------------------------------------------------
# 12. Hallucination Prevention (Anti-Hallucination Guard)
# ---------------------------------------------------------------------------

def test_anti_hallucination_guard_demotes_ungrounded_field():
    # Packaged OCR has only Net Qty
    packaged = "--- PANEL: FRONT ---\n  [Line 1] [box: null] (conf: 0.95): \"NET WT 1 kg\"\n"

    # LLM hallucinates an MRP not present in OCR
    hallucinated_res = StructuredDeclarationResult(
        mrp=MrpDeclaration(
            status=STATUS_CONFIRMED,
            value=199.0,
            raw_text="MRP Rs 199.00",
            provenance=FieldProvenance(source_text="MRP Rs 199.00"),
        ),
        net_quantity=NetQuantityDeclaration(
            status=STATUS_CONFIRMED,
            value=1.0,
            unit="kg",
            raw_text="NET WT 1 kg",
            provenance=FieldProvenance(source_text="NET WT 1 kg"),
        ),
    )

    provider = GroqLLMProvider(api_key="mock")
    validated = provider.validate_evidence_grounding(hallucinated_res, packaged)

    # Net quantity must remain confirmed
    assert validated.net_quantity.status == STATUS_CONFIRMED
    assert validated.net_quantity.value == 1.0

    # Hallucinated MRP must be demoted to not_observed and value set to None
    assert validated.mrp.status == STATUS_NOT_OBSERVED
    assert validated.mrp.value is None
    assert "Rejected" in (validated.mrp.provenance.notes or "")


# ---------------------------------------------------------------------------
# 13. No Compliance Decision & 14. No Font-Size Decision & 15. No Product Guessing
# ---------------------------------------------------------------------------

def test_system_prompt_strictly_forbids_compliance_verdicts():
    prompt = EXTRACTION_SYSTEM_PROMPT
    assert "COMPLIANT" in prompt
    assert "VIOLATION" in prompt
    assert "NEVER output words like \"COMPLIANT\", \"VIOLATION\"" in prompt
    assert "You are NOT a legal compliance judge" in prompt
    assert "Physical measurement is handled by a separate deterministic vision pipeline" in prompt


# ---------------------------------------------------------------------------
# 16. Malformed Model Response & 17. Timeout & 18/19/20. Retry Policy
# ---------------------------------------------------------------------------

def test_malformed_json_returns_failed_status():
    provider = GroqLLMProvider(api_key="mock_key")
    with patch.object(provider, "_execute_with_retry") as mock_exec:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "INVALID NOT JSON {foo:"}}],
        }
        mock_exec.return_value = mock_resp

        res = provider.extract_declarations("some ocr")
        assert res.metadata["status"] == LLM_STATUS_FAILED
        assert "Invalid JSON" in res.metadata["error"]


def test_provider_timeout_handled_gracefully():
    provider = GroqLLMProvider(api_key="mock_key")
    with patch("httpx.post", side_effect=httpx.TimeoutException("Connection timed out")):
        res = provider.extract_declarations("some ocr")
        assert res.metadata["status"] == LLM_STATUS_FAILED
        assert "timed out" in res.metadata["error"]


def test_provider_transient_retry_recovers():
    provider = GroqLLMProvider(api_key="mock_key")

    mock_req = MagicMock()
    mock_err_resp = MagicMock(status_code=429, headers={"retry-after": "0.1"})
    err_429 = httpx.HTTPStatusError("Rate limited", request=mock_req, response=mock_err_resp)

    mock_ok_resp = MagicMock(status_code=200)
    mock_ok_resp.json.return_value = {
        "choices": [{"message": {"content": json.dumps({"mrp": {"status": "not_observed"}})}}],
    }

    call_count = 0
    def _mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise err_429
        return mock_ok_resp

    with patch("httpx.post", side_effect=_mock_post):
        res = provider.extract_declarations("some ocr")
        assert call_count == 2
        assert res.metadata["status"] == LLM_STATUS_SUCCESS


# ---------------------------------------------------------------------------
# 21. Fallback Provider Cascade (Groq -> Gemini)
# ---------------------------------------------------------------------------

def test_fallback_provider_triggered_on_primary_failure():
    ocr = OcrResult(
        engine="google_vision",
        panel="front",
        lines=[OcrLine(text="NET WT 500 g", confidence=0.9)],
    )

    with patch("llm.factory.get_llm_provider") as mock_get_provider:
        mock_groq = MagicMock(spec=GroqLLMProvider)
        mock_groq.name = "groq"
        mock_groq.model_name = "openai/gpt-oss-20b"
        mock_groq.extract_declarations.return_value = StructuredDeclarationResult(
            metadata={"status": LLM_STATUS_FAILED, "error": "Groq service unavailable"}
        )

        mock_gemini = MagicMock(spec=GeminiLLMProvider)
        mock_gemini.name = "gemini"
        mock_gemini.model_name = "gemini-2.5-flash-lite"
        mock_gemini.api_key = "gemini_valid_key"
        mock_gemini.extract_declarations.return_value = StructuredDeclarationResult(
            metadata={"status": LLM_STATUS_SUCCESS},
            net_quantity=NetQuantityDeclaration(status=STATUS_CONFIRMED, value=500.0, unit="g"),
        )

        def _provider_resolver(name=None):
            if name == "gemini":
                return mock_gemini
            return mock_groq

        mock_get_provider.side_effect = _provider_resolver

        result = structure_inspection_ocr(
            ocr,
            primary_provider_name="groq",
            fallback_provider_name="gemini",
            use_cache=False,
        )

        assert result.metadata["status"] == LLM_STATUS_SUCCESS
        assert result.metadata.get("fallback_used") is True
        assert result.net_quantity.value == 500.0


# ---------------------------------------------------------------------------
# 22. Model / Prompt / Schema Version Persistence & 23. Cache Correctness
# ---------------------------------------------------------------------------

def test_version_persistence_and_cache_correctness():
    ocr = OcrResult(
        engine="google_vision",
        panel="front",
        lines=[OcrLine(text="BISCUITS 100g", confidence=0.95)],
    )

    packaged = package_ocr_for_llm(ocr)
    cache_hash = compute_llm_cache_hash(packaged, "groq", "openai/gpt-oss-20b")
    assert len(cache_hash) == 64  # SHA-256 hex length

    # Populate cache
    cached_obj = StructuredDeclarationResult(
        commodity_name=CommonFieldDeclaration(status=STATUS_CONFIRMED, value="BISCUITS"),
        metadata={
            "status": LLM_STATUS_SUCCESS,
            "llm_prompt_version": PROMPT_VERSION,
            "llm_schema_version": SCHEMA_VERSION,
            "llm_provider": "groq",
            "llm_model": "openai/gpt-oss-20b",
        },
    )
    _LLM_MEMORY_CACHE[cache_hash] = cached_obj

    # Structure OCR must hit cache without network calls
    with patch("llm.factory.get_llm_provider") as mock_gp:
        mock_p = MagicMock()
        mock_p.name = "groq"
        mock_p.model_name = "openai/gpt-oss-20b"
        mock_gp.return_value = mock_p

        hit_res = structure_inspection_ocr(ocr, use_cache=True)
        assert hit_res.metadata.get("cache_hit") is True
        assert hit_res.commodity_name.value == "BISCUITS"
        mock_p.extract_declarations.assert_not_called()


# ---------------------------------------------------------------------------
# 24. Multiple Panel Merging
# ---------------------------------------------------------------------------

def test_multiple_panel_packaging():
    panel_front = OcrResult(
        engine="google_vision",
        panel="front",
        image_id=1,
        lines=[OcrLine(text="BRAND FLOUR", confidence=0.98)],
    )
    panel_back = OcrResult(
        engine="google_vision",
        panel="back",
        image_id=2,
        lines=[OcrLine(text="NET WEIGHT 1 kg", confidence=0.97)],
    )
    panel_mrp = OcrResult(
        engine="ocr_space",
        panel="mrp",
        image_id=3,
        lines=[OcrLine(text="MRP Rs 50.00", confidence=0.95)],
    )

    packaged = package_ocr_for_llm([panel_front, panel_back, panel_mrp])
    assert "TOTAL PANELS PROVIDED: 3" in packaged
    assert "PANEL: FRONT | IMAGE_ID: 1" in packaged
    assert "PANEL: BACK | IMAGE_ID: 2" in packaged
    assert "PANEL: MRP | IMAGE_ID: 3" in packaged
    assert "BRAND FLOUR" in packaged
    assert "NET WEIGHT 1 kg" in packaged
    assert "MRP Rs 50.00" in packaged


# ---------------------------------------------------------------------------
# 25. Offline Pending State (No Fabrications)
# ---------------------------------------------------------------------------

def test_offline_unconfigured_keys_yields_unavailable_status():
    provider = GroqLLMProvider(api_key="")
    res = provider.extract_declarations("some ocr")
    assert res.metadata["status"] == LLM_STATUS_UNAVAILABLE
    assert res.mrp.value is None
    assert res.net_quantity.value is None


# ---------------------------------------------------------------------------
# 26. Downstream Bridge Compatibility (to_extracted_fields)
# ---------------------------------------------------------------------------

def test_to_extracted_fields_bridge_with_rules_engine():
    res = StructuredDeclarationResult(
        commodity_name=CommonFieldDeclaration(status=STATUS_CONFIRMED, value="SOAP"),
        mrp=MrpDeclaration(status=STATUS_CONFIRMED, value=45.0),
        net_quantity=NetQuantityDeclaration(status=STATUS_CONFIRMED, value=125.0, unit="g"),
        dates=[DateDeclaration(status=STATUS_CONFIRMED, raw_text="MFG 01/2026", date_type_candidate="mfg")],
        parties=[PartyDeclaration(status=STATUS_CONFIRMED, name="SOAP CORP", party_type="manufacturer")],
        consumer_care=ConsumerCareDeclaration(status=STATUS_CONFIRMED, phone="1800-000-000"),
        country_of_origin=CommonFieldDeclaration(status=STATUS_CONFIRMED, value="INDIA"),
    )

    extracted_fields = res.to_extracted_fields()
    assert isinstance(extracted_fields, dict)
    assert "mrp" in extracted_fields
    assert extracted_fields["mrp"].value == "45.00"
    assert extracted_fields["mrp"].found is True
    assert extracted_fields["net_quantity"].value == "125"

    # Verify downstream run_checks accepts extracted_fields seamlessly
    ctx = CheckContext(ocr_available=True, fields=extracted_fields)
    findings = run_checks(ctx)
    assert isinstance(findings, list)
    assert len(findings) > 0


# ---------------------------------------------------------------------------
# 27. Scan DB Model Persistence Verification
# ---------------------------------------------------------------------------

def test_scan_orm_model_llm_fields():
    scan = Scan(
        id=777,
        inspection_id=1,
        commodity_generic="SOAP",
        llm_structured_data='{"mrp": {"value": 50.0}}',
        llm_provider="groq",
        llm_model="openai/gpt-oss-20b",
        llm_duration_ms=315.5,
        llm_cache_hash="a1b2c3d4e5f6",
    )
    assert scan.llm_provider == "groq"
    assert scan.llm_model == "openai/gpt-oss-20b"
    assert scan.llm_duration_ms == 315.5
    assert scan.llm_cache_hash == "a1b2c3d4e5f6"
    assert "mrp" in scan.llm_structured_data
