/**
 * The walk state machine (spec §1.2–§1.4, §5, §6).
 *
 * State is (screenIndex, stepIndex, zoom). Everything else —
 * which panels are visible, what the URL says — is derived.
 * All transitions here are pure functions of (deck, state).
 */
import { ZOOM_MAX_STEPS, ZOOM_MIN_STEPS, ZOOM_STEP } from './tokens.js';
import type { Deck, Screen, WalkState } from './types.js';

/** Steps a screen contributes (§1.3): 1 for 'all', one per panel for 'step'. */
export function stepsForScreen(screen: Screen): number {
  return screen.reveal.mode === 'all' ? 1 : Math.max(1, screen.panels.length);
}

/** Flat list of a deck's screens, sections flattened (§1.2). */
export function flatScreens(deck: Deck): Screen[] {
  return deck.sections.flatMap((s) => s.screens);
}

/** Total steps in the deck — the progress indicator counts these, not screens (§1.3). */
export function totalSteps(deck: Deck): number {
  return flatScreens(deck).reduce((sum, screen) => sum + stepsForScreen(screen), 0);
}

/**
 * Which panels are visible at a step (§5): step k shows the
 * first k+1 panels in reveal sequence. For an 'all' screen
 * every panel is visible at its only step.
 */
export function visiblePanelIndexes(screen: Screen, stepIndex: number): number[] {
  if (screen.reveal.mode === 'all') return screen.reveal.sequence.slice();
  const shown = Math.min(stepIndex + 1, screen.panels.length);
  return screen.reveal.sequence.slice(0, shown);
}

export function isPanelVisible(screen: Screen, stepIndex: number, panelIndex: number): boolean {
  return visiblePanelIndexes(screen, stepIndex).includes(panelIndex);
}

/** Clamp a state to the nearest valid position (§1.4). */
export function clampState(deck: Deck, state: WalkState): WalkState {
  const screens = flatScreens(deck);
  if (screens.length === 0) return { screenIndex: 0, stepIndex: 0, zoom: state.zoom };
  const screenIndex = Math.min(Math.max(0, state.screenIndex), screens.length - 1);
  const screen = screens[screenIndex];
  if (screen === undefined) return { screenIndex: 0, stepIndex: 0, zoom: state.zoom };
  const stepIndex = Math.min(Math.max(0, state.stepIndex), stepsForScreen(screen) - 1);
  return { screenIndex, stepIndex, zoom: state.zoom };
}

export function startState(): WalkState {
  return { screenIndex: 0, stepIndex: 0, zoom: 0 };
}

export function endState(deck: Deck): WalkState {
  const screens = flatScreens(deck);
  if (screens.length === 0) return { screenIndex: 0, stepIndex: 0, zoom: 0 };
  const last = screens[screens.length - 1];
  if (last === undefined) return { screenIndex: 0, stepIndex: 0, zoom: 0 };
  return { screenIndex: screens.length - 1, stepIndex: stepsForScreen(last) - 1, zoom: 0 };
}

/** Next (§6.2): reveal the next panel, else the next screen at step 0, else no-op at the end. */
export function nextState(deck: Deck, state: WalkState): WalkState {
  const screens = flatScreens(deck);
  const screen = screens[state.screenIndex];
  if (screen === undefined) return clampState(deck, state);
  if (state.stepIndex + 1 < stepsForScreen(screen)) {
    return { ...state, stepIndex: state.stepIndex + 1 };
  }
  if (state.screenIndex + 1 < screens.length) {
    return { screenIndex: state.screenIndex + 1, stepIndex: 0, zoom: state.zoom };
  }
  return { ...state }; // last step of the last screen: no-op (§6.2)
}

/** Previous (§6.2): hide the last revealed panel, else the previous screen fully revealed, else no-op. */
export function prevState(deck: Deck, state: WalkState): WalkState {
  const screens = flatScreens(deck);
  const screen = screens[state.screenIndex];
  if (screen === undefined) return clampState(deck, state);
  if (state.stepIndex > 0) {
    return { ...state, stepIndex: state.stepIndex - 1 };
  }
  if (state.screenIndex > 0) {
    const prev = screens[state.screenIndex - 1];
    if (prev === undefined) return { ...state };
    return { screenIndex: state.screenIndex - 1, stepIndex: stepsForScreen(prev) - 1, zoom: state.zoom };
  }
  return { ...state }; // first step of the first screen: no-op (§6.2)
}

/**
 * Jump to a screen (§6.2): step 0 when arriving forward,
 * last step when arriving backward. A jump shows the target
 * with no reveal animation (§5).
 */
export function jumpToScreen(deck: Deck, screenIndex: number, direction: 'forward' | 'backward', zoom = 0): WalkState {
  const screens = flatScreens(deck);
  const clamped = Math.min(Math.max(0, screenIndex), Math.max(0, screens.length - 1));
  const screen = screens[clamped];
  if (screen === undefined) return { screenIndex: 0, stepIndex: 0, zoom };
  return {
    screenIndex: clamped,
    stepIndex: direction === 'forward' ? 0 : stepsForScreen(screen) - 1,
    zoom,
  };
}

/** Deep link `#/<screen>/<step>`, both 1-based (§1.4). */
export function hashFor(state: WalkState): string {
  return `#/${state.screenIndex + 1}/${state.stepIndex + 1}`;
}

/** Restore a state from a deep link, clamping out-of-range positions (§1.4). A bare `#/3` is screen 3, step 1. A screen past the end lands on the deck's last step. */
export function stateFromHash(deck: Deck, hash: string, zoom = 0): WalkState {
  const m = /^#\/(\d+)(?:\/(\d+))?\/?$/.exec(hash.trim());
  if (!m) return { screenIndex: 0, stepIndex: 0, zoom };
  const screens = flatScreens(deck);
  const screenIndex = Number(m[1]) - 1;
  if (screenIndex >= screens.length) {
    // Past the end: the deck's last step (§1.4).
    return { ...endState(deck), zoom };
  }
  const stepIndex = m[2] !== undefined ? Number(m[2]) - 1 : 0;
  return clampState(deck, { screenIndex, stepIndex, zoom });
}

/** Zoom (§7.3, design-policies §2.4): one step is ×1.1, bounded at ±4 steps, persisting across screens. */
export function zoomIn(zoom: number): number {
  return Math.min(ZOOM_MAX_STEPS, zoom + 1);
}

export function zoomOut(zoom: number): number {
  return Math.max(ZOOM_MIN_STEPS, zoom - 1);
}

/** The zoom multiplier for a zoom level: ×1.1 per step (multiplicative, so every step feels the same). */
export function zoomFactor(zoom: number): number {
  return Math.pow(ZOOM_STEP, zoom);
}
