/**
 * A hand-rolled Markdown subset (spec §3.2): headings, lists
 * (including nested), emphasis, inline code, fenced code blocks,
 * links, images, blockquotes, thematic breaks. This is the
 * parser choice recorded in README.md — it keeps the core
 * zero-dependency and covers exactly what the spec needs.
 *
 * These functions render Markdown to HTML strings. They run
 * with no DOM (the parser is a pure function, §3.1).
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>');
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
  return markdown.split('\n').map((raw) => {
    const m = /^(\s*)(.*)$/.exec(raw);
    return { indent: (m?.[1] ?? '').replace(/\t/g, '  ').length, text: m?.[2] ?? '' };
  });
}

const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;
const FENCE = /^```(\w*)\s*$/;

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
  const lines = toLines(markdown);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    const text = line.text;
    if (text.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE.exec(text.trim());
    if (fence) {
      const lang = fence[1] ?? '';
      const code: string[] = [];
      i++;
      while (i < lines.length && lines[i]?.text.trim() !== '```') {
        code.push(lines[i]?.text ?? '');
        i++;
      }
      i++; // closing fence
      out.push(
        `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(text);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      i++;
      continue;
    }
    if (text.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i]?.text.startsWith('>') ?? false)) {
        quote.push((lines[i]?.text ?? '').replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderBlocks(quote.join('\n'))}</blockquote>`);
      continue;
    }
    if (LIST_MARKER.test(text)) {
      const { html, next } = renderList(lines, i, line.indent);
      out.push(html);
      i = next;
      continue;
    }
    if (/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.test(text.trim())) {
      out.push(`<p>${renderInline(text.trim())}</p>`);
      i++;
      continue;
    }
    // Paragraph: consecutive non-blank lines that start no other block.
    const para: string[] = [text];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (
        next === undefined ||
        next.text.trim() === '' ||
        FENCE.test(next.text.trim()) ||
        /^(#{1,6})\s+/.test(next.text) ||
        next.text.startsWith('>') ||
        LIST_MARKER.test(next.text)
      ) {
        break;
      }
      para.push(next.text);
      i++;
    }
    out.push(`<p>${renderInline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
