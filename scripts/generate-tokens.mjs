#!/usr/bin/env node
/**
 * Generate the code-side token constants from `policies/design-tokens.json`.
 *
 * The JSON is the single source of truth for token values. This script is
 * the only place that turns JSON into code: it emits
 * `packages/core/src/tokens.generated.ts` (checked in — `npm ci && npm run
 * build` works with no extra step). `tokens.ts` re-exports the generated
 * constants, so every import path in the repo is unchanged.
 *
 * Usage:
 *   npm run tokens          # regenerate the checked-in file
 *   npm run tokens:check    # exit 1 if the checked-in file differs from
 *                           # what the JSON would generate (drift = fail)
 *
 * The script is also importable: `tokens.test.ts` imports `generateTokens`
 * and asserts the checked-in file equals a fresh regeneration, so drift
 * fails the test suite as well as the explicit check.
 *
 * Rules the generator enforces (fail loudly, never silently):
 * - The JSON schema must be `walkdown.design-tokens/v1`, `token_count`
 *   must equal the number of tokens, and token names must be unique.
 * - Every preferred formula the derivation table consumes must parse
 *   (plain number, `Nunit`, `A + B`, `min(A, B)`, `×N`). Anything else
 *   throws — a token edit that the code cannot express is a build
 *   failure, not a silent stale value.
 * - Tokens the code does not consume numerically (`--wd-image-min-size`,
 *   `--wd-code-max-height`, `--wd-safe-area`) are recorded in TOKEN_META
 *   only — listed in NO_NUMERIC_CONSTANT below, with the reason.
 * - Proposal tokens are marked twice: in PROPOSAL_TOKENS, and with a
 *   `// PROPOSAL` comment on every constant they produce. A Proposal
 *   value must never look Settled in generated code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(ROOT, 'policies', 'design-tokens.json');
const OUT_PATH = join(ROOT, 'packages', 'core', 'src', 'tokens.generated.ts');

const SCHEMA = 'walkdown.design-tokens/v1';

/**
 * Tokens whose values the code does not consume as numbers. They still
 * appear in TOKEN_META (the JSON mirror), but no constant is derived —
 * there is nothing to derive them into. If code starts consuming one,
 * remove it from this list and add a derivation entry below.
 */
const NO_NUMERIC_CONSTANT = {
  '--wd-image-min-size': 'not enforced in code (README "at least" rule only)',
  '--wd-code-max-height': 'not consumed in code (no max-height on <pre>)',
  '--wd-safe-area': 'not consumed in code (no safe-area handling yet)',
};

export function loadTokens() {
  const json = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  if (json.schema !== SCHEMA) {
    throw new Error(`design-tokens.json: expected schema ${SCHEMA}, got ${json.schema}`);
  }
  if (json.token_count !== json.tokens.length) {
    throw new Error(
      `design-tokens.json: token_count ${json.token_count} != tokens.length ${json.tokens.length}`,
    );
  }
  const seen = new Set();
  for (const t of json.tokens) {
    if (seen.has(t.name)) throw new Error(`design-tokens.json: duplicate token ${t.name}`);
    seen.add(t.name);
  }
  return json;
}

function num(value, unit) {
  return { kind: 'length', value, unit };
}

/**
 * Parse a preferred formula into a small structure. Supported forms —
 * every form the derivation table below consumes, nothing more:
 *   `×1.1`            → { kind: 'factor', value: 1.1 }
 *   `1.55`            → { kind: 'scalar', value: 1.55 }
 *   `260px` / `45vh`  → { kind: 'length', value, unit }
 *   `3.2vw + 10px`    → { kind: 'sum', terms: [length, length] }
 *   `min(45vh, 420px)`→ { kind: 'min', args: [length, length] }
 * Anything else throws — see the header comment.
 */
