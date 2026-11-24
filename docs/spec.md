# Walkdown — Specification (Phase 1)

- **Status:** Draft for review — v0.1 spec
- **Date:** 2026-11-23
- **Owner:** Samir Damle
- **Author:** Neo (with Samir)
- **Repo:** `samirdamle/walkdown` (public, MIT, default branch `main`)
- **Tracking:** Issue [#4](https://github.com/samirdamle/walkdown/issues/4); builds on
  [docs/product-brief.md](product-brief.md) (issue #1, settled §15 answers
  folded into the brief body, issue #3)
- **Normative language:** the key words **MUST**, **MUST NOT**, **SHOULD**,
  **SHOULD NOT**, and **MAY** are to be interpreted as in RFC 2119.

## 0. Scope

This document is the normative spec for Walkdown v0.1: what a Markdown
deck *means*. Any renderer that implements this spec MUST render the
same deck the same way, within the tolerance of its platform. The
reference renderer (vanilla TypeScript + Web Components — settled,
brief §15.1) is one implementation of this spec; the spec is the
headline alongside it, not underneath it (brief §15.9).

Out of scope for v0.1: presenter mode, speaker notes, timers, live
collaboration, a visual editor, export to PowerPoint / PDF, per-panel
layout directives, custom themes beyond light / dark, plugins, native
mobile apps. See brief §12.

## 1. Model

### 1.1 Structure

A deck compiles to this model before anything is rendered. The model
is the contract between parser, layout engine, and renderer.

```
Deck
 ├─ title?: string
 ├─ author?: string
 ├─ theme: 'light' | 'dark'            // default 'light'
 └─ sections: Section[]                // one or more; a deck with no
                                        // section markers is one unnamed Section
     ├─ title?: string
     └─ screens: Screen[]              // one or more
         ├─ title?: string
         ├─ panels: Panel[]            // one or more
         │   ├─ kind: 'text' | 'image' | 'code' | 'quote'
         │   ├─ content: <parsed Markdown AST>
         │   └─ reveal: 'on-arrival' | 'step'
         └─ reveal: Reveal             // screen-level reveal settings (§4)
```

- A **deck** is one Markdown file.
- A **Section** is a group of screens — a chapter or act. Sections
  are a grouping only: they do not change navigation, steps, or
  layout. They exist so a long deck can be named in parts and so a
  progress indicator can show them. A Section MUST contain at least
  one screen.
- A **screen** is one unit of the walk. A screen MUST contain at
  least one panel. A screen with no panels (e.g. an empty stretch
  between two `---` lines) MUST be dropped by the parser, not
  rendered as a blank screen.
- A **panel** is one tile / card inside a screen. A panel MUST
  contain at least one block of content.
- A **step** is one atomic advance of the walk. Steps are derived,
  never authored (§1.3).

### 1.2 State

The entire walk state is two numbers plus a zoom level:

```
state = (screenIndex, stepIndex, zoom)
```

- `screenIndex` is 0-based, over the deck's screens in flat order
  (sections are flattened for addressing; a screen's identity is
  its position in the deck, not its position in its Section).
- `stepIndex` is 0-based, over the steps of the current screen.
- `zoom` is the reader's type zoom (§7.3), default 0. It persists
  across screens within a session.

Everything else — which panels are visible, what animates, what
the URL says — is derived from these three values. A renderer MUST
be able to restore a walk from `(screenIndex, stepIndex)` alone.

### 1.3 Steps are derived

For a screen with `reveal.mode = 'all'`, the screen contributes
exactly **one** step: arrive, everything visible.

For a screen with `reveal.mode = 'step'` and *n* panels, it
contributes **n** steps: step 0 shows the first panel (in reveal
sequence, §4.2), step 1 shows the first two, …, step *n* − 1 shows
all *n*. The last step of a screen is always the fully-revealed
screen, so Next from a fully-revealed screen always moves to the
next screen.

**Total steps** = sum of per-screen steps over the deck. A progress
indicator MUST count steps, not screens, so a stepped screen
honestly reports its length.

### 1.4 Deep links

A walk position is addressable as `#/<screen>/<step>`, both
1-based: `#/3/2` is screen 3, step 2. A renderer MUST:

- update the URL on every step change (without reloading);
- restore `(screenIndex, stepIndex)` from the URL on load;
- clamp an out-of-range URL to the nearest valid position
  (a step past the end of a screen lands on that screen's last
  step; a screen past the end lands on the deck's last step);
- treat a bare `#/3` as screen 3, step 1.

## 2. Input: Markdown in

### 2.1 Frontmatter

A deck MAY start with a YAML frontmatter block delimited by `---`
lines at the very start of the file. Frontmatter is deck-level
only in v0.1. Known keys:

| Key | Type | Default |
| --- | ---- | ------- |
| `title` | string | first `#` heading, or unset |
| `author` | string | unset |
| `theme` | `light` \| `dark` | `light` |

Unknown keys MUST be ignored, never an error. If both frontmatter
`title` and a first `#` heading exist, frontmatter wins.

Note: a frontmatter block is not a screen boundary. The `---` that
closes frontmatter does not start a new screen.

### 2.2 Screen delimiter

`---` (a thematic break, on its own line) starts a new screen.
This is settled (brief §15.2). Headings do NOT start a new screen.
A file with no `---` is a one-screen deck. Consecutive `---` lines
with nothing between them produce no empty screen (§1.1).

### 2.3 Screen titles

The first `#` or `##` heading inside a screen, if any, is the
screen's title. A screen MAY have no title. The title is removed
from the panel flow — it is the screen heading, not a panel.

Exception: the deck's first `#` heading, when it is also the deck
title (§2.1), is both deck title and first screen's title.

### 2.4 Sections

A Section is opened with an HTML comment marker placed before the
first screen of the Section:

```markdown
<!-- section: Why it matters -->

# Why it matters

- ...
```

- `<!-- section: <title> -->` starts a new Section with the given
  title. The marker MUST appear before any content of the screen
  it opens (at the top of a screen, or at the top of the file).
- A Section title MUST be non-empty plain text; Markdown
  formatting inside a Section title is not supported.
- A deck with no `section:` marker is a single unnamed Section
  containing all screens.
- A second `section:` marker before any screen content of the
  current Section (i.e. two markers in a row) is an author error
  the parser MUST tolerate: the later marker wins, the earlier
  empty Section is dropped.

### 2.5 Panels

Panels are the top-level blocks of a screen, in document order.

- The top-level list items (`-`, `*`, `+`, or `1.` / `1)` …) of a
  screen become its panels, in order. Three bullets → three panels.
  Six bullets → six panels.
- A paragraph, image, blockquote, or code block at screen level
  (not inside a list) is a panel too, in document order. Mixed
  lists and prose in one screen are allowed; order is document
  order.
- A list item's **kind** is determined by its dominant content:
  an item containing only an image is an `image` panel; an item
  containing a fenced code block is a `code` panel; an item
  containing only a blockquote is a `quote` panel; anything else
  is a `text` panel. A panel's kind is a hint to the layout
  engine and renderer, not a separate layout mode.
- A list item MAY contain inline Markdown (bold, italic, code,
  links) and at most one block element (one paragraph, one image,
  or one code block) in v0.1. Further blocks inside one item are
  rendered inside the same panel in order; the parser MUST NOT
  split them into extra panels.

### 2.6 Nested lists

Nested lists render inside their parent panel (settled, brief
§15.7). A nested list is never a panel of its own and never a
step of its own in v0.1. The parent panel renders its nested list
as a sub-list, with the renderer's standard nested-list styling.

### 2.7 What the parser MUST NOT do in v0.1

- Speaker notes, presenter mode, timers: not parsed, not an error
  if present as plain Markdown — they are just content.
- Per-panel layout directives (`layout: 2-col`, `size: large`):
  not supported. The engine decides layout; the author decides
  content and order.
- Custom CSS classes in Markdown, HTML embeds (other than the
  `section:` and `reveal:` comment markers defined here), plugins:
  not supported by the spec. A renderer MAY pass through raw HTML
  at its own risk; the spec does not bless it and a second renderer
  is not required to match it.
- Tables, footnotes, and math: if the Markdown parser supports
  them, they render as content *inside* a panel. Layout does not
  special-case them in v0.1.

## 3. Parsing

### 3.1 Pipeline

```
Markdown text
  → frontmatter extraction (§2.1)
  → screen splitting on `---` (§2.2)
  → per-screen: section marker, title, reveal marker, blocks
  → blocks → panels (§2.5, §2.6)
  → steps derived (§1.3)
  → Deck model (§1.1)
```

The parser MUST be a pure function of the Markdown text: no DOM,
no viewport, no network. The same text MUST always produce the
same model.

### 3.2 Markdown parser choice

Open (see §10.1): `marked` or `markdown-it`, or a hand-rolled
parser over a small Markdown subset. The choice is an
implementation decision, but whichever is chosen MUST support:
CommonMark headings, lists (including nested), emphasis, inline
code, fenced code blocks, links, images, blockquotes, and thematic
breaks. The choice MUST be recorded in the implementation plan
when it is made; the spec does not depend on it.

### 3.3 Error tolerance

Walkdown is a reader's tool: a deck with a mistake in it MUST
still render as far as possible.

- An unclosed HTML comment marker is treated as plain text, not
  a marker.
- A malformed `reveal:` or `section:` marker (bad syntax, unknown
  values) is ignored for that marker only, with the defaults of
  §4.3 applying. The rest of the deck parses normally.
- Unknown frontmatter keys are ignored (§2.1). Unknown reveal
  parameters are ignored (§4.2).
- A deck that parses to zero screens (empty file, frontmatter
  only) is an error the renderer MUST surface as an empty-deck
  state, not a blank page and not a crash.

## 4. Reveal markers — grammar

### 4.1 Form

A reveal marker is an HTML comment at the top of a screen (before
its first panel), with comma-separated `key: value` pairs:

```
<!-- reveal: step, effect: fade-in, duration: 1s -->
```

Formally:

```
marker    := "<!--" WS "reveal" ":" param-list WS "-->"
param-list:= param ("," param)*
param     := key ":" value | bare-value
bare-value:= "step" | "all"
key       := "sequence" | "effect" | "duration"
value     := <text up to the next "," or "-->">
```

Rules:

- The **first** parameter MAY be a bare value (`step` or `all`);
  it sets the mode. If no bare value is given, the mode is `step`
  when any other parameter is present, and `all` when the marker
  is absent entirely.
- A parameter item with **no colon** after the first is a
  continuation of the previous parameter's value, not a new
  parameter. This is what makes `sequence: 2, 1, 3` parse:
  `2, 1, 3` is one value. (A renderer MUST implement this rule;
  it is the only way a list-valued parameter survives the
  comma-separated syntax.)
- Whitespace around keys, colons, commas, and values is ignored.
  Keys are case-insensitive; values are case-insensitive where
  they are names (`fade-in`), case-sensitive where they are
  durations or numbers.
- A screen MUST have at most one reveal marker; if two appear,
  the first wins and the second is ignored.
- A marker anywhere other than the top of a screen (after the
  first panel) is ignored.

### 4.2 Parameters

| Parameter | Values | Default |
| --------- | ------ | ------- |
| mode (bare first value) | `step` \| `all` | `all` (no marker) |
| `sequence` | list of 1-based panel indices, e.g. `2, 1, 3` | document order (`1, 2, 3, …`) |
| `effect` | `fade-in` \| `slide-in` \| `none` | `fade-in` |
| `duration` | CSS time, e.g. `1s`, `250ms` | `300ms` |

- `sequence` lists the order panels reveal in. It MUST contain
  each panel index exactly once to be valid; an invalid sequence
  (missing, duplicate, or out-of-range index) is ignored in full
  and document order is used. The sequence does not change panel
  positions on the screen — only the order they appear in.
- `effect` names the enter animation (§8). `none` means panels
  appear instantly; steps still advance.
- `duration` is the enter animation duration for each panel.
  Values outside 0–2000ms MUST be clamped into that range.
  A malformed duration is ignored and the default used.
- Unknown keys MUST be ignored, never an error — this is how
  the grammar extends without breaking old decks.

### 4.3 Defaults

No marker, or `<!-- reveal: all -->`: all panels visible on
arrival, one step for the screen. `<!-- reveal: step -->`:
one panel per step, `fade-in`, `300ms`, document order.

## 5. Steps and reveal (runtime)

- Step *k* of a `step` screen shows the first *k* + 1 panels in
  reveal sequence; all other panels are hidden (not rendered
  off-screen, not merely transparent — hidden, so they take no
  space and are not focusable).
- Moving **forward** one step reveals the next panel with its
  enter animation (§8).
- Moving **backward** one step hides the last revealed panel
  with the reverse of its enter animation, then — on the next
  backward step — moves to the previous screen at its last step
  (fully revealed).
- Jumping (Start / End / deep link / dots) shows the target
  position with no per-panel animation: panels simply appear
  in their final state. A jump MUST NOT play *n* reveal
  animations in sequence.
- Re-entering a screen forward (after having left it) restores
  it at its last step (fully revealed), not at step 0 — unless
  the walk arrived there by Previous, in which case §6 applies.

## 6. Navigation — state machine

### 6.1 Inputs and their one job

Scroll and advance are separate inputs by design (settled, brief
§15.4). No input does both jobs.

| Input | Job |
| ----- | --- |
| Scroll wheel | Scroll within the current screen |
| `ArrowUp` / `ArrowDown` | Scroll within the current screen |
| Vertical swipe / drag | Scroll within the current screen |
| `ArrowRight` | Advance one step (Next) |
| `ArrowLeft` | Retreat one step (Previous) |
| `Space` / `PageDown` | Advance one step (Next) |
| `PageUp` | Retreat one step (Previous) |
| Click / tap, right half | Advance one step (Next) |
| Click / tap, left half | Retreat one step (Previous) |
| Horizontal swipe left | Advance one step (Next) |
| Horizontal swipe right | Retreat one step (Previous) |
| `Home` | Start — first step of the first screen |
| `End` | End — last step of the last screen |
| `+` / `-` | Zoom type in / out (§7.3) |

### 6.2 Transitions

Let the current state be `(s, k)` — screen *s*, step *k* — with
`steps(s)` the step count of screen *s*.

- **Next:** if `k + 1 < steps(s)`, go to `(s, k + 1)` (reveal
  the next panel). Else if `s + 1 < screenCount`, go to
  `(s + 1, 0)`. Else (last step of the last screen): no-op,
  and the renderer SHOULD show an end state (e.g. a subtle
  "end of deck" indication). Looping is NOT the default; an
  author opt-in for looping is deferred to v0.2.
- **Previous:** if `k > 0`, go to `(s, k − 1)` (hide the last
  revealed panel). Else if `s > 0`, go to `(s − 1,
  steps(s − 1) − 1)` (previous screen, fully revealed). Else
  (first step of the first screen): no-op.
- **Start:** go to `(0, 0)`.
- **End:** go to `(lastScreen, steps(lastScreen) − 1)`.
- **Jump to screen *s*:** go to `(s, 0)` if arriving forward,
  `(s, steps(s) − 1)` if arriving backward. A jump shows the
  target with no reveal animation (§5).

### 6.3 Click halves

- The screen is divided into left and right halves at its
  horizontal midpoint. Click / tap in the right half advances;
  in the left half retreats.
- A click MUST NOT navigate when the user is selecting text,
  clicking a link, button, or other control, or starting a
  scroll / drag. The renderer MUST distinguish a tap from a
  drag (pointer movement beyond a small threshold cancels
  the tap) and from text selection (a click that extends or
  starts a selection does nothing).
- On-screen Previous / Next chevron controls, where shown,
  are ordinary buttons and are exempt from the half rule —
  they do what they say.

### 6.4 Touch

- Vertical swipe scrolls within a screen; horizontal swipe
  advances / retreats. The renderer MUST decide the gesture
  direction from the initial movement and stick to it:
  once a gesture is vertical, it stays a scroll; once
  horizontal, it stays a step. The two gestures MUST NOT
  fight.
- A swipe that advances MUST require a deliberate horizontal
  movement (threshold: at least ~48 CSS px, or 1/8 of the
  screen width, whichever is smaller — exact value is a
  renderer tuning constant, recorded when implemented).

### 6.5 Controls

- On-screen controls are minimal: Previous / Next chevrons,
  a progress indicator, and Start / End (in a menu or on
  long-press — not four loud buttons).
- Controls auto-hide on idle on desktop and reappear on
  pointer move; they MUST NOT auto-hide on touch, where
  there is no hover to bring them back.
- The progress indicator shows steps, not screens (§1.3):
  dots or a thin progress bar in v0.1. A full grid overview
  is v0.2.

## 7. Responsive layout

### 7.1 What adapts

| Adapts | Mechanism |
| ------ | --------- |
| Font size | Fluid type: `clamp()` between a floor and a ceiling, driven by container width *and* height, plus panel count. A 6-panel screen uses a smaller base size than a 1-panel screen at the same viewport. |
| Panel arrangement | CSS grid with `auto-fit` / `auto-fill` + container queries. Column count is chosen from (container aspect, panel count, panel content length). |
| Padding / margins / gaps | Fluid spacing scale (same `clamp()` family as type). Gutters shrink before type does; type shrinks before layout degrades. |
| Panel height | Panels in a row share a row height; a screen is a grid that fills the container height, not a fixed-height slide scaled down. |
| Overflow | If content still does not fit after all adaptation, the *screen* scrolls internally (§7.4). Never the page. |

No fixed breakpoints as the primary mechanism. Breakpoints are
a fallback / coarse tier (phone / tablet / desktop) for behaviour
that genuinely differs — e.g. swipe vs. keyboard hints — not for
layout itself. Layout is continuous.

### 7.2 Layout algorithm

The layout engine is a pure function of (panel count, content
lengths, container size) → CSS variables + column count. It MUST:

1. Measure the **container** (the element the deck is mounted
   in, not necessarily the window — so a deck can be embedded
   in a page, a card, or an iframe and still adapt).
2. Count panels; measure their content length (characters /
   lines, image aspect if present).
3. Choose a column count: the largest *c* such that each column
   stays above a minimum readable width (~240–280 CSS px for
   text panels, less for short labels) and the row count stays
   reasonable. Reference arrangements (not hard rules — the
   engine MUST produce these at the stated sizes, and SHOULD
   generalise from them): 3 panels → 3 columns on wide,
   1 column on narrow. 6 panels → 3×2 on wide, 2×3 on medium,
   1×6 on narrow.
4. Choose a type scale: base size from container size, reduced
   by a factor that grows with panel count and content length,
   floored at the minimum in §7.3.
5. Emit layout as CSS variables (`--wd-cols`, `--wd-font`,
   `--wd-gap`, …); CSS does the distribution. No JS measuring
   per frame.
6. Re-run on resize / orientation change / container change
   (`ResizeObserver`), debounced. No layout shift after the
   first paint if the first measurement happens before paint.

### 7.3 Type floor and zoom

- **Type floor (settled, brief §15.6): 12px minimum on mobiles.**
  Body text MUST NOT render below 12px on a phone-width
  container. The engine degrades to scroll (§7.4) sooner rather
  than shrink type below the floor. On larger containers the
  floor is higher; the exact desktop floor is a renderer tuning
  constant, and MUST NOT be below 12px anywhere.
- **Zoom:** `+` zooms type in, `-` zooms type out. Zoom is a
  reader control, not an author setting. It MUST persist across
  screens within a session, apply on top of the fluid type
  scale (zoom is a multiplier on the computed base size), and
  be bounded (at least ±4 steps from default, each step ~10%).
  Zoom MUST NOT break the layout: zooming in re-runs layout
  and may push a screen into internal scroll — that is correct
  behaviour, not a bug.

### 7.4 Scrolling within a screen

- A screen is a scroll container. If its panels (at minimum
  readable size) exceed the container height, the screen scrolls
  vertically; the deck itself does not page-scroll.
- Scroll affordance MUST be visible: a fade / chevron /
  scrollbar cue when a screen is scrollable and not yet at its
  bottom. A reader MUST never wonder whether there is more.
- Panel content is vertically centred by default when there is
  spare height; top-aligned when the screen scrolls.
- Images in panels: `object-fit: cover` within the panel,
  aspect preserved, never stretched. Code in panels: monospace,
  own scroll if long, never breaking the panel.
- Empty / single-panel screens: a single panel becomes a hero —
  larger type, centred, more breathing room.

### 7.5 Degradation ladder

Applied in order; each rung MUST still look designed:

1. **Full:** grid + fluid type + animations.
2. **Tight:** fewer columns, smaller type (to the floor),
   tighter gaps.
3. **Stacked:** one column, vertical flow, internal scroll.
   This is the phone default, not a failure.
4. **Static:** `prefers-reduced-motion`, or no animation
   support — all panels visible, steps still work (Next
   jumps, nothing fades).
5. **No-JS / print:** the deck renders as a linear document —
   screens as sections, panels as cards / list items, all
   visible. A printed deck is a handout, not a blank page.

What degradation MUST NEVER do: clip text, overlap panels, drop
a panel, or show a horizontal scrollbar on the screen. If a rung
cannot be met, go one rung down.

## 8. Animation

- **Enter (default `fade-in`):** panels fade + rise a short
  distance (`translateY(8–12px) → 0`, `opacity 0 → 1`,
  duration from the reveal marker, default 300ms, ease-out).
  One motion language for the whole deck.
- **Enter (`slide-in`):** the panel slides in from the right
  on a forward step, from the left on a backward step, with a
  short fade. Distance: ~24px.
- **Enter (`none`):** the panel appears instantly.
- **Exit:** the reverse of entry on Previous — the panel plays
  its enter animation backwards. Screens cross-fade / slide a
  short distance on screen change; the direction follows the
  walk (forward = in from the right, back = in from the left).
- **Reduced motion:** `prefers-reduced-motion: reduce` → no
  enter / exit animation at all. Steps still advance; content
  simply appears. This is not optional.
- **Performance:** transform + opacity only (compositor-
  friendly). No layout animation. Animations MUST hold 60 fps
  on a mid-range phone; if they cannot, the engine drops to
  the static rung (§7.5).

## 9. Conformance and testing

A renderer conforms to this spec when, for every fixture deck:

- the parsed model matches the expected model exactly
  (screens, Sections, panels, reveal settings, steps);
- the walk state machine (§6.2) produces the expected
  `(screenIndex, stepIndex)` for a scripted input sequence;
- at 360 px, 768 px, and 1440 px widths, 1–8 panels per screen
  lay out with no clipping, no overlap, no horizontal scroll,
  and type at or above the floor;
- internal scroll, stepwise reveal, Next / Previous / Start /
  End, keyboard + swipe, deep links, and reduced-motion all
  work;
- the no-JS render is a readable linear document.

Fixture decks (to be written in Phase 2, against this spec):

- `examples/walkdown-itself.md` — the first real deck, a deck
  explaining Walkdown itself (brief §15.10). It is also the
  demo deck on GitHub Pages.
- A 1-panel hero deck, a 3-panel deck, a 6-panel deck, a
  stepped-reveal deck (with `effect` / `duration` / `sequence`),
  a long-content deck that must scroll internally, and a
  multi-Section deck.

Screenshot review at every phase: a human eye is the gate for
"beautiful", not a test. Tests prove correctness; screenshots
prove the product.

## 10. Open questions

Only questions this spec genuinely leaves undecided. The 10
questions in brief §15 are settled and MUST NOT be re-asked.

1. **Markdown parser:** `marked` or `markdown-it`, or a
   hand-rolled parser over a small subset (§3.2)? Decided at
   Phase 2 implementation time; the choice must be recorded
   in the implementation plan.
2. **Section marker form:** this spec defines Sections via
   `<!-- section: Title -->` (§2.4). Is that the right
   authoring form, or should Sections be declared another
   way (e.g. a `#` heading level, or frontmatter)? Samir's
   call — the spec's fallback is that the marker form is
   provisional until he confirms it.
3. **Single-file standalone `.html` export:** v0.1 or v0.2?
   The demo is GitHub Pages (settled); whether a single-file
   export ships in v0.1 is undecided.
4. **Progress indicator form:** dots or a thin progress bar
   in v0.1 (§6.5)? Renderer decision at Phase 3; either
   satisfies the spec.
5. **Reveal `sequence` continuation rule:** §4.1 defines that
   a comma-separated item with no colon continues the previous
   parameter's value. This is the spec author's reading of
   "comma-separated key:value pairs" applied to a list-valued
   parameter — Samir's call to confirm or replace with a
   different sequence syntax.

---

*Next: Phase 2 — Core (parser + model + layout engine), per
brief §13. The spec is the test: fixture decks are written
against it, and the parser must produce the model it defines.*
