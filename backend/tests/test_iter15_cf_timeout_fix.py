"""Iteration 15 — Cloudflare 100s edge timeout fix verification.

Focus:
- POST /api/reels/upload now uses asyncio.gather + Semaphore(5) for parallel bounded concurrency.
- SYNC_PATH_TIMEOUT_SEC lowered to 25.0 (was 90.0).
- POST /api/reels/search/start total wall-clock should stay <30s even when
  sync path fails (falls through to async and returns a run_id).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ig-scraper-2.preview.emergentagent.com").rstrip("/")
EMAIL = "mydatejar@gmail.com"
PASSWORD = "#Test1234"
SAMPLE_MP4 = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- 1. Constant check ----------
def test_sync_path_timeout_constant_is_25():
    with open("/app/backend/routes/reels.py") as f:
        content = f.read()
    assert "SYNC_PATH_TIMEOUT_SEC = 25.0" in content, "SYNC_PATH_TIMEOUT_SEC must be 25.0"


# ---------- 2. Upload parallelism ----------
def _make_reel(i):
    return {
        "id": f"TEST_iter15_{uuid.uuid4().hex[:8]}_{i}",
        "owner_username": f"TEST_iter15_user_{i}",
        "downloaded_video_url": SAMPLE_MP4,
        "original_video_url": SAMPLE_MP4,
        "video_transcript": f"iter15 test reel {i}",
        "reel_url": f"https://instagram.com/reel/TEST_iter15_{i}/",
        "timestamp": "2026-01-01T00:00:00Z",
    }


def test_upload_reels_parallel_timing(auth):
    """5 reels should complete well under 5x the per-upload time. Even fully sequential
    Cloudinary fetch of BigBuckBunny is often 8-15s each = 40-75s. Parallel with
    concurrency=5 should be ~one batch = 8-20s. We assert <45s hard ceiling."""
    N = 5
    reels = [_make_reel(i) for i in range(N)]
    payload = {"reel_ids": [r["id"] for r in reels], "reels": reels}

    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/reels/upload", json=payload, headers=auth, timeout=120)
    elapsed = time.time() - t0
    print(f"\n[upload] N={N} elapsed={elapsed:.2f}s status={r.status_code}")

    assert r.status_code == 200, f"upload failed {r.status_code} {r.text[:300]}"
    data = r.json()
    print(f"[upload] total={data.get('total')} completed={data.get('completed')} failed={data.get('failed')}")
    assert data["total"] == N
    # Wall-clock ceiling (parallel with Semaphore(5) — one batch)
    assert elapsed < 45.0, f"upload took {elapsed:.1f}s — parallelism not working (expected <45s)"


# ---------- 3. Search start wall-clock ----------
def test_search_start_hashtag_under_30s(auth):
    payload = {"search_type": "hashtag", "hashtag": f"testtag{uuid.uuid4().hex[:6]}", "max_results": 25}
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/reels/search/start", json=payload, headers=auth, timeout=60)
    elapsed = time.time() - t0
    print(f"\n[search/start] elapsed={elapsed:.2f}s status={r.status_code}")
    assert r.status_code == 200, f"search/start failed {r.status_code} {r.text[:300]}"
    data = r.json()
    print(f"[search/start] response status={data.get('status')} run_id={data.get('run_id')[:40] if data.get('run_id') else ''}")
    # Should stay under 30s regardless of sync path outcome
    assert elapsed < 30.0, f"search/start took {elapsed:.1f}s — expected <30s"
    # Valid response shape
    assert data.get("status") in ("CACHED", "RUNNING", "ERROR")
    if data.get("status") in ("CACHED", "RUNNING"):
        assert data.get("run_id"), "Non-error status requires run_id"


# ---------- 4. build-info regression ----------
def test_build_info_regression(auth):
    r = requests.get(f"{BASE_URL}/api/settings/build-info", headers=auth, timeout=30)
    assert r.status_code == 200
    data = r.json()
    print(f"\n[build-info] {data}")
    assert data.get("app_name") == "Reel Scout"
    assert data.get("version") == "2.6.15"


# ---------- 5. search/stop regression ----------
def test_search_stop_returns_partial(auth):
    """Start a hashtag search then stop it — must return partial_results field."""
    start = requests.post(
        f"{BASE_URL}/api/reels/search/start",
        json={"search_type": "hashtag", "hashtag": f"stoptest{uuid.uuid4().hex[:6]}", "max_results": 25},
        headers=auth, timeout=45,
    )
    assert start.status_code == 200
    sd = start.json()
    run_id = sd.get("run_id")
    status = sd.get("status")
    print(f"\n[search/stop] start status={status} run_id={run_id[:40] if run_id else ''}")
    if status != "RUNNING" or not run_id:
        pytest.skip(f"Search didn't enter RUNNING state (got {status}) — nothing to stop")

    time.sleep(2)
    stop = requests.post(f"{BASE_URL}/api/reels/search/stop/{run_id}", headers=auth, timeout=30)
    assert stop.status_code == 200, f"stop failed {stop.status_code} {stop.text[:300]}"
    sdata = stop.json()
    print(f"[search/stop] status={sdata.get('status')} results_count={sdata.get('results_count')}")
    assert "partial_results" in sdata
    assert sdata.get("status") == "ABORTED"
    assert isinstance(sdata["partial_results"], list)
