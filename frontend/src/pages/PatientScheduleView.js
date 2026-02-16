import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { 
  Stethoscope, Calendar, Clock, Users, ArrowLeft, 
  CheckCircle, AlertCircle, RefreshCw, UserCircle, Volume2,
  Radio, Loader2, Bell
} from 'lucide-react';
import axios from 'axios';
import InvitationModal from '../components/InvitationModal';
import notificationService from '../utils/notificationService';

const BACKEND_URL = 'https://medconsult-backend-production.up.railway.app';
const API = `${BACKEND_URL}/api`;

const PatientScheduleView = () => {
  const { scheduleId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { connected, joinSchedule, leaveSchedule, on, off } = useSocket();
  
  const [schedule, setSchedule] = useState(null);
  const [queueEntry, setQueueEntry] = useState(null);
  const [totalInQueue, setTotalInQueue] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [joining, setJoining] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [autoAccepting, setAutoAccepting] = useState(false);
  const pollIntervalRef = useRef(null);
  const autoAcceptHandled = useRef(false);
  const callHandledRef = useRef(false); // Track if current call was already handled

  const fetchData = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/patient/schedules/${scheduleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchedule(response.data.schedule);
      setQueueEntry(response.data.queueEntry);
      setTotalInQueue(response.data.totalInQueue);
      
      if (response.data.queueEntry) {
        setIsReady(response.data.queueEntry.status === 'READY');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load consultation details');
    } finally {
      setLoading(false);
    }
  }, [scheduleId, token]);

  // Check notification permission status
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Enable notifications
  const enableNotifications = async () => {
    const granted = await notificationService.requestPermission();
    setNotificationsEnabled(granted);
    if (granted) {
      toast.success('Notifications enabled! You will be alerted when the doctor calls.');
    } else {
      toast.error('Notification permission denied. Please enable in browser settings.');
    }
  };

  // Handle auto-accept from notification click (URL param)
  useEffect(() => {
    const acceptCallId = searchParams.get('acceptCall');
    if (acceptCallId && token && !autoAcceptHandled.current) {
      autoAcceptHandled.current = true;
      console.log('[PatientScheduleView] Auto-accepting call from notification:', acceptCallId);
      setAutoAccepting(true);
      
      // Auto-confirm the call
      const autoConfirmCall = async () => {
        try {
          await axios.post(
            `${API}/patient/call-sessions/${acceptCallId}/confirm`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          toast.success('Call accepted! Joining...');
          navigate(`/call/${acceptCallId}`);
        } catch (error) {
          console.error('Failed to auto-confirm call:', error);
          toast.error('Failed to join call. It may have expired.');
          setAutoAccepting(false);
          // Clear URL param
          navigate(`/patient/schedule/${scheduleId}`, { replace: true });
        }
      };
      
      autoConfirmCall();
    }
  }, [searchParams, token, scheduleId, navigate]);

  // Listen for service worker messages (notification clicks)
  useEffect(() => {
    const handleServiceWorkerMessage = async (event) => {
      console.log('[PatientScheduleView] SW message received:', event.data);
      
      if (event.data?.type === 'NOTIFICATION_ACTION') {
        const { action, callSessionId } = event.data;
        
        // Mark call as handled to prevent modal from also handling it
        callHandledRef.current = true;
        
        if (action === 'accept' && callSessionId) {
          console.log('[PatientScheduleView] *** ACCEPTING call from notification:', callSessionId);
          
          // Clear modal and stop sounds immediately
          setInvitation(null);
          notificationService.stopSound();
          
          try {
            const response = await axios.post(
              `${API}/patient/call-sessions/${callSessionId}/confirm`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log('[PatientScheduleView] Confirm API response:', response.data);
            toast.success('Call accepted! Joining...');
            navigate(`/call/${callSessionId}`);
          } catch (error) {
            console.error('[PatientScheduleView] Failed to accept call:', error.response?.data || error);
            toast.error('Failed to join call. It may have expired.');
            callHandledRef.current = false;
          }
        } else if (action === 'decline' && callSessionId) {
          console.log('[PatientScheduleView] *** DECLINING call from notification:', callSessionId);
          
          // Clear modal and stop sounds immediately
          setInvitation(null);
          notificationService.stopSound();
          
          try {
            await axios.post(
              `${API}/patient/call-sessions/${callSessionId}/decline`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.info('Call declined');
            fetchData();
          } catch (error) {
            console.error('[PatientScheduleView] Failed to decline call:', error);
          }
          callHandledRef.current = false;
        }
      }
      
      // Handle pending call data when app opens from notification
      if (event.data?.type === 'PENDING_CALL_DATA' && event.data.data) {
        const { callSessionId, action } = event.data.data;
        console.log('[PatientScheduleView] Received pending call data:', event.data.data);
        
        if (action === 'accept' && callSessionId) {
          callHandledRef.current = true;
          setInvitation(null);
          notificationService.stopSound();
          
          try {
            await axios.post(
              `${API}/patient/call-sessions/${callSessionId}/confirm`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Call accepted! Joining...');
            navigate(`/call/${callSessionId}`);
          } catch (error) {
            console.error('Failed to accept pending call:', error);
            toast.error('Failed to join call. It may have expired.');
            callHandledRef.current = false;
          }
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      
      // Check for pending call data from SW when page loads
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.active) {
          registration.active.postMessage({ type: 'CHECK_PENDING_CALL' });
        }
      });
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [token, navigate, fetchData]);

  // Poll for pending invitations (fallback for Socket.IO)
  const checkForInvitation = useCallback(async () => {
    if (!token || invitation) return;
    
    try {
      const response = await axios.get(`${API}/patient/pending-invitation`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.hasInvitation && response.data.scheduleId === scheduleId) {
        console.log('Found pending invitation via polling:', response.data);
        
        // Reset the handled flag for new invitation
        callHandledRef.current = false;
        
        setInvitation(response.data);
        
        // Always send notification via service worker (shows action buttons)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'DOCTOR_CALLING',
            doctorName: response.data.doctorName,
            callSessionId: response.data.callSessionId,
            scheduleId: response.data.scheduleId
          });
          console.log('[PatientScheduleView] Sent DOCTOR_CALLING to service worker');
        } else if ('Notification' in window && Notification.permission === 'granted') {
          // Fallback: show notification directly if service worker not available
          const notification = new Notification('📞 Incoming Call', {
            body: `${response.data.doctorName || 'Doctor'} is calling you. Tap to answer.`,
            icon: '/icon-192.png',
            tag: 'doctor-call',
            requireInteraction: true
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      }
    } catch (error) {
      console.error('Failed to check invitation:', error);
    }
  }, [token, scheduleId, invitation]);

  useEffect(() => {
    fetchData();
    joinSchedule(scheduleId);
    
    // Start polling for invitations every 2 seconds when patient is ready
    pollIntervalRef.current = setInterval(() => {
      checkForInvitation();
    }, 2000);

    return () => {
      leaveSchedule(scheduleId);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [scheduleId, fetchData, joinSchedule, leaveSchedule, checkForInvitation]);

  // Socket event handlers (backup - polling is primary now)
  useEffect(() => {
    const handleScheduleStatusChanged = (data) => {
      if (data.scheduleId === scheduleId) {
        fetchData();
        if (data.status === 'ONLINE') {
          toast.success('Doctor is now online! You can set yourself as Ready.');
        } else if (data.status === 'COMPLETED') {
          toast.info('Practice session has ended.');
        }
      }
    };

    const handleQueueUpdated = (data) => {
      if (data.scheduleId === scheduleId) {
        fetchData();
      }
    };

    const handleInvitation = (data) => {
      console.log('Received invitation via socket:', data);
      if (data.scheduleId === scheduleId) {
        setInvitation(data);
        
        // Also trigger notification via service worker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'DOCTOR_CALLING',
            doctorName: data.doctorName,
            callSessionId: data.callSessionId,
            scheduleId: data.scheduleId
          });
          console.log('[PatientScheduleView] Sent DOCTOR_CALLING to service worker via socket');
        }
      }
    };

    on('schedule_status_changed', handleScheduleStatusChanged);
    on('queue_updated', handleQueueUpdated);
    on('call_invitation', handleInvitation);

    return () => {
      off('schedule_status_changed', handleScheduleStatusChanged);
      off('queue_updated', handleQueueUpdated);
      off('call_invitation', handleInvitation);
    };
  }, [scheduleId, on, off, fetchData]);

  const handleJoinQueue = async () => {
    setJoining(true);
    try {
      await axios.post(
        `${API}/patient/schedules/${scheduleId}/join-queue`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Successfully joined the queue!');
      fetchData();
    } catch (error) {
      console.error('Failed to join queue:', error);
      toast.error(error.response?.data?.detail || 'Failed to join queue');
    } finally {
      setJoining(false);
    }
  };

  const handleToggleReady = async (checked) => {
    setToggling(true);
    try {
      await axios.post(
        `${API}/patient/schedules/${scheduleId}/toggle-ready`,
        { isReady: checked },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsReady(checked);
      if (checked) {
        toast.success('You are now READY! The doctor can start your consultation.');
      } else {
        toast.info('You are now NOT READY. Toggle back when you\'re available.');
      }
      fetchData();
    } catch (error) {
      console.error('Failed to toggle ready:', error);
      toast.error(error.response?.data?.detail || 'Failed to update status');
    } finally {
      setToggling(false);
    }
  };

  const handleConfirmCall = async () => {
    // Check if call was already handled by notification
    if (callHandledRef.current) {
      console.log('[PatientScheduleView] Call already handled by notification, skipping modal confirm');
      return;
    }
    if (!invitation) return;
    
    callHandledRef.current = true;
    console.log('[PatientScheduleView] Modal confirm - accepting call:', invitation.callSessionId);
    
    // Stop notification sound
    notificationService.stopSound();
    
    try {
      await axios.post(
        `${API}/patient/call-sessions/${invitation.callSessionId}/confirm`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Call confirmed! Joining...');
      const callId = invitation.callSessionId;
      setInvitation(null);
      navigate(`/call/${callId}`);
    } catch (error) {
      console.error('Failed to confirm call:', error);
      toast.error(error.response?.data?.detail || 'Failed to confirm call');
      callHandledRef.current = false;
    }
  };

  const handleDeclineCall = async () => {
    // Check if call was already handled by notification
    if (callHandledRef.current) {
      console.log('[PatientScheduleView] Call already handled by notification, skipping modal decline');
      return;
    }
    if (!invitation) return;
    
    callHandledRef.current = true;
    console.log('[PatientScheduleView] Modal decline - declining call:', invitation.callSessionId);
    
    // Stop notification sound
    notificationService.stopSound();
    
    try {
      await axios.post(
        `${API}/patient/call-sessions/${invitation.callSessionId}/decline`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.info('Call declined');
      setInvitation(null);
      fetchData();
    } catch (error) {
      console.error('Failed to decline call:', error);
      toast.error(error.response?.data?.detail || 'Failed to decline call');
    }
    callHandledRef.current = false;
  };

  if (loading || autoAccepting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20" />
          <p className="text-slate-500">
            {autoAccepting ? 'Joining call...' : 'Loading consultation...'}
          </p>
        </div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">Schedule Not Found</h3>
            <p className="text-slate-500 mt-2">This consultation schedule doesn't exist.</p>
            <Button 
              className="mt-4"
              onClick={() => navigate('/patient/consultation')}
              data-testid="back-btn"
            >
              Back to Consultations
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Invitation Modal */}
      {invitation && (
        <InvitationModal
          doctorName={invitation.doctorName}
          onConfirm={handleConfirmCall}
          onDecline={handleDeclineCall}
        />
      )}

      {/* Navigation */}
      <nav className="nav-glass sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/patient/consultation')}
              data-testid="back-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="text-sm text-slate-600">{connected ? 'Live' : 'Connecting...'}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Doctor Card */}
        <Card className={`mb-6 ${schedule.status === 'ONLINE' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center">
                <UserCircle className="w-10 h-10 text-sky-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {schedule.doctorName}
                </h2>
                <p className="text-slate-600">General Practitioner</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {schedule.date}
                  </span>
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {schedule.startTime} - {schedule.endTime}
                  </span>
                </div>
              </div>
              <div>
                {schedule.status === 'ONLINE' ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 flex items-center gap-1 text-sm px-3 py-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </Badge>
                ) : schedule.status === 'COMPLETED' ? (
                  <Badge className="bg-slate-100 text-slate-600 border-slate-200">Completed</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">Upcoming</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Queue Status */}
        {!queueEntry ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Users className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700">Join the Queue</h3>
              <p className="text-slate-500 mt-2 mb-4">
                {totalInQueue > 0 
                  ? `${totalInQueue} patient(s) currently in queue` 
                  : 'Be the first to join the queue'}
              </p>
              <Button 
                className="bg-sky-500 hover:bg-sky-600"
                onClick={handleJoinQueue}
                disabled={joining || schedule.status === 'COMPLETED'}
                data-testid="join-queue-btn"
              >
                {joining ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Users className="w-4 h-4 mr-2" />
                )}
                Join Queue
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Queue Position Card */}
            <Card className="mb-6 bg-gradient-to-r from-sky-50 to-white border-sky-100">
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-sky-600 font-medium">Your Queue Number</p>
                    <p className="text-5xl font-bold text-sky-500 mt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                      #{queueEntry.queueNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Total in Queue</p>
                    <p className="text-2xl font-semibold text-slate-700">{totalInQueue}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ready Toggle Card */}
            <Card className={`mb-6 transition-all ${isReady ? 'ring-2 ring-emerald-500' : ''}`}>
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      isReady ? 'bg-emerald-100' : 'bg-slate-100'
                    }`}>
                      {isReady ? (
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <Radio className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {isReady ? "You're Ready!" : "Set Yourself as Ready"}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {isReady 
                          ? "The doctor can now start your consultation" 
                          : "Toggle to let the doctor know you're available"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="ready-toggle" className={`text-sm font-medium ${isReady ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {isReady ? 'READY' : 'NOT READY'}
                    </Label>
                    <Switch
                      id="ready-toggle"
                      checked={isReady}
                      onCheckedChange={handleToggleReady}
                      disabled={toggling || queueEntry.status === 'DONE' || queueEntry.status === 'IN_CALL' || schedule.status !== 'ONLINE'}
                      data-testid="ready-toggle"
                    />
                  </div>
                </div>
                
                {queueEntry.status === 'DONE' && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Your consultation has been completed
                    </p>
                  </div>
                )}
                
                {schedule.status !== 'ONLINE' && queueEntry.status !== 'DONE' && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg">
                    <p className="text-sm text-amber-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Waiting for doctor to start the practice session
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card className={notificationsEnabled ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {notificationsEnabled ? (
                      <Bell className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-amber-600" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${notificationsEnabled ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {notificationsEnabled ? 'Notifications Enabled' : 'Enable Notifications'}
                      </p>
                      <p className={`text-xs ${notificationsEnabled ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {notificationsEnabled 
                          ? 'Tap notification to answer call even when browser is minimized'
                          : 'Get notified when doctor calls you'}
                      </p>
                    </div>
                  </div>
                  {!notificationsEnabled && (
                    <Button 
                      size="sm" 
                      onClick={enableNotifications}
                      className="bg-amber-500 hover:bg-amber-600"
                      data-testid="enable-notifications-btn"
                    >
                      <Bell className="w-4 h-4 mr-2" />
                      Enable
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Info about notifications */}
            <Card className="bg-sky-50 border-sky-200 mt-4">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-sky-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-sky-800">
                      How Notifications Work
                    </p>
                    <ul className="text-xs text-sky-600 mt-1 space-y-1 list-disc list-inside">
                      <li><strong>Tab open:</strong> You'll hear a ringtone + see popup</li>
                      <li><strong>Tab minimized:</strong> You'll get a notification - tap "Answer Call" to join</li>
                      <li><strong>Browser closed:</strong> Enable notifications to receive alerts</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default PatientScheduleView;
