/**
 * Destinos favoritos: CRUD sobre localStorage.
 *
 * Importante: son etiquetas visuales. navigator.share() no permite
 * elegir la app de destino desde el código — siempre abre el panel
 * completo de iOS. Guardar el destino sirve para acordarse rápido
 * "esta foto va para tal grupo" y para prellenar el texto.
 */

const KEY = 'ce:destinations';

const SEED = [
  { id: 'd1', name: 'Grupo de obra', emoji: '🏗️', color: '#f59e0b' },
  { id: 'd2', name: 'Supervisor',    emoji: '👷', color: '#3b82f6' },
  { id: 'd3', name: 'Oficina',       emoji: '📧', color: '#8b5cf6' },
];

function newId() {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return SEED.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sin persistencia disponible: seguimos en memoria */
  }
  return list;
}

let cache = read();

export function list() {
  return cache.slice();
}

export function add({ name, emoji, color }) {
  cache = cache.concat({
    id: newId(),
    name: (name || '').trim().slice(0, 24) || 'Destino',
    emoji: (emoji || '📦').slice(0, 2),
    color: color || '#3b82f6',
  });
  return write(cache);
}

export function update(id, patch) {
  cache = cache.map((d) => {
    if (d.id !== id) return d;
    return {
      ...d,
      ...patch,
      name: ((patch.name ?? d.name) || '').trim().slice(0, 24) || d.name,
      emoji: ((patch.emoji ?? d.emoji) || '📦').slice(0, 2),
    };
  });
  return write(cache);
}

export function remove(id) {
  cache = cache.filter((d) => d.id !== id);
  return write(cache);
}

/** Mueve un destino una posición arriba (-1) o abajo (+1). */
export function move(id, delta) {
  const i = cache.findIndex((d) => d.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= cache.length) return cache;
  const copy = cache.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  cache = copy;
  return write(cache);
}

export function find(id) {
  return cache.find((d) => d.id === id) || null;
}
