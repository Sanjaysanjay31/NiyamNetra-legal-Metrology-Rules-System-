"""Engine, session factory, and the per-connection SQLite pragmas."""
from collections.abc import Generator
import logging
from pathlib import Path
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from config import settings

logger = logging.getLogger("niyamnetra.database")


class Base(DeclarativeBase):
    pass


def _apply_sqlite_pragmas(eng):
    @event.listens_for(eng, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()


def _create_engine_with_fallback():
    url = settings.DATABASE_URL
    is_sqlite = settings.is_sqlite

    if not is_sqlite:
        try:
            test_eng = create_engine(
                url,
                echo=False,
                future=True,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 5},
            )
            with test_eng.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Connected to primary PostgreSQL database.")
            return test_eng, False
        except Exception as exc:
            logger.warning(
                "Primary database connection failed: %s. Using local SQLite fallback.",
                exc,
            )
            sqlite_db = Path(__file__).resolve().parent / "niyamnetra.db"
            fallback_url = f"sqlite:///{sqlite_db}"
            fb_eng = create_engine(
                fallback_url,
                echo=False,
                future=True,
                connect_args={"check_same_thread": False},
            )
            _apply_sqlite_pragmas(fb_eng)
            import models  # noqa: F401
            Base.metadata.create_all(bind=fb_eng)
            return fb_eng, True
    else:
        eng = create_engine(
            url,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False},
        )
        _apply_sqlite_pragmas(eng)
        return eng, True


engine, _is_using_sqlite = _create_engine_with_fallback()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

