/**
 * A hand-rolled Markdown subset (spec §3.2): headings, lists
 * (including nested), emphasis, inline code, fenced code blocks,
 * links, images, blockquotes, thematic breaks. This is the
 * parser choice recorded in README.md — it keeps the core
 * zero-dependency and covers exactly what the spec needs.
 *
 * These functions render Markdown to HTML strings. They run
 * with no DOM (the parser is a pure function, §3.1).
 *
 * Block classification lives in scan.ts: renderBlocks walks
 * scanner blocks instead of re-testing fence / heading / list
 * regexes over lines. renderList still walks lines — a list
 * item's continuation rules are line-level — but over lines the
 * scanner already grouped into a list run, and it uses the
 * scanner's single LIST_MARKER definition.
 */

import { indentWidth, LIST_MARKER, scanBlocks, stripIndent, type ScannedBlock } from './scan.js';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * URL schemes a Markdown link may use and still become a live
 * `<a href>` (spec §3.2, issue #83). Anything else — `javascript:`,
 * `data:`, `vbscript:`, unknown schemes — renders as plain text.
 * Relative references and fragments have no scheme and are always safe.
 * `tel:` is deliberately NOT here: the allowlist is exactly
 * `http:`/`https:`/`mailto:` plus relative/fragment.
 */
const ALLOWED_LINK_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * Whether a link URL from deck Markdown may become a live link.
 * The check is case-insensitive, and strips the leading C0 controls
 * and spaces browsers strip before parsing — otherwise
 * `\u0001javascript:…` would slip through (WHATWG URL removes
 * leading C0 controls and space, so it would execute as
 * `javascript:`). A URL with no scheme (relative / fragment /
 * protocol-relative) is safe. The URL arrives already HTML-escaped,
 * so an entity-encoded scheme (`javascript&colon;…`) never matches
 * a scheme here and is treated as a relative URL — which is what
 * the browser does with it too, since entities decode only once.
 */
export function isSafeLinkUrl(url: string): boolean {
  const cleaned = url.replace(/^[\u0000-\u0020]+/, '');
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (scheme === null) return true;
  return ALLOWED_LINK_SCHEMES.has((scheme[1] ?? '').toLowerCase());
}

/** Inline Markdown: `code`, **bold**, *italic*, [links](…), ![images](…). */
export function renderInline(text: string): string {
  // Tokenise code spans first so nothing inside them is parsed.
  const codeSpans: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<img alt="$1" src="$2">');
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, text: string, url: string) =>
      // A disallowed scheme renders as plain text (§3.2, issue #83):
      // the link text stays, the URL is dropped, no `<a>` is emitted.
      isSafeLinkUrl(url) ? `<a href="${url}">${text}</a>` : text,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codeSpans[Number(i)] ?? '');
  return out;
}

