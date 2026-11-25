/**
 * Markdown → Deck parser (spec §2–§4).
 *
 * Pure function of the Markdown text (§3.1): no DOM, no
 * viewport, no network. Stylesheet *fetching* is the
 * renderer's job — the parser only records the `stylesheets`
 * list from frontmatter (§11.4).
 *
 * Pipeline (§3.1):
 *   frontmatter extraction (§2.1)
 *   → inline CSS block extraction (§2.8)
 *   → screen splitting on `---` (§2.2)
 *   → per-screen: section marker, title, reveal marker, blocks
 *   → blocks → panels (§2.5, §2.6)
 *   → defaults resolution (§4.3) — each Screen.reveal fully computed
 *   → steps derived (§1.3, see model.ts)
 *   → Deck model (§1.1)
 */
import { plainText, renderBlocks } from './markdown.js';
import type {
  Block,
  Deck,
  Panel,
  PanelKind,
  Reveal,
  RevealEffect,
  RevealMode,
  Screen,
  Section,
  Theme,
} from './types.js';

export const DURATION_DEFAULT_MS = 300;
export const DURATION_MIN_MS = 0;
export const DURATION_MAX_MS = 2000;
export const EFFECTS: readonly RevealEffect[] = ['fade-in', 'slide-in', 'none'];

interface DeckDefaults {
  mode?: RevealMode;
  effect?: RevealEffect;
  durationMs?: number;
}

interface SectionParams extends DeckDefaults {
  classNames: string[];
}

interface Frontmatter {
  title?: string;
  author?: string;
  theme: Theme;
  defaults: DeckDefaults;
  stylesheets: string[];
}

const EMPTY_FRONTMATTER: Frontmatter = {
  theme: 'light',
  defaults: {},
  stylesheets: [],
};

function stripQuotes(value: string): string {
  const m = /^(['"])(.*)\1$/.exec(value.trim());
  return m ? (m[2] ?? '') : value.trim();
}

/** Parse a CSS time (`1s`, `250ms`) to milliseconds; undefined when malformed (§4.2). */
export function parseDuration(value: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s)\s*$/i.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]);
  const ms = (m[2] ?? '').toLowerCase() === 's' ? n * 1000 : n;
  return Math.min(DURATION_MAX_MS, Math.max(DURATION_MIN_MS, ms));
}

function parseMode(value: string): RevealMode | undefined {
  const v = value.trim().toLowerCase();
  return v === 'step' || v === 'all' ? v : undefined;
}

function parseEffect(value: string): RevealEffect | undefined {
  const v = value.trim().toLowerCase();
  return (EFFECTS as readonly string[]).includes(v) ? (v as RevealEffect) : undefined;
}

