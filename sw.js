const CACHE_NAME = 'neon-snake-v2';
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
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Use individual adds to prevent one missing file from breaking the whole cache
            return Promise.allSettled(
                ASSETS.map(asset => cache.add(asset))
            );
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
