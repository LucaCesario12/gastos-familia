/* Gastos – app instalable. Habla con la planilla a través de Api (api.js). */
var VERSION = '1.1.1';

var ACENTO = '#A3E635';
var COLOR_BARRA = '#A1A1AA';
// Un color por grupo, en el orden de Config (Insumos, Fijos, Otros…); el último sirve para "Sin grupo" y extras
var COLORES_GRUPO = ['#F4F4F5', '#A1A1AA', '#71717A', '#52525B', '#3F3F46'];
var COLOR_MAS = '#FCA5A5';
var COLOR_MENOS = '#86EFAC';

var CLAVE_CAT = 'gastos.ultimaCategoria';
var CLAVE_PER = 'gastos.persona';
var CLAVE_VISTA_GRUPOS = 'gastos.vistaGrupos';
var CLAVE_CACHE = 'gastos.cache';
var CLAVE_COLA = 'gastos.cola';          // Gastos guardados en el celular que todavía no llegaron a la planilla
var TIEMPO_GUARDAR_MS = 12000;           // Si guardar tarda más, el gasto queda en la cola y se reintenta solo
var MS_REINTENTO = 30000;                // Cada cuánto se reintenta la cola mientras la app está abierta

var SEG_DESHACER = 8;
var MAX_SUG_VISIBLES = 3;
var MS_TOQUE_LARGO = 600;
var MS_ERROR = 3000;
var MS_RESYNC = 60000;
var MAX_ENTEROS = 9;

var MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

var ERRORES_CONOCIDOS = ['Monto inválido', 'Elegí una categoría', 'La hoja está ocupada, reintentá', 'Ya pasó el tiempo para deshacer',
                         'La fecha no puede ser futura', 'Fecha inválida', 'Ese mes todavía no llegó', 'No encontré ese fijo',
                         'Ese gasto no se puede editar'];

var ICONOS = {
  refrescar: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
  izquierda: '<polyline points="15 18 9 12 15 6"/>',
  derecha: '<polyline points="9 18 15 12 9 6"/>',
  cerrar: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  borrar: '<path d="M21 6H9l-6 6 6 6h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><line x1="12" y1="9" x2="18" y2="15"/><line x1="18" y1="9" x2="12" y2="15"/>',
  mas: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  grafico: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'
};

var estado = {
  categorias: [], categoria: null, personas: [], persona: leerLS(CLAVE_PER), sugerencias: [],
  grupos: [],           // [{ nombre, categorias }] de Config, en orden
  grupoVisto: null,     // grupo cuyas categorías se muestran en Cargar
  vistaGrupos: leerLS(CLAVE_VISTA_GRUPOS) === 'categorias' ? 'categorias' : 'grupos',
  monto: '',            // lo tipeado en el teclado propio: dígitos y, si hay, una coma
  deshaciendo: false, cargado: false, vista: 'cargar',
  fecha: '',            // '' = hoy; si no, 'aaaa-mm-dd' elegido en el campo de fecha
  mesVisto: null,       // resumen que se está mostrando en la pestaña Resumen
  resumenActual: null,  // resumen del mes en curso
  mesPedido: null,      // clave del mes que se está pidiendo
  omitiendo: null,      // fijo pendiente que se está por omitir (toque largo)
  editando: null,       // { mov, categoria, grupo, grupoInicial, confirmarBorrado } mientras se edita
  todosDe: null,        // clave del mes de la lista "Ver todos" abierta
  ultimaSync: 0
};
var cacheMeses = {};          // Meses pasados ya pedidos, mientras la app está abierta
var ultimoGuardado = null;    // { id, previo, restante, intervalo } mientras se puede deshacer
var timerBoton = null;
var timerAviso = null;
var timerDeshacerError = null;
var timerEdicion = null;

var nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/* ---------- Utilidades ---------- */
function byId(id) { return document.getElementById(id); }
function dinero(n) { return '$ ' + nf.format(n || 0); }
function el(tag, clase, texto) {
  var e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}
function icono(nombre) {
  return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICONOS[nombre] || '') + '</svg>';
}
function hidratarIconos() {
  var lugares = document.querySelectorAll('[data-icono]');
  for (var i = 0; i < lugares.length; i++) lugares[i].innerHTML = icono(lugares[i].getAttribute('data-icono'));
}
function generarId() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  var bytes = new Uint8Array(16);
  try { crypto.getRandomValues(bytes); } catch (e) {
    for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  var s = '';
  for (var j = 0; j < 16; j++) s += ('0' + bytes[j].toString(16)).slice(-2);
  return s;
}
function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function escribirLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/** Minúsculas y sin tildes, para comparar detalles ("Café" = "cafe"). */
function normalizar(s) {
  s = String(s || '').toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s.trim();
}

function pad2(n) { return ('0' + n).slice(-2); }
function hoyISO() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
/** 'aaaa-mm-dd' → '15/09' (o '15/09/25' si es de otro año) */
function fechaCorta(iso) {
  var p = iso.split('-');
  return p[2] + '/' + p[1] + (Number(p[0]) !== new Date().getFullYear() ? '/' + p[0].slice(-2) : '');
}
function claveMes(anio, mes) { return anio + '-' + pad2(mes + 1); }

function parsearMonto(v) {
  var s = String(v || '').replace(/[^\d,.]/g, '');
  if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Traduce el error del servidor o de la red a un texto corto y claro. */
function textoError(err, porDefecto) {
  if (err && (err.sinConexion || err.name === 'TypeError' || err.name === 'AbortError')) return 'Sin conexión · reintentá';
  var msg = String((err && err.message) || err || '');
  for (var i = 0; i < ERRORES_CONOCIDOS.length; i++) {
    if (msg.indexOf(ERRORES_CONOCIDOS[i]) > -1) return ERRORES_CONOCIDOS[i];
  }
  if (msg.indexOf('Ese gasto ya no existe') > -1) return 'El gasto ya no está en la hoja';
  var autor = msg.match(/Solo .+ puede cambiar este gasto/);
  if (autor) return autor[0];
  if (err && err.codigo === 'respuesta') return 'La planilla no respondió bien · revisá la conexión';
  return porDefecto;
}

function vibrar() {
  try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
}

/** Aviso abajo: rojo y con vibración para errores; claro para confirmaciones (tipo 'ok'). */
function avisar(msg, tipo) {
  var a = byId('aviso');
  var txt = byId('avisoTxt');
  txt.textContent = msg;
  txt.style.color = tipo === 'ok' ? 'var(--texto)' : 'var(--rojo)';
  a.style.bottom = estado.vista === 'cargar'
    ? 'calc(var(--nav) + 88px + var(--sa-bottom))'
    : 'calc(var(--nav) + 16px + var(--sa-bottom))';
  a.classList.remove('oculto');
  if (tipo !== 'ok') vibrar();
  clearTimeout(timerAviso);
  timerAviso = setTimeout(function () { a.classList.add('oculto'); }, 4000);
}

function hayPantalla() {
  return ['selector', 'configuracion', 'panelTodos', 'panelCola', 'fondoEdicion'].some(function (id) {
    return !byId(id).classList.contains('oculto');
  });
}

/* ---------- Navegación ---------- */
function mostrar(vista) {
  estado.vista = vista;
  var esCargar = vista === 'cargar';
  byId('vistaCargar').classList.toggle('oculto', !esCargar);
  byId('vistaResumen').classList.toggle('oculto', esCargar);
  byId('barraGuardar').classList.toggle('oculto', !esCargar);
  byId('tituloVista').textContent = esCargar ? 'Nuevo gasto' : 'Resumen';
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('activa', tabs[i].getAttribute('data-vista') === vista);
  }
  window.scrollTo(0, 0);
}

