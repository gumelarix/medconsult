# Doctor-Patient Call Flow Swimlane Diagram

## Swimlane.io Diagram Script

```
swimlane
  title Doctor-Patient Call Flow

  actor Doctor
  actor Patient
  participant BackendAPI as Backend API
  participant Database as Database
  participant SocketIO as Socket.IO
  participant PeerJS as PeerJS (WebRTC)

  # Phase 1: Setup - Doctor starts practice
  rect rgb(200, 220, 255)
    label Setup Phase
    
    Doctor ->> BackendAPI: POST /doctor/schedules/{id}/start
    BackendAPI ->> Database: Update schedule.status = ONLINE
    BackendAPI ->> SocketIO: emit schedule_status_changed
    SocketIO ->> Patient: Broadcast: Doctor is now ONLINE
  end

  # Phase 2: Patient joins queue
  rect rgb(220, 255, 220)
    label Patient Queue Phase
    
    Patient ->> BackendAPI: POST /patient/schedules/{id}/join-queue
    BackendAPI ->> Database: Create queue_entry (WAITING)
    BackendAPI ->> SocketIO: emit queue_updated
    SocketIO ->> Doctor: Broadcast: Queue updated
    Doctor ->> Doctor: Displays patient in queue
  end

  # Phase 3: Patient toggles ready
  rect rgb(255, 240, 200)
    label Patient Ready Phase
    
    Patient ->> BackendAPI: POST /patient/schedules/{id}/toggle-ready
    BackendAPI ->> Database: Update queue_entry.status = READY
    BackendAPI ->> SocketIO: emit queue_updated
    SocketIO ->> Doctor: Broadcast: Patient is READY
    Doctor ->> Doctor: Sees "Ready" badge and can invite
  end

  # Phase 4: Doctor invites patient
  rect rgb(255, 220, 220)
    label Call Invitation Phase
    
    Doctor ->> BackendAPI: POST /doctor/schedules/{id}/start-call
    BackendAPI ->> Database: Create call_session (INVITED)
    BackendAPI ->> Database: Verify patient is READY
    BackendAPI ->> SocketIO: emit call_invitation to patient
    SocketIO ->> Patient: Broadcast: New call_invitation
    Patient ->> Patient: Shows InvitationModal
    Doctor ->> Doctor: Sets waitingForConfirm state
    Doctor ->> BackendAPI: Poll /doctor/call-sessions/{id}/status (every 1.5s)
  end

  # Phase 5: Patient confirms/declines
  alt Patient Confirms
    Patient ->> BackendAPI: POST /patient/call-sessions/{id}/confirm
    BackendAPI ->> Database: Update call_session.status = CONFIRMED
    BackendAPI ->> Database: Update queue_entry.status = IN_CALL
    BackendAPI ->> SocketIO: emit call_confirmed to doctor
    SocketIO ->> Doctor: Broadcast: Patient confirmed!
    Doctor ->> Doctor: Polling detects CONFIRMED status
    Doctor ->> Doctor: Navigate to /call/{callSessionId}
  else Patient Declines
    Patient ->> BackendAPI: POST /patient/call-sessions/{id}/decline
    BackendAPI ->> Database: Update call_session.status = DECLINED
    BackendAPI ->> Database: Update queue_entry.status = WAITING
    BackendAPI ->> SocketIO: emit call_declined to doctor
    SocketIO ->> Doctor: Broadcast: Patient declined
    Doctor ->> Doctor: Polling detects DECLINED status
    Doctor ->> Doctor: Clears waitingForConfirm state
  end

  # Phase 6: Call activation
  rect rgb(200, 255, 220)
    label Call Activation Phase
    
    Patient ->> Patient: Navigate to /call/{callSessionId}
    Doctor ->> Doctor: Navigate to /call/{callSessionId} (via polling)
    
    Patient ->> BackendAPI: GET /call-sessions/{id} (verify access)
    BackendAPI ->> Database: Retrieve call_session
    BackendAPI ->> Patient: Return call_session data
    
    Doctor ->> BackendAPI: GET /call-sessions/{id} (verify access)
    BackendAPI ->> Database: Retrieve call_session
    BackendAPI ->> Doctor: Return call_session data
    
    note right of Patient
      CallRoom component initializes
      - Gets user media (camera/mic)
      - Initializes PeerJS
      - Waits for remote peerId
    end note
  end

  # Phase 7: PeerJS Connection Setup
  rect rgb(220, 240, 255)
    label WebRTC Peer Connection Phase
    
    Patient ->> PeerJS: navigator.mediaDevices.getUserMedia()
    PeerJS ->> Patient: Return local stream
    Patient ->> Patient: Set localVideoRef.srcObject = stream
    Patient ->> PeerJS: new Peer() - Initialize PeerJS
    PeerJS ->> Patient: on 'open' event with peerId
    
    Doctor ->> PeerJS: navigator.mediaDevices.getUserMedia()
    PeerJS ->> Doctor: Return local stream
    Doctor ->> Doctor: Set localVideoRef.srcObject = stream
    Doctor ->> PeerJS: new Peer() - Initialize PeerJS
    PeerJS ->> Doctor: on 'open' event with peerId
  end

  # Phase 8: Peer ID Exchange
  rect rgb(240, 220, 255)
    label Peer ID Exchange Phase
    
    Patient ->> BackendAPI: POST /patient/call-sessions/{id}/set-peer-id
    BackendAPI ->> Database: Update call_session.patientPeerId = {peerId}
    BackendAPI ->> SocketIO: emit peer_id_updated to call room
    SocketIO ->> Doctor: Broadcast: Patient peerId
    
    Doctor ->> BackendAPI: POST /doctor/call-sessions/{id}/set-peer-id
    BackendAPI ->> Database: Update call_session.doctorPeerId = {peerId}
    BackendAPI ->> SocketIO: emit peer_id_updated to call room
    SocketIO ->> Patient: Broadcast: Doctor peerId
    
    Doctor ->> BackendAPI: GET /call-sessions/{id} (refresh to get patientPeerId)
    Patient ->> BackendAPI: GET /call-sessions/{id} (refresh to get doctorPeerId)
  end

  # Phase 9: Activate Call & WebRTC Stream Exchange
  rect rgb(255, 230, 200)
    label WebRTC Stream Activation Phase
    
    note right of Doctor
      Sets remotePeerId from call_session
      Calls peer.call(remotePeerId, localStream)
    end note
    
    Doctor ->> PeerJS: peer.call(patientPeerId, localStream)
    PeerJS ->> Patient: on 'call' event
    Patient ->> PeerJS: call.answer(localStream)
    
    Doctor ->> BackendAPI: POST /call-sessions/{id}/activate
    BackendAPI ->> Database: Update call_session.status = ACTIVE
    BackendAPI ->> SocketIO: emit call_activated
    SocketIO ->> Patient: Broadcast: call_activated
    SocketIO ->> Doctor: Broadcast: call_activated
    
    PeerJS ->> Doctor: on 'stream' event (receives patient's stream)
    Doctor ->> Doctor: Set remoteVideoRef.srcObject = remoteStream
    Doctor ->> Doctor: setCallActive(true)
    
    PeerJS ->> Patient: on 'stream' event (receives doctor's stream)
    Patient ->> Patient: Set remoteVideoRef.srcObject = remoteStream
    Patient ->> Patient: setCallActive(true)
  end

  # Phase 10: Active Call
  rect rgb(200, 255, 200)
    label Active Call Phase
    
    note over Doctor, Patient
      Video/Audio is now flowing both ways
      Users can:
      - Toggle microphone on/off
      - Toggle camera on/off
      - Monitor call status
      - Either party can end the call
    end note
    
    Doctor ->> Doctor: Can toggle Mic/Camera or End Call
    Patient ->> Patient: Can toggle Mic/Camera or End Call
    
    par Periodic Status Checks (every 3s)
      Doctor ->> BackendAPI: GET /call-sessions/{id}
      Patient ->> BackendAPI: GET /call-sessions/{id}
    end
  end

  # Phase 11: Call Termination
  rect rgb(255, 200, 200)
    label Call End Phase
    
    alt Doctor Ends Call
      Doctor ->> Doctor: Click End Call button
      Doctor ->> BackendAPI: POST /doctor/call-sessions/{id}/end
    else Patient Ends Call
      Patient ->> Patient: Click End Call button
      Patient ->> BackendAPI: POST /patient/call-sessions/{id}/end
    end
    
    BackendAPI ->> Database: Update call_session.status = ENDED
    BackendAPI ->> Database: Update queue_entry.status = DONE
    BackendAPI ->> SocketIO: emit call_ended to both parties
    SocketIO ->> Doctor: Broadcast: call_ended
    SocketIO ->> Patient: Broadcast: call_ended
    
    Doctor ->> PeerJS: call.close()
    Patient ->> PeerJS: call.close()
    Doctor ->> Doctor: Cleanup streams & destroy peer
    Patient ->> Patient: Cleanup streams & destroy peer
    
    Doctor ->> Doctor: Navigate back to /doctor/practice/{scheduleId}
    Patient ->> Patient: Navigate back to /patient/consultation
  end

  # Phase 12: Post-Call Options
  rect rgb(240, 240, 200)
    label Post-Call Phase
    
    Patient ->> Patient: Can rejoin queue if doctor resets them
    Doctor ->> BackendAPI: POST /doctor/schedules/{id}/reset-patient/{patientId}
    BackendAPI ->> Database: Update queue_entry.status = READY
    BackendAPI ->> SocketIO: emit status_reset to patient
    SocketIO ->> Patient: Broadcast: Can rejoin
    Patient ->> Patient: Toggle ready again to join queue
  end
```

