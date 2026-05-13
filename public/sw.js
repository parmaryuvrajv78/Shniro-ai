const CACHE_NAME = "shniro-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
];

// Install Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(() => {
        // Continue even if some resources fail to cache
        console.warn("Some resources failed to cache during install");
      });
    })
  );
  self.skipWaiting(); // Activate new service worker immediately
});

// Activate Service Worker - Clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Claim existing clients
});

// Fetch Strategy: Network First with Cache Fallback
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache on network failure
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || cacheNotFound();
        });
      })
  );
});

// Offline fallback page
function cacheNotFound() {
  return new Response(
    "Offline - Cached version not available",
    { status: 503, statusText: "Service Unavailable", headers: { "Content-Type": "text/plain" } }
  );
}

// Handle Notification Clicks
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  notification.close();

  if (event.action === "install" || event.notification.tag === "install-prompt") {
    // Trigger install via clients
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (let client of clientList) {
          client.postMessage({
            type: "INSTALL_PROMPT",
            action: "show"
          });
        }
      })
    );
  }
});

// Handle Notification Close
self.addEventListener("notificationclose", (event) => {
  console.log("Notification closed:", event.notification.tag);
});
