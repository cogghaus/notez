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
      const valid = Number.isFinite(n) && n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff);
      return valid ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const BLOCKS = 'p,div,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote,pre,table,tr,td,th,section,article,br,hr';

/**
 * TipTap HTML always starts with a tag; HTML pasted into a markdown note has closing tags. Anything
 * else is raw markdown, where < and > are comparison signs ("if x<y then y>z") and stay as text.
 */
function looksLikeHtml(text: string): boolean {
  return /^\s*<|<\/[a-z]/i.test(text);
}

/**
 * Text content via DOMParser, never regexes over markup. A parsed document is inert (no scripts
 * run, nothing loads), decodes entities itself, and drops a tag the length cap cut open.
 */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,template').forEach((el) => el.remove());
  // Block boundaries become spaces; inline tags (<strong>, <a>) vanish so "milk</em>." stays "milk."
  doc.querySelectorAll(BLOCKS).forEach((el) => {
    el.before(' ');
    el.after(' ');
  });
  return doc.body.textContent ?? '';
}

function stripMarkdown(text: string): string {
  return (
    text
      // Images go entirely; links keep their label.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Whole-line syntax: code fences (with their language tag), rules, table separator rows.
      .replace(/^[ \t]*```.*$/gm, ' ')
      .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, ' ')
      .replace(/^(?=.*\|)[ \t:|-]+$/gm, ' ')
      .replace(/\|/g, ' ')
      // Line-leading block syntax: headings, quotes, task and list markers.
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]*(>[ \t]?)+/gm, '')
      .replace(/^[ \t]*([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/gm, '')
      // Inline emphasis, strikethrough and code. A spaced "2 * 3", "~/dev" and snake_case stay.
      .replace(/(?<!\s)\*+|\*+(?!\s)/g, '')
      .replace(/~~|`+/g, '')
      .replace(/(?<!\w)_+|_+(?!\w)/g, '')
  );
}

/**
 * Only the head of the note is stripped. Several patterns are quadratic when a closing token is
 * missing (`<<<<`, `[a](` repeated, long `_` runs), and notes can be large or written by someone
 * else, so the input is capped well above what a 120-character preview needs, markup included.
 */
const MAX_SOURCE = 4096;

export function previewText(content: string | null | undefined, max = 120): string {
  if (!content) return '';
  const source = content.length > MAX_SOURCE ? content.slice(0, MAX_SOURCE) : content;
  const plain = looksLikeHtml(source) ? htmlToText(source) : decodeEntities(source);
  const text = stripMarkdown(plain)
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;

  let cut = text.slice(0, max);
  // Never end on the first half of a surrogate pair (an emoji at the cut).
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
