/**
 * The `stack` reveal effect (spec §4.2): a screen's panels form a
 * pile — a card deck — instead of a grid. The front card is in flow
 * and sets the pile height; the cards behind are absolute over it,
 * peeking at the top edge, scaled down and shaded darker per level.
 * Advancing a step dismisses the front card (it flies away in the
 * screen's `direction`) and the next card rises to the front; going
 * back re-deals the dismissed card. The pile is a pure function of
 * (screen, stepIndex): entering a stack screen or deep-linking to a
 * step renders the pile with the first `stepIndex` cards already
 * dismissed, with no animation. Animation only ever happens on a
 * genuine step forward/back, choreographed here with the Web
 * Animations API (see `animateStackStep`).
 */
import {
  STACK_OFFSET_PX,
  STACK_SCALE_STEP,
  STACK_SHADE_STEP,
  STACK_VISIBLE_BEHIND,
} from '@walkdown/core';
import type { RevealDirection, Screen } from '@walkdown/core';
import { panelHtml } from './render.js';

/** How far a dismissed card travels, as a share of its own size (§4.2). */
export const STACK_DISMISS_DISTANCE = '130%';
/** The slight rotation a dismissed card carries as it flies away (§4.2). */
export const STACK_DISMISS_ROTATE_DEG = 6;

/** A screen uses the pile layout when its resolved effect is `stack`. */
export function isStackScreen(screen: Screen): boolean {
  return screen.reveal.effect === 'stack';
}

/**
 * A panel's pile level at a step: -1 = already dismissed, 0 = front,
 * 1/2 = peeking behind. Levels deeper than the visible cap share the
 * deepest visible level, so an 8-panel screen does not spread the
 * pile. The pile order follows the reveal order (§4.2): the first
 * panel in sequence order is on top.
 */
export function stackLevelFor(screen: Screen, stepIndex: number, panelIndex: number): number {
  const position = screen.reveal.sequence.indexOf(panelIndex);
  if (position < 0) return STACK_VISIBLE_BEHIND;
  const revealed = position - stepIndex;
  if (revealed < 0) return -1;
  return Math.min(revealed, STACK_VISIBLE_BEHIND);
}

/** The rest transform of a pile level: lifted by the peek offset, scaled down (§4.2). The scale is rounded to two decimals, like the brightness (binary floating point would otherwise print 0.9699999999999999 for deeper levels). */
export function stackLevelTransform(level: number): string {
  const scale = Math.round((1 - level * STACK_SCALE_STEP) * 100) / 100;
  return `translateY(${-level * STACK_OFFSET_PX}px) scale(${scale})`;
}

/** The rest brightness of a pile level: shaded darker the further back (§4.2). Rounded to two decimals: 1 − 0.07 is 0.9299999999999999 in binary floating point, and the keyframes must read 0.93. */
export function stackLevelBrightness(level: number): number {
  return Math.round((1 - level * STACK_SHADE_STEP) * 100) / 100;
}

/** The dismiss transform: the front card flies `direction` and rotates slightly (§4.2). */
export function stackDismissTransform(direction: RevealDirection): string {
  const distance = STACK_DISMISS_DISTANCE;
  const rotate = STACK_DISMISS_ROTATE_DEG;
  switch (direction) {
    case 'left':
      return `translateX(-${distance}) rotate(-${rotate}deg)`;
    case 'right':
      return `translateX(${distance}) rotate(${rotate}deg)`;
    case 'up':
      return `translateY(-${distance}) rotate(-${rotate}deg)`;
    case 'down':
      return `translateY(${distance}) rotate(${rotate}deg)`;
  }
}

/**
 * The pile's HTML for a screen at a step. Every panel is in the DOM:
 * dismissed cards are `visibility: hidden` + `aria-hidden` (never the
 * `hidden` attribute, so they can fly back in on a step back), the
 * front card is in flow, the cards behind are absolute. The pile
 * height is the front card's height; the container's top padding
 * absorbs the peek (§7.2).
 */
export function stackPanelsHtml(screen: Screen, stepIndex: number): string {
  return screen.panels
    .map((panel, i) => {
      const level = stackLevelFor(screen, stepIndex, i);
      const dismissed = level < 0;
      const shown = Math.max(level, 0);
      // The front card paints above the cards behind it: z-index
      // counts down from the front, so DOM order never decides the
      // pile order.
      const zIndex = dismissed ? 0 : STACK_VISIBLE_BEHIND + 1 - shown;
      if (dismissed) {
        return panelHtml(
          panel,
          i,
          ['wd-panel--stack', 'wd-panel--stack-dismissed'],
          ` data-stack-level="-1" style="visibility: hidden; z-index: 0;" aria-hidden="true"`,
        );
      }
      return panelHtml(
        panel,
        i,
        ['wd-panel--stack'],
        ` data-stack-level="${shown}" style="--wd-stack-level: ${shown}; z-index: ${zIndex};"`,
      );
    })
    .join('');
}

/** The running choreography of one stack step: the animations, and a promise for their end. */
export interface StackStepAnimation {
  animations: Animation[];
  finished: Promise<void>;
}

function panelEl(panelsEl: HTMLElement, panelIndex: number): HTMLElement | null {
  const el = panelsEl.querySelector(`[data-panel="${panelIndex}"]`);
  return el instanceof HTMLElement ? el : null;
}

