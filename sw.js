const CACHE_NAME = 'neon-snake-v2.17.1'; // Updated to match game version
const ASSETS = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'icon-192.png',
    'icon-512.png',
    'manifest.json'
];

self.addEventListener('install', event => {
    // Force this new service worker to become the active one, bypassing the "waiting" state
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.allSettled(
                ASSETS.map(asset => cache.add(asset))
            );
        })
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', event => {
    // Claim any clients immediately, so the page is controlled by this SW without a reload
    event.waitUntil(clients.claim());

    // Clean up old caches
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // Return cached response if found, else fetch from network
            return response || fetch(event.request).catch(() => {
                // Optional: Return a fallback page (not implemented here)
            });
        })
    );
});
