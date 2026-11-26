import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index.js';
import { DEFAULT_CSS } from '../src/styles.js';
import type { WalkdownDeckElement } from '../src/element.js';

/** Read a repo fixture. Under the jsdom environment import.meta.url is not a file: URL, so fall back to cwd. */
function fixture(name: string): string {
  try {
    return readFileSync(fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url)), 'utf8');
  } catch {
    return readFileSync(resolve(process.cwd(), '../../examples', name), 'utf8');
  }
}

const SAMPLE_DECK = fixture('walkdown-itself.md');
const THEME_CSS = fixture('walkdown-theme.css');

function screenEl(el: WalkdownDeckElement): HTMLElement {
  return el.shadowRoot?.querySelector('.wd-screen') as HTMLElement;
}
function deckEl(el: WalkdownDeckElement): HTMLElement {
  return el.shadowRoot?.querySelector('.wd-deck') as HTMLElement;
}
function panels(el: WalkdownDeckElement): HTMLElement[] {
  return [...(el.shadowRoot?.querySelectorAll('.wd-panel') as NodeListOf<HTMLElement>)];
}
function panelVisible(el: WalkdownDeckElement, i: number): boolean {
  const p = panels(el)[i];
  return p !== undefined && !p.hidden;
}
function varOf(el: WalkdownDeckElement, name: string): string {
  return deckEl(el).style.getPropertyValue(name).trim();
}
function progressText(el: WalkdownDeckElement): string {
  return (el.shadowRoot?.querySelector('.wd-progress-text') as HTMLElement).textContent ?? '';
}

function stubScreenRect(el: WalkdownDeckElement): void {
  const screen = screenEl(el);
  screen.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function pointer(el: WalkdownDeckElement, type: string, x: number, y = 300): void {
  screenEl(el).dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
}

function key(el: WalkdownDeckElement, keyName: string): void {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }));
}

function createDeck(markdown: string): WalkdownDeckElement {
  const el = document.createElement('walkdown-deck') as WalkdownDeckElement;
  el.setContainerSize(1440, 900);
  el.markdown = markdown;
  document.body.appendChild(el);
  stubScreenRect(el);
  return el;
}

