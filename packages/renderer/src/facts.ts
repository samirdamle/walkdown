/**
 * Derived deck facts — the numbers the renderer re-derives at
 * every call site (spec §1.2–§1.3, §6.6).
 *
 * A `DeckFacts` is built once per loaded deck and answers every
 * "where are we in the deck" question from precomputed tables:
 * the flat screen list, the total step count, the steps before
 * each screen, and which Section each screen belongs to. The
 * element holds one per deck (rebuilt in `loadDeck`); nothing
 * else recomputes these. Pure: no DOM, no state of its own
 * beyond the deck it was built from.
 */
import { flatScreens, stepsForScreen, totalSteps } from '@walkdown/core';
import type { Deck, Screen, Section, WalkState } from '@walkdown/core';

/** Progress in steps (§1.3): steps count, not screens. */
export interface DeckProgress {
  /** 1-based step the reader is on. */
  current: number;
  /** Steps in the whole deck. */
  total: number;
}

export class DeckFacts {
  /** The deck's screens in flat order (§1.2). */
  readonly screens: Screen[];
  /** The deck's Sections, in deck order. */
  readonly sections: Section[];
  /** Total steps in the deck (§1.3). */
  readonly totalSteps: number;
  /** Steps before each screen, by flat screen index. */
  private readonly _stepsBefore: number[];
  /** Section index of each screen, by flat screen index (-1 when none). */
  private readonly _sectionOfScreen: number[];

  constructor(deck: Deck) {
    this.screens = flatScreens(deck);
    this.sections = deck.sections;
    this.totalSteps = totalSteps(deck);
    this._stepsBefore = [];
    let acc = 0;
    for (const screen of this.screens) {
      this._stepsBefore.push(acc);
      acc += stepsForScreen(screen);
    }
    this._sectionOfScreen = this.screens.map((screen) =>
      deck.sections.findIndex((s) => s.screens.includes(screen)),
    );
  }

  /** The screen at a flat index, or undefined. */
  screen(index: number): Screen | undefined {
    return this.screens[index];
  }

  /** Steps before the screen at a flat index. */
  stepsBefore(screenIndex: number): number {
    return this._stepsBefore[screenIndex] ?? 0;
  }

  /** The Section a screen belongs to, or undefined. */
  sectionOfScreen(screenIndex: number): Section | undefined {
    const sectionIndex = this._sectionOfScreen[screenIndex];
    return sectionIndex === undefined || sectionIndex < 0 ? undefined : this.sections[sectionIndex];
  }

  /** The index of the Section a screen belongs to, or -1. */
  sectionIndexOfScreen(screenIndex: number): number {
    return this._sectionOfScreen[screenIndex] ?? -1;
  }

  /** Progress in steps for a walk state (§1.3). */
  progress(state: WalkState): DeckProgress {
    return {
      current: this.stepsBefore(state.screenIndex) + state.stepIndex + 1,
      total: this.totalSteps,
    };
  }

  /** At the very first step of the first screen. */
  isAtStart(state: WalkState): boolean {
    return state.screenIndex === 0 && state.stepIndex === 0;
  }

  /** At the very last step of the last screen. */
  isAtEnd(state: WalkState): boolean {
    const last = this.screens[this.screens.length - 1];
    return (
      last !== undefined &&
      state.screenIndex === this.screens.length - 1 &&
      state.stepIndex === stepsForScreen(last) - 1
    );
  }
}