/* ---------- Monto (teclado propio) ---------- */
function montoFormateado(txt) {
  if (!txt) return '0';
  var partes = txt.split(',');
  var enteros = (partes[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return partes.length > 1 ? enteros + ',' + partes[1] : enteros;
}
function montoNumero() {
  return Number((estado.monto || '0').replace(',', '.')) || 0;
}
function pintarMonto() {
  byId('montoTxt').textContent = montoFormateado(estado.monto);
  byId('montoVista').classList.toggle('vacio', !estado.monto);
}
function teclaDigito(d) {
  var m = estado.monto;
  var coma = m.indexOf(',');
  if (coma > -1) {
    if (m.length - coma - 1 >= 2) return; // máximo dos decimales
  } else {
    if (m === '0') m = '';               // sin ceros a la izquierda
    if (m.length >= MAX_ENTEROS) return;
  }
  estado.monto = m + d;
  pintarMonto();
}
function teclaComa() {
  if (estado.monto.indexOf(',') > -1) return;
  estado.monto = (estado.monto || '0') + ',';
  pintarMonto();
}
function teclaBorrar() {
  estado.monto = estado.monto.slice(0, -1);
  pintarMonto();
}
function construirTeclado() {
  var cont = byId('teclado');
  cont.innerHTML = '';
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'borrar'].forEach(function (t) {
    var b = el('button', 'tecla');
    b.type = 'button';
    if (t === 'borrar') {
      b.innerHTML = icono('borrar');
      b.setAttribute('aria-label', 'Borrar');
      // Mantener apretado borra todo el monto
      var timer = null;
      var largo = false;
      b.addEventListener('pointerdown', function () {
        largo = false;
        timer = setTimeout(function () { largo = true; estado.monto = ''; pintarMonto(); vibrarCorto(); }, 500);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        b.addEventListener(ev, function () { clearTimeout(timer); });
      });
      b.addEventListener('click', function () { if (largo) { largo = false; return; } teclaBorrar(); });
    } else if (t === ',') {
      b.textContent = ',';
      b.setAttribute('aria-label', 'Coma');
      b.addEventListener('click', teclaComa);
    } else {
      b.textContent = t;
      b.addEventListener('click', function () { teclaDigito(t); });
    }
    cont.appendChild(b);
  });
}
function vibrarCorto() {
  try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
}

/* ---------- Fecha ---------- */
/** Fecha válida para cargar un gasto pasado; si no, '' (= hoy). */
function fechaValida(iso) {
  return iso && iso < hoyISO() && iso >= '2000-01-01' ? iso : '';
}
/** Campo de fecha: vacío, hoy, futura o inválida vuelven a hoy. Otra fecha queda destacada. */
function setFecha(iso) {
  iso = fechaValida(iso);
  estado.fecha = iso;
  var input = byId('fecha');
  input.max = hoyISO();
  if (input.value !== (iso || hoyISO())) input.value = iso || hoyISO();
  marcarFecha(iso);
}
/** Lo que está fuera del campo: el botón destacado y la línea "Volver a hoy". */
function marcarFecha(iso) {
  byId('botonFecha').classList.toggle('activo', !!iso);
  byId('infoFecha').classList.toggle('oculto', !iso);
  if (iso) byId('fechaTxt').textContent = 'Gasto del ' + fechaCorta(iso);
}

/* ---------- Categorías y grupos ---------- */
/** Grupo al que pertenece una categoría (o null si no está en Config). */
function grupoDeCategoria(c) {
  for (var i = 0; i < estado.grupos.length; i++) {
    if (estado.grupos[i].categorias.indexOf(c) > -1) return estado.grupos[i].nombre;
  }
  return null;
}
/** Grupos a mostrar; si Config no tiene la columna Grupo, uno solo con todas las categorías. */
function gruposParaMostrar() {
  return estado.grupos.length ? estado.grupos : [{ nombre: '', categorias: estado.categorias }];
}
function categoriasDelGrupo(grupos, nombre) {
  return (grupos.filter(function (g) { return g.nombre === nombre; })[0] || grupos[0]).categorias;
}
/** Al cargar o sincronizar: categoría válida (la última usada o la primera) y su grupo a la vista. */
function validarCategoria() {
  var cats = estado.categorias;
  if (cats.indexOf(estado.categoria) === -1) {
    var guardada = leerLS(CLAVE_CAT);
    estado.categoria = cats.indexOf(guardada) > -1 ? guardada : (cats[0] || null);
  }
  var nombres = gruposParaMostrar().map(function (g) { return g.nombre; });
  if (nombres.indexOf(estado.grupoVisto) === -1) {
    estado.grupoVisto = grupoDeCategoria(estado.categoria) || nombres[0];
  }
}
/** Elige una categoría (autocompletar, fijo pendiente, deshacer) y muestra su grupo. */
function elegirCategoria(c) {
  if (estado.categorias.indexOf(c) === -1) return;
  estado.categoria = c;
  escribirLS(CLAVE_CAT, c);
  estado.grupoVisto = grupoDeCategoria(c) || estado.grupoVisto;
  renderChips();
}
/** Botones de un selector de grupos; con un solo grupo no se muestra. */
function renderSegmento(cont, grupos, activo, alElegir) {
  cont.innerHTML = '';
  cont.classList.toggle('oculto', grupos.length <= 1);
  grupos.forEach(function (g) {
    var b = el('button', g.nombre === activo ? 'activo' : '', g.nombre);
    b.type = 'button';
    b.title = g.nombre;
    b.addEventListener('click', function () { alElegir(g.nombre); });
    cont.appendChild(b);
  });
}
function renderChips() {
  var cont = byId('chips');
  cont.innerHTML = '';
  if (!estado.categorias.length) {
    byId('selectorGrupo').classList.add('oculto');
    cont.appendChild(el('div', 'etiqueta', estado.cargado ? 'Agregá categorías en la hoja Config' : 'Cargando categorías…'));
    return;
  }
  var grupos = gruposParaMostrar();
  renderSegmento(byId('selectorGrupo'), grupos, estado.grupoVisto, function (nombre) {
    estado.grupoVisto = nombre;
    renderChips();
  });
  var visibles = categoriasDelGrupo(grupos, estado.grupoVisto);
  // La categoría elegida siempre está a la vista: al cambiar de grupo hay que elegir una de ese grupo
  if (visibles.indexOf(estado.categoria) === -1) estado.categoria = null;

  visibles.forEach(function (c) {
    var b = el('button', 'chip' + (c === estado.categoria ? ' activo' : ''), c);
    b.type = 'button';
    b.title = c;
    b.addEventListener('click', function () {
      estado.categoria = c;
      escribirLS(CLAVE_CAT, c);
      var todos = cont.querySelectorAll('.chip');
      for (var i = 0; i < todos.length; i++) todos[i].classList.toggle('activo', todos[i] === b);
    });
    cont.appendChild(b);
  });
}

/* ---------- Autocompletar detalle ---------- */
function renderSugerencias() {
  var cont = byId('sugerencias');
  var q = normalizar(byId('detalle').value);
  cont.innerHTML = '';
  if (q.length < 2) { cont.classList.add('oculto'); return; }

  // Primero los que empiezan con lo escrito, después los que lo contienen
  var empiezan = [];
  var contienen = [];
  for (var i = 0; i < estado.sugerencias.length; i++) {
    var s = estado.sugerencias[i];
    if (s.k === q) continue;
    var pos = s.k.indexOf(q);
    if (pos === 0) empiezan.push(s);
    else if (pos > 0) contienen.push(s);
  }
  var lista = empiezan.concat(contienen).slice(0, MAX_SUG_VISIBLES);
  if (!lista.length) { cont.classList.add('oculto'); return; }

  lista.forEach(function (s) {
    var b = el('button', 'chip', s.d);
    b.type = 'button';
    b.title = s.d;
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () {
      byId('detalle').value = s.d;
      elegirCategoria(s.c);
      ocultarSugerencias();
    });
    cont.appendChild(b);
  });
  cont.classList.remove('oculto');
}
function ocultarSugerencias() {
  var cont = byId('sugerencias');
  cont.innerHTML = '';
  cont.classList.add('oculto');
}

