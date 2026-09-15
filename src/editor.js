// El lienzo: textarea transparente, capa de formato, caret propio y la mira.
//
// El textarea recibe todas las teclas y todos los clics, pero no dibuja nada:
// su texto es transparente. Lo que se ve es la capa de formato (`gloss`), que
// contiene los mismos caracteres con los tramos enfatizados marcados. Sobre esa
// capa se mide la posición del caret y el rectángulo de cada glifo — el caret
// nativo también está oculto y se dibuja uno propio.
//
// Con el formato apagado la capa sigue siendo la que se ve, sólo que sin
// ningún énfasis: así el camino de medición es uno solo en ambos casos.

import { state, THEMES, SIZES, LEADING, faceFor } from './state.js';
import { renderGloss, caretRect, glyphRects } from './gloss.js';

let el = {};
let rects = null;
let cursorMode = null;
let moveRaf = null;
let painted = null; // último texto volcado en la capa

export function initEditor(nodes) {
  el = nodes;
}

export function applyVars() {
  const r = document.documentElement.style;
  const t = THEMES[state.theme];
  r.setProperty('--ff', faceFor(state.font).ff);
  r.setProperty('--fs', SIZES[state.size]);
  r.setProperty('--lh', LEADING[state.lead]);
  r.setProperty('--ls', (state.tracking ?? -0.012) + 'em');
  r.setProperty('--paper', t.paper);
  r.setProperty('--ink', t.ink);
  r.setProperty('--caret', t.caret);
  document.body.style.background = t.paper;
}

export function grow() {
  el.area.style.height = 'auto';
  el.area.style.height = Math.max(el.area.scrollHeight, window.innerHeight) + 'px';
}

/** Vuelve a volcar la capa. Sólo si el texto cambió: mover el caret no la toca. */
export function paintGloss(force) {
  const text = el.area.value;
  if (!force && text === painted) return;
  renderGloss(el.gloss, text);
  painted = text;
  rects = null;
}

export function sync() {
  paintGloss();
  rects = null;

  const cs = getComputedStyle(el.area);
  const fs = parseFloat(cs.fontSize);
  const lh = parseFloat(cs.lineHeight) || fs * 1.24;

  const box = caretRect(el.gloss, el.area.selectionEnd || 0);
  el.caret.style.width = Math.max(8, Math.round(fs * 0.15)) + 'px';
  el.caret.style.height = Math.round(lh * 0.92) + 'px';

  // Sin medida no se deja la posición anterior: quedaría un caret mintiendo
  // sobre dónde se va a escribir. Se manda al origen del texto.
  if (!box) {
    el.caret.style.left = cs.paddingLeft;
    el.caret.style.top = cs.paddingTop;
    return;
  }
  // El rectángulo de un rango colapsado abarca la altura de la línea; el
  // bloque del caret es algo más corto y se centra en ella.
  el.caret.style.left = Math.round(box.left) + 'px';
  el.caret.style.top = Math.round(box.top + (box.height - lh * 0.92) / 2) + 'px';
}

export function dropRects() {
  rects = null;
}

function overText(x, y) {
  if (!rects) rects = glyphRects(el.gloss);
  const p = 2;
  return rects.some((b) => x >= b.left - p && x <= b.right + p && y >= b.top - p && y <= b.bottom + p);
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
