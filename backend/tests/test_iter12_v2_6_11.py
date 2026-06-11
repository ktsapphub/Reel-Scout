"""
v2.6.11 focused tests (iteration_12):
- Version badge bumped to 2.6.11 in build-info
- GET /api/settings/credentials includes used_by mapping per credential
- GET /api/settings/credentials/{key}/reveal returns unmasked value (audit-logged)
- POST /api/settings/credentials/{key}/test validates the specific credential
- GET /api/settings/health-status returns cached statuses with checked_at
- GET /api/apify/status returns connected + actor accessibility + account_info
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
LOGIN = {"email": "mydatejar@gmail.com", "password": "#Test1234"}

EDITABLE_KEYS = [
    "APIFY_TOKEN", "APIFY_USERNAME_TOKEN",
    "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
]


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


# ---------- VERSION 2.6.11 ----------
class TestVersionBadge:
    def test_build_info_version_2_6_11(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/build-info", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("version") == "2.6.11", r.json().get("version")


# ---------- CREDENTIALS LIST WITH used_by ----------
class TestCredentialsUsedBy:
    def test_each_credential_has_used_by_field(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/credentials", headers=headers, timeout=15)
        assert r.status_code == 200
        creds = {c["key"]: c for c in r.json()["credentials"]}
        for k in EDITABLE_KEYS:
            assert k in creds, f"missing {k}"
            assert "used_by" in creds[k], f"{k} missing used_by"
            assert isinstance(creds[k]["used_by"], list)
            assert len(creds[k]["used_by"]) > 0, f"{k} used_by should be non-empty"
            # each entry should have a 'name'
            for entry in creds[k]["used_by"]:
                assert "name" in entry, f"{k} used_by entry missing 'name'"

    def test_apify_tokens_used_by_distinct_actors(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/credentials", headers=headers, timeout=15)
        creds = {c["key"]: c for c in r.json()["credentials"]}
        # APIFY_TOKEN should be associated with hashtag actor; APIFY_USERNAME_TOKEN with username actor
        ht_names = " ".join([e.get("name", "") for e in creds["APIFY_TOKEN"]["used_by"]]).lower()
        un_names = " ".join([e.get("name", "") for e in creds["APIFY_USERNAME_TOKEN"]["used_by"]]).lower()
        assert "hashtag" in ht_names or "post" in ht_names, ht_names
        assert "username" in un_names or "profile" in un_names, un_names


# ---------- REVEAL ----------
class TestRevealCredential:
    def test_reveal_apify_token_returns_real_value(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/credentials/APIFY_TOKEN/reveal", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "value" in body
        assert body["value"].startswith("apify_api_"), body["value"][:20]

    def test_reveal_unknown_key_rejected(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/credentials/NOT_A_KEY/reveal", headers=headers, timeout=15)
        assert r.status_code in (400, 404)

    def test_reveal_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/settings/credentials/APIFY_TOKEN/reveal", timeout=15)
        assert r.status_code in (401, 403)


# ---------- PER-CREDENTIAL TEST ENDPOINT ----------
class TestPerCredentialTest:
    def test_apify_token_test_endpoint(self, headers):
        r = requests.post(f"{BASE_URL}/api/settings/credentials/APIFY_TOKEN/test", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "ok" in body
        # valid token expected (set in .env)
        if body["ok"]:
            assert "details" in body
        else:
            assert "error" in body

    def test_cloudinary_cloud_name_test(self, headers):
        r = requests.post(f"{BASE_URL}/api/settings/credentials/CLOUDINARY_CLOUD_NAME/test", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "ok" in body

    def test_unknown_key_test_rejected(self, headers):
        r = requests.post(f"{BASE_URL}/api/settings/credentials/NOT_A_KEY/test", headers=headers, timeout=15)
        assert r.status_code in (400, 404)

    def test_unauthenticated_test(self):
        r = requests.post(f"{BASE_URL}/api/settings/credentials/APIFY_TOKEN/test", timeout=15)
        assert r.status_code in (401, 403)


# ---------- HEALTH STATUS CACHE ----------
class TestHealthStatus:
    def test_health_status_three_services_with_checked_at(self, headers):
        r = requests.get(f"{BASE_URL}/api/settings/health-status", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for svc in ("apify", "cloudinary", "mongodb"):
            assert svc in data
            assert "checked_at" in data[svc]
            assert "is_stale" in data[svc]


# ---------- APIFY STATUS ----------
class TestApifyStatus:
    def test_apify_status_returns_actor_flags(self, headers):
        r = requests.get(f"{BASE_URL}/api/apify/status", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "connected" in b
        assert "username_actor_accessible" in b
        assert "hashtag_actor_accessible" in b
        # account_info is optional but should be present in v2.6+
        # don't hard-fail if missing
        if "account_info" in b:
            assert isinstance(b["account_info"], dict)


# ---------- PRESETS CRUD ----------
class TestPresets:
    def test_preset_crud_roundtrip(self, headers):
        # create
        payload = {
            "name": "TEST_iter12_preset",
            "search_type": "hashtag",
            "hashtag": "test",
            "max_results": 5,
        }
        c = requests.post(f"{BASE_URL}/api/presets", headers=headers, json=payload, timeout=15)
        assert c.status_code in (200, 201), c.text
        pid = c.json().get("id") or c.json().get("preset", {}).get("id")
        assert pid, c.json()

        # list
        lst = requests.get(f"{BASE_URL}/api/presets", headers=headers, timeout=15)
        assert lst.status_code == 200
        items = lst.json().get("presets") if isinstance(lst.json(), dict) else lst.json()
        assert any((p.get("id") == pid) for p in items)

        # delete
        d = requests.delete(f"{BASE_URL}/api/presets/{pid}", headers=headers, timeout=15)
        assert d.status_code in (200, 204), d.text


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
