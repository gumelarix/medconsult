from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import socketio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'doctor-consultation-secret-key-2025')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Security
security = HTTPBearer()

# Create FastAPI app
app = FastAPI()

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False
)

# Create ASGI app with Socket.IO mounted at /socket.io
socket_asgi_app = socketio.ASGIApp(sio, socketio_path='socket.io')

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserRole:
    DOCTOR = "DOCTOR"
    PATIENT = "PATIENT"

class ScheduleStatus:
    UPCOMING = "UPCOMING"
    ONLINE = "ONLINE"
    COMPLETED = "COMPLETED"

class QueueStatus:
    WAITING = "WAITING"
    READY = "READY"
    IN_CALL = "IN_CALL"
    DONE = "DONE"

class CallSessionStatus:
    INVITED = "INVITED"
    CONFIRMED = "CONFIRMED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    DECLINED = "DECLINED"
    EXPIRED = "EXPIRED"

# Pydantic Models
class UserBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: EmailStr
    name: str
    role: str

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class DoctorScheduleCreate(BaseModel):
    date: str
    startTime: str
    endTime: str

class DoctorScheduleResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    doctorId: str
    doctorName: Optional[str] = None
    date: str
    startTime: str
    endTime: str
    status: str

class QueueEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    scheduleId: str
    patientId: str
    patientName: Optional[str] = None
    queueNumber: int
    status: str
    isReady: bool = False

class CallSessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    scheduleId: str
    doctorId: str
    patientId: str
    status: str
    createdAt: str
    confirmedAt: Optional[str] = None
    endedAt: Optional[str] = None
    peerId: Optional[str] = None

class ToggleReadyRequest(BaseModel):
    isReady: bool

class StartCallRequest(BaseModel):
    patientId: str

class CallActionRequest(BaseModel):
    action: str  # confirm, decline, end

class SetPeerIdRequest(BaseModel):
    peerId: str

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0, "passwordHash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_doctor(user: dict = Depends(get_current_user)) -> dict:
    if user['role'] != UserRole.DOCTOR:
        raise HTTPException(status_code=403, detail="Doctor access required")
    return user

async def require_patient(user: dict = Depends(get_current_user)) -> dict:
    if user['role'] != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Patient access required")
    return user

async def log_audit(actor_id: str, action_type: str, schedule_id: str = None, 
                   patient_id: str = None, call_session_id: str = None, metadata: dict = None):
    audit = {
        "id": str(uuid.uuid4()),
        "actorUserId": actor_id,
        "actionType": action_type,
        "scheduleId": schedule_id,
        "patientId": patient_id,
        "callSessionId": call_session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata or {}
    }
    await db.audit_logs.insert_one(audit)

# ==================== SOCKET.IO EVENTS ====================

# Store connected users: {sid: {userId, role}}
connected_users = {}
# Store user sids: {userId: [sid1, sid2, ...]}
user_sids = {}

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    if sid in connected_users:
        user_id = connected_users[sid].get('userId')
        if user_id and user_id in user_sids:
            user_sids[user_id] = [s for s in user_sids[user_id] if s != sid]
            if not user_sids[user_id]:
                del user_sids[user_id]
        del connected_users[sid]

@sio.event
async def authenticate(sid, data):
    """Authenticate socket connection with JWT token"""
    try:
        token = data.get('token')
        if not token:
            await sio.emit('auth_error', {'message': 'No token provided'}, to=sid)
            return
        
        payload = decode_token(token)
        user_id = payload['user_id']
        role = payload['role']
        
        connected_users[sid] = {'userId': user_id, 'role': role}
        
        if user_id not in user_sids:
            user_sids[user_id] = []
        user_sids[user_id].append(sid)
        
        await sio.emit('authenticated', {'userId': user_id, 'role': role}, to=sid)
        logger.info(f"User {user_id} authenticated on socket {sid}")
    except Exception as e:
        logger.error(f"Socket auth error: {e}")
        await sio.emit('auth_error', {'message': str(e)}, to=sid)

