import { describe, expect, it } from 'vitest';
import {
  bottomReservePx,
  CONTROLS_HEIGHT_FALLBACK_PX,
  controlsHeightFallbackPx,
  controlSizePx,
  fallbackReservePx,
  spaceUnitPx,
} from '../src/index.js';

/**
 * The bottom-reserve formula lives in reserve.ts and is
 * asserted here, once. The renderer and the layout engine
 * read the value, never the arithmetic — so no other test
 * pins the same numbers.
 */
describe('bottom reserve (§7.2)', () => {
  it('is controls height + half the space unit (C12)', () => {
    // Measured controls: 60px at phone width (44px button +
    // 2× 8px space), 83.2px at desktop (51.2px button + 2×
    // 16px space), 88px at 1920px. These are the same values
    // the pre-unification measured path produced — the
    // unification moves where the formula lives, never its value.
    expect(bottomReservePx(60, 360)).toBe(64);
    expect(bottomReservePx(83.2, 1440)).toBeCloseTo(91.2, 1);
    expect(bottomReservePx(88, 1920)).toBe(96);
  });

  it('the fallback is the true minimum controls height: 60px, not 56', () => {
    // 44px minimum button (--wd-control-size floor, C8) +
    // top/bottom padding of one space unit each (8px at the
    // space floor). The old 56px was the pre-C8 smallest
    // height and is stale. The 60px constant is the minimum
    // of the width-aware fallback below — the value at the
    // floor widths.
    expect(CONTROLS_HEIGHT_FALLBACK_PX).toBe(60);
    expect(CONTROLS_HEIGHT_FALLBACK_PX).toBe(44 + 2 * spaceUnitPx(0));
    expect(controlsHeightFallbackPx(0)).toBe(60);
    expect(controlsHeightFallbackPx(360)).toBe(60);
  });

  it('the width-aware fallback controls height grows with the viewport', () => {
    // Button size clamp(44px, 3vw + 8px, 56px) + 2× space:
    // 44 + 16 at phone width, 51.2 + 32 at desktop, 56 + 32
    // at 1920px. The old flat 60 was only the phone value.
    expect(controlsHeightFallbackPx(360)).toBe(60);
    expect(controlsHeightFallbackPx(1440)).toBeCloseTo(83.2, 5);
    expect(controlsHeightFallbackPx(1920)).toBe(88);
    expect(controlSizePx(0)).toBe(44);
    expect(controlSizePx(360)).toBe(44);
    expect(controlSizePx(1440)).toBeCloseTo(51.2, 5);
    expect(controlSizePx(1920)).toBe(56);
  });

  it('the fallback reserve agrees with the CSS fallback at every width', () => {
    // CSS fallback on .wd-deck: control size + 2.5× space.
    // The TS fallback used to be the flat 60px minimum, so
    // the two agreed only at phone width (64px) and the TS
    // one under-cleared above 400px (68px against 91.2px at
    // 1440px). Width-aware, they are the same formula in two
    // languages at every width — including phone width, where
    // nothing changes.
    for (const [w, expected] of [
      [360, 64],
      [768, 73.25],
      [1440, 91.2],
      [1920, 96],
    ] as const) {
      expect(fallbackReservePx(w)).toBeCloseTo(expected, 5);
      expect(fallbackReservePx(w)).toBeCloseTo(controlSizePx(w) + 2.5 * spaceUnitPx(w), 5);
      expect(bottomReservePx(controlsHeightFallbackPx(w), w)).toBeCloseTo(expected, 5);
    }
  });
});