/** Strip Markdown syntax down to plain text (layout estimation). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>|>-]/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Line {
  indent: number;
  text: string;
}

function toLines(markdown: string): Line[] {
  return markdown.split('\n').map((raw) => ({ indent: indentWidth(raw), text: stripIndent(raw) }));
}

function renderList(lines: Line[], start: number, baseIndent: number): { html: string; next: number } {
  let html = '<ul>';
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.text.trim() === '') break;
    if (line.indent < baseIndent) break;
    const marker = LIST_MARKER.exec(line.text);
    if (line.indent === baseIndent && marker) {
      // One top-level item: its text plus any deeper / continuation lines.
      const itemLines: string[] = [line.text.slice(marker[0].length)];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (next === undefined || next.text.trim() === '') break;
        if (next.indent > baseIndent) {
          itemLines.push(' '.repeat(next.indent - baseIndent) + next.text);
          j++;
        } else if (next.indent === baseIndent && !LIST_MARKER.test(next.text)) {
          // Continuation paragraph of the same item (indented to the marker).
          itemLines.push(next.text);
          j++;
        } else {
          break;
        }
      }
      // Split the item's lines into its own text and a nested list, if any.
      const nestedAt = itemLines.findIndex((l) => LIST_MARKER.test(l.trimStart()));
      const ownText = (nestedAt === -1 ? itemLines : itemLines.slice(0, nestedAt)).join(' ').trim();
      html += `<li>${renderInline(ownText)}`;
      if (nestedAt !== -1) {
        const nestedLines = itemLines.slice(nestedAt).map((l) => {
          const trimmed = l.replace(/^\s+/, '');
          return { indent: l.length - trimmed.length, text: trimmed };
        });
        const nested = renderList(nestedLines, 0, 0);
        html += nested.html;
      }
      html += '</li>';
      i = j;
    } else {
      break;
    }
  }
  html += '</ul>';
  return { html, next: i };
}

/** Block Markdown → HTML. Handles headings, lists (nested), blockquotes, fenced code, images, paragraphs. */
export function renderBlocks(markdown: string): string {
  const blocks = scanBlocks(markdown.split('\n'));
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block === undefined) break;
    if (block.type === 'blank') {
      i++;
      continue;
    }
    if (block.type === 'fence' && block.strictOpen) {
      // Strict fence only (M3): a non-strict ``` line is not a
      // fence here — it falls through to the paragraph below.
      const lang = block.lang ?? '';
      const code: string[] = [];
      i++;
      while (i < blocks.length) {
        const next = blocks[i];
        if (next === undefined) break;
        if (next.type === 'fence' && next.close) {
          i++;
          break;
        }
        for (const line of next.lines) code.push(stripIndent(line));
        i++;
      }
      out.push(
        `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`,
      );
      continue;
    }
    if (block.type === 'heading') {
      const level = block.level ?? 1;
      const text = stripIndent(block.lines[0] ?? '').replace(/^#{1,6}\s+/, '');
      out.push(`<h${level}>${renderInline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (block.type === 'quote') {
      // Consecutive quote blocks are one quote; the scanner
      // split the run only where its indent changes.
      const quoteLines: string[] = [...block.lines];
      i++;
      while (i < blocks.length && blocks[i]?.type === 'quote') {
        quoteLines.push(...(blocks[i]?.lines ?? []));
        i++;
      }
      const stripped = quoteLines.map((l) => stripIndent(l).replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderBlocks(stripped.join('\n'))}</blockquote>`);
      continue;
    }
    if (block.type === 'list-marker') {
      const baseIndent = block.indent ?? 0;
      // The list run: blocks from here while their first line
      // sits at or below the base indent. A blank or a shallower
      // line ends it; renderList consumes the whole run, so the
      // walk advances past the span.
      let j = i;
      const span: ScannedBlock[] = [];
      while (j < blocks.length) {
        const next = blocks[j];
        if (next === undefined || next.type === 'blank') break;
        if (indentWidth(next.lines[0] ?? '') < baseIndent) break;
        span.push(next);
        j++;
      }
      const { html } = renderList(toLines(span.flatMap((b) => b.lines).join('\n')), 0, baseIndent);
      out.push(html);
      i = j;
      continue;
    }
    if (block.type === 'image') {
      out.push(`<p>${renderInline((block.lines[0] ?? '').trim())}</p>`);
      i++;
      continue;
    }
    // Paragraph: consecutive lines that start no other block. A
    // comment, an image, a thematic break, or a non-strict fence
    // line inside it is absorbed; a strict fence, heading, quote,
    // list marker, or blank ends it.
    const para: string[] = [];
    while (i < blocks.length) {
      const next = blocks[i];
      if (next === undefined) break;
      if (
        next.type === 'text' ||
        next.type === 'comment' ||
        next.type === 'image' ||
        next.type === 'thematic-break' ||
        (next.type === 'fence' && !next.strictOpen)
      ) {
        for (const line of next.lines) para.push(stripIndent(line));
        i++;
        continue;
      }
      break;
    }
    out.push(`<p>${renderInline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
