/**
 * Reveal auto-scroll (§7.4) and the reduced-motion query (§7.5 rung 4, §8).
 *
 * When a step reveals a panel that is not fully visible in the
 * screen's scroll viewport, the screen scrolls just far enough
 * to bring it into view — the minimal-scroll semantics of
 * scrollIntoView({ block: 'nearest' }). The geometry is in
 * content coordinates (panel rect minus screen rect, plus the
 * current scroll); getBoundingClientRect is used, not
 * offsetTop, because the panels' offsetParent is the deck,
 * not the screen.
 */
 
/** Geometry of a panel relative to the screen's scroll content. Null when there is no layout yet (jsdom, or not yet painted) — the caller then does nothing. */
export function panelContentRect(
  container: HTMLElement,
  el: HTMLElement,
): { top: number; bottom: number } | null {
  if (container.clientHeight === 0) return null;
  const c = container.getBoundingClientRect();
  const p = el.getBoundingClientRect();
  const top = p.top - c.top + container.scrollTop;
  return { top, bottom: top + p.height };
}

/**
 * Scroll the screen just far enough to bring a newly revealed
 * panel into view. No scroll at all when the panel is already
 * fully visible, only as far as needed otherwise. The panel
 * must end up clear of the bottom controls, so the visible
 * window ends at the bottom reserve, not at the viewport edge.
 * A panel taller than the visible window cannot fit whole: it
 * is shown from its top. Smooth unless prefers-reduced-motion,
 * in which case instant. Never runs during the font-fit
 * measurement pass — that pass reveals all panels
 * synchronously and must not fight a scroll.
 */
export function scrollPanelIntoView(
  container: HTMLElement,
  rect: { top: number; bottom: number } | null,
  reservePx: number,
): void {
  if (rect === null) return;
  if (container.classList.contains('wd-screen--measuring')) return;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const visibleTop = container.scrollTop;
  const visibleBottom = container.scrollTop + container.clientHeight - reservePx;
  let target: number | null = null;
  if (rect.bottom > visibleBottom) {
    // Below the fold: bring the bottom up just clear of the controls.
    target = rect.bottom - container.clientHeight + reservePx;
    if (rect.bottom - rect.top > container.clientHeight - reservePx) target = rect.top;
  } else if (rect.top < visibleTop) {
    // Above the fold (a `sequence` reveal can surface an
    // earlier panel): bring the top down into view.
    target = rect.top;
  }
  if (target === null) return; // already fully visible — do not move at all
  // Round to 0.1px (the layout engine's own precision): the reserve
  // is a float (91.2px at desktop), so the raw target carries
  // float dust (11.200000000000003 for an 11.2px nudge) — and a
  // scroll position finer than a tenth of a pixel is meaningless.
  target = Math.round(Math.min(Math.max(0, target), maxScroll) * 10) / 10;
  if (target === container.scrollTop) return;
  if (prefersReducedMotion()) {
    container.scrollTop = target;
  } else {
    container.scrollTo({ top: target, behavior: 'smooth' });
  }
}

/** prefers-reduced-motion (§7.5 rung 4, §8) — guarded matchMedia, false outside a browser. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
