// i18n gate (3.7.21). Fails the PR when a live language misses a string, when a
// message has a broken placeholder / plural, or when hard-coded text grows.
// Details and the per-locale report: node scripts/i18n-check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const check = await import(pathToFileURL(join(root, "scripts", "i18n-check.mjs")).href);
const registry = JSON.parse(readFileSync(join(here, "locales.json"), "utf8"));

// Registry: unique ids, English fallback live, every locale has a catalog file and a
// loader in index.js, Intl tags are valid.
const ids = registry.locales.map((l) => l.id);
assert.equal(new Set(ids).size, ids.length, "locale ids are unique");
assert.ok(registry.locales.find((l) => l.id === registry.fallback)?.status === "live", "fallback locale is live");
const indexSrc = readFileSync(join(here, "index.js"), "utf8");
for (const l of registry.locales) {
  assert.ok(["live", "draft"].includes(l.status), `${l.id}: status live|draft`);
  assert.ok(["ltr", "rtl"].includes(l.dir), `${l.id}: dir ltr|rtl`);
  assert.ok(l.name && l.englishName, `${l.id}: names`);
  assert.doesNotThrow(() => new Intl.NumberFormat(l.intl), `${l.id}: Intl tag ${l.intl}`);
  assert.ok(new RegExp(`["']?${l.id.replace("-", "\\-")}["']?:\\s*\\(\\)\\s*=>\\s*import\\(`).test(indexSrc), `${l.id}: loader in index.js`);
  readFileSync(join(here, "locales", `${l.id}.js`), "utf8");
}

const cov = await check.checkCoverage();
for (const [id, r] of Object.entries(cov.report)) {
  console.log(`  ${id.padEnd(6)} ${r.status.padEnd(6)} ${r.percent}%`);
}
assert.deepEqual(cov.errors, [], `catalog problems:\n${cov.errors.join("\n")}`);

const hc = check.checkHardcoded();
assert.deepEqual(
  hc.errors,
  [],
  `hard-coded user-visible text grew:\n${hc.errors.join("\n")}\nMove it into the catalogs (t("...")), then run node scripts/i18n-check.mjs --update-baseline`
);

console.log(`i18nCoverage.selftest: ok (${cov.keys.length} strings, ${hc.total} hard-coded left)`);
