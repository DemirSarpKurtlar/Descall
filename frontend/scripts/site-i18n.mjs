#!/usr/bin/env node
/**
 * Translation round trip for the prefixed site languages (de, es, fr, pt-BR, ru, ...).
 *
 *   node scripts/site-i18n.mjs export
 *       Collect every English string the mirrored pages ask for and write, per locale,
 *       /tmp/site-i18n/<id>/en.json      every string with its index
 *       /tmp/site-i18n/<id>/part-001.json ... strings with no translation yet (<= 250 rows)
 *       /tmp/site-i18n/<id>/reused.json  strings the app catalog already translates
 *   node scripts/site-i18n.mjs import --locale=<id>
 *       Merge /tmp/site-i18n/<id>/out-*.json ([{ i, t }]) into src/site/i18n/<id>.js after
 *       checking placeholders, HTML tags, length limits and empty values.
 *   node scripts/site-i18n.mjs check [--allow-draft]
 *       Coverage per locale; exit 1 when a string has no translation (site catalog or app
 *       catalog). --allow-draft tolerates gaps in SITE_DRAFT_LOCALES (what CI runs).
 *
 * The string list is not maintained by hand. It is recorded while the real code runs:
 * the React pages and the site chrome are rendered with react-dom/server for /<prefix>/*
 * (every t() call is recorded), the prerender builds every mirrored shell (every
 * siteText() lookup is recorded), and the static t("...") keys of the bundled site
 * files are added for text that only shows after an interaction (errors, menus).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);

export const EXPORT_DIR = path.join(os.tmpdir(), "site-i18n");
export const PART_SIZE = 250;
/** Files rendered only in the browser whose t("...") keys the export must include. */
const CLIENT_ONLY_FILES = ["site/CookieConsentBanner.jsx"];
const TITLE_MAX = 70;
const DESCRIPTION_MAX = 170;

const siteLocales = await imp("src/site/siteLocales.js");
const { SITE_DRAFT_LOCALES } = await imp("src/site/siteDraftLocales.js");
const { setSiteTextRecorder, siteLookupSource, siteLookup } = await imp("src/site/siteText.js");
const { localeMirrorRoutes } = await imp("src/site/seoConfig.js");
const { registerSiteCatalogs, readSiteCatalog, siteCatalogFile } = await imp("scripts/siteCatalogs.mjs");

// ---------------------------------------------------------------------------
// Message checks (shared by import and check)

const PLACEHOLDER_RE = /\{\{(\w+)\}\}|\{(\w+)\}/g;
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

export function placeholders(s) {
  return [...String(s).matchAll(PLACEHOLDER_RE)].map((m) => m[1] || m[2]).sort();
}

export function htmlTags(s) {
  return (String(s).match(TAG_RE) || []).map((t) => t.replace(/\s+/g, " ")).sort();
}

/** Problems of one translation, [] when it is fine. */
export function translationProblems(en, t, { max } = {}) {
  const out = [];
  if (typeof t !== "string" || t.trim() === "") return ["empty translation"];
  const a = placeholders(en).join(",");
  const b = placeholders(t).join(",");
  if (a !== b) out.push(`placeholders differ: English {${a}} vs {${b}}`);
  const ta = htmlTags(en).join("");
  const tb = htmlTags(t).join("");
  if (ta !== tb) out.push(`HTML tags differ: English ${ta || "(none)"} vs ${tb || "(none)"}`);
  if (max && t.length > max) out.push(`longer than ${max} characters (${t.length})`);
  return out;
}

