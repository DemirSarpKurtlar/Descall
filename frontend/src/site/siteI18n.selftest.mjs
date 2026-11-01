// Site translation gate (prefixed site languages: de, es, fr, pt-BR, ru, ...).
// Every string the /<prefix>/* pages use must have a translation in the site catalog
// (src/site/i18n/<id>.js) or the app catalog. Locales in SITE_DRAFT_LOCALES
// (src/site/siteDraftLocales.js) may still have gaps; a locale removed from that list
// is checked strictly. Page groups listed in SITE_DRAFT_PAGE_GROUPS (blog, niche
// landings) may have gaps for the locales listed there, nothing else may.
// Run: node src/site/siteI18n.selftest.mjs
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const {
  checkSiteI18n,
  collectSiteStrings,
  exportSiteStrings,
  importSiteStrings,
  rowIsLive,
  splitParts,
  translationProblems,
  formatCatalog,
  wordCount,
  PART_SIZE,
} = await imp("scripts/site-i18n.mjs");
const { SITE_DRAFT_LOCALES, SITE_DRAFT_PAGE_GROUPS } = await imp("src/site/siteDraftLocales.js");
const { PREFIXABLE_LOCALES, SITE_LOCALES, SITE_PAGE_GROUPS, isPageGroupLive } = await imp("src/site/siteLocales.js");
const { registerSiteCatalogs } = await imp("scripts/siteCatalogs.mjs");

// 1. The gate itself, exactly as CI runs it (drafts tolerated, live locales strict).
const gate = await checkSiteI18n({ allowDraft: true });
for (const [id, r] of Object.entries(gate.report)) {
  const groups = Object.entries(r.groups)
    .map(([g, x]) => `${g} ${x.live ? "served" : "staged"} ${x.percent} %`)
    .join(", ");
  console.log(`  ${id.padEnd(6)} ${r.draft ? "draft" : "live "} ${r.livePercent} % served (missing ${r.missingLive.length}); ${groups}`);
}
assert.deepEqual(gate.errors, [], `site i18n gate:\n${gate.errors.join("\n")}`);

// A served prefixed locale must be complete, a draft is never served.
for (const id of PREFIXABLE_LOCALES) {
  const served = SITE_LOCALES.includes(id);
  assert.equal(served, !SITE_DRAFT_LOCALES.includes(id), `${id}: served exactly when not a draft`);
  if (served) assert.equal(gate.report[id].missingLive.length, 0, `${id} is live on the site but has gaps`);
  // A served page group must be complete for every served locale.
  for (const [group, g] of Object.entries(gate.report[id].groups)) {
    assert.equal(g.live, isPageGroupLive(group, id), `${id} ${group}: report follows SITE_DRAFT_PAGE_GROUPS`);
    if (served && g.live) assert.equal(g.missing, 0, `${id}: page group ${group} is served but has gaps`);
  }
}

// 2. The string list covers chrome, meta, React pages and crawler copy.
const rows = await collectSiteStrings("de");
const en = new Set(rows.map((r) => r.en));
for (const s of [
  "Start free", // header (React)
  "Talk together", // home page (React)
  "Is Descall free?", // FAQ data
  "Descall Features | Free Voice, Screen Share & Servers", // SEO title
  "Optional analytics only. Essentials stay on.", // cookie banner (cookieCopy)
  "Why people look for a Discord alternative", // page extras
  "{name} is the founder, owner, and CEO of Descall.", // crawler body with a placeholder
  "Descall is currently in <strong>Beta</strong>.", // crawler body with a tag
]) {
  assert.ok(en.has(s), `export is missing ${JSON.stringify(s)}`);
}
assert.ok(rows.find((r) => r.en === "Descall Features | Free Voice, Screen Share & Servers").max === 70, "SEO titles carry their length limit");

