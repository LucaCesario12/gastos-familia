/**
 * Gastos – Web App mobile-first
 * Hoja "Gastos": Fecha(A) | Detalle(B) | Monto(C) | Categoria(D) | Quien(E) | ID(F)  (encabezados en fila 1)
 * Hoja "Config": Categorías en columna A (encabezado en A1)
 *                Personas en columna B (encabezado en B1)
 *                Grupo de cada categoría en columna C (encabezado en C1)
 * Hoja "Fijos":  Detalle(A) | Monto(B) | Categoria(C) | Día(D) | Quién(E) | Activo(F) | Último mes cargado(G) | Omitido(H)
 *
 * Dos formas de usar el script:
 *  - Pantalla vieja: doGet sirve Index.html (se apaga con la propiedad UI_VIEJA = no).
 *  - App instalable: doPost recibe JSON { k: clave, accion: ... } y contesta JSON (ver manejarApi_).
 *    La clave de la familia vive en las propiedades del script (CLAVE_FAMILIA); se crea con crearCodigoFamilia().
 */

var HOJA_GASTOS = 'Gastos';
var HOJA_CONFIG = 'Config';
var HOJA_FIJOS = 'Fijos';
var COL_ID = 6;
var PROP_CLAVE = 'CLAVE_FAMILIA'; // Propiedad del script con la clave que usa la app instalable
var URL_IMPLEMENTACION = ''; // Pegá acá la dirección /exec de la implementación (entre las comillas)
var COL_OMITIDO = 8; // Columna H de Fijos: mes ("aaaa-mm") en que se omitió un fijo de monto variable
// El botón dura 8 s en el celular; el servidor da 2 min de margen por la demora de red
var VENTANA_DESHACER_SEG = 120;
var MAX_SUGERENCIAS = 300;
var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
             'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function doGet() {
  // Cuando la familia ya usa la app instalable se puede apagar la pantalla vieja (propiedad UI_VIEJA = no)
  if (PropertiesService.getScriptProperties().getProperty('UI_VIEJA') === 'no') {
    return ContentService.createTextOutput('Esta dirección ya no tiene pantalla. Usá la app instalada.');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Gastos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- API para la app instalable ---------- */

/**
 * La app manda un POST con texto JSON: { k: clave, accion: 'datos' | 'mes' | 'guardar' | ..., ... }.
 * Siempre contesta JSON: { ok: true, datos: ... } o { ok: false, error: '...', codigo: '...' }.
 */
function doPost(e) {
  var cuerpo;
  try {
    cuerpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return respuestaJson_({ ok: false, error: 'Pedido inválido', codigo: 'pedido' });
  }
  return respuestaJson_(manejarApi_(cuerpo));
}

function respuestaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Reparte cada acción a la función que ya usa la pantalla vieja; los errores vuelven como { ok: false }. */
function manejarApi_(c) {
  c = c || {};
  if (!claveValida_(c.k)) return { ok: false, error: 'Clave incorrecta', codigo: 'clave' };
  try {
    var datos;
    switch (c.accion) {
      case 'ping': datos = { ok: true }; break;
      case 'datos': datos = getDatos(); break;
      case 'mes': datos = getResumenMes(c.anio, c.mes); break;
      case 'guardar': datos = guardarGasto(c.gasto); break;
      case 'deshacer': datos = deshacerGasto(c.id); break;
      case 'editar': datos = editarGasto(c.cambio); break;
      case 'borrar': datos = borrarGasto(c.pedido); break;
      case 'movimientos': datos = getMovimientosMes(c.anio, c.mes); break;
      case 'omitir': datos = omitirFijo(c.detalle); break;
      default: return { ok: false, error: 'Acción desconocida', codigo: 'accion' };
    }
    return { ok: true, datos: datos };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), codigo: 'error' };
  }
}

/** Compara toda la clave sin cortar en la primera diferencia, para no dar pistas. */
function claveValida_(k) {
  var real = PropertiesService.getScriptProperties().getProperty(PROP_CLAVE);
  k = String(k || '');
  if (!real || k.length !== real.length) return false;
  var dif = 0;
  for (var i = 0; i < real.length; i++) dif |= real.charCodeAt(i) ^ k.charCodeAt(i);
  return dif === 0;
}

function nuevaClave_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/**
 * Ejecutar UNA vez desde el editor, después de crear la implementación nueva.
 * Crea la clave de la familia (si no existe) y muestra en el registro el código para configurar cada celular.
 */
