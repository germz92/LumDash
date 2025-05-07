const CACHE_NAME = "event-dashboard-cache-v1";

// Determine base path for GitHub Pages compatibility
const location = self.location;
const basePath = location.pathname.replace(/\/service-worker\.js$/, '');

// Assets to cache
const urlsToCache = [
  `${basePath}/`,
  `${basePath}/index.html`,
  `${basePath}/dashboard.html`,
  `${basePath}/register.html`,
  `${basePath}/bottom-nav.html`,
  `${basePath}/offline.html`,
  `${basePath}/js/app.js`,
  `${basePath}/js/api.js`,
  `${basePath}/js/config.js`,
  `${basePath}/js/login.js`,
  `${basePath}/js/register.js`,
  `${basePath}/js/schedule.js`,
  `${basePath}/js/crew.js`,
  `${basePath}/js/gear.js`,
  `${basePath}/js/card-log.js`,
  `${basePath}/js/general.js`,
  `${basePath}/js/travel-accommodation.js`,
  `${basePath}/js/events.js`,
  `${basePath}/css/styles.css`,
  `${basePath}/css/login.css`,
  `${basePath}/css/schedule.css`,
  `${basePath}/css/crew.css`,
  `${basePath}/css/gear.css`,
  `${basePath}/css/card-log.css`,
  `${basePath}/css/events.css`,
  `${basePath}/assets/logo.png`,
  `${basePath}/assets/favicon.png`,
  `${basePath}/manifest.json`
];

// Install event - cache files
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activate this version immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache).catch(error => {
        console.error("Failed to cache all resources:", error);
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log("Service Worker activated, claiming clients");
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener("fetch", (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip API requests
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached response if found
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request)
        .then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response - one to return, one to cache
          const responseToCache = response.clone();

          // Cache new resources
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        })
        .catch(error => {
          console.error('Fetch failed:', error);
          
          // Return offline page for HTML requests
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match(`${basePath}/offline.html`);
          }
          
          // For other resources, just show the error
          return new Response('Network error happened', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});

// Handle push notifications
self.addEventListener('push', function(event) {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: `${basePath}/assets/favicon.png`,
    badge: `${basePath}/assets/favicon.png`,
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
