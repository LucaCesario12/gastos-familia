# MEMORY.md — Gastos familiares
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no
aporte.

## Estado actual
- v1.1.1 (seguridad opción A) sobre la v1.1.0 (cola sin conexión), en `docs/`, publicada en GitHub Pages (repo `gastos-familia`) y
  conectada a Apps Script mediante una implementación "Cualquier usuario" protegida por clave.
- Pantallas: Cargar (teclado propio), Resumen, Editar gasto, ¿Quién sos?, conexión por código
  y lista "Sin enviar".
- Guardar siempre pasa por una cola en localStorage (`gastos.cola`): se anota primero y se envía
  después; si falla por señal queda y se reintenta (al abrir, al volver la señal, cada 30 s).
- El service worker sirve la app desde lo guardado (sin esperar a la red). Editar, borrar y
  omitir fijos siguen pidiendo conexión: solo los gastos nuevos usan la cola.
- Sin probar en celular real: service worker y cola con señal floja de verdad.

## Decisiones (y por qué)
- PWA y no APK ni tiendas: sirve para Android e iPhone mezclados, es gratis y se actualiza sola.
- La planilla sigue siendo la base de datos: no se pierden los datos existentes.
- Una familia = una planilla = un código `GASTOS1.…`. Así los datos no se mezclan y la app
  publicada es la misma para todas.
- Apps Script como API (`doPost`) con clave compartida en las propiedades del script.
- Repo público: nada secreto en el código; la dirección y la clave viajan solo en el código.

## Aprendizajes y errores a evitar
- Desde el editor, `getUrl()` devuelve la dirección `/dev` (solo anda para el dueño). Por eso
  existe `URL_IMPLEMENTACION`: pegar la `/exec` de "Administrar implementaciones".
- Al copiar una planilla se copia el script con la URL del original: hay que vaciarla. No se
  copian las propiedades (se crea otra clave) ni los activadores (recrear `cargarFijos`).
- iPhone: la app instalada no comparte datos con Safari; hay que pegar el código de nuevo.
- Samsung Internet no ofrece "Instalar app": se usa "Añadir página a → Pantalla de inicio".
- "No se pudo abrir el archivo" al abrir Apps Script suele ser tener varias cuentas de Google
  abiertas: probar en incognito con una sola.
- Con datos móviles flojos el service worker de la v1.0.0 (red primero) se colgaba y guardar
  esperaba 30 s: por eso la v1.1.0 usa cache primero y corta el envío a los 12 s.
- Al probar la cola: sacar un gasto de la cola borraba el aviso de "Guardado" porque se
  limpiaba `reciente` antes de usarlo; avisar primero y quitar después.
- Ante un "no anda" tras un cambio, verificar primero: nueva versión de la implementación,
  recarga de la app, archivos "Copia de…" duplicados en Apps Script, y función elegida en Ejecutar.

## Próximos pasos
- Confirmar en el celular del papá que abre y guarda con datos flojos (v1.1.0).
- Seguridad opción A hecha (elegida sobre la B: clave por celular con invitaciones, más trabajo):
  `soloDueno_`, `textoSeguro_`, CSP en `index.html`, botón "Desconectar este celular".
  Falta del lado del usuario: pegar el `Codigo.gs` nuevo y publicar versión, verificación en
  dos pasos en Google y GitHub. Copia semanal automática de la planilla: ofrecida, sin decidir.
- Pendiente probar en celular real que la CSP no bloquee la conexión a Apps Script
  (`connect-src` de `script.google.com` y `script.googleusercontent.com`; la redirección de /exec
  va a la segunda). Si no conecta tras la v1.1.1, revisar eso primero.
- Cuando toda la familia migre: propiedad `UI_VIEJA` = `no` y archivar las implementaciones viejas.
- Guía corta para pasar la app a otra familia.
