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
/** The nine theme vars (core themeVars) — the ones that must never be inline style (§11.2). */
const THEME_VAR_NAMES = [
  '--wd-font-family-body',
  '--wd-font-family-title',
  '--wd-font-family-code',
  '--wd-color-bg',
  '--wd-color-panel',
  '--wd-color-ink',
  '--wd-color-muted',
  '--wd-color-border',
  '--wd-color-accent',
];
/**
 * The theme default for a theme var: the fallback in the
 * `#wd-theme` stylesheet layer's private alias. (jsdom does not
 * compute shadow-DOM stylesheet rules, so the layer's text —
 * not computed style — is what a test can see.)
 */
function themeVarOf(el: WalkdownDeckElement, name: string): string {
  const css = (el.shadowRoot?.querySelector('#wd-theme') as HTMLStyleElement)?.textContent ?? '';
  const prefix = `--_${name.slice(2)}: var(${name}, `;
  const line = css.split('\n').find((l) => l.trim().startsWith(prefix));
  return line === undefined ? '' : line.trim().slice(prefix.length, -2).trim();
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
  it('renders 15 screens / 54 steps, starting at the hero', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(el.screens).toHaveLength(15);
    expect(el.stepsTotal).toBe(54);
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    expect(screenEl(el).querySelector('.wd-title')?.textContent).toBe('Walkdown');
    expect(screenEl(el).classList.contains('wd-screen--hero')).toBe(true);
    expect(progressText(el)).toBe('1 / 54');
  });

  it('the smallest deck screen is not hero-centred (3 panels, code block full width)', () => {
    const el = createDeck(SAMPLE_DECK);
    const idx = el.screens.findIndex((s) => s.title === 'The smallest deck');
    expect(idx).toBe(13);
    el.jumpTo(idx);
    // Three panels, so the single-panel hero rule does not apply:
    // the code block is not squeezed into the 720px hero box.
    expect(screenEl(el).classList.contains('wd-screen--hero')).toBe(false);
    expect(panels(el)).toHaveLength(3);
  });

  it('Customize screens carry the dark class on the screen element (§11.3)', () => {
    const el = createDeck(SAMPLE_DECK);
    // Screens 10–15 are the Customize section: the dark class lands
    // on the screen element itself (there is no section element).
    for (const idx of [9, 10, 11, 12, 13, 14]) {
      el.jumpTo(idx);
      expect(screenEl(el).classList.contains('dark')).toBe(true);
    }
    // Everywhere else it is absent — including the hero, which
    // carries only its own class.
    for (const idx of [1, 5, 8]) {
      el.jumpTo(idx);
      expect(screenEl(el).classList.contains('dark')).toBe(false);
    }
    el.jumpTo(0);
    expect(screenEl(el).classList.contains('dark')).toBe(false);
    expect(screenEl(el).classList.contains('hero')).toBe(true);
  });

  it('a section class lands on the screen element and leaves when the walk leaves the Section', () => {
    const el = createDeck(
      '<!-- section: Dark; class: dark -->\n\n# A\n\n- One\n\n---\n\n<!-- section: Plain -->\n\n# B\n\n- Two\n',
    );
    expect(screenEl(el).classList.contains('dark')).toBe(true);
    el.jumpTo(1);
    expect(screenEl(el).classList.contains('dark')).toBe(false);
  });

  it('dark screens re-theme the chrome: the label and cue sit on the dark screen (§7.4, issue #74)', () => {
    const el = createDeck(SAMPLE_DECK);
    // The dark-chrome rules in styles.ts key off the .dark class on the
    // screen element: the section label is the screen's descendant and
    // the scroll cue is the screen's following sibling, so both selectors
    // match exactly when the screen is dark — and only then. jsdom does
    // not compute shadow-DOM stylesheet rules (colour comes back
    // `canvastext`), so this test pins the structure the selectors need
    // and styles.test.ts pins the rules themselves; the rendered look
    // wants a look on the live demo.
    const label = el.shadowRoot?.querySelector('.wd-section-label') as HTMLElement;
    const cue = el.shadowRoot?.querySelector('.wd-scroll-cue') as HTMLElement;
    expect(screenEl(el).contains(label)).toBe(true);
    expect(screenEl(el).nextElementSibling).toBe(cue);
    for (const idx of [9, 10, 11, 12, 13, 14]) {
      el.jumpTo(idx);
      expect(screenEl(el).classList.contains('dark')).toBe(true);
    }
    el.jumpTo(1);
    expect(screenEl(el).classList.contains('dark')).toBe(false);
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
    for (let i = 0; i < 53; i++) el.next();
    expect(el.state.screenIndex).toBe(14);
    expect(el.state.stepIndex).toBe(2); // last screen has 3 panels, all stepped
    el.next();
    expect(el.state.screenIndex).toBe(14);
    el.goToStart();
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    el.goToEnd();
    expect(el.state.screenIndex).toBe(14);
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
    expect(el.state.screenIndex).toBe(14);
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
    expect(el.state.screenIndex).toBe(14);
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
    expect(progressText(el)).toBe('1 / 54');
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
    expect(button).toContain('border: 1px solid var(--_wd-color-border);');
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
  it('never renders body type below the 14px floor, even zoomed fully out on a phone', () => {
    const el = createDeck(SAMPLE_DECK);
    el.setContainerSize(360, 640);
    for (let i = 0; i < 4; i++) el.zoomOutStep();
    expect(el.state.zoom).toBe(-4);
    const bodyPx = parseFloat(varOf(el, '--wd-font-body'));
    expect(bodyPx).toBeGreaterThanOrEqual(14);
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
    expect(themeVarOf(el, '--wd-color-bg')).toBe('#FAFAF7');
    expect(themeVarOf(el, '--wd-color-ink')).toBe('#1B1B18');
    expect(themeVarOf(el, '--wd-color-accent')).toBe('#2E7D6B');
    expect(themeVarOf(el, '--wd-font-family-title')).toContain('Georgia');
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
    // (The !important in the deck file is now removable — the
    // theme layer no longer sets inline style — but the deck
    // file itself is left as-is here; removal is a follow-up.)
    expect(themeVarOf(el, '--wd-font-family-title')).toContain('Georgia');
    expect(panelVisible(el, 0)).toBe(true);
  });

  it('sets no theme var as inline style — the theme lives in the #wd-theme layer (§11.2)', () => {
    const el = createDeck(SAMPLE_DECK);
    for (const name of THEME_VAR_NAMES) expect(varOf(el, name)).toBe('');
    // …and not after a layout pass, a step, or a theme change either.
    el.setContainerSize(800, 600);
    el.next();
    el.setAttribute('theme', 'dark');
    for (const name of THEME_VAR_NAMES) expect(varOf(el, name)).toBe('');
    // Layout vars still go inline on every pass — that half is unchanged.
    expect(varOf(el, '--wd-font-body')).not.toBe('');
    expect(varOf(el, '--wd-reserve-bottom')).not.toBe('');
  });

  it('the theme layer is present from construction and follows the theme', () => {
    const el = document.createElement('walkdown-deck') as WalkdownDeckElement;
    document.body.appendChild(el);
    const theme = el.shadowRoot?.querySelector('#wd-theme') as HTMLStyleElement;
    expect(theme.textContent).toContain('--_wd-color-bg: var(--wd-color-bg, #FAFAF7);');
    expect(theme.textContent).toContain('--_wd-color-accent: var(--wd-color-accent, #2E7D6B);');
    el.setAttribute('theme', 'dark');
    expect(theme.textContent).toContain('--_wd-color-bg: var(--wd-color-bg, #18181C);');
    expect(theme.textContent).toContain('--_wd-color-accent: var(--wd-color-accent, #7FC8B8);');
    el.setAttribute('theme', 'light');
    expect(theme.textContent).toContain('--_wd-color-bg: var(--wd-color-bg, #FAFAF7);');
  });

  it('the theme layer sets color-scheme on .wd-deck per theme (§11.2, issue #85)', () => {
    // The declaration lives in the theme layer, so it tracks
    // the theme exactly like the aliases do — including when
    // the theme changes after construction.
    const el = document.createElement('walkdown-deck') as WalkdownDeckElement;
    document.body.appendChild(el);
    const theme = el.shadowRoot?.querySelector('#wd-theme') as HTMLStyleElement;
    expect(theme.textContent).toContain('color-scheme: light;');
    expect(theme.textContent).not.toContain('color-scheme: dark;');
    el.setAttribute('theme', 'dark');
    expect(theme.textContent).toContain('color-scheme: dark;');
    expect(theme.textContent).not.toContain('color-scheme: light;');
    el.setAttribute('theme', 'light');
    expect(theme.textContent).toContain('color-scheme: light;');
  });

  it('a deck stylesheet can override a theme var without !important (§11.2)', () => {
    const el = createDeck('# Tinted\n\n- Panel.\n\n```css\n.wd-deck { --wd-color-accent: #B00020; }\n```\n');
    const inline = el.shadowRoot?.querySelector('#wd-inline') as HTMLStyleElement;
    expect(inline.textContent).toContain('--wd-color-accent: #B00020');
    expect(inline.textContent).not.toContain('!important');
    // The theme layer's alias reads the public var, so the
    // deck's value is what the chrome resolves — and nothing
    // inline (which would beat any stylesheet rule) sets it
    // instead. jsdom does not compute shadow-DOM stylesheet
    // rules, so the rendered win itself wants a live-demo
    // check; what a test can pin is the mechanism.
    const theme = el.shadowRoot?.querySelector('#wd-theme') as HTMLStyleElement;
    expect(theme.textContent).toContain('--_wd-color-accent: var(--wd-color-accent, #2E7D6B);');
    expect(varOf(el, '--wd-color-accent')).toBe('');
    expect(panelVisible(el, 0)).toBe(true);
  });

  it('a deck stylesheet can re-theme one screen without !important (§11.2)', () => {
    const el = createDeck('# Tinted\n\n- Panel.\n\n```css\n.wd-screen { --wd-color-muted: #B00020; }\n```\n');
    const inline = el.shadowRoot?.querySelector('#wd-inline') as HTMLStyleElement;
    expect(inline.textContent).toContain('.wd-screen');
    expect(inline.textContent).toContain('--wd-color-muted: #B00020');
    expect(inline.textContent).not.toContain('!important');
    // The alias is defined on every element inside .wd-deck, so
    // it re-resolves on the screen from the screen's own public
    // var — the per-screen override reaches the chrome.
    const theme = el.shadowRoot?.querySelector('#wd-theme') as HTMLStyleElement;
    expect(theme.textContent).toContain('.wd-deck, .wd-deck * {');
    expect(panelVisible(el, 0)).toBe(true);
  });

  it('switches to the dark palette from frontmatter theme:', () => {
    const el = createDeck('---\ntheme: dark\n---\n\n# Dark deck\n\n- One panel.\n');
    expect(themeVarOf(el, '--wd-color-bg')).toBe('#18181C');
    expect(themeVarOf(el, '--wd-color-ink')).toBe('#F5F5F0');
    expect(themeVarOf(el, '--wd-color-accent')).toBe('#7FC8B8');
  });

  it('lets the theme attribute override the deck theme', () => {
    const el = createDeck(SAMPLE_DECK);
    el.setAttribute('theme', 'dark');
    expect(themeVarOf(el, '--wd-color-bg')).toBe('#18181C');
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
    expect(themeVarOf(el, '--wd-color-bg')).toBe('#FAFAF7');
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

describe('scroll cue position (§7.4, issue #64)', () => {
  it('the scroll cue sits at the bottom reserve, above the controls band', () => {
    // jsdom does not apply Shadow DOM stylesheets to computed style,
    // so the rule is asserted on the shipped CSS text — the same
    // pattern as the top-left alignment tests. The cue used to sit
    // at bottom: 0, inside the controls band, where the centred
    // step-count pill covered the centred cue text.
    const css = (createDeck('# T\n\n- One.\n').shadowRoot?.querySelector('#wd-default') as HTMLStyleElement).textContent ?? '';
    const cueRule = css.slice(css.indexOf('.wd-scroll-cue {'), css.indexOf('.wd-scroll-cue--visible'));
    expect(cueRule).toContain('bottom: var(--wd-reserve-bottom);');
    expect(cueRule).not.toContain('bottom: 0;');
    // The reserve is controls height + half-space clearance (§7.2),
    // so the cue's text — one space above the cue's bottom edge —
    // clears the top of the controls bar by 1.5× space at every
    // width (12px at 360px, 17.5px at 768px, 24px at 1440px).
    expect(DEFAULT_CSS).toContain('--wd-reserve-bottom: calc(var(--wd-control-size) + var(--wd-space, 8px) * 2.5);');
  });

  it('the cue lifts above the Start over note at the end of the deck', () => {
    expect(DEFAULT_CSS).toContain('.wd-deck--end .wd-scroll-cue {');
    expect(DEFAULT_CSS).toContain('bottom: calc(var(--wd-reserve-bottom) + var(--wd-font-small) + 2px);');
  });

  it('at the end of a long last screen the cue and the end note are both visible, with the deck marked at-end', () => {
    const long = 'word '.repeat(60);
    // The last screen reveals stepwise (without a marker it would
    // be a single step, and there would be no long last screen to
    // scroll — totalSteps would be 2, not 5).
    const el = createDeck(`# First\n\n- One.\n\n---\n\n<!-- reveal: step -->\n\n# Last\n\n- ${long}\n- ${long}\n- ${long}\n- ${long}\n`);
    el.goToEnd();
    expect(progressText(el)).toBe('5 / 5');
    const screen = screenEl(el);
    Object.defineProperty(screen, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(screen, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(screen, 'scrollTop', { value: 0, configurable: true });
    screen.dispatchEvent(new window.Event('scroll'));
    // The end note shows (last step) and the cue shows (scrollable,
    // not at the bottom) — the deck class is what lifts the cue
    // above the note, so without it the two would overlap.
    expect(deckEl(el).classList.contains('wd-deck--end')).toBe(true);
    expect((el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement).hidden).toBe(false);
    expect((el.shadowRoot?.querySelector('.wd-scroll-cue') as HTMLElement).classList.contains('wd-scroll-cue--visible')).toBe(true);
  });

  it('away from the end the deck is not marked at-end, so the cue sits at the reserve', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(progressText(el)).toBe('1 / 54');
    expect(deckEl(el).classList.contains('wd-deck--end')).toBe(false);
    expect((el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement).hidden).toBe(true);
  });

  it('an empty deck is not marked at-end', () => {
    const el = createDeck('');
    expect(deckEl(el).classList.contains('wd-deck--end')).toBe(false);
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
    expect(varOf(el, '--wd-font-body')).toBe('14px');
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
    // once, at the first step — 26.7px, not the 32px ceiling
    // the first panel alone would allow. (It was 27.2px before
    // the width-aware reserve fallback: the jsdom reserve is
    // 91.2px now, not 68px, so the fit has less height.)
    // Revealing the long panel must not change it.
    expect(varOf(el, '--wd-font-body')).toBe('26.7px');
    expect(panelVisible(el, 0)).toBe(true);
    expect(panelVisible(el, 1)).toBe(false);
    el.next();
    expect(varOf(el, '--wd-font-body')).toBe('26.7px');
    expect(panelVisible(el, 0)).toBe(true);
    expect(panelVisible(el, 1)).toBe(true);
  });

  it('the fit reserves the bottom controls: a screen that fits the full viewport fits smaller with the reserve', () => {
    // ~950 characters in one panel fits the 900px viewport at
    // the 32px ceiling without the reserve — but not once the
    // controls' height + clearance is reserved (91.2px in
    // jsdom, where the controls have no layout to measure:
    // the width-aware fallback height, 83.2px at the 1440px
    // fallback width, + 8px half-space).
    const el = createDeck(`# One\n\n- ${'word '.repeat(190)}\n`);
    expect(varOf(el, '--wd-reserve-bottom')).toBe('91.2px');
    const size = parseFloat(varOf(el, '--wd-font-body'));
    expect(size).toBeLessThan(32);
    expect(size).toBeGreaterThan(14);
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

describe('root font size scaling (§7.3, issue #76)', () => {
  // The root font size is global test state: restore it after
  // every test in this block so no other test sees a 20px root.
  afterEach(() => {
    document.documentElement.style.fontSize = '';
  });

  it('a larger root scales the fitted deck type proportionally', () => {
    document.documentElement.style.fontSize = '20px';
    const el = createDeck('# Short\n\n- One short bullet.\n');
    // One short panel fits at the ceiling at both roots:
    // 32px at the 16px default, 40px at the 20px root.
    expect(varOf(el, '--wd-font-body')).toBe('40px');
    expect(varOf(el, '--wd-font-floor')).toBe('17.5px');
    expect(varOf(el, '--wd-font-small')).toBe('17.5px');
  });

  it('the default root is unchanged', () => {
    const el = createDeck('# Short\n\n- One short bullet.\n');
    expect(varOf(el, '--wd-font-body')).toBe('32px');
    expect(varOf(el, '--wd-font-floor')).toBe('14px');
  });

  it('a smaller root is clamped to the default sizes', () => {
    document.documentElement.style.fontSize = '12px';
    const el = createDeck('# Short\n\n- One short bullet.\n');
    expect(varOf(el, '--wd-font-body')).toBe('32px');
    expect(varOf(el, '--wd-font-floor')).toBe('14px');
  });

  it('the measurement pass stops at the scaled floor', () => {
    document.documentElement.style.fontSize = '20px';
    const el = createDeck('# Short\n\n- One short bullet.\n');
    const screen = screenEl(el);
    // jsdom reports no layout: pretend the screen overflows at any size.
    Object.defineProperty(screen, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(screen, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(screen, 'scrollTop', { value: 0, configurable: true });
    el.setContainerSize(1440, 900);
    // The pass shrinks 1px at a time but never below the
    // scaled 17.5px floor.
    expect(varOf(el, '--wd-font-body')).toBe('17.5px');
    expect(screen.classList.contains('wd-screen--measuring')).toBe(false);
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
    // reserve is the width-aware fallback controls height +
    // clearance: 60px + 4px at phone width (space 8px),
    // 83.2px + 8px at desktop (space 16px). The clearance is
    // space/2 at both widths — it scales with the screen
    // instead of a fixed 8px — and the reserve clears the
    // fallback controls height at each width (the old flat
    // 60px fallback under-cleared above 400px; the width-aware
    // fallback is the same formula as the CSS one).
    for (const [w, h, reserve, controlsHeight] of [
      [360, 640, 64, 60],
      [1440, 900, 91.2, 83.2],
    ] as const) {
      const el = createDeck('# T\n\n- One.\n');
      el.setContainerSize(w, h);
      const space = parseFloat(varOf(el, '--wd-space'));
      const got = parseFloat(varOf(el, '--wd-reserve-bottom'));
      expect(got).toBe(reserve);
      expect(got - controlsHeight).toBeCloseTo(space / 2, 5);
      expect(got).toBeGreaterThanOrEqual(controlsHeight);
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
  function nextBtn(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-next') as HTMLButtonElement;
  }
  function focusIn(target: Element): void {
    // jsdom's .focus() does not dispatch focusin, so dispatch the
    // composed event the browser delivers (same pattern as the
    // F1/F6 tests: bubbles + composed, so it crosses the shadow
    // boundary and reaches the document listener).
    target.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true, composed: true }));
  }

  // Dispatch a keydown on the focused menu item (or the menu itself),
  // composed so the event crosses the shadow boundary to the host's walk
  // handler — exactly like a real keypress. Without `composed: true` the
  // host handler would never fire in jsdom and the "host skips the key"
  // assertions below would be vacuous.
  function menuKey(el: WalkdownDeckElement, keyName: string): void {
    const target = shadowActive(el) ?? menu(el);
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyName, bubbles: true, composed: true, cancelable: true }));
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
    // Type clearly above the 14px small size (1rem = 16px at
    // the default root, 1.25rem = 20px max); at least 48px
    // tall, a touch above the settled 44px touch floor (C8).
    // The type clamp is rem + vw — font-relative, so it
    // follows the user's root font size (§7.3); the min-height
    // clamp is a dimension, not type, so it stays px/vw.
    expect(DEFAULT_CSS).toContain('font-size: clamp(1rem, 1.2vw + 0.625rem, 1.25rem);');
    expect(DEFAULT_CSS).toContain('min-height: clamp(48px, 3vw + 12px, 56px);');
    // The current item keeps its bold, but the old treatment —
    // amber left border, rounded corners, peach background —
    // is gone; only the ocean-green tint remains. The tint now
    // derives from the accent alias: when the whole theme went
    // ocean green, the accent BECAME the tint's green, so the
    // hardcoded value is gone and the tint follows the theme.
    // (The two negative assertions that used to sit here kept
    // the amber accent out of the tint; they are retired now
    // the accent IS the ocean green.)
    expect(DEFAULT_CSS).toContain('background: color-mix(in srgb, var(--_wd-color-accent) 20%, var(--_wd-color-panel));');
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
    expect(el.state.screenIndex).toBe(14);
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

  it('ArrowDown moves to the next item, ArrowUp to the previous', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    // Focus starts on the current Section, "Intro".
    expect(shadowActive(el)?.textContent).toBe('Intro');
    menuKey(el, 'ArrowDown');
    expect(shadowActive(el)?.textContent).toBe('How it works');
    menuKey(el, 'ArrowDown');
    expect(shadowActive(el)?.textContent).toBe('Walking');
    menuKey(el, 'ArrowUp');
    expect(shadowActive(el)?.textContent).toBe('How it works');
    expect(menu(el).hidden).toBe(false);
  });

  it('ArrowDown wraps from the last item to the first, ArrowUp from the first to the last', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    menuKey(el, 'End');
    expect(shadowActive(el)?.textContent).toBe('Last screen');
    menuKey(el, 'ArrowDown');
    expect(shadowActive(el)?.textContent).toBe('First screen');
    menuKey(el, 'ArrowUp');
    expect(shadowActive(el)?.textContent).toBe('Last screen');
  });

  it('Home jumps to the first item, End to the last', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    menuKey(el, 'ArrowDown');
    menuKey(el, 'ArrowDown');
    expect(shadowActive(el)?.textContent).toBe('Walking');
    menuKey(el, 'Home');
    expect(shadowActive(el)?.textContent).toBe('First screen');
    menuKey(el, 'End');
    expect(shadowActive(el)?.textContent).toBe('Last screen');
    expect(menu(el).hidden).toBe(false);
  });

  it('ArrowUp/Down/Home/End while the menu is open do not scroll the screen or jump the deck', () => {
    const el = createDeck(SAMPLE_DECK);
    el.jumpTo(7); // mid-deck, so Home/End would move if they reached the host
    indicator(el).click();
    const before = el.state;
    // jsdom has no Element.scrollBy; provide the browser's so the
    // "host did not scroll" assertion can observe the call. Without the
    // fix, ArrowDown reaches the host and calls scrollBy, and End calls
    // goToEnd (state changes and the menu closes on navigation).
    const scrollBy = vi.fn();
    screenEl(el).scrollBy = scrollBy as never;
    menuKey(el, 'ArrowDown');
    expect(el.state).toEqual(before);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(menu(el).hidden).toBe(false);
    menuKey(el, 'End');
    expect(el.state).toEqual(before);
    expect(menu(el).hidden).toBe(false);
    menuKey(el, 'Home');
    expect(el.state).toEqual(before);
    expect(menu(el).hidden).toBe(false);
  });

  it('every item is reachable by keyboard alone — ArrowDown walks the whole menu', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    menuKey(el, 'Home');
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(shadowActive(el)?.textContent ?? '');
      menuKey(el, 'ArrowDown');
    }
    expect(seen).toEqual(['First screen', 'Intro', 'How it works', 'Walking', 'Customize', 'Last screen']);
    // After the sixth ArrowDown focus wrapped to the first item;
    // ArrowUp from there lands back on the last.
    expect(shadowActive(el)?.textContent).toBe('First screen');
    menuKey(el, 'ArrowUp');
    expect(shadowActive(el)?.textContent).toBe('Last screen');
    // Focusing an item scrolls it into view in a real browser, so the
    // menu's own scroll (overflow-y: auto) is reachable by keyboard;
    // jsdom does no layout, so the focus walk above is the provable form.
  });

  it('clicking outside the deck closes the menu', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    expect(menu(el).hidden).toBe(true);
    expect(shadowActive(el)).toBe(indicator(el));
  });

  it('Tab past the last menu item closes the menu and returns focus to the indicator', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    const items = menuItems(el);
    const last = items[items.length - 1] as HTMLButtonElement;
    // Focus moving between items keeps the menu open.
    focusIn(last);
    expect(menu(el).hidden).toBe(false);
    // Tab past the last item: focus lands on the Next button,
    // outside the menu and outside the indicator.
    focusIn(nextBtn(el));
    expect(menu(el).hidden).toBe(true);
    expect(indicator(el).getAttribute('aria-expanded')).toBe('false');
    expect(shadowActive(el)).toBe(indicator(el));
  });

  it('focus inside the menu — or on the indicator — keeps it open', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    const items = menuItems(el);
    focusIn(items[0] as HTMLButtonElement);
    expect(menu(el).hidden).toBe(false);
    focusIn(items[items.length - 1] as HTMLButtonElement);
    expect(menu(el).hidden).toBe(false);
    // The trigger is part of the menu system, not outside it.
    focusIn(indicator(el));
    expect(menu(el).hidden).toBe(false);
  });

  it('focus landing outside the deck closes the menu', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.appendChild(outside);
    focusIn(outside);
    expect(menu(el).hidden).toBe(true);
    expect(indicator(el).getAttribute('aria-expanded')).toBe('false');
    expect(shadowActive(el)).toBe(indicator(el));
    outside.remove();
  });

  it('after a focus-leave close, the indicator still opens the menu', () => {
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    focusIn(nextBtn(el));
    expect(menu(el).hidden).toBe(true);
    indicator(el).click();
    expect(menu(el).hidden).toBe(false);
    expect(indicator(el).getAttribute('aria-expanded')).toBe('true');
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
    // Visible AND focusable: opacity alone would leave the
    // controls opaque but unfocusable while the menu is open —
    // including the indicator, which focus returns to on close
    // (§6.5, issue #77).
    expect(DEFAULT_CSS).toContain('.wd-deck--nav-open .wd-controls { opacity: 1; visibility: visible; }');
    const el = createDeck(SAMPLE_DECK);
    indicator(el).click();
    expect(deckEl(el).classList.contains('wd-deck--nav-open')).toBe(true);
    key(el, 'Escape');
    expect(deckEl(el).classList.contains('wd-deck--nav-open')).toBe(false);
  });
});

