/* Conexión con la planilla: manda pedidos a la implementación de Apps Script y guarda la configuración del celular. */
var Api = (function () {
  var CLAVE_CONEXION = 'gastos.conexion';
  var TIEMPO_MAX_MS = 30000;
  var conexion = null;
  var api = { onClaveInvalida: null };

  try {
    var guardada = localStorage.getItem(CLAVE_CONEXION);
    conexion = guardada ? JSON.parse(guardada) : null;
  } catch (e) {
    conexion = null;
  }

  api.configurado = function () {
    return !!(conexion && conexion.u && conexion.k);
  };

  api.guardar = function (c) {
    conexion = { u: c.u, k: c.k };
    try { localStorage.setItem(CLAVE_CONEXION, JSON.stringify(conexion)); } catch (e) {}
  };

  api.borrar = function () {
    conexion = null;
    try { localStorage.removeItem(CLAVE_CONEXION); } catch (e) {}
  };

  /** "GASTOS1.xxxx" → { u, k }. Devuelve null si el texto no tiene el formato. */
  api.decodificar = function (texto) {
    var m = String(texto || '').replace(/\s+/g, '').match(/^GASTOS1\.([A-Za-z0-9_\-=]+)$/);
    if (!m) return null;
    try {
      var b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var obj = JSON.parse(atob(b64));
      if (!obj || !obj.k) return null;
      return { u: String(obj.u || ''), k: String(obj.k) };
    } catch (e) {
      return null;
    }
  };

  /**
   * Hace un pedido a la implementación indicada. Resuelve con los datos o rechaza con un Error
   * que puede traer: sinConexion (no hubo respuesta) o codigo ('clave', 'respuesta', 'error'...).
   */
  api.llamarCon = function (c, accion, datos) {
    var cuerpo = { k: c.k, accion: accion };
    if (datos) Object.keys(datos).forEach(function (n) { cuerpo[n] = datos[n]; });

    var control = typeof AbortController === 'function' ? new AbortController() : null;
    var reloj = control ? setTimeout(function () { control.abort(); }, TIEMPO_MAX_MS) : null;

    return fetch(c.u, {
      method: 'POST',
      // text/plain evita la consulta previa (preflight) que Apps Script no contesta
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
      redirect: 'follow',
      signal: control ? control.signal : undefined
    }).then(function (r) {
      return r.text();
    }, function () {
      clearTimeout(reloj);
      var e = new Error('Sin conexión');
      e.sinConexion = true;
      throw e;
    }).then(function (texto) {
      clearTimeout(reloj);
      var j;
      try {
        j = JSON.parse(texto);
      } catch (e) {
        var malo = new Error('Respuesta inesperada');
        malo.codigo = 'respuesta';
        throw malo;
      }
      if (!j.ok) {
        var err = new Error(j.error || 'Error');
        err.codigo = j.codigo;
        // Solo avisa si falló la conexión guardada; al probar un código nuevo, lo maneja quien lo probó
        if (j.codigo === 'clave' && c === conexion && api.onClaveInvalida) api.onClaveInvalida();
        throw err;
      }
      return j.datos;
    });
  };

  api.llamar = function (accion, datos) {
    if (!api.configurado()) {
      var e = new Error('Falta conectar la app');
      e.codigo = 'clave';
      return Promise.reject(e);
    }
    return api.llamarCon(conexion, accion, datos);
  };

  return api;
})();
