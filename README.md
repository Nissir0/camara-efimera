# Cámara Efímera

PWA para iPhone: saca una foto, la deja **solo en memoria** y la manda al panel de
compartir de iOS. No pasa por la app Cámara nativa, así que no queda en el carrete,
y no se escribe en `localStorage` ni en `IndexedDB`.

HTML/CSS/JS puro, sin build, sin backend, sin frameworks.

---

## Estructura

```
camara-efimera/
├── index.html              Las 4 vistas como <section> en un solo SPA
├── manifest.webmanifest    display: standalone, íconos, theme-color
├── sw.js                   Service worker: cachea assets, nada más
├── css/styles.css          Mobile-first, respeta safe-area del notch
└── js/
    ├── app.js              Router de vistas + wiring de eventos
    ├── state.js            Store en memoria (la foto vive acá y solo acá)
    ├── camera.js           getUserMedia, stream, captura a canvas → Blob
    ├── share.js            Web Share API + fallback de descarga
    ├── destinations.js     CRUD de destinos en localStorage
    └── settings.js         Resolución, calidad, confirmar-antes-de-descartar
```

## Desplegar en GitHub Pages

1. Creá un repo nuevo en GitHub (público es suficiente; Pages en repos privados
   requiere plan pago).

2. Desde la carpeta del proyecto:

   ```bash
   git init
   git add .
   git commit -m "Cámara Efímera"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/camara-efimera.git
   git push -u origin main
   ```

   Si preferís no usar la terminal: en el repo vacío, **Add file › Upload files**,
   arrastrá el contenido de la carpeta (no la carpeta en sí) y confirmá.

3. En el repo: **Settings › Pages**. En *Source* elegí **Deploy from a branch**,
   rama `main`, carpeta `/ (root)`. Guardá.

4. Al minuto queda en `https://TU-USUARIO.github.io/camara-efimera/`, con HTTPS
   por defecto — que es obligatorio: sin él ni `getUserMedia` ni `navigator.share`
   funcionan.

Cada vez que cambies un archivo, subí el número de `VERSION` en `sw.js`
(`v1` → `v2`), o el service worker va a seguir sirviendo la versión vieja.

## Instalar en el iPhone

1. Abrí la URL **en Safari** (no en Chrome ni desde el navegador embebido de
   WhatsApp: en iOS solo Safari puede instalar PWAs).
2. Botón de compartir (⬆️) › **Agregar a pantalla de inicio** › **Agregar**.
3. Abrila desde el ícono. Arranca sin barra de Safari, a pantalla completa.
4. La primera vez pide permiso de cámara. Es un permiso propio del ícono
   instalado, distinto del que le hayas dado a Safari.

## Cómo funciona el flujo

| Paso | Qué pasa | Dónde queda la foto |
|---|---|---|
| Disparo | Se dibuja el frame del `<video>` en un `<canvas>` y se codifica a JPEG | `Blob` + `File` en una variable JS |
| Preview | Se muestra con un `blob:` URL temporal | La misma variable |
| Compartir | `navigator.share({ files })` abre el panel de iOS | La app de destino se queda con una copia |
| Enviado / Descartado | `URL.revokeObjectURL()` y se suelta la referencia | Nada, el recolector la libera |

El `<canvas>` se limpia y se reduce a 0×0 apenas se genera el Blob.

## Decisiones técnicas que importan

**`navigator.share()` necesita el gesto del usuario.** Si entre el tap y la llamada
hay un `await`, iOS considera consumida la activación transitoria y rechaza con
`NotAllowedError`. Por eso el `File` se arma en el momento del disparo
(`state.setPhoto`) y no cuando elegís destino: así el handler del tap llama a
`share()` de forma sincrónica.

**Los destinos favoritos son etiquetas, no deep links.** La Web Share API no deja
elegir la app de destino desde el código — siempre abre el panel completo del
sistema y ahí seleccionás. No existe forma de mandar una imagen adjunta a un chat
concreto de WhatsApp desde la web. La UI lo dice explícitamente.

**Nada de `<input type="file" capture>`.** En iOS ese camino a veces delega en la
app Cámara del sistema, que sí guarda en el carrete. `getUserMedia` mantiene todo
dentro del navegador.

**El flash no existe en Safari iOS.** La constraint `torch` no está expuesta. El
botón se muestra solo si `getCapabilities()` lo reporta; en un iPhone, nunca.

**Fallback de descarga.** Si `navigator.canShare({ files })` da `false`, aparece un
botón de descarga con la advertencia de que ese camino sí deja el archivo guardado.

## Limitaciones conocidas de iOS

- **iOS 14.3 o posterior** para usar la cámara desde una app agregada a la pantalla
  de inicio. En versiones anteriores hay que abrirla desde Safari; la app detecta el
  caso y lo avisa.
- **iOS 15 o posterior** para compartir archivos con `navigator.share`.
- Al mandar la app al fondo, iOS suspende el stream. Se reanuda solo al volver
  (`visibilitychange`).
- Los destinos y los ajustes viven en `localStorage`, que Safari puede borrar tras
  ~7 días sin usar la app. Es solo configuración: se pierde la lista, nunca fotos.

## Probarlo localmente

`getUserMedia` exige contexto seguro, pero `localhost` cuenta como tal:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Para probar desde el iPhone en la red local hace falta HTTPS real; lo más simple
es subirlo a Pages y probar ahí directamente.
