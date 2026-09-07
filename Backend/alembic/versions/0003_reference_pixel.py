"""persist reference_pixel_size on scans (scale reproducibility).

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-08

Was a transient instance attr (lost across restarts); now a nullable column.
Fresh DBs get it via create_all in 0001.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column("scans", sa.Column("reference_pixel_size", sa.Float(), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column("scans", "reference_pixel_size")
    except Exception:
        pass
