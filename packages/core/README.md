# @walkdown/core

Walkdown core: the Markdown parser, the deck model, the walk
state machine, and the layout engine. Vanilla TypeScript, zero
runtime dependencies. The renderer (Phase 3) consumes this
package; it never re-parses or re-resolves defaults.

```ts
import { parseDeck, totalSteps, nextState, computeLayout } from '@walkdown/core';

const deck = parseDeck(markdownText);
totalSteps(deck); // steps, not screens — the progress indicator counts these
```

## Parser choice (spec §3.2 / §10.1)

The parser is **hand-rolled over a small Markdown subset** —
headings, lists (including nested), emphasis, inline code, fenced
code blocks, links, images, blockquotes, and thematic breaks.
That is exactly the subset the spec needs, and it keeps the core
zero-dependency (the brief's Phase 2 exit criterion). The parser
is a pure function of the Markdown text: no DOM, no viewport, no
network. Stylesheet *fetching* is the renderer's job — the parser
only records the `stylesheets` list from frontmatter.

If the subset proves too small, revisit: `marked` or
`markdown-it` are the spec's named alternatives.

## What it implements

- `src/parser.ts` — `parseDeck(text): Deck` (spec §2–§4):
  frontmatter defaults, `---` screen delimiter, `section:`
  markers, reveal markers (`;` separates properties, `,` only
  inside a `sequence` value), the behaviour cascade (§4.3,
  resolved at parse time), trailing ` ```css ` inline stylesheet.
- `src/model.ts` — steps derived (§1.3), navigation (§6.2),
  deep links `#/<screen>/<step>` (§1.4), zoom (§7.3).
- `src/layout.ts` — `computeLayout(...)`: pure function of
  (panel count, content lengths, container size) → CSS variables
  + column count, per spec §7.2 and `policies/design-tokens.json`.
- `src/tokens.ts` — the settled token values (fonts, colours,
  floors, maxima) the layout engine consumes.

## Provisional items (spec §10), implemented as written

- Section marker form `<!-- section: Title -->` (provisional
  until Samir confirms it).
- Space / PageDown = Next; ArrowUp / ArrowDown scroll (§6.1).
- Default effect fade-in at 300ms, clamped 0–2000ms.
- Swipe threshold: ~48 CSS px or 1/8 of the screen width,
  whichever is smaller — `swipeThreshold(containerWidth)`.
- Per-panel classes are deferred to v0.2 and are NOT
  implemented; `panel-class:` applies to every panel on a
  screen (§11.3).

## Tests

```sh
npm test
```

`test/sample-deck.test.ts` parses `examples/walkdown-itself.md`
and asserts the expected model: 13 screens, 4 Sections,
46 panels, 46 steps.
