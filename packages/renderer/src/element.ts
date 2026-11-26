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
 * Navigation (spec §6.1): wheel / ArrowUp/Down scroll within the
 * screen; ArrowRight or right-half click/tap = Next; ArrowLeft or
 * left-half click/tap = Previous; Space/PageDown = Next
 * (provisional, §10); Home/End = Start/End; `+`/`-` zoom.
 * Horizontal swipe advances/retreats (provisional threshold from
 * the core's `swipeThreshold()`); vertical swipe scrolls. The two
 * gestures never fight: `touch-action: pan-y` lets the browser own
 * vertical scrolling while horizontal movement reaches this code.
 */

import {
  clampState,
  computeLayout,
  endState,
  flatScreens,
  FONT_FLOOR_PX,
  hashFor,
  isEmptyDeck,
  jumpToScreen,
  nextState,
  parseDeck,
  prevState,
  spaceUnitPx,
  startState,
  stateFromHash,
  stepsForScreen,
  swipeThreshold,
  themeVars,
  totalSteps,
  visiblePanelIndexes,
  zoomIn,
  zoomOut,
} from '@walkdown/core';
import type { Deck, Panel, Screen, Theme, WalkState } from '@walkdown/core';
import { loadStylesheets } from './loader.js';
import { deckClassesOf, sanitizeCss } from './sanitize.js';
import { DEFAULT_CSS } from './styles.js';

const TAP_MAX_MOVE_PX = 8;
const IDLE_HIDE_MS = 2500;
const SCROLL_STEP_FRACTION = 0.4;
/**
 * Bottom-controls reserve (§7.2): the controls are
 * `--wd-control-size` buttons (44–56px) with `--wd-space`
 * padding top and bottom, so their height is button + 2×
 * space (60–88px). When the element has no layout yet
 * (jsdom, or not yet painted) the height measures 0 — fall
 * back to 56px. (That is the pre-C8 smallest height; the true
 * minimum is 60px now that buttons are 44px — the fallback
 * only matters before first paint, and is left as is.) The
 * clearance keeps the lowest panel a small margin clear of
 * the controls even when the fit is exact — half the space
 * unit (C12), so it scales with the screen: 4px at phone
 * width, 8px at desktop.
 */
const CONTROLS_HEIGHT_FALLBACK_PX = 56;

/** A tap that starts a scroll/drag, or on an interactive element, is not navigation (§6.3). */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('a, button, input, textarea, select, [contenteditable], .wd-controls') !== null;
}

export class WalkdownDeckElement extends HTMLElement {
  static observedAttributes = ['src', 'markdown', 'theme'];

  private shadow: ShadowRoot;
  private deckEl!: HTMLDivElement;
  private screenEl!: HTMLDivElement;
  private panelsEl!: HTMLDivElement;
  private titleEl!: HTMLHeadingElement;
  private sectionEl!: HTMLDivElement;
  private progressBarEl!: HTMLDivElement;
  private progressTextEl!: HTMLButtonElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private navMenuEl!: HTMLDivElement;
  private _navMenuOpen = false;
  /** The deck the menu items were built from; sections never change mid-walk, so the menu is rebuilt only for a new deck. */
  private _navMenuDeck: Deck | null = null;
  private scrollCueEl!: HTMLDivElement;
  private controlsEl!: HTMLDivElement;
  private endNoteEl!: HTMLDivElement;
  private restartBtn!: HTMLButtonElement;
  private emptyEl!: HTMLDivElement;
  private externalStyleEl!: HTMLStyleElement;
  private inlineStyleEl!: HTMLStyleElement;

