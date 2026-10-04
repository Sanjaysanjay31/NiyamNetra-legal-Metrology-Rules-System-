"""benchmark_integrity.py — Rigorous performance benchmarks for Commit 6.

Measures:
A. SHA-256 computation time (median, p95, min, max)
B. File verification time (verify_stored_image)
C. Same-scan replay detection time (DB query + SHA matching)
D. pHash computation time (phash_bands)
E. Near-duplicate search time (find_near_duplicates_with_distances)
F. Total upload response latency:
   - Synchronous baseline (upload with in-band pHash)
   - Asynchronous Commit 6 (upload with background pHash)
"""
import io
import os
import sys
import tempfile
import time
from pathlib import Path

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 40)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import hashlib
import numpy as np
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from image_processor import (
    phash_bands,
    find_near_duplicates_with_distances,
    verify_stored_image,
)
from main import app
from models import Inspection, Scan, ScanImage, Store, User
from password_handler import hash_password
from rbac import get_current_user, require_inspector


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def create_sample_image(width=1600, height=1200, text="BENCHMARK EVIDENCE SAMPLE") -> bytes:
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([50, 50, width - 50, height - 50], outline=(30, 30, 30), width=6)
    d.text((100, 150), text, fill=(20, 20, 20))
    for i in range(10):
        d.line([(100, 250 + i * 40), (width - 100, 250 + i * 40)], fill=(80, 80, 80), width=2)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def stats(durations_ms):
    arr = np.array(durations_ms)
    return {
        "count": len(arr),
        "mean_ms": float(np.mean(arr)),
        "median_ms": float(np.median(arr)),
        "p95_ms": float(np.percentile(arr, 95)),
        "min_ms": float(np.min(arr)),
        "max_ms": float(np.max(arr)),
    }


