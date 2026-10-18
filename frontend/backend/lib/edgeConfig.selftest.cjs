"use strict";
// node frontend/backend/lib/edgeConfig.selftest.cjs
const assert = require("assert");
const { normalizeBase, edgePublicBase, publicCache } = require("./edgeConfig");
const { canonicalHostMiddleware } = require("../middleware/canonicalHost");

assert.strictEqual(normalizeBase("https://api.descall.com/"), "https://api.descall.com");
assert.strictEqual(normalizeBase("https://api-staging.descall.com"), "https://api-staging.descall.com");
assert.strictEqual(normalizeBase("http://api.descall.com"), null, "https only");
assert.strictEqual(normalizeBase("https://evil.example"), null, "allowlist");
assert.strictEqual(normalizeBase("https://api.descall.com.evil.example"), null);
assert.strictEqual(normalizeBase("https://api.descall.com/x"), null, "no path");
assert.strictEqual(normalizeBase(""), null);
assert.strictEqual(edgePublicBase({}), null);
assert.strictEqual(edgePublicBase({ EDGE_PUBLIC_BASE: "https://api.descall.com" }), "https://api.descall.com");

const headers = {};
publicCache({ set: (k, v) => (headers[k] = v) }, { maxAge: 15, sMaxAge: 30, swr: 60 });
assert.strictEqual(headers["Cache-Control"], "public, max-age=15, s-maxage=30, stale-while-revalidate=60");

// api.descall.com: API paths pass through, HTML bounces to the apex.
process.env.FORCE_CANONICAL_HOST = "true";
function run(host, path) {
  let redirected = null;
  const req = { method: "GET", path, originalUrl: path, protocol: "https", get: (h) => ({ host, "x-forwarded-proto": "https" }[h.toLowerCase()]) };
  const res = { set() {}, redirect: (code, url) => (redirected = { code, url }) };
  let nexted = false;
  canonicalHostMiddleware(req, res, () => (nexted = true));
  return { nexted, redirected };
}
assert.ok(run("api.descall.com", "/api/features").nexted);
assert.ok(run("api.descall.com", "/socket.io/").nexted);
assert.deepStrictEqual(run("api.descall.com", "/download").redirected, { code: 301, url: "https://descall.com/download" });
// Paths here and in the Cloudflare config must stay identical.
const { EDGE_PUBLIC_PATHS, EDGE_PUBLIC_PREFIXES, isEdgePublicPath } = require("./edgeConfig");
const infra = require("../../../infra/cloudflare/edge-config.json");
assert.deepStrictEqual(infra.cacheRules[0].paths, EDGE_PUBLIC_PATHS);
assert.deepStrictEqual(infra.cacheRules[0].prefixes, EDGE_PUBLIC_PREFIXES);
assert.ok(isEdgePublicPath("/api/shop/assets/abc"));
assert.ok(!isEdgePublicPath("/api/shop/catalog"));
assert.ok(!isEdgePublicPath("/api/auth/me"));
console.log("edgeConfig.selftest.cjs: ok");
