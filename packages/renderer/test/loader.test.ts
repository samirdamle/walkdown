import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStylesheet, loadStylesheets, resolveStylesheetUrl } from '../src/loader.js';

function okResponse(css: string): Response {
  return new Response(css, { status: 200, headers: { 'Content-Type': 'text/css' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveStylesheetUrl', () => {
  it('resolves relative paths against the deck URL', () => {
    expect(resolveStylesheetUrl('./theme.css', 'https://example.com/decks/a.md')).toBe(
      'https://example.com/decks/theme.css',
    );
  });

  it('keeps https remote URLs', () => {
    expect(resolveStylesheetUrl('https://cdn.example.com/t.css', undefined)).toBe('https://cdn.example.com/t.css');
  });

  it('ignores http remote URLs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStylesheetUrl('http://example.com/t.css', undefined)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('returns a relative URL unchanged when there is no deck URL', () => {
    expect(resolveStylesheetUrl('./theme.css', undefined)).toBe('./theme.css');
  });
});

describe('fetchStylesheet', () => {
  it('fetches and returns the CSS', async () => {
    const fetchMock = vi.fn(async () => okResponse('.a { color: red; }'));
    vi.stubGlobal('fetch', fetchMock);
    const sheet = await fetchStylesheet('./theme.css', 'https://example.com/decks/a.md');
    expect(sheet?.css).toBe('.a { color: red; }');
    expect(sheet?.resolved).toBe('https://example.com/decks/theme.css');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/decks/theme.css');
  });

  it('returns null (with a warning) on a 404 and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const sheet = await fetchStylesheet('./missing.css', 'https://example.com/decks/a.md');
    expect(sheet).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('returns null on a network failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const sheet = await fetchStylesheet('./theme.css', 'https://example.com/decks/a.md');
    expect(sheet).toBeNull();
  });
});

describe('loadStylesheets', () => {
  it('loads in listed order and skips failures', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('a.css')) return okResponse('.a {}');
        if (url.endsWith('b.css')) return new Response('nope', { status: 404 });
        return okResponse('.c {}');
      }),
    );
    const loaded = await loadStylesheets(['./a.css', './b.css', './c.css'], 'https://example.com/decks/d.md');
    expect(loaded.map((s) => s.url)).toEqual(['./a.css', './c.css']);
    expect(loaded.map((s) => s.css)).toEqual(['.a {}', '.c {}']);
  });
});
