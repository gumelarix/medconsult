import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Stethoscope, Users, Mail, Lock, User } from 'lucide-react';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('PATIENT');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const user = await login(loginEmail, loginPassword);
      toast.success(`Welcome back, ${user.name}!`);
      
      if (user.role === 'DOCTOR') {
        navigate('/doctor/dashboard');
      } else {
        navigate('/patient/consultation');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const user = await register(regName, regEmail, regPassword, regRole);
      toast.success(`Welcome, ${user.name}!`);
      
      if (user.role === 'DOCTOR') {
        navigate('/doctor/dashboard');
      } else {
        navigate('/patient/consultation');
      }
    } catch (error) {
      console.error('Register error:', error);
      toast.error(error.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500 text-white mb-4">
            <Stethoscope className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            MedConsult
          </h1>
          <p className="text-slate-600 mt-2">Online Doctor Consultation Platform</p>
        </div>

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="pb-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-100">
                <TabsTrigger value="login" data-testid="login-tab">Login</TabsTrigger>
                <TabsTrigger value="register" data-testid="register-tab">Register</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          
          <CardContent>
            {activeTab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="login-email"
                      data-testid="login-email"
                      type="email"
                      placeholder="Enter your email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="login-password"
                      data-testid="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-sky-500 hover:bg-sky-600"
                  disabled={isLoading}
                  data-testid="login-submit"
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="reg-name"
                      data-testid="register-name"
                      type="text"
                      placeholder="Enter your name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="reg-email"
                      data-testid="register-email"
                      type="email"
                      placeholder="Enter your email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="reg-password"
                      data-testid="register-password"
                      type="password"
                      placeholder="Create a password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>I am a</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      data-testid="role-patient"
                      onClick={() => setRegRole('PATIENT')}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        regRole === 'PATIENT' 
                          ? 'border-sky-500 bg-sky-50 text-sky-700' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span className="font-medium">Patient</span>
                    </button>
                    <button
                      type="button"
                      data-testid="role-doctor"
                      onClick={() => setRegRole('DOCTOR')}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        regRole === 'DOCTOR' 
                          ? 'border-sky-500 bg-sky-50 text-sky-700' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Stethoscope className="w-4 h-4" />
                      <span className="font-medium">Doctor</span>
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-sky-500 hover:bg-sky-600"
                  disabled={isLoading}
                  data-testid="register-submit"
                >
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
