/**
 * Report marketing t("…") keys missing from MARKETING_TR.
 * Does not rewrite the catalog — add gaps to src/i18n/locales/trGaps.js.
 *
 * FIELD_RE scraping of title/desc/q/a was removed: it pulled Turkish SEO
 * source strings and overwrote the slim catalog.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectMarketingTKeys, MARKETING_IDENTITY_KEYS } from "./marketingTKeys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteDir = path.join(root, "src/site");

const { MARKETING_TR } = await import(pathToFileURL(path.join(root, "src/site/marketingPhrases.tr.js")).href);

const keys = collectMarketingTKeys(siteDir);
const missing = [...keys]
  .sort((a, b) => a.localeCompare(b))
  .filter((k) => !MARKETING_TR[k] && !MARKETING_IDENTITY_KEYS.has(k));

console.log(`t() keys: ${keys.size}`);
console.log(`missing from MARKETING_TR: ${missing.length}`);
for (const k of missing) console.log(`  - ${k}`);

if (process.argv.includes("--write")) {
  console.error("Refusing to rewrite marketingPhrases.tr.js. Add keys to src/i18n/locales/trGaps.js instead.");
  process.exit(1);
}

process.exit(missing.length ? 1 : 0);