  private _deck: Deck | null = null;
  private _state: WalkState = startState();
  private _deckUrl: string | undefined;
  private _themeOverride: Theme | null = null;
  private _containerSize: { width: number; height: number } | null = null;
  /** Body size the last layout pass fitted (§2.2) — the measurement pass shrinks from here, never grows. */
  private _fittedBodyPx = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _pointerStart: { x: number; y: number; interactive: boolean } | null = null;
  private _gesture: 'undecided' | 'horizontal' | 'vertical' | 'handled' = 'undecided';
  private _stylesLoaded = false;
  private _srcLoading: string | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
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
        <div class="wd-end-note" hidden>End of deck <button class="wd-restart" type="button">Restart</button></div>
        <div class="wd-nav-menu" id="wd-nav-menu" role="menu" aria-label="Jump to" hidden></div>
        <div class="wd-controls">
          <button class="wd-prev" type="button" aria-label="Previous step">‹</button>
          <button class="wd-progress-text" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="wd-nav-menu" aria-live="polite"></button>
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
    this.prevBtn = this.shadow.querySelector('.wd-prev') as HTMLButtonElement;
    this.nextBtn = this.shadow.querySelector('.wd-next') as HTMLButtonElement;
    this.navMenuEl = this.shadow.querySelector('.wd-nav-menu') as HTMLDivElement;
    this.scrollCueEl = this.shadow.querySelector('.wd-scroll-cue') as HTMLDivElement;
    this.controlsEl = this.shadow.querySelector('.wd-controls') as HTMLDivElement;
    this.endNoteEl = this.shadow.querySelector('.wd-end-note') as HTMLDivElement;
    this.restartBtn = this.shadow.querySelector('.wd-restart') as HTMLButtonElement;
    this.emptyEl = this.shadow.querySelector('.wd-empty') as HTMLDivElement;
    this.externalStyleEl = this.shadow.querySelector('#wd-external') as HTMLStyleElement;
    this.inlineStyleEl = this.shadow.querySelector('#wd-inline') as HTMLStyleElement;
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

  /** Current walk state (screenIndex, stepIndex, zoom). */
  get state(): WalkState {
    return { ...this._state };
  }

  /** Total steps in the deck (the progress indicator counts these, §1.3). */
  get stepsTotal(): number {
    return this._deck === null ? 0 : totalSteps(this._deck);
  }

  /** The deck's screens in flat order (§1.2). */
  get screens() {
    return this._deck === null ? [] : flatScreens(this._deck);
  }

  /** Load a parsed deck, optionally with the URL it came from (for stylesheet resolution). */
  loadDeck(deck: Deck | null, deckUrl?: string): void {
    this._deck = deck;
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
    this._containerSize = widthOrNull === null ? null : { width: widthOrNull, height: height ?? 0 };
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
  }