@sio.event
async def join_schedule(sid, data):
    """Join a schedule room for real-time updates"""
    schedule_id = data.get('scheduleId')
    if schedule_id:
        room = f"schedule_{schedule_id}"
        await sio.enter_room(sid, room)
        logger.info(f"Socket {sid} joined room {room}")

@sio.event
async def leave_schedule(sid, data):
    """Leave a schedule room"""
    schedule_id = data.get('scheduleId')
    if schedule_id:
        room = f"schedule_{schedule_id}"
        await sio.leave_room(sid, room)
        logger.info(f"Socket {sid} left room {room}")

@sio.event
async def join_call(sid, data):
    """Join a call session room"""
    call_session_id = data.get('callSessionId')
    if call_session_id:
        room = f"call_{call_session_id}"
        await sio.enter_room(sid, room)
        logger.info(f"Socket {sid} joined call room {room}")

async def emit_to_user(user_id: str, event: str, data: dict):
    """Emit event to all connected sockets of a user"""
    if user_id in user_sids:
        for sid in user_sids[user_id]:
            await sio.emit(event, data, to=sid)

async def emit_to_schedule(schedule_id: str, event: str, data: dict):
    """Emit event to all users in a schedule room"""
    room = f"schedule_{schedule_id}"
    await sio.emit(event, data, room=room)

async def emit_to_call(call_session_id: str, event: str, data: dict):
    """Emit event to all users in a call room"""
    room = f"call_{call_session_id}"
    await sio.emit(event, data, room=room)

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "passwordHash": hash_password(user_data.password),
        "role": user_data.role,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    
    # Create token
    token = create_token(user_id, user_data.role)
    
    await log_audit(user_id, "USER_REGISTERED")
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=user_id, email=user_data.email, name=user_data.name, role=user_data.role)
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user['passwordHash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user['id'], user['role'])
    
    await log_audit(user['id'], "USER_LOGIN")
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=user['id'], email=user['email'], name=user['name'], role=user['role'])
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(**user)

# ==================== DOCTOR ROUTES ====================

@api_router.get("/doctor/schedules", response_model=List[DoctorScheduleResponse])
async def get_doctor_schedules(user: dict = Depends(require_doctor)):
    schedules = await db.schedules.find(
        {"doctorId": user['id']}, 
        {"_id": 0}
    ).sort("date", 1).to_list(100)
    
    for schedule in schedules:
        schedule['doctorName'] = user['name']
    
    return schedules

@api_router.post("/doctor/schedules", response_model=DoctorScheduleResponse)
async def create_schedule(schedule_data: DoctorScheduleCreate, user: dict = Depends(require_doctor)):
    schedule_id = str(uuid.uuid4())
    schedule = {
        "id": schedule_id,
        "doctorId": user['id'],
        "date": schedule_data.date,
        "startTime": schedule_data.startTime,
        "endTime": schedule_data.endTime,
        "status": ScheduleStatus.UPCOMING
    }
    await db.schedules.insert_one(schedule)
    
    await log_audit(user['id'], "SCHEDULE_CREATED", schedule_id=schedule_id)
    
    return DoctorScheduleResponse(**schedule, doctorName=user['name'])