// 2b. The page groups are recorded too, with paragraph-sized rows and precise contexts.
const byEn = new Map(rows.map((r) => [r.en, r]));
const { BLOG_BODIES } = await imp("src/site/seo/blogBodies.js");
const { NICHE_LANDINGS } = await imp("src/site/seo/nicheLandings.js");
const firstPara = BLOG_BODIES["discord-vs-descall"].sections[0].p;
assert.ok(byEn.has(firstPara), "blog paragraphs are exported");
assert.match(byEn.get(firstPara).context, /^blog post discord-vs-descall, paragraph 1\b/);
assert.deepEqual(byEn.get(firstPara).groups, ["blog"]);
for (const [slug, body] of Object.entries(BLOG_BODIES)) {
  for (const sec of body.sections) {
    assert.ok(byEn.has(sec.h) && byEn.has(sec.p), `blog post ${slug}: every heading and paragraph is a row`);
    assert.ok(!/<(?!\/?(a|strong|em|code)\b)[a-z]/i.test(sec.p), `${slug}: only simple inline tags inside a paragraph`);
  }
}
assert.ok(rows.every((r) => wordCount(r.en) <= 200), "no row is a whole article");
const seoTitle = byEn.get("Discord vs Descall (2026) | Which Should Your Group Use?");
assert.equal(seoTitle?.max, 70, "post SEO titles carry the limit");
assert.match(seoTitle.context, /SEO title of \/blog\/discord-vs-descall/);
assert.equal(byEn.get(NICHE_LANDINGS["/apps-like-discord"].answer)?.groups?.[0], "niche");
assert.equal(byEn.get("Start free").groups, null, "a string a live page uses stays strict");
assert.equal(byEn.get("Frequently asked questions").groups, null);
assert.ok(rowIsLive(byEn.get(firstPara), "de", {}), "served group: strict");
assert.ok(!rowIsLive(byEn.get(firstPara), "de", { blog: ["de"] }), "staged group: tolerated");
const shared = rows.find((r) => r.groups?.length === 2);
if (shared) {
  assert.ok(rowIsLive(shared, "de", { blog: ["de"] }), "a string of two groups is strict once either is served");
}
for (const group of Object.keys(SITE_DRAFT_PAGE_GROUPS)) assert.ok(SITE_PAGE_GROUPS[group], group);
assert.ok(!rows.some((r) => /^[a-z][\w-]*(\.[\w-]+)+$/.test(r.en)), "no nested catalog paths in the export");

// 3. Strict once a locale leaves the draft list: gaps fail, a full catalog passes.
const strictGap = await checkSiteI18n({ allowDraft: true, locales: ["de"], drafts: [], overrides: { de: {} } });
const deGaps = strictGap.report.de.missing.length;
if (deGaps) assert.ok(strictGap.errors.some((e) => e.startsWith("de:")), "a non-draft locale with gaps fails");
const full = Object.fromEntries(rows.map((r) => [r.en, r.en]));
const strictFull = await checkSiteI18n({ allowDraft: false, locales: ["de"], drafts: [], overrides: { de: full } });
assert.deepEqual(strictFull.errors, [], "a complete catalog passes the strict check");
assert.equal(strictFull.report.de.percent, 100);
const broken = { ...full, "{name} is the owner and founder of Descall.": "Descall gehört {owner}." };
const strictBroken = await checkSiteI18n({ allowDraft: false, locales: ["de"], drafts: [], overrides: { de: broken } });
assert.ok(strictBroken.errors.some((e) => /placeholders, tags or length/.test(e)), "a broken placeholder fails");
// 3b. Staged groups: their gaps never fail, the same gaps fail once the group is served.
const deStaged = Object.fromEntries(rows.filter((r) => !r.groups).map((r) => [r.en, r.en]));
const allStaged = Object.fromEntries(Object.keys(SITE_PAGE_GROUPS).map((g) => [g, ["de"]]));
const staged = await checkSiteI18n({ locales: ["de"], drafts: [], pageDrafts: allStaged, overrides: { de: deStaged } });
assert.deepEqual(staged.errors, [], "gaps on staged pages do not fail");
assert.ok(staged.report.de.missing.length > 0 && staged.report.de.missingLive.length === 0);
assert.equal(staged.report.de.livePercent, 100);
const servedGroups = await checkSiteI18n({ locales: ["de"], drafts: [], pageDrafts: {}, overrides: { de: deStaged } });
assert.ok(servedGroups.errors.some((e) => /^de: \d+ strings without a translation/.test(e)), "served groups are strict");
const onlyBlog = await checkSiteI18n({ locales: ["de"], drafts: [], pageDrafts: { niche: ["de"] }, overrides: { de: deStaged } });
assert.ok(onlyBlog.report.de.groups.blog.live && !onlyBlog.report.de.groups.niche.live);
assert.ok(onlyBlog.report.de.missingLive.length > 0, "the served group's gaps fail");
assert.equal(onlyBlog.report.de.missingLive.length, onlyBlog.report.de.groups.blog.missing, "serving one group makes exactly its strings strict");
assert.ok(onlyBlog.report.de.missingLive.every((r) => r.groups.includes("blog")));
const live = await checkSiteI18n({ locales: ["de"], drafts: [], pageDrafts: allStaged, overrides: { de: {} } });
if (live.report.de.missingLive.length) assert.ok(live.errors.length > 0, "live pages stay strict while groups are staged");
await registerSiteCatalogs(); // back to the real catalogs

