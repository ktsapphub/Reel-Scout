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


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
