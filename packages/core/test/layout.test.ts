import { describe, expect, it } from 'vitest';
import {
  FONT_BODY_MAX_PX,
  columnCount,
  computeLayout,
  estimateScreenHeight,
  fitFontSize,
  spaceUnitPx,
  titleFactor,
} from '../src/layout.js';
import type { LayoutResult } from '../src/types.js';

function layout(width: number, height: number, panels: number, chars = 120, zoom = 0) {
  return computeLayout({
    containerWidth: width,
    containerHeight: height,
    panelCount: panels,
    contentLengths: Array.from({ length: panels }, () => chars),
    zoom,
  });
}

/**
 * Read a `--wd-*` var back as a number. Layout is asserted
 * through the vars (§7.2): the numeric fields the result used
 * to carry are the same numbers, now read from the record the
 * renderer actually consumes.
 */
function varPx(result: LayoutResult, name: string): number {
  return parseFloat(result.vars[name] ?? '');
}

describe('column count (§7.2 reference arrangements)', () => {
  it('3 panels → 3 columns wide, 1 column narrow', () => {
    expect(columnCount(1440, 3)).toBe(3);
    expect(columnCount(360, 3)).toBe(1);
  });

  it('6 panels → 3×2 wide, 2×3 medium, 1×6 narrow', () => {
    expect(columnCount(1440, 6)).toBe(3);
    expect(columnCount(768, 6)).toBe(2);
    expect(columnCount(360, 6)).toBe(1);
  });

  it('never exceeds 3 columns or the panel count', () => {
    expect(columnCount(2560, 8)).toBe(3);
    expect(columnCount(1440, 1)).toBe(1);
    expect(columnCount(1440, 2)).toBe(2);
  });
});

describe('type scale (design-policies §2.2 computed values)', () => {
  it('matches the table at 360 / 768 / 1440', () => {
    // Screen title: 1 panel → 24 / 34.6 / 56; 2–3 → 24 / 32.9 / 53; 4–6 → 24 / 30.4 / 49.3; 7–8 → 24 / 29.4 / 47.6
    expect(varPx(layout(360, 800, 1), '--wd-font-title')).toBeCloseTo(24, 1);
    expect(varPx(layout(768, 800, 1), '--wd-font-title')).toBeCloseTo(34.6, 0);
    expect(varPx(layout(1440, 900, 1), '--wd-font-title')).toBeCloseTo(56, 0);
    expect(varPx(layout(768, 800, 3), '--wd-font-title')).toBeCloseTo(32.9, 0);
    expect(varPx(layout(1440, 900, 3), '--wd-font-title')).toBeCloseTo(53, 0);
    expect(varPx(layout(768, 800, 6), '--wd-font-title')).toBeCloseTo(30.4, 0);
    expect(varPx(layout(1440, 900, 6), '--wd-font-title')).toBeCloseTo(49.3, 0);
    expect(varPx(layout(768, 800, 8), '--wd-font-title')).toBeCloseTo(29.4, 0);
    expect(varPx(layout(1440, 900, 8), '--wd-font-title')).toBeCloseTo(47.6, 0);

    // Panel body is content-fit now (§2.2), not a viewport
    // formula — 120 chars per panel: 1 → 32 / 32 / 32;
    // 2–3 → 24.6 / 30.1 / 32; 4–6 → 15.8 / 22.6 / 31.7;
    // 7–8 → 14 / — / 25.4. Sparse screens grow to the 32px
    // ceiling at every width; only dense screens shrink.
    expect(layout(360, 800, 1).fontBodyPx).toBe(32);
    // The hero tagline is 42 chars: it still fits at the 32px
    // ceiling at desktop and phone widths.
    expect(layout(1440, 900, 1, 42).fontBodyPx).toBe(32);
    expect(layout(360, 800, 1, 42).fontBodyPx).toBe(32);
    expect(layout(768, 800, 1).fontBodyPx).toBe(32);
    expect(layout(1440, 900, 1).fontBodyPx).toBe(32);
    expect(layout(360, 800, 3).fontBodyPx).toBeCloseTo(24.6, 0);
    expect(layout(768, 800, 3).fontBodyPx).toBeCloseTo(30.1, 0);
    expect(layout(1440, 900, 3).fontBodyPx).toBe(32);
    expect(layout(360, 800, 6).fontBodyPx).toBeCloseTo(15.8, 0);
    expect(layout(768, 800, 6).fontBodyPx).toBeCloseTo(22.6, 0);
    expect(layout(1440, 900, 6).fontBodyPx).toBeCloseTo(31.7, 0);
    expect(layout(360, 800, 8).fontBodyPx).toBe(14);
    expect(layout(1440, 900, 8).fontBodyPx).toBeCloseTo(25.4, 0);

    // Code: 14 / 14.4 / 18. Caption: 14 / 14 / 14 (small text
    // is a fixed 14px — its min and max coincide).
    expect(varPx(layout(360, 800, 1), '--wd-font-code')).toBeCloseTo(14, 1);
    expect(varPx(layout(768, 800, 1), '--wd-font-code')).toBeCloseTo(14.4, 0);
    expect(varPx(layout(1440, 900, 1), '--wd-font-code')).toBeCloseTo(18, 1);
    expect(varPx(layout(360, 800, 1), '--wd-font-small')).toBeCloseTo(14, 1);
    expect(varPx(layout(768, 800, 1), '--wd-font-small')).toBeCloseTo(14, 0);
    expect(varPx(layout(1440, 900, 1), '--wd-font-small')).toBeCloseTo(14, 1);
  });

  it('small text is a fixed 14px at every width', () => {
    expect(varPx(layout(360, 800, 1), '--wd-font-small')).toBe(14);
    expect(varPx(layout(768, 800, 1), '--wd-font-small')).toBe(14);
    expect(varPx(layout(1440, 900, 1), '--wd-font-small')).toBe(14);
  });

  it('the title factor scales preferred + ceiling, never the floor', () => {
    expect(titleFactor(1)).toBe(1.0);
    expect(titleFactor(3)).toBe(0.95);
    expect(titleFactor(6)).toBe(0.88);
    expect(titleFactor(8)).toBe(0.85);
    // The body sits at the 14px absolute floor on a dense
    // phone screen: the fit grows a sparse phone screen to
    // the ceiling (1×120 chars → 32px) and only a dense one
    // reaches the floor (8×120 chars → 14px, scrolling).
    expect(layout(360, 800, 1, 120).fontBodyPx).toBe(32);
    expect(layout(360, 800, 8, 120).fontBodyPx).toBe(14);
  });
});

