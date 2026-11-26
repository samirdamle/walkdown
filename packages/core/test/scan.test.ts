import { describe, expect, it } from 'vitest';
import { scanBlocks } from '../src/scan.js';
import { parseDeck } from '../src/parser.js';
import { flatScreens } from '../src/model.js';

/**
 * The block grammar lives in scan.ts and is asserted here, once.
 * parseDeck/renderBlocks behavior tests in parser.test.ts stay as
 * regression pins through the public API; nothing pins the same
 * grammar rule twice.
 */
describe('scanBlocks — fence grammar', () => {
  it('a strict fence records its info string and its close', () => {
    const blocks = scanBlocks(['```js', 'const x = 1;', '```']);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: 'fence', strictOpen: true, lang: 'js', close: false, start: 0 });
    expect(blocks[1]).toMatchObject({ type: 'text', start: 1 });
    expect(blocks[2]).toMatchObject({ type: 'fence', strictOpen: true, lang: '', close: true, start: 2 });
  });

  it('a bare fence is a strict open with an empty info string', () => {
    const blocks = scanBlocks(['```', 'code', '```']);
    expect(blocks[0]).toMatchObject({ type: 'fence', strictOpen: true, lang: '' });
  });

  it('an info string with spaces is a fence line but not a strict open', () => {
    const blocks = scanBlocks(['```foo bar', 'code', '```']);
    expect(blocks[0]).toMatchObject({ type: 'fence', strictOpen: false, lang: undefined });
    // …yet it still toggles the loose fence, so a --- inside it does not split.
    expect(blocks[0]?.inLooseFence).toBe(false);
    expect(blocks[1]?.inLooseFence).toBe(true);
    expect(blocks[2]?.inLooseFence).toBe(true);
  });

  it('a four-backtick fence is a fence line but not a strict open', () => {
    const blocks = scanBlocks(['````', 'code', '````']);
    expect(blocks[0]).toMatchObject({ type: 'fence', strictOpen: false });
    expect(blocks[2]).toMatchObject({ type: 'fence', strictOpen: false, close: false });
  });

  it('an indented fence line is still a fence line', () => {
    const blocks = scanBlocks(['  ```js', '  code', '  ```']);
    expect(blocks[0]).toMatchObject({ type: 'fence', strictOpen: true, lang: 'js' });
    expect(blocks[2]).toMatchObject({ type: 'fence', close: true });
  });

  it('an unclosed fence has no close block after it', () => {
    const blocks = scanBlocks(['```js', 'code']);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ type: 'text' });
  });

  it('a ```lang line is not a close — only a ```-only line closes', () => {
    const blocks = scanBlocks(['```js', 'code', '```py', 'more', '```']);
    expect(blocks.map((b) => b.type)).toEqual(['fence', 'text', 'fence', 'text', 'fence']);
    expect(blocks[2]).toMatchObject({ type: 'fence', close: false, strictOpen: true, lang: 'py' });
    expect(blocks[4]).toMatchObject({ type: 'fence', close: true });
  });
});

describe('scanBlocks — loose fence parity', () => {
  it('a --- inside a loose fence is marked; one outside is not', () => {
    const blocks = scanBlocks(['```', '---', '```', '---']);
    const breaks = blocks.filter((b) => b.type === 'thematic-break');
    expect(breaks).toHaveLength(2);
    expect(breaks[0]?.inLooseFence).toBe(true);
    expect(breaks[1]?.inLooseFence).toBe(false);
  });

  it('--- with trailing spaces is a break; ---- is text', () => {
    expect(scanBlocks(['---  '])[0]?.type).toBe('thematic-break');
    expect(scanBlocks(['----'])[0]?.type).toBe('text');
  });
});

