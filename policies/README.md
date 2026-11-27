# Walkdown — Structured Policies

This folder is the machine-readable form of the design policies.
The source of truth for token values is `design-tokens.json`
in this folder. `docs/design-policies.md` §8 is the
human-readable form of the same tokens (its table mirrors
this file, and `tokens.test.ts` proves the two agree). If
this file and §8 ever disagree, the JSON wins until both
are updated together in one PR.

## Files

- `design-tokens.json` — every policy token: name, property,
  min / preferred / max, units, status, and enforcement kind.
  Schema: `walkdown.design-tokens/v1`. It is valid JSON and is
  checked against §8 (see "Keeping it in sync" below).
- `README.md` — this note: how the tokens are consumed and
  enforced, and what happens on violation.

## The palette (settled 2026-11-25)

Samir adopted the recommended palette on 2026-11-25. The tokens
`--wd-font-family-*` and `--wd-color-*` are settled, with the
contrast ratios recorded in the JSON — except `--wd-color-thumb`,
which is a Proposal (issue #80, F9; Samir has not settled the
value). All six text ratios were
verified by computation and match exactly.

- **Fonts (settled 2026-11-27, Samir's decision — Inter is now the
  default).** Body/UI: Inter Regular (400) — `Inter, system-ui,
  -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
  sans-serif`. Titles: Inter Bold (700) — the same stack; the Bold
  weight comes from the stylesheet (`font-weight: 700` on
  `.wd-title`, the browser default on panel headings). Code:
  `ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas,
  monospace` (unchanged). The default theme loads Inter from
  Google Fonts (400 + 700, `display=swap`); the host page carries
  the `<link>` (the demo does) because document-level `@font-face`
  rules apply inside the shadow DOM, and the renderer itself never
  fetches fonts. Offline, or if the font fails to load, the stack
  falls back to the system stack — the deck still renders, in the
  system font. Self-hosting the two woff2 files is the alternative
  to the Google Fonts link.
- **Colours, light:** background `#FAFAF7`, panel `#FFFFFF`,
  ink `#1B1B18` (16.5:1, AAA), muted `#5C5C57` (6.4:1, AA,
  secondary text only), border `#E5E5DF`, accent ocean green
  `#2E7D6B` (4.7:1, AA).
- **Colours, dark:** background `#18181C`, panel `#202024`,
  ink `#F5F5F0` (16.2:1, AAA), muted `#A9A9A0` (7.5:1 on the
  background, 6.9:1 on the panel, AAA — since F3, issue #74, the
  muted used for the chrome on dark screens, where the light
  muted was 2.63:1),
  border `#2E2E33`, accent ocean green (seafoam) `#7FC8B8` (9.2:1, AAA).