export function parseFormula(raw, tokenName) {
  const s = (raw ?? '').trim();
  if (s === '') throw new Error(`${tokenName}: empty formula`);
  let m = s.match(/^×\s*([0-9.]+)$/);
  if (m) return { kind: 'factor', value: Number(m[1]) };
  m = s.match(/^min\((.+),\s*(.+)\)$/);
  if (m) return { kind: 'min', args: [parseTerm(m[1], tokenName), parseTerm(m[2], tokenName)] };
  if (s.includes('+')) {
    const parts = s.split('+').map((p) => p.trim());
    if (parts.length !== 2) throw new Error(`${tokenName}: cannot parse preferred ${JSON.stringify(raw)}`);
    return { kind: 'sum', terms: parts.map((p) => parseTerm(p, tokenName)) };
  }
  return parseTerm(s, tokenName);
}

function parseTerm(s, tokenName) {
  const m = s.match(/^([0-9.]+)(px|vw|vh|ch|%)?$/);
  if (m) return num(Number(m[1]), m[2] ?? 'unitless');
  const n = Number(s);
  if (!Number.isNaN(n)) return { kind: 'scalar', value: n };
  throw new Error(`${tokenName}: cannot parse term ${JSON.stringify(s)}`);
}

function pxValue(token, field) {
  const raw = token[field];
  if (raw === null || raw === undefined) {
    throw new Error(`${token.name}: ${field} is null, but a constant derives from it`);
  }
  const parsed = parseTerm(String(raw).trim(), token.name);
  if (parsed.kind !== 'length' || parsed.unit !== 'px') {
    throw new Error(`${token.name}: ${field} ${JSON.stringify(raw)} is not a px value`);
  }
  return parsed.value;
}

function unitlessValue(token, field) {
  const raw = token[field];
  const parsed = parseFormula(String(raw).trim(), token.name);
  if (parsed.kind === 'scalar') return parsed.value;
  if (parsed.kind === 'length' && parsed.unit === 'unitless') return parsed.value;
  throw new Error(`${token.name}: ${field} ${JSON.stringify(raw)} is not unitless`);
}

/** Split a `Avw + Bpx` / `Avh + Bpx` sum into its two coefficients. */
function vwSum(token, field, unit, clean) {
  const raw = clean ? clean(String(token[field]).trim(), token.name) : String(token[field]).trim();
  const parsed = parseFormula(raw, token.name);
  if (parsed.kind !== 'sum' || parsed.terms.length !== 2) {
    throw new Error(`${token.name}: ${field} ${JSON.stringify(token[field])} is not a two-term sum`);
  }
  const [a, b] = parsed.terms;
  if (a.unit !== unit || b.unit !== 'px') {
    throw new Error(`${token.name}: ${field} terms are not ${unit} + px`);
  }
  return { unitValue: a.value, px: b.value };
}

/**
 * The title preferred carries a `× title factor` annotation
 * (`3.2vw + 10px × title factor`): the factor is applied by the
 * layout engine (`titleFactor`), not by the formula, so the
 * generator strips the annotation — but only that exact one.
 * Any other annotation is an error, never silently dropped.
 */
function stripTitleFactorNote(raw, tokenName) {
  const m = String(raw).match(/^(.*)\s+×\s*(.+?)\s*$/);
  if (!m) return String(raw);
  if (m[2] !== 'title factor') {
    throw new Error(`${tokenName}: unexpected preferred annotation ${JSON.stringify(m[2])}`);
  }
  return m[1];
}

function minPair(token, field) {
  const parsed = parseFormula(String(token[field]).trim(), token.name);
  if (parsed.kind !== 'min' || parsed.args.length !== 2) {
    throw new Error(`${token.name}: ${field} ${JSON.stringify(token[field])} is not min(A, B)`);
  }
  return parsed.args;
}

function jsString(s) {
  return JSON.stringify(s);
}