function crearCodigoFamilia() {
  var props = PropertiesService.getScriptProperties();
  var clave = props.getProperty(PROP_CLAVE);
  if (!clave) {
    clave = nuevaClave_();
    props.setProperty(PROP_CLAVE, clave);
  }
  // Desde el editor, getUrl() devuelve la dirección de prueba (/dev), que solo anda para vos.
  // Por eso se usa URL_IMPLEMENTACION: la dirección /exec de Implementar → Administrar implementaciones.
  var url = URL_IMPLEMENTACION || ScriptApp.getService().getUrl() || '';
  if (!/\/exec$/.test(url)) {
    console.log('ATENCIÓN: la dirección tiene que terminar en /exec. Pegala en URL_IMPLEMENTACION (arriba de todo) y volvé a ejecutar.');
  }
  var codigo = 'GASTOS1.' + Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, k: clave }));
  console.log('Dirección: ' + (url || '(no disponible)'));
  console.log('Clave: ' + clave);
  console.log('Código de la familia (copialo completo):');
  console.log(codigo);
  return codigo;
}

/** Cambia la clave: los celulares ya configurados dejan de funcionar hasta que se les cargue el código nuevo. */
function renovarClaveFamilia() {
  PropertiesService.getScriptProperties().setProperty(PROP_CLAVE, nuevaClave_());
  return crearCodigoFamilia();
}

/** Carga inicial y sync: categorías (con sus grupos) + personas + resumen en un solo request. */
function getDatos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = leerConfig_(ss);
  return {
    categorias: config.categorias,
    grupos: config.grupos,
    personas: config.personas,
    resumen: calcularResumen_(ss)
  };
}

/** Resumen de un mes ya transcurrido o del actual (mes: 0 = enero). */
function getResumenMes(anio, mes) {
  anio = Number(anio);
  mes = Number(mes);
  if (!(anio >= 2000 && anio <= 2100) || !(mes >= 0 && mes <= 11) || anio % 1 || mes % 1) {
    throw new Error('Mes inválido');
  }
  var hoy = new Date();
  if (anio > hoy.getFullYear() || (anio === hoy.getFullYear() && mes > hoy.getMonth())) {
    throw new Error('Ese mes todavía no llegó');
  }
  return calcularResumen_(SpreadsheetApp.getActiveSpreadsheet(), anio, mes);
}

/** Guarda un gasto y devuelve el resumen recalculado en la misma respuesta. */
function guardarGasto(gasto) {
  gasto = gasto || {};
  var monto = parsearMonto_(gasto.monto);
  if (!(monto > 0)) throw new Error('Monto inválido');

  var categoria = String(gasto.categoria || '').trim();
  if (!categoria) throw new Error('Elegí una categoría');

  var detalle = String(gasto.detalle || '').trim().slice(0, 200);
  var quien = String(gasto.quien || '').trim().slice(0, 60);
  var id = normalizarId_(gasto.id) || Utilities.getUuid();
  var fecha = fechaDelGasto_(gasto.fecha);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('La hoja está ocupada, reintentá');

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJA_GASTOS);
    if (!hoja) throw new Error('No existe la hoja "' + HOJA_GASTOS + '"');

    // Reintento de un gasto que ya se guardó (p. ej. se perdió la respuesta): no se duplica
    if (buscarFilaPorId_(hoja, id) > 0) {
      return { ok: true, id: id, duplicado: true, resumen: calcularResumen_(ss) };
    }

    hoja.getRange(hoja.getLastRow() + 1, 1, 1, COL_ID)
        .setValues([[fecha, detalle, monto, categoria, quien, id]]);
    SpreadsheetApp.flush();
    marcarDeshacible_(id);

    return { ok: true, id: id, duplicado: false, resumen: calcularResumen_(ss) };
  } finally {
    lock.releaseLock();
  }
}