describe('step-count indicator name (§6.6, issue #82)', () => {
  function indicator(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-progress-text') as HTMLButtonElement;
  }
  function description(el: WalkdownDeckElement): HTMLElement {
    return el.shadowRoot?.querySelector('#wd-progress-desc') as HTMLElement;
  }

  it('the accessible name is the visible text, with the context as a description', () => {
    const el = createDeck(SAMPLE_DECK);
    const btn = indicator(el);
    // No aria-label: the name comes from the button's content, so it
    // is exactly the visible text — a voice-control user saying
    // "click 1 / 54" matches it (WCAG 2.5.3 Label in Name).
    expect(btn.hasAttribute('aria-label')).toBe(false);
    expect(btn.textContent).toBe('1 / 54');
    // jsdom does not compute accessible names, so the name is pinned
    // at the mechanism level: no label override + content IS the
    // visible text. The computed name itself wants a live check
    // (Voice Control / screen reader on the demo).
    expect(btn.getAttribute('aria-describedby')).toBe('wd-progress-desc');
    const desc = description(el);
    expect(desc.classList.contains('wd-visually-hidden')).toBe(true);
    expect(desc.textContent).toBe('Step 1 of 54. Activate to jump to a screen.');
  });

  it('the description follows the step as the deck walks', () => {
    const el = createDeck(SAMPLE_DECK);
    key(el, 'ArrowRight');
    expect(progressText(el)).toBe('2 / 54');
    expect(description(el).textContent).toBe('Step 2 of 54. Activate to jump to a screen.');
    el.jumpTo(14);
    expect(progressText(el)).toBe('52 / 54');
    expect(description(el).textContent).toBe('Step 52 of 54. Activate to jump to a screen.');
  });

  it('an empty deck clears the count and the description', () => {
    const el = createDeck('');
    expect(progressText(el)).toBe('');
    expect(description(el).textContent).toBe('');
    expect(indicator(el).hasAttribute('aria-label')).toBe(false);
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
  // The reserve is 91.2px in jsdom (83.2px width-aware fallback
  // controls height + 8px half-space at 1440px), so the visible
  // window ends at scrollTop + 508.8.
  const PANEL_TOPS = [100, 320, 540, 760];

  it('scrolls just enough to bring a newly revealed panel below the fold into view', () => {
    const el = createDeck(LONG_DECK);
    const { scrollTo } = mockScrollingScreen(el, PANEL_TOPS);
    el.next(); // panel 1: bottom 520, 11.2px past the window — nudges just enough
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 11.2, behavior: 'smooth' });
    expect(screenEl(el).scrollTop).toBe(11.2);
    el.next(); // panel 2: bottom 740 — scrolls so its bottom clears the controls
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 231.2, behavior: 'smooth' });
    expect(screenEl(el).scrollTop).toBe(231.2);
    el.next(); // panel 3: bottom 960 — scrolls again, from the new position
    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 451.2, behavior: 'smooth' });
    expect(screenEl(el).scrollTop).toBe(451.2);
  });

  it('does not move the scroll when the newly revealed panel is already fully visible', () => {
    const el = createDeck(LONG_DECK);
    // Panel 1 sits higher in this variant (top 300, bottom 500),
    // so it is fully inside the 508.8px window — the standard
    // tops put its bottom 11.2px past the fold.
    const { scrollTo } = mockScrollingScreen(el, [100, 300, 540, 760]);
    el.next(); // panel 1: bottom 500 ≤ 508.8 — fully visible
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
    expect(scrollTo).toHaveBeenCalledWith({ top: 451.2, behavior: 'smooth' });
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
    expect(screenEl(el).scrollTop).toBe(231.2);
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
    // Panel 1 sits higher in this variant (top 300, bottom 500),
    // so it is fully inside the 508.8px window — the standard
    // tops put its bottom 11.2px past the fold.
    const { scrollTo } = mockScrollingScreen(el, [100, 300, 540, 760]);
    el.next(); // enters screen 2 at step 0 — first panel is at the top
    expect(el.state.screenIndex).toBe(1);
    expect(scrollTo).not.toHaveBeenCalled();
    el.next(); // panel 1: bottom 500 — fully visible
    expect(scrollTo).not.toHaveBeenCalled();
    el.next(); // panel 2: below the fold — scrolls
    expect(scrollTo).toHaveBeenCalledWith({ top: 231.2, behavior: 'smooth' });
  });
});

