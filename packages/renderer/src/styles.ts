/**
 * The renderer default theme (spec §11.2, layer 1 — always
 * present). It consumes the CSS custom properties the layout
 * engine emits on `.wd-deck` (spec §7.2) plus the settled theme
 * tokens (`--wd-color-*`, `--wd-font-family-*` from
 * `policies/design-tokens.json` via `themeVars()`).
 *
 * Theme vars are NOT inline style (issue #75). The theme
 * defaults live in their own stylesheet layer — see
 * `themeVarsCss()` below: one private alias per theme var, each
 * reading the public var with the theme value as fallback,
 * defined on `.wd-deck` and every element inside it. The chrome
 * in this file reads the aliases, never the public vars, so a
 * deck stylesheet (or a page, on an ancestor of the host) can
 * set a theme var and win without `!important` — and the alias
 * re-resolves per element, so a rule on a screen or a panel
 * re-themes just that element. Layout vars (`--wd-font-body`,
 * `--wd-reserve-bottom`, …) are measured per pass and still go
 * inline on `.wd-deck`, where they belong.
 *
 * The style cascade is: theme layer → this stylesheet → external
 * stylesheet(s) → inline CSS block. Those later layers are
 * injected as separate `<style>` elements after this one, in
 * the deck's Shadow DOM, so they win on equal specificity
 * without this file needing `!important` anywhere.
 *
 * The host element fills its container; a deck can be embedded
 * in a page, a card, or an iframe and still adapt (§7.2).
 *
 * Two values in this stylesheet are generated from
 * `policies/design-tokens.json` (via `@walkdown/core`) rather
 * than hard-coded: the nav-menu cap (`--wd-nav-menu-max-height`,
 * a Proposal token) and the space-unit floor used in the
 * bottom-reserve fallback (`--wd-space` min) — plus the stack
 * pile values (`--wd-stack-*`, all Proposal tokens, spec §4.2)
 * and the dismiss distance/rotation the pile CSS shares with
 * the WAAPI choreography in stack.ts. A third pair is the
 * dark-screen chrome below (dark muted + dark background,
 * settled tokens). Everything else here is hand-written chrome.
 */
import {
  COLORS,
  NAV_MENU_MAX_HEIGHT_CSS,
  SPACE_MIN_PX,
  STACK_OFFSET_PX,
  STACK_SCALE_STEP,
  STACK_SHADE_STEP,
  STACK_VISIBLE_BEHIND,
  themeVars,
} from '@walkdown/core';
import type { Theme } from '@walkdown/core';
import { STACK_DISMISS_DISTANCE, STACK_DISMISS_ROTATE_DEG } from './stack.js';

/**
 * Theme defaults as a stylesheet layer (spec §11.2, layer 1),
 * generated from `themeVars()` — the settled font/colour tokens
 * for the given theme. One private alias per theme var, each
 * reading the public var with the theme value as fallback:
 *
 *   .wd-deck, .wd-deck * {
 *     --_wd-color-accent: var(--wd-color-accent, #2E7D6B);
 *     …
 *   }
 *
 * The alias is defined on `.wd-deck` and every element inside
 * it, so it re-resolves at each element from that element's own
 * public var: a deck stylesheet can set `--wd-color-accent` on
 * `.wd-deck`, on a screen, or on a panel, and the override wins
 * without `!important`; a page can set it on an ancestor of the
 * host and it inherits in. The public var is never seeded on
 * `:host` (guide `styling-web-components`: "leave the public
 * property unset on `:host` and rely on the fallback in each
 * `var()`; do not seed the public property on `:host`"). The
 * renderer replaces this layer's text when the theme changes
 * (element `_applyThemeVars`); it is never re-set on layout
 * passes. No value here is hand-written: every fallback comes
 * from `themeVars()`, so the token-generation drift test still
 * guards them.
 */