beforeEach(() => {
  window.location.hash = '';
  // The sample deck lists ./walkdown-theme.css; serve its real content so the
  // external-stylesheet path is exercised. Anything else 404s (degradation).
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('walkdown-theme.css')) {
        return new Response(THEME_CSS, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<walkdown-deck> with the sample deck', () => {
  it('renders 12 screens / 42 steps, starting at the hero', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(el.screens).toHaveLength(12);
    expect(el.stepsTotal).toBe(42);
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    expect(screenEl(el).querySelector('.wd-title')?.textContent).toBe('Walkdown');
    expect(screenEl(el).classList.contains('wd-screen--hero')).toBe(true);
    expect(progressText(el)).toBe('1 / 42');
  });

  it('reveals panels in sequence order on the sequence screen', () => {
    const el = createDeck(SAMPLE_DECK);
    const seqIndex = el.screens.findIndex((s) => s.title === 'The punchline first');
    expect(seqIndex).toBeGreaterThanOrEqual(0);
    el.jumpTo(seqIndex);
    // sequence: 3, 1, 2 — step 0 shows panel 3 (index 2) only.
    expect(panelVisible(el, 2)).toBe(true);
    expect(panelVisible(el, 0)).toBe(false);
    expect(panelVisible(el, 1)).toBe(false);
    el.next();
    expect(panelVisible(el, 0)).toBe(true);
    expect(panelVisible(el, 1)).toBe(false);
    el.next();
    expect(panelVisible(el, 1)).toBe(true);
  });

  it('walks Next / Previous / Start / End and clamps at both ends', () => {
    const el = createDeck(SAMPLE_DECK);
    el.prev();
    expect(el.state.screenIndex).toBe(0);
    expect(el.state.stepIndex).toBe(0);
    for (let i = 0; i < 42; i++) el.next();
    expect(el.state.screenIndex).toBe(11);
    expect(el.state.stepIndex).toBe(2); // last screen has 3 panels, all stepped
    el.next();
    expect(el.state.screenIndex).toBe(11);
    el.goToStart();
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    el.goToEnd();
    expect(el.state.screenIndex).toBe(11);
    expect(el.state.stepIndex).toBe(2);
    expect((el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement).hidden).toBe(false);
  });

  it('navigates by keyboard and zooms with + / -', () => {
    const el = createDeck(SAMPLE_DECK);
    // Screen 0 is a hero (reveal: all, one step): Next moves to screen 1.
    key(el, 'ArrowRight');
    expect(el.state.screenIndex).toBe(1);
    expect(el.state.stepIndex).toBe(0);
    key(el, 'ArrowLeft');
    expect(el.state.screenIndex).toBe(0);
    key(el, ' ');
    expect(el.state.screenIndex).toBe(1);
    key(el, 'End');
    expect(el.state.screenIndex).toBe(11);
    key(el, 'Home');
    expect(el.state.screenIndex).toBe(0);
    key(el, '+');
    expect(el.state.zoom).toBe(1);
    key(el, '-');
    expect(el.state.zoom).toBe(0);
  });

  it('restores a deep link on load and updates the hash on navigation', () => {
    window.location.hash = '#/3/2';
    const el = createDeck(SAMPLE_DECK);
    expect(el.state.screenIndex).toBe(2);
    expect(el.state.stepIndex).toBe(1);
    el.next();
    expect(window.location.hash).toBe('#/3/3');
  });

  it('clamps an out-of-range deep link to the last step', () => {
    window.location.hash = '#/99/99';
    const el = createDeck(SAMPLE_DECK);
    expect(el.state.screenIndex).toBe(11);
    expect(el.state.stepIndex).toBe(2);
  });

  it('navigates by click halves and ignores drags', () => {
    const el = createDeck(SAMPLE_DECK);
    pointer(el, 'pointerdown', 700);
    pointer(el, 'pointerup', 700);
    expect(el.state.screenIndex).toBe(1);
    pointer(el, 'pointerdown', 100);
    pointer(el, 'pointerup', 100);
    expect(el.state.screenIndex).toBe(0);
    // A drag (movement > 8px) is not a tap.
    pointer(el, 'pointerdown', 400);
    pointer(el, 'pointerup', 450);
    expect(el.state.screenIndex).toBe(0);
  });

  it('swipes left to advance and right to retreat', () => {
    const el = createDeck(SAMPLE_DECK);
    pointer(el, 'pointerdown', 400);
    pointer(el, 'pointermove', 300); // dx -100, past the 48px threshold
    pointer(el, 'pointerup', 300);
    expect(el.state.screenIndex).toBe(1);
    pointer(el, 'pointerdown', 300);
    pointer(el, 'pointermove', 400);
    pointer(el, 'pointerup', 400);
    expect(el.state.screenIndex).toBe(0);
  });

  it('does not navigate when the tap starts on a link', () => {
    const el = createDeck('# Links\n\n- See [the docs](https://example.com) for more.\n');
    const link = screenEl(el).querySelector('a') as HTMLElement;
    expect(link).not.toBeNull();
    link.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 700, clientY: 300 }));
    link.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 700, clientY: 300 }));
    expect(el.state.stepIndex).toBe(0);
  });
});

describe('zoom and layout', () => {
  it('never renders body type below the 12px floor, even zoomed fully out on a phone', () => {
    const el = createDeck(SAMPLE_DECK);
    el.setContainerSize(360, 640);
    for (let i = 0; i < 4; i++) el.zoomOutStep();
    expect(el.state.zoom).toBe(-4);
    const bodyPx = parseFloat(varOf(el, '--wd-font-body'));
    expect(bodyPx).toBeGreaterThanOrEqual(12);
  });

  it('zooms in and out within ±4 steps', () => {
    const el = createDeck(SAMPLE_DECK);
    for (let i = 0; i < 6; i++) el.zoomInStep();
    expect(el.state.zoom).toBe(4);
    for (let i = 0; i < 9; i++) el.zoomOutStep();
    expect(el.state.zoom).toBe(-4);
  });

  it('applies the layout columns for the current screen', () => {
    const el = createDeck(SAMPLE_DECK);
    el.setContainerSize(1440, 900);
    el.jumpTo(3); // 6-panel screen
    expect(varOf(el, '--wd-cols')).toBe('3');
    el.setContainerSize(360, 640);
    expect(varOf(el, '--wd-cols')).toBe('1');
  });
});

