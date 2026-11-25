/**
 * Deck model — spec §1.1. The model is the contract between
 * parser, layout engine, and renderer. The parser produces it
 * fully resolved (reveal settings computed, steps derived);
 * the renderer must not re-resolve defaults.
 */

export type RevealEffect = 'fade-in' | 'slide-in' | 'none';
export type RevealMode = 'step' | 'all';
export type Theme = 'light' | 'dark';
export type PanelKind = 'text' | 'image' | 'code' | 'quote';

/** A fully resolved reveal setting for one screen (spec §4.3). */
export interface Reveal {
  /** 'all' = everything visible on arrival (1 step); 'step' = one panel per step. */
  mode: RevealMode;
  /** Reveal order, as 0-based panel indices. Document order when no sequence is given. */
  sequence: number[];
  effect: RevealEffect;
  /** Enter animation duration, milliseconds, clamped to 0–2000. */
  durationMs: number;
}

/** One block of content inside a panel (spec §2.5). */
export type BlockType = 'paragraph' | 'list' | 'code' | 'image' | 'quote' | 'heading';

export interface Block {
  type: BlockType;
  /** Raw Markdown for this block (nested lists kept verbatim). */
  markdown: string;
  /** Rendered HTML for this block. */
  html: string;
  /** Plain text of the block, for layout estimation (content length). */
  text: string;
}

export interface Panel {
  kind: PanelKind;
  blocks: Block[];
  /** Class names from the screen marker's `panel-class:` (§4.2) — every panel on the screen carries them. */
  classNames: string[];
  /** Plain text of the whole panel, for layout estimation. */
  text: string;
}

export interface Screen {
  /** First `#` / `##` heading, if any; removed from the panel flow (§2.3). */
  title?: string;
  panels: Panel[];
  /** Fully resolved reveal settings (§4.3). */
  reveal: Reveal;
  /** Class names from the reveal marker's `class:` (§4.2). */
  classNames: string[];
}

export interface Section {
  /** Absent for the single unnamed Section of a deck with no markers (§2.4). */
  title?: string;
  classNames: string[];
  screens: Screen[];
}

export interface Deck {
  title?: string;
  author?: string;
  theme: Theme;
  /** External stylesheets from frontmatter (§2.1), in load order. The parser records them; the renderer fetches them (§11.4). */
  stylesheets: string[];
  /** Inline CSS block (§2.8), '' when the deck has none. */
  styles: string;
  sections: Section[];
}

/** The entire walk state (spec §1.2): two numbers plus a zoom level. */
export interface WalkState {
  /** 0-based, over the deck's screens in flat order. */
  screenIndex: number;
  /** 0-based, over the steps of the current screen. */
  stepIndex: number;
  /** Reader's type zoom in steps from default; 0 = default (§7.3). */
  zoom: number;
}

/** Input to the layout engine (spec §7.2). */
export interface LayoutInput {
  /** Container width in CSS px — the element the deck is mounted in, not necessarily the window. */
  containerWidth: number;
  /** Container height in CSS px. */
  containerHeight: number;
  /** Number of panels on the screen. */
  panelCount: number;
  /** Plain-text length (characters) of each panel, in document order. */
  contentLengths: number[];
  /** Zoom steps from default (default 0). */
  zoom?: number;
  theme?: Theme;
}

/** Output of the layout engine: CSS variables + column count (§7.2). */
export interface LayoutResult {
  columns: number;
  rows: number;
  /** Computed type sizes in px, after clamp and zoom. */
  fontBodyPx: number;
  fontTitlePx: number;
  fontCodePx: number;
  fontSmallPx: number;
  gapPanelPx: number;
  padPanelPx: number;
  /** True when the screen's content at minimum readable size exceeds the container height — the screen scrolls internally (§7.4). */
  scroll: boolean;
  /** CSS variables to set on `.wd-deck` (incl. `--wd-cols` and the settled theme tokens). */
  vars: Record<string, string>;
}
