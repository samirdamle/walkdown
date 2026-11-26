/**
 * The `stack` reveal effect (issue #71, spec §4.2): a screen's
 * panels form a pile — a card deck — instead of a grid.
 *
 * Unit tests pin the pile geometry (stack.ts); element tests pin
 * the pile through the real element, including the WAAPI
 * choreography (stubbed — jsdom has no Web Animations API) and
 * the pure-function-of-state rule: a jump or deep link renders
 * the pile at the step with no animation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDeck } from '@walkdown/core';
import type { Screen } from '@walkdown/core';
import '../src/index.js';
import { DEFAULT_CSS } from '../src/styles.js';
import type { WalkdownDeckElement } from '../src/element.js';
import {
  animateStackStep,
  isStackScreen,
  stackDismissTransform,
  stackLevelBrightness,
  stackLevelFor,
  stackLevelTransform,
  stackPanelsHtml,
} from '../src/stack.js';

/** Read a repo fixture. Under the jsdom environment import.meta.url is not a file: URL, so fall back to cwd. */
function fixture(name: string): string {
  try {
    return readFileSync(fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url)), 'utf8');
  } catch {
    return readFileSync(resolve(process.cwd(), '../../examples', name), 'utf8');
  }
}

const SAMPLE_DECK = fixture('walkdown-itself.md');

const STACK_DECK = `<!-- reveal: step; effect: stack; direction: left -->

# Pile

- One
- Two
- Three
`;

function stackScreen(markdown: string): Screen {
  return parseDeck(markdown).sections[0]!.screens[0]!;
}

function panelsContainer(el: WalkdownDeckElement): HTMLElement {
  return el.shadowRoot?.querySelector('.wd-panels') as HTMLElement;
}

function pile(el: WalkdownDeckElement): HTMLElement[] {
  return [...(el.shadowRoot?.querySelectorAll('.wd-panel') as NodeListOf<HTMLElement>)];
}

/** The pile levels in DOM order, from each panel's data-stack-level. */
function levels(el: WalkdownDeckElement): number[] {
  return pile(el).map((p) => Number(p.dataset.stackLevel));
}

function progressText(el: WalkdownDeckElement): string {
  return (el.shadowRoot?.querySelector('.wd-progress-text') as HTMLElement).textContent ?? '';
}

function createDeck(markdown: string): WalkdownDeckElement {
  const el = document.createElement('walkdown-deck') as WalkdownDeckElement;
  el.setContainerSize(1440, 900);
  el.markdown = markdown;
  document.body.appendChild(el);
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
  vi.restoreAllMocks();
  // The WAAPI stub below defines Element.prototype.animate; jsdom
  // has none of its own, so remove it after each test.
  delete (window.Element.prototype as unknown as Record<string, unknown>).animate;
});

describe('stackLevelFor (stack.ts)', () => {
  it('levels count up from the front card at a step', () => {
    const screen = stackScreen(STACK_DECK);
    expect([0, 1, 2].map((i) => stackLevelFor(screen, 0, i))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((i) => stackLevelFor(screen, 1, i))).toEqual([-1, 0, 1]);
    expect([0, 1, 2].map((i) => stackLevelFor(screen, 2, i))).toEqual([-1, -1, 0]);
  });

  it('caps the visible peek at the front card + 2 behind', () => {
    const screen = stackScreen(`<!-- reveal: step; effect: stack -->

# Long pile

- One
- Two
- Three
- Four
- Five
- Six
- Seven
- Eight
`);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => stackLevelFor(screen, 0, i))).toEqual([0, 1, 2, 2, 2, 2, 2, 2]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => stackLevelFor(screen, 3, i))).toEqual([-1, -1, -1, 0, 1, 2, 2, 2]);
  });

  it('follows the reveal order, not document order', () => {
    const screen = stackScreen(`<!-- reveal: step; sequence: 3, 1, 2; effect: stack -->

# Ordered pile

- One
- Two
- Three
`);
    // Sequence order is panel 3, then 1, then 2: panel 3 (index 2)
    // is on top at step 0, panel 1 (index 0) behind it.
    expect([0, 1, 2].map((i) => stackLevelFor(screen, 0, i))).toEqual([1, 2, 0]);
    expect([0, 1, 2].map((i) => stackLevelFor(screen, 1, i))).toEqual([0, 1, -1]);
  });
});

