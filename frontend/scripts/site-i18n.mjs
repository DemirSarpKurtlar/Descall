#!/usr/bin/env node
/**
 * Translation round trip for the prefixed site languages (de, es, fr, pt-BR, ru, ...).
 *
 *   node scripts/site-i18n.mjs export
 *       Collect every English string the mirrored pages ask for and write, per locale,
 *       /tmp/site-i18n/<id>/en.json      every string with its index
 *       /tmp/site-i18n/<id>/part-001.json ... strings with no translation yet (<= 120 rows)
 *       /tmp/site-i18n/<id>/reused.json  strings the app catalog already translates
 *       out-*.json files of an earlier round are moved to <id>/stale-out/ first, so an
 *       old translation can never be imported against the new indexes.
 *   node scripts/site-i18n.mjs import --locale=<id>
 *       Merge /tmp/site-i18n/<id>/out-*.json ([{ i, t }]) into src/site/i18n/<id>.js after
 *       checking placeholders, HTML tags, length limits and empty values.
 *   node scripts/site-i18n.mjs check [--allow-draft]
 *       Coverage per locale; exit 1 when a string has no translation (site catalog or app
 *       catalog). --allow-draft tolerates gaps in SITE_DRAFT_LOCALES (what CI runs).
 *       Strings used only by a page group that a locale does not serve yet
 *       (SITE_DRAFT_PAGE_GROUPS) are reported per group and never fail the check.
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
/** Rows per part file; long paragraphs make a smaller part easier to translate in one go. */
export const PART_SIZE = 120;
/** A part also closes once it holds this many English words. */
export const PART_WORDS = 2500;
/** Files rendered only in the browser whose t("...") keys the export must include. */
const CLIENT_ONLY_FILES = ["site/CookieConsentBanner.jsx"];
const TITLE_MAX = 70;
const DESCRIPTION_MAX = 170;

const siteLocales = await imp("src/site/siteLocales.js");
const { SITE_DRAFT_LOCALES, SITE_DRAFT_PAGE_GROUPS } = await imp("src/site/siteDraftLocales.js");
const { BLOG_POSTS, BLOG_FAQ_BY_SLUG, GAMER_FAQ } = await imp("src/site/content/discordSeoContent.js");
const { BLOG_BODIES } = await imp("src/site/seo/blogBodies.js");
const { NICHE_LANDINGS } = await imp("src/site/seo/nicheLandings.js");
const { PAGE_EXTRAS } = await imp("src/site/seo/pageExtras.js");
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

/**
 * Rows in first-seen order. `group` is the page group being rendered (null for the site
 * chrome and SITE_MIRROR_PATHS): a row first seen on a live page stays `groups: null`
 * (always strict); a row only seen on staged pages lists every group that uses it.
 * `hints` gives long-form content a precise context ("blog post x, paragraph 3").
 */
class StringList {
  constructor() {
    this.rows = new Map();
    this.context = "";
    this.group = null;
    this.hints = null;
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
      if (row.groups && this.group && !row.groups.includes(this.group)) row.groups.push(this.group);
      return;
    }
    this.rows.set(key, { en: key, context, ...extra, groups: this.group ? [this.group] : null });
  }
  /** A string a page asked for while rendering (t() or siteText()). */
  record(en) {
    if (en == null) return;
    this.add(en, this.hints?.get(String(en)) ?? this.context);
  }
  list() {
    return [...this.rows.values()];
  }
}

