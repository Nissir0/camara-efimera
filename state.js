/**
 * Estado efímero de la app.
 *
 * La foto vive ACÁ y en ningún otro lado: un Blob en memoria más un
 * object URL para poder mostrarlo en un <img>. Nada de localStorage,
 * nada de IndexedDB, nada de Cache API. Cuando se descarta o se envía,
 * `clearPhoto()` revoca el URL y suelta la referencia al Blob para que
 * el recolector de basura lo libere.
 */

const state = {
  /** @type {{ blob: Blob, url: string, file: File } | null} */
  photo: null,
  caption: '',
};

/**
 * Guarda la foto recién capturada. Si ya había una, la libera primero.
 * @param {Blob} blob
 * @param {string} mime
 */
export function setPhoto(blob, mime = 'image/jpeg') {
  clearPhoto();

  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-');

  state.photo = {
    blob,
    url: URL.createObjectURL(blob),
    // El File se crea ACÁ, en el momento del disparo, y no cuando el
    // usuario toca un destino: navigator.share() necesita ejecutarse
    // de forma sincrónica dentro del gesto del usuario, sin un await
    // previo que consuma la activación transitoria.
    file: new File([blob], `foto-${stamp}.${ext}`, {
      type: mime,
      lastModified: Date.now(),
    }),
  };

  return state.photo;
}

/** Libera la foto de memoria. Idempotente. */
export function clearPhoto() {
  if (state.photo) URL.revokeObjectURL(state.photo.url);
  state.photo = null;
  state.caption = '';
}

export default state;
