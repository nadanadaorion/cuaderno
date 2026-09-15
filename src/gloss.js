// Formato en vivo: la capa que hace visible la negrita y la cursiva mientras
// se escribe, sin dejar de ser texto plano por debajo.
//
// CÓMO FUNCIONA. El textarea sigue siendo el único que recibe teclas y clics,
// pero su texto se vuelve transparente; encima se dibuja esta capa, que
// contiene EXACTAMENTE los mismos caracteres en el mismo orden — las marcas
// incluidas, sólo atenuadas — con los tramos enfatizados envueltos en spans.
// Que no sobre ni falte un carácter es la invariante que sostiene todo lo
// demás: la posición del caret y los rectángulos de cada glifo se miden sobre
// esta capa, y un desfase de un carácter se vería de inmediato.
//
// POR QUÉ EL TRAZO Y NO EL PESO. Medido a 62px, poner peso 600 ensancha una
// palabra entre 17 y 62px — uno o dos caracteres. Como el textarea sigue
// midiendo con el peso normal, el clic para colocar el caret caería en la
// letra equivocada. `-webkit-text-stroke` engrosa el glifo sin tocar su
// avance: la desviación medida es exactamente cero. De paso funciona con
// cualquier tipografía, incluidas las subidas que sólo traen un peso.

const MARK = 'mark';

/** Parte una línea en tramos con su clase de énfasis. */
function runs(line) {
  const out = [];
  const push = (text, cls) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += text;
    else out.push({ text, cls });
  };

  // Encabezado: se atenúa la almohadilla y la línea se engrosa. No se cambia
  // el cuerpo, que sí movería las medidas.
  const head = line.match(/^(\s*)(#{1,6})(\s+)/);
  let body = line;
  let prefix = null;

  if (head) {
    prefix = head[0];
    body = line.slice(prefix.length);
  }

  const emphasis = /(\*\*\*)([^*\n]+?)(\*\*\*)|(\*\*)([^*\n]+?)(\*\*)|(?<![*\w])(\*)([^*\n]+?)(\*)(?![*\w])|(`)([^`\n]+?)(`)/g;

  const scan = (text, base) => {
    let at = 0;
    let m;
    emphasis.lastIndex = 0;
    while ((m = emphasis.exec(text))) {
      // Una marca pegada a un espacio no es énfasis en Markdown; se deja como
      // texto para que la capa muestre lo mismo que exportará el archivo.
      const inner = m[2] ?? m[5] ?? m[8] ?? m[11];
      if (/^\s|\s$/.test(inner)) continue;

      push(text.slice(at, m.index), base);
      const open = m[1] ?? m[4] ?? m[7] ?? m[10];
      const close = m[3] ?? m[6] ?? m[9] ?? m[12];
      const cls = m[1] ? 'bi' : m[4] ? 'b' : m[7] ? 'i' : 'code';

      push(open, MARK);
      push(inner, base ? `${base} ${cls}` : cls);
      push(close, MARK);
      at = m.index + m[0].length;
    }
    push(text.slice(at), base);
  };

  if (prefix) push(prefix, MARK);
  scan(body, prefix ? 'h' : '');
  return out;
}

/**
 * Vuelca `source` en `host` como texto con formato.
 * Cada carácter del origen aparece una vez y en el mismo orden.
 */
export function renderGloss(host, source) {
  const frag = document.createDocumentFragment();
  const lines = source.split('\n');

  lines.forEach((line, i) => {
    for (const run of runs(line)) {
      if (!run.cls) {
        frag.append(document.createTextNode(run.text));
      } else {
        const span = document.createElement('span');
        span.className = run.cls;
        span.textContent = run.text;
        frag.append(span);
      }
    }
    // El salto de línea es un carácter del origen y tiene que estar aquí para
    // que las posiciones sigan cuadrando.
    if (i < lines.length - 1) frag.append(document.createTextNode('\n'));
  });

  // Centinela: sin él, un caret al final de un texto que termina en salto de
  // línea no tendría nodo donde apoyarse y se dibujaría en la línea anterior.
  const tail = document.createElement('span');
  tail.className = 'sentinel';
  tail.textContent = '​';
  frag.append(tail);

  host.textContent = '';
  host.append(frag);
}

/** Nodos de texto de la capa, en orden, sin el centinela. */
function textNodes(host) {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const out = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.classList.contains('sentinel')) continue;
    out.push(node);
  }
  return out;
}

/**
 * Rectángulo del caret en la posición `offset` del origen, en coordenadas de
 * la propia capa. Devuelve null si no se puede medir.
 */
export function caretRect(host, offset) {
  const nodes = textNodes(host);
  const range = document.createRange();
  let placed = false;
  let seen = 0;

  // La comparación es estricta a propósito: se busca el nodo que CONTIENE el
  // carácter de esa posición, no el que termina en ella. Medir al final de un
  // nodo es ambiguo — justo después de un salto de línea, el navegador
  // devuelve el final de la línea anterior en vez del principio de la
  // siguiente, y el caret se quedaba una línea arriba.
  for (const node of nodes) {
    const len = node.nodeValue.length;
    if (offset < seen + len) {
      range.setStart(node, offset - seen);
      placed = true;
      break;
    }
    seen += len;
  }

  if (!placed) {
    const sentinel = host.querySelector('.sentinel');
    if (!sentinel?.firstChild) return null;
    range.setStart(sentinel.firstChild, 0);
  }
  range.collapse(true);

  let box = range.getBoundingClientRect();
  if (!box.height) box = range.getClientRects()[0] || box;
  if (!box.height) {
    // Último recurso: el centinela siempre es medible.
    const sentinel = host.querySelector('.sentinel');
    if (!sentinel?.firstChild) return null;
    range.setStart(sentinel.firstChild, 0);
    range.collapse(true);
    box = range.getBoundingClientRect();
    if (!box.height) return null;
  }

  const frame = host.getBoundingClientRect();
  return { left: box.left - frame.left, top: box.top - frame.top, height: box.height };
}

/** Rectángulos de cada glifo, para saber si el cursor está sobre texto. */
export function glyphRects(host) {
  const out = [];
  for (const node of textNodes(host)) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) {
      if (box.width > 0.5 && box.height > 0.5) out.push(box);
    }
  }
  return out;
}
