/**
 * Panel markup (§5): one `.wd-panel` per panel of a screen.
 * Hidden panels (not yet revealed) are inert — `hidden` plus
 * `aria-hidden` — and take no space.
 */
import type { Panel } from '@walkdown/core';

/**
 * One panel's HTML. `extraClasses` and `extraAttrs` let a layout
 * (e.g. the stack pile) add state without duplicating the frame:
 * the frame — kind class, author classes, inner blocks — is the
 * same for every layout.
 */
export function panelHtml(panel: Panel, index: number, extraClasses: string[], extraAttrs: string): string {
  const classes = ['wd-panel', `wd-panel--${panel.kind}`, ...panel.classNames, ...extraClasses].join(' ');
  const inner = panel.blocks.map((b) => b.html).join('');
  return `<div class="${classes}" data-panel="${index}"${extraAttrs}>${inner}</div>`;
}

/** The panels' HTML for a screen, given the set of visible panel indexes. */
export function panelsHtml(panels: Panel[], visible: Set<number>): string {
  return panels
    .map((panel, i) => panelHtml(panel, i, [], visible.has(i) ? '' : ' hidden aria-hidden="true"'))
    .join('');
}
