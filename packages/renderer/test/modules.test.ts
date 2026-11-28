/**
 * Module-boundary tests for the element.ts split (issue #59).
 *
 * These pin what each extracted module does, so the split itself
 * is covered — not just the element's behaviour through them.
 * The element's own suite (element.test.ts) still covers the
 * observable behaviour end to end.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDeck } from '@walkdown/core';
import type { Panel } from '@walkdown/core';
import '../src/index.js';
import { animatePanelIn } from '../src/effects.js';
import { DeckFacts } from '../src/facts.js';
import { PointerTracker, swipeThreshold } from '../src/gestures.js';
import { navMenuTargets } from '../src/nav-menu.js';
import { panelsHtml } from '../src/render.js';
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

function screenEl(el: WalkdownDeckElement): HTMLElement {
  return el.shadowRoot?.querySelector('.wd-screen') as HTMLElement;
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('not found', { status: 404 })),
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  vi.unstubAllGlobals();
});

describe('swipe threshold (§6.4, provisional) — moved from core', () => {
  it('is ~48 CSS px or 1/8 of the screen width, whichever is smaller', () => {
    expect(swipeThreshold(1440)).toBe(48);
    expect(swipeThreshold(360)).toBe(45);
    expect(swipeThreshold(200)).toBe(25);
  });
});

describe('DeckFacts (facts.ts)', () => {
  const deck = parseDeck(SAMPLE_DECK);
  const facts = new DeckFacts(deck);

  it('derives the flat screens and the total step count once', () => {
    expect(facts.screens).toHaveLength(15);
    expect(facts.totalSteps).toBe(54);
  });

  it('counts the steps before each screen', () => {
    expect(facts.stepsBefore(0)).toBe(0);
    expect(facts.stepsBefore(1)).toBe(1);
    expect(facts.stepsBefore(3)).toBe(7);
    expect(facts.stepsBefore(13)).toBe(48);
  });

  it('reports progress in steps', () => {
    expect(facts.progress({ screenIndex: 0, stepIndex: 0, zoom: 0 })).toEqual({ current: 1, total: 54 });
    expect(facts.progress({ screenIndex: 14, stepIndex: 2, zoom: 0 })).toEqual({ current: 54, total: 54 });
  });

  it('knows the first and last steps', () => {
    expect(facts.isAtStart({ screenIndex: 0, stepIndex: 0, zoom: 0 })).toBe(true);
    expect(facts.isAtStart({ screenIndex: 0, stepIndex: 1, zoom: 0 })).toBe(false);
    expect(facts.isAtEnd({ screenIndex: 14, stepIndex: 2, zoom: 0 })).toBe(true);
    expect(facts.isAtEnd({ screenIndex: 14, stepIndex: 1, zoom: 0 })).toBe(false);
  });

  it('maps each screen to its Section', () => {
    expect(facts.sectionIndexOfScreen(0)).toBe(0);
    expect(facts.sectionIndexOfScreen(3)).toBe(1);
    expect(facts.sectionIndexOfScreen(7)).toBe(2);
    expect(facts.sectionIndexOfScreen(9)).toBe(3);
    expect(facts.sectionOfScreen(3)?.title).toBe('How it works');
    expect(facts.sectionOfScreen(13)?.title).toBe('Customize');
  });
});

describe('navMenuTargets (nav-menu.ts)', () => {
  it('lists First, every Section by name, Last — in deck order', () => {
    const deck = parseDeck(SAMPLE_DECK);
    const facts = new DeckFacts(deck);
    expect(navMenuTargets(deck, facts)).toEqual([
      { label: 'First screen', kind: 'first', screenIndex: 0 },
      { label: 'Intro', kind: 'section', screenIndex: 0, sectionIndex: 0 },
      { label: 'How it works', kind: 'section', screenIndex: 3, sectionIndex: 1 },
      { label: 'Walking', kind: 'section', screenIndex: 7, sectionIndex: 2 },
      { label: 'Customize', kind: 'section', screenIndex: 9, sectionIndex: 3 },
      { label: 'Last screen', kind: 'last', screenIndex: 14 },
    ]);
  });

  it('labels a Section with no title `Section N`', () => {
    const deck = parseDeck('# A\n\n- One\n\n---\n\n# B\n\n- Two\n');
    const facts = new DeckFacts(deck);
    expect(navMenuTargets(deck, facts).map((t) => t.label)).toEqual([
      'First screen',
      'Section 1',
      'Last screen',
    ]);
  });
});

describe('PointerTracker (gestures.ts)', () => {
  it('resolves a left swipe past the threshold to next, a right swipe to prev', () => {
    const tracker = new PointerTracker();
    const target = document.createElement('div');
    tracker.down(400, 300, target);
    expect(tracker.move(300, 300, 1440)).toBe('next');
    // Resolved once: further movement reports nothing.
    expect(tracker.move(200, 300, 1440)).toBe(null);
    expect(tracker.up(200, 300)).toEqual({ hadStart: true, tapX: null });

    tracker.down(300, 300, target);
    expect(tracker.move(400, 300, 1440)).toBe('prev');
  });

  it('does not resolve a swipe below the threshold, and the threshold scales with width', () => {
    const tracker = new PointerTracker();
    const target = document.createElement('div');
    tracker.down(400, 300, target);
    expect(tracker.move(370, 300, 1440)).toBe(null); // 30px < 48px
    tracker.down(400, 300, target);
    expect(tracker.move(370, 300, 200)).toBe('next'); // 30px >= 25px at 200px wide
  });

  it('treats a predominantly vertical movement as a scroll, not a swipe or a tap', () => {
    const tracker = new PointerTracker();
    tracker.down(400, 300, document.createElement('div'));
    expect(tracker.move(410, 360, 1440)).toBe(null);
    expect(tracker.up(410, 360)).toEqual({ hadStart: true, tapX: null });
  });

  it('resolves a small movement on a plain target to a tap at its x', () => {
    const tracker = new PointerTracker();
    tracker.down(700, 300, document.createElement('div'));
    expect(tracker.up(702, 301)).toEqual({ hadStart: true, tapX: 702 });
  });

  it('a drag past 8px is not a tap, and a tap starting on a link is not a tap', () => {
    const tracker = new PointerTracker();
    tracker.down(400, 300, document.createElement('div'));
    expect(tracker.up(450, 300)).toEqual({ hadStart: true, tapX: null });

    tracker.down(700, 300, document.createElement('a'));
    expect(tracker.up(700, 300)).toEqual({ hadStart: true, tapX: null });
  });

  it('a pointerup with no pointerdown reports no start', () => {
    const tracker = new PointerTracker();
    expect(tracker.up(100, 100)).toEqual({ hadStart: false, tapX: null });
  });
});

describe('panelsHtml (render.ts)', () => {
  it('renders one .wd-panel per panel, hidden ones inert', () => {
    const deck = parseDeck('<!-- reveal: step -->\n\n# T\n\n- One\n- Two\n');
    const facts = new DeckFacts(deck);
    const screen = facts.screen(0);
    expect(screen).toBeDefined();
    if (screen === undefined) return;
    const html = panelsHtml(screen.panels, new Set([0]));
    expect(html).toContain('data-panel="0"');
    expect(html).toContain('data-panel="1"');
    expect(html).toContain('One');
    expect(html).not.toMatch(/data-panel="0"[^>]*hidden/);
    expect(html).toMatch(/data-panel="1"[^>]*hidden aria-hidden="true"/);
  });
});

describe('animatePanelIn (effects.ts)', () => {
  function firstScreen(markdown: string) {
    const deck = parseDeck(markdown);
    const screen = new DeckFacts(deck).screen(0);
    if (screen === undefined) throw new Error('no screen');
    return screen;
  }

  it('plays the screen effect with the screen duration', () => {
    const screen = firstScreen('<!-- reveal: step; effect: slide-in; duration: 2s -->\n\n# T\n\n- One\n');
    const el = document.createElement('div');
    animatePanelIn(el, screen.panels[0] as Panel, screen, true);
    expect(el.classList.contains('wd-enter--slide-in-forward')).toBe(true);
    expect(el.style.getPropertyValue('--wd-anim-duration')).toBe('2000ms');
  });

  it('plays the backward slide when stepping back, and a panel marker wins over the screen', () => {
    const screen = firstScreen('<!-- reveal: step; effect: slide-in -->\n\n# T\n\n- One\n');
    const back = document.createElement('div');
    animatePanelIn(back, screen.panels[0] as Panel, screen, false);
    expect(back.classList.contains('wd-enter--slide-in-backward')).toBe(true);

    const twoPanel = firstScreen(
      '<!-- reveal: step -->\n\n# T\n\n- One\n\n<!-- reveal: effect: zoom-in; duration: 1s -->\n\n- Two\n',
    );
    const zoom = document.createElement('div');
    animatePanelIn(zoom, twoPanel.panels[1] as Panel, twoPanel, true);
    expect(zoom.classList.contains('wd-enter--zoom-in')).toBe(true);
    expect(zoom.style.getPropertyValue('--wd-anim-duration')).toBe('1000ms');
    // The first panel still inherits the screen effect (fade-in by default).
    const first = document.createElement('div');
    animatePanelIn(first, twoPanel.panels[0] as Panel, twoPanel, true);
    expect(first.classList.contains('wd-enter--fade-in')).toBe(true);
  });

  it('plays nothing for effect none', () => {
    const screen = firstScreen('<!-- reveal: step; effect: none -->\n\n# T\n\n- One\n');
    const el = document.createElement('div');
    animatePanelIn(el, screen.panels[0] as Panel, screen, true);
    expect(el.className).toBe('');
  });

  it('adds no enter class under prefers-reduced-motion, for any effect', () => {
    vi.stubGlobal(
      'matchMedia',
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
    // Default effect (fade-in).
    const screen = firstScreen('<!-- reveal: step -->\n\n# T\n\n- One\n');
    const el = document.createElement('div');
    animatePanelIn(el, screen.panels[0] as Panel, screen, true);
    expect(el.className).toBe('');
    expect(el.style.getPropertyValue('--wd-anim-duration')).toBe('');
    // Slide-in, forward: the early return happens before the class is picked.
    const slide = firstScreen('<!-- reveal: step; effect: slide-in; duration: 2s -->\n\n# T\n\n- One\n');
    const sliding = document.createElement('div');
    animatePanelIn(sliding, slide.panels[0] as Panel, slide, true);
    expect(sliding.className).toBe('');
    expect(sliding.style.getPropertyValue('--wd-anim-duration')).toBe('');
  });

  it('toggling reduced motion off mid-session replays nothing on an already-visible panel', () => {
    let reduced = true;
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: reduced && query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    const screen = firstScreen('<!-- reveal: step -->\n\n# T\n\n- One\n');
    const el = document.createElement('div');
    animatePanelIn(el, screen.panels[0] as Panel, screen, true);
    expect(el.className).toBe('');
    // The preference flips mid-session. No stale class exists on the
    // already-visible panel, so nothing replays — the flip alone adds nothing.
    reduced = false;
    expect(el.className).toBe('');
    // And a panel revealed after the flip animates normally: the early
    // return is preference-driven, not a permanent disable.
    const fresh = document.createElement('div');
    animatePanelIn(fresh, screen.panels[0] as Panel, screen, true);
    expect(fresh.classList.contains('wd-enter--fade-in')).toBe(true);
  });
});

describe('end-to-end walk-through through the split modules', () => {
  it('walks all 54 steps, zooms, jumps from the menu, and restores a deep link', () => {
    const el = createDeck(SAMPLE_DECK);
    expect(el.screens).toHaveLength(15);
    expect(el.stepsTotal).toBe(54);
    expect(progressText(el)).toBe('1 / 54');

    // Walk the whole deck via Next; every step lands on the next count.
    for (let step = 2; step <= 54; step++) {
      el.next();
      expect(progressText(el)).toBe(`${step} / 54`);
    }
    expect(el.state.screenIndex).toBe(14);
    expect(el.state.stepIndex).toBe(2);
    // At the end the Start over button shows; Next is a no-op.
    const endNote = el.shadowRoot?.querySelector('.wd-end-note') as HTMLElement;
    expect(endNote.hidden).toBe(false);
    el.next();
    expect(progressText(el)).toBe('54 / 54');

    // Zoom in and out; the state survives, the step does not move.
    el.zoomInStep();
    expect(el.state.zoom).toBe(1);
    el.zoomOutStep();
    expect(el.state.zoom).toBe(0);
    expect(progressText(el)).toBe('54 / 54');

    // The menu jumps to a Section's first screen.
    const indicator = el.shadowRoot?.querySelector('.wd-progress-text') as HTMLButtonElement;
    indicator.click();
    const menu = el.shadowRoot?.querySelector('.wd-nav-menu') as HTMLElement;
    expect(menu.hidden).toBe(false);
    const walking = [...menu.querySelectorAll('.wd-nav-menu-item')].find(
      (b) => b.textContent === 'Walking',
    ) as HTMLButtonElement;
    walking.click();
    expect(el.state.screenIndex).toBe(7);
    expect(el.state.stepIndex).toBe(0);
    expect(menu.hidden).toBe(true);

    // Tap halves and swipes still navigate (gestures.ts via the element).
    // Screen 7 ("Next and Previous") has 3 steps; a tap advances one step.
    pointer(el, 'pointerdown', 700);
    pointer(el, 'pointerup', 700);
    expect(el.state).toMatchObject({ screenIndex: 7, stepIndex: 1 });
    pointer(el, 'pointerdown', 400);
    pointer(el, 'pointermove', 300);
    pointer(el, 'pointerup', 300);
    expect(el.state).toMatchObject({ screenIndex: 7, stepIndex: 2 });
    // One more swipe crosses into screen 8.
    pointer(el, 'pointerdown', 400);
    pointer(el, 'pointermove', 300);
    pointer(el, 'pointerup', 300);
    expect(el.state).toMatchObject({ screenIndex: 8, stepIndex: 0 });

    // Start over returns to the hero.
    el.goToStart();
    expect(progressText(el)).toBe('1 / 54');

    // A deep link restores on load.
    window.location.hash = '#/3/2';
    const el2 = createDeck(SAMPLE_DECK);
    expect(el2.state.screenIndex).toBe(2);
    expect(el2.state.stepIndex).toBe(1);
    expect(progressText(el2)).toBe('6 / 54');
  });
});
