# Walkdown

Open source responsive presenter for markdown. Markdown in, a
presentation that walks: screens, panels, stepwise reveal, fluid
re-layout on any screen size.

See [docs/product-brief.md](docs/product-brief.md) and
[docs/spec.md](docs/spec.md).

## Layout

- `packages/core` — `@walkdown/core`: the parser, the model
  (Deck → Sections → screens → panels, walk state machine), and
  the layout engine. Vanilla TypeScript, zero runtime
  dependencies. Unit-tested with vitest.
- `packages/renderer` — `@walkdown/renderer`: the
  `<walkdown-deck>` Web Component (Shadow DOM), stepwise
  reveal, navigation, themes, stylesheet loading. Depends only
  on `@walkdown/core`. Unit-tested with vitest + jsdom.
- `demo/` — `demo/index.html`: the demo page, rendering
  `examples/walkdown-itself.md`. Build first (`npm run build`),
  then serve the repo over HTTP (`npx serve .`, open `/demo/`).
- `docs/` — product brief, spec, design policies.
- `policies/` — structured design tokens (`design-tokens.json`),
  the machine-readable form of `docs/design-policies.md` §8.
- `examples/` — fixture decks, starting with
  `examples/walkdown-itself.md`: a deck explaining Walkdown itself.

## Development

```sh
npm install
npm test        # core + renderer tests (watch mode off in CI)
npm run typecheck
npm run build   # emit declarations into packages/*/dist
```

PRs target `main` for review; nothing merges unreviewed.
Issues first, branch second, code third.