describe('bottom clearance is scrollable (issue #38)', () => {
  // Safari/WebKit does not count end padding toward a flex
  // container's scrollable overflow (WebKit bug 318111), so a
  // padding-based bottom clearance let the last panel scroll
  // only as far as the container's bottom edge — underneath
  // the overlaid controls, as Samir's screenshot showed
  // ("Lists inside panels", step 18/54). The clearance must
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

describe('Space activates the focused control (§6.1, issue #73)', () => {
  /** Dispatch a Space keydown on a shadow-DOM target, crossing the shadow boundary like a real keypress. */
  function spaceOn(target: Element): KeyboardEvent {
    const ev = new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, composed: true });
    target.dispatchEvent(ev);
    return ev;
  }
  function prevBtn(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-prev') as HTMLButtonElement;
  }
  function indicatorBtn(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-progress-text') as HTMLButtonElement;
  }
  function restartBtn(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-restart') as HTMLButtonElement;
  }
  function menuEl(el: WalkdownDeckElement): HTMLElement {
    return el.shadowRoot?.querySelector('.wd-nav-menu') as HTMLElement;
  }
  function menuItems(el: WalkdownDeckElement): HTMLButtonElement[] {
    return [...(el.shadowRoot?.querySelectorAll('.wd-nav-menu-item') as NodeListOf<HTMLButtonElement>)];
  }

  // jsdom does not implement native Space→click activation on buttons,
  // so each control case pins the two halves the handler owns: the
  // keydown is NOT prevented (which is what lets the browser activate
  // the control on keyup) and the deck does NOT navigate; a click on
  // the control then proves the activation path itself works.

  it('Space on Prev does not go Next; clicking Prev goes back', () => {
    const el = createDeck(SAMPLE_DECK);
    key(el, 'ArrowRight'); // screen 1, where Prev is enabled
    expect(el.state.screenIndex).toBe(1);
    const btn = prevBtn(el);
    btn.focus();
    const ev = spaceOn(btn);
    expect(ev.defaultPrevented).toBe(false);
    expect(el.state.screenIndex).toBe(1);
    btn.click();
    expect(el.state.screenIndex).toBe(0);
  });

  it('Space on the step-count button does not go Next; clicking it opens the menu', () => {
    const el = createDeck(SAMPLE_DECK);
    const btn = indicatorBtn(el);
    btn.focus();
    const ev = spaceOn(btn);
    expect(ev.defaultPrevented).toBe(false);
    expect(menuEl(el).hidden).toBe(true);
    expect(el.state.screenIndex).toBe(0);
    btn.click();
    expect(menuEl(el).hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('Space on Start over does not go Next; clicking it restarts', () => {
    const el = createDeck(SAMPLE_DECK);
    key(el, 'End');
    expect(el.state.screenIndex).toBe(14);
    const btn = restartBtn(el);
    btn.focus();
    const ev = spaceOn(btn);
    expect(ev.defaultPrevented).toBe(false);
    expect(el.state.screenIndex).toBe(14);
    btn.click();
    expect(el.state).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
  });

  it('Space on a menu item does not go Next or close the menu; clicking it navigates', () => {
    const el = createDeck(SAMPLE_DECK);
    indicatorBtn(el).click(); // open the menu
    const item = menuItems(el).find((b) => b.textContent === 'Walking');
    expect(item).toBeDefined();
    item!.focus();
    const ev = spaceOn(item!);
    expect(ev.defaultPrevented).toBe(false);
    expect(menuEl(el).hidden).toBe(false);
    expect(el.state.screenIndex).toBe(0);
    item!.click();
    expect(menuEl(el).hidden).toBe(true);
    expect(el.screens[el.state.screenIndex].title).toBe('Next and Previous');
  });

  it('Space on a panel link does not go Next', () => {
    const el = createDeck('# Links\n\n- [Walkdown](https://example.com)\n');
    const link = screenEl(el).querySelector('a');
    expect(link).not.toBeNull();
    link!.focus();
    const ev = spaceOn(link!);
    expect(ev.defaultPrevented).toBe(false);
    expect(el.state.screenIndex).toBe(0);
    expect(el.state.stepIndex).toBe(0);
  });

  it('Space on the screen region and on the host still goes Next', () => {
    const el = createDeck(SAMPLE_DECK);
    const screen = screenEl(el);
    screen.focus();
    const ev1 = spaceOn(screen);
    expect(ev1.defaultPrevented).toBe(true);
    expect(el.state.screenIndex).toBe(1);
    key(el, ' '); // host itself — screen 1 has 3 steps, so Next advances the step, not the screen
    expect(el.state.screenIndex).toBe(1);
    expect(el.state.stepIndex).toBe(1);
  });
});

describe('idle auto-hide (§6.5, issue #77)', () => {
  // jsdom has no layout and does not compute shadow-DOM
  // stylesheet rules, so the not-focusable half is pinned on the
  // shipped CSS text (styles.test.ts) and these tests pin the
  // class + timer behaviour the CSS keys off: the controls go
  // idle after 2.5s, and keyboard / focus / pointer activity
  // brings them back and re-arms the timer.
  afterEach(() => {
    vi.useRealTimers();
  });

  function idleDeck(): WalkdownDeckElement {
    vi.useFakeTimers();
    return createDeck(SAMPLE_DECK);
  }

  function prevBtn(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-prev') as HTMLButtonElement;
  }

  function isIdle(el: WalkdownDeckElement): boolean {
    return deckEl(el).classList.contains('wd-deck--idle');
  }

  it('controls hide after 2.5s idle', () => {
    const el = idleDeck();
    expect(isIdle(el)).toBe(false);
    vi.advanceTimersByTime(2499);
    expect(isIdle(el)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isIdle(el)).toBe(true);
  });

  it('Tab re-shows the controls and re-arms the timer', () => {
    const el = idleDeck();
    vi.advanceTimersByTime(2500);
    expect(isIdle(el)).toBe(true);
    key(el, 'Tab');
    expect(isIdle(el)).toBe(false);
    // The timer was re-armed, not just cleared: idle returns.
    vi.advanceTimersByTime(2500);
    expect(isIdle(el)).toBe(true);
  });

  it('an unhandled key re-arms the timer too', () => {
    // Tab is not the only key the old code dropped: _onKeyDown
    // returned early on the default branch before arming, so
    // any key the switch ignores also left an idle deck hidden.
    const el = idleDeck();
    vi.advanceTimersByTime(2500);
    expect(isIdle(el)).toBe(true);
    key(el, 'a');
    expect(isIdle(el)).toBe(false);
  });

  it('focus entering the deck re-arms the timer', () => {
    const el = idleDeck();
    vi.advanceTimersByTime(2500);
    expect(isIdle(el)).toBe(true);
    // jsdom's .focus() does not dispatch focusin, so dispatch
    // the event the browser delivers: focusin is composed, and
    // the F1 tests use the same composed: true pattern for
    // events crossing the shadow boundary.
    prevBtn(el).dispatchEvent(new window.FocusEvent('focusin', { bubbles: true, composed: true }));
    expect(isIdle(el)).toBe(false);
  });

  it('pointer move still re-arms the timer', () => {
    const el = idleDeck();
    vi.advanceTimersByTime(2500);
    expect(isIdle(el)).toBe(true);
    el.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true }));
    expect(isIdle(el)).toBe(false);
  });

  it('the bottom reserve is unchanged while idle', () => {
    // Hiding changes opacity and visibility, never height: the
    // reserve the fit guarantees (§7.2) must be identical
    // before and after the controls hide.
    const el = idleDeck();
    const before = varOf(el, '--wd-reserve-bottom');
    expect(before).not.toBe('');
    vi.advanceTimersByTime(2500);
    expect(isIdle(el)).toBe(true);
    expect(varOf(el, '--wd-reserve-bottom')).toBe(before);
  });
});

