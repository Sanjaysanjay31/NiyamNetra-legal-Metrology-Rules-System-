"""seed_workflow.py — seed a live in-progress inspection (INS-1023) for testing the end-to-end inspector -> admin workflow.
Ensures INS-1023 has exactly 5 products: 2 violations and 3 compliant.
"""
from datetime import date, datetime, timezone
from pathlib import Path
from database import SessionLocal
from models import Finding, Inspection, Scan, ScanImage, Store, User, utcnow


def ensure_demo_image(path_str: str, label: str):
    p = Path(path_str)
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        try:
            from PIL import Image, ImageDraw
            img = Image.new("RGB", (640, 640), color=(15, 42, 68))
            draw = ImageDraw.Draw(img)
            draw.rectangle([10, 10, 630, 630], outline=(180, 200, 220), width=3)
            draw.text((40, 50), "NIYAMNETRA COMPLIANCE EVIDENCE", fill=(255, 255, 255))
            draw.text((40, 90), f"PANEL: {label.upper()}", fill=(245, 158, 11))
            draw.text((40, 130), f"TIMESTAMP: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", fill=(200, 210, 220))
            draw.text((40, 170), "GRID: CALIBRATED 1.0mm/px", fill=(160, 180, 200))
            img.save(p, format="JPEG", quality=80)
        except Exception as e:
            print(f"Could not generate demo image {p}: {e}")



