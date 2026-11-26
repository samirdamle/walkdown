import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COLORS,
  CONTENT_MAX_WIDTH_PX,
  FONT_BODY_MAX_PX,
  FONT_CODE_MAX_PX,
  FONT_CODE_MIN_PX,
  FONT_CODE_PX,
  FONT_CODE_VW,
  FONT_FAMILY_BODY,
  FONT_FAMILY_CODE,
  FONT_FAMILY_TITLE,
  FONT_FLOOR_PX,
  FONT_SMALL_PX,
  FONT_TITLE_MAX_PX,
  FONT_TITLE_MIN_PX,
  FONT_TITLE_PX,
  FONT_TITLE_VW,
  GAP_PANEL_MAX_PX,
  GAP_PANEL_MIN_PX,
  GAP_PANEL_PX,
  GAP_PANEL_VW,
  GAP_TITLE_MAX_PX,
  GAP_TITLE_MIN_PX,
  GAP_TITLE_PX,
  GAP_TITLE_VW,
  HERO_MAX_HEIGHT_PX,
  HERO_MAX_WIDTH_PX,
  HERO_MIN_HEIGHT_PX,
  HERO_MIN_HEIGHT_VH,
  IMAGE_MAX_HEIGHT_PX,
  IMAGE_MAX_HEIGHT_VH,
  LINE_HEIGHT_BODY,
  LINE_HEIGHT_TITLE,
  LINE_LENGTH_IDEAL_CH,
  LINE_LENGTH_MAX_CH,
  LINE_LENGTH_MIN_CH,
  LINE_LENGTH_PANEL_MIN_CH,
  NAV_MENU_MAX_HEIGHT_CSS,
  PAD_PANEL_MAX_PX,
  PAD_PANEL_MIN_PX,
  PAD_PANEL_PX,
  PAD_PANEL_VW,
  PANEL_MIN_WIDTH_PX,
  PROPOSAL_TOKENS,
  RADIUS_MAX_PX,
  RADIUS_MIN_PX,
  RADIUS_PX,
  RADIUS_VW,
  COLS_MAX,
  SPACE_MAX_PX,
  SPACE_MIN_PX,
  SPACE_PX,
  SPACE_SCREEN_X_MAX_PX,
  SPACE_SCREEN_X_MIN_PX,
  SPACE_SCREEN_X_PX,
  SPACE_SCREEN_X_VW,
  SPACE_SCREEN_Y_MAX_PX,
  SPACE_SCREEN_Y_MIN_PX,
  SPACE_SCREEN_Y_PX,
  SPACE_SCREEN_Y_VH,
  SPACE_VW,
  TOKEN_META,
  ZOOM_MAX_STEPS,
  ZOOM_MIN_STEPS,
  ZOOM_STEP,
} from '../src/tokens.generated.js';
import { generateTokens, loadTokens, parseFormula } from '../../../scripts/generate-tokens.mjs';

const GENERATED_PATH = new URL('../src/tokens.generated.ts', import.meta.url);
const SECTION_8_PATH = new URL('../../../docs/design-policies.md', import.meta.url);

/**
 * One token source: the JSON is the truth, the generated file is
 * its mirror, and §8 is its human-readable form. These tests are
 * the drift net — a token change that does not regenerate, or a
 * §8/JSON disagreement, fails here instead of shipping silently.
 */
