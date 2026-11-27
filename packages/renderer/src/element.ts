/**
 * `<walkdown-deck>` — the Walkdown renderer (Phase 3, spec §5–§8, §11).
 *
 * A Web Components custom element (Shadow DOM, spec §11.3) that
 * renders a parsed Deck from `@walkdown/core` with stepwise reveal,
 * navigation, themes, and fluid layout. It consumes the core —
 * it never re-parses Markdown or re-resolves defaults (§4.3:
 * `Screen.reveal` is fully computed by the parser).
 *
 * Usage:
 *
 * ```html
 * <walkdown-deck src="deck.md"></walkdown-deck>
 * <walkdown-deck id="d"></walkdown-deck>
 * <script type="module">
 *   import '@walkdown/renderer';
 *   import { parseDeck } from '@walkdown/core';
 *   document.querySelector('#d').markdown = await (await fetch('deck.md')).text();
 *   // or: document.querySelector('#d').deck = parseDeck(text);
 * </script>
 * ```
 *
 * Dark theme: the deck's frontmatter `theme:` (spec §2.1, default
 * `'light'`) drives the palette; a `theme` attribute on the element
 * overrides it. There is no automatic `prefers-color-scheme`
 * switching in v0.1 — the deck author chooses, explicitly.
 *
 * Document title: with the `document-title` attribute the element
 * owns `document.title` and updates it per screen (§6.2, issue
 * #86); without it the element never touches the page title, so
 * an embedded deck cannot hijack its host page's title. The demo
 * page opts in.
 *
 * Navigation (spec §6.1): wheel / ArrowUp/Down scroll within the
 * screen; ArrowRight or right-half click/tap = Next; ArrowLeft or
 * left-half click/tap = Previous; Space/PageDown = Next
 * (provisional, §10); Home/End = Start/End; `+`/`-` zoom.
 * Horizontal swipe advances/retreats (provisional threshold,
 * `swipeThreshold()` in `gestures.ts`); vertical swipe scrolls.
 * The two gestures never fight: `touch-action: pan-y` lets the
 * browser own vertical scrolling while horizontal movement
 * reaches this code.
 *
 * The element is the orchestrator; each job lives in its own
 * module: `facts.ts` (derived deck facts), `nav-menu.ts` (the
 * §6.6 menu), `layout.ts` (layout + the font-fit measurement
 * pass), `gestures.ts` (swipe/tap), `effects.ts` (enter
 * animations), `scroll.ts` (reveal auto-scroll), `render.ts`
 * (panel markup).
 */

import {
  clampState,
  endState,
  hashFor,
  isEmptyDeck,
  jumpToScreen,
  nextState,
  parseDeck,
  prevState,
  startState,
  stateFromHash,
  visiblePanelIndexes,
  zoomIn,
  zoomOut,
} from '@walkdown/core';
import type { Deck, Panel, Screen, Theme, WalkState } from '@walkdown/core';
import { animatePanelIn } from './effects.js';
import { DeckFacts } from './facts.js';
import { PointerTracker } from './gestures.js';
import { LayoutController } from './layout.js';
import { NavMenu } from './nav-menu.js';
import { panelsHtml } from './render.js';
import { panelContentRect, prefersReducedMotion, scrollPanelIntoView } from './scroll.js';
import { animateStackStep, isStackScreen, stackPanelsHtml } from './stack.js';
import { loadStylesheets } from './loader.js';
import { deckClassesOf, sanitizeCss } from './sanitize.js';
import { DEFAULT_CSS, themeVarsCss } from './styles.js';

const IDLE_HIDE_MS = 2500;
const SCROLL_STEP_FRACTION = 0.4;

/** Focus inside the panels, recorded before a rebuild so it can be restored after it (§5, issue #79). */
interface SavedPanelsFocus {
  /** The `data-panel` index of the panel holding focus. */
  panelIndex: number;
  /** The focused element's position among that panel's focusable descendants. */
  focusableIndex: number;
}

/**
 * A panel's focusable descendants, in document order. Links are the
 * case decks produce (`renderInline` emits real `<a href>`); the
 * rest covers author HTML. `[tabindex]` is included whole —
 * including `-1` — because save/restore matches by position, and
 * programmatic focus works on `-1` elements.
 */
function focusablesInPanel(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute('hidden'),
  );
}

export class WalkdownDeckElement extends HTMLElement {
  static observedAttributes = ['src', 'markdown', 'theme', 'document-title'];

  private shadow: ShadowRoot;
  private deckEl!: HTMLDivElement;
  private screenEl!: HTMLDivElement;
  private panelsEl!: HTMLDivElement;
  private titleEl!: HTMLHeadingElement;
  private sectionEl!: HTMLDivElement;
  private progressBarEl!: HTMLDivElement;
  private progressTextEl!: HTMLButtonElement;
  private progressDescEl!: HTMLSpanElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private navMenuEl!: HTMLDivElement;
  private scrollCueEl!: HTMLDivElement;
  private controlsEl!: HTMLDivElement;
  private endNoteEl!: HTMLDivElement;
  private restartBtn!: HTMLButtonElement;
  private emptyEl!: HTMLDivElement;
  private themeStyleEl!: HTMLStyleElement;
  private externalStyleEl!: HTMLStyleElement;
  private inlineStyleEl!: HTMLStyleElement;

