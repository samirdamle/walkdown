/**
 * The renderer default theme (spec §11.2, layer 1 — always
 * present). It consumes the CSS custom properties the layout
 * engine emits on `.wd-deck` (spec §7.2) plus the settled theme
 * tokens (`--wd-color-*`, `--wd-font-family-*` from
 * `policies/design-tokens.json` via `themeVars()`).
 *
 * The style cascade is: this stylesheet → external
 * stylesheet(s) → inline CSS block. Those later layers are
 * injected as separate `<style>` elements after this one, in
 * the deck's Shadow DOM, so they win on equal specificity
 * without this file needing `!important` anywhere.
 *
 * The host element fills its container; a deck can be embedded
 * in a page, a card, or an iframe and still adapt (§7.2).
 */

export const DEFAULT_CSS = `
:host {
  display: block;
  width: 100%;
  height: 100%;
  /* Collapse guard that never exceeds the container: a short
     landscape window or a small embedded card must not be
     forced taller than the space it was given. */
  min-height: min(240px, 100%);
  box-sizing: border-box;
}

.wd-deck {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--wd-color-bg);
  color: var(--wd-color-ink);
  font-family: var(--wd-font-family-body);
  font-size: var(--wd-font-body);
  line-height: var(--wd-line-height-body);
  box-sizing: border-box;
  /* Control-button size (§6.5): one source of truth, used by the
     buttons themselves and by the bottom reserve below.
     44px is the minimum touch target on phones, ~51px on a
     1440px desktop, capped at 56px. */
  --wd-control-size: clamp(44px, 3vw + 8px, 56px);
  /* Nav menu cap (§6.6, token --wd-nav-menu-max-height):
     half the viewport, at most 420px like the image cap. */
  --wd-nav-menu-max-height: min(50vh, 420px);
  /* Bottom reserve (§7.2): the ONE pre-paint fallback
     definition of --wd-reserve-bottom — the controls'
     height plus half-space clearance (C12), derived from the
     tokens instead of hardcoding a number: control size +
     top/bottom padding (2× space) + half-space clearance =
     control size + 2.5× space. At minimum (44px buttons,
     8px space) it is 64px; at 1440px it is 91.2px. The
     spacer, the nav menu and the end note read this var with
     no fallback of their own — this line is the fallback.
     computeLayout's measured value is set inline on
     .wd-deck on every layout pass and overrides it; before
     the first layout pass this default is what clears the
     controls. The TS side of the same formula is
     bottomReservePx (core reserve.ts). */
  --wd-reserve-bottom: calc(var(--wd-control-size) + var(--wd-space, 8px) * 2.5);
}

.wd-deck *,
.wd-deck *::before,
.wd-deck *::after {
  box-sizing: border-box;
}

/* --- Screen: the scroll container (§7.4). The deck never page-scrolls. --- */
.wd-screen {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  /* Vertical gestures scroll natively; horizontal ones reach JS (§6.4). */
  touch-action: pan-y;
  /* No bottom padding: the bottom clearance lives in the
     ::after spacer below, not in padding. */
  padding: var(--wd-space-screen-y) var(--wd-space-screen-x) 0;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: var(--wd-color-border) transparent;
}

/* Bottom clearance (§7.2, issue #38): a trailing in-flow
   spacer, NOT bottom padding on the screen. The controls
   overlay the bottom of the screen, so the last panel must be
   able to scroll up clear of them — and padding on a flex
   scroll container is not scrollable in Safari/WebKit (WebKit
   bug 318111: padding-end on a flexbox container does not add
   to its scrollable overflow), so the old padding-bottom let
   the last panel scroll only as far as the container's bottom
   edge — underneath the controls. A trailing flex item IS
   part of the scrollable overflow in every browser, so the
   last panel can always scroll clear. Same height as the old
   padding: the screen's vertical padding plus the reserve —
   the controls' height + clearance, measured by the renderer
   (--wd-reserve-bottom); before the first layout pass the
   fallback defined once on .wd-deck applies (control size +
   2.5× space, derived from the tokens — see the .wd-deck
   rule). At minimum (44px buttons, 8px space) it is 64px,
   as before; --wd-space falls back to 8px before layout runs. */
.wd-screen::after {
  content: '';
  display: block;
  flex: 0 0 auto;
  height: calc(var(--wd-space-screen-y) + var(--wd-reserve-bottom));
}

.wd-title {
  font-family: var(--wd-font-family-title);
  font-size: var(--wd-font-title);
  line-height: var(--wd-line-height-title);
  font-weight: 700;
  /* Top-left: the title block starts at the left edge, never
     centred — a centred title is what used to make the whole
     screen jump when a panel was revealed. The hero keeps its
     centred title (see .wd-screen--hero below). */
  margin: 0 0 var(--wd-gap-title);
  max-width: var(--wd-content-max-width);
  width: 100%;
  text-wrap: balance;
}

.wd-section-label {
  font-size: var(--wd-font-small);
  line-height: 1.4;
  color: var(--wd-color-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 var(--wd-space);
  max-width: var(--wd-content-max-width);
  width: 100%;
}

/* --- Panels: the grid (§7.2). CSS does the distribution; JS only sets --wd-cols. --- */
/* Top-left, always: the grid starts at the top of the screen
   and the first column starts at the left edge. It used to be
   margin auto with align-content center, which centred the
   grid — so every newly revealed panel re-centred the ones
   already on screen, and the whole screen visibly jumped while
   reading. With align-content start a reveal only adds a
   panel; nothing already visible moves. */
.wd-panels {
  display: grid;
  grid-template-columns: repeat(var(--wd-cols, 1), minmax(0, 1fr));
  gap: var(--wd-gap-panel);
  width: 100%;
  max-width: var(--wd-content-max-width);
  margin: 0;
  align-content: start;
  flex: 0 0 auto;
}

.wd-panel {
  background: var(--wd-color-panel);
  border: 1px solid var(--wd-color-border);
  border-radius: var(--wd-radius-panel);
  padding: var(--wd-pad-panel);
  font-size: var(--wd-font-body);
  line-height: var(--wd-line-height-body);
  /* Shadow blur follows design-policies §4.1, so it scales
     with the screen like every other panel dimension. */
  box-shadow: 0 0 clamp(8px, 1vw + 4px, 16px) rgb(0 0 0 / 0.06);
  min-width: 0;
  overflow-wrap: break-word;
}

.wd-panel > :first-child { margin-top: 0; }
.wd-panel > :last-child { margin-bottom: 0; }
.wd-panel p { margin: 0 0 0.6em; }
.wd-panel ul, .wd-panel ol { margin: 0; padding-left: 1.25em; }
.wd-panel li { margin: 0.25em 0; }
.wd-panel li > ul, .wd-panel li > ol { margin-top: 0.25em; }
.wd-panel blockquote {
  margin: 0;
  padding-left: 0.75em;
  border-left: 3px solid var(--wd-color-accent);
  color: var(--wd-color-muted);
}
.wd-panel code {
  font-family: var(--wd-font-family-code);
  font-size: var(--wd-font-code);
  background: color-mix(in srgb, var(--wd-color-ink) 7%, transparent);
  border-radius: 0.25em;
  padding: 0.1em 0.3em;
}
.wd-panel pre {
  margin: 0;
  overflow: auto;
  font-size: var(--wd-font-code);
}
.wd-panel pre code {
  background: none;
  padding: 0;
  display: block;
  white-space: pre;
}
.wd-panel img {
  display: block;
  max-width: 100%;
  max-height: var(--wd-image-max-height);
  width: auto;
  height: auto;
  object-fit: cover;
  border-radius: calc(var(--wd-radius-panel) / 2);
  margin: 0 auto;
}
.wd-panel a { color: var(--wd-color-accent); }
.wd-panel h1, .wd-panel h2, .wd-panel h3, .wd-panel h4 {
  font-family: var(--wd-font-family-title);
  line-height: var(--wd-line-height-title);
  margin: 0 0 0.5em;
}

/* Hidden panels take no space and are not focusable (§5). */
.wd-panel[hidden] { display: none; }

/* Measuring pass (§7.2): while the renderer measures the full
   screen's overflow, hidden panels take layout space but stay
   invisible. The class is added and removed synchronously, so
   nothing paints. */
.wd-screen--measuring .wd-panel[hidden] { display: block; visibility: hidden; }

/* --- Single-panel screens become a hero (§7.4). --- */
/* The hero is the one deliberate exception to top-left: its
   single panel is centred, and its title and section label
   are centred too. A hero has reveal all, so nothing is
   ever revealed into it — nothing can shift — and a centred
   title slide is the point of a hero. */
.wd-screen--hero .wd-title,
.wd-screen--hero .wd-section-label {
  text-align: center;
}
.wd-screen--hero .wd-panel {
  max-width: var(--wd-hero-max-width);
  min-height: var(--wd-hero-min-height);
  margin: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-size: calc(var(--wd-font-body) * 1.15);
}

/* --- Enter animations (§8): transform + opacity only.
   Travel is in em of the fitted body size, so a slide covers
   the same proportion of the screen on a phone and a desktop
   instead of feeling large on one and negligible on the other. --- */
@keyframes wd-fade-in {
  from { opacity: 0; transform: translateY(0.5em); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes wd-slide-in-forward {
  from { opacity: 0; transform: translateX(1em); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wd-slide-in-backward {
  from { opacity: 0; transform: translateX(-1em); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wd-zoom-in {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes wd-screen-in-forward {
  from { opacity: 0; transform: translateX(0.75em); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wd-screen-in-backward {
  from { opacity: 0; transform: translateX(-0.75em); }
  to { opacity: 1; transform: translateX(0); }
}

.wd-panel.wd-enter--fade-in { animation: wd-fade-in var(--wd-anim-duration, 300ms) ease-out; }
.wd-panel.wd-enter--slide-in-forward { animation: wd-slide-in-forward var(--wd-anim-duration, 300ms) ease-out; }
.wd-panel.wd-enter--slide-in-backward { animation: wd-slide-in-backward var(--wd-anim-duration, 300ms) ease-out; }
.wd-panel.wd-enter--zoom-in { animation: wd-zoom-in var(--wd-anim-duration, 300ms) ease-out; }
.wd-screen.wd-screen-enter--forward { animation: wd-screen-in-forward 200ms ease-out; }
.wd-screen.wd-screen-enter--backward { animation: wd-screen-in-backward 200ms ease-out; }

/* Reduced motion (§7.5 rung 4, §8): no enter/exit animation at all. Steps still advance. */
@media (prefers-reduced-motion: reduce) {
  .wd-panel[class*="wd-enter"],
  .wd-screen[class*="wd-screen-enter"] {
    animation: none;
  }
  .wd-screen { scroll-behavior: auto; }
}

/* --- Progress (§6.5): a thin bar, counted in steps not screens (§1.3). --- */
.wd-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: transparent;
  z-index: 3;
}
.wd-progress-bar {
  height: 100%;
  width: 0%;
  background: var(--wd-color-accent);
  transition: width 200ms ease-out;
}

/* --- Scroll cue (§7.4): a reader must never wonder whether there is more. --- */
.wd-scroll-cue {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* Tall enough for one line of small text plus the padding
     below it, both token-derived so the strip scales. */
  height: calc(var(--wd-font-small) * 2 + var(--wd-space));
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: var(--wd-space);
  background: linear-gradient(to bottom, transparent, var(--wd-color-bg) 80%);
  color: var(--wd-color-muted);
  font-size: var(--wd-font-small);
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease-out;
  z-index: 2;
}
.wd-scroll-cue--visible { opacity: 1; }

/* --- Controls (§6.5): minimal — Previous / Next chevrons and a step count. --- */
.wd-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--wd-space) var(--wd-space-screen-x);
  z-index: 3;
  transition: opacity 300ms ease-out;
  pointer-events: none;
}
.wd-controls button {
  pointer-events: auto;
  font-family: var(--wd-font-family-body);
  /* 1.25× the fitted body size, so the chevron stays proportional
     to the type. The 0.7× alternative was rejected: at the 12px
     floor it would shrink the glyph below legibility. */
  font-size: 1.25em;
  line-height: 1;
  width: var(--wd-control-size);
  height: var(--wd-control-size);
  border-radius: 50%;
  border: 1px solid var(--wd-color-border);
  background: var(--wd-color-panel);
  color: var(--wd-color-ink);
  cursor: pointer;
}
.wd-controls button:hover { border-color: var(--wd-color-accent); }
.wd-controls button:disabled { opacity: 0.35; cursor: default; }
.wd-controls button:focus-visible {
  outline: 2px solid var(--wd-color-accent);
  outline-offset: 2px;
}
.wd-progress-text {
  font-size: var(--wd-font-small);
  color: var(--wd-color-muted);
  background: var(--wd-color-panel);
  border: 1px solid var(--wd-color-border);
  border-radius: 999px;
  padding: calc(var(--wd-space) * 0.25) var(--wd-space);
  pointer-events: auto;
}
/* The step count is a button (§6.6), not a chevron: undo the
   round-button sizing above — a pill that fits its text, at the
   small size (the chevron rule is more specific, so the size
   must be reset here too, not just in .wd-progress-text). */
.wd-controls button.wd-progress-text {
  width: auto;
  height: auto;
  border-radius: 999px;
  font-size: var(--wd-font-small);
  cursor: pointer;
}
.wd-progress-text[aria-expanded="true"] { border-color: var(--wd-color-accent); }

/* Controls auto-hide on idle on desktop (§6.5); never on touch, where there is no hover to bring them back. */
.wd-deck--idle .wd-controls { opacity: 0; }
@media (pointer: coarse) {
  .wd-deck--idle .wd-controls { opacity: 1; }
}
/* While the menu is open the controls stay visible (§6.6): the
   menu is anchored to them, and hiding them would strand it. */
.wd-deck--nav-open .wd-controls { opacity: 1; }

/* --- Navigation menu (§6.6): First screen, Sections, Last screen.
   Bottom-anchored above the controls band: the bottom edge sits
   one space unit above the top edge of the controls bar. The
   reserve is the controls' height plus half-space clearance
   (--wd-reserve-bottom, defined once on .wd-deck), so
   reserve + half-space = controls height + one full space.
   The height is capped (token above) and the menu scrolls
   within itself, so many Sections never push it past the
   screen. The width is in em of the fitted body size, so it
   scales with the type like the rest of the chrome. --- */
.wd-nav-menu {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(var(--wd-reserve-bottom) + var(--wd-space, 8px) / 2);
  width: min(84vw, 24em);
  max-height: var(--wd-nav-menu-max-height, min(50vh, 420px));
  overflow-y: auto;
  background: var(--wd-color-panel);
  border: 1px solid var(--wd-color-border);
  border-radius: var(--wd-radius-panel);
  box-shadow: 0 0 clamp(8px, 1vw + 4px, 16px) rgb(0 0 0 / 0.06);
  padding: calc(var(--wd-space) * 0.5);
  z-index: 4;
}
.wd-nav-menu[hidden] { display: none; }
/* Menu items are finger targets, not captions (§6.6): type at
   clamp(16px, 1.2vw + 10px, 20px) — clearly above the 12–14px
   small size — and at least 48px tall, a touch above the
   settled 44px touch floor (C8), with the same 56px cap as
   the controls. Padding comes from --wd-space. */
.wd-nav-menu-item {
  display: block;
  width: 100%;
  min-height: clamp(48px, 3vw + 12px, 56px);
  text-align: left;
  font-family: var(--wd-font-family-body);
  font-size: clamp(16px, 1.2vw + 10px, 20px);
  line-height: 1.4;
  color: var(--wd-color-ink);
  background: transparent;
  border: none;
  padding: calc(var(--wd-space) * 0.5) var(--wd-space);
  cursor: pointer;
}
.wd-nav-menu-item:hover { background: color-mix(in srgb, var(--wd-color-ink) 5%, transparent); }
.wd-nav-menu-item:focus-visible {
  outline: 2px solid var(--wd-color-accent);
  outline-offset: -2px;
}
.wd-nav-menu-item--current {
  /* Background highlight only — no left border, no rounded
     corners. The tint mixes a fixed ocean green with the
     panel colour, so it reads in both themes: light #D5E5E1
     (ink 13.3:1 AAA), dark #233332 (ink 12.1:1 AAA).
     Font-weight stays bold. */
  background: color-mix(in srgb, #2E7D6B 20%, var(--wd-color-panel));
  font-weight: 700;
}

/* --- End state (§6.2): a subtle indication, not a dead end.
   The note sits above the controls band, at the bottom
   reserve (--wd-reserve-bottom): controls height is the button
   size plus the controls' top and bottom padding (both
   --wd-space), and the clearance above them is half the space
   unit (C12). The fallback is the single definition on
   .wd-deck, so the note clears the band at every width even
   before the first layout pass. At 360px: 44 + 2.5×8 = 64px
   above controls 60px tall; at 1440px: 51.2 + 2.5×16 = 91.2px
   above controls 83.2px tall. --- */
.wd-end-note {
  position: absolute;
  left: 50%;
  bottom: var(--wd-reserve-bottom);
  transform: translateX(-50%);
  font-size: var(--wd-font-small);
  color: var(--wd-color-muted);
  z-index: 3;
  pointer-events: none;
}
/* The Start over button reuses the controls' button styling, as a
   text pill rather than a round chevron — it carries the single
   pill border itself. The note is unstyled positioning only: it
   used to be a pill too (border + background + padding), which
   put a second border around the button. The note itself ignores
   pointer events, so the button re-enables them. */
.wd-end-note button {
  pointer-events: auto;
  font-family: var(--wd-font-family-body);
  font-size: var(--wd-font-small);
  line-height: 1;
  color: var(--wd-color-ink);
  background: var(--wd-color-panel);
  border: 1px solid var(--wd-color-border);
  border-radius: 999px;
  padding: calc(var(--wd-space) * 0.25) var(--wd-space);
  cursor: pointer;
}
.wd-end-note button:hover { border-color: var(--wd-color-accent); }
.wd-end-note button:focus-visible {
  outline: 2px solid var(--wd-color-accent);
  outline-offset: 2px;
}
.wd-end-note[hidden] { display: none; }

/* --- Empty deck (§3.3): surfaced as a state, not a blank page. --- */
.wd-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--wd-color-muted);
  padding: var(--wd-space-screen-y) var(--wd-space-screen-x);
}
.wd-empty[hidden] { display: none; }

/* Empty deck: no progress bar, no controls — just the state. */
.wd-deck--empty .wd-progress,
.wd-deck--empty .wd-controls,
.wd-deck--empty .wd-nav-menu,
.wd-deck--empty .wd-scroll-cue,
.wd-deck--empty .wd-end-note {
  display: none;
}
`;
