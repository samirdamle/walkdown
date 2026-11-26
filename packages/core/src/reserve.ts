/**
 * Bottom-controls reserve (§7.2): the single definition of
 * the height that must stay clear at the bottom of a screen
 * — the navigation controls' height plus a small clearance
 * (half the space unit, C12), so panels never sit underneath
 * the overlaid controls.
 *
 * The formula lives here and nowhere else. The renderer
 * measures the controls for real when it has layout and
 * falls back to `controlsHeightFallbackPx` before first
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
import { clampPx, spaceUnitPx } from './layout.js';

/**
 * Pre-paint fallback controls height (px): the smallest the
 * controls can be — a 44px button (the --wd-control-size
 * floor, the 44px minimum touch target, C8) plus top and
 * bottom padding of one space unit each (8px at the space
 * floor), i.e. 44 + 2×8 = 60. The previous value, 56, was
 * the pre-C8 smallest height and is stale. This constant is
 * the MINIMUM — the width-aware `controlsHeightFallbackPx`
 * below — and it is kept exported so existing importers keep
 * working; new callers should use the width-aware function.
 */
export const CONTROLS_HEIGHT_FALLBACK_PX = 60;

/**
 * Control-button size (§6.5, `styles.ts` `--wd-control-size`):
 * `clamp(44px, 3vw + 8px, 56px)` — 44px is the minimum touch
 * target (C8), ~51px at 1440px, capped at 56px. This is chrome,
 * not a §8 token, so it is NOT generated from the JSON — it is
 * a small function sharing the CSS breakpoints, and the
 * renderer test pins it against the CSS rule itself, so the
 * two cannot drift apart silently.
 */
export function controlSizePx(containerWidth: number): number {
  return clampPx(44, (3 * containerWidth) / 100 + 8, 56);
}

/**
 * Pre-paint fallback controls height at a container width:
 * the button size plus top and bottom padding of one space
 * unit each (the space unit comes from the `--wd-space` token
 * via `spaceUnitPx`). Width-aware (this step): the old flat
 * 60 was the value at the floor widths only, so above 400px
 * the TS fallback under-cleared the CSS fallback (control
 * size + 2.5× space) — 68px against 91.2px at 1440px. Now the
 * two are the same formula in two languages at every width:
 * 60px at the floor widths, 83.2px at 1440px, 88px at 1920px.
 * The measured reserve in a real browser is unchanged — the
 * measured height replaces this as soon as the element has
 * layout; this only matters before first paint (or in jsdom).
 */
export function controlsHeightFallbackPx(containerWidth: number): number {
  return controlSizePx(containerWidth) + 2 * spaceUnitPx(containerWidth);
}

/**
 * The fallback bottom reserve at a container width (§7.2):
 * the width-aware fallback controls height plus half-space
 * clearance — the TS side of the CSS `--wd-reserve-bottom`
 * fallback. 64px at 360px, 91.2px at 1440px, 96px at 1920px —
 * exactly the CSS fallback at every width.
 */
export function fallbackReservePx(containerWidth: number): number {
  return bottomReservePx(controlsHeightFallbackPx(containerWidth), containerWidth);
}

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
