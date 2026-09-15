// Orquestación: interfaz, eventos y la mezcla entre lo local y la nube.

import {
  state, active, saveLocal, saveSoon, freshDoc, now,
  titleOf, words, countLabel, ago, slug,
  faces, hasFace, faceFor,
  SIZES, LEADING, THEMES, TRACKING, FONT_FORMAT, FONT_MIME,
  matches, snippet
} from './state.js';

import { indent, outdent, toggleMark, remove } from './textops.js';
import { BOLD, ITALIC, isMark, strip, toMarkdown, fromMarkdown } from './marks.js';
import { render } from './markdown.js';

import {
  initEditor, applyVars, grow, sync, paintGloss, dropRects, setCursor, refreshCursor, trackCursor
} from './editor.js';
import * as cloud from './cloud.js';

const $ = (id) => document.getElementById(id);
const el = {};
for (const id of [
  'sheet', 'bar', 'stamp', 'stampName', 'stampCount', 'stampSync', 'gloss',
  'caret', 'area', 'menu', 'faces', 'faceList', 'faceNote', 'faceStyles', 'scrim',
  'drawer', 'docs', 'toast', 'toastText', 'file', 'fontFile', 'keys',
  'accountLabel', 'accountHint', 'gate', 'gateForm', 'gateEmail', 'gateNote', 'gateCopy',
  'read', 'tracking', 'trackingValue', 'find', 'findCount', 'glossState',
]) el[id] = $(id);

let typing = false;
let cloudState = 'local';
let pendingUndo = null;
let toastTimer = null;
let pushTimer = null;
let reconciled = false;
let reading = false;
let query = '';

// ---------------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------------

function stamp() {
  const doc = active();
  const n = words(doc.text);
  el.stampName.textContent = titleOf(doc);
  el.stampCount.textContent = n ? countLabel(n) : '';
  // Sincronizado no se anuncia de ninguna forma: es el estado normal. Sólo se
  // escribe lo que conviene notar — que no hay nube, o que algo está subiendo.
  el.stampSync.textContent = { local: 'solo aquí', saving: 'guardando' }[cloudState] || '';
  el.stampSync.title = cloudState === 'synced' ? 'En la nube' : '';
}

function paint() {
  applyVars();
  grow();
  sync();
  stamp();
  if (reading) renderRead();
}

function setTyping(on) {
  if (typing === on) return;
  typing = on;
  el.bar.classList.toggle('away', on && !drawerOpen && !menuOpen && !facesOpen && !reading);
}

function setCloud(mode) {
  if (cloudState === mode) return;
  cloudState = mode;
  stamp();
}

// ---------------------------------------------------------------------------
// Tipografías
// ---------------------------------------------------------------------------

function injectFaces() {
  el.faceStyles.textContent = (state.fonts || [])
    .filter((f) => f.url)
    .map((f) => {
      const fmt = FONT_FORMAT[f.ext] || 'woff2';
      return `@font-face{font-family:"cu-${f.id}";font-display:swap;src:url("${f.url}") format("${fmt}");}`;
    })
    .join('\n');
}

