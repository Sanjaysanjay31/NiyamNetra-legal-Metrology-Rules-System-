"""tests/test_round4_fix.py — category, proximity, archive, quad, paddle lang."""
import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import numpy as np


def test_quad_detected_on_synthetic():
    from image_processor import detect_panel_quad
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    img[60:340, 80:320] = 255  # bright panel on dark background
    q = detect_panel_quad(img)
    assert q is not None
    assert q.shape == (4, 2)
    xs, ys = q[:, 0], q[:, 1]
    assert 40 <= xs.min() <= 120 and 280 <= xs.max() <= 360
    assert 20 <= ys.min() <= 100 and 300 <= ys.max() <= 380
    # ordering tl, tr, br, bl
    tl, tr, br, bl = q
    assert tl[0] <= tr[0] and bl[0] <= br[0]
    assert tl[1] <= bl[1] and tr[1] <= br[1]


def test_quad_none_on_uniform():
    from image_processor import detect_panel_quad
    assert detect_panel_quad(np.zeros((300, 300, 3), dtype=np.uint8)) is None
    assert detect_panel_quad(np.full((300, 300, 3), 128, dtype=np.uint8)) is None


def test_report_record_model_and_history_route():
    from models import ReportRecord
    assert ReportRecord.__tablename__ == "report_records"
    from routers.admin import report_history
    assert callable(report_history)
    from routers.reports import _log_report
    assert callable(_log_report)


def test_proximity_and_repeat_routes():
    from queries import proximity_flags, repeat_violators
    assert callable(proximity_flags) and callable(repeat_violators)
    from routers.admin import admin_range_report, proximity_review
    assert callable(admin_range_report) and callable(proximity_review)


def test_category_param_and_paddle_lang():
    import inspect
    from routers.inspections import list_inspections
    assert "category" in inspect.signature(list_inspections).parameters
    from config import settings
    assert settings.OCR_PADDLE_LANG == "en"
    src = inspect.getsource(__import__("ocr_engine", fromlist=["get_paddle"]).get_paddle)
    assert "OCR_PADDLE_LANG" in src