export function themeVarsCss(theme: Theme): string {
  const aliases = Object.entries(themeVars(theme))
    .map(([name, value]) => `  --_${name.slice(2)}: var(${name}, ${value});`)
    .join('\n');
  return `/* Theme defaults for "${theme}" — generated from themeVars(); the renderer replaces this layer on a theme change. */\n.wd-deck, .wd-deck * {\n${aliases}\n}`;
}

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
  background: var(--_wd-color-bg);
  color: var(--_wd-color-ink);
  font-family: var(--_wd-font-family-body);
  font-size: var(--wd-font-body);
  line-height: var(--wd-line-height-body);
  box-sizing: border-box;
  /* Control-button size (§6.5): one source of truth, used by the
     buttons themselves and by the bottom reserve below.
     44px is the minimum touch target on phones, ~51px on a
     1440px desktop, capped at 56px. */
  --wd-control-size: clamp(44px, 3vw + 8px, 56px);
  /* Nav menu cap (§6.6, token --wd-nav-menu-max-height):
     half the viewport, at most 420px like the image cap.
     Generated from the token (a Proposal — see
     NAV_MENU_MAX_HEIGHT_CSS); do not hard-code a new value
     here, change the token and re-run npm run tokens. */
  --wd-nav-menu-max-height: ${NAV_MENU_MAX_HEIGHT_CSS};
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
     bottomReservePx (core reserve.ts), with the width-aware
     fallback controlsHeightFallbackPx. The space floor
     below is the generated --wd-space min. */
  --wd-reserve-bottom: calc(var(--wd-control-size) + var(--wd-space, ${SPACE_MIN_PX}px) * 2.5);
  /* Stack pile (§4.2, tokens --wd-stack-*): the peek offset, the
     per-level scale-down and shade, and how many cards peek
     behind the front one. Generated from the tokens (all
     Proposal — see the stack constants); do not hard-code new
     values here, change the tokens and re-run npm run tokens.
     The pile CSS below reads these vars; the WAAPI
     choreography (stack.ts) reads the same constants, and the
     dismiss distance/rotation below are the shared
     STACK_DISMISS_* constants, not a second copy. */
  --wd-stack-offset: ${STACK_OFFSET_PX}px;
  --wd-stack-scale-step: ${STACK_SCALE_STEP};
  --wd-stack-shade-step: ${STACK_SHADE_STEP};
  --wd-stack-visible-behind: ${STACK_VISIBLE_BEHIND};
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
  scrollbar-color: var(--_wd-color-border) transparent;
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
  font-family: var(--_wd-font-family-title);
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
  color: var(--_wd-color-muted);
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

/* --- Stack pile (§4.2): panels as a card deck instead of a grid. --- */
/* The pile container is a plain block, not a grid: the front card
   is in flow and sets the pile height; the cards behind are
   absolute over it, lifted by the peek offset so their top edges
   show. The top padding absorbs the peek — the pile never
   overflows the screen's scroll container, so the screen needs
   no overflow change (its overflow-x: hidden already clips a
   dismissing card at the screen edge). Dismiss direction is a
   data attribute on the container; the dismissed card's rest
   transform reads it. */
.wd-panels--stack {
  display: block;
  position: relative;
  padding-top: calc(var(--wd-stack-visible-behind) * var(--wd-stack-offset));
}
.wd-panel--stack {
  transform: translateY(calc(var(--wd-stack-level, 0) * var(--wd-stack-offset) * -1))
    scale(calc(1 - var(--wd-stack-level, 0) * var(--wd-stack-scale-step)));
  filter: brightness(calc(1 - var(--wd-stack-level, 0) * var(--wd-stack-shade-step)));
  transform-origin: top center;
}
/* The front card is in flow (it sets the pile height); every
   other card is absolute over it, aligned with the front card's
   top edge — the transform lifts it by its level's peek. */
.wd-panel--stack[data-stack-level="0"] {
  position: relative;
}
.wd-panel--stack:not([data-stack-level="0"]) {
  position: absolute;
  top: calc(var(--wd-stack-visible-behind) * var(--wd-stack-offset));
  left: 0;
  right: 0;
}
/* A dismissed card has flown away in the container's direction
   and faded out; it stays in the DOM (visibility hidden, never
   display none) so a step back can fly it back in. The doubled
   class beats the base pile transform on equal footing. */
