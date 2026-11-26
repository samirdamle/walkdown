/**
 * Swipe / tap input (spec §6.3–§6.4).
 *
 * The swipe threshold lives here now, not in `@walkdown/core`:
 * only the renderer consumes it — it is an input threshold, not
 * a model fact (moved in the element.ts split; a public-API
 * removal from core, flagged in the PR). The `PointerTracker`
 * is the pointer state machine: pointerdown → pointermove →
 * pointerup resolves to a swipe (next/prev), a tap, or nothing.
 * It owns no DOM beyond the event coordinates it is handed; the
 * element decides what a tap does (menu open? text selected?
 * left or right half?).
 */

/**
 * Swipe threshold (§6.4, provisional): a swipe that advances
 * needs at least ~48 CSS px, or 1/8 of the screen width,
 * whichever is smaller.
 */
export const SWIPE_THRESHOLD_PX = 48;

export function swipeThreshold(containerWidth: number): number {
  return Math.min(SWIPE_THRESHOLD_PX, containerWidth / 8);
}

const TAP_MAX_MOVE_PX = 8;
const SWIPE_VERTICAL_MIN_PX = 10;

/** A tap that starts a scroll/drag, or on an interactive element, is not navigation (§6.3). */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('a, button, input, textarea, select, [contenteditable], .wd-controls') !== null;
}

/** What a pointerup resolved to. `hadStart` is false when no pointerdown preceded it. */
export interface PointerUpResult {
  hadStart: boolean;
  /** The tap's x coordinate, or null when it was not a tap (swipe, scroll, drag, interactive start). */
  tapX: number | null;
}

/**
 * The pointer gesture state machine (§6.3–§6.4): a horizontal
 * movement past the swipe threshold is a swipe (left = next,
 * right = prev); a vertical movement is a scroll and the browser
 * owns it (`touch-action: pan-y`); anything else that ends
 * near where it started, on a non-interactive target, is a tap.
 * A tap that started on an interactive element, or moved too
 * far, is not navigation.
 */
export class PointerTracker {
  private _start: { x: number; y: number; interactive: boolean } | null = null;
  private _gesture: 'undecided' | 'horizontal' | 'vertical' | 'handled' = 'undecided';

  down(clientX: number, clientY: number, target: EventTarget | null): void {
    this._start = { x: clientX, y: clientY, interactive: isInteractiveTarget(target) };
    this._gesture = 'undecided';
  }

  /** A swipe resolves as soon as the threshold is crossed; returns 'next' / 'prev' once, then null. */
  move(clientX: number, clientY: number, containerWidth: number): 'next' | 'prev' | null {
    if (this._start === null || this._gesture === 'handled' || this._gesture === 'vertical') return null;
    const dx = clientX - this._start.x;
    const dy = clientY - this._start.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_VERTICAL_MIN_PX) {
      // Vertical: it stays a scroll (§6.4). The browser owns it (touch-action: pan-y).
      this._gesture = 'vertical';
      return null;
    }
    if (this._gesture === 'undecided' && Math.abs(dx) > Math.abs(dy)) {
      const threshold = swipeThreshold(containerWidth);
      if (Math.abs(dx) >= threshold) {
        this._gesture = 'handled';
        if (dx < 0) return 'next';
        return 'prev';
      }
    }
    return null;
  }

  up(clientX: number, clientY: number): PointerUpResult {
    const start = this._start;
    this._start = null;
    if (start === null) return { hadStart: false, tapX: null };
    if (this._gesture === 'handled' || this._gesture === 'vertical') {
      this._gesture = 'undecided';
      return { hadStart: true, tapX: null };
    }
    this._gesture = 'undecided';
    // Tap, not drag (§6.3): movement beyond a small threshold cancels it.
    if (Math.abs(clientX - start.x) > TAP_MAX_MOVE_PX || Math.abs(clientY - start.y) > TAP_MAX_MOVE_PX) {
      return { hadStart: true, tapX: null };
    }
    if (start.interactive) return { hadStart: true, tapX: null };
    return { hadStart: true, tapX: clientX };
  }
}
