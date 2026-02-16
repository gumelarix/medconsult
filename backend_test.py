import requests
import sys
import json
from datetime import datetime

class OnlineDoctorAPITester:
    def __init__(self, base_url="https://medconnect-232.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.doctor_token = None
        self.patient_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.doctor_user = None
        self.patient_user = None
        self.schedule_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 200:
                        print(f"   Response: {response_data}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health check endpoint"""
        return self.run_test("Health Check", "GET", "health", 200)

    def test_seed_data(self):
        """Test seed data creation"""
        success, response = self.run_test("Seed Data", "POST", "seed", 200)
        if success:
            print(f"   Created: {response.get('schedules', 0)} schedules, {response.get('queueEntries', 0)} queue entries")
        return success

    def test_doctor_login(self):
        """Test doctor login"""
        success, response = self.run_test(
            "Doctor Login",
            "POST",
            "auth/login",
            200,
            data={"email": "doctor@clinic.com", "password": "doctor123"}
        )
        if success and 'access_token' in response:
            self.doctor_token = response['access_token']
            self.doctor_user = response.get('user', {})
            print(f"   Doctor: {self.doctor_user.get('name', 'Unknown')}")
            return True
        return False

    def test_patient_login(self):
        """Test patient login"""
        success, response = self.run_test(
            "Patient Login",
            "POST",
            "auth/login",
            200,
            data={"email": "john@email.com", "password": "patient123"}
        )
        if success and 'access_token' in response:
            self.patient_token = response['access_token']
            self.patient_user = response.get('user', {})
            print(f"   Patient: {self.patient_user.get('name', 'Unknown')}")
            return True
        return False

    def test_doctor_schedules(self):
        """Test doctor schedules endpoint"""
        if not self.doctor_token:
            print("❌ No doctor token available")
            return False
        
        success, response = self.run_test(
            "Doctor Schedules",
            "GET",
            "doctor/schedules",
            200,
            token=self.doctor_token
        )
        if success and isinstance(response, list) and len(response) > 0:
            self.schedule_id = response[0].get('id')
            print(f"   Found {len(response)} schedules")
            print(f"   First schedule: {response[0].get('date')} {response[0].get('startTime')}-{response[0].get('endTime')}")
            return True
        return success

    def test_start_practice(self):
        """Test starting practice session"""
        if not self.doctor_token or not self.schedule_id:
            print("❌ No doctor token or schedule ID available")
            return False
        
        success, response = self.run_test(
            "Start Practice",
            "POST",
            f"doctor/schedules/{self.schedule_id}/start",
            200,
            data={},
            token=self.doctor_token
        )
        if success:
            print(f"   Status: {response.get('status', 'Unknown')}")
        return success

    def test_patient_schedules(self):
        """Test patient schedules endpoint"""
        if not self.patient_token:
            print("❌ No patient token available")
            return False
        
        success, response = self.run_test(
            "Patient Schedules",
            "GET",
            "patient/schedules",
            200,
            token=self.patient_token
        )
        if success and isinstance(response, list):
            print(f"   Found {len(response)} available schedules")
            for schedule in response[:2]:  # Show first 2
                print(f"   - {schedule.get('doctorName', 'Unknown')} on {schedule.get('date')} ({schedule.get('status', 'Unknown')})")
        return success

    def test_patient_schedule_detail(self):
        """Test patient schedule detail endpoint"""
        if not self.patient_token or not self.schedule_id:
            print("❌ No patient token or schedule ID available")
            return False
        
        success, response = self.run_test(
            "Patient Schedule Detail",
            "GET",
            f"patient/schedules/{self.schedule_id}",
            200,
            token=self.patient_token
        )
        if success:
            schedule = response.get('schedule', {})
            queue_entry = response.get('queueEntry')
            total_queue = response.get('totalInQueue', 0)
            print(f"   Schedule: {schedule.get('doctorName', 'Unknown')} - {schedule.get('status', 'Unknown')}")
            print(f"   Queue: {total_queue} total, Patient in queue: {'Yes' if queue_entry else 'No'}")
        return success

    def test_join_queue(self):
        """Test joining queue"""
        if not self.patient_token or not self.schedule_id:
            print("❌ No patient token or schedule ID available")
            return False
        
        success, response = self.run_test(
            "Join Queue",
            "POST",
            f"patient/schedules/{self.schedule_id}/join-queue",
            200,
            data={},
            token=self.patient_token
        )
        if success:
            print(f"   Queue number: {response.get('queueNumber', 'Unknown')}")
        return success

    def test_toggle_ready(self):
        """Test toggling ready status"""
        if not self.patient_token or not self.schedule_id:
            print("❌ No patient token or schedule ID available")
            return False
        
        success, response = self.run_test(
            "Toggle Ready (True)",
            "POST",
            f"patient/schedules/{self.schedule_id}/toggle-ready",
            200,
            data={"isReady": True},
            token=self.patient_token
        )
        if success:
            print(f"   Ready status: {response.get('isReady', 'Unknown')}")
            print(f"   Queue status: {response.get('status', 'Unknown')}")
        return success

    def test_doctor_queue(self):
        """Test doctor queue endpoint"""
        if not self.doctor_token or not self.schedule_id:
            print("❌ No doctor token or schedule ID available")
            return False
        
        success, response = self.run_test(
            "Doctor Queue View",
            "GET",
            f"doctor/schedules/{self.schedule_id}/queue",
            200,
            token=self.doctor_token
        )
        if success and isinstance(response, list):
            print(f"   Queue entries: {len(response)}")
            for entry in response[:2]:  # Show first 2
                print(f"   - #{entry.get('queueNumber', '?')} {entry.get('patientName', 'Unknown')} ({entry.get('status', 'Unknown')})")
        return success

def main():
    print("🏥 Online Doctor Consultation API Testing")
    print("=" * 50)
    
    tester = OnlineDoctorAPITester()
    
    # Test sequence
    tests = [
        ("Health Check", tester.test_health_check),
        ("Seed Data", tester.test_seed_data),
        ("Doctor Login", tester.test_doctor_login),
        ("Patient Login", tester.test_patient_login),
        ("Doctor Schedules", tester.test_doctor_schedules),
        ("Start Practice", tester.test_start_practice),
        ("Patient Schedules", tester.test_patient_schedules),
        ("Patient Schedule Detail", tester.test_patient_schedule_detail),
        ("Join Queue", tester.test_join_queue),
        ("Toggle Ready", tester.test_toggle_ready),
        ("Doctor Queue View", tester.test_doctor_queue),
    ]
    
    print(f"\n🚀 Running {len(tests)} API tests...")
    
    for test_name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"❌ {test_name} - Exception: {str(e)}")
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())