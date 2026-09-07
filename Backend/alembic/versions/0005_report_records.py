"""generated report archive list.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-08

Fresh DBs get it via Base.metadata.create_all in 0001.
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.create_table(
            "report_records",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("generated_by", sa.Integer, sa.ForeignKey("users.id"), index=True),
            sa.Column("kind", sa.String(16)),
            sa.Column("fmt", sa.String(8)),
            sa.Column("label", sa.String(160)),
            sa.Column("file_sha256", sa.String(64), nullable=True),
            sa.Column("byte_size", sa.Integer, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Index("ix_report_created", "created_at"),
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_table("report_records")
    except Exception:
        pass
