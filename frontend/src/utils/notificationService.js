// Notification utility for MedConsult PWA

// Classic phone ringtone - longer audio for continuous ring
const RINGTONE_URL = 'https://assets.mixkit.co/active_storage/sfx/1361/1361-preview.mp3';

class NotificationService {
  constructor() {
    this.swRegistration = null;
    this.ringtone = null;
    this.isRinging = false;
    this.vibrateInterval = null;
  }

  // Initialize the notification service
  async init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.register('/sw.js');
        console.log('[Notification] Service worker registered:', this.swRegistration);
        
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
      } catch (error) {
        console.error('[Notification] Service worker registration failed:', error);
      }
    }

    // Preload ringtone
    this.preloadRingtone();

    return this;
  }

  // Preload the ringtone sound
  preloadRingtone() {
    this.ringtone = new Audio(RINGTONE_URL);
    this.ringtone.preload = 'auto';
    this.ringtone.volume = 1.0;
    this.ringtone.loop = true; // Enable looping for continuous ring
  }

  // Request notification permission
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('[Notification] This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  // Check if notifications are supported and permitted
  isSupported() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  // Start playing ringtone (loops continuously)
  async startRingtone() {
    if (this.isRinging) return true;
    
    try {
      if (this.ringtone) {
        this.ringtone.currentTime = 0;
        this.ringtone.loop = true;
        await this.ringtone.play();
        this.isRinging = true;
        console.log('[Notification] Ringtone started');
        
        // Also vibrate continuously on mobile
        if ('vibrate' in navigator) {
          // Vibrate pattern: ring for 1s, pause 0.5s, repeat
          this.vibrateInterval = setInterval(() => {
            navigator.vibrate([1000, 500]);
          }, 1500);
        }
        
        return true;
      }
    } catch (error) {
      console.warn('[Notification] Could not play ringtone:', error);
      // Try to play on user interaction
      return false;
    }
  }

  // Stop ringtone
  stopSound() {
    console.log('[Notification] Stopping ringtone');
    this.isRinging = false;
    
    if (this.ringtone) {
      this.ringtone.pause();
      this.ringtone.currentTime = 0;
    }
    
    if (this.vibrateInterval) {
      clearInterval(this.vibrateInterval);
      this.vibrateInterval = null;
    }
    
    // Stop vibration
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  }

  // Show a notification for doctor calling with ringtone
  async showDoctorCallingNotification(doctorName, callSessionId, scheduleId) {
    // Start ringtone first
    const ringtoneStarted = await this.startRingtone();
    
    if (!ringtoneStarted) {
      console.log('[Notification] Ringtone autoplay blocked - will play on interaction');
    }

    // Request permission if needed
    const hasPermission = await this.requestPermission();

    if (hasPermission && this.swRegistration) {
      // Use service worker to show notification (works in background)
      this.swRegistration.active?.postMessage({
        type: 'DOCTOR_CALLING',
        doctorName,
        callSessionId,
        scheduleId
      });
    } else if (hasPermission) {
      // Fallback to regular notification
      const notification = new Notification('📞 Incoming Call', {
        body: `${doctorName || 'Doctor'} is calling...`,
        icon: '/icon-192.png',
        tag: 'doctor-call-' + callSessionId,
        requireInteraction: true,
        silent: true // We handle sound ourselves
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  // Show a generic notification
  async showNotification(title, body, options = {}) {
    const hasPermission = await this.requestPermission();

    if (hasPermission) {
      if (this.swRegistration?.active) {
        this.swRegistration.active.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          body,
          data: options.data || {}
        });
      } else {
        new Notification(title, {
          body,
          icon: '/icon-192.png',
          ...options
        });
      }
    }
  }

  // Handle messages from service worker
  handleServiceWorkerMessage(event) {
    console.log('[Notification] Message from SW:', event.data);
    
    if (event.data?.type === 'NOTIFICATION_CLICKED') {
      // Dispatch custom event for the app to handle
      window.dispatchEvent(new CustomEvent('notificationAction', {
        detail: event.data
      }));
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService();

export default notificationService;