describe('type floor and zoom (§7.3)', () => {
  it('no text renders below the 14px floor, at any width or zoom', () => {
    for (const w of [320, 360, 768, 1440]) {
      for (const n of [1, 3, 6, 8]) {
        for (const z of [-4, 0, 4]) {
          const l = layout(w, 800, n, 120, z);
          for (const size of [l.fontBodyPx, varPx(l, '--wd-font-title'), varPx(l, '--wd-font-code'), varPx(l, '--wd-font-small')]) {
            expect(size).toBeGreaterThanOrEqual(14);
          }
        }
      }
    }
  });

  it('zoom multiplies the computed size and is bounded by the floor below', () => {
    // 1440px, 1 panel, 120 chars: body 32px at zoom 0 → ×1.4641 at +4.
    expect(layout(1440, 900, 1, 120, 4).fontBodyPx).toBeCloseTo(32 * 1.4641, 0);
    // 360px, 1 panel: body 32px at zoom 0, 21.8px zoomed fully
    // out; a dense screen already at the floor stays there
    // when zooming out (zooming in from the floor grows again).
    expect(layout(360, 800, 1, 120, -4).fontBodyPx).toBeCloseTo(21.8, 0);
    expect(layout(360, 800, 8, 900, -4).fontBodyPx).toBe(14);
    expect(layout(360, 800, 8, 900, 0).fontBodyPx).toBe(14);
  });
});

describe('content-fit font sizing (design-policies §2.2)', () => {
  it('a single short panel gets the 32px ceiling', () => {
    // Samir's example: one bullet, ~30 characters → huge.
    // (At zoom 0 the fit is the body size, so fontBodyPx is the
    // fit here; the pre-zoom fit has no var of its own.)
    expect(layout(1440, 900, 1, 30).fontBodyPx).toBe(32);
  });

  it('denser content gets a distinctly smaller size that still fits', () => {
    // Four panels of 200 characters: the fit shrinks well
    // below the ceiling, and the screen still does not scroll.
    const dense = layout(1440, 900, 4, 200);
    expect(dense.fontBodyPx).toBeCloseTo(26.2, 0);
    expect(dense.fontBodyPx).toBeLessThan(32);
  });

  it('very long content bottoms out at the 14px floor', () => {
    const long = layout(360, 640, 8, 900);
    expect(long.fontBodyPx).toBe(14);
  });

  it('more content never yields a larger size', () => {
    const sizes = [30, 120, 400, 900].map((chars) => layout(1440, 900, 4, chars).fontBodyPx);
    expect(sizes).toEqual([32, 31.7, 18.8, 14]);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
  });

  it('the fit honours the ceiling, the floor, and the line-length cap', () => {
    const geo = {
      containerHeight: 900,
      columns: 1,
      columnWidth: 1200,
      screenPadYPx: 35,
      titlePx: 56,
      gapTitlePx: 36,
      padPanelPx: 32,
      gapPanelPx: 28,
    };
    // One short panel fits at the ceiling.
    expect(fitFontSize({ ...geo, contentLengths: [30] })).toBe(32);
    // A wall of text does not fit even at the floor.
    expect(fitFontSize({ ...geo, contentLengths: [20000] })).toBe(14);
    // The estimate never exceeds the container at the fitted size…
    const fit = fitFontSize({ ...geo, contentLengths: [200, 200, 200, 200], columns: 3, columnWidth: 381 });
    expect(estimateScreenHeight({ ...geo, columns: 3, columnWidth: 381, contentLengths: [200, 200, 200, 200], fontBodyPx: fit })).toBeLessThanOrEqual(900);
    // …and one pixel more would not fit (the fit is the largest fitting size, to 0.1px).
    expect(
      estimateScreenHeight({ ...geo, columns: 3, columnWidth: 381, contentLengths: [200, 200, 200, 200], fontBodyPx: fit + 0.2 }),
    ).toBeGreaterThan(900);
    expect(FONT_BODY_MAX_PX).toBe(32);
  });

  it('the fit reserves the bottom controls (§7.2)', () => {
    const geo = {
      containerHeight: 900,
      columns: 1,
      columnWidth: 1200,
      screenPadYPx: 35,
      titlePx: 56,
      gapTitlePx: 36,
      padPanelPx: 32,
      gapPanelPx: 28,
    };
    // 950 characters in one panel fits the full 900px viewport
    // at the 32px ceiling — but not once the controls' height +
    // clearance (64px) is reserved from the available height.
    const noReserve = fitFontSize({ ...geo, contentLengths: [950] });
    expect(noReserve).toBe(32);
    const reserved = fitFontSize({ ...geo, contentLengths: [950], reservedBottomPx: 64 });
    expect(reserved).toBeLessThan(32);
    expect(reserved).toBeGreaterThan(14);
    // The reserved fit really fits the reduced height.
    expect(estimateScreenHeight({ ...geo, contentLengths: [950], fontBodyPx: reserved })).toBeLessThanOrEqual(900 - 64);
    // No reserve is the default: omitting it changes nothing.
    expect(fitFontSize({ ...geo, contentLengths: [950] })).toBe(noReserve);
  });

  it('computeLayout passes the reserve through and reports it', () => {
    const base = { containerWidth: 1440, containerHeight: 900, panelCount: 6, contentLengths: [200, 200, 200, 200, 200, 200] };
    const noReserve = computeLayout(base);
    const reserved = computeLayout({ ...base, reservedBottomPx: 64 });
    expect(reserved.fontBodyPx).toBeLessThan(noReserve.fontBodyPx);
    expect(reserved.vars['--wd-reserve-bottom']).toBe('64px');
    expect(noReserve.vars['--wd-reserve-bottom']).toBe('0px');
  });
});