/** Minimal YAML-subset reader for frontmatter (§2.1): scalar keys, a `defaults:` map, a `stylesheets:` list. Unknown keys are ignored, never an error. */
function parseFrontmatter(lines: string[]): { frontmatter: Frontmatter; rest: string[] } {
  if (lines[0]?.trim() !== '---') return { frontmatter: { ...EMPTY_FRONTMATTER }, rest: lines };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) return { frontmatter: { ...EMPTY_FRONTMATTER }, rest: lines };
  const fm: Frontmatter = { theme: 'light', defaults: {}, stylesheets: [] };
  const body = lines.slice(1, close);
  let section: 'root' | 'defaults' | 'stylesheets' = 'root';
  for (const raw of body) {
    const line = raw ?? '';
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const listItem = /^(\s*)-\s+(.*)$/.exec(line);
    if (listItem && section === 'stylesheets') {
      fm.stylesheets.push(stripQuotes(listItem[2] ?? ''));
      continue;
    }
    const kv = /^(\s*)([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const indent = kv[1]?.length ?? 0;
    const key = (kv[2] ?? '').trim().toLowerCase();
    const value = kv[3] ?? '';
    if (indent === 0) {
      if (key === 'title') fm.title = stripQuotes(value) || undefined;
      else if (key === 'author') fm.author = stripQuotes(value) || undefined;
      else if (key === 'theme') {
        const t = stripQuotes(value).toLowerCase();
        if (t === 'light' || t === 'dark') fm.theme = t;
      } else if (key === 'defaults' && value.trim() === '') section = 'defaults';
      else if (key === 'stylesheets' && value.trim() === '') section = 'stylesheets';
      else section = 'root';
    } else if (section === 'defaults') {
      // A malformed `defaults:` map is ignored for the bad key only (§3.3).
      if (key === 'reveal') fm.defaults.mode = parseMode(value);
      else if (key === 'effect') fm.defaults.effect = parseEffect(value);
      else if (key === 'duration') fm.defaults.durationMs = parseDuration(value);
      // `sequence` is never a deck default (§4.3) — ignored here, as is any unknown key.
    }
  }
  return { frontmatter: fm, rest: lines.slice(close + 1) };
}

interface FenceBlock {
  start: number;
  end: number; // line index of the closing fence
  lang: string;
  text: string;
}

function findFences(lines: string[]): FenceBlock[] {
  const fences: FenceBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = /^```(\w*)\s*$/.exec((lines[i] ?? '').trim());
    if (m) {
      const start = i;
      const content: string[] = [];
      i++;
      while (i < lines.length && (lines[i] ?? '').trim() !== '```') {
        content.push(lines[i] ?? '');
        i++;
      }
      if (i < lines.length) {
        fences.push({ start, end: i, lang: (m[1] ?? '').toLowerCase(), text: content.join('\n') });
      }
      i++;
    } else {
      i++;
    }
  }
  return fences;
}

/**
 * A fenced ```css block as the LAST block in the file is the
 * deck's inline stylesheet (§2.8). Anything after it but blank
 * lines means it is not last, and it renders as an ordinary
 * code block instead.
 */
function extractInlineCss(lines: string[]): { styles: string; lines: string[] } {
  const fences = findFences(lines);
  const last = fences[fences.length - 1];
  if (last === undefined || last.lang !== 'css') return { styles: '', lines };
  const after = lines.slice(last.end + 1);
  if (after.some((l) => l.trim() !== '')) return { styles: '', lines };
  const kept = [...lines.slice(0, last.start), ...lines.slice(last.end + 1)];
  return { styles: last.text, lines: kept };
}

/** Split into screens on `---` lines outside fenced code blocks (§2.2). */
function splitScreens(lines: string[]): string[][] {
  const screens: string[][] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) inFence = !inFence;
    if (!inFence && trimmed === '---') {
      screens.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  screens.push(current);
  return screens;
}

interface MarkerParams {
  bare?: string;
  values: Map<string, string>;
}

/**
 * Split a marker's inside text on `;` — semicolons separate
 * properties, commas only inside a value (§4.1). The first
 * segment may be a bare value.
 */
function parseMarkerParams(inside: string): MarkerParams {
  const segments = inside
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const params: MarkerParams = { values: new Map() };
  segments.forEach((segment, index) => {
    const colon = segment.indexOf(':');
    if (colon === -1) {
      if (index === 0) params.bare = segment;
      return; // a bare value anywhere else is ignored
    }
    const key = segment.slice(0, colon).trim().toLowerCase();
    const value = segment.slice(colon + 1).trim();
    if (key !== '' && value !== '') params.values.set(key, value);
  });
  return params;
}

function validClassNames(value: string | undefined): string[] {
  if (!value) return [];
  // Space-separated; a token that is not a valid CSS class name is ignored (§4.2).
  return value.split(/\s+/).filter((t) => /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(t));
}

interface ScreenMarker {
  mode?: RevealMode;
  /** True when the marker sets any reveal parameter (mode/effect/duration/sequence) — then the mode is 'step' unless a bare value says otherwise (§4.1). */
  hasRevealParams: boolean;
  sequence?: number[];
  effect?: RevealEffect;
  durationMs?: number;
  classNames: string[];
  panelClassNames: string[];
}