  private _deck: Deck | null = null;
  /** Derived deck facts, rebuilt for each loaded deck (`facts.ts`). */
  private _facts: DeckFacts | null = null;
  private _state: WalkState = startState();
  private _deckUrl: string | undefined;
  private _themeOverride: Theme | null = null;
  /** Layout + font-fit measurement pass (`layout.ts`). */
  private _layout!: LayoutController;
  /** Section-jump menu (`nav-menu.ts`). */
  private _navMenu!: NavMenu;
  /** Swipe/tap state machine (`gestures.ts`). */
  private _tracker = new PointerTracker();
  private _resizeObserver: ResizeObserver | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _stylesLoaded = false;
  private _srcLoading: string | null = null;

  constructor() {
    super();
    // The shadow root delegates focus (§6.1, issue #81): the host
    // stays a tab stop (tabIndex = 0 in connectedCallback), but
    // focusing it — Tab, click, or focus() — moves focus to the
    // first focusable element inside, the screen region, so Tab
    // never stops on the bare host, which has no role and no name.
    this.shadow = this.attachShadow({ mode: 'open', delegatesFocus: true });
    this.shadow.innerHTML = `
      <style id="wd-theme"></style>
      <style id="wd-default">${DEFAULT_CSS}</style>
      <style id="wd-external"></style>
      <style id="wd-inline"></style>
      <div class="wd-deck" part="deck">
        <div class="wd-progress" aria-hidden="true"><div class="wd-progress-bar"></div></div>
        <div class="wd-screen" tabindex="0" role="region" aria-roledescription="presentation">
          <div class="wd-section-label"></div>
          <h1 class="wd-title"></h1>
          <div class="wd-panels"></div>
        </div>
        <div class="wd-scroll-cue" aria-hidden="true"><span>Scroll for more ↓</span></div>
        <div class="wd-end-note" hidden><button class="wd-restart" type="button">Start over</button></div>
        <div class="wd-nav-menu" id="wd-nav-menu" role="menu" aria-label="Jump to" hidden></div>
        <div class="wd-controls">
          <button class="wd-prev" type="button" aria-label="Previous step">‹</button>
          <button class="wd-progress-text" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="wd-nav-menu" aria-describedby="wd-progress-desc" aria-live="polite"></button>
          <span id="wd-progress-desc" class="wd-visually-hidden"></span>
          <button class="wd-next" type="button" aria-label="Next step">›</button>
        </div>
        <div class="wd-empty" hidden><p>This deck is empty.</p></div>
      </div>`;
    this.deckEl = this.shadow.querySelector('.wd-deck') as HTMLDivElement;
    this.screenEl = this.shadow.querySelector('.wd-screen') as HTMLDivElement;
    this.sectionEl = this.shadow.querySelector('.wd-section-label') as HTMLDivElement;
    this.titleEl = this.shadow.querySelector('.wd-title') as HTMLHeadingElement;
    this.panelsEl = this.shadow.querySelector('.wd-panels') as HTMLDivElement;
    this.progressBarEl = this.shadow.querySelector('.wd-progress-bar') as HTMLDivElement;
    this.progressTextEl = this.shadow.querySelector('.wd-progress-text') as HTMLButtonElement;
    this.progressDescEl = this.shadow.querySelector('#wd-progress-desc') as HTMLSpanElement;
    this.prevBtn = this.shadow.querySelector('.wd-prev') as HTMLButtonElement;
    this.nextBtn = this.shadow.querySelector('.wd-next') as HTMLButtonElement;
    this.navMenuEl = this.shadow.querySelector('.wd-nav-menu') as HTMLDivElement;
    this.scrollCueEl = this.shadow.querySelector('.wd-scroll-cue') as HTMLDivElement;
    this.controlsEl = this.shadow.querySelector('.wd-controls') as HTMLDivElement;
    this.endNoteEl = this.shadow.querySelector('.wd-end-note') as HTMLDivElement;
    this.restartBtn = this.shadow.querySelector('.wd-restart') as HTMLButtonElement;
    this.emptyEl = this.shadow.querySelector('.wd-empty') as HTMLDivElement;
    this.themeStyleEl = this.shadow.querySelector('#wd-theme') as HTMLStyleElement;
    this.externalStyleEl = this.shadow.querySelector('#wd-external') as HTMLStyleElement;
    this.inlineStyleEl = this.shadow.querySelector('#wd-inline') as HTMLStyleElement;
    // Theme defaults from construction: the layer is valid before
    // any deck loads, and _applyThemeVars refreshes it on load
    // and on a `theme` attribute change.
    this._applyThemeVars();
    this._layout = new LayoutController(this.deckEl, this.screenEl, this.controlsEl, this.scrollCueEl, this);
    this._navMenu = new NavMenu(this.navMenuEl, this.progressTextEl, this.deckEl, this, {
      onFirst: () => this.goToStart(),
      onLast: () => this.goToEnd(),
      onJump: (screenIndex) => this.jumpTo(screenIndex, 'forward'),
      onOpen: () => this._armIdleTimer(),
    });
  }

  // --- Public API -------------------------------------------------------

  /** The parsed deck model. Setting it renders the deck from its first step (or the deep link, §1.4). */
  get deck(): Deck | null {
    return this._deck;
  }
  set deck(deck: Deck | null) {
    this.loadDeck(deck);
  }

