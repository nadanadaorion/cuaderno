// Operaciones sobre el texto seleccionado: sangría y marcas de énfasis.
//
// Todas pasan por `apply`, que escribe con `execCommand('insertText')` en vez
// de asignar `area.value`. La razón es concreta: asignar el valor destruye la
// pila de deshacer del navegador, y ⌘Z deja de funcionar. `insertText` está
// marcado como obsoleto en la especificación pero es la única forma de escribir
// en un textarea conservando ese historial, y sigue implementado en todos los
// navegadores actuales. Si algún día deja de estarlo, el respaldo asigna el
// valor y sólo se pierde el deshacer.

export const INDENT = '\t';

/**
 * Reemplaza [start, end) por `text` conservando el historial de deshacer.
 * Deja la selección donde indique `select`, que recibe la posición inicial.
 */
function apply(area, start, end, text, select) {
  area.focus();
  area.setSelectionRange(start, end);

  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }

  if (!ok) {
    const value = area.value;
    area.value = value.slice(0, start) + text + value.slice(end);
  }

  const range = select(start, text);
  area.setSelectionRange(range[0], range[1]);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Límites de las líneas completas que toca la selección. */
function lineSpan(value, start, end) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let to = value.indexOf('\n', end);
  if (to === -1) to = value.length;
  // Una selección que termina justo en un salto de línea no debe arrastrar la
  // línea siguiente.
  if (end > start && value[end - 1] === '\n' && end - 1 >= from) to = end - 1;
  return [from, to];
}

const spans = (area) => [area.selectionStart, area.selectionEnd];

/** Sangra las líneas de la selección, o inserta una sangría en el caret. */
export function indent(area) {
  const [start, end] = spans(area);
  const value = area.value;

  // Dentro de una sola línea, Tab es lo que cualquiera espera: una sangría en
  // el caret. Sólo cuando la selección cruza líneas se sangra el bloque.
  if (!value.slice(start, end).includes('\n')) {
    apply(area, start, end, INDENT, (s, t) => [s + t.length, s + t.length]);
    return;
  }

  const [from, to] = lineSpan(value, start, end);
  const block = value.slice(from, to);
  const next = block
    .split('\n')
    .map((line) => INDENT + line)
    .join('\n');

  apply(area, from, to, next, (s, t) => [s, s + t.length]);
}

/** Quita una sangría a cada línea de la selección. */
export function outdent(area) {
  const [start, end] = spans(area);
  const value = area.value;
  const [from, to] = lineSpan(value, start, end);

  const next = value
    .slice(from, to)
    .split('\n')
    .map((line) => {
      if (line.startsWith(INDENT)) return line.slice(INDENT.length);
      // Texto pegado de otra parte suele traer espacios en vez de tabuladores.
      const m = line.match(/^ {1,4}/);
      return m ? line.slice(m[0].length) : line;
    })
    .join('\n');

  if (next === value.slice(from, to)) return;
  apply(area, from, to, next, (s, t) => [s, s + t.length]);
}

/**
 * Pone o quita una marca de énfasis alrededor de la selección.
 * `mark` es '**' para negrita y '*' para cursiva.
 */
export function toggleMark(area, mark) {
  const value = area.value;
  let [start, end] = spans(area);

  // Markdown no reconoce una marca pegada a un espacio: "** texto **" no es
  // negrita. Si la selección arrastra espacios, se quedan fuera.
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;

  const len = mark.length;
  const before = value.slice(Math.max(0, start - len), start);
  const after = value.slice(end, end + len);

  // Una cursiva no debe confundirse con el borde de una negrita: si lo que
  // rodea a la selección es '**', el '*' exterior pertenece a la negrita.
  const isBoldEdge = mark === '*' && (value.slice(Math.max(0, start - 2), start) === '**' || value.slice(end, end + 2) === '**');

  if (before === mark && after === mark && !isBoldEdge) {
    const inner = value.slice(start, end);
    apply(area, start - len, end + len, inner, (s, t) => [s, s + t.length]);
    return;
  }

  const inner = value.slice(start, end);

  // Sin selección, la marca se abre y el caret queda en medio para escribir.
  if (!inner) {
    apply(area, start, end, mark + mark, (s) => [s + len, s + len]);
    return;
  }

  apply(area, start, end, mark + inner + mark, (s, t) => [s + len, s + t.length - len]);
}
