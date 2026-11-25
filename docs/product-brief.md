# Walkdown — Product Brief

- **Status:** Draft for review — v0.1 strategy; §15 answers settled 2026-11-23 and folded into the body (issues #3, #4)
- **Date:** 2026-11-23
- **Owner:** Samir Damle
- **Author:** Neo (with Samir)
- **Repo:** `samirdamle/walkdown` (public, MIT, default branch `main`)
- **Tracking:** Issues [#1](https://github.com/samirdamle/walkdown/issues/1) (brief), [#3](https://github.com/samirdamle/walkdown/issues/3) (fold §15 into the body), [#4](https://github.com/samirdamle/walkdown/issues/4) (Phase 1 spec)
- **Terminology in this brief:** a deck is made of **screens** (not slides, not scenes — see §2), grouped into **Sections**.

## 1. One-line pitch

> Take in a Markdown file, render it as a presentation that is
> **responsive, walkable, and beautiful on every screen** — phone,
> tablet, or desktop — with scrolling inside a screen, panels that
> lay themselves out, and stepwise reveal.

Walkdown is not a slide exporter. It is a *player* for Markdown:
the author writes plain text, the deck walks itself into whatever
rectangle it is given.

## 2. The problem

PowerPoint-style decks assume a fixed rectangle — usually 16:9,
usually a laptop, usually a projector. That assumption breaks
everywhere else:

- On a phone the text is unreadable, or the deck is a shrunken
  thumbnail of a desktop slide.
- On a tablet it is letterboxed, with dead space on every side.
- There is no scrolling inside a slide, so a slide that is a
  little too full either overflows, shrinks to illegibility, or
  forces the author to split it by hand.
- Reveal is all-or-nothing per slide: either everything is
  visible, or you advance to a whole new slide.

Existing Markdown-to-slides tools (Reveal.js, Marp, Slidev,
Deckset, remark) solve *authoring* — Markdown in, slides out —
but they keep the fixed-slide mental model. They scale the slide,
they do not re-lay it out. Walkdown's wedge is the opposite:
**the layout is computed from the viewport, every time.**

### What Walkdown is, in one sentence each

- A **spec**: what a Markdown deck means — screens, panels,
  steps — in a form any renderer can implement.
- A **toolkit / framework**: a small, dependency-light reference
  implementation of that spec for the web.
- A **protocol** (later, if it earns it): a deck is a portable
  Markdown file plus optional frontmatter; any Walkdown player
  renders it the same way.

For v0.1 the order is: spec first, reference renderer second,
protocol claims only when a second renderer exists. Do not
claim a protocol on day one. Both the spec and the renderer
are important — neither is a second-class headline (settled,
§15.9). The renderer is vanilla TypeScript + Web Components
(settled, §15.1; see §11).

## 3. Principles

These are the tests every later decision is judged against.
If a feature breaks one, it does not ship in v0.1.

1. **Markdown is the source of truth.** No lock-in format,
   no binary deck, no editor required. A deck is a `.md`
   file a human can read in a text editor.
2. **Beautiful by default, not by theming effort.** An
   author who writes nothing but headings and bullets gets
   a deck that looks designed. Customisation is an
   escape hatch, never a requirement.
3. **Responsive is re-layout, not re-scaling.** Font size,
   panel count per row, padding, margins, and gaps are all
   functions of the available rectangle — not a fixed slide
   zoomed to fit. A phone gets a different arrangement of
   the same content, not a smaller picture of the desktop
   arrangement.
4. **Never clip, never overflow silently.** If content
   does not fit, the screen scrolls *within itself*,
   or the layout degrades one tier (see §8). Text is
   never cut off, never overlapping, never unreadably small.
5. **Walkable.** The primary interaction is one hand,
   one thumb, one key: Next / Previous. Everything else
   (jump to start / end, swipe, keyboard, deep link)
   is a shortcut to the same walk.
6. **Author controls the reveal.** Panels can appear
   one by one, with enter / exit animation, exactly
   like a slide deck's builds — but the author says
   so in Markdown, and the default is sensible.
7. **Elegant degradation.** Fewer features on a
   small / old / reduced-motion device must still
   look intentional. A degraded deck is a simpler
   deck, not a broken one.
8. **Tiny and dependency-light.** In the spirit of
   nano-charts: the core should be small enough to
   audit, embed, and trust. Zero or near-zero runtime
   dependencies for the core parser + layout engine.

## 4. Terminology

| Term | Meaning |
| ---- | ------- |
| **Deck** | One Markdown file = one presentation. |
| **Section** | A group of screens — a chapter / act of the deck. Decided for v0.1: **Sections**, not Scenes ("scene" is too close to "screen" in spelling and speech — settled, §15.5). A deck with no explicit sections is a single unnamed Section. |
| **Screen** | One unit of the walk — what the user used to call a slide. A screen fills the viewport (or its container). Decided for v0.1: **screens**. |
| **Panel** | One tile / card inside a screen. The primary unit of layout. A bullet list item is the canonical panel; a paragraph, image, quote, or code block can also be a panel. |
| **Step** | One atomic advance of the walk. A step either reveals the next panel on the current screen, or moves to the next screen. |
| **Walk** | The ordered sequence of steps through a deck. |

Why "screen" and not "slide": a slide implies a fixed
physical rectangle. A screen is the rectangle you actually
have, and Walkdown's whole point is that the rectangle
changes. "Walk" (verb) is the deck being presented;
"walkdown" (noun) is the deck itself.

## 5. Input model — Markdown in

### 5.1 v0.1 syntax (settled, §15.2, §15.7 — to be locked in the spec)

Keep it boring. Use Markdown the author already knows,
plus the smallest possible set of structural conventions.

```markdown
---
title: Why Walkdown
author: Samir Damle
theme: light
---

# Why Walkdown

- A deck is a Markdown file
- It walks on any screen
- It never clips

---

# Responsive by construction

- Phones get a vertical stack
- Desktops get a grid
- Everything in between gets something sensible
```

Rules for v0.1:

- **Deck title:** the first `#` heading, or `title` in
  frontmatter. Frontmatter wins if both exist.
- **Screen boundary:** `---` (a thematic break) starts a
  new screen. Settled (§15.2): `---` is the delimiter.
  This is the Marp / Slidev convention, so
  authors already know it. A file with no `---` is a
  one-screen deck. Headings do *not* start a new screen.
- **Screen title:** the first `#` / `##` heading inside
  a screen, if any. A screen may have no title.
- **Panels:** the top-level list items (`-` / `*` / `1.`)
  of a screen become its panels, in order. Three bullets
  → three panels. Six bullets → six panels.
- **Panel content:** a list item may contain inline
  Markdown (bold, italic, code, links), and — in v0.1,
  at least — one paragraph, one image, or one code
  block. Nested lists render inside their parent panel
  (settled, §15.7); they are never panels or steps
  of their own in v0.1.
- **Non-list content:** a paragraph, image, quote, or
  code block at screen level (not inside a list) is a
  panel too, in document order. Mixed lists + prose
  in one screen are allowed; order is document order.
- **Frontmatter:** YAML, optional, deck-level only in
  v0.1. Known keys: `title`, `author`, `theme`,
  `defaults` (deck reveal defaults — §5.2), and
  `stylesheets` (external stylesheet list — §5.4).
  Unknown keys are ignored, never an error.

### 5.2 Reveal / animation authoring (settled, §15.3)

The author opts in to stepwise reveal, per screen, with
a single HTML comment marker. Default: all panels visible
at once (a static screen is still a valid deck).

Settled v0.1 syntax — the marker is an HTML comment with
`key: value` pairs separated by semicolons. Commas are
used only inside a value, for the `sequence` list:

```markdown
# A screen that reveals itself

<!-- reveal: step; effect: fade-in; duration: 1s -->

- First idea
- Second idea
- Third idea
```

- `<!-- reveal: step; effect: fade-in; duration: 1s -->`
  at the top of a screen means: panels enter one at a
  time, in order, one step each, fading in over 1s.
- The first pair is the mode: `step` (reveal one panel
  per step) or `all` (all panels visible on arrival;
  `<!-- reveal: all -->`, or no marker, means the same).
- Named parameters, all optional: `sequence` (the order
  panels reveal in, e.g. `sequence: 3, 1, 2`; default is
  document order), `effect` (the enter animation, e.g.
  `fade-in`; the spec lists the v0.1 effect names),
  `duration` (e.g. `1s`; default is the deck's standard
  reveal duration). Unknown parameters are ignored,
  never an error.

Note (2026-11-24): the original §15 answer said
"comma-separated". Samir confirmed `sequence` is the
reveal order and approved semicolons as the property
separator, commas only inside values. This section is
authoritative; §15 is kept verbatim as the record.

**Defaults cascade (2026-11-24, issue #6):** reveal
settings cascade deck → Section → screen, per property
— deck defaults in frontmatter, Section defaults as
parameters on the `section:` marker, screen settings
in the reveal marker. Most local wins; a screen that
overrides only `duration` keeps the deck's `effect`.

```yaml
---
title: My deck
defaults:
  reveal: step
  effect: fade-in
  duration: 500ms
---
```

```markdown
<!-- section: Why it matters; effect: slide-in; duration: 250ms -->
```

Only `reveal`, `effect`, and `duration` are
inheritable. `sequence` is per-screen only — a deck
or Section cannot set it, because panel counts differ
from screen to screen. The parser resolves the cascade
at parse time, so each screen's reveal settings are
fully computed in the model (spec §4.3).
- Exit animation is the reverse of entry on Previous:
  stepping back hides the last revealed panel first,
  then moves to the previous screen. No separate
  authoring for exit in v0.1.

Deferred: per-panel `<!-- step -->` markers and
per-panel effect overrides. They add authoring surface
before the engine proves itself. Revisit after the
first real decks are built. (Reveal defaults in
frontmatter were deferred in the first draft and are
now in v0.1 — see above, issue #6.)

### 5.3 What is deliberately *not* in v0.1 Markdown

- Speaker notes, presenter mode, timers.
- Per-panel layout directives (`layout: 2-col`,
  `size: large`) — the engine decides layout; the
  author decides content and order. Directives are
  the escape hatch for v0.2, not the v0.1 model.
- HTML embeds, plugins. The renderer may accept them
  later; the spec does not bless them yet.
  (Custom CSS classes *are* in v0.1 now — §5.4,
  issue #6.)
- Tables, footnotes, math as first-class panels.
  They render as content inside a panel if the
  Markdown parser supports them, but layout does
  not special-case them in v0.1.

### 5.4 Styling — external stylesheet, inline CSS, classes (2026-11-24, issue #6)

Custom themes are in scope for v0.1 (scope change —
they were a non-goal in the first draft; see §12).
There are two cascades, kept separate: the behaviour
cascade (§5.2, reveal) and the style cascade (this
section). A class never changes reveal; a reveal
setting never changes CSS.

- **External stylesheet:** frontmatter `stylesheets:`
  is a list, in load order; one stylesheet is a
  one-item list. Relative paths resolve against the
  deck's URL; remote URLs must be `https`. Fetching
  is the renderer's job, never the parser's. A
  stylesheet that cannot be fetched degrades to the
  default theme — never a blank deck.
- **Inline CSS:** a fenced ```css block as the *last*
  block in the file is the deck's inline stylesheet.
  The renderer extracts it and removes it from the
  content; it never becomes a screen or panel. Only
  one such block; `@import` and external `url()` are
  ignored in v0.1. Load order: renderer defaults →
  external stylesheet(s) → inline CSS block. The
  most deck-specific wins.
- **Classes:** `class:` on a section marker or a
  reveal marker puts classes on that section or
  screen; `panel-class:` on a reveal marker puts
  classes on every panel of that screen. Per-panel
  classes on a single card are deferred to v0.2.
- **Scoping (the hard rule):** deck CSS must be scoped
  to the deck container — Shadow DOM in the reference
  renderer. It must not affect the renderer chrome or
  the host page, and it must not hide panels or change
  the step count. Deck CSS is presentation only.

## 6. The screen / panel / step model

A deck compiles to a flat, inspectable model before
anything is rendered. This model is the spec's core,
and the renderer is a pure function of it + viewport.

```
Deck
 ├─ stylesheets: string[]        // frontmatter, §5.4
 ├─ styles: string               // trailing ```css block, §5.4 ('' if none)
 └─ sections: Section[]           // a deck with no explicit sections is one unnamed Section
     ├─ title?: string
     ├─ classNames: string[]      // `class:` on the section marker
     └─ screens: Screen[]
         ├─ title?: string
         ├─ classNames: string[]  // `class:` on the reveal marker
         ├─ panels: Panel[]
         │   ├─ kind: 'text' | 'image' | 'code' | 'quote' | …
         │   ├─ content: <parsed Markdown AST / HTML>
         │   ├─ reveal: 'on-arrival' | 'step'
         │   └─ classNames: string[]  // `panel-class:` on the screen marker
         └─ reveal: { mode: 'all' | 'step', sequence?: …, effect?: string, duration?: string }
                      // fully resolved by the defaults cascade (§5.2, spec §4.3)
```

- **Steps are derived, not authored.** For a screen
  with `reveal: all`, the screen contributes exactly
  one step: arrive, everything visible.
  For `reveal: step` with *n* panels, it contributes
  *n* steps: arrive with panel 1, then panel 2, …
  The last step of a screen is the fully-revealed
  screen — so Next from a fully-revealed screen
  always moves to the next screen.
- **Total steps** = sum over screens. The progress
  indicator (if shown) is steps, not screens, so
  a stepped screen honestly reports its length.
- **State is two numbers:** `(screenIndex, stepIndex)`.
  Everything else — which panels are visible, what
  animates, what the URL says — derives from those
  two numbers. This makes deep-linking, restore,
  and testing trivial.

## 7. Responsive layout engine

This is the product. Everything else is plumbing.

### 7.1 What adapts, and how

| Adapts | Mechanism (v0.1) |
| ------ | ---------------- |
| Font size | Fluid type: `clamp()` between a floor and a ceiling, driven by viewport width *and* height, plus panel count. A 6-panel screen uses a smaller base size than a 1-panel screen, at the same viewport. |
| Panel arrangement | CSS grid with `auto-fit` / `auto-fill` + container queries. The engine picks a column count from (viewport aspect, panel count, panel content length). Examples: 3 panels → 3 columns on wide, 1 column on narrow. 6 panels → 3×2 on wide, 2×3 on medium, 1×6 on narrow. |
| Padding / margins / gaps | Fluid spacing scale (same `clamp()` family as type). Gutters shrink before type does; type shrinks before layout degrades. |
| Panel height | Panels in a row share a row height; a screen is a grid that fills the viewport height, not a fixed-height slide scaled down. |
| Overflow | If, after all adaptation, content still does not fit, the *screen* scrolls internally (see §7.3). Never the page. |

No fixed breakpoints as the primary mechanism.
Breakpoints are a fallback / coarse tier (phone /
tablet / desktop) for behaviour that genuinely
differs — e.g. swipe vs. keyboard hints — not for
layout itself. Layout is continuous.

### 7.2 Layout algorithm (v0.1, sketch)

1. Measure the container (the element the deck is
   mounted in, not necessarily the window — so a
   deck can be embedded in a page, a card, or an
   iframe and still adapt).
2. Count panels, measure their content length
   (characters / lines, image aspect if present).
3. Choose a column count: the largest *c* such that
   each column stays above a minimum readable width
   (~240–280 CSS px for text panels, less for
   short labels) and the row count stays reasonable.
4. Choose a type scale: base size from container
   size, reduced by a factor that grows with panel
   count and content length, floored at a readable
   minimum. Settled (§15.6): **12px minimum on
   mobiles** — the engine degrades to scroll sooner
   rather than shrink type below 12px. The reader
   can zoom in/out with `+` / `-` at any time
   (see §9).
5. Lay out with CSS grid; let the browser do the
   final distribution. The engine sets variables
   (`--wd-cols`, `--wd-font`, `--wd-gap`, …), CSS
   does the work. No JS measuring per frame.
6. Re-run on resize / orientation change /
   container change (`ResizeObserver`), debounced.
   No layout shift after the first paint if the
   first measurement happens before paint.

### 7.3 Scrolling within a screen

- A screen is a scroll container. If its panels
  (at minimum readable size) exceed the viewport
  height, the screen scrolls vertically; the deck
  itself does not page-scroll.
- Scroll affordance must be visible: a fade /
  chevron / scrollbar cue when a screen is
  scrollable and not yet at its bottom. A user
  must never wonder whether there is more.
- Next / Previous and scroll are separate inputs, by
  design (settled, §15.4 — this replaces the earlier
  "Next scrolls first" proposal). **Scroll wheel and
  up/down arrows scroll within a screen. Right arrow
  advances a step; left arrow retreats a step.**
  Next never scrolls: if a screen is scrollable, the
  reader scrolls it with the wheel, arrow keys, or
  swipe, and advances with the right arrow, a click /
  tap in the right half, or a swipe. The two jobs
  never share one gesture, so the walk can never
  feel like it swallowed a scroll.
- Touch: vertical swipe scrolls within a screen;
  horizontal swipe advances (left) or retreats
  (right). The two gestures must not fight: vertical
  intent wins inside a scrollable screen.
- Keyboard: `ArrowUp` / `ArrowDown` scroll within a
  screen; `ArrowRight` / `Space` / `PageDown` advance;
  `ArrowLeft` / `PageUp` retreat — same split as
  Next / scroll above.

### 7.4 Panels: the visual unit

- A panel is a card: generous padding, soft
  radius, subtle border / shadow, one idea per
  card. The card *is* the unit the eye scans;
  the deck reads as a set of cards, not a wall
  of bullets.
- Panel content is vertically centred by default
  when there is spare height; top-aligned when
  the screen scrolls.
- Images in panels: `object-fit: cover` within
  the panel, aspect preserved, never stretched.
  Code in panels: monospace, own scroll if long,
  never breaking the panel.
- Empty / single-panel screens: a single panel
  becomes a hero — larger type, centred, more
  breathing room. A deck of one-liners should
  feel like title cards, not lost cards.

## 8. Elegant degradation

Degradation is a ladder, applied in order, and
each rung must still look designed:

1. **Full:** grid + fluid type + animations.
2. **Tight:** fewer columns, smaller type (to the
   floor), tighter gaps.
3. **Stacked:** one column, vertical flow, internal
   scroll. This is the phone default, not a failure.
4. **Static:** `prefers-reduced-motion`, or no
   animation support — all panels visible, steps
   still work (Next jumps, nothing fades).
5. **No-JS / print:** the deck renders as a
   linear document — screens as sections, panels
   as cards / list items, all visible. A printed
   deck is a handout, not a blank page.

What degradation never does: clip text, overlap
panels, drop a panel, or show a horizontal
scrollbar on the screen. If a rung cannot be met,
go one rung down.

## 9. Navigation

### 9.1 The walk

- **Next** (`→`, `Space`, `PageDown`, swipe left,
  click / tap in the right half of the screen):
  advance one step.
  If the current screen has an unrevealed panel,
  reveal it. Else move to the next screen.
  If on the last step of the last screen, Next is
  a no-op (or loops, only if the author opts in —
  default: stop, show an end state).
- **Previous** (`←`, `PageUp`, swipe right,
  click / tap in the left half of the screen):
  reverse one step. Hides the last revealed
  panel first, then moves back a screen.
- **Scroll** (scroll wheel, `↑` / `↓`, vertical
  swipe): scrolls within the current screen only.
  Scrolling never advances or retreats a step (§7.3).
- **Zoom** (`+` / `-`): zoom the deck's type in/out
  (settled, §15.6). Zoom is a reader control, not
  an author setting; it persists across screens
  within a session.
- **Start** (`Home`, or a ⏮ control): first step
  of the first screen.
- **End** (`End`, or a ⏭ control): last step of
  the last screen (fully revealed).
- **Jump:** click a screen in an overview / dots
  (v0.1: dots or a thin progress bar; a full
  grid overview is v0.2). Deep link:
  `#/3/2` = screen 3, step 2 — so a deck can
  be shared mid-walk, and refresh restores place.

### 9.2 Controls

- On-screen controls are minimal and quiet:
  Previous / Next chevrons, a progress indicator,
  and Start / End on long-press or in a menu —
  not four loud buttons fighting the content.
- Controls auto-hide on idle (desktop) and
  reappear on pointer move; they never auto-hide
  on touch, where there is no hover to bring
  them back.
- The whole screen is a Next / Previous surface by
  halves, not one big Next button (settled, §15.4):
  click / tap in the **right half advances**,
  click / tap in the **left half retreats**.
  A click must not advance or retreat when the user
  is selecting text, clicking a link or control, or
  starting a scroll / drag.

## 10. Animation

- **Enter:** panels fade + rise a short distance
  (`translateY(8–12px) → 0`, `opacity 0 → 1`,
  ~250–350 ms, ease-out). One motion language
  for the whole deck; no per-panel animation
  picker in v0.1.
- **Exit:** the reverse on Previous. Screens
  cross-fade / slide a short distance on
  screen change; the direction follows the
  walk (forward = in from the right, back =
  in from the left).
- **Author control in v0.1 is per-screen, via the
  reveal marker (§5.2):** mode (`step` or `all`),
  plus optional `sequence`, `effect` and `duration`
  parameters, separated by semicolons.
  The default effect is fade-in (§5.2); the deck
  default duration is ~250–350 ms. Timing,
  easing, and direction are otherwise deck-level
  theme values, not per-panel authoring.
- **Reduced motion:** `prefers-reduced-motion:
  reduce` → no enter / exit animation at all.
  Steps still advance; content simply appears.
  This is not optional.
- **Performance:** transform + opacity only
  (compositor-friendly). No layout animation.
  Animations must hold 60 fps on a mid-range
  phone; if they cannot, the engine drops to
  the static rung (§8).

## 11. Architecture (proposed for v0.1)

Three layers, each independently testable, each
small. The spec (§6 model) is the contract
between them.

```
Markdown text
  →  [1] Parser: Markdown → Deck model
  →  [2] Layout engine: Deck model + viewport → layout variables
  →  [3] Renderer: Deck model + layout → DOM / HTML
```

- **Parser:** a Markdown parser the project
  already trusts (e.g. `marked` / `markdown-it`
  — decision in the spec, not here), plus a
  thin Walkdown pass that applies §5 rules:
  screen splitting, panel extraction, reveal
  markers. Pure function, no DOM, unit-tested
  against fixture decks.
- **Layout engine:** pure function of
  (panel count, content lengths, container size)
  → CSS variables + column count. No DOM
  measurement in the hot path; `ResizeObserver`
  only to re-run it.
- **Renderer:** vanilla TypeScript + Web
  Components (settled, §15.1), rendering the
  Deck model into a shadow-DOM host so a deck
  can be embedded without style leakage.
  Framework bindings (React, etc.) are adapters
  over the same core, not forks of it.
- **Themes:** CSS custom properties only.
  One light + one dark theme in v0.1, both
  proven against the same fixture decks.
- **Demo:** GitHub Pages from this repo (settled,
  §15.8), like nano-charts. `demo/` is the live
  demo page; `examples/` holds the fixture decks
  it walks, including the first real deck — a deck
  explaining Walkdown itself (§15.10).
- **Packaging (proposed):** an npm package with
  a tiny core (`@walkdown/core`: parser +
  model + layout, zero deps) and a web renderer
  (`@walkdown/web`). A CLI / static-site
  generator that turns a `.md` file into a
  standalone `.html` deck is the natural v0.2
  companion — a single-file deck is the most
  shareable artifact Walkdown can produce.

Stack is now locked for v0.1: vanilla TypeScript +
Web Components (settled, §15.1). The brief's job is
done on this question; the spec records it as a
requirement, not a recommendation.

### Repo layout (proposed)

```
walkdown/
  docs/
    product-brief.md      # this file
    spec.md               # the normative spec (next doc)
    plans/                # implementation plans, per issue
  packages/
    core/                 # parser + model + layout (zero deps)
    web/                  # renderer (Web Components)
  demo/                   # fixture decks + live demo page
  examples/               # sample .md decks
```

## 12. What v0.1 is — and is not

### v0.1 ships when

- A Markdown file renders as a walkable deck in
  a browser on phone, tablet, and desktop.
- 1–8 panels per screen lay out beautifully at
  360 px, 768 px, and 1440 px widths (fixture
  decks prove it — screenshots in the PR).
- Internal scroll, stepwise reveal, Next /
  Previous / Start / End, keyboard + swipe,
  deep links, and reduced-motion all work.
- Reveal defaults cascade (frontmatter → Section →
  screen) and custom themes: an external stylesheet
  via frontmatter and/or an inline CSS block, with
  classes on sections / screens / panels (§5.4).
- No-JS render is a readable linear document.
- Docs: this brief, a spec, and a README with
  a 60-second "write a deck" example.
- The first real deck is a deck explaining Walkdown
  itself (settled, §15.10) — it is the demo deck
  on GitHub Pages and a fixture deck for every phase.

### Explicit non-goals for v0.1

- Presenter mode, speaker notes, timers, laser pointer.
- Live collaboration, comments, analytics.
- A visual editor / WYSIWYG authoring UI.
- Export to PowerPoint / PDF (print-to-PDF via
  the no-JS linear render is acceptable, not a
  feature).
- Per-panel layout directives, per-panel classes,
  plugins.
- Native mobile apps. The web player *is* the
  mobile experience.

Scope change (2026-11-24, issue #6): custom themes
moved into v0.1 — they were a non-goal in the first
draft ("custom themes beyond light / dark"). Samir
moved them in deliberately, with the scoping and
degradation rules in spec §11.

## 13. Milestones

| Phase | Work | Exit criterion |
| ----- | ---- | -------------- |
| 0 — Brief | This document; lock terminology + principles | Samir approves the brief (this PR) |
| 1 — Spec | `docs/spec.md`: normative Markdown → model, layout rules, navigation state machine, URL scheme | Spec reviewed; fixture decks written against it |
| 2 — Core | Parser + model + layout engine, unit-tested, zero-dep | Fixture decks parse to the expected model; layout variables correct at 3 widths |
| 3 — Renderer | Web renderer: screens, panels, scroll, reveal, navigation, themes | Demo deck walks on phone + desktop; 60 fps reveal |
| 4 — Polish | Degradation ladder, a11y pass, reduced motion, no-JS, docs + README + demo page | v0.1 checklist (§12) green; demo deployed on GitHub Pages |
| 5 — Release | npm publish (core + web), launch notes | 0.1.0 live; issue list for v0.2 cut from deferred items |

Each phase is GitHub issues first, branch second,
code third — the standing workflow. PRs to `main`
for review; nothing merges unreviewed. (Walkdown
has no `develop` branch yet; if the project grows
a release flow like nano-charts, add one then —
do not invent it now.)

## 14. Competitive frame

- **Reveal.js / Slidev / Marp:** Markdown in,
  fixed slides out. Walkdown's difference is
  re-layout + internal scroll + panels-as-cards.
  Never pitch Walkdown as a replacement for a
  full slide tool; pitch it as the deck that
  *walks on a phone*.
- **PowerPoint / Keynote / Google Slides:**
  the incumbent for authored decks. Walkdown
  does not compete on editing; it competes on
  *reading* — a deck someone else wrote, opened
  on a phone, that still reads beautifully.
- **Notion / Docs / plain Markdown renderers:**
  readable on a phone, but no walk, no reveal,
  no presentation pacing. Walkdown adds the
  walk without losing the readability.

Canonical claim to earn, not assert on day one:
*"Write Markdown. Walk it anywhere."*

## 15. Open questions for Samir — settled 2026-11-23

Samir answered all 10 questions directly on `main`
(commit `6952f28`, "Update product brief with design
Q&A"). They are **settled, not open** — the answers
below are preserved here as the record, and each
decision is folded into the body sections named in
the answer. Nothing in the body may contradict an
answer here; if it does, the answer here wins.

1. **Stack:** vanilla TS + Web Components for
   the renderer, as proposed in §11 — or React
   first (matching his other libraries), with
   vanilla as the core? What matters more for
   v0.1: embeddability anywhere, or familiarity?
   A: Vanilla TS + Web Components at first.
2. **Screen delimiter:** is `---` right, or
   should a `#` heading also start a new screen?
   (`---` is proposed; heading-split is the
   alternative some Markdown decks use.)
   A: Yes `---` is good.
3. **Reveal syntax:** is the `<!-- reveal: step -->`
   comment marker acceptable, or would he prefer
   frontmatter-per-screen, a different marker,
   or reveal-by-default with an opt-out?
   A: Yes, HTML comment marker with parameters for 
   reveal sequence, effect (e.g. effect: fade-in), 
   duration e.g. (duration: 1s), etc. - comma 
   separated key: value pairs.
4. **Next vs. scroll:** when a screen is scrollable
   and not at its bottom, should Next scroll first
   (proposed) or always advance a step? This is
   the trickiest interaction in the product.
   A: Scroll wheel, up/down arrows scroll. Right 
   arrow and click in right half advances to next. 
   Left arrow or click in left half retreats to 
   previous.
5. **Scenes:** is a group-of-screens ("scene" /
   chapter) something v0.1 should at least reserve
   in the model, or strictly a later idea?
   A: Scenes and screens are too similar in spelling.
   Let's call groups of screens as Sections.
6. **Type floor:** how small is too small? Is a
   ~14–15 px floor on phones acceptable, or
   should the engine degrade to scroll sooner
   rather than shrink type that far?
   A: 12px minimum on mobiles. Keep font size 
   accessible to zoom in/out with +/-.
7. **Nested lists:** in v0.1, nested bullets render
   inside their parent panel. Is that right, or
   should a nested list be its own sub-panel /
   sub-step?
   A: Yes, render inside parent.
8. **Demo / hosting:** should the demo be GitHub
   Pages from this repo (like nano-charts), and
   is a single-file standalone `.html` export a
   v0.1 or v0.2 goal?
   A: Yes, GitHub pages for demo.
9. **Scope of "framework / toolkit / spec":**
   does he want the spec to be the headline
   (others can implement Walkdown), or the
   reference renderer to be the headline (the
   spec follows the code)?
   A: Both spec and renderer are important.
10. **First real deck:** what deck should prove
    v0.1 — a deck about Walkdown itself, or a
    real talk of his, rebuilt in Markdown?
    A: Yes, a deck explaining Walkdown itself 
    will be cool.

## 16. Risks

- **Layout that is "responsive" but not beautiful:**
  auto-layout can produce competent, characterless
  grids. Mitigation: fixture decks + screenshot
  review at every phase; a human eye is the gate,
  not a test.
- **Scroll vs. Next ambiguity (§15.4):** settled as a
  clean split — wheel / up-down arrows scroll, right
  arrow / right half advances, left arrow / left half
  retreats. The remaining risk is gesture
  disambiguation on touch (vertical vs. horizontal
  swipe). Mitigation: prototype it early (Phase 3)
  and test it on a phone, not in a desktop browser.
- **Scope creep into a slide editor:** every
  feature that makes authoring richer makes the
  spec heavier. Mitigation: §12 non-goals, enforced
  at issue triage.
- **A second renderer never appears:** then the
  "protocol" claim is hollow. Mitigation: do not
  claim it until it exists (§2).

---

*Next step: Phase 1 — `docs/spec.md` — from the settled
answers (issues #3, #4). The brief is settled; the spec
is the next decision surface.*
