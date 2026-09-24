/**
 * Cámara Efímera — orquestación de vistas y wiring de eventos.
 * Vanilla JS, sin dependencias. Módulos ES nativos.
 */

import state, { setPhoto, clearPhoto } from './state.js';
import { getSettings, updateSettings } from './settings.js';
import * as camera from './camera.js';
import * as dest from './destinations.js';
import { canShareFile, shareFile, isCancellation, downloadFallback } from './share.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  views: {
    camera:       $('#view-camera'),
    preview:      $('#view-preview'),
    destinations: $('#view-destinations'),
    settings:     $('#view-settings'),
  },
  video:        $('#video'),
  canvas:       $('#canvas'),
  shutter:      $('#btn-shutter'),
  flip:         $('#btn-flip'),
  torch:        $('#btn-torch'),
  gear:         $('#btn-settings'),
  camError:     $('#camera-error'),
  camErrorTtl:  $('#camera-error-title'),
  camErrorMsg:  $('#camera-error-msg'),
  retry:        $('#btn-retry-camera'),

  previewImg:   $('#preview-img'),
  caption:      $('#caption'),
  destGrid:     $('#dest-grid'),
  discard:      $('#btn-discard'),
  shareGeneric: $('#btn-share-generic'),
  download:     $('#btn-download'),

  destList:     $('#dest-list'),
  destForm:     $('#dest-form'),
  destEmoji:    $('#dest-emoji'),
  destName:     $('#dest-name'),
  destColor:    $('#dest-color'),
  destSubmit:   $('#dest-submit'),
  destCancel:   $('#dest-cancel'),
  openDest:     $('#btn-open-dest'),

  setSize:      $('#set-size'),
  setQuality:   $('#set-quality'),
  setQualityOut:$('#set-quality-out'),
  setConfirm:   $('#set-confirm'),

  overlay:      $('#overlay'),
  overlayText:  $('#overlay-text'),
  toast:        $('#toast'),
};

let currentView = 'camera';
const navStack = ['camera'];
let editingId = null;
let toastTimer = null;

/* ── Router ─────────────────────────────────────────────────── */

/** Navega a una vista apilándola, para que «Volver» sepa a dónde ir. */
function push(name) {
  navStack.push(name);
  showView(name);
}

function back() {
  if (navStack.length > 1) navStack.pop();
  showView(navStack[navStack.length - 1]);
}

/** Vuelve a la raíz (cámara) descartando el historial de hojas. */
function resetTo(name) {
  navStack.length = 0;
  navStack.push(name);
  showView(name);
}

async function showView(name) {
  if (name === currentView) return;

  const leavingCamera = currentView === 'camera';
  currentView = name;

  for (const [key, node] of Object.entries(el.views)) {
    node.hidden = key !== name;
  }

  if (name === 'camera') {
    await ensureCamera();
  } else if (leavingCamera) {
    // Apagamos el stream fuera de la vista de cámara: ahorra batería y
    // apaga el indicador de cámara en uso de iOS.
    camera.stop();
  }

  if (name === 'destinations') renderDestList();
  if (name === 'settings') renderSettings();
}

/* ── Cámara ─────────────────────────────────────────────────── */

async function ensureCamera() {
  if (camera.isRunning()) return;

  el.camError.hidden = true;
  el.shutter.disabled = true;

  try {
    await camera.start(el.video);
    el.shutter.disabled = false;
    el.torch.hidden = !camera.hasTorch();
    el.torch.setAttribute('aria-pressed', 'false');
  } catch (err) {
    const info = camera.describeError(err);
    el.camErrorTtl.textContent = info.title;
    el.camErrorMsg.textContent = info.message;
    el.camError.hidden = false;
    el.shutter.disabled = true;
  }
}

function flashEffect() {
  const node = document.createElement('div');
  node.className = 'flash';
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 300);
}

async function onShutter() {
  if (el.shutter.disabled) return;
  el.shutter.disabled = true;

  try {
    const s = getSettings();
    const blob = await camera.capture(el.video, el.canvas, s);
    setPhoto(blob, 'image/jpeg');
    flashEffect();
    openPreview();
  } catch (err) {
    toast(err.message || 'No se pudo tomar la foto.');
  } finally {
    el.shutter.disabled = false;
  }
}

