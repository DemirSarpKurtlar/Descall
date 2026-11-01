#!/usr/bin/env node
/**
 * i18n gate. Two checks, both run by src/i18n/i18nCoverage.selftest.mjs on every PR:
 *
 * 1. Catalog coverage. The source list is every English nested path, every phrase key
 *    of every catalog and every static t("...") key in the code. Each LIVE locale must
 *    translate all of it (100 %), with the same {placeholders} as English and well
 *    formed plural / select messages. Draft locales only get a coverage report.
 *
 * 2. Hard-coded text ratchet. User-visible text written straight into code cannot be
 *    translated. scripts/i18n-hardcoded-baseline.json holds today's count per file;
 *    a file may go down, never up, and a new file must have none. Lower the baseline
 *    with --update-baseline after moving text into the catalog.
 *
 *   node scripts/i18n-check.mjs                 report + exit 1 on failure
 *   node scripts/i18n-check.mjs --missing=de    list untranslated source strings for a locale
 *   node scripts/i18n-check.mjs --update-baseline
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src");
const BASELINE_PATH = join(root, "scripts", "i18n-hardcoded-baseline.json");

const registry = JSON.parse(readFileSync(join(SRC, "i18n", "locales.json"), "utf8"));

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

const isTestFile = (p) => /\.(selftest|test|spec|e2e)\.(mjs|cjs|js|jsx)$/.test(p) || /\.e2e\.cjs$/.test(p);

export function leaves(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else if (v && typeof v === "object") leaves(v, key, out);
  }
  return out;
}

/**
 * App catalog per locale, plus the marketing site's phrase layer
 * (src/site/marketingPhrases.<id>.js) because site pages translate through it.
 */
export async function loadCatalogs() {
  const out = {};
  for (const l of registry.locales) {
    const mod = await import(pathToFileURL(join(SRC, "i18n", "locales", `${l.id}.js`)).href);
    const cat = mod.default || mod;
    let marketing = {};
    try {
      const mk = await import(pathToFileURL(join(SRC, "site", `marketingPhrases.${l.id}.js`)).href);
      marketing = mk.default || Object.values(mk).find((v) => v && typeof v === "object") || {};
    } catch {
      /* no marketing layer for this locale */
    }
    out[l.id] = { nested: cat.nested || {}, phrases: cat.phrases || {}, marketing };
  }
  return out;
}

function unquote(q, body) {
  if (q === "`") return body;
  try {
    return JSON.parse(`"${body.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"')}"`);
  } catch {
    return body;
  }
}

