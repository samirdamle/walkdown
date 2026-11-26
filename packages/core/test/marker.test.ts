import { describe, expect, it } from 'vitest';
import { parseMarkerParams, parseMarkerSegment, splitMarkerSegments } from '../src/marker.js';
import { parseDeck } from '../src/parser.js';
import { flatScreens } from '../src/model.js';

/**
 * The marker grammar lives in marker.ts and is asserted here, once.
 * parseDeck behavior tests in parser.test.ts stay as regression pins
 * through the public API; nothing pins the same grammar rule twice.
 * The integration tests below exist only for the differences the
 * shared parser deliberately leaves at the call site: a section
 * marker's first segment is always its title (it may contain ':'),
 * while a reveal marker's first segment may be a bare mode.
 */
describe('splitMarkerSegments — the `;` split', () => {
  it('splits on semicolons and trims each segment', () => {
    expect(splitMarkerSegments('step; effect: fade-in; duration: 1s')).toEqual([
      'step',
      'effect: fade-in',
      'duration: 1s',
    ]);
  });

  it('commas stay inside a segment — they never split', () => {
    expect(splitMarkerSegments('sequence: 3, 1, 2; effect: fade-in')).toEqual([
      'sequence: 3, 1, 2',
      'effect: fade-in',
    ]);
  });

  it('empty segments are kept — each marker kind reads them differently', () => {
    expect(splitMarkerSegments('; step;; effect: fade-in;')).toEqual([
      '',
      'step',
      '',
      'effect: fade-in',
      '',
    ]);
  });
});

describe('parseMarkerSegment — one `key: value` pair', () => {
  it('splits at the first colon, lowercases the key, trims both sides', () => {
    expect(parseMarkerSegment('  Effect :  fade-in  ')).toEqual({ key: 'effect', value: 'fade-in' });
    expect(parseMarkerSegment('title: Q&A: hard parts')).toEqual({ key: 'title', value: 'Q&A: hard parts' });
  });

  it('a segment without a colon is not a pair', () => {
    expect(parseMarkerSegment('step')).toBeUndefined();
    expect(parseMarkerSegment('')).toBeUndefined();
  });

  it('an empty key or value is not a pair', () => {
    expect(parseMarkerSegment(': fade-in')).toBeUndefined();
    expect(parseMarkerSegment('effect:')).toBeUndefined();
    expect(parseMarkerSegment('effect:   ')).toBeUndefined();
  });
});

describe('parseMarkerParams — bare value + param map', () => {
  it('the first segment without a colon is the bare value', () => {
    const params = parseMarkerParams('step; effect: fade-in');
    expect(params.bare).toBe('step');
    expect(params.values.get('effect')).toBe('fade-in');
  });

  it('a bare value anywhere else is ignored', () => {
    const params = parseMarkerParams('effect: fade-in; all');
    expect(params.bare).toBeUndefined();
    expect(params.values.get('effect')).toBe('fade-in');
  });

  it('empty segments are dropped before indexing, so a leading `;` changes nothing', () => {
    expect(parseMarkerParams('; step').bare).toBe('step');
    expect(parseMarkerParams('step;; effect: fade-in').values.get('effect')).toBe('fade-in');
  });

  it('keys are case-insensitive and a later key wins', () => {
    const params = parseMarkerParams('EFFECT: fade-in; effect: slide-in');
    expect(params.values.get('effect')).toBe('slide-in');
    expect([...params.values.keys()]).toEqual(['effect']);
  });

  it('a sequence value keeps its commas whole', () => {
    expect(parseMarkerParams('sequence: 3, 1, 2').values.get('sequence')).toBe('3, 1, 2');
  });

  it('unknown keys are kept in the map — the caller decides what they mean', () => {
    expect(parseMarkerParams('spin: fast').values.get('spin')).toBe('fast');
  });

  it('an empty marker has no bare value and no pairs', () => {
    const params = parseMarkerParams('  ;  ');
    expect(params.bare).toBeUndefined();
    expect(params.values.size).toBe(0);
  });
});

describe('marker grammar through parseDeck — what stays at the call site', () => {
  it('a section title may contain a colon, and its params still apply', () => {
    const deck = parseDeck(`<!-- section: Q&A: hard parts; effect: slide-in -->

# T

- One
`);
    expect(deck.sections[0]?.title).toBe('Q&A: hard parts');
    expect(flatScreens(deck)[0]?.reveal.effect).toBe('slide-in');
  });

  it('a section marker with an empty first segment is rejected outright', () => {
    const deck = parseDeck(`<!-- section: ; effect: fade-in -->

# T

- One
`);
    expect(deck.sections).toHaveLength(1);
    expect(deck.sections[0]?.title).toBeUndefined();
  });

  it('section keys are case-insensitive with space around the colon', () => {
    const deck = parseDeck(`<!-- section: S; REVEAL : step ; Effect : slide-in -->

# T

- One
`);
    expect(flatScreens(deck)[0]?.reveal.mode).toBe('step');
    expect(flatScreens(deck)[0]?.reveal.effect).toBe('slide-in');
  });

  it('a reveal first segment with a colon is a pair, not a bare mode', () => {
    const deck = parseDeck(`<!-- reveal: step: foo -->

# T

- One
`);
    expect(flatScreens(deck)[0]?.reveal.mode).toBe('all');
  });

  it('a reveal marker with a leading empty segment still sets its mode', () => {
    const deck = parseDeck(`<!-- reveal: ; step -->

# T

- One
`);
    expect(flatScreens(deck)[0]?.reveal.mode).toBe('step');
  });
});