export function wordCount(s) {
  return String(s)
    .replace(TAG_RE, " ")
    .replace(PLACEHOLDER_RE, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ---------------------------------------------------------------------------
// Collection

class StringList {
  constructor() {
    this.rows = new Map();
    this.context = "";
  }
  add(en, context = this.context, extra = {}) {
    if (en == null) return;
    const key = String(en);
    if (!key.trim() || !/[\p{L}]/u.test(key)) return;
    // Nested catalog paths ("settings.english") are app keys, never site text.
    if (/^[a-z][\w-]*(\.[\w-]+)+$/.test(key) && !/\s/.test(key)) return;
    const row = this.rows.get(key);
    if (row) {
      if (extra.max && (!row.max || extra.max < row.max)) row.max = extra.max;
      return;
    }
    this.rows.set(key, { en: key, context, ...extra });
  }
  list() {
    return [...this.rows.values()];
  }
}

/** Page components of the mirrored paths, read from MarketingApp.jsx (MIRROR_PAGES + lazy imports). */
function mirrorPageModules() {
  const app = fs.readFileSync(path.join(srcDir, "site/MarketingApp.jsx"), "utf8");
  const lazyFiles = new Map(
    [...app.matchAll(/const (\w+) = lazy\(\(\) => import\("\.\/(pages\/\w+)"\)\);/g)].map((m) => [m[1], m[2]])
  );
  const block = app.match(/const MIRROR_PAGES = \{([\s\S]*?)\};/);
  if (!block) throw new Error("[site-i18n] MIRROR_PAGES not found in MarketingApp.jsx");
  const pages = {};
  for (const m of block[1].matchAll(/"([^"]+)":\s*(\w+)/g)) {
    const file = lazyFiles.get(m[2]);
    if (!file) throw new Error(`[site-i18n] no lazy import for ${m[2]}`);
    pages[m[1]] = { name: m[2], file: path.join(srcDir, "site", `${file}.jsx`) };
  }
  for (const p of siteLocales.SITE_MIRROR_PATHS) {
    if (!pages[p]) throw new Error(`[site-i18n] MIRROR_PAGES has no page for ${p}`);
  }
  return pages;
}

let reactBundle = null;

/** esbuild bundle of the site chrome, the auth modal and every mirrored page (node, SSR). */
async function loadReactBundle() {
  if (reactBundle) return reactBundle;
  const { build } = await import("esbuild");
  const pages = mirrorPageModules();
  const q = (p) => JSON.stringify(p);
  const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import ReactDOM from "react-dom";
import { MemoryRouter } from "react-router-dom";
ReactDOM.createPortal = (children) => children;
import { LocaleContext } from ${q(path.join(srcDir, "context/localeContextInstance.js"))};
import MarketingLayout from ${q(path.join(srcDir, "site/MarketingLayout.jsx"))};
import MarketingAuthModal from ${q(path.join(srcDir, "site/MarketingAuthModal.jsx"))};
${Object.values(pages)
  .map((p) => `import ${p.name} from ${q(p.file)};`)
  .filter((line, i, all) => all.indexOf(line) === i)
  .join("\n")}
const PAGES = { ${Object.entries(pages)
    .map(([k, p]) => `${q(k)}: ${p.name}`)
    .join(", ")} };
function wrap(value, url, child) {
  return h(LocaleContext.Provider, { value }, h(MemoryRouter, { initialEntries: [url] }, child));
}
export function renderPage({ value, url, page }) {
  const Page = PAGES[page];
  return renderToString(wrap(value, url, h(MarketingLayout, {}, page ? h(Page, {}) : null)));
}
export function renderAuth({ value, url, mode }) {
  return renderToString(wrap(value, url, h(MarketingAuthModal, { open: true, initialMode: mode, onClose() {} })));
}
`;
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "site-i18n-bundle-"));
  const outfile = path.join(outDir, "bundle.mjs");
  const result = await build({
    stdin: { contents: entry, resolveDir: srcDir, loader: "jsx" },
    absWorkingDir: root,
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    jsx: "automatic",
    logLevel: "silent",
    metafile: true,
    define: {
      "import.meta.env": JSON.stringify({ BASE_URL: "/", MODE: "production", DEV: false, PROD: true, SSR: true }),
    },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl", ".webp": "dataurl", ".jpg": "dataurl", ".woff2": "empty" },
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    plugins: [
      {
        name: "site-i18n-stubs",
        setup(b) {
          b.onResolve({ filter: /\?(url|raw|worker|inline|worker&url)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default 'stub';", loader: "js" }));
          // import.meta.glob is Vite-only; SSR never needs the browser catalog loader.
          b.onLoad({ filter: /[\\/]site[\\/]loadSiteCatalog\.js$/ }, () => ({
            contents:
              "export function loadSiteCatalog() { return Promise.resolve(true); }\nexport function loadSiteCatalogWithin() { return Promise.resolve(true); }",
            loader: "js",
          }));
        },
      },
    ],
  });
  const mod = await import(pathToFileURL(outfile).href);
  const inputs = Object.keys(result.metafile.inputs)
    .map((p) => path.resolve(root, p))
    .filter((p) => p.startsWith(srcDir) && /\.(jsx?|mjs)$/.test(p) && !p.includes(`${path.sep}i18n${path.sep}`));
  reactBundle = { mod, inputs, pages };
  return reactBundle;
}

const STATIC_T_RE = /(?<![\w.$])t\(\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1\s*[,)]/g;

function staticKeys(file) {
  const src = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of src.matchAll(STATIC_T_RE)) {
    out.push(m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'"));
  }
  return out;
}

function noteFor(en) {
  const notes = [];
  if (placeholders(en).length) notes.push("keep {placeholders} as written");
  if (htmlTags(en).length) notes.push("keep the HTML tags");
  return notes.length ? `; ${notes.join(", ")}` : "";
}

/**
 * Ordered list of { en, context, max? } for one prefixed locale: site chrome first, then
 * per mirrored page its SEO title / description, the React page and the prerendered shell.
 */
export async function collectSiteStrings(locale) {
  const list = new StringList();
  const { mod, inputs } = await loadReactBundle();
  const { injectMeta } = await imp("scripts/prerender-seo.mjs");
  const baseHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const locales = siteLocales
    .siteLocaleIds({ includeDrafts: true })
    .map((id) => ({ id, nativeLabel: siteLocales.localeNativeName(id) }));
  const t = (key, vars) => {
    list.add(key);
    const s = key == null ? "" : String(key);
    if (!vars) return s;
    return s.replace(PLACEHOLDER_RE, (_, a, b) => (vars[a || b] != null ? String(vars[a || b]) : ""));
  };
  const value = { locale, t, setLocale() {}, locales };
  const home = siteLocales.withLocalePrefix("/", locale);
  // react-dom/server warns about layout effects on every render; that is expected here.
  const consoleError = console.error;
  console.error = (...a) => {
    if (/useLayoutEffect does nothing on the server/.test(String(a[0]))) return;
    consoleError(...a);
  };

  setSiteTextRecorder((s, id) => {
    if (id === locale) list.add(s);
  });
  try {
    list.context = "site header and footer";
    mod.renderPage({ value, url: home, page: null });
    for (const mode of ["login", "register"]) {
      list.context = `sign-in / sign-up dialog (${mode})`;
      mod.renderAuth({ value, url: home, mode });
    }
    for (const route of localeMirrorRoutes(locale)) {
      list.add(route.title, `SEO title of ${route.enPath} (max ${TITLE_MAX} characters)`, { max: TITLE_MAX });
      list.add(route.description, `SEO description of ${route.enPath} (max ${DESCRIPTION_MAX} characters)`, {
        max: DESCRIPTION_MAX,
      });
      if (route.h1) list.add(route.h1, `heading of ${route.enPath}`);
      list.context = `page ${route.enPath}`;
      mod.renderPage({ value, url: route.path, page: route.enPath });
      list.context = `page ${route.enPath} (crawler copy)`;
      injectMeta(baseHtml, route);
    }
  } finally {
    setSiteTextRecorder(null);
    console.error = consoleError;
  }

  // Chrome that only mounts in the browser (after consent checks), so the server render
  // above never asks for its strings.
  const clientOnly = CLIENT_ONLY_FILES.map((rel) => path.join(srcDir, rel)).filter((f) => !inputs.includes(f));
  for (const file of [...inputs, ...clientOnly]) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    for (const key of staticKeys(file)) list.add(key, `${rel} (shown after an interaction)`);
  }
  return list.list().map((row) => ({ ...row, context: row.context + noteFor(row.en) }));
}

// ---------------------------------------------------------------------------
// Coverage

/** Coverage of every prefixed locale. `allowDraft` tolerates gaps in SITE_DRAFT_LOCALES. */
export async function checkSiteI18n({
  allowDraft = false,
  locales = siteLocales.PREFIXABLE_LOCALES,
  overrides,
  drafts = SITE_DRAFT_LOCALES,
} = {}) {
  const catalogs = await registerSiteCatalogs({ locales, overrides });
  const report = {};
  const errors = [];
  const warnings = [];
  for (const id of locales) {
    const rows = await collectSiteStrings(id);
    const draft = drafts.includes(id);
    const missing = [];
    let site = 0;
    let app = 0;
    for (const row of rows) {
      const source = siteLookupSource(row.en, id);
      if (source === "site") site += 1;
      else if (source === "app") app += 1;
      else missing.push(row);
    }
    const byEn = new Map(rows.map((r) => [r.en, r]));
    const invalid = [];
    const stale = [];
    for (const [en, tr] of Object.entries(catalogs[id].site)) {
      const row = byEn.get(en);
      if (!row) {
        stale.push(en);
        continue;
      }
      const problems = translationProblems(en, tr, { max: row.max });
      if (problems.length) invalid.push(`${JSON.stringify(en.slice(0, 60))}: ${problems.join("; ")}`);
    }
    // App translations carry the same rules (length limits matter for SEO meta).
    for (const row of rows) {
      if (siteLookupSource(row.en, id) !== "app") continue;
      const problems = translationProblems(row.en, siteLookup(row.en, id), { max: row.max });
      if (problems.length) invalid.push(`${JSON.stringify(row.en.slice(0, 60))} (app catalog): ${problems.join("; ")}`);
    }
    const total = rows.length;
    const done = site + app;
    report[id] = {
      draft,
      total,
      site,
      app,
      missing,
      invalid,
      stale,
      percent: total ? Math.floor((done / total) * 1000) / 10 : 100,
      missingWords: missing.reduce((n, r) => n + wordCount(r.en), 0),
    };
    if (missing.length && !(allowDraft && draft)) {
      errors.push(`${id}: ${missing.length} strings without a translation${draft ? " (site draft)" : ""}`);
    }
    if (invalid.length && !(allowDraft && draft)) {
      errors.push(`${id}: ${invalid.length} translations break placeholders, tags or length limits`);
    }
    // A live page must render from the small site chunk: app-only strings make the
    // browser download the whole app catalog. `bake` copies them over.
    if (app && !draft) {
      errors.push(`${id}: ${app} strings only in the app catalog, run node scripts/site-i18n.mjs bake --locale=${id}`);
    }
    if (invalid.length && allowDraft && draft) warnings.push(`${id}: ${invalid.length} invalid translations (site draft)`);
    if (stale.length) warnings.push(`${id}: ${stale.length} site catalog keys are no longer used`);
  }
  return { report, errors, warnings };
}

// ---------------------------------------------------------------------------
// Export / import

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function exportSiteStrings({ locales = siteLocales.PREFIXABLE_LOCALES, dir = EXPORT_DIR } = {}) {
  await registerSiteCatalogs({ locales });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "README.txt"),
    [
      "Descall marketing site strings, one folder per locale.",
      "",
      "en.json       every string the localized pages use: [{ i, en, context }]",
      "part-NNN.json strings that still need a translation (translate these)",
      "reused.json   strings already translated in the app catalog, for review only;",
      "              to change one, add { i, t } for it to an out file",
      "",
      'Write out-NNN.json next to part-NNN.json: [{ "i": <index>, "t": "<translation>" }].',
      "Keep {placeholders} and HTML tags exactly as in the English; respect the",
      "character limit when the row has \"max\". Then run:",
      "  node scripts/site-i18n.mjs import --locale=<id>",
      "",
    ].join("\n"),
    "utf8"
  );
  const summary = {};
  for (const id of locales) {
    const rows = await collectSiteStrings(id);
    const out = path.join(dir, id);
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(out)) if (/^part-\d+\.json$/.test(f)) fs.rmSync(path.join(out, f));
    const indexed = rows.map((r, i) => ({ i, en: r.en, context: r.context, ...(r.max ? { max: r.max } : {}) }));
    writeJson(path.join(out, "en.json"), indexed);
    const missing = indexed.filter((r) => !siteLookupSource(r.en, id));
    const reused = indexed
      .filter((r) => siteLookupSource(r.en, id) === "app")
      .map((r) => ({ ...r, t: siteLookup(r.en, id) }));
    writeJson(path.join(out, "reused.json"), reused);
    let parts = 0;
    for (let start = 0; start < missing.length; start += PART_SIZE) {
      parts += 1;
      writeJson(path.join(out, `part-${String(parts).padStart(3, "0")}.json`), missing.slice(start, start + PART_SIZE));
    }
    summary[id] = {
      total: indexed.length,
      missing: missing.length,
      missingWords: missing.reduce((n, r) => n + wordCount(r.en), 0),
      reused: reused.length,
      reusedWords: reused.reduce((n, r) => n + wordCount(r.en), 0),
      parts,
      dir: out,
    };
  }
  return summary;
}

const CATALOG_HEADER = (id) => `/**
 * Marketing site catalog for ${id}: English source string -> translation.
 * Written by \`node scripts/site-i18n.mjs import --locale=${id}\` and \`bake\` (sorted
 * keys; bake copies the app-catalog strings the site uses, so the browser renders from
 * this file alone). Lookup order: this file, then the app phrases in
 * src/i18n/locales/${id}.js (loaded only when a lookup misses), then English.
 */
`;

export function formatCatalog(id, entries) {
  const sorted = {};
  for (const k of Object.keys(entries).sort()) sorted[k] = entries[k];
  return `${CATALOG_HEADER(id)}export default ${JSON.stringify(sorted, null, 2)};\n`;
}

export async function importSiteStrings(id, { dir = EXPORT_DIR } = {}) {
  if (!siteLocales.isPrefixedLocale(id)) throw new Error(`[site-i18n] ${id} is not a prefixed site locale`);
  const folder = path.join(dir, id);
  if (!fs.existsSync(folder)) throw new Error(`[site-i18n] ${folder} does not exist, run export first`);
  const files = fs.readdirSync(folder).sort();
  const rows = new Map();
  for (const f of files) {
    if (f === "en.json" || /^part-\d+\.json$/.test(f)) {
      for (const r of JSON.parse(fs.readFileSync(path.join(folder, f), "utf8"))) rows.set(r.i, r);
    }
  }
  const outs = files.filter((f) => /^out-[\w-]+\.json$/.test(f));
  if (!outs.length) throw new Error(`[site-i18n] no out-*.json in ${folder}`);
  const problems = [];
  const next = { ...(await readSiteCatalog(id)) };
  let added = 0;
  for (const f of outs) {
    const data = JSON.parse(fs.readFileSync(path.join(folder, f), "utf8"));
    if (!Array.isArray(data)) {
      problems.push(`${f}: not an array`);
      continue;
    }
    for (const item of data) {
      const row = rows.get(item?.i);
      if (!row) {
        problems.push(`${f}: unknown index ${item?.i}`);
        continue;
      }
      const issues = translationProblems(row.en, item.t, { max: row.max });
      if (issues.length) {
        problems.push(`${f} #${item.i} ${JSON.stringify(row.en.slice(0, 60))}: ${issues.join("; ")}`);
        continue;
      }
      if (next[row.en] !== item.t) added += 1;
      next[row.en] = item.t;
    }
  }
  if (problems.length) return { ok: false, problems, added: 0 };
  fs.writeFileSync(siteCatalogFile(id), formatCatalog(id, next), "utf8");
  return { ok: true, problems, added, total: Object.keys(next).length };
}

