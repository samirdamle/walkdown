# Walkdown — Design Policies

- **Status:** Proposal for review — not normative yet
- **Date:** 2026-11-25
- **Owner:** Samir Damle
- **Repo:** `samirdamle/walkdown` (public, MIT, default branch `main`)
- **Tracking:** Issue
  [#9](https://github.com/samirdamle/walkdown/issues/9); builds on
  [docs/spec.md](spec.md) and [docs/product-brief.md](product-brief.md)
- **Normative language:** the key words **MUST**, **MUST NOT**,
  **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as
  in RFC 2119 — but only once this document is approved and folded
  into the spec. Until then, every number below is a proposal unless
  it is marked **[Settled]**.

## 0. How to read this document

This document answers one question: *how big should everything be,
relative to the screen it is on?* It is a policy document, not a
spec and not code. After Samir reviews it, the policies here will be
turned into structured policies that can be implemented in code and
enforced (§8 is written to make that conversion mechanical).

Two labels appear throughout:

- **[Settled]** — a decision Samir has already made, in the brief
  §15 or in the spec. A policy here MUST NOT contradict it. The
  settled numbers are: the 14px type floor (Samir's decision
  2026-11-26, superseding brief §15.6's 12px), `+` / `-`
  zoom, fluid re-layout with no fixed breakpoints as the primary
  mechanism, internal scroll within a screen, the degradation
  ladder, a minimum readable column width of roughly 240–280 CSS
  px, and the styling rules of spec §11 (scoped CSS, external
  stylesheet first, inline CSS block last).
- **[Proposal]** — a number or rule this document proposes. The
  reason for it is stated next to it, and the ones that needed
  Samir's call were collected in §9; he settled all ten on
  2026-11-25 by accepting their recommended defaults.

**Units.** Every size in this document is relative to the deck's
container, not to an assumed device. The formulas are written in
`vw` / `vh` for the common case — a deck filling the screen — but
the renderer MUST use container query units (`cqw` / `cqh`) when
the deck is embedded in a page, a card, or an iframe (spec §7.2
measures the container, not the window). Read `vw` as "1% of the
container width" and `vh` as "1% of the container height" throughout.
Computed values in the tables assume a full-screen deck at the
stated width and height: phone 360 × 640, tablet 768 × 1024,
desktop 1440 × 900.

**One scale, not ad-hoc values.** Nothing in Walkdown is sized in
isolation. Type, spacing, radius, and image caps all come from the
same small set of tokens (§8). If a value is not in §8, it does not
exist in the renderer. An author who wants a different look changes
a token or a class (§7, §11 of the spec) — never a one-off pixel
value.

## 1. Principles

1. **Readability first.** A deck that cannot be read comfortably
   is not a deck, however pretty it is. Every policy below is
   judged against reading first: type never goes below a floor,
   lines never get too long or too short, contrast is never
   sacrificed for style. When readability and density conflict,
   readability wins and the screen scrolls.
2. **Everything relative.** No fixed pixel sizes for layout.
   Sizes are functions of the container (`clamp()` between a
   floor and a ceiling, driven by container width and height),
   so a deck reshapes itself continuously instead of jumping
   between three frozen layouts. Fixed pixels appear only as
   floors and ceilings — the guard rails, never the size itself.
3. **Simplicity.** One type scale, one spacing scale, one radius
   rule, one grid rule. A reader should feel the same hand on
   every screen of every deck. Variety comes from content and
   from the author's classes, not from the renderer inventing
   new sizes per screen.
4. **Elegance is restraint.** On a large screen, things stop
   growing. A line of text does not get longer just because the
   monitor is wider; a card does not get rounder just because
   there is room. Every size in this document has a ceiling,
   and the ceiling is a design decision, not a technical limit.
5. **Degradation is designed.** When space runs out, Walkdown
   gives things up in a fixed order (§6.3), and every rung of
   that ladder still looks intentional. Nothing is ever clipped,
   overlapped, dropped, or pushed off-screen horizontally.

## 2. Type

### 2.1 The fluid type scale

Body text is the reference size. Every other size is defined
relative to it, so the whole scale moves together when the
container or the panel count changes.

| Role | Formula (preferred) | Min | Max |
| ---- | ------------------- | --- | --- |
| Screen title | `clamp(24px, 3.2vw + 10px, 56px)` × title factor | 24px | 56px |
| Panel body | content-fit: largest size that fits the screen's total content (§2.2), less the bottom-controls reserve | 14px **[Proposal]** | 32px **[Proposal]** |
| Panel code | `clamp(14px, 1.1vw + 6px, 18px)` | 14px | 18px |
| Caption / small text | `14px` (fixed — the floor raise makes its min and max coincide, so the old `0.85vw + 7px` preferred term can never apply) | 14px | 14px |

Why these shapes: the preferred term grows with the container
(`vw`), so type grows as the screen grows; the floor stops it
getting unreadably small on a phone; the ceiling stops it getting
absurdly large on a wide monitor. A linear `vw` term (rather than
a stepped breakpoint scale) is what makes the growth feel
continuous — the reader never sees type jump.

**The 14px floor [Settled].** No text anywhere renders below
14px — that is the settled absolute floor (Samir's decision
2026-11-26, superseding brief §15.6's 12px; spec §7.3). The
table's minima coincide with the floor now: code's old 13px
minimum is gone, because a 13px token would be a lie under a
14px absolute floor, and small text is a fixed 14px. Body
text may reach the 14px floor when the content is dense — the
fit only goes there when nothing bigger fits, and a dense
screen then scrolls at 14px rather than shrinking further.
A policy floor may be stricter than the settled floor,
never looser.

**Panel-count factor [Proposal].** A screen with more panels has
less room per panel, so its type is smaller. For the title the
layout engine (spec §7.2) still scales the preferred term and
the ceiling by the title factor, never the floor. For the body
the count factor is subsumed by the content-fit (§2.2): more
panels means more content to fit, so the fit shrinks the type
by itself, and the old `1.25vw + 7px` body formula is gone —
a sparse screen now grows to the 32px ceiling at any width,
and only a dense screen shrinks.

| Panels | Count factor | Title factor |
| ------ | ------------ | ------------ |
| 1 | 1.00 | 1.00 |
| 2–3 | 0.92 | 0.95 |
| 4–6 | 0.84 | 0.88 |
| 7–8 | 0.78 | 0.85 |

Why the title shrinks less than the body: the title is one line
(or two) at the top of the screen, shared by all panels. Shrinking
it as fast as body text would make the screen feel empty at the
top and cramped at the bottom. The title factor is gentler for
exactly that reason.

When even the floor does not fit — which happens for dense
screens on narrow containers — the floor wins and the screen
scrolls sooner. That is correct behaviour, not a bug:
the engine degrades to scroll rather than shrinking type below
the floor (spec §7.3).

### 2.2 Computed values — judge these by eye

Computed from the formulas above at the three widths the spec
tests at (360 / 768 / 1440 px) — except panel body, which is
content-fit, not a viewport formula. If a number in this table
looks wrong, the formula is wrong — say so in review.

**Screen title** (px):

| Panels | 360 px | 768 px | 1440 px |
| ------ | ------ | ------ | ------- |
| 1 | 24 | 34.6 | 56 |
| 2–3 | 24 | 32.9 | 53 |
| 4–6 | 24 | 30.4 | 49.3 |
| 7–8 | 24 | 29.4 | 47.6 |

**Panel body** (px) — content-fit **[Proposal]**. The engine
chooses the largest size, 14px floor to 32px ceiling, whose
estimated screen height fits the container (line-height 1.55,
average glyph 0.5em wide, 60ch line-length cap, column count
from the panel total). The renderer then measures the real
overflow and shrinks further if the estimate was optimistic.
The fit runs on the TOTAL content of all panels on the screen
and is fixed for the screen — revealing another panel never
changes the type size; the grid, and every visible panel's
position in it, stays put. The fit also reserves the bottom
controls' height plus a small clearance from the available
height, so panels never sit underneath the controls; the table
below is the core fit before that reserve, so where content is
near the boundary the rendered size is a touch smaller.
Examples, 120 characters per panel:

| Panels | 360 px | 768 px | 1440 px |
| ------ | ------ | ------ | ------- |
| 1 | 32 | 32 | 32 |
| 2–3 | 24.6 | 30.1 | 32 |
| 4–6 | 15.8 | 22.6 | 31.7 |
| 7–8 | 12 | 17.4 | 25.4 |

And by amount of content, at 1440×900: one panel of 30
characters → 32px (the ceiling); four panels of 200 characters
each → 26.2px; eight panels of 900 characters at 360×640 →
14px, scrolling. Read the 360 px column as the fit doing its
job: on a phone a sparse screen grows to the ceiling, and only
a dense screen reaches the floor — a sparse phone screen has
no reason to sit at 14px when 32px fits.

**Panel code** (px): 14 at 360 px, 14.4 at 768 px, 18 at 1440 px.
**Caption / small text** (px): 14 at every width — the floor
raise makes its min and max coincide, so small text is a
fixed 14px.

### 2.3 Line-height, line length, letter-spacing

- **Line-height [Proposal].** Body 1.55, code 1.5, captions 1.4,
  screen title 1.1. Why: body text needs air between lines or a
  dense panel becomes a grey block — 1.55 is the middle of the
  range readers find comfortable (1.5–1.6) and it scales with
  the font size, so it needs no separate clamp. Titles are short
  and large, so 1.1 keeps a two-line title compact; any looser
  and a title starts to look like two separate thoughts.
- **Line length [Settled 2026-11-25].** A hero or single-column screen:
  45–75 characters per line, ideal 60. A multi-column panel:
  at least 30 characters per line. Why: below ~30 characters,
  words break awkwardly and the eye jumps lines too often;
  above ~75, the eye loses its place coming back to the start
  of the next line. The panel minimum is enforced by the
  minimum column width (§4): a column narrower than 260px
  cannot hold 30 characters of 14px text, so the engine drops
  a column instead of narrowing one.
- **Letter-spacing [Proposal].** Body and captions: `0` — normal
  spacing reads best at text sizes. Screen titles above 32px:
  `-0.015em` — large type looks looser than it is, and a hair
  of tightening keeps a big title feeling like one unit. Never
  positive letter-spacing on body text: it is a styling trick
  that costs readability.

### 2.4 Zoom — how `+` / `-` interact with the clamps

Zoom is a reader control, not an author setting **[Settled]**
(spec §7.3). It multiplies the *computed* size — the number
that comes out of the clamp — by a zoom factor, after the clamp
has been applied:

- One step is ×1.1 (multiplicative) **[Settled 2026-11-25]** — the spec
  says "each step ~10%", and multiplicative steps feel even:
  four steps in is ×1.46, four steps out is ×0.68, and every
  step feels the same size to the reader. Additive 10% steps
  would feel smaller as you zoom in.
- Bounded at ±4 steps from default **[Settled]** (spec §7.3:
  "at least ±4 steps"). Zoom persists across screens within a
  session.
- The zoomed size is clamped below by the absolute 14px floor
  — zooming out can never take any text below 14px — and has
  no upper clamp except the layout itself: zooming in re-runs
  layout and may push a screen into internal scroll. That is
  correct behaviour, not a bug (§6.3).
- Zoom is a multiplier on the base size, so it scales title,
  body, code, and captions together. The scale keeps its
  proportions at every zoom level; nothing is left behind.
## 3. Spacing

### 3.1 One spacing scale

All spacing comes from one base unit, so gaps and padding grow
and shrink together and the deck never has one tight corner and
one loose one.

**Base spacing unit [Proposal]:**
`--wd-space: clamp(8px, 1vw + 4px, 16px)` — 8px at 360 px,
12px at 768 px, 16px at 1440 px. Why this shape: spacing should
grow with the screen, but slower than type — a phone needs
nearly as much breathing room as a desktop in absolute terms,
because the reader's thumb and eye are the same size. The unit
grows by 2× across the tested range while type grows by ~1.4×;
that difference is deliberate.

**Token scale [Proposal]** — multiples of the base unit:

| Token | Multiple | Used for |
| ----- | -------- | -------- |
| `--wd-space-xs` | 0.5× | Nested-list indent gaps, caption margins |
| `--wd-space-sm` | 0.75× | Gaps inside a panel, between a caption and its image |
| `--wd-space-md` | 1× | The base unit itself |
| `--wd-space-lg` | 1.5× | Panel gaps in sparse layouts |
| `--wd-space-xl` | 2× | Title-to-panel gap on wide screens |
| `--wd-space-2xl` | 3× | Hero breathing room |

If a spacing value is not a token multiple, it does not belong
in the renderer. Authors who want different spacing change the
unit (via a class or a theme variable), not individual gaps.

### 3.2 Screen padding, gaps, and panel padding

| What | Formula | Min | 360 px | 768 px | 1440 px | Max |
| ---- | ------- | --- | ------ | ------ | ------- | --- |
| Screen padding, inline (left/right) | `clamp(16px, 4vw + 4px, 48px)` | 16px | 18px | 35px | 48px | 48px |
| Screen padding, block (top/bottom) | `clamp(16px, 3vh + 8px, 48px)` | 16px | 27px | 39px | 35px | 48px |
| Gap between panels | `clamp(12px, 2vw + 4px, 28px)` | 12px | 12px | 19px | 28px | 28px |
| Gap, title to panels | `clamp(16px, 2.5vw + 6px, 36px)` | 16px | 16px | 25px | 36px | 36px |
| Padding inside a panel | `clamp(16px, 2vw + 8px, 32px)` | 16px | 16px | 23px | 32px | 32px |

Block padding is computed at the assumed heights of §0
(640 / 1024 / 900 px) — it is driven by height, so a short
landscape screen gets less top and bottom padding than a tall
portrait one. That is the point: padding follows the dimension
it protects.

Why these numbers: screen padding is the largest spacing in the
system, because it is the frame around the whole screen — it
must read as a frame, not as an accident, so it starts at 16px
even on a phone and grows to 48px, then stops. Panel gaps are
smaller than screen padding at every width, so panels read as
belonging to the screen rather than floating in it. Inside-panel
padding is generous (16–32px) because a card's job is to give
one idea room — a cramped card reads as a list item that got
lost, not as a card.

**Safe areas [Proposal].** Screen padding MUST include the
device safe areas: effective padding on each edge is
`max(policy padding, env(safe-area-inset-*))`. A phone with a
notch or a home indicator never has content tucked under it,
and the rule costs nothing on devices without safe areas.

**Order of giving way.** When space gets tight, spacing gives
way before type does **[Settled]** (brief §7.1: "Gutters shrink
before type does; type shrinks before layout degrades"). The
gaps above shrink to their minimums first; only then does type
shrink toward its floor; only then does the layout degrade
(§6.3). Spacing is the shock absorber of the whole system.

## 4. Cards / panels

### 4.1 Proportions

- **Minimum column width [Proposal]: 260px.** A text panel
  narrower than this cannot hold 30 characters per line (§2.3)
  at the 14px body floor, so the engine drops a column instead
  of narrowing one. The spec's settled range is roughly
  240–280px (§7.2); 260px is the policy value inside it, and
  240px is the absolute floor — a column is never built below
  240px. Short-label panels (a word or two) may use narrower
  columns, down to 160px, because they have no line-length
  problem to solve.
- **Maximum content width [Settled 2026-11-25]: 1200px.** On a very wide
  screen the screen's content area is capped at 1200px and
  centred, with the extra width becoming screen padding. Why:
  a 1440px-wide row of three panels is already wide; beyond
  1200px of content, panels become slabs and lines get too
  long. Elegance is the ceiling doing its job (§1.4).
- **Maximum columns [Settled 2026-11-25]: 3 in v0.1.** Eight panels lay
  out as 3 + 3 + 2, never 4 + 4. Why: four columns at the
  minimum width need over 1000px of content width, which
  leaves almost no width where four columns are both possible
  and readable; three columns cover the spec's reference
  arrangements (spec §7.2) and keep every panel wide enough
  to read. Four columns is a question for v0.2 (§9).
- **Panel height: content-driven, never fixed.** Panels in a
  row share a row height (the tallest panel in the row sets
  it — settled, brief §7.1), and panel content is vertically
  centred when there is spare height, top-aligned when the
  screen scrolls (spec §7.4). There is no minimum panel height
  for ordinary panels: a one-line panel is allowed to be short,
  because forcing it tall would spread its one line thin and
  look empty. The exception is the hero (§4.3).
- **Panel padding:** §3.2 — 16px at 360 px, 23px at 768 px,
  32px at 1440 px. Padding grows with the screen so a large
  card does not feel like a small card scaled up.
- **Corner radius [Settled 2026-11-25]:**
  `clamp(8px, 0.8vw + 4px, 18px)` — 8px at 360 px, 10px at
  768 px, 16px at 1440 px. Why this shape: radius grows gently
  with the screen, so a phone card does not look bubbly and a
  desktop card does not look square. The ceiling (18px) matters
  most: without it, a wide card's corners would keep growing
  until the card looked like a pill. Radius is a function of
  the container, not of the card's own size — a small card and
  a large card on the same screen share one radius, which is
  what makes them read as a set.
- **Border and shadow [Proposal].** A panel has a subtle border
  (`1px`, low-contrast against the panel background) and a soft
  shadow (blur `clamp(8px, 1vw + 4px, 16px)`, offset 0, low
  opacity). One border, one shadow, everywhere — no per-kind
  chrome. The panel's *kind* (§4.4) changes its content
  treatment, not its frame, so the deck reads as one family.

### 4.2 Grid behaviour — 1–8 panels per screen

Columns are chosen by the minimum-width rule, not by fixed
breakpoints **[Settled]** (spec §7.2): the engine takes the
largest column count such that every column is at least 260px
wide, capped by the panel count and by the 3-column maximum.
The table below is the *expected outcome* of that rule at the
three tested widths — it is what the rule produces, not a
separate rule. If the rule and the table ever disagree, the
rule wins.

| Panels | 360 px | 768 px | 1440 px |
| ------ | ------ | ------ | ------- |
| 1 | 1 | 1 | 1 |
| 2 | 1 | 2 | 2 |
| 3 | 1 | 2 | 3 |
| 4 | 1 | 2 | 3 |
| 5 | 1 | 2 | 3 |
| 6 | 1 | 2 | 3 |
| 7 | 1 | 2 | 3 |
| 8 | 1 | 2 | 3 |

Rows follow from columns: 6 panels at 3 columns is 3 × 2, at
2 columns is 2 × 3, at 1 column is 1 × 6 (spec §7.2). A row
that ends up short (8 panels at 3 columns is 3 + 3 + 2) is
left-aligned, never stretched to fill the row — stretching
would make the last two panels wider than their siblings for
no reason, and the reader would notice before they knew why.

### 4.3 Hero — the single-panel screen

A screen with one panel is a hero **[Settled]** (spec §7.4):
larger type, centred, more breathing room. The policies:

- The panel's max-width is `min(720px, 100%)` **[Settled 2026-11-25]**.
  Why 720px: at the 32px body ceiling it holds about 45
  characters per line — the short end of the line-length range
  (§2.3) — and at the 56px title ceiling it holds a short title without
  wrapping into a tower. Wider than that, a hero stops feeling
  like a title card and starts feeling like a lost paragraph.
- Minimum height `clamp(240px, 45vh, 520px)` **[Settled 2026-11-25]** —
  288px at 640px height, 405px at 900px, 461px at 1024px. Why:
  a hero needs presence, and presence is vertical room; but
  the cap stops a hero on a tall monitor becoming a void with
  one line in the middle of it.
- Type uses the 1-panel row of §2.2 (the largest sizes), and
  the title-to-panel gap uses its maximum (36px) — a hero is
  allowed the most air in the system.

### 4.4 Panel kinds

A panel's kind (spec §2.5) is a hint to the layout engine, not
a separate layout mode. The kind changes content treatment:

- **Text:** the default. Body type, line-height, and padding
  from §2–§3.
- **Image:** the image fills the panel's media area (§5); any
  text in the panel becomes a caption under it.
- **Code:** monospace type (§2.1), own internal scroll if the
  code is long — a code block's max-height is 40vh
  **[Proposal]**, after which it scrolls inside the panel
  rather than growing the panel. Code never breaks the panel
  **[Settled]** (spec §7.4) and never wraps mid-token if the
  renderer can avoid it: horizontal scroll inside the code
  block is acceptable, horizontal scroll of the screen is not.
- **Quote:** text treatment, with a left border (4px, accent)
  and slightly larger type (body × 1.1) **[Proposal]** — a quote
  should read as a voice, not as another paragraph.

### 4.5 Overflow — what happens when content does not fit

In order, and never skipped:

1. Gaps shrink to their minimums (§3.2).
2. Columns drop (§4.2).
3. Type shrinks to its floor (§2.1).
4. The screen scrolls internally (§6.3, spec §7.4).

What never happens: text is never clipped, panels never
overlap, a panel is never dropped, and the screen never shows
a horizontal scrollbar. If a rung cannot be met, go one rung
down (spec §7.5). A panel whose content is taller than the
screen is not an error — it is a scrolling screen, and the
scroll affordance (§6.2) must say so.

## 5. Images

- **Max-width: 100% of the panel's content box [Settled in
  spirit, policy in number].** An image never exceeds the
  width of the panel it sits in. There is no exception: an
  image wider than its panel is a layout bug, not a feature.
- **Max-height [Settled 2026-11-25]: `min(45vh, 420px)`.** At 640px
  viewport height that is 288px; at 900px, 405px; at 1024px
  and above, the 420px cap binds. Why 45vh: an image should
  never eat more than about half the screen's height, or the
  screen stops being a presentation and becomes a photo with
  a caption lost underneath it. Why the 420px cap: on a tall
  monitor, 45vh keeps growing long after the image has stopped
  needing to. Hero images (a single image panel on a screen)
  may use `min(60vh, 560px)` instead — a hero is allowed to
  be mostly image.
- **Minimum useful size [Proposal]: 200px wide and 120px
  tall.** Below that, an image stops communicating and starts
  decorating. If the layout would render an image smaller than
  this, the engine MUST drop a column or grow the row rather
  than shrink the image — the same rule as type (§2.1): floors
  are protected by layout, not by shrinking.
- **Aspect ratio: always preserved, never stretched
  [Settled]** (spec §7.4). `object-fit: cover` within the
  panel's media area, `object-position: center` by default.
  Cover crops; it never distorts. The crop is the trade-off
  the author accepts by putting an image in a panel, and the
  renderer MUST NOT stretch to avoid it.
- **Narrow vs wide [Proposal].** On a one-column (narrow)
  screen, an image spans the full panel width and its height
  cap is 40vh — a tall image on a phone would otherwise push
  all text below the fold. On a wide screen, an image panel
  is a grid cell like any other: its height is the row height,
  its width is the column width, and `cover` crops the sides.
  The author cannot set a focal point in v0.1 (see §9) — the
  centre crop is the policy, and it is a known limitation.
- **Captions.** Caption text under an image: 12–14px (§2.1),
  line-height 1.4, margin-top one `--wd-space-sm` (§3.1),
  muted colour against the panel background. A caption is
  small text, not body text — it describes, it does not
  compete.
- **Images in text panels.** An image that is not the panel's
  dominant content (a small illustration inside a text panel)
  follows the same max-width and max-height rules, and it
  never forces its panel wider than the column. If it cannot
  fit at the minimum useful size, it renders at the minimum
  and the panel scrolls — it is never shrunk below it.
## 6. Screen and viewport

### 6.1 Safe areas, portrait, and landscape

- **Safe areas:** §3.2 — screen padding is
  `max(policy padding, env(safe-area-inset-*))` on each edge.
- **Portrait (height > width):** the default case. Vertical
  padding follows the block formula (§3.2); type follows the
  width-driven formulas (§2.1). A tall portrait screen is
  where internal scroll most often appears, and that is fine
  — scroll is a designed rung, not a failure.
- **Landscape, short height (height < 500px) [Proposal]:**
  vertical screen padding drops to its 16px minimum, the
  title factor drops one step (multiply by 0.9), and the
  hero minimum height is ignored (a hero in a short landscape
  screen would otherwise be mostly empty space). Why: in a
  short landscape window, height is the scarce dimension, and
  the policies must protect it the way the width-driven
  formulas protect width. The width formulas keep working
  unchanged — only the vertical terms adapt.
- **Embedded decks:** when a deck is mounted in a container
  smaller than the window, all of this document's `vw` / `vh`
  terms are read as container units (§0). A deck embedded in
  a 600px-wide card behaves like a 600px-wide screen, not
  like a desktop that happens to be showing a small card.

### 6.2 Very small and very large screens

- **Very small (container width < 320px) [Proposal].** One
  column, always. Body text at its 14px floor — the settled
  absolute floor — and if even that does not fit, the screen
  scrolls at 14px, never below it. Gaps at their minimums. Internal scroll is
  expected, not exceptional. The deck must still walk: steps,
  navigation, and deep links all keep working. A 320px-wide
  deck that walks is a success; a 320px-wide deck that clips
  is a failure.
- **Very large (container width > 1920px) [Proposal].** Nothing
  grows past its ceiling. Content width is capped at 1200px
  (§4.1), type is capped at its maxima (§2.1), spacing is
  capped at its maxima (§3.2). The extra width becomes screen
  padding, symmetrically. A deck on a very large monitor should
  look like the same deck, centred, with more air around it —
  not like a different, louder deck.

### 6.3 The degradation ladder — what gives way first

This extends spec §7.5 with an explicit order. Applied in
order; each rung MUST still look designed:

1. **Spacing to its minimums** (§3.2). The cheapest rung:
   nobody notices a gap going from 28px to 12px, and it buys
   real room.
2. **Fewer columns** (§4.2). Three columns become two, two
   become one. The panels get wider as they get fewer, so
   readability improves as density falls.
3. **Type to its floor** (§2.1). Down to the 14px absolute
   floor, never below it.
4. **Stacked, one column, internal scroll.** The phone
   default, not a failure (spec §7.5).
5. **Static.** `prefers-reduced-motion`, or no animation
   support — all panels visible, steps still work, nothing
   fades (spec §7.5).
6. **No-JS / print.** The deck renders as a linear document:
   screens as sections, panels as cards or list items, all
   visible, type at the reader's default size. A printed deck
   is a handout, not a blank page.

**What never gives way, at any rung:**

- Readability: no text below 14px, anywhere.
- No clipped text, no overlapping panels, no dropped panel.
- No horizontal scrollbar on the screen.
- Steps still work: Next / Previous / Start / End and deep
  links keep their meaning at every rung, including no-JS
  (where a "step" is simply a visible panel).
- The scroll affordance: whenever a screen is scrollable and
  not yet at its bottom, the reader MUST be able to tell
  (spec §7.4) — a fade, a chevron, or a scrollbar cue. A
  reader must never wonder whether there is more.

If a rung cannot be met, go one rung down. Never stay on a
rung that violates the list above.

## 7. CSS classes assigned to elements

### 7.1 The prefix rule

**Every Walkdown-owned class starts with `.wd-`.** User classes
— the ones an author writes in `class:` and `panel-class:` —
are unprefixed. The two sets can never collide, and anyone
reading a deck's CSS can tell at a glance who owns a class:
`.wd-` is Walkdown's, everything else is the author's.

Rules that follow from the prefix:

- The renderer MUST NOT emit an unprefixed class on any element
  it produces. If a future element needs a class, it gets a
  `.wd-` name first.
- A user class name starting with `wd-` MUST be ignored by the
  renderer **[Proposal]** — the prefix is reserved, and silently
  accepting a user class called `wd-panel` would let an author
  accidentally restyle every panel in every deck. Ignoring it
  (not erroring) follows the spec's error-tolerance rule
  (§3.3): the deck still renders, the class simply does nothing.
- Walkdown-owned classes are the *styling contract*: a theme
  stylesheet targets `.wd-` classes, and a renderer MUST use
  these names. A renderer that invents its own class names is
  not conforming — a theme written for one renderer would not
  work on another, and the "protocol" claim in the brief would
  be hollow.

### 7.2 Inventory

"Author assigns?" means the author can put the class on an
element through the spec's hooks (`class:` / `panel-class:`).
"Author styles?" means the author's stylesheets (external or
inline) may target the class. State classes are managed by the
renderer alone: an author MUST NOT set them, and the renderer
MUST ignore them if they appear in a `class:` list.

| Element | Walkdown class(es) | What it controls | Author assigns? | Author styles? |
| ------- | ------------------- | ---------------- | --------------- | -------------- |
| Deck root | `.wd-deck` | Theme variables, container size, font stack, the style cascade's scope | No — no deck class hook in v0.1 | Yes — this is how a theme addresses the deck |
| Section (no wrapper element in v0.1) | — (the section's author classes are carried by each of its screens) | Section grouping, section-level styling | Yes — `class:` on the section marker, inherited by its screens (spec §11.3) | Yes |
| Section title (when rendered, e.g. in an overview) | `.wd-section-title` | Section title type | No | Yes |
| Screen | `.wd-screen` (+ author classes) | Screen padding, scroll container, screen-level styling | Yes — `class:` on the reveal marker | Yes |
| Screen, single panel | `.wd-screen--hero` | Hero treatment (§4.3) | No — derived from panel count | Yes |
| Screen, scrollable | `.wd-screen--scrollable` | Scroll affordance, top-alignment when scrolling | No — renderer state | Yes (the affordance's look, not its presence) |
| Screen, current | `.wd-screen--current` | Which screen the walk is on (transitions) | No — renderer state | Yes |
| Screen title | `.wd-screen-title` | Title type, title-to-panel gap | No | Yes |
| Panels container | `.wd-panels` | The grid: columns, gaps, row heights | No | Yes |
| Panels container, stack pile | `.wd-panels--stack` | Card-deck layout (§4.2): pile container, top padding absorbs the peek, dismiss direction | No — renderer state | Yes |
| Panel, in a stack pile | `.wd-panel--stack`, `.wd-panel--stack-dismissed` | Pile level transform / shade; dismissed state (flown away, faded) | No — renderer state | Yes |
| Panel | `.wd-panel` (+ author `panel-class:`) | Card frame: padding, radius, border, shadow | Via `panel-class:` only (all panels on the screen) | Yes |
| Panel, by kind | `.wd-panel--text`, `.wd-panel--image`, `.wd-panel--code`, `.wd-panel--quote` | Content treatment per kind (§4.4) | No — derived from content | Yes |
| Panel, revealed / hidden | `.wd-panel--revealed`, `.wd-panel--hidden` | Step state: visible now, or waiting for its step | No — renderer state | Yes (e.g. a theme may restyle the hidden state, but MUST NOT make hidden panels visible or take space — §5 of the spec) |
| Panel content | `.wd-panel-content` | Prose inside a panel: body type, line-height | No | Yes |
| Panel media (image wrapper) | `.wd-panel-media` | Image sizing, aspect handling (§5) | No | Yes |
| Panel image | `.wd-panel-image` | The `img` itself: `object-fit`, max sizes | No | Yes |
| Panel caption | `.wd-panel-caption` | Caption type and spacing (§5) | No | Yes |
| Panel code block | `.wd-panel-code` | Monospace type, code scrolling (§4.4) | No | Yes |
| Nested list inside a panel | `.wd-panel-list` | Nested-list indent and spacing | No | Yes |
| Progress indicator | `.wd-progress` | Progress container | No | Yes |
| Progress bar fill | `.wd-progress-bar` | Thin progress bar (if that form is used) | No | Yes |
| Progress dots | `.wd-progress-dots`, `.wd-progress-dot`, `.wd-progress-dot--current` | Dots form (if used), current step | No — renderer state for `--current` | Yes |
| Navigation controls | `.wd-nav` | Controls container | No | Yes |
| Previous / Next buttons | `.wd-nav-prev`, `.wd-nav-next` | Chevron buttons | No | Yes |
| Start / End controls | `.wd-nav-start`, `.wd-nav-end` | Start / End (in the navigation menu, spec §6.6) | No | Yes |
| Navigation menu | `.wd-nav-menu`, `.wd-nav-menu-item`, `.wd-nav-menu-item--current` | Jump menu above the controls: First screen, Sections, Last screen (spec §6.6) | No | Yes |
| Zoom controls | `.wd-zoom`, `.wd-zoom-in`, `.wd-zoom-out` | Zoom buttons | No | Yes |
| Scroll hint | `.wd-scroll-hint` | The "there is more" cue (§6.3) | No | Yes (its look, not its presence) |
| End-of-deck state | `.wd-end-state` | The subtle end indication (§6.2) | No | Yes |
| Deck, reduced motion | `.wd-deck--static` | Static rung: no animation (spec §7.5) | No — renderer state | Yes |

Notes on the table:

- **Kind modifiers** (`.wd-panel--text` etc.) are always present
  alongside `.wd-panel` — a theme can style all panels through
  `.wd-panel` and one kind through its modifier, without
  repeating the frame rules.
- **Author classes sit alongside Walkdown classes, never
  instead of them.** A screen with `class: hero` renders as
  `class="wd-screen hero"` (plus state classes when they
  apply). The author's class adds meaning; Walkdown's class
  keeps the element working.
- **The sample deck** (`examples/walkdown-itself.md`) uses this
  inventory as written: `hero` on the first screen, `dark` on
  a Section. Those are user classes; the elements carrying them
  also carry their `.wd-` classes.

### 7.3 What a class MUST NOT do

A class — Walkdown's or the author's — MUST NOT:

- hide a panel (`display: none`, `visibility: hidden`, zero
  size) or change the step count (spec §11.3);
- create a horizontal scrollbar on a screen;
- take type below the 14px floor, or remove the scroll
  affordance on a scrollable screen;
- change the meaning of a step (a class is styling, never
  behaviour — spec §11.1).

A theme that breaks one of these is an author error. The
renderer SHOULD guard against the first where it can (spec
§11.3), and the validator in the structured-policies step
(§8) MUST check for it.

## 8. Structured form — the draft for code and enforcement

This section is the bridge to the next step: turning these
policies into structured policies that can be implemented in
code and enforced. Each row is one enforceable policy: a token,
the property it governs, its min / preferred / max, its units,
whether it is settled or proposed, and how it would be enforced.
The machine-readable form is `policies/design-tokens.json`;
this table is its human-readable form — the JSON is the source
of truth, and `tokens.test.ts` proves the two agree. The
conversion step should be able to take this table almost
as-is — a row that cannot be turned into a check is a row that
needs rewriting, not a row to skip.

**Enforcement kinds used below:**

- **CSS var + clamp** — the token is a CSS custom property;
  the renderer stylesheet applies it with `clamp()`. The
  value is enforced by construction.
- **Layout-engine check** — the layout engine (spec §7.2)
  computes the value and MUST assert it (e.g. column width,
  line length) before emitting variables.
- **Validator rule** — a static check over the parsed model
  and the deck's CSS (e.g. no class hides a panel, no
  unprefixed renderer class, no `wd-` user class).
- **Fixture screenshot** — a human-eye check at 360 / 768 /
  1440 px against the fixture decks (spec §9). Tests prove
  correctness; screenshots prove the product.

| Token | Property | Min | Preferred | Max | Units | Status | Enforcement |
| ----- | -------- | --- | --------- | --- | ----- | ------ | ----------- |
| `--wd-font-title` | Screen title size | 24px | `3.2vw + 10px` × title factor | 56px | px / vw | Proposal | CSS var + clamp; fixture screenshot |
| `--wd-font-body` | Panel body size | 14px | largest size that fits total screen content (content-fit, §2.2), less bottom-controls reserve | 32px | px / vw | Proposal | CSS var + clamp; fixture screenshot |
| `--wd-font-code` | Panel code size | 14px | `1.1vw + 6px` | 18px | px / vw | Proposal | CSS var + clamp |
| `--wd-font-small` | Caption / small size | 14px | — | 14px | px / vw | Proposal | CSS var + clamp |
| `--wd-font-floor` | Absolute type floor | 14px | — | — | px | **Settled** | Layout-engine check; validator rule |
| `--wd-line-height-body` | Body line-height | 1.5 | 1.55 | 1.6 | unitless | Proposal | CSS var |
| `--wd-line-height-title` | Title line-height | 1.05 | 1.1 | 1.15 | unitless | Proposal | CSS var |
| `--wd-line-length` | Line length, hero / single column | 45ch | 60ch | 75ch | ch | Settled 2026-11-25 | Layout-engine check |
| `--wd-line-length-panel` | Line length, multi-column panel | 30ch | — | — | ch | Settled 2026-11-25 | Layout-engine check (via min column width) |
| `--wd-zoom-step` | Zoom multiplier per step | — | ×1.1 | ±4 steps | factor | Settled 2026-11-25 | Layout-engine check |
| `--wd-space` | Base spacing unit | 8px | `1vw + 4px` | 16px | px / vw | Proposal | CSS var + clamp |
| `--wd-space-screen-x` | Screen padding, inline | 16px | `4vw + 4px` | 48px | px / vw | Proposal | CSS var + clamp; fixture screenshot |
| `--wd-space-screen-y` | Screen padding, block | 16px | `3vh + 8px` | 48px | px / vh | Proposal | CSS var + clamp; fixture screenshot |
| `--wd-gap-panel` | Gap between panels | 12px | `2vw + 4px` | 28px | px / vw | Proposal | CSS var + clamp |
| `--wd-gap-title` | Gap, title to panels | 16px | `2.5vw + 6px` | 36px | px / vw | Proposal | CSS var + clamp |
| `--wd-pad-panel` | Padding inside a panel | 16px | `2vw + 8px` | 32px | px / vw | Proposal | CSS var + clamp |
| `--wd-radius-panel` | Panel corner radius | 8px | `0.8vw + 4px` | 18px | px / vw | Settled 2026-11-25 | CSS var + clamp |
| `--wd-panel-min-width` | Minimum column width | 240px | 260px | — | px | Proposal (range Settled) | Layout-engine check |
| `--wd-content-max-width` | Maximum screen content width | — | — | 1200px | px | Settled 2026-11-25 | Layout-engine check; fixture screenshot |
| `--wd-cols-max` | Maximum columns | — | 3 | 3 | count | Settled 2026-11-25 | Layout-engine check |
| `--wd-hero-max-width` | Hero panel max-width | — | — | 720px | px | Settled 2026-11-25 | Layout-engine check |
| `--wd-hero-min-height` | Hero panel min-height | 240px | `45vh` | 520px | px / vh | Settled 2026-11-25 | CSS var + clamp |
| `--wd-image-max-height` | Image max-height | — | `min(45vh, 420px)` | 420px | px / vh | Settled 2026-11-25 | CSS var; layout-engine check |
| `--wd-image-min-size` | Image minimum useful size | 200×120px | — | — | px | Proposal | Layout-engine check |
| `--wd-code-max-height` | Code block max-height | — | `40vh` | — | vh | Proposal | CSS var |
| `--wd-nav-menu-max-height` | Navigation menu max-height | — | `min(50vh, 420px)` | 420px | px / vh | Proposal | CSS var |
| `--wd-stack-offset` | Stack peek offset per level | — | `10px` | — | px | Proposal | CSS var |
| `--wd-stack-scale-step` | Stack scale-down per level | — | `0.03` | — | unitless | Proposal | CSS var |
| `--wd-stack-shade-step` | Stack brightness loss per level | — | `0.07` | — | unitless | Proposal | CSS var |
| `--wd-stack-visible-behind` | Stack cards visible behind the front card | — | `2` | — | count | Proposal | CSS var |
| `--wd-safe-area` | Safe-area padding | `env(safe-area-inset-*)` | `max(policy, safe-area)` | — | px | Proposal | CSS var |

Reading the table: "Preferred" is the formula the renderer
evaluates; "Min" and "Max" are the clamp bounds. A dash means
the bound does not apply (e.g. a maximum-only policy has no
minimum). Where a row's Status is **Settled**, the structured
form MUST reproduce the settled value exactly — the conversion
step is not allowed to "improve" it. Where it is Proposal, the
conversion step takes the value from here unless Samir changes
it in a later review. The §9 items are settled (2026-11-25) and
their values are final.

## 9. Settled 2026-11-25 — Samir accepted all recommended defaults

Samir settled all ten questions on 2026-11-25 with a one-word
reply ("Defaults"), accepting every recommended default as
written. No recommended value was changed. Each item below
records the settled value.

1. **Root font size.** The formulas above assume a 16px root
   (`html { font-size: 16px }`), with `rem` used wherever a
   size is relative to the root rather than the container.
   *Settled value: 16px.* If the root were 14px or 18px,
   every `rem`-based value in a theme would shift with it.
2. **Maximum content width: 1200px (§4.1).** Beyond this, extra
   width becomes screen padding. *Settled value: 1200px.*
   A smaller cap (1000px) would feel more editorial; a larger
   one (1400px) would let wide decks breathe less.
3. **Maximum columns: 3 (§4.2).** Eight panels lay out as
   3 + 3 + 2. *Settled value: 3 for v0.1.* Four columns
   would need a content width over 1000px to stay readable,
   which leaves almost no width where four columns help.
4. **Image max-height: `min(45vh, 420px)` (§5).** *Settled value: as written.* A taller cap (60vh) would let images
   dominate; a shorter one (35vh) would make image panels
   feel cramped.
5. **Corner radius scaling with the container (§4.1).**
   *Settled value: the gentle clamp as written*
   (`8px` to `18px`). The alternative is a fixed 12px radius
   everywhere — simpler, but a phone card and a desktop card
   would share a radius that suits neither quite as well.
6. **Breakpoints vs pure fluid layout (§6, spec §7.1).**
   *Settled value: fluid as the primary mechanism,*
   with coarse tiers (phone / tablet / desktop) only for
   behaviour that genuinely differs, such as swipe vs
   keyboard hints. The column table in §4.2 is an outcome
   of the min-width rule, not a breakpoint rule.
7. **Hero max-width 720px and min-height `45vh` (§4.3).**
   *Settled value: as written.* A wider hero would
   push hero lines past the 75ch maximum; a taller one
   would leave too much empty space on tall monitors.
8. **Zoom step: ×1.1 multiplicative, ±4 steps (§2.4).**
   *Settled value: as written, confirming the spec's
   "~10%".* The alternative is additive 10% steps, which
   feel progressively smaller as you zoom in.
9. **Line length: 45–75ch for hero / single-column text,
   30ch minimum for multi-column panels (§2.3).**
   *Settled value: as written.* The panel minimum is
   the one that constrains the grid — raising it would force
   wider minimum columns.
10. **Image focal point.** `object-fit: cover` crops from the
    centre in v0.1 (§5). Should v0.1 let an author set a
    focal point (e.g. `object-position` via a class), or is
    centre-crop acceptable until v0.2? *Settled value:
    centre-crop for v0.1; focal point in v0.2.* It is a real
    limitation for portrait photos, and worth naming now
    rather than discovering later.

---

*Next: §9 is settled (2026-11-25). Turn §8 into structured policies
that can be implemented in code and enforced — one row at a
time, with the token names above as the stable identifiers.
Nothing in this document changes the spec on its own; the spec
changes only when a follow-up PR folds the approved policies
into it.*
