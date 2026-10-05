"""add_missing_phase2_to_phase6_columns

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-05 23:25:00.000000

Adds columns introduced across Phase 2, 3, 4, 5, 6 that were present in ORM models
but missing from migrations for PostgreSQL production deployment.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0009'
down_revision = '0008'
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
    if not _col_exists(bind, "scans", "rule_pack_version"):
        op.add_column("scans", sa.Column("rule_pack_version", sa.String(32), nullable=True))
    if not _col_exists(bind, "scans", "llm_structured_data"):
        op.add_column("scans", sa.Column("llm_structured_data", sa.Text(), nullable=True))
    if not _col_exists(bind, "scans", "llm_cache_hash"):
        op.add_column("scans", sa.Column("llm_cache_hash", sa.String(64), nullable=True))
    if not _col_exists(bind, "scans", "llm_provider"):
        op.add_column("scans", sa.Column("llm_provider", sa.String(32), nullable=True))
    if not _col_exists(bind, "scans", "llm_model"):
        op.add_column("scans", sa.Column("llm_model", sa.String(64), nullable=True))
    if not _col_exists(bind, "scans", "llm_duration_ms"):
        op.add_column("scans", sa.Column("llm_duration_ms", sa.Float(), nullable=True))

    # --- scan_images ---
    if not _col_exists(bind, "scan_images", "analysis_file_path"):
        op.add_column("scan_images", sa.Column("analysis_file_path", sa.String(512), nullable=True))
    if not _col_exists(bind, "scan_images", "rectified_file_path"):
        op.add_column("scan_images", sa.Column("rectified_file_path", sa.String(512), nullable=True))
    if not _col_exists(bind, "scan_images", "similarity_status"):
        op.add_column("scan_images", sa.Column("similarity_status", sa.String(32), nullable=True))
    if not _col_exists(bind, "scan_images", "duplicate_of_image_id"):
        op.add_column("scan_images", sa.Column("duplicate_of_image_id", sa.Integer(), nullable=True))
    if not _col_exists(bind, "scan_images", "hamming_distance"):
        op.add_column("scan_images", sa.Column("hamming_distance", sa.Integer(), nullable=True))

    # --- inspections ---
    if not _col_exists(bind, "inspections", "edited_offline"):
        op.add_column("inspections", sa.Column("edited_offline", sa.Boolean(), nullable=True, server_default=sa.text('false')))
    if not _col_exists(bind, "inspections", "clock_skew_seconds"):
        op.add_column("inspections", sa.Column("clock_skew_seconds", sa.Integer(), nullable=True))
    if not _col_exists(bind, "inspections", "synced_at"):
        op.add_column("inspections", sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True))
    if not _col_exists(bind, "inspections", "local_created_at"):
        op.add_column("inspections", sa.Column("local_created_at", sa.DateTime(timezone=True), nullable=True))

    # --- findings ---
    if not _col_exists(bind, "findings", "ledger_ref"):
        op.add_column("findings", sa.Column("ledger_ref", sa.String(8), nullable=True))
    if not _col_exists(bind, "findings", "observed"):
        op.add_column("findings", sa.Column("observed", sa.Text(), nullable=True))
    if not _col_exists(bind, "findings", "required"):
        op.add_column("findings", sa.Column("required", sa.Text(), nullable=True))
    if not _col_exists(bind, "findings", "citation"):
        op.add_column("findings", sa.Column("citation", sa.String(240), nullable=True))
    if not _col_exists(bind, "findings", "confidence"):
        op.add_column("findings", sa.Column("confidence", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "sqlite":
        return

    cols_to_drop = [
        ("scans", "rule_pack_version"),
        ("scans", "llm_structured_data"),
        ("scans", "llm_cache_hash"),
        ("scans", "llm_provider"),
        ("scans", "llm_model"),
        ("scans", "llm_duration_ms"),
        ("scan_images", "analysis_file_path"),
        ("scan_images", "rectified_file_path"),
        ("scan_images", "similarity_status"),
        ("scan_images", "duplicate_of_image_id"),
        ("scan_images", "hamming_distance"),
        ("inspections", "edited_offline"),
        ("inspections", "clock_skew_seconds"),
        ("inspections", "synced_at"),
        ("inspections", "local_created_at"),
        ("findings", "ledger_ref"),
        ("findings", "observed"),
        ("findings", "required"),
        ("findings", "citation"),
        ("findings", "confidence"),
    ]
    for table, col in cols_to_drop:
        if _col_exists(bind, table, col):
            op.drop_column(table, col)