/* ---------- Fijos pendientes ---------- */
function renderPendientes(lista) {
  cancelarOmitir();
  var cont = byId('pendientes');
  cont.innerHTML = '';
  byId('pendientesCaja').classList.toggle('oculto', !lista.length);
  byId('pendientesCuenta').textContent = 'Faltan este mes · ' + lista.length;

  lista.forEach(function (f) {
    var b = el('button', 'chip chip-fijo');
    b.type = 'button';
    b.title = f.detalle + (f.dia ? ' · día ' + f.dia : '');
    if (f.vencido) b.appendChild(el('span', 'punto-vencido'));
    b.appendChild(document.createTextNode(f.detalle));

    // Toque corto: completa el formulario. Toque largo: ofrece omitirlo este mes.
    var timer = null;
    var largo = false;
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      largo = false;
      timer = setTimeout(function () { largo = true; pedirOmitir(f); }, MS_TOQUE_LARGO);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      b.addEventListener(ev, function () { clearTimeout(timer); });
    });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () {
      if (largo) { largo = false; return; }
      elegirPendiente(f);
    });
    cont.appendChild(b);
  });
}
function elegirPendiente(f) {
  byId('detalle').value = f.detalle;
  ocultarSugerencias();
  elegirCategoria(f.categoria);
}
function pedirOmitir(f) {
  estado.omitiendo = f;
  vibrarCorto();
  byId('omitirTxt').textContent = '¿Omitir ' + f.detalle + ' este mes?';
  var si = byId('btnOmitirSi');
  si.disabled = false;
  si.textContent = 'Omitir';
  byId('omitirBarra').classList.remove('oculto');
}
function cancelarOmitir() {
  estado.omitiendo = null;
  byId('omitirBarra').classList.add('oculto');
}
function confirmarOmitir() {
  var f = estado.omitiendo;
  if (!f) return;
  var si = byId('btnOmitirSi');
  si.disabled = true;
  si.textContent = 'Omitiendo…';
  Api.llamar('omitir', { detalle: f.detalle }).then(function (res) {
    actualizarResumenes(res && res.resumen);
    var v = estado.mesVisto;
    if (!v || v.esActual) mostrarResumen(res && res.resumen);
  }, function (err) {
    cancelarOmitir();
    avisar(textoError(err, 'No se pudo omitir'));
  });
}

/* ---------- Personas ---------- */
function renderPersona() {
  var hay = estado.personas.length > 0;
  if (hay && estado.personas.indexOf(estado.persona) === -1) estado.persona = null;
  byId('btnPersona').classList.toggle('oculto', !hay);
  byId('personaTxt').textContent = estado.persona || 'Quién';
  if (hay && !estado.persona) abrirSelector();
}
function abrirSelector() {
  var cont = byId('chipsPersonas');
  cont.innerHTML = '';
  estado.personas.forEach(function (p) {
    var b = el('button', 'persona-fila' + (p === estado.persona ? ' activo' : ''));
    b.type = 'button';
    b.appendChild(el('span', 'avatar', p.charAt(0).toUpperCase()));
    b.appendChild(el('span', '', p));
    b.addEventListener('click', function () {
      estado.persona = p;
      escribirLS(CLAVE_PER, p);
      byId('personaTxt').textContent = p;
      byId('selector').classList.add('oculto');
      // Las listas cambian: cada persona puede editar solo lo que cargó
      if (estado.mesVisto) mostrarResumen(estado.mesVisto);
    });
    cont.appendChild(b);
  });
  byId('versionTxt').textContent = 'Versión ' + VERSION;
  byId('selector').classList.remove('oculto');
}