/** Borra un gasto recién guardado. Solo lo puede pedir el celular que conoce su ID. */
function deshacerGasto(id) {
  id = normalizarId_(id);
  if (!id) throw new Error('ID inválido');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('La hoja está ocupada, reintentá');

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJA_GASTOS);
    var fila = hoja ? buscarFilaPorId_(hoja, id) : -1;
    if (fila < 2) throw new Error('Ese gasto ya no existe');

    if (!esDeshacible_(id, hoja, fila)) throw new Error('Ya pasó el tiempo para deshacer');

    hoja.deleteRow(fila);
    SpreadsheetApp.flush();
    olvidarDeshacible_(id);

    return { ok: true, resumen: calcularResumen_(ss) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Editar y borrar ---------- */

/**
 * Corrige monto, detalle, categoría y fecha de un gasto. Quién e ID no cambian.
 * Solo lo puede hacer quien lo cargó (los fijos automáticos, cualquiera).
 * Devuelve el resumen actual, el del mes que se estaba mirando y sus movimientos.
 */
function editarGasto(cambio) {
  cambio = cambio || {};
  var id = normalizarId_(cambio.id);
  if (!id) throw new Error('Ese gasto no se puede editar');
  var monto = parsearMonto_(cambio.monto);
  if (!(monto > 0)) throw new Error('Monto inválido');
  var categoria = String(cambio.categoria || '').trim();
  if (!categoria) throw new Error('Elegí una categoría');
  var detalle = String(cambio.detalle || '').trim().slice(0, 200);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('La hoja está ocupada, reintentá');

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJA_GASTOS);
    var fila = hoja ? buscarFilaPorId_(hoja, id) : -1;
    if (fila < 2) throw new Error('Ese gasto ya no existe');

    var actual = hoja.getRange(fila, 1, 1, COL_ID).getValues()[0];
    verificarAutor_(actual[4], cambio.quien);
    var fecha = fechaEditada_(actual[0], cambio.fecha);

    hoja.getRange(fila, 1, 1, 4).setValues([[fecha, detalle, monto, categoria]]);
    SpreadsheetApp.flush();
    return resumenesTrasCambio_(ss, cambio.anio, cambio.mes);
  } finally {
    lock.releaseLock();
  }
}

/** Borra un gasto. Solo lo puede hacer quien lo cargó (los fijos automáticos, cualquiera). */
function borrarGasto(pedido) {
  pedido = pedido || {};
  var id = normalizarId_(pedido.id);
  if (!id) throw new Error('Ese gasto no se puede editar');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('La hoja está ocupada, reintentá');

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJA_GASTOS);
    var fila = hoja ? buscarFilaPorId_(hoja, id) : -1;
    if (fila < 2) throw new Error('Ese gasto ya no existe');

    verificarAutor_(hoja.getRange(fila, 5).getValue(), pedido.quien);
    hoja.deleteRow(fila);
    SpreadsheetApp.flush();
    olvidarDeshacible_(id);
    return resumenesTrasCambio_(ss, pedido.anio, pedido.mes);
  } finally {
    lock.releaseLock();
  }
}

/** Todos los movimientos de un mes (más nuevos primero), para la lista "Ver todos". */
function getMovimientosMes(anio, mes) {
  anio = Number(anio);
  mes = Number(mes);
  if (!(anio >= 2000 && anio <= 2100) || !(mes >= 0 && mes <= 11) || anio % 1 || mes % 1) {
    throw new Error('Mes inválido');
  }
  return movimientosDelMes_(SpreadsheetApp.getActiveSpreadsheet(), anio, mes);
}

/** Lanza un error si quien pide el cambio no es quien cargó el gasto. */
function verificarAutor_(quienFila, quienPide) {
  var autor = String(quienFila || '').trim();
  if (!autor || autor === 'Automático') return;
  if (normalizarTexto_(autor) !== normalizarTexto_(quienPide)) {
    throw new Error('Solo ' + autor + ' puede cambiar este gasto');
  }
}

/** Si la fecha no cambió, se conserva la original (con su hora); si cambió, se valida como al cargar. */
function fechaEditada_(original, texto) {
  var fechaOriginal = aFecha_(original);
  if (!texto) return original;
  if (fechaOriginal && Utilities.formatDate(fechaOriginal, Session.getScriptTimeZone(), 'yyyy-MM-dd') === texto) {
    return original;
  }
  return fechaDelGasto_(texto);
}

/** Respuesta común de editar y borrar: resumen actual, el del mes mirado (si es pasado) y sus movimientos. */
function resumenesTrasCambio_(ss, anio, mes) {
  var hoy = new Date();
  anio = Number(anio);
  mes = Number(mes);
  if (!(anio >= 2000) || !(mes >= 0 && mes <= 11)) {
    anio = hoy.getFullYear();
    mes = hoy.getMonth();
  }
  var esActual = anio === hoy.getFullYear() && mes === hoy.getMonth();
  return {
    ok: true,
    resumen: calcularResumen_(ss),
    resumenMes: esActual ? null : calcularResumen_(ss, anio, mes),
    movimientos: movimientosDelMes_(ss, anio, mes)
  };
}