- **Scrollbar thumb (Proposal, issue #80):** `#7A7A7A` in both
  themes — 4.10:1 on the light background, 4.12:1 on the dark
  background. One value for both themes because the thumb must
  clear 3:1 against both backgrounds in either theme (a light
  deck shows dark screens); `#7A7A7A` is the maximin grey.
- **One accent only:** ocean green in both themes — `#2E7D6B` light, `#7FC8B8` dark.
- **Fraunces titles is an opt-in theme.** Its body half (Inter)
  is now the default theme (Samir, 2026-11-27); opting in only
  swaps the title font to Fraunces. A deck opts in by linking the
  theme through frontmatter `stylesheets:` (spec §11.4). The
  default theme never loads it.

## How the renderer consumes the tokens

The renderer defines the tokens as CSS custom properties on
`.wd-deck` (the deck container, inside Shadow DOM — spec
§11.3), and applies them with `clamp(min, preferred, max)`
for every token that has bounds. A token with no bound in the
JSON has no clamp on that side.

Formulas are written in `vw` / `vh` for the full-screen case.
When the deck is embedded in a page, card, or iframe, the
renderer MUST use container query units (`cqw` / `cqh`)
instead (design-policies §0, spec §7.2): the container is
measured, never the window.

The layout engine (spec §7.2) applies the panel-count factors
to the font tokens before clamping, and applies the zoom
multiplier (`--wd-zoom-step`, ×1.1 per step, ±4 steps) to the
computed type size, then re-clamps to the floor
(`--wd-font-floor`, 14px) and the ceilings. Zoom never pushes
type below the floor.

Colour tokens are applied per theme (`light` / `dark`,
frontmatter `theme`, default `light`). The style cascade is
spec §11.2: renderer defaults → external stylesheet(s) →
inline CSS block. A `class:` that no stylesheet defines
renders with the renderer defaults; a missing class is never
an error.

## How the layout engine enforces the checks

Before emitting variables, the layout engine MUST assert:

- Column width is at least `--wd-panel-min-width` (240px);
  otherwise it drops a column.
- Column count is at most `--wd-cols-max` (3) and content
  width at most `--wd-content-max-width` (1200px).
- Line length is within `--wd-line-length` (45–75ch) for
  hero / single-column text, and at least
  `--wd-line-length-panel` (30ch) in multi-column panels.
- Hero dimensions respect `--wd-hero-max-width` (720px) and
  `--wd-hero-min-height` (240px – 520px).
- Images respect `--wd-image-max-height` and are at least
  `--wd-image-min-size` (200×120px) when displayed.
- Zoom stays within ±4 steps.

An assertion that fails is a layout bug, not a deck error:
the engine degrades in the order of the degradation ladder
(design-policies §6.3) — spacing gives way before type, then
columns, then type down to the floor, then internal scroll —
and never clips, overlaps, drops a panel, or scrolls
horizontally.

## How the validator enforces the rules

Static checks over the parsed model and the deck's CSS:

- No class hides a panel (`display: none`,
  `visibility: hidden`, zero size) — spec §11.3.
- No unprefixed renderer class and no `wd-` user class
  (design-policies §7.1).
- No `@import` or external `url()` in the inline CSS block
  (spec §2.8).
- Stylesheet URLs are `https` or relative (spec §11.4);
  an `http:` URL is ignored.
- Light `--wd-color-muted` is used for secondary text only,
  never body text (its AA rating does not cover body copy).
- Token values in this file parse, and every token in §8
  appears here exactly once.

## How fixture screenshots enforce the rest

At 360 / 768 / 1440 px, against the fixture decks (spec §9),
including `examples/walkdown-itself.md`, a human eye checks
what no rule can: that the deck reads beautifully. Tests
prove correctness; screenshots prove the product. A token
marked `fixture-screenshot` in the JSON has no automated
check beyond its clamp — the screenshot is its enforcement.

## What happens on violation

| Situation | Behaviour |
| --------- | --------- |
| A computed size is outside its clamp | Clamped to the nearest bound. |
| A token value is malformed or missing | The preferred value is used; if that is missing, the renderer default. The deck still renders. |
| A stylesheet cannot be fetched | Skipped; the deck renders with the default theme plus whatever did load, and the renderer logs a console warning (spec §11.4). Never a blank deck. |
| A class is undefined | Renderer defaults apply. Never an error. |
| A class hides a panel | Validator error; the renderer SHOULD guard against it where it can (spec §11.3). |
| Content does not fit at minimum readable size | The screen scrolls internally (spec §7.4). Never clipped, never dropped. |

Nothing in this folder crashes a deck. A violation degrades
or clamps; it never blanks the screen.

## Keeping it in sync

The JSON is the source of truth for token values — not §8,
not the code. The flow for any token change is:

1. Change the value in `design-tokens.json` (and only there).
2. Run `npm run tokens` to regenerate
   `packages/core/src/tokens.generated.ts`, and commit the
   regenerated file in the same PR.
3. Update the human-readable form in the same PR:
   `docs/design-policies.md` §8 for a §8 token, this README
   for a palette/font token.
4. If the change alters a value the code pins, update the
   snapshot in `packages/core/test/tokens.test.ts` in the
   same PR — a change there must be deliberate.

Never edit a generated constant by hand, and never edit a
value in the JSON without regenerating: both fail the checks
below.

The checks (automated — `tokens.test.ts`, plus
`npm run tokens:check` for CI):

- The JSON parses; `token_count` equals the number of
  tokens; token names are unique.
- The generated file equals a fresh regeneration from the
  JSON (no drift, no hand edits).
- The JSON and §8 agree: §8 has 27 rows, every §8 token is
  in the JSON, and min / max / units / status match (the
  body preferred is prose in both places and is compared
  only where it is a formula).
- Settled tokens reproduce their settled values exactly
  (the snapshot test pins every generated constant).
- Proposal tokens stay marked: they appear in
  `PROPOSAL_TOKENS` and carry a `// PROPOSAL` comment on
  every constant they produce. Settling a token means
  changing its status in the JSON and regenerating — the
  marker disappears with the regeneration.

Counts (corrected 2026-11-26 — the old note said 26 rows /
35 total, which was stale): §8's table has 27 rows. This
file contains all 27, plus the 9 font/colour tokens Samir
adopted on 2026-11-25, for 36 tokens total. Nothing was
dropped to match any count.

Scope correction (from the 2026-11-26 theme change): §8
holds no colour values at all — its 27 rows are geometry
and typography. The palette lives only in this file and in
the "The palette" section above, so a colour change never
goes through §8: change the JSON, regenerate, update this
README in the same PR.

The old rule — "change §8 first, then the JSON" — is
reversed: the JSON is edited first and §8 follows it. §8
remains the human-readable form and the checks above still
prove the two agree; only the direction of the edit changed.