describe('stack pile geometry (stack.ts)', () => {
  it('isStackScreen is true only for the stack effect', () => {
    expect(isStackScreen(stackScreen(STACK_DECK))).toBe(true);
    expect(isStackScreen(stackScreen(`<!-- reveal: step; effect: fade-in -->\n\n# Plain\n\n- One\n`))).toBe(false);
  });

  it('a level is lifted by the peek offset and scaled down', () => {
    expect(stackLevelTransform(0)).toBe('translateY(0px) scale(1)');
    expect(stackLevelTransform(1)).toBe('translateY(-10px) scale(0.97)');
    expect(stackLevelTransform(2)).toBe('translateY(-20px) scale(0.94)');
  });

  it('a level is shaded darker the further back it sits', () => {
    expect(stackLevelBrightness(0)).toBe(1);
    expect(stackLevelBrightness(1)).toBe(0.93);
    expect(stackLevelBrightness(2)).toBe(0.86);
  });

  it('a dismissed card flies 130% in its direction with a slight rotate', () => {
    expect(stackDismissTransform('left')).toBe('translateX(-130%) rotate(-6deg)');
    expect(stackDismissTransform('right')).toBe('translateX(130%) rotate(6deg)');
    expect(stackDismissTransform('up')).toBe('translateY(-130%) rotate(-6deg)');
    expect(stackDismissTransform('down')).toBe('translateY(130%) rotate(6deg)');
  });

  it('stackPanelsHtml renders the whole pile with levels and z-index', () => {
    const screen = stackScreen(STACK_DECK);
    const html = stackPanelsHtml(screen, 1);
    // Panel 0 dismissed: hidden + aria-hidden, never the hidden
    // attribute (it must be able to fly back in).
    expect(html).toContain('data-stack-level="-1"');
    expect(html).toContain('wd-panel--stack-dismissed');
    expect(html).toContain('visibility: hidden; z-index: 0;');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain(' hidden ');
    // Panel 1 front (z-index 3), panel 2 behind (z-index 2).
    expect(html).toContain('data-stack-level="0" style="--wd-stack-level: 0; z-index: 3;"');
    expect(html).toContain('data-stack-level="1" style="--wd-stack-level: 1; z-index: 2;"');
  });

  it('animateStackStep returns null without WAAPI', () => {
    const screen = stackScreen(STACK_DECK);
    const host = document.createElement('div');
    host.innerHTML = stackPanelsHtml(screen, 0);
    // jsdom has no Element.animate: nothing to animate with.
    expect(animateStackStep(host, screen, 0, 1, true)).toBeNull();
  });
});

