import { describe, expect, it } from 'vitest';
import { controlSizePx, NAV_MENU_MAX_HEIGHT_CSS, SPACE_MIN_PX } from '@walkdown/core';
import { DEFAULT_CSS } from '../src/styles.js';

/**
 * The two values in the stylesheet that come from the tokens,
 * and the one formula the stylesheet shares with TS.
 * styles.ts interpolates the generated constants; these tests
 * pin the shipped CSS to them, so a hand edit to either side
 * fails here instead of shipping a silent mismatch.
 */
describe('generated token values in the stylesheet', () => {
  it('the nav-menu cap is the generated token value (Proposal)', () => {
    expect(NAV_MENU_MAX_HEIGHT_CSS).toBe('min(50vh, 420px)');
    expect(DEFAULT_CSS).toContain(`--wd-nav-menu-max-height: ${NAV_MENU_MAX_HEIGHT_CSS};`);
    expect(DEFAULT_CSS).toContain(`max-height: var(--wd-nav-menu-max-height, ${NAV_MENU_MAX_HEIGHT_CSS});`);
    // No second, hand-written copy of the value may hide in the CSS.
    expect(DEFAULT_CSS.split('min(50vh, 420px)').length - 1).toBe(2);
  });

  it('the reserve fallback uses the generated space-unit floor', () => {
    expect(SPACE_MIN_PX).toBe(8);
    expect(DEFAULT_CSS).toContain(`--wd-reserve-bottom: calc(var(--wd-control-size) + var(--wd-space, ${SPACE_MIN_PX}px) * 2.5);`);
  });

  it('the TS control-size function matches the CSS clamp at every width', () => {
    // The control size is chrome, not a §8 token: the CSS rule
    // is the source, the TS function is its mirror. Parse the
    // clamp out of the shipped CSS and assert the mirror
    // agrees — so a change to either side without the other
    // fails here.
    const m = /--wd-control-size: clamp\(([0-9.]+)px, ([0-9.]+)vw \+ ([0-9.]+)px, ([0-9.]+)px\);/.exec(DEFAULT_CSS);
    expect(m).not.toBeNull();
    const [, min, vw, px, max] = m!.map(Number);
    const cssSize = (w: number) => Math.min(max, Math.max(min, (vw * w) / 100 + px));
    for (const w of [0, 360, 768, 1024, 1440, 1920, 2560]) {
      expect(controlSizePx(w)).toBeCloseTo(cssSize(w), 5);
    }
  });
});
