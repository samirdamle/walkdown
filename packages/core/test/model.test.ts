import { describe, expect, it } from 'vitest';
import { parseDeck } from '../src/parser.js';
import {
  endState,
  hashFor,
  jumpToScreen,
  nextState,
  prevState,
  startState,
  stateFromHash,
  stepsForScreen,
  swipeThreshold,
  totalSteps,
  visiblePanelIndexes,
  zoomFactor,
  zoomIn,
  zoomOut,
} from '../src/model.js';

const THREE_STEP = parseDeck(`<!-- reveal: step -->

# A

- One
- Two
- Three

---

<!-- reveal: all -->

# B

- One

---

<!-- reveal: step -->

# C

- One
- Two
`);

describe('steps', () => {
  it('a step screen contributes one step per panel; an all screen contributes one', () => {
    expect(totalSteps(THREE_STEP)).toBe(3 + 1 + 2);
  });

  it('step k shows the first k+1 panels in reveal sequence', () => {
    const deck = parseDeck(`<!-- reveal: step; sequence: 3, 1, 2 -->

# Ordered

- One
- Two
- Three
`);
    const screen = deck.sections[0]?.screens[0];
    if (!screen) throw new Error('no screen');
    expect(visiblePanelIndexes(screen, 0)).toEqual([2]);
    expect(visiblePanelIndexes(screen, 1)).toEqual([2, 0]);
    expect(visiblePanelIndexes(screen, 2)).toEqual([2, 0, 1]);
    expect(stepsForScreen(screen)).toBe(3);
  });
});

describe('navigation (§6.2)', () => {
  it('Next reveals panels, then moves to the next screen at step 0', () => {
    let state = startState();
    state = nextState(THREE_STEP, state);
    expect(state).toEqual({ screenIndex: 0, stepIndex: 1, zoom: 0 });
    state = nextState(THREE_STEP, state);
    expect(state).toEqual({ screenIndex: 0, stepIndex: 2, zoom: 0 });
    state = nextState(THREE_STEP, state);
    expect(state).toEqual({ screenIndex: 1, stepIndex: 0, zoom: 0 });
  });

  it('Next at the last step of the last screen is a no-op', () => {
    const end = endState(THREE_STEP);
    expect(nextState(THREE_STEP, end)).toEqual(end);
  });

  it('Previous hides a panel, then lands on the previous screen fully revealed', () => {
    const atB = { screenIndex: 1, stepIndex: 0, zoom: 0 };
    const back = prevState(THREE_STEP, atB);
    expect(back).toEqual({ screenIndex: 0, stepIndex: 2, zoom: 0 });
    expect(prevState(THREE_STEP, back)).toEqual({ screenIndex: 0, stepIndex: 1, zoom: 0 });
  });

  it('Previous at the first step of the first screen is a no-op', () => {
    expect(prevState(THREE_STEP, startState())).toEqual(startState());
  });

  it('Start and End jump to the ends', () => {
    expect(startState()).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
    expect(endState(THREE_STEP)).toEqual({ screenIndex: 2, stepIndex: 1, zoom: 0 });
  });

  it('a jump lands at step 0 forward and at the last step backward', () => {
    expect(jumpToScreen(THREE_STEP, 2, 'forward')).toEqual({ screenIndex: 2, stepIndex: 0, zoom: 0 });
    expect(jumpToScreen(THREE_STEP, 2, 'backward')).toEqual({ screenIndex: 2, stepIndex: 1, zoom: 0 });
  });
});

describe('deep links (§1.4)', () => {
  it('round-trips #/<screen>/<step>', () => {
    const state = { screenIndex: 1, stepIndex: 0, zoom: 0 };
    expect(hashFor(state)).toBe('#/2/1');
    expect(stateFromHash(THREE_STEP, '#/2/1')).toEqual(state);
  });

  it('a bare #/3 is screen 3, step 1', () => {
    expect(stateFromHash(THREE_STEP, '#/3')).toEqual({ screenIndex: 2, stepIndex: 0, zoom: 0 });
  });

  it('out-of-range links clamp to the nearest valid position', () => {
    expect(stateFromHash(THREE_STEP, '#/2/9')).toEqual({ screenIndex: 1, stepIndex: 0, zoom: 0 });
    expect(stateFromHash(THREE_STEP, '#/99/1')).toEqual({ screenIndex: 2, stepIndex: 1, zoom: 0 });
    expect(stateFromHash(THREE_STEP, 'not-a-hash')).toEqual({ screenIndex: 0, stepIndex: 0, zoom: 0 });
  });
});

describe('zoom (§7.3)', () => {
  it('is ×1.1 per step, bounded at ±4', () => {
    expect(zoomFactor(0)).toBe(1);
    expect(zoomFactor(1)).toBeCloseTo(1.1, 10);
    expect(zoomFactor(4)).toBeCloseTo(1.4641, 4);
    expect(zoomFactor(-4)).toBeCloseTo(0.683, 3);
    let zoom = 0;
    for (let i = 0; i < 9; i++) zoom = zoomIn(zoom);
    expect(zoom).toBe(4);
    for (let i = 0; i < 12; i++) zoom = zoomOut(zoom);
    expect(zoom).toBe(-4);
  });
});

describe('swipe threshold (§6.4, provisional)', () => {
  it('is ~48 CSS px or 1/8 of the screen width, whichever is smaller', () => {
    expect(swipeThreshold(1440)).toBe(48);
    expect(swipeThreshold(360)).toBe(45);
    expect(swipeThreshold(200)).toBe(25);
  });
});
