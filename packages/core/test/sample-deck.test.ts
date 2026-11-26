import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDeck } from '../src/parser.js';
import { flatScreens, totalSteps } from '../src/model.js';

/**
 * The first real deck (spec §9): a deck explaining Walkdown
 * itself. The parser must produce this exact model.
 */
const SAMPLE_DECK = readFileSync(new URL('../../../examples/walkdown-itself.md', import.meta.url), 'utf8');

describe('examples/walkdown-itself.md', () => {
  const deck = parseDeck(SAMPLE_DECK);
  const screens = flatScreens(deck);

  it('parses to 13 screens in 4 Sections', () => {
    expect(screens).toHaveLength(13);
    expect(deck.sections.map((s) => s.title)).toEqual(['Intro', 'How it works', 'Walking', 'Customize']);
    expect(deck.sections.map((s) => s.screens.length)).toEqual([3, 4, 2, 4]);
  });

  it('parses to 47 panels and 47 steps', () => {
    const panelCount = screens.reduce((sum, s) => sum + s.panels.length, 0);
    expect(panelCount).toBe(47);
    expect(totalSteps(deck)).toBe(47);
  });

  it('has the right panel counts per screen', () => {
    expect(screens.map((s) => s.panels.length)).toEqual([1, 3, 3, 6, 3, 2, 8, 3, 5, 3, 3, 4, 3]);
  });

  it('has the right screen titles', () => {
    expect(screens.map((s) => s.title)).toEqual([
      'Walkdown',
      'What it is',
      'Screens, not slides',
      'Bullets become panels',
      'The punchline first',
      'Lists inside panels',
      'When a screen is too tall',
      'Next and Previous',
      'Scroll or advance, never both',
      'Defaults, then overrides',
      'Make it look like yours',
      'Make it move',
      'Your first deck',
    ]);
  });

  it('resolves the frontmatter defaults', () => {
    expect(deck.title).toBe('Walkdown');
    expect(deck.author).toBe('Samir Damle');
    expect(deck.theme).toBe('light');
    expect(deck.stylesheets).toEqual(['./walkdown-theme.css']);
    // Screen 2 has no marker: deck defaults apply (step, fade-in, 500ms).
    expect(screens[1]?.reveal).toEqual({ mode: 'step', sequence: [0, 1, 2], effect: 'fade-in', durationMs: 500 });
  });

  it('the hero screen reveals all, with the hero class', () => {
    expect(screens[0]?.reveal.mode).toBe('all');
    expect(screens[0]?.classNames).toEqual(['hero']);
    expect(screens[0]?.panels).toHaveLength(1);
    expect(screens[0]?.panels[0]?.blocks[0]?.html).toContain('Simple, magical presentation from Markdown');
  });

  it('the punchline screen reveals in sequence 3, 1, 2', () => {
    expect(screens[4]?.reveal.sequence).toEqual([2, 0, 1]);
    expect(screens[4]?.reveal.effect).toBe('fade-in');
    expect(screens[4]?.reveal.durationMs).toBe(1000);
  });

  it('nested lists stay inside their parent panel', () => {
    const panels = screens[5]?.panels ?? [];
    expect(panels).toHaveLength(2);
    expect(panels[0]?.blocks[0]?.html).toContain('A nested list stays inside its panel.');
    expect(panels[0]?.blocks[0]?.html).toContain('It never becomes a panel of its own.');
  });

  it('the long screen is 8 panels — it scrolls internally, it is not split', () => {
    expect(screens[6]?.panels).toHaveLength(8);
    expect(screens[6]?.title).toBe('When a screen is too tall');
  });

  it('the last Section overrides to slide-in at 250ms with the dark class', () => {
    expect(deck.sections[3]?.classNames).toEqual(['dark']);
    expect(screens[9]?.reveal).toEqual({ mode: 'step', sequence: [0, 1, 2], effect: 'slide-in', durationMs: 250 });
    // Screen 11 inherits the Section override (no screen marker of its own for effect/duration)…
    expect(screens[10]?.reveal.effect).toBe('slide-in');
    expect(screens[10]?.reveal.durationMs).toBe(250);
    // …and carries the accent class, with big on every panel.
    expect(screens[10]?.classNames).toEqual(['accent']);
    expect(screens[10]?.panels.every((p) => p.classNames.includes('big'))).toBe(true);
  });

  it('the effects screen gives each panel its own effect', () => {
    const screen = screens[11];
    expect(screen?.title).toBe('Make it move');
    expect(screen?.panels).toHaveLength(4);
    // fade-in, slide-in, zoom-in on the first three panels; the
    // fourth carries no marker and inherits the Section's slide-in.
    expect(screen?.panels.map((p) => p.effect)).toEqual(['fade-in', 'slide-in', 'zoom-in', undefined]);
    expect(screen?.panels.every((p) => p.durationMs === undefined)).toBe(true);
    // The screen itself keeps the Section override (slide-in, 250ms).
    expect(screen?.reveal.effect).toBe('slide-in');
    expect(screen?.reveal.durationMs).toBe(250);
  });

  it('extracts the trailing CSS block as the deck stylesheet', () => {
    expect(deck.styles).toContain('.hero');
    expect(deck.styles).toContain('.accent');
    expect(deck.styles).toContain('.big');
    expect(deck.styles).toContain('#eeaa3d');
  });
});
