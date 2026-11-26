import { describe, expect, it } from 'vitest';
import { isEmptyDeck, parseDeck } from '../src/parser.js';
import { flatScreens, totalSteps } from '../src/model.js';

describe('frontmatter', () => {
  it('parses title, author, theme, defaults, and stylesheets', () => {
    const deck = parseDeck(`---
title: My deck
author: Samir
theme: dark
defaults:
  reveal: step
  effect: slide-in
  duration: 500ms
stylesheets:
  - ./theme.css
  - https://example.com/other.css
---

# Hello

- One
`);
    expect(deck.title).toBe('My deck');
    expect(deck.author).toBe('Samir');
    expect(deck.theme).toBe('dark');
    expect(deck.stylesheets).toEqual(['./theme.css', 'https://example.com/other.css']);
    const screen = flatScreens(deck)[0];
    expect(screen?.reveal.mode).toBe('step');
    expect(screen?.reveal.effect).toBe('slide-in');
    expect(screen?.reveal.durationMs).toBe(500);
  });

  it('frontmatter title wins over the first heading', () => {
    const deck = parseDeck(`---
title: Frontmatter wins
---

# Heading title

- One
`);
    expect(deck.title).toBe('Frontmatter wins');
    expect(flatScreens(deck)[0]?.title).toBe('Heading title');
  });

  it('ignores unknown keys and malformed defaults keys', () => {
    const deck = parseDeck(`---
unknown: whatever
defaults:
  reveal: sideways
  effect: fade-in
  bogus: 3
---

# T

- One
`);
    // reveal: sideways is malformed → ignored, so the base default 'all' applies.
    expect(flatScreens(deck)[0]?.reveal.mode).toBe('all');
    expect(flatScreens(deck)[0]?.reveal.effect).toBe('fade-in');
  });

  it('a file with no frontmatter is a one-screen deck', () => {
    const deck = parseDeck('# Hello\n\n- One\n- Two\n');
    expect(deck.sections).toHaveLength(1);
    expect(flatScreens(deck)).toHaveLength(1);
    expect(flatScreens(deck)[0]?.panels).toHaveLength(2);
  });
});

describe('screen delimiter', () => {
  it('--- splits screens; headings do not', () => {
    const deck = parseDeck(`# A

- One

# Still A

- Two

---

# B

- Three
`);
    const screens = flatScreens(deck);
    expect(screens).toHaveLength(2);
    expect(screens[0]?.title).toBe('A');
    // The second heading is content, not a title and not a screen split:
    // it renders as a heading block inside its own text panel.
    expect(screens[0]?.panels).toHaveLength(3);
    expect(screens[0]?.panels[1]?.blocks[0]?.type).toBe('heading');
    expect(screens[1]?.title).toBe('B');
  });

  it('consecutive --- lines produce no empty screen', () => {
    const deck = parseDeck(`# A

- One

---

---

# B

- Two
`);
    expect(flatScreens(deck)).toHaveLength(2);
  });

  it('a --- inside a fenced code block does not split', () => {
    const deck = parseDeck(`# A

\`\`\`
---
\`\`\`

- One
`);
    expect(flatScreens(deck)).toHaveLength(1);
    expect(flatScreens(deck)[0]?.panels).toHaveLength(2);
    expect(flatScreens(deck)[0]?.panels[0]?.kind).toBe('code');
  });

  it('an empty file parses to an empty deck, not a crash', () => {
    const deck = parseDeck('');
    expect(isEmptyDeck(deck)).toBe(true);
    const fmOnly = parseDeck('---\ntitle: Nothing here\n---\n');
    expect(isEmptyDeck(fmOnly)).toBe(true);
  });
});

describe('panels', () => {
  it('paragraphs, images, blockquotes, and code blocks are panels too', () => {
    const deck = parseDeck(`# Mixed

A paragraph panel.

![Alt](pic.png)

> A quote panel.

\`\`\`js
const x = 1;
\`\`\`
`);
    const panels = flatScreens(deck)[0]?.panels ?? [];
    expect(panels.map((p) => p.kind)).toEqual(['text', 'image', 'quote', 'code']);
  });

  it('nested lists stay inside their parent panel', () => {
    const deck = parseDeck(`# Nested

- A panel with structure.
  - Nested one stays inside.
  - Nested two stays inside.
- Second panel.
`);
    const panels = flatScreens(deck)[0]?.panels ?? [];
    expect(panels).toHaveLength(2);
    expect(panels[0]?.blocks[0]?.html).toContain('<ul>');
    expect(panels[0]?.blocks[0]?.html).toContain('Nested one stays inside.');
    expect(panels[0]?.text).toContain('Nested two stays inside.');
  });

  it('a list item with a fenced code block is a code panel', () => {
    const deck = parseDeck(`# Code in a bullet

- Run it:
  \`\`\`
  walkdown deck.md
  \`\`\`
- Plain.
`);
    const panels = flatScreens(deck)[0]?.panels ?? [];
    expect(panels.map((p) => p.kind)).toEqual(['code', 'text']);
  });
});

