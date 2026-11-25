# @walkdown/renderer

Walkdown renderer: a Web Components deck element (Shadow DOM)
that renders a parsed deck with stepwise reveal, navigation,
themes, and fluid layout. Vanilla TypeScript; the only runtime
dependency is `@walkdown/core` — the parser, model, and layout
engine. The renderer never re-parses Markdown or re-resolves
defaults.

```html
<walkdown-deck src="deck.md"></walkdown-deck>
<script type="module">
  import '@walkdown/renderer';
</script>
```

Or, in code:

```ts
import '@walkdown/renderer';
import { parseDeck } from '@walkdown/core';

const el = document.querySelector('walkdown-deck');
el.markdown = await (await fetch('deck.md')).text();
// or: el.deck = parseDeck(text);
// or: el.src = 'deck.md';
```

## What it implements

- `src/element.ts` — `<walkdown-deck>`: Shadow DOM rendering of
  screens/panels, stepwise reveal (per-panel `effect` /
  `duration` / `sequence` from the model), navigation (§6.1:
  wheel / ArrowUp/Down scroll, ArrowRight or right-half click =
  Next, ArrowLeft or left-half click = Previous, Space/PageDown
  = Next, Home/End, `+`/`-` zoom), swipe with the core's
  `swipeThreshold()` helper, deep links `#/<screen>/<step>`,
  progress in steps, scroll cue, end state, empty-deck state.
  Layout comes from the core's `computeLayout()` on every
  resize (ResizeObserver) and zoom change; the 12px type floor
  is enforced by the layout engine.
- `src/loader.ts` — external stylesheet fetching (§11.4):
  relative URLs resolve against the deck URL, remote URLs must
  be `https`, failures degrade to the default theme with a
  console warning, and loading never blocks first paint.
- `src/sanitize.ts` — inline CSS block sanitising (§2.8, §11.2):
  `@import` and external `url()` are dropped; a declaration
  that would hide a screen or panel is dropped where the
  selector could match one.
- `src/styles.ts` — the default theme (§11.2, layer 1):
  consumes the `--wd-*` custom properties on `.wd-deck`,
  settled palette from `policies/design-tokens.json`.

## Themes

The deck's frontmatter `theme:` (`light` | `dark`, default
`light`) drives the palette; a `theme` attribute on the element
overrides it. There is no automatic `prefers-color-scheme`
switching in v0.1 — the deck author chooses, explicitly.
`prefers-reduced-motion` is honoured: no enter/exit animation
at all, steps still advance (§8).

## Tests

```sh
npm test
```

vitest + jsdom. `test/element.test.ts` renders the sample deck
(`examples/walkdown-itself.md`) end to end; `test/sanitize.test.ts`
and `test/loader.test.ts` cover the stylesheet rules.

## Provisional items (spec §10), implemented as written

- Section marker form `<!-- section: Title -->`.
- Space / PageDown = Next; ArrowUp / ArrowDown scroll.
- Default effect fade-in at 300ms, clamped 0–2000ms.
- Swipe threshold: ~48 CSS px or 1/8 screen width, whichever
  is smaller (`swipeThreshold()` in `@walkdown/core`).
- Progress indicator form: a thin bar + step count (§6.5 —
  the spec leaves dots vs. bar to the renderer; the bar was
  chosen, dots can replace it without touching the model).
