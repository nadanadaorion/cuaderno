// El lienzo: textarea transparente, caret propio y la mira del cursor.
//
// El caret nativo se oculta y se dibuja uno propio. Para saber dónde va, un
// div espejo invisible reproduce exactamente la tipografía y el ajuste de
// línea del textarea, partido en cabeza / marca / cola: la posición de la
// marca es la del caret. El mismo espejo sirve para medir los rectángulos
// reales de cada glifo y decidir si la mira está sobre texto o sobre el vacío.

import { state, THEMES, SIZES, LEADING, faceFor } from './state.js';

let el = {};
let rects = null;
let cursorMode = null;
let moveRaf = null;

export function initEditor(nodes) {
  el = nodes;
}

export function applyVars() {
  const r = document.documentElement.style;
  const t = THEMES[state.theme];
  r.setProperty('--ff', faceFor(state.font).ff);
  r.setProperty('--fs', SIZES[state.size]);
  r.setProperty('--lh', LEADING[state.lead]);
  r.setProperty('--paper', t.paper);
  r.setProperty('--ink', t.ink);
  r.setProperty('--caret', t.caret);
  document.body.style.background = t.paper;
}

export function grow() {
  el.area.style.height = 'auto';
  el.area.style.height = Math.max(el.area.scrollHeight, window.innerHeight) + 'px';
}

export function sync() {
  const pos = el.area.selectionEnd || 0;
  el.head.textContent = el.area.value.slice(0, pos);
  el.tail.textContent = el.area.value.slice(pos);
  rects = null;

  const cs = getComputedStyle(el.area);
  const fs = parseFloat(cs.fontSize);
  const lh = parseFloat(cs.lineHeight) || fs * 1.24;

  el.caret.style.width = Math.max(8, Math.round(fs * 0.15)) + 'px';
  el.caret.style.height = Math.round(lh * 0.92) + 'px';
  el.caret.style.left = el.marker.offsetLeft + 'px';
  el.caret.style.top = el.marker.offsetTop + Math.round(lh * 0.04) + 'px';
}

export function dropRects() {
  rects = null;
}

function glyphRects() {
  if (rects) return rects;
  const out = [];
  for (const sp of [el.head, el.tail]) {
    if (!sp.firstChild) continue;
    const r = document.createRange();
    r.selectNodeContents(sp);
    for (const box of r.getClientRects()) {
      if (box.width > 0.5 && box.height > 0.5) out.push(box);
    }
  }
  rects = out;
  return out;
}

function overText(x, y) {
  const p = 2;
  return glyphRects().some((b) => x >= b.left - p && x <= b.right + p && y >= b.top - p && y <= b.bottom + p);
}

function reticle(open) {
  const ring = open ? 11 : 13;
  const halo = open ? 6 : 7;
  const core = open ? 2.4 : 3;
  const arms = open ? 'M20 1v8M20 31v8M1 20h8M31 20h8' : 'M20 2v9M20 29v9M2 20h9M29 20h9';
  const dot = open ? '' : "<circle cx='20' cy='20' r='4.5' fill='%230000EE'/>";
  const paper = encodeURIComponent(THEMES[state.theme].paper);
  return (
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>` +
    `<g fill='none' stroke='${paper}' stroke-width='${halo}'><circle cx='20' cy='20' r='${ring}'/><path d='${arms}'/></g>` +
    `<g fill='none' stroke='%230000EE' stroke-width='${core}'><circle cx='20' cy='20' r='${ring}'/><path d='${arms}'/></g>` +
    `${dot}</svg>") 20 20, crosshair`
  );
}

export function setCursor(mode) {
  if (mode === cursorMode) return;
  cursorMode = mode;
  const c = reticle(mode === 'empty');
  el.area.style.cursor = c;
  document.body.style.cursor = c;
}

export function refreshCursor() {
  cursorMode = null;
  setCursor('empty');
}

// El seguimiento del ratón se limita a un cuadro por fotograma: medir los
// rectángulos de cada glifo en cada mousemove tira la fluidez en textos largos.
export function trackCursor(x, y) {
  if (moveRaf) return;
  moveRaf = requestAnimationFrame(() => {
    moveRaf = null;
    setCursor(overText(x, y) ? 'text' : 'empty');
  });
}
