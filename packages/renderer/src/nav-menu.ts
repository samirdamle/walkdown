/**
 * The section-jump navigation menu (spec §6.6).
 *
 * Owns the menu's DOM, its open state, and which deck it was
 * built for; the element only tells it the current deck and
 * Section and hands it navigation callbacks. Sections never
 * change mid-walk, so the items are rebuilt only for a new deck.
 */
import type { Deck } from '@walkdown/core';
import type { DeckFacts } from './facts.js';

/** One menu item, in order: First screen, one per Section, Last screen. */
export interface NavMenuTarget {
  label: string;
  kind: 'first' | 'section' | 'last';
  screenIndex: number;
  sectionIndex?: number;
}

/**
 * The menu's targets, in order: First screen, one item per
 * Section (the Section's name, in deck order), Last screen.
 * A Section jumps to the first step of its first screen; a
 * Section with no title is labelled `Section N` (§6.6).
 */
export function navMenuTargets(deck: Deck, facts: DeckFacts): NavMenuTarget[] {
  const items: NavMenuTarget[] = [{ label: 'First screen', kind: 'first', screenIndex: 0 }];
  deck.sections.forEach((section, i) => {
    const first = section.screens[0];
    if (first === undefined) return;
    const screenIndex = facts.screens.indexOf(first);
    if (screenIndex < 0) return;
    items.push({ label: section.title ?? `Section ${i + 1}`, kind: 'section', screenIndex, sectionIndex: i });
  });
  items.push({ label: 'Last screen', kind: 'last', screenIndex: facts.screens.length - 1 });
  return items;
}

export interface NavMenuCallbacks {
  /** First screen — go to the start. */
  onFirst(): void;
  /** Last screen — go to the end. */
  onLast(): void;
  /** A Section — jump to the first step of its first screen. */
  onJump(screenIndex: number): void;
  /** The menu opened — the element re-arms its idle timer. */
  onOpen(): void;
}

export class NavMenu {
  private _open = false;
  /** The deck the menu items were built from. */
  private _menuDeck: Deck | null = null;
  /** Last sync's deck + current Section, so open/close can re-sync visibility. */
  private _syncDeck: Deck | null = null;
  private _syncSectionIndex = -1;

  /**
   * @param menuEl the `.wd-nav-menu` element.
   * @param triggerEl the step-count indicator that opens the menu.
   * @param deckEl the `.wd-deck` element (carries the nav-open class).
   * @param host the custom element itself — a click outside it closes the menu.
   */
  constructor(
    private readonly _menuEl: HTMLDivElement,
    private readonly _triggerEl: HTMLButtonElement,
    private readonly _deckEl: HTMLDivElement,
    private readonly _host: HTMLElement,
    private readonly _callbacks: NavMenuCallbacks,
  ) {}

  get isOpen(): boolean {
    return this._open;
  }

  /**
   * Sync the menu's items, the trigger's expanded state, and the
   * current Section's marking (§6.6). Called on every render
   * and whenever the menu opens or closes.
   */
  sync(deck: Deck | null, facts: DeckFacts | null, currentSectionIndex: number): void {
    this._syncDeck = deck;
    this._syncSectionIndex = currentSectionIndex;
    this._build(deck, facts);
    for (const btn of Array.from(this._menuEl.querySelectorAll('.wd-nav-menu-item'))) {
      const sectionIndex = btn.getAttribute('data-section');
      const isCurrent = sectionIndex !== null && Number(sectionIndex) === currentSectionIndex;
      btn.classList.toggle('wd-nav-menu-item--current', isCurrent);
      if (isCurrent) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    }
    this._menuEl.hidden = !this._open;
    this._triggerEl.setAttribute('aria-expanded', String(this._open));
    this._deckEl.classList.toggle('wd-deck--nav-open', this._open);
  }

  /** Open the menu and move focus into it — the current Section's item, or the first item (§6.6). */
  open(): void {
    this._open = true;
    this.sync(this._syncDeck, null, this._syncSectionIndex);
    const current = this._menuEl.querySelector('.wd-nav-menu-item--current') as HTMLElement | null;
    const first = this._menuEl.querySelector('.wd-nav-menu-item') as HTMLElement | null;
    (current ?? first)?.focus();
    this._callbacks.onOpen();
  }

