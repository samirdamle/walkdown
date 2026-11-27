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

  it('drops animation on a panel selector so @keyframes cannot hide it', () => {
    // The F13 bypass: @keyframes x { to { opacity: 0 } } plus
    // `.wd-panel { animation: x 1s forwards; }` hid the panel
    // without any hiding declaration. The keyframes block itself
    // passes through (it cannot hide anything without the binding);
    // the binding on the panel is dropped, the rest of the rule kept.
    const out = sanitizeCss('@keyframes x { to { opacity: 0 } } .wd-panel { color: red; animation: x 1s forwards; }');
    expect(out).toContain('@keyframes x { to { opacity: 0 } }');
    expect(out).toContain('color: red');
    expect(out).not.toContain('animation:');
  });

  it('drops animation-name on a panel selector, keeps the other longhands', () => {
    // The other longhands are harmless without a name to apply.
    const out = sanitizeCss('.wd-panel { animation-name: x; animation-duration: 1s; animation-fill-mode: forwards; }');
    expect(out).not.toContain('animation-name');
    expect(out).toContain('animation-duration: 1s');
    expect(out).toContain('animation-fill-mode: forwards');
  });

  it('drops animation case-insensitively, on screens and on deck classes', () => {
    expect(sanitizeCss('.wd-screen { ANIMATION: x 1s forwards; }').trim()).toBe('');
    expect(sanitizeCss('.wd-panel { Animation-Name: x; }').trim()).toBe('');
    const out = sanitizeCss('.hero { animation: x 1s forwards; }', { deckClasses: ['hero'] });
    expect(out.trim()).toBe('');
  });

  it('drops animation on a panel selector inside @media', () => {
    const out = sanitizeCss('@media (max-width: 600px) { .wd-panel { animation: x 1s forwards; } }');
    expect(out.trim()).toBe('');
  });

  it('lets deck CSS animate anything that is not a screen or panel', () => {
    const out = sanitizeCss('@keyframes spin { to { transform: rotate(360deg) } } .badge { animation: spin 2s infinite; }');
    expect(out).toContain('@keyframes spin { to { transform: rotate(360deg) } }');
    expect(out).toContain('animation: spin 2s infinite');
  });

  it('warns about a dropped animation binding', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sanitizeCss('.wd-panel { animation: x 1s forwards; }');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('@keyframes'));
    warn.mockRestore();
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

  it('keeps an !important font override on .wd-deck (deck font theming)', () => {
    // The sample deck sets Open Sans this way: the renderer
    // sets the theme vars as inline style on .wd-deck, so only
    // an !important rule beats them. The sanitiser must not
    // strip the priority — it is not a hiding declaration and
    // has no external url().
    const out = sanitizeCss(
      ".wd-deck { --wd-font-family-body: 'Open Sans', system-ui, sans-serif !important; --wd-font-family-title: 'Open Sans', system-ui, sans-serif !important; }",
    );
    expect(out).toContain("--wd-font-family-body: 'Open Sans', system-ui, sans-serif !important");
    expect(out).toContain("--wd-font-family-title: 'Open Sans', system-ui, sans-serif !important");
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
