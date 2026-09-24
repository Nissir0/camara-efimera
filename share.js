/**
 * Compartir vía Web Share API (nivel 2, con archivos). Safari iOS 15+.
 *
 * REGLA CRÍTICA: navigator.share() tiene que invocarse dentro del
 * handler del gesto del usuario y sin ningún `await` previo, o iOS
 * pierde la activación transitoria y rechaza con NotAllowedError.
 * Por eso el File ya viene armado desde el disparo (ver state.js) y
 * estas funciones son sincrónicas hasta el momento de la llamada.
 */

/** ¿El navegador puede compartir este archivo? */
export function canShareFile(file) {
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Abre el panel de compartir de iOS.
 * Devuelve la promesa de navigator.share() sin envolverla en async,
 * para no interponer un microtask antes de la llamada.
 *
 * @param {File} file
 * @param {string} [text]
 * @returns {Promise<void>}
 */
export function shareFile(file, text) {
  const payload = { files: [file] };
  const trimmed = (text || '').trim();
  if (trimmed) payload.text = trimmed;

  return navigator.share(payload);
}

/** El usuario cerró el panel sin elegir nada. */
export function isCancellation(err) {
  return !!err && (err.name === 'AbortError' || err.name === 'NotAllowedError');
}

/**
 * Último recurso cuando no hay Web Share API: descarga el archivo.
 * A diferencia del resto del flujo, esto SÍ deja la foto guardada en
 * el dispositivo — la UI lo advierte antes de ofrecerlo.
 *
 * @param {{ url: string, file: File }} photo
 */
export function downloadFallback(photo) {
  const a = document.createElement('a');
  a.href = photo.url;
  a.download = photo.file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
