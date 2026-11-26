/**
 * Token constants, generated from `policies/design-tokens.json`
 * (schema `walkdown.design-tokens/v1`) — the JSON is the single
 * source of truth. The values live in
 * `tokens.generated.ts` (run `npm run tokens` to regenerate
 * after a JSON change); this module is the hand-written facade
 * over it: it keeps the import paths every other module uses,
 * holds the two values that are NOT tokens (the root font size
 * from design-policies §9), and defines `themeVars()`.
 *
 * If a token value changes, change the JSON, re-run
 * `npm run tokens`, and commit the regenerated file in the same
 * PR (the sync rule in `policies/README.md`). Never edit a
 * value in `tokens.generated.ts` by hand — `tokens.test.ts`
 * fails if it differs from a fresh regeneration.
 */
export * from './tokens.generated.js';
import { COLORS, FONT_FAMILY_BODY, FONT_FAMILY_CODE, FONT_FAMILY_TITLE } from './tokens.generated.js';
import type { Theme } from './types.js';

/** Root font size (settled, design-policies §9) — not a §8 token, so it stays hand-written here. */
export const ROOT_FONT_PX = 16;

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
