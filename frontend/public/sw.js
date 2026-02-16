// MedConsult Service Worker
const CACHE_NAME = 'medconsult-v1';
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

// Files to cache for offline support
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and API calls
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, data } = event.data;
    showNotification(title, body, data);
  }
  
  if (event.data && event.data.type === 'DOCTOR_CALLING') {
    const { doctorName, callSessionId, scheduleId } = event.data;
    showDoctorCallingNotification(doctorName, callSessionId, scheduleId);
  }
});

// Show doctor calling notification
function showDoctorCallingNotification(doctorName, callSessionId, scheduleId) {
  const title = '📞 Doctor is Calling!';
  const options = {
    body: `${doctorName || 'Your doctor'} is ready to start your consultation`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'doctor-call-' + callSessionId,
    requireInteraction: true,
    renotify: true,
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    actions: [
      { action: 'accept', title: '✓ Accept Call' },
      { action: 'decline', title: '✗ Decline' }
    ],
    data: {
      callSessionId,
      scheduleId,
      url: `/patient/consultation/${scheduleId}`
    }
  };
  
  self.registration.showNotification(title, options);
}

// Show generic notification
function showNotification(title, body, data) {
  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'medconsult-notification',
    requireInteraction: false,
    data
  };
  
  self.registration.showNotification(title, options);
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  
  if (event.action === 'accept' || !event.action) {
    // Open or focus the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Try to focus an existing window
          for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              client.focus();
              // Send message to accept the call
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                action: 'accept',
                data
              });
              return;
            }
          }
          // No existing window, open a new one
          if (clients.openWindow) {
            const url = data.url || '/patient/consultation';
            return clients.openWindow(url);
          }
        })
    );
  } else if (event.action === 'decline') {
    // Send decline message to the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              action: 'decline',
              data
            });
          }
        })
    );
  }
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});

console.log('[SW] Service worker loaded');