function renderFaces() {
  el.faceList.textContent = '';
  for (const f of faces()) {
    const row = document.createElement('div');
    row.className = 'face' + (f.key === state.font ? ' on' : '');
    row.tabIndex = 0;
    row.setAttribute('role', 'menuitemradio');
    row.setAttribute('aria-checked', f.key === state.font ? 'true' : 'false');

    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.textContent = '●';

    const label = document.createElement('span');
    label.className = 'label';
    label.style.setProperty('--face', f.ff);
    label.textContent = f.label;

    const star = document.createElement('span');
    star.className = 'star' + (f.key === state.defaultFont ? ' on' : '');
    star.setAttribute('role', 'button');
    star.tabIndex = 0;
    star.title = 'Usar por defecto';
    star.setAttribute('aria-label', `Usar ${f.label} por defecto`);
    star.textContent = f.key === state.defaultFont ? '★' : '☆';
    const setDefault = (e) => {
      e.stopPropagation();
      e.preventDefault();
      state.defaultFont = f.key;
      touchSettings();
      renderFaces();
      toast(`${f.label} abrirá por defecto`);
    };
    star.addEventListener('click', setDefault);
    star.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') setDefault(e);
    });

    row.append(tick, label, star);

    if (f.asset) {
      const drop = document.createElement('span');
      drop.className = 'drop';
      drop.setAttribute('role', 'button');
      drop.tabIndex = 0;
      drop.title = 'Quitar';
      drop.setAttribute('aria-label', `Quitar ${f.label}`);
      drop.textContent = '×';
      drop.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        dropFont(f.asset);
      });
      row.append(drop);
    }

    const pick = () => {
      state.font = f.key;
      touchSettings();
      paint();
      renderFaces();
    };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });

    el.faceList.append(row);
  }
}

async function addFont(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!FONT_MIME[ext]) return toast('Usa un archivo woff2, woff, ttf u otf');
  if (!cloud.online()) return toast('Entra a tu cuenta para subir tipografías');

  toast(`Subiendo ${file.name}…`, null, null, 12000);
  try {
    const font = await cloud.uploadFont(file, ext);
    state.fonts = [...(state.fonts || []), font];
    state.font = 'a:' + font.id;
    injectFaces();
    touchSettings();
    paint();
    renderFaces();
    toast(`${font.label} lista`);
  } catch (err) {
    toast(err?.message?.includes('exceeded') ? 'El archivo es demasiado grande' : 'No se pudo subir la fuente');
  }
}

