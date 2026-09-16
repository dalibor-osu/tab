const CACHE = 'default-page-v1';
const PRECACHE = ['./', './index.html', './about.html'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then(cache => Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {}))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }
    if (new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.open(CACHE).then(async cache => {
            const cached = await cache.match(request);
            const network = fetch(request)
                .then(response => {
                    if (response.ok && response.type === 'basic') {
                        cache.put(request, response.clone());
                    }
                    return response;
                })
                .catch(() => cached || Response.error());
            return cached || network;
        })
    );
});
