import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLORS, controlSizePx, NAV_MENU_MAX_HEIGHT_CSS, SPACE_MIN_PX, themeVars } from '@walkdown/core';
import type { Theme } from '@walkdown/core';
import { DEFAULT_CSS, themeVarsCss } from '../src/styles.js';

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

describe('dark-screen chrome (issue #74)', () => {
  it('the label and cue use the dark muted on dark screens, and the cue fades to the dark background', () => {
    // The values are the settled dark theme tokens; the ratios are
    // hand-verified and recorded in policies/design-tokens.json and
    // policies/README.md (7.5:1 on the dark bg, 6.9:1 on the dark panel).
    expect(COLORS.dark.muted).toBe('#A9A9A0');
    expect(COLORS.dark.bg).toBe('#18181C');
    expect(DEFAULT_CSS).toContain(`.wd-screen.dark .wd-section-label,`);
    expect(DEFAULT_CSS).toContain(`.wd-screen.dark ~ .wd-scroll-cue {`);
    expect(DEFAULT_CSS).toContain(`color: ${COLORS.dark.muted};`);
    expect(DEFAULT_CSS).toContain(
      `background: linear-gradient(to bottom, transparent, ${COLORS.dark.bg} 80%);`,
    );
    // No second, hand-written copy of either value may hide in the CSS:
    // the token is the one source, here and in themeVars(). The muted
    // appears twice, not once: this rule and the dark-panel alias
    // redefinition below (issue #111) — both interpolate the token.
    expect(DEFAULT_CSS.split('#A9A9A0').length - 1).toBe(2);
    expect(DEFAULT_CSS.split('#18181C').length - 1).toBe(1);
  });

  it('the light chrome is untouched: the base cue still fades to the light background', () => {
    // F4 renamed every DEFAULT_CSS reference to the private alias;
    // the intent is unchanged: the base cue still fades to the
    // (light) background.
    expect(DEFAULT_CSS).toContain(
      'background: linear-gradient(to bottom, transparent, var(--_wd-color-bg) 80%);',
    );
    expect(DEFAULT_CSS).toContain('.wd-section-label {');
  });
});

/**
 * Read the sample deck's theme file. Same pattern as the demo
 * test (demo.test.ts): under the jsdom environment
 * import.meta.url is not a file: URL, so fall back to cwd.
 */
function themeFile(): string {
  try {
    return readFileSync(
      fileURLToPath(new URL('../../../examples/walkdown-theme.css', import.meta.url)),
      'utf8',
    );
  } catch {
    return readFileSync(resolve(process.cwd(), '../../examples/walkdown-theme.css'), 'utf8');
  }
}

