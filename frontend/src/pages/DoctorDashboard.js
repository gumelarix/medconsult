import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Stethoscope, Calendar, Clock, Users, Play, Square, LogOut, 
  CheckCircle, AlertCircle, RefreshCw 
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { connected } = useSocket();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`${API}/doctor/schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchedules(response.data);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      toast.error('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [token]);

  const handleStartPractice = async (scheduleId) => {
    setActionLoading(scheduleId);
    try {
      await axios.post(`${API}/doctor/schedules/${scheduleId}/start`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Practice started! Redirecting to practice room...');
      navigate(`/doctor/practice/${scheduleId}`);
    } catch (error) {
      console.error('Failed to start practice:', error);
      toast.error(error.response?.data?.detail || 'Failed to start practice');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndPractice = async (scheduleId) => {
    setActionLoading(scheduleId);
    try {
      await axios.post(`${API}/doctor/schedules/${scheduleId}/end`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Practice ended');
      fetchSchedules();
    } catch (error) {
      console.error('Failed to end practice:', error);
      toast.error(error.response?.data?.detail || 'Failed to end practice');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ONLINE':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Online</Badge>;
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
      {/* Navigation */}
      <nav className="nav-glass sticky top-0 z-50">
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
                <p className="text-xs text-slate-500">Doctor Portal</p>
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
              Online Practice Dashboard
            </h2>
            <p className="text-slate-600 mt-1">Manage your consultation schedules</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSchedules} data-testid="refresh-schedules">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

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
              <h3 className="text-lg font-semibold text-slate-700">No Schedules Found</h3>
              <p className="text-slate-500 mt-2">You don't have any consultation schedules yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {schedules.map((schedule) => (
              <Card 
                key={schedule.id} 
                className={`transition-all ${schedule.status === 'ONLINE' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                data-testid={`schedule-card-${schedule.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-sky-500" />
                        {schedule.date}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3" />
                        {schedule.startTime} - {schedule.endTime}
                      </CardDescription>
                    </div>
                    {getStatusBadge(schedule.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  {schedule.status === 'UPCOMING' && (
                    <Button 
                      className="w-full bg-sky-500 hover:bg-sky-600"
                      onClick={() => handleStartPractice(schedule.id)}
                      disabled={actionLoading === schedule.id}
                      data-testid={`start-practice-${schedule.id}`}
                    >
                      {actionLoading === schedule.id ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Start Practice
                    </Button>
                  )}
                  {schedule.status === 'ONLINE' && (
                    <div className="space-y-3">
                      <Button 
                        className="w-full bg-emerald-500 hover:bg-emerald-600"
                        onClick={() => navigate(`/doctor/practice/${schedule.id}`)}
                        data-testid={`enter-practice-${schedule.id}`}
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Enter Practice Room
                      </Button>
                      <Button 
                        variant="outline" 
                        className="w-full text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleEndPractice(schedule.id)}
                        disabled={actionLoading === schedule.id}
                        data-testid={`end-practice-${schedule.id}`}
                      >
                        {actionLoading === schedule.id ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Square className="w-4 h-4 mr-2" />
                        )}
                        End Practice
                      </Button>
                    </div>
                  )}
                  {schedule.status === 'COMPLETED' && (
                    <div className="flex items-center justify-center gap-2 text-slate-500 py-2">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">Practice Completed</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default DoctorDashboard;
