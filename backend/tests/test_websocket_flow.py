"""
Test WebSocket-related API endpoints for Online Doctor Consultation App
Tests: Authentication, Queue Management, Call Invitation Flow
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://medconnect-232.preview.emergentagent.com')

class TestHealthAndSeed:
    """Health check and seed data tests"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")
    
    def test_seed_data(self):
        """Test seed data creation"""
        response = requests.post(f"{BASE_URL}/api/seed")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Seed data created"
        assert data["schedules"] == 3
        assert data["queueEntries"] == 5
        print("✓ Seed data created successfully")


class TestAuthentication:
    """Authentication flow tests"""
    
    def test_doctor_login(self):
        """Test doctor login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "doctor@clinic.com",
            "password": "doctor123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "DOCTOR"
        assert data["user"]["email"] == "doctor@clinic.com"
        print(f"✓ Doctor login successful: {data['user']['name']}")
        return data["access_token"]
    
    def test_patient_login(self):
        """Test patient login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "john@email.com",
            "password": "patient123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "PATIENT"
        assert data["user"]["email"] == "john@email.com"
        print(f"✓ Patient login successful: {data['user']['name']}")
        return data["access_token"]
    
    def test_invalid_login(self):
        """Test invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")


class TestDoctorScheduleFlow:
    """Doctor schedule and practice management tests"""
    
    @pytest.fixture
    def doctor_token(self):
        """Get doctor auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "doctor@clinic.com",
            "password": "doctor123"
        })
        return response.json()["access_token"]
    
    def test_get_doctor_schedules(self, doctor_token):
        """Test getting doctor schedules"""
        response = requests.get(
            f"{BASE_URL}/api/doctor/schedules",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        schedules = response.json()
        assert len(schedules) == 3
        print(f"✓ Retrieved {len(schedules)} doctor schedules")
        return schedules
    
    def test_start_practice(self, doctor_token):
        """Test starting a practice session"""
        # Get schedules first
        schedules_response = requests.get(
            f"{BASE_URL}/api/doctor/schedules",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        schedules = schedules_response.json()
        schedule_id = schedules[0]["id"]
        
        # Start practice
        response = requests.post(
            f"{BASE_URL}/api/doctor/schedules/{schedule_id}/start",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ONLINE"
        print(f"✓ Practice started for schedule {schedule_id}")
        return schedule_id
    
    def test_get_queue(self, doctor_token):
        """Test getting patient queue"""
        # Get schedules first
        schedules_response = requests.get(
            f"{BASE_URL}/api/doctor/schedules",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        schedules = schedules_response.json()
        schedule_id = schedules[0]["id"]
        
        # Get queue
        response = requests.get(
            f"{BASE_URL}/api/doctor/schedules/{schedule_id}/queue",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        queue = response.json()
        assert len(queue) == 5  # 5 patients from seed data
        print(f"✓ Retrieved queue with {len(queue)} patients")
        return queue


class TestPatientFlow:
    """Patient consultation flow tests"""
    
    @pytest.fixture
    def patient_token(self):
        """Get patient auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "john@email.com",
            "password": "patient123"
        })
        return response.json()["access_token"]
    
    def test_get_available_schedules(self, patient_token):
        """Test getting available schedules for patient"""
        response = requests.get(
            f"{BASE_URL}/api/patient/schedules",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        schedules = response.json()
        assert len(schedules) >= 1
        print(f"✓ Patient can see {len(schedules)} available schedules")
        return schedules
    
    def test_get_schedule_detail(self, patient_token):
        """Test getting schedule detail with queue info"""
        # Get schedules first
        schedules_response = requests.get(
            f"{BASE_URL}/api/patient/schedules",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        schedules = schedules_response.json()
        schedule_id = schedules[0]["id"]
        
        # Get detail
        response = requests.get(
            f"{BASE_URL}/api/patient/schedules/{schedule_id}",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "schedule" in data
        assert "queueEntry" in data
        assert "totalInQueue" in data
        print(f"✓ Schedule detail retrieved, queue position: {data.get('queueEntry', {}).get('queueNumber', 'N/A')}")
        return data
    
    def test_toggle_ready_status(self, patient_token):
        """Test toggling patient ready status"""
        # Get schedules first
        schedules_response = requests.get(
            f"{BASE_URL}/api/patient/schedules",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        schedules = schedules_response.json()
        schedule_id = schedules[0]["id"]
        
        # Toggle ready to True
        response = requests.post(
            f"{BASE_URL}/api/patient/schedules/{schedule_id}/toggle-ready",
            json={"isReady": True},
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["isReady"] == True
        assert data["status"] == "READY"
        print("✓ Patient status toggled to READY")
        
        # Toggle ready to False
        response = requests.post(
            f"{BASE_URL}/api/patient/schedules/{schedule_id}/toggle-ready",
            json={"isReady": False},
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["isReady"] == False
        assert data["status"] == "WAITING"
        print("✓ Patient status toggled to WAITING")


class TestCallInvitationFlow:
    """End-to-end call invitation flow tests"""
    
    @pytest.fixture
    def setup_tokens(self):
        """Get both doctor and patient tokens"""
        doctor_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "doctor@clinic.com",
            "password": "doctor123"
        })
        patient_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "john@email.com",
            "password": "patient123"
        })
        return {
            "doctor_token": doctor_response.json()["access_token"],
            "patient_token": patient_response.json()["access_token"],
            "patient_id": patient_response.json()["user"]["id"]
        }
    
    def test_full_call_invitation_flow(self, setup_tokens):
        """Test complete call invitation flow: invite -> confirm -> end"""
        doctor_token = setup_tokens["doctor_token"]
        patient_token = setup_tokens["patient_token"]
        patient_id = setup_tokens["patient_id"]
        
        # Step 1: Get schedule and start practice
        schedules_response = requests.get(
            f"{BASE_URL}/api/doctor/schedules",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        schedule_id = schedules_response.json()[0]["id"]
        
        # Start practice if not already online
        requests.post(
            f"{BASE_URL}/api/doctor/schedules/{schedule_id}/start",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        print("✓ Step 1: Practice started")
        
        # Step 2: Patient sets ready status
        response = requests.post(
            f"{BASE_URL}/api/patient/schedules/{schedule_id}/toggle-ready",
            json={"isReady": True},
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        print("✓ Step 2: Patient set to READY")
        
        # Step 3: Doctor starts call
        response = requests.post(
            f"{BASE_URL}/api/doctor/schedules/{schedule_id}/start-call",
            json={"patientId": patient_id},
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        call_data = response.json()
        assert "callSessionId" in call_data
        assert call_data["status"] == "INVITED"
        call_session_id = call_data["callSessionId"]
        print(f"✓ Step 3: Call invitation sent, session: {call_session_id}")
        
        # Step 4: Check pending invitation for patient
        response = requests.get(
            f"{BASE_URL}/api/patient/pending-invitation",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        invitation_data = response.json()
        assert invitation_data["hasInvitation"] == True
        assert invitation_data["callSessionId"] == call_session_id
        print("✓ Step 4: Patient has pending invitation")
        
        # Step 5: Patient confirms call
        response = requests.post(
            f"{BASE_URL}/api/patient/call-sessions/{call_session_id}/confirm",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        print("✓ Step 5: Patient confirmed call")
        
        # Step 6: Check call session status (should be CONFIRMED)
        response = requests.get(
            f"{BASE_URL}/api/doctor/call-sessions/{call_session_id}/status",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        status_data = response.json()
        assert status_data["status"] == "CONFIRMED"
        print("✓ Step 6: Call status is CONFIRMED")
        
        # Step 7: Doctor ends call
        response = requests.post(
            f"{BASE_URL}/api/doctor/call-sessions/{call_session_id}/end",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        print("✓ Step 7: Call ended by doctor")
        
        # Step 8: Verify call session is ended
        response = requests.get(
            f"{BASE_URL}/api/call-sessions/{call_session_id}",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        final_data = response.json()
        assert final_data["status"] == "ENDED"
        print("✓ Step 8: Call session status is ENDED")
        
        print("\n✓✓✓ FULL CALL INVITATION FLOW PASSED ✓✓✓")
    
    def test_call_decline_flow(self):
        """Test call decline flow"""
        # Re-seed to get fresh data first
        requests.post(f"{BASE_URL}/api/seed")
        
        # Get fresh tokens after seed
        doctor_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "doctor@clinic.com",
            "password": "doctor123"
        })
        patient_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "john@email.com",
            "password": "patient123"
        })
        doctor_token = doctor_response.json()["access_token"]
        patient_token = patient_response.json()["access_token"]
        patient_id = patient_response.json()["user"]["id"]
        
        # Get schedule
        schedules_response = requests.get(
            f"{BASE_URL}/api/doctor/schedules",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        schedule_id = schedules_response.json()[0]["id"]
        
        # Start practice
        requests.post(
            f"{BASE_URL}/api/doctor/schedules/{schedule_id}/start",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        
        # Patient sets ready
        requests.post(
            f"{BASE_URL}/api/patient/schedules/{schedule_id}/toggle-ready",
            json={"isReady": True},
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        
        # Doctor starts call
        response = requests.post(
            f"{BASE_URL}/api/doctor/schedules/{schedule_id}/start-call",
            json={"patientId": patient_id},
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        call_session_id = response.json()["callSessionId"]
        
        # Patient declines call
        response = requests.post(
            f"{BASE_URL}/api/patient/call-sessions/{call_session_id}/decline",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert response.status_code == 200
        print("✓ Patient declined call")
        
        # Verify call session is declined
        response = requests.get(
            f"{BASE_URL}/api/call-sessions/{call_session_id}",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "DECLINED"
        print("✓ Call session status is DECLINED")


class TestSocketIOEndpoint:
    """Test Socket.IO endpoint availability"""
    
    def test_socketio_polling_endpoint(self):
        """Test Socket.IO polling endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/socket.io/?EIO=4&transport=polling")
        assert response.status_code == 200
        # Socket.IO returns a session ID in the response
        assert "sid" in response.text
        print("✓ Socket.IO polling endpoint accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
