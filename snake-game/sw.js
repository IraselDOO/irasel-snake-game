const CACHE_NAME = 'neon-snake-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icon-512.png',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
