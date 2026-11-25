/**
 * @walkdown/renderer — the Walkdown Web Components renderer.
 *
 * Importing this module registers the `<walkdown-deck>` custom
 * element (once). It consumes `@walkdown/core` — the parser,
 * model, and layout engine — and never re-parses or re-resolves
 * defaults.
 */
import { WalkdownDeckElement } from './element.js';

export { WalkdownDeckElement } from './element.js';
export { sanitizeCss, deckClassesOf } from './sanitize.js';
export type { SanitizeOptions } from './sanitize.js';
export { loadStylesheets, fetchStylesheet, resolveStylesheetUrl } from './loader.js';
export type { LoadedStylesheet } from './loader.js';
export { DEFAULT_CSS } from './styles.js';

/** Register `<walkdown-deck>` if it is not already defined. Safe to call twice. */
export function defineWalkdownDeck(): void {
  if (typeof customElements !== 'undefined' && customElements.get('walkdown-deck') === undefined) {
    customElements.define('walkdown-deck', WalkdownDeckElement);
  }
}

defineWalkdownDeck();