function metaLine(t) {
  const fields = [
    `property: ${jsString(t.property)}`,
    `status: ${jsString(t.status)}`,
    `min: ${t.min === null ? 'null' : jsString(t.min)}`,
    `preferred: ${t.preferred === null ? 'null' : jsString(t.preferred)}`,
    `max: ${t.max === null ? 'null' : jsString(t.max)}`,
    `units: ${jsString(t.units.join(' / '))}`,
    `settledDate: ${t.settled_date === null ? 'null' : jsString(t.settled_date)}`,
    `settledSource: ${t.settled_source === null ? 'null' : jsString(t.settled_source)}`,
  ];
  return `  ${jsString(t.name)}: { ${fields.join(', ')} },`;
}

/**
 * Derive the named constants from the tokens. One entry per constant
 * family; each line cites the token and the field it reads, so a value
 * change in the JSON is traceable to the constant it moves. The
 * `status` column is the token's status — Proposal constants carry a
 * `// PROPOSAL` comment in the output (see `emit` below).
 */
function derive(tokens) {
  const byName = new Map(tokens.map((t) => [t.name, t]));
  const get = (name) => {
    const t = byName.get(name);
    if (!t) throw new Error(`design-tokens.json: missing token ${name}`);
    return t;
  };
  const out = [];

  const fonts = ['--wd-font-family-body', '--wd-font-family-title', '--wd-font-family-code'].map(get);
  out.push({
    name: 'FONT_FAMILY_BODY',
    value: jsString(fonts[0].preferred),
    comment: `--wd-font-family-body (settled; preferred)`,
  });
  out.push({
    name: 'FONT_FAMILY_TITLE',
    value: jsString(fonts[1].preferred),
    comment: `--wd-font-family-title (settled; preferred)`,
  });
  out.push({
    name: 'FONT_FAMILY_CODE',
    value: jsString(fonts[2].preferred),
    comment: `--wd-font-family-code (settled; preferred)`,
  });

  const colorNames = ['bg', 'panel', 'ink', 'muted', 'border', 'accent'];
  const colorTokens = colorNames.map((key) => get(`--wd-color-${key}`));
  for (const t of colorTokens) {
    if (!t.values || t.values.light === undefined || t.values.dark === undefined) {
      throw new Error(`${t.name}: colour token needs values.light and values.dark`);
    }
  }
  const colorLines = [];
  for (const theme of ['light', 'dark']) {
    colorLines.push(`  ${theme}: {`);
    for (const t of colorTokens) {
      const key = t.name.replace('--wd-color-', '');
      const ratio = t.contrast?.[theme];
      const note = ratio ? ` // ${ratio.ratio} on bg — ${ratio.wcag}` : '';
      colorLines.push(`    ${key}: ${jsString(t.values[theme])},${note}`);
    }
    colorLines.push(`  },`);
  }
  out.push({
    name: 'COLORS',
    type: 'Record<Theme, ColorSet>',
    value: `{\n${colorLines.join('\n')}\n}`,
    comment: `--wd-color-* (settled; values.light/dark; contrast ratios in the JSON)`,
  });

  const scalar = (constName, tokenName, field, parse) => {
    const t = get(tokenName);
    out.push({ name: constName, value: String(parse(t, field)), comment: `${tokenName} (${t.status}; ${field})`, proposal: t.status === 'proposal' });
  };
  const px = (constName, tokenName, field) => scalar(constName, tokenName, field, (t, f) => pxValue(t, f));
  const unitless = (constName, tokenName, field) =>
    scalar(constName, tokenName, field, (t, f) => unitlessValue(t, f));

  px('FONT_FLOOR_PX', '--wd-font-floor', 'min');
  const zoom = get('--wd-zoom-step');
  const zoomFactor = parseFormula(String(zoom.preferred).trim(), zoom.name);
  if (zoomFactor.kind !== 'factor') throw new Error(`--wd-zoom-step: preferred is not ×N`);
  out.push({ name: 'ZOOM_STEP', value: String(zoomFactor.value), comment: `--wd-zoom-step (settled; preferred)` });
  const zoomMax = String(zoom.max).trim();
  const zm = zoomMax.match(/^±\s*([0-9]+)/);
  if (!zm) throw new Error(`--wd-zoom-step: max ${JSON.stringify(zoom.max)} is not ±N steps`);
  out.push({ name: 'ZOOM_MIN_STEPS', value: String(-Number(zm[1])), comment: `--wd-zoom-step (settled; max)` });
  out.push({ name: 'ZOOM_MAX_STEPS', value: zm[1], comment: `--wd-zoom-step (settled; max)` });

  px('FONT_BODY_MAX_PX', '--wd-font-body', 'max');
  const title = get('--wd-font-title');
  const titleSum = vwSum(title, 'preferred', 'vw', stripTitleFactorNote);
  out.push({ name: 'FONT_TITLE_MIN_PX', value: String(pxValue(title, 'min')), comment: `--wd-font-title (${title.status}; min)`, proposal: title.status === 'proposal' });
  out.push({ name: 'FONT_TITLE_VW', value: String(titleSum.unitValue), comment: `--wd-font-title (${title.status}; preferred vw term)`, proposal: title.status === 'proposal' });
  out.push({ name: 'FONT_TITLE_PX', value: String(titleSum.px), comment: `--wd-font-title (${title.status}; preferred px term)`, proposal: title.status === 'proposal' });
  out.push({ name: 'FONT_TITLE_MAX_PX', value: String(pxValue(title, 'max')), comment: `--wd-font-title (${title.status}; max)`, proposal: title.status === 'proposal' });
  const code = get('--wd-font-code');
  const codeSum = vwSum(code, 'preferred', 'vw');
  out.push({ name: 'FONT_CODE_MIN_PX', value: String(pxValue(code, 'min')), comment: `--wd-font-code (${code.status}; min)`, proposal: code.status === 'proposal' });
  out.push({ name: 'FONT_CODE_VW', value: String(codeSum.unitValue), comment: `--wd-font-code (${code.status}; preferred vw term)`, proposal: code.status === 'proposal' });
  out.push({ name: 'FONT_CODE_PX', value: String(codeSum.px), comment: `--wd-font-code (${code.status}; preferred px term)`, proposal: code.status === 'proposal' });
  out.push({ name: 'FONT_CODE_MAX_PX', value: String(pxValue(code, 'max')), comment: `--wd-font-code (${code.status}; max)`, proposal: code.status === 'proposal' });
  const small = get('--wd-font-small');
  if (pxValue(small, 'min') !== pxValue(small, 'max')) {
    throw new Error(`--wd-font-small: min != max — the code treats small text as a fixed size`);
  }
  out.push({ name: 'FONT_SMALL_PX', value: String(pxValue(small, 'min')), comment: `--wd-font-small (${small.status}; min = max — fixed size)`, proposal: small.status === 'proposal' });
  unitless('LINE_HEIGHT_BODY', '--wd-line-height-body', 'preferred');
  unitless('LINE_HEIGHT_TITLE', '--wd-line-height-title', 'preferred');

  const clamp = (prefix, tokenName) => {
    const t = get(tokenName);
    const sum = vwSum(t, 'preferred', t.preferred.includes('vh') ? 'vh' : 'vw');
    const unitKey = t.preferred.includes('vh') ? 'VH' : 'VW';
    const prop = t.status === 'proposal';
    out.push({ name: `${prefix}_MIN_PX`, value: String(pxValue(t, 'min')), comment: `${tokenName} (${t.status}; min)`, proposal: prop });
    out.push({ name: `${prefix}_${unitKey}`, value: String(sum.unitValue), comment: `${tokenName} (${t.status}; preferred ${unitKey.toLowerCase()} term)`, proposal: prop });
    out.push({ name: `${prefix}_PX`, value: String(sum.px), comment: `${tokenName} (${t.status}; preferred px term)`, proposal: prop });
    out.push({ name: `${prefix}_MAX_PX`, value: String(pxValue(t, 'max')), comment: `${tokenName} (${t.status}; max)`, proposal: prop });
  };
  clamp('SPACE', '--wd-space');
  clamp('SPACE_SCREEN_X', '--wd-space-screen-x');
  clamp('SPACE_SCREEN_Y', '--wd-space-screen-y');
  clamp('GAP_PANEL', '--wd-gap-panel');
  clamp('GAP_TITLE', '--wd-gap-title');
  clamp('PAD_PANEL', '--wd-pad-panel');
  clamp('RADIUS', '--wd-radius-panel');

  const panelMin = get('--wd-panel-min-width');
  out.push({
    name: 'PANEL_MIN_WIDTH_PX',
    value: String(pxValue(panelMin, 'preferred')),
    comment: `--wd-panel-min-width (${panelMin.status}; preferred — the 240–280px range is settled, the 260px preferred is a proposal)`, proposal: panelMin.status === 'proposal',
  });
  px('CONTENT_MAX_WIDTH_PX', '--wd-content-max-width', 'max');
  const cols = get('--wd-cols-max');
  out.push({ name: 'COLS_MAX', value: String(Number(cols.preferred)), comment: `--wd-cols-max (${cols.status}; preferred)` });
  px('HERO_MAX_WIDTH_PX', '--wd-hero-max-width', 'max');
  const heroH = get('--wd-hero-min-height');
  out.push({ name: 'HERO_MIN_HEIGHT_PX', value: String(pxValue(heroH, 'min')), comment: `--wd-hero-min-height (${heroH.status}; min)` });
  const heroHPref = parseFormula(String(heroH.preferred).trim(), heroH.name);
  if (heroHPref.kind !== 'length' || heroHPref.unit !== 'vh') {
    throw new Error(`--wd-hero-min-height: preferred is not Nvh`);
  }
  out.push({ name: 'HERO_MIN_HEIGHT_VH', value: String(heroHPref.value), comment: `--wd-hero-min-height (${heroH.status}; preferred)` });
  out.push({ name: 'HERO_MAX_HEIGHT_PX', value: String(pxValue(heroH, 'max')), comment: `--wd-hero-min-height (${heroH.status}; max)` });
  const imgMax = get('--wd-image-max-height');
  const [imgVh, imgPx] = minPair(imgMax, 'preferred');
  if (imgVh.unit !== 'vh' || imgPx.unit !== 'px') {
    throw new Error(`--wd-image-max-height: preferred is not min(Nvh, Npx)`);
  }
  out.push({ name: 'IMAGE_MAX_HEIGHT_VH', value: String(imgVh.value), comment: `--wd-image-max-height (${imgMax.status}; preferred vh term)` });
  out.push({ name: 'IMAGE_MAX_HEIGHT_PX', value: String(imgPx.value), comment: `--wd-image-max-height (${imgMax.status}; preferred px term)` });
  const ll = get('--wd-line-length');
  const ch = (field) => {
    const parsed = parseTerm(String(ll[field]).trim(), ll.name);
    if (parsed.kind !== 'length' || parsed.unit !== 'ch') throw new Error(`--wd-line-length: ${field} is not Nch`);
    return parsed.value;
  };
  out.push({ name: 'LINE_LENGTH_MIN_CH', value: String(ch('min')), comment: `--wd-line-length (${ll.status}; min)` });
  out.push({ name: 'LINE_LENGTH_IDEAL_CH', value: String(ch('preferred')), comment: `--wd-line-length (${ll.status}; preferred)` });
  out.push({ name: 'LINE_LENGTH_MAX_CH', value: String(ch('max')), comment: `--wd-line-length (${ll.status}; max)` });
  const llp = get('--wd-line-length-panel');
  out.push({
    name: 'LINE_LENGTH_PANEL_MIN_CH',
    value: String(parseTerm(String(llp.min).trim(), llp.name).value),
    comment: `--wd-line-length-panel (${llp.status}; min)`,
  });

  const nav = get('--wd-nav-menu-max-height');
  const navPair = minPair(nav, 'preferred');
  if (navPair[0].unit !== 'vh' || navPair[1].unit !== 'px') {
    throw new Error(`--wd-nav-menu-max-height: preferred is not min(Nvh, Npx)`);
  }
  out.push({
    name: 'NAV_MENU_MAX_HEIGHT_CSS',
    value: jsString(String(nav.preferred).trim()),
    comment: `--wd-nav-menu-max-height (PROPOSAL; preferred) — Proposal value: change it only by changing the token and re-running npm run tokens`,
    proposal: true,
  });

  for (const name of Object.keys(NO_NUMERIC_CONSTANT)) {
    if (!byName.has(name)) throw new Error(`NO_NUMERIC_CONSTANT lists ${name}, which is not in the JSON`);
  }
  return { tokens, constants: out };
}

