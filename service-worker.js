// Minimal service worker with no caching
const CACHE_NAME = "event-dashboard-no-cache";

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activate this version immediately
  console.log('Service worker installed - no caching active');
});

self.addEventListener("activate", (event) => {
  // Clear any existing caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log("Deleting cache:", cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log("All caches cleared - no caching active");
      return self.clients.claim();
    })
  );
});

// Fetch event - don't cache anything, always use network
self.addEventListener("fetch", (event) => {
  // Let the browser handle all requests normally
  // This disables any service worker caching
});

// Handle push notifications
self.addEventListener('push', function(event) {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: `assets/favicon.png`,
    badge: `assets/favicon.png`,
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