/** Static keys passed to t(), tRuntime(), translate(locale, ...) and *Key props. */
export function extractCodeKeys() {
  const files = walk(SRC, (p) => /\.(jsx?|mjs)$/.test(p) && !isTestFile(p) && !p.includes(`${join("i18n", "locales")}`));
  const keys = new Map();
  const call = /(?<![\w.$])(?:t|tRuntime|tr|translate\(\s*[\w.]+\s*,)\s*\(?\s*(["'`])((?:\\.|(?!\1)[^\\])*?)\1\s*[,)]/g;
  const keyProp = /\b\w*(?:labelKey|hintKey|titleKey|textKey|descKey|bodyKey|i18nKey|messageKey|placeholderKey)\s*[:=]\s*\{?\s*(["'])([\w.-]+)\1/g;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file).split("\\").join("/");
    let m;
    call.lastIndex = 0;
    while ((m = call.exec(text))) {
      if (m[1] === "`" && m[2].includes("${")) continue;
      const k = unquote(m[1], m[2]);
      if (!k || !/[A-Za-z\u00C0-\u024F]/.test(k)) continue;
      if (!keys.has(k)) keys.set(k, rel);
    }
    keyProp.lastIndex = 0;
    while ((m = keyProp.exec(text))) {
      if (!keys.has(m[2])) keys.set(m[2], rel);
    }
  }
  return keys;
}

const getByPath = (obj, path) => {
  let cur = obj;
  for (const p of String(path).split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
};

/** Translation of a source key in a catalog, or undefined (mirrors translate()). */
export function lookup(cat, enCat, key) {
  const nested = getByPath(cat.nested, key);
  if (nested != null) return nested;
  if (cat.phrases[key] != null) return cat.phrases[key];
  const enNested = getByPath(enCat.nested, key);
  if (enNested != null && cat.phrases[enNested] != null) return cat.phrases[enNested];
  if (cat.marketing && cat.marketing[key] != null) return cat.marketing[key];
  return undefined;
}

/** English text of a source key. */
function englishOf(enCat, key) {
  return getByPath(enCat.nested, key) ?? enCat.phrases[key] ?? key;
}

/**
 * Source list: English nested paths + every catalog's phrase keys + code keys that are
 * not nested paths. A code key that is an English nested path is already covered.
 */
export function sourceKeys(catalogs, codeKeys) {
  const en = catalogs[registry.fallback];
  const set = new Set(leaves(en.nested).keys());
  for (const cat of Object.values(catalogs)) {
    for (const k of Object.keys(cat.phrases)) set.add(k);
    for (const k of Object.keys(cat.marketing || {})) set.add(k);
  }
  for (const k of codeKeys.keys()) {
    if (getByPath(en.nested, k) != null) continue;
    // A dotted identifier that is not an English path is a missing nested key.
    set.add(k);
  }
  return [...set].sort();
}

const CASE_VARIANT = /(?:Nom|Gen|Dat|Acc|Loc|Abl|Ins|Poss)$/;

export async function checkCoverage({ messageLib } = {}) {
  const { messageArguments, isWellFormedMessage } =
    messageLib || (await import(pathToFileURL(join(SRC, "i18n", "message.js")).href));
  const catalogs = await loadCatalogs();
  const codeKeys = extractCodeKeys();
  const keys = sourceKeys(catalogs, codeKeys);
  const en = catalogs[registry.fallback];
  const report = {};
  const errors = [];

  const enMissingPaths = [...codeKeys.keys()].filter(
    (k) => /^[a-z][\w-]*(\.[\w-]+)+$/.test(k) && !/\s/.test(k) && getByPath(en.nested, k) == null && en.phrases[k] == null
  );

  for (const l of registry.locales) {
    if (l.id === registry.fallback) continue;
    const cat = catalogs[l.id];
    const missing = [];
    const placeholder = [];
    const malformed = [];
    for (const k of keys) {
      const v = lookup(cat, en, k);
      if (v == null || v === "") {
        missing.push(k);
        continue;
      }
      if (!isWellFormedMessage(v)) malformed.push(k);
      const want = messageArguments(englishOf(en, k));
      const got = messageArguments(v);
      // Grammatical-case variants the code passes for some languages ({nameGen},
      // {targetAcc}, {timeLoc}) are allowed when the base argument exists in English.
      const extra = [...got].filter((a) => !want.has(a) && !(CASE_VARIANT.test(a) && want.has(a.replace(CASE_VARIANT, ""))));
      if (extra.length) placeholder.push(`${k} -> unknown {${extra.join("}, {")}}`);
    }
    const done = keys.length - missing.length;
    report[l.id] = {
      status: l.status,
      total: keys.length,
      translated: done,
      percent: Math.floor((done / keys.length) * 1000) / 10,
      missing,
      placeholder,
      malformed,
    };
    if (l.status === "live") {
      if (missing.length) errors.push(`${l.id}: ${missing.length} untranslated strings (live locale must be 100 %)`);
      if (placeholder.length) errors.push(`${l.id}: ${placeholder.length} messages use placeholders English does not have`);
      if (malformed.length) errors.push(`${l.id}: ${malformed.length} malformed plural/select messages`);
    }
  }
  if (enMissingPaths.length) {
    errors.push(`en: ${enMissingPaths.length} keys used in code have no English text: ${enMissingPaths.slice(0, 10).join(", ")}`);
  }
  return { keys, report, errors, codeKeys, enMissingPaths };
}

// ---------------------------------------------------------------------------
// Hard-coded text ratchet

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const HARDCODE_ROOTS = ["src", "electron", "backend/lib", "backend/routes", "backend/socket", "backend/games"];

// Lines that only log or throw internally are not user-visible.
const LOG_LINE = /\bconsole\.(log|warn|error|info|debug)\(|\blog(?:ger)?\.(info|warn|error|debug)\(|throw new Error\(/;

// English UI text written straight into code (no Turkish letters, so the line test above
// misses it): JSX text attributes, setError/toast calls and copy-like object fields with at
// least two words, and backend JSON error / message fields.
const WORDS = "[^\"'`{}\\n]*[A-Za-z]{2,}[ ][A-Za-z][^\"'`{}\\n]*";
// Client dates / numbers formatted with the browser locale instead of the UI language.
const BARE_TO_LOCALE = /\.toLocale(?:Date|Time)?String\(\s*\)/;

const ENGLISH_UI = [
  new RegExp(`\\b(?:aria-label|aria-description|title|placeholder|alt|label)=\\s*["'](?:[^"'{}\\n]*[A-Za-z]{2,}[^"'{}\\n]*)["']`),
  new RegExp(`\\b(?:setError|setErr|setStatus|setMessage|setNotice|setHint|showToast|addToast|pushToast|toast(?:\\.\\w+)?|notify|alert|window\\.confirm|confirm)\\(\\s*["'\`]${WORDS}["'\`]`),
  new RegExp(`\\b(?:label|title|placeholder|description|desc|hint|subtitle|message|text|body|caption|tooltip|emptyText|cta|error|reason|detail)\\s*:\\s*["'\`]${WORDS}["'\`]`),
];

// Names and tokens that stay the same in every language.
const UNTRANSLATED_TOKENS = new Set(["Descall", "DesCoin", "GIF", "GIPHY", "Giphy", "Discord", "Windows", "iOS", "macOS", "Android", "iPhone", "iPad", "Apple", "Google", "Steam", "Spotify", "YouTube", "Twitch", "Xbox", "PlayStation", "Inter", "Lucide", "OK", "ID", "URL", "API", "PIN", "2FA", "QR", "HD", "FPS", "VS", "Beta", "BETA", "Pro", "PRO"]);

function isJsxCopy(m) {
  const body = m.slice(1, -1).trim();
  if (!/[A-Za-zÀ-ɏ]{2,}/.test(body)) return false;
  if (/^(?:[=&|?:+\-*/!<>]|=>)/.test(body)) return false;
  if (/&&|\|\||=>|\(\)|;|===|!==|\?\s|\.\w+\(|\b(?:return|const|let|typeof)\b/.test(body)) return false;
  const words = body.split(/\s+/);
  if (words.every((w) => UNTRANSLATED_TOKENS.has(w.replace(/[.,:!?]+$/, "")))) return false;
  return true;
}

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

/**
 * Count user-visible literals per file: string literals with Turkish letters, and
 * JSX text nodes with words outside {t(...)}. Catalog files, tests and dev tooling
 * are excluded.
 */
export function countHardcoded() {
  const counts = {};
  for (const base of HARDCODE_ROOTS) {
    const dir = join(root, base);
    let files = [];
    try {
      files = walk(dir, (p) => /\.(jsx?|mjs|cjs|html)$/.test(p) && !isTestFile(p));
    } catch {
      continue;
    }
    for (const file of files) {
      const rel = relative(root, file).split("\\").join("/");
      if (rel.startsWith("src/i18n/")) continue;
      if (/\/(node_modules|scripts|test|fixtures)\//.test(rel)) continue;
      if (/(^|\/)marketingPhrases\.[\w-]+\.js$/.test(rel)) continue; // a catalog
      if (rel.startsWith("src/site/i18n/")) continue; // site catalogs (scripts/site-i18n.mjs)
      if (rel.startsWith("src/legal/content/")) continue; // translated legal documents (one file per locale)
      const code = stripComments(readFileSync(file, "utf8"));
      let n = 0;
      for (const line of code.split("\n")) {
        if (LOG_LINE.test(line)) continue;
        const lits = line.match(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g) || [];
        if (lits.some((s) => TR_CHARS.test(s))) {
          n += 1;
          continue;
        }
        if (ENGLISH_UI.some((re) => re.test(line)) || (rel.startsWith("src/") && BARE_TO_LOCALE.test(line))) n += 1;
      }
      if (/\.jsx$/.test(rel)) {
        const jsxText = code.match(/>\s*([A-Za-zÀ-ɏ][^<>{}\n]{1,}?)\s*</g) || [];
        n += jsxText.filter(isJsxCopy).length;
      }
      if (n) counts[rel] = n;
    }
  }
  return counts;
}

export function checkHardcoded() {
  const counts = countHardcoded();
  let baseline = {};
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")).files || {};
  } catch {
    /* no baseline yet */
  }
  const errors = [];
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file] || 0;
    if (n > allowed) {
      errors.push(`${file}: ${n} hard-coded user-visible strings (baseline ${allowed}). Use t() and add the text to the catalogs.`);
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, baseline, errors, total };
}

export function writeBaseline(counts) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(sorted).reduce((a, b) => a + b, 0);
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        _doc: "Hard-coded user-visible strings per file (scripts/i18n-check.mjs). Counts may only go down. After moving text into the catalogs run: node scripts/i18n-check.mjs --update-baseline",
        total,
        files: sorted,
      },
      null,
      2
    )}\n`
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  if (args["update-baseline"]) {
    // Lowers allowances to today's counts. It never raises one: a file over its
    // allowance (or a new file with text) keeps failing until the text moves to the
    // catalogs. --init writes today's counts as they are (first run only).
    const { counts, baseline } = checkHardcoded();
    const next = {};
    for (const [f, n] of Object.entries(counts)) {
      const allowed = args.init ? n : Math.min(n, baseline[f] ?? 0);
      if (allowed > 0) next[f] = allowed;
    }
    writeBaseline(next);
    console.log("baseline written");
    return;
  }
  const cov = await checkCoverage();
  if (args.missing) {
    const r = cov.report[args.missing];
    if (!r) throw new Error(`unknown locale ${args.missing}`);
    for (const k of r.missing) console.log(k);
    return;
  }
  console.log(`i18n source strings: ${cov.keys.length}`);
  for (const [id, r] of Object.entries(cov.report)) {
    console.log(`  ${id.padEnd(6)} ${r.status.padEnd(6)} ${String(r.percent).padStart(5)} %  (${r.translated}/${r.total})`);
  }
  const hc = checkHardcoded();
  console.log(`hard-coded user-visible strings: ${hc.total} in ${Object.keys(hc.counts).length} files`);
  const errors = [...cov.errors, ...hc.errors];
  if (errors.length) {
    console.error(`\n${errors.length} i18n problem(s):`);
    for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("i18n check: ok");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
