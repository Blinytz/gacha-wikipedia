// Service worker — hors-ligne complet.
// Stratégie : network-first avec repli cache pour tout GET même-origine.
// Tout ce qui est servi (shell, data/*.json, images) est mis en cache au vol,
// donc l'app reste 100% fonctionnelle hors-ligne après la première visite.

const CACHE = 'gacha-wikipedia-v1';

const COQUILLE = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/etat.js', './js/config.js', './js/donnees.js',
  './js/ui.js', './js/eclats.js', './js/carte.js', './js/paquets.js',
  './js/vente.js', './js/station.js', './js/station-m1.js',
  './js/station-m2.js', './js/station-m3.js', './js/ecran-paquets.js',
  './js/ecran-collection.js', './js/ecran-station.js', './js/ecran-reglages.js',
  './data/collections.json',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(COQUILLE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(
    // cache: 'no-cache' force la revalidation HTTP — évite de servir un module
    // JS périmé après une mise à jour (le repli hors-ligne reste le cache SW).
    fetch(req, { cache: 'no-cache' })
      .then(rep => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then(c => c.put(req, copie));
        }
        return rep;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(r => r || caches.match('./index.html')))
  );
});
