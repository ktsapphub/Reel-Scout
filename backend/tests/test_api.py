"""
IG Reel Finder API Tests
Tests for authentication, Apify status, and core API endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Tests for /api/auth endpoints"""
    
    def test_login_valid_credentials(self):
        """Test login with valid allowlist email and password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "email" in data, "Response should contain email"
        assert data["email"] == "mydatejar@gmail.com", "Email should match"
        assert len(data["token"]) > 0, "Token should not be empty"
        print(f"SUCCESS: Login returned valid token")
    
    def test_login_second_valid_user(self):
        """Test login with second allowlist user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "joseph@centurion-pm.com",
            "password": "#Test1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["email"] == "joseph@centurion-pm.com"
        print("SUCCESS: Second allowlist user can login")
    
    def test_login_invalid_password(self):
        """Test login with incorrect password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("SUCCESS: Invalid password rejected with 401")
    
    def test_login_not_in_allowlist(self):
        """Test login with email not in allowlist"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "notallowed@example.com",
            "password": "#Test1234"
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("SUCCESS: Non-allowlist email rejected with 403")
    
    def test_login_missing_fields(self):
        """Test login with missing fields"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ""
        })
        # Should return 422 for validation error or 400/401
        assert response.status_code in [400, 401, 403, 422], f"Got {response.status_code}"
        print("SUCCESS: Missing fields handled correctly")


class TestApifyStatus:
    """Tests for /api/apify/status endpoint - requires authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_apify_status_authenticated(self):
        """Test Apify status endpoint with valid auth"""
        response = requests.get(f"{BASE_URL}/api/apify/status", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Check required fields exist
        assert "connected" in data, "Should have connected field"
        assert "hashtag_token_valid" in data, "Should have hashtag_token_valid"
        assert "username_token_valid" in data, "Should have username_token_valid"
        assert "username_actor_accessible" in data, "Should have username_actor_accessible"
        assert "hashtag_actor_accessible" in data, "Should have hashtag_actor_accessible"
        assert "message" in data, "Should have message field"
        
        # Log the status for debugging
        print(f"Apify Status: connected={data['connected']}, hashtag_valid={data['hashtag_token_valid']}, username_valid={data['username_token_valid']}")
        print(f"SUCCESS: Apify status endpoint returns proper structure")
    
    def test_apify_status_unauthenticated(self):
        """Test Apify status without auth token"""
        response = requests.get(f"{BASE_URL}/api/apify/status")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: Apify status requires authentication")


class TestAuthMe:
    """Tests for /api/auth/me endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_get_me_authenticated(self):
        """Test /auth/me with valid token"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "mydatejar@gmail.com"
        print("SUCCESS: /auth/me returns correct user email")
    
    def test_get_me_unauthenticated(self):
        """Test /auth/me without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403]
        print("SUCCESS: /auth/me requires authentication")


class TestSearchHistory:
    """Tests for /api/search-history endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_get_search_history(self):
        """Test fetching search history"""
        response = requests.get(f"{BASE_URL}/api/search-history", headers=self.headers)
        # Should return 200 even if empty
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # Response has 'history' key with list
        assert "history" in data, "Response should have 'history' key"
        assert isinstance(data["history"], list), "History should be a list"
        print(f"SUCCESS: Search history returns {len(data['history'])} items")


class TestAuditLogs:
    """Tests for /api/audit-logs endpoint - NEW P2 feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_get_audit_logs_authenticated(self):
        """Test fetching audit logs with valid auth"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "logs" in data, "Response should have 'logs' key"
        assert "total" in data, "Response should have 'total' key"
        assert isinstance(data["logs"], list), "Logs should be a list"
        assert isinstance(data["total"], int), "Total should be an integer"
        print(f"SUCCESS: Audit logs returns {len(data['logs'])} logs, total: {data['total']}")
    
    def test_get_audit_logs_with_action_filter(self):
        """Test filtering audit logs by action type"""
        response = requests.get(f"{BASE_URL}/api/audit-logs?action=login", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "logs" in data, "Response should have 'logs' key"
        # All returned logs should have action=login
        for log in data["logs"]:
            assert log.get("action") == "login", f"Expected action=login, got {log.get('action')}"
        print(f"SUCCESS: Audit logs filter by action=login returns {len(data['logs'])} logs")
    
    def test_get_audit_logs_with_pagination(self):
        """Test audit logs pagination with limit and skip"""
        response = requests.get(f"{BASE_URL}/api/audit-logs?limit=5&skip=0", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert len(data["logs"]) <= 5, "Should return at most 5 logs"
        print(f"SUCCESS: Audit logs pagination works, returned {len(data['logs'])} logs")
    
    def test_get_audit_logs_unauthenticated(self):
        """Test audit logs without auth token"""
        response = requests.get(f"{BASE_URL}/api/audit-logs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: Audit logs requires authentication")
    
    def test_audit_log_entry_structure(self):
        """Test that audit log entries have correct structure"""
        response = requests.get(f"{BASE_URL}/api/audit-logs?limit=1", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        if len(data["logs"]) > 0:
            log = data["logs"][0]
            # Check required fields
            assert "action" in log, "Log should have 'action' field"
            assert "user_email" in log, "Log should have 'user_email' field"
            assert "timestamp" in log, "Log should have 'timestamp' field"
            print(f"SUCCESS: Audit log entry has correct structure: action={log['action']}, user={log['user_email']}")
        else:
            print("INFO: No audit logs found to verify structure")


class TestSearchRequestDateRange:
    """Tests for date range parameters in search request - NEW P1 feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_search_accepts_date_range_params(self):
        """Test that search endpoint accepts only_posts_newer_than and only_posts_older_than"""
        # This test verifies the endpoint accepts the parameters without error
        # We don't actually run the search (would cost Apify credits)
        payload = {
            "search_type": "username",
            "usernames": ["testuser_nonexistent_12345"],
            "max_results": 5,
            "only_posts_newer_than": "2024-01-01",
            "only_posts_older_than": "2025-01-01"
        }
        response = requests.post(f"{BASE_URL}/api/reels/search/start", json=payload, headers=self.headers)
        # Should not return 422 (validation error) - the params should be accepted
        assert response.status_code != 422, f"Date range params should be accepted, got 422: {response.text}"
        print(f"SUCCESS: Search endpoint accepts date range parameters (status: {response.status_code})")


class TestSettingsBuildInfo:
    """Tests for /api/settings/build-info endpoint - NEW Settings page feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_get_build_info_authenticated(self):
        """Test fetching build info with valid auth"""
        response = requests.get(f"{BASE_URL}/api/settings/build-info", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Check required fields
        assert "app_name" in data, "Should have app_name"
        assert "version" in data, "Should have version"
        assert "build_date" in data, "Should have build_date"
        assert "framework" in data, "Should have framework"
        assert "features" in data, "Should have features list"
        assert "integrations" in data, "Should have integrations"
        
        # Verify specific values
        assert data["app_name"] == "Reel Scout", f"Expected 'Reel Scout', got {data['app_name']}"
        assert data["version"] == "2.6.11", f"Expected version '2.6.11', got {data['version']}"
        assert data["framework"] == "FastAPI", f"Expected 'FastAPI', got {data['framework']}"
        assert isinstance(data["features"], list), "Features should be a list"
        assert len(data["features"]) > 0, "Features list should not be empty"
        
        # Check integrations structure
        assert "apify" in data["integrations"], "Should have apify integration info"
        assert "cloudinary" in data["integrations"], "Should have cloudinary integration info"
        assert "actors" in data["integrations"]["apify"], "Apify should have actors info"
        
        print(f"SUCCESS: Build info returns version={data['version']}, {len(data['features'])} features")
    
    def test_get_build_info_unauthenticated(self):
        """Test build info without auth token"""
        response = requests.get(f"{BASE_URL}/api/settings/build-info")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: Build info requires authentication")


class TestSettingsCheckCloudinary:
    """Tests for /api/settings/check-cloudinary endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_check_cloudinary_authenticated(self):
        """Test Cloudinary connection check with valid auth"""
        response = requests.get(f"{BASE_URL}/api/settings/check-cloudinary", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Check required fields
        assert "connected" in data, "Should have connected field"
        assert "checked_at" in data, "Should have checked_at timestamp"
        
        # If connected, should have cloud_name and api_key_hint
        if data["connected"]:
            assert "cloud_name" in data, "Connected response should have cloud_name"
            assert "api_key_hint" in data, "Connected response should have api_key_hint"
            print(f"SUCCESS: Cloudinary connected, cloud_name={data['cloud_name']}")
        else:
            # If not connected, should have error
            assert "error" in data, "Disconnected response should have error"
            print(f"SUCCESS: Cloudinary check returned connected=False with error")
    
    def test_check_cloudinary_unauthenticated(self):
        """Test Cloudinary check without auth token"""
        response = requests.get(f"{BASE_URL}/api/settings/check-cloudinary")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: Cloudinary check requires authentication")


class TestSettingsCheckMongoDB:
    """Tests for /api/settings/check-mongodb endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "mydatejar@gmail.com",
            "password": "#Test1234"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_check_mongodb_authenticated(self):
        """Test MongoDB connection check with valid auth"""
        response = requests.get(f"{BASE_URL}/api/settings/check-mongodb", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Check required fields
        assert "connected" in data, "Should have connected field"
        assert "checked_at" in data, "Should have checked_at timestamp"
        
        # If connected, should have database and collections
        if data["connected"]:
            assert "database" in data, "Connected response should have database name"
            assert "collections" in data, "Connected response should have collections"
            assert isinstance(data["collections"], dict), "Collections should be a dict"
            print(f"SUCCESS: MongoDB connected, database={data['database']}, collections={list(data['collections'].keys())}")
        else:
            # If not connected, should have error
            assert "error" in data, "Disconnected response should have error"
            print(f"SUCCESS: MongoDB check returned connected=False with error")
    
    def test_check_mongodb_unauthenticated(self):
        """Test MongoDB check without auth token"""
        response = requests.get(f"{BASE_URL}/api/settings/check-mongodb")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: MongoDB check requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
