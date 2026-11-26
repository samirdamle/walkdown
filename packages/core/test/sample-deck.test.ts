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

  it('parses to 15 screens in 4 Sections', () => {
    expect(screens).toHaveLength(15);
    expect(deck.sections.map((s) => s.title)).toEqual(['Intro', 'How it works', 'Walking', 'Customize']);
    expect(deck.sections.map((s) => s.screens.length)).toEqual([3, 4, 2, 6]);
  });

  it('parses to 54 panels and 54 steps', () => {
    const panelCount = screens.reduce((sum, s) => sum + s.panels.length, 0);
    expect(panelCount).toBe(54);
    expect(totalSteps(deck)).toBe(54);
  });

  it('has the right panel counts per screen', () => {
    expect(screens.map((s) => s.panels.length)).toEqual([1, 3, 3, 6, 3, 2, 8, 3, 5, 3, 3, 4, 4, 3, 3]);
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
      'Make it yours',
      'The smallest deck',
      'Your first deck',
    ]);
  });

  it('resolves the frontmatter defaults', () => {
    expect(deck.title).toBe('Walkdown');
    expect(deck.author).toBe('Samir Damle');
    expect(deck.theme).toBe('light');
    expect(deck.stylesheets).toEqual([
      'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap',
      './walkdown-theme.css',
    ]);
    // Screen 2 has no marker: deck defaults apply (step, fade-in, 500ms).
    expect(screens[1]?.reveal).toEqual({ mode: 'step', sequence: [0, 1, 2], effect: 'fade-in', durationMs: 500 });
  });

  it('the hero screen reveals all, with the hero class', () => {
    expect(screens[0]?.reveal.mode).toBe('all');
    expect(screens[0]?.classNames).toEqual(['hero']);
    expect(screens[0]?.panels).toHaveLength(1);
    // The hero panel is one grouped panel: an h2 lead-in plus
    // the paragraph (§2.5) — the screen stays a 1-panel hero.
    const panel = screens[0]?.panels[0];
    expect(panel?.blocks).toHaveLength(2);
    expect(panel?.blocks[0]?.type).toBe('heading');
    expect(panel?.blocks[0]?.html).toBe('<h2>Walkdown</h2>');
    expect(panel?.blocks[1]?.type).toBe('paragraph');
    expect(panel?.blocks[1]?.html).toContain('Simple, magical presentation from Markdown');
    expect(panel?.text).toContain('Walkdown');
    expect(panel?.text).toContain('Simple, magical presentation from Markdown');
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
    // Screen 11 inherits the Section override (its own marker sets
    // only the step reveal, no effect/duration)…
    expect(screens[10]?.reveal.effect).toBe('slide-in');
    expect(screens[10]?.reveal.durationMs).toBe(250);
    // …and carries no classes of its own: the accent/big demo was
    // removed in #61, so the screen looks like every other screen.
    expect(screens[10]?.classNames).toEqual([]);
    expect(screens[10]?.panels.every((p) => p.classNames.length === 0)).toBe(true);
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

  it('the customization screen shows a styling sample and a live animation sample', () => {
    const screen = screens[12];
    expect(screen?.title).toBe('Make it yours');
    expect(screen?.panels).toHaveLength(4);
    // The screen keeps the Section override (step, slide-in, 250ms).
    expect(screen?.reveal).toEqual({ mode: 'step', sequence: [0, 1, 2, 3], effect: 'slide-in', durationMs: 250 });
    const panels = screen?.panels ?? [];
    // Styling sample: the backticked phrase renders as inline code,
    // which carries the highlighted background — no deck CSS needed.
    expect(panels[1]?.blocks[0]?.html).toContain('<code>custom styling using CSS</code>');
    // Animation sample as code: the comment is fenced, so it is
    // DISPLAYED as a code panel, not consumed as a marker — the
    // screen still has exactly 4 panels and its reveal is untouched.
    const code = panels[2]?.blocks[0];
    expect(code?.type).toBe('code');
    expect(code?.markdown).toContain('<!-- reveal: effect: zoom-in; duration: 1s -->');
    expect(code?.html).toContain('&lt;!-- reveal: effect: zoom-in; duration: 1s --&gt;');
    // Animation sample live: the same marker, for real, on the last
    // panel — a slow (1s) zoom-in, noticeably slower than the 500ms
    // deck default and the 250ms Section override.
    expect(panels[3]?.effect).toBe('zoom-in');
    expect(panels[3]?.durationMs).toBe(1000);
    // The first three panels carry no per-panel marker.
    expect(panels.slice(0, 3).map((p) => p.effect)).toEqual([undefined, undefined, undefined]);
    expect(panels.slice(0, 3).every((p) => p.durationMs === undefined)).toBe(true);
  });

  it('the smallest deck screen shows a minimal sample deck as code', () => {
    const screen = screens[13];
    expect(screen?.title).toBe('The smallest deck');
    expect(screen?.panels).toHaveLength(3);
    // No screen marker: the Section override applies (step, slide-in, 250ms).
    expect(screen?.reveal).toEqual({ mode: 'step', sequence: [0, 1, 2], effect: 'slide-in', durationMs: 250 });
    const panels = screen?.panels ?? [];
    // Intro and closing panels carry the framing copy.
    // (Panel text is plain text: the hyphen in "twenty-two"
    // becomes a space, so assert on the unhyphenated words.)
    expect(panels[0]?.text).toContain('Copy it into a file, walk it');
    expect(panels[2]?.text).toContain('smallest deck that still shows how it works');
    // The sample itself is displayed as code, verbatim — its `---`
    // lines and `<!-- ... -->` comment lines are inert text inside
    // the fence, so they create no extra screen or panel.
    const sample = [
      '---',
      'title: My first walkdown',
      'defaults:',
      '  reveal: step',
      '  effect: fade-in',
      '---',
      '',
      '<!-- section: Start -->',
      '',
      '# Hello',
      '',
      '- One bullet is one panel.',
      '- The walk reveals them one step at a time.',
      '',
      '---',
      '',
      '# One more screen',
      '',
      '<!-- reveal: effect: slide-in; duration: 1s -->',
      '',
      '- Three dashes start a new screen.',
      '- Headings do not.',
    ].join('\n');
    const code = panels[1]?.blocks[0];
    expect(code?.type).toBe('code');
    expect(code?.markdown).toBe('```markdown\n' + sample + '\n```');
    expect(code?.html).toContain('&lt;!-- section: Start --&gt;');
    expect(code?.html).toContain('&lt;!-- reveal: effect: slide-in; duration: 1s --&gt;');
    // A code panel's text is empty (plainText strips fenced code),
    // so the fit estimator does not count the sample's lines.
    expect(panels[1]?.text).toBe('');
  });

  it('extracts the trailing CSS block as the deck stylesheet', () => {
    expect(deck.styles).toContain('.hero');
    // The accent/big demo was removed in #61: no border rule, no
    // bigger-type rule — and the green in the old accent rule was the
    // deck's own copy of the theme accent, not the theme itself.
    expect(deck.styles).not.toContain('.accent');
    expect(deck.styles).not.toContain('.big');
    expect(deck.styles).not.toContain('#2E7D6B');
  });

  it('the deck stylesheet left-aligns the hero and sets Open Sans on .wd-deck', () => {
    expect(deck.styles).toContain('.hero');
    expect(deck.styles).toContain('text-align: left;');
    expect(deck.styles).not.toContain('text-align: center;');
    // Open Sans overrides the theme vars on .wd-deck itself,
    // with !important — the renderer sets those vars as inline
    // style, which only an !important rule beats.
    expect(deck.styles).toContain('.wd-deck');
    expect(deck.styles).toContain("--wd-font-family-body: 'Open Sans'");
    expect(deck.styles).toContain("--wd-font-family-title: 'Open Sans'");
    expect(deck.styles).toContain('!important');
  });
});
