"""idempotency replay store + evidence-retention deny-delete trigger.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-10

Two changes, one retention story:

1. idempotency_keys — durable replay for the offline sync queue (09 T14,
   11 §2.4). The App sends an Idempotency-Key with every write and reuses the
   queue item id across retries; until now the server only CORS-allowlisted
   the header, so a retried POST whose response was lost created a duplicate
   inspection/scan.

2. img_no_delete — restores the deny-delete trigger on scan_images that 0001
   deliberately omitted while the assess endpoint auto-purged compliant /
   out_of_scope photos. The purge is gone (evidence is retained per
   06_DATABASE §9.5: five years, deletion only as a documented administrative
   operation), so the trigger the schema documentation describes is real.

Fresh databases: 0001 runs Base.metadata.create_all, which now includes the
idempotency_keys table from models.py — hence the existence guard below.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, "idempotency_keys"):
        op.create_table(
            "idempotency_keys",
            sa.Column("key", sa.String(64), primary_key=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), index=True),
            sa.Column("fingerprint", sa.String(255)),
            sa.Column("status_code", sa.Integer),
            sa.Column("response_body", sa.Text),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Index("ix_idem_created", "created_at"),
        )

    dialect = bind.dialect.name
    if dialect == "sqlite":
        op.execute(
            "CREATE TRIGGER IF NOT EXISTS img_no_delete BEFORE DELETE ON scan_images "
            "BEGIN SELECT RAISE(ABORT, 'scan_images is append-only'); END;"
        )
    elif dialect == "postgresql":
        # deny_write() is created by 0001; (re)create defensively so this
        # migration never depends on migration order for the helper function.
        op.execute(
            "CREATE OR REPLACE FUNCTION deny_write() RETURNS trigger AS $$ "
            "BEGIN RAISE EXCEPTION '% is append-only, table=%', TG_OP, TG_TABLE_NAME; END; $$ "
            "LANGUAGE plpgsql;"
        )
        op.execute("DROP TRIGGER IF EXISTS img_no_delete ON scan_images;")
        op.execute(
            "CREATE TRIGGER img_no_delete BEFORE DELETE ON scan_images "
            "FOR EACH ROW EXECUTE FUNCTION deny_write();"
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS img_no_delete;")
    elif dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS img_no_delete ON scan_images;")
    try:
        op.drop_table("idempotency_keys")
    except Exception:
        pass
