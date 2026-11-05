# AGENTS.md — Gastos familiares

App instalable (PWA) para cargar y ver los gastos de la familia. La base de datos es una planilla de Google; Apps Script hace de API. Cada familia tiene su propia planilla y su propio código de conexión.

## Stack y estructura
- HTML, CSS y JavaScript puros: sin frameworks, librerías, npm, bundler, build ni CDNs. Los gráficos son SVG propios.
- `docs/`: la app que publica GitHub Pages (`index.html`, `estilos.css`, `app.js`, `api.js`, `sw.js`, `manifest.webmanifest`, `icons/`).
- `apps-script/`: `Codigo.gs` (API y lógica de la planilla) e `Index.html` (pantalla vieja, solo de respaldo).
- Ya no sirve abrir `index.html` con doble clic (`file://`): el service worker y las llamadas a Apps Script necesitan `https` o `localhost`.
- Sin módulos ES (`type="module"`).

## Convenciones
- Textos de la interfaz en español rioplatense (voseo: "Pegá", "Elegí").
- Código simple, nombres descriptivos y comentarios solo donde aporten. Comillas simples en JS.
- En `apps-script/Index.html` está prohibido usar backticks y `$$`.
- Diseño oscuro con acento lima solo en la acción principal. Toda pantalla nueva debe verse bien en el móvil (375 px).

## Datos
- La planilla es la fuente de verdad:
  - `Gastos`: Fecha(A) | Detalle(B) | Monto(C) | Categoría(D) | Quién(E) | ID(F).
  - `Config`: categorías (A), personas (B), grupo de cada categoría (C).
  - `Fijos`: columnas A a H (la H es "Omitido").
- En el celular, localStorage: `gastos.conexion`, `gastos.persona`, `gastos.ultimaCategoria`, `gastos.vistaGrupos`, `gastos.cache`.
- No cambies las columnas de la planilla ni la forma de lo guardado en el celular sin migrar lo existente: hay familias usando datos reales.

## Fechas y montos (fácil equivocarse)
- Trabaja siempre con la fecha local. Nunca uses `toISOString()` ni `new Date("AAAA-MM-DD")`: se interpretan en UTC y desplazan el día.
- En el servidor: la fecha futura se rechaza; la fecha de hoy guarda la hora actual; una fecha pasada se guarda a las 12:00.
- Montos con `.` para los miles y `,` para los decimales.

## Seguridad y publicación
- El repositorio es **público**. Nada de claves, códigos `GASTOS1.…` ni la URL real de la implementación. En el repo, `URL_IMPLEMENTACION` de `Codigo.gs` queda vacía.
- La clave de la familia vive en las propiedades del script (`CLAVE_FAMILIA`), nunca en el código.
- Para publicar un cambio en `docs/`: subir `VERSION` en `sw.js` y en `app.js`, commit y push a `main`. Los celulares se actualizan solos y muestran el cartel "Hay una versión nueva".
- `Codigo.gs` lo pega el usuario en Apps Script (Ctrl+A y pegar) y publica una nueva versión de la implementación. Entrégalo siempre completo.

## Forma de trabajar
- Primero el plan y la luz verde del usuario; recién después modifica código.
- Haz solo lo que se pide: no añadas funcionalidades por tu cuenta.
- Cambios pequeños y enfocados; no reescribas lo que ya funciona.
- Al terminar, resume qué has cambiado y cualquier decisión que deba revisar.

## Memoria
- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en lugar de dejarlo en la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).

## Límites
- ✅ Siempre: respetar las reglas de fechas y montos, mantener los textos en español.
- ✅ Siempre: actualizar `MEMORY.md` al terminar cada tarea.
- ⚠️ Pregunta antes: crear archivos nuevos, cambiar las columnas de la planilla o el formato de lo guardado en el celular, cambiar las acciones de la API (los celulares con una versión vieja siguen llamando).
- 🚫 Nunca: añadir dependencias, frameworks, CDNs o un paso de build.
- 🚫 Nunca: subir claves, códigos de la familia o datos personales al repositorio.

## Verificación
- No hay tests ni lint.
- Se prueba con una carpeta temporal fuera del proyecto: copia de `docs/` y de `Codigo.gs`, una planilla simulada con un `fetch` falso que ejecuta `Codigo.gs`, servidor con `python -m http.server` y vista de celular 375×812. Se borra al terminar.
- El service worker no se puede registrar en el navegador de Claude: se prueba en un celular real.
- Para empezar de cero: DevTools → Application → Local Storage → borrar las claves `gastos.*`.
