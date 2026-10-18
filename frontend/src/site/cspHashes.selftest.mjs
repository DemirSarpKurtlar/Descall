/**
 * 2.11.2 CSP hardening: script-src has no 'unsafe-inline' anywhere the site is served
 * (Cloudflare worker + _headers, Vercel), and the committed sha256 list matches index.html.
 * Run: node src/site/cspHashes.selftest.mjs   (fix drift with: node scripts/csp-sync.mjs)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { INLINE_SCRIPT_HASHES, SITE_CSP } from "../../public/security-policy.js";
import { inlineScriptHashes } from "../../scripts/csp-sync-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const scriptSrc = (csp) => (String(csp).match(/script-src[^;]*/) || [""])[0];

const fromIndex = inlineScriptHashes(read("index.html"));
assert.ok(fromIndex.length >= 5, "index.html inline scripts found");
assert.deepEqual([...INLINE_SCRIPT_HASHES].sort(), [...fromIndex].sort(), "INLINE_SCRIPT_HASHES drifted from index.html: run node scripts/csp-sync.mjs");

assert.ok(!/'unsafe-inline'/.test(scriptSrc(SITE_CSP)), "site script-src must not allow 'unsafe-inline'");
for (const h of fromIndex) assert.ok(SITE_CSP.includes(`'${h}'`), `CSP carries ${h}`);
assert.ok(!/'unsafe-eval'/.test(scriptSrc(SITE_CSP)), "site script-src has no 'unsafe-eval'");
assert.ok(SITE_CSP.includes("https://accounts.google.com"), "Google sign-in script stays allowed");
assert.ok(SITE_CSP.includes("https://static.cloudflareinsights.com"), "Cloudflare beacon stays allowed");
assert.ok(/connect-src[^;]*https:\/\/\*\.sentry\.io/.test(SITE_CSP), "Sentry ingest stays allowed");
assert.ok(/connect-src[^;]*posthog\.com/.test(SITE_CSP), "PostHog stays allowed");

const headers = read("public/_headers");
assert.ok(headers.includes(`Content-Security-Policy: ${SITE_CSP}`), "_headers CSP equals security-policy.js");
const vercel = JSON.parse(read("vercel.json"));
const vcsp = vercel.headers.find((r) => r.source === "/(.*)").headers.find((h) => h.key === "Content-Security-Policy").value;
assert.equal(vcsp, SITE_CSP, "vercel.json CSP equals security-policy.js");

// Inline event handlers would need 'unsafe-inline' (or unsafe-hashes): none in the HTML template.
assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=\s*["']/i.test(read("index.html")), "no inline event handlers in index.html");

// Electron: app document is hashed at runtime from the shipped index.html.
const { buildElectronCsp } = require("../../electron/cspPolicy.cjs");
const ecsp = buildElectronCsp(read("index.html"));
assert.ok(!/'unsafe-inline'/.test(scriptSrc(ecsp)), "Electron app CSP has no script 'unsafe-inline'");
for (const h of fromIndex) assert.ok(ecsp.includes(`'${h}'`));
assert.ok(/'unsafe-inline'/.test(scriptSrc(buildElectronCsp(null))), "unreadable index.html falls back so the app still boots");
const main = read("electron/main.cjs");
assert.ok(main.includes("headers.set('Content-Security-Policy', appDocumentCsp(root))"), "descall:// HTML responses carry the hashed CSP");

console.log("cspHashes.selftest.mjs: ok");
