/**
 * List t("…") keys used by marketing JSX that are missing from MARKETING_TR.
 * Does not rewrite the catalog.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectMarketingTKeys, MARKETING_IDENTITY_KEYS } from "./marketingTKeys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const { MARKETING_TR } = await import(pathToFileURL(path.join(root, "src/site/marketingPhrases.tr.js")).href);
const { phrases: trPhrases } = await import(pathToFileURL(path.join(root, "src/i18n/locales/tr.js")).href);

const keys = collectMarketingTKeys(path.join(root, "src/site"));
const missingSlim = [];
const missingCatalog = [];
const identical = [];
for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
  const slim = MARKETING_TR[key];
  const full = trPhrases[key];
  if (!slim && !MARKETING_IDENTITY_KEYS.has(key)) missingSlim.push(key);
  if (!full && !slim && !MARKETING_IDENTITY_KEYS.has(key)) missingCatalog.push(key);
  if (
    slim &&
    slim === key &&
    !MARKETING_IDENTITY_KEYS.has(key) &&
    !/^[A-Z0-9./+ -]+$/.test(key)
  ) {
    identical.push(key);
  }
}

console.log(`t() keys: ${keys.size}`);
console.log(`missing from MARKETING_TR: ${missingSlim.length}`);
for (const k of missingSlim) console.log(`  SLIM  ${k}`);
console.log(`missing from both slim+tr.js: ${missingCatalog.length}`);
for (const k of missingCatalog) console.log(`  BOTH  ${k}`);
console.log(`identical Latin in slim: ${identical.length}`);
for (const k of identical) console.log(`  SAME  ${k}`);
