# MedConsult - Online Doctor Consultation Platform

## Original Problem Statement
Build a fullstack web app for Online Doctor Consultation with queue-based 1-to-1 video conference, doctor-controlled session invitations, real-time updates, and loud patient notifications.

## Architecture & Tech Stack
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + Python 3.11
- **Database**: MongoDB
- **Real-time**: Socket.IO (python-socketio) - mounted at `/api/socket.io`
- **Video Calls**: PeerJS (WebRTC)
- **Authentication**: JWT (bcrypt + pyjwt)
- **PWA**: Service worker + web manifest for notifications

## User Personas
1. **Doctor** - Manages consultation schedules, starts practice sessions, controls patient queue, initiates video calls
2. **Patient** - Joins consultation queue, toggles ready status, receives call invitations, participates in video consultations

## Core Requirements (Static)
1. Role-based authentication (Doctor/Patient)
2. Doctor schedule management with UPCOMING/ONLINE/COMPLETED states
3. Queue-based patient management per schedule
4. Doctor-controlled call invitation flow
5. Patient ready toggle system
6. Continuous ringtone notifications for call invitations (30-second timeout)
7. WebRTC 1-to-1 video calls
8. Real-time updates via Socket.IO
9. Audit logging for all actions

## What's Been Implemented

### Feb 16, 2026 - WebSocket Fix & Ringtone Feature
- [x] **Fixed WebSocket (Socket.IO) connection** - Was broken because mounted at `/socket.io` which routed to frontend. Now correctly mounted at `/api/socket.io` for K8s ingress routing
- [x] **Continuous ringtone for call invitations** - Updated InvitationModal to play looping ringtone using notificationService
- [x] Real-time events now working: queue_updated, call_invitation, call_confirmed, call_declined
- [x] Socket connection indicator shows "Connected" when WebSocket is active

### Earlier Implementation
- [x] Login/Register with JWT authentication
- [x] Doctor Dashboard with schedule management
- [x] Doctor Practice Room with patient queue view
- [x] Start/End practice session functionality
- [x] Patient Consultation page with schedule browsing
- [x] Patient Schedule View with queue position
- [x] Patient Ready toggle functionality
- [x] Call invitation system (doctor initiates)
- [x] "Waiting for Patient" confirmation modal
- [x] Invitation Modal with 30-second countdown
- [x] Video Call Room with PeerJS integration
- [x] Mic/Camera toggle controls
- [x] End call functionality with both parties
- [x] "Call Again" feature for doctors to re-invite patients
- [x] PWA foundation (manifest.json, service worker, icons)
- [x] Native browser notifications for calls
- [x] Audit logging backend (AuditLog model with log_audit function)
- [x] Seed data (1 doctor, 5 patients, 3 schedules, 5 queue entries)
- [x] Clean medical UI theme (Clinical Swiss design)

## Prioritized Backlog

### P0 - Critical (Completed)
- [x] Authentication system
- [x] Doctor schedule CRUD
- [x] Patient queue management
- [x] Call invitation flow
- [x] Video call room
- [x] WebSocket real-time updates

### P1 - High Priority (In Progress / Next)
- [ ] Full PWA background notification testing (service worker)
- [ ] Enhanced error handling for WebRTC connections
- [ ] Call reconnection on network issues

### P2 - Medium Priority (Future)
- [ ] Doctor notes during/after consultation
- [ ] Patient medical history view
- [ ] Multiple doctors support
- [ ] Schedule date picker improvements
- [ ] Email notifications

### P3 - Low Priority (Future)
- [ ] Analytics dashboard
- [ ] Video recording
- [ ] Chat during consultation
- [ ] Rating system
- [ ] Prescription generation

## Demo Credentials
- **Doctor**: doctor@clinic.com / doctor123
- **Patient**: john@email.com / patient123 (and 4 other patients)

## API Endpoints
- POST /api/auth/login - Login
- POST /api/auth/register - Register
- GET /api/auth/me - Get current user
- GET /api/doctor/schedules - Get doctor's schedules
- POST /api/doctor/schedules - Create schedule
- POST /api/doctor/schedules/:id/start - Start practice
- POST /api/doctor/schedules/:id/end - End practice
- GET /api/doctor/schedules/:id/queue - Get patient queue
- POST /api/doctor/schedules/:id/start-call - Invite patient
- POST /api/doctor/schedules/:id/reset-patient/:patientId - Reset patient for re-call
- GET /api/doctor/call-sessions/:id/status - Check call status (polling)
- GET /api/patient/schedules - Get available schedules
- GET /api/patient/schedules/:id - Get schedule detail
- POST /api/patient/schedules/:id/join-queue - Join queue
- POST /api/patient/schedules/:id/toggle-ready - Toggle ready status
- GET /api/patient/pending-invitation - Check for pending invitations (polling)
- POST /api/patient/call-sessions/:id/confirm - Confirm call
- POST /api/patient/call-sessions/:id/decline - Decline call
- GET /api/call-sessions/:id - Get call session details
- POST /api/seed - Seed demo data

## Socket.IO Events
- `connect` - Client connected
- `authenticate` - Authenticate with JWT token
- `authenticated` - Auth successful
- `join_schedule` - Join schedule room
- `leave_schedule` - Leave schedule room
- `join_call` - Join call session room
- `queue_updated` - Queue changed (patient joined/left/toggled ready)
- `schedule_status_changed` - Practice started/ended
- `call_invitation` - Doctor inviting patient
- `call_confirmed` - Patient confirmed call
- `call_declined` - Patient declined call
- `call_ended` - Call session ended
- `peer_id_updated` - WebRTC peer ID shared

## Key Files
- `/app/backend/server.py` - All backend logic, API routes, Socket.IO
- `/app/frontend/src/context/SocketContext.js` - Socket.IO client connection
- `/app/frontend/src/pages/DoctorPracticeRoom.js` - Doctor queue management
- `/app/frontend/src/pages/PatientScheduleView.js` - Patient waiting room
- `/app/frontend/src/pages/CallRoom.js` - WebRTC video call
- `/app/frontend/src/components/InvitationModal.js` - Incoming call UI with ringtone
- `/app/frontend/src/utils/notificationService.js` - PWA notifications