.wd-panel--stack.wd-panel--stack-dismissed {
  transform: translate(var(--wd-stack-dismiss-x), var(--wd-stack-dismiss-y))
    rotate(var(--wd-stack-dismiss-rotate));
  opacity: 0;
}
.wd-panels--stack[data-stack-direction="left"] {
  --wd-stack-dismiss-x: -${STACK_DISMISS_DISTANCE};
  --wd-stack-dismiss-y: 0;
  --wd-stack-dismiss-rotate: -${STACK_DISMISS_ROTATE_DEG}deg;
}
.wd-panels--stack[data-stack-direction="right"] {
  --wd-stack-dismiss-x: ${STACK_DISMISS_DISTANCE};
  --wd-stack-dismiss-y: 0;
  --wd-stack-dismiss-rotate: ${STACK_DISMISS_ROTATE_DEG}deg;
}
.wd-panels--stack[data-stack-direction="up"] {
  --wd-stack-dismiss-x: 0;
  --wd-stack-dismiss-y: -${STACK_DISMISS_DISTANCE};
  --wd-stack-dismiss-rotate: -${STACK_DISMISS_ROTATE_DEG}deg;
}
.wd-panels--stack[data-stack-direction="down"] {
  --wd-stack-dismiss-x: 0;
  --wd-stack-dismiss-y: ${STACK_DISMISS_DISTANCE};
  --wd-stack-dismiss-rotate: ${STACK_DISMISS_ROTATE_DEG}deg;
}

.wd-panel {
  background: var(--_wd-color-panel);
  border: 1px solid var(--_wd-color-border);
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
  border-left: 3px solid var(--_wd-color-accent);
  color: var(--_wd-color-muted);
}
.wd-panel code {
  font-family: var(--_wd-font-family-code);
  font-size: var(--wd-font-code);
  background: color-mix(in srgb, var(--_wd-color-ink) 7%, transparent);
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
.wd-panel a { color: var(--_wd-color-accent); }
.wd-panel h1, .wd-panel h2, .wd-panel h3, .wd-panel h4 {
  font-family: var(--_wd-font-family-title);
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
/* Dismissed stack cards are translated far off the pile — an
   up/down dismissal would otherwise inflate the screen's
   scrollable overflow and shrink the measured font. During the
   measurement they take no space at all: the pile height is the
   front card's, which is what the pass measures. */
.wd-screen--measuring .wd-panel--stack-dismissed { display: none; }

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
  background: var(--_wd-color-accent);
  transition: width 200ms ease-out;
}

/* --- Scroll cue (§7.4): a reader must never wonder whether there is more.
   The cue sits directly above the controls band, at the bottom
   reserve (--wd-reserve-bottom): controls height plus half-space
   clearance (§7.2). It used to sit at bottom: 0, inside the
   controls band, where the centred step-count pill covered the
   centred cue text (issue #64). The gradient still fades the
   content below the cue — only the strip's placement moved. --- */
.wd-scroll-cue {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--wd-reserve-bottom);
  /* Tall enough for one line of small text plus the padding
     below it, both token-derived so the strip scales. */
  height: calc(var(--wd-font-small) * 2 + var(--wd-space));
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: var(--wd-space);
  background: linear-gradient(to bottom, transparent, var(--_wd-color-bg) 80%);
  color: var(--_wd-color-muted);
  font-size: var(--wd-font-small);
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease-out;
  z-index: 2;
}
.wd-scroll-cue--visible { opacity: 1; }

/* At the end of the deck the Start over note occupies the same
   band — its bottom edge is the reserve too, and it is one small
   line plus its padding and border tall. The cue lifts above it
   while the note shows (the element toggles .wd-deck--end with
   the note), so the cue's text clears the note's top by half a
   space unit at every width and zoom: both sides read the same
   zoomed --wd-font-small, and the 2px is the button's border. */
.wd-deck--end .wd-scroll-cue {
  bottom: calc(var(--wd-reserve-bottom) + var(--wd-font-small) + 2px);
}

/* Dark screens re-theme the chrome (issue #74, F3): the section label sits
   on the screen background and the scroll cue is the screen's following
   sibling, so both key off the .dark class the renderer already puts on
   the screen element (spec §11.3, PR #70) — no JS state, no _applyThemeVars
   change; navigation, jumps and deep links get it for free. The values are
   the settled dark theme tokens (COLORS.dark), not literals: the dark muted
   is 7.5:1 on the dark background (AAA) and 6.9:1 on the dark panel, where
   the light muted was 2.63:1 on dark. The light muted stays for the chrome
   that sits on light surfaces (panel blockquotes, the progress pill, the
   empty state). A light screen in a dark-theme deck is not handled — no
   such deck exists; that case is still open (issue #75 did not take it on). */
