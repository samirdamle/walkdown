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
  min-height: 240px;
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
  padding: var(--wd-space-screen-y) var(--wd-space-screen-x);
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: var(--wd-color-border) transparent;
}

.wd-title {
  font-family: var(--wd-font-family-title);
  font-size: var(--wd-font-title);
  line-height: var(--wd-line-height-title);
  font-weight: 700;
  margin: 0 auto var(--wd-gap-title);
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
  margin: 0 auto var(--wd-space);
  max-width: var(--wd-content-max-width);
  width: 100%;
}

/* --- Panels: the grid (§7.2). CSS does the distribution; JS only sets --wd-cols. --- */
.wd-panels {
  display: grid;
  grid-template-columns: repeat(var(--wd-cols, 1), minmax(0, 1fr));
  gap: var(--wd-gap-panel);
  width: 100%;
  max-width: var(--wd-content-max-width);
  margin: auto;
  align-content: center;
  flex: 1 1 auto;
}

.wd-screen--scrolling .wd-panels {
  align-content: start;
}

.wd-panel {
  background: var(--wd-color-panel);
  border: 1px solid var(--wd-color-border);
  border-radius: var(--wd-radius-panel);
  padding: var(--wd-pad-panel);
  font-size: var(--wd-font-body);
  line-height: var(--wd-line-height-body);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
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
  border-radius: 4px;
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

/* --- Single-panel screens become a hero (§7.4). --- */
.wd-screen--hero .wd-panel {
  max-width: var(--wd-hero-max-width);
  min-height: var(--wd-hero-min-height);
  margin: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-size: calc(var(--wd-font-body) * 1.15);
}

/* --- Enter animations (§8): transform + opacity only. --- */
@keyframes wd-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes wd-slide-in-forward {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wd-slide-in-backward {
  from { opacity: 0; transform: translateX(-24px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wd-screen-in-forward {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wd-screen-in-backward {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}

.wd-panel.wd-enter--fade-in { animation: wd-fade-in var(--wd-anim-duration, 300ms) ease-out; }
.wd-panel.wd-enter--slide-in-forward { animation: wd-slide-in-forward var(--wd-anim-duration, 300ms) ease-out; }
.wd-panel.wd-enter--slide-in-backward { animation: wd-slide-in-backward var(--wd-anim-duration, 300ms) ease-out; }
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
  height: 48px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 8px;
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
  font-size: 20px;
  line-height: 1;
  width: 40px;
  height: 40px;
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
  padding: 2px 10px;
  pointer-events: auto;
}

/* Controls auto-hide on idle on desktop (§6.5); never on touch, where there is no hover to bring them back. */
.wd-deck--idle .wd-controls { opacity: 0; }
@media (pointer: coarse) {
  .wd-deck--idle .wd-controls { opacity: 1; }
}

/* --- End state (§6.2): a subtle indication, not a dead end. --- */
.wd-end-note {
  position: absolute;
  left: 50%;
  bottom: 56px;
  transform: translateX(-50%);
  font-size: var(--wd-font-small);
  color: var(--wd-color-muted);
  background: var(--wd-color-panel);
  border: 1px solid var(--wd-color-border);
  border-radius: 999px;
  padding: 4px 12px;
  z-index: 3;
  pointer-events: none;
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
.wd-deck--empty .wd-scroll-cue,
.wd-deck--empty .wd-end-note {
  display: none;
}
`;