function keyframes(
  fromTransform: string,
  toTransform: string,
  fromBrightness: number,
  toBrightness: number,
  fromOpacity: number,
  toOpacity: number,
): Keyframe[] {
  return [
    { transform: fromTransform, filter: `brightness(${fromBrightness})`, opacity: String(fromOpacity) },
    { transform: toTransform, filter: `brightness(${toBrightness})`, opacity: String(toOpacity) },
  ];
}

/**
 * Choreographs one stack step on the current DOM — which must still
 * show the pile at `fromStep` (the caller re-renders to `toStep`
 * when `finished` resolves). Forward dismisses the front card and
 * promotes the next one; backward re-deals the dismissed card and
 * demotes the front one. The dismiss eases in (it leaves), the
 * promote eases out (it arrives), the level shifts ease in-out.
 *
 * Returns null when there is nothing to animate (WAAPI unavailable,
 * zero duration, or a panel element is missing): the caller then
 * re-renders synchronously to the new rest state. The `finished`
 * promise never rejects — it resolves on completion, cancellation,
 * or a timeout failsafe (duration + 500ms), so the caller is never
 * left waiting on an animation that never ends (notably under
 * reduced motion, where the caller does not call this at all, but
 * also if `finished` never settles).
 */
export function animateStackStep(
  panelsEl: HTMLElement,
  screen: Screen,
  fromStep: number,
  toStep: number,
  forward: boolean,
): StackStepAnimation | null {
  const durationMs = screen.reveal.durationMs;
  if (durationMs <= 0) return null;
  const direction = screen.reveal.direction;
  const order = screen.reveal.sequence;
  const animations: Animation[] = [];

  const animate = (el: HTMLElement, frames: Keyframe[], easing: string): boolean => {
    if (typeof el.animate !== 'function') return false;
    const a = el.animate(frames, { duration: durationMs, easing, fill: 'forwards' });
    animations.push(a);
    return true;
  };

  if (forward) {
    // Dismiss the front card: it flies away in `direction`.
    const dismissing = order[fromStep];
    const promoting = order[toStep];
    const shifting = order[toStep + 1];
    if (dismissing === undefined || promoting === undefined) return null;
    const dismissEl = panelEl(panelsEl, dismissing);
    const promoteEl = panelEl(panelsEl, promoting);
    if (dismissEl === null || promoteEl === null) return null;
    if (
      !animate(
        dismissEl,
        keyframes(
          stackLevelTransform(0),
          stackDismissTransform(direction),
          stackLevelBrightness(0),
          stackLevelBrightness(0),
          1,
          0,
        ),
        'ease-in',
      )
    ) {
      return null;
    }
    animate(
      promoteEl,
      keyframes(
        stackLevelTransform(1),
        stackLevelTransform(0),
        stackLevelBrightness(1),
        stackLevelBrightness(0),
        1,
        1,
      ),
      'ease-out',
    );
    // The card behind the promoted one shifts up one level, if there is one.
    if (shifting !== undefined) {
      const shiftEl = panelEl(panelsEl, shifting);
      if (shiftEl !== null) {
        animate(
          shiftEl,
          keyframes(
            stackLevelTransform(2),
            stackLevelTransform(1),
            stackLevelBrightness(2),
            stackLevelBrightness(1),
            1,
            1,
          ),
          'ease-in-out',
        );
      }
    }
  } else {
    // Re-deal the dismissed card: it flies back in from `direction`.
    const redealing = order[toStep];
    const demoting = order[fromStep];
    const shifting = order[fromStep + 1];
    if (redealing === undefined || demoting === undefined) return null;
    const redealEl = panelEl(panelsEl, redealing);
    const demoteEl = panelEl(panelsEl, demoting);
    if (redealEl === null || demoteEl === null) return null;
    // The dismissed card is `visibility: hidden` in its rest state;
    // make it visible at the dismissed transform (off the pile, so
    // nothing flashes) and put it on top for the flight in.
    redealEl.style.visibility = '';
    redealEl.removeAttribute('aria-hidden');
    redealEl.style.zIndex = String(STACK_VISIBLE_BEHIND + 1);
    if (
      !animate(
        redealEl,
        keyframes(
          stackDismissTransform(direction),
          stackLevelTransform(0),
          stackLevelBrightness(0),
          stackLevelBrightness(0),
          0,
          1,
        ),
        'ease-out',
      )
    ) {
      return null;
    }
    animate(
      demoteEl,
      keyframes(
        stackLevelTransform(0),
        stackLevelTransform(1),
        stackLevelBrightness(0),
        stackLevelBrightness(1),
        1,
        1,
      ),
      'ease-in-out',
    );
    if (shifting !== undefined) {
      const shiftEl = panelEl(panelsEl, shifting);
      if (shiftEl !== null) {
        animate(
          shiftEl,
          keyframes(
            stackLevelTransform(1),
            stackLevelTransform(2),
            stackLevelBrightness(1),
            stackLevelBrightness(2),
            1,
            1,
          ),
          'ease-in-out',
        );
      }
    }
  }

  const finished = Promise.allSettled(animations.map((a) => a.finished)).then(() => undefined);
  const failsafe = new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs + 500);
  });
  return { animations, finished: Promise.race([finished, failsafe]) };
}
