"""Alembic migration environment for NiyamNetra.

The database URL is not stored in alembic.ini. It is read at runtime from
config.settings.DATABASE_URL, so the .env remains the single source of truth
and no credential lands in a versioned file. Batch mode is enabled on SQLite
so that ALTER-heavy migrations can be rendered as table rebuilds.
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

from config import settings
from database import Base
import models  # noqa: F401 - imported so every table registers on Base.metadata

# The Alembic Config object provides access to the values in alembic.ini.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the URL at runtime; the .env is the single source of truth.
# As a DEFAULT only: a caller that set sqlalchemy.url explicitly (tests pass
# an isolated database URL via alembic.Config) must get the database it asked
# for. This line previously overwrote every explicit value unconditionally, so
# `command.upgrade` in the test suite migrated one database while the tests
# inspected another — silently empty, and every assertion on real rows was
# really running against whatever settings.DATABASE_URL happened to be.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Metadata that 'autogenerate' compares against.
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode, emitting SQL without a DBAPI connection."""
    url = config.get_main_option("sqlalchemy.url") or settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=settings.is_sqlite,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with a live database connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=settings.is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
