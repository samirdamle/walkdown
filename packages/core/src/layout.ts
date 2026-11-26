/**
 * Layout engine (spec §7.2, docs/design-policies.md §2–§6).
 *
 * Pure function of (panel count, content lengths, container
 * size) → CSS variables + column count. It measures the
 * container (not necessarily the window — a deck can be
 * embedded), chooses columns and a type scale, and emits
 * layout as CSS variables; CSS does the distribution. No JS
 * measuring per frame. Re-run on resize (Phase 3, via
 * ResizeObserver, debounced), on screen change, and on zoom
 * change — never on step change: the fit is computed once per
 * screen from the TOTAL content of all its panels, and the
 * fitted size is fixed for that screen, so revealing another
 * panel never changes the type size.
 *
 * Body type is content-fit (§2.2): the engine chooses the
 * largest body size whose estimated screen height fits the
 * container, between the 14px floor and the 32px ceiling,
 * after reserving the bottom controls' height plus clearance
 * (see `reservedBottomPx`). The estimate is conservative
 * (average glyph ≈ 0.5em, line-height 1.55); the renderer
 * measures for real and shrinks further if the estimate was
 * optimistic.
 *
 * Degradation (§7.3, §7.5): type never goes below the 14px
 * floor — when even the floor does not fit, the floor wins
 * and the screen scrolls. That is correct behaviour, not a bug.
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
 * Content-fit body ceiling (Proposal, design-policies §2.2/§8):
 * the largest body size the fit may choose. Raised from 20px —
 * 20px is not "huge" for a single short bullet, and the fit
 * needs headroom to grow sparse screens. The ceiling is a
 * proposal, not a settled value.
 */
export const FONT_BODY_MAX_PX = 32;

/** Average glyph width, in em — the estimation constant (§7.4). */
const AVG_CHAR_WIDTH_EM = 0.5;
/** Body line-height used by the estimation (design-policies §2.3). */
const LINE_HEIGHT_BODY = 1.55;

export interface ScreenHeightEstimate {
  fontBodyPx: number;
  /** Plain-text lengths of the panels being fitted (all panels on the screen). */
  contentLengths: number[];
  columns: number;
  columnWidth: number;
  screenPadYPx: number;
  titlePx: number;
  gapTitlePx: number;
  padPanelPx: number;
  gapPanelPx: number;
}

/**
 * Estimated total screen height at a given body size (§7.4):
 * title + one row per row of panels, each panel's height from
 * its content length at that size (average glyph ≈ 0.5em,
 * line-height 1.55). Conservative by design: underestimating
 * would clip, overestimating only scrolls sooner. The
 * renderer measures for real and corrects it.
 */
export function estimateScreenHeight(e: ScreenHeightEstimate): number {
  const charsPerLine = Math.max(10, Math.floor(e.columnWidth / (e.fontBodyPx * AVG_CHAR_WIDTH_EM)));
  const panelHeights = (e.contentLengths.length > 0 ? e.contentLengths : [0]).map((len) => {
    const lines = Math.max(1, Math.ceil(len / charsPerLine));
    return lines * e.fontBodyPx * LINE_HEIGHT_BODY + 2 * e.padPanelPx;
  });
  const rows = Math.ceil(panelHeights.length / e.columns);
  let height = 2 * e.screenPadYPx + e.titlePx * 1.1 + e.gapTitlePx;
  for (let r = 0; r < rows; r++) {
    const rowPanels = panelHeights.slice(r * e.columns, (r + 1) * e.columns);
    height += Math.max(...rowPanels, 0);
    if (r < rows - 1) height += e.gapPanelPx;
  }
  return height;
}

export interface FitFontSizeInput {
  containerHeight: number;
  /** Plain-text lengths of the panels being fitted (all panels on the screen). */
  contentLengths: number[];
  /**
   * Height (CSS px) reserved at the bottom of the screen for the
   * navigation controls plus a small clearance (§7.2). Subtracted
   * from the container height before fitting, so the fitted text
   * never runs underneath the bottom controls. Default 0.
   */
  reservedBottomPx?: number;
  columns: number;
  columnWidth: number;
  screenPadYPx: number;
  titlePx: number;
  gapTitlePx: number;
  padPanelPx: number;
  gapPanelPx: number;
}

/**
 * Content-fit body size (design-policies §2.2): the largest
 * body size in [14px floor, 32px ceiling] whose estimated
 * screen height fits the container — after reserving
 * `reservedBottomPx` at the bottom for the navigation controls
 * plus clearance (§7.2), so the fitted text never runs
 * underneath them. Binary search over a non-decreasing step
 * function — as the size grows, lines only get longer and
 * taller, so the estimate never shrinks. Returns the floor
 * when even the floor does not fit; the caller then scrolls
 * instead of shrinking further.
 */
