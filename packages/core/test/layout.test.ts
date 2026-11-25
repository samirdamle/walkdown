import { describe, expect, it } from 'vitest';
import {
  FONT_BODY_MAX_PX,
  columnCount,
  computeLayout,
  countFactor,
  estimateScreenHeight,
  fitFontSize,
  titleFactor,
} from '../src/layout.js';

function layout(width: number, height: number, panels: number, chars = 120, zoom = 0) {
  return computeLayout({
    containerWidth: width,
    containerHeight: height,
    panelCount: panels,
    contentLengths: Array.from({ length: panels }, () => chars),
    zoom,
  });
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
    expect(layout(360, 800, 1).fontTitlePx).toBeCloseTo(24, 1);
    expect(layout(768, 800, 1).fontTitlePx).toBeCloseTo(34.6, 0);
    expect(layout(1440, 900, 1).fontTitlePx).toBeCloseTo(56, 0);
    expect(layout(768, 800, 3).fontTitlePx).toBeCloseTo(32.9, 0);
    expect(layout(1440, 900, 3).fontTitlePx).toBeCloseTo(53, 0);
    expect(layout(768, 800, 6).fontTitlePx).toBeCloseTo(30.4, 0);
    expect(layout(1440, 900, 6).fontTitlePx).toBeCloseTo(49.3, 0);
    expect(layout(768, 800, 8).fontTitlePx).toBeCloseTo(29.4, 0);
    expect(layout(1440, 900, 8).fontTitlePx).toBeCloseTo(47.6, 0);

    // Panel body is content-fit now (§2.2), not a viewport
    // formula — 120 chars per panel: 1 → 32 / 32 / 32;
    // 2–3 → 24.6 / 30.1 / 32; 4–6 → 15.8 / 22.6 / 31.7;
    // 7–8 → 12 / — / 25.4. Sparse screens grow to the 32px
    // ceiling at every width; only dense screens shrink.
    expect(layout(360, 800, 1).fontBodyPx).toBe(32);
    expect(layout(768, 800, 1).fontBodyPx).toBe(32);
    expect(layout(1440, 900, 1).fontBodyPx).toBe(32);
    expect(layout(360, 800, 3).fontBodyPx).toBeCloseTo(24.6, 0);
    expect(layout(768, 800, 3).fontBodyPx).toBeCloseTo(30.1, 0);
    expect(layout(1440, 900, 3).fontBodyPx).toBe(32);
    expect(layout(360, 800, 6).fontBodyPx).toBeCloseTo(15.8, 0);
    expect(layout(768, 800, 6).fontBodyPx).toBeCloseTo(22.6, 0);
    expect(layout(1440, 900, 6).fontBodyPx).toBeCloseTo(31.7, 0);
    expect(layout(360, 800, 8).fontBodyPx).toBe(12);
    expect(layout(1440, 900, 8).fontBodyPx).toBeCloseTo(25.4, 0);

    // Code: 13 / 14.4 / 18. Caption: 12 / 13.5 / 14.
    expect(layout(360, 800, 1).fontCodePx).toBeCloseTo(13, 1);
    expect(layout(768, 800, 1).fontCodePx).toBeCloseTo(14.4, 0);
    expect(layout(1440, 900, 1).fontCodePx).toBeCloseTo(18, 1);
    expect(layout(360, 800, 1).fontSmallPx).toBeCloseTo(12, 1);
    expect(layout(768, 800, 1).fontSmallPx).toBeCloseTo(13.5, 0);
    expect(layout(1440, 900, 1).fontSmallPx).toBeCloseTo(14, 1);
  });

  it('the count/title factors scale preferred + ceiling, never the floor', () => {
    expect(countFactor(1)).toBe(1.0);
    expect(countFactor(3)).toBe(0.92);
    expect(countFactor(6)).toBe(0.84);
    expect(countFactor(8)).toBe(0.78);
    expect(titleFactor(1)).toBe(1.0);
    expect(titleFactor(3)).toBe(0.95);
    expect(titleFactor(6)).toBe(0.88);
    expect(titleFactor(8)).toBe(0.85);
    // The body no longer sits at a 14px floor on a phone: the
    // fit grows a sparse phone screen to the ceiling (1×120
    // chars → 32px) and only a dense one reaches the floor
    // (8×120 chars → 12px, scrolling).
    expect(layout(360, 800, 1, 120).fontBodyPx).toBe(32);
    expect(layout(360, 800, 8, 120).fontBodyPx).toBe(12);
  });
});

