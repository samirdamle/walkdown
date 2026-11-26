/**
 * One fence-aware line scanner (architecture review candidate 1).
 *
 * The block grammar — what counts as a fence, a heading, a list
 * marker, an image, a comment — lives here and nowhere else.
 * parser.ts (screen splitting, fence extraction, panel splitting)
 * and markdown.ts (HTML rendering) all read blocks from this
 * module instead of re-testing the same regexes over lines.
 *
 * Three fence models coexist in the old code, and the scanner
 * preserves all three exactly — it does not unify them, because
 * they disagree on edge inputs (an info string with spaces, a
 * four-backtick fence, a ```lang line used as a closer):
 * - M1, the loose ```-toggle, which splitScreens uses to decide
 *   whether a `---` line splits screens. Tracked here as
 *   `inLooseFence` on every block.
 * - M2, loose-open / strict-close, which parsePanels uses for
 *   code panels: any ```-starting line opens, only a ```-only
 *   line closes. Any `fence` block opens an M2 fence; a fence
 *   block with `close` ends it.
 * - M3, strict-open / strict-close, which findFences and
 *   renderBlocks use: only a line matching FENCE opens, only a
 *   ```-only line closes. A fence block with `strictOpen` opens
 *   an M3 fence; `lang` is its info string.
 * A consumer derives its model from the fence blocks; no
 * consumer tracks fence state itself any more.
 *
 * Blocks are fine-grained on purpose: a run of ordinary lines
 * splits when its indent changes, and a run of quote lines
 * splits the same way, so a consumer can take or leave a whole
 * block by checking one line's indent. Blank lines are single
 * blocks — parsePanels' list-item blank peek looks at exactly
 * the next line, and grouping blanks would change it.
 *
 * Deliberately NOT here: parseFrontmatter (a different grammar),
 * plainText (its ```-pair regex works on mid-line pairs and feeds
 * layout estimates — unifying it would change fitted type sizes),
 * and the title search (a single findIndex, not a walker).
 */

/** Strict fence open: exactly three backticks plus a word-only info string. */
const FENCE = /^```(\w*)\s*$/;

/** A list marker: `-`, `*`, `+`, or `1.` / `1)` … followed by space. */
export const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;

const HEADING = /^(#{1,6})\s+(.*)$/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;
const COMMENT_LINE = /^\s*<!--(.*?)-->\s*$/;

/** Leading-whitespace width in columns (a tab counts as two) — the same rule markdown.ts's toLines uses. */
export function indentWidth(line: string): number {
  const leading = /^(\s*)(.*)$/.exec(line)?.[1] ?? '';
  return leading.replace(/\t/g, '  ').length;
}

/** A line minus its leading whitespace. */
export function stripIndent(line: string): string {
  return /^(\s*)(.*)$/.exec(line)?.[2] ?? '';
}

export type ScannedBlockType =
  | 'fence'
  | 'blank'
  | 'heading'
  | 'quote'
  | 'list-marker'
  | 'image'
  | 'comment'
  | 'thematic-break'
  | 'text';

export interface ScannedBlock {
  type: ScannedBlockType;
  /** Raw lines of this block, in document order. */
  lines: string[];
  /** 0-based line index of the first line. */
  start: number;
  /** Fence blocks: info string from a strict fence open, '' when bare. */
  lang?: string;
  /** Fence blocks: the line matches the strict fence grammar. */
  strictOpen?: boolean;
  /** Fence blocks: the line is exactly ``` — a strict close. */
  close?: boolean;
  /** Heading blocks: 1–6. */
  level?: number;
  /** List-marker blocks: marker length on the trimmed line, trailing space included. */
  markerWidth?: number;
  /** List-marker blocks: leading-whitespace width of the line. */
  indent?: number;
  /** Comment blocks: the text inside <!-- ... -->. */
  inside?: string;
  /**
   * Whether the block's first line sits inside a loose fence (the
   * M1 ```-toggle model). Only thematic-break blocks read it
   * today — a `---` splits screens only when it is false — but
   * it is recorded on every block so the fence state is visible
   * here, not recomputed by a consumer.
   */
  inLooseFence: boolean;
}

/** Classify lines into blocks, in one pass. Pure: no DOM, no I/O. */
export function scanBlocks(lines: string[]): ScannedBlock[] {
  const blocks: ScannedBlock[] = [];
  let i = 0;
  let looseIn = false;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    const inLoose = looseIn;
    if (trimmed.startsWith('```')) {
      const fence = FENCE.exec(trimmed);
      blocks.push({
        type: 'fence',
        lines: [line],
        start: i,
        lang: fence ? (fence[1] ?? '') : undefined,
        strictOpen: fence !== null,
        close: trimmed === '```',
        inLooseFence: inLoose,
      });
      looseIn = !looseIn;
      i++;
      continue;
    }
    if (trimmed === '') {
      blocks.push({ type: 'blank', lines: [line], start: i, inLooseFence: inLoose });
      i++;
      continue;
    }
    const heading = HEADING.exec(trimmed);
    if (heading) {
      blocks.push({ type: 'heading', lines: [line], start: i, level: heading[1]?.length ?? 1, inLooseFence: inLoose });
      i++;
      continue;
    }
    if (trimmed.startsWith('>')) {
      const start = i;
      const indent = indentWidth(line);
      const run: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (next.trim().startsWith('>') && indentWidth(next) === indent) {
          run.push(next);
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'quote', lines: run, start, inLooseFence: inLoose });
      continue;
    }
    const marker = LIST_MARKER.exec(trimmed);
    if (marker) {
      blocks.push({
        type: 'list-marker',
        lines: [line],
        start: i,
        markerWidth: marker[0].length,
        indent: indentWidth(line),
        inLooseFence: inLoose,
      });
      i++;
      continue;
    }
    if (IMAGE.test(trimmed)) {
      blocks.push({ type: 'image', lines: [line], start: i, inLooseFence: inLoose });
      i++;
      continue;
    }
    const comment = COMMENT_LINE.exec(line);
    if (comment) {
      blocks.push({ type: 'comment', lines: [line], start: i, inside: comment[1] ?? '', inLooseFence: inLoose });
      i++;
      continue;
    }
    if (trimmed === '---') {
      blocks.push({ type: 'thematic-break', lines: [line], start: i, inLooseFence: inLoose });
      i++;
      continue;
    }
    // Text run: ordinary lines at one indent. A run ends at any
    // line another kind claims, or when the indent changes.
    const start = i;
    const indent = indentWidth(line);
    const run: string[] = [];
    while (i < lines.length) {
      const next = lines[i] ?? '';
      const nt = next.trim();
      if (
        nt === '' ||
        nt.startsWith('```') ||
        HEADING.test(nt) ||
        nt.startsWith('>') ||
        LIST_MARKER.test(nt) ||
        IMAGE.test(nt) ||
        COMMENT_LINE.test(next) ||
        nt === '---' ||
        indentWidth(next) !== indent
      ) {
        break;
      }
      run.push(next);
      i++;
    }
    blocks.push({ type: 'text', lines: run, start, inLooseFence: inLoose });
  }
  return blocks;
}
