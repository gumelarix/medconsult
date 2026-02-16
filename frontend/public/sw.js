// MedConsult Service Worker v3
const CACHE_NAME = 'medconsult-v3';

// Files to cache for offline support
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Store pending call data
let pendingCallData = null;

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v3...');
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
  console.log('[SW] Activating service worker v3...');
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

  // Check if there's pending call data to send to newly opened window
  if (event.data && event.data.type === 'CHECK_PENDING_CALL') {
    if (pendingCallData) {
      event.source.postMessage({
        type: 'PENDING_CALL_DATA',
        data: pendingCallData
      });
      pendingCallData = null; // Clear after sending
    }
  }
});

// Show doctor calling notification with action buttons
function showDoctorCallingNotification(doctorName, callSessionId, scheduleId) {
  console.log('[SW] Showing doctor calling notification');
  
  const title = '📞 Incoming Call';
  const options = {
    body: `${doctorName || 'Doctor'} is calling you.\nTap to answer the call.`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'doctor-call-' + callSessionId,
    requireInteraction: true,
    renotify: true,
    vibrate: [500, 200, 500, 200, 500, 200, 500],
    actions: [
      { 
        action: 'accept', 
        title: '✓ Answer',
        icon: '/icon-192.png'
      },
      { 
        action: 'decline', 
        title: '✗ Decline',
        icon: '/icon-192.png'
      }
    ],
    data: {
      callSessionId,
      scheduleId,
      doctorName,
      type: 'doctor_call',
      url: `/patient/schedule/${scheduleId}?acceptCall=${callSessionId}`
    }
  };
  
  // Store call data for when user opens the app
  pendingCallData = {
    callSessionId,
    scheduleId,
    doctorName,
    action: 'pending'
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
  console.log('[SW] Notification clicked, action:', event.action);
  
  const data = event.notification.data || {};
  event.notification.close();
  
  // Handle doctor call notification
  if (data.type === 'doctor_call') {
    const { callSessionId, scheduleId, doctorName } = data;
    
    if (event.action === 'decline') {
      // User clicked Decline button
      console.log('[SW] User declined call via notification');
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            // Notify any open windows about the decline
            for (const client of clientList) {
              client.postMessage({
                type: 'NOTIFICATION_ACTION',
                action: 'decline',
                callSessionId,
                scheduleId
              });
            }
            // Clear pending call
            pendingCallData = null;
          })
      );
      return;
    }
    
    // User clicked Accept or clicked the notification body
    console.log('[SW] User accepted call via notification');
    
    // Store accept action
    pendingCallData = {
      callSessionId,
      scheduleId,
      doctorName,
      action: 'accept'
    };
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Try to find and focus an existing window
          for (const client of clientList) {
            if (client.url.includes(self.location.origin)) {
              // Send accept message to the window
              client.postMessage({
                type: 'NOTIFICATION_ACTION',
                action: 'accept',
                callSessionId,
                scheduleId,
                doctorName
              });
              return client.focus();
            }
          }
          
          // No existing window - open new one with accept parameter
          const acceptUrl = `/patient/schedule/${scheduleId}?acceptCall=${callSessionId}`;
          if (clients.openWindow) {
            return clients.openWindow(acceptUrl);
          }
        })
    );
  } else {
    // Generic notification - just open the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

// Handle notification close (user dismissed without action)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed without action');
  const data = event.notification.data || {};
  
  if (data.type === 'doctor_call') {
    // Notify windows that notification was dismissed
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          client.postMessage({
            type: 'NOTIFICATION_DISMISSED',
            callSessionId: data.callSessionId
          });
        }
      });
  }
});

console.log('[SW] Service worker v3 loaded');