/** Precise contexts for the long-form content of the page groups (blog, niche landings). */
function contentHints() {
  const hints = new Map();
  const put = (en, context) => {
    if (en && !hints.has(String(en))) hints.set(String(en), context);
  };
  for (const post of BLOG_POSTS) {
    const at = `blog post ${post.slug}`;
    put(post.title, `${at}, title`);
    put(post.description, `${at}, summary under the title`);
    for (const tag of post.tags) put(tag, "blog post tag (short label)");
    (BLOG_BODIES[post.slug]?.sections || []).forEach((sec, i) => {
      put(sec.h, `${at}, heading ${i + 1}`);
      put(sec.p, `${at}, paragraph ${i + 1} (under "${sec.h}")`);
    });
    (BLOG_FAQ_BY_SLUG[post.slug] || []).forEach((f, i) => {
      put(f.q, `${at}, FAQ question ${i + 1}`);
      put(f.a, `${at}, FAQ answer ${i + 1}`);
    });
  }
  for (const [p, page] of Object.entries(NICHE_LANDINGS)) {
    const at = `landing page ${p}`;
    put(page.h1, `${at}, title`);
    put(page.kicker, `${at}, short label above the title`);
    put(page.lead, `${at}, intro paragraph`);
    put(page.answerTitle, `${at}, heading 1`);
    put(page.answer, `${at}, paragraph 1 (under "${page.answerTitle}")`);
    page.bullets.forEach((b, i) => put(b, `${at}, checklist item ${i + 1}`));
    page.sections.forEach((sec, i) => {
      put(sec.h, `${at}, heading ${i + 2}`);
      put(sec.p, `${at}, paragraph ${i + 2} (under "${sec.h}")`);
    });
    page.faq.forEach((f, i) => {
      put(f.q, `${at}, FAQ question ${i + 1}`);
      put(f.a, `${at}, FAQ answer ${i + 1}`);
    });
    for (const l of page.related) put(l.label, `${at}, related link`);
  }
  GAMER_FAQ.forEach((f, i) => {
    put(f.q, `landing page /best-discord-alternative-for-gamers, FAQ question ${i + 1}`);
    put(f.a, `landing page /best-discord-alternative-for-gamers, FAQ answer ${i + 1}`);
  });
  for (const p of Object.values(siteLocales.SITE_PAGE_GROUPS).flat()) {
    const extra = PAGE_EXTRAS[p];
    if (!extra) continue;
    extra.sections.forEach((sec, i) => {
      put(sec.h, `page ${p}, extra section heading ${i + 1}`);
      sec.p.forEach((para, j) => put(para, `page ${p}, extra section ${i + 1}, paragraph ${j + 1}`));
      (sec.list || []).forEach((li, j) => put(li, `page ${p}, extra section ${i + 1}, list item ${j + 1}`));
    });
  }
  return hints;
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
  for (const p of siteLocales.ALL_MIRROR_PATHS) {
    if (!pageKey(pages, p)) throw new Error(`[site-i18n] MIRROR_PAGES has no page for ${p}`);
  }
  return pages;
}

/** MIRROR_PAGES key of an English path ("/blog/*" covers every post, as in MarketingApp). */
function pageKey(pages, enPath) {
  if (pages[enPath]) return enPath;
  if (enPath.startsWith("/blog/") && pages["/blog/*"]) return "/blog/*";
  return null;
}

/** Files reachable from `roots` in an esbuild metafile (absolute paths). */
function reachable(metafile, roots) {
  const byAbs = new Map(Object.entries(metafile.inputs).map(([k, v]) => [path.resolve(root, k), v]));
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const imp of byAbs.get(file)?.imports || []) {
      if (!imp.external) queue.push(path.resolve(root, imp.path));
    }
  }
  return seen;
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
  const Page = PAGES[page] || (String(page).startsWith("/blog/") ? PAGES["/blog/*"] : undefined);
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
  const isSource = (p) => p.startsWith(srcDir) && /\.(jsx?|mjs)$/.test(p) && !p.includes(`${path.sep}i18n${path.sep}`);
  // Source files of the live pages (chrome + SITE_MIRROR_PATHS), then the files each page
  // group adds on top: their static t("...") keys are tolerated while the group is staged.
  const coreRoots = [
    path.join(srcDir, "site/MarketingLayout.jsx"),
    path.join(srcDir, "site/MarketingAuthModal.jsx"),
    ...siteLocales.SITE_MIRROR_PATHS.map((p) => pages[pageKey(pages, p)].file),
  ];
  // Bundle order (as esbuild lists the inputs), so the export numbering stays stable.
  const ordered = Object.keys(result.metafile.inputs).map((p) => path.resolve(root, p)).filter(isSource);
  const core = reachable(result.metafile, coreRoots);
  const inputs = ordered.filter((f) => core.has(f));
  const groupInputs = {};
  const claimed = new Set(core);
  for (const [group, paths] of Object.entries(siteLocales.SITE_PAGE_GROUPS)) {
    const files = reachable(result.metafile, paths.map((p) => pages[pageKey(pages, p)].file));
    groupInputs[group] = ordered.filter((f) => files.has(f) && !claimed.has(f));
    for (const f of files) claimed.add(f);
  }
  reactBundle = { mod, inputs, groupInputs, pages };
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
 * Ordered list of { en, context, max?, groups } for one prefixed locale: site chrome first,
 * then per mirrored page its SEO title / description, the React page and the prerendered
 * shell; then the same for every page group (blog, niche), rendered as if served, whatever
 * SITE_DRAFT_PAGE_GROUPS says. `groups` is null for strings a live page uses.
 */
