import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import LoginPage from "./pages/LoginPage";
import DoctorDashboard from "./pages/DoctorDashboard";
import DoctorPracticeRoom from "./pages/DoctorPracticeRoom";
import PatientConsultation from "./pages/PatientConsultation";
import PatientScheduleView from "./pages/PatientScheduleView";
import CallRoom from "./pages/CallRoom";
import "@/App.css";

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20"></div>
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRole && user.role !== allowedRole) {
    const redirectPath = user.role === "DOCTOR" ? "/doctor/dashboard" : "/patient/consultation";
    return <Navigate to={redirectPath} replace />;
  }
  
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20"></div>
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (user) {
    const redirectPath = user.role === "DOCTOR" ? "/doctor/dashboard" : "/patient/consultation";
    return <Navigate to={redirectPath} replace />;
  }
  
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      } />
      
      <Route path="/doctor/dashboard" element={
        <ProtectedRoute allowedRole="DOCTOR">
          <DoctorDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/doctor/practice/:scheduleId" element={
        <ProtectedRoute allowedRole="DOCTOR">
          <DoctorPracticeRoom />
        </ProtectedRoute>
      } />
      
      <Route path="/patient/consultation" element={
        <ProtectedRoute allowedRole="PATIENT">
          <PatientConsultation />
        </ProtectedRoute>
      } />
      
      <Route path="/patient/consultation/:scheduleId" element={
        <ProtectedRoute allowedRole="PATIENT">
          <PatientScheduleView />
        </ProtectedRoute>
      } />
      
      <Route path="/call/:callSessionId" element={
        <ProtectedRoute>
          <CallRoom />
        </ProtectedRoute>
      } />
      
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
          <Toaster 
            position="top-right" 
            richColors 
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
