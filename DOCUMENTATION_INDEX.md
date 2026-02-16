# MedConsult Call Flow Documentation Index

## 📚 Documentation Files Created

This documentation provides a comprehensive analysis of the Doctor-Patient video consultation call flow in the MedConsult application.

### Files Overview

#### 1. **CALL_FLOW_SWIMLANE.md** (Start here!)
   - **Type:** Text-based swimlane diagram with narrative explanation
   - **Contains:** 
     - 12-phase detailed swimlane flow (ASCII art format)
     - Text descriptions of each phase
     - Message sequences between actors
     - Key concepts section with extensive details
     - Status codes and state transitions
   - **Best for:** Understanding the overall flow and reading through detailed explanations

#### 2. **ARCHITECTURE_DOCUMENTATION.md** (Deep dive reference)
   - **Type:** Comprehensive technical documentation
   - **Contains:**
     - Executive summary
     - System architecture overview
     - 9 detailed phases with code examples
     - Data models and database schemas
     - State management details
     - API endpoint summary (all routes)
     - Socket.IO events reference
     - Security features
     - Performance optimizations
     - Deployment architecture
   - **Best for:** Complete technical reference and implementation details

#### 3. **CALL_FLOW_VISUAL_GUIDE.md** (Quick reference)
   - **Type:** ASCII diagrams and visual explanations
   - **Contains:**
     - Quick reference: 9-phase call flow (ASCII box diagram)
     - Status state machines (state transitions)
     - Communication protocol stack
     - Fallback & resilience mechanisms
     - Database relationships
     - Performance metrics table
     - Debugging guide
     - Testing scenarios
   - **Best for:** Quick lookups, debugging, and troubleshooting

#### 4. **CALL_FLOW_DIAGRAM.puml** (PlantUML format)
   - **Type:** PlantUML diagram source code
   - **Contains:**
     - Sequence diagram showing all interactions
     - Can be rendered at https://www.plantuml.com/plantuml/uml/
     - 14 phases with detailed messages
     - Error handling and alt flows
   - **Best for:** Generating visual diagrams in different formats

#### 5. **CALL_FLOW_VISUALIZATION.html** (Interactive web view)
   - **Type:** Standalone HTML file with embedded SVG
   - **Contains:**
     - Interactive swimlane diagram
     - 9-phase visual representation
     - Status badges and color coding
     - Comprehensive information panel
     - Technology stack details
     - Can be opened directly in any browser
   - **Best for:** Visual learners, presentations, and stakeholder reviews
   - **How to use:** Open in browser: `open CALL_FLOW_VISUALIZATION.html`

---

## 🎯 Quick Navigation by Use Case

### "I want to understand the overall flow"
→ Start with **CALL_FLOW_SWIMLANE.md**
→ Then read **CALL_FLOW_VISUAL_GUIDE.md**

### "I need to debug an issue"
→ Go to **CALL_FLOW_VISUAL_GUIDE.md** → Debugging Guide section
→ Reference **ARCHITECTURE_DOCUMENTATION.md** → Error Handling section

### "I need API documentation"
→ Read **ARCHITECTURE_DOCUMENTATION.md** → API Endpoint Summary section

### "I want a visual diagram"
→ Open **CALL_FLOW_VISUALIZATION.html** in browser
→ Or render **CALL_FLOW_DIAGRAM.puml** at plantuml.com

### "I'm implementing a feature"
→ Read **ARCHITECTURE_DOCUMENTATION.md** → Data Models and State Management sections

### "I need to understand security"
→ Read **ARCHITECTURE_DOCUMENTATION.md** → Security Features section

---

## 📊 The 9-Phase Call Flow (Quick Summary)

```
1. SETUP              Doctor starts practice → schedule ONLINE
2. QUEUE JOIN         Patient joins queue → queue_entry WAITING
3. READY STATUS       Patient toggles ready → queue_entry READY
4. INVITATION         Doctor invites patient → call_session INVITED
5. CONFIRMATION       Patient accepts → call_session CONFIRMED
6. ROOM INIT          Both navigate to call room
7. MEDIA INIT         Both get camera/mic permissions, init PeerJS
8. PEER ID EXCHANGE   Share WebRTC peer IDs via Backend
9. WEBRTC LIVE        P2P connection established, video streams flowing
```

---

## 🔑 Key Technologies

