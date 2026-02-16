import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Loader2, AlertCircle, User, RefreshCw, Wifi, WifiOff
} from 'lucide-react';
import axios from 'axios';
import Peer from 'peerjs';

const BACKEND_URL = 'https://medconsult-backend-production.up.railway.app';
const API = `${BACKEND_URL}/api`;

// Connection states
const CONNECTION_STATE = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed'
};

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
  const [connectionState, setConnectionState] = useState(CONNECTION_STATE.CONNECTING);
  const [remotePeerId, setRemotePeerId] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [mediaInitialized, setMediaInitialized] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [showReconnectUI, setShowReconnectUI] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callRef = useRef(null);
  const callSessionRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const connectionCheckIntervalRef = useRef(null);

  const isDoctor = user?.role === 'DOCTOR';
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Store callSession in ref for use in callbacks
  useEffect(() => {
    callSessionRef.current = callSession;
  }, [callSession]);

  // Cleanup function
  const cleanupPeerConnection = useCallback(() => {
    console.log('[CallRoom] Cleaning up peer connection');
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setCallActive(false);
  }, []);

  // Cleanup and navigate function
  const cleanupAndNavigate = useCallback(() => {
    if (callEnded) return;
    setCallEnded(true);
    
    // Clear intervals
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (connectionCheckIntervalRef.current) clearInterval(connectionCheckIntervalRef.current);
    
    // Clean up media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    cleanupPeerConnection();
    
    // Navigate back
    const session = callSessionRef.current;
    if (isDoctor && session?.scheduleId) {
      navigate(`/doctor/practice/${session.scheduleId}`);
    } else if (isDoctor) {
      navigate('/doctor/dashboard');
    } else {
      navigate('/patient/consultation');
    }
  }, [isDoctor, navigate, callEnded, cleanupPeerConnection]);

  // Initialize peer connection
  const initializePeerConnection = useCallback(async (isReconnect = false) => {
    if (!localStreamRef.current) {
      console.error('[CallRoom] No local stream available');
      return false;
    }

    try {
      console.log(`[CallRoom] ${isReconnect ? 'Reconnecting' : 'Initializing'} peer connection...`);
      setConnectionState(isReconnect ? CONNECTION_STATE.RECONNECTING : CONNECTION_STATE.CONNECTING);
      
      // Clean up existing peer if reconnecting
      if (isReconnect) {
        cleanupPeerConnection();
      }

      // Initialize PeerJS
      const peer = new Peer();
      peerRef.current = peer;
      
      return new Promise((resolve) => {
        peer.on('open', async (id) => {
          console.log('[CallRoom] PeerJS connected with ID:', id);
          
          // Send peer ID to server
          const endpoint = isDoctor 
            ? `${API}/doctor/call-sessions/${callSessionId}/set-peer-id`
            : `${API}/patient/call-sessions/${callSessionId}/set-peer-id`;
          
          try {
            await axios.post(endpoint, { peerId: id }, {
              headers: { Authorization: `Bearer ${token}` }
            });
            console.log('[CallRoom] Peer ID sent to server');
          } catch (err) {
            console.error('[CallRoom] Failed to set peer ID:', err);
          }
          
          // Refresh call session to get remote peer ID
          try {
            const response = await axios.get(`${API}/call-sessions/${callSessionId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            if (isDoctor && response.data.patientPeerId) {
              setRemotePeerId(response.data.patientPeerId);
            } else if (!isDoctor && response.data.doctorPeerId) {
              setRemotePeerId(response.data.doctorPeerId);
            }
          } catch (err) {
            console.error('[CallRoom] Failed to refresh call session:', err);
          }
          
          setConnectionState(CONNECTION_STATE.CONNECTED);
          setShowReconnectUI(false);
          if (isReconnect) {
            toast.success('Reconnected successfully!');
            setReconnectAttempts(0);
          }
          resolve(true);
        });
        
        peer.on('call', (call) => {
          console.log('[CallRoom] Incoming call from:', call.peer);
          call.answer(localStreamRef.current);
          callRef.current = call;
          
          call.on('stream', (remoteStream) => {
            console.log('[CallRoom] Received remote stream');
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            setCallActive(true);
            setConnectionState(CONNECTION_STATE.CONNECTED);
            setShowReconnectUI(false);
          });
          
          call.on('close', () => {
            console.log('[CallRoom] Call closed');
            handleConnectionLost();
          });

          call.on('error', (err) => {
            console.error('[CallRoom] Call error:', err);
            handleConnectionLost();
          });
        });
        
        peer.on('error', (err) => {
          console.error('[CallRoom] PeerJS error:', err);
          if (err.type === 'network' || err.type === 'disconnected' || err.type === 'server-error') {
            handleConnectionLost();
          }
          resolve(false);
        });

        peer.on('disconnected', () => {
          console.log('[CallRoom] Peer disconnected from server');
          handleConnectionLost();
        });
      });
    } catch (err) {
      console.error('[CallRoom] Failed to initialize peer:', err);
      return false;
    }
  }, [callSessionId, isDoctor, token, cleanupPeerConnection]);

  // Handle connection lost
  const handleConnectionLost = useCallback(() => {
    if (callEnded) return;
    
    console.log('[CallRoom] Connection lost detected');
    setConnectionState(CONNECTION_STATE.DISCONNECTED);
    setCallActive(false);
    setShowReconnectUI(true);
    
    // Auto-reconnect after a short delay (first attempt only)
    if (reconnectAttempts === 0) {
      reconnectTimeoutRef.current = setTimeout(() => {
        handleReconnect();
      }, 2000);
    }
  }, [callEnded, reconnectAttempts]);

  // Handle manual reconnect
  const handleReconnect = useCallback(async () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      toast.error('Unable to reconnect. Please try rejoining the call.');
      setConnectionState(CONNECTION_STATE.FAILED);
      return;
    }

    setReconnectAttempts(prev => prev + 1);
    toast.info(`Reconnecting... (Attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    
    const success = await initializePeerConnection(true);
    
    if (!success) {
      setConnectionState(CONNECTION_STATE.DISCONNECTED);
      setShowReconnectUI(true);
    }
  }, [reconnectAttempts, initializePeerConnection]);

  // First: Verify call session exists and user has access
  useEffect(() => {
    const verifyCallSession = async () => {
      if (!token || !callSessionId) {
        setError('Missing authentication or call session ID');
        setLoading(false);
        return;
      }

      try {
        console.log('[CallRoom] Verifying call session:', callSessionId);
        const response = await axios.get(`${API}/call-sessions/${callSessionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log('[CallRoom] Call session verified:', response.data);
        setCallSession(response.data);
        callSessionRef.current = response.data;
        
        // Set remote peer ID if available
        if (isDoctor && response.data.patientPeerId) {
          setRemotePeerId(response.data.patientPeerId);
        } else if (!isDoctor && response.data.doctorPeerId) {
          setRemotePeerId(response.data.doctorPeerId);
        }
        
        setLoading(false);
        
        // Activate call if confirmed
        if (response.data.status === 'CONFIRMED') {
          try {
            await axios.post(`${API}/call-sessions/${callSessionId}/activate`, {}, {
              headers: { Authorization: `Bearer ${token}` }
            });
          } catch (e) {
            console.log('[CallRoom] Activation note:', e.response?.data?.detail);
          }
        }
      } catch (err) {
        console.error('[CallRoom] Failed to verify call session:', err.response?.data || err);
        setError(`Unable to join call: ${err.response?.data?.detail || 'Access denied or call not found'}`);
        setLoading(false);
      }
    };

    verifyCallSession();
    joinCall(callSessionId);
  }, [callSessionId, token, isDoctor, joinCall]);

  // Second: Initialize media and peer connection after call session is verified
  useEffect(() => {
    if (loading || error || !callSession || mediaInitialized) return;
    
    let mounted = true;
    
    const initializeMedia = async () => {
      try {
        console.log('[CallRoom] Initializing media...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        localStreamRef.current = stream;
        setLocalStreamReady(true);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        // Initialize peer connection
        await initializePeerConnection(false);
        setMediaInitialized(true);
        
      } catch (err) {
        console.error('[CallRoom] Failed to initialize media:', err);
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
          setError('Camera and microphone access is required for video calls. Please allow access and refresh.');
        } else {
          setError(`Failed to initialize video: ${err.message}`);
        }
      }
    };
    
    initializeMedia();
    
    return () => {
      mounted = false;
    };
  }, [loading, error, callSession, mediaInitialized, initializePeerConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (connectionCheckIntervalRef.current) clearInterval(connectionCheckIntervalRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  // Poll for call session status to detect if other party ended the call
  useEffect(() => {
    if (loading || error || !callSession || callEnded) return;
    
    const checkCallStatus = async () => {
      try {
        const response = await axios.get(`${API}/call-sessions/${callSessionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.status === 'ENDED') {
          console.log('[CallRoom] Call has been ended by other party');
          toast.info('Call has ended');
          cleanupAndNavigate();
        }
      } catch (err) {
        if (err.response?.status === 404) {
          console.log('[CallRoom] Call session not found - may have ended');
          toast.info('Call has ended');
          cleanupAndNavigate();
        }
      }
    };
    
    const pollInterval = setInterval(checkCallStatus, 3000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [loading, error, callSession, callSessionId, token, callEnded, cleanupAndNavigate]);

  // Connect to remote peer when their ID is available
  useEffect(() => {
    if (remotePeerId && peerRef.current && localStreamRef.current && !callRef.current) {
      console.log('[CallRoom] Calling remote peer:', remotePeerId);
      const call = peerRef.current.call(remotePeerId, localStreamRef.current);
      
      if (call) {
        callRef.current = call;
        
        call.on('stream', (remoteStream) => {
          console.log('[CallRoom] Received remote stream from outgoing call');
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          setCallActive(true);
          setConnectionState(CONNECTION_STATE.CONNECTED);
          setShowReconnectUI(false);
        });
        
        call.on('close', () => {
          console.log('[CallRoom] Outgoing call closed');
          handleConnectionLost();
        });

        call.on('error', (err) => {
          console.error('[CallRoom] Outgoing call error:', err);
          handleConnectionLost();
        });
      }
    }
  }, [remotePeerId, handleConnectionLost]);

  // Socket event handlers
  useEffect(() => {
    const handlePeerIdUpdated = (data) => {
      if (data.callSessionId === callSessionId) {
        const expectedRole = isDoctor ? 'patient' : 'doctor';
        if (data.role === expectedRole) {
          console.log('[CallRoom] Remote peer ID received via socket:', data.peerId);
          setRemotePeerId(data.peerId);
        }
      }
    };
    
    const handleCallEnded = (data) => {
      if (data.callSessionId === callSessionId) {
        toast.info('Call has ended');
        cleanupAndNavigate();
      }
    };
    
    on('peer_id_updated', handlePeerIdUpdated);
    on('call_ended', handleCallEnded);
    
    return () => {
      off('peer_id_updated', handlePeerIdUpdated);
      off('call_ended', handleCallEnded);
    };
  }, [callSessionId, isDoctor, on, off, cleanupAndNavigate]);

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
      console.error('[CallRoom] Failed to end call:', err);
      toast.error('Failed to end call properly');
    }
    
    cleanupAndNavigate();
  };

  // Get connection status display
  const getConnectionStatus = () => {
    switch (connectionState) {
      case CONNECTION_STATE.CONNECTED:
        return { text: 'Connected', color: 'text-emerald-400', icon: Wifi };
      case CONNECTION_STATE.CONNECTING:
        return { text: 'Connecting...', color: 'text-amber-400', icon: Wifi };
      case CONNECTION_STATE.RECONNECTING:
        return { text: 'Reconnecting...', color: 'text-amber-400', icon: RefreshCw };
      case CONNECTION_STATE.DISCONNECTED:
        return { text: 'Connection Lost', color: 'text-red-400', icon: WifiOff };
      case CONNECTION_STATE.FAILED:
        return { text: 'Connection Failed', color: 'text-red-400', icon: WifiOff };
      default:
        return { text: 'Unknown', color: 'text-slate-400', icon: Wifi };
    }
  };

  const connectionStatus = getConnectionStatus();
  const StatusIcon = connectionStatus.icon;

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
              <p className={`text-sm flex items-center gap-1 ${connectionStatus.color}`}>
                <StatusIcon className={`w-3 h-3 ${connectionState === CONNECTION_STATE.RECONNECTING ? 'animate-spin' : ''}`} />
                {connectionStatus.text}
              </p>
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${
            connectionState === CONNECTION_STATE.CONNECTED ? 'bg-emerald-500' : 
            connectionState === CONNECTION_STATE.DISCONNECTED || connectionState === CONNECTION_STATE.FAILED ? 'bg-red-500' :
            'bg-amber-500 animate-pulse'
          }`} />
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
                  {connectionState === CONNECTION_STATE.CONNECTING ? 'Connecting...' : 
                   connectionState === CONNECTION_STATE.RECONNECTING ? 'Reconnecting...' :
                   'Waiting for participant...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Connection Lost / Reconnect Overlay */}
        {showReconnectUI && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="text-center max-w-sm mx-4 p-6 bg-slate-800 rounded-2xl shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <WifiOff className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Connection Lost</h3>
              <p className="text-slate-400 mb-6">
                {reconnectAttempts >= MAX_RECONNECT_ATTEMPTS 
                  ? 'Unable to reconnect after multiple attempts.'
                  : 'Your connection to the call was interrupted.'}
              </p>
              
              {reconnectAttempts < MAX_RECONNECT_ATTEMPTS ? (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                    onClick={cleanupAndNavigate}
                    data-testid="leave-call-btn"
                  >
                    Leave Call
                  </Button>
                  <Button
                    className="flex-1 bg-sky-500 hover:bg-sky-600"
                    onClick={handleReconnect}
                    disabled={connectionState === CONNECTION_STATE.RECONNECTING}
                    data-testid="reconnect-btn"
                  >
                    {connectionState === CONNECTION_STATE.RECONNECTING ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Reconnecting...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reconnect
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full bg-sky-500 hover:bg-sky-600"
                  onClick={cleanupAndNavigate}
                  data-testid="go-back-btn"
                >
                  Go Back
                </Button>
              )}
              
              {reconnectAttempts > 0 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS && (
                <p className="text-xs text-slate-500 mt-4">
                  Attempt {reconnectAttempts} of {MAX_RECONNECT_ATTEMPTS}
                </p>
              )}
            </div>
          </div>
        )}
        
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