describe('scanBlocks — other kinds', () => {
  it('list markers: -, *, +, 1., 2) — with marker width and indent', () => {
    const blocks = scanBlocks(['- one', '* two', '+ three', '1. four', '2) five', '  - nested']);
    expect(blocks.map((b) => b.type)).toEqual([
      'list-marker',
      'list-marker',
      'list-marker',
      'list-marker',
      'list-marker',
      'list-marker',
    ]);
    expect(blocks[0]).toMatchObject({ markerWidth: 2, indent: 0 });
    expect(blocks[3]).toMatchObject({ markerWidth: 3, indent: 0 });
    expect(blocks[4]).toMatchObject({ markerWidth: 3, indent: 0 });
    expect(blocks[5]).toMatchObject({ markerWidth: 2, indent: 2 });
  });

  it('a dash without a following space is not a list marker', () => {
    expect(scanBlocks(['-x'])[0]?.type).toBe('text');
    expect(scanBlocks(['1.x'])[0]?.type).toBe('text');
  });

  it('headings record their level; seven hashes and no-space are text', () => {
    expect(scanBlocks(['# H'])[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(scanBlocks(['###### H'])[0]).toMatchObject({ type: 'heading', level: 6 });
    expect(scanBlocks(['####### H'])[0]?.type).toBe('text');
    expect(scanBlocks(['#NoSpace'])[0]?.type).toBe('text');
  });

  it('an image line is an image only when the whole line matches', () => {
    expect(scanBlocks(['![Alt](pic.png)'])[0]?.type).toBe('image');
    expect(scanBlocks(['![Alt](pic.png) extra'])[0]?.type).toBe('text');
  });

  it('a comment records its inside text', () => {
    const blocks = scanBlocks(['<!-- reveal: step -->']);
    expect(blocks[0]).toMatchObject({ type: 'comment', inside: ' reveal: step ' });
    // An unclosed comment is plain text, not a marker.
    expect(scanBlocks(['<!-- reveal: step'])[0]?.type).toBe('text');
  });

  it('blank lines are single blocks, each with its start', () => {
    const blocks = scanBlocks(['a', '', '', 'b']);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'blank', 'blank', 'text']);
    expect(blocks.map((b) => b.start)).toEqual([0, 1, 2, 3]);
  });

  it('text runs split when the indent changes', () => {
    const blocks = scanBlocks(['a', '  b', 'c']);
    expect(blocks.map((b) => [b.type, b.lines])).toEqual([
      ['text', ['a']],
      ['text', ['  b']],
      ['text', ['c']],
    ]);
  });

  it('quote runs group consecutive lines and split on indent change', () => {
    expect(scanBlocks(['> a', '> b'])).toHaveLength(1);
    expect(scanBlocks(['> a', '> b'])[0]).toMatchObject({ type: 'quote', lines: ['> a', '> b'] });
    expect(scanBlocks(['> a', '  > b']).map((b) => b.type)).toEqual(['quote', 'quote']);
  });
});

describe('fence models preserved end to end', () => {
  it('an info string with spaces is a code panel but not a css block', () => {
    const deck = parseDeck('# T\n\n```foo bar\ncode\n```\n\n- One\n');
    expect(deck.styles).toBe('');
    expect(flatScreens(deck)[0]?.panels[0]?.kind).toBe('code');
  });

  it('screens still split on --- after a spaced-info fence', () => {
    const deck = parseDeck('```foo bar\ncode\n```\n\n---\n\n- One\n');
    expect(flatScreens(deck)).toHaveLength(2);
  });

  it('a four-backtick fence still toggles screen splitting', () => {
    const deck = parseDeck('````\ncode\n````\n\n---\n\n- One\n');
    expect(flatScreens(deck)).toHaveLength(2);
  });

  it('an uppercase ```CSS block is still extracted as the stylesheet', () => {
    const deck = parseDeck('# Styled\n\n- One\n\n```CSS\n.hero { color: red; }\n```\n');
    expect(deck.styles).toContain('.hero');
  });

  it('an unclosed ```css block is not extracted', () => {
    const deck = parseDeck('# Styled\n\n- One\n\n```css\n.hero { color: red; }\n');
    expect(deck.styles).toBe('');
  });

  it('an unclosed fence still becomes a code panel', () => {
    const deck = parseDeck('# T\n\n```js\nconst x = 1;\n');
    expect(flatScreens(deck)[0]?.panels[0]?.kind).toBe('code');
  });

  it('an indented fence still becomes a code panel', () => {
    const deck = parseDeck('# T\n\n  ```js\n  const x = 1;\n  ```\n');
    expect(flatScreens(deck)[0]?.panels[0]?.kind).toBe('code');
  });
});
