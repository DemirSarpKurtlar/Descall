// Site translation gate (prefixed site languages: de, es, fr, pt-BR, ru, ...).
// Every string the /<prefix>/* pages use must have a translation in the site catalog
// (src/site/i18n/<id>.js) or the app catalog. Locales in SITE_DRAFT_LOCALES
// (src/site/siteDraftLocales.js) may still have gaps; a locale removed from that list
// is checked strictly. Run: node src/site/siteI18n.selftest.mjs
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { checkSiteI18n, collectSiteStrings, translationProblems, formatCatalog, wordCount } = await imp("scripts/site-i18n.mjs");
const { SITE_DRAFT_LOCALES } = await imp("src/site/siteDraftLocales.js");
const { PREFIXABLE_LOCALES, SITE_LOCALES } = await imp("src/site/siteLocales.js");
const { registerSiteCatalogs } = await imp("scripts/siteCatalogs.mjs");

// 1. The gate itself, exactly as CI runs it (drafts tolerated, live locales strict).
const gate = await checkSiteI18n({ allowDraft: true });
for (const [id, r] of Object.entries(gate.report)) {
  console.log(`  ${id.padEnd(6)} ${r.draft ? "draft" : "live "} ${r.percent} % (${r.site + r.app}/${r.total}, missing ${r.missing.length})`);
}
assert.deepEqual(gate.errors, [], `site i18n gate:\n${gate.errors.join("\n")}`);

// A served prefixed locale must be complete, a draft is never served.
for (const id of PREFIXABLE_LOCALES) {
  const served = SITE_LOCALES.includes(id);
  assert.equal(served, !SITE_DRAFT_LOCALES.includes(id), `${id}: served exactly when not a draft`);
  if (served) assert.equal(gate.report[id].missing.length, 0, `${id} is live on the site but has gaps`);
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
await registerSiteCatalogs(); // back to the real catalogs

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