describe('panel re-render preserves focus (§5, issue #79)', () => {
  const LINKS_DECK = `<!-- reveal: step -->

# Links

- [First](https://example.com/a) and [second](https://example.com/b)

- [Third](https://example.com/c)
`;

  const TWO_SCREEN_DECK = `<!-- reveal: step -->

# One

- [Link](https://example.com)

---

# Two

- Plain panel
`;

  const STACK_LINKS_DECK = `<!-- reveal: step; effect: stack; direction: left -->

# Pile

- [One](https://example.com/1)
- [Two](https://example.com/2)
- [Three](https://example.com/3)
`;

  /** What the shadow tree thinks is focused (jsdom tracks this on .focus()). */
  function shadowActive(el: WalkdownDeckElement): Element | null {
    return el.shadowRoot?.activeElement ?? null;
  }
  /** A link inside a panel, by panel index and link position within it. */
  function panelLink(el: WalkdownDeckElement, panelIndex: number, linkIndex: number): HTMLElement {
    const panel = panels(el)[panelIndex] as HTMLElement;
    return panel.querySelectorAll('a')[linkIndex] as HTMLElement;
  }
  function nextButton(el: WalkdownDeckElement): HTMLButtonElement {
    return el.shadowRoot?.querySelector('.wd-next') as HTMLButtonElement;
  }

  it('focus on a panel link survives advancing a step, restored to the same link', () => {
    const el = createDeck(LINKS_DECK);
    expect(panelVisible(el, 0)).toBe(true);
    // Focus the SECOND link: the restore matches by position
    // within the panel, not just "the panel's first focusable".
    const second = panelLink(el, 0, 1);
    second.focus();
    expect(shadowActive(el)).toBe(second);
    el.next();
    // The rebuild destroyed the old node; focus is on the new
    // node for the same link (same href, same position).
    const restored = panelLink(el, 0, 1);
    expect((restored as HTMLAnchorElement).getAttribute('href')).toBe('https://example.com/b');
    expect(shadowActive(el)).toBe(restored);
  });

  it('focus on a link in the panel hidden by Previous falls back to the screen region', () => {
    const el = createDeck(LINKS_DECK);
    el.next();
    expect(panelVisible(el, 1)).toBe(true);
    panelLink(el, 1, 0).focus();
    el.prev();
    expect(panelVisible(el, 1)).toBe(false);
    expect(shadowActive(el)).toBe(screenEl(el));
  });

  it('focus on a link survives a screen change by falling back to the screen region', () => {
    const el = createDeck(TWO_SCREEN_DECK);
    panelLink(el, 0, 0).focus();
    el.next();
    expect(el.state.screenIndex).toBe(1);
    expect(shadowActive(el)).toBe(screenEl(el));
  });

  it('focus on a control outside the panels is left alone by a step change', () => {
    const el = createDeck(LINKS_DECK);
    const next = nextButton(el);
    next.focus();
    expect(shadowActive(el)).toBe(next);
    el.next();
    expect(shadowActive(el)).toBe(next);
  });

  it('stack: focus on a behind-card link survives the step, restored to the promoted card', () => {
    const el = createDeck(STACK_LINKS_DECK);
    // Panel 1 is behind the front card but visible (peeking), so
    // its link is focusable; the step promotes it to the front.
    const behind = panelLink(el, 1, 0);
    behind.focus();
    el.next();
    const promoted = panelLink(el, 1, 0);
    expect((promoted as HTMLAnchorElement).getAttribute('href')).toBe('https://example.com/2');
    expect(shadowActive(el)).toBe(promoted);
  });

  it('stack: focus on the front-card link falls back to the screen region when the card is dismissed', () => {
    const el = createDeck(STACK_LINKS_DECK);
    // No WAAPI in jsdom, so the step renders synchronously: the
    // front card is dismissed in the same render.
    panelLink(el, 0, 0).focus();
    el.next();
    const dismissed = panels(el)[0] as HTMLElement;
    expect(dismissed.getAttribute('aria-hidden')).toBe('true');
    expect(shadowActive(el)).toBe(screenEl(el));
  });

  it('stack: the same fallback holds through the WAAPI choreography (stubbed)', async () => {
    Object.defineProperty(window.Element.prototype, 'animate', {
      value: vi.fn(function (this: HTMLElement) {
        return { finished: Promise.resolve(), cancel: vi.fn() };
      }),
      configurable: true,
      writable: true,
    });
    try {
      const el = createDeck(STACK_LINKS_DECK);
      panelLink(el, 0, 0).focus();
      el.next();
      // The swap is deferred until the choreography finishes:
      // focus is still on the (animated) front card's link.
      expect(shadowActive(el)).toBe(panelLink(el, 0, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(panels(el)[0]?.getAttribute('aria-hidden')).toBe('true');
      expect(shadowActive(el)).toBe(screenEl(el));
    } finally {
      delete (window.Element.prototype as unknown as Record<string, unknown>).animate;
    }
  });
});

describe('host focus delegates to the screen region (§6.1, issue #81)', () => {
  /** Dispatch a keydown on a shadow-DOM target, crossing the shadow boundary like a real keypress. */
  function keyOn(target: Element, keyName: string): void {
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyName, bubbles: true, composed: true, cancelable: true }));
  }
  /** The first focusable element inside the shadow tree, in DOM order, skipping hidden subtrees. */
  function firstFocusable(el: WalkdownDeckElement): Element | null {
    const all = [...(el.shadowRoot?.querySelectorAll('button, [tabindex]') ?? [])] as HTMLElement[];
    return (
      all.find((n) => {
        if (n.closest('[hidden]')) return false;
        if ((n as HTMLButtonElement).disabled) return false;
        return true;
      }) ?? null
    );
  }

  // jsdom 26 does not implement delegatesFocus delegation (probed:
  // host.focus() leaves shadowRoot.activeElement null even with
  // delegatesFocus: true, and shadowRoot.delegatesFocus is
  // undefined), so the delegation itself is pinned by the
  // attachShadow call below, and the "lands on the screen region"
  // half by the first-focusable test — in a real browser
  // delegatesFocus forwards host focus to the first focusable
  // child, and this proves that child is the screen region. The
  // rendered behaviour wants a live-demo check: Tab through the
  // deck and confirm Tab lands on the screen region, never on a
  // bare host stop.

  it('attaches the shadow root with delegatesFocus: true', () => {
    const spy = vi.spyOn(Element.prototype, 'attachShadow');
    const el = createDeck(SAMPLE_DECK);
    expect(el.shadowRoot).not.toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ mode: 'open', delegatesFocus: true }));
  });

  it('the host stays a tab stop — the delegating one, not a bare one', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(el.tabIndex).toBe(0);
  });

  it('the first focusable inside is the screen region, labelled Screen N of M', () => {
    const el = createDeck(SAMPLE_DECK);
    const screen = screenEl(el);
    expect(firstFocusable(el)).toBe(screen);
    expect(screen.tabIndex).toBe(0);
    expect(screen.getAttribute('role')).toBe('region');
    expect(screen.getAttribute('aria-label')?.startsWith('Screen 1 of 15')).toBe(true);
  });

  it('keyboard navigation still works from focus inside the shadow tree', () => {
    const el = createDeck(SAMPLE_DECK);
    // What delegation does in a real browser: focus lands on the
    // screen region. ArrowRight from there advances a screen.
    screenEl(el).focus();
    keyOn(screenEl(el), 'ArrowRight');
    expect(el.state.screenIndex).toBe(1);
    // Space on the screen region advances a step (screen 2 has 3 steps).
    keyOn(screenEl(el), ' ');
    expect(el.state).toEqual({ screenIndex: 1, stepIndex: 1, zoom: 0 });
    // A keydown on a panel link also reaches the host listener
    // (ArrowRight is unconditional — only Space is target-sensitive,
    // §6.1, issue #73).
    const links = createDeck('<!-- reveal: step -->\n\n# Links\n\n- [Walkdown](https://example.com)\n- Plain\n');
    const link = screenEl(links).querySelector('a');
    expect(link).not.toBeNull();
    link!.focus();
    keyOn(link!, 'ArrowRight');
    expect(links.state).toEqual({ screenIndex: 0, stepIndex: 1, zoom: 0 });
  });
});