## Key Concepts

### 1. **Socket.IO (Real-time Broadcasting)**
- Used for sending real-time notifications to connected clients
- Primary events: `queue_updated`, `call_invitation`, `peer_id_updated`, `call_activated`, `call_ended`
- Rooms: `schedule_{scheduleId}` for schedule broadcasts, `call_{callSessionId}` for call-specific messages

### 2. **Polling (Fallback Mechanism)**
- **Doctor**: Polls `/doctor/call-sessions/{id}/status` every 1.5s when waiting for patient confirmation
- **Patient**: Polls `/patient/pending-invitation` every 2s to detect incoming calls
- **Call Participants**: Poll `/call-sessions/{id}` every 3s to detect if call has ended

### 3. **PeerJS (WebRTC Signaling)**
- Establishes peer-to-peer connections between doctor and patient
- Handles SDP (Session Description Protocol) exchange for media stream negotiation
- Exchange of Peer IDs via Backend API

### 4. **Data States**

#### Schedule Status
- `UPCOMING`: Scheduled but not started
- `ONLINE`: Doctor is currently conducting practice
- `COMPLETED`: Doctor ended the practice session

#### Queue Entry Status
- `WAITING`: Patient is in queue but not ready
- `READY`: Patient is ready to accept a call
- `IN_CALL`: Patient is currently in a call
- `DONE`: Consultation with this patient is complete

#### Call Session Status
- `INVITED`: Call invitation sent, awaiting patient confirmation
- `CONFIRMED`: Patient accepted, ready for WebRTC
- `ACTIVE`: WebRTC connection established, call is live
- `ENDED`: Call has been terminated
- `DECLINED`: Patient rejected the invitation
- `EXPIRED`: Doctor didn't receive confirmation within 60 seconds

### 5. **Flow Summary**

**Setup → Queue → Ready → Invitation → Confirmation → Media Setup → WebRTC Stream → Active Call → Cleanup**

The system uses a multi-layered approach:
1. **HTTP API** for state management and transactions
2. **Socket.IO** for real-time notifications and sync
3. **PeerJS** for peer-to-peer video/audio streaming
4. **Polling** as fallback when real-time mechanisms fail

This ensures reliability even if Socket.IO connection drops, while maintaining low-latency real-time updates when possible.