/* ---------- Resumen ---------- */
/** Guarda el resumen del mes en curso (sugerencias y fijos pendientes incluidos) sin mostrarlo. */
function recibirActual(r) {
  if (!r) return;
  estado.resumenActual = r;
  if (r.sugerencias) {
    estado.sugerencias = r.sugerencias.map(function (s) {
      return { d: s.d, c: s.c, k: normalizar(s.d) };
    });
  }
  if (r.pendientes) renderPendientes(r.pendientes);
}
function mostrarResumen(r) {
  if (!r) return;
  estado.mesVisto = r;
  byId('mesLabel').textContent = r.etiquetaMes;
  byId('total').textContent = dinero(r.total);
  byId('mesSig').disabled = r.esActual;
  byId('mesAnt').disabled = !r.primerMes || claveMes(r.anio, r.mes) <= r.primerMes;
  var atajo = byId('btnAgregarMes');
  atajo.textContent = '+ Agregar gasto a ' + MESES_NOMBRE[r.mes].toLowerCase();
  atajo.classList.toggle('oculto', r.esActual);
  byId('tituloLista').textContent = r.tituloLista;
  renderComparacion(r.comparaciones);
  renderTop(r.top);
  renderPorPersona(r.personas);
  renderLinea(r.evolucion);
  renderDona(r.grupos);
  renderBarrasCategorias(r.categorias, r.grupos);
  aplicarVistaGrupos();
  renderUltimos(r.ultimos, r.esActual);
}
/** Después de guardar, deshacer o sincronizar: los meses guardados pueden haber cambiado. */
function actualizarResumenes(r) {
  cacheMeses = {};
  recibirActual(r);
}
function cargandoMes(si) {
  byId('total').classList.toggle('cargando', si);
  if (si) {
    byId('mesAnt').disabled = true;
    byId('mesSig').disabled = true;
  }
}
function moverMes(delta) {
  var v = estado.mesVisto;
  if (!v || estado.mesPedido) return;
  var d = new Date(v.anio, v.mes + delta, 1);
  var a = estado.resumenActual;
  if (a && d.getFullYear() === a.anio && d.getMonth() === a.mes) { mostrarResumen(a); return; }
  pedirMes(d.getFullYear(), d.getMonth());
}
function pedirMes(anio, mes) {
  var clave = claveMes(anio, mes);
  if (cacheMeses[clave]) { mostrarResumen(cacheMeses[clave]); return; }

  estado.mesPedido = clave;
  byId('mesLabel').textContent = MESES_NOMBRE[mes] + ' ' + anio;
  cargandoMes(true);
  Api.llamar('mes', { anio: anio, mes: mes }).then(function (r) {
    cacheMeses[clave] = r;
    if (estado.mesPedido !== clave) return;
    estado.mesPedido = null;
    cargandoMes(false);
    mostrarResumen(r);
  }, function (err) {
    if (estado.mesPedido !== clave) return;
    estado.mesPedido = null;
    cargandoMes(false);
    mostrarResumen(estado.mesVisto);
    avisar(textoError(err, 'No se pudo cargar ese mes'));
  });
}
/** Atajo de un mes pasado: va a Cargar con la fecha puesta en el último día de ese mes. */
function agregarEnMesVisto() {
  var v = estado.mesVisto;
  if (!v || v.esActual) return;
  var ultimoDia = new Date(v.anio, v.mes + 1, 0).getDate();
  mostrar('cargar');
  setFecha(v.anio + '-' + pad2(v.mes + 1) + '-' + pad2(ultimoDia));
}
/** "↑ 12% vs. agosto": rojo si en el mes visto se gastó más que en el otro, verde si menos. */
function renderComparacion(lista) {
  var cont = byId('comparacion');
  cont.innerHTML = '';
  lista = lista || [];
  lista.forEach(function (c) {
    var linea = el('div');
    var flecha = c.pct > 0 ? '↑ ' : (c.pct < 0 ? '↓ ' : '= ');
    var pct = el('span', '', flecha + Math.abs(c.pct) + '%');
    pct.style.fontWeight = '500';
    pct.style.color = c.pct > 0 ? COLOR_MAS : (c.pct < 0 ? COLOR_MENOS : COLOR_BARRA);
    linea.appendChild(pct);
    linea.appendChild(el('span', 'texto-suave', ' ' + c.texto));
    cont.appendChild(linea);
  });
  cont.classList.toggle('oculto', !lista.length);
}
function renderTop(top) {
  var cont = byId('top');
  cont.innerHTML = '';
  if (!top || !top.length) {
    cont.appendChild(el('div', 'texto-suave', 'Sin gastos este mes'));
    return;
  }
  renderBarras(cont, top, true);
}
function renderPorPersona(lista) {
  var card = byId('cardPersonas');
  var hay = lista && lista.length && (estado.personas.length || lista.length > 1 || lista[0].nombre !== 'Sin asignar');
  card.classList.toggle('oculto', !hay);
  var cont = byId('porPersona');
  cont.innerHTML = '';
  if (hay) renderBarras(cont, lista, false);
}
function renderBarras(cont, items, acentoEnPrimero) {
  items.forEach(function (c, i) {
    var fila = el('div');
    var linea = el('div', 'linea');
    linea.appendChild(el('span', 'nom', c.nombre));
    var der = el('span', 'der');
    der.appendChild(document.createTextNode(dinero(c.monto) + ' '));
    der.appendChild(el('span', 'pct', c.pct + '%'));
    linea.appendChild(der);
    var barra = el('div', 'barra');
    var relleno = el('div');
    relleno.style.width = Math.max(c.pct, 2) + '%';
    relleno.style.background = (acentoEnPrimero && i === 0) ? ACENTO : COLOR_BARRA;
    barra.appendChild(relleno);
    fila.appendChild(linea);
    fila.appendChild(barra);
    cont.appendChild(fila);
  });
}
/** Gasto acumulado día a día: una línea simple dibujada en SVG. */
function renderLinea(ev) {
  var cont = byId('grafLinea');
  var v = (ev && ev.valores) || [];
  if (!v.length) { cont.innerHTML = ''; return; }
  var W = 300;
  var H = 80;
  var max = Math.max.apply(null, v) || 1;
  var n = v.length;
  function punto(y, i) {
    var x = n === 1 ? W : i / (n - 1) * W;
    return x.toFixed(1) + ',' + (H - 6 - (y / max) * (H - 12)).toFixed(1);
  }
  var pts = n === 1 ? ('0,' + punto(v[0], 0).split(',')[1] + ' ' + punto(v[0], 0)) : v.map(punto).join(' ');
  cont.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Gasto acumulado del mes">' +
    '<polyline points="' + pts + '" fill="none" stroke="' + COLOR_BARRA + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>' +
    '<div class="graf-pie"><span>Día 1</span><span>' + dinero(v[n - 1]) + '</span><span>Día ' + n + '</span></div>';
}
/** Color de un grupo según su posición en la lista de grupos del mes. */
function colorGrupo(grupos, nombre) {
  var i = (grupos || []).map(function (g) { return g.nombre; }).indexOf(nombre);
  return COLORES_GRUPO[i > -1 ? Math.min(i, COLORES_GRUPO.length - 1) : COLORES_GRUPO.length - 1];
}
/** Vista de la tarjeta "Por grupo": dona de grupos o barras por categoría. */
function aplicarVistaGrupos() {
  var verCategorias = estado.vistaGrupos === 'categorias';
  byId('tituloGrupos').textContent = verCategorias ? 'Por categoría' : 'Por grupo';
  byId('panelDona').classList.toggle('oculto', verCategorias);
  byId('panelBarras').classList.toggle('oculto', !verCategorias);
  var botones = byId('vistaGrupos').querySelectorAll('button');
  for (var i = 0; i < botones.length; i++) {
    botones[i].classList.toggle('activo', botones[i].getAttribute('data-ver') === estado.vistaGrupos);
  }
}
/** Todas las categorías del mes, de mayor a menor, cada barra con el color de su grupo. */
function renderBarrasCategorias(cats, grupos) {
  var leyenda = byId('leyendaGrupos');
  var cont = byId('barrasCategorias');
  leyenda.innerHTML = '';
  cont.innerHTML = '';
  cats = cats || [];
  if (!cats.length) {
    cont.appendChild(el('div', 'texto-suave', 'Sin gastos este mes'));
    return;
  }
  (grupos || []).forEach(function (g) {
    var item = el('span', 'leyenda-item');
    var punto = el('span', 'punto');
    punto.style.background = colorGrupo(grupos, g.nombre);
    item.appendChild(punto);
    item.appendChild(document.createTextNode(g.nombre));
    leyenda.appendChild(item);
  });
  var total = cats.reduce(function (s, c) { return s + c.monto; }, 0);
  var maximo = cats[0].monto;
  cats.forEach(function (c) {
    var fila = el('div');
    var linea = el('div', 'linea');
    linea.appendChild(el('span', 'nom', c.nombre));
    var der = el('span', 'der');
    der.appendChild(document.createTextNode(dinero(c.monto) + ' '));
    der.appendChild(el('span', 'pct', (total > 0 ? Math.round(c.monto / total * 100) : 0) + '%'));
    linea.appendChild(der);
    var barra = el('div', 'barra');
    var relleno = el('div');
    // El ancho es relativo a la categoría más grande, para que se distingan bien
    relleno.style.width = Math.max(maximo > 0 ? c.monto / maximo * 100 : 0, 2) + '%';
    relleno.style.background = colorGrupo(grupos, c.grupo);
    barra.appendChild(relleno);
    fila.appendChild(linea);
    fila.appendChild(barra);
    cont.appendChild(fila);
  });
}
/** Dona con el gasto de cada grupo del mes (Insumos, Fijos, Otros…), dibujada en SVG. */
function renderDona(grupos) {
  var todos = grupos || [];
  var vis = todos.filter(function (g) { return g.monto > 0; });
  var C = 2 * Math.PI * 38;
  var svg = '<svg viewBox="0 0 100 100" width="124" height="124" role="img" aria-label="Gasto por grupo"><g transform="rotate(-90 50 50)" fill="none" stroke-width="14">';
  if (!vis.length) {
    svg += '<circle cx="50" cy="50" r="38" stroke="#25252E"/>';
  } else {
    var suma = vis.reduce(function (s, g) { return s + g.monto; }, 0);
    var corrido = 0;
    vis.forEach(function (g) {
      var largo = g.monto / suma * C;
      svg += '<circle cx="50" cy="50" r="38" stroke="' + colorGrupo(todos, g.nombre) + '" stroke-dasharray="' + largo.toFixed(2) + ' ' + (C - largo).toFixed(2) + '" stroke-dashoffset="' + (-corrido).toFixed(2) + '"/>';
      corrido += largo;
    });
  }
  svg += '</g></svg>';
  byId('grafDona').innerHTML = svg;

  var ley = byId('leyendaDona');
  ley.innerHTML = '';
  if (!vis.length) { ley.appendChild(el('div', 'texto-suave', 'Sin gastos este mes')); return; }
  vis.forEach(function (g) {
    var item = el('div', 'leyenda-item');
    var punto = el('span', 'punto');
    punto.style.background = colorGrupo(todos, g.nombre);
    item.appendChild(punto);
    item.appendChild(document.createTextNode(g.nombre + ' · ' + g.pct + '%'));
    ley.appendChild(item);
  });
}
function renderUltimos(lista, esActual) {
  var ul = byId('ultimos');
  ul.innerHTML = '';
  if (!lista || !lista.length) {
    ul.appendChild(el('li', 'vacio', esActual === false ? 'Sin gastos (sin contar los fijos)' : 'Todavía no hay movimientos'));
    return;
  }
  lista.forEach(function (m) { ul.appendChild(filaMovimiento(m)); });
}