describe('dark-screen panels (issue #111)', () => {
  it('dark-screen panels use the dark token set; light screens are byte-identical', () => {
    // The values are the settled dark theme tokens.
    expect(COLORS.dark.panel).toBe('#202024');
    expect(COLORS.dark.ink).toBe('#F5F5F0');
    expect(COLORS.dark.muted).toBe('#A9A9A0');
    expect(COLORS.dark.border).toBe('#2E2E33');
    expect(COLORS.dark.accent).toBe('#7FC8B8');
    // The alias redefinition: panel + every descendant, five
    // colour aliases, dark token as the var() fallback — the
    // same form the theme layer uses.
    const aliasBlock = /\.wd-screen\.dark \.wd-panel,\n\.wd-screen\.dark \.wd-panel \* \{([^}]*)\}/.exec(
      DEFAULT_CSS,
    );
    expect(aliasBlock).not.toBeNull();
    const body = aliasBlock![1];
    for (const [name, value] of [
      ['panel', COLORS.dark.panel],
      ['ink', COLORS.dark.ink],
      ['muted', COLORS.dark.muted],
      ['border', COLORS.dark.border],
      ['accent', COLORS.dark.accent],
    ] as Array<[string, string]>) {
      expect(body).toContain(`--_wd-color-${name}: var(--wd-color-${name}, ${value});`);
    }
    // No color: on the descendants: a color on the * selector
    // would outrank the link and blockquote rules and flatten
    // them to ink. The text color lives on the panel alone.
    expect(body).not.toContain('color:');
    expect(DEFAULT_CSS).toContain('.wd-screen.dark .wd-panel {\n  color: var(--_wd-color-ink);\n}');
    // The panel subtree derives from the aliases, so the
    // redefinition takes it dark: blockquote muted, code an ink
    // mix, links accent.
    expect(DEFAULT_CSS).toContain('color: var(--_wd-color-muted);');
    expect(DEFAULT_CSS).toContain(
      'background: color-mix(in srgb, var(--_wd-color-ink) 7%, transparent);',
    );
    expect(DEFAULT_CSS).toContain('.wd-panel a { color: var(--_wd-color-accent); }');
    // Light screens unchanged: the base panel rule still reads
    // the aliases, with no dark literal in it.
    const panel = /\.wd-panel \{[^}]*\}/.exec(DEFAULT_CSS);
    expect(panel).not.toBeNull();
    expect(panel![0]).toContain('background: var(--_wd-color-panel);');
    expect(panel![0]).toContain('border: 1px solid var(--_wd-color-border);');
    expect(panel![0]).not.toContain('#202024');
    // No second, hand-written copy of any dark value: each
    // appears exactly once in the CSS — in the alias block —
    // except the muted, which F3 already uses for the label
    // and cue (see the updated count there).
    expect(DEFAULT_CSS.split('#202024').length - 1).toBe(1);
    expect(DEFAULT_CSS.split('#F5F5F0').length - 1).toBe(1);
    expect(DEFAULT_CSS.split('#2E2E33').length - 1).toBe(1);
    expect(DEFAULT_CSS.split('#7FC8B8').length - 1).toBe(1);
    expect(DEFAULT_CSS.split('#A9A9A0').length - 1).toBe(2);
    // The bottom controls are untouched: no dark-screen rule
    // reaches them (they sit on the screen, not in a panel,
    // and are already readable).
    expect(DEFAULT_CSS).not.toContain('.wd-screen.dark .wd-controls');
    expect(DEFAULT_CSS).not.toContain('.wd-screen.dark ~ .wd-controls');
  });

  it('dark text on the dark panel clears 4.5:1', () => {
    // The issue quoted 16.19:1 for the ink — that is the ink on
    // the dark BACKGROUND; on the dark panel it is 14.84:1.
    // Still AAA, still far above the 4.5:1 minimum.
    const cases: Array<[string, string, number]> = [
      [COLORS.dark.ink, COLORS.dark.panel, 14.84],
      [COLORS.dark.muted, COLORS.dark.panel, 6.86],
      [COLORS.dark.accent, COLORS.dark.panel, 8.39],
    ];
    for (const [fg, bg, expected] of cases) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeCloseTo(expected, 1);
    }
  });

  it("the deck's own .dark rule still owns the screen background", () => {
    // The renderer does not touch deck stylesheets: the sample
    // deck's .dark rule still sets the screen background and
    // text colour the panels sit on.
    const css = themeFile();
    expect(css).toContain('.dark {');
    expect(css).toContain('background: #18181c;');
    expect(css).toContain('color: #f5f5f0;');
  });
});

/**
 * Theme vars live in a stylesheet layer, not inline style
 * (issue #75, spec §11.2). The theme layer defines one private
 * alias per theme var — each reading the public var with the
 * theme value as fallback — and the default stylesheet reads
 * only the aliases, so a deck stylesheet setting a theme var
 * wins without `!important`.
 */
