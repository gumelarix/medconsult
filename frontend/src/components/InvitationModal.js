import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Phone, PhoneOff, AlertTriangle, Volume2 } from 'lucide-react';

// Hospital chime notification sound URL
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

const InvitationModal = ({ doctorName, onConfirm, onDecline }) => {
  const [timeLeft, setTimeLeft] = useState(30);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSoundPrompt, setShowSoundPrompt] = useState(true);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const soundIntervalRef = useRef(null);

  // Play notification sound
  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log('Audio play failed:', err);
      });
    }
  };

  // Enable sound on user interaction
  const enableSound = () => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setSoundEnabled(true);
        setShowSoundPrompt(false);
        
        // Play sound repeatedly every 3 seconds for 10 seconds max
        let playCount = 0;
        soundIntervalRef.current = setInterval(() => {
          playCount++;
          if (playCount < 4) {
            playSound();
          } else {
            if (soundIntervalRef.current) {
              clearInterval(soundIntervalRef.current);
            }
          }
        }, 3000);
      }).catch(err => {
        console.log('Could not enable sound:', err);
      });
    }
  };

  // Initialize audio and timer
  useEffect(() => {
    // Create audio element
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 1;
    
    // Try to autoplay
    audioRef.current.play()
      .then(() => {
        setSoundEnabled(true);
        setShowSoundPrompt(false);
        
        // Play repeatedly
        let playCount = 0;
        soundIntervalRef.current = setInterval(() => {
          playCount++;
          if (playCount < 4) {
            playSound();
          } else {
            if (soundIntervalRef.current) {
              clearInterval(soundIntervalRef.current);
            }
          }
        }, 3000);
      })
      .catch(() => {
        // Autoplay blocked, show prompt
        setShowSoundPrompt(true);
      });
    
    // Countdown timer
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-decline on timeout
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (soundIntervalRef.current) clearInterval(soundIntervalRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [onDecline]);

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
              onClick={onDecline}
              data-testid="decline-call-btn"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              Decline
            </Button>
            <Button
              className="flex-1 bg-emerald-500 hover:bg-emerald-600"
              onClick={onConfirm}
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
