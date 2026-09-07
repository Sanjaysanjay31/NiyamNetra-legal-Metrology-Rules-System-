"""single-use refresh rotation + DB login limiter tables.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-08

Fresh DBs get these via Base.metadata.create_all in 0001; this migration
covers existing DBs.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.create_table(
            "revoked_jtis",
            sa.Column("jti", sa.String(32), primary_key=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), index=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True)),
            sa.Column("reason", sa.String(16), server_default="consumed"),
        )
    except Exception:
        pass
    try:
        op.create_table(
            "login_attempts",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("rate_key", sa.String(80), index=True),
            sa.Column("attempted_at", sa.DateTime(timezone=True)),
            sa.Index("ix_login_attempt_key_ts", "rate_key", "attempted_at"),
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_table("login_attempts")
    except Exception:
        pass
    try:
        op.drop_table("revoked_jtis")
    except Exception:
        pass