function parseRevealMarker(inside: string): ScreenMarker | undefined {
  // inside starts with `reveal:` (checked by the caller).
  const after = inside.slice('reveal'.length).replace(/^:\s*/, '');
  const params = parseMarkerParams(after);
  const marker: ScreenMarker = { hasRevealParams: false, classNames: [], panelClassNames: [] };
  if (params.bare !== undefined) {
    const mode = parseMode(params.bare);
    if (mode === undefined) return undefined; // malformed marker: ignored (§3.3)
    marker.mode = mode;
    marker.hasRevealParams = true;
  }
  for (const [key, value] of params.values) {
    if (key === 'sequence') {
      const nums = value
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n));
      if (nums.length > 0 && nums.every((n) => n >= 1)) marker.sequence = nums;
      marker.hasRevealParams = true;
    } else if (key === 'effect') {
      marker.effect = parseEffect(value);
      marker.hasRevealParams = true;
    } else if (key === 'duration') {
      marker.durationMs = parseDuration(value);
      marker.hasRevealParams = true;
    } else if (key === 'class') {
      marker.classNames = validClassNames(value);
    } else if (key === 'panel-class') {
      marker.panelClassNames = validClassNames(value);
    }
    // Unknown keys are ignored, never an error (§4.2).
  }
  return marker;
}

interface SectionMarker {
  title: string;
  params: SectionParams;
}

function parseSectionMarker(inside: string): SectionMarker | undefined {
  // inside starts with `section:` — the first segment is the title (it may contain ':').
  const after = inside.slice('section'.length).replace(/^:\s*/, '');
  const segments = after.split(';').map((s) => s.trim());
  const title = segments[0] ?? '';
  if (title === '') return undefined; // a Section title MUST be non-empty (§2.4)
  const params: SectionParams = { classNames: [] };
  for (const segment of segments.slice(1)) {
    const colon = segment.indexOf(':');
    if (colon === -1) continue;
    const key = segment.slice(0, colon).trim().toLowerCase();
    const value = segment.slice(colon + 1).trim();
    if (key === 'reveal') params.mode = parseMode(value);
    else if (key === 'effect') params.effect = parseEffect(value);
    else if (key === 'duration') params.durationMs = parseDuration(value);
    else if (key === 'class') params.classNames = validClassNames(value);
    // `sequence` is NOT a section parameter (§4.2) — ignored.
  }
  return { title, params };
}

const COMMENT_LINE = /^\s*<!--(.*?)-->\s*$/;
const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;

function indentOf(line: string): number {
  return (line.match(/^ */)?.[0].length ?? 0) + (line.match(/^\t+/)?.[0].length ?? 0) * 2;
}

function makeBlock(type: Block['type'], markdown: string): Block {
  return { type, markdown, html: renderBlocks(markdown), text: plainText(markdown) };
}