  /** Close the menu; focus returns to the indicator (§6.6). */
  close(focusTrigger = true): void {
    if (!this._open) return;
    this._open = false;
    this.sync(this._syncDeck, null, this._syncSectionIndex);
    if (focusTrigger) this._triggerEl.focus();
  }

  toggle(): void {
    if (this._open) this.close();
    else this.open();
  }

  /**
   * Arrow-key navigation inside the menu (§6.6, `menu` guide): ArrowUp/
   * ArrowDown move between items (wrapping), Home/End jump to the first/
   * last item. The event is stopped so the host's walk keys never see it
   * — without this the host would scroll the screen (arrows) or jump the
   * deck (Home/End) while the menu has focus. All items are enabled, so
   * every item is a stop. Focus is already inside the menu when this
   * fires (open() moves it to the current item); if it is not on an item
   * (target is the menu element itself), ArrowDown/Home land on the first
   * item and ArrowUp/End on the last.
   */
  handleKeyDown(e: KeyboardEvent): void {
    if (!this._open) return;
    const items = Array.from(this._menuEl.querySelectorAll('.wd-nav-menu-item')) as HTMLElement[];
    if (items.length === 0) return;
    const current = items.indexOf(e.target as HTMLElement);
    let next = -1;
    switch (e.key) {
      case 'ArrowDown':
        next = current < 0 ? 0 : (current + 1) % items.length;
        break;
      case 'ArrowUp':
        next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    items[next]?.focus();
  }

  /** A menu item navigates and closes the menu (§6.6). The menu is closed first so a no-op jump (already on the first screen) still dismisses it. */
  handleItemClick(e: MouseEvent): void {
    const btn = (e.target as Element | null)?.closest?.('.wd-nav-menu-item') as HTMLElement | null;
    if (btn === null || btn === undefined) return;
    const kind = btn.getAttribute('data-nav');
    const screenIndex = Number(btn.getAttribute('data-screen') ?? 0);
    this.close(true);
    if (kind === 'first') this._callbacks.onFirst();
    else if (kind === 'last') this._callbacks.onLast();
    else this._callbacks.onJump(screenIndex);
  }

  /** A click/tap outside the deck closes the menu (§6.6). Clicks inside the Shadow DOM retarget to the host, so contains() is true for anything inside the deck. */
  handleOutsidePointerDown(e: PointerEvent): void {
    if (!this._open) return;
    if (!this._host.contains(e.target as Node)) this.close();
  }

  /**
   * Focus landing outside the menu (and outside the trigger)
   * closes it (§6.6). `focusin` is composed, so the real target
   * is the first entry of the composed path — `e.target`
   * retargets to the host for focus inside the Shadow DOM,
   * which would read as "outside" for every internal control.
   * Closing returns focus to the indicator, like every other
   * close path (§6.6) — the Tab's natural destination is
   * overridden in favour of that uniform behaviour.
   */
  handleFocusIn(e: FocusEvent): void {
    if (!this._open) return;
    const path = e.composedPath();
    const target = (path.length > 0 ? path[0] : e.target) as Node | null;
    if (target === null || target === undefined) return;
    if (!this._menuEl.contains(target) && !this._triggerEl.contains(target)) this.close();
  }

  /** Build the menu items for a new deck (built with the DOM API, so Section titles need no escaping). */
  private _build(deck: Deck | null, facts: DeckFacts | null): void {
    if (deck === null || facts === null || deck === this._menuDeck) return;
    this._menuDeck = deck;
    this._menuEl.replaceChildren();
    for (const target of navMenuTargets(deck, facts)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.className = 'wd-nav-menu-item';
      btn.dataset.nav = target.kind;
      btn.dataset.screen = String(target.screenIndex);
      if (target.sectionIndex !== undefined) btn.dataset.section = String(target.sectionIndex);
      btn.textContent = target.label;
      this._menuEl.appendChild(btn);
    }
  }
}
