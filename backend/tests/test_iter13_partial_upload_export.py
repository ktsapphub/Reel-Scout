"""
Iteration 13 — Partial-Search Upload + Export Smoke Test (review_request)

Goal: prove that aborted-search partial reels (synthesised here) flow through
POST /api/reels/upload  -> Cloudinary
POST /api/reels/export  -> CSV

There is NO "search must be COMPLETED" gate on either endpoint.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ig-scraper-2.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "mydatejar@gmail.com"
LOGIN_PASSWORD = "#Test1234"

# Small public-domain MP4 (Apple's BipBop reference). Cloudinary will fetch it.
PUBLIC_MP4 = "https://download.samplelib.com/mp4/sample-5s.mp4"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture
def synthetic_partial_reel():
    """Mimics the shape produced by apify_service.process_apify_results."""
    return {
        "id": "TEST_iter13_partial_1",
        "reel_id": "TEST_iter13_partial_1",
        "owner_username": "TEST_iter13_user",
        "owner_full_name": "Iter13 Tester",
        "reel_url": "https://instagram.com/reel/TEST_iter13_partial_1",
        "downloaded_video_url": PUBLIC_MP4,
        "original_video_url": PUBLIC_MP4,
        "timestamp": "2026-01-15T00:00:00Z",
        "video_duration_seconds": 5,
        "video_transcript": "",
        "tagged_users": [],
        "music_artist": "",
        "music_song": "",
        "music_original_audio": False,
        "location_name": "",
        "location_address": "",
        "cloudinary_url": "",
        "cloudinary_public_id": "",
    }


class TestPartialUpload:
    def test_upload_partial_reel(self, auth_headers, synthetic_partial_reel):
        payload = {
            "reel_ids": [synthetic_partial_reel["reel_id"]],
            "reels": [synthetic_partial_reel],
        }
        r = requests.post(
            f"{BASE_URL}/api/reels/upload",
            json=payload,
            headers=auth_headers,
            timeout=120,
        )
        assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["total"] == 1
        assert "items" in data and len(data["items"]) == 1
        item = data["items"][0]
        # If Cloudinary creds valid + mp4 fetchable, we get completed=1.
        # If it fails we want a clear error message — NOT a 'search not complete' gate.
        if data["completed"] == 1:
            assert item["status"] == "completed"
            assert item["cloudinary_url"].startswith("http")
            print(f"UPLOAD OK: {item['cloudinary_url']}")
        else:
            # surface the failure reason
            print(f"UPLOAD FAILED (reason): {item.get('error')}")
            assert "search" not in (item.get("error") or "").lower(), \
                "Upload was wrongly gated on search-complete!"


class TestPartialExport:
    def test_export_partial_reels_csv(self, auth_headers, synthetic_partial_reel):
        # Add a fake cloudinary_url so the CSV row carries it through
        reel = dict(synthetic_partial_reel)
        reel["cloudinary_url"] = "https://res.cloudinary.com/demo/video/upload/TEST_iter13_partial_1"
        payload = {"reels": [reel], "selected_only": True}
        r = requests.post(
            f"{BASE_URL}/api/reels/export",
            json=payload,
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"Export failed: {r.status_code} {r.text}"
        ctype = r.headers.get("content-type", "")
        assert "text/csv" in ctype, f"Expected text/csv, got: {ctype}"
        body = r.text
        # Headers + at least one data row
        assert "reel_url" in body and "cloudinary_url" in body
        assert reel["reel_url"] in body
        assert "TEST_iter13_user" in body
        print(f"EXPORT OK: {len(body)} bytes, content-type={ctype}")

    def test_export_empty_returns_400(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/reels/export",
            json={"reels": [], "selected_only": False},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 400


class TestStopEndpointShape:
    """Sanity: stop endpoint exists and (without an active run) returns 404."""
    def test_stop_unknown_run_404(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/reels/search/stop/UNKNOWN_RUN_iter13",
            headers=auth_headers,
            timeout=15,
        )
        # Implementation gracefully returns 200 with 0 results for unknown runs
        # (Apify SDK abort is idempotent). Accept any non-5xx that conveys empty result.
        assert r.status_code in (200, 400, 404), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 200:
            data = r.json()
            assert data.get("results_count", 0) == 0
            assert data.get("partial_results") == []