describe('themes and stylesheets', () => {
  it('applies the settled light palette by default', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(varOf(el, '--wd-color-bg')).toBe('#FAFAF7');
    expect(varOf(el, '--wd-color-ink')).toBe('#1B1B18');
    expect(varOf(el, '--wd-color-accent')).toBe('#B45309');
    expect(varOf(el, '--wd-font-family-title')).toContain('Georgia');
  });

  it('switches to the dark palette from frontmatter theme:', () => {
    const el = createDeck('---\ntheme: dark\n---\n\n# Dark deck\n\n- One panel.\n');
    expect(varOf(el, '--wd-color-bg')).toBe('#18181C');
    expect(varOf(el, '--wd-color-ink')).toBe('#F5F5F0');
    expect(varOf(el, '--wd-color-accent')).toBe('#F0D45D');
  });

  it('lets the theme attribute override the deck theme', () => {
    const el = createDeck(SAMPLE_DECK);
    el.setAttribute('theme', 'dark');
    expect(varOf(el, '--wd-color-bg')).toBe('#18181C');
  });

  it('loads the external stylesheet into the Shadow DOM, in order', async () => {
    const el = createDeck(SAMPLE_DECK);
    await vi.waitFor(() => {
      const ext = el.shadowRoot?.querySelector('#wd-external') as HTMLStyleElement;
      expect(ext.textContent).toContain('.dark');
    });
    // Nothing leaks to the document: no <style> outside the shadow root.
    expect(document.querySelector('style')).toBeNull();
  });

  it('degrades gracefully when a stylesheet cannot be fetched', async () => {
    const el = createDeck('---\nstylesheets:\n  - https://example.com/missing.css\n---\n\n# Still here\n\n- One panel.\n');
    await vi.waitFor(() => {
      expect(screenEl(el).querySelector('.wd-title')?.textContent).toBe('Still here');
    });
    expect(panelVisible(el, 0)).toBe(true);
    expect(varOf(el, '--wd-color-bg')).toBe('#FAFAF7');
  });

  it('ignores an http: stylesheet and still renders', async () => {
    const el = createDeck('---\nstylesheets:\n  - http://example.com/theme.css\n---\n\n# Still here\n\n- One panel.\n');
    await vi.waitFor(() => {
      expect(screenEl(el).querySelector('.wd-title')?.textContent).toBe('Still here');
    });
    expect(panelVisible(el, 0)).toBe(true);
  });

  it('scopes the inline CSS block to the deck and sanitises it', async () => {
    const el = createDeck('# Styled\n\n- Panel.\n\n```css\n@import url("evil.css");\n.hero { color: red; }\n.wd-panel { display: none; }\n```\n');
    const inline = el.shadowRoot?.querySelector('#wd-inline') as HTMLStyleElement;
    expect(inline.textContent).toContain('.hero');
    expect(inline.textContent).not.toContain('@import');
    expect(inline.textContent).not.toContain('display: none');
    // The panel still renders: the hiding rule was dropped.
    expect(panelVisible(el, 0)).toBe(true);
    // And nothing leaked to the host document.
    expect(document.querySelector('style')).toBeNull();
  });
});

