/**
 * Layout and the font-fit measurement pass (spec §7.2, §7.4).
 *
 * Owns the container measurement, the bottom-controls reserve,
 * the `computeLayout` pass, the measurement pass that shrinks
 * overflowing type to the floor, and the scroll cue. The element
 * only tells it the current facts and state; the fitted
 * body size lives here, never in the element.
 */
import { bottomReservePx, computeLayout, controlsHeightFallbackPx, FONT_FLOOR_PX } from '@walkdown/core';
import type { WalkState } from '@walkdown/core';
import type { DeckFacts } from './facts.js';

/** The container size, in CSS px. */
export interface ContainerSize {
  width: number;
  height: number;
}

/** Measure the container the element lays out in. Falls back to a desktop-sized viewport when there is no layout yet (jsdom, or not yet painted), so the first render is still correct. */
export function measureContainer(
  override: ContainerSize | null,
  host: HTMLElement,
): ContainerSize {
  if (override !== null) return override;
  const w = host.clientWidth || 0;
  const h = host.clientHeight || 0;
  return { width: w > 0 ? w : 1440, height: h > 0 ? h : 900 };
}

/**
 * Bottom reserve (§7.2): the height the bottom controls
 * occupy, plus a small clearance, so panels never sit
 * underneath them. Measured for real when the element has
 * layout; the fallback is the width-aware
 * `controlsHeightFallbackPx` (control size + 2× space at the
 * container width — the TS side of the CSS `--wd-reserve-bottom`
 * fallback), which covers jsdom / not-yet-painted.
 * Auto-hide only changes the controls' opacity, never their
 * height, so the reserve is the same whether they are
 * currently visible or idle-hidden — they can reappear at
 * any moment, and the layout must already clear them.
 * The formula is the core's bottomReservePx — this only
 * supplies the height side of it.
 */
export function controlsReservePx(controlsEl: HTMLElement, containerWidth: number): number {
  const measured = controlsEl?.offsetHeight ?? 0;
  return bottomReservePx(measured > 0 ? measured : controlsHeightFallbackPx(containerWidth), containerWidth);
}

export class LayoutController {
  /** Body size the last layout pass fitted (§2.2) — the measurement pass shrinks from here, never grows. */
  private _fittedBodyPx = 0;
  /** Measured container size override (tests / embedded contexts); null means measure the host. */
  private _containerSize: ContainerSize | null = null;

  /**
   * @param deckEl the `.wd-deck` element (carries the layout CSS variables).
   * @param screenEl the `.wd-screen` scroll container.
   * @param controlsEl the `.wd-controls` element (its height sets the reserve).
   * @param scrollCueEl the `.wd-scroll-cue` element.
   * @param host the custom element itself (measured when there is no override).
   */
  constructor(
    private readonly _deckEl: HTMLDivElement,
    private readonly _screenEl: HTMLDivElement,
    private readonly _controlsEl: HTMLDivElement,
    private readonly _scrollCueEl: HTMLDivElement,
    private readonly _host: HTMLElement,
  ) {}

  /** Override the measured container size (CSS px). Pass null to go back to measuring. */
  setContainerSize(size: ContainerSize | null): void {
    this._containerSize = size;
  }

  /** The container size this pass lays out in. */
  measureContainer(): ContainerSize {
    return measureContainer(this._containerSize, this._host);
  }

  /** The bottom reserve for a container width (§7.2). */
  controlsReservePx(containerWidth: number): number {
    return controlsReservePx(this._controlsEl, containerWidth);
  }

  /** Re-run the layout engine for the current screen (spec §7.2). Debounced by ResizeObserver's own cadence. */
  applyLayout(facts: DeckFacts, state: WalkState): void {
    const screen = facts.screen(state.screenIndex);
    if (screen === undefined) return;
    const { width, height } = this.measureContainer();
    // The fit runs on ALL panels' content — the whole screen,
    // visible or not yet revealed — so the fitted size is fixed
    // for the screen: a step that reveals another panel never
    // changes the type. The column count comes from the total
    // panel count (inside computeLayout), so the grid — and
    // every visible panel's position in it — stays put across
    // steps; only the type size changes, never a position.
    // The fit also reserves the bottom controls' height plus
    // clearance, so panels never run underneath them.
    const result = computeLayout({
      containerWidth: width,
      containerHeight: height,
      panelCount: screen.panels.length,
      contentLengths: screen.panels.map((p) => p.text.length),
      reservedBottomPx: this.controlsReservePx(width),
      zoom: state.zoom,
    });
    for (const [k, v] of Object.entries(result.vars)) this._deckEl.style.setProperty(k, v);
    this._fittedBodyPx = result.fontBodyPx;
    this._fitMeasuredFont();
    this.updateScrollCue();
  }

  /** The scroll cue shows only when the screen is scrollable and not at the bottom. */
  updateScrollCue(): void {
    const el = this._screenEl;
    const scrollable = el.scrollHeight > el.clientHeight + 4;
    el.classList.toggle('wd-screen--scrolling', scrollable);
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    this._scrollCueEl.classList.toggle('wd-scroll-cue--visible', scrollable && notAtBottom);
  }

  /**
   * Measurement is the authority (§7.4): the fit is an
   * estimate (average glyph ≈ 0.5em, uniform line-height), so
   * after layout, shrink the body size 1px at a time while the
   * screen still overflows, down to the 14px floor. At the
   * floor the screen scrolls internally and the scroll cue
   * shows. This pass only ever shrinks — growing is the fit's
   * job, on the next layout pass (resize, screen change, zoom
   * change — never a step change).
   *
   * The measurement sees the FULL screen, not just the visible
   * panels: hidden panels take no space (§5), so they are
   * revealed synchronously for the measurement (the
   * `wd-screen--measuring` class makes them take layout space
   * while staying invisible). The class is added and removed
   * in this same task, before any paint, so nothing flickers.
   * The screen's bottom clearance is a trailing in-flow spacer
   * carrying the controls reserve (`--wd-reserve-bottom`), so
   * the overflow check measures against the height available
   * above the controls. (It used to be bottom padding on the
   * screen — Safari does not count that toward a flex
   * container's scrollable overflow, issue #38.)
   * Skipped when there is no layout yet (jsdom, or not yet
   * painted: clientHeight is 0 and there is nothing to measure).
   */
  private _fitMeasuredFont(): void {
    const el = this._screenEl;
    if (el.clientHeight === 0 || this._fittedBodyPx <= 0) return;
    this._screenEl.classList.add('wd-screen--measuring');
    try {
      let size = this._fittedBodyPx;
      let guard = 0;
      while (size > FONT_FLOOR_PX && el.scrollHeight > el.clientHeight + 4 && guard < 24) {
        size = Math.max(FONT_FLOOR_PX, size - 1);
        this._deckEl.style.setProperty('--wd-font-body', `${size}px`);
        guard++;
      }
    } finally {
      this._screenEl.classList.remove('wd-screen--measuring');
    }
    this.updateScrollCue();
  }
}
