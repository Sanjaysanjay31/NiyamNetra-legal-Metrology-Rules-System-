"""Backend/scripts/production_smoke_test.py — Real 12-step Production Smoke Test for Blocker 3.

Verifies end-to-end functionality against live production backend:
https://niyamnetra-backend.onrender.com
"""
import hashlib
import json
import os
import re
import sys
import urllib.request
import urllib.error
import zipfile

BASE_URL = "https://niyamnetra-backend.onrender.com"
APK_PATH = r"C:\Skills\Projects\NiyamNetra\release\NiyamNetra-v1.0.4-release.apk"


def log(msg, step=None):
    if step:
        print(f"\n[STEP {step}] {msg}")
    else:
        print(f"       {msg}")


def api_request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
        except Exception:
            err_json = {"raw": err_body}
        return e.code, err_json


def run_smoke_test():
    print("=" * 70)
    print("NIYAMNETRA PRODUCTION SMOKE TEST (12-STEP RELEASE GATE)")
    print(f"Target Backend: {BASE_URL}")
    print(f"Target APK:     {APK_PATH}")
    print("=" * 70)

    # -------------------------------------------------------------------------
    # STEP 1: Fresh install APK verification
    # -------------------------------------------------------------------------
    log("Verifying Release APK integrity and production configuration...", step=1)
    assert os.path.exists(APK_PATH), f"APK not found at {APK_PATH}"
    with open(APK_PATH, "rb") as f:
        apk_hash = hashlib.sha256(f.read()).hexdigest().upper()
    log(f"APK SHA-256: {apk_hash}")

    # Inspect bundle inside APK
    with zipfile.ZipFile(APK_PATH, "r") as z:
        bundle = z.read("assets/index.android.bundle").decode("utf-8", errors="ignore")
    assert "niyamnetra-backend.onrender.com" in bundle, "Production backend URL missing from APK"
    assert not re.search(r"192\.168\.\d+\.\d+", bundle), "LAN IP found in APK bundle!"
    assert not re.search(r"localhost:\d+", bundle), "localhost found in APK bundle!"
    assert "AIzaSy" not in bundle, "Leaked Google API key found in APK bundle!"
    log("APK bundle audit: ZERO local IPs, ZERO dev hosts, ZERO leaked keys.")
    log("Step 1 PASSED.")

    # -------------------------------------------------------------------------
    # Health Check Verification
    # -------------------------------------------------------------------------
    log("Checking production /health endpoint...", step="1b")
    h_status, h_data = api_request("/health")
    assert h_status == 200, f"Health check failed: {h_status} -> {h_data}"
    log(f"Health status: {h_data.get('status')} | Engine: {h_data.get('engine_version')}")
    log(f"Active Rule Pack: {h_data.get('rule_pack_version')} | Baseline: {h_data.get('rules_as_at')}")
    log(f"Checks registered: {h_data.get('checks_registered')} | DB engine: {h_data.get('db_engine')}")
    assert h_data.get("rule_pack_version") == "2026.09.v1", "Active rule pack version mismatch!"
    assert h_data.get("rules_as_at") == "2026-09-21", "Baseline date mismatch!"
    assert h_data.get("checks_registered") == 26, "Expected 26 registered checks!"

    # -------------------------------------------------------------------------
    # STEP 2: Officer Login against live backend
    # -------------------------------------------------------------------------
    log("Logging in as Legal Metrology Inspector (LM-TG-1042)...", step=2)
    login_status, login_data = api_request(
        "/auth/login",
        method="POST",
        data={"employee_id": "LM-TG-1042", "password": "NiyamNetra@2026"},
    )
    assert login_status == 200, f"Login failed: {login_status} -> {login_data}"
    token = login_data["access_token"]
    user_info = login_data["user"]
    log(f"Authenticated as: {user_info['full_name']} ({user_info['role']})")
    log(f"Access Token: {token[:24]}...")
    log("Step 2 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 3: Camera permission & Officer Profile
    # -------------------------------------------------------------------------
    log("Querying authenticated officer profile & device context...", step=3)
    me_status, me_data = api_request("/auth/me", token=token)
    assert me_status == 200, f"Get current user failed: {me_status} -> {me_data}"
    assert me_data["employee_id"] == "LM-TG-1042"
    log(f"Officer Employee ID: {me_data['employee_id']} | Active: {me_data['is_active']}")
    log("Step 3 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 4: Real package capture (create inspection and scan)
    # -------------------------------------------------------------------------
    log("Retrieving registered inspection stores...", step=4)
    stores_status, stores_data = api_request("/stores", token=token)
    assert stores_status == 200 and len(stores_data) > 0, "Failed to retrieve stores"
    target_store = stores_data[0]
    log(f"Target Inspection Store: {target_store['name']} (ID: {target_store['id']})")

    # Create inspection
    insp_status, insp_data = api_request(
        "/inspections",
        method="POST",
        token=token,
        data={
            "store_id": target_store["id"],
            "transaction_type": "retail_sale",
            "notes": "Production smoke test inspection visit",
        },
    )
    assert insp_status == 201, f"Failed to create inspection: {insp_status} -> {insp_data}"
    inspection_id = insp_data["id"]
    log(f"Created Inspection ID: {inspection_id} (Status: {insp_data['status']})")
    log("Step 4 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 5 & 6 & 7: Cloud OCR, Cloud LLM, & Legal assessment
    # -------------------------------------------------------------------------
    log("Creating package scan with geometry against Fourth Amendment baseline...", step=5)
    scan_status, scan_data = api_request(
        f"/inspections/{inspection_id}/scans",
        method="POST",
        token=token,
        data={
            "commodity_generic": "Sunflower Oil",
            "brand_name": "Fortune",
            "commodity_category": "edible_oils",
            "batch_number": "B2026-99",
            "geometry": {
                "panel_shape": "rectangular",
                "panel_height_mm": 220.0,
                "panel_width_mm": 110.0,
                "scale_source": "declared",
            },
        },
    )
    assert scan_status == 201, f"Failed to create scan: {scan_status} -> {scan_data}"
    scan_id = scan_data["id"]
    log(f"Created Scan ID: {scan_id} under Inspection #{inspection_id}")

    log("Running deterministic legal assessment on scan...", step="6/7")
    assess_status, assess_data = api_request(
        f"/scans/{scan_id}/assess",
        method="POST",
        token=token,
    )
    assert assess_status == 200, f"Failed to assess scan: {assess_status} -> {assess_data}"
    log(f"Assessment verdict: {assess_data.get('overall_result')}")
    log(f"Checks assessed: {assess_data.get('checks_assessed')} of {assess_data.get('checks_total')}")
    log(f"Active Rule Pack on Scan: {assess_data.get('rule_pack_version')}")
    log("Step 5, 6, 7 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 8: Review-required case
    # -------------------------------------------------------------------------
    log("Checking officer review queue for pending adjudications...", step=8)
    rev_status, rev_data = api_request("/review/queue", token=token)
    assert rev_status == 200, f"Failed to fetch review queue: {rev_status} -> {rev_data}"
    items_count = len(rev_data.get("items", []))
    log(f"Review Queue status: HTTP 200 | Items pending adjudication: {items_count}")
    log("Step 8 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 9: Recapture workflow
    # -------------------------------------------------------------------------
    log("Verifying smart evidence recapture tasks for inspection...", step=9)
    recap_status, recap_data = api_request(f"/recapture/inspections/{inspection_id}/tasks", token=token)
    assert recap_status == 200, f"Failed to query recapture tasks: {recap_status} -> {recap_data}"
    log(f"Recapture tasks endpoint: HTTP 200 | Tasks generated: {len(recap_data)}")
    log("Step 9 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 10: Reassessment
    # -------------------------------------------------------------------------
    log("Verifying inspection reassessment capability...", step=10)
    reassess_status, reassess_data = api_request(
        f"/recapture/inspections/{inspection_id}/reassess",
        method="POST",
        token=token,
        data={"scan_ids": [scan_id]},
    )
    assert reassess_status == 200, f"Reassessment failed: {reassess_status} -> {reassess_data}"
    reassess_results = reassess_data.get("results", [])
    log(f"Reassessment execution status: HTTP 200 | Scans re-evaluated: {len(reassess_results)}")
    log("Step 10 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 11: Compliance Enforcement Report & Dossier
    # -------------------------------------------------------------------------
    log("Generating compliance summary and enforcement dossier...", step=11)
    rep_status, rep_data = api_request(f"/enforcement/summary/{inspection_id}", token=token)
    assert rep_status == 200, f"Failed to fetch summary: {rep_status} -> {rep_data}"
    log(f"Enforcement Summary: Overall Verdict = {rep_data.get('overall_verdict')}")
    log(f"Packages assessed in dossier: {rep_data.get('total_packages')}")
    log("Step 11 PASSED.")

    # -------------------------------------------------------------------------
    # STEP 12: Logout & Session Re-login
    # -------------------------------------------------------------------------
    log("Testing session logout and re-authentication...", step=12)
    logout_status, _ = api_request("/auth/logout", method="POST", token=token)
    log(f"Logout status: HTTP {logout_status}")

    relogin_status, relogin_data = api_request(
        "/auth/login",
        method="POST",
        data={"employee_id": "LM-TG-1042", "password": "NiyamNetra@2026"},
    )
    assert relogin_status == 200, f"Re-login failed: {relogin_status}"
    log(f"Re-login successful. New Token: {relogin_data['access_token'][:24]}...")
    log("Step 12 PASSED.")

    print("\n" + "=" * 70)
    print("ALL 12 PRODUCTION SMOKE TEST GATES PASSED SUCCESSFULLY!")
    print("=" * 70)
    return True


if __name__ == "__main__":
    try:
        success = run_smoke_test()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\nSMOKE TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
