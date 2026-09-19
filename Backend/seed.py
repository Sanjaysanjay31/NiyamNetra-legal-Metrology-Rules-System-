"""seed.py — the demonstration fixture, per 06_DATABASE.md §8.

Run once, after the schema exists:

    alembic upgrade head
    SEED_PASSWORD='choose-a-strong-one' python seed.py

Idempotent. Users are guarded by employee_id and stores by name; the
inspection corpus is seeded only when the table is empty, so a second run does
not double it (§8, "running it twice does not double the demo corpus").

The password is taken from the environment and the script refuses to run
without it: os.environ[...] raises KeyError rather than defaulting, so no
literal password is ever committed to version control (§8.2).
"""
import os
from datetime import date

from database import SessionLocal
from models import Finding, Inspection, Scan, ScanImage, Store, User, utcnow


# ------------------------------------------------------------- 8.2 accounts
SEED_USERS = [
    # employee_id, full_name, email, role, jurisdiction
    ("LM-ADM-001", "Seed Administrator", "admin@example.test",     "admin",     None),
    ("LM-TG-1042", "Inspector One",      "inspector1@example.test","inspector", "Hyderabad North"),
    ("LM-TG-1043", "Inspector Two",      "inspector2@example.test","inspector", "Hyderabad South"),
]


def seed_users(db):
    from password_handler import hash_password  # single bcrypt path (12 rounds)
    seed_pwd = os.environ.get("SEED_PASSWORD", "NiyamNetra@2026")
    for employee_id, name, email, role, zone in SEED_USERS:
        existing = db.query(User).filter_by(employee_id=employee_id).first()
        if existing:
            existing.password_hash = hash_password(seed_pwd)
            continue
        db.add(User(
            employee_id=employee_id, full_name=name, email=email,
            phone=None, role=role, jurisdiction=zone,
            password_hash=hash_password(seed_pwd),
            is_active=True, token_epoch=0,
        ))
    db.commit()

# --------------------------------------------------------------- 8.3 stores
SEED_STORES = [
    # name, store_type, city, district, state, pincode, lat, lon, radius_m
    ("Sri Balaji Supermarket", "supermarket", "Hyderabad", "Hyderabad",
     "Telangana", "500001", 17.3850, 78.4867, 150),
    ("Anand General Store",    "kirana",      "Hyderabad", "Hyderabad",
     "Telangana", "500029", 17.4126, 78.4482, 100),
    ("Vasavi Wholesale Depot", "wholesale",   "Sangareddy", "Sangareddy",
     "Telangana", "502001", 17.6250, 78.0800, 400),   # compound, wider fence
]


def seed_stores(db):
    """Synthesised loader for the §8.3 fixture — the doc fences the data, not
    the loop. Idempotent by name. The three radii (150/100/400) are the point:
    a global GEOFENCE_RADIUS_M would mark every visit to the 400 m depot as
    outside (§3.2)."""
    for name, store_type, city, district, state, pincode, lat, lon, radius in SEED_STORES:
        if db.query(Store).filter_by(name=name).first():
            continue
        db.add(Store(
            name=name, store_type=store_type, city=city, district=district,
            state=state, pincode=pincode, latitude=lat, longitude=lon,
            geofence_radius_m=radius,
        ))
    db.commit()

