"""Engine, session factory, and the per-connection SQLite pragmas."""
from collections.abc import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    # check_same_thread is a SQLite-only argument
    connect_args={"check_same_thread": False} if settings.is_sqlite else {},
    pool_pre_ping=not settings.is_sqlite,
)

if settings.is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        """PRAGMA state is per connection and resets on every new one.

        foreign_keys defaults to OFF in SQLite. Issued once in a setup script
        it protects nothing: the pooled connections that serve real requests
        never saw it, and every declared foreign key is decorative.
        """
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
