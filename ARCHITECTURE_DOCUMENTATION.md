# MedConsult: Doctor-Patient Call Flow Architecture

## Executive Summary

MedConsult is a real-time telemedicine platform that enables doctors to conduct online consultations with patients through a queue-based scheduling system and WebRTC video calls. The system uses a multi-layered architecture combining REST APIs, WebSockets, and peer-to-peer networking for reliable and responsive real-time communication.

---

## System Architecture Overview

### Core Components

1. **Backend (FastAPI + MongoDB)**
   - RESTful API for state management
   - Socket.IO server for real-time events
   - JWT authentication and role-based access control
   - MongoDB for persistent storage

2. **Frontend (React + Socket.IO + PeerJS)**
   - Doctor Dashboard: Manage schedules and call queue
   - Patient Interface: Browse schedules and wait in queue
   - Call Room: WebRTC video/audio communication

3. **Communication Protocols**
   - **HTTP/REST**: CRUD operations and state changes
   - **WebSocket (Socket.IO)**: Real-time event broadcasting
   - **WebRTC (PeerJS)**: P2P video/audio streaming

---

## Detailed Call Flow (9 Phases)

### Phase 1: Setup - Doctor Starts Practice

```
Doctor → POST /doctor/schedules/{id}/start → Backend
Backend → Update schedule.status = ONLINE → MongoDB
Backend → Broadcast schedule_status_changed → All Sockets
Socket.IO → All patients: "Doctor is now online"
```

**States After:**
- Schedule: `ONLINE`
- Doctor: Waiting in practice room, viewing empty queue

---

### Phase 2: Patient Joins Queue

```
Patient → POST /patient/schedules/{id}/join-queue → Backend
Backend → Insert queue_entry (status=WAITING) → MongoDB
Backend → Broadcast queue_updated → Doctor socket
Socket.IO → Doctor: Queue updated [1 patient]
```

**States After:**
- Queue Entry: `WAITING`
- Queue Number: Assigned based on join order
- Status Badge: Doctor sees "⏳ Waiting" in queue

---

### Phase 3: Patient Sets Ready Status

```
Patient → POST /patient/schedules/{id}/toggle-ready → Backend
Backend → Update queue_entry (status=READY, isReady=true) → MongoDB
Backend → Broadcast queue_updated → Doctor socket
Socket.IO → Doctor: Patient ready for consultation
```

**States After:**
- Queue Entry: `READY`
- Doctor sees "✅ Ready" badge
- Doctor can now click "Start Call" for this patient

**Note:** Polling fallback runs every 2 seconds if Socket.IO fails:
```javascript
GET /patient/pending-invitation  // Check for invitations
```

---

### Phase 4: Doctor Invites Patient

```
Doctor → POST /doctor/schedules/{id}/start-call (patientId) → Backend
Backend → Verify patient status == READY
Backend → Create call_session (status=INVITED) → MongoDB
Backend → Broadcast call_invitation → Patient socket
Socket.IO → Patient: Receive call invitation modal
Backend ← Doctor starts polling: GET /doctor/call-sessions/{id}/status (1.5s interval)
```

**States After:**
- Call Session: `INVITED`
- Patient sees: InvitationModal showing doctor's name
- Doctor: Polling status every 1.5 seconds for confirmation

**Polling Details:**
```javascript
// Doctor polls continuously
every 1.5s: GET /doctor/call-sessions/{callSessionId}/status
  → If CONFIRMED: Navigate to call room
  → If DECLINED: Show toast, refresh queue
  → If EXPIRED: Show toast (60s timeout), refresh queue
```

---

### Phase 5: Patient Responds to Invitation

#### Option A: Patient Confirms
```
Patient → POST /patient/call-sessions/{id}/confirm → Backend
Backend → Update call_session.status = CONFIRMED
Backend → Update queue_entry.status = IN_CALL → MongoDB
Backend → Broadcast call_confirmed → Doctor socket
Socket.IO → Doctor: Patient confirmed!
Doctor → Polling detects CONFIRMED status
Doctor → Navigate to /call/{callSessionId}
Patient → Click accept → POST /confirm
Patient → Navigate to /call/{callSessionId}
```

#### Option B: Patient Declines
```
Patient → POST /patient/call-sessions/{id}/decline → Backend
Backend → Update call_session.status = DECLINED
Backend → Reset queue_entry.status = WAITING
Backend → Broadcast call_declined → Doctor socket
Socket.IO → Doctor: Patient declined
Doctor → Polling detects DECLINED status
Doctor → Clear waiting state, view queue again
```

