"""add e-commerce listing columns to scans (CHK15/16 wiring).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-07

Fresh DBs get these via Base.metadata.create_all in 0001; this migration
covers existing DBs (Supabase/prod) without data loss.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col, typ in (
        ("listing_url", sa.String(500)),
        ("listing_text", sa.Text()),
        ("platform_has_origin_filter", sa.Boolean()),
    ):
        try:
            op.add_column("scans", sa.Column(col, typ, nullable=True))
        except Exception:
            pass  # fresh DBs already have it via create_all


def downgrade() -> None:
    for col in ("platform_has_origin_filter", "listing_text", "listing_url"):
        try:
            op.drop_column("scans", col)
        except Exception:
            pass
