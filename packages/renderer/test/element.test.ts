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
  it('renders 13 screens / 47 steps, starting at the hero', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(el.screens).toHaveLength(13);
    expect(el.stepsTotal).toBe(47);
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    expect(screenEl(el).querySelector('.wd-title')?.textContent).toBe('Walkdown');
    expect(screenEl(el).classList.contains('wd-screen--hero')).toBe(true);
    expect(progressText(el)).toBe('1 / 47');
  });

  it('the hero panel holds a bold h2 Walkdown above its line, in one panel', () => {
    const el = createDeck(SAMPLE_DECK);
    const panel = panels(el)[0] as HTMLElement;
    expect(panels(el)).toHaveLength(1);
    const h2 = panel.querySelector('h2') as HTMLElement;
    expect(h2).not.toBeNull();
    expect(h2.textContent).toBe('Walkdown');
    // Bold from the browser default: no author rule sets a
    // weight on panel headings, so the h2 keeps its bold.
    // (jsdom reports the same 'bold' from its UA stylesheet.)
    expect(window.getComputedStyle(h2).fontWeight).toBe('bold');
    expect(panel.textContent).toContain('Simple, magical presentation from Markdown');
    // The added h2 line does not shrink the hero fit: the
    // estimator still lands on the 32px ceiling at desktop.
    expect(varOf(el, '--wd-font-body')).toBe('32px');
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
    for (let i = 0; i < 46; i++) el.next();
    expect(el.state.screenIndex).toBe(12);
    expect(el.state.stepIndex).toBe(2); // last screen has 3 panels, all stepped
    el.next();
    expect(el.state.screenIndex).toBe(12);
    el.goToStart();
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    el.goToEnd();
    expect(el.state.screenIndex).toBe(12);
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
    expect(el.state.screenIndex).toBe(12);
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
    expect(el.state.screenIndex).toBe(12);
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

describe('Start over button and zoom-in effect', () => {
  it('shows a Start over button only at the end, and it returns to the start', () => {
    const el = createDeck(SAMPLE_DECK);
    const restart = el.shadowRoot?.querySelector('.wd-restart') as HTMLButtonElement;
    expect(restart.tagName).toBe('BUTTON');
    expect(restart.type).toBe('button');
    expect(restart.textContent).toBe('Start over');
    // No label text: the end note holds only the button.
    expect((el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement).textContent).toBe('Start over');
    // Hidden mid-deck: the end note is hidden until the last step.
    expect((el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement).hidden).toBe(true);
    el.goToEnd();
    expect((el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement).hidden).toBe(false);
    restart.click();
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    expect((el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement).hidden).toBe(true);
    expect(progressText(el)).toBe('1 / 47');
  });

  it('the Start over button is a native keyboard-operable button', () => {
    const el = createDeck(SAMPLE_DECK);
    const restart = el.shadowRoot?.querySelector('.wd-restart') as HTMLButtonElement;
    // A native <button> is focusable and fires click on Enter/Space
    // with no extra wiring; tabIndex is the default 0.
    expect(restart.tabIndex).toBe(0);
    expect(restart.disabled).toBe(false);
  });

  it('the end note carries no border of its own: the button is the single pill', () => {
    // The note used to be a pill too (border + background +
    // padding) around the button's own pill border — a double
    // border. Now it is unstyled positioning only; the button
    // carries the one border, and its dead margin-left from the
    // label era is gone, so it sits centred in the note.
    const rule = (selector: string): string => {
      const m = new RegExp(`${selector} \\{([^}]*)\\}`).exec(DEFAULT_CSS);
      expect(m).not.toBeNull();
      return m?.[1] ?? '';
    };
    const note = rule('\\.wd-end-note');
    expect(note).not.toContain('border');
    expect(note).not.toContain('background');
    expect(note).not.toContain('padding');
    expect(note).toContain('position: absolute;');
    expect(note).toContain('left: 50%;');
    expect(note).toContain('transform: translateX(-50%);');
    const button = rule('\\.wd-end-note button');
    expect(button).toContain('border: 1px solid var(--wd-color-border);');
    expect(button).toContain('border-radius: 999px;');
    expect(button).not.toContain('margin-left');
    // And the button is still centred and clickable at the end.
    const el = createDeck(SAMPLE_DECK);
    el.goToEnd();
    const restart = el.shadowRoot?.querySelector('.wd-restart') as HTMLButtonElement;
    expect(restart.textContent).toBe('Start over');
    restart.click();
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
  });

  it('the end note sits at the measured bottom reserve, not a fixed height', () => {
    // The fallback is defined once on .wd-deck now (see the
    // single-definition test in the #38 block below); the note
    // only reads the var.
    expect(DEFAULT_CSS).toContain('bottom: var(--wd-reserve-bottom);');
  });

  it('a panel with a zoom-in marker enters with the zoom-in animation', () => {
    const el = createDeck(`# One\n\n- A\n\n---\n\n<!-- reveal: step; effect: slide-in -->\n\n# Two\n\n<!-- reveal: effect: zoom-in -->\n- Big\n\n- Plain\n`);
    expect(DEFAULT_CSS).toContain('@keyframes wd-zoom-in');
    el.next(); // screen 1, step 0: panel 0 enters with its own zoom-in, not the screen's slide-in
    expect(panels(el)[0]?.classList.contains('wd-enter--zoom-in')).toBe(true);
    expect(panels(el)[0]?.classList.contains('wd-enter--slide-in-forward')).toBe(false);
    el.next(); // panel 1 inherits the screen's slide-in
    expect(panels(el)[1]?.classList.contains('wd-enter--slide-in-forward')).toBe(true);
  });

  it('the Make it move screen reveals each panel with its own effect', () => {
    const el = createDeck(SAMPLE_DECK);
    const idx = el.screens.findIndex((s) => s.title === 'Make it move');
    expect(idx).toBe(11);
    const screen = el.screens[idx];
    expect(screen?.panels.map((p) => p.effect)).toEqual(['fade-in', 'slide-in', 'zoom-in', undefined]);
    el.jumpTo(idx);
    el.next(); // panel 1: slide-in, at the Section's 250ms
    expect(panels(el)[1]?.classList.contains('wd-enter--slide-in-forward')).toBe(true);
    el.next(); // panel 2: zoom-in, duration inherited from the screen
    expect(panels(el)[2]?.classList.contains('wd-enter--zoom-in')).toBe(true);
    expect(panels(el)[2]?.style.getPropertyValue('--wd-anim-duration')).toBe('250ms');
    el.next(); // panel 3: no marker, inherits the Section's slide-in
    expect(panels(el)[3]?.classList.contains('wd-enter--slide-in-forward')).toBe(true);
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
    expect(varOf(el, '--wd-color-accent')).toBe('#2E7D6B');
    expect(varOf(el, '--wd-font-family-title')).toContain('Georgia');
  });

  it('the sample deck overrides its fonts to Open Sans via its inline CSS', async () => {
    const el = createDeck(SAMPLE_DECK);
    // The Google Fonts stylesheet 404s under the test fetch
    // stub, so the deck degrades to the system stack — but the
    // inline override itself must survive sanitising and land
    // in the shadow DOM, ready for when the font does load.
    const inline = el.shadowRoot?.querySelector('#wd-inline') as HTMLStyleElement;
    expect(inline.textContent).toContain('.wd-deck');
    expect(inline.textContent).toContain("--wd-font-family-body: 'Open Sans'");
    expect(inline.textContent).toContain("--wd-font-family-title: 'Open Sans'");
    expect(inline.textContent).toContain('!important');
    // The hero text is left-aligned by the same block.
    expect(inline.textContent).toContain('.hero');
    expect(inline.textContent).toContain('text-align: left;');
    expect(inline.textContent).not.toContain('text-align: center;');
    // The deck still renders with the default theme underneath.
    expect(varOf(el, '--wd-font-family-title')).toContain('Georgia');
    expect(panelVisible(el, 0)).toBe(true);
  });

  it('switches to the dark palette from frontmatter theme:', () => {
    const el = createDeck('---\ntheme: dark\n---\n\n# Dark deck\n\n- One panel.\n');
    expect(varOf(el, '--wd-color-bg')).toBe('#18181C');
    expect(varOf(el, '--wd-color-ink')).toBe('#F5F5F0');
    expect(varOf(el, '--wd-color-accent')).toBe('#7FC8B8');
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
    // controls' height + clearance is reserved (68px in jsdom,
    // where the controls have no layout to measure: the 60px
    // fallback height + 8px half-space at the 1440px fallback
    // width).
    const el = createDeck(`# One\n\n- ${'word '.repeat(190)}\n`);
    expect(varOf(el, '--wd-reserve-bottom')).toBe('68px');
    const size = parseFloat(varOf(el, '--wd-font-body'));
    expect(size).toBeLessThan(32);
    expect(size).toBeGreaterThan(12);
  });

  it('the screen clears the bottom controls and the measurement sees the full screen', () => {
    const el = createDeck('# Short\n\n- One short bullet.\n');
    const styleEl = el.shadowRoot?.querySelector('#wd-default') as HTMLStyleElement;
    const css = styleEl.textContent ?? '';
    // The clearance is a trailing in-flow spacer, not bottom
    // padding on the screen (issue #38: Safari does not count
    // end padding toward a flex container's scrollable
    // overflow, so padding let the last panel sit under the
    // controls at max scroll).
    expect(css).toContain('height: calc(var(--wd-space-screen-y) + var(--wd-reserve-bottom));');
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

  it('end note clears the controls band; the button keeps token-based padding (C10, C11)', () => {
    const el = createDeck('# T\n\n- One.\n');
    const css = cssOf(el);
    // The note sits at the bottom reserve; the fallback is the
    // single definition on .wd-deck (control size + 2.5× space),
    // and the note only reads the var.
    expect(css).toContain('bottom: var(--wd-reserve-bottom);');
    expect(varOf(el, '--wd-reserve-bottom')).not.toBe('');
    expect(css).not.toContain('bottom: 56px;');
    // The note itself is unstyled positioning only — no pill
    // padding of its own — while the button keeps its
    // token-based padding (a quarter space unit vertically).
    const note = /\.wd-end-note \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(note).not.toContain('padding');
    expect(css).toContain('padding: calc(var(--wd-space) * 0.25) var(--wd-space);');
    expect(css).not.toContain('padding: 4px 12px;');
  });

  it('bottom-controls clearance is half the space unit (C12)', () => {
    // jsdom has no layout, so the controls measure 0 and the
    // reserve is the 60px fallback + clearance: 4px at phone
    // width (space 8px), 8px at desktop (space 16px). The
    // clearance is space/2 at both widths — it scales with
    // the screen instead of a fixed 8px — and the reserve
    // clears the smallest real controls height (60px) at
    // phone width and past it at desktop.
    for (const [w, h, reserve] of [
      [360, 640, 64],
      [1440, 900, 68],
    ] as const) {
      const el = createDeck('# T\n\n- One.\n');
      el.setContainerSize(w, h);
      const space = parseFloat(varOf(el, '--wd-space'));
      const got = parseFloat(varOf(el, '--wd-reserve-bottom'));
      expect(got).toBe(reserve);
      expect(got - 60).toBeCloseTo(space / 2, 5);
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

describe('navigation menu (§6.6)', () => {
  function indicator(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-progress-text') as HTMLButtonElement;
  }
  function menu(el: WalkdownDeckElement): HTMLElement {
    return el.shadowRoot?.querySelector('.wd-nav-menu') as HTMLElement;
  }
  function menuItems(el: WalkdownDeckElement): HTMLButtonElement[] {
    return [...(el.shadowRoot?.querySelectorAll('.wd-nav-menu-item') as NodeListOf<HTMLButtonElement>)];
  }
  function menuLabels(el: WalkdownDeckElement): string[] {
    return menuItems(el).map((b) => b.textContent ?? '');
  }
  function shadowActive(el: WalkdownDeckElement): Element | null {
    return el.shadowRoot?.activeElement ?? null;
  }

  it('the step count is a button with menu semantics; the menu is hidden by default', () => {
    const el = createDeck(SAMPLE_DECK);
    const btn = indicator(el);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.type).toBe('button');
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('wd-nav-menu');
    expect(menu(el).hidden).toBe(true);
    expect(menu(el).getAttribute('role')).toBe('menu');
  });

  it('clicking the indicator opens the menu with First, every Section by name, Last — and focuses the current Section', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    expect(indicator(el).getAttribute('aria-expanded')).toBe('true');
    expect(menuLabels(el)).toEqual([
      'First screen',
      'Intro',
      'How it works',
      'Walking',
      'Customize',
      'Last screen',
    ]);
    for (const item of menuItems(el)) {
      expect(item.tagName).toBe('BUTTON');
      expect(item.getAttribute('role')).toBe('menuitem');
    }
    // At the start the current Section is "Intro", and focus moved to it.
    expect(shadowActive(el)?.textContent).toBe('Intro');
  });

  it('items are finger-sized, and the current item is a background highlight only — no border, ocean-green tint', () => {
    // Type clearly above the 12–14px small size; at least 48px
    // tall, a touch above the settled 44px touch floor (C8);
    // both viewport-relative clamps, never a fixed px size.
    expect(DEFAULT_CSS).toContain('font-size: clamp(16px, 1.2vw + 10px, 20px);');
    expect(DEFAULT_CSS).toContain('min-height: clamp(48px, 3vw + 12px, 56px);');
    // The current item keeps its bold, but the old treatment —
    // amber left border, rounded corners, peach background —
    // is gone; only the ocean-green tint remains. The tint now
    // derives from the accent var: when the whole theme went
    // ocean green, the accent BECAME the tint's green, so the
    // hardcoded value is gone and the tint follows the theme.
    // (The two negative assertions that used to sit here kept
    // the amber accent out of the tint; they are retired now
    // the accent IS the ocean green.)
    expect(DEFAULT_CSS).toContain('background: color-mix(in srgb, var(--wd-color-accent) 20%, var(--wd-color-panel));');
    expect(DEFAULT_CSS).not.toContain('#2E7D6B');
    // No border or radius in the item rules themselves (a global
    // assertion cannot be used: border-radius appears on other
    // elements, and the item keeps its `border: none` reset).
    // Comments are stripped first — the rules' own comments
    // mention the removed border.
    const stripComments = (rule: string): string => rule.replace(/\/\*[\s\S]*?\*\//g, '');
    const itemRule = stripComments(/\.wd-nav-menu-item \{[^}]*\}/.exec(DEFAULT_CSS)?.[0] ?? '');
    const currentRule = stripComments(/\.wd-nav-menu-item--current \{[^}]*\}/.exec(DEFAULT_CSS)?.[0] ?? '');
    expect(itemRule).not.toContain('border-left');
    expect(itemRule).not.toContain('border-radius');
    expect(currentRule).not.toContain('border');
    expect(currentRule).not.toContain('border-radius');
  });

  it('clicking a Section jumps to its first screen at step 0 and closes the menu', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    const walking = menuItems(el).find((b) => b.textContent === 'Walking');
    expect(walking).toBeDefined();
    walking?.click();
    // "Walking" starts at the "Next and Previous" screen (flat index 7).
    const firstOfSection = el.screens.findIndex((s) => s.title === 'Next and Previous');
    expect(firstOfSection).toBe(7);
    expect(el.state).toEqual({ screenIndex: 7, stepIndex: 0, zoom: 0 });
    expect(menu(el).hidden).toBe(true);
    expect(indicator(el).getAttribute('aria-expanded')).toBe('false');
    expect(shadowActive(el)).toBe(indicator(el));
  });

  it('First screen and Last screen go to the deck ends', () => {
    const el = createDeck(SAMPLE_DECK);
    el.goToEnd();
    indicator(el).click();
    menuItems(el).find((b) => b.textContent === 'First screen')?.click();
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    expect(menu(el).hidden).toBe(true);
    indicator(el).click();
    menuItems(el).find((b) => b.textContent === 'Last screen')?.click();
    expect(el.state.screenIndex).toBe(12);
    expect(el.state.stepIndex).toBe(2);
    expect(menu(el).hidden).toBe(true);
  });

  it('clicking the indicator again closes the menu', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    indicator(el).click();
    expect(menu(el).hidden).toBe(true);
    expect(indicator(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape closes the menu and returns focus to the indicator', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    key(el, 'Escape');
    expect(menu(el).hidden).toBe(true);
    expect(shadowActive(el)).toBe(indicator(el));
  });

  it('clicking outside the deck closes the menu', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    expect(menu(el).hidden).toBe(true);
    expect(shadowActive(el)).toBe(indicator(el));
  });

  it('a tap on the screen while the menu is open only closes it — it does not navigate', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    pointer(el, 'pointerdown', 600);
    pointer(el, 'pointerup', 600);
    expect(menu(el).hidden).toBe(true);
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
  });

  it('the current Section is marked aria-current, and only it', () => {
    const el = createDeck(SAMPLE_DECK);
    el.jumpTo(7); // "Next and Previous", in the "Walking" Section
    indicator(el).click();
    const current = menuItems(el).filter((b) => b.getAttribute('aria-current') === 'true');
    expect(current.map((b) => b.textContent)).toEqual(['Walking']);
    expect(menuItems(el).find((b) => b.textContent === 'Walking')?.classList.contains('wd-nav-menu-item--current')).toBe(true);
  });

  it('a Section with no title is labelled Section N', () => {
    const el = createDeck(`# One\n\n- A\n\n---\n\n# Two\n\n- B\n`);
    indicator(el).click();
    expect(menuLabels(el)).toEqual(['First screen', 'Section 1', 'Last screen']);
  });

  it('the menu is capped in height and scrolls within itself, anchored one space above the controls', () => {
    expect(DEFAULT_CSS).toContain('--wd-nav-menu-max-height: min(50vh, 420px)');
    expect(DEFAULT_CSS).toContain('max-height: var(--wd-nav-menu-max-height, min(50vh, 420px))');
    expect(DEFAULT_CSS).toContain('overflow-y: auto');
    expect(DEFAULT_CSS).toContain(
      'bottom: calc(var(--wd-reserve-bottom) + var(--wd-space, 8px) / 2)',
    );
  });

  it('the menu keeps the controls visible while it is open', () => {
    expect(DEFAULT_CSS).toContain('.wd-deck--nav-open .wd-controls { opacity: 1; }');
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(deckEl(el).classList.contains('wd-deck--nav-open')).toBe(true);
    key(el, 'Escape');
    expect(deckEl(el).classList.contains('wd-deck--nav-open')).toBe(false);
  });
});

describe('reveal auto-scroll (§7.4)', () => {
  /**
   * jsdom has no layout, so the scroll geometry is mocked:
   * the screen reports a 600px viewport over 2000px of content,
   * panels sit at fixed content positions, and scrollTo is a stub
   * that actually moves the mocked scrollTop — so the scroll
   * arithmetic is exercised end to end, with real pixels only
   * in a browser.
   */
  function mockScrollingScreen(
    el: WalkdownDeckElement,
    panelTops: number[],
    opts: { clientHeight?: number; scrollHeight?: number; scrollTop?: number; panelHeight?: number } = {},
  ): { scrollTo: ReturnType<typeof vi.fn> } {
    const screen = screenEl(el);
    const clientHeight = opts.clientHeight ?? 600;
    const scrollHeight = opts.scrollHeight ?? 2000;
    const panelHeight = opts.panelHeight ?? 200;
    let top = opts.scrollTop ?? 0;
    Object.defineProperty(screen, 'clientHeight', { value: clientHeight, configurable: true });
    Object.defineProperty(screen, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(screen, 'scrollTop', {
      get: () => top,
      set: (v: number) => {
        top = v;
      },
      configurable: true,
    });
    const scrollTo = vi.fn((o: ScrollToOptions) => {
      top = o.top ?? top;
    });
    screen.scrollTo = scrollTo as unknown as typeof screen.scrollTo;
    // Panels are re-rendered on every step, so the rect mock
    // lives on the prototype and reads the panel's data-panel
    // index — viewport top is the content top minus the live
    // scroll, exactly as a browser reports it.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const idx = Number((this as HTMLElement).dataset?.panel ?? -1);
      const cTop = panelTops[idx];
      if (cTop === undefined) {
        return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      const vTop = cTop - top;
      return {
        top: vTop,
        left: 0,
        width: 800,
        height: panelHeight,
        right: 800,
        bottom: vTop + panelHeight,
        x: 0,
        y: vTop,
        toJSON: () => ({}),
      } as DOMRect;
    });
    return { scrollTo };
  }

  const LONG_DECK = `<!-- reveal: step -->\n\n# Long\n\n- One\n\n- Two\n\n- Three\n\n- Four\n`;
  // Panel content tops (200px panels): 100 / 320 / 540 / 760.
  // The reserve is 68px in jsdom (60px fallback + space/2 at
  // 1440px), so the visible window ends at scrollTop + 532.
  const PANEL_TOPS = [100, 320, 540, 760];

  it('scrolls just enough to bring a newly revealed panel below the fold into view', () => {
    const el = createDeck(LONG_DECK);
    const { scrollTo } = mockScrollingScreen(el, PANEL_TOPS);
    el.next(); // panel 1: bottom 520, inside the window — no scroll
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screenEl(el).scrollTop).toBe(0);
    el.next(); // panel 2: bottom 740 — scrolls so its bottom clears the controls
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 208, behavior: 'smooth' });
    expect(screenEl(el).scrollTop).toBe(208);
    el.next(); // panel 3: bottom 960 — scrolls again, from the new position
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 428, behavior: 'smooth' });
    expect(screenEl(el).scrollTop).toBe(428);
  });

  it('does not move the scroll when the newly revealed panel is already fully visible', () => {
    const el = createDeck(LONG_DECK);
    const { scrollTo } = mockScrollingScreen(el, PANEL_TOPS);
    el.next(); // panel 1: bottom 520 ≤ 532 — fully visible
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screenEl(el).scrollTop).toBe(0);
  });

  it('does not scroll during the font-fit measurement pass', () => {
    const el = createDeck(LONG_DECK);
    const { scrollTo } = mockScrollingScreen(el, PANEL_TOPS);
    screenEl(el).classList.add('wd-screen--measuring');
    el.next();
    el.next(); // panel 2 is below the fold — but measuring, so no scroll
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screenEl(el).scrollTop).toBe(0);
    screenEl(el).classList.remove('wd-screen--measuring');
    el.next(); // panel 3, measuring over — scrolls normally
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 428, behavior: 'smooth' });
  });

  it('scrolls instantly under prefers-reduced-motion', () => {
    const el = createDeck(LONG_DECK);
    const { scrollTo } = mockScrollingScreen(el, PANEL_TOPS);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    el.next();
    el.next(); // panel 2 below the fold — instant, not smooth
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screenEl(el).scrollTop).toBe(208);
  });

  it('scrolls up to a newly revealed panel above the fold on a sequence screen', () => {
    const el = createDeck(`<!-- reveal: step; sequence: 3, 1, 2 -->\n\n# Seq\n\n- One\n\n- Two\n\n- Three\n`);
    // sequence: 3, 1, 2 — step 0 shows panel 2 only; the reader
    // has scrolled down to it (scrollTop 500).
    const { scrollTo } = mockScrollingScreen(el, PANEL_TOPS, { scrollTop: 500 });
    expect(panelVisible(el, 2)).toBe(true);
    el.next(); // reveals panel 0, above the fold — scrolls up to its top
    expect(panelVisible(el, 0)).toBe(true);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' });
  });

  it('does not scroll for the first panel of a newly entered screen', () => {
    const el = createDeck(`# One\n\n- Only.\n\n---\n\n<!-- reveal: step -->\n\n# Long\n\n- One\n\n- Two\n\n- Three\n\n- Four\n`);
    const { scrollTo } = mockScrollingScreen(el, PANEL_TOPS);
    el.next(); // enters screen 2 at step 0 — first panel is at the top
    expect(el.state.screenIndex).toBe(1);
    expect(scrollTo).not.toHaveBeenCalled();
    el.next(); // panel 1: bottom 520 — fully visible
    expect(scrollTo).not.toHaveBeenCalled();
    el.next(); // panel 2: below the fold — scrolls
    expect(scrollTo).toHaveBeenCalledWith({ top: 208, behavior: 'smooth' });
  });
});

