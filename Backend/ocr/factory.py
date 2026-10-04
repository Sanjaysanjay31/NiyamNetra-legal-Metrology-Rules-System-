"""Backend/ocr/factory.py — Provider factory and configuration selector.

Server-side deterministic selection of OCR Provider (Section 6 & 10).
Does not expose provider secrets to client frontends.
"""
from __future__ import annotations

from config import settings
from ocr.azure_vision import AzureVisionProvider
from ocr.base import BaseOCRProvider
from ocr.google_vision import GoogleVisionProvider
from ocr.ocr_space import OCRSpaceProvider


def get_ocr_provider(provider_name: str | None = None) -> BaseOCRProvider:
    """Return the configured cloud OCR provider instance."""
    name = (provider_name or getattr(settings, "OCR_PROVIDER", "auto") or "auto").strip().lower()

    if name in ("google", "google_vision", "google-vision", "vision"):
        return GoogleVisionProvider()
    if name in ("ocrspace", "ocr_space", "ocr-space"):
        return OCRSpaceProvider()
    if name in ("azure", "azure_vision", "azure-vision"):
        return AzureVisionProvider()

    # If "auto", select the primary configured provider deterministically:
    # 1. Google Vision if key is available
    if getattr(settings, "GOOGLE_VISION_API_KEY", None):
        return GoogleVisionProvider()
    # 2. OCR.space if key is available
    if getattr(settings, "OCR_SPACE_API_KEY", None):
        return OCRSpaceProvider()
    # 3. Azure Vision if key is available
    if getattr(settings, "AZURE_VISION_KEY", None):
        return AzureVisionProvider()

    # Default fallback when no keys are configured
    return OCRSpaceProvider()
