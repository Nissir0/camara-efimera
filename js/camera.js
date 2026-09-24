/**
 * Captura de cámara vía getUserMedia.
 *
 * Deliberadamente NO se usa <input type="file" accept="image/*" capture>:
 * en iOS ese camino delega en la app Cámara del sistema y la foto puede
 * terminar en el carrete. Con getUserMedia el frame nunca sale del
 * proceso del navegador.
 */

let stream = null;
let facingMode = 'environment';
let torchOn = false;

export function isSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function track() {
  return stream ? stream.getVideoTracks()[0] || null : null;
}

/**
 * Traduce el error de getUserMedia a algo que se pueda leer en pantalla.
 * @returns {{ title: string, message: string }}
 */
export function describeError(err) {
  const name = err && err.name;

  if (!window.isSecureContext) {
    return {
      title: 'Se necesita HTTPS',
      message:
        'La cámara solo funciona en una página servida por HTTPS (o en localhost). ' +
        'Abrí la app desde su dirección https://…',
    };
  }

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        title: 'Permiso de cámara denegado',
        message:
          'Habilitá la cámara en Ajustes › Safari › Cámara (o tocá «aA» en la barra ' +
          'de direcciones › Ajustes del sitio web) y volvé a intentar.',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        title: 'No se encontró una cámara',
        message: 'El dispositivo no expone ninguna cámara utilizable para el navegador.',
      };
    case 'NotReadableError':
      return {
        title: 'La cámara está ocupada',
        message: 'Otra app está usando la cámara. Cerrala y volvé a intentar.',
      };
    default:
      return {
        title: 'No se pudo acceder a la cámara',
        message:
          (err && err.message) ||
          'Error desconocido al iniciar el stream de video.',
      };
  }
}

/**
 * Arranca el stream y lo enchufa al <video>.
 * @param {HTMLVideoElement} video
 */
export async function start(video) {
  if (!isSupported()) {
    const standalone =
      window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    const err = new Error(
      standalone
        ? 'Esta versión de iOS no permite usar la cámara en apps agregadas a la ' +
          'pantalla de inicio. Se necesita iOS 14.3 o posterior; mientras tanto, ' +
          'abrí la app desde Safari.'
        : 'Este navegador no expone navigator.mediaDevices.getUserMedia.'
    );
    err.name = 'UnsupportedError';
    throw err;
  }

  stop();

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  video.srcObject = stream;
  torchOn = false;

  // Safari a veces no arranca solo aunque el elemento tenga autoplay.
  try {
    await video.play();
  } catch {
    /* el usuario ya interactuó al dar permiso; ignorable */
  }

  return stream;
}

export function stop() {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  torchOn = false;
}

export function isRunning() {
  const t = track();
  return !!t && t.readyState === 'live';
}

/** Alterna entre cámara trasera y frontal y reinicia el stream. */
export async function flip(video) {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  return start(video);
}

/**
 * El control de linterna casi nunca está disponible en Safari iOS.
 * Se expone con feature detection: si no está, la UI oculta el botón.
 */
export function hasTorch() {
  const t = track();
  if (!t || typeof t.getCapabilities !== 'function') return false;
  try {
    return 'torch' in t.getCapabilities();
  } catch {
    return false;
  }
}

export async function toggleTorch() {
  const t = track();
  if (!t || !hasTorch()) return false;
  torchOn = !torchOn;
  try {
    await t.applyConstraints({ advanced: [{ torch: torchOn }] });
  } catch {
    torchOn = false;
  }
  return torchOn;
}

/**
 * Toma el frame actual del <video>, lo dibuja en el canvas y devuelve
 * un Blob JPEG. Se resuelve antes de que el usuario elija destino, así
 * el tap posterior puede llamar a navigator.share() sin awaits de por medio.
 *
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 * @param {{ maxSize: number, quality: number }} opts
 * @returns {Promise<Blob>}
 */
export function capture(video, canvas, opts) {
  const sw = video.videoWidth;
  const sh = video.videoHeight;

  if (!sw || !sh) {
    return Promise.reject(new Error('El video todavía no tiene un frame disponible.'));
  }

  const max = Number(opts.maxSize) || 0;
  const scale = max > 0 ? Math.min(1, max / Math.max(sw, sh)) : 1;

  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);

  const ctx = canvas.getContext('2d');

  // La cámara frontal se ve espejada en pantalla; la guardamos sin espejar
  // para que el texto de la escena quede legible.
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // El canvas se limpia enseguida: no queremos un frame colgado en
        // memoria de video más tiempo del necesario.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;

        if (blob) resolve(blob);
        else reject(new Error('El navegador no pudo codificar la imagen.'));
      },
      'image/jpeg',
      Math.min(1, Math.max(0.3, Number(opts.quality) || 0.85))
    );
  });
}
