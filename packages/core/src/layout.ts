/**
 * Layout engine (spec §7.2, docs/design-policies.md §2–§6).
 *
 * Pure function of (panel count, content lengths, container
 * size) → CSS variables + column count. It measures the
 * container (not necessarily the window — a deck can be
 * embedded), chooses columns and a type scale, and emits
 * layout as CSS variables; CSS does the distribution. No JS
 * measuring per frame. Re-run on resize (Phase 3, via
 * ResizeObserver, debounced).
 *
 * Degradation (§7.3, §7.5): type never goes below the 12px
 * floor — when the scaled ceiling falls below the floor, the
 * floor wins and the screen scrolls sooner. That is correct
 * behaviour, not a bug.
 */
import {
  COLS_MAX,
  CONTENT_MAX_WIDTH_PX,
  FONT_FLOOR_PX,
  HERO_MAX_HEIGHT_PX,
  HERO_MAX_WIDTH_PX,
  HERO_MIN_HEIGHT_PX,
  HERO_MIN_HEIGHT_VH,
  IMAGE_MAX_HEIGHT_PX,
  IMAGE_MAX_HEIGHT_VH,
  PANEL_MIN_WIDTH_PX,
  RADIUS_MAX_PX,
  RADIUS_MIN_PX,
  themeVars,
} from './tokens.js';
import { zoomFactor } from './model.js';
import type { LayoutInput, LayoutResult } from './types.js';

export function clampPx(min: number, preferred: number, max: number): number {
  return Math.min(max, Math.max(min, preferred));
}

/**
 * Panel-count factor (design-policies §2.1): more panels, less
 * room per panel, smaller type. Scales the preferred term and
 * the ceiling, never the floor.
 */
export function countFactor(panelCount: number): number {
  if (panelCount <= 1) return 1.0;
  if (panelCount <= 3) return 0.92;
  if (panelCount <= 6) return 0.84;
  return 0.78;
}

/** Title factor (§2.1): the title shrinks less than body text — it is one line shared by all panels. */
export function titleFactor(panelCount: number): number {
  if (panelCount <= 1) return 1.0;
  if (panelCount <= 3) return 0.95;
  if (panelCount <= 6) return 0.88;
  return 0.85;
}

/**
 * Column count (§7.2): the largest c such that each column stays
 * above the minimum readable width (260px), capped at 3 and at
 * the panel count. This reproduces the reference arrangements:
 * 3 panels → 3 columns wide, 1 column narrow; 6 panels → 3×2
 * wide, 2×3 medium, 1×6 narrow.
 */