describe('empty deck and scroll cue', () => {
  it('surfaces an empty deck as a state, not a blank page', () => {
    const el = createDeck('');
    expect((el.shadowRoot?.querySelector('.wd-empty') as HTMLElement).hidden).toBe(false);
    expect(screenEl(el).style.display).toBe('none');
  });

  it('shows the scroll cue only when the screen is scrollable and not at the bottom', () => {
    const el = createDeck(SAMPLE_DECK);
    const screen = screenEl(el);
    Object.defineProperty(screen, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(screen, 'clientHeight', { value: 900, configurable: true });
    Object.defineProperty(screen, 'scrollTop', { value: 0, configurable: true });
    screen.dispatchEvent(new window.Event('scroll'));
    expect((el.shadowRoot?.querySelector('.wd-scroll-cue') as HTMLElement).classList.contains('wd-scroll-cue--visible')).toBe(true);
    Object.defineProperty(screen, 'scrollTop', { value: 1100, configurable: true });
    screen.dispatchEvent(new window.Event('scroll'));
    expect((el.shadowRoot?.querySelector('.wd-scroll-cue') as HTMLElement).classList.contains('wd-scroll-cue--visible')).toBe(false);
  });
});

describe('top-left alignment and content-fit (design-policies §2.2)', () => {
  it('panels, title and section label are top- and left-aligned', () => {
    const el = createDeck('# Title\n\n- One.\n- Two.\n');
    // jsdom does not apply Shadow DOM stylesheets to computed
    // style, so the rules are asserted on the text of the
    // <style> the element actually renders with — the shipped
    // CSS, not a copy of it.
    const styleEl = el.shadowRoot?.querySelector('#wd-default') as HTMLStyleElement;
    const css = styleEl.textContent ?? '';
    expect(css).toContain('.wd-panels {');
    expect(css).toContain('margin: 0;\n  align-content: start;');
    expect(css).toContain('.wd-title {');
    expect(css).not.toContain('margin: 0 auto var(--wd-gap-title);');
    expect(css).not.toContain('align-content: center;');
    expect(css).not.toContain('.wd-screen--scrolling .wd-panels');
    expect(DEFAULT_CSS).toContain('align-content: start;');
  });

  it('the hero keeps its centred title treatment', () => {
    const el = createDeck('# Hero\n\n- Only panel.\n');
    expect(screenEl(el).classList.contains('wd-screen--hero')).toBe(true);
    expect(DEFAULT_CSS).toContain('.wd-screen--hero .wd-title');
    expect(DEFAULT_CSS).toContain('.wd-screen--hero .wd-panel');
  });

  it('the measurement pass shrinks overflowing content to the floor and shows the scroll cue', () => {
    const long = 'word '.repeat(400);
    const el = createDeck(`# Long\n\n- ${long}\n`);
    const screen = screenEl(el);
    // jsdom reports no layout: pretend the screen overflows at any size.
    Object.defineProperty(screen, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(screen, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(screen, 'scrollTop', { value: 0, configurable: true });
    el.setContainerSize(1440, 900);
    expect(varOf(el, '--wd-font-body')).toBe('12px');
    expect(screen.classList.contains('wd-screen--scrolling')).toBe(true);
    expect((el.shadowRoot?.querySelector('.wd-scroll-cue') as HTMLElement).classList.contains('wd-scroll-cue--visible')).toBe(true);
    // The measuring class is removed again after the pass — it
    // must never leak into the rendered screen.
    expect(screen.classList.contains('wd-screen--measuring')).toBe(false);
  });

  it('the measurement pass leaves a fitting screen at its fitted size', () => {
    const el = createDeck('# Short\n\n- One short bullet.\n');
    const screen = screenEl(el);
    Object.defineProperty(screen, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(screen, 'clientHeight', { value: 600, configurable: true });
    el.setContainerSize(1440, 900);
    // One short panel fits at the 32px ceiling.
    expect(varOf(el, '--wd-font-body')).toBe('32px');
  });

  it('the fitted size is fixed for the screen: total content sets it from the first step', () => {
    const long = 'word '.repeat(120);
    // The reveal marker goes at the top of the screen, before
    // the title (spec §4.1: top-of-screen markers only).
    const el = createDeck(`<!-- reveal: step -->\n\n# Mixed\n\n- Short.\n\n- ${long}\n`);
    // The fit is computed from the TOTAL content (short + long),
    // once, at the first step — 27.2px, not the 32px ceiling
    // the first panel alone would allow. Revealing the long
    // panel must not change it.
    expect(varOf(el, '--wd-font-body')).toBe('27.2px');
    expect(panelVisible(el, 0)).toBe(true);
    expect(panelVisible(el, 1)).toBe(false);
    el.next();
    expect(varOf(el, '--wd-font-body')).toBe('27.2px');
    expect(panelVisible(el, 0)).toBe(true);
    expect(panelVisible(el, 1)).toBe(true);
  });

  it('the fit reserves the bottom controls: a screen that fits the full viewport fits smaller with the reserve', () => {
    // ~950 characters in one panel fits the 900px viewport at
    // the 32px ceiling without the reserve — but not once the
    // controls' height + clearance (64px in jsdom, where the
    // controls have no layout to measure) is reserved.
    const el = createDeck(`# One\n\n- ${'word '.repeat(190)}\n`);
    expect(varOf(el, '--wd-reserve-bottom')).toBe('64px');
    const size = parseFloat(varOf(el, '--wd-font-body'));
    expect(size).toBeLessThan(32);
    expect(size).toBeGreaterThan(12);
  });

  it('the screen clears the bottom controls and the measurement sees the full screen', () => {
    const el = createDeck('# Short\n\n- One short bullet.\n');
    const styleEl = el.shadowRoot?.querySelector('#wd-default') as HTMLStyleElement;
    const css = styleEl.textContent ?? '';
    expect(css).toContain('padding-bottom: calc(var(--wd-space-screen-y) + var(--wd-reserve-bottom, calc(var(--wd-control-size) + var(--wd-space, 8px) * 2.5)));');
    expect(css).not.toContain('var(--wd-reserve-bottom, 64px)');
    expect(css).toContain('.wd-screen--measuring .wd-panel[hidden]');
    expect(css).toContain('display: block; visibility: hidden;');
  });
});

describe('viewport-relative chrome (audit C1–C12)', () => {
  // jsdom does not apply Shadow DOM stylesheets to computed
  // style, so the rules are asserted on the text of the
  // <style> the element actually renders with — the shipped
  // CSS, not a copy of it (same approach as the alignment tests).
  function cssOf(el: WalkdownDeckElement): string {
    const styleEl = el.shadowRoot?.querySelector('#wd-default') as HTMLStyleElement;
    return styleEl.textContent ?? '';
  }

  it('host min-height never exceeds the container (C1)', () => {
    const el = createDeck('# T\n\n- One.\n');
    expect(cssOf(el)).toContain('min-height: min(240px, 100%);');
    expect(cssOf(el)).not.toMatch(/min-height: 240px;/);
  });

  it('panel shadow follows the §4.1 clamp formula (C2)', () => {
    const el = createDeck('# T\n\n- One.\n');
    expect(cssOf(el)).toContain('box-shadow: 0 0 clamp(8px, 1vw + 4px, 16px) rgb(0 0 0 / 0.06);');
    expect(cssOf(el)).not.toContain('box-shadow: 0 1px 2px');
  });

  it('inline code radius is em-based (C3)', () => {
    expect(DEFAULT_CSS).toContain('border-radius: 0.25em;');
    expect(DEFAULT_CSS).not.toContain('border-radius: 4px;');
  });

  it('enter-animation travel is em-based (C4)', () => {
    expect(DEFAULT_CSS).toContain('translateY(0.5em)');
    expect(DEFAULT_CSS).toContain('translateX(1em)');
    expect(DEFAULT_CSS).toContain('translateX(-1em)');
    expect(DEFAULT_CSS).toContain('translateX(0.75em)');
    expect(DEFAULT_CSS).toContain('translateX(-0.75em)');
    expect(DEFAULT_CSS).not.toContain('translateY(10px)');
    expect(DEFAULT_CSS).not.toContain('translateX(24px)');
    expect(DEFAULT_CSS).not.toContain('translateX(-24px)');
    expect(DEFAULT_CSS).not.toContain('translateX(16px)');
    expect(DEFAULT_CSS).not.toContain('translateX(-16px)');
  });

  it('scroll cue height and padding derive from tokens (C5, C6)', () => {
    const el = createDeck('# T\n\n- One.\n');
    const css = cssOf(el);
    expect(css).toContain('height: calc(var(--wd-font-small) * 2 + var(--wd-space));');
    expect(css).toContain('padding-bottom: var(--wd-space);');
    expect(css).not.toContain('height: 48px;');
    expect(css).not.toContain('padding-bottom: 8px;');
  });

  it('control buttons derive from the clamp, with a 44px touch floor (C7, C8)', () => {
    const el = createDeck('# T\n\n- One.\n');
    const css = cssOf(el);
    expect(css).toContain('--wd-control-size: clamp(44px, 3vw + 8px, 56px);');
    expect(css).toContain('width: var(--wd-control-size);');
    expect(css).toContain('height: var(--wd-control-size);');
    expect(css).toContain('font-size: 1.25em;');
    expect(css).not.toContain('font-size: 20px;');
    expect(css).not.toContain('width: 40px;');
    expect(css).not.toContain('height: 40px;');
  });

  it('progress pill padding derives from the space token (C9)', () => {
    expect(DEFAULT_CSS).toContain('padding: calc(var(--wd-space) * 0.25) var(--wd-space);');
    expect(DEFAULT_CSS).not.toContain('padding: 2px 10px;');
  });

  it('end note clears the controls band and its padding is token-based (C10, C11)', () => {
    const el = createDeck('# T\n\n- One.\n');
    const css = cssOf(el);
    expect(css).toContain('bottom: calc(var(--wd-control-size) + var(--wd-space) * 2.5);');
    expect(css).not.toContain('bottom: 56px;');
    expect(css).toContain('padding: calc(var(--wd-space) * 0.5) var(--wd-space);');
    expect(css).not.toContain('padding: 4px 12px;');
  });

  it('bottom-controls clearance is half the space unit (C12)', () => {
    // jsdom has no layout, so the controls measure 0 and the
    // reserve is the 56px fallback + clearance: 4px at phone
    // width (space 8px), 8px at desktop (space 16px). The
    // clearance is space/2 at both widths — it scales with
    // the screen instead of a fixed 8px — and the reserve
    // still reaches the smallest real controls height (60px)
    // at phone width and past it at desktop.
    for (const [w, h, reserve] of [
      [360, 640, 60],
      [1440, 900, 64],
    ] as const) {
      const el = createDeck('# T\n\n- One.\n');
      el.setContainerSize(w, h);
      const space = parseFloat(varOf(el, '--wd-space'));
      const got = parseFloat(varOf(el, '--wd-reserve-bottom'));
      expect(got).toBe(reserve);
      expect(got - 56).toBeCloseTo(space / 2, 5);
      expect(got).toBeGreaterThanOrEqual(60);
    }
  });

  it('end-note clearance beats the controls height at phone and desktop widths (C8, C10, C12)', () => {
    // Evaluate the shipped formulas: --wd-space comes from the
    // layout engine for the container (the deck fills the window
    // in the demo, so container width is the viewport width);
    // --wd-control-size is the clamp in the shipped CSS.
    const m = /--wd-control-size: clamp\(([\d.]+)px, ([\d.]+)vw \+ ([\d.]+)px, ([\d.]+)px\);/.exec(DEFAULT_CSS);
    expect(m).not.toBeNull();
    const [cMin, cVw, cAdd, cMax] = [m![1], m![2], m![3], m![4]].map(Number);
    const clampPx = (w: number): number =>
      Math.min(cMax, Math.max(cMin, (cVw * w) / 100 + cAdd));
    for (const w of [360, 1440, 1920]) {
      const el = createDeck('# T\n\n- One.\n');
      el.setContainerSize(w, 900);
      const space = parseFloat(varOf(el, '--wd-space'));
      const btn = clampPx(w);
      // Controls height = button + top/bottom padding (both --wd-space);
      // end-note bottom = button + 2.5× space, i.e. half a space unit
      // of clearance (C12) above the controls band.
      const controls = btn + 2 * space;
      const bottom = btn + 2.5 * space;
      expect(btn).toBeGreaterThanOrEqual(44);
      expect(bottom).toBeGreaterThan(controls);
      expect(bottom - controls).toBeCloseTo(0.5 * space, 5);
    }
  });
});