### Backend
- **Framework:** FastAPI (Python async web framework)
- **Database:** MongoDB with Motor (async driver)
- **Real-time:** Socket.IO with python-socketio
- **Authentication:** JWT with PyJWT
- **Encryption:** bcrypt for password hashing

### Frontend
- **Framework:** React 18 with React Router
- **Real-time:** socket.io-client
- **WebRTC:** PeerJS (wrapper around WebRTC API)
- **HTTP:** Axios
- **UI:** TailwindCSS + custom UI components

### Communication
- **HTTP/REST:** Stateless API calls for CRUD operations
- **WebSocket:** Real-time event broadcasting via Socket.IO
- **WebRTC:** Peer-to-peer video/audio streaming

---

## 📋 Data Models

### Core Collections
1. **users** - Doctor and Patient accounts with roles
2. **schedules** - Doctor's available consultation time slots
3. **queue_entries** - Patient's position in a schedule's queue
4. **call_sessions** - Individual video call sessions
5. **audit_logs** - Complete audit trail of all actions

### Key Relationships
```
Doctor → Multiple Schedules
         ↓
      Patients join Queue → Get Queue Entries
         ↓
      Doctor invites → Creates Call Session
         ↓
      Patient responds → Updates Call Session Status
```

---

## 🔄 Status States Reference

### Schedule Status
- `UPCOMING` - Not started yet
- `ONLINE` - Doctor is actively conducting practice
- `COMPLETED` - Doctor ended the practice session

### Queue Entry Status
- `WAITING` - Patient in queue but not ready
- `READY` - Patient ready to accept call
- `IN_CALL` - Currently in active consultation
- `DONE` - Consultation completed

### Call Session Status
- `INVITED` - Awaiting patient confirmation (expires in 60s)
- `CONFIRMED` - Patient accepted, ready for WebRTC
- `ACTIVE` - WebRTC connection established and live
- `ENDED` - Call terminated by either party
- `DECLINED` - Patient rejected the invitation
- `EXPIRED` - No response within 60 seconds

---

## 🔐 Security Architecture

### Authentication
- JWT tokens valid for 24 hours
- Tokens contain: `user_id`, `role`, `exp`
- Verified on every protected endpoint

### Authorization
- Role-based access control (RBAC)
- Doctor-only endpoints protected
- Patient-only endpoints protected
- Cross-role verification in calls

### Data Protection
- Passwords hashed with bcrypt
- HTTPS/TLS for transport security
- CORS headers configured
- Input validation with Pydantic models
- Complete audit logging

---

## 📡 Communication Protocols

### REST API (HTTP/HTTPS)
- Used for: State changes, CRUD operations
- Endpoints: `/auth`, `/doctor`, `/patient`, `/call-sessions`
- Methods: GET, POST
- Authentication: Bearer JWT token

### WebSocket (Socket.IO)
- Used for: Real-time event broadcasting
- Rooms: `schedule_{scheduleId}`, `call_{callSessionId}`
- Events: `call_invitation`, `queue_updated`, `peer_id_updated`, etc.
- Fallback: Polling when WebSocket unavailable

### WebRTC (PeerJS)
- Used for: P2P video/audio streaming
- Signaling: Backend API + Socket.IO
- Peer IDs: Exchanged via Backend
- Media: H.264 video, Opus audio

---

## ⚡ Performance Optimizations

1. **Parallel Operations**
   - Load schedules and queue in parallel
   - Initialize media and PeerJS concurrently

2. **Polling Intervals**
   - Doctor invitation: 1.5s (responsive)
   - Patient invitation: 2s (balanced)
   - Active call: 3s (reduce server load)

3. **Socket.IO Rooms**
   - Only relevant clients receive broadcasts
   - Reduce network traffic
   - Improve scalability

4. **Media Cleanup**
   - Stop tracks immediately on disconnect
   - Destroy peer connections properly
   - No memory leaks from dangling references

---

## 🧪 Testing Scenarios

### Happy Path
Doctor creates schedule → Patient joins → Patient ready → Doctor invites → Patient accepts → Call connects → Both see video → Call ends

### Error Cases
- Patient declines invitation
- Invitation timeout (60s)
- Socket.IO disconnect (fallback to polling)
- Browser permission denied
- WebRTC connection failure

