/**
 * Bottom-controls reserve (§7.2): the single definition of
 * the height that must stay clear at the bottom of a screen
 * — the navigation controls' height plus a small clearance
 * (half the space unit, C12), so panels never sit underneath
 * the overlaid controls.
 *
 * The formula lives here and nowhere else. The renderer
 * measures the controls for real when it has layout and
 * falls back to CONTROLS_HEIGHT_FALLBACK_PX before first
 * paint (or in jsdom, where there is no layout to measure);
 * the stylesheet's pre-paint default for --wd-reserve-bottom
 * is the same formula in CSS terms (control size + 2.5×
 * space), defined once on .wd-deck. computeLayout takes the
 * reserve as an input and emits it as --wd-reserve-bottom —
 * it never recomputes it. The reveal auto-scroll reads the
 * same value, so the visible window ends at the reserve, not
 * at the container's bottom edge.
 *
 * This is the seam where bug #38 lived (bottom-nav overlap,
 * PR #40): the clearance used to be bottom padding on the
 * screen, which Safari/WebKit does not count toward a flex
 * container's scrollable overflow. The clearance is a
 * trailing in-flow spacer now, and the reserve value it
 * carries comes from this module — the mechanism and the
 * value are separate, and only the value lives here.
 */
import { spaceUnitPx } from './layout.js';

/**
 * Pre-paint fallback controls height (px): the smallest the
 * controls can be — a 44px button (the --wd-control-size
 * floor, the 44px minimum touch target, C8) plus top and
 * bottom padding of one space unit each (8px at the space
 * floor), i.e. 44 + 2×8 = 60. The previous value, 56, was
 * the pre-C8 smallest height and is stale; the fallback only
 * matters before first paint (or in jsdom), and the measured
 * height replaces it as soon as the element has layout.
 */
export const CONTROLS_HEIGHT_FALLBACK_PX = 60;

/**
 * Bottom reserve (§7.2): the controls' height plus half the
 * space unit of clearance (C12) — 4px at phone width, 8px
 * at desktop. The clearance scales with the screen instead
 * of a fixed 8px, because it is half of --wd-space, which
 * is viewport-relative.
 */
export function bottomReservePx(controlsHeightPx: number, containerWidth: number): number {
  return controlsHeightPx + spaceUnitPx(containerWidth) / 2;
}