describe('LayoutResult shape (§7.2)', () => {
  it('returns only columns, fontBodyPx, and vars', () => {
    const result = layout(1440, 900, 3);
    expect(Object.keys(result).sort()).toEqual(['columns', 'fontBodyPx', 'vars']);
  });

  it('columns and fontBodyPx agree with the vars (one representation)', () => {
    for (const w of [200, 360, 768, 1440, 1920]) {
      for (const n of [1, 3, 6, 8]) {
        for (const z of [-4, 0, 4]) {
          const r = layout(w, 900, n, 120, z);
          expect(r.columns).toBe(Number(r.vars['--wd-cols']));
          expect(r.fontBodyPx).toBe(varPx(r, '--wd-font-body'));
        }
      }
    }
  });
});

describe('CSS variables', () => {
  it('emits only layout tokens — no theme vars (issue #75)', () => {
    const light = layout(1440, 900, 3);
    expect(light.vars['--wd-cols']).toBe('3');
    expect(light.vars['--wd-content-max-width']).toBe('1200px');
    expect(light.vars['--wd-image-max-height']).toBe('min(45vh, 420px)');
    expect(light.vars['--wd-font-floor']).toBe('14px');
    // Theme vars live in the renderer's #wd-theme stylesheet
    // layer now (spec §11.2): computeLayout must not emit them,
    // or the layout pass would set them inline on .wd-deck and
    // a deck stylesheet could only override with !important.
    // The values themselves are still pinned — by themeVars()
    // in the renderer (styles.test.ts), not here.
    for (const name of Object.keys(light.vars)) {
      expect(name.startsWith('--wd-color-')).toBe(false);
      expect(name.startsWith('--wd-font-family-')).toBe(false);
    }
  });
});

describe('space unit (design-policies §3.1, C12)', () => {
  it('spaceUnitPx is clamp(8px, 1vw + 4px, 16px)', () => {
    expect(spaceUnitPx(200)).toBe(8); // 2 + 4 floored
    expect(spaceUnitPx(360)).toBe(8); // 3.6 + 4 floored
    expect(spaceUnitPx(768)).toBeCloseTo(11.7, 1); // 7.68 + 4
    expect(spaceUnitPx(1200)).toBe(16); // 12 + 4 capped
    expect(spaceUnitPx(1440)).toBe(16);
    expect(spaceUnitPx(1920)).toBe(16);
  });

  it('computeLayout emits --wd-space equal to spaceUnitPx (no drift)', () => {
    for (const w of [200, 360, 768, 1200, 1440, 1920]) {
      expect(layout(w, 900, 3).vars['--wd-space']).toBe(`${spaceUnitPx(w)}px`);
    }
  });

  it('half the space unit is the bottom-controls clearance (C12)', () => {
    // The renderer's reserve is controls height + space/2:
    // 4px at phone width, 8px at desktop — it scales with
    // the screen instead of a fixed 8px.
    expect(spaceUnitPx(360) / 2).toBe(4);
    expect(spaceUnitPx(1440) / 2).toBe(8);
  });
});