### Edge Cases
- Multiple patients in queue
- Doctor resets patient for rejoin
- Rapid invitation/decline sequence
- Network interruption during call

---

## 🐛 Debugging Checklist

### Common Issues

**Doctor stuck in "Waiting for Confirmation"**
- [ ] Check browser console for errors
- [ ] Verify polling happening: Network tab → GET /status
- [ ] Check if patient received invitation (check patient logs)
- [ ] Verify Socket.IO connection status

**Patient not receiving invitation**
- [ ] Check Socket.IO connection: connected = true?
- [ ] Verify polling running: GET /pending-invitation every 2s
- [ ] Check backend logs for call_invitation event
- [ ] Verify patient has access to schedule (role check)

**WebRTC connection fails**
- [ ] Both have local media? Check localVideoRef.srcObject
- [ ] Peer IDs exchanged? Check state for remotePeerId
- [ ] Check browser WebRTC stats: about:webrtc-internals
- [ ] Verify firewall/NAT allowing P2P

**Video shows but no audio**
- [ ] Check audio tracks enabled: track.enabled = true
- [ ] Verify microphone permissions granted
- [ ] Check browser Settings → Privacy → Microphone

---

## 📚 Related Documentation in Repository

- `backend/server.py` - Complete backend API implementation
- `frontend/src/pages/CallRoom.js` - WebRTC implementation
- `frontend/src/pages/DoctorPracticeRoom.js` - Doctor UI
- `frontend/src/pages/PatientScheduleView.js` - Patient UI
- `frontend/src/context/SocketContext.js` - Socket.IO client setup
- `README.md` - Project overview

---

## 🚀 Deployment Information

### Backend (Railway)
- URL: https://medconsult-backend-production.up.railway.app
- Port: 8000
- Socket.IO path: /socket.io
- Environment: Python 3.9+, FastAPI

### Frontend (Vercel/Netlify)
- Socket.IO connection: Uses backend URL
- WebRTC: Uses public STUN servers (no TURN configured yet)
- Build: React + Craco

### Database (MongoDB Atlas)
- Cloud-hosted MongoDB
- Collections: users, schedules, queue_entries, call_sessions, audit_logs
- Indexes: On doctorId, patientId, scheduleId for performance

---

## 📞 API Rate Limits & Recommendations

- **Socket.IO polling:** 1.5s - 3s intervals (not seconds)
- **REST API calls:** No specific limit, but design for ~100ms latency
- **Database queries:** Ensure proper indexes on foreign keys
- **Media bandwidth:** 1-4 Mbps for 720p video

---

## 🎓 Learning Path

For someone new to the codebase:

1. **Day 1:** Read CALL_FLOW_VISUAL_GUIDE.md to understand phases
2. **Day 2:** Read ARCHITECTURE_DOCUMENTATION.md for technical details
3. **Day 3:** Trace code path in `backend/server.py` for Phase 1-3
4. **Day 4:** Trace code path in `frontend/` for same phases
5. **Day 5:** Debug actual call flow with logging enabled
6. **Day 6:** Implement a test scenario (e.g., multiple patients)

---

## 📝 Notes

- This documentation is current as of February 2025
- Based on analysis of v1.0 of MedConsult
- WebRTC uses public STUN, consider adding TURN for production
- Socket.IO has polling fallback - very reliable even with network issues
- All API endpoints require JWT authentication (except /seed for testing)

---

## ✅ Checklist for New Developers

- [ ] Read all 4 main documentation files
- [ ] Open CALL_FLOW_VISUALIZATION.html in browser
- [ ] Review database schema in ARCHITECTURE_DOCUMENTATION.md
- [ ] Understand all 9 phases of call flow
- [ ] Review API endpoints in your use case
- [ ] Understand status transitions
- [ ] Check error handling mechanisms
- [ ] Review security features
- [ ] Set up local dev environment
- [ ] Run a complete test scenario

---

## 📧 Questions & Support

For questions about the call flow, refer to:
- **Code Questions:** Check the specific source file linked in documentation
- **API Questions:** See API Endpoint Summary in ARCHITECTURE_DOCUMENTATION.md
- **Database Questions:** See Data Models section
- **Debug Issues:** Use Debugging Guide in CALL_FLOW_VISUAL_GUIDE.md

---

**Last Updated:** February 15, 2025
**Documentation Version:** 1.0
**Source Analysis:** Complete frontend and backend codebase
