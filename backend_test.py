import requests
import sys
import json
from datetime import datetime

class IGReelFinderAPITester:
    def __init__(self, base_url="https://contentjar.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    Details: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                details += f" (Expected: {expected_status})"
                try:
                    error_data = response.json()
                    details += f", Response: {error_data}"
                except:
                    details += f", Response: {response.text[:200]}"
            
            self.log_test(name, success, details)
            return success, response.json() if success and response.content else {}

        except Exception as e:
            self.log_test(name, False, f"Error: {str(e)}")
            return False, {}

    def test_login_valid_credentials(self):
        """Test login with valid credentials"""
        success, response = self.run_test(
            "Login with valid credentials",
            "POST",
            "auth/login",
            200,
            data={"email": "mydatejar@gmail.com", "password": "#Test1234"}
        )
        if success and 'token' in response:
            self.token = response['token']
            return True
        return False

    def test_login_invalid_password(self):
        """Test login with invalid password"""
        success, _ = self.run_test(
            "Login with invalid password",
            "POST",
            "auth/login",
            401,
            data={"email": "mydatejar@gmail.com", "password": "wrongpassword"}
        )
        return success

    def test_login_non_allowlist_email(self):
        """Test login with non-allowlist email"""
        success, _ = self.run_test(
            "Login with non-allowlist email",
            "POST",
            "auth/login",
            403,
            data={"email": "notallowed@example.com", "password": "#Test1234"}
        )
        return success

    def test_get_me(self):
        """Test get current user endpoint"""
        success, _ = self.run_test(
            "Get current user info",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_search_username(self):
        """Test username search"""
        success, response = self.run_test(
            "Search reels by username",
            "POST",
            "reels/search",
            200,
            data={
                "search_type": "username",
                "usernames": ["natgeo"],
                "max_results": 5
            }
        )
        return success

    def test_search_url_limitation(self):
        """Test URL search returns limitation message"""
        success, response = self.run_test(
            "Search reels by URL (should show limitation)",
            "POST",
            "reels/search",
            200,
            data={
                "search_type": "url",
                "urls": ["https://www.instagram.com/reel/ABC123/"],
                "max_results": 5
            }
        )
        if success:
            # Check if limitation message is returned
            message = response.get('message', '')
            if 'does not support direct URL mode' in message:
                self.log_test("URL search limitation message", True, f"Message: {message}")
                return True
            else:
                self.log_test("URL search limitation message", False, f"Unexpected message: {message}")
                return False
        return False

    def test_search_hashtag_limitation(self):
        """Test hashtag search returns limitation message"""
        success, response = self.run_test(
            "Search reels by hashtag (should show limitation)",
            "POST",
            "reels/search",
            200,
            data={
                "search_type": "hashtag",
                "hashtag": "datenight",
                "max_results": 5
            }
        )
        if success:
            # Check if limitation message is returned
            message = response.get('message', '')
            if 'requires a hashtag-capable actor' in message:
                self.log_test("Hashtag search limitation message", True, f"Message: {message}")
                return True
            else:
                self.log_test("Hashtag search limitation message", False, f"Unexpected message: {message}")
                return False
        return False

    def test_export_reels(self):
        """Test export reels functionality"""
        # Create sample reel data for export
        sample_reels = [
            {
                "id": "test-reel-1",
                "owner_username": "testuser",
                "owner_full_name": "Test User",
                "reel_url": "https://www.instagram.com/reel/test123/",
                "video_duration_seconds": 30,
                "video_transcript": "Test transcript"
            }
        ]
        
        success, _ = self.run_test(
            "Export reels to CSV",
            "POST",
            "reels/export",
            200,
            data={"reels": sample_reels, "selected_only": False}
        )
        return success

    def test_search_invalid_type(self):
        """Test search with invalid search type"""
        success, _ = self.run_test(
            "Search with invalid type",
            "POST",
            "reels/search",
            400,
            data={
                "search_type": "invalid",
                "max_results": 5
            }
        )
        return success

    def test_search_missing_username(self):
        """Test username search without usernames"""
        success, _ = self.run_test(
            "Username search without usernames",
            "POST",
            "reels/search",
            400,
            data={
                "search_type": "username",
                "usernames": [],
                "max_results": 5
            }
        )
        return success

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting IG Reel Finder API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 50)

        # Authentication tests
        print("\n📋 Authentication Tests:")
        self.test_login_valid_credentials()
        self.test_login_invalid_password()
        self.test_login_non_allowlist_email()
        
        if not self.token:
            print("❌ Cannot proceed without valid token")
            return False

        self.test_get_me()

        # Search tests
        print("\n🔍 Search Tests:")
        self.test_search_username()
        self.test_search_url_limitation()
        self.test_search_hashtag_limitation()
        self.test_search_invalid_type()
        self.test_search_missing_username()

        # Export tests
        print("\n📤 Export Tests:")
        self.test_export_reels()

        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")

        return self.tests_passed == self.tests_run

def main():
    tester = IGReelFinderAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump({
            'summary': {
                'total_tests': tester.tests_run,
                'passed_tests': tester.tests_passed,
                'success_rate': f"{(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%"
            },
            'test_results': tester.test_results
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())