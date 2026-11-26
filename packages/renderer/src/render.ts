/**
 * Panel markup (§5): one `.wd-panel` per panel of a screen.
 * Hidden panels (not yet revealed) are inert — `hidden` plus
 * `aria-hidden` — and take no space.
 */
import type { Panel } from '@walkdown/core';

/** The panels' HTML for a screen, given the set of visible panel indexes. */
export function panelsHtml(panels: Panel[], visible: Set<number>): string {
  return panels
    .map((panel, i) => {
      const shown = visible.has(i);
      const classes = ['wd-panel', `wd-panel--${panel.kind}`, ...panel.classNames].join(' ');
      const inner = panel.blocks.map((b) => b.html).join('');
      return `<div class="${classes}" data-panel="${i}"${shown ? '' : ' hidden aria-hidden="true"'}>${inner}</div>`;
    })
    .join('');
}
