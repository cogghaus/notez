/**
 * Plain-text preview of note content for list rows (mobile spec 4.2, D9).
 *
 * Content can be TipTap HTML or raw markdown (notes created through the API), so both are stripped.
 * The result is rendered as a React text node, never as HTML, so this is about readability, not
 * sanitising.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function stripHtml(text: string): string {
  return text
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    // Block boundaries become spaces; inline tags (<strong>, <a>) vanish so "milk</em>." stays "milk."
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote|pre|table|tr|td|th|section|article|br|hr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '');
}

function stripMarkdown(text: string): string {
  return (
    text
      // Images go entirely; links keep their label.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Line-leading block syntax: headings, quotes, task and list markers.
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]*(>[ \t]?)+/gm, '')
      .replace(/^[ \t]*([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/gm, '')
      // Inline emphasis and code. Underscores inside words (snake_case) stay.
      .replace(/[*`~]+/g, '')
      .replace(/(?<!\w)_+|_+(?!\w)/g, '')
  );
}

export function previewText(content: string | null | undefined, max = 120): string {
  if (!content) return '';
  const text = stripMarkdown(decodeEntities(stripHtml(content)))
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
