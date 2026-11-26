/**
 * Settled design-token values, from `policies/design-tokens.json`
 * (schema `walkdown.design-tokens/v1`). The layout engine
 * consumes these as CSS custom properties on `.wd-deck`.
 * The JSON file is the source of truth; this module is the
 * code-side mirror of its *settled* tokens. If a token value
 * changes, change §8 of `docs/design-policies.md` first, then
 * the JSON in the same PR (the sync rule in `policies/README.md`),
 * then this file.
 */
import type { Theme } from './types.js';

export const FONT_FAMILY_BODY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const FONT_FAMILY_TITLE =
  'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif';
export const FONT_FAMILY_CODE =
  'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace';

export interface ColorSet {
  bg: string;
  panel: string;
  ink: string;
  muted: string;
  border: string;
  accent: string;
}

/** Colours — settled 2026-11-25; accent re-settled ocean green 2026-11-26 (Samir's choice), contrast ratios verified (see policies/design-tokens.json). */
export const COLORS: Record<Theme, ColorSet> = {
  light: {
    bg: '#FAFAF7',
    panel: '#FFFFFF',
    ink: '#1B1B18', // 16.5:1 on bg — AAA
    muted: '#5C5C57', // 6.4:1 on bg — AA, secondary text only, never body
    border: '#E5E5DF',
    accent: '#2E7D6B', // 4.7:1 on bg — AA (4.9:1 on panel)
  },
  dark: {
    bg: '#18181C',
    panel: '#202024',
    ink: '#F5F5F0', // 16.2:1 on bg — AAA
    muted: '#A9A9A0', // 7.5:1 on bg — AAA
    border: '#2E2E33',
    accent: '#7FC8B8', // 9.2:1 on bg — AAA (8.4:1 on panel)
  },
};

/** Absolute type floor (settled, Samir's decision 2026-11-26 superseding brief §15.6's 12px / spec §7.3): no text renders below this anywhere. */
export const FONT_FLOOR_PX = 14;
/** Root font size (settled, design-policies §9). */
export const ROOT_FONT_PX = 16;
/** Zoom: one step is ×1.1, bounded at ±4 steps (settled, spec §7.3). */
export const ZOOM_STEP = 1.1;
export const ZOOM_MIN_STEPS = -4;
export const ZOOM_MAX_STEPS = 4;
/** Maximum screen content width (settled). */
export const CONTENT_MAX_WIDTH_PX = 1200;
/** Maximum columns (settled). */
export const COLS_MAX = 3;
/** Minimum column width — preferred 260px (a column narrower than this cannot hold 30ch of 14px text). */
export const PANEL_MIN_WIDTH_PX = 260;
/** Image max-height: min(45vh, 420px) (settled). */
export const IMAGE_MAX_HEIGHT_VH = 45;
export const IMAGE_MAX_HEIGHT_PX = 420;
/** Hero panel: max-width 720px, min-height clamp(240px, 45vh, 520px) (settled). */
export const HERO_MAX_WIDTH_PX = 720;
export const HERO_MIN_HEIGHT_PX = 240;
export const HERO_MIN_HEIGHT_VH = 45;
export const HERO_MAX_HEIGHT_PX = 520;
/** Panel corner radius clamp(8px, 0.8vw + 4px, 18px) (settled). */
export const RADIUS_MIN_PX = 8;
export const RADIUS_MAX_PX = 18;
/** Line lengths (settled): hero / single column 45–75ch, ideal 60; multi-column panel ≥30ch. */
export const LINE_LENGTH_MIN_CH = 45;
export const LINE_LENGTH_IDEAL_CH = 60;
export const LINE_LENGTH_MAX_CH = 75;
export const LINE_LENGTH_PANEL_MIN_CH = 30;

/** Theme CSS variables for `.wd-deck` — the settled font/colour tokens. */
export function themeVars(theme: Theme): Record<string, string> {
  const c = COLORS[theme];
  return {
    '--wd-font-family-body': FONT_FAMILY_BODY,
    '--wd-font-family-title': FONT_FAMILY_TITLE,
    '--wd-font-family-code': FONT_FAMILY_CODE,
    '--wd-color-bg': c.bg,
    '--wd-color-panel': c.panel,
    '--wd-color-ink': c.ink,
    '--wd-color-muted': c.muted,
    '--wd-color-border': c.border,
    '--wd-color-accent': c.accent,
  };
}