---

### Phase 6: CallRoom Initialization

```
Both Users:
  → Navigate to /call/{callSessionId}
  → Frontend: Verify call session exists via GET /call-sessions/{id}
  → Backend: Validate user has access (doctor OR patient)
  → Backend: Return call_session data

Call Session data structure:
{
  "id": "call_session_uuid",
  "scheduleId": "schedule_uuid",
  "doctorId": "doctor_uuid",
  "patientId": "patient_uuid",
  "status": "CONFIRMED",
  "createdAt": "2025-02-15T10:30:00Z",
  "confirmedAt": "2025-02-15T10:35:00Z",
  "doctorPeerId": null,        // Not yet set
  "patientPeerId": null        // Not yet set
}
```

---

### Phase 7: Media Initialization & PeerJS Setup

```
Both Users (Parallel):
  → CallRoom component mounts
  → Request browser permissions: Camera + Microphone
  → navigator.mediaDevices.getUserMedia({video: true, audio: true})
  → Receive local MediaStream
  → Set <video ref={localVideoRef}>.srcObject = localStream
  
  → Initialize PeerJS: const peer = new Peer()
  → PeerJS connects to its broker service
  → PeerJS 'open' event fires with unique Peer ID
    • Doctor gets: doctorPeerId = "peer_id_abc123"
    • Patient gets: patientPeerId = "peer_id_xyz789"
  → Store peer instance in React ref
  → Set loading state to false

Local state after this phase:
{
  localVideoRef: {srcObject: MediaStream},
  peerRef: {Peer instance},
  localStreamRef: {MediaStream},
  isConnecting: true,
  mediaInitialized: true
}
```

---

### Phase 8: Peer ID Exchange via Backend

This is critical for establishing P2P connection:

```
Doctor:
  POST /doctor/call-sessions/{callSessionId}/set-peer-id
  Body: { "peerId": "peer_id_abc123" }
  
Backend:
  → Update call_session.doctorPeerId = "peer_id_abc123"
  → Broadcast peer_id_updated event: {role: "doctor", peerId: "..."}
  
Socket.IO:
  → Patient receives: peer_id_updated event
  → Patient extracts doctorPeerId from call_session
  
Patient:
  POST /patient/call-sessions/{callSessionId}/set-peer-id
  Body: { "peerId": "peer_id_xyz789" }
  
Backend:
  → Update call_session.patientPeerId = "peer_id_xyz789"
  → Broadcast peer_id_updated event: {role: "patient", peerId: "..."}
  
Socket.IO:
  → Doctor receives: peer_id_updated event
  → Doctor extracts patientPeerId from call_session

Both Users:
  → GET /call-sessions/{callSessionId}  (refresh)
  → Receive updated call_session with both Peer IDs
  → Store remote peer ID in state
  → setIsConnecting(false)
```

---

### Phase 9: WebRTC Peer Connection & Stream Activation

```
Doctor (With patientPeerId now available):
  → peer.call(patientPeerId, localStreamRef.current)
  → Returns Peer Call object
  → Call.on('stream', (remoteStream) => {
      remoteVideoRef.srcObject = remoteStream
      setCallActive(true)
    })
  
Patient (Receives incoming call):
  → peer.on('call', (incomingCall) => {
      incomingCall.answer(localStreamRef.current)
      // Wait for stream event
    })
  → Call.on('stream', (remoteStream) => {
      remoteVideoRef.srcObject = remoteStream
      setCallActive(true)
    })

Backend (Detect both are ready):
  → POST /call-sessions/{callSessionId}/activate
  → Update call_session.status = ACTIVE
  → Broadcast call_activated event

Both Users (After stream received):
  → setCallActive(true)
  → Display both local and remote video
  → Enable mic/camera controls
  → Start polling: GET /call-sessions/{id} every 3 seconds
```

**Data Flow Diagram:**
```
Doctor's Local Stream
       ↓
PeerJS peer.call(patientPeerId, stream)
       ↓
PeerJS Broker (signaling via Server)
       ↓
Patient receives 'call' event
       ↓
Patient's Local Stream + Incoming Call
       ↓
call.answer(localStream)
       ↓
PeerJS bidirectional connection established
       ↓
Both receive 'stream' event with remote's MediaStream
       ↓
Display in <video> elements
```

---

## Data Models

### Database Collections

#### users
```json
{
  "id": "uuid",
  "email": "user@email.com",
  "name": "User Name",
  "passwordHash": "bcrypt_hash",
  "role": "DOCTOR | PATIENT",
  "createdAt": "ISO8601"
}
```

