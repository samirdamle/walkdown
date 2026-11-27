import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Read the demo page. Under the jsdom environment import.meta.url
 * is not a file: URL, so fall back to cwd (same pattern as the
 * fixture reader in element.test.ts).
 */
function demoPage(): string {
  try {
    return readFileSync(fileURLToPath(new URL('../../../demo/index.html', import.meta.url)), 'utf8');
  } catch {
    return readFileSync(resolve(process.cwd(), '../../demo/index.html'), 'utf8');
  }
}

describe('demo page', () => {
  it('declares both colour schemes (§11.2, issue #85)', () => {
    // The meta tells the browser the page supports light and
    // dark, so its canvas and root scrollbars are themed before
    // the deck loads — and it avoids a flash of un-themed
    // content. Exactly one meta: a second one would not change
    // behaviour, but it would be a copy to drift.
    const html = demoPage();
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html.split('name="color-scheme"').length - 1).toBe(1);
  });

  it('opts the demo into per-screen tab titles (§6.2, issue #86)', () => {
    // The demo owns its tab title, so the tab reads
    // "Screen title — Walkdown" as the deck walks. Without the
    // attribute the element never touches the page title; that
    // is the default for embeds.
    expect(demoPage()).toContain('<walkdown-deck src="../examples/walkdown-itself.md" document-title>');
  });
});