describe('bottom clearance is scrollable (issue #38)', () => {
  // Safari/WebKit does not count end padding toward a flex
  // container's scrollable overflow (WebKit bug 318111), so a
  // padding-based bottom clearance let the last panel scroll
  // only as far as the container's bottom edge — underneath
  // the overlaid controls, as Samir's screenshot showed
  // ("Lists inside panels", step 18/47). The clearance must
  // therefore be an in-flow flex item (a trailing spacer), not
  // container padding. jsdom has no layout, so the mechanism
  // is pinned on the shipped CSS text and the clearance is
  // evaluated from the shipped formulas — the WebKit behaviour
  // itself can only be checked in a real browser.
  function cssOf(el: WalkdownDeckElement): string {
    const styleEl = el.shadowRoot?.querySelector('#wd-default') as HTMLStyleElement;
    return styleEl.textContent ?? '';
  }
  function ruleOf(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`${escaped} \\{([^}]*)\\}`).exec(css);
    expect(m).not.toBeNull();
    return m![1];
  }

  it('the screen carries no reserve in its bottom padding', () => {
    const css = cssOf(createDeck('# T\n\n- One.\n'));
    const rule = ruleOf(css, '.wd-screen');
    expect(rule).not.toContain('--wd-reserve-bottom');
    expect(rule).not.toContain('padding-bottom');
    expect(rule).toContain('padding: var(--wd-space-screen-y) var(--wd-space-screen-x) 0;');
  });

  it('a trailing in-flow spacer carries the full clearance', () => {
    const css = cssOf(createDeck('# T\n\n- One.\n'));
    const rule = ruleOf(css, '.wd-screen::after');
    expect(rule).toContain("content: '';");
    expect(rule).toContain('flex: 0 0 auto;');
    expect(rule).toContain(
      'height: calc(var(--wd-space-screen-y) + var(--wd-reserve-bottom));',
    );
    expect(rule).not.toContain('var(--wd-reserve-bottom, 64px)');
  });

  it('the reserve fallback is defined once, on .wd-deck — the spacer, menu and end note only read the var', () => {
    const css = cssOf(createDeck('# T\n\n- One.\n'));
    const fallback = 'calc(var(--wd-control-size) + var(--wd-space, 8px) * 2.5)';
    // Exactly one fallback calc in the whole default stylesheet…
    expect(css.split(fallback).length - 1).toBe(1);
    // …and it is the default value of --wd-reserve-bottom on .wd-deck…
    expect(ruleOf(css, '.wd-deck')).toContain(`--wd-reserve-bottom: ${fallback};`);
    // …while the three consumers read the var with no fallback of their own.
    expect(ruleOf(css, '.wd-screen::after')).toContain(
      'height: calc(var(--wd-space-screen-y) + var(--wd-reserve-bottom));',
    );
    expect(ruleOf(css, '.wd-nav-menu')).toContain(
      'bottom: calc(var(--wd-reserve-bottom) + var(--wd-space, 8px) / 2);',
    );
    expect(ruleOf(css, '.wd-end-note')).toContain('bottom: var(--wd-reserve-bottom);');
  });

  it('the spacer clearance beats the controls height at phone and desktop widths', () => {
    // Evaluate the shipped formulas at each width: screen
    // padding Y is clamp(16, 3vh + 8, 48); the reserve is the
    // controls' height (button + 2× space) + half-space
    // clearance. The spacer must clear the controls band with
    // room to spare at every width, so the last panel's last
    // line can scroll fully above it.
    for (const [w, h] of [
      [360, 640],
      [1440, 900],
      [1920, 1080],
    ] as const) {
      const el = createDeck('# T\n\n- One.\n');
      el.setContainerSize(w, h);
      const space = parseFloat(varOf(el, '--wd-space'));
      const padY = parseFloat(varOf(el, '--wd-space-screen-y'));
      const reserve = parseFloat(varOf(el, '--wd-reserve-bottom'));
      const btn = Math.min(56, Math.max(44, (3 * w) / 100 + 8));
      const controls = btn + 2 * space;
      expect(padY + reserve).toBeGreaterThan(controls);
    }
  });
});
