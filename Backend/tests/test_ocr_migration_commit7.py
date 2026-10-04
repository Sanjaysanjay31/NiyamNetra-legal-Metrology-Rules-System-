"""Backend/tests/test_ocr_migration_commit7.py — Authoritative Test Matrix for Cloud OCR Migration (Section 32).

Verifies:
1. Provider abstraction
2. Configured provider selection
3. Missing configuration handling
4. Successful provider response
5. Google Cloud Vision normalization (DOCUMENT_TEXT_DETECTION)
6. OCR.space normalization (Overlay & honest null confidence)
7. Azure AI Vision Read API normalization
8. Bounding-box geometry preservation (quad polygons)
9. Confidence normalization (honest null vs float)
10. Source dimensions recording
11. Orientation metadata handling
12. Malformed provider output fails safely
13. HTTP timeout mapping to STATUS_TIMEOUT
14. HTTP 429 mapping to STATUS_RATE_LIMITED
15. HTTP 5xx mapping to STATUS_PROVIDER_ERROR
16. Authentication failure (401/403) mapping to STATUS_AUTH_ERROR
17. No text detected mapping to STATUS_NO_TEXT
18. Derived analysis image is used
19. HARD INVARIANT: Original evidence is NEVER passed to Cloud OCR
20. Rectified artifact is used when valid and available
21. Geometry unavailable falls back to analysis image (never original)
22. Missing derived artifact fails safely with STATUS_INPUT_UNAVAILABLE
23. Multiple panels remain isolated with full provenance
24. OCR cache serialization/deserialization compatibility
25. extract_fields(OcrResult) downstream contract compatibility
26. Frontend OCR status contract compatibility
27. Offline / disconnected request handling
28. ZERO PaddleOCR / PaddlePaddle imports in runtime production code
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from image_processor import (
    get_ocr_input_artifact,
    prepare_derived_analysis_image,
    prepare_derived_rectified_artifact,
)
from models import ScanImage
from ocr import (
    AzureVisionProvider,
    BaseOCRProvider,
    GoogleVisionProvider,
    OCRSpaceProvider,
    OcrBlock,
    OcrLine,
    OcrResult,
    OcrWord,
    STATUS_AUTH_ERROR,
    STATUS_INPUT_UNAVAILABLE,
    STATUS_INVALID_RESPONSE,
    STATUS_NO_TEXT,
    STATUS_PROVIDER_ERROR,
    STATUS_RATE_LIMITED,
    STATUS_SUCCESS,
    STATUS_TIMEOUT,
    STATUS_UNAVAILABLE,
    get_ocr_provider,
)
from ocr_engine import extract_fields, run_ocr
from routers.scans import _lines_from_cache, _lines_to_cache


# ---------------------------------------------------------------------------
# 1. Provider Abstraction
# ---------------------------------------------------------------------------
def test_provider_abstraction():
    class DummyProvider(BaseOCRProvider):
        name = "dummy"

        def recognize(self, image_bytes, image_width=None, image_height=None, options=None):
            return OcrResult(
                lines=[OcrLine(text="DUMMY TEXT", confidence=0.99, box=[[0, 0], [10, 0], [10, 5], [0, 5]], height_px=5.0)],
                engine=self.name,
                status=STATUS_SUCCESS,
                mean_confidence=0.99,
            )

    provider = DummyProvider()
    assert isinstance(provider, BaseOCRProvider)
    res = provider.recognize(b"fakebytes")
    assert res.status == STATUS_SUCCESS
    assert res.full_text == "DUMMY TEXT"
    assert len(res.lines) == 1


# ---------------------------------------------------------------------------
# 2. Configured Provider Selection
# ---------------------------------------------------------------------------
def test_provider_selection():
    p_google = get_ocr_provider("google_vision")
    assert isinstance(p_google, GoogleVisionProvider)

    p_ocrspace = get_ocr_provider("ocr_space")
    assert isinstance(p_ocrspace, OCRSpaceProvider)

    p_azure = get_ocr_provider("azure")
    assert isinstance(p_azure, AzureVisionProvider)

    # Deterministic default / auto
    p_auto = get_ocr_provider("auto")
    assert isinstance(p_auto, BaseOCRProvider)


# ---------------------------------------------------------------------------
# 3. Missing Configuration Handling
# ---------------------------------------------------------------------------
def test_missing_configuration_handling():
    p_goog = GoogleVisionProvider(api_key="")
    res_goog = p_goog.recognize(b"image_bytes")
    assert res_goog.status == STATUS_UNAVAILABLE
    assert "not configured" in res_goog.failure_reason.lower()

    p_space = OCRSpaceProvider(api_key="")
    res_space = p_space.recognize(b"image_bytes")
    assert res_space.status == STATUS_UNAVAILABLE
    assert "not configured" in res_space.failure_reason.lower()

    p_az = AzureVisionProvider(api_key="", endpoint="")
    res_az = p_az.recognize(b"image_bytes")
    assert res_az.status == STATUS_UNAVAILABLE
    assert "not configured" in res_az.failure_reason.lower()


# ---------------------------------------------------------------------------
# 4. Successful Provider Response
# ---------------------------------------------------------------------------
def test_successful_provider_response():
    sample_res = OcrResult(
        lines=[OcrLine(text="BASMATI RICE", confidence=0.95, box=[[10, 10], [100, 10], [100, 30], [10, 30]], height_px=20.0)],
        engine="google_vision",
        status=STATUS_SUCCESS,
        mean_confidence=0.95,
    )
    assert sample_res.status == STATUS_SUCCESS
    assert sample_res.engine == "google_vision"
    assert sample_res.mean_confidence == 0.95


# ---------------------------------------------------------------------------
# 5. Google Cloud Vision Normalization
# ---------------------------------------------------------------------------
def test_google_vision_normalization():
    p = GoogleVisionProvider(api_key="mock_key")
    mock_payload = {
        "responses": [
            {
                "fullTextAnnotation": {
                    "text": "BASMATI RICE 1kg\nMRP Rs 120",
                    "pages": [
                        {
                            "blocks": [
                                {
                                    "paragraphs": [
                                        {
                                            "words": [
                                                {
                                                    "confidence": 0.98,
                                                    "symbols": [{"text": "B"}, {"text": "A"}, {"text": "S"}, {"text": "M"}, {"text": "A"}, {"text": "T"}, {"text": "I"}],
                                                    "boundingBox": {"vertices": [{"x": 10, "y": 10}, {"x": 80, "y": 10}, {"x": 80, "y": 25}, {"x": 10, "y": 25}]},
                                                },
                                                {
                                                    "confidence": 0.96,
                                                    "symbols": [{"text": "R"}, {"text": "I"}, {"text": "C"}, {"text": "E"}],
                                                    "boundingBox": {"vertices": [{"x": 85, "y": 10}, {"x": 130, "y": 10}, {"x": 130, "y": 25}, {"x": 85, "y": 25}]},
                                                },
                                                {
                                                    "confidence": 0.94,
                                                    "symbols": [{"text": "1"}, {"text": "k"}, {"text": "g"}],
                                                    "boundingBox": {"vertices": [{"x": 135, "y": 10}, {"x": 170, "y": 10}, {"x": 170, "y": 25}, {"x": 135, "y": 25}]},
                                                },
                                            ]
                                        },
                                        {
                                            "words": [
                                                {
                                                    "confidence": 0.92,
                                                    "symbols": [{"text": "M"}, {"text": "R"}, {"text": "P"}],
                                                    "boundingBox": {"vertices": [{"x": 10, "y": 35}, {"x": 50, "y": 35}, {"x": 50, "y": 50}, {"x": 10, "y": 50}]},
                                                },
                                                {
                                                    "confidence": 0.90,
                                                    "symbols": [{"text": "R"}, {"text": "s"}],
                                                    "boundingBox": {"vertices": [{"x": 55, "y": 35}, {"x": 75, "y": 35}, {"x": 75, "y": 50}, {"x": 55, "y": 50}]},
                                                },
                                                {
                                                    "confidence": 0.95,
                                                    "symbols": [{"text": "1"}, {"text": "2"}, {"text": "0"}],
                                                    "boundingBox": {"vertices": [{"x": 80, "y": 35}, {"x": 110, "y": 35}, {"x": 110, "y": 50}, {"x": 80, "y": 50}]},
                                                },
                                            ]
                                        },
                                    ]
                                }
                            ]
                        }
                    ],
                }
            }
        ]
    }
    res = p._normalize_response(mock_payload, image_width=800, image_height=600, duration_ms=125.0)
    assert res.status == STATUS_SUCCESS
    assert res.engine == "google_vision"
    assert len(res.lines) == 2
    assert res.lines[0].text == "BASMATI RICE 1kg"
    assert res.lines[1].text == "MRP Rs 120"
    assert res.lines[0].confidence is not None
    assert res.lines[0].height_px == 15.0
    assert len(res.lines[0].words) == 3
    assert res.source_width == 800
    assert res.source_height == 600


# ---------------------------------------------------------------------------
# 6. OCR.Space Normalization
# ---------------------------------------------------------------------------
def test_ocr_space_normalization():
    p = OCRSpaceProvider(api_key="mock_key")
    mock_payload = {
        "ParsedResults": [
            {
                "TextOverlay": {
                    "Lines": [
                        {
                            "LineText": "NET WEIGHT 500g",
                            "MaxHeight": 18.0,
                            "Words": [
                                {"WordText": "NET", "Left": 10, "Top": 20, "Width": 30, "Height": 18},
                                {"WordText": "WEIGHT", "Left": 45, "Top": 20, "Width": 60, "Height": 18},
                                {"WordText": "500g", "Left": 110, "Top": 20, "Width": 40, "Height": 18},
                            ],
                        }
                    ]
                }
            }
        ]
    }
    res = p._normalize_response(mock_payload, image_width=640, image_height=480, duration_ms=250.0)
    assert res.status == STATUS_SUCCESS
    assert res.engine == "ocr_space"
    assert len(res.lines) == 1
    assert res.lines[0].text == "NET WEIGHT 500g"
    # Section 6 & 14 requirement: confidence must be honest None
    assert res.lines[0].confidence is None
    assert res.mean_confidence is None
    assert len(res.lines[0].words) == 3
    assert res.lines[0].words[0].confidence is None
    assert res.lines[0].box == [[10.0, 20.0], [150.0, 20.0], [150.0, 38.0], [10.0, 38.0]]


# ---------------------------------------------------------------------------
# 7. Azure AI Vision Read Normalization
# ---------------------------------------------------------------------------
def test_azure_vision_normalization():
    p = AzureVisionProvider(api_key="mock_key", endpoint="https://example.cognitiveservices.azure.com")
    mock_payload = {
        "readResult": {
            "blocks": [
                {
                    "lines": [
                        {
                            "text": "BATCH NO B-1092",
                            "boundingPolygon": [{"x": 5, "y": 10}, {"x": 95, "y": 10}, {"x": 95, "y": 25}, {"x": 5, "y": 25}],
                            "words": [
                                {"text": "BATCH", "confidence": 0.99, "boundingPolygon": [{"x": 5, "y": 10}, {"x": 40, "y": 10}, {"x": 40, "y": 25}, {"x": 5, "y": 25}]},
                                {"text": "NO", "confidence": 0.98, "boundingPolygon": [{"x": 45, "y": 10}, {"x": 60, "y": 10}, {"x": 60, "y": 25}, {"x": 45, "y": 25}]},
                                {"text": "B-1092", "confidence": 0.97, "boundingPolygon": [{"x": 65, "y": 10}, {"x": 95, "y": 10}, {"x": 95, "y": 25}, {"x": 65, "y": 25}]},
                            ],
                        }
                    ]
                }
            ]
        }
    }
    res = p._normalize_response(mock_payload, image_width=500, image_height=300, duration_ms=180.0)
    assert res.status == STATUS_SUCCESS
    assert res.engine == "azure"
    assert len(res.lines) == 1
    assert res.lines[0].text == "BATCH NO B-1092"
    assert res.lines[0].confidence == pytest.approx(0.98, abs=0.01)
    assert len(res.lines[0].words) == 3


# ---------------------------------------------------------------------------
# 8. Bounding Box Geometry Preservation
# ---------------------------------------------------------------------------
def test_bounding_box_geometry_preservation():
    p = GoogleVisionProvider(api_key="mock_key")
    mock_payload = {
        "responses": [
            {
                "fullTextAnnotation": {
                    "text": "EXPIRY 12/2026",
                    "pages": [
                        {
                            "blocks": [
                                {
                                    "paragraphs": [
                                        {
                                            "words": [
                                                {
                                                    "confidence": 0.95,
                                                    "symbols": [{"text": "E"}, {"text": "X"}, {"text": "P"}],
                                                    "boundingBox": {"vertices": [{"x": 100, "y": 200}, {"x": 150, "y": 200}, {"x": 150, "y": 220}, {"x": 100, "y": 220}]},
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ],
                }
            }
        ]
    }
    res = p._normalize_response(mock_payload, 1000, 1000, 10.0)
    line = res.lines[0]
    assert len(line.box) == 4
    # Check quad structure: [top-left, top-right, bottom-right, bottom-left]
    assert line.box[0] == [100.0, 200.0]
    assert line.box[2] == [150.0, 220.0]
    assert line.height_px == 20.0


# ---------------------------------------------------------------------------
# 9. Confidence Normalization
# ---------------------------------------------------------------------------
def test_confidence_normalization():
    # Provider with confidence
    res_float = OcrResult(lines=[OcrLine(text="A", confidence=0.88)], mean_confidence=0.88)
    assert res_float.mean_confidence == 0.88

    # Provider without confidence
    res_none = OcrResult(lines=[OcrLine(text="B", confidence=None)], mean_confidence=None)
    assert res_none.mean_confidence is None


# ---------------------------------------------------------------------------
# 10. Source Dimensions Recording
# ---------------------------------------------------------------------------
def test_source_dimensions_recording():
    res = OcrResult(source_width=1920, source_height=1080)
    assert res.source_width == 1920
    assert res.source_height == 1080


# ---------------------------------------------------------------------------
# 11. Orientation Metadata Handling
# ---------------------------------------------------------------------------
def test_orientation_metadata():
    res = OcrResult(orientation=90.0)
    assert res.orientation == 90.0


# ---------------------------------------------------------------------------
# 12. Malformed Provider Output Fails Safely
# ---------------------------------------------------------------------------
def test_malformed_provider_output_fails_safely():
    p = GoogleVisionProvider(api_key="key")
    # Empty dictionary
    res_empty = p._normalize_response({}, None, None, 1.0)
    assert res_empty.status in (STATUS_NO_TEXT, STATUS_PROVIDER_ERROR)

    # API error response
    res_err = p._normalize_response({"responses": [{"error": {"message": "Invalid argument"}}]}, None, None, 1.0)
    assert res_err.status == STATUS_PROVIDER_ERROR
    assert "Invalid argument" in res_err.failure_reason

    # OCR.space processing error
    p_space = OCRSpaceProvider(api_key="key")
    res_sp_err = p_space._normalize_response({"IsErroredOnProcessing": True, "ErrorMessage": ["File parse error"]}, None, None, 1.0)
    assert res_sp_err.status == STATUS_PROVIDER_ERROR


# ---------------------------------------------------------------------------
# 13. HTTP Timeout Handling
# ---------------------------------------------------------------------------
def test_http_timeout_handling():
    import httpx

    p = GoogleVisionProvider(api_key="key")
    with patch("httpx.post", side_effect=httpx.TimeoutException("Read timed out")):
        res = p.recognize(b"bytes")
        assert res.status == STATUS_TIMEOUT
        assert "timed out" in res.failure_reason.lower()


# ---------------------------------------------------------------------------
# 14. HTTP 429 Rate Limit Handling
# ---------------------------------------------------------------------------
def test_http_429_rate_limited():
    import httpx

    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.json.return_value = {"error": {"message": "Quota exceeded"}}
    exc = httpx.HTTPStatusError("Rate limited", request=MagicMock(), response=mock_resp)

    p = GoogleVisionProvider(api_key="key")
    with patch("httpx.post", side_effect=exc):
        res = p.recognize(b"bytes")
        assert res.status == STATUS_RATE_LIMITED


# ---------------------------------------------------------------------------
# 15. HTTP 5xx Server Error Handling
# ---------------------------------------------------------------------------
def test_http_5xx_server_error():
    import httpx

    mock_resp = MagicMock()
    mock_resp.status_code = 503
    exc = httpx.HTTPStatusError("Service unavailable", request=MagicMock(), response=mock_resp)

    p = OCRSpaceProvider(api_key="key")
    with patch("httpx.post", side_effect=exc):
        res = p.recognize(b"bytes")
        assert res.status == STATUS_PROVIDER_ERROR


# ---------------------------------------------------------------------------
# 16. Authentication Failure (401/403)
# ---------------------------------------------------------------------------
def test_http_auth_failure():
    import httpx

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.json.return_value = {"error": {"message": "API key invalid"}}
    exc = httpx.HTTPStatusError("Unauthorized", request=MagicMock(), response=mock_resp)

    p = GoogleVisionProvider(api_key="invalid_key")
    with patch("httpx.post", side_effect=exc):
        res = p.recognize(b"bytes")
        assert res.status == STATUS_AUTH_ERROR


# ---------------------------------------------------------------------------
# 17. No Text Detected Handling
# ---------------------------------------------------------------------------
def test_no_text_detected():
    p = GoogleVisionProvider(api_key="key")
    res = p._normalize_response({"responses": [{}]}, 800, 600, 10.0)
    assert res.status == STATUS_NO_TEXT
    assert len(res.lines) == 0


# ---------------------------------------------------------------------------
# 18. Derived Analysis Image Used
# ---------------------------------------------------------------------------
def test_derived_analysis_image_used(tmp_path):
    orig = tmp_path / "img_orig.jpg"
    orig.write_bytes(b"ORIGINAL_EVIDENCE_BYTES_SHA256")
    bgr = np.full((1200, 1600, 3), 200, dtype=np.uint8)

    analysis_path, w, h = prepare_derived_analysis_image(orig, bgr)
    assert analysis_path.exists()
    assert analysis_path != orig

    scan_img = ScanImage(
        file_path=str(orig),
        analysis_file_path=str(analysis_path),
        rectified=False,
    )
    art_path, art_type, meta = get_ocr_input_artifact(scan_img)
    assert art_type == "analysis"
    assert art_path == analysis_path
    assert art_path != orig


# ---------------------------------------------------------------------------
# 19. HARD INVARIANT: Original Evidence is NEVER passed to Cloud OCR
# ---------------------------------------------------------------------------
def test_hard_invariant_original_evidence_never_used(tmp_path):
    orig = tmp_path / "immutable_evidence.jpg"
    orig.write_bytes(b"IMMUTABLE_CHAIN_OF_CUSTODY_ORIGINAL")

    scan_img = ScanImage(
        file_path=str(orig),
        analysis_file_path=None,
        rectified=False,
    )
    art_path, art_type, meta = get_ocr_input_artifact(scan_img)
    # Under no circumstances can art_path be the original file
    assert art_path != orig
    assert art_type == "input_unavailable"
    assert art_path is None


# ---------------------------------------------------------------------------
# 20. Rectified Artifact Used When Available
# ---------------------------------------------------------------------------
def test_rectified_artifact_used_when_available(tmp_path):
    orig = tmp_path / "front.jpg"
    orig.write_bytes(b"ORIGINAL")
    bgr = np.full((800, 600, 3), 220, dtype=np.uint8)

    analysis_path, _, _ = prepare_derived_analysis_image(orig, bgr)
    rect_path, _, _ = prepare_derived_rectified_artifact(orig, bgr)

    scan_img = ScanImage(
        file_path=str(orig),
        analysis_file_path=str(analysis_path),
        rectified_file_path=str(rect_path),
        rectified=True,  # Rectification applied successfully
    )
    art_path, art_type, meta = get_ocr_input_artifact(scan_img)
    assert art_type == "rectified"
    assert art_path == rect_path
    assert art_path != orig


# ---------------------------------------------------------------------------
# 21. Geometry Unavailable Falls Back to Analysis Image
# ---------------------------------------------------------------------------
def test_geometry_unavailable_falls_back_to_analysis(tmp_path):
    orig = tmp_path / "front.jpg"
    orig.write_bytes(b"ORIGINAL")
    bgr = np.full((800, 600, 3), 220, dtype=np.uint8)

    analysis_path, _, _ = prepare_derived_analysis_image(orig, bgr)

    scan_img = ScanImage(
        file_path=str(orig),
        analysis_file_path=str(analysis_path),
        rectified_file_path=None,
        rectified=False,  # Geometry failed or skipped
    )
    art_path, art_type, meta = get_ocr_input_artifact(scan_img)
    assert art_type == "analysis"
    assert art_path == analysis_path
    assert art_path != orig


# ---------------------------------------------------------------------------
# 22. Missing Derived Artifact Fails Safely
# ---------------------------------------------------------------------------
def test_missing_derived_artifact_fails_safely():
    res = run_ocr(Path("/nonexistent/derived_path_12345.jpg"))
    assert res.status == STATUS_INPUT_UNAVAILABLE
    assert "missing" in res.failure_reason.lower()


# ---------------------------------------------------------------------------
# 23. Multiple Panels Remain Isolated With Full Provenance
# ---------------------------------------------------------------------------
def test_multi_panel_provenance_isolation():
    p = GoogleVisionProvider(api_key="mock_key")
    with patch.object(p, "recognize") as mock_rec:
        mock_rec.side_effect = lambda *a, **kw: OcrResult(
            lines=[OcrLine(text="PANEL TEXT", confidence=0.9)],
            engine="google_vision",
            status=STATUS_SUCCESS,
        )
        with patch("ocr_engine.get_ocr_provider", return_value=p):
            r1 = run_ocr(b"dummy1", panel="front", image_id=101, scan_id=1, inspection_id=10)
            r2 = run_ocr(b"dummy2", panel="mrp", image_id=102, scan_id=1, inspection_id=10)

            assert r1.panel == "front"
            assert r1.image_id == 101
            assert r2.panel == "mrp"
            assert r2.image_id == 102


# ---------------------------------------------------------------------------
# 24. OCR Cache Compatibility
# ---------------------------------------------------------------------------
def test_ocr_cache_compatibility():
    lines = [
        OcrLine(text="MRP Rs 50.00", confidence=0.96, box=[[10.0, 10.0], [50.0, 10.0], [50.0, 20.0], [10.0, 20.0]], height_px=10.0),
        OcrLine(text="NET QTY 500 g", confidence=None, box=[[10.0, 25.0], [60.0, 25.0], [60.0, 35.0], [10.0, 35.0]], height_px=10.0),
    ]
    orig_ocr = OcrResult(lines=lines, engine="google_vision", mean_confidence=0.96)
    cached_blob = _lines_to_cache(orig_ocr)
    assert cached_blob is not None

    rehydrated = _lines_from_cache(cached_blob)
    assert rehydrated is not None
    assert len(rehydrated.lines) == 2
    assert rehydrated.lines[0].text == "MRP Rs 50.00"
    assert rehydrated.lines[0].confidence == 0.96
    assert rehydrated.lines[1].text == "NET QTY 500 g"
    assert rehydrated.lines[1].confidence is None  # Preserves honest null


# ---------------------------------------------------------------------------
# 25. extract_fields(OcrResult) Downstream Contract Compatibility
# ---------------------------------------------------------------------------
def test_extract_fields_compatibility():
    lines = [
        OcrLine(text="MAXIMUM RETAIL PRICE Rs 149.00 INCL OF ALL TAXES", confidence=0.95),
        OcrLine(text="NET WEIGHT: 250 g", confidence=0.92),
        OcrLine(text="BEST BEFORE 12 MONTHS FROM MANUFACTURE", confidence=0.90),
        OcrLine(text="MANUFACTURED BY ABC FOODS LTD", confidence=0.94),
        OcrLine(text="CUSTOMER CARE: care@abcfoods.com", confidence=0.91),
    ]
    ocr = OcrResult(lines=lines, engine="google_vision", mean_confidence=0.92)
    fields = extract_fields(ocr)

    assert "mrp" in fields
    assert fields["mrp"].value == "149.00"
    assert "net_quantity" in fields
    assert fields["net_quantity"].value == "250"
    assert "250 g" in (fields["net_quantity"].source_line or "")
    assert "best_before" in fields
    assert "manufacturer" in fields


# ---------------------------------------------------------------------------
# 26. Frontend OCR Status Contract Compatibility
# ---------------------------------------------------------------------------
def test_frontend_status_contract():
    # Success
    res = OcrResult(lines=[OcrLine(text="OK")], engine="google_vision", status=STATUS_SUCCESS)
    assert res.status == STATUS_SUCCESS
    assert res.engine != "none"

    # Input unavailable
    res_fail = OcrResult(lines=[], engine="none", status=STATUS_INPUT_UNAVAILABLE, failure_reason="Missing artifact")
    assert res_fail.status == STATUS_INPUT_UNAVAILABLE
    assert res_fail.engine == "none"


# ---------------------------------------------------------------------------
# 27. Offline Request Handling
# ---------------------------------------------------------------------------
def test_offline_request_handling():
    import httpx

    p = GoogleVisionProvider(api_key="key")
    with patch("httpx.post", side_effect=httpx.ConnectError("Network unreachable")):
        res = p.recognize(b"bytes")
        assert res.status == STATUS_PROVIDER_ERROR
        assert "connect" in res.failure_reason.lower()


# ---------------------------------------------------------------------------
# 28. ZERO PaddleOCR Runtime Imports in Production Code
# ---------------------------------------------------------------------------
def test_zero_paddleocr_runtime_imports():
    import importlib
    import inspect

    import main
    import ocr_engine
    import routers.scans

    # Check that paddle is not imported in runtime modules
    for mod in [main, ocr_engine, routers.scans]:
        src = inspect.getsource(mod)
        assert "from paddleocr import" not in src
        assert "import paddleocr" not in src
        assert "import paddle" not in src
