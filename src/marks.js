// Las marcas de énfasis.
//
// El texto NO guarda asteriscos: guarda dos caracteres invisibles de ancho
// cero, uno para negrita y otro para cursiva, usados como delimitadores igual
// que en Markdown.
//
// POR QUÉ. El textarea de debajo contiene los mismos caracteres que la capa de
// formato y es quien traduce un clic en una posición del texto, así que ambos
// tienen que maquetar igual. Con asteriscos eso se cumplía, pero al ocultarlos
// quedaba el hueco que seguían ocupando. Un carácter de ancho cero ocupa lo
// mismo en los dos sitios —nada— así que no hay hueco ni desfase.
//
// Medido en navegador: U+2060 y U+FEFF tienen avance exactamente cero, y a lo
// largo de 167 anchos de columna distintos no mueven ni un corte de línea
// respecto al mismo texto sin marcas. Son caracteres de formato: no se dibujan
// y no intervienen en la forma de las letras vecinas.
//
// Los asteriscos vuelven a aparecer al exportar y al copiar, que es donde el
// Markdown tiene que ser legible fuera de aquí.

export const BOLD = '⁠'; // WORD JOINER
export const ITALIC = '﻿'; // ZERO WIDTH NO-BREAK SPACE

export const MARKS = /[⁠﻿]/;
const ALL = /[⁠﻿]/g;

export const isMark = (ch) => ch === BOLD || ch === ITALIC;

/** Quita toda marca. Para el texto plano y para contar palabras. */
export const strip = (text) => text.replace(ALL, '');

/**
 * Convierte a Markdown: cada PAREJA de marcas pasa a asteriscos y las marcas
 * sueltas se descartan. Emparejar importa — una marca huérfana, que en pantalla
 * es invisible e inerte, escribiría un `**` suelto en el archivo.
 */
export function toMarkdown(text) {
  const open = { [BOLD]: -1, [ITALIC]: -1 };
  const pairs = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!isMark(ch)) continue;
    if (open[ch] < 0) open[ch] = i;
    else {
      pairs.push({ from: open[ch], to: i, mark: ch === BOLD ? '**' : '*' });
      open[ch] = -1;
    }
  }

  const swap = new Map();
  for (const pair of pairs) {
    swap.set(pair.from, pair.mark);
    swap.set(pair.to, pair.mark);
  }

  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (isMark(text[i])) out += swap.get(i) ?? '';
    else out += text[i];
  }
  return out;
}

/** Al revés: asteriscos de Markdown a marcas invisibles. */
export function fromMarkdown(text) {
  return text
    .replace(/\*\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*\*/g, (_, s) => BOLD + ITALIC + s + ITALIC + BOLD)
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, (_, s) => BOLD + s + BOLD)
    .replace(/(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, (_, s) => ITALIC + s + ITALIC);
}

/**
 * Texto sin marcas, sin acentos y en minúsculas, con un mapa de vuelta a las
 * posiciones del original. Buscar sobre el texto limpio evita que una marca
 * invisible en medio de una frase impida encontrarla.
 */
export function fold(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isMark(ch)) continue;
    const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Una letra puede quedar en más de un carácter al bajar a minúsculas; cada
    // uno apunta a la misma posición del original.
    for (const c of plain) {
      out += c;
      map.push(i);
    }
  }
  return { text: out, map };
}
