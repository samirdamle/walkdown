import { describe, expect, it } from 'vitest';
import { bottomReservePx, CONTROLS_HEIGHT_FALLBACK_PX, spaceUnitPx } from '../src/index.js';

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
    // height and is stale.
    expect(CONTROLS_HEIGHT_FALLBACK_PX).toBe(60);
    expect(CONTROLS_HEIGHT_FALLBACK_PX).toBe(44 + 2 * spaceUnitPx(0));
  });

  it('the fallback reserve agrees with the CSS fallback at phone width', () => {
    // CSS fallback on .wd-deck: control size + 2.5× space =
    // 44 + 20 = 64px at 360px. The two fallbacks are the same
    // formula in two languages; at phone width they agree
    // exactly (above it the CSS one is taller — conservative,
    // never under-clearing — because it scales with the
    // viewport while the TS fallback is the flat minimum).
    expect(bottomReservePx(CONTROLS_HEIGHT_FALLBACK_PX, 360)).toBe(64);
  });
});