function movimientosDelMes_(ss, anio, mes) {
  var hoja = ss.getSheetByName(HOJA_GASTOS);
  var ultima = hoja ? hoja.getLastRow() : 0;
  var filas = ultima > 1 ? hoja.getRange(2, 1, ultima - 1, COL_ID).getValues() : [];
  var tz = Session.getScriptTimeZone();
  var lista = [];
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var fecha = aFecha_(f[0]);
    var monto = parsearMonto_(f[2]);
    if (!fecha || !monto || fecha.getFullYear() !== anio || fecha.getMonth() !== mes) continue;
    lista.push({ t: fecha.getTime(), i: i, fecha: fecha, detalle: String(f[1] || '').trim(),
      categoria: String(f[3] || '').trim() || 'Sin categoría', quien: String(f[4] || '').trim(),
      id: String(f[5] || '').trim(), monto: monto });
  }
  lista.sort(function (a, b) { return (b.t - a.t) || (b.i - a.i); });
  return lista.map(function (m) { return movimientoParaApp_(m, tz); });
}

/** Lo que la app necesita de cada movimiento para listarlo y editarlo. */
function movimientoParaApp_(m, tz) {
  return {
    id: m.id,
    detalle: m.detalle,
    categoria: m.categoria,
    quien: m.quien,
    fecha: Utilities.formatDate(m.fecha, tz, 'dd/MM'),
    fechaISO: Utilities.formatDate(m.fecha, tz, 'yyyy-MM-dd'),
    monto: redondear_(m.monto)
  };
}

/* ---------- Gastos fijos ---------- */

/**
 * Carga en "Gastos" los fijos del mes cuyo día ya llegó. La corre un activador diario.
 * Se saltea un fijo si no está activo o le falta detalle, monto, categoría o día.
 * La primera vez que un fijo queda completo, si su día ya pasó, empieza el mes siguiente.
 */
function cargarFijos() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.log('La hoja estaba ocupada: no se cargó nada. La corrida de mañana se pone al día.');
    return;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hojaFijos = ss.getSheetByName(HOJA_FIJOS);
    var hojaGastos = ss.getSheetByName(HOJA_GASTOS);
    if (!hojaFijos || !hojaGastos) {
      console.log('No encontré la hoja "' + (hojaFijos ? HOJA_GASTOS : HOJA_FIJOS) + '". Revisá el nombre de la pestaña.');
      return;
    }
    var ultima = hojaFijos.getLastRow();
    if (ultima < 2) {
      console.log('La hoja "' + HOJA_FIJOS + '" no tiene filas debajo del encabezado.');
      return;
    }

    var filas = hojaFijos.getRange(2, 1, ultima - 1, 7).getValues();
    var tzHoja = ss.getSpreadsheetTimeZone();
    var hoy = new Date();
    var anio = hoy.getFullYear();
    var mes = hoy.getMonth();
    var diaHoy = hoy.getDate();
    var diasMes = new Date(anio, mes + 1, 0).getDate();
    var mesClave = anio + '-' + ('0' + (mes + 1)).slice(-2);

    console.log('Hoy para el script: ' + diaHoy + '/' + (mes + 1) + '/' + anio +
      ' (zona horaria del script: ' + Session.getScriptTimeZone() + ', de la planilla: ' + tzHoja + ')');

    var nuevos = [];
    var nombresNuevos = [];
    var columnaG = filas.map(function (f) { return [valorMes_(f[6], tzHoja)]; });
    var huboCambios = false;

    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      var detalle = String(f[0] || '').trim();
      var monto = parsearMonto_(f[1]);
      var categoria = String(f[2] || '').trim();
      var dia = leerDia_(f[3], tzHoja);
      var activo = f[5] === true;
      var ultimoMes = columnaG[i][0];
      var nombre = 'Fila ' + (i + 2) + ' · ' + (detalle || '(sin detalle)') + ' → ';

      if (!detalle && !categoria && !f[1] && !f[3]) continue; // Fila vacía
      if (!activo) { console.log(nombre + 'salteado: no está activo'); continue; }
      if (!detalle) { console.log(nombre + 'salteado: falta el detalle'); continue; }
      if (!(monto > 0)) { console.log(nombre + 'salteado: falta el monto'); continue; }
      if (!categoria) { console.log(nombre + 'salteado: falta la categoría'); continue; }
      if (!dia) { console.log(nombre + 'salteado: el día tiene que ser un número del 1 al 31 (dice: "' + f[3] + '")'); continue; }
      if (ultimoMes >= mesClave) { console.log(nombre + 'ya se cargó este mes (' + ultimoMes + ')'); continue; }

      var diaReal = Math.min(dia, diasMes); // 29, 30 y 31 caen el último día en meses cortos
      if (diaReal > diaHoy) { console.log(nombre + 'espera: se carga el día ' + diaReal); continue; }

      if (!ultimoMes && diaReal < diaHoy) {
        // Primera vez y su día ya pasó: se saltea este mes y empieza el siguiente
        console.log(nombre + 'empieza el mes que viene (es la primera vez y el día ' + diaReal + ' ya pasó)');
        columnaG[i] = [mesClave];
        huboCambios = true;
        continue;
      }

      var quien = String(f[4] || '').trim() || 'Automático';
      nuevos.push([new Date(anio, mes, diaReal), detalle, monto, categoria, quien, 'fijo-' + Utilities.getUuid()]);
      nombresNuevos.push(nombre + 'CARGADO con fecha ' + diaReal + '/' + (mes + 1));
      columnaG[i] = [mesClave];
      huboCambios = true;
    }

    if (nuevos.length) {
      var inicio = hojaGastos.getLastRow() + 1;
      hojaGastos.getRange(inicio, 1, nuevos.length, COL_ID).setValues(nuevos);
      for (var j = 0; j < nombresNuevos.length; j++) {
        console.log(nombresNuevos[j] + ' (fila ' + (inicio + j) + ' de Gastos)');
      }
    }
    if (huboCambios) {
      // Como texto, para que Sheets no convierta "2026-10" en una fecha
      hojaFijos.getRange(2, 7, columnaG.length, 1).setNumberFormat('@').setValues(columnaG);
    }
    SpreadsheetApp.flush();
    console.log('Listo: ' + nuevos.length + ' gasto(s) fijo(s) cargado(s).');
  } finally {
    lock.releaseLock();
  }
}

