"""E2E demo: boots the REAL app on :8001, temp inspector scans the two demo
props (compliant + violations), times each assess, prints genuine verdicts,
then removes every DB row + evidence file it created."""
import subprocess, sys, time
from pathlib import Path

BACKEND = Path(r"c:\Skills\Projects\NiyamNetra\Backend")
BASE = "http://127.0.0.1:8001"
EMP, PWD = "E2E-DEMO", "E2eDemo-2026!x"
PROPS = {
    "compliant": BACKEND / "fixtures" / "demo_props" / "prop1_compliant.jpg",
    "violations": BACKEND / "fixtures" / "demo_props" / "prop2_missing_declarations.jpg",
}
sys.path.insert(0, str(BACKEND))
import httpx  # noqa: E402
from database import SessionLocal  # noqa: E402
from models import (AuditLog, Finding, IdempotencyKey, Inspection,  # noqa: E402
                    RevokedJti, Scan, ScanImage, User)
from password_handler import hash_password  # noqa: E402

db = SessionLocal()
u = db.query(User).filter_by(employee_id=EMP).first()
if not u:
    u = User(employee_id=EMP, full_name="E2E Demo", email="e2e-demo@example.test",
             password_hash=hash_password(PWD), role="inspector",
             jurisdiction="Hyderabad North", is_active=True)
    db.add(u); db.commit(); db.refresh(u)
uid = u.id; db.close()
print(f"[setup] inspector id={uid}", flush=True)

srv = subprocess.Popen(
    [str(BACKEND / "niyamnetra_venv" / "Scripts" / "python.exe"), "-m", "uvicorn",
     "main:app", "--host", "127.0.0.1", "--port", "8001"],
    cwd=str(BACKEND), stdout=open(BACKEND / "_e2e_server.log", "w"), stderr=subprocess.STDOUT)
print("[boot] uvicorn pid", srv.pid, flush=True)

try:
    t0 = time.time(); up = False
    while time.time() - t0 < 150:
        try:
            h = httpx.get(BASE + "/health", timeout=3)
            if h.status_code == 200:
                up = True
                print(f"[boot] healthy in {time.time()-t0:.1f}s", flush=True); break
        except Exception:
            pass
        time.sleep(2)
    if not up:
        print(open(BACKEND / "_e2e_server.log").read()[-2000:], flush=True); sys.exit(1)

    r = httpx.post(BASE + "/auth/login", json={"employee_id": EMP, "password": PWD}, timeout=20)
    r.raise_for_status()
    H = {"Authorization": "Bearer " + r.json()["access_token"]}
    print("[login] ok", flush=True)

    stores = httpx.get(BASE + "/stores", headers=H, timeout=20).json()
    assert isinstance(stores, list) and stores, "no stores seeded"
    r = httpx.post(BASE + "/inspections", headers=H,
                   json={"store_id": stores[0]["id"], "transaction_type": "retail_sale"}, timeout=30)
    r.raise_for_status()
    insp_id = r.json()["id"]
    print(f"[inspection] id={insp_id}", flush=True)

    scan_ids, failed_map = [], {}
    for label, path in PROPS.items():
        sfx = "A" if label == "compliant" else "B"
        r = httpx.post(BASE + f"/inspections/{insp_id}/scans", headers=H,
                       json={"commodity_generic": f"Demo Commodity {sfx}",
                             "brand_name": f"DemoBrand {sfx}", "batch_number": f"E2E-{sfx}",
                             "geometry": {"panel_shape": "rectangular", "panel_height_mm": 120.0,
                                          "panel_width_mm": 80.0, "is_blown_moulded": False,
                                          "scale_source": "declared"}}, timeout=30)
        r.raise_for_status()
        sid = r.json()["scan_id"]; scan_ids.append(sid)
        r = httpx.post(BASE + f"/scans/{sid}/images", headers=H, data={"panel": "front"},
                       files={"file": (path.name, path.read_bytes(), "image/jpeg")}, timeout=60)
        r.raise_for_status()
        t0 = time.time()
        a = httpx.post(BASE + f"/scans/{sid}/assess", headers=H, timeout=180)
        dt = time.time() - t0
        a.raise_for_status(); body = a.json()
        c = body.get("counts") or {}
        failed_map[label] = [f.get("check_id") for f in (body.get("findings") or [])
                             if f.get("effective_verdict") == "fail"]
        print(f"[assess] {label}: {body.get('overall_result')}  passed={c.get('passed')} "
              f"failed={c.get('failed')} not_assessed={c.get('not_assessed')}  t={dt:.1f}s", flush=True)
        if failed_map[label]:
            print("         failed checks:", failed_map[label], flush=True)

    print("E2E RESULT: OK — genuine verdicts from the actual images", flush=True)

finally:
    try:
        db2 = SessionLocal()
        if scan_ids:
            db2.execute(AuditLog.__table__.delete().where(AuditLog.inspection_id == insp_id))
            db2.query(Finding).filter(Finding.scan_id.in_(scan_ids)).delete(synchronize_session=False)
            db2.query(ScanImage).filter(ScanImage.scan_id.in_(scan_ids)).delete(synchronize_session=False)
            db2.query(Scan).filter(Scan.id.in_(scan_ids)).delete(synchronize_session=False)
        db2.query(IdempotencyKey).filter(IdempotencyKey.user_id == uid).delete(synchronize_session=False)
        db2.query(RevokedJti).filter(RevokedJti.user_id == uid).delete(synchronize_session=False)
        db2.query(Inspection).filter(Inspection.id == insp_id).delete(synchronize_session=False)
        db2.query(User).filter(User.id == uid).delete(synchronize_session=False)
        db2.commit(); db2.close()
        ev = BACKEND / "evidence" / str(insp_id)
        if ev.exists():
            import shutil; shutil.rmtree(ev, ignore_errors=True)
        print("[cleanup] rows + evidence removed", flush=True)
    except Exception as e:
        print("[cleanup] warning:", type(e).__name__, str(e)[:200], flush=True)
    srv.terminate()
    try:
        srv.wait(timeout=10)
    except Exception:
        srv.kill()
    print("[shutdown] stopped", flush=True)
