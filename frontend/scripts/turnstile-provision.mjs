#!/usr/bin/env node
/**
 * Cloudflare Turnstile provisioning for Descall. Idempotent; run by
 * .github/workflows/cloudflare-turnstile.yml (workflow_dispatch), never by hand.
 *
 *   node scripts/turnstile-provision.mjs plan     # read-only: what apply would change
 *   node scripts/turnstile-provision.mjs apply    # find or create the "Descall" widget
 *                                                 # (managed mode), make sure every hostname
 *                                                 # is on it, store the keys for the backend
 *   node scripts/turnstile-provision.mjs rotate   # new secret (the old one keeps working
 *                                                 # for 2 hours at Cloudflare), store it
 *   node scripts/turnstile-provision.mjs status   # plan + is the backend using the key
 *
 * Env: CLOUDFLARE_API_TOKEN (needs Account > Turnstile > Edit), CLOUDFLARE_ACCOUNT_ID,
 *      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the keys go to public.turnstile_config,
 *      migration 20261124t_turnstile.sql; the backend reads that row every 60 s, so no
 *      redeploy and no Render dashboard step), TURNSTILE_EXTRA_HOSTNAMES (optional, comma
 *      separated), TURNSTILE_BACKEND_URL (default https://des-call.onrender.com).
 *
 * Secrets: the widget secret is masked with ::add-mask:: the moment it is read (GitHub
 * hides it from every later log line) and is never printed, echoed or written to a file.
 * Tokens and keys are never printed either. Turnstile is free; nothing here can turn on a
 * paid product (no Enterprise-only option is sent).
 */

import { pathToFileURL } from "node:url";

const API = "https://api.cloudflare.com/client/v4";
export const WIDGET_NAME = "Descall";
/** Web hostnames + the API hosts that serve the in-app bridge page (backend lib/turnstile.js). */
export const BASE_HOSTNAMES = Object.freeze([
  "descall.com",
  "www.descall.com",
  "des-call.onrender.com",
  "api.descall.com",
  "des-call-staging.onrender.com",
  "api-staging.descall.com",
]);
export const MAX_HOSTNAMES = 10; // Free plan limit per widget
export const PERMISSION_HINT =
  "The Cloudflare API token in the CLOUDFLARE_API_TOKEN secret cannot manage Turnstile. " +
  "Give it the permission \"Account > Turnstile > Edit\" (dash.cloudflare.com > My Profile > API Tokens > " +
  "Edit token > Permissions: Account | Turnstile | Edit, for the Descall account), then run this workflow again. " +
  "The app keeps working without Turnstile until then.";
export const MIGRATION_HINT =
  "The table public.turnstile_config does not exist yet. Apply supabase/migrations/20261124t_turnstile.sql, " +
  "then run this workflow again (the widget itself is already set up; the run is idempotent).";

export class ProvisionError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.exitCode = code;
  }
}

export function cleanHostname(raw) {
  const h = String(raw || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!h || h.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h)) return null;
  return h;
}

/** Base list + extra hostnames, de-duplicated, at most 10 (Free plan). */
export function desiredHostnames(extra = "") {
  const out = [...BASE_HOSTNAMES];
  for (const raw of String(extra || "").split(",")) {
    const h = cleanHostname(raw);
    if (h && !out.includes(h)) out.push(h);
  }
  if (out.length > MAX_HOSTNAMES) throw new ProvisionError(`Too many hostnames (${out.length}); a free Turnstile widget allows ${MAX_HOSTNAMES}.`);
  return out;
}

/**
 * What apply does with the existing widgets: create, update (missing hostnames or not
 * managed) or keep. Hostnames someone added by hand are kept (never removed here).
 */