/** Marca un fijo de monto variable como omitido este mes (columna H) y devuelve el resumen actualizado. */
function omitirFijo(detalle) {
  var clave = normalizarTexto_(detalle);
  if (!clave) throw new Error('No encontré ese fijo');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('La hoja está ocupada, reintentá');

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJA_FIJOS);
    if (!hoja || hoja.getLastRow() < 2) throw new Error('No encontré ese fijo');

    var detalles = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < detalles.length; i++) {
      if (normalizarTexto_(detalles[i][0]) !== clave) continue;
      if (hoja.getMaxColumns() < COL_OMITIDO) {
        hoja.insertColumnsAfter(hoja.getMaxColumns(), COL_OMITIDO - hoja.getMaxColumns());
      }
      var hoy = new Date();
      // Como texto, para que Sheets no convierta "2026-10" en una fecha
      hoja.getRange(i + 2, COL_OMITIDO).setNumberFormat('@').setValue(claveMes_(hoy.getFullYear(), hoy.getMonth()));
      SpreadsheetApp.flush();
      return { ok: true, resumen: calcularResumen_(ss) };
    }
    throw new Error('No encontré ese fijo');
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve el día del mes (1 a 31) o 0. Si alguien escribió una fecha, toma su día. */
function leerDia_(v, tz) {
  var n;
  if (v instanceof Date && !isNaN(v.getTime())) {
    var p = Utilities.formatDate(v, tz, 'yyyy-M-d').split('-').map(Number);
    // Un número escrito en una celda con formato de fecha queda como enero de 1900: se recupera el número
    n = p[0] <= 1900 ? Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 86400000) : p[2];
  } else {
    n = parseInt(String(v == null ? '' : v).trim(), 10);
  }
  return n >= 1 && n <= 31 ? n : 0;
}