describe('theme vars in a stylesheet layer (issue #75)', () => {
  const THEME_VAR_NAMES = Object.keys(themeVars('light'));

  it('themeVarsCss emits one private alias per theme var, with the theme value as fallback', () => {
    for (const theme of ['light', 'dark'] as const) {
      const css = themeVarsCss(theme);
      for (const [name, value] of Object.entries(themeVars(theme))) {
        expect(css).toContain(`--_${name.slice(2)}: var(${name}, ${value});`);
      }
      // No hand-written copy: a theme value appears once per theme
      // var that carries it — the alias fallback is its only home.
      // (Body and title share one stack, so that value appears
      // twice — once in each alias line, not as a copy.)
      const values = Object.values(themeVars(theme));
      for (const value of new Set(values)) {
        expect(css.split(value).length - 1).toBe(values.filter((v) => v === value).length);
      }
    }
  });

  it('light and dark layers differ only in the colour fallbacks', () => {
    expect(themeVarsCss('light')).toContain('--_wd-color-bg: var(--wd-color-bg, #FAFAF7);');
    expect(themeVarsCss('dark')).toContain('--_wd-color-bg: var(--wd-color-bg, #18181C);');
    expect(themeVarsCss('light')).toContain('--_wd-color-accent: var(--wd-color-accent, #2E7D6B);');
    expect(themeVarsCss('dark')).toContain('--_wd-color-accent: var(--wd-color-accent, #7FC8B8);');
    // Font families are theme-independent: the same alias line
    // in both layers.
    for (const name of ['--wd-font-family-body', '--wd-font-family-title', '--wd-font-family-code']) {
      const line = (theme: Theme) =>
        themeVarsCss(theme)
          .split('\n')
          .find((l) => l.includes(`--_${name.slice(2)}:`));
      expect(line('light')).toBe(line('dark'));
    }
  });

  it('the alias is defined on .wd-deck and every element inside it', () => {
    // That is what lets a deck rule on .wd-deck — or on a screen
    // or a panel — re-theme through the alias, and what lets a
    // page set a theme var on an ancestor of the host: the alias
    // re-resolves at each element from that element's own public
    // var. The public var is never seeded on :host.
    expect(themeVarsCss('light')).toContain('.wd-deck, .wd-deck * {');
    expect(themeVarsCss('light')).not.toContain(':host');
  });

  it('the theme layer sets color-scheme on .wd-deck per theme (§11.2, issue #85)', () => {
    // One declaration, driven by the theme: the browser themes
    // the UA surfaces inside the deck (scrollbars, form
    // controls, canvas) to match the theme the deck chose. The
    // value is the theme name itself, not a token — and each
    // layer carries only its own value, exactly once.
    expect(themeVarsCss('light')).toContain('.wd-deck {\n  color-scheme: light;\n}');
    expect(themeVarsCss('dark')).toContain('.wd-deck {\n  color-scheme: dark;\n}');
    expect(themeVarsCss('light')).not.toContain('color-scheme: dark');
    expect(themeVarsCss('dark')).not.toContain('color-scheme: light');
    for (const theme of ['light', 'dark'] as const) {
      expect(themeVarsCss(theme).split('color-scheme:').length - 1).toBe(1);
    }
  });

  it('the default stylesheet reads only the private aliases for theme vars', () => {
    // The one exception: the dark-panel alias redefinition (issue
    // #111) DEFINES the aliases, so it reads the public vars with
    // the dark values as fallbacks — exactly like themeVarsCss
    // does. Everything else reads only the aliases.
    const darkPanels = /\.wd-screen\.dark \.wd-panel,\n\.wd-screen\.dark \.wd-panel \* \{[^}]*\}/.exec(
      DEFAULT_CSS,
    );
    expect(darkPanels).not.toBeNull();
    // Exactly the five colour aliases the panel subtree reads —
    // no font alias, no background, no thumb.
    expect(darkPanels![0].split('var(--wd-color-').length - 1).toBe(5);
    const rest = DEFAULT_CSS.replace(darkPanels![0], '');
    expect(rest).not.toContain('var(--wd-color-');
    expect(rest).not.toContain('var(--wd-font-family-');
    for (const name of THEME_VAR_NAMES) {
      expect(DEFAULT_CSS).toContain(`var(--_${name.slice(2)})`);
    }
    // Layout vars still go through the public names — they are
    // set inline per pass, not themed.
    expect(DEFAULT_CSS).toContain('var(--wd-font-body)');
    expect(DEFAULT_CSS).toContain('var(--wd-reserve-bottom)');
  });
});

describe('idle auto-hide (§6.5, issue #77)', () => {
  it('idle-hidden controls leave the tab order after the fade', () => {
    // The idle rule hides with visibility, delayed until the
    // 300ms fade completes, so the fade still plays; the base
    // rule flips visibility back with no delay, so the controls
    // reappear the moment the idle class lifts.
    const idle = /\.wd-deck--idle \.wd-controls \{[^}]*\}/.exec(DEFAULT_CSS);
    expect(idle).not.toBeNull();
    expect(idle![0]).toContain('opacity: 0;');
    expect(idle![0]).toContain('visibility: hidden;');
    expect(idle![0]).toContain('transition: opacity 300ms ease-out, visibility 0s 300ms;');
    expect(DEFAULT_CSS).toContain('transition: opacity 300ms ease-out, visibility 0s;');
  });

  it('the menu-open and touch overrides keep the controls visible and focusable', () => {
    // Either override must restore both properties: opacity
    // alone would leave the controls opaque but unfocusable
    // while the menu is open, or on touch.
    expect(DEFAULT_CSS).toContain('.wd-deck--nav-open .wd-controls { opacity: 1; visibility: visible; }');
    expect(DEFAULT_CSS).toContain('.wd-deck--idle .wd-controls { opacity: 1; visibility: visible; }');
    expect(DEFAULT_CSS.split('visibility: visible;').length - 1).toBe(2);
  });
});

