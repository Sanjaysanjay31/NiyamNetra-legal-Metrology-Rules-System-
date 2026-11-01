"""ocr_provenance

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-01 12:00:00.000000

Adds durable OCR provenance columns to scans and scan_images.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def _col_exists(bind, table: str, col: str) -> bool:
    try:
        cols = [c["name"] for c in sa.inspect(bind).get_columns(table)]
        return col in cols
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    # --- scans ---
    if not _col_exists(bind, "scans", "ocr_provider"):
        op.add_column("scans", sa.Column("ocr_provider", sa.String(32), nullable=True))
    if not _col_exists(bind, "scans", "ocr_status"):
        op.add_column("scans", sa.Column("ocr_status", sa.String(32), nullable=True))
    if not _col_exists(bind, "scans", "ocr_duration_ms"):
        op.add_column("scans", sa.Column("ocr_duration_ms", sa.Float(), nullable=True))
    if not _col_exists(bind, "scans", "ocr_error"):
        op.add_column("scans", sa.Column("ocr_error", sa.Text(), nullable=True))

    # --- scan_images ---
    if not _col_exists(bind, "scan_images", "ocr_provider"):
        op.add_column("scan_images", sa.Column("ocr_provider", sa.String(32), nullable=True))
    if not _col_exists(bind, "scan_images", "ocr_status"):
        op.add_column("scan_images", sa.Column("ocr_status", sa.String(32), nullable=True))
    if not _col_exists(bind, "scan_images", "ocr_error_code"):
        op.add_column("scan_images", sa.Column("ocr_error_code", sa.String(64), nullable=True))
    if not _col_exists(bind, "scan_images", "ocr_duration_ms"):
        op.add_column("scan_images", sa.Column("ocr_duration_ms", sa.Float(), nullable=True))
    if not _col_exists(bind, "scan_images", "ocr_attempts_json"):
        op.add_column("scan_images", sa.Column("ocr_attempts_json", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    # Drop scan_images columns
    with op.batch_alter_table("scan_images") as batch_op:
        for col in ["ocr_provider", "ocr_status", "ocr_error_code", "ocr_duration_ms", "ocr_attempts_json"]:
            if _col_exists(bind, "scan_images", col):
                batch_op.drop_column(col)

    # Drop scans columns
    with op.batch_alter_table("scans") as batch_op:
        for col in ["ocr_provider", "ocr_status", "ocr_duration_ms", "ocr_error"]:
            if _col_exists(bind, "scans", col):
                batch_op.drop_column(col)