describe('reveal markers', () => {
  it('semicolons separate properties; commas only inside sequence', () => {
    const deck = parseDeck(`<!-- reveal: step; sequence: 3, 1, 2; effect: fade-in; duration: 1s -->

# Ordered

- One
- Two
- Three
`);
    const screen = flatScreens(deck)[0];
    expect(screen?.reveal.mode).toBe('step');
    expect(screen?.reveal.sequence).toEqual([2, 0, 1]);
    expect(screen?.reveal.effect).toBe('fade-in');
    expect(screen?.reveal.durationMs).toBe(1000);
  });

  it('an invalid sequence is ignored in full and document order is used', () => {
    const dup = parseDeck(`<!-- reveal: step; sequence: 1, 1, 2 -->

# Dup

- One
- Two
- Three
`);
    expect(flatScreens(dup)[0]?.reveal.sequence).toEqual([0, 1, 2]);
    const oor = parseDeck(`<!-- reveal: step; sequence: 1, 5 -->

# Out of range

- One
- Two
`);
    expect(flatScreens(oor)[0]?.reveal.sequence).toEqual([0, 1]);
  });

  it('durations clamp to 0–2000ms and malformed durations fall back to the default', () => {
    const big = parseDeck(`<!-- reveal: step; duration: 5s -->

# Big

- One
`);
    expect(flatScreens(big)[0]?.reveal.durationMs).toBe(2000);
    const bad = parseDeck(`<!-- reveal: step; duration: soon -->

# Bad

- One
`);
    expect(flatScreens(bad)[0]?.reveal.durationMs).toBe(300);
  });

  it('a marker with only class/panel-class does not change the reveal mode', () => {
    const deck = parseDeck(`<!-- reveal: class: hero; panel-class: big -->

# Styled

- One
- Two
`);
    const screen = flatScreens(deck)[0];
    expect(screen?.reveal.mode).toBe('all');
    expect(screen?.classNames).toEqual(['hero']);
    expect(screen?.panels[0]?.classNames).toEqual(['big']);
    expect(screen?.panels[1]?.classNames).toEqual(['big']);
  });

  it('a panel marker with no effect or duration changes nothing', () => {
    const deck = parseDeck(`# Late marker

- One

<!-- reveal: step -->

- Two
`);
    // The second bullet is still a panel; the marker sets no
    // per-panel effect or duration, and `step` is screen-level,
    // so the screen reveal is unchanged.
    const screen = flatScreens(deck)[0];
    expect(screen?.panels).toHaveLength(2);
    expect(screen?.reveal.mode).toBe('all');
    expect(screen?.panels[1]?.effect).toBeUndefined();
  });

  it('a reveal marker before a panel sets that panel’s effect and duration only', () => {
    const deck = parseDeck(`# Moves

<!-- reveal: effect: zoom-in -->
- Big

<!-- reveal: effect: slide-in; duration: 250ms -->
- Glider

- Plain
`);
    const screen = flatScreens(deck)[0];
    // The screen itself keeps its defaults; only the panels change.
    expect(screen?.reveal.effect).toBe('fade-in');
    expect(screen?.reveal.durationMs).toBe(300);
    expect(screen?.panels[0]?.effect).toBe('zoom-in');
    expect(screen?.panels[0]?.durationMs).toBeUndefined();
    expect(screen?.panels[1]?.effect).toBe('slide-in');
    expect(screen?.panels[1]?.durationMs).toBe(250);
    expect(screen?.panels[2]?.effect).toBeUndefined();
    expect(screen?.panels[2]?.durationMs).toBeUndefined();
  });

  it('a panel marker with only class sets no panel effect', () => {
    const deck = parseDeck(`# Styled panel

<!-- reveal: class: accent -->

- One
`);
    const screen = flatScreens(deck)[0];
    expect(screen?.panels[0]?.effect).toBeUndefined();
  });

  it('an unknown effect in a panel marker is ignored', () => {
    const deck = parseDeck(`# Unknown

<!-- reveal: effect: spin -->

- One
`);
    expect(flatScreens(deck)[0]?.panels[0]?.effect).toBeUndefined();
  });

  it('a reveal marker before the first panel is the screen marker, not a panel marker', () => {
    const deck = parseDeck(`<!-- reveal: effect: zoom-in -->

- One
- Two
`);
    const screen = flatScreens(deck)[0];
    expect(screen?.reveal.effect).toBe('zoom-in');
    expect(screen?.panels[0]?.effect).toBeUndefined();
  });

  it('a malformed marker is ignored and the rest parses normally', () => {
    const deck = parseDeck(`<!-- reveal: sideways -->

# Bad marker

- One

---

# Next

- Two
`);
    expect(flatScreens(deck)).toHaveLength(2);
    expect(flatScreens(deck)[0]?.reveal.mode).toBe('all');
  });

  it('the first of two reveal markers wins', () => {
    const deck = parseDeck(`<!-- reveal: step -->

<!-- reveal: all -->

# Two markers

- One
- Two
`);
    expect(flatScreens(deck)[0]?.reveal.mode).toBe('step');
  });

  it('an unclosed comment is plain text, not a marker', () => {
    const deck = parseDeck(`<!-- reveal: step

# Not a marker

- One
`);
    const screen = flatScreens(deck)[0];
    expect(screen?.reveal.mode).toBe('all');
    // The unclosed comment is plain text, so it is a paragraph panel of its own.
    expect(screen?.panels).toHaveLength(2);
    expect(screen?.panels[0]?.text).toContain('reveal: step');
  });
});

