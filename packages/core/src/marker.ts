/**
 * One marker parser (architecture review candidate 2).
 *
 * Reveal markers (`<!-- reveal: ... -->`) and section markers
 * (`<!-- section: Title -->`) share one `;`-separated `key: value`
 * grammar (spec §4.1, §2.4): semicolons separate properties,
 * commas only inside a value. The grammar lives here and nowhere
 * else: this module produces the raw segments and, for the
 * `key: value` form, a param map, and each marker kind applies its
 * own small key table on top (in parser.ts).
 *
 * The two kinds genuinely differ in what the FIRST segment means,
 * and that difference stays explicit at the call site — the shared
 * parser never guesses what the head means:
 * - A reveal marker's first segment may be a bare value (`step` /
 *   `all`); it sets the mode (§4.1). A first segment with a `:` in
 *   it is a `key: value` pair like any other.
 * - A section marker's first segment is always its title, even
 *   when it contains a `:` (`section: Q&A: hard parts` titles the
 *   Section `Q&A: hard parts`); there is no bare mode value in a
 *   section marker (§2.4). Section markers therefore take their
 *   title from the raw first segment and read only the later
 *   segments through the param map.
 *
 * Empty segments are kept by the splitter because the two kinds
 * read them differently, and that difference is load-bearing:
 * reveal markers drop empties before indexing (so `reveal: ; step`
 * still sets the mode), while a section marker with an empty first
 * segment has an empty title and is rejected (§2.4).
 *
 * Deliberately NOT here: the per-kind key tables (which keys each
 * marker honours, and what `sequence` / `effect` / `duration` /
 * `class` mean — those stay with the call site), and the value
 * parsers (parseMode / parseEffect / parseDuration, in parser.ts).
 */

export interface MarkerParams {
  /** First segment, when it has no `:` — a bare value (§4.1). */
  bare?: string;
  /** `key: value` pairs in order; a later key wins over an earlier one. Keys are lowercased. */
  values: Map<string, string>;
}

/**
 * Split marker inside-text on `;`, trimming each segment (§4.1).
 * Empty segments are kept — each marker kind decides what they
 * mean (see the module comment).
 */
export function splitMarkerSegments(inside: string): string[] {
  return inside.split(';').map((s) => s.trim());
}

/**
 * Parse one segment as `key: value`. The split is at the FIRST
 * colon, so a value may itself contain colons. Keys are lowercased
 * and surrounding whitespace is ignored. Returns undefined when
 * the segment has no `:` or an empty key or value.
 */
export function parseMarkerSegment(segment: string): { key: string; value: string } | undefined {
  const colon = segment.indexOf(':');
  if (colon === -1) return undefined;
  const key = segment.slice(0, colon).trim().toLowerCase();
  const value = segment.slice(colon + 1).trim();
  if (key === '' || value === '') return undefined;
  return { key, value };
}

/**
 * Parse a marker's inside text into a bare value + param map (§4.1).
 * Empty segments are dropped; the first remaining segment without
 * a `:` is the bare value, and a bare value anywhere else is
 * ignored. Unknown keys are kept in the map — the caller's key
 * table decides what they mean (§4.2).
 */
export function parseMarkerParams(inside: string): MarkerParams {
  const params: MarkerParams = { values: new Map() };
  let first = true;
  for (const segment of splitMarkerSegments(inside)) {
    if (segment === '') continue;
    const parsed = parseMarkerSegment(segment);
    if (parsed === undefined) {
      if (first) params.bare = segment;
      // A bare value anywhere else is ignored.
    } else {
      params.values.set(parsed.key, parsed.value);
    }
    first = false;
  }
  return params;
}
