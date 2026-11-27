# Walkdown — Specification (Phase 1)

- **Status:** Draft for review — v0.1 spec
- **Date:** 2026-11-23
- **Owner:** Samir Damle
- **Author:** Neo (with Samir)
- **Repo:** `samirdamle/walkdown` (public, MIT, default branch `main`)
- **Tracking:** Issue [#4](https://github.com/samirdamle/walkdown/issues/4) and
  [#6](https://github.com/samirdamle/walkdown/issues/6) (defaults cascade, inline
  CSS + classes, external stylesheet); builds on
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
layout directives, per-panel classes, plugins, native
mobile apps. See brief §12.

Scope change (2026-11-24, issue #6): custom themes are IN scope for
v0.1 — an external stylesheet via frontmatter (§2.1, §11.4) and an
inline CSS block with classes (§2.8, §11). They were out of scope in
the first draft; Samir moved them in deliberately, with the scoping
and degradation rules in §11.

## 1. Model

### 1.1 Structure

A deck compiles to this model before anything is rendered. The model
is the contract between parser, layout engine, and renderer.

```
Deck
 ├─ title?: string
 ├─ author?: string
 ├─ theme: 'light' | 'dark'            // default 'light'
 ├─ stylesheets: string[]             // frontmatter §2.1, loaded §11.4
 ├─ styles: string                    // inline CSS block §2.8 ('' if none)
 └─ sections: Section[]                // one or more; a deck with no
                                        // section markers is one unnamed Section
     ├─ title?: string
     ├─ classNames: string[]           // `class:` on the section marker (§2.4)
     └─ screens: Screen[]              // one or more
         ├─ title?: string
         ├─ classNames: string[]       // its Section's `class:` (§2.4), then its own on the reveal marker (§4.2, §11.3)
         ├─ panels: Panel[]            // one or more
         │   ├─ kind: 'text' | 'image' | 'code' | 'quote'
         │   ├─ content: <parsed Markdown AST>
         │   ├─ reveal: 'on-arrival' | 'step'
         │   └─ classNames: string[]   // `panel-class:` on the screen marker (§4.2)
         └─ reveal: Reveal             // screen-level reveal settings (§4),
                                        // fully resolved by the defaults cascade (§4.3)
```

- A **deck** is one Markdown file.
- A **Section** is a group of screens — a chapter or act. Sections
  are a grouping only: they do not change navigation, steps, or
  layout. They exist so a long deck can be named in parts and so a
  progress indicator can show them. A Section MAY carry reveal
  defaults for its screens (§4.3) and a `class:` (§2.4), which
  its screens inherit (§11.3); neither changes the step count.
  A Section MUST contain at least one screen.
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
| `defaults` | map: `reveal` (`step` \| `all`), `effect`, `duration`, `direction` | no deck defaults (spec §4.3) |
| `stylesheets` | list of strings (URLs / paths) | empty (no external stylesheet) |

```yaml
---
title: My deck
defaults:
  reveal: step
  effect: fade-in
  duration: 500ms
stylesheets:
  - ./theme.css
---
```

- `defaults` is the deck-level reveal default (§4.3). It holds
  only `reveal`, `effect`, `duration`, and `direction` —
  `sequence` is never a deck default, because it is per-screen
  (§4.2). An unknown key inside `defaults` MUST be ignored.
- `stylesheets` is the canonical key for an external stylesheet
  (§11.4). There is no singular `stylesheet` key: one stylesheet
  is a one-item list. Relative paths resolve against the deck's
  URL; remote URLs MUST be `https`. Stylesheets are listed in
  load order; the first listed loads first.
- Unknown keys MUST be ignored, never an error. If both frontmatter
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
- The marker MAY carry semicolon-separated parameters, in the same
  grammar as reveal markers (§4.1): `reveal`, `effect`, `duration`,
  `direction`, and `class`. These are the Section's reveal defaults (§4.3) and
  its class (§11.3):

  ```markdown
  <!-- section: Why it matters; reveal: step; effect: slide-in; duration: 250ms; class: dark -->
  ```

  The first value is always the Section title; there is no bare
  mode value in a section marker, so the mode is set with the
  `reveal:` key. `sequence` is NOT a section parameter — it is
  per-screen only (§4.2).
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
- A heading immediately followed by a paragraph — blank lines
  allowed, no other block between — is one panel, not two: the
  heading is the panel's lead-in and the paragraph its body.
  The panel's text is the two blocks' text together, so the
  font fit counts both. A comment between them breaks the
  grouping, so a per-panel reveal marker there still addresses
  the paragraph's own panel.
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
- HTML embeds (other than the `section:` and `reveal:` comment
  markers defined here), plugins: not supported by the spec. A
  renderer MAY pass through raw HTML at its own risk; the spec
  does not bless it and a second renderer is not required to
  match it. Custom CSS classes ARE supported — via `class:` /
  `panel-class:` (§2.4, §4.2) and the inline CSS block (§2.8).
  Per-panel classes on a single card are deferred to v0.2 (§11.3).
- Tables, footnotes, and math: if the Markdown parser supports
  them, they render as content *inside* a panel. Layout does not
  special-case them in v0.1.

### 2.8 Inline CSS block

A fenced ```css block as the LAST block in the file is the deck's
inline stylesheet:

````markdown
```css
.hero { background: #111; color: #fff; }
```
````

- The renderer MUST extract the block's text into `Deck.styles`
  (§1.1) and remove the block from the content: it never becomes
  a screen or a panel, and it MUST NOT count as content for
  layout (§7).
- Only one such block is recognised. If a ```css block is not
  the last block in the file, it is ignored as a stylesheet and
  renders as an ordinary code block (error-tolerant, §3.3). A
  deck with no trailing ```css block has `styles` = `''`.
- Inside the block, `@import` rules and `url()` references to
  external resources MUST be ignored by the renderer in v0.1 —
  not an error, the deck still renders. The external stylesheet
  (§11.4) is the way to load outside CSS.
- The block is presentation only (§11.2): it MUST NOT hide
  panels or change the step count.

## 3. Parsing

### 3.1 Pipeline

```
Markdown text
  → frontmatter extraction (§2.1)
  → inline CSS block extraction (§2.8)
  → screen splitting on `---` (§2.2)
  → per-screen: section marker, title, reveal marker, blocks
  → blocks → panels (§2.5, §2.6)
  → defaults resolution (§4.3) — each Screen.reveal fully computed
  → steps derived (§1.3)
  → Deck model (§1.1)
```

The parser MUST be a pure function of the Markdown text: no DOM,
no viewport, no network. The same text MUST always produce the
same model. Stylesheet *fetching* is not parsing: the parser
records the `stylesheets` list from frontmatter, and the renderer
fetches those URLs (§11.4). The parser never fetches anything.

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
  §4.3 applying. The rest of the deck parses normally. A malformed
  `defaults:` map in frontmatter is ignored for the bad key only.
- A ```css block that is not the last block in the file is
  ignored as a stylesheet (§2.8). `@import` and external `url()`
  inside the inline block are ignored (§2.8). A stylesheet that
  cannot be fetched is a renderer degradation (§11.4), not a
  parser error — the deck still renders.
- Unknown frontmatter keys are ignored (§2.1). Unknown reveal
  parameters are ignored (§4.2).
- A deck that parses to zero screens (empty file, frontmatter
  only) is an error the renderer MUST surface as an empty-deck
  state, not a blank page and not a crash.

## 4. Reveal markers — grammar

### 4.1 Form

A reveal marker is an HTML comment at the top of a screen (before
its first panel), with `key: value` pairs separated by semicolons.
Commas are used only inside a property's value — for the
`sequence` list (see §4.2). One character does one job: `;`
separates properties, `,` separates values inside a list.

```
<!-- reveal: step; effect: fade-in; duration: 1s -->
```

Formally:

```
marker    := "<!--" WS "reveal" ":" param-list WS "-->"
param-list:= param (";" param)*
param     := key ":" value | bare-value
bare-value:= "step" | "all"
key       := "sequence" | "effect" | "duration" | "direction" | "class" | "panel-class"
value     := <text up to the next ";" or "-->">
```

Rules:

- The **first** parameter MAY be a bare value (`step` or `all`);
  it sets the mode. If no bare value is given, the mode is `step`
  when any other parameter is present, and `all` when the marker
  is absent entirely.
- A `sequence` value is a comma-separated list of 1-based panel
  indices, e.g. `sequence: 3, 1, 2`. The commas inside it are
  part of that one value; they do not start a new parameter.
  Every other parameter takes a single value with no commas.
- Whitespace around keys, colons, semicolons, commas, and values
  is ignored. Keys are case-insensitive; values are
  case-insensitive where they are names (`fade-in`),
  case-sensitive where they are durations or numbers.
- A screen MUST have at most one reveal marker; if two appear,
  the first wins and the second is ignored.
- A `reveal:` comment line anywhere else in a screen — after
  the title, or between panels — is a **panel marker**: it
  applies to the next panel only, and only its `effect` and
  `duration` take effect. `mode`, `sequence`, `direction`,
  `class`, and `panel-class` in a panel marker are ignored:
  they are screen-level settings. `stack` as a panel marker's
  effect is likewise ignored — `stack` is screen-level only
  (§4.2): the panel falls back to the screen's effect, while a
  duration in the same marker still applies. A panel marker
  before the first panel of a screen is the screen's marker
  instead (it sits at the top of the screen), so a panel marker
  for the first panel goes after the screen title. A panel with
  no marker inherits the screen's effect and duration.

### 4.2 Parameters

| Parameter | Values | Default |
| --------- | ------ | ------- |
| mode (bare first value) | `step` \| `all` | `all` (no marker) |
| `sequence` | list of 1-based panel indices, e.g. `2, 1, 3` | document order (`1, 2, 3, …`) |
| `effect` | `fade-in` \| `slide-in` \| `zoom-in` \| `stack` \| `none` | `fade-in` |
| `duration` | CSS time, e.g. `1s`, `250ms` | `300ms` |
| `direction` | `left` \| `right` \| `up` \| `down` | `left` |
| `class` | space-separated class names, e.g. `hero dark` | none |
| `panel-class` | space-separated class names, applied to every panel on this screen | none |

- `sequence` lists the order panels reveal in. It MUST contain
  each panel index exactly once to be valid; an invalid sequence
  (missing, duplicate, or out-of-range index) is ignored in full
  and document order is used. The sequence does not change panel
  positions on the screen — only the order they appear in.
  Example: `<!-- reveal: step; sequence: 3, 1, 2; effect: fade-in; duration: 1s -->`
  reveals panel 3 first, then panel 1, then panel 2.
- `effect` names the enter animation (§8). `none` means panels
  appear instantly; steps still advance. A single panel can
  override the effect (and the duration) with its own reveal
  marker (§4.1); the screen's effect is the fallback.
  `stack` is the one effect a single panel CANNOT take: it is
  screen-level only (§4.1, §8).
- `direction` is the direction a `stack` front card flies when
  it is dismissed (§8): `left`, `right`, `up`, or `down`. It
  cascades like `effect` and `duration` (§4.3) and defaults to
  `left`. An invalid value is ignored and the default used. On
  any screen whose effect is not `stack`, `direction` is
  ignored — it changes nothing.
- `stack` lays a screen's panels out as a pile — a card deck —
  instead of a grid (§8): the front card is in flow, the cards
  behind peek at the top edge, scaled down and shaded darker
  per level, and only the front card plus two behind are ever
  visibly distinct. The pile order follows the reveal order:
  the first panel in `sequence` order is on top, so a stack
  screen with a `sequence` deals its cards in sequence order.
  Step count is unchanged: step *k* of a stack screen shows
  the pile with the first *k* cards already dismissed (§5).
- `duration` is the enter animation duration for each panel.
  Values outside 0–2000ms MUST be clamped into that range.
  A malformed duration is ignored and the default used.
- `class` puts class names on the screen element; `panel-class`
  puts class names on every panel of this screen (§11.3). `class`
  cascades from Section to screen: a screen carries its Section's
  `class:` (§2.4) followed by its own `class:`, in that order.
  `panel-class` does not cascade — it is set on the screen marker
  only — and a screen's `class` does not inherit to its panels
  (use `panel-class:` for that). They are styling, not reveal
  settings: they never change reveal, and no reveal setting
  changes them. Class names are space-separated; a token that is
  not a valid CSS class name MUST be ignored. `sequence` takes
  commas inside its value; `class` and `panel-class` take spaces,
  never commas.
- Unknown keys MUST be ignored, never an error — this is how
  the grammar extends without breaking old decks.

### 4.3 Defaults — the behaviour cascade

Reveal settings cascade from the deck down to the screen. The
two cascades in this spec are separate: this is the *behaviour*
cascade (which panels reveal, how, how fast). The *style*
cascade (which CSS applies) is §11.2. Do not conflate them.

Precedence, most local wins, **per property** (not whole-object
replace):

| Level | Source | Sets |
| ----- | ------ | ---- |
| 1 (lowest) | Spec base defaults | mode `all`, effect `fade-in`, duration `300ms`, direction `left`, sequence = document order |
| 2 | Frontmatter `defaults:` (§2.1) | `reveal`, `effect`, `duration`, `direction` |
| 3 | Section marker (§2.4) | `reveal`, `effect`, `duration`, `direction` |
| 4 (highest) | Screen reveal marker (§4.1) | mode, `sequence`, `effect`, `duration`, `direction` |

Rules:

- A level that sets only one property overrides only that
  property. Example: deck defaults say `effect: fade-in;
  duration: 500ms`, a Section says `duration: 250ms`, a
  screen says nothing — that screen reveals with `fade-in`
  at `250ms`. A screen that says `duration: 1s` keeps the
  deck's `fade-in`.
- `sequence` is NOT inheritable: only the screen's own reveal
  marker sets it, and it is validated per §4.2. A `sequence`
  key in frontmatter `defaults:` or in a section marker MUST
  be ignored.
- `panel-class` does not participate in this cascade (§4.2).
  `class` DOES cascade, but separately from reveal: a screen
  carries its Section's `class:` followed by its own (§4.2,
  §11.3). The class cascade never changes mode, sequence,
  effect, or duration — it only decides which classes the
  screen element carries.
- The parser MUST resolve the cascade at parse time (§3.1):
  `Screen.reveal` in the model (§1.1) is fully computed, and
  the renderer MUST NOT re-resolve defaults. A fixture deck
  MUST parse to the expected resolved reveal settings (§9).

Base case, with no frontmatter defaults, no section parameters,
and no screen marker (or `<!-- reveal: all -->`): all panels
visible on arrival, one step for the screen. `<!-- reveal:
step -->`: one panel per step, `fade-in`, `300ms`, document
order, direction `left` (irrelevant unless the effect is
`stack`).

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
- Focus survives a re-render: the panels rebuild on every step and
  screen change, so if focus is inside a panel when one happens,
  the renderer restores it afterwards — to the same element when
  its panel is still visible, otherwise to the screen region. On a
  stack screen the same rule covers the dismiss swap: a focused
  card that flies away leaves focus on the screen region (issue #79).
- On a `stack` screen (§4.2, §8) the step model is the same
  count with a different picture: step *k* shows the pile with
  the first *k* cards dismissed. Moving forward dismisses the
  front card — it flies away in the screen's `direction` over
  the screen's `durationMs` — and the next card rises to the
  front; moving backward re-deals the dismissed card, flying
  it back in from the same direction while the front card
  settles back down. The pile is a pure function of (screen,
  stepIndex): entering a stack screen, jumping to it, or
  deep-linking to `#/<screen>/<step>` shows the pile with the
  first *stepIndex* cards already dismissed, with NO animation.
  Animation happens only on a genuine step forward/back.
  A stack screen never scrolls on a step: the pile does not
  move vertically, so there is no reveal-scroll (§7.4) for it.
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
| `Space` | Advance one step (Next) — only when focus is on the screen region or the deck itself; when focus is on a control (button, link, menu item, …) Space activates that control instead (issue #73) |
| `PageDown` | Advance one step (Next) |
| `PageUp` | Retreat one step (Previous) |
| Click / tap, right half | Advance one step (Next) |
| Click / tap, left half | Retreat one step (Previous) |
| Horizontal swipe left | Advance one step (Next) |
| Horizontal swipe right | Retreat one step (Previous) |
| `Home` | Start — first step of the first screen |
| `End` | End — last step of the last screen |
| Click the step count | Open the navigation menu (§6.6) |
| `+` / `-` | Zoom type in / out (§7.3) |

- The deck host is a delegating tab stop, not a bare one: the
  shadow root is attached with `delegatesFocus: true`, so
  focusing the host — by Tab, by click, or by `focus()` —
  moves focus to the first focusable element inside, the
  screen region (§5, labelled `Screen N of M: …`), and Tab
  never stops on the host itself, which has no role and no
  name (issue #81). The host keeps `tabindex="0"` so the
  delegating stop exists in the tab order at all.

### 6.2 Transitions

Let the current state be `(s, k)` — screen *s*, step *k* — with
`steps(s)` the step count of screen *s*.

- **Next:** if `k + 1 < steps(s)`, go to `(s, k + 1)` (reveal
  the next panel). Else if `s + 1 < screenCount`, go to
  `(s + 1, 0)`. Else (last step of the last screen): no-op,
  and the renderer SHOULD show an end state (e.g. a "Start over"
  button that returns to the first step). Looping is NOT the default; an
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
  a progress indicator, and Start / End in the navigation
  menu (§6.6) — not four loud buttons.
- Controls auto-hide on idle on desktop and reappear on
  pointer move; they MUST NOT auto-hide on touch, where
  there is no hover to bring them back.
- While idle-hidden the controls MUST NOT be focusable:
  they are `visibility: hidden` — not merely transparent —
  so Tab skips them and no invisible focus ring can land on
  them. The hide is still a 300ms opacity fade (visibility
  flips only after the fade completes), and the controls
  keep their height while hidden, so the bottom reserve
  (§7.2) is unchanged.
- Keyboard use re-shows the controls: any keypress
  (including Tab) and any focus entering the deck re-arms
  the idle timer.
- The progress indicator shows steps, not screens (§1.3):
  dots or a thin progress bar in v0.1. A full grid overview
  is v0.2.

### 6.6 Navigation menu

The step-count indicator in the bottom nav is a button. It
opens a menu that jumps across the deck without stepping
through it — the way Start and End are reached on screen.

- **Trigger:** clicking (or tapping) the indicator toggles
  the menu; clicking it again closes it. The trigger is a
  real `<button>` with `aria-haspopup="menu"` and
  `aria-expanded` reflecting the menu's state.
- **Contents, in deck order:** "First screen", one item per
  Section, "Last screen". A Section's item carries the
  Section's name as its text. A Section with no title (§2.4)
  is labelled `Section N`, counting Sections from 1.
- **Targets:** "First screen" goes to the first step of the
  first screen (the same as Start, §6.2); a Section goes to
  the first step of that Section's first screen; "Last
  screen" goes to the last step of the last screen (the same
  as End, §6.2). A jump shows the target with no reveal
  animation (§5). Selecting any item closes the menu.
- **Positioning:** the menu sits just above the bottom nav —
  its bottom edge aligned to the top edge of the controls
  bar with one `--wd-space` of margin between. The gap is
  token-derived (the bottom reserve plus half the space
  unit), never a fixed pixel value, so it scales with the
  screen like the rest of the chrome (§7). The menu MUST
  NOT overlap the controls bar.
- **Scrolling:** the menu's height is capped at
  `--wd-nav-menu-max-height` (`min(50vh, 420px)`) and it
  scrolls within itself (`overflow-y: auto`), so a deck with
  many Sections never grows the menu past the screen.
- **Item size and current highlight:** each item is a touch
  target at least 48px tall — a touch above the 44px floor
  (§7.3) — with type at 16–20px, both scaling with the
  viewport. The current item is distinguished by its
  background highlight only, an ocean-green tint in both
  themes: no border, no rounded corners.
- **Closing:** Escape closes the menu and returns focus to
  the indicator; clicking or tapping outside the deck closes
  it; focus landing outside the menu (and outside the
  indicator) closes it; tapping the screen while the menu is
  open only closes it (it MUST NOT also navigate); selecting
  an item closes it; any other navigation (Next, Previous,
  Home, End, a deep link) also closes it.
- **Focus and current state:** when the menu opens, focus
  moves into it — to the current Section's item, or the
  first item if the current screen has no Section. When the
  menu closes, focus returns to the indicator. The item for
  the Section containing the current screen is marked
  `aria-current="true"` and visually highlighted, so the
  reader can see where they are.
- **Keyboard:** the menu carries `role="menu"` and its items
  `role="menuitem"`, so it MUST honour the menu keyboard
  contract: ArrowDown/ArrowUp move focus between items,
  wrapping at the ends; Home/End jump to the first/last
  item. While the menu is open, ArrowUp/ArrowDown/Home/End
  MUST NOT scroll the screen or jump the deck — the host's
  walk keys are suspended for those keys until the menu
  closes. Focusing an item scrolls it into view, so the
  menu's own scroll is reachable by keyboard.
- **Idle:** while the menu is open the controls MUST NOT
  auto-hide (§6.5) — the menu is anchored to them.

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
4. Choose a type scale: the largest body size that fits the
   *total* content of the screen — all panels, visible or not
   yet revealed — in the container (content-fit — the fit is
   computed once per screen from the total text of all its
   panels, between the 14px floor in §7.3 and the 32px
   ceiling), then measure real overflow of the full content
   after rendering and shrink further if the estimate was
   optimistic. The fitted size is FIXED for the screen: it
   MUST NOT change as steps reveal more panels. The renderer
   MUST NOT grow type past the fit; growing is the fit's job,
   on the next layout pass.
5. Emit layout as CSS variables (`--wd-cols`, `--wd-font`,
   `--wd-gap`, …); CSS does the distribution. No JS measuring
   per frame.
6. Re-run on resize / orientation change / container change
   (`ResizeObserver`), debounced, on screen change, and on
   zoom change. NEVER on step change. No layout shift after
   the first paint if the first measurement happens before paint.
7. Reserve the bottom controls: the navigation controls
   (progress bar + step count + Previous/Next) overlay the
   bottom of the screen, so the fit MUST subtract their height
   plus a small clearance from the available height before
   sizing, and the screen's scrollable content MUST end with
   that much clearance, so panels never sit underneath the
   controls — including when scrolled to the bottom. The
   clearance MUST be part of the scrollable content (a trailing
   in-flow spacer), NOT bottom padding on the screen: padding
   on a flex scroll container is not scrollable in
   Safari/WebKit, so a padding-based clearance lets the last
   panel scroll only as far as the container's bottom edge —
   underneath the controls. If the controls' height varies
   (e.g. auto-hide on idle), use their visible height when
   shown and keep the clearance when they reappear; re-check
   the fit when the controls show or hide.
8. A `stack` screen (§4.2) lays its panels out as a pile, not
   a grid: the front card is in flow and sets the pile height;
   the cards behind are absolutely positioned over it, aligned
   with the front card's top edge and lifted by a per-level
   peek offset, so their top edges show. The pile container
   carries top padding equal to the full peek (the number of
   visible cards behind × the offset), so the peek never
   overflows the screen's scroll container — the screen needs
   no overflow change. The font-fit (rule 4) still counts the
   total text of ALL panels, as for every screen, and the
   measurement pass measures the pile as rendered: its height
   is the front card's (a taller card behind still counts,
   because it extends the pile's scrollable overflow — the
   pass shrinks type until the tallest pile card fits). The
   pass MUST NOT count dismissed cards: they are translated
   far off the pile, and an up/down dismissal would otherwise
   inflate the scrollable overflow and shrink the font for a
   pile that fits. A later, taller front card that still
   overflows at the floor scrolls internally, as usual (§7.4).

### 7.3 Type floor and zoom

- **Type floor (settled, Samir's decision 2026-11-26, superseding brief §15.6's 12px): 14px minimum.**
  Body text MUST NOT render below 14px on any container. The
  engine degrades to scroll (§7.4) sooner rather than shrink
  type below the floor. The floor is 14px on every
  container; what grows on larger containers is the *fit* — a
  sparse screen grows toward the 32px ceiling instead of
  sitting at a formula floor.
- **Root font size (settled 2026-11-26, issue #76): the fitted
  type scales with the user's root font size.** The renderer
  reads `getComputedStyle(document.documentElement).fontSize`
  on every layout pass, and the engine multiplies the fitted
  sizes by `(rootPx / 16)` — floor, ceiling, title, code and
  small text alike, so the fitted range keeps its 2.29× ratio
  at any root. The factor is never below 1: a smaller root
  still gets the settled 14px / 32px sizes. At the 16px
  default root the sizes are unchanged. Zoom still multiplies
  on top of the scaled size, bounded by the scaled floor
  below. The demo opts into OS text scaling with
  `<meta name="text-scale" content="scale">` (Chrome 146+;
  Safari/Firefox ignore it), so the root the fit reads already
  carries the user's OS preference where the browser supports
  it.
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
- On a screen carrying the `dark` class, the chrome that sits on
  the screen background MUST use the dark theme: the scroll cue
  fades to the dark background, and the cue text and the section
  label use the dark theme's muted (7.5:1 on the dark background,
  AAA; 6.9:1 on the dark panel). The light muted (2.63:1 on dark)
  MUST NOT be used there (issue #74).
- The scrollbar thumb MUST clear 3:1 against the screen
  background in both themes — including on a dark screen in a
  light deck, whose background is dark. The thumb has its own
  colour token (`--wd-color-thumb`, #7A7A7A in both themes:
  4.10:1 on the light background, 4.12:1 on the dark
  background); the border colour MUST NOT be used for it (it
  was 1.21:1 on light, 1.31:1 on dark) (issue #80).
- Reveal scrolls to the newly revealed panel: when a step
  reveals a panel that is not fully visible in the screen's
  scroll viewport, the renderer scrolls the screen just far
  enough to bring that panel into view, clear of the bottom
  controls — the minimal-scroll (`scrollIntoView({
  block: 'nearest' })`) semantics: no scroll at all when the
  panel is already fully visible, and only as far as needed
  otherwise. The scroll is smooth unless
  `prefers-reduced-motion` is set, in which case it is
  instant (§8). It MUST NOT run during the font-fit
  measurement pass (§7.2), which reveals all panels
  synchronously.
- Panel content is top- and left-aligned, always: panels
  start at the top of the screen and the first column starts
  at the left edge, so revealing another panel never moves the
  panels already visible. (This reverses the first draft,
  which centred content when there was spare height — that
  made the whole screen jump on every reveal, which is
  distracting while reading.) The one exception is the hero
  (§7.4, below): a single panel is centred, because nothing
  is ever revealed into it.
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
- **Enter (`zoom-in`):** the panel grows from slightly smaller
  (scale ~0.92) with a fade. Transform + opacity only, like
  the other effects.
- **Enter (`stack`):** the screen is a pile (§4.2, §7.2), not a
  grid. Per level behind the front card: the card is lifted
  10px (its top edge peeks above the front card), scaled down
  by 0.03, and shaded darker by 0.07 brightness. Only the
  front card plus 2 behind are ever visibly distinct — deeper
  cards share the third level's transform, so a long screen
  does not spread the pile. Advancing a step dismisses the
  front card: it flies away in the screen's `direction`
  (default `left`) — translating 130% of its own size in that
  direction, rotating ±6°, fading to 0 — over the screen's
  `durationMs`, ease-in; the next card rises to the front
  (scale to 1, shade to full, ease-out) while the card behind
  it shifts up one level (ease-in-out). Going back re-deals
  the dismissed card: it flies back in from the same
  direction, ease-out, and the front card settles back down a
  level. The pile is a pure function of (screen, stepIndex)
  (§5): entering or jumping to a stack screen shows the pile
  with the first `stepIndex` cards already dismissed, with no
  animation. The pile numbers (10px, 0.03, 0.07, 2) are
  Proposal tokens (`--wd-stack-*`, §11.2) — the pile's look is
  not settled.
- **Enter (`none`):** the panel appears instantly.
- **Exit:** the reverse of entry on Previous — the panel plays
  its enter animation backwards. Screens cross-fade / slide a
  short distance on screen change; the direction follows the
  walk (forward = in from the right, back = in from the left).
- **Reduced motion:** `prefers-reduced-motion: reduce` → no
  enter / exit animation at all. Steps still advance; content
  simply appears. Reveal auto-scroll is instant, never smooth,
  under reduced motion. This is not optional. On a `stack`
  screen the fly/zoom transitions are instant in the same way
  — the state changes immediately — but the pile layout itself
  (peek, shade, perspective) is not motion and stays.
- **Performance:** transform + opacity only (compositor-
  friendly). No layout animation. Animations MUST hold 60 fps
  on a mid-range phone; if they cannot, the engine drops to
  the static rung (§7.5). The one exception is the `stack`
  promote: it also animates `filter: brightness()` by a single
  0.07 step, so the card lightens as it rises to the front —
  the shade is the card's rest state, and a separate shade
  overlay would add a node per panel.

## 9. Conformance and testing

A renderer conforms to this spec when, for every fixture deck:

- the parsed model matches the expected model exactly
  (screens, Sections, panels, reveal settings, steps) —
  including resolved reveal settings from the defaults
  cascade (§4.3), class names (§11.3), the `stylesheets`
  list, and the inline `styles` text (§2.8);
- the walk state machine (§6.2) produces the expected
  `(screenIndex, stepIndex)` for a scripted input sequence;
- at 360 px, 768 px, and 1440 px widths, 1–8 panels per screen
  lay out with no clipping, no overlap, no horizontal scroll,
  and type at or above the floor;
- internal scroll, stepwise reveal, Next / Previous / Start /
  End, keyboard + swipe, deep links, and reduced-motion all
  work;
- a stylesheet that cannot be fetched degrades to the default
  theme and never produces a blank deck (§11.4), and deck CSS
  stays scoped to the deck container and never hides a panel
  (§11.2);
- the no-JS render is a readable linear document.

Fixture decks (to be written in Phase 2, against this spec):

- `examples/walkdown-itself.md` — the first real deck, a deck
  explaining Walkdown itself (brief §15.10). It is also the
  demo deck on GitHub Pages.
- A 1-panel hero deck, a 3-panel deck, a 6-panel deck, a
  stepped-reveal deck (with `effect` / `duration` / `sequence`),
  a long-content deck that must scroll internally, and a
  multi-Section deck.
- A defaults-cascade deck (frontmatter defaults overridden by
  a Section and by a screen, with the resolved settings
  asserted per §4.3), and a styled deck (external stylesheet
  + trailing ```css block + `class:` / `panel-class:`).

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
5. **Per-panel classes:** deferred to v0.2 (§11.3). v0.1 has
   no syntax for a class on a single card; `panel-class:`
   applies to every panel on a screen. The v0.2 syntax is
   undecided and MUST NOT be invented in v0.1.

Settled 2026-11-24, removed from the open list above: reveal-marker
properties are separated by `;` and commas are used only inside
a property's value, for the `sequence` list — e.g.
`<!-- reveal: step; sequence: 3, 1, 2; effect: fade-in; duration: 1s -->`.
`sequence` is the reveal order (panels appear in that order,
positions unchanged). This replaces the first draft's
comma-separated syntax.

## 11. Styling

### 11.1 Two cascades, kept separate

- The *behaviour* cascade (§4.3) decides reveal: mode,
  sequence, effect, duration. It is resolved by the parser.
- The *style* cascade (this section) decides CSS: which
  stylesheets load, in what order, and which classes the
  deck's elements carry. It is applied by the renderer.

A `class:` never changes reveal, and a reveal setting never
changes CSS. The two cascades share the marker grammar
(§4.1) and nothing else.

### 11.2 The style cascade

In load / application order, most deck-specific last:

1. **Renderer defaults** — the built-in light / dark theme
   (§2.1 `theme`). Always present.
2. **External stylesheet(s)** — frontmatter `stylesheets:`
   (§2.1, §11.4), in listed order.
3. **Inline CSS block** — the trailing ```css block (§2.8).
   It is the most deck-specific source, so it wins over
   the external stylesheet on equal specificity.

- The renderer defaults' theme values (layer 1) are applied
  as a stylesheet layer inside the Shadow DOM, not as inline
  style: each theme variable (`--wd-color-*`,
  `--wd-font-family-*`) has a private alias (`--_wd-…`) whose
  fallback is the theme value, and the chrome reads the alias.
  A deck stylesheet (layers 2–3) can therefore set a theme
  variable on `.wd-deck` — or on a screen or a panel — and the
  override wins without `!important`; a page can likewise set
  one on an ancestor of the host element. Layout variables
  (`--wd-font-body`, `--wd-reserve-bottom`, …) are measured per
  pass and still go inline on `.wd-deck` (§7.2).

Classes are hooks, not a layer: a `class:` or `panel-class:`
(§11.3) names classes that the stylesheets above define.
An element carrying a class no stylesheet defines renders
with the renderer defaults — a missing class is never an
error.

### 11.3 Classes and scoping

- There is no section element in the v0.1 renderer: sections
  are a grouping in the model (§1.1), rendered as flat screens.
  A section's `class:` (§2.4) is therefore carried by each of
  its screens — a screen element carries its Section's classes
  followed by its own `class:` (§4.2) — and every panel on a
  screen carries that screen's `panel-class:` (§4.2).
- Deck CSS MUST be scoped to the deck container. The
  reference renderer MUST use Shadow DOM for the deck
  (it is Web Components — settled, brief §15.1); a renderer
  without Shadow DOM MUST rewrite deck selectors under the
  deck container instead. Deck CSS MUST NOT affect the
  renderer chrome or the host page, and host-page CSS MUST
  NOT leak into the deck except through the deck's own
  stylesheets.
- Deck CSS is presentation only. It MUST NOT hide panels
  (`display: none`, `visibility: hidden`, zero size) or
  change the step count. A class that hides a panel breaks
  navigation (§6) and is an author error the renderer
  SHOULD guard against where it can, and the spec does not
  bless it anywhere.
- Per-panel classes (a class on one specific card) are
  deferred to v0.2 (§10.5). v0.1 has no syntax for them.

### 11.4 External stylesheet — loading

- Fetching is the renderer's job, not the parser's (§3.1).
  The parser records the `stylesheets` list; the renderer
  fetches each URL, in listed order, after parsing.
- Relative paths resolve against the deck's URL. Remote
  URLs MUST be `https`; an `http:` URL MUST be ignored
  (and the deck still renders).
- Failure degrades, never fails the deck: a stylesheet
  that cannot be fetched (404, offline, blocked) MUST be
  skipped, the deck MUST render with the default theme
  plus whatever stylesheets did load, and the renderer
  SHOULD log a console warning. A missing stylesheet
  MUST NOT produce a blank deck or an error screen.
- A stylesheet load MUST NOT block the first paint of the
  deck's content beyond what the renderer's normal
  loading state already does; the deck content is
  readable with the default theme while stylesheets load.

---

*Next: Phase 2 — Core (parser + model + layout engine), per
brief §13. The spec is the test: fixture decks are written
against it, and the parser must produce the model it defines.*