function dropFont(font) {
  state.fonts = (state.fonts || []).filter((f) => f.id !== font.id);
  if (state.font === 'a:' + font.id) state.font = 'b0';
  if (state.defaultFont === 'a:' + font.id) state.defaultFont = 'b0';
  injectFaces();
  touchSettings();
  paint();
  renderFaces();
  cloud.deleteFont(font).catch(() => {});
  toast(`Se quitó ${font.label}`);
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

function touchSettings() {
  state.settingsUpdated = now();
  saveLocal();
  cloud.pushSettings().catch(() => {});
}

function pushSoon(doc) {
  if (!cloud.online()) return;
  clearTimeout(pushTimer);
  setCloud('saving');
  pushTimer = setTimeout(() => cloud.pushDoc(doc), 900);
}

function openDoc(id) {
  saveLocal();
  state.activeId = id;
  el.area.value = active().text;
  el.area.setSelectionRange(el.area.value.length, el.area.value.length);
  paint();
  renderDocs();
  saveLocal();
}

function newDoc() {
  const doc = freshDoc();
  state.docs.unshift(doc);
  openDoc(doc.id);
  closeDrawer();
  el.area.focus();
  cloud.pushDoc(doc).catch(() => {});
  toast('Documento nuevo');
}

function removeDoc(id) {
  const index = state.docs.findIndex((d) => d.id === id);
  if (index < 0) return;
  const doc = state.docs[index];

  state.docs.splice(index, 1);
  if (!state.docs.length) state.docs.push(freshDoc());
  if (state.activeId === id) {
    state.activeId = state.docs[Math.min(index, state.docs.length - 1)].id;
    el.area.value = active().text;
  }
  paint();
  renderDocs();
  saveLocal();
  cloud.deleteDoc(id).catch(() => {});

  pendingUndo = { doc, index };
  toast(`Se eliminó “${titleOf(doc) || 'sin título'}”`, 'Deshacer', () => {
    state.docs.splice(Math.min(pendingUndo.index, state.docs.length), 0, pendingUndo.doc);
    openDoc(pendingUndo.doc.id);
    cloud.pushDoc(pendingUndo.doc).catch(() => {});
    pendingUndo = null;
    toast('Documento restaurado');
  }, 7000);
}

function docRow(doc, hit) {
  const row = document.createElement('div');
  row.className = 'doc' + (doc.id === state.activeId ? ' here' : '') + (hit ? ' found' : '');

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'doc-name' + (titleOf(doc) ? '' : ' blank');
  open.style.cssText = 'border:0;background:transparent;cursor:pointer;text-align:left;padding:0;color:inherit';
  open.textContent = titleOf(doc) || 'Sin título';
  open.addEventListener('click', () => {
    if (hit) openMatch(doc, hit.at);
    else {
      openDoc(doc.id);
      closeDrawer();
      el.area.focus();
    }
  });

  const meta = document.createElement('div');
  meta.className = 'doc-meta';
  meta.textContent = hit && hit.count
    ? `${hit.count} ${hit.count === 1 ? 'coincidencia' : 'coincidencias'} · ${ago(doc.updated)}`
    : `${countLabel(words(doc.text))} · ${ago(doc.updated)}`;

  const ren = document.createElement('button');
  ren.type = 'button';
  ren.className = 'act';
  ren.title = 'Renombrar';
  ren.setAttribute('aria-label', 'Renombrar documento');
  ren.textContent = '✎';
  ren.addEventListener('click', (e) => {
    e.stopPropagation();
    startRename(row, open, doc);
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'act';
  del.title = 'Eliminar';
  del.setAttribute('aria-label', 'Eliminar documento');
  del.textContent = '×';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    removeDoc(doc.id);
  });

  row.append(open, meta, ren, del);

  if (hit && hit.at) {
    const cut = snippet(doc.text, hit.at);
    const line = document.createElement('div');
    line.className = 'hit';
    const mark = document.createElement('mark');
    mark.textContent = cut.hit;
    line.append(document.createTextNode(cut.before), mark, document.createTextNode(cut.after));
    line.addEventListener('click', () => openMatch(doc, hit.at));
    row.append(line);
  }

  return row;
}

function renderDocs() {
  el.docs.textContent = '';

  if (query) {
    const found = results();
    el.findCount.textContent = found.length
      ? `${found.length} de ${state.docs.length}`
      : 'sin resultados';
    if (!found.length) {
      const blank = document.createElement('div');
      blank.className = 'blank-find';
      blank.textContent = `Nada con “${query}”`;
      el.docs.append(blank);
      return;
    }
    for (const hit of found) el.docs.append(docRow(hit.doc, hit));
    return;
  }

  el.findCount.textContent = '';
  const ordered = [...state.docs].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  for (const doc of ordered) el.docs.append(docRow(doc, null));
}

function startRename(row, nameEl, doc) {
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = titleOf(doc);
  input.setAttribute('aria-label', 'Nombre del documento');
  row.replaceChild(input, nameEl);
  input.focus();
  input.select();

  let done = false;
  const commit = (keep) => {
    if (done) return;
    done = true;
    if (keep) {
      doc.name = input.value.trim();
      doc.updated = now();
      saveLocal();
      cloud.pushDoc(doc).catch(() => {});
    }
    renderDocs();
    stamp();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commit(false);
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => commit(true));
}

// ---------------------------------------------------------------------------
// Mezcla con la nube
// ---------------------------------------------------------------------------

function applyRemoteDoc(incoming) {
  const mine = state.docs.find((d) => d.id === incoming.id);
  if (!mine) {
    state.docs.push(incoming);
    return true;
  }
  if (incoming.updated > (mine.updated || 0) && (incoming.text !== mine.text || incoming.name !== mine.name)) {
    mine.name = incoming.name;
    mine.text = incoming.text;
    mine.updated = incoming.updated;
    return true;
  }
  return false;
}

function afterMerge(activeChanged) {
  saveLocal();
  if (activeChanged) {
    const pos = Math.min(el.area.selectionEnd, active().text.length);
    el.area.value = active().text;
    el.area.setSelectionRange(pos, pos);
    grow();
    sync();
  }
  stamp();
  if (drawerOpen) renderDocs();
}

function mergeAll(remote) {
  const seen = new Set();
  let changed = false;
  let activeChanged = false;

  for (const incoming of remote) {
    seen.add(incoming.id);
    if (applyRemoteDoc(incoming)) {
      changed = true;
      if (incoming.id === state.activeId) activeChanged = true;
    }
  }

  // La primera pasada reconcilia en ambos sentidos: lo que sólo existe aquí
  // sube. Después, un documento que ya no está arriba es un borrado hecho en
  // otro dispositivo — salvo que acabe de crearse aquí y su escritura siga en
  // vuelo.
  for (const d of [...state.docs]) {
    if (seen.has(d.id)) continue;
    if (!reconciled || now() - (d.updated || 0) < 8000) {
      cloud.pushDoc(d).catch(() => {});
      continue;
    }
    state.docs.splice(state.docs.indexOf(d), 1);
    changed = true;
    if (d.id === state.activeId) activeChanged = true;
  }

  if (!state.docs.length) state.docs.push(freshDoc());
  if (!state.docs.some((d) => d.id === state.activeId)) {
    state.activeId = state.docs[0].id;
    activeChanged = true;
  }
  reconciled = true;

  if (changed || activeChanged) afterMerge(activeChanged);
}

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

function renderRead() {
  const doc = active();
  const html = render(doc.text);
  el.read.innerHTML = html || '<p class="empty">Este documento está vacío</p>';
}

function setReading(on) {
  reading = on;
  el.read.hidden = !on;
  el.area.hidden = on;
  el.gloss.hidden = on;
  el.caret.hidden = on;
  $('bRead').setAttribute('aria-pressed', on ? 'true' : 'false');
  el.bar.classList.remove('away');

  if (on) {
    renderRead();
    el.read.focus();
  } else {
    grow();
    sync();
    el.area.focus();
  }
}

// ---------------------------------------------------------------------------
// Interletrado
// ---------------------------------------------------------------------------

function showTracking() {
  const v = state.tracking ?? -0.012;
  el.tracking.value = String(v);
  el.trackingValue.textContent = `${v > 0 ? '+' : ''}${v.toFixed(3)} em`;
}

function setTracking(value, persist) {
  const v = Math.min(TRACKING.max, Math.max(TRACKING.min, value));
  state.tracking = Math.round(v * 1000) / 1000;
  showTracking();
  applyVars();
  // El interletrado cambia el ancho de cada línea: el alto del textarea y la
  // posición del caret dependen de eso, así que hay que recalcularlos.
  grow();
  sync();
  if (reading) renderRead();
  if (persist) touchSettings();
  else saveLocal();
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

function results() {
  const out = [];
  for (const doc of state.docs) {
    const inBody = matches(doc.text, query);
    const inName = matches(titleOf(doc), query);
    if (!inBody.length && !inName.length) continue;
    out.push({ doc, count: inBody.length, at: inBody[0] || null });
  }
  return out.sort((a, b) => (b.doc.updated || 0) - (a.doc.updated || 0));
}

function runFind(next) {
  query = next.trim();
  renderDocs();
}

/** Abre el documento y deja seleccionada la coincidencia. */
function openMatch(doc, at) {
  openDoc(doc.id);
  closeDrawer();
  if (reading) setReading(false);
  el.area.focus();
  if (!at) return;
  el.area.setSelectionRange(at.at, at.end);
  sync();
  el.caret.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Superficies
// ---------------------------------------------------------------------------

let drawerOpen = false;
let menuOpen = false;
let facesOpen = false;

function openDrawer() {
  renderDocs();
  drawerOpen = true;
  el.drawer.classList.add('on');
  el.drawer.setAttribute('aria-hidden', 'false');
  el.scrim.classList.add('on');
  $('bDocs').setAttribute('aria-expanded', 'true');
  el.bar.classList.remove('away');
  closeMenu();
  closeFaces();
  if (!query) $('bNew').focus();
}

function closeDrawer() {
  drawerOpen = false;
  el.drawer.classList.remove('on');
  el.drawer.setAttribute('aria-hidden', 'true');
  if (!menuOpen && !facesOpen) el.scrim.classList.remove('on');
  $('bDocs').setAttribute('aria-expanded', 'false');
}

function openMenu() {
  closeFaces();
  menuOpen = true;
  el.menu.classList.add('on');
  el.scrim.classList.add('on');
  $('bOut').setAttribute('aria-expanded', 'true');
  el.bar.classList.remove('away');
  el.menu.querySelector('button').focus();
}

function closeMenu() {
  menuOpen = false;
  el.menu.classList.remove('on');
  if (!drawerOpen && !facesOpen) el.scrim.classList.remove('on');
  $('bOut').setAttribute('aria-expanded', 'false');
}

function openFaces() {
  closeMenu();
  renderFaces();
  facesOpen = true;
  el.faces.classList.add('on');
  el.scrim.classList.add('on');
  $('bFont').setAttribute('aria-expanded', 'true');
  el.bar.classList.remove('away');
}

function closeFaces() {
  facesOpen = false;
  el.faces.classList.remove('on');
  if (!drawerOpen && !menuOpen) el.scrim.classList.remove('on');
  $('bFont').setAttribute('aria-expanded', 'false');
}

const closeAll = () => {
  closeDrawer();
  closeMenu();
  closeFaces();
};

function toast(text, actionLabel, action, ms) {
  clearTimeout(toastTimer);
  el.toastText.textContent = text;
  el.toast.querySelector('button')?.remove();
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = actionLabel;
    b.addEventListener('click', () => {
      hideToast();
      action();
    });
    el.toast.append(b);
  }
  el.toast.classList.add('on');
  toastTimer = setTimeout(hideToast, ms || 2600);
}

function hideToast() {
  el.toast.classList.remove('on');
  el.toast.querySelector('button')?.remove();
}

// ---------------------------------------------------------------------------
// Cuenta
// ---------------------------------------------------------------------------

function reflectAccount() {
  const u = cloud.user();
  if (!cloud.configured()) {
    el.accountLabel.textContent = 'Sin nube';
    el.accountHint.textContent = 'falta configurar supabase';
  } else if (u) {
    el.accountLabel.textContent = 'Salir';
    el.accountHint.textContent = u.email || 'sesión activa';
  } else {
    el.accountLabel.textContent = 'Entrar';
    el.accountHint.textContent = 'sincroniza tus dispositivos';
  }
  $('bAddFont').hidden = !u;
  el.faceNote.textContent = u
    ? 'La estrella marca con cuál abre el cuaderno.'
    : 'La estrella marca con cuál abre el cuaderno. Entra a tu cuenta para subir tipografías.';
}

function openGate() {
  if (!cloud.configured()) {
    toast('Este cuaderno no tiene Supabase configurado');
    return;
  }
  el.gate.hidden = false;
  el.gateNote.textContent = '';
  el.gateNote.className = 'gate-note';
  el.gateEmail.focus();
}

const closeGate = () => {
  el.gate.hidden = true;
  el.area.focus();
};

async function submitGate(e) {
  e.preventDefault();
  const email = el.gateEmail.value.trim();
  if (!email) return;
  const go = $('gateGo');
  go.disabled = true;
  el.gateNote.className = 'gate-note';
  el.gateNote.textContent = 'Enviando…';
  try {
    await cloud.signIn(email);
    el.gateNote.textContent = 'Listo. Abre el enlace que llegó a tu correo.';
  } catch (err) {
    el.gateNote.className = 'gate-note bad';
    el.gateNote.textContent = err?.message || 'No se pudo enviar el enlace.';
  } finally {
    go.disabled = false;
  }
}

async function accountAction() {
  if (cloud.user()) {
    await cloud.signOut();
    toast('Sesión cerrada. Tus textos siguen en este dispositivo.');
  } else {
    closeDrawer();
    openGate();
  }
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Se descargó ${filename}`);
}

function copyText(text) {
  if (!text.trim()) return toast('No hay nada que copiar');
  const done = () => toast('Texto copiado');
  const fail = () => toast('El navegador bloqueó el portapapeles');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fail);
  else fail();
}

function markdownOf(doc) {
  const body = toMarkdown(doc.text);
  const first = (body.split('\n').find((l) => l.trim()) || '').trim();
  const head = doc.name && doc.name !== first ? `# ${doc.name}\n\n` : '';
  return head + body.replace(/\n{3,}/g, '\n\n') + '\n';
}

function backup() {
  const payload = {
    app: 'cuaderno',
    version: 1,
    exported: new Date().toISOString(),
    docs: state.docs.map(({ id, name, text, created, updated }) => ({ id, name, text, created, updated }))
  };
  download(`cuaderno-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const raw = String(reader.result || '');
    const fresh = [];

    if (/\.json$/i.test(file.name)) {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* se reporta abajo */
      }
      const list = Array.isArray(parsed?.docs) ? parsed.docs : null;
      if (!list) return toast('Ese archivo no es un respaldo del cuaderno');
      for (const d of list) {
        if (!d || typeof d.text !== 'string') continue;
        const doc = freshDoc(fromMarkdown(d.text));
        doc.name = typeof d.name === 'string' ? d.name : '';
        fresh.push(doc);
      }
    } else {
      const doc = freshDoc(fromMarkdown(raw));
      doc.name = file.name.replace(/\.(txt|md)$/i, '');
      fresh.push(doc);
    }

    if (!fresh.length) return toast('No se encontraron documentos en el archivo');
    state.docs = fresh.concat(state.docs);
    saveLocal();
    renderDocs();
    for (const d of fresh) cloud.pushDoc(d).catch(() => {});
    toast(fresh.length === 1 ? 'Se importó 1 documento' : `Se importaron ${fresh.length} documentos`);
  };
  reader.onerror = () => toast('No se pudo leer el archivo');
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function cycle(key, len) {
  state[key] = (state[key] + 1) % len;
  paint();
  if (key === 'theme') refreshCursor();
  touchSettings();
  el.area.focus();
}

function reflectGloss() {
  const on = state.gloss !== false;
  el.sheet.classList.toggle('plain', !on);
  el.glossState.textContent = on ? 'activo' : 'apagado';
}

function toggleGloss() {
  state.gloss = state.gloss === false;
  reflectGloss();
  // La cursiva sí cambia el ancho de la línea, así que al encender o apagar
  // hay que rehacer la medida del alto y la del caret.
  paintGloss(true);
  grow();
  sync();
  touchSettings();
}

function wire() {
  $('bSize').addEventListener('click', () => cycle('size', SIZES.length));
  $('bLead').addEventListener('click', () => cycle('lead', LEADING.length));
  $('bTheme').addEventListener('click', () => cycle('theme', THEMES.length));
  $('bFont').addEventListener('click', () => (facesOpen ? closeFaces() : openFaces()));
  $('bDocs').addEventListener('click', () => (drawerOpen ? closeDrawer() : openDrawer()));
  $('bOut').addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
  $('bClose').addEventListener('click', () => {
    closeDrawer();
    el.area.focus();
  });
  $('bNew').addEventListener('click', newDoc);
  $('bBackup').addEventListener('click', backup);
  $('bGloss').addEventListener('click', toggleGloss);
  $('bAccount').addEventListener('click', accountAction);
  $('bImport').addEventListener('click', () => el.file.click());
  $('bAddFont').addEventListener('click', () => el.fontFile.click());
  $('bRead').addEventListener('click', () => setReading(!reading));
  $('bTrackingReset').addEventListener('click', () => setTracking(-0.012, true));
  $('gateSkip').addEventListener('click', closeGate);

  // `input` mientras se arrastra: se repinta en vivo pero sólo se sube al
  // soltar, para no escribir en Supabase en cada paso del deslizador.
  el.tracking.addEventListener('input', () => setTracking(parseFloat(el.tracking.value), false));
  el.tracking.addEventListener('change', () => setTracking(parseFloat(el.tracking.value), true));

  el.find.addEventListener('input', () => runFind(el.find.value));
  el.find.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (el.find.value) {
        el.find.value = '';
        runFind('');
      } else {
        closeDrawer();
        el.area.focus();
      }
      return;
    }
    // Enter salta al primer resultado sin obligar a usar el ratón.
    if (e.key === 'Enter' && query) {
      e.preventDefault();
      const first = results()[0];
      if (first) openMatch(first.doc, first.at);
    }
  });
  el.gateForm.addEventListener('submit', submitGate);

  el.file.addEventListener('change', () => {
    if (el.file.files?.[0]) importFile(el.file.files[0]);
    el.file.value = '';
  });
  el.fontFile.addEventListener('change', () => {
    if (el.fontFile.files?.[0]) addFont(el.fontFile.files[0]);
    el.fontFile.value = '';
  });
  el.scrim.addEventListener('click', () => {
    closeAll();
    el.area.focus();
  });

  el.menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-out]');
    if (!b) return;
    const doc = active();
    // El .txt va sin marcas; el .md y el portapapeles, con asteriscos, que es
    // lo que otras aplicaciones entienden.
    if (b.dataset.out === 'txt') download(`${slug(doc)}.txt`, strip(doc.text));
    else if (b.dataset.out === 'md') download(`${slug(doc)}.md`, markdownOf(doc));
    else copyText(toMarkdown(doc.text));
    closeMenu();
    el.area.focus();
  });

  el.area.addEventListener('input', () => {
    const doc = active();
    doc.text = el.area.value;
    doc.updated = now();
    setTyping(true);
    grow();
    sync();
    stamp();
    saveSoon();
    pushSoon(doc);
  });
  el.area.addEventListener('keydown', (e) => {
    setTyping(true);

    // Una marca invisible comparte sitio en pantalla con la letra vecina, así
    // que una pulsación gastada en saltarla parecería no hacer nada. Estas
    // teclas la atraviesan de un paso.
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      const v = el.area.value;
      const [a, z] = [el.area.selectionStart, el.area.selectionEnd];

      if (e.key === 'ArrowRight' && a === z && isMark(v[z])) {
        e.preventDefault();
        let i = z;
        while (i < v.length && isMark(v[i])) i++;
        el.area.setSelectionRange(Math.min(v.length, i + 1), Math.min(v.length, i + 1));
        sync();
        return;
      }
      if (e.key === 'ArrowLeft' && a === z && isMark(v[a - 1])) {
        e.preventDefault();
        let i = a;
        while (i > 0 && isMark(v[i - 1])) i--;
        el.area.setSelectionRange(Math.max(0, i - 1), Math.max(0, i - 1));
        sync();
        return;
      }
      if (e.key === 'Backspace' && a === z && isMark(v[a - 1])) {
        e.preventDefault();
        let i = a;
        while (i > 0 && isMark(v[i - 1])) i--;
        // Se lleva las marcas y la letra visible de un tirón, para que no
        // queden marcas sueltas colgando donde se borró.
        remove(el.area, Math.max(0, i - 1), a);
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) outdent(el.area);
      else indent(el.area);
      return;
    }

    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b') {
      e.preventDefault();
      toggleMark(el.area, BOLD);
    } else if (k === 'i') {
      e.preventDefault();
      toggleMark(el.area, ITALIC);
    }
  });
  for (const ev of ['keyup', 'click', 'select', 'focus']) {
    el.area.addEventListener(ev, () => requestAnimationFrame(sync));
  }
  el.area.addEventListener('mousemove', (e) => trackCursor(e.clientX, e.clientY));
  el.area.addEventListener('mouseleave', () => setCursor('empty'));

  window.addEventListener('mousemove', () => setTyping(false));
  window.addEventListener('touchstart', () => setTyping(false), { passive: true });
  window.addEventListener('scroll', dropRects, { passive: true });
  window.addEventListener('resize', () => {
    grow();
    sync();
  });
  window.addEventListener('beforeunload', saveLocal);

  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const mod = mac ? '⌘' : 'Ctrl+';
  el.keys.textContent = [
    `${mod}O documentos`,
    `${mod}F buscar`,
    `${mod}${mac ? '⇧N' : 'Shift+N'} nuevo`,
    `${mod}B negrita`,
    `${mod}I cursiva`,
    `${mod}E vista previa`,
    `${mod}D formato en vivo`,
    `${mod}S exportar`,
    'Tab sangría',
    'Esc cerrar'
  ].join(' · ');

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.gate.hidden) return closeGate();
      if (menuOpen || facesOpen || drawerOpen) {
        closeAll();
        el.area.focus();
      } else if (reading) {
        setReading(false);
      }
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'o') {
      e.preventDefault();
      drawerOpen ? closeDrawer() : openDrawer();
    } else if (k === 'n' && e.shiftKey) {
      e.preventDefault();
      newDoc();
    } else if (k === 's') {
      e.preventDefault();
      saveLocal();
      openMenu();
    } else if (k === 'f') {
      e.preventDefault();
      if (!drawerOpen) openDrawer();
      el.find.focus();
      el.find.select();
    } else if (k === 'e') {
      e.preventDefault();
      setReading(!reading);
    } else if (k === 'd') {
      e.preventDefault();
      toggleGloss();
    }
  });

  document.fonts?.ready.then(() => {
    grow();
    sync();
  });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function boot() {
  initEditor(el);

  state.font = hasFace(state.defaultFont) ? state.defaultFont : hasFace(state.font) ? state.font : 'b0';
  reflectGloss();

  injectFaces();
  showTracking();
  el.area.value = active().text;
  applyVars();
  refreshCursor();
  grow();
  sync();
  stamp();
  renderDocs();
  renderFaces();
  reflectAccount();
  wire();
  el.area.focus();
  el.area.setSelectionRange(el.area.value.length, el.area.value.length);

  cloud
    .init({
      onStatus: setCloud,
      onAuth: () => {
        reflectAccount();
        if (cloud.user()) closeGate();
      },
      onDocs: mergeAll,
      onRemoteDoc: (doc) => {
        if (applyRemoteDoc(doc)) afterMerge(doc.id === state.activeId);
      },
      onRemoteDelete: (id) => {
        const i = state.docs.findIndex((d) => d.id === id);
        if (i < 0) return;
        const wasActive = state.docs[i].id === state.activeId;
        state.docs.splice(i, 1);
        if (!state.docs.length) state.docs.push(freshDoc());
        if (wasActive) state.activeId = state.docs[0].id;
        afterMerge(wasActive);
      },
      onSettings: (remote) => {
        if ((remote.updated || 0) <= (state.settingsUpdated || 0)) return;
        state.settingsUpdated = remote.updated;
        if (typeof remote.size === 'number') state.size = remote.size;
        if (typeof remote.lead === 'number') state.lead = remote.lead;
        if (typeof remote.theme === 'number') state.theme = remote.theme;
        if (typeof remote.tracking === 'number') state.tracking = remote.tracking;
        if (typeof remote.gloss === 'boolean') state.gloss = remote.gloss;
        if (typeof remote.defaultFont === 'string') state.defaultFont = remote.defaultFont;
        reflectGloss();
        showTracking();
        saveLocal();
        paint();
      },
      onFonts: (list) => {
        state.fonts = list;
        if (!hasFace(state.font)) state.font = hasFace(state.defaultFont) ? state.defaultFont : 'b0';
        injectFaces();
        saveLocal();
        paint();
        renderFaces();
      }
    })
    .catch(() => setCloud('local'));
}

boot();
