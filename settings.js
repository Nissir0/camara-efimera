/**
 * Preferencias de captura. Esto sí se persiste en localStorage:
 * es metadata de configuración, no contenido de la foto.
 */

const KEY = 'ce:settings';

const DEFAULTS = {
  maxSize: 1600,     // lado mayor en px; 0 = resolución nativa
  quality: 0.85,     // calidad JPEG
  confirmDiscard: false,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = read();

export function getSettings() {
  return { ...current };
}

export function updateSettings(patch) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* modo privado o cuota llena: seguimos con el valor en memoria */
  }
  return getSettings();
}