describe('behaviour cascade (§4.3)', () => {
  it('resolves per property: deck → Section → screen', () => {
    const deck = parseDeck(`---
defaults:
  reveal: step
  effect: fade-in
  duration: 500ms
---

<!-- section: Part one; duration: 250ms -->

# Screen one

- One
- Two

---

<!-- reveal: duration: 1s -->

# Screen two

- One
- Two

---

# Screen three

- One
`);
    const screens = flatScreens(deck);
    // Screen one: deck fade-in/500ms, Section 250ms.
    expect(screens[0]?.reveal).toEqual({ mode: 'step', sequence: [0, 1], effect: 'fade-in', durationMs: 250 });
    // Screen two: screen marker overrides duration only; effect stays deck fade-in.
    expect(screens[1]?.reveal).toEqual({ mode: 'step', sequence: [0, 1], effect: 'fade-in', durationMs: 1000 });
    // Screen three: same Section, so Section duration 250ms still applies.
    expect(screens[2]?.reveal.durationMs).toBe(250);
    expect(screens[2]?.reveal.effect).toBe('fade-in');
  });

  it('sequence is never inherited from deck defaults or a Section', () => {
    const deck = parseDeck(`---
defaults:
  reveal: step
  sequence: 2, 1
---

<!-- section: S; sequence: 2, 1 -->

# T

- One
- Two
`);
    expect(flatScreens(deck)[0]?.reveal.sequence).toEqual([0, 1]);
    expect(flatScreens(deck)[0]?.reveal.mode).toBe('step');
  });
});

describe('sections', () => {
  it('a deck with no markers is one unnamed Section', () => {
    const deck = parseDeck(`# A

- One

---

# B

- Two
`);
    expect(deck.sections).toHaveLength(1);
    expect(deck.sections[0]?.title).toBeUndefined();
    expect(deck.sections[0]?.screens).toHaveLength(2);
  });

  it('section markers group screens and carry class + defaults', () => {
    const deck = parseDeck(`<!-- section: First; reveal: step; effect: slide-in; duration: 250ms; class: dark -->

# A

- One

---

<!-- section: Second -->

# B

- Two
`);
    expect(deck.sections.map((s) => s.title)).toEqual(['First', 'Second']);
    expect(deck.sections[0]?.classNames).toEqual(['dark']);
    expect(flatScreens(deck)[0]?.reveal.effect).toBe('slide-in');
    expect(flatScreens(deck)[1]?.reveal.mode).toBe('all');
  });

  it('two section markers in a row: the later wins, the empty one is dropped', () => {
    const deck = parseDeck(`<!-- section: First -->

<!-- section: Second -->

# A

- One
`);
    expect(deck.sections).toHaveLength(1);
    expect(deck.sections[0]?.title).toBe('Second');
  });
});

describe('inline CSS block (§2.8)', () => {
  it('a trailing ```css block is extracted and never becomes a panel', () => {
    const deck = parseDeck(`# Styled

- One

\`\`\`css
.hero { text-align: center; }
\`\`\`
`);
    expect(deck.styles).toContain('.hero');
    expect(flatScreens(deck)[0]?.panels).toHaveLength(1);
  });

  it('a ```css block that is not last renders as an ordinary code block', () => {
    const deck = parseDeck(`# Not last

\`\`\`css
.a { color: red; }
\`\`\`

- One
`);
    expect(deck.styles).toBe('');
    expect(flatScreens(deck)[0]?.panels).toHaveLength(2);
    expect(flatScreens(deck)[0]?.panels[0]?.kind).toBe('code');
  });

  it('total steps count stepped screens honestly', () => {
    const deck = parseDeck(`<!-- reveal: all -->

# Hero

- One

---

<!-- reveal: step -->

# Stepped

- One
- Two
- Three
`);
    expect(totalSteps(deck)).toBe(1 + 3);
  });
});