/* ── Preview ────────────────────────────────────────────────── */

function openPreview() {
  el.previewImg.src = state.photo.url;
  el.caption.value = state.caption || '';

  const shareable = canShareFile(state.photo.file);
  el.shareGeneric.hidden = !shareable;
  el.download.hidden = shareable;
  el.destGrid.hidden = !shareable;

  if (!shareable) {
    toast('Este navegador no puede compartir archivos. Queda la descarga como alternativa.');
  }

  renderDestGrid();
  push('preview');
}

function renderDestGrid() {
  el.destGrid.textContent = '';

  for (const d of dest.list()) {
    const btn = document.createElement('button');
    btn.className = 'dest';
    btn.type = 'button';
    btn.dataset.id = d.id;

    const badge = document.createElement('span');
    badge.className = 'dest__badge';
    badge.style.background = d.color;
    badge.textContent = d.emoji;

    const name = document.createElement('span');
    name.className = 'dest__name';
    name.textContent = d.name;

    btn.append(badge, name);
    el.destGrid.appendChild(btn);
  }
}

/**
 * Sub-estado B → C. Todo lo que pasa antes de shareFile() es sincrónico
 * a propósito: si metemos un await acá, iOS pierde el gesto del usuario.
 */
function doShare() {
  const photo = state.photo;
  if (!photo) return;

  state.caption = el.caption.value;

  if (!canShareFile(photo.file)) {
    toast('Compartir archivos no está disponible en este navegador.');
    el.download.hidden = false;
    return;
  }

  setOverlay('Compartiendo…', false);

  shareFile(photo.file, state.caption)
    .then(onShareSuccess)
    .catch(onShareFailure);
}

function onShareSuccess() {
  setOverlay('Enviado ✓', true);

  setTimeout(() => {
    hideOverlay();
    el.previewImg.removeAttribute('src');
    el.caption.value = '';
    clearPhoto();           // la foto sale de memoria acá
    resetTo('camera');
  }, 900);
}

function onShareFailure(err) {
  hideOverlay();
  if (isCancellation(err)) return;  // vuelve al sub-estado A, sin borrar nada
  toast('No se pudo compartir: ' + (err && err.message ? err.message : 'error desconocido'));
}

function onDiscard() {
  if (getSettings().confirmDiscard) {
    const ok = window.confirm('¿Descartar la foto? No se guarda en ningún lado.');
    if (!ok) return;
  }
  el.previewImg.removeAttribute('src');
  el.caption.value = '';
  clearPhoto();
  resetTo('camera');
}

/* ── Destinos favoritos ─────────────────────────────────────── */

function renderDestList() {
  el.destList.textContent = '';
  const items = dest.list();

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.style.border = 'none';
    li.style.background = 'none';
    li.textContent = 'Todavía no agregaste destinos.';
    el.destList.appendChild(li);
    return;
  }

  items.forEach((d, i) => {
    const li = document.createElement('li');
    li.dataset.id = d.id;

    const badge = document.createElement('span');
    badge.className = 'dest__badge';
    badge.style.background = d.color;
    badge.textContent = d.emoji;

    const name = document.createElement('span');
    name.className = 'destlist__name';
    name.textContent = d.name;

    li.append(badge, name);

    li.append(
      miniBtn('↑', 'Subir', 'up', i === 0),
      miniBtn('↓', 'Bajar', 'down', i === items.length - 1),
      miniBtn('✎', 'Editar', 'edit', false),
      miniBtn('✕', 'Eliminar', 'del', false, true),
    );

    el.destList.appendChild(li);
  });
}

function miniBtn(label, aria, action, disabled, danger) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'minibtn' + (danger ? ' minibtn--danger' : '');
  b.textContent = label;
  b.setAttribute('aria-label', aria);
  b.dataset.action = action;
  b.disabled = !!disabled;
  return b;
}