describe('stack pile through the element', () => {
  it('renders a stack screen as a pile, all panels in the DOM', () => {
    const el = createDeck(STACK_DECK);
    const container = panelsContainer(el);
    expect(container.classList.contains('wd-panels--stack')).toBe(true);
    expect(container.dataset.stackDirection).toBe('left');
    expect(pile(el)).toHaveLength(3);
    expect(levels(el)).toEqual([0, 1, 2]);
    expect(progressText(el)).toBe('1 / 3');
  });

  it('steps forward dismiss the front card, synchronously without WAAPI', () => {
    const el = createDeck(STACK_DECK);
    el.next();
    expect(levels(el)).toEqual([-1, 0, 1]);
    const dismissed = pile(el)[0] as HTMLElement;
    expect(dismissed.classList.contains('wd-panel--stack-dismissed')).toBe(true);
    expect(dismissed.style.visibility).toBe('hidden');
    expect(dismissed.getAttribute('aria-hidden')).toBe('true');
    expect(progressText(el)).toBe('2 / 3');
    el.next();
    expect(levels(el)).toEqual([-1, -1, 0]);
    expect(progressText(el)).toBe('3 / 3');
  });

  it('steps back re-deal the dismissed card', () => {
    const el = createDeck(STACK_DECK);
    el.next();
    el.next();
    el.prev();
    expect(levels(el)).toEqual([-1, 0, 1]);
    el.prev();
    expect(levels(el)).toEqual([0, 1, 2]);
    expect(progressText(el)).toBe('1 / 3');
  });

  it('a jump renders the pile at the step with no animation', () => {
    const el = createDeck(STACK_DECK);
    // A jump to the last step of the screen: no reveal animation,
    // the pile simply is at step 2.
    el.goToEnd();
    expect(el.state.stepIndex).toBe(2);
    expect(levels(el)).toEqual([-1, -1, 0]);
  });

  it('a deep link renders the pile at the step with no animation', () => {
    window.location.hash = '#/1/3';
    const el = createDeck(STACK_DECK);
    expect(el.state.screenIndex).toBe(0);
    expect(el.state.stepIndex).toBe(2);
    expect(levels(el)).toEqual([-1, -1, 0]);
    expect(panelsContainer(el).classList.contains('wd-panels--stack')).toBe(true);
  });

  it('each direction variant lands on the container', () => {
    for (const direction of ['right', 'up', 'down'] as const) {
      document.body.innerHTML = '';
      const el = createDeck(`<!-- reveal: step; effect: stack; direction: ${direction} -->\n\n# Pile\n\n- One\n- Two\n`);
      expect(panelsContainer(el).dataset.stackDirection).toBe(direction);
    }
  });

  it('a non-stack screen has no pile class or direction', () => {
    const el = createDeck(`<!-- reveal: step; effect: fade-in -->\n\n# Plain\n\n- One\n- Two\n`);
    expect(panelsContainer(el).classList.contains('wd-panels--stack')).toBe(false);
    expect(panelsContainer(el).dataset.stackDirection).toBeUndefined();
  });

  it('renders no animation under prefers-reduced-motion, even with WAAPI', () => {
    const calls: unknown[] = [];
    Object.defineProperty(window.Element.prototype, 'animate', {
      value: vi.fn(function (this: HTMLElement) {
        calls.push(this);
        return { finished: Promise.resolve(), cancel: vi.fn() };
      }),
      configurable: true,
      writable: true,
    });
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
    const el = createDeck(STACK_DECK);
    el.next();
    // No choreography started; the pile jumped to the new state.
    expect(calls).toHaveLength(0);
    expect(levels(el)).toEqual([-1, 0, 1]);
  });

  it('the demo screen is the stack pile, dismissing left', () => {
    const el = createDeck(SAMPLE_DECK);
    el.jumpTo(2);
    expect(el.state.screenIndex).toBe(2);
    expect(panelsContainer(el).classList.contains('wd-panels--stack')).toBe(true);
    expect(panelsContainer(el).dataset.stackDirection).toBe('left');
    expect(pile(el)).toHaveLength(3);
    expect(progressText(el)).toBe('5 / 54');
    el.next();
    expect(levels(el)).toEqual([-1, 0, 1]);
    expect(progressText(el)).toBe('6 / 54');
  });
});

