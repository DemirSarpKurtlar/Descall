// node scripts/turnstile-provision.selftest.mjs
// Turnstile provisioning (scripts/turnstile-provision.mjs + .github/workflows/cloudflare-turnstile.yml):
// create / update / keep / rotate against a mocked Cloudflare + Supabase, the missing-permission
// and missing-table messages, and a static check that neither the script output nor the
// workflow can print a secret.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_HOSTNAMES,
  MIGRATION_HINT,
  PERMISSION_HINT,
  WIDGET_NAME,
  desiredHostnames,
  planWidget,
  run,
} from "./turnstile-provision.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

const TOKEN = "fake-token-aaaaaaaaaaaaaaaa";
const ACCOUNT = "acc0123456789";
const SERVICE_KEY = "fake-service-aaaaaaaaaaaaaaa";
const WIDGET_SECRET = "0x4AAAAAAAAAAAAAAAAAAAAsecretone";
const ROTATED_SECRET = "0x4AAAAAAAAAAAAAAAAAAAAsecrettwo";

function env(extra = {}) {
  return { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, TURNSTILE_BACKEND_URL: "https://api.test", ...extra };
}

/** Mock Cloudflare + Supabase + backend. */
function world({ widgets = [], auth = true, table = true, backendKey = null } = {}) {
  const state = { widgets: widgets.map((w) => ({ ...w })), stored: null, calls: [] };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    state.calls.push({ method, url, headers: opts.headers || {}, body: opts.body || "" });
    if (url.startsWith("https://api.cloudflare.com/client/v4/accounts/")) {
      assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`);
      if (!auth) return json(403, { success: false, errors: [{ code: 10000, message: "Authentication error" }] });
      const m = url.match(/\/challenges\/widgets(?:\/([^/?]+))?(\/rotate_secret)?/);
      const key = m && m[1] ? decodeURIComponent(m[1]) : null;
      if (method === "GET" && !key) return json(200, { success: true, result: state.widgets.map(({ secret, ...w }) => w) });
      if (method === "GET" && key) return json(200, { success: true, result: state.widgets.find((w) => w.sitekey === key) });
      if (method === "POST" && !key) {
        const body = JSON.parse(opts.body);
        const w = { sitekey: "0x4AAAAAAAnewSiteKey", secret: WIDGET_SECRET, ...body };
        state.widgets.push(w);
        return json(200, { success: true, result: w });
      }
      if (method === "PUT" && key) {
        const w = state.widgets.find((x) => x.sitekey === key);
        Object.assign(w, JSON.parse(opts.body));
        return json(200, { success: true, result: { ...w } });
      }
      if (method === "POST" && m[2]) {
        const w = state.widgets.find((x) => x.sitekey === key);
        w.secret = ROTATED_SECRET;
        return json(200, { success: true, result: { ...w } });
      }
      return json(404, { success: false, errors: [{ code: 404, message: "nope" }] });
    }
    if (url.startsWith("https://proj.supabase.co/rest/v1/turnstile_config")) {
      assert.equal(opts.headers.apikey, SERVICE_KEY);
      if (!table) return json(404, { code: "PGRST205", message: "Could not find the table 'public.turnstile_config' in the schema cache" });
      if (method === "POST") {
        assert.match(opts.headers.Prefer, /resolution=merge-duplicates/);
        state.stored = JSON.parse(opts.body);
        return json(201, {});
      }
      return json(200, state.stored ? [{ site_key: state.stored.site_key, hostnames: state.stored.hostnames, updated_at: state.stored.updated_at }] : []);
    }
    if (url === "https://api.test/api/turnstile/config") {
      return json(200, { enabled: Boolean(backendKey || state.stored), siteKey: backendKey || state.stored?.site_key || null, mode: "enforce" });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  return { state, fetchImpl };
}

async function go(mode, w, extraEnv) {
  const lines = [];
  const masked = [];
  const result = await run({ mode, env: env(extraEnv), fetchImpl: w.fetchImpl, log: (l) => lines.push(l), mask: (v) => masked.push(v), sleep: async () => {} });
  return { result, lines, masked, text: lines.join("\n") };
}

function noSecretsIn(text) {
  for (const s of [TOKEN, SERVICE_KEY, WIDGET_SECRET, ROTATED_SECRET]) assert.ok(!text.includes(s), `log must not contain a secret (${s.slice(0, 8)}…)`);
}

/* ---- hostnames ---- */
assert.deepEqual(desiredHostnames(""), [...BASE_HOSTNAMES]);
assert.ok(BASE_HOSTNAMES.includes("descall.com") && BASE_HOSTNAMES.includes("www.descall.com"), "web hostnames");
assert.ok(BASE_HOSTNAMES.includes("des-call.onrender.com"), "bridge host (apps)");
assert.deepEqual(desiredHostnames("https://Staging.Descall.com/, localhost, bad host!, descall.com").slice(-2), ["staging.descall.com", "localhost"]);
assert.throws(() => desiredHostnames("a.com,b.com,c.com,d.com,e.com"), /allows 10/);

/* ---- plan ---- */
assert.equal(planWidget([], [...BASE_HOSTNAMES]).action, "create");
assert.equal(planWidget([{ name: WIDGET_NAME, sitekey: "k", mode: "managed", domains: [...BASE_HOSTNAMES] }], [...BASE_HOSTNAMES]).action, "keep");
{
  const p = planWidget([{ name: WIDGET_NAME, sitekey: "k", mode: "invisible", domains: ["descall.com", "hand-added.example"] }], [...BASE_HOSTNAMES]);
  assert.equal(p.action, "update");
  assert.ok(p.domains.includes("hand-added.example"), "hand-added hostnames are kept");
  assert.ok(p.missing.includes("www.descall.com"));
}
assert.equal(planWidget([{ name: "Other", sitekey: "o", domains: [] }], [...BASE_HOSTNAMES]).action, "create", "only the widget named Descall counts");

/* ---- apply: create ---- */
{
  const w = world();
  const { result, text, masked } = await go("apply", w);
  assert.equal(result.plan, "create");
  assert.equal(result.siteKey, "0x4AAAAAAAnewSiteKey");
  const created = JSON.parse(w.state.calls.find((c) => c.method === "POST" && c.url.endsWith("/challenges/widgets")).body);
  assert.equal(created.mode, "managed");
  assert.equal(created.name, "Descall");
  assert.deepEqual(created.domains, [...BASE_HOSTNAMES]);
  assert.ok(!("offlabel" in created), "no paid option is sent");
  assert.equal(w.state.stored.secret_key, WIDGET_SECRET, "secret stored for the backend");
  assert.equal(w.state.stored.site_key, "0x4AAAAAAAnewSiteKey");
  assert.deepEqual(masked, [WIDGET_SECRET], "secret masked before use");
  assert.equal(result.backend.state, "live");
  noSecretsIn(text);
  noSecretsIn(JSON.stringify(result));
}

/* ---- apply again: idempotent (keep, still re-stores the same key) ---- */
{
  const w = world({ widgets: [{ name: WIDGET_NAME, sitekey: "0x4AAAAAAAexisting", secret: WIDGET_SECRET, mode: "managed", domains: [...BASE_HOSTNAMES] }] });
  const { result, text, masked } = await go("apply", w);
  assert.equal(result.plan, "keep");
  assert.ok(!w.state.calls.some((c) => c.method === "POST" && c.url.endsWith("/challenges/widgets")), "no second widget");
  assert.ok(!w.state.calls.some((c) => c.method === "PUT"), "no update needed");
  assert.equal(w.state.stored.secret_key, WIDGET_SECRET);
  assert.deepEqual(masked, [WIDGET_SECRET]);
  noSecretsIn(text);
}

/* ---- apply: update a widget missing hostnames ---- */
{
  const w = world({ widgets: [{ name: WIDGET_NAME, sitekey: "0x4AAAAAAAexisting", secret: WIDGET_SECRET, mode: "managed", domains: ["descall.com"] }] });
  const { result, text } = await go("apply", w, { TURNSTILE_EXTRA_HOSTNAMES: "localhost" });
  assert.equal(result.plan, "update");
  const put = JSON.parse(w.state.calls.find((c) => c.method === "PUT").body);
  assert.ok(put.domains.includes("www.descall.com") && put.domains.includes("localhost"));
  assert.ok(w.state.stored.hostnames.includes("localhost"));
  noSecretsIn(text);
}

/* ---- rotate ---- */
{
  const w = world({ widgets: [{ name: WIDGET_NAME, sitekey: "0x4AAAAAAAexisting", secret: WIDGET_SECRET, mode: "managed", domains: [...BASE_HOSTNAMES] }] });
  const { result, masked, text } = await go("rotate", w);
  assert.equal(result.plan, "rotated");
  assert.equal(w.state.stored.secret_key, ROTATED_SECRET);
  assert.ok(masked.includes(ROTATED_SECRET));
  const rot = JSON.parse(w.state.calls.find((c) => c.url.endsWith("/rotate_secret")).body);
  assert.equal(rot.invalidate_immediately, false, "old secret keeps working during the switch");
  noSecretsIn(text);
}

/* ---- plan is read-only ---- */
{
  const w = world();
  const { result } = await go("plan", w);
  assert.equal(result.plan, "create");
  assert.ok(w.state.calls.every((c) => c.method === "GET"), "plan only reads");
}

/* ---- missing permission: clear message naming it, exit code 2 ---- */
{
  const w = world({ auth: false });
  await assert.rejects(go("apply", w), (err) => err.exitCode === 2 && err.message === PERMISSION_HINT && /Account > Turnstile > Edit/.test(err.message));
}

/* ---- migration not applied: clear message, exit code 3 ---- */
{
  const w = world({ table: false });
  await assert.rejects(go("apply", w), (err) => err.exitCode === 3 && err.message === MIGRATION_HINT);
}

/* ---- missing secret names ---- */
await assert.rejects(run({ mode: "apply", env: {}, fetchImpl: async () => { throw new Error("no"); } }), /CLOUDFLARE_API_TOKEN is not set/);

/* ---- the script itself never prints a secret variable ---- */
{
  const src = fs.readFileSync(path.join(here, "turnstile-provision.mjs"), "utf8");
  const printing = src.split("\n").filter((l) => /console\.(log|error|warn|info)|process\.stdout\.write|log\(/.test(l));
  for (const line of printing) {
    if (/::add-mask::/.test(line)) continue;
    assert.ok(!/\b(secret|token|serviceKey|updatedSecret)\b(?![-_"'\s]*(key|=|:))/.test(line.replace(/["'`][^"'`]*["'`]/g, "")), `print line may leak a secret: ${line.trim()}`);
  }
  assert.ok(/::add-mask::\$\{value\}/.test(src), "masking is used");
}

