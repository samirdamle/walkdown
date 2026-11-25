# Walkdown — Structured Policies

This folder is the machine-readable form of the design policies.
The human-readable source of truth is `docs/design-policies.md`
(§8 is the token table this file was converted from, §9 is the
settled decisions). If this file and §8 ever disagree, §8 wins
until both are updated together in one PR.

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
contrast ratios recorded in the JSON. All six text ratios were
verified by computation and match exactly.

- **Fonts are system stacks only; the default theme downloads
  no webfont.** Body/UI: `system-ui, -apple-system, "Segoe UI",
  Roboto, "Helvetica Neue", Arial, sans-serif`. Titles:
  `Georgia, "Iowan Old Style", "Palatino Linotype",
  "Times New Roman", serif`. Code: `ui-monospace, "SF Mono",
  "Cascadia Code", Menlo, Consolas, monospace`.
- **Colours, light:** background `#FAFAF7`, panel `#FFFFFF`,
  ink `#1B1B18` (16.5:1, AAA), muted `#5C5C57` (6.4:1, AA,
  secondary text only), border `#E5E5DF`, accent amber
  `#B45309` (4.8:1, AA).
- **Colours, dark:** background `#18181C`, panel `#202024`,
  ink `#F5F5F0` (16.2:1, AAA), muted `#A9A9A0` (7.5:1, AAA),
  border `#2E2E33`, accent gold `#F0D45D` (12.0:1, AAA).
- **One accent only:** amber in light mode, gold in dark mode.
- **Inter (body) + Fraunces (titles) is an opt-in theme, not
  the default.** A deck opts in by linking the theme through
  frontmatter `stylesheets:` (spec §11.4). The default theme
  never loads it.

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
(`--wd-font-floor`, 12px) and the ceilings. Zoom never pushes
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

- Change a policy in `docs/design-policies.md` §8 first,
  then update this file in the same PR. Never edit a value
  here alone.
- A check (manual for now, CI later) must prove: the JSON
  parses; its token names match §8 exactly; min / preferred /
  max / units / status match §8; settled tokens reproduce
  their settled values exactly.
- §8 is described as 25 tokens in tracking, but its table
  actually has 26 rows. This file contains all 26, plus the
  9 settled font/colour tokens Samir adopted on 2026-11-25,
  for 35 tokens total. If the count matters, that is Samir's
  call — nothing was dropped to match it.
- Font and colour tokens live here now (settled 2026-11-25).
  Any future palette change is a token change in this file,
  in the same PR as its §8 update.