/** Lee la columna G como "aaaa-mm", ya sea texto o una fecha que Sheets haya convertido. */
function valorMes_(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM');
  var m = String(v || '').trim().match(/^(\d{4})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
}

/* ---------- Ventana para deshacer ---------- */

function claveDeshacer_(id) {
  return 'deshacer_' + id;
}

/** Anota que este gasto se puede deshacer. La anotación se borra sola a los 2 minutos. */
function marcarDeshacible_(id) {
  try { CacheService.getScriptCache().put(claveDeshacer_(id), '1', VENTANA_DESHACER_SEG); } catch (e) {}
}

function olvidarDeshacible_(id) {
  try { CacheService.getScriptCache().remove(claveDeshacer_(id)); } catch (e) {}
}

/** Vale la anotación temporal; si Google la borró antes de tiempo, la fecha de la columna A hace de respaldo. */
function esDeshacible_(id, hoja, fila) {
  try {
    if (CacheService.getScriptCache().get(claveDeshacer_(id))) return true;
  } catch (e) {}
  var fecha = aFecha_(hoja.getRange(fila, 1).getValue());
  return !!fecha && Date.now() - fecha.getTime() <= VENTANA_DESHACER_SEG * 1000;
}

/* ---------- Lectura ---------- */

/**
 * Lee Config A:C de una sola vez. Ignora celdas vacías y duplicados.
 * grupos: [{ nombre, categorias }] en el orden de la hoja; una categoría sin grupo va a "Sin grupo".
 * grupoDe: grupo de cada categoría (clave normalizada, sin mayúsculas ni tildes).
 */
function leerConfig_(ss) {
  var res = { categorias: [], personas: [], grupos: [], grupoDe: {} };
  var hoja = ss.getSheetByName(HOJA_CONFIG);
  if (!hoja) return res;
  var ultima = hoja.getLastRow();
  if (ultima < 2) return res;

  var valores = hoja.getRange(2, 1, ultima - 1, Math.min(3, hoja.getMaxColumns())).getValues();
  res.categorias = listaUnica_(valores, 0);
  res.personas = listaUnica_(valores, 1);

  var indice = {};
  for (var i = 0; i < valores.length; i++) {
    var cat = String(valores[i][0] || '').trim();
    var clave = normalizarTexto_(cat);
    if (!clave || res.grupoDe[clave]) continue;
    var grupo = String(valores[i][2] || '').trim() || 'Sin grupo';
    res.grupoDe[clave] = grupo;
    if (!(grupo in indice)) {
      indice[grupo] = res.grupos.length;
      res.grupos.push({ nombre: grupo, categorias: [] });
    }
    res.grupos[indice[grupo]].categorias.push(cat);
  }
  return res;
}

function listaUnica_(valores, col) {
  var vistas = {};
  var lista = [];
  for (var i = 0; i < valores.length; i++) {
    var c = String(valores[i][col] || '').trim();
    if (c && !vistas[c]) {
      vistas[c] = true;
      lista.push(c);
    }
  }
  return lista;
}

/**
 * Lee la hoja Fijos de una vez.
 * detalles: todos los detalles (normalizados), para no mostrarlos entre los mayores gastos.
 * variables: fijos activos sin monto (se cargan a mano), para el aviso de pendientes.
 */
function leerFijos_(ss) {
  var res = { detalles: {}, variables: [] };
  var hoja = ss.getSheetByName(HOJA_FIJOS);
  if (!hoja || hoja.getLastRow() < 2) return res;
  var tz = ss.getSpreadsheetTimeZone();
  var columnas = Math.min(COL_OMITIDO, hoja.getMaxColumns());
  var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, columnas).getValues();
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var detalle = String(f[0] || '').trim();
    var k = normalizarTexto_(detalle);
    if (!k) continue;
    res.detalles[k] = true;
    if (f[5] === true && !(parsearMonto_(f[1]) > 0)) {
      res.variables.push({
        detalle: detalle,
        categoria: String(f[2] || '').trim(),
        dia: leerDia_(f[3], tz),
        omitido: valorMes_(f[COL_OMITIDO - 1], tz)
      });
    }
  }
  return res;
}

/**
 * Resumen del mes pedido (por defecto, el actual).
 * Mes actual: cuenta hasta hoy, compara con el mes anterior al mismo día y lista los últimos 8 movimientos.
 * Mes pasado: mes completo, compara con el anterior y el siguiente (si ya terminó)
 * y lista los 8 gastos más grandes sin contar los fijos.
 */
