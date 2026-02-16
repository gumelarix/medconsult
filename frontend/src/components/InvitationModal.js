import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Phone, PhoneOff, AlertTriangle, Volume2 } from 'lucide-react';
import notificationService from '../utils/notificationService';

const InvitationModal = ({ doctorName, onConfirm, onDecline }) => {
  const [timeLeft, setTimeLeft] = useState(30);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSoundPrompt, setShowSoundPrompt] = useState(true);
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

  // Enable sound on user interaction (tap prompt)
  const enableSound = async () => {
    const started = await notificationService.startRingtone();
    if (started) {
      setSoundEnabled(true);
      setShowSoundPrompt(false);
      // Also start vibration on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    }
  };

  // Initialize timer and try autoplay
  useEffect(() => {
    // Try to start ringtone (may be blocked by browser)
    const tryStartRingtone = async () => {
      const started = await notificationService.startRingtone();
      if (started) {
        setSoundEnabled(true);
        setShowSoundPrompt(false);
        console.log('[InvitationModal] Ringtone started automatically');
      } else {
        console.log('[InvitationModal] Autoplay blocked, showing tap prompt');
        setShowSoundPrompt(true);
      }
    };
    
    // Small delay to ensure component is mounted
    setTimeout(tryStartRingtone, 100);
    
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
    
    // Vibrate pattern on mobile devices
    if ('vibrate' in navigator) {
      const vibratePattern = () => {
        navigator.vibrate([1000, 500, 1000, 500, 1000]);
      };
      vibratePattern();
      vibrateIntervalRef.current = setInterval(vibratePattern, 3500);
    }
    
    // Cleanup on unmount
    return () => {
      console.log('[InvitationModal] Cleanup - stopping sounds');
      if (timerRef.current) clearInterval(timerRef.current);
      if (vibrateIntervalRef.current) clearInterval(vibrateIntervalRef.current);
      stopAllSounds();
    };
  }, [onDecline]);

  // Handle confirm - stop ringtone then call parent handler
  const handleConfirm = () => {
    console.log('[InvitationModal] Confirm clicked - stopping sounds');
    stopAllSounds();
    if (timerRef.current) clearInterval(timerRef.current);
    onConfirm();
  };

  // Handle decline - stop ringtone then call parent handler
  const handleDecline = () => {
    console.log('[InvitationModal] Decline clicked - stopping sounds');
    stopAllSounds();
    if (timerRef.current) clearInterval(timerRef.current);
    onDecline();
  };

  return (
    <div className="invitation-overlay" data-testid="invitation-modal">
      {/* Sound prompt overlay */}
      {showSoundPrompt && (
        <div 
          className="absolute inset-0 bg-amber-500 flex items-center justify-center cursor-pointer z-10"
          onClick={enableSound}
        >
          <div className="text-center text-white animate-pulse">
            <Volume2 className="w-20 h-20 mx-auto mb-4" />
            <p className="text-2xl font-bold">TAP TO ENABLE SOUND</p>
            <p className="text-lg mt-2">Doctor is calling you!</p>
          </div>
        </div>
      )}
      
      {/* Main modal */}
      <Card className={`invitation-modal ${!showSoundPrompt ? 'shake-alert' : ''}`}>
        <CardContent className="pt-6">
          {/* Pulsing phone icon */}
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 pulse-online">
            <Phone className="w-10 h-10 text-emerald-600" />
          </div>
          
          <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Doctor is Ready
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
              className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
              onClick={handleDecline}
              data-testid="decline-call-btn"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              Decline
            </Button>
            <Button
              className="flex-1 bg-emerald-500 hover:bg-emerald-600"
              onClick={handleConfirm}
              data-testid="confirm-call-btn"
            >
              <Phone className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </div>
          
          {/* Warning if sound not enabled */}
          {!soundEnabled && !showSoundPrompt && (
            <div className="mt-4 p-2 bg-amber-50 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-xs text-amber-700">
                Sound notifications may be blocked
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InvitationModal;