  /** Markdown text: parsed with `@walkdown/core`'s `parseDeck`. */
  get markdown(): string {
    return this._markdownText;
  }
  set markdown(text: string) {
    this._markdownText = text;
    this.loadDeck(parseDeck(text), undefined);
  }
  private _markdownText = '';

  /** URL of a Markdown deck to fetch and render. Relative stylesheet URLs resolve against it. */
  get src(): string | null {
    return this.getAttribute('src');
  }
  set src(url: string | null) {
    if (url === null) {
      this.removeAttribute('src');
    } else {
      this.setAttribute('src', url);
    }
  }

  /** Effective theme: the element's `theme` attribute wins over the deck's frontmatter `theme:`. */
  get theme(): Theme {
    return this._themeOverride ?? this._deck?.theme ?? 'light';
  }

  /**
   * Whether this element owns `document.title` (§6.2, issue #86):
   * with the `document-title` attribute the tab title follows the
   * current screen; without it (the default) the element never
   * touches the page title, so an embedded deck cannot hijack its
   * host page's title. The demo page opts in.
   */
  get documentTitle(): boolean {
    return this.hasAttribute('document-title');
  }
  set documentTitle(value: boolean) {
    if (value) this.setAttribute('document-title', '');
    else this.removeAttribute('document-title');
  }

  /** Current walk state (screenIndex, stepIndex, zoom). */
  get state(): WalkState {
    return { ...this._state };
  }

  /** Total steps in the deck (the progress indicator counts these, §1.3). */
  get stepsTotal(): number {
    return this._facts === null ? 0 : this._facts.totalSteps;
  }

  /** The deck's screens in flat order (§1.2). */
  get screens() {
    return this._facts === null ? [] : this._facts.screens;
  }

  /** Load a parsed deck, optionally with the URL it came from (for stylesheet resolution). */
  loadDeck(deck: Deck | null, deckUrl?: string): void {
    this._deck = deck;
    this._facts = deck === null ? null : new DeckFacts(deck);
    this._deckUrl = deckUrl;
    this._stylesLoaded = false;
    this._state = startState();
    if (deck !== null && !isEmptyDeck(deck)) {
      // Restore a deep link on load (§1.4); an out-of-range link clamps.
      this._state = stateFromHash(deck, this._currentHash(), this._state.zoom);
    }
    this._applyThemeVars();
    this._applyDeckStyles();
    this._render({ animate: false });
    this._applyDocumentTitle();
    this._applyLayout();
    this._updateScrollCue();
  }

  /**
   * Override the measured container size (CSS px). Normally the
   * element measures itself; this exists for tests and embedded
   * contexts where the host has no layout yet. Pass null to go
   * back to measuring.
   */
  setContainerSize(width: number, height: number): void;
  setContainerSize(size: null): void;
  setContainerSize(widthOrNull: number | null, height?: number): void {
    this._layout.setContainerSize(widthOrNull === null ? null : { width: widthOrNull, height: height ?? 0 });
    this._applyLayout();
  }

  next(): void {
    this._applyState(this._deck === null ? this._state : nextState(this._deck, this._state), { animate: true });
  }

  prev(): void {
    this._applyState(this._deck === null ? this._state : prevState(this._deck, this._state), { animate: true });
  }

  goToStart(): void {
    this._applyState(startState(), { animate: false, jump: true });
  }

  goToEnd(): void {
    if (this._deck !== null) this._applyState(endState(this._deck), { animate: false, jump: true });
  }

  jumpTo(screenIndex: number, direction: 'forward' | 'backward' = 'forward'): void {
    if (this._deck === null) return;
    this._applyState(jumpToScreen(this._deck, screenIndex, direction, this._state.zoom), {
      animate: false,
      jump: true,
    });
  }

  zoomInStep(): void {
    this._setZoom(zoomIn(this._state.zoom));
  }

  zoomOutStep(): void {
    this._setZoom(zoomOut(this._state.zoom));
  }