def main():
    db = SessionLocal()
    try:
        inspector1 = db.query(User).filter_by(employee_id="LM-TG-1042").first()
        if not inspector1:
            print("[x] Inspector One (LM-TG-1042) not found. Run seed.py first.")
            return

        store = db.query(Store).filter(Store.name.ilike("%Anand General Store%")).first()
        if not store:
            store = db.query(Store).first()

        # Check if inspection 1023 exists
        test_insp = db.get(Inspection, 1023)
        if not test_insp:
            test_insp = Inspection(
                id=1023,
                user_id=inspector1.id,
                store_id=store.id,
                inspection_date=date.today(),
                status="draft",
                transaction_type="retail_sale",
                in_scope=True,
                latitude=17.4126,
                longitude=78.4482,
                gps_accuracy_m=5.0,
                geofence_status="inside",
                geofence_distance_m=10.0,
                signature_status="signed",
                edited_offline=False,
                notes="Initial routine compliance review at Anand General Store.",
                submitted_at=None,
            )
            db.add(test_insp)
            db.flush()
        else:
            test_insp.status = "draft"
            test_insp.submitted_at = None
            db.flush()        # Get existing scans for 1023
        existing_scans = db.query(Scan).filter(Scan.inspection_id == test_insp.id).order_by(Scan.id.asc()).all()

        products_spec = [
            # 1. Tastemaker Salt Chips (Violation)
            {
                "commodity_generic": "Tastemaker Salt Chips",
                "brand_name": "CrunchTime",
                "commodity_category": "packaged_food",
                "batch_number": "B-2026-X8",
                "barcode": "8901030895123",
                "net_quantity_value": 50.0,
                "net_quantity_unit": "g",
                "overall_result": "violation",
                "violation_limb": "36(1)",
                "recommended_action": "notice",
                "checks_total": 18,
                "checks_assessed": 16,
                "panel_shape": "rectangular",
                "panel_height_mm": 160.0,
                "panel_width_mm": 100.0,
                "pdp_area_cm2": 160.0,
                "total_surface_area_cm2": 450.0,
                "panels": ["front", "back", "mrp", "barcode"],
                "checks": [
                    ("CHK01", "Net Quantity Declaration", "pass", "advisory", "50 g declared on Principal Display Panel", "Rule 6(1)(c), Legal Metrology Rules, 2011", None, None),
                    ("CHK02", "Unit of Measurement", "pass", "advisory", "'g' (grams) - Standard SI symbol", "Rules 12-13 read with First Schedule", None, None),
                    ("CHK03", "MRP Declaration", "fail", "critical", "Rs 20.00 sticker affixed over printed Rs 18.00", "Rule 6(1)(e) read with Rule 2(m)", "Retail sale price sticker affixed over original printed MRP.", "36(1)"),
                    ("CHK04", "Manufacturer / Packer Details", "pass", "minor", "XYZ Foods Pvt Ltd, Pune, Maharashtra", "Rule 6(1)(a) and Rule 6(1)(b)", None, None),
                    ("CHK05", "Consumer Care Contact", "fail", "major", "Missing telephone helpline number", "Rule 6(1)(n)", "Mandatory consumer grievance redressal telephone number absent.", "36(1)"),
                    ("CHK06", "Character Height against Table-I", "not_assessed", "major", "1.12 mm font size detected on PDP", "Rule 7 read with Table-I", "no scale reference: panel dimensions not supplied", None),
                    ("CHK07", "Principal Display Panel Area", "pass", "advisory", "PDP area 160 cm2 computed from dimensions", "Rule 7(4) and Rule 2(h)", None, None),
                    ("CHK08", "Standard Pack Sizes", "pass", "advisory", "50 g standard quantity", "Second Schedule, Packaged Commodities Rules", None, None),
                    ("CHK09", "Dual Units of Measurement", "pass", "advisory", "Metric units only; non-metric absent", "Rule 13(5)", None, None),
                    ("CHK10", "Date of Manufacture / Packing", "pass", "minor", "Mfg Date: 12/2025; Batch B-2026-X8", "Rule 6(1)(d)", None, None),
                    ("CHK11", "Stickers and Corrections", "fail", "critical", "Price sticker affixed altering retail price upward", "Rule 6(3) read with Rule 6(4A)", "Sticker obscures statutory declaration and increases price.", "36(2)"),
                    ("CHK12", "Country of Origin", "not_assessed", "major", "Not visible on submitted package panels", "Rule 6(1)(aa)", "Country of origin declaration could not be verified from front panel image", None),
                    ("CHK13", "Best Before / Expiry Period", "pass", "advisory", "Best before 6 months from packaging", "Rule 6(1)(da)", None, None),
                    ("CHK14", "Proviso to Rule 2(h)", "pass", "advisory", "Retail commercial package in normal trade", "Rule 2(h) Proviso", None, None),
                    ("CHK15", "E-Commerce Name and Address", "pass", "advisory", "In-store retail inspection (Not applicable)", "Rule 6(10)", None, None),
                    ("CHK16", "E-Commerce Declarations", "pass", "advisory", "In-store retail inspection", "Rule 6(11)", None, None),
                    ("CHK17", "FSSAI / Statutory Advisory", "pass", "advisory", "FSSAI Lic. No. 10014022003112 declared", "Advisory FSSAI regulations", None, None),
                    ("CHK18", "Section 36 Penalty Tier", "fail", "critical", "Engages Section 36(1) and Section 36(2)", "Section 36 Legal Metrology Act, 2009", "Compounding or prosecution recommended for altered price.", "36(1)"),
                ]
            },
            # 2. Edible Sunflower Oil (Violation)
            {
                "commodity_generic": "Edible Sunflower Oil",
                "brand_name": "SunPure",
                "commodity_category": "edible_oils",
                "batch_number": "SO-2026-99",
                "barcode": "8902040510023",
                "net_quantity_value": 1000.0,
                "net_quantity_unit": "ml",
                "overall_result": "violation",
                "violation_limb": "36(1)",
                "recommended_action": "notice",
                "checks_total": 18,
                "checks_assessed": 17,
                "panel_shape": "cylindrical",
                "panel_height_mm": 240.0,
                "panel_width_mm": 90.0,
                "pdp_area_cm2": 216.0,
                "total_surface_area_cm2": 720.0,
                "checks": [
                    ("CHK01", "Net Quantity Declaration", "fail", "critical", "Volume declared without weight equivalent: 1000 ml", "Second Schedule read with Rule 12", "Edible oil must declare equivalent mass in grams or kilograms.", "36(1)"),
                    ("CHK02", "Unit of Measurement", "pass", "advisory", "'ml' standard SI symbol", "Rules 12-13 read with First Schedule", None, None),
                    ("CHK03", "MRP Declaration", "pass", "minor", "MRP Rs 145.00 (inclusive of all taxes)", "Rule 6(1)(e)", None, None),
                    ("CHK04", "Manufacturer / Packer Details", "pass", "minor", "SunPure Agro Foods Ltd, IDA Uppal, Hyderabad", "Rule 6(1)(a)", None, None),
                    ("CHK05", "Consumer Care Contact", "pass", "minor", "Helpline: 1800-425-9999, care@sunpure.test", "Rule 6(1)(n)", None, None),
                    ("CHK06", "Character Height against Table-I", "pass", "advisory", "Font size 4.2 mm exceeds Table-I requirement (4.0 mm)", "Rule 7 read with Table-I", None, None),
                    ("CHK07", "Principal Display Panel Area", "pass", "advisory", "PDP conforms to 40% surface area", "Rule 7(4)", None, None),
                    ("CHK08", "Standard Pack Sizes", "pass", "advisory", "1000 ml permissible package size", "Second Schedule", None, None),
                    ("CHK09", "Dual Units of Measurement", "pass", "advisory", "Metric units only", "Rule 13(5)", None, None),
                    ("CHK10", "Date of Manufacture / Packing", "pass", "minor", "Packed on 01/2026", "Rule 6(1)(d)", None, None),
                    ("CHK11", "Stickers and Corrections", "pass", "minor", "No unauthorized stickers found", "Rule 6(3)", None, None),
                    ("CHK12", "Country of Origin", "pass", "minor", "Country of Origin: India", "Rule 6(1)(aa)", None, None),
                    ("CHK13", "Best Before / Expiry Period", "pass", "advisory", "Best before 9 months from packaging", "Rule 6(1)(da)", None, None),
                    ("CHK14", "Proviso to Rule 2(h)", "pass", "advisory", "Retail commercial package in normal trade", "Rule 2(h) Proviso", None, None),
                    ("CHK15", "E-Commerce Name and Address", "pass", "advisory", "Physical retail premises", "Rule 6(10)", None, None),
                    ("CHK16", "E-Commerce Declarations", "pass", "advisory", "Physical retail premises", "Rule 6(11)", None, None),
                    ("CHK17", "FSSAI / Statutory Advisory", "pass", "advisory", "FSSAI Lic. No. 10018044001923", "FSSAI Regulations", None, None),
                    ("CHK18", "Section 36 Penalty Tier", "fail", "major", "Engages Section 36(1) for non-standard declaration", "Section 36 Legal Metrology Act, 2009", "Compoundable notice under Section 36(1).", "36(1)"),
                ]
            },
            # 3. Whole Wheat Atta (Compliant)
            {
                "commodity_generic": "Whole Wheat Atta",
                "brand_name": "Aashirvaad",
                "commodity_category": "packaged_food",
                "batch_number": "ATT-2026-04",
                "barcode": "8901725181222",
                "net_quantity_value": 5.0,
                "net_quantity_unit": "kg",
                "overall_result": "compliant",
                "violation_limb": None,
                "recommended_action": "none",
                "checks_total": 18,
                "checks_assessed": 18,
                "panel_shape": "rectangular",
                "panel_height_mm": 350.0,
                "panel_width_mm": 240.0,
                "pdp_area_cm2": 840.0,
                "total_surface_area_cm2": 2100.0,
                "checks": [
                    ("CHK01", "Net Quantity Declaration", "pass", "advisory", "Net Quantity 5 kg clearly declared", "Rule 6(1)(c)", None, None),
                    ("CHK02", "Unit of Measurement", "pass", "advisory", "'kg' standard SI symbol", "Rules 12-13", None, None),
                    ("CHK03", "MRP Declaration", "pass", "minor", "MRP Rs 275.00 (incl. of all taxes)", "Rule 6(1)(e)", None, None),
                    ("CHK04", "Manufacturer / Packer Details", "pass", "minor", "ITC Limited, 37 J.L. Nehru Road, Kolkata", "Rule 6(1)(a)", None, None),
                    ("CHK05", "Consumer Care Contact", "pass", "minor", "Toll free 1800-345-8888, itccares@itc.in", "Rule 6(1)(n)", None, None),
                    ("CHK06", "Character Height against Table-I", "pass", "advisory", "Font size 6.5 mm meets Table-I requirement (6.0 mm)", "Rule 7 read with Table-I", None, None),
                    ("CHK07", "Principal Display Panel Area", "pass", "advisory", "PDP area conforms to requirement", "Rule 7(4)", None, None),
                    ("CHK08", "Standard Pack Sizes", "pass", "advisory", "5 kg standard pack size", "Second Schedule", None, None),
                    ("CHK09", "Dual Units of Measurement", "pass", "advisory", "Metric units only", "Rule 13(5)", None, None),
                    ("CHK10", "Date of Manufacture / Packing", "pass", "minor", "Mfg Date: 02/2026", "Rule 6(1)(d)", None, None),
                    ("CHK11", "Stickers and Corrections", "pass", "minor", "No stickers found", "Rule 6(3)", None, None),
                    ("CHK12", "Country of Origin", "pass", "minor", "Country of Origin: India", "Rule 6(1)(aa)", None, None),
                    ("CHK13", "Best Before / Expiry Period", "pass", "advisory", "Best before 3 months from packaging", "Rule 6(1)(da)", None, None),
                    ("CHK14", "Proviso to Rule 2(h)", "pass", "advisory", "Retail commercial package in normal trade", "Rule 2(h) Proviso", None, None),
                    ("CHK15", "E-Commerce Name and Address", "pass", "advisory", "Physical retail premises", "Rule 6(10)", None, None),
                    ("CHK16", "E-Commerce Declarations", "pass", "advisory", "Physical retail premises", "Rule 6(11)", None, None),
                    ("CHK17", "FSSAI / Statutory Advisory", "pass", "advisory", "FSSAI Lic. No. 10012031000312", "FSSAI Regulations", None, None),
                    ("CHK18", "Section 36 Penalty Tier", "pass", "advisory", "Compliant under Section 36", "Section 36 Legal Metrology Act, 2009", None, None),
                ]
            },
            # 4. Basmati Rice (Compliant)
            {
                "commodity_generic": "Basmati Rice",
                "brand_name": "India Gate",
                "commodity_category": "packaged_food",
                "batch_number": "BGR-2026-11",
                "barcode": "8901414000109",
                "net_quantity_value": 1.0,
                "net_quantity_unit": "kg",
                "overall_result": "compliant",
                "violation_limb": None,
                "recommended_action": "none",
                "checks_total": 18,
                "checks_assessed": 18,
                "panel_shape": "rectangular",
                "panel_height_mm": 260.0,
                "panel_width_mm": 180.0,
                "pdp_area_cm2": 468.0,
                "total_surface_area_cm2": 1100.0,
                "checks": [
                    ("CHK01", "Net Quantity Declaration", "pass", "advisory", "Net Quantity 1 kg clearly declared", "Rule 6(1)(c)", None, None),
                    ("CHK02", "Unit of Measurement", "pass", "advisory", "'kg' standard SI symbol", "Rules 12-13", None, None),
                    ("CHK03", "MRP Declaration", "pass", "minor", "MRP Rs 160.00 (inclusive of all taxes)", "Rule 6(1)(e)", None, None),
                    ("CHK04", "Manufacturer / Packer Details", "pass", "minor", "KRBL Limited, Gautam Budh Nagar, UP", "Rule 6(1)(a)", None, None),
                    ("CHK05", "Consumer Care Contact", "pass", "minor", "Customercare@krblindia.com, 1800-102-7722", "Rule 6(1)(n)", None, None),
                    ("CHK06", "Character Height against Table-I", "pass", "advisory", "Font size 4.5 mm complies with Table-I", "Rule 7 read with Table-I", None, None),
                    ("CHK07", "Principal Display Panel Area", "pass", "advisory", "PDP area conforms to requirement", "Rule 7(4)", None, None),
                    ("CHK08", "Standard Pack Sizes", "pass", "advisory", "1 kg standard pack size", "Second Schedule", None, None),
                    ("CHK09", "Dual Units of Measurement", "pass", "advisory", "Metric units only", "Rule 13(5)", None, None),
                    ("CHK10", "Date of Manufacture / Packing", "pass", "minor", "Packed: 01/2026", "Rule 6(1)(d)", None, None),
                    ("CHK11", "Stickers and Corrections", "pass", "minor", "No stickers found", "Rule 6(3)", None, None),
                    ("CHK12", "Country of Origin", "pass", "minor", "Country of Origin: India", "Rule 6(1)(aa)", None, None),
                    ("CHK13", "Best Before / Expiry Period", "pass", "advisory", "Best before 24 months from packaging", "Rule 6(1)(da)", None, None),
                    ("CHK14", "Proviso to Rule 2(h)", "pass", "advisory", "Retail commercial package in normal trade", "Rule 2(h) Proviso", None, None),
                    ("CHK15", "E-Commerce Name and Address", "pass", "advisory", "Physical retail premises", "Rule 6(10)", None, None),
                    ("CHK16", "E-Commerce Declarations", "pass", "advisory", "Physical retail premises", "Rule 6(11)", None, None),
                    ("CHK17", "FSSAI / Statutory Advisory", "pass", "advisory", "FSSAI Lic. No. 10013011001222", "FSSAI Regulations", None, None),
                    ("CHK18", "Section 36 Penalty Tier", "pass", "advisory", "Compliant under Section 36", "Section 36 Legal Metrology Act, 2009", None, None),
                ]
            },
            # 5. Herbal Green Tea (Compliant)
            {
                "commodity_generic": "Herbal Green Tea",
                "brand_name": "Organic India",
                "commodity_category": "beverages",
                "batch_number": "GT-2026-302",
                "barcode": "8901777002012",
                "net_quantity_value": 100.0,
                "net_quantity_unit": "g",
                "overall_result": "compliant",
                "violation_limb": None,
                "recommended_action": "none",
                "checks_total": 18,
                "checks_assessed": 18,
                "panel_shape": "rectangular",
                "panel_height_mm": 140.0,
                "panel_width_mm": 85.0,
                "pdp_area_cm2": 119.0,
                "total_surface_area_cm2": 380.0,
                "checks": [
                    ("CHK01", "Net Quantity Declaration", "pass", "advisory", "Net Quantity 100 g (25 tea bags)", "Rule 6(1)(c)", None, None),
                    ("CHK02", "Unit of Measurement", "pass", "advisory", "'g' standard SI symbol", "Rules 12-13", None, None),
                    ("CHK03", "MRP Declaration", "pass", "minor", "MRP Rs 210.00 (inclusive of all taxes)", "Rule 6(1)(e)", None, None),
                    ("CHK04", "Manufacturer / Packer Details", "pass", "minor", "Organic India Pvt Ltd, Plot No. 266, Lucknow", "Rule 6(1)(a)", None, None),
                    ("CHK05", "Consumer Care Contact", "pass", "minor", "care@organicindia.com, 1800-180-5151", "Rule 6(1)(n)", None, None),
                    ("CHK06", "Character Height against Table-I", "pass", "advisory", "Font size 2.5 mm complies with Table-I", "Rule 7 read with Table-I", None, None),
                    ("CHK07", "Principal Display Panel Area", "pass", "advisory", "PDP area conforms to requirement", "Rule 7(4)", None, None),
                    ("CHK08", "Standard Pack Sizes", "pass", "advisory", "100 g standard pack size", "Second Schedule", None, None),
                    ("CHK09", "Dual Units of Measurement", "pass", "advisory", "Metric units only", "Rule 13(5)", None, None),
                    ("CHK10", "Date of Manufacture / Packing", "pass", "minor", "Packed: 01/2026", "Rule 6(1)(d)", None, None),
                    ("CHK11", "Stickers and Corrections", "pass", "minor", "No stickers found", "Rule 6(3)", None, None),
                    ("CHK12", "Country of Origin", "pass", "minor", "Country of Origin: India", "Rule 6(1)(aa)", None, None),
                    ("CHK13", "Best Before / Expiry Period", "pass", "advisory", "Best before 18 months from packaging", "Rule 6(1)(da)", None, None),
                    ("CHK14", "Proviso to Rule 2(h)", "pass", "advisory", "Retail commercial package in normal trade", "Rule 2(h) Proviso", None, None),
                    ("CHK15", "E-Commerce Name and Address", "pass", "advisory", "Physical retail premises", "Rule 6(10)", None, None),
                    ("CHK16", "E-Commerce Declarations", "pass", "advisory", "Physical retail premises", "Rule 6(11)", None, None),
                    ("CHK17", "FSSAI / Statutory Advisory", "pass", "advisory", "FSSAI Lic. No. 10019051000888", "FSSAI Regulations", None, None),
                    ("CHK18", "Section 36 Penalty Tier", "pass", "advisory", "Compliant under Section 36", "Section 36 Legal Metrology Act, 2009", None, None),
                ]
            },
        ]

        for idx, p in enumerate(products_spec):
            if idx < len(existing_scans):
                scan = existing_scans[idx]
                scan.commodity_generic = p["commodity_generic"]
                scan.brand_name = p["brand_name"]
                scan.commodity_category = p["commodity_category"]
                scan.batch_number = p["batch_number"]
                scan.barcode = p["barcode"]
                scan.net_quantity_value = p["net_quantity_value"]
                scan.net_quantity_unit = p["net_quantity_unit"]
                scan.is_imported = False
                scan.is_perishable = True
                scan.is_medical_device = False
                scan.is_tobacco = False
                scan.has_sticker = (p["overall_result"] == "violation" and p["brand_name"] == "CrunchTime")
                scan.sticker_reduces_price = False
                scan.sticker_covers_original = (p["overall_result"] == "violation" and p["brand_name"] == "CrunchTime")
                scan.overall_result = p["overall_result"]
                scan.violation_limb = p["violation_limb"]
                scan.recommended_action = p["recommended_action"]
                scan.checks_total = p["checks_total"]
                scan.checks_assessed = p["checks_assessed"]
                scan.panel_shape = p["panel_shape"]
                scan.panel_height_mm = p["panel_height_mm"]
                scan.panel_width_mm = p["panel_width_mm"]
                scan.pdp_area_cm2 = p["pdp_area_cm2"]
                scan.total_surface_area_cm2 = p["total_surface_area_cm2"]
                db.flush()
            else:
                scan = Scan(
                    inspection_id=test_insp.id,
                    commodity_generic=p["commodity_generic"],
                    brand_name=p["brand_name"],
                    commodity_category=p["commodity_category"],
                    batch_number=p["batch_number"],
                    barcode=p["barcode"],
                    net_quantity_value=p["net_quantity_value"],
                    net_quantity_unit=p["net_quantity_unit"],
                    is_imported=False,
                    is_perishable=True,
                    is_medical_device=False,
                    is_tobacco=False,
                    has_sticker=(p["overall_result"] == "violation" and p["brand_name"] == "CrunchTime"),
                    sticker_reduces_price=False,
                    sticker_covers_original=(p["overall_result"] == "violation" and p["brand_name"] == "CrunchTime"),
                    overall_result=p["overall_result"],
                    violation_limb=p["violation_limb"],
                    recommended_action=p["recommended_action"],
                    checks_total=p["checks_total"],
                    checks_assessed=p["checks_assessed"],
                    panel_shape=p["panel_shape"],
                    panel_height_mm=p["panel_height_mm"],
                    panel_width_mm=p["panel_width_mm"],
                    pdp_area_cm2=p["pdp_area_cm2"],
                    total_surface_area_cm2=p["total_surface_area_cm2"],
                    is_blown_moulded=False,
                    mm_per_pixel=0.048,
                    scale_source="declared",
                    mm_per_pixel_uncertainty=0.003,
                    catalog_hash="c3a4f8d9b1e7",
                    rules_as_at=date(2026, 7, 1),
                    engine_version="2.0.0",
                )
                db.add(scan)
                db.flush()

            # Ensure images exist for all configured panels
            panels_to_seed = p.get("panels", ["front"])
            for seq_idx, panel_name in enumerate(panels_to_seed):
                img_path = f"evidence/demo_{scan.id}_{panel_name}.jpg"
                ensure_demo_image(img_path, f"{p['brand_name']} {panel_name}")
                img = db.query(ScanImage).filter_by(scan_id=scan.id, panel=panel_name).first()
                if not img:
                    img = ScanImage(
                        scan_id=scan.id,
                        panel=panel_name,
                        sequence=seq_idx,
                        file_path=img_path,
                        byte_size=102400,
                        mime_type="image/jpeg",
                        sha256="3f9a72e8a1d2c4b5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9",
                        width_px=3024,
                        height_px=4032,
                        rectified=True,
                        residual_tilt_deg=0.8,
                        blur_variance=412.5,
                        glare_ratio=0.015,
                        captured_at=utcnow(),
                    )
                    db.add(img)
                    db.flush()
                else:
                    img.file_path = img_path

            # Upsert findings
            existing_findings = {f.check_id: f for f in db.query(Finding).filter(Finding.scan_id == scan.id).all()}
            for cid, title, verd, sev, obs, cit, reas, limb in p["checks"]:
                finding_reason = reas if verd == "not_assessed" else (reas or None)
                if cid in existing_findings:
                    f = existing_findings[cid]
                    f.title = title
                    f.engine_verdict = verd
                    f.severity = sev
                    f.observed = obs
                    f.citation = cit
                    f.reason = finding_reason
                    f.limb = limb
                else:
                    f = Finding(
                        scan_id=scan.id,
                        check_id=cid,
                        title=title,
                        engine_verdict=verd,
                        severity=sev,
                        observed=obs,
                        required="Statutory requirement per Legal Metrology Act & Rules",
                        citation=cit,
                        reason=finding_reason,
                        limb=limb,
                        confidence=0.92,
                    )
                    db.add(f)

        db.commit()
        print(f"[+] Successfully ensured 5 products for inspection {test_insp.id} (2 violations, 3 compliant).")
    finally:
        db.close()


if __name__ == "__main__":
    main()