/* ---------- Editar y borrar ---------- */
/** Solo quien cargó el gasto lo puede cambiar; los fijos automáticos, cualquiera. Sin ID, nadie. */
function puedeEditar(m) {
  if (!m.id) return false;
  if (!m.quien || m.quien === 'Automático') return true;
  return normalizar(m.quien) === normalizar(estado.persona || '');
}
/** Fila de un movimiento. Si tiene ID, al tocarla se edita (o avisa quién lo puede editar). */
function filaMovimiento(m) {
  var editable = puedeEditar(m);
  var li = el('li', (m.id ? 'fila-editable' : '') + (m.id && !editable ? ' fila-ajena' : ''));
  var izq = el('div', 'izq');
  izq.appendChild(el('div', 'det', m.detalle || m.categoria));
  izq.appendChild(el('div', 'sub etiqueta', m.fecha + ' · ' + m.categoria + (m.quien ? ' · ' + m.quien : '')));
  li.appendChild(izq);
  li.appendChild(el('div', 'monto-fila', dinero(m.monto)));
  if (m.id) {
    if (editable) li.appendChild(el('span', 'chevron', '›'));
    li.addEventListener('click', function () {
      if (editable) abrirEdicion(m);
      else avisar('Solo ' + m.quien + ' puede editar este gasto');
    });
  }
  return li;
}
function abrirTodos() {
  var v = estado.mesVisto;
  if (!v) return;
  var clave = claveMes(v.anio, v.mes);
  estado.todosDe = clave;
  byId('todosTitulo').textContent = 'Movimientos · ' + v.etiquetaMes;
  var ul = byId('listaTodos');
  ul.innerHTML = '';
  ul.appendChild(el('li', 'vacio', 'Cargando…'));
  byId('panelTodos').classList.remove('oculto');
  Api.llamar('movimientos', { anio: v.anio, mes: v.mes }).then(function (lista) {
    if (estado.todosDe === clave) renderListaTodos(lista);
  }, function (err) {
    if (estado.todosDe !== clave) return;
    cerrarTodos();
    avisar(textoError(err, 'No se pudo cargar la lista'));
  });
}
function renderListaTodos(lista) {
  var ul = byId('listaTodos');
  ul.innerHTML = '';
  if (!lista || !lista.length) {
    ul.appendChild(el('li', 'vacio', 'Sin movimientos este mes'));
    return;
  }
  lista.forEach(function (m) { ul.appendChild(filaMovimiento(m)); });
}
function cerrarTodos() {
  estado.todosDe = null;
  byId('panelTodos').classList.add('oculto');
}
function abrirEdicion(m) {
  var grupoInicial = grupoDeCategoria(m.categoria) || gruposParaMostrar()[0].nombre;
  estado.editando = { mov: m, categoria: m.categoria, grupo: grupoInicial, grupoInicial: grupoInicial, confirmarBorrado: false };
  byId('editMonto').value = String(m.monto).replace('.', ',');
  byId('editDetalle').value = m.detalle;
  var f = byId('editFecha');
  f.max = hoyISO();
  f.value = m.fechaISO;
  byId('editQuien').textContent = m.quien ? 'Cargado por ' + m.quien : '';
  renderEditChips();
  reiniciarBotonesEdicion();
  byId('fondoEdicion').classList.remove('oculto');
}
function renderEditChips() {
  var e = estado.editando;
  var cont = byId('editChips');
  cont.innerHTML = '';
  var grupos = gruposParaMostrar();
  renderSegmento(byId('editGrupo'), grupos, e.grupo, function (nombre) {
    e.grupo = nombre;
    renderEditChips();
  });
  var cats = categoriasDelGrupo(grupos, e.grupo).slice();
  // Una categoría que ya no está en Config se muestra en el grupo inicial, para no perderla
  if (e.categoria && !grupoDeCategoria(e.categoria) && e.grupo === e.grupoInicial && cats.indexOf(e.categoria) === -1) {
    cats.unshift(e.categoria);
  }
  // Igual que en Cargar: la categoría elegida siempre está a la vista
  if (cats.indexOf(e.categoria) === -1) e.categoria = null;

  cats.forEach(function (c) {
    var b = el('button', 'chip' + (c === e.categoria ? ' activo' : ''), c);
    b.type = 'button';
    b.title = c;
    b.addEventListener('click', function () {
      e.categoria = c;
      renderEditChips();
    });
    cont.appendChild(b);
  });
}
function reiniciarBotonesEdicion() {
  clearTimeout(timerEdicion);
  var g = byId('btnGuardarEdicion');
  g.disabled = false;
  g.textContent = 'Guardar cambios';
  g.classList.remove('error');
  var b = byId('btnBorrar');
  b.disabled = false;
  b.textContent = 'Borrar';
  b.classList.remove('confirmar');
  if (estado.editando) estado.editando.confirmarBorrado = false;
}
function cerrarEdicion() {
  clearTimeout(timerEdicion);
  estado.editando = null;
  byId('fondoEdicion').classList.add('oculto');
}
function errorEdicion(err, porDefecto) {
  reiniciarBotonesEdicion();
  var g = byId('btnGuardarEdicion');
  g.textContent = textoError(err, porDefecto);
  g.classList.add('error');
  vibrar();
  timerEdicion = setTimeout(reiniciarBotonesEdicion, MS_ERROR);
}
/** Datos comunes de editar y borrar: el gasto, quién lo pide y el mes que se está mirando. */
function pedidoEdicion() {
  var v = estado.mesVisto || {};
  return { id: estado.editando.mov.id, quien: estado.persona || '', anio: v.anio, mes: v.mes };
}
function guardarEdicion() {
  var e = estado.editando;
  if (!e) return;
  var monto = parsearMonto(byId('editMonto').value);
  if (!(monto > 0)) { errorEdicion(null, 'Ingresá un monto'); return; }
  if (!e.categoria) { errorEdicion(null, 'Elegí una categoría'); return; }
  var fecha = byId('editFecha').value || e.mov.fechaISO;
  if (fecha > hoyISO()) { errorEdicion(null, 'La fecha no puede ser futura'); return; }

  var p = pedidoEdicion();
  p.monto = monto;
  p.detalle = byId('editDetalle').value;
  p.categoria = e.categoria;
  p.fecha = fecha;

  var g = byId('btnGuardarEdicion');
  g.disabled = true;
  g.textContent = 'Guardando…';
  Api.llamar('editar', { cambio: p }).then(function (res) {
    aplicarTrasCambio(res);
    cerrarEdicion();
    avisar('✓ Cambios guardados', 'ok');
  }, function (err) { errorEdicion(err, 'No se pudo guardar · reintentá'); });
}
/** Primer toque: pide confirmación. Segundo toque (dentro de 3 s): borra. */
function borrarEdicion() {
  var e = estado.editando;
  if (!e) return;
  var b = byId('btnBorrar');
  if (!e.confirmarBorrado) {
    e.confirmarBorrado = true;
    b.textContent = '¿Seguro?';
    b.classList.add('confirmar');
    clearTimeout(timerEdicion);
    timerEdicion = setTimeout(reiniciarBotonesEdicion, MS_ERROR);
    return;
  }
  clearTimeout(timerEdicion);
  b.disabled = true;
  b.textContent = 'Borrando…';
  Api.llamar('borrar', { pedido: pedidoEdicion() }).then(function (res) {
    aplicarTrasCambio(res);
    cerrarEdicion();
    avisar('✓ Gasto borrado', 'ok');
  }, function (err) { errorEdicion(err, 'No se pudo borrar'); });
}
/** Actualiza el resumen del mes que se está mirando (sin cambiar de mes) y la lista "Ver todos". */
function aplicarTrasCambio(res) {
  if (!res) return;
  actualizarResumenes(res.resumen);
  var v = estado.mesVisto;
  if (res.resumenMes) {
    cacheMeses[claveMes(res.resumenMes.anio, res.resumenMes.mes)] = res.resumenMes;
    if (v && !v.esActual) mostrarResumen(res.resumenMes);
  } else if (!v || v.esActual) {
    mostrarResumen(res.resumen);
  }
  if (estado.todosDe) renderListaTodos(res.movimientos);
}

