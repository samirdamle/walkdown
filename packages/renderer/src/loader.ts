/**
 * External stylesheet loading (spec §11.4). Fetching is the
 * renderer's job, not the parser's (§3.1). Rules:
 *
 * - Relative paths resolve against the deck's URL.
 * - Remote URLs MUST be `https`; an `http:` URL is ignored
 *   (the deck still renders).
 * - Failure degrades, never fails the deck: a stylesheet that
 *   cannot be fetched (404, offline, blocked) is skipped, the
 *   deck renders with the default theme plus whatever did load,
 *   and a console warning is logged. A missing stylesheet MUST
 *   NOT produce a blank deck or an error screen.
 * - Loading never blocks first paint: the caller renders with
 *   the default theme first and applies fetched styles as they
 *   arrive (each stylesheet is applied in listed order as it
 *   resolves; see element.ts).
 */

export interface LoadedStylesheet {
  /** The URL as listed in frontmatter. */
  url: string;
  /** The resolved absolute URL that was fetched. */
  resolved: string;
  css: string;
}

/** True for absolute URLs (scheme present). */
function isAbsolute(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * Resolve a stylesheet URL against the deck's URL.
 * Returns null when the URL must be ignored (an `http:` remote).
 */
export function resolveStylesheetUrl(url: string, deckUrl: string | undefined): string | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;
  if (isAbsolute(trimmed)) {
    // Remote URLs MUST be https (§11.4). protocol-relative and
    // http: are ignored; other schemes (data:, blob:) are ignored too.
    if (/^https:/i.test(trimmed)) return trimmed;
    console.warn(`[walkdown] ignoring stylesheet "${trimmed}" (remote stylesheets must be https)`);
    return null;
  }
  if (deckUrl === undefined) return trimmed;
  try {
    return new URL(trimmed, deckUrl).href;
  } catch {
    console.warn(`[walkdown] ignoring stylesheet "${trimmed}" (cannot resolve against ${deckUrl})`);
    return null;
  }
}

/**
 * Fetch one stylesheet. Returns null (with a warning) on any
 * failure — the caller renders without it.
 */
export async function fetchStylesheet(
  url: string,
  deckUrl: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<LoadedStylesheet | null> {
  const resolved = resolveStylesheetUrl(url, deckUrl);
  if (resolved === null) return null;
  let res: Response;
  try {
    res = await fetchFn(resolved);
  } catch (err) {
    console.warn(`[walkdown] stylesheet "${url}" could not be fetched (${err}); rendering without it`);
    return null;
  }
  if (!res.ok) {
    console.warn(`[walkdown] stylesheet "${url}" returned ${res.status}; rendering without it`);
    return null;
  }
  return { url, resolved, css: await res.text() };
}

/**
 * Fetch all stylesheets in listed order, skipping failures.
 * The returned array keeps listed order among the ones that
 * loaded. Never throws.
 */
export async function loadStylesheets(
  urls: string[],
  deckUrl: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<LoadedStylesheet[]> {
  const loaded: LoadedStylesheet[] = [];
  for (const url of urls) {
    const sheet = await fetchStylesheet(url, deckUrl, fetchFn);
    if (sheet !== null) loaded.push(sheet);
  }
  return loaded;
}