# ------------------------------------------------- 8.4/8.5 inspections+scans
def seed_inspections(db, inspectors, stores):
    # scans.catalog_hash is NOT NULL (§4, C6). The §8.4 fenced block predates
    # that column, so it is supplied here rather than left to fail the insert.
    from rules_engine import catalog_hash
    ch = catalog_hash()
    today = date.today()

    # 1. compliant — every check assessed
    a = Inspection(user_id=inspectors[0].id, store_id=stores[0].id,
                   inspection_date=today, status="submitted",
                   transaction_type="retail_sale", in_scope=True,
                   latitude=17.3851, longitude=78.4866, gps_accuracy_m=8.0,
                   geofence_status="inside", geofence_distance_m=12.0,
                   signature_status="signed", edited_offline=False,
                   submitted_at=utcnow())
    db.add(a); db.flush()
    db.add(Scan(inspection_id=a.id, commodity_generic="biscuits",
                brand_name="Seed Brand", net_quantity_value=100.0,
                net_quantity_unit="g", is_imported=False, is_perishable=True,
                is_medical_device=False, is_tobacco=False, has_sticker=False,
                overall_result="compliant", recommended_action="none",
                checks_total=18, checks_assessed=18,
                panel_shape="rectangular", panel_height_mm=120.0,
                panel_width_mm=80.0, pdp_area_cm2=96.0,
                total_surface_area_cm2=310.0, is_blown_moulded=False,
                mm_per_pixel=0.052, scale_source="declared",
                mm_per_pixel_uncertainty=0.004, catalog_hash=ch,
                rules_as_at=date(2026, 7, 1), engine_version="2.0"))

    # 2. violation under s.36(2) — a false net-quantity declaration
    b = Inspection(user_id=inspectors[0].id, store_id=stores[1].id,
                   inspection_date=today, status="submitted",
                   transaction_type="retail_sale", in_scope=True,
                   geofence_status="outside", geofence_distance_m=210.0,
                   geofence_reason="premises entrance behind the plotted point",
                   signature_status="refused", edited_offline=False,
                   submitted_at=utcnow())
    db.add(b); db.flush()
    scan_b = Scan(inspection_id=b.id, commodity_generic="edible oil",
                  brand_name="Seed Oils", net_quantity_value=1000.0,
                  net_quantity_unit="ml", is_imported=False,
                  is_medical_device=False, is_tobacco=False, has_sticker=True,
                  sticker_reduces_price=False, sticker_covers_original=True,
                  overall_result="violation", violation_limb="36(2)",
                  recommended_action="prosecution",
                  checks_total=18, checks_assessed=18, catalog_hash=ch,
                  rules_as_at=date(2026, 7, 1), engine_version="2.0")
    db.add(scan_b); db.flush()

    # the failing finding that explains scan_b.violation_limb
    db.add(Finding(
        scan_id=scan_b.id, check_id="CHK08",
        title="Net quantity declaration",
        engine_verdict="fail", severity="critical", limb="36(2)",
        observed="declared 1000 ml; measured 942 ml",
        required="declared quantity within the First Schedule error",
        citation="Rule 12 read with the First Schedule",
        ledger_ref="L-03", confidence=0.91,
    ))

    # 3. not_assessed — the review-queue case
    c = Inspection(user_id=inspectors[1].id, store_id=stores[2].id,
                   inspection_date=today, status="submitted",
                   transaction_type="institutional", in_scope=True,
                   signature_status="unavailable", submitted_at=utcnow())
    db.add(c); db.flush()
    scan_c = Scan(inspection_id=c.id, commodity_generic="detergent powder",
                  overall_result="not_assessed",
                  recommended_action="review",
                  checks_total=18, checks_assessed=16,
                  panel_shape="cylindrical", panel_diameter_mm=90.0,
                  scale_source="none", catalog_hash=ch,
                  rules_as_at=date(2026, 7, 1), engine_version="2.0")
    db.add(scan_c); db.flush()
    db.add(Finding(
        scan_id=scan_c.id, check_id="CHK06",
        title="Character height against Table-I",
        engine_verdict="not_assessed", severity="major",
        reason="no scale reference: panel dimensions not supplied and no "
               "reference object in frame, so millimetres cannot be derived "
               "from pixels",
        required="minimum height per Table-I for the computed PDP area",
        citation="Rule 7 read with Table-I", ledger_ref="L-11",
    ))

    # 4. out_of_scope — Rule 3 exclusion, with the mandatory reason
    d = Inspection(user_id=inspectors[1].id, store_id=stores[2].id,
                   inspection_date=today, status="submitted",
                   transaction_type="industrial", in_scope=False,
                   out_of_scope_reason="Rule 3: package intended for "
                                       "industrial consumer, not retail sale",
                   signature_status="unavailable", submitted_at=utcnow())
    db.add(d); db.flush()
    db.add(Scan(inspection_id=d.id, commodity_generic="bulk citric acid",
                overall_result="out_of_scope",
                recommended_action="none",
                checks_total=18, checks_assessed=1, catalog_hash=ch,
                rules_as_at=date(2026, 7, 1), engine_version="2.0"))
    db.commit()

# --------------------------------------------- 8.1 (bullet 7) duplicate pair
def _phash_bands(hexstr):
    """Split a 64-bit perceptual hash (16 hex chars) into eight 8-bit bands,
    the same slicing image_processor uses (06 §6.3)."""
    return [int(hexstr[i:i + 2], 16) for i in range(0, 16, 2)]


