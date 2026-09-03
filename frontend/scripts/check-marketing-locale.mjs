/**
 * Guardrail: TR marketing chrome must be Turkish; EN chrome must not leak TR copy.
 * Also fail if marketing t() keys are missing from the slim TR catalog.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETING_TR } from "../src/site/marketingPhrases.tr.js";
import { corePageBody } from "../src/site/seo/corePageBodies.js";
import { navLabels, trCopy } from "../src/site/seo/prerenderCopy.js";
import {
  isTurkishMarketingPath,
  trDestinationForPath,
} from "../src/site/localePaths.js";
import { resolveMarketingLocale } from "../src/site/resolveMarketingLocale.js";
import { collectMarketingTKeys, MARKETING_IDENTITY_KEYS } from "./marketingTKeys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const required = [
  "Features",
  "Download",
  "FAQ",
  "Sign In",
  "Start free",
  "Talk",
  "together",
  "Talk together",
  "Language",
];
const missingRequired = required.filter((k) => !MARKETING_TR[k] || MARKETING_TR[k] === k);
if (missingRequired.length) {
  console.error("Missing marketing TR keys:", missingRequired);
  process.exit(1);
}

const trNav = navLabels(true);
const enNav = navLabels(false);
if (trNav.features !== "Özellikler" || trNav.signIn !== "Giriş yap" || trNav.faq !== "SSS") {
  console.error("TR nav labels unexpected", trNav);
  process.exit(1);
}
if (enNav.features !== "Features" || enNav.signIn !== "Sign in" || enNav.faq !== "FAQ") {
  console.error("EN nav labels leaked TR", enNav);
  process.exit(1);
}

const homeTr = corePageBody("/tr");
const homeEn = corePageBody("/");
if (!homeTr?.includes("Birlikte konuşun") || !homeTr.includes("Özellikler") || !homeTr.includes("Giriş yap")) {
  console.error("TR homepage prerender missing translated chrome");
  process.exit(1);
}
if (homeEn.includes("Özellikler") || homeEn.includes("Giriş yap") || homeEn.includes("Ücretsiz başla")) {
  console.error("EN homepage prerender leaked Turkish chrome");
  process.exit(1);
}
if (trCopy("Features", false) !== "Features" || trCopy("Features", true) !== "Özellikler") {
  console.error("trCopy identity failed");
  process.exit(1);
}

const pathCases = [
  ["/tr", true],
  ["/tr/features", true],
  ["/descall-sahibi", true],
  ["/discord-alternative-turkey", true],
  ["/", false],
  ["/who-owns-descall", false],
  ["/features", false],
];
for (const [p, expect] of pathCases) {
  if (isTurkishMarketingPath(p) !== expect) {
    console.error("isTurkishMarketingPath failed", p, "expected", expect);
    process.exit(1);
  }
}

if (trDestinationForPath("/who-owns-descall") !== "/descall-sahibi") {
  console.error("trDestinationForPath ownership failed");
  process.exit(1);
}
if (trDestinationForPath("/discord-alternative") !== "/discord-alternative-turkey") {
  console.error("trDestinationForPath alternative failed");
  process.exit(1);
}
if (trDestinationForPath("/features") !== "/tr/features") {
  console.error("trDestinationForPath features failed");
  process.exit(1);
}

const localeCases = [
  { pathname: "/tr", stored: "en", expect: "tr" },
  { pathname: "/descall-sahibi", stored: "en", expect: "tr" },
  { pathname: "/", stored: "en", expect: "en" },
  { pathname: "/who-owns-descall", stored: "en", expect: "en" },
  { pathname: "/", stored: "tr", expect: "tr" },
  { pathname: "/features", stored: "tr", expect: "tr" },
];
for (const c of localeCases) {
  const got = resolveMarketingLocale({ pathname: c.pathname, stored: c.stored });
  if (got !== c.expect) {
    console.error("resolveMarketingLocale failed", c, "got", got);
    process.exit(1);
  }
}

const tKeys = collectMarketingTKeys(path.join(root, "src/site"));
const missingSlim = [...tKeys].filter((k) => !MARKETING_TR[k] && !MARKETING_IDENTITY_KEYS.has(k));
if (missingSlim.length) {
  console.error(`Marketing t() keys missing from MARKETING_TR (${missingSlim.length}):`);
  for (const k of missingSlim) console.error("  -", k);
  process.exit(1);
}

console.log("marketing locale check ok");
