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
- `docs/` — product brief, spec, design policies.
- `policies/` — structured design tokens (`design-tokens.json`),
  the machine-readable form of `docs/design-policies.md` §8.
- `examples/` — fixture decks, starting with
  `examples/walkdown-itself.md`: a deck explaining Walkdown itself.

## Development

```sh
npm install
npm test        # run the core tests (watch mode off in CI)
npm run typecheck
npm run build   # typecheck + emit declarations into packages/core/dist
```

PRs target `main` for review; nothing merges unreviewed.
Issues first, branch second, code third.