@api_router.post("/doctor/schedules/{schedule_id}/start")
async def start_practice(schedule_id: str, user: dict = Depends(require_doctor)):
    schedule = await db.schedules.find_one({"id": schedule_id, "doctorId": user['id']}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    if schedule['status'] == ScheduleStatus.ONLINE:
        raise HTTPException(status_code=400, detail="Practice already started")
    
    if schedule['status'] == ScheduleStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Practice already completed")
    
    await db.schedules.update_one(
        {"id": schedule_id},
        {"$set": {"status": ScheduleStatus.ONLINE}}
    )
    
    await log_audit(user['id'], "PRACTICE_STARTED", schedule_id=schedule_id)
    
    # Emit to all patients in this schedule
    await emit_to_schedule(schedule_id, "schedule_status_changed", {
        "scheduleId": schedule_id,
        "status": ScheduleStatus.ONLINE,
        "doctorName": user['name']
    })
    
    return {"message": "Practice started", "status": ScheduleStatus.ONLINE}

@api_router.post("/doctor/schedules/{schedule_id}/end")
async def end_practice(schedule_id: str, user: dict = Depends(require_doctor)):
    schedule = await db.schedules.find_one({"id": schedule_id, "doctorId": user['id']}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    await db.schedules.update_one(
        {"id": schedule_id},
        {"$set": {"status": ScheduleStatus.COMPLETED}}
    )
    
    # End any active calls
    await db.call_sessions.update_many(
        {"scheduleId": schedule_id, "status": {"$in": [CallSessionStatus.INVITED, CallSessionStatus.CONFIRMED, CallSessionStatus.ACTIVE]}},
        {"$set": {"status": CallSessionStatus.ENDED, "endedAt": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_audit(user['id'], "PRACTICE_ENDED", schedule_id=schedule_id)
    
    await emit_to_schedule(schedule_id, "schedule_status_changed", {
        "scheduleId": schedule_id,
        "status": ScheduleStatus.COMPLETED
    })
    
    return {"message": "Practice ended", "status": ScheduleStatus.COMPLETED}

@api_router.get("/doctor/schedules/{schedule_id}/queue", response_model=List[QueueEntryResponse])
async def get_queue(schedule_id: str, user: dict = Depends(require_doctor)):
    schedule = await db.schedules.find_one({"id": schedule_id, "doctorId": user['id']}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    queue = await db.queue_entries.find({"scheduleId": schedule_id}, {"_id": 0}).sort("queueNumber", 1).to_list(100)
    
    # Get patient names
    for entry in queue:
        patient = await db.users.find_one({"id": entry['patientId']}, {"_id": 0, "name": 1})
        entry['patientName'] = patient['name'] if patient else "Unknown"
    
    return queue

@api_router.post("/doctor/schedules/{schedule_id}/start-call")
async def start_call(schedule_id: str, request: StartCallRequest, user: dict = Depends(require_doctor)):
    schedule = await db.schedules.find_one({"id": schedule_id, "doctorId": user['id']}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    if schedule['status'] != ScheduleStatus.ONLINE:
        raise HTTPException(status_code=400, detail="Practice not online")
    
    # Auto-expire old INVITED sessions (older than 60 seconds)
    sixty_seconds_ago = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    await db.call_sessions.update_many(
        {
            "scheduleId": schedule_id,
            "status": CallSessionStatus.INVITED,
            "createdAt": {"$lt": sixty_seconds_ago}
        },
        {"$set": {"status": CallSessionStatus.EXPIRED, "endedAt": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Check for active call
    active_call = await db.call_sessions.find_one({
        "scheduleId": schedule_id,
        "status": {"$in": [CallSessionStatus.INVITED, CallSessionStatus.CONFIRMED, CallSessionStatus.ACTIVE]}
    }, {"_id": 0})
    
    if active_call:
        raise HTTPException(status_code=400, detail="Another call is already active")
    
    # Check patient is ready
    queue_entry = await db.queue_entries.find_one({
        "scheduleId": schedule_id,
        "patientId": request.patientId
    }, {"_id": 0})
    
    if not queue_entry:
        raise HTTPException(status_code=404, detail="Patient not in queue")
    
    if queue_entry['status'] != QueueStatus.READY:
        raise HTTPException(status_code=400, detail="Patient is not ready")
    
    # Create call session
    call_session_id = str(uuid.uuid4())
    call_session = {
        "id": call_session_id,
        "scheduleId": schedule_id,
        "doctorId": user['id'],
        "patientId": request.patientId,
        "status": CallSessionStatus.INVITED,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "confirmedAt": None,
        "endedAt": None,
        "doctorPeerId": None,
        "patientPeerId": None
    }
    await db.call_sessions.insert_one(call_session)
    
    await log_audit(user['id'], "CALL_INVITED", schedule_id=schedule_id, 
                   patient_id=request.patientId, call_session_id=call_session_id)
    
    # Send invitation to patient
    patient = await db.users.find_one({"id": request.patientId}, {"_id": 0, "name": 1})
    await emit_to_user(request.patientId, "call_invitation", {
        "callSessionId": call_session_id,
        "scheduleId": schedule_id,
        "doctorId": user['id'],
        "doctorName": user['name']
    })
    
    # Update queue
    await emit_to_schedule(schedule_id, "queue_updated", {"scheduleId": schedule_id})
    
    return {
        "message": "Invitation sent",
        "callSessionId": call_session_id,
        "status": CallSessionStatus.INVITED
    }

@api_router.get("/doctor/call-sessions/{call_session_id}", response_model=CallSessionResponse)
async def get_call_session_doctor(call_session_id: str, user: dict = Depends(require_doctor)):
    session = await db.call_sessions.find_one({"id": call_session_id, "doctorId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    return session

@api_router.post("/doctor/call-sessions/{call_session_id}/set-peer-id")
async def set_doctor_peer_id(call_session_id: str, request: SetPeerIdRequest, user: dict = Depends(require_doctor)):
    session = await db.call_sessions.find_one({"id": call_session_id, "doctorId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    await db.call_sessions.update_one(
        {"id": call_session_id},
        {"$set": {"doctorPeerId": request.peerId}}
    )
    
    # Notify patient
    await emit_to_call(call_session_id, "peer_id_updated", {
        "callSessionId": call_session_id,
        "role": "doctor",
        "peerId": request.peerId
    })
    
    return {"message": "Peer ID set"}

@api_router.post("/doctor/call-sessions/{call_session_id}/end")
async def end_call_doctor(call_session_id: str, user: dict = Depends(require_doctor)):
    session = await db.call_sessions.find_one({"id": call_session_id, "doctorId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    await db.call_sessions.update_one(
        {"id": call_session_id},
        {"$set": {"status": CallSessionStatus.ENDED, "endedAt": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Update queue entry
    await db.queue_entries.update_one(
        {"scheduleId": session['scheduleId'], "patientId": session['patientId']},
        {"$set": {"status": QueueStatus.DONE}}
    )
    
    await log_audit(user['id'], "CALL_ENDED", schedule_id=session['scheduleId'],
                   patient_id=session['patientId'], call_session_id=call_session_id)
    
    # Notify both parties
    await emit_to_call(call_session_id, "call_ended", {
        "callSessionId": call_session_id,
        "endedBy": "doctor"
    })
    
    await emit_to_schedule(session['scheduleId'], "queue_updated", {"scheduleId": session['scheduleId']})
    
    return {"message": "Call ended"}

@api_router.get("/doctor/call-sessions/{call_session_id}/status")
async def get_call_session_status(call_session_id: str, user: dict = Depends(require_doctor)):
    """Check the status of a call session - used for polling"""
    session = await db.call_sessions.find_one({"id": call_session_id, "doctorId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    # Get patient name
    patient = await db.users.find_one({"id": session['patientId']}, {"_id": 0, "name": 1})
    
    return {
        "callSessionId": session['id'],
        "status": session['status'],
        "patientId": session['patientId'],
        "patientName": patient['name'] if patient else "Unknown",
        "scheduleId": session['scheduleId']
    }

# ==================== PATIENT ROUTES ====================

@api_router.get("/patient/schedules", response_model=List[DoctorScheduleResponse])
async def get_available_schedules(user: dict = Depends(require_patient)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    schedules = await db.schedules.find(
        {"date": {"$gte": today}},
        {"_id": 0}
    ).sort([("date", 1), ("startTime", 1)]).to_list(100)
    
    # Get doctor names
    for schedule in schedules:
        doctor = await db.users.find_one({"id": schedule['doctorId']}, {"_id": 0, "name": 1})
        schedule['doctorName'] = doctor['name'] if doctor else "Unknown"
    
    return schedules

@api_router.get("/patient/schedules/{schedule_id}")
async def get_schedule_detail(schedule_id: str, user: dict = Depends(require_patient)):
    schedule = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    doctor = await db.users.find_one({"id": schedule['doctorId']}, {"_id": 0, "name": 1})
    schedule['doctorName'] = doctor['name'] if doctor else "Unknown"
    
    # Get patient's queue entry
    queue_entry = await db.queue_entries.find_one({
        "scheduleId": schedule_id,
        "patientId": user['id']
    }, {"_id": 0})
    
    # Get total queue count
    total_queue = await db.queue_entries.count_documents({"scheduleId": schedule_id})
    
    return {
        "schedule": schedule,
        "queueEntry": queue_entry,
        "totalInQueue": total_queue
    }

@api_router.post("/patient/schedules/{schedule_id}/join-queue")
async def join_queue(schedule_id: str, user: dict = Depends(require_patient)):
    schedule = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    # Check if already in queue
    existing = await db.queue_entries.find_one({
        "scheduleId": schedule_id,
        "patientId": user['id']
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=400, detail="Already in queue")
    
    # Get next queue number
    last_entry = await db.queue_entries.find_one(
        {"scheduleId": schedule_id},
        sort=[("queueNumber", -1)]
    )
    queue_number = (last_entry['queueNumber'] + 1) if last_entry else 1
    
    # Create queue entry
    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id,
        "scheduleId": schedule_id,
        "patientId": user['id'],
        "queueNumber": queue_number,
        "status": QueueStatus.WAITING,
        "isReady": False,
        "joinedAt": datetime.now(timezone.utc).isoformat()
    }
    await db.queue_entries.insert_one(entry)
    
    await log_audit(user['id'], "QUEUE_JOINED", schedule_id=schedule_id, patient_id=user['id'])
    
    # Notify schedule room
    await emit_to_schedule(schedule_id, "queue_updated", {"scheduleId": schedule_id})
    
    return {"message": "Joined queue", "queueNumber": queue_number, "entryId": entry_id}

@api_router.post("/patient/schedules/{schedule_id}/toggle-ready")
async def toggle_ready(schedule_id: str, request: ToggleReadyRequest, user: dict = Depends(require_patient)):
    entry = await db.queue_entries.find_one({
        "scheduleId": schedule_id,
        "patientId": user['id']
    }, {"_id": 0})
    
    if not entry:
        raise HTTPException(status_code=404, detail="Not in queue")
    
    if entry['status'] == QueueStatus.DONE:
        raise HTTPException(status_code=400, detail="Consultation already completed")
    
    if entry['status'] == QueueStatus.IN_CALL:
        raise HTTPException(status_code=400, detail="Currently in call")
    
    new_status = QueueStatus.READY if request.isReady else QueueStatus.WAITING
    
    await db.queue_entries.update_one(
        {"scheduleId": schedule_id, "patientId": user['id']},
        {"$set": {"status": new_status, "isReady": request.isReady}}
    )
    
    await log_audit(user['id'], "READY_TOGGLED", schedule_id=schedule_id, 
                   patient_id=user['id'], metadata={"isReady": request.isReady})
    
    # Notify schedule room
    await emit_to_schedule(schedule_id, "queue_updated", {"scheduleId": schedule_id})
    
    return {"message": "Ready status updated", "isReady": request.isReady, "status": new_status}

@api_router.get("/patient/pending-invitation")
async def get_pending_invitation(user: dict = Depends(require_patient)):
    """Check if there's a pending call invitation for this patient"""
    invitation = await db.call_sessions.find_one({
        "patientId": user['id'],
        "status": CallSessionStatus.INVITED
    }, {"_id": 0})
    
    if invitation:
        # Get doctor name
        doctor = await db.users.find_one({"id": invitation['doctorId']}, {"_id": 0, "name": 1})
        return {
            "hasInvitation": True,
            "callSessionId": invitation['id'],
            "scheduleId": invitation['scheduleId'],
            "doctorId": invitation['doctorId'],
            "doctorName": doctor['name'] if doctor else "Doctor"
        }
    
    return {"hasInvitation": False}

@api_router.get("/patient/call-sessions/{call_session_id}", response_model=CallSessionResponse)
async def get_call_session_patient(call_session_id: str, user: dict = Depends(require_patient)):
    session = await db.call_sessions.find_one({"id": call_session_id, "patientId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    return session

@api_router.post("/patient/call-sessions/{call_session_id}/confirm")
async def confirm_call(call_session_id: str, user: dict = Depends(require_patient)):
    session = await db.call_sessions.find_one({"id": call_session_id, "patientId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    if session['status'] != CallSessionStatus.INVITED:
        raise HTTPException(status_code=400, detail=f"Cannot confirm call in status: {session['status']}")
    
    await db.call_sessions.update_one(
        {"id": call_session_id},
        {"$set": {"status": CallSessionStatus.CONFIRMED, "confirmedAt": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Update queue entry
    await db.queue_entries.update_one(
        {"scheduleId": session['scheduleId'], "patientId": user['id']},
        {"$set": {"status": QueueStatus.IN_CALL}}
    )
    
    await log_audit(user['id'], "CALL_CONFIRMED", schedule_id=session['scheduleId'],
                   patient_id=user['id'], call_session_id=call_session_id)
    
    # Notify doctor
    await emit_to_user(session['doctorId'], "call_confirmed", {
        "callSessionId": call_session_id,
        "patientId": user['id']
    })
    
    await emit_to_schedule(session['scheduleId'], "queue_updated", {"scheduleId": session['scheduleId']})
    
    return {"message": "Call confirmed", "callSessionId": call_session_id}

@api_router.post("/patient/call-sessions/{call_session_id}/decline")
async def decline_call(call_session_id: str, user: dict = Depends(require_patient)):
    session = await db.call_sessions.find_one({"id": call_session_id, "patientId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    if session['status'] != CallSessionStatus.INVITED:
        raise HTTPException(status_code=400, detail=f"Cannot decline call in status: {session['status']}")
    
    await db.call_sessions.update_one(
        {"id": call_session_id},
        {"$set": {"status": CallSessionStatus.DECLINED, "endedAt": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Reset patient to waiting and not ready
    await db.queue_entries.update_one(
        {"scheduleId": session['scheduleId'], "patientId": user['id']},
        {"$set": {"status": QueueStatus.WAITING, "isReady": False}}
    )
    
    await log_audit(user['id'], "CALL_DECLINED", schedule_id=session['scheduleId'],
                   patient_id=user['id'], call_session_id=call_session_id)
    
    # Notify doctor
    await emit_to_user(session['doctorId'], "call_declined", {
        "callSessionId": call_session_id,
        "patientId": user['id']
    })
    
    await emit_to_schedule(session['scheduleId'], "queue_updated", {"scheduleId": session['scheduleId']})
    
    return {"message": "Call declined"}

@api_router.post("/patient/call-sessions/{call_session_id}/set-peer-id")
async def set_patient_peer_id(call_session_id: str, request: SetPeerIdRequest, user: dict = Depends(require_patient)):
    session = await db.call_sessions.find_one({"id": call_session_id, "patientId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    await db.call_sessions.update_one(
        {"id": call_session_id},
        {"$set": {"patientPeerId": request.peerId}}
    )
    
    # Notify doctor
    await emit_to_call(call_session_id, "peer_id_updated", {
        "callSessionId": call_session_id,
        "role": "patient",
        "peerId": request.peerId
    })
    
    return {"message": "Peer ID set"}

@api_router.post("/patient/call-sessions/{call_session_id}/end")
async def end_call_patient(call_session_id: str, user: dict = Depends(require_patient)):
    session = await db.call_sessions.find_one({"id": call_session_id, "patientId": user['id']}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    await db.call_sessions.update_one(
        {"id": call_session_id},
        {"$set": {"status": CallSessionStatus.ENDED, "endedAt": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Update queue entry
    await db.queue_entries.update_one(
        {"scheduleId": session['scheduleId'], "patientId": user['id']},
        {"$set": {"status": QueueStatus.DONE}}
    )
    
    await log_audit(user['id'], "CALL_ENDED", schedule_id=session['scheduleId'],
                   patient_id=user['id'], call_session_id=call_session_id)
    
    # Notify both parties
    await emit_to_call(call_session_id, "call_ended", {
        "callSessionId": call_session_id,
        "endedBy": "patient"
    })
    
    await emit_to_schedule(session['scheduleId'], "queue_updated", {"scheduleId": session['scheduleId']})
    
    return {"message": "Call ended"}

# ==================== CALL SESSION ROUTES ====================

@api_router.post("/call-sessions/{call_session_id}/activate")
async def activate_call(call_session_id: str, user: dict = Depends(get_current_user)):
    session = await db.call_sessions.find_one({"id": call_session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    # Verify user is part of this call
    if user['id'] != session['doctorId'] and user['id'] != session['patientId']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if session['status'] != CallSessionStatus.CONFIRMED:
        raise HTTPException(status_code=400, detail=f"Cannot activate call in status: {session['status']}")
    
    await db.call_sessions.update_one(
        {"id": call_session_id},
        {"$set": {"status": CallSessionStatus.ACTIVE}}
    )
    
    await emit_to_call(call_session_id, "call_activated", {"callSessionId": call_session_id})
    
    return {"message": "Call activated"}

@api_router.get("/call-sessions/{call_session_id}")
async def get_call_session(call_session_id: str, user: dict = Depends(get_current_user)):
    session = await db.call_sessions.find_one({"id": call_session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Call session not found")
    
    # Verify user is part of this call
    if user['id'] != session['doctorId'] and user['id'] != session['patientId']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get names
    doctor = await db.users.find_one({"id": session['doctorId']}, {"_id": 0, "name": 1})
    patient = await db.users.find_one({"id": session['patientId']}, {"_id": 0, "name": 1})
    
    return {
        **session,
        "doctorName": doctor['name'] if doctor else "Unknown",
        "patientName": patient['name'] if patient else "Unknown"
    }

# ==================== SEED DATA ====================

@api_router.post("/seed")
async def seed_data():
    # Clear existing data
    await db.users.delete_many({})
    await db.schedules.delete_many({})
    await db.queue_entries.delete_many({})
    await db.call_sessions.delete_many({})
    await db.audit_logs.delete_many({})
    
    # Create doctor
    doctor_id = str(uuid.uuid4())
    doctor = {
        "id": doctor_id,
        "email": "doctor@clinic.com",
        "name": "Dr. Sarah Johnson",
        "passwordHash": hash_password("doctor123"),
        "role": UserRole.DOCTOR,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(doctor)
    
    # Create patients
    patients = []
    patient_names = [
        ("John Smith", "john@email.com"),
        ("Emily Davis", "emily@email.com"),
        ("Michael Brown", "michael@email.com"),
        ("Jessica Wilson", "jessica@email.com"),
        ("David Martinez", "david@email.com")
    ]
    
    for name, email in patient_names:
        patient_id = str(uuid.uuid4())
        patient = {
            "id": patient_id,
            "email": email,
            "name": name,
            "passwordHash": hash_password("patient123"),
            "role": UserRole.PATIENT,
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(patient)
        patients.append(patient)
    
    # Create schedules for today
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    schedules = [
        {"startTime": "09:00", "endTime": "12:00", "status": ScheduleStatus.UPCOMING},
        {"startTime": "13:00", "endTime": "16:00", "status": ScheduleStatus.UPCOMING},
        {"startTime": "17:00", "endTime": "19:00", "status": ScheduleStatus.UPCOMING}
    ]
    
    schedule_ids = []
    for sched in schedules:
        schedule_id = str(uuid.uuid4())
        schedule = {
            "id": schedule_id,
            "doctorId": doctor_id,
            "date": today,
            "startTime": sched["startTime"],
            "endTime": sched["endTime"],
            "status": sched["status"]
        }
        await db.schedules.insert_one(schedule)
        schedule_ids.append(schedule_id)
    
    # Add 5 patients to first schedule queue
    for i, patient in enumerate(patients):
        entry_id = str(uuid.uuid4())
        entry = {
            "id": entry_id,
            "scheduleId": schedule_ids[0],
            "patientId": patient['id'],
            "queueNumber": i + 1,
            "status": QueueStatus.WAITING,
            "isReady": False,
            "joinedAt": datetime.now(timezone.utc).isoformat()
        }
        await db.queue_entries.insert_one(entry)
    
    return {
        "message": "Seed data created",
        "doctor": {"email": "doctor@clinic.com", "password": "doctor123"},
        "patients": [{"email": email, "password": "patient123"} for _, email in patient_names],
        "schedules": len(schedules),
        "queueEntries": len(patients)
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Doctor Consultation API", "status": "healthy"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Mount Socket.IO to FastAPI at /socket.io path
app.mount("/socket.io", socket_asgi_app)
