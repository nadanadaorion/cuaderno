// Un renderizador de Markdown mínimo para la vista previa.
//
// No usa librería: el subconjunto que reconoce es pequeño y acotado, y traer un
// paquete por CDN sólo para esto ataría la vista previa a que responda un
// tercero. El texto se escapa ANTES de construir cualquier marcado, así que un
// documento que contenga HTML se muestra como texto, no se ejecuta.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Marcas dentro de una línea. Se aplican sobre texto ya escapado. */
function inline(text) {
  return (
    text
      // El código va primero: lo que quede dentro no debe interpretarse.
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*\*(?=\S)([^*]+?)(?<=\S)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(?=\S)([^*]+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, '<em>$1</em>')
      .replace(/~~(?=\S)([^~]+?)(?<=\S)~~/g, '<del>$1</del>')
      // Enlaces: el destino se limita a esquemas seguros.
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  );
}

/**
 * Convierte el texto plano del documento en HTML para mostrar.
 * Reconoce títulos, citas, listas, reglas, y énfasis en línea.
 */
export function render(source) {
  const lines = escape(source).split('\n');
  const out = [];

  let paragraph = [];
  let list = null; // 'ul' | 'ol' | null

  const closeParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inline(paragraph.join('<br>'))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!list) return;
    out.push(`</${list}>`);
    list = null;
  };

  const closeAll = () => {
    closeParagraph();
    closeList();
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    ');
    const text = line.trim();

    if (!text) {
      closeAll();
      continue;
    }

    const heading = text.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeAll();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(text)) {
      closeAll();
      out.push('<hr>');
      continue;
    }

    const quote = text.match(/^>\s?(.*)$/);
    if (quote) {
      closeAll();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    const bullet = text.match(/^[-*+]\s+(.*)$/);
    const number = text.match(/^\d+[.)]\s+(.*)$/);

    if (bullet || number) {
      closeParagraph();
      const want = bullet ? 'ul' : 'ol';
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((bullet || number)[1])}</li>`);
      continue;
    }

    closeList();
    // Una línea sangrada mantiene su sangría en la vista previa.
    const lead = line.match(/^ +/);
    paragraph.push(lead ? `<span class="lead">${' '.repeat(lead[0].length)}</span>${text}` : text);
  }

  closeAll();
  return out.join('\n');
}
