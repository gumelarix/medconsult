import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Phone, PhoneOff, AlertTriangle } from 'lucide-react';
import notificationService from '../utils/notificationService';

const InvitationModal = ({ doctorName, onConfirm, onDecline }) => {
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef(null);
  const vibrateIntervalRef = useRef(null);

  // Stop all sounds and vibration
  const stopAllSounds = () => {
    console.log('[InvitationModal] Stopping all sounds');
    notificationService.stopSound();
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
  };

  // Initialize timer and vibration
  useEffect(() => {
    console.log('[InvitationModal] Modal opened - starting countdown');
    
    // Countdown timer (30 seconds to respond)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-decline on timeout
          stopAllSounds();
          if (timerRef.current) clearInterval(timerRef.current);
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Vibrate pattern on mobile devices (continuous)
    if ('vibrate' in navigator) {
      const vibratePattern = () => {
        navigator.vibrate([500, 300, 500, 300, 500]);
      };
      vibratePattern();
      vibrateIntervalRef.current = setInterval(vibratePattern, 2000);
    }
    
    // Cleanup on unmount
    return () => {
      console.log('[InvitationModal] Cleanup - stopping sounds');
      if (timerRef.current) clearInterval(timerRef.current);
      if (vibrateIntervalRef.current) clearInterval(vibrateIntervalRef.current);
      stopAllSounds();
    };
  }, [onDecline]);

  // Handle confirm - stop sounds then call parent handler
  const handleConfirm = () => {
    console.log('[InvitationModal] Confirm clicked - stopping sounds');
    stopAllSounds();
    if (timerRef.current) clearInterval(timerRef.current);
    onConfirm();
  };

  // Handle decline - stop sounds then call parent handler
  const handleDecline = () => {
    console.log('[InvitationModal] Decline clicked - stopping sounds');
    stopAllSounds();
    if (timerRef.current) clearInterval(timerRef.current);
    onDecline();
  };

  return (
    <div className="invitation-overlay" data-testid="invitation-modal">
      {/* Main modal */}
      <Card className="invitation-modal shake-alert">
        <CardContent className="pt-6">
          {/* Pulsing phone icon */}
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 pulse-online">
            <Phone className="w-10 h-10 text-emerald-600" />
          </div>
          
          <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            📞 Incoming Call
          </h2>
          <p className="text-slate-600 mb-4">
            {doctorName || 'Your doctor'} is ready to start your consultation
          </p>
          
          {/* Countdown */}
          <div className={`mb-6 ${timeLeft <= 10 ? 'text-red-600 blink-alert' : 'text-slate-500'}`}>
            <p className="text-sm">
              Respond within <span className="font-bold text-lg">{timeLeft}s</span>
            </p>
          </div>
          
          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-red-200 text-red-600 hover:bg-red-50 h-12 text-base"
              onClick={handleDecline}
              data-testid="decline-call-btn"
            >
              <PhoneOff className="w-5 h-5 mr-2" />
              Decline
            </Button>
            <Button
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 h-12 text-base"
              onClick={handleConfirm}
              data-testid="confirm-call-btn"
            >
              <Phone className="w-5 h-5 mr-2" />
              Answer
            </Button>
          </div>
          
          {/* Note about notification */}
          <div className="mt-4 p-2 bg-sky-50 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-sky-600 flex-shrink-0" />
            <p className="text-xs text-sky-700">
              Check your notifications for more options
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InvitationModal;