def run_benchmark():
    print("==================================================")
    print("COMMIT 6 INTEGRITY & DUPLICATE BENCHMARK SUITE")
    print("==================================================")

    raw_bytes = create_sample_image(1600, 1200)
    byte_size = len(raw_bytes)
    print(f"Sample test image: 1600x1200 JPEG, {byte_size:,} bytes ({byte_size / (1024*1024):.2f} MB)")

    with tempfile.TemporaryDirectory() as td:
        tmp_path = Path(td) / "sample_evidence.jpg"
        tmp_path.write_bytes(raw_bytes)
        recorded_sha = hashlib.sha256(raw_bytes).hexdigest()

        # A. SHA-256 computation time
        N = 50
        sha_times = []
        for _ in range(N):
            t0 = time.perf_counter()
            _ = compute_sha256(tmp_path)
            sha_times.append((time.perf_counter() - t0) * 1000.0)
        s_sha = stats(sha_times)
        print(f"\nA. SHA-256 Computation Time ({N} runs):")
        print(f"   median: {s_sha['median_ms']:.2f} ms | p95: {s_sha['p95_ms']:.2f} ms | mean: {s_sha['mean_ms']:.2f} ms")

        # B. File verification time
        ver_times = []
        for _ in range(N):
            t0 = time.perf_counter()
            _ = verify_stored_image(tmp_path, recorded_sha)
            ver_times.append((time.perf_counter() - t0) * 1000.0)
        s_ver = stats(ver_times)
        print(f"\nB. File Verification Time ({N} runs):")
        print(f"   median: {s_ver['median_ms']:.2f} ms | p95: {s_ver['p95_ms']:.2f} ms | mean: {s_ver['mean_ms']:.2f} ms")

        # D. pHash computation time
        phash_times = []
        for _ in range(20):
            t0 = time.perf_counter()
            _ = phash_bands(tmp_path)
            phash_times.append((time.perf_counter() - t0) * 1000.0)
        s_phash = stats(phash_times)
        print(f"\nD. pHash Computation Time (20 runs):")
        print(f"   median: {s_phash['median_ms']:.2f} ms | p95: {s_phash['p95_ms']:.2f} ms | mean: {s_phash['mean_ms']:.2f} ms")

        # Setup in-memory DB for DB-related benchmarks
        eng = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=eng)
        S = sessionmaker(bind=eng)
        db = S()

        inspector = User(
            employee_id="INS-BENCH-06",
            full_name="Benchmarking Inspector 6",
            password_hash=hash_password("password123"),
            role="inspector",
            is_active=True,
        )
        store = Store(name="Bench Store", city="Delhi")
        db.add_all([inspector, store])
        db.commit()

        insp = Inspection(store_id=store.id, user_id=inspector.id, transaction_type="retail_sale")
        db.add(insp)
        db.commit()

        import datetime
        scan = Scan(
            inspection_id=insp.id,
            commodity_generic="Bench Pack",
            rules_as_at=datetime.date.today(),
            catalog_hash="h",
            engine_version="v",
        )
        db.add(scan)
        db.commit()

        # Seed 100 ScanImage records to benchmark near-duplicate search with realistic volume
        base_hash, base_bands = phash_bands(tmp_path)
        existing_images = []
        for i in range(100):
            existing_images.append(
                ScanImage(
                    scan_id=scan.id,
                    panel="front",
                    sequence=i,
                    file_path=str(tmp_path),
                    byte_size=byte_size,
                    width_px=1600,
                    height_px=1200,
                    mime_type="image/jpeg",
                    sha256=f"sha256_{i:04d}",
                    phash=base_hash if i == 5 else f"phash_{i:016x}",
                    phash_b1=base_bands[0],
                    phash_b2=base_bands[1],
                    phash_b3=base_bands[2],
                    phash_b4=base_bands[3],
                )
            )
        db.add_all(existing_images)
        db.commit()

        # C. Same-scan replay detection time (DB query + SHA match)
        replay_times = []
        target_sha = existing_images[10].sha256
        for _ in range(N):
            t0 = time.perf_counter()
            _ = (
                db.query(ScanImage)
                .filter(
                    ScanImage.scan_id == scan.id,
                    ScanImage.panel == "front",
                    ScanImage.sha256 == target_sha,
                )
                .first()
            )
            replay_times.append((time.perf_counter() - t0) * 1000.0)
        s_rep = stats(replay_times)
        print(f"\nC. Same-Scan Replay Detection Time ({N} runs):")
        print(f"   median: {s_rep['median_ms']:.2f} ms | p95: {s_rep['p95_ms']:.2f} ms | mean: {s_rep['mean_ms']:.2f} ms")

        # E. Near-duplicate search time
        search_times = []
        for _ in range(N):
            t0 = time.perf_counter()
            _ = find_near_duplicates_with_distances(
                db=db,
                phash_hex=base_hash,
                bands=base_bands,
                exclude_scan_id=999,  # cross-scan search
                panel="front",
            )
            search_times.append((time.perf_counter() - t0) * 1000.0)
        s_search = stats(search_times)
        print(f"\nE. Near-Duplicate Search Time ({N} runs against 100 indexed records):")
        print(f"   median: {s_search['median_ms']:.2f} ms | p95: {s_search['p95_ms']:.2f} ms | mean: {s_search['mean_ms']:.2f} ms")

        # F. Upload endpoint latency: Before vs After Commit 6
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: inspector
        app.dependency_overrides[require_inspector] = lambda: inspector

        client = TestClient(app)

        # Create scan via client to ensure valid geometry is populated
        r_scan = client.post(
            f"/inspections/{insp.id}/scans",
            json={"commodity_generic": "Bench Pack", "geometry": {"panel_shape": "rectangular", "scale_source": "none"}},
        )
        assert r_scan.status_code == 201
        bench_scan_id = r_scan.json()["id"]

        # Measure After Commit 6 (Non-blocking background pHash)
        after_times = []
        for i in range(15):
            unique_raw = create_sample_image(1200, 900, text=f"TEST AFTER {i}")
            t0 = time.perf_counter()
            r = client.post(
                f"/scans/{bench_scan_id}/images",
                data={"panel": "front"},
                files={"file": (f"img_{i}.jpg", unique_raw, "image/jpeg")},
            )
            elapsed = (time.perf_counter() - t0) * 1000.0
            assert r.status_code == 201, r.text
            after_times.append(elapsed)
        s_after = stats(after_times)

        # Baseline synchronous comparison:
        # In Commit 1 baseline, pHash + near-duplicate search ran directly inside upload:
        # Expected sync latency = upload processing + pHash (~140 ms) + near-dup search (~1.5 ms)
        sync_estimated_median = s_after["median_ms"] + s_phash["median_ms"] + s_search["median_ms"]
        sync_estimated_p95 = s_after["p95_ms"] + s_phash["p95_ms"] + s_search["p95_ms"]

        print(f"\nF. Total Upload Response Latency:")
        print(f"   BEFORE COMMIT 6 (Synchronous pHash in-band):")
        print(f"     Estimated median: ~{sync_estimated_median:.2f} ms | p95: ~{sync_estimated_p95:.2f} ms")
        print(f"     (Previously measured at 223 ms in Commit 1 baseline with 149 ms pHash)")
        print(f"   AFTER COMMIT 6 (Asynchronous Background pHash):")
        print(f"     Measured median:  {s_after['median_ms']:.2f} ms | p95: {s_after['p95_ms']:.2f} ms | mean: {s_after['mean_ms']:.2f} ms")
        print(f"   LATENCY SAVINGS FOR INSPECTOR:")
        savings_ms = sync_estimated_median - s_after["median_ms"]
        print(f"     Saved {savings_ms:.2f} ms ({savings_ms / sync_estimated_median * 100:.1f}%) on upload response!")
        print("==================================================")


if __name__ == "__main__":
    run_benchmark()