export function columnCount(containerWidth: number, panelCount: number): number {
  const max = Math.min(COLS_MAX, Math.max(1, panelCount));
  for (let c = max; c >= 1; c--) {
    if (containerWidth / c >= PANEL_MIN_WIDTH_PX) return c;
  }
  return 1;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function px(n: number): string {
  return `${round1(n)}px`;
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const width = Math.max(1, input.containerWidth);
  const height = Math.max(1, input.containerHeight);
  const panelCount = Math.max(1, input.panelCount);
  const zoom = input.zoom ?? 0;
  const theme = input.theme ?? 'light';
  const vw = width / 100;
  const vh = height / 100;

  const cf = countFactor(panelCount);
  const tf = titleFactor(panelCount);

  // Type scale (§2.1): the factor scales preferred + ceiling, never the floor.
  // Zoom multiplies the computed size after the clamp (§2.4),
  // then the absolute 12px floor applies — zooming out can never take text below 12px.
  const applyZoom = (size: number): number => Math.max(FONT_FLOOR_PX, size * zoomFactor(zoom));
  const fontBodyPx = round1(applyZoom(clampPx(14, (1.25 * vw + 7) * cf, 20 * cf)));
  const fontTitlePx = round1(applyZoom(clampPx(24, (3.2 * vw + 10) * tf, 56 * tf)));
  const fontCodePx = round1(applyZoom(clampPx(13, 1.1 * vw + 6, 18)));
  const fontSmallPx = round1(applyZoom(clampPx(12, 0.85 * vw + 7, 14)));

  const columns = columnCount(width, panelCount);
  const rows = Math.ceil(panelCount / columns);

  const gapPanelPx = round1(clampPx(12, 2 * vw + 4, 28));
  const padPanelPx = round1(clampPx(16, 2 * vw + 8, 32));
  const spacePx = round1(clampPx(8, 1 * vw + 4, 16));
  const gapTitlePx = round1(clampPx(16, 2.5 * vw + 6, 36));
  const radiusPx = round1(clampPx(RADIUS_MIN_PX, 0.8 * vw + 4, RADIUS_MAX_PX));
  const screenPadXPx = round1(clampPx(16, 4 * vw + 4, 48));
  const screenPadYPx = round1(clampPx(16, 3 * vh + 8, 48));

  const contentWidth = Math.min(width - 2 * screenPadXPx, CONTENT_MAX_WIDTH_PX);
  const columnWidth = Math.max(1, (contentWidth - (columns - 1) * gapPanelPx) / columns);

  // Scroll estimation (§7.4): estimate each panel's height from
  // its content length at the computed body size (average glyph
  // ≈ 0.5em wide, line-height 1.55). A heuristic — the renderer
  // measures for real in Phase 3 — but it must be conservative:
  // underestimating would clip, overestimating only scrolls sooner.
  const lineHeightBody = 1.55;
  const charsPerLine = Math.max(10, Math.floor(columnWidth / (fontBodyPx * 0.5)));
  const panelHeights = (input.contentLengths.length > 0 ? input.contentLengths : [0]).map((len) => {
    const lines = Math.max(1, Math.ceil(len / charsPerLine));
    return lines * fontBodyPx * lineHeightBody + 2 * padPanelPx;
  });
  let estimatedHeight = 2 * screenPadYPx + fontTitlePx * 1.1 + gapTitlePx;
  for (let r = 0; r < rows; r++) {
    const rowPanels = panelHeights.slice(r * columns, (r + 1) * columns);
    estimatedHeight += Math.max(...rowPanels, 0);
    if (r < rows - 1) estimatedHeight += gapPanelPx;
  }
  const scroll = estimatedHeight > height;

  const vars: Record<string, string> = {
    ...themeVars(theme),
    '--wd-cols': String(columns),
    '--wd-font-body': px(fontBodyPx),
    '--wd-font-title': px(fontTitlePx),
    '--wd-font-code': px(fontCodePx),
    '--wd-font-small': px(fontSmallPx),
    '--wd-font-floor': px(FONT_FLOOR_PX),
    '--wd-line-height-body': String(lineHeightBody),
    '--wd-line-height-title': '1.1',
    '--wd-space': px(spacePx),
    '--wd-space-screen-x': px(screenPadXPx),
    '--wd-space-screen-y': px(screenPadYPx),
    '--wd-gap-panel': px(gapPanelPx),
    '--wd-gap-title': px(gapTitlePx),
    '--wd-pad-panel': px(padPanelPx),
    '--wd-radius-panel': px(radiusPx),
    '--wd-content-max-width': px(CONTENT_MAX_WIDTH_PX),
    '--wd-hero-max-width': px(HERO_MAX_WIDTH_PX),
    '--wd-hero-min-height': `clamp(${HERO_MIN_HEIGHT_PX}px, ${HERO_MIN_HEIGHT_VH}vh, ${HERO_MAX_HEIGHT_PX}px)`,
    '--wd-image-max-height': `min(${IMAGE_MAX_HEIGHT_VH}vh, ${IMAGE_MAX_HEIGHT_PX}px)`,
  };

  return {
    columns,
    rows,
    fontBodyPx,
    fontTitlePx,
    fontCodePx,
    fontSmallPx,
    gapPanelPx,
    padPanelPx,
    scroll,
    vars,
  };
}
