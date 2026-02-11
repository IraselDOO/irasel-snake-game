const CACHE_NAME = 'neon-snake-v2.17.0';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icon-512.png',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(ASSETS);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter(name => name.startsWith('neon-snake-') && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith((async () => {
        try {
            const networkResponse = await fetch(event.request);

            if (event.request.url.startsWith(self.location.origin) && networkResponse.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(event.request, networkResponse.clone());
            }

            return networkResponse;
        } catch (error) {
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) return cachedResponse;

            if (event.request.mode === 'navigate') {
                const fallback = await caches.match('./index.html');
                if (fallback) return fallback;
            }

            throw error;
        }
    })());
});
