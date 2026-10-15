import { describe, it, expect } from 'vitest';
import { previewText } from './previewText';

describe('previewText', () => {
  it('strips HTML tags and keeps a space between blocks', () => {
    expect(previewText('<h2>Shopping</h2><p>Buy <strong>milk</strong> and <em>eggs</em>.</p>')).toBe(
      'Shopping Buy milk and eggs.',
    );
  });

  it('drops script and style contents entirely', () => {
    expect(previewText('<p>Hi</p><script>alert(1)</script><style>p{color:red}</style><p>there</p>')).toBe('Hi there');
  });

  it('decodes common HTML entities', () => {
    expect(previewText('<p>Fish &amp; chips &lt;3 &quot;yum&quot; &#39;ok&#39; &#x41;&nbsp;B</p>')).toBe(
      'Fish & chips <3 "yum" \'ok\' A B',
    );
  });

  it('drops a tag left open by the length cap', () => {
    expect(previewText(`<p>Hi</p><img src="data:image/png;base64,${'A'.repeat(10_000)}">`)).toBe('Hi');
  });

  it('keeps a lone less-than sign in plain text', () => {
    expect(previewText('if a < b then')).toBe('if a < b then');
  });

  it('keeps comparison signs in raw markdown', () => {
    expect(previewText('a < b and c > d')).toBe('a < b and c > d');
    expect(previewText('if x<y then y>z')).toBe('if x<y then y>z');
  });

  it('strips table pipes and separator rows', () => {
    expect(previewText('| a | b |\n|---|:--:|\n| 1 | 2 |')).toBe('a b 1 2');
  });

  it('strips code fences with their language tag, and rules', () => {
    expect(previewText('```js\nconst x = 1;\n```\n---\nafter')).toBe('const x = 1; after');
  });

  it('keeps a spaced asterisk and a lone tilde', () => {
    expect(previewText('2 * 3 in ~/dev, ~~gone~~ ok')).toBe('2 * 3 in ~/dev, gone ok');
  });

  it('never ends on half a surrogate pair', () => {
    const out = previewText(`a${'\u{1F600}'.repeat(100)}`, 10);
    expect(out.endsWith('\u{1F600}…')).toBe(true);
  });

  it('leaves invalid numeric entities (lone surrogates) as written', () => {
    expect(previewText('a &#xD800; b')).toBe('a &#xD800; b');
  });

  it('strips markdown headings, quotes, emphasis and code', () => {
    expect(previewText('# Title\n\n> quoted **bold** and *italic* and `code` and _under_')).toBe(
      'Title quoted bold and italic and code and under',
    );
  });

  it('keeps underscores inside words', () => {
    expect(previewText('rename snake_case_name now')).toBe('rename snake_case_name now');
  });

  it('strips list and task markers', () => {
    expect(previewText('- [ ] milk\n- [x] eggs\n* bread\n1. jam')).toBe('milk eggs bread jam');
  });

  it('keeps link labels and removes images', () => {
    expect(previewText('See [the docs](https://example.com) ![diagram](https://example.com/a.png) now')).toBe(
      'See the docs now',
    );
  });

  it('collapses whitespace and trims', () => {
    expect(previewText('  one\n\n\ttwo   three  ')).toBe('one two three');
  });

  it('cuts on a word boundary and marks the cut', () => {
    const text = 'word '.repeat(40); // 200 chars
    const out = previewText(text, 22);
    expect(out).toBe('word word word word…');
    expect(out.length).toBeLessThanOrEqual(23);
  });

  it('hard-cuts a single long word', () => {
    expect(previewText('x'.repeat(50), 10)).toBe(`${'x'.repeat(10)}…`);
  });

  it('defaults to 120 characters', () => {
    expect(previewText('a '.repeat(200)).length).toBeLessThanOrEqual(121);
  });

  // Notes can be large and can come from other users or the API: no input may stall the list (ReDoS).
  it.each([
    ['unclosed angle brackets', '<'.repeat(1_000_000)],
    ['unclosed script openers', '<script '.repeat(125_000)],
    ['unclosed link brackets', '['.repeat(1_000_000)],
    ['unclosed link targets', '[a]('.repeat(250_000)],
    ['underscore run inside a word', `a${'_'.repeat(1_000_000)}b`],
  ])('stays fast on hostile input: %s', (_name, input) => {
    const start = performance.now();
    previewText(input);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('returns an empty string for empty or markup-only content', () => {
    expect(previewText('')).toBe('');
    expect(previewText(null)).toBe('');
    expect(previewText('<p></p><br>')).toBe('');
  });
});
