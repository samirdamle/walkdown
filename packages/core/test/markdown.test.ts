import { describe, expect, it } from 'vitest';
import { isSafeLinkUrl, renderInline } from '../src/markdown.js';

/**
 * Link URL allowlisting lives here (issue #83): `renderInline` turns
 * a dangerous-scheme link into plain text, and the allowlist itself
 * is pinned through `isSafeLinkUrl`. Behaviour tests go through
 * `renderInline` (the acceptance criteria); the table test pins the
 * allowlist boundary directly, including the cases the regex alone
 * cannot see (mixed case, leading C0 controls).
 *
 * Two pre-existing parser limits shape the expectations below, and
 * neither is changed here:
 * - The link grammar does not do balanced parens: `[^)\s]+` stops
 *   at the first `)`, so a URL containing parens (e.g. the issue's
 *   own `javascript:alert(1)`) leaves a stray `)` after the
 *   replacement — exactly as a safe Wikipedia-style link with
 *   parens does today. The link itself is dead in every case; the
 *   stray `)` is plain text.
 * - The optional `"title"` group in the link regex is dead: `"` is
 *   escaped to `&quot;` before the regex runs, so a titled link
 *   never matches and renders as literal Markdown text. That is
 *   today's behaviour for safe and dangerous titles alike.
 */
describe('renderInline — link scheme allowlist (issue #83)', () => {
  it.each([
    ['javascript:alert', 'click me'],
    ['JAVASCRIPT:alert', 'click me'],
    ['JaVaScRiPt:alert', 'click me'],
    ['data:text/html,hi', 'x'],
    ['vbscript:msgbox', 'x'],
    ['\u0001javascript:alert', 'x'],
    ['tel:+1234567890', 'call us'],
    ['foo:bar', 'x'],
  ])('a %s link renders as plain text, never as a live link', (url, text) => {
    const html = renderInline(`[${text}](${url})`);
    expect(html).toBe(text);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
  });

  it('the issue’s own example is dead: no link, only the text (plus the pre-existing stray paren)', () => {
    const html = renderInline('[click me](javascript:alert(1))');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click me');
  });

  it('a safe link with parens leaves the same stray paren today (pre-existing grammar limit)', () => {
    const html = renderInline('[pc](https://example.com/a_(b))');
    expect(html).toBe('<a href="https://example.com/a_(b">pc</a>)');
  });

  it('the link text is still escaped when the link is dropped', () => {
    expect(renderInline('[click <me> & you](javascript:alert)')).toBe(
      'click &lt;me&gt; &amp; you',
    );
  });

  it('a titled link renders as literal text today — safe and dangerous alike (dead title group)', () => {
    expect(renderInline('[x](https://example.com "title")')).toBe(
      '[x](https://example.com &quot;title&quot;)',
    );
    expect(renderInline('[x](javascript:alert "title")')).toBe(
      '[x](javascript:alert &quot;title&quot;)',
    );
  });

  it.each([
    ['https://example.com', '<a href="https://example.com">x</a>'],
    ['http://example.com', '<a href="http://example.com">x</a>'],
    ['HTTPS://EXAMPLE.COM', '<a href="HTTPS://EXAMPLE.COM">x</a>'],
    ['mailto:a@example.com', '<a href="mailto:a@example.com">x</a>'],
    ['MAILTO:a@example.com', '<a href="MAILTO:a@example.com">x</a>'],
    ['guide.md', '<a href="guide.md">x</a>'],
    ['./guide.md', '<a href="./guide.md">x</a>'],
    ['/abs/path', '<a href="/abs/path">x</a>'],
    ['#section', '<a href="#section">x</a>'],
    ['?q=1', '<a href="?q=1">x</a>'],
    ['//example.com/x', '<a href="//example.com/x">x</a>'],
  ])('a %s link still becomes a live link', (url, expected) => {
    expect(renderInline(`[x](${url})`)).toBe(expected);
  });

  it('a link inside a paragraph renders the same way', () => {
    expect(renderInline('see [the docs](https://example.com) for more')).toBe(
      'see <a href="https://example.com">the docs</a> for more',
    );
    expect(renderInline('see [the docs](javascript:alert) for more')).toBe(
      'see the docs for more',
    );
  });
});

describe('isSafeLinkUrl — the allowlist', () => {
  it.each([
    ['http://example.com', true],
    ['https://example.com', true],
    ['HTTPS://example.com', true],
    ['mailto:a@example.com', true],
    ['guide.md', true],
    ['./guide.md', true],
    ['/abs/path', true],
    ['#section', true],
    ['?q=1', true],
    ['//example.com/x', true],
    ['javascript:alert(1)', false],
    ['JAVASCRIPT:alert(1)', false],
    ['JaVaScRiPt:alert(1)', false],
    ['data:text/html,hi', false],
    ['vbscript:msgbox(1)', false],
    ['tel:+123', false],
    ['foo:bar', false],
    ['\u0001javascript:alert(1)', false],
    ['\u0000\u0020javascript:alert(1)', false],
  ])('%s → %s', (url, expected) => {
    expect(isSafeLinkUrl(url)).toBe(expected);
  });
});
