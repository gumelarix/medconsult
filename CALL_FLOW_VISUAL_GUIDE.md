# Call Flow Visual Guide

## Quick Reference: 9-Phase Call Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MEDCONSULT CALL FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Phase 1: SETUP                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Doctor: POST /start                                               │  │
│  │   ↓ Backend updates schedule.status = ONLINE                      │  │
│  │   ↓ Broadcasts to all connected patients                          │  │
│  │ Patient: Receives "Doctor is Online" notification                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Phase 2: QUEUE JOIN                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Patient: POST /join-queue                                         │  │
│  │   ↓ Backend creates queue_entry (WAITING)                         │  │
│  │   ↓ Broadcasts queue update to doctor                             │  │
│  │ Doctor: Queue displays [Patient #1 - Waiting ⏳]                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Phase 3: READY STATUS                                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Patient: Toggle "Ready" switch ON                                 │  │
│  │   ↓ POST /toggle-ready { isReady: true }                          │  │
│  │   ↓ Backend updates queue_entry.status = READY                    │  │
│  │   ↓ Broadcasts to doctor                                          │  │
│  │ Doctor: Queue displays [Patient #1 - Ready ✅]                     │  │
│  │          Can now click "Start Call" button                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Phase 4: CALL INVITATION                                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Doctor: Click "Start Call" for patient                            │  │
│  │   ↓ POST /start-call { patientId }                                │  │
│  │   ↓ Backend creates call_session (INVITED)                        │  │
│  │   ↓ Broadcasts call_invitation to patient                         │  │
│  │   ↓ Doctor STARTS POLLING: GET /status every 1.5s                 │  │
│  │ Patient: Receives InvitationModal                                 │  │
│  │          "Accept" or "Decline" buttons                             │  │
│  │          [⏰ Expires in 60 seconds]                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Phase 5: CONFIRMATION                                                   │
│  ┌────────────────────────────────────────┬────────────────────────┐  │
│  │ PATIENT ACCEPTS                        │ PATIENT DECLINES       │  │
│  ├────────────────────────────────────────┼────────────────────────┤  │
│  │ Click "Accept"                         │ Click "Decline"        │  │
│  │   ↓ POST /confirm                      │   ↓ POST /decline      │  │
│  │   ↓ Backend: status = CONFIRMED        │   ↓ status = DECLINED  │  │
│  │   ↓ queue_entry.status = IN_CALL       │   ↓ status = WAITING   │  │
│  │   ↓ Broadcasts call_confirmed          │   ↓ Broadcasts decline │  │
│  │ Doctor polling detects: CONFIRMED      │ Doctor sees: declined  │  │
│  │   ↓ Navigate to /call/{id}             │   ↓ Refresh queue      │  │
│  │ Patient: Navigate to /call/{id}        │ Doctor can invite next │  │
│  └────────────────────────────────────────┴────────────────────────┘  │
│                                                                           │
│  Phase 6: CALLROOM INIT                                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Both users navigate to /call/{callSessionId}                       │  │
│  │   ↓ GET /call-sessions/{id} - Verify access & get details         │  │
│  │   ↓ Check call session exists and status is CONFIRMED             │  │
│  │   ↓ Load CallRoom component                                        │  │
│  │   ↓ Display empty video elements                                   │  │
│  │ State: callSession loaded, media not yet initialized               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Phase 7: MEDIA INITIALIZATION                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Both users (in parallel):                                          │  │
│  │   ↓ Request browser: "Allow camera and microphone?"               │  │
│  │   ↓ navigator.mediaDevices.getUserMedia()                         │  │
│  │   ↓ Receive local MediaStream                                      │  │
│  │   ↓ Set <video>.srcObject = localStream                           │  │
│  │   ↓ Initialize PeerJS: const peer = new Peer()                    │  │
│  │   ↓ PeerJS opens connection to broker                             │  │
│  │   ↓ Receive unique Peer ID                                        │  │
│  │ State: Media ready, Peer initialized, but no remote stream         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Phase 8: PEER ID EXCHANGE                                               │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Doctor:                           Patient:                         │  │
│  │ POST /set-peer-id                 POST /set-peer-id                │  │
│  │ { peerId: "abc123" }              { peerId: "xyz789" }             │  │
│  │   ↓ Backend stores in DB            ↓ Backend stores in DB        │  │
│  │   ↓ Broadcasts via Socket.IO        ↓ Broadcasts via Socket.IO    │  │
│  │   ↓ Patient receives ID             ↓ Doctor receives ID           │  │
│  │ Both:                                                              │  │
│  │ GET /call-sessions/{id} - Refresh to get both Peer IDs            │  │
│  │   ↓ Now have: doctorPeerId AND patientPeerId                      │  │
│  │ State: Ready for P2P connection                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Phase 9: WEBRTC CONNECTION & STREAMING                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Doctor (has patientPeerId):                                        │  │
│  │ peer.call(patientPeerId, localStream)                              │  │
│  │   ↓ Sends SDP offer via PeerJS broker                              │  │
│  │                                                                     │  │
│  │ Patient (receives call):                                           │  │
│  │ peer.on('call') → call.answer(localStream)                         │  │
│  │   ↓ Sends SDP answer back                                          │  │
│  │                                                                     │  │
│  │ PeerJS (establishes STUN/TURN connection):                         │  │
│  │   ↓ Exchanges ICE candidates                                       │  │
│  │   ↓ Establishes P2P data connection                                │  │
│  │   ↓ Both receive 'stream' events                                   │  │
│  │                                                                     │  │
│  │ Both users:                                                        │  │
│  │ call.on('stream') → remoteVideoRef.srcObject = remoteStream        │  │
│  │ setCallActive(true)                                                │  │
│  │ POST /activate - Update status to ACTIVE                           │  │
│  │                                                                     │  │
│  │ Result: 🎥 Both can see and hear each other in real-time!         │  │
│  │ Polling: Check status every 3s to detect early termination        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ACTIVE CALL STATE                                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Users can:                                                         │  │
│  │  • Toggle microphone on/off (track.enabled = true/false)           │  │
│  │  • Toggle camera on/off (track.enabled = true/false)               │  │
│  │  • See call duration and status                                    │  │
│  │  • Click "End Call" button to terminate                            │  │
│  │                                                                     │  │
│  │ Status polling (3s interval):                                      │  │
│  │  • Check if other party ended the call                             │  │
│  │  • Detect 404 errors (session deleted)                             │  │
│  │  • Auto-cleanup and navigate back if detected                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  CALL TERMINATION                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Either user: Click "End Call"                                      │  │
│  │   ↓ POST /call-sessions/{id}/end                                   │  │
│  │   ↓ Backend: status = ENDED                                        │  │
│  │   ↓ Backend: queue_entry.status = DONE                             │  │
│  │   ↓ Broadcasts call_ended to both                                  │  │
│  │ Both users:                                                        │  │
│  │   ↓ call.close() - Close peer connection                           │  │
│  │   ↓ peer.destroy() - Cleanup PeerJS                                │  │
│  │   ↓ Stop all media tracks                                          │  │
│  │   ↓ Navigate back:                                                 │  │
│  │      • Doctor → /doctor/practice/{scheduleId}                      │  │
│  │      • Patient → /patient/consultation/{scheduleId}                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  POST-CALL OPTIONS                                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Doctor:                                                            │  │
│  │  • Invite next patient in queue                                    │  │
│  │  • Reset patient status for rejoin (if needed)                     │  │
│  │  • End practice session                                            │  │
│  │                                                                     │  │
│  │ Patient:                                                           │  │
│  │  • If doctor resets: Can toggle Ready again to rejoin queue        │  │
│  │  • Or: Leave and view other available schedules                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Status State Machines

### Schedule Status
```
UPCOMING
    ↓
[Doctor clicks "Start Practice"]
    ↓
ONLINE ←─────────────────────────────┐
    ↓                                  │
[Doctor clicks "End Practice"]         │
    ↓                                  │
COMPLETED                              │
                                       │
[If interrupted, can restart]──────────┘
```

### Queue Entry Status
```
WAITING
    ↓
[Patient toggles isReady: true]
    ↓
READY ←──────────────────────────┐
    ↓                             │
[Doctor invites] →INVITED         │
    ↓                             │
[Patient accepts]                 │
    ↓                             │
IN_CALL                            │
    ↓                             │
[Call ends]                        │
    ↓                             │
DONE                               │
                                   │
[Patient declines] → reset → WAITING
[Doctor resets] ────→──────→──────┘
```

### Call Session Status
```
INVITED
    ↓
┌─────────────┬─────────────┐
│             │             │
v             v             v
CONFIRMED   DECLINED    EXPIRED (60s timeout)
    │
    ↓
CONFIRMED ← [Patient clicks Accept]
    ↓
ACTIVE ← [WebRTC stream established]
    ↓
ENDED ← [Either party ends call]
```

---

## Communication Protocol Stack

```
┌──────────────────────────────────────────────────────┐
│                    Application Layer                 │
├──────────────────────────────────────────────────────┤
│  HTTP REST API    │    Socket.IO WebSocket    │      │
│  for state mgmt   │    for real-time events   │ P2P  │
├──────────────────────────────────────────────────────┤
│               Transport Layer                        │
├──────────────────────────────────────────────────────┤
│  HTTP/HTTPS       │    WebSocket/Polling      │ UDP  │
├──────────────────────────────────────────────────────┤
│                 Network Layer                        │
├──────────────────────────────────────────────────────┤
│  TCP              │    TCP with Polling       │ NAT  │
│  IPv4/IPv6        │    IPv4/IPv6              │ P2P  │
└──────────────────────────────────────────────────────┘

WebRTC Stack:
    ┌─────────────────────┐
    │   Application Data  │
    │   (Video/Audio)     │
    ├─────────────────────┤
    │  SRTP/SRTCP         │
    │  (Encrypted)        │
    ├─────────────────────┤
    │  RTP/RTCP           │
    │  (Media Protocols)  │
    ├─────────────────────┤
    │  ICE/STUN/TURN      │
    │  (Nat Traversal)    │
    ├─────────────────────┤
    │  UDP                │
    │  Direct P2P         │
    └─────────────────────┘
```

---

## Fallback & Resilience Mechanisms

```
Socket.IO Connection Active?
    │
    ├─ YES: Use real-time events (instant)
    │       • call_invitation
    │       • queue_updated
    │       • peer_id_updated
    │       • call_activated
    │       • call_ended
    │
    └─ NO: Use HTTP Polling (with intervals)
            │
            ├─ Doctor: Poll /call-sessions/status (1.5s)
            ├─ Patient: Poll /pending-invitation (2s)
            └─ Both: Poll /call-sessions/{id} (3s)
            
            Result: Same functionality, slight latency increase
```

---

## Database Relationships

```
┌──────────┐
│  users   │
├──────────┤
│ id (PK)  │
│ email    │
│ name     │
│ role     │
│ password │
└────┬─────┘
     │
     │ 1:N (doctor)
     │
     ├───────────────────────┐
     │                       │
     v                       v
┌──────────────┐       ┌──────────────┐
│  schedules   │       │ queue_entries│
├──────────────┤       ├──────────────┤
│ id (PK)      │       │ id (PK)      │
│ doctorId (FK)│◄──────│patientId(FK) │
│ date         │       │scheduleId(FK)│
│ startTime    │       │status        │
│ endTime      │       │isReady       │
│ status       │       │queueNumber   │
└──┬───────────┘       └──────────────┘
   │
   │ 1:N
   │
   v
┌──────────────────┐
│  call_sessions   │
├──────────────────┤
│ id (PK)          │
│ scheduleId (FK)  │
│ doctorId (FK)    │
│ patientId (FK)   │
│ status           │
│ doctorPeerId     │
│ patientPeerId    │
│ createdAt        │
│ confirmedAt      │
│ endedAt          │
└──────────────────┘

All tables reference:
┌─────────────┐
│ audit_logs  │
├─────────────┤
│ id (PK)     │
│ actorId (FK)│
│ actionType  │
│ timestamp   │
└─────────────┘
```

---

## Key Performance Metrics

| Metric | Target | Implementation |
|--------|--------|-----------------|
| Call Setup Time | < 5s | Parallel media init + socket.io |
| Video Latency | < 500ms | WebRTC direct P2P |
| Real-time Updates | < 100ms | Socket.IO + polling fallback |
| Queue Refresh | < 2s | 2s polling interval |
| Status Poll | < 3s | 3s polling interval |
| Connection Timeout | 60s | Call session expiration |
| Invitation Timeout | 60s | Backend auto-expiration |

---

## Debugging Guide

### Doctor stuck in "Waiting for Confirmation"
```
Check:
1. Browser console: Any errors in CallRoom?
2. Network tab: Is polling happening? (GET /status every 1.5s)
3. Backend logs: Is call_session status updating?
4. Patient side: Did they see the invitation modal?
5. Fallback: Check Socket.IO connection status
```

### Patient not receiving invitation
```
Check:
1. Is patient socket connected? (Check connection state)
2. Is patient polling? (GET /pending-invitation every 2s)
3. Backend: Is call_invitation event being emitted?
4. Patient's call_session in DB: status should be INVITED
5. Permissions: Does patient have access to this schedule?
```

### WebRTC connection fails
```
Check:
1. Both have local media? (localVideoRef.srcObject not null)
2. Peer IDs exchanged? (Both can see remote peerId in state)
3. Network: Check ICE candidates (NAT/firewall issues)
4. Browser: Check WebRTC stats (about:webrtc-internals in Chrome)
5. PeerJS: Check browser console for peer connection errors
```

### Video not showing after connect
```
Check:
1. Call active? (callActive state should be true)
2. Remote stream received? (call.on('stream') fired)
3. remoteVideoRef.srcObject set? (Should not be null)
4. Browser permissions: Is camera actually enabled?
5. Backend: Verify media tracks are enabled (not muted)
```

---

## Comparison: Socket.IO vs Polling

| Feature | Socket.IO | Polling |
|---------|-----------|---------|
| Latency | ~50-100ms | ~1500-3000ms |
| Server Load | Medium | Low |
| Reliability | High (with reconnect) | Very High |
| Bandwidth | Efficient | Extra requests |
| Setup | More complex | Simple |
| Fallback | Yes | Primary method |

**Hybrid Approach:** Socket.IO for speed, Polling for reliability = Best of both worlds!

---

## Environment & Deployment

```
Development:
  Frontend: http://localhost:3000 (React dev server)
  Backend: http://localhost:8000 (FastAPI)
  Database: MongoDB local or Atlas

Production:
  Frontend: HTTPS → Vercel/Netlify
  Backend: HTTPS → Railway.app
  Database: MongoDB Atlas (Cloud)
  WebRTC: Uses public STUN servers
```

---

## Testing Scenarios

### Scenario 1: Happy Path
```
1. Doctor: Start practice ✓
2. Patient: Join queue ✓
3. Patient: Toggle ready ✓
4. Doctor: Invite patient ✓
5. Patient: Accept invitation ✓
6. Both: Navigate to call ✓
7. Both: See video/audio ✓
8. Patient: End call ✓
9. Both: Navigate back ✓
```

### Scenario 2: Patient Decline
```
1-4. Same as happy path
5. Patient: Decline invitation ✓
6. Doctor: See declined status ✓
7. Both: Return to previous screens ✓
8. Doctor: Can invite another patient ✓
```

### Scenario 3: Socket.IO Failure
```
1-4. Same as happy path
5. Network fails (disable WebSocket) ✓
6. Doctor: Polling detects confirmation ✓
7. Patient: Polling detects pending invitation ✓
8. System continues without Socket.IO ✓
```

### Scenario 4: Browser Permissions Denied
```
1-4. Same as happy path
5. User denies camera/mic permissions ✓
6. CallRoom shows error message ✓
7. User can click "Retry" or navigate back ✓
```

---

## Summary

The MedConsult call flow uses a **9-phase architecture**:

1. **Setup** - Doctor initiates practice
2. **Queue** - Patient joins waiting list
3. **Ready** - Patient indicates availability
4. **Invitation** - Doctor sends call invite
5. **Confirmation** - Patient accepts/declines
6. **Room Init** - Both navigate to call room
7. **Media Init** - Request permissions, initialize streams
8. **Peer ID Exchange** - Share WebRTC peer identifiers
9. **WebRTC Live** - Establish P2P connection and stream

**Key Features:**
- ✅ Multi-layer communication (HTTP + WebSocket + P2P)
- ✅ Polling fallback for reliability
- ✅ Real-time event broadcasting
- ✅ Secure JWT authentication
- ✅ Comprehensive audit logging
- ✅ Graceful error handling
- ✅ Scalable design with MongoDB