/* ---- static check of the workflow ---- */
{
  const wfRaw = fs.readFileSync(path.join(root, ".github/workflows/cloudflare-turnstile.yml"), "utf8");
  // Comments may name what is forbidden; the checks read the YAML without them.
  const wf = wfRaw.replace(/^\s*#.*$/gm, "");
  assert.match(wf, /^on:\n  workflow_dispatch:/m, "manual only");
  assert.ok(!/^\s+(push|pull_request|schedule):/m.test(wf), "never runs on its own");
  assert.match(wf, /permissions:\n  contents: read/);
  assert.ok(!/set -x|set -o xtrace|bash -x/.test(wf), "no shell tracing");
  assert.ok(!/\b(echo|printf|cat)\b/.test(wf), "no echo / printf / cat in the workflow");
  // ${{ secrets.X }} only inside env: blocks, never inside a run: command.
  const lines = wf.split("\n");
  let inRun = false;
  let runIndent = 0;
  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    if (/^\s*(- )?run:/.test(line)) {
      inRun = true;
      runIndent = indent;
      assert.ok(!/secrets\./.test(line), `secret inside run: ${line.trim()}`);
      assert.ok(!/\$\{\{\s*(inputs|github\.event)/.test(line), `untrusted expression inside run: ${line.trim()}`);
      continue;
    }
    if (inRun && line.trim() && indent <= runIndent) inRun = false;
    if (inRun) assert.ok(!/secrets\.|\$\{\{/.test(line), `expression inside a run block: ${line.trim()}`);
  }
  for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(wf, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`), `${name} passed through env`);
  }
  assert.match(wf, /node scripts\/turnstile-provision\.selftest\.mjs/, "selftest runs before the provisioning");
}

console.log("turnstile-provision.selftest.mjs: ok");