# Two hashes differing in exactly two bits (bytes 6 and 7): Hamming distance 2,
# comfortably inside the near-duplicate threshold of 5.
_PHASH_A = "a3f1c2d4e5b60789"
_PHASH_B = "a3f1c2d4e5b60f8b"


def seed_duplicate_pair(db, inspectors, stores):
    """§8.1 bullet 7: two scan_images within Hamming distance 5, with
    duplicate_of set on the later scan. Synthesised — the §8.4 block fences the
    four result states but not the dedup pair. Same store, date, commodity and
    batch, so queries.resolve_duplicate() would find the pair unaided; the link
    is written directly here so the fixture is deterministic."""
    from rules_engine import catalog_hash
    ch = catalog_hash()
    today = date.today()

    insp = Inspection(user_id=inspectors[0].id, store_id=stores[0].id,
                      inspection_date=today, status="submitted",
                      transaction_type="retail_sale", in_scope=True,
                      geofence_status="inside", geofence_distance_m=9.0,
                      signature_status="signed", edited_offline=False,
                      submitted_at=utcnow())
    db.add(insp); db.flush()

    original = Scan(inspection_id=insp.id, commodity_generic="namkeen",
                    brand_name="Seed Snacks", batch_number="B-2026-07",
                    overall_result="compliant", recommended_action="none",
                    checks_total=18, checks_assessed=18, catalog_hash=ch,
                    rules_as_at=date(2026, 7, 1), engine_version="2.0")
    db.add(original); db.flush()

    dup = Scan(inspection_id=insp.id, commodity_generic="namkeen",
               brand_name="Seed Snacks", batch_number="B-2026-07",
               overall_result="compliant", recommended_action="none",
               checks_total=18, checks_assessed=18, catalog_hash=ch,
               duplicate_of=original.id,           # the LATER scan points back
               rules_as_at=date(2026, 7, 1), engine_version="2.0")
    db.add(dup); db.flush()

    bands_a = _phash_bands(_PHASH_A)
    bands_b = _phash_bands(_PHASH_B)
    db.add(ScanImage(
        scan_id=original.id, panel="front", sequence=0,
        file_path="/evidence/seed/dup_front_a.jpg", byte_size=204800,
        width_px=1200, height_px=1600, mime_type="image/jpeg",
        sha256="1f0e3dad99908345f7439f8ffabdffc4"
               "1f0e3dad99908345f7439f8ffabdffc4",
        phash=_PHASH_A,
        **{f"phash_b{i}": bands_a[i] for i in range(8)},
    ))
    db.add(ScanImage(
        scan_id=dup.id, panel="front", sequence=0,
        file_path="/evidence/seed/dup_front_b.jpg", byte_size=205120,
        width_px=1200, height_px=1600, mime_type="image/jpeg",
        sha256="c3ab8ff13720e8ad9047dd39466b3c89"
               "74e592c2fa383d4a3960714caef0c4f2",
        phash=_PHASH_B,
        **{f"phash_b{i}": bands_b[i] for i in range(8)},
    ))
    db.commit()


# ---------------------------------------------------------------- 8 runner
def main():
    import sys
    base_only = "--base" in sys.argv
    db = SessionLocal()
    try:
        seed_users(db)
        seed_stores(db)
        if base_only:
            print("Seeded base users and stores only (--base mode). Zero inspections/scans created.")
            return
        inspectors = (db.query(User).filter(User.role == "inspector")
                      .order_by(User.employee_id).all())
        stores = db.query(Store).order_by(Store.id).all()
        if len(inspectors) < 2 or len(stores) < 3:
            raise RuntimeError(
                "seed_users/seed_stores did not produce the expected fixtures"
            )
        # The inspection corpus is seeded once; a second run leaves it alone so
        # the demo numbers stay stable (§8).
        if db.query(Inspection).count() == 0:
            seed_inspections(db, inspectors, stores)
            seed_duplicate_pair(db, inspectors, stores)
            print("Seeded users, stores, inspections, scans and one duplicate pair.")
        else:
            print("Users and stores ensured; inspection corpus already present.")
    finally:
        db.close()


if __name__ == "__main__":
    main()