describe('one token source', () => {
  it('the checked-in generated file equals a fresh regeneration (no drift)', () => {
    const json = loadTokens();
    expect(Object.keys(TOKEN_META)).toHaveLength(json.tokens.length);
    expect(generateTokens(json)).toBe(readFileSync(GENERATED_PATH, 'utf8'));
  });

  it('the JSON and §8 agree: 27 §8 rows + 9 font/colour tokens = 36', () => {
    const json = loadTokens();
    const doc = readFileSync(SECTION_8_PATH, 'utf8');
    const sec8 = doc.split('## 8.')[1].split('## 9.')[0];
    const rows = sec8.split('\n').filter((l) => l.startsWith('| `--wd-'));
    // The old count note said 26 rows / 35 total — the table
    // actually has 27 rows (it gained one without the note
    // being updated). This test locks the true count.
    expect(rows).toHaveLength(27);
    const section8 = new Map<string, { min: string; max: string; units: string; status: string; pref: string }>();
    for (const row of rows) {
      const cells = row
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        // Strip backticks and bold markers — but not a bare `*`
        // inside a value (`env(safe-area-inset-*)` keeps its own).
        .map((c) => c.trim().replace(/`/g, '').replace(/\*\*/g, ''));
      section8.set(cells[0], { min: cells[2], pref: cells[3], max: cells[4], units: cells[5], status: cells[6] });
    }
    expect(json.token_count).toBe(36);
    expect(json.tokens).toHaveLength(36);
    const fontColour = [
      '--wd-color-accent',
      '--wd-color-bg',
      '--wd-color-border',
      '--wd-color-ink',
      '--wd-color-muted',
      '--wd-color-panel',
      '--wd-font-family-body',
      '--wd-font-family-code',
      '--wd-font-family-title',
    ];
    for (const t of json.tokens) {
      if (fontColour.includes(t.name)) {
        // The palette and font stacks live only in the JSON +
        // policies/README.md — §8 holds no colour values.
        expect(section8.has(t.name)).toBe(false);
        continue;
      }
      const row = section8.get(t.name);
      expect(row, `${t.name} is in the JSON but not in §8`).toBeDefined();
      const norm = (v: string | null) => (v === null ? '—' : v.replace(/`/g, '').trim());
      expect(norm(t.min)).toBe(norm(row!.min));
      expect(norm(t.max)).toBe(norm(row!.max));
      expect(t.units.join(' / ')).toBe(row!.units);
      const status8 = row!.status.startsWith('Settled') ? 'settled' : 'proposal';
      expect(t.status).toBe(status8);
      // Preferred: only formula preferreds are comparable
      // exactly (the body preferred is prose in both places,
      // worded differently — same meaning, not a formula).
      const parses = (() => {
        try {
          parseFormula(String(t.preferred ?? '').replace(/\s+×\s*title factor\s*$/, ''), t.name);
          return true;
        } catch {
          return false;
        }
      })();
      if (parses && t.preferred !== null) {
        expect(norm(t.preferred).replace(/\s+× title factor$/, '')).toBe(
          norm(row!.pref).replace(/\s+× title factor$/, ''),
        );
      }
    }
    for (const name of section8.keys()) {
      expect(json.tokens.some((t: { name: string }) => t.name === name)).toBe(true);
    }
  });

  it('generated constants equal the hand-written values from main (no silent change)', () => {
    // Snapshot of the literals in tokens.ts + layout.ts on main
    // 1424d88, before generation. If a token changes on
    // purpose, update the JSON, regenerate, and update this
    // table in the same PR — a change here must be deliberate.
    expect(FONT_FAMILY_BODY).toBe(
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    );
    expect(FONT_FAMILY_TITLE).toBe(
      'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
    );
    expect(FONT_FAMILY_CODE).toBe('ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace');
    expect(COLORS).toEqual({
      light: { bg: '#FAFAF7', panel: '#FFFFFF', ink: '#1B1B18', muted: '#5C5C57', border: '#E5E5DF', accent: '#2E7D6B' },
      dark: { bg: '#18181C', panel: '#202024', ink: '#F5F5F0', muted: '#A9A9A0', border: '#2E2E33', accent: '#7FC8B8' },
    });
    expect(FONT_FLOOR_PX).toBe(14);
    expect(ZOOM_STEP).toBe(1.1);
    expect(ZOOM_MIN_STEPS).toBe(-4);
    expect(ZOOM_MAX_STEPS).toBe(4);
    expect(FONT_BODY_MAX_PX).toBe(32);
    expect([FONT_TITLE_MIN_PX, FONT_TITLE_VW, FONT_TITLE_PX, FONT_TITLE_MAX_PX]).toEqual([24, 3.2, 10, 56]);
    expect([FONT_CODE_MIN_PX, FONT_CODE_VW, FONT_CODE_PX, FONT_CODE_MAX_PX]).toEqual([14, 1.1, 6, 18]);
    expect(FONT_SMALL_PX).toBe(14);
    expect(LINE_HEIGHT_BODY).toBe(1.55);
    expect(LINE_HEIGHT_TITLE).toBe(1.1);
    expect([SPACE_MIN_PX, SPACE_VW, SPACE_PX, SPACE_MAX_PX]).toEqual([8, 1, 4, 16]);
    expect([SPACE_SCREEN_X_MIN_PX, SPACE_SCREEN_X_VW, SPACE_SCREEN_X_PX, SPACE_SCREEN_X_MAX_PX]).toEqual([16, 4, 4, 48]);
    expect([SPACE_SCREEN_Y_MIN_PX, SPACE_SCREEN_Y_VH, SPACE_SCREEN_Y_PX, SPACE_SCREEN_Y_MAX_PX]).toEqual([16, 3, 8, 48]);
    expect([GAP_PANEL_MIN_PX, GAP_PANEL_VW, GAP_PANEL_PX, GAP_PANEL_MAX_PX]).toEqual([12, 2, 4, 28]);
    expect([GAP_TITLE_MIN_PX, GAP_TITLE_VW, GAP_TITLE_PX, GAP_TITLE_MAX_PX]).toEqual([16, 2.5, 6, 36]);
    expect([PAD_PANEL_MIN_PX, PAD_PANEL_VW, PAD_PANEL_PX, PAD_PANEL_MAX_PX]).toEqual([16, 2, 8, 32]);
    expect([RADIUS_MIN_PX, RADIUS_VW, RADIUS_PX, RADIUS_MAX_PX]).toEqual([8, 0.8, 4, 18]);
    expect(PANEL_MIN_WIDTH_PX).toBe(260);
    expect(CONTENT_MAX_WIDTH_PX).toBe(1200);
    expect(COLS_MAX).toBe(3);
    expect([HERO_MAX_WIDTH_PX, HERO_MIN_HEIGHT_PX, HERO_MIN_HEIGHT_VH, HERO_MAX_HEIGHT_PX]).toEqual([720, 240, 45, 520]);
    expect([IMAGE_MAX_HEIGHT_VH, IMAGE_MAX_HEIGHT_PX]).toEqual([45, 420]);
    expect([LINE_LENGTH_MIN_CH, LINE_LENGTH_IDEAL_CH, LINE_LENGTH_MAX_CH]).toEqual([45, 60, 75]);
    expect(LINE_LENGTH_PANEL_MIN_CH).toBe(30);
    expect(NAV_MENU_MAX_HEIGHT_CSS).toBe('min(50vh, 420px)');
  });

  it('Proposal tokens are marked, Settled tokens are not', () => {
    expect(PROPOSAL_TOKENS).toHaveLength(17);
    expect(PROPOSAL_TOKENS).toContain('--wd-nav-menu-max-height');
    expect(PROPOSAL_TOKENS).not.toContain('--wd-font-floor');
    expect(PROPOSAL_TOKENS).not.toContain('--wd-color-accent');
    expect(TOKEN_META['--wd-font-floor'].status).toBe('settled');
    expect(TOKEN_META['--wd-nav-menu-max-height'].status).toBe('proposal');
    const generated = readFileSync(GENERATED_PATH, 'utf8');
    expect(generated).toContain('// PROPOSAL — --wd-nav-menu-max-height');
    expect(generated).not.toContain('// PROPOSAL — --wd-font-floor');
    expect(generated).not.toContain('// PROPOSAL — --wd-color-accent');
  });
});
