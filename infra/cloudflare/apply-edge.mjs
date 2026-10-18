#!/usr/bin/env node
/**
 * Cloudflare edge for Descall (scale plan S1). Idempotent.
 *
 *   node infra/cloudflare/apply-edge.mjs plan            # read-only, prints the diff
 *   node infra/cloudflare/apply-edge.mjs apply-dns       # api CNAME, DNS-only (Render verifies the custom domain)
 *   node infra/cloudflare/apply-edge.mjs apply-proxy     # same CNAME, proxied (orange cloud)
 *   node infra/cloudflare/apply-edge.mjs apply-cache     # Cache Rules (only "descall-edge:" rules are replaced)
 *   node infra/cloudflare/apply-edge.mjs verify          # public GETs through api.descall.com, cf-cache-status
 *
 * Env: CLOUDFLARE_API_TOKEN (Zone DNS Edit + Zone Cache Rules Edit, zone descall.com only),
 *      CLOUDFLARE_ZONE_ID. The token is never printed.
 * Nothing here can enable a paid feature: DNS records and Cache Rules are Free-plan features.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(here, "edge-config.json"), "utf8"));
const TAG = "descall-edge:";
const mode = process.argv[2] || "plan";

export function ruleExpression(host, rule) {
  const parts = [];
  for (const p of rule.paths || []) parts.push(`http.request.uri.path eq "${p}"`);
  for (const p of rule.prefixes || []) parts.push(`starts_with(http.request.uri.path, "${p}")`);
  if (!parts.length) throw new Error(`rule without paths: ${rule.description}`);
  return `(http.host eq "${host}" and (${parts.join(" or ")}))`;
}

export function desiredCacheRules(c = cfg) {
  return c.cacheRules.map((r) => {
    if (!String(r.description).startsWith(TAG)) throw new Error(`description must start with ${TAG}`);
    const action_parameters = r.cache
      ? { cache: true, edge_ttl: { mode: "respect_origin" }, browser_ttl: { mode: "respect_origin" } }
      : { cache: false };
    return { description: r.description, expression: ruleExpression(c.apiHost, r), action: "set_cache_settings", action_parameters, enabled: true };
  });
}

/** Keep every rule that is not ours, replace ours. */
export function mergeRules(existing, desired) {
  const keep = (existing || []).filter((r) => !String(r.description || "").startsWith(TAG)).map(({ description, expression, action, action_parameters, enabled }) => ({ description, expression, action, action_parameters, enabled }));
  return [...keep, ...desired];
}

async function cf(method, url, body) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  const res = await fetch(`https://api.cloudflare.com/client/v4${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = (data.errors || []).map((e) => `${e.code} ${e.message}`).join("; ") || res.status;
    const err = new Error(`${method} ${url.replace(/zones\/[^/]+/, "zones/<zone>")} → ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data.result;
}

async function getCacheEntrypoint(zone) {
  try {
    return await cf("GET", `/zones/${zone}/rulesets/phases/http_request_cache_settings/entrypoint`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function findRecord(zone) {
  const list = await cf("GET", `/zones/${zone}/dns_records?type=CNAME&name=${encodeURIComponent(cfg.apiHost)}`);
  return list?.[0] || null;
}

async function upsertCname(zone, proxied) {
  const rec = await findRecord(zone);
  const body = { type: "CNAME", name: cfg.apiHost, content: cfg.origin, proxied, ttl: 1, comment: "Descall API edge (scale plan S1)" };
  if (rec) return cf("PATCH", `/zones/${zone}/dns_records/${rec.id}`, body);
  return cf("POST", `/zones/${zone}/dns_records`, body);
}

async function verify() {
  const checks = ["/health", "/api/features", "/api/announcements", "/api/app/latest-release", "/api/shop/catalog/public"];
  for (const p of checks) {
    const out = [];
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`https://${cfg.apiHost}${p}`, { headers: { "Accept-Encoding": "gzip" } });
      out.push(`${r.status} ${r.headers.get("cf-cache-status") || "-"}`);
    }
    console.log(`${p.padEnd(28)} ${out.join("  →  ")}`);
  }
}

async function main() {
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (mode === "verify") return verify();
  const desired = desiredCacheRules();
  if (mode === "print") {
    console.log(JSON.stringify(desired, null, 2));
    return;
  }
  if (!zone) throw new Error("CLOUDFLARE_ZONE_ID is not set");
  if (mode === "plan") {
    const rec = await findRecord(zone);
    console.log(`DNS ${cfg.apiHost}: ${rec ? `${rec.type} → ${rec.content} proxied=${rec.proxied}` : "missing"} (want CNAME → ${cfg.origin})`);
    const ep = await getCacheEntrypoint(zone);
    const ours = (ep?.rules || []).filter((r) => String(r.description || "").startsWith(TAG));
    console.log(`Cache rules: ${ep?.rules?.length || 0} total, ${ours.length} ours, want ${desired.length} ours (Free plan limit 10)`);
    return;
  }
  if (mode === "apply-dns") return console.log("DNS:", (await upsertCname(zone, false)).name, "DNS-only");
  if (mode === "apply-proxy") return console.log("DNS:", (await upsertCname(zone, true)).name, "proxied");
  if (mode === "apply-cache") {
    const ep = await getCacheEntrypoint(zone);
    const rules = mergeRules(ep?.rules, desired);
    if (rules.length > 10) throw new Error(`would exceed the Free plan's 10 cache rules (${rules.length})`);
    const result = await cf("PUT", `/zones/${zone}/rulesets/phases/http_request_cache_settings/entrypoint`, { rules });
    return console.log(`Cache rules applied: ${result.rules.length} total`);
  }
  throw new Error(`unknown mode ${mode}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(String(e.message || e));
    process.exit(1);
  });
}
