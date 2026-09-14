// Estado del cuaderno y su copia local.
//
// La app es local-first: todo vive en localStorage y se pinta desde ahí al
// instante. Supabase, cuando hay sesión, es un espejo que sincroniza — nunca
// un requisito para escribir.

export const BUILTIN = [
  { key: 'b0', label: 'Newsreader', ff: '"Newsreader", Georgia, serif' },
  { key: 'b1', label: 'Work Sans', ff: '"Work Sans", Helvetica, sans-serif' },
  { key: 'b2', label: 'JetBrains Mono', ff: '"JetBrains Mono", monospace' }
];

export const SIZES = ['clamp(22px, 3vw, 40px)', 'clamp(30px, 4.4vw, 62px)', 'clamp(40px, 6.4vw, 92px)'];
export const LEADING = ['1.06', '1.24', '1.62'];
// Interletrado en em: continuo, no por pasos. El mínimo aprieta sin llegar a
// pegar los glifos; el máximo separa sin romper la palabra como unidad.
export const TRACKING = { min: -0.05, max: 0.3, step: 0.002 };
export const THEMES = [
  { paper: '#D5D033', ink: '#000000', caret: '#0000EE' },
  { paper: '#000000', ink: '#D5D033', caret: '#0000EE' }
];

export const FONT_FORMAT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
export const FONT_MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

const KEY = 'cuaderno.v1';
const LEGACY = ['escribir.v3', 'escribir.v2', 'escribir.v1'];

export const now = () => Date.now();

// Identificadores compatibles con uuid v4, para que una fila creada sin sesión
// pueda subir tal cual a Postgres cuando la cuenta aparezca.
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function freshDoc(text = '') {
  const t = now();
  return { id: uid(), name: '', text, created: t, updated: t };
}

function defaults() {
  return {
    v: 1,
    font: 'b0',
    defaultFont: 'b0',
    size: 1,
    lead: 1,
    tracking: -0.012,
    theme: 0,
    texture: true,
    fonts: [],
    settingsUpdated: 0,
    docs: [freshDoc()],
    activeId: null
  };
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

export function load() {
  let s = readJson(KEY);

  if (!s || !Array.isArray(s.docs)) {
    const old = LEGACY.map(readJson).find(Boolean);
    s = defaults();
    if (old && Array.isArray(old.docs) && old.docs.length) {
      s.docs = old.docs;
      s.activeId = old.activeId;
      if (typeof old.size === 'number') s.size = old.size;
      if (typeof old.lead === 'number') s.lead = old.lead;
      if (typeof old.tracking === 'number') s.tracking = old.tracking;
      if (typeof old.theme === 'number') s.theme = old.theme;
      if (typeof old.defaultFont === 'string') s.defaultFont = old.defaultFont;
      else if (typeof old.font === 'number') s.defaultFont = 'b' + old.font;
    } else if (old && typeof old.text === 'string') {
      s.docs = [freshDoc(old.text)];
    }
  }

  const base = defaults();
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];

  s.docs = s.docs.filter((d) => d && typeof d.text === 'string' && d.id);
  if (!s.docs.length) s.docs = [freshDoc()];
  if (!s.docs.some((d) => d.id === s.activeId)) s.activeId = s.docs[0].id;

  return s;
}

export const state = load();

export function active() {
  return state.docs.find((d) => d.id === state.activeId) || state.docs[0];
}

export function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* cuota llena o almacenamiento bloqueado: la sesión sigue en memoria */
  }
}

let saveTimer = null;
export function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 400);
}

// ---------------------------------------------------------------------------
// Derivados de texto
// ---------------------------------------------------------------------------

export function titleOf(doc) {
  if (doc.name) return doc.name;
  const first = (doc.text.split('\n').find((l) => l.trim()) || '').trim().replace(/^#+\s*/, '');
  return first.length > 48 ? first.slice(0, 48).trimEnd() + '…' : first;
}

export function words(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function countLabel(n) {
  return n + (n === 1 ? ' palabra' : ' palabras');
}

export function ago(ms) {
  const d = Math.round((now() - ms) / 1000);
  if (d < 60) return 'ahora';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  if (d < 172800) return 'ayer';
  if (d < 604800) return `hace ${Math.floor(d / 86400)} días`;
  return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export function slug(doc) {
  const base = (titleOf(doc) || 'cuaderno')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 60) || 'cuaderno';
}

// ---------------------------------------------------------------------------
// Tipografías
// ---------------------------------------------------------------------------

export function faces() {
  return BUILTIN.concat(
    (state.fonts || []).map((f) => ({
      key: 'a:' + f.id,
      label: f.label,
      ff: `"cu-${f.id}", Georgia, serif`,
      asset: f
    }))
  );
}

export function hasFace(key) {
  return faces().some((f) => f.key === key);
}

export function faceFor(key) {
  return faces().find((f) => f.key === key) || faces()[0];
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

// Se compara sobre texto sin acentos y en minúsculas, para que "camion"
// encuentre "camión". El índice se calcula sobre la cadena normalizada, que
// conserva la misma longitud que el original porque sólo se quitan las marcas
// diacríticas tras descomponer — de ahí que las posiciones sigan sirviendo
// para seleccionar en el texto real.
export function fold(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Posiciones de cada coincidencia de `query` en `text`. */
export function matches(text, query) {
  const q = fold(query);
  if (!q) return [];
  const hay = fold(text);
  const out = [];
  let i = hay.indexOf(q);
  while (i !== -1 && out.length < 500) {
    out.push(i);
    i = hay.indexOf(q, i + q.length);
  }
  return out;
}

/** Fragmento alrededor de la primera coincidencia, para la lista de resultados. */
export function snippet(text, query, at) {
  const q = fold(query);
  const from = Math.max(0, at - 28);
  const to = Math.min(text.length, at + q.length + 44);
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, at).replace(/\s+/g, ' '),
    hit: text.slice(at, at + q.length),
    after: text.slice(at + q.length, to).replace(/\s+/g, ' ') + (to < text.length ? '…' : '')
  };
}