describe('document title follows the screen (§6.2, issue #86)', () => {
  let savedTitle: string;

  beforeEach(() => {
    savedTitle = document.title;
  });

  afterEach(() => {
    document.title = savedTitle;
  });

  function createDeckWithTitle(markdown: string): WalkdownDeckElement {
    const el = document.createElement('walkdown-deck') as WalkdownDeckElement;
    el.setAttribute('document-title', '');
    el.setContainerSize(1440, 900);
    el.markdown = markdown;
    document.body.appendChild(el);
    stubScreenRect(el);
    return el;
  }

  it('sets "Screen — Deck" on load and follows the screen, not the step', () => {
    const el = createDeckWithTitle(SAMPLE_DECK);
    expect(document.title).toBe('Walkdown — Walkdown');
    el.next();
    expect(document.title).toBe('What it is — Walkdown');
    // A step change within screen 2 does not change the title:
    // it is per screen.
    el.next();
    expect(el.state).toEqual({ screenIndex: 1, stepIndex: 1, zoom: 0 });
    expect(document.title).toBe('What it is — Walkdown');
    el.jumpTo(4);
    expect(document.title).toBe('The punchline first — Walkdown');
  });

  it('leaves the title alone without the attribute', () => {
    document.title = 'Host page';
    const el = createDeck(SAMPLE_DECK);
    el.next();
    el.jumpTo(4);
    expect(document.title).toBe('Host page');
  });

  it('leaves the title alone on a screen with no title', () => {
    const el = createDeckWithTitle(
      '---\ntitle: Test Deck\n---\n\n# First\n\n- a\n\n---\n\n- no heading here\n\n---\n\n# Third\n\n- c\n',
    );
    expect(document.title).toBe('First — Test Deck');
    el.next();
    expect(el.state.screenIndex).toBe(1);
    expect(document.title).toBe('First — Test Deck');
    el.next();
    expect(document.title).toBe('Third — Test Deck');
  });

  it('uses the screen title alone when the deck has no title', () => {
    // No frontmatter title and no `#` heading anywhere, so the
    // parser has no deck title to fall back to (it falls back to
    // the first `#` heading, §2.1) — but the `##` heading still
    // titles the screen.
    createDeckWithTitle('## Only\n\n- a\n');
    expect(document.title).toBe('Only');
  });

  it('does nothing for an empty deck', () => {
    document.title = 'Host page';
    createDeckWithTitle('');
    expect(document.title).toBe('Host page');
  });

  it('applies the title at once when the attribute is added after load, and stops when removed', () => {
    document.title = 'Host page';
    const el = createDeck(SAMPLE_DECK);
    expect(document.title).toBe('Host page');
    el.setAttribute('document-title', '');
    expect(document.title).toBe('Walkdown — Walkdown');
    el.removeAttribute('document-title');
    el.next();
    expect(document.title).toBe('Walkdown — Walkdown');
  });

  it('exposes the opt-in as a documentTitle property', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(el.documentTitle).toBe(false);
    el.documentTitle = true;
    expect(el.hasAttribute('document-title')).toBe(true);
    expect(document.title).toBe('Walkdown — Walkdown');
    el.documentTitle = false;
    expect(el.hasAttribute('document-title')).toBe(false);
  });

  it('navigation still works when the title cannot be written', () => {
    // jsdom lets the test shadow document.title with a throwing
    // setter; the guard in _applyDocumentTitle must swallow it.
    const descriptor = Object.getOwnPropertyDescriptor(document, 'title');
    Object.defineProperty(document, 'title', {
      configurable: true,
      get: () => 'Host page',
      set: () => {
        throw new Error('title is read-only here');
      },
    });
    try {
      const el = createDeckWithTitle(SAMPLE_DECK);
      expect(() => el.next()).not.toThrow();
      expect(el.state.screenIndex).toBe(1);
      expect(document.title).toBe('Host page');
    } finally {
      if (descriptor === undefined) delete (document as unknown as Record<string, unknown>).title;
      else Object.defineProperty(document, 'title', descriptor);
    }
  });
});