describe('type floor and zoom (§7.3)', () => {
  it('no text renders below the 12px floor, at any width or zoom', () => {
    for (const w of [320, 360, 768, 1440]) {
      for (const n of [1, 3, 6, 8]) {
        for (const z of [-4, 0, 4]) {
          const l = layout(w, 800, n, 120, z);
          for (const size of [l.fontBodyPx, l.fontTitlePx, l.fontCodePx, l.fontSmallPx]) {
            expect(size).toBeGreaterThanOrEqual(12);
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
    expect(layout(360, 800, 8, 900, -4).fontBodyPx).toBe(12);
    expect(layout(360, 800, 8, 900, 0).fontBodyPx).toBe(12);
  });
});

describe('content-fit font sizing (design-policies §2.2)', () => {
  it('a single short panel gets the 32px ceiling', () => {
    // Samir's example: one bullet, ~30 characters → huge.
    expect(layout(1440, 900, 1, 30).fontBodyPx).toBe(32);
    expect(layout(1440, 900, 1, 30).fitFontBodyPx).toBe(32);
    expect(layout(1440, 900, 1, 30).scroll).toBe(false);
  });

  it('denser content gets a distinctly smaller size that still fits', () => {
    // Four panels of 200 characters: the fit shrinks well
    // below the ceiling, and the screen still does not scroll.
    const dense = layout(1440, 900, 4, 200);
    expect(dense.fontBodyPx).toBeCloseTo(26.2, 0);
    expect(dense.fontBodyPx).toBeLessThan(32);
    expect(dense.scroll).toBe(false);
  });

  it('very long content bottoms out at the 12px floor and scrolls', () => {
    const long = layout(360, 640, 8, 900);
    expect(long.fontBodyPx).toBe(12);
    expect(long.fitFontBodyPx).toBe(12);
    expect(long.scroll).toBe(true);
  });

  it('more content never yields a larger size', () => {
    const sizes = [30, 120, 400, 900].map((chars) => layout(1440, 900, 4, chars).fontBodyPx);
    expect(sizes).toEqual([32, 31.7, 18.8, 12.5]);
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
    expect(fitFontSize({ ...geo, contentLengths: [20000] })).toBe(12);
    // The estimate never exceeds the container at the fitted size…
    const fit = fitFontSize({ ...geo, contentLengths: [200, 200, 200, 200], columns: 3, columnWidth: 381 });
    expect(estimateScreenHeight({ ...geo, columns: 3, columnWidth: 381, contentLengths: [200, 200, 200, 200], fontBodyPx: fit })).toBeLessThanOrEqual(900);
    // …and one pixel more would not fit (the fit is the largest fitting size, to 0.1px).
    expect(
      estimateScreenHeight({ ...geo, columns: 3, columnWidth: 381, contentLengths: [200, 200, 200, 200], fontBodyPx: fit + 0.2 }),
    ).toBeGreaterThan(900);
    expect(FONT_BODY_MAX_PX).toBe(32);
  });
});

describe('scroll (§7.4)', () => {
  it('a long screen scrolls internally on a phone', () => {
    const long = layout(360, 640, 8, 900);
    expect(long.scroll).toBe(true);
    expect(long.columns).toBe(1);
  });

  it('a short screen does not scroll on a desktop', () => {
    const short = layout(1440, 900, 3, 60);
    expect(short.scroll).toBe(false);
  });
});

describe('CSS variables', () => {
  it('emits the settled theme tokens and the layout tokens', () => {
    const light = layout(1440, 900, 3);
    expect(light.vars['--wd-cols']).toBe('3');
    expect(light.vars['--wd-color-bg']).toBe('#FAFAF7');
    expect(light.vars['--wd-color-ink']).toBe('#1B1B18');
    expect(light.vars['--wd-color-accent']).toBe('#B45309');
    expect(light.vars['--wd-font-family-body']).toContain('system-ui');
    expect(light.vars['--wd-font-family-title']).toContain('Georgia');
    expect(light.vars['--wd-content-max-width']).toBe('1200px');
    expect(light.vars['--wd-image-max-height']).toBe('min(45vh, 420px)');
    expect(light.vars['--wd-font-floor']).toBe('12px');

    const dark = computeLayout({
      containerWidth: 1440,
      containerHeight: 900,
      panelCount: 3,
      contentLengths: [60, 60, 60],
      theme: 'dark',
    });
    expect(dark.vars['--wd-color-bg']).toBe('#18181C');
    expect(dark.vars['--wd-color-ink']).toBe('#F5F5F0');
    expect(dark.vars['--wd-color-accent']).toBe('#F0D45D');
  });
});
