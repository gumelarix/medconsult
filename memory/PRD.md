# MedConsult - Online Doctor Consultation Platform

## Original Problem Statement
Build a fullstack web app for Online Doctor Consultation with queue-based 1-to-1 video conference, doctor-controlled session invitations, real-time updates, and loud patient notifications.

## Architecture & Tech Stack
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + Python 3.11
- **Database**: MongoDB
- **Real-time**: Socket.IO (python-socketio)
- **Video Calls**: PeerJS (WebRTC)
- **Authentication**: JWT (bcrypt + pyjwt)

## User Personas
1. **Doctor** - Manages consultation schedules, starts practice sessions, controls patient queue, initiates video calls
2. **Patient** - Joins consultation queue, toggles ready status, receives call invitations, participates in video consultations

## Core Requirements (Static)
1. Role-based authentication (Doctor/Patient)
2. Doctor schedule management with UPCOMING/ONLINE/COMPLETED states
3. Queue-based patient management per schedule
4. Doctor-controlled call invitation flow
5. Patient ready toggle system
6. Loud audio notifications for call invitations (30-second timeout)
7. WebRTC 1-to-1 video calls
8. Real-time updates via Socket.IO
9. Audit logging for all actions

## What's Been Implemented (2026-02-11)
- [x] Login/Register with JWT authentication
- [x] Doctor Dashboard with schedule management
- [x] Doctor Practice Room with patient queue view
- [x] Start/End practice session functionality
- [x] Patient Consultation page with schedule browsing
- [x] Patient Schedule View with queue position
- [x] Patient Ready toggle functionality
- [x] Call invitation system (doctor initiates)
- [x] "Waiting for Patient" confirmation modal
- [x] Invitation Modal with loud audio notification
- [x] Video Call Room with PeerJS integration
- [x] Mic/Camera toggle controls
- [x] End call functionality
- [x] Socket.IO integration for real-time updates
- [x] Seed data (1 doctor, 5 patients, 3 schedules, 5 queue entries)
- [x] Clean medical UI theme (Clinical Swiss design)

## Prioritized Backlog

### P0 - Critical (Completed)
- [x] Authentication system
- [x] Doctor schedule CRUD
- [x] Patient queue management
- [x] Call invitation flow
- [x] Video call room

### P1 - High Priority (Future)
- [ ] Invitation timeout handling (auto-expire after 30s)
- [ ] Socket.IO connection stability improvements
- [ ] Doctor schedule creation UI
- [ ] Patient leave queue functionality
- [ ] Call history/summary

### P2 - Medium Priority (Future)
- [ ] Doctor notes during/after consultation
- [ ] Patient medical history view
- [ ] Multiple doctors support
- [ ] Schedule date picker
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
- GET /api/patient/schedules - Get available schedules
- GET /api/patient/schedules/:id - Get schedule detail
- POST /api/patient/schedules/:id/join-queue - Join queue
- POST /api/patient/schedules/:id/toggle-ready - Toggle ready status
- POST /api/patient/call-sessions/:id/confirm - Confirm call
- POST /api/patient/call-sessions/:id/decline - Decline call
- GET /api/call-sessions/:id - Get call session details
- POST /api/seed - Seed demo data