  connectedCallback(): void {
    this.tabIndex = 0;
    this.addEventListener('keydown', this._onKeyDown);
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
    this.restartBtn.addEventListener('click', this._onRestartClick);
    document.addEventListener('pointerdown', this._onDocumentPointerDown);
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
    this.restartBtn.removeEventListener('click', this._onRestartClick);
    document.removeEventListener('pointerdown', this._onDocumentPointerDown);
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

  private _applyThemeVars(): void {
    // themeVars() is re-applied with the layout vars on every
    // layout pass; this keeps the colours right before first layout.
    const vars = themeVars(this.theme);
    for (const [k, v] of Object.entries(vars)) this.deckEl.style.setProperty(k, v);
  }

  private _measureContainer(): { width: number; height: number } {
    if (this._containerSize !== null) return this._containerSize;
    const w = this.clientWidth || 0;
    const h = this.clientHeight || 0;
    // No layout yet (e.g. jsdom, or not yet painted): fall back to a
    // desktop-sized viewport so the first render is still correct.
    return { width: w > 0 ? w : 1440, height: h > 0 ? h : 900 };
  }

  /**
   * Bottom reserve (§7.2): the height the bottom controls
   * occupy, plus a small clearance, so panels never sit
   * underneath them. Measured for real when the element has
   * layout; the fallback covers jsdom / not-yet-painted.
   * Auto-hide only changes the controls' opacity, never their
   * height, so the reserve is the same whether they are
   * currently visible or idle-hidden — they can reappear at
   * any moment, and the layout must already clear them.
   */
  private _controlsReservePx(containerWidth: number): number {
    const measured = this.controlsEl?.offsetHeight ?? 0;
    const height = measured > 0 ? measured : CONTROLS_HEIGHT_FALLBACK_PX;
    // Clearance (C12): half the space unit, computed from the
    // container width with the same formula as `--wd-space` —
    // the reserve is an input to computeLayout, so it cannot
    // be read back from the layout result.
    return height + spaceUnitPx(containerWidth) / 2;
  }

  /** Re-run the layout engine for the current screen (spec §7.2). Debounced by ResizeObserver's own cadence. */
  private _applyLayout(): void {
    if (this._deck === null || this.screens.length === 0) return;
    const screen = this.screens[this._state.screenIndex];
    if (screen === undefined) return;
    const { width, height } = this._measureContainer();
    // The fit runs on ALL panels' content — the whole screen,
    // visible or not yet revealed — so the fitted size is fixed
    // for the screen: a step that reveals another panel never
    // changes the type. The column count comes from the total
    // panel count (inside computeLayout), so the grid — and
    // every visible panel's position in it — stays put across
    // steps; only the type size changes, never a position.
    // The fit also reserves the bottom controls' height plus
    // clearance, so panels never run underneath them.
    const result = computeLayout({
      containerWidth: width,
      containerHeight: height,
      panelCount: screen.panels.length,
      contentLengths: screen.panels.map((p) => p.text.length),
      reservedBottomPx: this._controlsReservePx(width),
      zoom: this._state.zoom,
      theme: this.theme,
    });
    for (const [k, v] of Object.entries(result.vars)) this.deckEl.style.setProperty(k, v);
    this._fittedBodyPx = result.fontBodyPx;
    this._fitMeasuredFont();
    this._updateScrollCue();
  }

  /**
   * Measurement is the authority (§7.4): the fit is an
   * estimate (average glyph ≈ 0.5em, uniform line-height), so
   * after layout, shrink the body size 1px at a time while the
   * screen still overflows, down to the 12px floor. At the
   * floor the screen scrolls internally and the scroll cue
   * shows. This pass only ever shrinks — growing is the fit's
   * job, on the next layout pass (resize, screen change, zoom
   * change — never a step change).
   *
   * The measurement sees the FULL screen, not just the visible
   * panels: hidden panels take no space (§5), so they are
   * revealed synchronously for the measurement (the
   * `wd-screen--measuring` class makes them take layout space
   * while staying invisible). The class is added and removed
   * in this same task, before any paint, so nothing flickers.
   * The screen's bottom padding already includes the controls
   * reserve (`--wd-reserve-bottom`), so the overflow check
   * measures against the height available above the controls.
   * Skipped when there is no layout yet (jsdom, or not yet
   * painted: clientHeight is 0 and there is nothing to measure).
   */
  private _fitMeasuredFont(): void {
    const el = this.screenEl;
    if (el.clientHeight === 0 || this._fittedBodyPx <= 0) return;
    this.screenEl.classList.add('wd-screen--measuring');
    try {
      let size = this._fittedBodyPx;
      let guard = 0;
      while (size > FONT_FLOOR_PX && el.scrollHeight > el.clientHeight + 4 && guard < 24) {
        size = Math.max(FONT_FLOOR_PX, size - 1);
        this.deckEl.style.setProperty('--wd-font-body', `${size}px`);
        guard++;
      }
    } finally {
      this.screenEl.classList.remove('wd-screen--measuring');
    }
    this._updateScrollCue();
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
      // Any navigation dismisses the menu (§6.6) — it is a
      // transient overlay, and the walk has moved on.
      if (this._navMenuOpen) this._closeNavMenu(true);
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

  private _setZoom(zoom: number): void {
    if (zoom === this._state.zoom) return;
    this._state = { ...this._state, zoom };
    this._render({ animate: false, prev: this._state });
    this._applyLayout();
  }

  /**
   * Play a panel's enter animation (§8). The panel's own effect
   * (§4.1) wins over the screen's; its own duration wins over the
   * screen's. `zoom-in` is first-class, like `slide-in` — never a
   * fallback. `none` plays nothing.
   */
  private _animatePanelIn(el: HTMLElement, panel: Panel, screen: Screen, forward: boolean): void {
    const effect = panel.effect ?? screen.reveal.effect;
    if (effect === 'none') return;
    const cls =
      effect === 'slide-in'
        ? forward
          ? 'wd-enter--slide-in-forward'
          : 'wd-enter--slide-in-backward'
        : effect === 'zoom-in'
          ? 'wd-enter--zoom-in'
          : 'wd-enter--fade-in';
    el.style.setProperty('--wd-anim-duration', `${panel.durationMs ?? screen.reveal.durationMs}ms`);
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
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
      this.progressTextEl.removeAttribute('aria-label');
      this.endNoteEl.hidden = true;
      this._navMenuOpen = false;
      this._updateNavMenu();
      this.scrollCueEl.classList.remove('wd-scroll-cue--visible');
      return;
    }
    this.screenEl.style.display = '';
    const screens = this.screens;
    const screen = screens[this._state.screenIndex];
    if (screen === undefined) return;
    const prev = opts.prev;
    const screenChanged = prev !== undefined && prev.screenIndex !== this._state.screenIndex;
    const prevVisible = prev !== undefined && !screenChanged ? visiblePanelIndexes(screen, prev.stepIndex) : [];
    const visible = new Set(visiblePanelIndexes(screen, this._state.stepIndex));

    // Keep the reader's scroll position on step changes; a new
    // screen starts at the top (§5: re-entering forward restores
    // the screen fully revealed; scroll itself is per-screen).
    const scrollTop = this.screenEl.scrollTop;
    const section = deck.sections.find((s) => s.screens.includes(screen));
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
    this.panelsEl.innerHTML = screen.panels
      .map((panel, i) => {
        const shown = visible.has(i);
        const classes = ['wd-panel', `wd-panel--${panel.kind}`, ...panel.classNames].join(' ');
        const inner = panel.blocks.map((b) => b.html).join('');
        return `<div class="${classes}" data-panel="${i}"${shown ? '' : ' hidden aria-hidden="true"'}>${inner}</div>`;
      })
      .join('');
    // Screen-level class hooks (§11.3).
    this.screenEl.classList.remove(...this._lastScreenClasses);
    this._lastScreenClasses = screen.classNames;
    for (const c of screen.classNames) this.screenEl.classList.add(c);
    if (screenChanged) this.screenEl.scrollTop = 0;
    else this.screenEl.scrollTop = scrollTop;

    // Enter animation (§5, §8): only the newly revealed panel, only on a step (never on a jump).
    if (opts.animate && !opts.jump && !screenChanged) {
      const newly = [...visible].find((i) => !prevVisible.includes(i));
      if (newly !== undefined) {
        const el = this.panelsEl.querySelector(`[data-panel="${newly}"]`);
        if (el instanceof HTMLElement) {
          // Measure before the enter animation starts: the
          // animation moves the panel with a transform, which
          // would skew the rect. The scroll then follows the
          // minimal-scroll rule of scrollIntoView({
          // block: 'nearest' }) (§7.4).
          const rect = this._panelContentRect(el);
          const forward = this._state.stepIndex > (prev?.stepIndex ?? -1);
          this._animatePanelIn(el, screen.panels[newly] as Panel, screen, forward);
          this._scrollPanelIntoView(rect);
        }
      }
    } else if (opts.animate && !opts.jump && screenChanged) {
      // First panel of a newly entered screen reveals with its own effect (§8).
      const first = screen.reveal.sequence[0];
      if (first !== undefined) {
        const el = this.panelsEl.querySelector(`[data-panel="${first}"]`);
        if (el instanceof HTMLElement) {
          const forward = this._state.screenIndex > (prev?.screenIndex ?? 0);
          this._animatePanelIn(el, screen.panels[first] as Panel, screen, forward);
        }
      }
    }

    // Progress counts steps, not screens (§1.3).
    const stepsBefore = screens
      .slice(0, this._state.screenIndex)
      .reduce((sum, s) => sum + stepsForScreen(s), 0);
    const current = stepsBefore + this._state.stepIndex + 1;
    const total = totalSteps(deck);
    this.progressBarEl.style.width = total > 0 ? `${(current / total) * 100}%` : '0%';
    this.progressTextEl.textContent = `${current} / ${total}`;
    this.progressTextEl.setAttribute('aria-label', `Step ${current} of ${total}. Activate to jump to a screen.`);
    const atStart = this._state.screenIndex === 0 && this._state.stepIndex === 0;
    const lastScreen = screens[screens.length - 1];
    const atEnd =
      lastScreen !== undefined &&
      this._state.screenIndex === screens.length - 1 &&
      this._state.stepIndex === stepsForScreen(lastScreen) - 1;
    this.prevBtn.disabled = atStart;
    this.nextBtn.disabled = atEnd;
    this.endNoteEl.hidden = !atEnd;
    this._updateNavMenu();
    this._updateScrollCue();
  }

  private _lastScreenClasses: string[] = [];

  /**
   * Geometry of a panel relative to the screen's scroll content
   * (§7.4): the panel's rect minus the screen's rect, plus the
   * current scroll, so the numbers are in content coordinates.
   * getBoundingClientRect is used (not offsetTop) because the
   * panels' offsetParent is the deck, not the screen. Null when
   * there is no layout yet (jsdom, or not yet painted) — the
   * caller then does nothing.
   */
  private _panelContentRect(el: HTMLElement): { top: number; bottom: number } | null {
    const container = this.screenEl;
    if (container.clientHeight === 0) return null;
    const c = container.getBoundingClientRect();
    const p = el.getBoundingClientRect();
    const top = p.top - c.top + container.scrollTop;
    return { top, bottom: top + p.height };
  }

  /**
   * Reveal auto-scroll (§7.4): when a step reveals a panel
   * that is not fully visible in the screen's scroll viewport,
   * scroll the screen just far enough to bring it into view —
   * the minimal-scroll semantics of scrollIntoView({
   * block: 'nearest' }): no scroll at all when the panel is
   * already fully visible, only as far as needed otherwise.
   * The panel must end up clear of the bottom controls, so
   * the visible window ends at the bottom reserve, not at the
   * viewport edge. A panel taller than the visible window
   * cannot fit whole: it is shown from its top. Smooth unless
   * prefers-reduced-motion (§7.5 rung 4, §8), in which case
   * instant. Never runs during the font-fit measurement pass —
   * that pass reveals all panels synchronously and must not
   * fight a scroll.
   */
  private _scrollPanelIntoView(rect: { top: number; bottom: number } | null): void {
    if (rect === null) return;
    if (this.screenEl.classList.contains('wd-screen--measuring')) return;
    const container = this.screenEl;
    const reserve = this._controlsReservePx(this._measureContainer().width);
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const visibleTop = container.scrollTop;
    const visibleBottom = container.scrollTop + container.clientHeight - reserve;
    let target: number | null = null;
    if (rect.bottom > visibleBottom) {
      // Below the fold: bring the bottom up just clear of the controls.
      target = rect.bottom - container.clientHeight + reserve;
      if (rect.bottom - rect.top > container.clientHeight - reserve) target = rect.top;
    } else if (rect.top < visibleTop) {
      // Above the fold (a `sequence` reveal can surface an
      // earlier panel): bring the top down into view.
      target = rect.top;
    }
    if (target === null) return; // already fully visible — do not move at all
    target = Math.min(Math.max(0, target), maxScroll);
    if (target === container.scrollTop) return;
    if (this._prefersReducedMotion()) {
      container.scrollTop = target;
    } else {
      container.scrollTo({ top: target, behavior: 'smooth' });
    }
  }

  /** prefers-reduced-motion (§7.5 rung 4, §8) — same guarded matchMedia as the idle timer. */
  private _prefersReducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  private _updateScrollCue(): void {
    const el = this.screenEl;
    const scrollable = el.scrollHeight > el.clientHeight + 4;
    el.classList.toggle('wd-screen--scrolling', scrollable);
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    this.scrollCueEl.classList.toggle('wd-scroll-cue--visible', scrollable && notAtBottom);
  }

  // --- Navigation menu (§6.6) -------------------------------------------

  /**
   * The menu's targets, in order: First screen, one item per
   * Section (the Section's name, in deck order), Last screen.
   * A Section jumps to the first step of its first screen; a
   * Section with no title is labelled `Section N` (§6.6).
   */
  private _navMenuTargets(): { label: string; kind: 'first' | 'section' | 'last'; screenIndex: number; sectionIndex?: number }[] {
    if (this._deck === null) return [];
    const flat = flatScreens(this._deck);
    const items: { label: string; kind: 'first' | 'section' | 'last'; screenIndex: number; sectionIndex?: number }[] = [
      { label: 'First screen', kind: 'first', screenIndex: 0 },
    ];
    this._deck.sections.forEach((section, i) => {
      const first = section.screens[0];
      if (first === undefined) return;
      const screenIndex = flat.indexOf(first);
      if (screenIndex < 0) return;
      items.push({ label: section.title ?? `Section ${i + 1}`, kind: 'section', screenIndex, sectionIndex: i });
    });
    items.push({ label: 'Last screen', kind: 'last', screenIndex: flat.length - 1 });
    return items;
  }

  /** Build the menu items for a new deck (built with the DOM API, so Section titles need no escaping). */
  private _buildNavMenu(): void {
    const deck = this._deck;
    if (deck === null || deck === this._navMenuDeck) return;
    this._navMenuDeck = deck;
    this.navMenuEl.replaceChildren();
    for (const target of this._navMenuTargets()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.className = 'wd-nav-menu-item';
      btn.dataset.nav = target.kind;
      btn.dataset.screen = String(target.screenIndex);
      if (target.sectionIndex !== undefined) btn.dataset.section = String(target.sectionIndex);
      btn.textContent = target.label;
      this.navMenuEl.appendChild(btn);
    }
  }

  /** Sync the menu's visibility, the trigger's expanded state, and the current Section's marking (§6.6). */
  private _updateNavMenu(): void {
    this._buildNavMenu();
    const deck = this._deck;
    const screen = deck === null ? undefined : this.screens[this._state.screenIndex];
    const currentSection =
      deck === undefined || deck === null || screen === undefined
        ? -1
        : deck.sections.findIndex((s) => s.screens.includes(screen));
    for (const btn of Array.from(this.navMenuEl.querySelectorAll('.wd-nav-menu-item'))) {
      const sectionIndex = btn.getAttribute('data-section');
      const isCurrent = sectionIndex !== null && Number(sectionIndex) === currentSection;
      btn.classList.toggle('wd-nav-menu-item--current', isCurrent);
      if (isCurrent) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    }
    this.navMenuEl.hidden = !this._navMenuOpen;
    this.progressTextEl.setAttribute('aria-expanded', String(this._navMenuOpen));
    this.deckEl.classList.toggle('wd-deck--nav-open', this._navMenuOpen);
  }

  /** Open the menu and move focus into it — the current Section's item, or the first item (§6.6). */
  private _openNavMenu(): void {
    this._navMenuOpen = true;
    this._updateNavMenu();
    const current = this.navMenuEl.querySelector('.wd-nav-menu-item--current') as HTMLElement | null;
    const first = this.navMenuEl.querySelector('.wd-nav-menu-item') as HTMLElement | null;
    (current ?? first)?.focus();
    this._armIdleTimer();
  }

  /** Close the menu; focus returns to the indicator (§6.6). */
  private _closeNavMenu(focusIndicator = true): void {
    if (!this._navMenuOpen) return;
    this._navMenuOpen = false;
    this._updateNavMenu();
    if (focusIndicator) this.progressTextEl.focus();
  }

  private _toggleNavMenu(): void {
    if (this._navMenuOpen) this._closeNavMenu();
    else this._openNavMenu();
  }

  private _onProgressClick = (): void => {
    this._toggleNavMenu();
  };

  /** A menu item navigates and closes the menu (§6.6). The menu is closed first so a no-op jump (already on the first screen) still dismisses it. */
  private _onNavMenuClick = (e: MouseEvent): void => {
    const btn = (e.target as Element | null)?.closest?.('.wd-nav-menu-item') as HTMLElement | null;
    if (btn === null || btn === undefined) return;
    const kind = btn.getAttribute('data-nav');
    const screenIndex = Number(btn.getAttribute('data-screen') ?? 0);
    this._closeNavMenu(true);
    if (kind === 'first') this.goToStart();
    else if (kind === 'last') this.goToEnd();
    else this.jumpTo(screenIndex, 'forward');
  };

  /** A click/tap outside the deck closes the menu (§6.6). Clicks inside the Shadow DOM retarget to the host, so contains() is true for anything inside the deck. */
  private _onDocumentPointerDown = (e: PointerEvent): void => {
    if (!this._navMenuOpen) return;
    if (!this.contains(e.target as Node)) this._closeNavMenu();
  };

  // --- Input ------------------------------------------------------------

  private _onKeyDown = (e: KeyboardEvent): void => {
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
        if (this._navMenuOpen) {
          e.preventDefault();
          this._closeNavMenu();
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

  /** Restart: back to the first step of the first screen, same as Start (§6.2). */
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
    // auto-hide only changes opacity, never height, so the
    // reserve is the same either way; the re-check keeps the
    // guarantee if that ever changes.
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
    this._pointerStart = { x: e.clientX, y: e.clientY, interactive: isInteractiveTarget(e.target) };
    this._gesture = 'undecided';
  };

  private _onPointerMove = (e: PointerEvent): void => {
    if (this._pointerStart === null || this._gesture === 'handled' || this._gesture === 'vertical') return;
    const dx = e.clientX - this._pointerStart.x;
    const dy = e.clientY - this._pointerStart.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      // Vertical: it stays a scroll (§6.4). The browser owns it (touch-action: pan-y).
      this._gesture = 'vertical';
      return;
    }
    if (this._gesture === 'undecided' && Math.abs(dx) > Math.abs(dy)) {
      const threshold = swipeThreshold(this._measureContainer().width);
      if (Math.abs(dx) >= threshold) {
        this._gesture = 'handled';
        if (dx < 0) this.next();
        else this.prev();
      }
    }
  };

  private _onPointerUp = (e: PointerEvent): void => {
    const start = this._pointerStart;
    this._pointerStart = null;
    if (start === null) return;
    // A tap on the screen while the menu is open only dismisses
    // the menu (§6.6) — it must not also navigate.
    if (this._navMenuOpen) {
      this._closeNavMenu();
      return;
    }
    if (this._gesture === 'handled' || this._gesture === 'vertical') {
      this._gesture = 'undecided';
      return;
    }
    this._gesture = 'undecided';
    // Tap, not drag (§6.3): movement beyond a small threshold cancels it.
    if (Math.abs(e.clientX - start.x) > TAP_MAX_MOVE_PX || Math.abs(e.clientY - start.y) > TAP_MAX_MOVE_PX) return;
    if (start.interactive) return;
    // A click that selects text does nothing (§6.3).
    try {
      if (window.getSelection()?.toString() !== '') return;
    } catch {
      // No selection API: proceed.
    }
    const rect = this.screenEl.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (e.clientX >= midX) this.next();
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
