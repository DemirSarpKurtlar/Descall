/**
 * Security headers stay in lockstep across Cloudflare, Vercel, and the API.
 * Run: node src/site/securityPolicy.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CSP_HEADER,
  HSTS,
  PERMISSIONS_POLICY,
  SITE_CSP,
  canonicalRedirect,
} from "../../public/_worker.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const headerTitle = CSP_HEADER.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("-");

const headersFile = fs.readFileSync(path.join(root, "public/_headers"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const worker = fs.readFileSync(path.join(root, "public/_worker.js"), "utf8");
const api = fs.readFileSync(path.join(root, "backend/middleware/securityHeaders.js"), "utf8");

assert.equal(HSTS, "max-age=63072000; includeSubDomains; preload");
assert.ok(PERMISSIONS_POLICY.includes("camera=(self)"));
assert.ok(PERMISSIONS_POLICY.includes("microphone=(self)"));
assert.ok(PERMISSIONS_POLICY.includes("display-capture=(self)"));
assert.ok(!PERMISSIONS_POLICY.includes("*"));
assert.ok(SITE_CSP.includes("frame-ancestors 'none'"));
assert.ok(SITE_CSP.includes("https://accounts.google.com"));
assert.ok(SITE_CSP.includes("https://static.cloudflareinsights.com"));
assert.ok(worker.includes('headers.delete("access-control-allow-origin")'));
assert.ok(SITE_CSP.includes("wss://des-call.onrender.com"));
assert.ok(SITE_CSP.includes("https://*.livekit.cloud"));
assert.equal(headersFile.includes(SITE_CSP), true, "_headers CSP drifted");
assert.equal(headersFile.includes("X-Frame-Options: DENY"), true);
assert.equal(headersFile.includes(`Strict-Transport-Security: ${HSTS}`), true);

const catchAll = vercel.headers.find((rule) => rule.source === "/(.*)");
const csp = catchAll.headers.find((h) => h.key === headerTitle);
assert.equal(csp?.value, SITE_CSP, "vercel CSP drifted");
assert.ok(catchAll.headers.some((h) => h.key === "X-Frame-Options" && h.value === "DENY"));
assert.ok(catchAll.headers.some((h) => h.key === "Strict-Transport-Security" && h.value === HSTS));
assert.equal(vercel.headers.some((rule) => rule.headers.some((h) => h.value?.includes("frame-ancestors 'self'"))), false);

assert.ok(worker.includes('"/groups"') && worker.includes('"/invite"') && worker.includes("/404.html"));
assert.ok(worker.includes('readAsset(env, request, "/")'));
assert.ok(api.includes("frame-ancestors 'none'"));
assert.ok(api.includes(HSTS));
assert.ok(api.includes("script-src 'none'"));

const shop = fs.readFileSync(path.join(root, "backend/routes/shop.js"), "utf8");
assert.ok(shop.includes("default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"));

function expectRedirect(from, to) {
  const dest = canonicalRedirect(new URL(from));
  assert.equal(dest?.toString() || null, to, from);
}
expectRedirect("http://descall.com/login", "https://descall.com/login");
expectRedirect("https://www.descall.com/faq/", "https://descall.com/faq/");
expectRedirect("http://www.descall.com/", "https://descall.com/");
expectRedirect("https://descall.com/", null);
expectRedirect("http://localhost:8788/", null);
expectRedirect("https://des-call.onrender.com/health", null);

console.log("securityPolicy.selftest ok", CSP_HEADER);