  // --- Lifecycle --------------------------------------------------------

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'src' && value !== null) void this._loadFromSrc(value);
    if (name === 'markdown' && value !== null) this.markdown = value;
    if (name === 'theme' && value !== null) {
      this._themeOverride = value === 'dark' ? 'dark' : 'light';
      this._applyThemeVars();
      this._applyLayout();
    }
    if (name === 'document-title' && value !== null) {
      // Opting in owns the document title from now on (§6.2, issue
      // #86): apply the current screen's title at once, so the tab
      // does not wait for the next navigation.
      this._applyDocumentTitle();
    }
  }

  connectedCallback(): void {
    this.tabIndex = 0;
    this.addEventListener('keydown', this._onKeyDown);
    this.addEventListener('focusin', this._onFocusIn);
    this.screenEl.addEventListener('scroll', this._onScroll);
    this.screenEl.addEventListener('pointerdown', this._onPointerDown);
    this.screenEl.addEventListener('pointermove', this._onPointerMove);
    this.screenEl.addEventListener('pointerup', this._onPointerUp);
    this.screenEl.addEventListener('pointercancel', this._onPointerUp);
    this.addEventListener('pointermove', this._onHostPointerMove);
    this.prevBtn.addEventListener('click', this._onPrevClick);
    this.nextBtn.addEventListener('click', this._onNextClick);
    this.progressTextEl.addEventListener('click', this._onProgressClick);
    this.navMenuEl.addEventListener('click', this._onNavMenuClick);
    this.navMenuEl.addEventListener('keydown', this._onNavMenuKeyDown);
    this.restartBtn.addEventListener('click', this._onRestartClick);
    document.addEventListener('pointerdown', this._onDocumentPointerDown);
    document.addEventListener('focusin', this._onDocumentFocusIn);
    window.addEventListener('hashchange', this._onHashChange);
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._applyLayout());
      this._resizeObserver.observe(this);
    }
    this._armIdleTimer();
    if (this._deck !== null) {
      this._render({ animate: false });
      this._applyLayout();
    } else if (this.hasAttribute('src') && this._srcLoading === null) {
      void this._loadFromSrc(this.getAttribute('src') as string);
    }
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeyDown);
    this.removeEventListener('focusin', this._onFocusIn);
    this.screenEl.removeEventListener('scroll', this._onScroll);
    this.screenEl.removeEventListener('pointerdown', this._onPointerDown);
    this.screenEl.removeEventListener('pointermove', this._onPointerMove);
    this.screenEl.removeEventListener('pointerup', this._onPointerUp);
    this.screenEl.removeEventListener('pointercancel', this._onPointerUp);
    this.removeEventListener('pointermove', this._onHostPointerMove);
    this.prevBtn.removeEventListener('click', this._onPrevClick);
    this.nextBtn.removeEventListener('click', this._onNextClick);
    this.progressTextEl.removeEventListener('click', this._onProgressClick);
    this.navMenuEl.removeEventListener('click', this._onNavMenuClick);
    this.navMenuEl.removeEventListener('keydown', this._onNavMenuKeyDown);
    this.restartBtn.removeEventListener('click', this._onRestartClick);
    document.removeEventListener('pointerdown', this._onDocumentPointerDown);
    document.removeEventListener('focusin', this._onDocumentFocusIn);
    window.removeEventListener('hashchange', this._onHashChange);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._idleTimer !== null) clearTimeout(this._idleTimer);
  }

  // --- Loading ----------------------------------------------------------

  private async _loadFromSrc(url: string): Promise<void> {
    if (this._srcLoading === url) return;
    this._srcLoading = url;
    let absolute: string;
    try {
      absolute = new URL(url, document.baseURI).href;
    } catch {
      this._srcLoading = null;
      this._showEmpty('Could not load this deck.');
      return;
    }
    let res: Response;
    try {
      res = await fetch(absolute);
    } catch {
      this._srcLoading = null;
      this._showEmpty('Could not load this deck.');
      return;
    }
    if (!res.ok) {
      this._srcLoading = null;
      this._showEmpty('Could not load this deck.');
      return;
    }
    this._markdownText = await res.text();
    this._srcLoading = null;
    this.loadDeck(parseDeck(this._markdownText), absolute);
  }

  private _showEmpty(message: string): void {
    this._deck = null;
    this._facts = null;
    const p = this.emptyEl.querySelector('p');
    if (p !== null) p.textContent = message;
    this._render({ animate: false });
  }

  /** Apply the deck's stylesheets (external, then inline) into the Shadow DOM, in cascade order (§11.2). */
  private async _applyDeckStyles(): Promise<void> {
    this.externalStyleEl.textContent = '';
    this.inlineStyleEl.textContent = '';
    if (this._deck === null) return;
    const deck = this._deck;
    if (deck.styles !== '') {
      this.inlineStyleEl.textContent = sanitizeCss(deck.styles, { deckClasses: deckClassesOf(deck) });
    }
    if (deck.stylesheets.length === 0) {
      this._stylesLoaded = true;
      return;
    }
    // Render first with the default theme; stylesheets apply as they arrive (§11.4).
    const loaded = await loadStylesheets(deck.stylesheets, this._deckUrl);
    if (this._deck !== deck) return; // a newer deck loaded meanwhile
    this.externalStyleEl.textContent = loaded.map((s) => s.css).join('\n');
    this._stylesLoaded = true;
  }

  // --- Rendering --------------------------------------------------------

  private _currentHash(): string {
    try {
      return window.location.hash;
    } catch {
      return '';
    }
  }

  /**
   * Apply the theme defaults (spec §11.2, layer 1): replace the
   * `#wd-theme` stylesheet layer with the current theme's
   * private aliases (`themeVarsCss`). Called on load and on a
   * `theme` attribute change — the only two ways the theme can
   * change — and from the constructor, so the layer is valid
   * before any deck loads. Theme vars are NOT inline style
   * (issue #75): deck stylesheets set the public vars and win
   * without `!important` because the aliases read them.
   * Layout passes never touch this layer; measured layout vars
   * still go inline on `.wd-deck` (§7.2).
   */
  private _applyThemeVars(): void {
    this.themeStyleEl.textContent = themeVarsCss(this.theme);
  }

  /** Re-run the layout engine for the current screen (spec §7.2). Debounced by ResizeObserver's own cadence. */
  private _applyLayout(): void {
    if (this._facts === null) return;
    this._layout.applyLayout(this._facts, this._state);
  }

  private _updateScrollCue(): void {
    this._layout.updateScrollCue();
  }

  private _applyState(next: WalkState, opts: { animate: boolean; jump?: boolean }): void {
    if (this._deck === null) return;
    const prev = this._state;
    const clamped = clampState(this._deck, next);
    const changed = clamped.screenIndex !== prev.screenIndex || clamped.stepIndex !== prev.stepIndex;
    this._state = clamped;
    if (changed) {
      try {
        history.replaceState(null, '', hashFor(clamped));
      } catch {
        // Non-browser or restricted context: the walk still works.
      }
      // The tab title follows the screen (§6.2, issue #86) — only
      // when this element owns it (the `document-title` attribute).
      this._applyDocumentTitle();
      // Any navigation dismisses the menu (§6.6) — it is a
      // transient overlay, and the walk has moved on.
      if (this._navMenu.isOpen) this._navMenu.close();
    }
    this._render({ animate: opts.animate, jump: opts.jump ?? false, prev });
    // The fit is fixed per screen from its total content (§7.2):
    // re-layout only when the screen itself changes. A step that
    // reveals another panel must not change the type size — that
    // size was already computed from the whole screen. The scroll
    // cue still needs updating on a step change: a newly revealed
    // panel can make the screen scrollable.
    if (clamped.screenIndex !== prev.screenIndex) this._applyLayout();
    else this._updateScrollCue();
  }

  /**
   * Owns `document.title` when the `document-title` attribute is
   * present (§6.2, issue #86): the tab title follows the current
   * screen — "`<screen title>` — `<deck title>`", the screen title
   * alone when the deck has none — and is left alone when the
   * screen has no title. A step change within a screen does not
   * change the title: it is per screen, so a redundant write is
   * skipped. Guarded like the `replaceState` call: a missing or
   * restricted `document` must never break navigation. Removing
   * the attribute stops future updates; it does not restore the
   * title the element overwrote — that title is the host page's
   * to manage once it takes ownership back.
   */
  private _applyDocumentTitle(): void {
    if (!this.hasAttribute('document-title') || this._deck === null || this._facts === null) return;
    const screen = this._facts.screens[this._state.screenIndex];
    const screenTitle = screen?.title;
    if (screenTitle === undefined) return;
    const title = this._deck.title === undefined ? screenTitle : `${screenTitle} — ${this._deck.title}`;
    try {
      if (document.title !== title) document.title = title;
    } catch {
      // Non-browser or restricted context: the walk still works.
    }
  }

  private _setZoom(zoom: number): void {
    if (zoom === this._state.zoom) return;
    this._state = { ...this._state, zoom };
    this._render({ animate: false, prev: this._state });
    this._applyLayout();
  }

  /**
   * Records focus inside the panels before a rebuild (§5, issue
   * #79): the rebuild destroys the focused element, so without a
   * record it falls to `<body>`. Null when focus is not inside
   * the panels (controls, screen region, menu) — those elements
   * are not rebuilt, so there is nothing to restore.
   */
  private _savePanelsFocus(): SavedPanelsFocus | null {
    const active = this.shadow.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const panel = active.closest('[data-panel]');
    if (!(panel instanceof HTMLElement) || !this.panelsEl.contains(panel)) return null;
    const focusables = focusablesInPanel(panel);
    const focusableIndex = focusables.indexOf(active);
    if (focusableIndex < 0) return null;
    const panelIndex = Number(panel.getAttribute('data-panel'));
    if (!Number.isInteger(panelIndex)) return null;
    return { panelIndex, focusableIndex };
  }

  /**
   * Puts focus back after a rebuild: the same element when its
   * panel is still visible (same panel, same position among its
   * focusables), its panel's first focusable when that element
   * is gone, and the screen region when the panel itself is gone
   * or hidden — stepped back past it, its stack card dismissed,
   * or the screen changed. The screen region is the always-safe
   * place to land: it is focusable, labelled, and inside the deck.
   * `aria-hidden` is the uniform hidden signal for both layouts
   * (plain panels carry it with the `hidden` attribute; dismissed
   * stack cards carry it with `visibility: hidden`).
   */
  private _restorePanelsFocus(saved: SavedPanelsFocus | null): void {
    if (saved === null) return;
    const panel = this.panelsEl.querySelector(`[data-panel="${saved.panelIndex}"]`);
    if (panel instanceof HTMLElement && panel.getAttribute('aria-hidden') !== 'true') {
      const focusables = focusablesInPanel(panel);
      const target = focusables[saved.focusableIndex] ?? focusables[0];
      if (target !== undefined) {
        target.focus();
        return;
      }
    }
    this.screenEl.focus();
  }

  /**
   * Replaces the panels' HTML, preserving focus (§5, issue #79).
   * Used for the synchronous render and for the stack
   * choreography's deferred swap, which is the same rebuild a
   * beat later: record focus first, swap, restore.
   */
  private _setPanelsHtml(html: string): void {
    const saved = this._savePanelsFocus();
    this.panelsEl.innerHTML = html;
    this._restorePanelsFocus(saved);
  }

  private _render(opts: { animate: boolean; jump?: boolean; prev?: WalkState }): void {
    const deck = this._deck;
    const empty = deck === null || isEmptyDeck(deck) || this.screens.length === 0;
    this.emptyEl.hidden = !empty;
    this.deckEl.classList.toggle('wd-deck--empty', empty);
    this.prevBtn.disabled = empty;
    this.nextBtn.disabled = empty;
    if (empty) {
      this.screenEl.style.display = 'none';
      this.progressBarEl.style.width = '0%';
      this.progressTextEl.textContent = '';
      this.progressDescEl.textContent = '';
      this.endNoteEl.hidden = true;
      this.deckEl.classList.toggle('wd-deck--end', false);
      this._navMenu.close(false);
      this._navMenu.sync(null, null, -1);
      this.scrollCueEl.classList.remove('wd-scroll-cue--visible');
      return;
    }
    const facts = this._facts;
    if (facts === null) return;
    this.screenEl.style.display = '';
    const screens = facts.screens;
    const screen = facts.screen(this._state.screenIndex);
    if (screen === undefined) return;
    const prev = opts.prev;
    const screenChanged = prev !== undefined && prev.screenIndex !== this._state.screenIndex;
    const prevVisible = prev !== undefined && !screenChanged ? visiblePanelIndexes(screen, prev.stepIndex) : [];
    const visible = new Set(visiblePanelIndexes(screen, this._state.stepIndex));

    // Keep the reader's scroll position on step changes; a new
    // screen starts at the top (§5: re-entering forward restores
    // the screen fully revealed; scroll itself is per-screen).
    const scrollTop = this.screenEl.scrollTop;
    const section = facts.sectionOfScreen(this._state.screenIndex);
    this.sectionEl.textContent = section?.title ?? '';
    this.sectionEl.style.display = section?.title ? '' : 'none';
    this.titleEl.textContent = screen.title ?? '';
    this.titleEl.style.display = screen.title ? '' : 'none';
    this.screenEl.setAttribute(
      'aria-label',
      `Screen ${this._state.screenIndex + 1} of ${screens.length}${screen.title ? `: ${screen.title}` : ''}`,
    );
    this.screenEl.classList.toggle('wd-screen--hero', screen.panels.length === 1);
    this.screenEl.classList.remove('wd-screen-enter--forward', 'wd-screen-enter--backward');
    // Force a reflow so a re-added enter animation replays.
    void this.screenEl.offsetWidth;
    if (screenChanged && opts.animate && !opts.jump) {
      this.screenEl.classList.add(
        this._state.screenIndex > (prev?.screenIndex ?? 0) ? 'wd-screen-enter--forward' : 'wd-screen-enter--backward',
      );
    }
    // Stack pile (§4.2): a stack screen renders its panels as a
    // pile, not a grid. The container carries the pile class and
    // the dismiss direction; the panels HTML is the pile at the
    // current step. On a genuine step forward/back the pile
    // animates on the CURRENT DOM (which still shows the old
    // pile) and the panels swap to the new rest state when the
    // choreography finishes — so the swap is deferred, and this
    // render leaves the panels alone.
    const isStack = isStackScreen(screen);
    this.panelsEl.classList.toggle('wd-panels--stack', isStack);
    if (isStack) this.panelsEl.setAttribute('data-stack-direction', screen.reveal.direction);
    else this.panelsEl.removeAttribute('data-stack-direction');
    // A screen change abandons any in-flight stack
    // choreography: its elements are about to be replaced.
    if (screenChanged) this._cancelStackAnimation();
    let stackAnimating = false;
    if (isStack && opts.animate && !opts.jump && !screenChanged && prev !== undefined) {
      stackAnimating = this._startStackAnimation(screen, prev.stepIndex, this._state.stepIndex);
    }
    if (!stackAnimating) {
      this._setPanelsHtml(
        isStack ? stackPanelsHtml(screen, this._state.stepIndex) : panelsHtml(screen.panels, visible),
      );
    }
    // Screen-level class hooks (§11.3).
    this.screenEl.classList.remove(...this._lastScreenClasses);
    this._lastScreenClasses = screen.classNames;
    for (const c of screen.classNames) this.screenEl.classList.add(c);
    if (screenChanged) this.screenEl.scrollTop = 0;
    else this.screenEl.scrollTop = scrollTop;

    // Enter animation (§5, §8): only the newly revealed panel, only on a step (never on a jump).
    // Stack screens never take this path: the pile's
    // dismiss/promote choreography is the enter animation there,
    // and a stack screen entered fresh (or by jump) renders its
    // pile in its rest state with no animation — the pile is a
    // pure function of (screen, stepIndex) (§4.2). A stack
    // screen also never scrolls on a step: the pile does not
    // move vertically.
    if (!isStack && opts.animate && !opts.jump && !screenChanged) {
      const newly = [...visible].find((i) => !prevVisible.includes(i));
      if (newly !== undefined) {
        const el = this.panelsEl.querySelector(`[data-panel="${newly}"]`);
        if (el instanceof HTMLElement) {
          // Measure before the enter animation starts: the
          // animation moves the panel with a transform, which
          // would skew the rect. The scroll then follows the
          // minimal-scroll rule of scrollIntoView({
          // block: 'nearest' }) (§7.4).
          const rect = panelContentRect(this.screenEl, el);
          const forward = this._state.stepIndex > (prev?.stepIndex ?? -1);
          animatePanelIn(el, screen.panels[newly] as Panel, screen, forward);
          scrollPanelIntoView(
            this.screenEl,
            rect,
            this._layout.controlsReservePx(this._layout.measureContainer().width),
          );
        }
      }
    } else if (!isStack && opts.animate && !opts.jump && screenChanged) {
      // First panel of a newly entered screen reveals with its own effect (§8).
      const first = screen.reveal.sequence[0];
      if (first !== undefined) {
        const el = this.panelsEl.querySelector(`[data-panel="${first}"]`);
        if (el instanceof HTMLElement) {
          const forward = this._state.screenIndex > (prev?.screenIndex ?? 0);
          animatePanelIn(el, screen.panels[first] as Panel, screen, forward);
        }
      }
    }

    // Progress counts steps, not screens (§1.3).
    const { current, total } = facts.progress(this._state);
    this.progressBarEl.style.width = total > 0 ? `${(current / total) * 100}%` : '0%';
    // The button's accessible name IS its visible text ("26 / 51",
    // §6.6, issue #82): no aria-label, so a voice-control user
    // saying "click 26 / 51" matches it (WCAG 2.5.3 Label in Name).
    // The extra context is an accessible description instead —
    // aria-describedby points at the visually-hidden span, so it
    // is announced after the name and can be skipped, never
    // packed into the label. The span sits outside the button,
    // so its text changes do not trigger the button's aria-live.
    this.progressTextEl.textContent = `${current} / ${total}`;
    this.progressDescEl.textContent = `Step ${current} of ${total}. Activate to jump to a screen.`;
    this.prevBtn.disabled = facts.isAtStart(this._state);
    this.nextBtn.disabled = facts.isAtEnd(this._state);
    this.endNoteEl.hidden = !facts.isAtEnd(this._state);
    // The scroll cue lifts above the end note while it shows (§7.4,
    // issue #64): both sit at the bottom reserve, so without the
    // lift the centred cue text would sit on the Start over button.
    this.deckEl.classList.toggle('wd-deck--end', facts.isAtEnd(this._state));
    this._navMenu.sync(deck, facts, facts.sectionIndexOfScreen(this._state.screenIndex));
    this._updateScrollCue();
  }

  /** Generation counter for stack choreography: a newer step bumps it, making an older animation's completion a no-op. */
  private _stackGen = 0;
  /** The running stack animations, so a new step can cancel them. */
  private _stackAnimations: Animation[] = [];

  /** Cancels any in-flight stack choreography and retires its generation. */
  private _cancelStackAnimation(): void {
    this._stackGen += 1;
    for (const a of this._stackAnimations) a.cancel();
    this._stackAnimations = [];
  }

  /**
   * Starts the stack dismiss/promote choreography on the current
   * DOM — which still shows the pile at `fromStep` — and swaps
   * the panels to the new rest state when it finishes. Returns
   * true when an animation is running (the caller leaves the
   * panels alone); false when the caller should render the new
   * rest state synchronously. No animation under reduced motion,
   * at zero duration, without WAAPI, or when a step arrives
   * mid-flight (the pile then jumps to the new rest state: the
   * in-flight from-state is a stale pile, so animating from it
   * would visibly snap a card).
   */
  private _startStackAnimation(screen: Screen, fromStep: number, toStep: number): boolean {
    if (fromStep === toStep) return false;
    this._stackGen += 1;
    const gen = this._stackGen;
    if (this._stackAnimations.length > 0) {
      // A step mid-flight: cancel and jump to the new rest state.
      for (const a of this._stackAnimations) a.cancel();
      this._stackAnimations = [];
      return false;
    }
    if (prefersReducedMotion() || screen.reveal.durationMs <= 0) return false;
    const forward = toStep > fromStep;
    const result = animateStackStep(this.panelsEl, screen, fromStep, toStep, forward);
    if (result === null) return false;
    this._stackAnimations = result.animations;
    const screenIndex = this._state.screenIndex;
    result.finished.then(() => {
      if (this._stackGen !== gen) return; // superseded by a newer step
      if (this._state.screenIndex !== screenIndex || this._state.stepIndex !== toStep) return;
      this._stackAnimations = [];
      const current = this._facts?.screen(screenIndex);
      if (current === undefined || !isStackScreen(current)) return;
      this._setPanelsHtml(stackPanelsHtml(current, toStep));
      this._updateScrollCue();
    });
    return true;
  }

  private _lastScreenClasses: string[] = [];

  // --- Navigation menu (§6.6) -------------------------------------------

  private _onProgressClick = (): void => {
    this._navMenu.toggle();
  };

  private _onNavMenuClick = (e: MouseEvent): void => {
    this._navMenu.handleItemClick(e);
  };

  /** Arrow/Home/End keys inside the menu are the menu's own navigation (§6.6, issue #72). */
  private _onNavMenuKeyDown = (e: KeyboardEvent): void => {
    this._navMenu.handleKeyDown(e);
  };

  /** A click/tap outside the deck closes the menu (§6.6). */
  private _onDocumentPointerDown = (e: PointerEvent): void => {
    this._navMenu.handleOutsidePointerDown(e);
  };

  /** Focus landing outside the menu (and outside the indicator) closes it (§6.6). */
  private _onDocumentFocusIn = (e: FocusEvent): void => {
    this._navMenu.handleFocusIn(e);
  };

  // --- Input ------------------------------------------------------------

  /**
   * Whether the real target of a key event is a native interactive
   * element. `e.target` is retargeted to the host inside shadow DOM, so
   * the real target is resolved from `e.composedPath()[0]` (§6.1,
   * issue #73). Space must activate a focused control, not walk the deck.
   */
  private _isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return target.closest('button, a[href], input, select, textarea, [contenteditable]') !== null;
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    // Every key re-arms the idle timer (§6.5, issue #77) — Tab
    // included, and keys the switch below ignores. It used to sit
    // after the switch, so the `default` branch returned early
    // and a keyboard user tabbing through an idle deck never
    // brought the controls back. Re-arming first also means the
    // controls are back before the key's own navigation runs.
    // It stays first even when the menu guard below swallows the
    // key: the keypress still counts as activity.
    this._armIdleTimer();
    // While the navigation menu is open, ArrowUp/ArrowDown/Home/End belong
    // to the menu (§6.6, issue #72): the menu's own keydown handler moves
    // between items and stops the event, but a key pressed with focus
    // outside the menu element — e.g. on the indicator — would otherwise
    // reach this handler and scroll the screen or jump the deck. Swallow
    // the keys here instead (no preventDefault: nothing happens at all).
    // Edge: with focus on the indicator the key is a dead key — the menu
    // is still closable via Escape or by clicking the indicator.
    if (
      this._navMenu.isOpen &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End')
    ) {
      return;
    }
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.prev();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.screenEl.scrollBy({ top: this.screenEl.clientHeight * SCROLL_STEP_FRACTION });
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.screenEl.scrollBy({ top: -this.screenEl.clientHeight * SCROLL_STEP_FRACTION });
        break;
      case ' ':
        // Space activates a focused control (§6.1, issue #73): it only
        // walks the deck when the target is the screen region or the
        // host itself. `preventDefault()` on Space keydown would suppress
        // the control's native keyup activation, so an interactive target
        // is left alone — no preventDefault, no next().
        if (!this._isInteractiveTarget(e.composedPath()[0] ?? null)) {
          e.preventDefault();
          this.next();
        }
        break;
      case 'PageDown':
        e.preventDefault();
        this.next();
        break;
      case 'PageUp':
        e.preventDefault();
        this.prev();
        break;
      case 'Home':
        e.preventDefault();
        this.goToStart();
        break;
      case 'End':
        e.preventDefault();
        this.goToEnd();
        break;
      case 'Escape':
        // Escape closes the navigation menu (§6.6) and returns
        // focus to the indicator; otherwise it is not a walk key.
        if (this._navMenu.isOpen) {
          e.preventDefault();
          this._navMenu.close();
        }
        break;
      case '+':
      case '=':
      case 'Add':
        e.preventDefault();
        this.zoomInStep();
        break;
      case '-':
      case '_':
      case 'Subtract':
        e.preventDefault();
        this.zoomOutStep();
        break;
      default:
        return;
    }
  };

  /** Focus entering the deck re-arms the idle timer (§6.5,
      issue #77): Tab, a click, or assistive tech moving focus
      into the deck brings the controls back. `focusin` bubbles
      and is composed, so focus landing on any shadow-DOM
      descendant — a control, a panel link, the screen region —
      reaches the host. */
  private _onFocusIn = (): void => {
    this._armIdleTimer();
  };

  private _onScroll = (): void => {
    this._updateScrollCue();
  };

  private _onPrevClick = (): void => {
    this.prev();
  };

  private _onNextClick = (): void => {
    this.next();
  };

  /** Start over: back to the first step of the first screen, same as Start (§6.2). */
  private _onRestartClick = (): void => {
    this.goToStart();
  };

  private _onHostPointerMove = (): void => {
    this._armIdleTimer();
  };

  /** Controls auto-hide on idle on desktop (§6.5); never on touch. */
  private _armIdleTimer(): void {
    if (this._idleTimer !== null) clearTimeout(this._idleTimer);
    // Showing the controls again re-checks the fit (§7.2) — but
    // only on the actual transition, not on every pointer move:
    // auto-hide only changes opacity and visibility, never
    // height, so the reserve is the same either way; the
    // re-check keeps the guarantee if that ever changes.
    const wasIdle = this.deckEl.classList.contains('wd-deck--idle');
    this.deckEl.classList.remove('wd-deck--idle');
    if (wasIdle) this._applyLayout();
    let coarse = false;
    try {
      coarse = window.matchMedia('(pointer: coarse)').matches;
    } catch {
      coarse = false;
    }
    if (coarse) return;
    this._idleTimer = setTimeout(() => {
      this.deckEl.classList.add('wd-deck--idle');
      // Hiding the controls re-checks the fit too (§7.2).
      this._applyLayout();
    }, IDLE_HIDE_MS);
  }

  private _onPointerDown = (e: PointerEvent): void => {
    this._tracker.down(e.clientX, e.clientY, e.target);
  };

  private _onPointerMove = (e: PointerEvent): void => {
    const outcome = this._tracker.move(e.clientX, e.clientY, this._layout.measureContainer().width);
    if (outcome === 'next') this.next();
    else if (outcome === 'prev') this.prev();
  };

  private _onPointerUp = (e: PointerEvent): void => {
    const tap = this._tracker.up(e.clientX, e.clientY);
    if (!tap.hadStart) return;
    // A tap on the screen while the menu is open only dismisses
    // the menu (§6.6) — it must not also navigate.
    if (this._navMenu.isOpen) {
      this._navMenu.close();
      return;
    }
    if (tap.tapX === null) return;
    // A click that selects text does nothing (§6.3).
    try {
      if (window.getSelection()?.toString() !== '') return;
    } catch {
      // No selection API: proceed.
    }
    const rect = this.screenEl.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (tap.tapX >= midX) this.next();
    else this.prev();
  };

  private _onHashChange = (): void => {
    if (this._deck === null) return;
    const next = stateFromHash(this._deck, this._currentHash(), this._state.zoom);
    if (next.screenIndex !== this._state.screenIndex || next.stepIndex !== this._state.stepIndex) {
      this._applyState(next, { animate: false, jump: true });
    }
  };
}
