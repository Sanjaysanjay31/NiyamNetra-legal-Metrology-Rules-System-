"""SQLAlchemy 2.0 ORM. Seven tables, per 06_DATABASE.md §3."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Vocabularies. Single definition, used by the CHECK constraints and by tests.
SCAN_RESULTS = ("compliant", "violation", "not_assessed", "out_of_scope")   # C3
VERDICTS = ("pass", "fail", "not_assessed")                                # C2
SEVERITIES = ("critical", "major", "minor", "advisory")
ROLES = ("inspector", "admin")


# ---------------------------------------------------------------- 1. users
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(160), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="inspector")
    jurisdiction: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # C7 — server-issued random 32 bytes, hex. Not IMEI, not a fingerprint.
    install_id: Mapped[str | None] = mapped_column(String(64), index=True)
    install_bound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bumped on password change or forced logout; invalidates live refresh tokens.
    token_epoch: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inspections: Mapped[list[Inspection]] = relationship(back_populates="inspector")

    __table_args__ = (
        CheckConstraint(f"role IN {ROLES}", name="ck_users_role"),
    )
# --------------------------------------------------------------- 2. stores
class Store(Base):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    store_type: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(80))
    district: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str | None] = mapped_column(String(10))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    geofence_radius_m: Mapped[int] = mapped_column(Integer, default=150)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inspections: Mapped[list[Inspection]] = relationship(back_populates="store")


# ---------------------------------------------------------- 3. inspections
class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)

    inspection_date: Mapped[date] = mapped_column(Date, index=True, default=date.today)
    status: Mapped[str] = mapped_column(String(16), default="draft")   # draft|submitted

    # --- scope, per Rule 3 and the retail-sale test (02 §4) ---
    transaction_type: Mapped[str | None] = mapped_column(String(32))
    in_scope: Mapped[bool | None] = mapped_column(Boolean)
    out_of_scope_reason: Mapped[str | None] = mapped_column(Text)

    # --- location assurance ---
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    gps_accuracy_m: Mapped[float | None] = mapped_column(Float)
    geofence_status: Mapped[str | None] = mapped_column(String(16))   # inside|outside|unknown
    geofence_distance_m: Mapped[float | None] = mapped_column(Float)
    geofence_reason: Mapped[str | None] = mapped_column(Text)
    mock_location: Mapped[bool | None] = mapped_column(Boolean)

    # --- offline provenance ---
    local_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    clock_skew_seconds: Mapped[int | None] = mapped_column(Integer)
    edited_offline: Mapped[bool] = mapped_column(Boolean, default=False)

    signature_status: Mapped[str | None] = mapped_column(String(24))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    inspector: Mapped[User] = relationship(back_populates="inspections")
    store: Mapped[Store] = relationship(back_populates="inspections")
    scans: Mapped[list[Scan]] = relationship(back_populates="inspection")

    __table_args__ = (
        CheckConstraint("status IN ('draft','submitted')", name="ck_insp_status"),
        Index("ix_insp_user_date", "user_id", "inspection_date"),
    )
# --------------------------------------------------------------- 4. scans
class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_id: Mapped[int] = mapped_column(ForeignKey("inspections.id"), index=True)

    # --- identification ---
    commodity_generic: Mapped[str | None] = mapped_column(String(120))
    brand_name: Mapped[str | None] = mapped_column(String(120))
    commodity_category: Mapped[str | None] = mapped_column(String(60))
    batch_number: Mapped[str | None] = mapped_column(String(60))
    barcode: Mapped[str | None] = mapped_column(String(64), index=True)

    # --- operator-declared inputs: the answers that decided the scope gates ---
    # Persisted, not merely passed to the engine. Nullable on purpose: NULL is
    # "the officer was not asked / did not answer", which is what makes the
    # dependent check return not_assessed rather than pass. A scan whose flags
    # are not stored cannot be re-assessed or defended six months later —
    # "why did country-of-origin pass?" has no answer if nothing records that
    # the officer said the pack was domestic.
    net_quantity_value: Mapped[float | None] = mapped_column(Float)
    net_quantity_unit: Mapped[str | None] = mapped_column(String(12))
    is_imported: Mapped[bool | None] = mapped_column(Boolean)          # CHK12, country of origin, 6(1)(aa)
    is_perishable: Mapped[bool | None] = mapped_column(Boolean)        # CHK13, best-before, 6(1)(da)
    is_medical_device: Mapped[bool | None] = mapped_column(Boolean)    # CHK14, proviso to Rule 2(h)
    is_tobacco: Mapped[bool | None] = mapped_column(Boolean)           # CHK02 tobacco carve-out under Rule 26(a); CHK17 is the FSSAI advisory
    has_sticker: Mapped[bool | None] = mapped_column(Boolean)          # CHK11, 6(3)-6(4A)
    sticker_reduces_price: Mapped[bool | None] = mapped_column(Boolean)
    sticker_covers_original: Mapped[bool | None] = mapped_column(Boolean)

    # --- the four-state result (C3) ---
    overall_result: Mapped[str] = mapped_column(String(16), default="not_assessed")
    # Which limb of s.36 the violation engages, when it is a violation.
    violation_limb: Mapped[str | None] = mapped_column(String(16))   # 36(1)|36(2)|both
    recommended_action: Mapped[str | None] = mapped_column(String(40))

    # --- denominator, so a partial scan can never read as a clean one (C4/C5) ---
    # 18 assessable checks (CHK18 is the derived Section-36 tier, not an assessed
    # check), so a package scan honestly reports "16 of 18"; C5.
    checks_total: Mapped[int] = mapped_column(Integer, default=18)
    checks_assessed: Mapped[int] = mapped_column(Integer, default=0)

    # --- panel geometry, Rule 7(4) ---
    panel_shape: Mapped[str | None] = mapped_column(String(20))  # rectangular|cylindrical|other
    panel_height_mm: Mapped[float | None] = mapped_column(Float)
    panel_width_mm: Mapped[float | None] = mapped_column(Float)
    panel_diameter_mm: Mapped[float | None] = mapped_column(Float)
    pdp_area_cm2: Mapped[float | None] = mapped_column(Float)
    # Whole-package surface area — a different quantity from the PDP area, and
    # the one Rule 26(a) and the Table-I band lookup read. Storing only
    # pdp_area_cm2 makes the small-package exemption unreproducible.
    total_surface_area_cm2: Mapped[float | None] = mapped_column(Float)
    is_blown_moulded: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- measurement provenance (C14) ---
    mm_per_pixel: Mapped[float | None] = mapped_column(Float)
    scale_source: Mapped[str | None] = mapped_column(String(32))  # declared|id1_card|coin_5inr|none
    mm_per_pixel_uncertainty: Mapped[float | None] = mapped_column(Float)

    # --- rule provenance (C6) ---
    rules_as_at: Mapped[date] = mapped_column(Date)
    catalog_hash: Mapped[str] = mapped_column(String(64))
    engine_version: Mapped[str] = mapped_column(String(16))

    # --- deduplication ---
    duplicate_of: Mapped[int | None] = mapped_column(ForeignKey("scans.id"), index=True)
    instances_recorded: Mapped[int] = mapped_column(Integer, default=1)

    ocr_confidence_mean: Mapped[float | None] = mapped_column(Float)
    ocr_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inspection: Mapped[Inspection] = relationship(back_populates="scans")
    images: Mapped[list[ScanImage]] = relationship(back_populates="scan")
    findings: Mapped[list[Finding]] = relationship(back_populates="scan")

    __table_args__ = (
        CheckConstraint(f"overall_result IN {SCAN_RESULTS}", name="ck_scan_result"),
        CheckConstraint(
            "violation_limb IS NULL OR violation_limb IN ('36(1)','36(2)','both')",
            name="ck_scan_limb",
        ),
        CheckConstraint("checks_assessed <= checks_total", name="ck_scan_denominator"),
        Index("ix_scan_result_created", "overall_result", "created_at"),
    )
# --------------------------------------------------------- 5. scan_images
class ScanImage(Base):
    __tablename__ = "scan_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), index=True)

    panel: Mapped[str] = mapped_column(String(24))   # front|back|side|mrp|batch|other
    sequence: Mapped[int] = mapped_column(Integer, default=0)

    file_path: Mapped[str] = mapped_column(String(400))
    byte_size: Mapped[int] = mapped_column(Integer)
    width_px: Mapped[int] = mapped_column(Integer)
    height_px: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(40))

    # C9 — over the bytes as stored on disk, verifiable by rereading the file.
    sha256: Mapped[str] = mapped_column(String(64), index=True)

    # Banded perceptual hash, 06 §6.3. EIGHT indexed 8-bit bands, not four
    # 16-bit ones. The band index is only a *complete* filter for Hamming
    # distance <= (number of bands - 1): d differing bits touch at most d
    # bands, so k - d >= 1 bands survive identical. With four bands the
    # guarantee stops at distance 3, and the near-duplicate threshold is 5 —
    # bits {5, 9, 16, 38, 50} differ in all four 16-bit bands at distance 5 and
    # would be missed. Eight bands guarantee completeness through distance 7.
    phash: Mapped[str | None] = mapped_column(String(16))
    phash_b0: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b1: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b2: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b3: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b4: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b5: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b6: Mapped[int | None] = mapped_column(Integer, index=True)
    phash_b7: Mapped[int | None] = mapped_column(Integer, index=True)

    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exif_stripped: Mapped[bool] = mapped_column(Boolean, default=False)
    rectified: Mapped[bool] = mapped_column(Boolean, default=False)
    residual_tilt_deg: Mapped[float | None] = mapped_column(Float)
    blur_variance: Mapped[float | None] = mapped_column(Float)
    glare_ratio: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scan: Mapped[Scan] = relationship(back_populates="images")

    __table_args__ = (
        UniqueConstraint("scan_id", "panel", "sequence", name="uq_image_slot"),
    )
# ------------------------------------------------------------- 6. findings
class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), index=True)

    check_id: Mapped[str] = mapped_column(String(8), index=True)   # CHK01..CHK18, CHK06b
    title: Mapped[str] = mapped_column(String(160))

    # C11 — written once by the engine, never updated.
    engine_verdict: Mapped[str] = mapped_column(String(16))
    # A human may disagree. The disagreement is recorded, not substituted.
    human_verdict: Mapped[str | None] = mapped_column(String(16))
    override_reason: Mapped[str | None] = mapped_column(Text)
    overridden_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    overridden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    severity: Mapped[str] = mapped_column(String(16))
    # C2 — mandatory whenever the verdict is not_assessed.
    reason: Mapped[str | None] = mapped_column(Text)

    # Which limb of s.36 this single failure engages. FindingResult carries it
    # and it was previously dropped on persist, which made scans.violation_limb
    # unexplainable: the aggregate said 36(2) and no row said why.
    limb: Mapped[str | None] = mapped_column(String(8))   # 36(1)|36(2), set only on fail

    observed: Mapped[str | None] = mapped_column(Text)
    required: Mapped[str | None] = mapped_column(Text)
    # C15 — the descriptive requirement, or a pinpoint provision only if verified.
    citation: Mapped[str | None] = mapped_column(String(240))
    ledger_ref: Mapped[str | None] = mapped_column(String(8))       # L-01..L-15
    confidence: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scan: Mapped[Scan] = relationship(back_populates="findings")

    __table_args__ = (
        UniqueConstraint("scan_id", "check_id", name="uq_finding_per_check"),
        CheckConstraint(f"engine_verdict IN {VERDICTS}", name="ck_finding_engine_verdict"),
        CheckConstraint(
            f"human_verdict IS NULL OR human_verdict IN {VERDICTS}",
            name="ck_finding_human_verdict",
        ),
        CheckConstraint(f"severity IN {SEVERITIES}", name="ck_finding_severity"),
        # C2 as a database invariant, not a convention.
        CheckConstraint(
            "engine_verdict <> 'not_assessed' OR reason IS NOT NULL",
            name="ck_finding_reason_required",
        ),
        # An advisory item cannot be a failure; a failure cannot be advisory.
        CheckConstraint(
            "NOT (engine_verdict = 'fail' AND severity = 'advisory')",
            name="ck_finding_severity_coherent",
        ),
        # An override must say why.
        CheckConstraint(
            "human_verdict IS NULL OR override_reason IS NOT NULL",
            name="ck_finding_override_reason",
        ),
        # A limb is a property of a failure. Nothing else may carry one.
        CheckConstraint(
            "limb IS NULL OR (engine_verdict = 'fail' AND limb IN ('36(1)','36(2)'))",
            name="ck_finding_limb_only_on_fail",
        ),
        Index("ix_finding_check_verdict", "check_id", "engine_verdict"),
    )

    @property
    def effective_verdict(self) -> str:
        return self.human_verdict or self.engine_verdict
# ----------------------------------------------------------- 7. audit_logs
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, unique=True, index=True)

    # Nullable: user-level actions (login, password change, install rebind)
    # have no inspection. v1.x declared this NOT NULL while its own ERD
    # recorded exactly those actions, so they could not be written at all.
    inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspections.id"), index=True)
    scan_id: Mapped[int | None] = mapped_column(ForeignKey("scans.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)

    action: Mapped[str] = mapped_column(String(48))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(45))   # IPv6 fits in 45
    user_agent: Mapped[str | None] = mapped_column(String(240))

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    hash_prev: Mapped[str | None] = mapped_column(String(64))
    hash_self: Mapped[str] = mapped_column(String(64))

    __table_args__ = (
        Index("ix_audit_ts", "timestamp"),
    )
