/**
 * Deck CSS sanitising (spec §2.8, §11.2–§11.3).
 *
 * Deck CSS is presentation only. The renderer MUST ignore
 * `@import` rules and `url()` references to external resources
 * inside the inline CSS block, and deck CSS MUST NOT hide panels
 * or change the step count. This module enforces that where it
 * can, statically, before the CSS is injected into the deck's
 * Shadow DOM:
 *
 * - `@import` rules are dropped (the external stylesheet is the
 *   way to load outside CSS, §11.4).
 * - Any declaration whose value references `url(...)` is dropped,
 *   except `data:` URLs (which are self-contained, not external).
 * - A declaration that would hide an element (`display: none`,
 *   `visibility: hidden|collapse`, `opacity: 0`, zero width or
 *   height) is dropped when the rule's selector could match a
 *   screen or a panel — a `.wd-screen` / `.wd-panel` selector,
 *   or any class the deck itself puts on a screen or panel.
 *   Anything else keeps its hiding declaration: deck CSS may
 *   hide its own decorative elements, it just may not hide a
 *   panel or a screen.
 *
 * Everything else passes through untouched. A dropped rule is
 * logged (console.warn) so the author can see what was removed.
 * Sanitising never throws: on unparseable input it returns ''.
 */

export interface SanitizeOptions {
  /** Class names the deck puts on screens/panels (from `class:` / `panel-class:`). */
  deckClasses?: string[];
}

/** Declarations that hide an element, dropped on screen/panel selectors. */
const HIDING_DECLS: Array<{ prop: RegExp; value: RegExp }> = [
  { prop: /^display$/i, value: /^none$/i },
  { prop: /^visibility$/i, value: /^(hidden|collapse)$/i },
  { prop: /^opacity$/i, value: /^0(\.0*)?$/ },
  { prop: /^(width|height)$/i, value: /^0(px|em|rem|%|vh|vw)?$/i },
  { prop: /^font-size$/i, value: /^0(px|em|rem|%)?$/i },
];

/** True when the declaration's value contains an external url() reference. */
function hasExternalUrl(value: string): boolean {
  // url(data:...) is self-contained; anything else with url( is external.
  return /url\(\s*(?!['"]?data:)/i.test(value);
}

/** Split a declaration block into `prop: value` pairs, keeping order. */
function parseDeclarations(body: string): Array<{ prop: string; value: string }> {
  // Split on ';' only at paren depth 0 and outside quotes: a ';' inside
  // url(data:...;base64,...) is part of the value, not a separator.
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ';' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  const out: Array<{ prop: string; value: string }> = [];
  for (const part of parts) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    out.push({ prop: part.slice(0, i).trim(), value: part.slice(i + 1).trim() });
  }
  return out;
}

/** Split CSS text into top-level rules: `{ selector, body }`, braces matched. */
function splitRules(css: string, warnings: string[]): Array<{ selector: string; body: string }> {
  const rules: Array<{ selector: string; body: string }> = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    // Skip whitespace and comments.
    while (i < n && /\s/.test(css[i] ?? '')) i++;
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (i >= n) break;
    // A ';'-terminated at-rule (@import, @charset) ends before any
    // '{': it is a statement, not a rule — drop it and move on.
    const semi = css.indexOf(';', i);
    const open = css.indexOf('{', i);
    if (open === -1) break;
    if (semi !== -1 && semi < open) {
      const statement = css.slice(i, semi).trim();
      if (statement.startsWith('@')) {
        warnings.push(`dropped "${statement}" (@import is not allowed in deck CSS)`);
        i = semi + 1;
        continue;
      }
    }
    const selector = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < n && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    rules.push({ selector, body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return rules;
}

/** True when the selector could match a screen or a panel of this deck. */
function matchesScreenOrPanel(selector: string, deckClasses: string[]): boolean {
  if (/\.(wd-screen|wd-panel)\b/.test(selector)) return true;
  for (const cls of deckClasses) {
    // Escape for a regex on a class selector.
    const safe = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\.${safe}(?![\\w-])`).test(selector)) return true;
  }
  return false;
}

/**
 * Sanitize one rule's declarations. Returns the cleaned body,
 * or null when the whole rule should be dropped.
 */
function sanitizeDeclarations(
  selector: string,
  body: string,
  deckClasses: string[],
  warnings: string[],
): string | null {
  const guardHiding = matchesScreenOrPanel(selector, deckClasses);
  const kept: string[] = [];
  for (const { prop, value } of parseDeclarations(body)) {
    if (hasExternalUrl(value)) {
      warnings.push(`dropped "${prop}: ${value}" in "${selector}" (external url() is not allowed in deck CSS)`);
      continue;
    }
    if (guardHiding && HIDING_DECLS.some((h) => h.prop.test(prop) && h.value.test(value))) {
      warnings.push(`dropped "${prop}: ${value}" in "${selector}" (deck CSS must not hide a screen or panel)`);
      continue;
    }
    kept.push(`${prop}: ${value}`);
  }
  return kept.length > 0 ? kept.join('; ') : null;
}

/** Sanitize a whole stylesheet. At-rules handled: @media, @font-face, @keyframes pass through (sanitised inside); @import and anything else unknown is dropped. */
export function sanitizeCss(css: string, options: SanitizeOptions = {}): string {
  const deckClasses = options.deckClasses ?? [];
  const warnings: string[] = [];
  const out: string[] = [];
  try {
    for (const { selector, body } of splitRules(css, warnings)) {
      const head = selector.trim();
      if (/^@import\b/i.test(head)) {
        warnings.push(`dropped "${head}" (@import is not allowed in deck CSS)`);
        continue;
      }
      if (/^@(media|supports|layer)\b/i.test(head)) {
        // Recurse into the block, keeping the wrapper.
        const inner = sanitizeCss(body, options);
        if (inner.trim() !== '') out.push(`${head} { ${inner} }`);
        continue;
      }
      if (/^@font-face\b/i.test(head)) {
        const cleaned = sanitizeDeclarations(head, body, deckClasses, warnings);
        if (cleaned !== null) out.push(`${head} { ${cleaned}; }`);
        continue;
      }
      if (/^@keyframes\b/i.test(head)) {
        // Keyframes are animation only; they cannot hide a panel by themselves.
        out.push(`${head} { ${body.trim()} }`);
        continue;
      }
      if (head.startsWith('@')) {
        warnings.push(`dropped "${head}" (unsupported at-rule in deck CSS)`);
        continue;
      }
      const cleaned = sanitizeDeclarations(head, body, deckClasses, warnings);
      if (cleaned !== null) out.push(`${head} { ${cleaned}; }`);
    }
  } catch {
    return '';
  }
  for (const w of warnings) console.warn(`[walkdown] ${w}`);
  return out.join('\n');
}

/** All class names a deck puts on its screens and panels (for the hiding guard). */
export function deckClassesOf(deck: { sections: Array<{ classNames: string[]; screens: Array<{ classNames: string[]; panels: Array<{ classNames: string[] }> }> }> }): string[] {
  const classes = new Set<string>();
  for (const section of deck.sections) {
    for (const c of section.classNames) classes.add(c);
    for (const screen of section.screens) {
      for (const c of screen.classNames) classes.add(c);
      for (const panel of screen.panels) {
        for (const c of panel.classNames) classes.add(c);
      }
    }
  }
  return [...classes];
}
