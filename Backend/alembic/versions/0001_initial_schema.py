"""initial schema - all seven tables, their CHECK constraints, and the
append-only / write-once triggers (10.3).

Revision ID: 0001
Revises: None
Create Date: 2026-08-30

The tables and their named CHECK constraints are emitted by
Base.metadata.create_all on this migration's bind, because create_all
faithfully reproduces the constraints declared in the models' __table_args__.
The triggers that make audit_logs append-only and findings.engine_verdict
write-once cannot be expressed through the ORM, so they are added here by
hand, per dialect.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    from database import Base
    import models  # noqa: F401 - registers all tables on Base.metadata

    Base.metadata.create_all(bind=bind)

    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute(
            "CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs "
            "BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;"
        )
        op.execute(
            "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs "
            "BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;"
        )
        op.execute(
            "CREATE TRIGGER findings_engine_verdict_immutable BEFORE UPDATE ON findings "
            "WHEN OLD.engine_verdict IS NOT NEW.engine_verdict "
            "BEGIN SELECT RAISE(ABORT, 'engine_verdict is written once'); END;"
        )
        # 06 §4.4 — scan_images is append-only (evidence immutability)
        op.execute(
            "CREATE TRIGGER img_no_update BEFORE UPDATE ON scan_images "
            "BEGIN SELECT RAISE(ABORT, 'scan_images is append-only'); END;"
        )
        op.execute(
            "CREATE TRIGGER img_no_delete BEFORE DELETE ON scan_images "
            "BEGIN SELECT RAISE(ABORT, 'scan_images is append-only'); END;"
        )
    elif dialect == "postgresql":
        op.execute(
            "CREATE OR REPLACE FUNCTION deny_write() RETURNS trigger AS $$ "
            "BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ "
            "LANGUAGE plpgsql;"
        )
        op.execute(
            "CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_logs "
            "FOR EACH ROW EXECUTE FUNCTION deny_write();"
        )
        op.execute(
            "CREATE TRIGGER img_no_update BEFORE UPDATE OR DELETE ON scan_images "
            "FOR EACH ROW EXECUTE FUNCTION deny_write();"
        )
        op.execute(
            "CREATE OR REPLACE FUNCTION deny_engine_verdict_change() RETURNS trigger AS $$ "
            "BEGIN IF NEW.engine_verdict IS DISTINCT FROM OLD.engine_verdict THEN "
            "RAISE EXCEPTION 'engine_verdict is written once'; END IF; RETURN NEW; END; $$ "
            "LANGUAGE plpgsql;"
        )
        op.execute(
            "CREATE TRIGGER findings_engine_verdict_immutable BEFORE UPDATE ON findings "
            "FOR EACH ROW EXECUTE FUNCTION deny_engine_verdict_change();"
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS audit_no_update;")
        op.execute("DROP TRIGGER IF EXISTS audit_no_delete;")
        op.execute("DROP TRIGGER IF EXISTS findings_engine_verdict_immutable;")
        op.execute("DROP TRIGGER IF EXISTS img_no_update;")
        op.execute("DROP TRIGGER IF EXISTS img_no_delete;")
    elif dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS audit_no_update ON audit_logs;")
        op.execute("DROP TRIGGER IF EXISTS img_no_update ON scan_images;")
        op.execute("DROP TRIGGER IF EXISTS findings_engine_verdict_immutable ON findings;")
        op.execute("DROP FUNCTION IF EXISTS deny_write();")
        op.execute("DROP FUNCTION IF EXISTS deny_engine_verdict_change();")

    from database import Base
    import models  # noqa: F401 - registers all tables on Base.metadata

    Base.metadata.drop_all(bind=bind)
