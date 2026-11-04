/* Service worker: deja la app lista aunque no haya señal y la actualiza sola al abrirla.
   Para publicar una versión nueva, cambiá VERSION (acá y en app.js). */
var VERSION = '1.0.0';
var CACHE = 'gastos-' + VERSION;
var ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'api.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icono.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ARCHIVOS.map(function (a) {
        return fetch(a, { cache: 'no-cache' }).then(function (r) { if (r.ok) return c.put(a, r); }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Primero la red (siempre la versión más nueva); si no hay señal, lo guardado.
// Solo archivos de la propia app: los pedidos a la planilla (POST a otro dominio) no se tocan.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (r) {
      if (r && r.ok) {
        var copia = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      return r;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      });
    })
  );
});