/* ---------- Sincronizar ---------- */
function guardarCache(d) {
  try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(d)); } catch (e) {}
}
function leerCache() {
  try {
    var s = localStorage.getItem(CLAVE_CACHE);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
/** Pinta los datos de la planilla (frescos o los últimos guardados en el celular). */
function aplicarDatos(d, desdeCache) {
  estado.cargado = true;
  estado.categorias = (d && d.categorias) || [];
  estado.grupos = (d && d.grupos) || [];
  estado.personas = (d && d.personas) || [];
  validarCategoria();
  renderChips();
  renderPersona();
  actualizarResumenes(d && d.resumen);
  // Si se estaba mirando un mes pasado, se refresca ese mes; si no, el actual
  var v = estado.mesVisto;
  if (v && !v.esActual && !desdeCache) pedirMes(v.anio, v.mes);
  else mostrarResumen(d && d.resumen);
}
function cargarDatos(silencioso) {
  var btn = byId('btnSync');
  btn.classList.add('girando');
  btn.disabled = true;
  return Api.llamar('datos').then(function (d) {
    btn.classList.remove('girando');
    btn.disabled = false;
    estado.ultimaSync = Date.now();
    guardarCache(d);
    aplicarDatos(d, false);
  }, function (err) {
    btn.classList.remove('girando');
    btn.disabled = false;
    if (!silencioso || !(err && err.sinConexion)) avisar(textoError(err, 'No se pudo sincronizar'));
  });
}

/* ---------- Guardar ---------- */
function estadoBoton(texto, clase, volverEn) {
  var b = byId('btnGuardar');
  clearTimeout(timerBoton);
  b.textContent = texto;
  b.className = 'pill primario' + (clase ? ' ' + clase : '');
  if (volverEn) {
    timerBoton = setTimeout(function () { estadoBoton('Guardar', ''); }, volverEn);
  }
}
/**
 * Guardar siempre pasa por la cola: el gasto se anota primero en el celular (así no se pierde aunque
 * se cierre la app o no haya señal) y después se envía. Si el envío falla por falta de señal,
 * queda en la cola y se reintenta solo.
 */
function guardar() {
  if (estado.deshaciendo) return;
  var inDetalle = byId('detalle');
  var monto = montoNumero();

  if (!(monto > 0)) { estadoBoton('Ingresá un monto', 'error', 1500); return; }
  if (!estado.categoria) { estadoBoton('Elegí una categoría', 'error', 1500); return; }
  if (estado.personas.length && !estado.persona) { abrirSelector(); return; }

  var previo = { monto: estado.monto, detalle: inDetalle.value, categoria: estado.categoria, fecha: estado.fecha };
  var item = {
    id: generarId(),
    monto: monto,
    detalle: inDetalle.value,
    categoria: estado.categoria,
    quien: estado.persona || '',
    // Fecha explícita: si el envío se demora hasta mañana, el gasto igual queda en el día en que se cargó
    fecha: estado.fecha || hoyISO(),
    u: Api.url(),
    creado: Date.now(),
    intentos: 0
  };

  ocultarDeshacer();
  cola.push(item);
  guardarCola();
  reciente = { id: item.id, previo: previo };

  estadoBoton('Guardando…', 'cargando');
  estado.monto = '';
  pintarMonto();
  inDetalle.value = '';
  setFecha('');
  ocultarSugerencias();

  renderCola();
  enviarCola();
}

/* ---------- Cola de gastos sin enviar ---------- */
var cola = leerCola();
var enviandoId = null;   // ID del gasto que se está enviando en este momento
var reciente = null;     // { id, previo } del último gasto cargado a mano, para avisar cómo le fue
var enviadosEnRonda = 0; // Cuántos gastos viejos se enviaron en esta tanda, para un solo aviso

function leerCola() {
  try {
    var s = localStorage.getItem(CLAVE_COLA);
    var lista = s ? JSON.parse(s) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}
function guardarCola() {
  try { localStorage.setItem(CLAVE_COLA, JSON.stringify(cola)); } catch (e) {}
}
function enCola(id) {
  return cola.some(function (i) { return i.id === id; });
}
function quitarDeCola(id) {
  cola = cola.filter(function (i) { return i.id !== id; });
  if (reciente && reciente.id === id) reciente = null;
  guardarCola();
  renderCola();
}
/** Falta de señal o respuesta rara de Google: no es culpa del gasto, se reintenta más tarde. */
function esFalloDeRed(err) {
  if (!err) return false;
  if (err.sinConexion || err.name === 'TypeError' || err.name === 'AbortError') return true;
  if (err.codigo === 'respuesta') return true;
  return String(err.message || '').indexOf('La hoja está ocupada') > -1;
}
/** Manda los gastos de la cola de a uno, en orden. Se frena en el primer fallo de señal. */
function enviarCola() {
  if (enviandoId || !Api.configurado()) return;
  var item = null;
  for (var i = 0; i < cola.length; i++) {
    if (!cola[i].error && cola[i].u === Api.url()) { item = cola[i]; break; }
  }
  if (!item) {
    if (enviadosEnRonda > 0) {
      avisar('✓ ' + enviadosEnRonda + (enviadosEnRonda === 1 ? ' gasto enviado' : ' gastos enviados'), 'ok');
      enviadosEnRonda = 0;
    }
    renderCola();
    return;
  }
  // Con el modo avión no hace falta ni intentarlo
  if (navigator.onLine === false) { avisarSinSenal(); renderCola(); return; }

  enviandoId = item.id;
  renderCola();
  var gasto = { id: item.id, monto: item.monto, detalle: item.detalle, categoria: item.categoria, quien: item.quien, fecha: item.fecha };

  Api.llamar('guardar', { gasto: gasto }, TIEMPO_GUARDAR_MS).then(function (res) {
    enviandoId = null;
    envioListo(item, res); // antes de sacarlo de la cola: necesita saber si era el último gasto cargado
    quitarDeCola(item.id);
    enviarCola();
  }, function (err) {
    enviandoId = null;
    item.intentos = (item.intentos || 0) + 1;
    if (err && err.codigo === 'clave') {
      // La app ya pidió el código nuevo: la cola espera
      guardarCola(); avisarSinSenal(); renderCola();
    } else if (esFalloDeRed(err)) {
      guardarCola(); avisarSinSenal(); renderCola();
    } else {
      // La planilla rechazó este gasto: queda en la lista con el motivo y se sigue con los demás
      item.error = textoError(err, 'La planilla no lo aceptó');
      guardarCola();
      renderCola();
      envioRechazado(item);
      enviarCola();
    }
  });
}
function envioListo(item, res) {
  actualizarResumenes(res && res.resumen);
  var v = estado.mesVisto;
  if (reciente && reciente.id === item.id) {
    var previo = reciente.previo;
    reciente = null;
    mostrarResumen(res && res.resumen);
    estadoBoton(previo.fecha ? '✓ Guardado el ' + fechaCorta(previo.fecha) : '✓ Guardado ' + dinero(item.monto), '', 1400);
    mostrarDeshacer(item.id, previo);
  } else {
    enviadosEnRonda++;
    if (!v || v.esActual) mostrarResumen(res && res.resumen);
  }
}
/** El último gasto cargado quedó en la cola por falta de señal: se avisa y se puede deshacer al instante. */
function avisarSinSenal() {
  if (!reciente || !enCola(reciente.id)) return;
  var previo = reciente.previo;
  var id = reciente.id;
  reciente = null;
  estadoBoton('Guardado sin señal · se envía solo', '', 2800);
  mostrarDeshacer(id, previo);
}
function envioRechazado(item) {
  if (reciente && reciente.id === item.id) {
    reciente = null;
    estadoBoton(item.error, 'error', MS_ERROR);
  } else {
    avisar('Un gasto no se pudo enviar: ' + item.error);
  }
  vibrar();
}

function totalCola() {
  return cola.reduce(function (s, i) { return s + (i.monto || 0); }, 0);
}
/** Pastilla de arriba, línea del Resumen y, si está abierta, la lista. */
function renderCola() {
  var n = cola.length;
  byId('btnCola').classList.toggle('oculto', n === 0);
  byId('colaTxt').textContent = n + (enviandoId ? ' enviando…' : ' sin enviar');
  var r = byId('colaResumen');
  r.classList.toggle('oculto', n === 0);
  if (n) r.textContent = 'Sin enviar · ' + dinero(totalCola()) + ' (' + n + (n === 1 ? ' gasto' : ' gastos') + ')';
  if (!byId('panelCola').classList.contains('oculto')) renderPanelCola();
}
function renderPanelCola() {
  var ul = byId('listaCola');
  ul.innerHTML = '';
  if (!cola.length) ul.appendChild(el('li', 'vacio', 'No hay gastos sin enviar'));
  cola.forEach(function (i) {
    var li = el('li');
    var izq = el('div', 'izq');
    izq.appendChild(el('div', 'det', i.detalle || i.categoria));
    izq.appendChild(el('div', 'sub etiqueta', fechaCorta(i.fecha) + ' · ' + i.categoria + (i.quien ? ' · ' + i.quien : '')));
    if (i.error) izq.appendChild(el('div', 'cola-error', i.error));
    else if (i.u !== Api.url()) izq.appendChild(el('div', 'cola-error', 'Es de otra conexión: no se envía'));
    else if (i.id === enviandoId) izq.appendChild(el('div', 'sub etiqueta', 'Enviando…'));
    li.appendChild(izq);
    li.appendChild(el('div', 'monto-fila', dinero(i.monto)));
    li.appendChild(botonBorrarCola(i));
    ul.appendChild(li);
  });
  byId('colaAyuda').textContent = 'Estos gastos están guardados en este celular y se envían solos cuando hay señal.';
  var hayParaEnviar = cola.some(function (i) { return !i.error && i.u === Api.url(); });
  byId('btnEnviarCola').disabled = !hayParaEnviar || !!enviandoId;
}
/** Primer toque: pide confirmación. Segundo toque: borra el gasto de la cola. */
function botonBorrarCola(item) {
  var b = el('button', 'btn-cola', 'Borrar');
  b.type = 'button';
  var timer = null;
  b.addEventListener('click', function () {
    if (item.id === enviandoId) { avisar('Se está enviando: esperá un momento'); return; }
    if (!b.classList.contains('confirmar')) {
      b.classList.add('confirmar');
      b.textContent = '¿Seguro?';
      timer = setTimeout(function () { b.classList.remove('confirmar'); b.textContent = 'Borrar'; }, MS_ERROR);
      return;
    }
    clearTimeout(timer);
    quitarDeCola(item.id);
  });
  return b;
}
function abrirCola() {
  byId('panelCola').classList.remove('oculto');
  renderPanelCola();
}
function cerrarCola() {
  byId('panelCola').classList.add('oculto');
}

/* ---------- Deshacer (solo lo guardado desde este celular) ---------- */
function mostrarDeshacer(id, previo) {
  ocultarDeshacer();
  var b = byId('btnDeshacer');
  ultimoGuardado = { id: id, previo: previo, restante: SEG_DESHACER, intervalo: null };
  b.disabled = false;
  b.textContent = 'Deshacer · ' + SEG_DESHACER;
  b.classList.remove('oculto');
  ultimoGuardado.intervalo = setInterval(function () {
    ultimoGuardado.restante--;
    if (ultimoGuardado.restante <= 0) { ocultarDeshacer(); return; }
    b.textContent = 'Deshacer · ' + ultimoGuardado.restante;
  }, 1000);
}
function ocultarDeshacer() {
  if (ultimoGuardado) clearInterval(ultimoGuardado.intervalo);
  ultimoGuardado = null;
  clearTimeout(timerDeshacerError);
  var b = byId('btnDeshacer');
  b.classList.remove('error');
  b.classList.add('oculto');
}
/** Devuelve lo que se había tipeado al formulario, si no se empezó a cargar otro gasto. */
function devolverAlFormulario(previo) {
  if (estado.monto) return;
  estado.monto = previo.monto;
  pintarMonto();
  byId('detalle').value = previo.detalle;
  setFecha(previo.fecha);
  elegirCategoria(previo.categoria);
}
function deshacer() {
  if (!ultimoGuardado || estado.deshaciendo) return;
  var d = ultimoGuardado;
  clearInterval(d.intervalo);
  ultimoGuardado = null;

  // Si el gasto todavía está en la cola (no llegó a la planilla), alcanza con sacarlo de ahí
  if (enviandoId !== d.id && enCola(d.id)) {
    quitarDeCola(d.id);
    byId('btnDeshacer').classList.add('oculto');
    estadoBoton('Gasto deshecho', '', 1400);
    devolverAlFormulario(d.previo);
    return;
  }
  estado.deshaciendo = true;

  var b = byId('btnDeshacer');
  b.disabled = true;
  b.textContent = 'Deshaciendo…';

  Api.llamar('deshacer', { id: d.id }).then(function (res) {
    estado.deshaciendo = false;
    b.classList.add('oculto');
    estadoBoton('Gasto deshecho', '', 1400);
    actualizarResumenes(res && res.resumen);
    mostrarResumen(res && res.resumen);
    // Devuelve los datos al formulario para corregirlos
    devolverAlFormulario(d.previo);
  }, function (err) {
    estado.deshaciendo = false;
    // El botón no desaparece: avisa que falló y el motivo va en el botón Guardar
    b.textContent = 'No se pudo';
    b.classList.add('error');
    estadoBoton(textoError(err, 'No se pudo deshacer'), 'error', MS_ERROR);
    vibrar();
    timerDeshacerError = setTimeout(ocultarDeshacer, MS_ERROR);
  });
}

/* ---------- Conexión con la planilla ---------- */
function mostrarErrorCfg(msg) {
  var e = byId('cfgError');
  e.textContent = msg;
  e.classList.toggle('oculto', !msg);
}
function abrirConfiguracion(mensaje) {
  byId('cfgCodigo').value = '';
  byId('cfgUrl').value = '';
  byId('cfgClave').value = '';
  mostrarErrorCfg(mensaje || '');
  var btn = byId('btnConectar');
  btn.disabled = false;
  btn.textContent = 'Conectar';
  byId('btnVolverConfig').classList.toggle('oculto', !Api.configurado());
  byId('selector').classList.add('oculto');
  byId('configuracion').classList.remove('oculto');
}
function cerrarConfiguracion() {
  byId('configuracion').classList.add('oculto');
}
function conectar() {
  var cfg = null;
  var codigo = byId('cfgCodigo').value.trim();
  if (codigo) {
    cfg = Api.decodificar(codigo);
    if (!cfg) { mostrarErrorCfg('El código no es válido: tiene que empezar con GASTOS1.'); return; }
    if (!cfg.u) {
      // El código no trajo la dirección: se completa a mano
      byId('cfgClave').value = cfg.k;
      byId('cfgManual').open = true;
      mostrarErrorCfg('Falta la dirección: pegala en Configuración manual.');
      return;
    }
  } else {
    var u = byId('cfgUrl').value.trim();
    var k = byId('cfgClave').value.trim();
    if (!u || !k) { mostrarErrorCfg('Pegá el código de la familia.'); return; }
    cfg = { u: u, k: k };
  }
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(cfg.u)) {
    mostrarErrorCfg('La dirección tiene que ser la de la implementación de Apps Script (empieza con https://script.google.com/).');
    return;
  }
  mostrarErrorCfg('');
  var btn = byId('btnConectar');
  btn.disabled = true;
  btn.textContent = 'Conectando…';
  Api.llamarCon(cfg, 'ping').then(function () {
    Api.guardar(cfg);
    cerrarConfiguracion();
    cargarDatos();
    enviarCola();
  }, function (err) {
    btn.disabled = false;
    btn.textContent = 'Conectar';
    if (err && err.codigo === 'clave') mostrarErrorCfg('La clave no coincide. Revisá el código.');
    else if (err && err.sinConexion) mostrarErrorCfg('No hay conexión. Revisá internet y probá de nuevo.');
    else mostrarErrorCfg('No se pudo conectar. Revisá que la implementación esté publicada para "Cualquier usuario".');
  });
}

/** Borra la conexión y los datos de este celular (por ejemplo, antes de regalarlo o cambiarlo). */
function desconectar() {
  var n = cola.length;
  var aviso = n
    ? 'Hay ' + n + (n === 1 ? ' gasto' : ' gastos') + ' sin enviar que se van a perder. ¿Desconectar igual?'
    : '¿Desconectar este celular? Vas a necesitar el código de la familia para volver a entrar.';
  if (!window.confirm(aviso)) return;
  Api.borrar();
  [CLAVE_CACHE, CLAVE_COLA, CLAVE_PER, CLAVE_CAT, CLAVE_VISTA_GRUPOS].forEach(function (k) {
    try { localStorage.removeItem(k); } catch (e) {}
  });
  location.reload();
}

/* ---------- Versión nueva (service worker) ---------- */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || /[?&]sinsw\b/.test(location.search)) return;
  var habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // Solo avisa cuando ya había una versión y llegó otra; la primera instalación no cuenta
    if (habiaControlador) byId('bannerVersion').classList.remove('oculto');
  });
  navigator.serviceWorker.register('sw.js').catch(function () {});
}