function calcularResumen_(ss, anio, mes) {
  var hoja = ss.getSheetByName(HOJA_GASTOS);
  var ultima = hoja ? hoja.getLastRow() : 0;
  var filas = ultima > 1 ? hoja.getRange(2, 1, ultima - 1, COL_ID).getValues() : [];
  var infoFijos = leerFijos_(ss);
  var fijos = infoFijos.detalles;
  var config = leerConfig_(ss);

  var tz = Session.getScriptTimeZone();
  var hoy = new Date();
  if (anio == null) {
    anio = hoy.getFullYear();
    mes = hoy.getMonth();
  }
  var esActual = anio === hoy.getFullYear() && mes === hoy.getMonth();
  var diasMes = new Date(anio, mes + 1, 0).getDate();
  var limite = esActual ? hoy.getDate() : diasMes;

  // Mes anterior: en el mes actual se compara hasta el mismo día; en un mes pasado, completo
  var prev = mesVecino_(anio, mes, -1);
  var diasPrev = new Date(prev.anio, prev.mes + 1, 0).getDate();
  var limitePrev = esActual ? Math.min(limite, diasPrev) : diasPrev;

  // Mes siguiente: solo en meses pasados y si ya terminó (no es el mes actual)
  var sig = mesVecino_(anio, mes, 1);
  var compararSig = !esActual && !(sig.anio === hoy.getFullYear() && sig.mes === hoy.getMonth());

  var total = 0;
  var totalPrev = 0;
  var totalSig = 0;
  var porCategoria = {};
  var porPersona = {};
  var porDia = [];
  var movimientos = [];
  var delMes = [];
  var primerMes = '';
  for (var d = 0; d < limite; d++) porDia.push(0);

  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var fecha = aFecha_(f[0]);
    var monto = parsearMonto_(f[2]);
    if (!fecha || !monto) continue;

    var fa = fecha.getFullYear();
    var fm = fecha.getMonth();
    var fd = fecha.getDate();
    var clave = claveMes_(fa, fm);
    if (!primerMes || clave < primerMes) primerMes = clave;

    var detalle = String(f[1] || '').trim();
    var cat = String(f[3] || '').trim() || 'Sin categoría';
    var quien = String(f[4] || '').trim();
    var id = String(f[5] || '').trim();
    var mov = {
      t: fecha.getTime(), i: i, fecha: fecha, detalle: detalle, categoria: cat, quien: quien, monto: monto, id: id,
      fijo: id.indexOf('fijo-') === 0 || !!fijos[normalizarTexto_(detalle)]
    };
    movimientos.push(mov);

    if (fa === anio && fm === mes) {
      total += monto;
      porCategoria[cat] = (porCategoria[cat] || 0) + monto;
      var p = quien || 'Sin asignar';
      porPersona[p] = (porPersona[p] || 0) + monto;
      porDia[Math.min(fd, limite) - 1] += monto;
      delMes.push(mov);
    } else if (fa === prev.anio && fm === prev.mes && fd <= limitePrev) {
      totalPrev += monto;
    } else if (compararSig && fa === sig.anio && fm === sig.mes) {
      totalSig += monto;
    }
  }

  // Categorías del mes ordenadas por gasto, con su grupo
  var grupoDe = function (cat) { return config.grupoDe[normalizarTexto_(cat)] || 'Sin grupo'; };
  var categorias = Object.keys(porCategoria).map(function (k) {
    return { nombre: k, monto: redondear_(porCategoria[k]), grupo: grupoDe(k) };
  }).sort(function (a, b) { return b.monto - a.monto; });

  // Gasto del mes por grupo, en el orden de Config ("Sin grupo" al final, solo si hay)
  var porGrupo = {};
  categorias.forEach(function (c) { porGrupo[c.grupo] = (porGrupo[c.grupo] || 0) + c.monto; });
  var nombresGrupo = config.grupos.map(function (g) { return g.nombre; });
  if (porGrupo['Sin grupo'] && nombresGrupo.indexOf('Sin grupo') === -1) nombresGrupo.push('Sin grupo');
  var grupos = nombresGrupo.map(function (g) {
    var m = porGrupo[g] || 0;
    return { nombre: g, monto: redondear_(m), pct: total > 0 ? Math.round(m / total * 100) : 0 };
  });

  var top = categorias.slice(0, 4).map(function (c) {
    return { nombre: c.nombre, monto: c.monto, pct: total > 0 ? Math.round(c.monto / total * 100) : 0 };
  });

  // Gasto del mes por persona
  var personas = Object.keys(porPersona).map(function (k) {
    return { nombre: k, monto: redondear_(porPersona[k]), pct: total > 0 ? Math.round(porPersona[k] / total * 100) : 0 };
  }).sort(function (a, b) { return b.monto - a.monto; });

  // Evolución: gasto acumulado día a día (hasta hoy en el mes actual, mes completo en uno pasado)
  var labels = [];
  var valores = [];
  var acumulado = 0;
  for (var j = 0; j < porDia.length; j++) {
    acumulado += porDia[j];
    labels.push(String(j + 1));
    valores.push(redondear_(acumulado));
  }

  // Más recientes primero (para la lista del mes actual y para autocompletar)
  movimientos.sort(function (a, b) { return (b.t - a.t) || (b.i - a.i); });

  var lista;
  var tituloLista;
  if (esActual) {
    lista = movimientos.slice(0, 8);
    tituloLista = 'Últimos movimientos';
  } else {
    lista = delMes.filter(function (m) { return !m.fijo; })
      .sort(function (a, b) { return (b.monto - a.monto) || (b.t - a.t); })
      .slice(0, 8);
    tituloLista = 'Mayores gastos';
  }
  var ultimos = lista.map(function (m) { return movimientoParaApp_(m, tz); });

  // Detalles ya usados para autocompletar (solo hacen falta con el mes actual)
  var sugerencias = null;
  if (esActual) {
    sugerencias = [];
    var vistos = {};
    for (var k = 0; k < movimientos.length && sugerencias.length < MAX_SUGERENCIAS; k++) {
      var claveDet = normalizarTexto_(movimientos[k].detalle);
      if (!claveDet || vistos[claveDet]) continue;
      vistos[claveDet] = true;
      sugerencias.push({ d: movimientos[k].detalle, c: movimientos[k].categoria });
    }
  }

  // Fijos de monto variable que todavía no se cargaron (ni se omitieron) este mes.
  // Cuenta como cargado si este mes hay un gasto con el mismo detalle o la misma categoría.
  var pendientes = null;
  if (esActual) {
    var claveActual = claveMes_(anio, mes);
    var detallesMes = {};
    var categoriasMes = {};
    delMes.forEach(function (m) {
      detallesMes[normalizarTexto_(m.detalle)] = true;
      categoriasMes[normalizarTexto_(m.categoria)] = true;
    });
    pendientes = infoFijos.variables.filter(function (v) {
      return v.omitido !== claveActual &&
        !detallesMes[normalizarTexto_(v.detalle)] &&
        !(v.categoria && categoriasMes[normalizarTexto_(v.categoria)]);
    }).map(function (v) {
      return { detalle: v.detalle, categoria: v.categoria, dia: v.dia, vencido: !!v.dia && v.dia < limite };
    }).sort(function (a, b) { return (a.dia || 99) - (b.dia || 99); });
  }

  // Porcentaje = cuánto más (o menos) se gastó en el mes que se mira respecto del otro
  var comparaciones = [];
  if (totalPrev > 0) {
    var detallePrev = '';
    if (esActual) detallePrev = limite >= diasPrev ? ' completo' : ' al día ' + limitePrev;
    comparaciones.push({
      pct: Math.round((total - totalPrev) / totalPrev * 100),
      texto: 'vs. ' + MESES[prev.mes].toLowerCase() + detallePrev
    });
  }
  if (compararSig && totalSig > 0) {
    comparaciones.push({
      pct: Math.round((total - totalSig) / totalSig * 100),
      texto: 'vs. ' + MESES[sig.mes].toLowerCase()
    });
  }

  return {
    anio: anio,
    mes: mes,
    esActual: esActual,
    primerMes: primerMes,
    etiquetaMes: MESES[mes] + ' ' + anio,
    total: redondear_(total),
    comparaciones: comparaciones,
    sugerencias: sugerencias,
    pendientes: pendientes,
    top: top,
    personas: personas,
    categorias: categorias,
    grupos: grupos,
    evolucion: { labels: labels, valores: valores },
    tituloLista: tituloLista,
    ultimos: ultimos
  };
}