export function planWidget(widgets, desired) {
  const mine = (widgets || []).filter((w) => w && w.name === WIDGET_NAME);
  if (!mine.length) return { action: "create", widget: null, domains: desired, duplicates: 0 };
  const widget = mine[0];
  const have = (widget.domains || []).map((d) => String(d).toLowerCase());
  const domains = [...have];
  for (const h of desired) if (!domains.includes(h)) domains.push(h);
  if (domains.length > MAX_HOSTNAMES) throw new ProvisionError(`The widget would have ${domains.length} hostnames; a free Turnstile widget allows ${MAX_HOSTNAMES}. Remove unused ones in the Cloudflare dashboard.`);
  const missing = domains.filter((d) => !have.includes(d));
  const needsUpdate = missing.length > 0 || widget.mode !== "managed";
  return { action: needsUpdate ? "update" : "keep", widget, domains, missing, duplicates: mine.length - 1 };
}

function isAuthError(status, errors) {
  if (status === 401 || status === 403) return true;
  return (errors || []).some((e) => [9106, 9109, 10000, 10001].includes(Number(e?.code)) || /auth|permission|forbidden/i.test(String(e?.message || "")));
}

export function makeCloudflare({ token, accountId, fetchImpl = fetch }) {
  async function cf(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ProvisionError(`Cloudflare API unreachable (${err?.message || err}).`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      if (isAuthError(res.status, data.errors)) throw new ProvisionError(PERMISSION_HINT, 2);
      const msg = (data.errors || []).map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${res.status}`;
      throw new ProvisionError(`${method} ${path.replace(/accounts\/[^/]+/, "accounts/<account>").replace(/widgets\/[^/?]+/, "widgets/<sitekey>")} failed: ${msg}`);
    }
    return data.result;
  }
  const base = `/accounts/${accountId}/challenges/widgets`;
  return {
    async list() {
      const out = [];
      for (let page = 1; page <= 10; page += 1) {
        const res = await cf("GET", `${base}?page=${page}&per_page=50`);
        const rows = Array.isArray(res) ? res : [];
        out.push(...rows);
        if (rows.length < 50) break;
      }
      return out;
    },
    get: (sitekey) => cf("GET", `${base}/${encodeURIComponent(sitekey)}`),
    create: (domains) => cf("POST", base, { name: WIDGET_NAME, domains, mode: "managed", region: "world", clearance_level: "no_clearance", bot_fight_mode: false }),
    update: (widget, domains) => cf("PUT", `${base}/${encodeURIComponent(widget.sitekey)}`, { name: WIDGET_NAME, domains, mode: "managed", region: widget.region || "world", clearance_level: widget.clearance_level || "no_clearance", bot_fight_mode: false }),
    rotate: (sitekey) => cf("POST", `${base}/${encodeURIComponent(sitekey)}/rotate_secret`, { invalidate_immediately: false }),
  };
}

export function makeStore({ url, serviceKey, fetchImpl = fetch }) {
  const endpoint = `${String(url || "").replace(/\/+$/, "")}/rest/v1/turnstile_config`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  async function check(res) {
    if (res.ok) return;
    const data = await res.json().catch(() => ({}));
    const msg = String(data?.message || data?.hint || "");
    if (res.status === 404 || data?.code === "PGRST205" || data?.code === "42P01" || /turnstile_config/.test(msg)) throw new ProvisionError(MIGRATION_HINT, 3);
    throw new ProvisionError(`Supabase refused the write (HTTP ${res.status}${data?.code ? `, ${data.code}` : ""}).`);
  }
  return {
    /** { siteKey, hostnames, updatedAt } of the stored row (never the secret), or null. */
    async read() {
      let res;
      try {
        res = await fetchImpl(`${endpoint}?id=eq.default&select=site_key,hostnames,updated_at`, { headers });
      } catch (err) {
        throw new ProvisionError(`Supabase unreachable (${err?.message || err}).`);
      }
      await check(res);
      const rows = await res.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? { siteKey: row.site_key, hostnames: row.hostnames || [], updatedAt: row.updated_at } : null;
    },
    async write({ siteKey, secret, hostnames, mode, by }) {
      let res;
      try {
        res = await fetchImpl(`${endpoint}?on_conflict=id`, {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ id: "default", site_key: siteKey, secret_key: secret, hostnames, widget_name: WIDGET_NAME, widget_mode: mode || "managed", updated_at: new Date().toISOString(), updated_by: by || "github-actions" }),
        });
      } catch (err) {
        throw new ProvisionError(`Supabase unreachable (${err?.message || err}).`);
      }
      await check(res);
    },
  };
}

/** GET <backend>/api/turnstile/config until it serves this site key (60 s cache there). */
export async function waitForBackend({ backendUrl, siteKey, fetchImpl = fetch, tries = 12, delayMs = 10_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetchImpl(`${backendUrl.replace(/\/+$/, "")}/api/turnstile/config`, { headers: { Accept: "application/json" } });
      if (res.status === 404) return { state: "not_deployed" };
      if (res.ok) {
        const cfg = await res.json().catch(() => ({}));
        if (cfg.siteKey === siteKey) return { state: "live", mode: cfg.mode };
        if (cfg.mode === "off" && cfg.enabled === false && i >= 2) return { state: "off" };
      }
    } catch {
      /* Render cold start: try again */
    }
    if (i < tries - 1) await sleep(delayMs);
  }
  return { state: "waiting" };
}

/**
 * The whole run. `out` collects log lines (printed by main); `mask` is called with the
 * secret before anything else happens with it.
 */
export async function run({ mode, env, fetchImpl = fetch, log = () => {}, mask = () => {}, sleep }) {
  const need = (name) => {
    const v = String(env[name] || "").trim();
    if (!v) throw new ProvisionError(`Repository secret ${name} is not set.`);
    return v;
  };
  if (!["plan", "apply", "rotate", "status"].includes(mode)) throw new ProvisionError(`Unknown mode ${mode}; use plan, apply, rotate or status.`);
  const cf = makeCloudflare({ token: need("CLOUDFLARE_API_TOKEN"), accountId: need("CLOUDFLARE_ACCOUNT_ID"), fetchImpl });
  const desired = desiredHostnames(env.TURNSTILE_EXTRA_HOSTNAMES);
  const widgets = await cf.list();
  const plan = planWidget(widgets, desired);
  log(`Turnstile widgets in the account: ${widgets.length}; "${WIDGET_NAME}": ${plan.widget ? "found" : "missing"}${plan.duplicates ? ` (+${plan.duplicates} more with the same name, the first one is used)` : ""}.`);
  log(`Hostnames wanted: ${desired.join(", ")}`);
  if (plan.action === "create") log("Plan: create the widget (managed mode).");
  else if (plan.action === "update") log(`Plan: update the widget (${plan.missing.length ? `add ${plan.missing.join(", ")}` : ""}${plan.widget.mode !== "managed" ? `${plan.missing.length ? "; " : ""}mode ${plan.widget.mode} -> managed` : ""}).`);
  else log("Plan: widget is up to date.");

  const store = makeStore({ url: need("SUPABASE_URL"), serviceKey: need("SUPABASE_SERVICE_ROLE_KEY"), fetchImpl });
  const backendUrl = String(env.TURNSTILE_BACKEND_URL || "https://des-call.onrender.com");

  if (mode === "plan" || mode === "status") {
    let stored = null;
    try {
      stored = await store.read();
      log(`Stored for the backend: ${stored ? `site key ${stored.siteKey}, updated ${stored.updatedAt}` : "nothing yet"}.`);
      if (stored && plan.widget && stored.siteKey !== plan.widget.sitekey) log("Plan: the stored key belongs to another widget; apply replaces it.");
    } catch (err) {
      if (err.exitCode === 3) log(`Storage: ${MIGRATION_HINT}`);
      else throw err;
    }
    let backend = null;
    if (mode === "status" && plan.widget) {
      backend = await waitForBackend({ backendUrl, siteKey: plan.widget.sitekey, fetchImpl, tries: 1, sleep });
      log(`Backend ${backendUrl}: ${backend.state}.`);
    }
    return { mode, plan: plan.action, siteKey: plan.widget?.sitekey || null, hostnames: plan.domains, stored, backend };
  }

  let widget = plan.widget;
  let secret = null;
  let changed = plan.action;
  if (plan.action === "create") {
    widget = await cf.create(plan.domains);
    secret = widget?.secret || null;
    if (secret) mask(secret);
    log(`Created widget "${WIDGET_NAME}" (site key ${widget.sitekey}).`);
  } else if (plan.action === "update") {
    const { secret: updatedSecret, ...updated } = (await cf.update(widget, plan.domains)) || {};
    if (updatedSecret) {
      secret = updatedSecret;
      mask(secret);
    }
    widget = { ...widget, ...updated };
    log(`Updated widget "${WIDGET_NAME}" (site key ${widget.sitekey}).`);
  }
  if (mode === "rotate") {
    const rotated = await cf.rotate(widget.sitekey);
    secret = rotated?.secret || null;
    if (secret) mask(secret);
    changed = "rotated";
    log("Rotated the secret; the previous one keeps working at Cloudflare for 2 hours.");
  }
  if (!secret) {
    const full = await cf.get(widget.sitekey);
    secret = full?.secret || null;
    if (secret) mask(secret);
  }
  if (!secret) throw new ProvisionError("Cloudflare did not return the widget secret.");

  await store.write({ siteKey: widget.sitekey, secret, hostnames: plan.domains, mode: "managed", by: env.GITHUB_ACTOR ? `github-actions:${env.GITHUB_ACTOR}` : "github-actions" });
  secret = null;
  log("Stored the keys in public.turnstile_config (the backend reads them within 60 s, no redeploy).");

  const backend = await waitForBackend({ backendUrl, siteKey: widget.sitekey, fetchImpl, sleep });
  if (backend.state === "live") log(`Backend ${backendUrl} serves the new site key (mode ${backend.mode}).`);
  else if (backend.state === "not_deployed") log(`Backend ${backendUrl} does not have the Turnstile code yet; it picks the key up after the next deploy.`);
  else if (backend.state === "off") log("Backend has the key but the check is switched off (Güvenlik Merkezi or TURNSTILE_ENFORCE).");
  else log("Backend has not picked the key up yet (Render may be asleep); it reads it within 60 s of its next request.");
  return { mode, plan: changed, siteKey: widget.sitekey, hostnames: plan.domains, backend };
}

function summaryMarkdown(result) {
  const lines = [
    "## Cloudflare Turnstile",
    "",
    `| | |`,
    `|---|---|`,
    `| Mode | ${result.mode} |`,
    `| Widget | ${WIDGET_NAME} (managed) |`,
    `| Result | ${result.plan} |`,
    `| Site key (public) | ${result.siteKey ? `\`${result.siteKey}\`` : "none yet"} |`,
    `| Hostnames | ${(result.hostnames || []).join(", ")} |`,
  ];
  if (result.backend) lines.push(`| Backend | ${result.backend.state}${result.backend.mode ? ` (${result.backend.mode})` : ""} |`);
  lines.push("", "The secret key is never shown. Switch the check in Admin Panel > Security center > Human check.");
  return lines.join("\n");
}

async function main() {
  const fs = await import("node:fs");
  const mode = process.argv[2] || "plan";
  const inActions = process.env.GITHUB_ACTIONS === "true";
  try {
    const result = await run({
      mode,
      env: process.env,
      log: (line) => console.log(line),
      // GitHub hides a masked value from every later log line; the command itself is
      // consumed by the runner and is not shown.
      mask: (value) => {
        if (inActions) process.stdout.write(`::add-mask::${value}\n`);
      },
    });
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryMarkdown(result)}\n`);
  } catch (err) {
    const msg = err instanceof ProvisionError ? err.message : `Unexpected error: ${err?.message || err}`;
    console.log(inActions ? `::error title=Turnstile::${msg}` : msg);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Cloudflare Turnstile\n\n${msg}\n`);
    process.exit(err?.exitCode || 1);
  }
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();
if (isMain) main();
