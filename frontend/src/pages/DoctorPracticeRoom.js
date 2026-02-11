import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Stethoscope, Calendar, Clock, Users, Play, Square, ArrowLeft,
  CheckCircle, AlertCircle, RefreshCw, Phone, UserCheck, UserX,
  Loader2
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DoctorPracticeRoom = () => {
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { connected, joinSchedule, leaveSchedule, on, off } = useSocket();
  
  const [schedule, setSchedule] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [waitingForConfirm, setWaitingForConfirm] = useState(null);
  const pollIntervalRef = useRef(null);

  const fetchScheduleAndQueue = useCallback(async () => {
    try {
      const [scheduleRes, queueRes] = await Promise.all([
        axios.get(`${API}/doctor/schedules`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/doctor/schedules/${scheduleId}/queue`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      const currentSchedule = scheduleRes.data.find(s => s.id === scheduleId);
      if (currentSchedule) {
        setSchedule(currentSchedule);
      }
      setQueue(queueRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load practice room data');
    } finally {
      setLoading(false);
    }
  }, [scheduleId, token]);

  // Poll for call session status when waiting for confirmation
  const checkCallSessionStatus = useCallback(async (callSessionId) => {
    if (!callSessionId || !token) return;
    
    try {
      const response = await axios.get(`${API}/doctor/call-sessions/${callSessionId}/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const { status } = response.data;
      console.log('Call session status:', status);
      
      if (status === 'CONFIRMED' || status === 'ACTIVE') {
        toast.success('Patient confirmed! Joining call room...');
        setWaitingForConfirm(null);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        navigate(`/call/${callSessionId}`);
      } else if (status === 'DECLINED') {
        toast.warning('Patient declined the call');
        setWaitingForConfirm(null);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        fetchScheduleAndQueue();
      } else if (status === 'EXPIRED' || status === 'ENDED') {
        toast.info('Call invitation expired');
        setWaitingForConfirm(null);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        fetchScheduleAndQueue();
      }
    } catch (error) {
      console.error('Failed to check call status:', error);
    }
  }, [token, navigate, fetchScheduleAndQueue]);

  useEffect(() => {
    fetchScheduleAndQueue();
    joinSchedule(scheduleId);

    return () => {
      leaveSchedule(scheduleId);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [scheduleId, fetchScheduleAndQueue, joinSchedule, leaveSchedule]);

  // Start polling when waiting for confirmation
  useEffect(() => {
    if (waitingForConfirm) {
      // Poll every 1.5 seconds
      pollIntervalRef.current = setInterval(() => {
        checkCallSessionStatus(waitingForConfirm);
      }, 1500);
      
      // Also check immediately
      checkCallSessionStatus(waitingForConfirm);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [waitingForConfirm, checkCallSessionStatus]);

  // Socket event handlers (backup - polling is primary now)
  useEffect(() => {
    const handleQueueUpdate = (data) => {
      if (data.scheduleId === scheduleId) {
        fetchScheduleAndQueue();
      }
    };

    const handleCallConfirmed = (data) => {
      toast.success('Patient confirmed! Joining call room...');
      setWaitingForConfirm(null);
      navigate(`/call/${data.callSessionId}`);
    };

    const handleCallDeclined = (data) => {
      toast.warning('Patient declined the call');
      setWaitingForConfirm(null);
      fetchScheduleAndQueue();
    };

    on('queue_updated', handleQueueUpdate);
    on('call_confirmed', handleCallConfirmed);
    on('call_declined', handleCallDeclined);

    return () => {
      off('queue_updated', handleQueueUpdate);
      off('call_confirmed', handleCallConfirmed);
      off('call_declined', handleCallDeclined);
    };
  }, [scheduleId, on, off, navigate, fetchScheduleAndQueue]);

  const handleStartCall = async (patientId) => {
    setActionLoading(patientId);
    try {
      const response = await axios.post(
        `${API}/doctor/schedules/${scheduleId}/start-call`,
        { patientId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.info('Invitation sent to patient. Waiting for confirmation...');
      setWaitingForConfirm(response.data.callSessionId);
    } catch (error) {
      console.error('Failed to start call:', error);
      toast.error(error.response?.data?.detail || 'Failed to invite patient');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPatient = async (patientId) => {
    setActionLoading(patientId);
    try {
      await axios.post(
        `${API}/doctor/schedules/${scheduleId}/reset-patient/${patientId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Patient can now rejoin the consultation');
      fetchScheduleAndQueue();
    } catch (error) {
      console.error('Failed to reset patient:', error);
      toast.error(error.response?.data?.detail || 'Failed to reset patient');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndPractice = async () => {
    try {
      await axios.post(`${API}/doctor/schedules/${scheduleId}/end`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Practice ended');
      navigate('/doctor/dashboard');
    } catch (error) {
      console.error('Failed to end practice:', error);
      toast.error(error.response?.data?.detail || 'Failed to end practice');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'READY':
        return <Badge className="bg-emerald-100 text-emerald-700">Ready</Badge>;
      case 'IN_CALL':
        return <Badge className="bg-blue-100 text-blue-700">In Call</Badge>;
      case 'DONE':
        return <Badge className="bg-slate-100 text-slate-600">Done</Badge>;
      default:
        return <Badge className="bg-amber-100 text-amber-700">Waiting</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20" />
          <p className="text-slate-500">Loading practice room...</p>
        </div>
      </div>
    );
  }

  if (!schedule || schedule.status !== 'ONLINE') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">Practice Not Available</h3>
            <p className="text-slate-500 mt-2">This practice session is not currently online.</p>
            <Button 
              className="mt-4"
              onClick={() => navigate('/doctor/dashboard')}
              data-testid="back-to-dashboard"
            >
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="nav-glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/doctor/dashboard')}
                data-testid="back-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <h1 className="font-semibold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  Practice Room
                </h1>
                <p className="text-xs text-slate-500">Managing consultations</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 pulse-online' : 'bg-slate-300'}`} />
                <span className="text-sm text-emerald-600 font-medium">Practice Online</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleEndPractice}
                data-testid="end-practice-btn"
              >
                <Square className="w-4 h-4 mr-2" />
                End Practice
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Schedule Info */}
        <Card className="mb-6 bg-gradient-to-r from-sky-50 to-white border-sky-100">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500 text-white flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">{schedule.date}</h2>
                  <p className="text-slate-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {schedule.startTime} - {schedule.endTime}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{queue.length} patients in queue</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patient Queue */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-sky-500" />
                  Patient Queue
                </CardTitle>
                <CardDescription>Click "Start" when patient is Ready to begin consultation</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchScheduleAndQueue} data-testid="refresh-queue">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-600">No Patients in Queue</h3>
                <p className="text-slate-500 mt-1">Patients will appear here when they join the queue</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {queue.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        entry.status === 'READY' 
                          ? 'bg-emerald-50 border-emerald-200' 
                          : entry.status === 'IN_CALL'
                          ? 'bg-blue-50 border-blue-200'
                          : entry.status === 'DONE'
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200'
                      }`}
                      data-testid={`queue-entry-${entry.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="queue-number">
                          {entry.queueNumber}
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900">{entry.patientName}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(entry.status)}
                            {entry.status === 'READY' && (
                              <span className="text-xs text-emerald-600 flex items-center gap-1">
                                <UserCheck className="w-3 h-3" />
                                Online & Ready
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {entry.status === 'READY' && !waitingForConfirm && (
                          <Button
                            className="bg-sky-500 hover:bg-sky-600"
                            onClick={() => handleStartCall(entry.patientId)}
                            disabled={actionLoading === entry.patientId}
                            data-testid={`start-call-${entry.patientId}`}
                          >
                            {actionLoading === entry.patientId ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Phone className="w-4 h-4 mr-2" />
                            )}
                            Start
                          </Button>
                        )}
                        {entry.status === 'DONE' && (
                          <span className="text-slate-500 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            Completed
                          </span>
                        )}
                        {entry.status === 'IN_CALL' && (
                          <span className="text-blue-600 flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            In Call
                          </span>
                        )}
                        {entry.status === 'WAITING' && (
                          <span className="text-slate-400 flex items-center gap-1">
                            <UserX className="w-4 h-4" />
                            Not Ready
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Waiting for Confirmation Modal */}
        {waitingForConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="max-w-md w-full mx-4">
              <CardContent className="pt-6 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-sky-500 animate-spin mb-4" />
                <h3 className="text-lg font-semibold text-slate-900">Waiting for Patient</h3>
                <p className="text-slate-600 mt-2">
                  Invitation sent. Waiting for patient to confirm...
                </p>
                <p className="text-sm text-slate-500 mt-4">
                  The patient has 30 seconds to respond
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default DoctorPracticeRoom;