/* ---------- Utilidades ---------- */

/** Mes vecino: delta -1 = anterior, +1 = siguiente. */
function mesVecino_(anio, mes, delta) {
  var d = new Date(anio, mes + delta, 1);
  return { anio: d.getFullYear(), mes: d.getMonth() };
}

/** "aaaa-mm" para comparar meses como texto. */
function claveMes_(anio, mes) {
  return anio + '-' + ('0' + (mes + 1)).slice(-2);
}

/** "aaaa-mm-dd" elegido en el celular: ese día a las 12 h. Vacío o el día de hoy: ahora. No acepta fechas futuras. */
function fechaDelGasto_(texto) {
  var ahora = new Date();
  var m = String(texto || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ahora;
  var f = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (isNaN(f.getTime()) || f.getFullYear() < 2000 || f.getDate() !== Number(m[3])) throw new Error('Fecha inválida');
  if (f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth() && f.getDate() === ahora.getDate()) return ahora;
  if (f > ahora) throw new Error('La fecha no puede ser futura');
  return f;
}

/** Devuelve el número de fila con ese ID, o -1. Lee la columna F de una vez y busca desde abajo. */
function buscarFilaPorId_(hoja, id) {
  var ultima = hoja.getLastRow();
  if (ultima < 2) return -1;
  var ids = hoja.getRange(2, COL_ID, ultima - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

/** Minúsculas y sin tildes, para comparar detalles ("Café" = "cafe"). */
function normalizarTexto_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normalizarId_(v) {
  var s = String(v || '').trim();
  return /^[A-Za-z0-9-]{8,64}$/.test(s) ? s : '';
}

function parsearMonto_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '');
  if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function aFecha_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (!v) return null;
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    var a = Number(m[3]);
    if (a < 100) a += 2000;
    return new Date(a, Number(m[2]) - 1, Number(m[1]));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function redondear_(n) {
  return Math.round(n * 100) / 100;
}