export function fitFontSize(input: FitFontSizeInput): number {
  const reserved = Math.max(0, input.reservedBottomPx ?? 0);
  const height = Math.max(1, input.containerHeight - reserved);
  const fits = (f: number): boolean =>
    estimateScreenHeight({ ...input, fontBodyPx: f }) <= height;
  // Binary search approaches the boundary from below and never
  // lands on it — so check the ceiling (and the floor) exactly
  // first, and only search the open interval between them.
  if (fits(FONT_BODY_MAX_PX)) return FONT_BODY_MAX_PX;
  if (!fits(FONT_FLOOR_PX)) return FONT_FLOOR_PX;
  let lo = FONT_FLOOR_PX;
  let hi = FONT_BODY_MAX_PX;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  // Round DOWN: the estimate is a step function (a 0.1px rise
  // can drop a character per line and add a whole line), so
  // rounding up could land on a size that no longer fits.
  return Math.floor(lo * 10) / 10;
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

/** Round *down* to one decimal — used for the fitted body size, so rounding can never push it over a line-count cliff the binary search just found. */
function floor1(n: number): number {
  return Math.floor(n * 10) / 10;
}

function px(n: number): string {
  return `${round1(n)}px`;
}

/**
 * Base spacing unit (design-policies §3.1, `--wd-space`):
 * `clamp(8px, 1vw + 4px, 16px)` — the unit every other
 * spacing value is a multiple of, including the bottom-controls
 * clearance (half a space unit, C12). The bottom reserve
 * itself lives in `reserve.ts` (`bottomReservePx`), which
 * reads this function — the renderer never computes the
 * clearance directly.
 */
export function spaceUnitPx(containerWidth: number): number {
  return round1(clampPx(8, containerWidth / 100 + 4, 16));
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const width = Math.max(1, input.containerWidth);
  const height = Math.max(1, input.containerHeight);
  const panelCount = Math.max(1, input.panelCount);
  const zoom = input.zoom ?? 0;
  const theme = input.theme ?? 'light';
  const vw = width / 100;
  const vh = height / 100;

  const tf = titleFactor(panelCount);

  // Type scale (§2.1/§2.2): the title keeps its viewport
  // clamp (the title factor scales preferred + ceiling, never
  // the floor); the body is content-fit — the largest size
  // that fits the screen's TOTAL content, 14px floor to 32px
  // ceiling, after reserving the bottom controls' height plus
  // clearance. Zoom multiplies the computed size after the fit
  // (§2.4), then the absolute 14px floor applies — zooming out
  // can never take text below 14px.
  const reserved = Math.max(0, input.reservedBottomPx ?? 0);
  const applyZoom = (size: number): number => Math.max(FONT_FLOOR_PX, size * zoomFactor(zoom));
  const titleBasePx = clampPx(24, (3.2 * vw + 10) * tf, 56 * tf);
  const fontTitlePx = round1(applyZoom(titleBasePx));
  const fontCodePx = round1(applyZoom(clampPx(14, 1.1 * vw + 6, 18)));
  // Small text is a fixed 14px: the floor raise makes its min
  // and max coincide, so the old `0.85vw + 7px` preferred term
  // can never apply — it is gone, not clamped. Zoom still
  // multiplies it (and the floor still bounds it below).
  const fontSmallPx = round1(applyZoom(14));

  const columns = columnCount(width, panelCount);

  const gapPanelPx = round1(clampPx(12, 2 * vw + 4, 28));
  const padPanelPx = round1(clampPx(16, 2 * vw + 8, 32));
  const spacePx = spaceUnitPx(width);
  const gapTitlePx = round1(clampPx(16, 2.5 * vw + 6, 36));
  const radiusPx = round1(clampPx(RADIUS_MIN_PX, 0.8 * vw + 4, RADIUS_MAX_PX));
  const screenPadXPx = round1(clampPx(16, 4 * vw + 4, 48));
  const screenPadYPx = round1(clampPx(16, 3 * vh + 8, 48));

  const contentWidth = Math.min(width - 2 * screenPadXPx, CONTENT_MAX_WIDTH_PX);
  const columnWidth = Math.max(1, (contentWidth - (columns - 1) * gapPanelPx) / columns);

  // Content-fit body size (§2.2): the fit runs on ALL panels'
  // lengths (the renderer passes the whole screen's content),
  // so the fitted size is fixed for the screen across steps —
  // revealing another panel never changes the type. Columns
  // come from the total panel count, so the grid — and every
  // visible panel's position in it — stays put across steps.
  const fitBodyPx = fitFontSize({
    containerHeight: height,
    reservedBottomPx: reserved,
    contentLengths: input.contentLengths,
    columns,
    columnWidth,
    screenPadYPx,
    titlePx: titleBasePx,
    gapTitlePx,
    padPanelPx,
    gapPanelPx,
  });
  const fontBodyPx = floor1(applyZoom(fitBodyPx));

  const vars: Record<string, string> = {
    ...themeVars(theme),
    '--wd-cols': String(columns),
    '--wd-font-body': px(fontBodyPx),
    '--wd-font-title': px(fontTitlePx),
    '--wd-font-code': px(fontCodePx),
    '--wd-font-small': px(fontSmallPx),
    '--wd-font-floor': px(FONT_FLOOR_PX),
    '--wd-line-height-body': String(LINE_HEIGHT_BODY),
    '--wd-line-height-title': '1.1',
    '--wd-space': px(spacePx),
    '--wd-space-screen-x': px(screenPadXPx),
    '--wd-space-screen-y': px(screenPadYPx),
    '--wd-gap-panel': px(gapPanelPx),
    '--wd-gap-title': px(gapTitlePx),
    '--wd-reserve-bottom': px(reserved),
    '--wd-pad-panel': px(padPanelPx),
    '--wd-radius-panel': px(radiusPx),
    '--wd-content-max-width': px(CONTENT_MAX_WIDTH_PX),
    '--wd-hero-max-width': px(HERO_MAX_WIDTH_PX),
    '--wd-hero-min-height': `clamp(${HERO_MIN_HEIGHT_PX}px, ${HERO_MIN_HEIGHT_VH}vh, ${HERO_MAX_HEIGHT_PX}px)`,
    '--wd-image-max-height': `min(${IMAGE_MAX_HEIGHT_VH}vh, ${IMAGE_MAX_HEIGHT_PX}px)`,
  };

  return {
    columns,
    fontBodyPx,
    vars,
  };
}
