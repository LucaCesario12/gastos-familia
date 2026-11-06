/* Service worker: la app se abre al instante desde lo guardado en el celular, aunque no haya señal
   o los datos estén flojos. No espera a la red.
   Para publicar una versión nueva, cambiá VERSION acá y en app.js: el celular baja todo de nuevo
   y avisa "Hay una versión nueva". */
var VERSION = '1.1.1';
var CACHE = 'gastos-' + VERSION;
// Sin estos archivos la app no anda: si alguno falla, la instalación se cancela y se reintenta después
var ESENCIALES = ['./', 'index.html', 'estilos.css', 'api.js', 'app.js', 'manifest.webmanifest'];
// Íconos: si alguno falla no pasa nada
var EXTRAS = ['icons/icono.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

function bajar(cache, archivo) {
  // no-cache: pide siempre la última versión a GitHub, no una copia vieja del navegador
  return fetch(archivo, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('No se pudo bajar ' + archivo);
    return cache.put(archivo, r);
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      var esenciales = Promise.all(ESENCIALES.map(function (a) { return bajar(c, a); }));
      var extras = Promise.all(EXTRAS.map(function (a) { return bajar(c, a).catch(function () {}); }));
      return Promise.all([esenciales, extras]);
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

// Primero lo guardado (rápido, sin red); si algo no está, se pide a la red.
// Solo archivos de la propia app: los pedidos a la planilla (POST a otro dominio) no se tocan.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (c) {
      // ignoreSearch: "?sinsw" u otros parámetros no deben impedir encontrar la página guardada
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).catch(function () {
          return req.mode === 'navigate' ? c.match('index.html') : Response.error();
        });
      });
    })
  );
});
