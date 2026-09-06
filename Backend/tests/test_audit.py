"""tests/test_audit.py — hash chain intact on sqlite memory (no alembic)."""
import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
import models  # noqa: F401 - register tables
from audit import append_audit, verify_chain


def _mem_db():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    return eng, S()


def test_chain_intact_after_appends():
    eng, db = _mem_db()
    try:
        append_audit(db, action="login", user_id=None, new_value="emp001")
        append_audit(db, action="inspection_created", inspection_id=None, user_id=1)
        st = verify_chain(db)
        assert st["intact"] is True
        assert st["entries"] == 2
        assert st["head"]
    finally:
        db.close()
        eng.dispose()


def test_chain_detects_tamper():
    eng, db = _mem_db()
    try:
        append_audit(db, action="login", user_id=1)
        append_audit(db, action="assessed", scan_id=None, user_id=1, new_value="violation")
        # tamper with payload without updating hash
        from models import AuditLog
        row = db.query(AuditLog).order_by(AuditLog.seq.desc()).first()
        row.new_value = "compliant"
        db.commit()
        st = verify_chain(db)
        assert st["intact"] is False
    finally:
        db.close()
        eng.dispose()


def test_seq_retry_commit_param():
    eng, db = _mem_db()
    try:
        e = append_audit(db, action="x", commit=False)
        assert e.seq == 1
        db.commit()
        st = verify_chain(db)
        assert st["intact"] is True
    finally:
        db.close()
        eng.dispose()
