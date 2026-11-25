import { describe, expect, it, vi } from 'vitest';
import { deckClassesOf, sanitizeCss } from '../src/sanitize.js';

describe('sanitizeCss', () => {
  it('drops @import rules and keeps ordinary rules', () => {
    const out = sanitizeCss('@import url("theme.css");\n.a { color: red; }');
    expect(out).not.toContain('@import');
    expect(out).toContain('.a { color: red; }');
  });

  it('drops declarations with external url() and keeps the rest of the rule', () => {
    const out = sanitizeCss('p { background: url(https://example.com/bg.png); color: red; }');
    expect(out).not.toContain('url(');
    expect(out).toContain('color: red');
  });

  it('keeps data: URLs (self-contained, not external)', () => {
    const out = sanitizeCss('p { background: url(data:image/png;base64,AAAA); }');
    expect(out).toContain('url(data:image/png;base64,AAAA)');
  });

  it('drops a rule that would hide a panel', () => {
    const out = sanitizeCss('.wd-panel { display: none; }');
    expect(out.trim()).toBe('');
  });

  it('drops a hiding declaration on a deck class, keeps the other declarations', () => {
    const out = sanitizeCss('.hero { color: red; display: none; }', { deckClasses: ['hero'] });
    expect(out).toContain('color: red');
    expect(out).not.toContain('display: none');
  });

  it('drops opacity: 0 / visibility: hidden on panel selectors', () => {
    expect(sanitizeCss('.wd-panel { opacity: 0; }').trim()).toBe('');
    expect(sanitizeCss('.wd-screen { visibility: hidden; }').trim()).toBe('');
    expect(sanitizeCss('.wd-panel { height: 0; }').trim()).toBe('');
  });

  it('lets deck CSS hide its own decorative elements (not a screen or panel)', () => {
    const out = sanitizeCss('.note { display: none; }');
    expect(out).toContain('display: none');
  });

  it('sanitises inside @media and drops the block when nothing survives', () => {
    const out = sanitizeCss('@media (max-width: 600px) { .wd-panel { display: none; } }');
    expect(out.trim()).toBe('');
    const kept = sanitizeCss('@media (max-width: 600px) { .a { color: blue; } }');
    expect(kept).toContain('@media (max-width: 600px)');
    expect(kept).toContain('color: blue');
  });

  it('warns about dropped rules', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sanitizeCss('.wd-panel { display: none; }');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('must not hide'));
    warn.mockRestore();
  });

  it('returns empty string for unparseable input instead of throwing', () => {
    expect(() => sanitizeCss('.a { color: red;')).not.toThrow();
  });
});

describe('deckClassesOf', () => {
  it('collects screen and panel class names', () => {
    const deck = {
      sections: [
        {
          classNames: ['dark'],
          screens: [
            { classNames: ['hero'], panels: [{ classNames: ['big'] }, { classNames: [] }] },
            { classNames: [], panels: [{ classNames: [] }] },
          ],
        },
      ],
    };
    expect(deckClassesOf(deck).sort()).toEqual(['big', 'dark', 'hero']);
  });
});