describe('stack WAAPI choreography (stubbed)', () => {
  interface Call {
    el: HTMLElement;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
  }

  function stubWaapi(): Call[] {
    const calls: Call[] = [];
    Object.defineProperty(window.Element.prototype, 'animate', {
      value: vi.fn(function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        calls.push({ el: this, keyframes, options });
        return { finished: Promise.resolve(), cancel: vi.fn() };
      }),
      configurable: true,
      writable: true,
    });
    return calls;
  }

  /** Flushes the microtasks the choreography's finish promise needs. */
  async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('dismisses the front card, promotes the next, shifts the one behind', async () => {
    const calls = stubWaapi();
    const el = createDeck(STACK_DECK);
    el.next();
    // The swap is deferred until the choreography finishes: the
    // pile still shows step 0 right after the step.
    expect(levels(el)).toEqual([0, 1, 2]);
    expect(progressText(el)).toBe('2 / 3');
    expect(calls).toHaveLength(3);
    const [dismiss, promote, shift] = calls as [Call, Call, Call];
    expect(dismiss.el.dataset.panel).toBe('0');
    expect(dismiss.keyframes[0]?.transform).toBe('translateY(0px) scale(1)');
    expect(dismiss.keyframes[1]?.transform).toBe('translateX(-130%) rotate(-6deg)');
    expect(dismiss.keyframes[1]?.opacity).toBe('0');
    expect(dismiss.options.easing).toBe('ease-in');
    expect(dismiss.options.duration).toBe(300);
    expect(promote.el.dataset.panel).toBe('1');
    expect(promote.keyframes[0]?.transform).toBe('translateY(-10px) scale(0.97)');
    expect(promote.keyframes[1]?.transform).toBe('translateY(0px) scale(1)');
    expect(promote.options.easing).toBe('ease-out');
    expect(shift.el.dataset.panel).toBe('2');
    expect(shift.keyframes[0]?.transform).toBe('translateY(-20px) scale(0.94)');
    expect(shift.keyframes[1]?.transform).toBe('translateY(-10px) scale(0.97)');
    expect(shift.options.easing).toBe('ease-in-out');
    await flush();
    expect(levels(el)).toEqual([-1, 0, 1]);
  });

  it('the last step dismisses with no card left to shift', async () => {
    const calls = stubWaapi();
    const el = createDeck(STACK_DECK);
    el.next();
    await flush();
    calls.length = 0;
    el.next();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.el.dataset.panel).toBe('1');
    expect(calls[1]?.el.dataset.panel).toBe('2');
    await flush();
    expect(levels(el)).toEqual([-1, -1, 0]);
  });

  it('going back re-deals the dismissed card from the same direction', async () => {
    const calls = stubWaapi();
    const el = createDeck(STACK_DECK);
    el.next();
    await flush();
    el.next();
    await flush();
    calls.length = 0;
    el.prev();
    expect(calls).toHaveLength(2);
    const [redeal, demote] = calls as [Call, Call];
    expect(redeal.el.dataset.panel).toBe('1');
    expect(redeal.keyframes[0]?.transform).toBe('translateX(-130%) rotate(-6deg)');
    expect(redeal.keyframes[0]?.opacity).toBe('0');
    expect(redeal.keyframes[1]?.transform).toBe('translateY(0px) scale(1)');
    expect(redeal.options.easing).toBe('ease-out');
    expect(demote.el.dataset.panel).toBe('2');
    expect(demote.keyframes[0]?.transform).toBe('translateY(0px) scale(1)');
    expect(demote.keyframes[1]?.transform).toBe('translateY(-10px) scale(0.97)');
    await flush();
    expect(levels(el)).toEqual([-1, 0, 1]);
  });

  it('dismisses upward when the direction is up', async () => {
    const calls = stubWaapi();
    const el = createDeck(`<!-- reveal: step; effect: stack; direction: up -->\n\n# Pile\n\n- One\n- Two\n`);
    el.next();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.keyframes[1]?.transform).toBe('translateY(-130%) rotate(-6deg)');
    await flush();
    expect(levels(el)).toEqual([-1, 0]);
  });
});

describe('stack pile stylesheet', () => {
  it('carries the pile rules, the dismiss directions, and the measuring rule', () => {
    expect(DEFAULT_CSS).toContain('.wd-panels--stack');
    expect(DEFAULT_CSS).toContain('.wd-panel--stack-dismissed');
    expect(DEFAULT_CSS).toContain('--wd-stack-offset: 10px');
    expect(DEFAULT_CSS).toContain('--wd-stack-scale-step: 0.03');
    expect(DEFAULT_CSS).toContain('--wd-stack-shade-step: 0.07');
    expect(DEFAULT_CSS).toContain('--wd-stack-visible-behind: 2');
    expect(DEFAULT_CSS).toContain('.wd-panels--stack[data-stack-direction="left"]');
    expect(DEFAULT_CSS).toContain('.wd-panels--stack[data-stack-direction="up"]');
    expect(DEFAULT_CSS).toContain('--wd-stack-dismiss-x: -130%');
    // The measurement pass must not count dismissed cards.
    expect(DEFAULT_CSS).toContain('.wd-screen--measuring .wd-panel--stack-dismissed { display: none; }');
  });
});
