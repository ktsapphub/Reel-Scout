"""Iteration 18 — verify Apify budget-safety fixes:
1. Pydantic bounds max_results 1..100 (422 on out-of-range).
2. _per_profile_limit ceil-divides budget across usernames.
3. process_apify_results hard-trims final results to max_results.
4. Log line 'per-profile Apify limit=N' emitted on multi-user searches.
5. Hashtag path unchanged (resultsCount, no per-profile split).
"""
import os
import sys
import time
import asyncio
import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

EMAIL = "mydatejar@gmail.com"
PASSWORD = "#Test1234"
BACKEND_LOG = "/var/log/supervisor/backend.out.log"
BACKEND_ERR_LOG = "/var/log/supervisor/backend.err.log"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Unit-level tests ---------- #

def test_per_profile_limit_helper():
    """Ceil-divide budget across N profiles; single profile returns budget as-is."""
    from routes.reels import _per_profile_limit
    assert _per_profile_limit(15, 3) == 5      # exact
    assert _per_profile_limit(25, 3) == 9      # ceil(25/3) = 9
    assert _per_profile_limit(25, 1) == 25     # no division for single handle
    assert _per_profile_limit(100, 4) == 25
    assert _per_profile_limit(1, 5) == 1       # floor to 1 minimum
    assert _per_profile_limit(10, 0) == 10     # div-by-zero guarded


def test_process_apify_results_hard_trim_and_no_trim():
    """Synthetic items exercised in ONE event loop (motor client is loop-bound)."""
    from services.apify_service import process_apify_results

    def _make(prefix, n):
        return [{
            "url": f"https://instagram.com/reel/{prefix}{i}/",
            "type": "clip",
            "isVideo": True,
            "videoUrl": f"https://cdn.example.com/{prefix}{i}.mp4",
            "ownerUsername": "test",
            "shortCode": f"{prefix}{i}",
            "timestamp": "2026-01-01T00:00:00Z",
            "videoDuration": 30,
        } for i in range(n)]

    async def _run():
        r1 = await process_apify_results(_make("abc", 12), "tester@example.com", "username", max_results=5)
        r2 = await process_apify_results(_make("xy", 3), "tester@example.com", "username", max_results=25)
        return r1, r2

    r1, r2 = asyncio.run(_run())
    assert len(r1) == 5, f"Hard-trim broken: expected 5, got {len(r1)}"
    assert len(r2) == 3, f"Under-cap broken: expected 3, got {len(r2)}"


# ---------- API-level tests ---------- #

def test_pydantic_rejects_max_results_above_100(auth_headers):
    r = requests.post(f"{BASE_URL}/api/reels/search/start", headers=auth_headers, json={
        "search_type": "hashtag", "hashtag": "travel", "max_results": 999,
    }, timeout=30)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text[:300]}"
    body = r.text.lower()
    assert "less_than_equal" in body or "100" in body


def test_pydantic_rejects_max_results_zero(auth_headers):
    r = requests.post(f"{BASE_URL}/api/reels/search/start", headers=auth_headers, json={
        "search_type": "hashtag", "hashtag": "travel", "max_results": 0,
    }, timeout=30)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text[:300]}"


def test_pydantic_accepts_max_results_100(auth_headers):
    """Boundary — 100 should succeed pydantic validation."""
    r = requests.post(f"{BASE_URL}/api/reels/search/start", headers=auth_headers, json={
        "search_type": "hashtag", "hashtag": "travel", "max_results": 100,
    }, timeout=90)
    # Not 422 — may be 200 (RUNNING/CACHED/ERROR path is fine)
    assert r.status_code != 422, f"Boundary max_results=100 should not be rejected: {r.text[:300]}"


def _tail_log(path, n=400):
    try:
        with open(path) as f:
            lines = f.readlines()
        return "".join(lines[-n:])
    except Exception:
        return ""


def test_multi_username_logs_per_profile_division(auth_headers):
    """3 usernames + max_results=15 → log shows per-profile Apify limit=5."""
    # Kick a search — don't wait for completion, just fire and inspect logs.
    payload = {
        "search_type": "username",
        "usernames": ["nasa", "natgeo", "spacex"],
        "max_results": 15,
    }
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/reels/search/start", headers=auth_headers, json=payload, timeout=90)
    # Response can be 200 with RUNNING/CACHED/ERROR - all fine, we only need the log line.
    assert r.status_code == 200, f"Search start failed HTTP {r.status_code}: {r.text[:300]}"
    # Give the logger a beat
    time.sleep(1)
    logs = _tail_log(BACKEND_LOG, 800) + _tail_log(BACKEND_ERR_LOG, 800)
    # Look for exact key phrase
    assert "user cap=15" in logs, f"Missing 'user cap=15' in logs. Recent tail: {logs[-2000:]}"
    assert "per-profile Apify limit=5" in logs, f"Missing 'per-profile Apify limit=5'. Recent tail: {logs[-2000:]}"


def test_single_username_no_division(auth_headers):
    """Regression: 1 username + max_results=25 → per-profile limit=25 (no division)."""
    payload = {
        "search_type": "username",
        "usernames": ["nasa"],
        "max_results": 25,
    }
    r = requests.post(f"{BASE_URL}/api/reels/search/start", headers=auth_headers, json=payload, timeout=90)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:300]}"
    time.sleep(1)
    logs = _tail_log(BACKEND_LOG, 800) + _tail_log(BACKEND_ERR_LOG, 800)
    assert "user cap=25" in logs, f"Missing 'user cap=25'. Tail: {logs[-1500:]}"
    assert "per-profile Apify limit=25" in logs, f"Missing 'per-profile Apify limit=25'. Tail: {logs[-1500:]}"


def test_hashtag_search_still_works(auth_headers):
    """Regression: hashtag search uses resultsCount (no per-profile split)."""
    payload = {
        "search_type": "hashtag",
        "hashtag": "travel",
        "max_results": 10,
    }
    r = requests.post(f"{BASE_URL}/api/reels/search/start", headers=auth_headers, json=payload, timeout=90)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:300]}"
    body = r.json()
    # Should be RUNNING, CACHED, or (in worst case) ERROR - but not a 422
    assert body.get("status") in ("RUNNING", "CACHED", "ERROR"), body
    time.sleep(1)
    logs = _tail_log(BACKEND_LOG, 800) + _tail_log(BACKEND_ERR_LOG, 800)
    # Hashtag path logs the raw dict — resultsCount:10 should appear
    assert "'resultsCount': 10" in logs or '"resultsCount": 10' in logs or "Hashtag search" in logs, \
        f"Missing hashtag search log. Tail: {logs[-1500:]}"