/**
 * WCAG relative luminance + contrast, so the ≥3:1 acceptance
 * for the scrollbar thumb is enforced, not just recorded.
 * (No helper exists in the repo — F3 recorded its ratios in
 * docs only. The thumb's margins are comfortable, but a future
 * token change must fail here rather than ship a thumb below
 * 3:1 on some backdrop.)
 */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('scrollbar thumb contrast (issue #80)', () => {
  it('the thumb has its own token, 4.10:1 on light and 4.12:1 on dark', () => {
    // The token is a Proposal (Samir has not settled the value);
    // the value is the same mid-grey in both themes — the thumb
    // must clear 3:1 against BOTH backgrounds in either theme,
    // and #7A7A7A is the maximin.
    expect(COLORS.light.thumb).toBe('#7A7A7A');
    expect(COLORS.dark.thumb).toBe('#7A7A7A');
    // The rule reads the thumb alias, not the border: the border
    // was 1.21:1 on light / 1.31:1 on dark.
    expect(DEFAULT_CSS).toContain('scrollbar-color: var(--_wd-color-thumb) transparent;');
    expect(DEFAULT_CSS).not.toContain('scrollbar-color: var(--_wd-color-border)');
    // No second, hand-written copy of the value may hide in the
    // CSS: the token is the one source (the one literal is the
    // comment on the rule itself).
    expect(DEFAULT_CSS.split('#7A7A7A').length - 1).toBe(1);
    // The theme layer carries the thumb var with the token value
    // as fallback, so a deck override wins without !important.
    expect(themeVars('light')['--wd-color-thumb']).toBe('#7A7A7A');
    expect(themeVarsCss('light')).toContain('--_wd-color-thumb: var(--wd-color-thumb, #7A7A7A);');
    expect(themeVarsCss('dark')).toContain('--_wd-color-thumb: var(--wd-color-thumb, #7A7A7A);');
  });

  it('the thumb clears 3:1 on every backdrop it can sit on', () => {
    // Four cases, not two: a light deck shows dark screens
    // (background #18181C) as well as light ones, so the light
    // thumb is measured against both backgrounds — and the dark
    // thumb against both too, for the light screen in a dark
    // deck (still open, same class as F3's).
    const cases: Array<[string, string, number]> = [
      [COLORS.light.thumb, COLORS.light.bg, 4.1],
      [COLORS.light.thumb, COLORS.dark.bg, 4.12],
      [COLORS.dark.thumb, COLORS.dark.bg, 4.12],
      [COLORS.dark.thumb, COLORS.light.bg, 4.1],
    ];
    for (const [thumb, bg, expected] of cases) {
      const ratio = contrastRatio(thumb, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(ratio).toBeCloseTo(expected, 1);
    }
  });
});

describe('visually-hidden utility (issue #82)', () => {
  it('the rule hides visually but keeps the text in the accessibility tree', () => {
    // The step-count description (§6.6) lives in this class: the
    // rule is the accessibility guide's utility verbatim.
    const m = /\.wd-visually-hidden:where\(:not\(:focus-within, :active\)\) \{([^}]*)\}/.exec(DEFAULT_CSS);
    expect(m).not.toBeNull();
    const body = m![1];
    expect(body).toContain('position: absolute');
    expect(body).toContain('clip-path: inset(50%)');
    expect(body).toContain('width: 1px');
    expect(body).toContain('height: 1px');
    // Never display: none / visibility: hidden — either would drop
    // the description from the accessibility tree with the text.
    expect(body).not.toContain('display: none');
    expect(body).not.toContain('visibility: hidden');
    // One rule, one selector — no second copy elsewhere.
    expect(DEFAULT_CSS.split('.wd-visually-hidden').length - 1).toBe(1);
  });
});

describe('host hidden attribute (issue #87)', () => {
  it('a hidden host is display: none, despite :host setting display: block', () => {
    // One rule, one selector — no second copy elsewhere.
    expect(DEFAULT_CSS.split(':host([hidden])').length - 1).toBe(1);
    expect(DEFAULT_CSS).toContain(':host([hidden]) {\n  display: none;\n}');
    // The rule exists because :host sets display: block above,
    // which would otherwise override the hidden attribute.
    expect(DEFAULT_CSS).toContain(':host {\n  display: block;');
  });
});
