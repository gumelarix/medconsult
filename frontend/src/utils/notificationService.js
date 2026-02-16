// Notification utility for MedConsult PWA

const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

class NotificationService {
  constructor() {
    this.swRegistration = null;
    this.audioContext = null;
    this.notificationSound = null;
    this.soundEnabled = false;
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

    // Preload notification sound
    this.preloadSound();

    return this;
  }

  // Preload the notification sound
  preloadSound() {
    this.notificationSound = new Audio(NOTIFICATION_SOUND_URL);
    this.notificationSound.preload = 'auto';
    this.notificationSound.volume = 1.0;
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

  // Play notification sound
  async playSound() {
    try {
      if (this.notificationSound) {
        this.notificationSound.currentTime = 0;
        await this.notificationSound.play();
        this.soundEnabled = true;
        
        // Play sound 3 times with intervals
        let playCount = 0;
        const interval = setInterval(() => {
          playCount++;
          if (playCount < 3) {
            this.notificationSound.currentTime = 0;
            this.notificationSound.play().catch(() => {});
          } else {
            clearInterval(interval);
          }
        }, 2500);
        
        return true;
      }
    } catch (error) {
      console.warn('[Notification] Could not play sound:', error);
      return false;
    }
  }

  // Stop notification sound
  stopSound() {
    if (this.notificationSound) {
      this.notificationSound.pause();
      this.notificationSound.currentTime = 0;
    }
  }

  // Show a notification for doctor calling
  async showDoctorCallingNotification(doctorName, callSessionId, scheduleId) {
    // Play sound first
    await this.playSound();

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
      const notification = new Notification('📞 Doctor is Calling!', {
        body: `${doctorName || 'Your doctor'} is ready to start your consultation`,
        icon: '/icon-192.png',
        tag: 'doctor-call-' + callSessionId,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }

    // Also vibrate if supported
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200, 100, 200]);
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