function startEdit(d) {
  editingId = d.id;
  el.destEmoji.value = d.emoji;
  el.destName.value = d.name;
  el.destColor.value = d.color;
  el.destSubmit.textContent = 'Guardar';
  el.destCancel.hidden = false;
  el.destName.focus();
}

function resetForm() {
  editingId = null;
  el.destForm.reset();
  el.destColor.value = '#3b82f6';
  el.destSubmit.textContent = 'Agregar';
  el.destCancel.hidden = true;
}

/* ── Ajustes ────────────────────────────────────────────────── */

function renderSettings() {
  const s = getSettings();
  el.setSize.value = String(s.maxSize);
  el.setQuality.value = String(Math.round(s.quality * 100));
  el.setQualityOut.textContent = String(Math.round(s.quality * 100));
  el.setConfirm.checked = !!s.confirmDiscard;
}

/* ── Overlay y toast ────────────────────────────────────────── */

function setOverlay(text, done) {
  el.overlayText.textContent = text;
  el.overlay.classList.toggle('overlay--done', !!done);
  el.overlay.querySelector('.spinner').textContent = done ? '✓' : '';
  el.overlay.hidden = false;
}

function hideOverlay() {
  el.overlay.hidden = true;
  el.overlay.classList.remove('overlay--done');
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3600);
}

/* ── Eventos ────────────────────────────────────────────────── */

el.shutter.addEventListener('click', onShutter);
el.retry.addEventListener('click', ensureCamera);
el.gear.addEventListener('click', () => push('settings'));

el.flip.addEventListener('click', async () => {
  el.shutter.disabled = true;
  try {
    await camera.flip(el.video);
    el.torch.hidden = !camera.hasTorch();
  } catch (err) {
    toast(camera.describeError(err).message);
  } finally {
    el.shutter.disabled = !camera.isRunning();
  }
});

el.torch.addEventListener('click', async () => {
  const on = await camera.toggleTorch();
  el.torch.setAttribute('aria-pressed', on ? 'true' : 'false');
});

el.destGrid.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.dest');
  if (btn) doShare();
});

el.shareGeneric.addEventListener('click', doShare);
el.discard.addEventListener('click', onDiscard);
el.download.addEventListener('click', () => {
  if (state.photo) downloadFallback(state.photo);
});

el.caption.addEventListener('input', () => { state.caption = el.caption.value; });

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', back);
});

el.openDest.addEventListener('click', () => push('destinations'));

el.destList.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.minibtn');
  if (!btn) return;
  const id = btn.closest('li').dataset.id;

  switch (btn.dataset.action) {
    case 'up':   dest.move(id, -1); break;
    case 'down': dest.move(id, 1);  break;
    case 'edit': startEdit(dest.find(id)); return;
    case 'del':
      if (window.confirm('¿Eliminar este destino?')) {
        dest.remove(id);
        if (editingId === id) resetForm();
      }
      break;
  }
  renderDestList();
});

el.destForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const payload = {
    name: el.destName.value,
    emoji: el.destEmoji.value || '📦',
    color: el.destColor.value,
  };
  if (editingId) dest.update(editingId, payload);
  else dest.add(payload);
  resetForm();
  renderDestList();
});

el.destCancel.addEventListener('click', resetForm);

el.setSize.addEventListener('change', () => {
  updateSettings({ maxSize: Number(el.setSize.value) });
});

el.setQuality.addEventListener('input', () => {
  el.setQualityOut.textContent = el.setQuality.value;
  updateSettings({ quality: Number(el.setQuality.value) / 100 });
});

el.setConfirm.addEventListener('change', () => {
  updateSettings({ confirmDiscard: el.setConfirm.checked });
});

// iOS suspende el stream al mandar la app al fondo: lo reanudamos al volver.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    camera.stop();
  } else if (currentView === 'camera') {
    ensureCamera();
  }
});

window.addEventListener('pagehide', () => {
  camera.stop();
  clearPhoto();
});

/* ── Arranque ───────────────────────────────────────────────── */

resetForm();
ensureCamera();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {
      /* sin SW la app sigue funcionando, solo pierde el cacheo */
    });
  });
}
