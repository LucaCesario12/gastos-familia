# MEMORY.md — Gastos familiares
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no
aporte.

## Estado actual
- v1.0.0 publicada en GitHub Pages (carpeta `docs/` del repo `gastos-familia`), conectada a
  Apps Script mediante una implementación "Cualquier usuario" protegida por clave.
- Pantallas: Cargar (teclado propio), Resumen, Editar gasto, ¿Quién sos? y conexión por código.
- Probada de punta a punta en un celular real; la familia está empezando a instalarla.
- Sin conexión no se puede guardar: la app abre con lo último que vio (etapa 2 pendiente).

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
- Con datos móviles flojos el service worker (red primero) se cuelga y guardar espera 30 s.
- Ante un "no anda" tras un cambio, verificar primero: nueva versión de la implementación,
  recarga de la app, archivos "Copia de…" duplicados en Apps Script, y función elegida en Ejecutar.

## Próximos pasos
- Cola de gastos sin conexión + que la app abra siempre con datos flojos: plan hecho,
  falta que el usuario decida los casos límite antes de implementar.
- Cuando toda la familia migre: propiedad `UI_VIEJA` = `no` y archivar las implementaciones viejas.
- Guía corta para pasar la app a otra familia.
