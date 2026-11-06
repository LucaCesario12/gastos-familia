# Gastos – app instalable de la familia

App para cargar y ver los gastos de la familia. Los datos siguen viviendo en la planilla de Google; la app es una página instalable (PWA) que habla con la planilla a través de Apps Script.

```
appGastos/
├── apps-script/
│   ├── Codigo.gs     ← se pega en el proyecto de Apps Script (incluye la API nueva)
│   └── Index.html    ← pantalla vieja, solo como respaldo (opcional)
└── docs/             ← la app instalable; GitHub Pages publica esta carpeta
    ├── index.html, estilos.css, app.js, api.js
    ├── sw.js, manifest.webmanifest
    └── icons/
```

La app vieja (la web app de Apps Script) sigue funcionando mientras armás esto: no se toca nada de lo que ya usan.

---

## Paso 1 · Actualizar Apps Script

1. Hacé una copia de la planilla (Archivo → Hacer una copia), por las dudas.
2. Abrí el proyecto de Apps Script de la planilla. En **Código.gs**: `Ctrl+A` y pegá el contenido de `apps-script/Codigo.gs`.
3. Revisá que no haya archivos "Copia de…" en el proyecto; si hay, borralos.
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Implementar y autorizar los permisos.

   *(Es una implementación nueva: la anterior queda como está. Que sea "Cualquier usuario" es normal: sin la clave de la familia, nadie puede leer ni escribir nada.)*
5. En el editor, elegí la función **`crearCodigoFamilia`** en el menú desplegable y tocá **Ejecutar**.
6. Abrí el **registro de ejecución**. Vas a ver la dirección (tiene que terminar en `/exec`), la clave y una línea que empieza con **`GASTOS1.`**: ese es el **código de la familia**. Copialo entero.

> Guardá el código como si fuera una contraseña: quien lo tiene puede cargar y ver gastos. Si se filtra, corré `renovarClaveFamilia` y repartí el código nuevo.

## Paso 2 · Subir la app a GitHub Pages

1. Creá una cuenta en github.com y un repositorio **público** nuevo (por ejemplo `gastos-familia`). No hay nada secreto en el código: la clave y la dirección de la planilla viajan solo en el código de la familia.
2. En una terminal, dentro de la carpeta `appGastos`:

   ```bash
   git init -b main
   git add .
   git commit -m "App de gastos"
   git remote add origin https://github.com/TU_USUARIO/gastos-familia.git
   git push -u origin main
   ```

   La primera vez te pide iniciar sesión en GitHub desde el navegador.
3. En el repositorio: **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, carpeta **`/docs`** → Save.
4. En uno o dos minutos la app queda en `https://TU_USUARIO.github.io/gastos-familia/`.

## Paso 3 · Instalarla en cada celular

Mandales por WhatsApp este link (el código va después del `#c=`):

```
https://TU_USUARIO.github.io/gastos-familia/#c=GASTOS1.xxxxxxxx
```

**Android (Chrome):** abrí el link → se conecta sola → menú ⋮ → *Instalar app* (o *Agregar a la pantalla principal*).

**iPhone (Safari, iOS 16.4 o más nuevo):** abrí el link para comprobar que conecta → botón Compartir → *Agregar a inicio*. En iPhone la app instalada guarda sus datos aparte de Safari, así que **al abrirla por primera vez desde el ícono pide el código**: pegá el código de la familia (el `GASTOS1.…` que recibieron) y listo.

Después de conectar, cada persona elige **¿Quién sos?** una sola vez (se puede cambiar desde arriba).

## Cuando todos migraron

Para apagar la pantalla vieja: en Apps Script → Configuración del proyecto → Propiedades de la secuencia de comandos → agregá `UI_VIEJA` = `no`. La dirección vieja pasa a mostrar un cartel y la app nueva no se afecta.

## Seguridad

- **Verificación en dos pasos** en la cuenta de Google dueña de la planilla y en la cuenta de GitHub. Es lo que más protege: quien entre a una de las dos controla la planilla o la app.
- **Se perdió o se regaló un celular:** en ese celular, "¿Quién sos?" → **Desconectar este celular**. Si no lo tenés a mano, en Apps Script ejecutá `renovarClaveFamilia`, copiá el código nuevo del registro y repartilo: los celulares con la clave vieja dejan de funcionar hasta que lo peguen.
- **El código de la familia es como una contraseña.** Después de instalar la app, borrá el mensaje de WhatsApp que lo tiene.
- **Funciones de la clave:** `crearCodigoFamilia` y `renovarClaveFamilia` solo las puede ejecutar el dueño del script desde el editor. Si aparece "Solo el dueño del script puede hacer esto", revisá que estés en el editor con la cuenta dueña.
- **Pantalla vieja:** cuando toda la familia use la app nueva, agregá la propiedad `UI_VIEJA` = `no` y archivá las implementaciones viejas en **Implementar → Administrar implementaciones**. Mientras esté abierta, quien tenga el link viejo opera la planilla sin clave.
- **Textos con `=`, `+`, `-` o `@` al principio** se guardan como texto común, no como fórmula.
- **Política de contenido:** `docs/index.html` solo permite el código de la propia app y las llamadas a `script.google.com`. Si algún día se agrega otro servicio o un script en línea, hay que actualizar esa política.

## Hacer cambios a la app

Los celulares se actualizan solos al abrir la app: aparece un cartel "Hay una versión nueva" con un botón *Actualizar*. Para que el cambio se note:

1. Editá lo que necesites en `docs/`.
2. Subí el número de `VERSION` en `docs/sw.js` y en `docs/app.js` (por ejemplo `1.0.1`).
3. `git add . && git commit -m "…" && git push`.

Los cambios en `Codigo.gs` se pegan en Apps Script y se publican con **Implementar → Administrar implementaciones → editar → Nueva versión**.

## Sin señal

La app abre siempre, aunque los datos estén flojos. Si al guardar un gasto no hay señal (o tarda más de 12 segundos), el gasto queda guardado en el celular: arriba aparece "N sin enviar". Se envía solo cuando la app se abre o vuelve la conexión, y desde esa pastilla se puede ver la lista, enviar ahora o borrar. Editar, borrar y omitir fijos sí necesitan conexión.
