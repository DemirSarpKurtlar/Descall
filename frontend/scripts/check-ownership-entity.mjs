/**
 * Guardrail: crawlers and LLMs must see Demir Sarp Kurtlar as Descall's owner.
 */
import { buildEntityGraphLd } from "../src/site/jsonLdBuilders.js";
import { corePageBody } from "../src/site/seo/corePageBodies.js";
import {
  OWNER_NAME,
  llmsTxt,
  llmsFullTxt,
  humansTxt,
  securityTxt,
} from "../src/site/ownershipFacts.js";
import { PUBLIC_ROUTES } from "../src/site/seoConfig.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const errors = [];

function fail(msg) {
  errors.push(msg);
}

if (OWNER_NAME !== "Demir Sarp Kurtlar") {
  fail(`OWNER_NAME must be Demir Sarp Kurtlar, got ${OWNER_NAME}`);
}

const graph = JSON.stringify(buildEntityGraphLd());
for (const needle of ["Demir Sarp Kurtlar", '"ownedBy"', '"founder"', "person-demir-sarp-kurtlar"]) {
  if (!graph.includes(needle)) fail(`Entity graph missing ${needle}`);
}

const enBody = corePageBody("/who-owns-descall") || "";
const trBody = corePageBody("/descall-sahibi") || "";
if (!enBody.includes("<h1>Who owns Descall?</h1>")) fail("EN ownership H1 missing");
if (!enBody.includes("Demir Sarp Kurtlar")) fail("EN ownership body missing owner name");
if (!trBody.includes("<h1>Descall’ın sahibi kim?</h1>") && !trBody.includes("<h1>Descall'ın sahibi kim?</h1>")) {
  fail("TR ownership H1 missing");
}
if (!trBody.includes("Demir Sarp Kurtlar")) fail("TR ownership body missing owner name");

const aboutEn = corePageBody("/about") || "";
if (!aboutEn.includes("Demir Sarp Kurtlar")) fail("About prerender missing owner name");

const llms = llmsTxt();
const full = llmsFullTxt();
const humans = humansTxt();
const security = securityTxt();
for (const [name, body] of [
  ["llms.txt", llms],
  ["llms-full.txt", full],
  ["humans.txt", humans],
]) {
  if (!body.includes("Demir Sarp Kurtlar")) fail(`${name} missing owner name`);
  if (!body.includes("https://descall.com/who-owns-descall") && name !== "humans.txt") {
    fail(`${name} missing canonical ownership URL`);
  }
}
if (!security.includes("contact@descall.com")) fail("security.txt missing contact");

const paths = new Set(PUBLIC_ROUTES.map((r) => r.path));
if (!paths.has("/who-owns-descall")) fail("PUBLIC_ROUTES missing /who-owns-descall");
if (!paths.has("/descall-sahibi")) fail("PUBLIC_ROUTES missing /descall-sahibi");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!vercel.includes("llms\\\\.txt") && !vercel.includes("llms\\.txt")) {
  fail("vercel.json SPA rewrite must exclude llms.txt");
}
if (!vercel.includes("/who-owns-descall") || !vercel.includes("/descall-sahibi")) {
  fail("vercel.json missing ownership redirects or cache headers");
}

if (errors.length) {
  for (const e of errors) console.error("ERROR", e);
  process.exit(1);
}
console.log("ownership entity check ok");
