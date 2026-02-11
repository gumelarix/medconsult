import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Stethoscope, Calendar, Clock, Users, LogOut, 
  CheckCircle, AlertCircle, RefreshCw, UserCircle, Volume2
} from 'lucide-react';
import axios from 'axios';
import InvitationModal from '../components/InvitationModal';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PatientConsultation = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { connected, on, off } = useSocket();
  
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const pollIntervalRef = useRef(null);

  const fetchSchedules = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/patient/schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchedules(response.data);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      toast.error('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Poll for pending invitations (fallback for Socket.IO)
  const checkForInvitation = useCallback(async () => {
    if (!token || invitation) return;
    
    try {
      const response = await axios.get(`${API}/patient/pending-invitation`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.hasInvitation) {
        console.log('Found pending invitation via polling:', response.data);
        setInvitation(response.data);
      }
    } catch (error) {
      console.error('Failed to check invitation:', error);
    }
  }, [token, invitation]);

  useEffect(() => {
    fetchSchedules();
    
    // Start polling for invitations every 2 seconds
    pollIntervalRef.current = setInterval(() => {
      checkForInvitation();
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchSchedules, checkForInvitation]);

  // Socket event handlers (backup - polling is primary now)
  useEffect(() => {
    const handleInvitation = (data) => {
      console.log('Received invitation via socket:', data);
      setInvitation(data);
    };

    const handleScheduleStatusChanged = (data) => {
      fetchSchedules();
      if (data.status === 'ONLINE') {
        toast.info(`Dr. ${data.doctorName || 'Your doctor'} is now online!`);
      }
    };

    on('call_invitation', handleInvitation);
    on('schedule_status_changed', handleScheduleStatusChanged);

    return () => {
      off('call_invitation', handleInvitation);
      off('schedule_status_changed', handleScheduleStatusChanged);
    };
  }, [on, off, fetchSchedules]);

  const handleConfirmCall = async () => {
    if (!invitation) return;
    
    try {
      await axios.post(
        `${API}/patient/call-sessions/${invitation.callSessionId}/confirm`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Call confirmed! Joining...');
      setInvitation(null);
      navigate(`/call/${invitation.callSessionId}`);
    } catch (error) {
      console.error('Failed to confirm call:', error);
      toast.error(error.response?.data?.detail || 'Failed to confirm call');
    }
  };

  const handleDeclineCall = async () => {
    if (!invitation) return;
    
    try {
      await axios.post(
        `${API}/patient/call-sessions/${invitation.callSessionId}/decline`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.info('Call declined');
      setInvitation(null);
    } catch (error) {
      console.error('Failed to decline call:', error);
      toast.error(error.response?.data?.detail || 'Failed to decline call');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ONLINE':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </Badge>
        );
      case 'COMPLETED':
        return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Completed</Badge>;
      default:
        return <Badge className="bg-sky-100 text-sky-700 border-sky-200">Upcoming</Badge>;
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  MedConsult
                </h1>
                <p className="text-xs text-slate-500">Patient Portal</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="text-sm text-slate-600">{connected ? 'Connected' : 'Connecting...'}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-btn">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Available Consultations
            </h2>
            <p className="text-slate-600 mt-1">Select a schedule to join the consultation queue</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSchedules} data-testid="refresh-schedules">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Sound Permission Notice */}
        <Card className="mb-6 bg-amber-50 border-amber-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Sound Notifications Enabled</p>
                <p className="text-xs text-amber-600">
                  You'll receive loud audio alerts when the doctor is ready to see you. Make sure your volume is on.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedules Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="h-10 bg-slate-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Calendar className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700">No Consultations Available</h3>
              <p className="text-slate-500 mt-2">There are no doctor consultations scheduled at the moment.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {schedules.map((schedule) => (
              <Card 
                key={schedule.id} 
                className={`transition-all hover:shadow-lg cursor-pointer ${
                  schedule.status === 'ONLINE' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
                }`}
                onClick={() => navigate(`/patient/consultation/${schedule.id}`)}
                data-testid={`schedule-card-${schedule.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
                        <UserCircle className="w-6 h-6 text-sky-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{schedule.doctorName}</CardTitle>
                        <CardDescription>General Practitioner</CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(schedule.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">{schedule.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">{schedule.startTime} - {schedule.endTime}</span>
                    </div>
                  </div>
                  
                  <Button 
                    className={`w-full mt-4 ${
                      schedule.status === 'ONLINE' 
                        ? 'bg-emerald-500 hover:bg-emerald-600' 
                        : 'bg-sky-500 hover:bg-sky-600'
                    }`}
                    data-testid={`view-schedule-${schedule.id}`}
                  >
                    {schedule.status === 'ONLINE' ? 'Join Queue' : 'View Details'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PatientConsultation;
