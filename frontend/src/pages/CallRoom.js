import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Loader2, AlertCircle, User
} from 'lucide-react';
import axios from 'axios';
import Peer from 'peerjs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CallRoom = () => {
  const { callSessionId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { joinCall, on, off } = useSocket();
  
  const [callSession, setCallSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);
  const [remotePeerId, setRemotePeerId] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callRef = useRef(null);
  const callSessionRef = useRef(null);

  const isDoctor = user?.role === 'DOCTOR';

  // Store callSession in ref for use in handleEndCall
  useEffect(() => {
    callSessionRef.current = callSession;
  }, [callSession]);

  const fetchCallSession = useCallback(async () => {
    try {
      console.log('Fetching call session:', callSessionId);
      const response = await axios.get(`${API}/call-sessions/${callSessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Call session data:', response.data);
      setCallSession(response.data);
      callSessionRef.current = response.data;
      
      // Activate call if confirmed
      if (response.data.status === 'CONFIRMED') {
        try {
          await axios.post(`${API}/call-sessions/${callSessionId}/activate`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });
          console.log('Call activated');
        } catch (activateErr) {
          // Ignore activation errors - call might already be active
          console.log('Activation error (may be ok):', activateErr.response?.data);
        }
      }
      
      // Set remote peer ID based on role
      if (isDoctor && response.data.patientPeerId) {
        setRemotePeerId(response.data.patientPeerId);
      } else if (!isDoctor && response.data.doctorPeerId) {
        setRemotePeerId(response.data.doctorPeerId);
      }
      
      return response.data;
    } catch (err) {
      console.error('Failed to fetch call session:', err);
      console.error('Error response:', err.response?.data);
      setError('Unable to join call. Access denied or call not found.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [callSessionId, token, isDoctor]);

  // Initialize media and peer connection
  useEffect(() => {
    let mounted = true;
    
    const initializeCall = async () => {
      try {
        // Get local media stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        localStreamRef.current = stream;
        
        // Set local video immediately
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          setLocalStreamReady(true);
        }
        
        // Initialize PeerJS
        const peer = new Peer();
        peerRef.current = peer;
        
        peer.on('open', async (id) => {
          console.log('PeerJS connected with ID:', id);
          
          // Send peer ID to server
          const endpoint = isDoctor 
            ? `${API}/doctor/call-sessions/${callSessionId}/set-peer-id`
            : `${API}/patient/call-sessions/${callSessionId}/set-peer-id`;
          
          try {
            await axios.post(endpoint, { peerId: id }, {
              headers: { Authorization: `Bearer ${token}` }
            });
          } catch (err) {
            console.error('Failed to set peer ID:', err);
          }
          
          // Fetch call session to get remote peer ID
          await fetchCallSession();
          setIsConnecting(false);
        });
        
        peer.on('call', (call) => {
          console.log('Incoming call from:', call.peer);
          call.answer(localStreamRef.current);
          callRef.current = call;
          
          call.on('stream', (remoteStream) => {
            console.log('Received remote stream');
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            setCallActive(true);
          });
          
          call.on('close', () => {
            console.log('Call closed');
            setCallActive(false);
          });
        });
        
        peer.on('error', (err) => {
          console.error('PeerJS error:', err);
          if (err.type === 'unavailable-id') {
            toast.error('Connection error. Please try again.');
          }
        });
        
      } catch (err) {
        console.error('Failed to initialize call:', err);
        if (err.name === 'NotAllowedError') {
          setError('Camera and microphone access is required for video calls.');
        } else {
          setError('Failed to initialize video call. Please check camera permissions.');
        }
      }
    };
    
    initializeCall();
    joinCall(callSessionId);
    
    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [callSessionId, isDoctor, token, fetchCallSession, joinCall]);

  // Connect to remote peer when their ID is available
  useEffect(() => {
    if (remotePeerId && peerRef.current && localStreamRef.current && !callRef.current) {
      console.log('Calling remote peer:', remotePeerId);
      const call = peerRef.current.call(remotePeerId, localStreamRef.current);
      callRef.current = call;
      
      call.on('stream', (remoteStream) => {
        console.log('Received remote stream from call');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setCallActive(true);
      });
      
      call.on('close', () => {
        console.log('Call closed');
        setCallActive(false);
      });
    }
  }, [remotePeerId]);

  // Socket event handlers
  useEffect(() => {
    const handlePeerIdUpdated = (data) => {
      if (data.callSessionId === callSessionId) {
        const role = isDoctor ? 'patient' : 'doctor';
        if (data.role === role) {
          console.log('Remote peer ID received:', data.peerId);
          setRemotePeerId(data.peerId);
        }
      }
    };
    
    const handleCallEnded = (data) => {
      if (data.callSessionId === callSessionId) {
        toast.info('Call has ended');
        cleanupAndNavigate(false);
      }
    };
    
    on('peer_id_updated', handlePeerIdUpdated);
    on('call_ended', handleCallEnded);
    
    return () => {
      off('peer_id_updated', handlePeerIdUpdated);
      off('call_ended', handleCallEnded);
    };
  }, [callSessionId, isDoctor, on, off]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const cleanupAndNavigate = (sendRequest) => {
    // Clean up media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (callRef.current) {
      callRef.current.close();
    }
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    
    // Navigate back
    const session = callSessionRef.current;
    if (isDoctor && session?.scheduleId) {
      navigate(`/doctor/practice/${session.scheduleId}`);
    } else if (isDoctor) {
      navigate('/doctor/dashboard');
    } else {
      navigate('/patient/consultation');
    }
  };

  const handleEndCall = async () => {
    try {
      const endpoint = isDoctor 
        ? `${API}/doctor/call-sessions/${callSessionId}/end`
        : `${API}/patient/call-sessions/${callSessionId}/end`;
      
      await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Call ended');
    } catch (err) {
      console.error('Failed to end call:', err);
      toast.error('Failed to end call properly');
    }
    
    cleanupAndNavigate(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto text-sky-500 animate-spin mb-4" />
          <p className="text-white">Connecting to call...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-4">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Join Call</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <Button 
            onClick={() => navigate(isDoctor ? '/doctor/dashboard' : '/patient/consultation')}
            data-testid="back-btn"
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Call Info Header */}
      <div className="bg-slate-800/50 backdrop-blur-sm px-4 py-3 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center">
              <User className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <p className="text-white font-medium">
                {isDoctor ? callSession?.patientName : callSession?.doctorName}
              </p>
              <p className="text-slate-400 text-sm">
                {callActive ? 'Connected' : isConnecting ? 'Connecting...' : 'Waiting for connection'}
              </p>
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${callActive ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
        </div>
      </div>

      {/* Video Container */}
      <div className="flex-1 relative min-h-0">
        {/* Remote Video (Full Screen) */}
        <div className="absolute inset-0 bg-slate-800">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            data-testid="remote-video"
          />
          {!callActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center mx-auto mb-4">
                  <User className="w-12 h-12 text-slate-500" />
                </div>
                <p className="text-slate-400">
                  {isConnecting ? 'Connecting...' : 'Waiting for participant...'}
                </p>
              </div>
            </div>
          )}
        </div>
        
        {/* Local Video (Picture-in-Picture) */}
        <div 
          className="absolute bottom-24 right-4 w-48 h-36 rounded-lg border-2 border-white shadow-xl overflow-hidden z-10 bg-slate-700"
          style={{ minWidth: '180px', minHeight: '135px' }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
            data-testid="local-video"
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
              <VideoOff className="w-8 h-8 text-slate-500" />
            </div>
          )}
          {!localStreamReady && (
            <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          )}
        </div>
        
        {/* Call Controls */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 z-20">
          <button
            onClick={toggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
              isAudioEnabled 
                ? 'bg-white/20 text-white backdrop-blur-sm' 
                : 'bg-sky-500 text-white'
            }`}
            data-testid="toggle-audio"
          >
            {isAudioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
              isVideoEnabled 
                ? 'bg-white/20 text-white backdrop-blur-sm' 
                : 'bg-sky-500 text-white'
            }`}
            data-testid="toggle-video"
          >
            {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>
          
          <button
            onClick={handleEndCall}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center transition-all hover:scale-110 hover:bg-red-600"
            data-testid="end-call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallRoom;