/**
 * Copy the app-catalog translations the site uses into the site catalog, so the
 * browser can render a prefixed page from the small site chunk alone (the app
 * catalog is a few hundred KB and only loads when a lookup misses).
 */
export async function bakeSiteStrings(id) {
  if (!siteLocales.isPrefixedLocale(id)) throw new Error(`[site-i18n] ${id} is not a prefixed site locale`);
  await registerSiteCatalogs({ locales: [id] });
  const rows = await collectSiteStrings(id);
  const next = { ...(await readSiteCatalog(id)) };
  let added = 0;
  for (const r of rows) {
    if (siteLookupSource(r.en, id) !== "app") continue;
    next[r.en] = siteLookup(r.en, id);
    added += 1;
  }
  fs.writeFileSync(siteCatalogFile(id), formatCatalog(id, next), "utf8");
  return { added, total: Object.keys(next).length };
}

// ---------------------------------------------------------------------------
// CLI

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = Object.fromEntries(
    rest.map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  if (cmd === "export") {
    const summary = await exportSiteStrings();
    console.log(`site-i18n export -> ${EXPORT_DIR}`);
    for (const [id, s] of Object.entries(summary)) {
      console.log(
        `  ${id.padEnd(6)} ${String(s.missing).padStart(5)} strings / ${String(s.missingWords).padStart(6)} words to translate in ${s.parts} part(s); ` +
          `${s.reused} reused from the app catalog (${s.reusedWords} words); ${s.total} total`
      );
    }
    return;
  }
  if (cmd === "import") {
    if (!args.locale || args.locale === true) throw new Error("usage: site-i18n.mjs import --locale=<id>");
    const res = await importSiteStrings(String(args.locale));
    if (!res.ok) {
      console.error(`site-i18n import ${args.locale}: ${res.problems.length} problem(s), nothing written`);
      for (const p of res.problems.slice(0, 80)) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`site-i18n import ${args.locale}: ${res.added} new or changed, ${res.total} entries in ${path.relative(root, siteCatalogFile(String(args.locale)))}`);
    return;
  }
  if (cmd === "bake") {
    const ids = args.locale && args.locale !== true ? [String(args.locale)] : siteLocales.PREFIXABLE_LOCALES;
    for (const id of ids) {
      const res = await bakeSiteStrings(id);
      console.log(`site-i18n bake ${id}: ${res.added} copied from the app catalog, ${res.total} entries`);
    }
    return;
  }
  if (cmd === "check") {
    const { report, errors, warnings } = await checkSiteI18n({ allowDraft: Boolean(args["allow-draft"]) });
    for (const [id, r] of Object.entries(report)) {
      console.log(
        `  ${id.padEnd(6)} ${r.draft ? "draft" : "live "} ${String(r.percent).padStart(5)} %  (${r.site + r.app}/${r.total}; site ${r.site}, app ${r.app}; missing ${r.missing.length} / ${r.missingWords} words)`
      );
      if (args.missing === id) for (const m of r.missing) console.log(`      ${JSON.stringify(m.en)}  [${m.context}]`);
      for (const inv of r.invalid.slice(0, 20)) console.log(`      invalid: ${inv}`);
    }
    for (const w of warnings) console.warn(`warning: ${w}`);
    if (errors.length) {
      console.error(`\nsite-i18n check: ${errors.length} problem(s)`);
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    console.log("site-i18n check: ok");
    return;
  }
  console.error("usage: node scripts/site-i18n.mjs export | import --locale=<id> | bake [--locale=<id>] | check [--allow-draft] [--missing=<id>]");
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