function panelKindFor(lines: string[], blockType: Block['type']): PanelKind {
  if (blockType === 'code') return 'code';
  if (blockType === 'quote') return 'quote';
  if (blockType === 'image') return 'image';
  if (blockType === 'list') {
    const joined = lines.join('\n');
    if (/^\s*```/m.test(joined)) return 'code';
    const nonBlank = lines.filter((l) => l.trim() !== '');
    if (nonBlank.length > 0 && nonBlank.every((l) => l.trimStart().startsWith('>'))) return 'quote';
    if (nonBlank.length === 1 && /^!\[.*\]\(.*\)\s*$/.test(nonBlank[0]?.trim() ?? '')) return 'image';
  }
  return 'text';
}

/**
 * Parse one screen's lines into panels. Markers and the title
 * are consumed by the caller; this walks the remaining blocks
 * in document order (§2.5). Nested lists stay inside their
 * parent panel (§2.6).
 */
function parsePanels(lines: string[]): Panel[] {
  const panels: Panel[] = [];
  let i = 0;
  const push = (block: Block, kindLines: string[]) => {
    const text = block.text;
    panels.push({ kind: panelKindFor(kindLines, block.type), blocks: [block], classNames: [], text });
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed === '') {
      i++;
      continue;
    }
    if (COMMENT_LINE.test(line)) {
      // An HTML comment that is not a top-of-screen marker is ignored (§4.1).
      i++;
      continue;
    }
    if (/^```/.test(trimmed)) {
      const fenceLines = [line];
      i++;
      while (i < lines.length && (lines[i] ?? '').trim() !== '```') {
        fenceLines.push(lines[i] ?? '');
        i++;
      }
      if (i < lines.length) {
        fenceLines.push(lines[i] ?? '');
        i++;
      }
      push(makeBlock('code', fenceLines.join('\n')), fenceLines);
      continue;
    }
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quoteLines.push(lines[i] ?? '');
        i++;
      }
      push(makeBlock('quote', quoteLines.join('\n')), quoteLines);
      continue;
    }
    const listMatch = LIST_MARKER.exec(trimmed);
    if (listMatch && indentOf(line) === 0) {
      // One top-level list item: its lines plus indented
      // continuation / nested-list lines (§2.6).
      const itemLines: string[] = [];
      const markerWidth = listMatch[0].length;
      // The first line's marker is stripped: the panel holds the
      // item's content, not a one-item list.
      itemLines.push(line.slice(indentOf(line) + markerWidth).trimStart());
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (next.trim() === '') {
          // A blank line ends the item unless an indented line follows.
          const after = lines[i + 1];
          if (after !== undefined && after.trim() !== '' && indentOf(after) > 0) {
            i++;
            continue;
          }
          break;
        }
        if (indentOf(next) > 0) {
          itemLines.push(next);
          i++;
        } else {
          break;
        }
      }
      // Dedent: the item's content was indented under its marker.
      const dedented = itemLines.map((l) => l.replace(/^  /, ''));
      const markdown = dedented.join('\n');
      push(makeBlock('list', markdown), itemLines);
      continue;
    }
    if (/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.test(trimmed)) {
      push(makeBlock('image', trimmed), [line]);
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      push(makeBlock('heading', trimmed), [line]);
      i++;
      continue;
    }
    // Paragraph: consecutive lines until a blank line or another block.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      const nt = next.trim();
      if (
        nt === '' ||
        /^```/.test(nt) ||
        /^(#{1,6})\s+/.test(nt) ||
        nt.startsWith('>') ||
        COMMENT_LINE.test(next) ||
        (LIST_MARKER.test(nt) && indentOf(next) === 0) ||
        /^!\[.*\]\(.*\)$/.test(nt)
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    push(makeBlock('paragraph', para.join('\n')), para);
  }
  return panels;
}

function resolveReveal(
  deckDefaults: DeckDefaults,
  sectionParams: SectionParams | undefined,
  marker: ScreenMarker | undefined,
  panelCount: number,
): Reveal {
  const mode =
    marker?.mode ??
    (marker?.hasRevealParams ? 'step' : undefined) ??
    sectionParams?.mode ??
    deckDefaults.mode ??
    'all';
  const effect = marker?.effect ?? sectionParams?.effect ?? deckDefaults.effect ?? 'fade-in';
  const durationMs = Math.min(
    DURATION_MAX_MS,
    Math.max(DURATION_MIN_MS, marker?.durationMs ?? sectionParams?.durationMs ?? deckDefaults.durationMs ?? DURATION_DEFAULT_MS),
  );
  let sequence = Array.from({ length: panelCount }, (_v, i) => i);
  if (marker?.sequence) {
    const wanted = marker.sequence.map((n) => n - 1);
    const valid =
      wanted.length === panelCount &&
      new Set(wanted).size === panelCount &&
      wanted.every((n) => n >= 0 && n < panelCount);
    if (valid) sequence = wanted; // an invalid sequence is ignored in full (§4.2)
  }
  return { mode, sequence, effect, durationMs };
}

/** A deck that parses to zero screens is an empty deck (§3.3) — the renderer surfaces it, the parser does not crash. */
export function isEmptyDeck(deck: Deck): boolean {
  return deck.sections.every((s) => s.screens.length === 0);
}

export function parseDeck(text: string): Deck {
  const allLines = text.split('\n');
  const { frontmatter, rest } = parseFrontmatter(allLines);
  const { styles, lines } = extractInlineCss(rest);
  const screenLineGroups = splitScreens(lines);

  const sections: Section[] = [];
  let current: Section = { classNames: [], screens: [] };
  let currentParams: SectionParams = { classNames: [] };
  let firstHeading: string | undefined;

  for (const group of screenLineGroups) {
    // Top-of-screen markers: section + reveal, before any content (§2.4, §4.1).
    let idx = 0;
    let sectionMarker: SectionMarker | undefined;
    let revealMarker: ScreenMarker | undefined;
    while (idx < group.length) {
      const line = group[idx] ?? '';
      if (line.trim() === '') {
        idx++;
        continue;
      }
      const comment = COMMENT_LINE.exec(line);
      if (!comment) break; // content begins — markers after this are ignored
      const inside = (comment[1] ?? '').trim();
      if (/^section\s*:/i.test(inside)) {
        const parsed = parseSectionMarker(inside);
        if (parsed) sectionMarker = parsed; // a second marker wins (§2.4)
      } else if (/^reveal\s*:/i.test(inside)) {
        // At most one reveal marker per screen; the first wins (§4.1).
        if (revealMarker === undefined) {
          revealMarker = parseRevealMarker(inside);
        }
      }
      // Any other comment is ignored; it does not end the marker scan.
      idx++;
    }
    const contentLines = group.slice(idx);

    // Screen title: the first `#` / `##` heading, removed from the panel flow (§2.3).
    let title: string | undefined;
    const titleAt = contentLines.findIndex((l) => /^#{1,2}\s+\S/.test(l.trim()));
    const panelLines = [...contentLines];
    if (titleAt !== -1) {
      const headingLine = panelLines[titleAt] ?? '';
      title = plainText(headingLine.replace(/^#{1,2}\s+/, ''));
      if (firstHeading === undefined && /^#\s+\S/.test(headingLine.trim())) {
        firstHeading = title;
      }
      panelLines.splice(titleAt, 1);
    }

    const panels = parsePanels(panelLines);
    if (panels.length === 0) continue; // an empty screen is dropped, not rendered blank (§1.1)

    if (sectionMarker) {
      if (current.screens.length === 0) {
        // Later marker wins; the earlier empty Section is dropped (§2.4).
        current.title = sectionMarker.title;
        current.classNames = sectionMarker.params.classNames;
        currentParams = sectionMarker.params;
      } else {
        sections.push(current);
        current = { title: sectionMarker.title, classNames: sectionMarker.params.classNames, screens: [] };
        currentParams = sectionMarker.params;
      }
    }

    const reveal = resolveReveal(frontmatter.defaults, currentParams, revealMarker, panels.length);
    const panelClassNames = revealMarker?.panelClassNames ?? [];
    for (const panel of panels) panel.classNames = [...panelClassNames];
    const screen: Screen = {
      ...(title !== undefined ? { title } : {}),
      panels,
      reveal,
      classNames: revealMarker?.classNames ?? [],
    };
    current.screens.push(screen);
  }
  if (current.screens.length > 0) sections.push(current);

  return {
    ...(frontmatter.title ?? firstHeading !== undefined
      ? { title: frontmatter.title ?? firstHeading }
      : {}),
    ...(frontmatter.author !== undefined ? { author: frontmatter.author } : {}),
    theme: frontmatter.theme,
    stylesheets: frontmatter.stylesheets,
    styles,
    sections,
  };
}
