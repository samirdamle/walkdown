/**
 * Panel enter animations (§8).
 *
 * The panel's own effect (§4.1) wins over the screen's; its own
 * duration wins over the screen's. `zoom-in` is first-class,
 * like `slide-in` — never a fallback. `none` plays nothing.
 */
import type { Panel, Screen } from '@walkdown/core';
import { prefersReducedMotion } from './scroll.js';

/** Play a panel's enter animation. `forward` picks the slide direction. */
export function animatePanelIn(el: HTMLElement, panel: Panel, screen: Screen, forward: boolean): void {
  const effect = panel.effect ?? screen.reveal.effect;
  if (effect === 'none') return;
  // Reduced motion (§7.5, §8): never add the enter class. Under reduced
  // motion the CSS sets `animation: none`, so `animationend` never fires
  // and a class added here would linger forever — replaying the enter
  // animation if the user toggles reduced motion off mid-session.
  if (prefersReducedMotion()) return;
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