/* ---------- Inicio ---------- */
function arranque() {
  var enLink = /^#c=(.+)$/.exec(location.hash || '');
  if (enLink) {
    // Link de instalación: trae el código de la familia
    byId('cfgCodigo').value = decodeURIComponent(enLink[1]);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    abrirConfiguracion();
    byId('cfgCodigo').value = decodeURIComponent(enLink[1]);
    conectar();
    return;
  }
  if (!Api.configurado()) { abrirConfiguracion(); return; }
  // Primero lo último que se vio (abre al instante), después lo fresco
  var guardado = leerCache();
  if (guardado) aplicarDatos(guardado, true);
  // Con datos guardados, la sincronización es silenciosa: si no hay señal no molesta
  cargarDatos(!!guardado);
  enviarCola();
}

(function init() {
  hidratarIconos();
  construirTeclado();
  pintarMonto();

  Api.onClaveInvalida = function () { abrirConfiguracion('La clave cambió: pegá el código nuevo.'); };

  byId('btnGuardar').addEventListener('click', guardar);
  byId('btnDeshacer').addEventListener('click', deshacer);

  byId('detalle').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
  });
  byId('detalle').addEventListener('input', renderSugerencias);

  // En la PC (o con teclado físico) se puede tipear el monto directamente
  document.addEventListener('keydown', function (e) {
    if (estado.vista !== 'cargar' || e.ctrlKey || e.metaKey || e.altKey || hayPantalla()) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (/^[0-9]$/.test(e.key)) teclaDigito(e.key);
    else if (e.key === ',' || e.key === '.') teclaComa();
    else if (e.key === 'Backspace') teclaBorrar();
    else if (e.key === 'Enter') guardar();
  });

  byId('btnSync').addEventListener('click', function () { cargarDatos(false); });
  byId('btnPersona').addEventListener('click', abrirSelector);
  byId('btnReconfigurar').addEventListener('click', function () { abrirConfiguracion(''); });
  byId('btnConectar').addEventListener('click', conectar);
  byId('btnDesconectar').addEventListener('click', desconectar);
  byId('btnVolverConfig').addEventListener('click', cerrarConfiguracion);

  // Mientras se edita la fecha no se toca el campo: se aplica al salir
  var campoFecha = byId('fecha');
  campoFecha.addEventListener('click', function () { try { if (campoFecha.showPicker) campoFecha.showPicker(); } catch (e) {} });
  campoFecha.addEventListener('change', function () {
    if (document.activeElement === this) {
      estado.fecha = fechaValida(this.value);
      marcarFecha(estado.fecha);
    } else {
      setFecha(this.value);
    }
  });
  campoFecha.addEventListener('blur', function () { setFecha(this.value); });
  byId('btnHoy').addEventListener('click', function () { setFecha(''); });

  byId('btnOmitirSi').addEventListener('click', confirmarOmitir);
  byId('btnOmitirNo').addEventListener('click', cancelarOmitir);
  byId('btnVerTodos').addEventListener('click', abrirTodos);
  byId('btnCerrarTodos').addEventListener('click', cerrarTodos);
  byId('btnCerrarEdicion').addEventListener('click', cerrarEdicion);
  byId('fondoEdicion').addEventListener('click', function (e) { if (e.target === this) cerrarEdicion(); });
  byId('btnGuardarEdicion').addEventListener('click', guardarEdicion);
  byId('btnBorrar').addEventListener('click', borrarEdicion);
  byId('mesAnt').addEventListener('click', function () { moverMes(-1); });
  byId('mesSig').addEventListener('click', function () { moverMes(1); });
  byId('btnAgregarMes').addEventListener('click', agregarEnMesVisto);
  byId('btnActualizar').addEventListener('click', function () { location.reload(); });

  Array.prototype.forEach.call(byId('vistaGrupos').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      estado.vistaGrupos = b.getAttribute('data-ver');
      escribirLS(CLAVE_VISTA_GRUPOS, estado.vistaGrupos);
      aplicarVistaGrupos();
    });
  });

  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () { mostrar(this.getAttribute('data-vista')); });
  }

  // Al volver a abrir la app desde el fondo, se refrescan los datos si pasó un rato
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !Api.configurado()) return;
    enviarCola();
    if (Date.now() - estado.ultimaSync > MS_RESYNC) cargarDatos(true);
  });

  // Gastos sin enviar: se reintentan al volver la señal y cada tanto mientras la app está abierta
  window.addEventListener('online', enviarCola);
  setInterval(function () { if (cola.length && !document.hidden) enviarCola(); }, MS_REINTENTO);
  byId('btnCola').addEventListener('click', abrirCola);
  byId('colaResumen').addEventListener('click', abrirCola);
  byId('btnCerrarCola').addEventListener('click', cerrarCola);
  byId('btnEnviarCola').addEventListener('click', enviarCola);

  setFecha('');
  renderTop([]);
  renderUltimos([]);
  renderCola();
  registrarServiceWorker();
  arranque();
})();