.wd-screen.dark .wd-section-label,
.wd-screen.dark ~ .wd-scroll-cue {
  color: ${COLORS.dark.muted};
}
.wd-screen.dark ~ .wd-scroll-cue {
  background: linear-gradient(to bottom, transparent, ${COLORS.dark.bg} 80%);
}

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
  font-family: var(--_wd-font-family-body);
  /* 1.25× the fitted body size, so the chevron stays proportional
     to the type. The 0.7× alternative was rejected: at the 14px
     floor it would shrink the glyph below legibility. */
  font-size: 1.25em;
  line-height: 1;
  width: var(--wd-control-size);
  height: var(--wd-control-size);
  border-radius: 50%;
  border: 1px solid var(--_wd-color-border);
  background: var(--_wd-color-panel);
  color: var(--_wd-color-ink);
  cursor: pointer;
}
.wd-controls button:hover { border-color: var(--_wd-color-accent); }
.wd-controls button:disabled { opacity: 0.35; cursor: default; }
.wd-controls button:focus-visible {
  outline: 2px solid var(--_wd-color-accent);
  outline-offset: 2px;
}
.wd-progress-text {
  font-size: var(--wd-font-small);
  color: var(--_wd-color-muted);
  background: var(--_wd-color-panel);
  border: 1px solid var(--_wd-color-border);
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
.wd-progress-text[aria-expanded="true"] { border-color: var(--_wd-color-accent); }

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
  max-height: var(--wd-nav-menu-max-height, ${NAV_MENU_MAX_HEIGHT_CSS});
  overflow-y: auto;
  background: var(--_wd-color-panel);
  border: 1px solid var(--_wd-color-border);
  border-radius: var(--wd-radius-panel);
  box-shadow: 0 0 clamp(8px, 1vw + 4px, 16px) rgb(0 0 0 / 0.06);
  padding: calc(var(--wd-space) * 0.5);
  z-index: 4;
}
.wd-nav-menu[hidden] { display: none; }
/* Menu items are finger targets, not captions (§6.6): type at
   clamp(16px, 1.2vw + 10px, 20px) — clearly above the 14px
   small size — and at least 48px tall, a touch above the
   settled 44px touch floor (C8), with the same 56px cap as
   the controls. Padding comes from --wd-space. */
.wd-nav-menu-item {
  display: block;
  width: 100%;
  min-height: clamp(48px, 3vw + 12px, 56px);
  text-align: left;
  font-family: var(--_wd-font-family-body);
  font-size: clamp(16px, 1.2vw + 10px, 20px);
  line-height: 1.4;
  color: var(--_wd-color-ink);
  background: transparent;
  border: none;
  padding: calc(var(--wd-space) * 0.5) var(--wd-space);
  cursor: pointer;
}
.wd-nav-menu-item:hover { background: color-mix(in srgb, var(--_wd-color-ink) 5%, transparent); }
.wd-nav-menu-item:focus-visible {
  outline: 2px solid var(--_wd-color-accent);
  outline-offset: -2px;
}
.wd-nav-menu-item--current {
  /* Background highlight only — no left border, no rounded
     corners. The tint mixes the theme accent with the panel
     colour, so it follows the theme: light #D5E5E1 (ink
     13.3:1 AAA), dark #334242 (ink 9.6:1 AAA).
     Font-weight stays bold. */
  background: color-mix(in srgb, var(--_wd-color-accent) 20%, var(--_wd-color-panel));
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
  color: var(--_wd-color-muted);
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
  font-family: var(--_wd-font-family-body);
  font-size: var(--wd-font-small);
  line-height: 1;
  color: var(--_wd-color-ink);
  background: var(--_wd-color-panel);
  border: 1px solid var(--_wd-color-border);
  border-radius: 999px;
  padding: calc(var(--wd-space) * 0.25) var(--wd-space);
  cursor: pointer;
}
.wd-end-note button:hover { border-color: var(--_wd-color-accent); }
.wd-end-note button:focus-visible {
  outline: 2px solid var(--_wd-color-accent);
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
  color: var(--_wd-color-muted);
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