// 3c. Export: parts <= PART_SIZE rows, old out files retired, stale imports refused.
assert.ok(PART_SIZE <= 120);
const parts = splitParts(
  Array.from({ length: 300 }, (_, i) => ({ i, en: "word ".repeat(i === 7 ? 3000 : 10) })),
  { size: 120, words: 2500 }
);
assert.ok(parts.every((p) => p.length <= 120), "part size");
assert.ok(parts.every((p) => p.length === 1 || p.reduce((n, r) => n + wordCount(r.en), 0) <= 2500), "part words");
assert.equal(parts.flat().length, 300, "nothing lost");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "site-i18n-test-"));
try {
  fs.mkdirSync(path.join(tmp, "de"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "de", "out-001.json"), JSON.stringify([{ i: 0, t: "x" }]));
  const summary = await exportSiteStrings({ locales: ["de"], dir: tmp });
  const files = fs.readdirSync(path.join(tmp, "de"));
  assert.ok(!files.includes("out-001.json") && fs.existsSync(path.join(tmp, "de", "stale-out", "out-001.json")), "old out files retired");
  assert.equal(summary.de.retired, 1);
  const exported = files.filter((f) => /^part-\d+\.json$/.test(f));
  assert.equal(exported.length, summary.de.parts);
  let n = 0;
  for (const f of exported) {
    const part = JSON.parse(fs.readFileSync(path.join(tmp, "de", f), "utf8"));
    assert.ok(part.length <= PART_SIZE, `${f} has <= ${PART_SIZE} rows`);
    n += part.length;
    for (const r of part) assert.ok(r.context && Number.isInteger(r.i), "rows carry index and context");
  }
  assert.equal(n, summary.de.missing);
  const en = JSON.parse(fs.readFileSync(path.join(tmp, "de", "en.json"), "utf8"));
  const row = en.find((r) => r.en === firstPara);
  fs.writeFileSync(path.join(tmp, "de", "out-001.json"), JSON.stringify([{ i: row.i, en: "an older English text", t: "x" }]));
  const res = await importSiteStrings("de", { dir: tmp });
  assert.equal(res.ok, false, "a row whose English changed is refused");
  assert.match(res.problems[0], /differs from the current export/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
await registerSiteCatalogs();

// 4. Message checks used by import.
assert.deepEqual(translationProblems("Hi {name}", "Hallo {name}"), []);
assert.match(translationProblems("Hi {name}", "Hallo {user}")[0], /placeholders differ/);
assert.match(translationProblems("Hi {{name}}", "Hallo")[0], /placeholders differ/);
assert.match(translationProblems("In <strong>Beta</strong>.", "In Beta.")[0], /HTML tags differ/);
assert.deepEqual(translationProblems("In <strong>Beta</strong>.", "<strong>Beta</strong> aktiv."), []);
assert.deepEqual(translationProblems("x", ""), ["empty translation"]);
assert.match(translationProblems("Title", "x".repeat(71), { max: 70 })[0], /longer than 70/);
assert.equal(wordCount("Email {email} or open <a>an issue</a>."), 5);

// 5. Catalog files are written with sorted keys and stay importable.
const text = formatCatalog("de", { b: "2", a: "1" });
assert.ok(text.indexOf('"a"') < text.indexOf('"b"'), "keys are sorted");
const mod = await import(`data:text/javascript,${encodeURIComponent(text)}`);
assert.deepEqual(mod.default, { a: "1", b: "2" });

console.log("siteI18n.selftest ok");
