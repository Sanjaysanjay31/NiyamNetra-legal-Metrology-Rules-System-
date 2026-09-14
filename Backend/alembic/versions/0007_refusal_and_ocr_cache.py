"""OCR result cache + refusal rollup support.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-14

Two additive changes:

1. scans.ocr_cache_hash (String 64, nullable) — SHA-256 fingerprint of the
   sorted (panel, sha256) image set at the time the OCR was last run.
   Re-assessments compare this against the current image set; a hit means the
   cached OcrLines in ocr_cache are reused and the cloud-OCR round-trip is
   skipped entirely.

2. scans.ocr_cache (Text, nullable) — JSON blob carrying the full OcrResult
   (engine, mean_confidence, lines list). Kept small (~20-60 KB per scan);
   no cleanup task is required.

No refusal column is needed: Inspection.signature_status already exists.
"""
from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def _col_exists(bind, table: str, col: str) -> bool:
    cols = [c["name"] for c in sa.inspect(bind).get_columns(table)]
    return col in cols


def upgrade() -> None:
    bind = op.get_bind()
    if not _col_exists(bind, "scans", "ocr_cache_hash"):
        op.add_column("scans", sa.Column("ocr_cache_hash", sa.String(64), nullable=True))
    if not _col_exists(bind, "scans", "ocr_cache"):
        op.add_column("scans", sa.Column("ocr_cache", sa.Text, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "sqlite":
        # SQLite does not support DROP COLUMN in older versions; warn and skip.
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "SQLite: ocr_cache_hash / ocr_cache columns left in place (no DROP COLUMN)."
        )
    else:
        if _col_exists(bind, "scans", "ocr_cache"):
            op.drop_column("scans", "ocr_cache")
        if _col_exists(bind, "scans", "ocr_cache_hash"):
            op.drop_column("scans", "ocr_cache_hash")