#### schedules
```json
{
  "id": "uuid",
  "doctorId": "doctor_uuid",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "status": "UPCOMING | ONLINE | COMPLETED"
}
```

#### queue_entries
```json
{
  "id": "uuid",
  "scheduleId": "schedule_uuid",
  "patientId": "patient_uuid",
  "queueNumber": 1,
  "status": "WAITING | READY | IN_CALL | DONE",
  "isReady": false,
  "joinedAt": "ISO8601"
}
```

#### call_sessions
```json
{
  "id": "uuid",
  "scheduleId": "schedule_uuid",
  "doctorId": "doctor_uuid",
  "patientId": "patient_uuid",
  "status": "INVITED | CONFIRMED | ACTIVE | ENDED | DECLINED | EXPIRED",
  "createdAt": "ISO8601",
  "confirmedAt": "ISO8601 | null",
  "endedAt": "ISO8601 | null",
  "doctorPeerId": "peer_id_abc123 | null",
  "patientPeerId": "peer_id_xyz789 | null"
}
```

#### audit_logs
```json
{
  "id": "uuid",
  "actorUserId": "user_uuid",
  "actionType": "USER_REGISTERED | SCHEDULE_CREATED | CALL_INVITED | ...",
  "scheduleId": "schedule_uuid | null",
  "patientId": "patient_uuid | null",
  "callSessionId": "call_session_uuid | null",
  "timestamp": "ISO8601",
  "metadata": {}
}
```

---

## State Management

### Doctor (DoctorPracticeRoom)
```javascript
{
  schedule: {...},           // Current practice schedule
  queue: [...],              // All patients in queue
  loading: false,
  actionLoading: patientId,  // For UI button states
  waitingForConfirm: callSessionId | null,  // Polling state
  connected: true            // Socket.IO connection
}
```

### Patient (PatientScheduleView)
```javascript
{
  schedule: {...},           // Selected doctor's schedule
  queueEntry: {...},         // Patient's position in queue
  totalInQueue: 5,
  loading: false,
  isReady: false,            // Patient's ready status
  toggling: false,
  joining: false,
  invitation: {              // Incoming call details
    callSessionId: "...",
    scheduleId: "...",
    doctorId: "...",
    doctorName: "Dr. Sarah"
  },
  connected: true
}
```

### CallRoom (Both Doctor & Patient)
```javascript
{
  callSession: {...},        // Full call session details
  loading: false,
  error: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  isConnecting: true,        // Waiting for remote peer ID
  remotePeerId: "peer_id_xyz789",
  callActive: false,         // WebRTC stream received
  localStreamReady: false,   // getUserMedia completed
  mediaInitialized: false,   // PeerJS initialized
  
  // Refs
  localVideoRef: {srcObject: MediaStream},
  remoteVideoRef: {srcObject: null},
  peerRef: {Peer instance},
  localStreamRef: MediaStream,
  callRef: {Peer.Call instance}
}
```

---

## Error Handling & Resilience

### Timeout Handling
- **Call Invitation Timeout:** If patient doesn't respond within 60 seconds, call status → `EXPIRED`
- **Doctor Polling Timeout:** Auto-expires if no confirmation detected

### Polling Fallback Mechanism
```
Socket.IO Connection Lost?
  ↓
Polling takes over with these intervals:
  - Doctor invitation: 1.5s
  - Patient invitation: 2s
  - Active call status: 3s
  ↓
System continues working until Socket.IO reconnects
```

### Cleanup on Unmount
```javascript
useEffect(() => {
  return () => {
    // Stop all media tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    
    // Close peer connection
    callRef.current?.close();
    peerRef.current?.destroy();
    
    // Leave socket rooms
    leaveSchedule(scheduleId);
    leaveCall(callSessionId);
  };
}, []);
```

---

## API Endpoint Summary

### Authentication
- `POST /auth/register` - Create new account
- `POST /auth/login` - Login and get JWT
- `GET /auth/me` - Get current user

### Doctor Endpoints
- `GET /doctor/schedules` - List all schedules
- `POST /doctor/schedules` - Create schedule
- `POST /doctor/schedules/{id}/start` - Start practice
- `POST /doctor/schedules/{id}/end` - End practice
- `GET /doctor/schedules/{id}/queue` - Get queue
- `POST /doctor/schedules/{id}/start-call` - Invite patient
- `GET /doctor/call-sessions/{id}/status` - Poll call status
- `POST /doctor/call-sessions/{id}/set-peer-id` - Register peer ID
- `POST /doctor/call-sessions/{id}/end` - End call
- `POST /doctor/schedules/{id}/reset-patient/{patientId}` - Reset patient