export async function collectSiteStrings(locale) {
  const list = new StringList();
  const { mod, inputs, groupInputs } = await loadReactBundle();
  const { injectMeta } = await imp("scripts/prerender-seo.mjs");
  const baseHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const locales = siteLocales
    .siteLocaleIds({ includeDrafts: true })
    .map((id) => ({ id, nativeLabel: siteLocales.localeNativeName(id) }));
  const t = (key, vars) => {
    list.record(key);
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

  const staticRows = (files) => {
    for (const file of files) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      for (const key of staticKeys(file)) list.add(key, `${rel} (shown after an interaction)`);
    }
  };
  const renderRoutes = (routes) => {
    for (const route of routes) {
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
  };

  setSiteTextRecorder((s, id) => {
    if (id === locale) list.record(s);
  });
  try {
    list.context = "site header and footer";
    mod.renderPage({ value, url: home, page: null });
    for (const mode of ["login", "register"]) {
      list.context = `sign-in / sign-up dialog (${mode})`;
      mod.renderAuth({ value, url: home, mode });
    }
    renderRoutes(localeMirrorRoutes(locale, { paths: siteLocales.SITE_MIRROR_PATHS }));
    // Chrome that only mounts in the browser (after consent checks), so the server render
    // above never asks for its strings.
    const clientOnly = CLIENT_ONLY_FILES.map((rel) => path.join(srcDir, rel)).filter((f) => !inputs.includes(f));
    staticRows([...inputs, ...clientOnly]);

    // Page groups, rendered as they will look once served (links to the other twins,
    // localized extras), whether or not the locale serves them today.
    list.hints = contentHints();
    siteLocales.setPageGroupPreview(true);
    for (const [group, paths] of Object.entries(siteLocales.SITE_PAGE_GROUPS)) {
      list.group = group;
      renderRoutes(localeMirrorRoutes(locale, { paths }));
      staticRows(groupInputs[group] || []);
    }
  } finally {
    siteLocales.setPageGroupPreview(false);
    list.group = null;
    list.hints = null;
    setSiteTextRecorder(null);
    console.error = consoleError;
  }
  return list.list().map((row) => ({ ...row, context: row.context + noteFor(row.en) }));
}

/** True when a missing translation of `row` breaks a page `id` serves today. */
export function rowIsLive(row, id, pageDrafts = SITE_DRAFT_PAGE_GROUPS) {
  return !row.groups || row.groups.some((g) => siteLocales.isPageGroupLive(g, id, pageDrafts));
}

// ---------------------------------------------------------------------------
// Coverage

const percentOf = (done, total) => (total ? Math.floor((done / total) * 1000) / 10 : 100);

/**
 * Coverage of every prefixed locale. `allowDraft` tolerates gaps in SITE_DRAFT_LOCALES.
 * Strings that only staged page groups use (SITE_DRAFT_PAGE_GROUPS, or `pageDrafts`) are
 * counted per group in `report[id].groups` and never fail; everything a served page uses
 * is checked strictly (`missingLive`).
 */
export async function checkSiteI18n({
  allowDraft = false,
  locales = siteLocales.PREFIXABLE_LOCALES,
  overrides,
  drafts = SITE_DRAFT_LOCALES,
  pageDrafts = SITE_DRAFT_PAGE_GROUPS,
} = {}) {
  const catalogs = await registerSiteCatalogs({ locales, overrides });
  const report = {};
  const errors = [];
  const warnings = [];
  for (const id of locales) {
    const rows = await collectSiteStrings(id);
    const draft = drafts.includes(id);
    const live = (row) => rowIsLive(row, id, pageDrafts);
    const missing = [];
    let site = 0;
    let app = 0;
    let appLive = 0;
    for (const row of rows) {
      const source = siteLookupSource(row.en, id);
      if (source === "site") site += 1;
      else if (source === "app") {
        app += 1;
        if (live(row)) appLive += 1;
      } else missing.push(row);
    }
    const missingLive = missing.filter(live);
    const byEn = new Map(rows.map((r) => [r.en, r]));
    const invalid = [];
    const invalidStaged = [];
    const stale = [];
    const note = (row, msg) => (live(row) ? invalid : invalidStaged).push(msg);
    for (const [en, tr] of Object.entries(catalogs[id].site)) {
      const row = byEn.get(en);
      if (!row) {
        stale.push(en);
        continue;
      }
      const problems = translationProblems(en, tr, { max: row.max });
      if (problems.length) note(row, `${JSON.stringify(en.slice(0, 60))}: ${problems.join("; ")}`);
    }
    // App translations carry the same rules (length limits matter for SEO meta).
    for (const row of rows) {
      if (siteLookupSource(row.en, id) !== "app") continue;
      const problems = translationProblems(row.en, siteLookup(row.en, id), { max: row.max });
      if (problems.length) note(row, `${JSON.stringify(row.en.slice(0, 60))} (app catalog): ${problems.join("; ")}`);
    }
    // Per page group: every string its pages use (shared ones included), what is missing.
    const groups = {};
    for (const group of Object.keys(siteLocales.SITE_PAGE_GROUPS)) {
      const own = rows.filter((r) => r.groups?.includes(group));
      const gap = own.filter((r) => !siteLookupSource(r.en, id));
      groups[group] = {
        live: siteLocales.isPageGroupLive(group, id, pageDrafts),
        total: own.length,
        missing: gap.length,
        missingWords: gap.reduce((n, r) => n + wordCount(r.en), 0),
        percent: percentOf(own.length - gap.length, own.length),
      };
    }
    const liveRows = rows.filter(live);
    const total = rows.length;
    report[id] = {
      draft,
      total,
      site,
      app,
      missing,
      missingLive,
      invalid,
      invalidStaged,
      stale,
      groups,
      percent: percentOf(site + app, total),
      livePercent: percentOf(liveRows.length - missingLive.length, liveRows.length),
      missingWords: missing.reduce((n, r) => n + wordCount(r.en), 0),
    };
    if (missingLive.length && !(allowDraft && draft)) {
      errors.push(`${id}: ${missingLive.length} strings without a translation${draft ? " (site draft)" : ""}`);
    }
    if (invalid.length && !(allowDraft && draft)) {
      errors.push(`${id}: ${invalid.length} translations break placeholders, tags or length limits`);
    }
    // A live page must render from the small site chunk: app-only strings make the
    // browser download the whole app catalog. `bake` copies them over.
    if (appLive && !draft) {
      errors.push(`${id}: ${appLive} strings only in the app catalog, run node scripts/site-i18n.mjs bake --locale=${id}`);
    }
    if (invalid.length && allowDraft && draft) warnings.push(`${id}: ${invalid.length} invalid translations (site draft)`);
    if (invalidStaged.length) {
      warnings.push(`${id}: ${invalidStaged.length} invalid translations on staged pages (fix them before serving the group)`);
    }
    if (stale.length) warnings.push(`${id}: ${stale.length} site catalog keys are no longer used`);
  }
  return { report, errors, warnings };
}

// ---------------------------------------------------------------------------
// Export / import

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Split rows into parts of at most `size` rows and (unless a single row is larger) `words` words. */
export function splitParts(rows, { size = PART_SIZE, words = PART_WORDS } = {}) {
  const parts = [];
  let cur = [];
  let curWords = 0;
  for (const r of rows) {
    const w = wordCount(r.en);
    if (cur.length && (cur.length >= size || curWords + w > words)) {
      parts.push(cur);
      cur = [];
      curWords = 0;
    }
    cur.push(r);
    curWords += w;
  }
  if (cur.length) parts.push(cur);
  return parts;
}

/**
 * Translator files of an earlier export (out-*.json) use that export's indexes. Move them
 * to <id>/stale-out/ so `import` can never apply them to the new numbering.
 */
function retireOldOutFiles(folder) {
  const outs = fs.readdirSync(folder).filter((f) => /^out-[\w-]+\.json$/.test(f));
  if (!outs.length) return 0;
  const staleDir = path.join(folder, "stale-out");
  fs.rmSync(staleDir, { recursive: true, force: true });
  fs.mkdirSync(staleDir, { recursive: true });
  for (const f of outs) fs.renameSync(path.join(folder, f), path.join(staleDir, f));
  return outs.length;
}

export async function exportSiteStrings({ locales = siteLocales.PREFIXABLE_LOCALES, dir = EXPORT_DIR } = {}) {
  await registerSiteCatalogs({ locales });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "README.txt"),
    [
      "Descall marketing site strings, one folder per locale.",
      "",
      "en.json       every string the localized pages use: [{ i, en, context, groups }]",
      "              (groups: page groups such as blog / niche that use a string no live",
      "              page uses; null for strings of the pages already served)",
      "part-NNN.json strings that still need a translation (translate these)",
      "reused.json   strings already translated in the app catalog, for review only;",
      "              to change one, add { i, t } for it to an out file",
      "stale-out/    out files of the previous export (indexes changed, never imported)",
      "",
      'Write out-NNN.json next to part-NNN.json: [{ "i": <index>, "t": "<translation>" }]',
      '(optionally with "en" copied from the part file; import then checks it still matches).',
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
    const retired = retireOldOutFiles(out);
    const indexed = rows.map((r, i) => ({
      i,
      en: r.en,
      context: r.context,
      ...(r.max ? { max: r.max } : {}),
      groups: r.groups,
    }));
    writeJson(path.join(out, "en.json"), indexed);
    const missing = indexed.filter((r) => !siteLookupSource(r.en, id)).map(({ groups: _g, ...r }) => r);
    const reused = indexed
      .filter((r) => siteLookupSource(r.en, id) === "app")
      .map(({ groups: _g, ...r }) => ({ ...r, t: siteLookup(r.en, id) }));
    writeJson(path.join(out, "reused.json"), reused);
    const parts = splitParts(missing);
    parts.forEach((part, n) => writeJson(path.join(out, `part-${String(n + 1).padStart(3, "0")}.json`), part));
    const missingLive = indexed.filter((r) => !siteLookupSource(r.en, id) && rowIsLive(r, id));
    summary[id] = {
      total: indexed.length,
      missing: missing.length,
      missingLive: missingLive.length,
      missingWords: missing.reduce((n, r) => n + wordCount(r.en), 0),
      reused: reused.length,
      reusedWords: reused.reduce((n, r) => n + wordCount(r.en), 0),
      parts: parts.length,
      retired,
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
      if (item.en != null && item.en !== row.en) {
        problems.push(`${f} #${item.i}: English text differs from the current export (old round? export again)`);
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
        `  ${id.padEnd(6)} ${String(s.missing).padStart(5)} strings / ${String(s.missingWords).padStart(6)} words to translate in ${s.parts} part(s) ` +
          `(${s.missingLive} on served pages); ${s.reused} reused from the app catalog (${s.reusedWords} words); ${s.total} total` +
          (s.retired ? `; ${s.retired} old out file(s) moved to stale-out/` : "")
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
        `  ${id.padEnd(6)} ${r.draft ? "draft" : "live "} ${String(r.livePercent).padStart(5)} % of served pages  (${r.site + r.app}/${r.total} overall; site ${r.site}, app ${r.app}; missing ${r.missing.length} / ${r.missingWords} words, ${r.missingLive.length} on served pages)`
      );
      for (const [group, g] of Object.entries(r.groups)) {
        console.log(
          `         ${g.live ? "served" : "staged"} ${group.padEnd(6)} ${String(g.percent).padStart(5)} %  (${g.total - g.missing}/${g.total}; missing ${g.missing} / ${g.missingWords} words)`
        );
      }
      if (args.missing === id) for (const m of r.missing) console.log(`      ${JSON.stringify(m.en)}  [${m.context}]`);
      for (const inv of r.invalid.slice(0, 20)) console.log(`      invalid: ${inv}`);
      for (const inv of r.invalidStaged.slice(0, 20)) console.log(`      invalid (staged page): ${inv}`);
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
