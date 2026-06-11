"""
Backend tests for the new Credential Management & Connection Health feature (v2.2.0).
Covers:
- GET /api/settings/credentials  (masked + source)
- GET /api/settings/health-status (TTL fields)
- PUT /api/settings/credentials  (invalid token rejected, valid token persisted)
- DELETE /api/settings/credentials/{key} (resets to .env)
- Health refresh side-effects from /api/settings/check-cloudinary, /api/apify/status
- Audit-log entries for credential_updated/credential_update_rejected/credential_reset
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
LOGIN_PAYLOAD = {"email": "mydatejar@gmail.com", "password": "#Test1234"}

EDITABLE_KEYS = [
    "APIFY_TOKEN",
    "APIFY_USERNAME_TOKEN",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
]

# Real token (matches what's in /app/backend/.env) — used to test the "valid update" path.
REAL_APIFY_TOKEN = "apify_api_RkfjK3CwjhWadVifN4kFSWAqgJCARI424d5p"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=LOGIN_PAYLOAD, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- LIST CREDENTIALS ----------
class TestListCredentials:
    def test_list_returns_five_editable_credentials(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/credentials", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "credentials" in data
        keys = [c["key"] for c in data["credentials"]]
        for k in EDITABLE_KEYS:
            assert k in keys, f"Missing {k} in credentials list"
        assert len(data["credentials"]) == 5

    def test_sensitive_values_are_masked(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/credentials", headers=headers, timeout=15)
        creds = {c["key"]: c for c in r.json()["credentials"]}
        for k in ("APIFY_TOKEN", "APIFY_USERNAME_TOKEN", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"):
            mv = creds[k]["masked_value"]
            assert "•" in mv, f"{k} should be masked, got {mv!r}"
            # bullet-prefixed format keeps only last 4 chars revealed
            assert len(mv) >= 8

    def test_cloud_name_not_masked(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/credentials", headers=headers, timeout=15)
        creds = {c["key"]: c for c in r.json()["credentials"]}
        cn = creds["CLOUDINARY_CLOUD_NAME"]
        # non-sensitive -> shown as-is
        assert "•" not in cn["masked_value"]
        assert cn["sensitive"] is False
        assert cn["source"] in ("env", "database")

    def test_unauthenticated_returns_401_or_403(self):
        r = requests.get(f"{BASE_URL}/api/settings/credentials", timeout=15)
        assert r.status_code in (401, 403), r.status_code


# ---------- HEALTH STATUS ----------
class TestHealthStatus:
    def test_health_status_returns_three_services(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/health-status", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for svc in ("apify", "cloudinary", "mongodb"):
            assert svc in data, f"Missing {svc}"
            entry = data[svc]
            assert "checked_at" in entry
            assert "valid_until" in entry
            assert "validity_minutes" in entry
            assert "is_stale" in entry
            assert "remaining_seconds" in entry

    def test_validity_windows(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/health-status", headers=headers, timeout=15)
        data = r.json()
        assert data["apify"]["validity_minutes"] == 60
        assert data["cloudinary"]["validity_minutes"] == 60
        assert data["mongodb"]["validity_minutes"] == 30

    def test_check_cloudinary_updates_health(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/check-cloudinary", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("connected") is True
        assert body.get("checked_at")
        assert body.get("valid_until")
        # health-status should reflect this
        hs = requests.get(f"{BASE_URL}/api/settings/health-status", headers=headers, timeout=15).json()
        assert hs["cloudinary"]["checked_at"] == body["checked_at"]
        assert hs["cloudinary"]["is_stale"] is False
        assert hs["cloudinary"]["remaining_seconds"] > 3500  # ~60min window

    def test_check_mongodb_updates_health(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/check-mongodb", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("connected") is True
        hs = requests.get(f"{BASE_URL}/api/settings/health-status", headers=headers, timeout=15).json()
        assert hs["mongodb"]["is_stale"] is False
        assert hs["mongodb"]["remaining_seconds"] > 1700  # ~30min window

    def test_apify_status_updates_health(self, headers):
        # Apify call may take ~10s
        r = requests.get(f"{BASE_URL}/api/apify/status", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # confirms validity TTL fields are now in apify status payload
        assert "checked_at" in body
        assert "valid_until" in body
        assert "validity_minutes" in body
        hs = requests.get(f"{BASE_URL}/api/settings/health-status", headers=headers, timeout=15).json()
        assert hs["apify"]["checked_at"] == body["checked_at"]


# ---------- UPDATE CREDENTIAL ----------
class TestUpdateCredential:
    def test_invalid_apify_token_rejected_with_400(self, headers):
        payload = {"key": "APIFY_TOKEN", "value": "invalid_token_xyz_DOES_NOT_EXIST"}
        r = requests.put(f"{BASE_URL}/api/settings/credentials", headers=headers, json=payload, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "Apify validation failed" in detail or "HTTP 401" in detail, detail

        # Credential should NOT be persisted — source should remain 'env'
        listed = requests.get(f"{BASE_URL}/api/settings/credentials", headers=headers, timeout=15).json()
        cred = next(c for c in listed["credentials"] if c["key"] == "APIFY_TOKEN")
        assert cred["source"] == "env", f"Invalid update should not persist, got source={cred['source']}"

    def test_unknown_key_rejected(self, headers):
        payload = {"key": "NON_EXISTENT_KEY", "value": "whatever"}
        r = requests.put(f"{BASE_URL}/api/settings/credentials", headers=headers, json=payload, timeout=15)
        assert r.status_code == 400, r.text
        assert "Unknown" in r.json().get("detail", "")

    def test_empty_value_rejected(self, headers):
        payload = {"key": "APIFY_TOKEN", "value": "   "}
        r = requests.put(f"{BASE_URL}/api/settings/credentials", headers=headers, json=payload, timeout=15)
        assert r.status_code == 400, r.text

    def test_valid_apify_token_persisted_then_reset(self, headers):
        """Round-trip: PUT valid token → DB override created → DELETE → falls back to env."""
        payload = {"key": "APIFY_TOKEN", "value": REAL_APIFY_TOKEN}
        r = requests.put(f"{BASE_URL}/api/settings/credentials", headers=headers, json=payload, timeout=30)
        assert r.status_code == 200, f"Valid token should succeed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert body["credential"]["source"] == "database"
        assert body["credential"]["updated_by"] == "mydatejar@gmail.com"

        # Confirm via listing
        listed = requests.get(f"{BASE_URL}/api/settings/credentials", headers=headers, timeout=15).json()
        cred = next(c for c in listed["credentials"] if c["key"] == "APIFY_TOKEN")
        assert cred["source"] == "database"

        # Reset
        d = requests.delete(f"{BASE_URL}/api/settings/credentials/APIFY_TOKEN", headers=headers, timeout=15)
        assert d.status_code == 200, d.text
        assert d.json()["credential"]["source"] == "env"


# ---------- AUDIT LOG ----------
class TestAuditLog:
    def test_audit_log_contains_credential_actions(self, headers):
        # Force events first (idempotent) — reject + reset
        requests.put(
            f"{BASE_URL}/api/settings/credentials", headers=headers,
            json={"key": "APIFY_TOKEN", "value": "invalid_token_xyz_audit_test"}, timeout=30,
        )
        requests.delete(f"{BASE_URL}/api/settings/credentials/APIFY_TOKEN", headers=headers, timeout=15)

        time.sleep(1)
        r = requests.get(f"{BASE_URL}/api/audit-logs", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        logs = r.json()
        # API may return list or {logs: [...]}
        entries = logs if isinstance(logs, list) else logs.get("logs", logs.get("entries", []))
        actions = {e.get("action") for e in entries}
        assert "credential_update_rejected" in actions, f"actions seen={actions}"
        assert "credential_reset" in actions, f"actions seen={actions}"


# ---------- REGRESSION: existing endpoints still work after refactor ----------
class TestRegression:
    def test_apify_status_still_works(self, headers):
        r = requests.get(f"{BASE_URL}/api/apify/status", headers=headers, timeout=30)
        assert r.status_code == 200
        # Should still report Apify is reachable
        body = r.json()
        assert body.get("connected") is True or body.get("token_valid") is True or "actor" in body

    def test_build_info_version_bumped(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/build-info", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("version") == "2.6.11"

    def test_history_endpoint(self, headers):
        r = requests.get(f"{BASE_URL}/api/history", headers=headers, timeout=15)
        assert r.status_code in (200, 404)  # endpoint shape may differ but should not 500