### Patient Endpoints
- `GET /patient/schedules` - Browse available schedules
- `GET /patient/schedules/{id}` - View schedule details
- `POST /patient/schedules/{id}/join-queue` - Join queue
- `POST /patient/schedules/{id}/toggle-ready` - Set ready status
- `GET /patient/pending-invitation` - Check for invitations
- `POST /patient/call-sessions/{id}/confirm` - Accept call
- `POST /patient/call-sessions/{id}/decline` - Reject call
- `POST /patient/call-sessions/{id}/set-peer-id` - Register peer ID
- `POST /patient/call-sessions/{id}/end` - End call

### General Endpoints
- `POST /call-sessions/{id}/activate` - Activate confirmed call
- `GET /call-sessions/{id}` - Get call session details
- `GET /health` - Health check

---

## Socket.IO Events

### Broadcasting Events
```javascript
// Schedule-specific room: schedule_{scheduleId}
schedule_status_changed      // Doctor started/ended practice
queue_updated                // Queue changed

// Call-specific room: call_{callSessionId}
call_invitation              // Sent to patient
call_confirmed               // Doctor received confirmation
call_declined                // Patient rejected
call_activated               // Call now ACTIVE
call_ended                   // Call ended
peer_id_updated              // Peer ID exchanged
status_reset                 // Doctor reset patient for rejoin
```

### Room Management
```javascript
// Doctor joins schedule room
socket.emit('join_schedule', {scheduleId})

// Patient joins call room
socket.emit('join_call', {callSessionId})

// Broadcast to room
await sio.emit(event, data, room=f"schedule_{scheduleId}")
```

---

## Security Features

1. **JWT Authentication**
   - Tokens valid for 24 hours
   - Payload includes: `user_id`, `role`, `exp`
   - Verified on every protected endpoint

2. **Role-Based Access Control (RBAC)**
   - Doctor-only endpoints: `@require_doctor`
   - Patient-only endpoints: `@require_patient`
   - Cross-role verification in call sessions

3. **Data Validation**
   - Pydantic models for request validation
   - EmailStr validation for emails
   - UUID validation for resource IDs

4. **Access Verification**
   - Call sessions verified: `doctorId == user.id OR patientId == user.id`
   - Schedule access: Doctor must be schedule owner
   - Queue entry access: Patient must be owner

5. **Audit Logging**
   - All significant actions logged
   - Includes: actor, action type, resources, timestamp
   - Enables compliance and debugging

---

## Performance Optimizations

1. **Parallel Data Loading**
   ```javascript
   const [scheduleRes, queueRes] = await Promise.all([
     GET /doctor/schedules,
     GET /doctor/schedules/{id}/queue
   ])
   ```

2. **Polling with Intervals**
   - Configurable polling intervals (1.5s, 2s, 3s)
   - Prevents overwhelming server
   - Graceful cleanup on component unmount

3. **WebSocket Rooms**
   - Socket.IO rooms reduce broadcast scope
   - Only relevant users receive events
   - Room-based filtering on backend

4. **Stream Cleanup**
   - Media tracks stopped immediately on disconnect
   - Peer connections destroyed properly
   - No memory leaks from dangling references

---

## Deployment Architecture

```
Frontend (React)
     ↓
    [CORS Middleware]
     ↓
Backend (FastAPI)
  ├─ HTTP API Router (port 8000)
  ├─ Socket.IO Handler (path: /socket.io)
  └─ MongoDB Driver (Motor)
     ↓
MongoDB Atlas (Cloud)
```

**Environment Variables Required:**
```
MONGO_URL=mongodb+srv://...
DB_NAME=medconsult
JWT_SECRET=doctor-consultation-secret-key-2025
CORS_ORIGINS=https://frontend.com
```

---

## Conclusion

The MedConsult call flow is designed for:
- ✅ **Reliability**: Multi-layer fallback (Socket.IO → Polling → HTTP)
- ✅ **Real-time**: Sub-second updates via WebSockets
- ✅ **Low Latency**: P2P video via WebRTC
- ✅ **Scalability**: Stateless API design, MongoDB indexing
- ✅ **Security**: JWT auth, RBAC, audit logging
- ✅ **User Experience**: Smooth queue management, clear status feedback

The 9-phase flow ensures both participants are properly synchronized before peer connection, preventing connection errors and improving overall reliability.