export function generateTokens(json) {
  const { tokens, constants } = derive(json.tokens);
  const proposalNames = tokens.filter((t) => t.status === 'proposal').map((t) => t.name);
  const lines = [];
  lines.push(`/**`);
  lines.push(` * GENERATED — DO NOT EDIT BY HAND.`);
  lines.push(` *`);
  lines.push(` * Generated by \`npm run tokens\` (scripts/generate-tokens.mjs) from`);
  lines.push(` * \`policies/design-tokens.json\` (schema ${json.schema}). The JSON is the`);
  lines.push(` * single source of truth: change a value there, re-run \`npm run tokens\`,`);
  lines.push(` * and commit the regenerated file in the same PR. \`tokens.test.ts\``);
  lines.push(` * fails if this file differs from a fresh regeneration.`);
  lines.push(` *`);
  lines.push(` * Proposal tokens are marked twice: they appear in PROPOSAL_TOKENS`);
  lines.push(` * below, and every constant they produce carries a \`// PROPOSAL\``);
  lines.push(` * comment. A Proposal value must never look Settled in this file.`);
  lines.push(` *`);
  lines.push(` * Tokens the code does not consume as numbers appear in TOKEN_META`);
  lines.push(` * only (no constant is derived from them):`);
  for (const [name, reason] of Object.entries(NO_NUMERIC_CONSTANT)) {
  lines.push(` *   - ${name}: ${reason}.`);
  }
  lines.push(` */`);
  lines.push(`import type { Theme } from './types.js';`);
  lines.push(``);
  lines.push(`/** The six colour slots of one theme. */`);
  lines.push(`export interface ColorSet {`);
  lines.push(`  bg: string;`);
  lines.push(`  panel: string;`);
  lines.push(`  ink: string;`);
  lines.push(`  muted: string;`);
  lines.push(`  border: string;`);
  lines.push(`  accent: string;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`/** Every token in the JSON, as written — the machine-readable mirror. */`);
  lines.push(`export const TOKEN_META = {`);
  for (const t of tokens) lines.push(metaLine(t));
  lines.push(`} as const;`);
  lines.push(``);
  lines.push(`/** Names of the Proposal tokens — Settled tokens are never in this list. */`);
  lines.push(`export const PROPOSAL_TOKENS: readonly string[] = [`);
  for (const name of proposalNames) lines.push(`  ${jsString(name)},`);
  lines.push(`];`);
  lines.push(``);
  lines.push(`/** Named constants derived from the tokens (see the derivation table in scripts/generate-tokens.mjs). */`);
  for (const c of constants) {
    const type = c.type ? `: ${c.type}` : '';
    const prefix = c.proposal ? `// PROPOSAL — ` : `// `;
    lines.push(`${prefix}${c.comment}`);
    lines.push(`export const ${c.name}${type} = ${c.value};`);
  }
  return lines.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const json = loadTokens();
  const generated = generateTokens(json);
  if (check) {
    const current = readFileSync(OUT_PATH, 'utf8');
    if (current !== generated) {
      console.error(`tokens.generated.ts is stale: run \`npm run tokens\` to regenerate it from policies/design-tokens.json.`);
      process.exit(1);
    }
    console.log('tokens.generated.ts is up to date.');
    return;
  }
  writeFileSync(OUT_PATH, generated);
  console.log(`wrote ${OUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
