const CACHE_NAME = "hitoyasumi-v30";
const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((c) => c || fetch(event.request))
    );
});

let restTimeoutId = null;

self.addEventListener("message", (event) => {
    const { type, endTime } = event.data || {};
    if (type === "SCHEDULE_REST_END") {
        if (restTimeoutId) clearTimeout(restTimeoutId);
        const delay = endTime - Date.now();
        if (delay <= 0) {
            notifyRestEnd();
            return;
        }
        restTimeoutId = setTimeout(() => notifyRestEnd(), delay);
    }
});

async function notifyRestEnd() {
    const allClients = await self.clients.matchAll({ type: "window" });
    allClients.forEach((c) => c.postMessage({ type: "REST_END" }));

    await self.registration.showNotification("休憩おつかれさま 🌿", {
        body: "休憩時間が終わりました。",
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: "rest-end",
    });
}

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if (client.url.includes(self.location.origin)) return client.focus();
            }
            return self.clients.openWindow("./");
        })
    );
});