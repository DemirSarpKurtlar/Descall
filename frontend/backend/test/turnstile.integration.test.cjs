"use strict";

/**
 * Cloudflare Turnstile (lib/turnstile.js, routes/turnstile.js, routes/auth.js hooks):
 * siteverify outcomes (valid, refused, timeout -> fail-open, 5xx, bad secret, wrong
 * hostname / action), enforcement off / monitor, the no-token fallback budget, which
 * routes ask for the check, the sign-in step-up after wrong passwords, the public config
 * and bridge page, the admin status and the security settings switch.
 * Cloudflare is mocked; nothing leaves the machine.
 */

process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.FEEDBACK_EMAIL_FROM = "support@descall.com";
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.TURNSTILE_ENFORCE;
delete process.env.TURNSTILE_HOSTNAMES;

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const SITE_KEY = "0x4AAAAAAAtestSiteKeyDescall";
const SECRET = "0x4AAAAAAAtestSecretKeyDescall-not-real";

/* ---- Cloudflare + Resend mock ---- */
const siteverifyCalls = [];
let cfMode = "pass"; // pass | fail | timeout | 500 | 500once | badsecret | internal | host | action
const TOKENS = { good: "tok-good", bad: "tok-bad" };
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (url === "https://api.resend.com/emails") return { ok: true, status: 200, json: async () => ({ id: "fake" }) };
  if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    const params = new URLSearchParams(String(opts.body || ""));
    siteverifyCalls.push(Object.fromEntries(params));
    const token = params.get("response");
    const mode = cfMode;
    if (mode === "timeout") {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    if (mode === "500") return { ok: false, status: 503, json: async () => ({}) };
    if (mode === "500once") {
      cfMode = "pass";
      return { ok: false, status: 502, json: async () => ({}) };
    }
    if (mode === "badsecret") return { ok: true, status: 200, json: async () => ({ success: false, "error-codes": ["invalid-input-secret"] }) };
    if (mode === "internal") return { ok: true, status: 200, json: async () => ({ success: false, "error-codes": ["internal-error"] }) };
    if (token !== TOKENS.good || mode === "fail") return { ok: true, status: 200, json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) };
    const action = mode === "action" ? "something_else" : params.get("__action") || expectedAction;
    return { ok: true, status: 200, json: async () => ({ success: true, hostname: mode === "host" ? "evil.example" : "descall.com", action, challenge_ts: new Date().toISOString(), "error-codes": [] }) };
  }
  return realFetch(url, opts);
};
let expectedAction = "register";

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({ users: [], auth_code_attempts: [], turnstile_config: [], turnstile_stats_hourly: [], system_settings: [] });
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const turnstile = require("../lib/turnstile");
const stats = require("../lib/turnstileStats");
const sec = require("../lib/securitySettings");
const { computeScore } = require("../lib/securityScore");
const { resetLimits } = require("../lib/rateLimit");
const { systemConfig } = require("../runtime/sharedState");
const authRouter = require("../routes/auth");
const turnstileRouter = require("../routes/turnstile");
const { securityHeadersMiddleware } = require("../middleware/securityHeaders");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function startServer() {
  const app = express();
  app.use(securityHeadersMiddleware);
  app.use(express.json());
  app.set("io", { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) });
  app.use("/api/auth", authRouter);
  app.use("/api/turnstile", turnstileRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, body) {
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

let n = 0;
function signup(extra = {}) {
  n += 1;
  return { username: `tsuser${n}`, password: "correct-horse-battery-9", termsAccepted: true, birthDate: "2000-01-15", email: `tsuser${n}@example.com`, ...extra };
}

function configure() {
  process.env.TURNSTILE_SITE_KEY = SITE_KEY;
  process.env.TURNSTILE_SECRET_KEY = SECRET;
}

function unconfigure() {
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
}

function resetAll() {
  turnstile.__resetForTests({ client: fake });
  stats.__resetForTests(fake);
  resetLimits();
  siteverifyCalls.length = 0;
  cfMode = "pass";
  delete process.env.TURNSTILE_ENFORCE;
  delete systemConfig.turnstileMode;
}

(async () => {
  const { server, base } = await startServer();
  try {
    /* ---- 1. not configured: nothing changes ---- */
    resetAll();
    unconfigure();
    let r = await call(base, "POST", "/api/auth/register", signup());
    assert(r.status === 201, "unconfigured: sign-up works without a token " + r.text);
    assert(siteverifyCalls.length === 0, "unconfigured: no siteverify call");
    r = await call(base, "GET", "/api/turnstile/config");
    assert(r.status === 200 && r.body.enabled === false && r.body.siteKey === null, "config says off " + r.text);

    /* ---- 2. verifyToken outcomes (unit) ---- */
    resetAll();
    configure();
    const keys = await turnstile.getKeys();
    assert(keys && keys.source === "env" && keys.siteKey === SITE_KEY, "env keys");
    expectedAction = "register";
    let v = await turnstile.verifyToken(TOKENS.good, { action: "register", ip: "203.0.113.7", keys });
    assert(v.outcome === "pass" && v.hostname === "descall.com", "valid token passes " + JSON.stringify(v));
    const sent = siteverifyCalls[0];
    assert(sent.secret === SECRET && sent.response === TOKENS.good, "secret + token sent");
    assert(sent.remoteip === "203.0.113.7", "remoteip sent");
    assert(/^[0-9a-f-]{36}$/.test(sent.idempotency_key || ""), "idempotency_key is a UUID");
    v = await turnstile.verifyToken(TOKENS.bad, { action: "register", keys });
    assert(v.outcome === "fail" && v.reason === "invalid-input-response", "invalid token fails " + JSON.stringify(v));
    v = await turnstile.verifyToken("", { action: "register", keys });
    assert(v.outcome === "fail" && siteverifyCalls.length === 2, "empty token fails without a call");
    v = await turnstile.verifyToken("x".repeat(3000), { action: "register", keys });
    assert(v.outcome === "fail", "oversized token fails");
    cfMode = "host";
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys });
    assert(v.outcome === "fail" && v.reason === "hostname", "foreign hostname fails");
    cfMode = "action";
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys });
    assert(v.outcome === "fail" && v.reason === "action", "wrong action fails");
    cfMode = "timeout";
    const t0 = Date.now();
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys, timeoutMs: 400 });
    assert(v.outcome === "error" && v.reason === "timeout" && Date.now() - t0 < 2000, "timeout -> error " + JSON.stringify(v));
    assert(turnstile.VERIFY_TIMEOUT_MS === 5000, "5 s siteverify budget");
    cfMode = "500";
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys });
    assert(v.outcome === "error" && v.reason === "http_503", "5xx -> error");
    cfMode = "500once";
    const before = siteverifyCalls.length;
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys });
    assert(v.outcome === "pass" && siteverifyCalls.length === before + 2, "one retry after a 5xx");
    assert(siteverifyCalls[before].idempotency_key === siteverifyCalls[before + 1].idempotency_key, "the retry reuses the idempotency key");
    cfMode = "badsecret";
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys });
    assert(v.outcome === "error" && v.reason === "misconfigured", "bad secret -> error (fail-open)");
    cfMode = "internal";
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys });
    assert(v.outcome === "error", "internal-error -> error");
    // Cloudflare's dummy keys skip the hostname check (their answers say example.com).
    cfMode = "host";
    v = await turnstile.verifyToken(TOKENS.good, { action: "register", keys: { siteKey: "1x00000000000000000000AA", secretKey: "1x0000000000000000000000000000000AA", hostnames: [] } });
    assert(v.outcome === "pass", "test keys skip the hostname check");

    /* ---- 3. register route: always protected ---- */
    resetAll();
    configure();
    expectedAction = "register";
    r = await call(base, "POST", "/api/auth/register", signup({ turnstileToken: TOKENS.good }));
    assert(r.status === 201, "valid token: account created " + r.text);
    r = await call(base, "POST", "/api/auth/register", signup({ turnstileToken: TOKENS.bad }));
    assert(r.status === 403 && r.body.code === "turnstile_failed" && r.body.turnstile?.retry === true, "invalid token refused " + r.text);
    r = await call(base, "POST", "/api/auth/register", signup({ turnstileClient: 1 }));
    assert(r.status === 428 && r.body.code === "turnstile_required", "current client without a token is asked for the check " + r.text);
    assert(turnstile.fallbackUsage().usedThisHour === 0, "asking does not use the fallback budget");
    cfMode = "timeout";
    {
      // Cloudflare down: fail-open, within the 5 s budget.
      const t1 = Date.now();
      r = await call(base, "POST", "/api/auth/register", signup({ turnstileToken: TOKENS.good }));
      assert(r.status === 201, "Cloudflare unreachable: sign-up still works " + r.text);
      assert(Date.now() - t1 < 7000, "fail-open within the timeout");
    }
    cfMode = "pass";
    // Fallback budget: 3 per address per hour without a token, then refused.
    for (let i = 0; i < 3; i += 1) {
      r = await call(base, "POST", "/api/auth/register", signup({ turnstileClient: 1, turnstileUnavailable: "script" }));
      assert(r.status === 201, `fallback ${i + 1} accepted ` + r.text);
    }
    r = await call(base, "POST", "/api/auth/register", signup({ turnstileClient: 1, turnstileUnavailable: "script" }));
    assert(r.status === 428 && r.body.code === "turnstile_required" && r.body.turnstile.retry === false, "budget used up: refused " + r.text);
    r = await call(base, "POST", "/api/auth/register", signup());
    assert(r.status === 428, "an old client without a token shares the same budget");
    // A refused field check never spends a token.
    const calls = siteverifyCalls.length;
    r = await call(base, "POST", "/api/auth/register", signup({ termsAccepted: false, turnstileToken: TOKENS.good }));
    assert(r.status === 400 && siteverifyCalls.length === calls, "field errors come before the check");

    /* ---- 4. enforcement off / monitor ---- */
    resetAll();
    configure();
    process.env.TURNSTILE_ENFORCE = "0";
    r = await call(base, "POST", "/api/auth/register", signup({ turnstileToken: TOKENS.bad }));
    assert(r.status === 201 && siteverifyCalls.length === 0, "TURNSTILE_ENFORCE=0: no check");
    r = await call(base, "GET", "/api/turnstile/config");
    assert(r.body.enabled === false, "config off when enforcement is off");
    delete process.env.TURNSTILE_ENFORCE;
    systemConfig.turnstileMode = "off";
    r = await call(base, "POST", "/api/auth/register", signup());
    assert(r.status === 201, "Güvenlik Merkezi switch off: no check");
    systemConfig.turnstileMode = "monitor";
    r = await call(base, "POST", "/api/auth/register", signup({ turnstileToken: TOKENS.bad }));
    assert(r.status === 201 && siteverifyCalls.length === 1, "monitor: verified but never refused");
    process.env.TURNSTILE_ENFORCE = "enforce";
    r = await call(base, "POST", "/api/auth/register", signup({ turnstileToken: TOKENS.bad }));
    assert(r.status === 403, "env enforce wins over the monitor setting");
    delete process.env.TURNSTILE_ENFORCE;
    delete systemConfig.turnstileMode;

    /* ---- 5. login: step-up only after wrong passwords ---- */
    resetAll();
    configure();
    expectedAction = "login";
    const acct = signup();
    process.env.TURNSTILE_ENFORCE = "0";
    r = await call(base, "POST", "/api/auth/register", acct);
    assert(r.status === 201, "login account");
    delete process.env.TURNSTILE_ENFORCE;
    r = await call(base, "POST", "/api/auth/login", { username: acct.username, password: acct.password, turnstileClient: 1 });
    assert(r.status === 200 && siteverifyCalls.length === 0, "normal sign-in needs no check " + r.text);
    for (let i = 0; i < 3; i += 1) {
      r = await call(base, "POST", "/api/auth/login", { username: acct.username, password: "wrong-password", turnstileClient: 1 });
      assert(r.status === 401, "wrong password " + i);
    }
    assert(turnstile.loginNeedsCheck({ ip: "127.0.0.1", accountKey: `login:acct:${acct.username.toLowerCase()}` }), "3 account failures need the check");
    r = await call(base, "POST", "/api/auth/login", { username: acct.username, password: acct.password, turnstileClient: 1 });
    assert(r.status === 428 && r.body.code === "turnstile_required", "step-up asked " + r.text);
    r = await call(base, "POST", "/api/auth/login", { username: acct.username, password: acct.password, turnstileClient: 1, turnstileToken: TOKENS.bad });
    assert(r.status === 403 && r.body.code === "turnstile_failed", "bad token refused at step-up");
    r = await call(base, "POST", "/api/auth/login", { username: acct.username, password: acct.password, turnstileClient: 1, turnstileToken: TOKENS.good });
    assert(r.status === 200 && r.body.token, "token passes the step-up " + r.text);
    // Another account name from a fresh address: no check.
    assert(!turnstile.loginNeedsCheck({ ip: "198.51.100.9", accountKey: "login:acct:someone" }), "other account, other address: no check");

    /* ---- 6. password reset ---- */
    resetAll();
    configure();
    expectedAction = "password_reset";
    r = await call(base, "POST", "/api/auth/password/forgot", { usernameOrEmail: "nobody@example.com", turnstileClient: 1 });
    assert(r.status === 428, "forgot password asks for the check " + r.text);
    r = await call(base, "POST", "/api/auth/password/forgot", { usernameOrEmail: "nobody@example.com", turnstileToken: TOKENS.good });
    assert(r.status === 200, "forgot password with a token " + r.text);
    r = await call(base, "POST", "/api/auth/password/reset", { usernameOrEmail: "nobody@example.com", code: "000000", newPassword: "another-pass-123", turnstileClient: 1 });
    assert(r.status === 400, "reset: first wrong code needs no check");
    for (let i = 0; i < 2; i += 1) await call(base, "POST", "/api/auth/password/reset", { usernameOrEmail: "nobody@example.com", code: "000000", newPassword: "another-pass-123", turnstileClient: 1 });
    r = await call(base, "POST", "/api/auth/password/reset", { usernameOrEmail: "nobody@example.com", code: "000000", newPassword: "another-pass-123", turnstileClient: 1 });
    assert(r.status === 428, "reset: check after three wrong codes " + r.text);

    /* ---- 7. social sign-up gate (unit, same gate the routes call) ---- */
    resetAll();
    configure();
    expectedAction = "social_signup";
    let g = await turnstile.gate({ body: { turnstileToken: TOKENS.good }, ip: "203.0.113.9" }, { action: "social_signup", ip: "203.0.113.9" });
    assert(g.ok && g.outcome === "pass", "social sign-up token passes");
    g = await turnstile.gate({ body: { turnstileClient: 1 } }, { action: "social_signup", ip: "203.0.113.9" });
    assert(!g.ok && g.status === 428, "social sign-up without a token is asked");
    const authSrc = require("fs").readFileSync(require.resolve("../routes/auth"), "utf8");
    assert((authSrc.match(/action: "social_signup"/g) || []).length === 2, "Google and Apple account creation are both gated");
    assert(/action: "register"/.test(authSrc) && /action: "password_reset"/.test(authSrc) && /loginNeedsCheck/.test(authSrc), "register, reset and login step-up are gated");

    /* ---- 8. config + bridge page ---- */
    resetAll();
    configure();
    r = await call(base, "GET", "/api/turnstile/config");
    assert(r.body.enabled === true && r.body.siteKey === SITE_KEY && r.body.mode === "enforce", "public config " + r.text);
    assert(r.body.actions.login === "stepUp" && r.body.actions.register === "always", "actions");
    assert(/\/api\/turnstile\/frame$/.test(r.body.bridgeUrl), "bridge url");
    assert(!r.text.includes(SECRET), "the secret never leaves the server");
    r = await call(base, "GET", "/api/turnstile/frame");
    const csp = r.headers.get("content-security-policy") || "";
    assert(r.status === 200 && /text\/html/.test(r.headers.get("content-type")), "bridge is HTML");
    assert(!r.headers.get("x-frame-options"), "bridge may be framed by the apps");
    assert(/script-src 'nonce-[^']+' https:\/\/challenges\.cloudflare\.com/.test(csp) && csp.includes("frame-src https://challenges.cloudflare.com"), "bridge CSP " + csp);
    const nonce = csp.match(/'nonce-([^']+)'/)[1];
    assert(r.text.includes(`nonce="${nonce}"`), "inline script carries the nonce");
    assert(r.text.includes(SITE_KEY) && !r.text.includes(SECRET), "bridge has the site key, never the secret");
    for (const origin of ["descall://localhost", "https://localhost", "descall://app", "https://tauri.localhost"]) assert(r.text.includes(origin), "bridge accepts " + origin);
    assert(/e\.source !== window\.parent/.test(r.text) && /parentOrigin\)/.test(r.text), "token posted only to the verified parent origin");
    r = await call(base, "GET", "/api/auth/google/config");
    assert(r.headers.get("x-frame-options") === "DENY", "other API answers still refuse framing");

    /* ---- 9. stats + admin status + score ---- */
    resetAll();
    configure();
    expectedAction = "register";
    await turnstile.gate({ body: { turnstileToken: TOKENS.good } }, { action: "register", ip: "203.0.113.1" });
    await turnstile.gate({ body: { turnstileToken: TOKENS.bad } }, { action: "register", ip: "203.0.113.1" });
    await turnstile.gate({ body: { turnstileUnavailable: "bridge" } }, { action: "register", ip: "203.0.113.1" });
    cfMode = "internal";
    await turnstile.gate({ body: { turnstileToken: TOKENS.good } }, { action: "login", ip: "203.0.113.1" });
    const st = await turnstile.adminStatus({ config: {} });
    assert(st.configured && st.enforcing && st.source === "env" && st.siteKey.includes("…"), "admin status " + JSON.stringify(st));
    assert(st.stats.totals.pass === 1 && st.stats.totals.fail === 1 && st.stats.totals.fallback === 1 && st.stats.totals.failOpen === 1, "24 h totals " + JSON.stringify(st.stats.totals));
    assert(st.stats.byAction.login.failOpen === 1 && st.stats.series.pass.length === 24, "per action + hourly series");
    assert(st.unreachable === true, "Cloudflare trouble is shown");
    assert(turnstile.humanCheckOk(st), "score check passes when enforcing");
    assert(!turnstile.humanCheckOk({ ...st, enforcing: false }), "monitor/off fails the score check");
    const flushed = await stats.flush();
    assert(flushed.written >= 4 && fake._tables.turnstile_stats_hourly.rows.length >= 4, "counters written to the table");
    const scored = computeScore({ config: sec.securityView({ turnstileMode: "monitor" }), admins: [], env: { humanCheck: false, humanCheckConfigured: true } });
    const hc = scored.checks.find((c) => c.id === "humanCheck");
    assert(hc.fix && hc.fix.turnstileMode === "enforce" && hc.action === "apply", "one-step fix back to enforce");
    const scoredNoKey = computeScore({ config: sec.securityView({}), admins: [], env: { humanCheck: false } });
    assert(scoredNoKey.checks.find((c) => c.id === "humanCheck").action === "explain", "no key: explain only");

    /* ---- 10. settings switch ---- */
    assert(sec.validateSettingsPatch({ patch: { turnstileMode: "monitor" } }).patch.turnstileMode === "monitor", "mode patch accepted");
    assert(sec.validateSettingsPatch({ patch: { turnstileMode: "nope" } }).error === "bad_value", "unknown mode refused");
    assert(sec.patchNeedsReason({ turnstileMode: "off" }) && sec.patchNeedsReason({ turnstileMode: "monitor" }) && !sec.patchNeedsReason({ turnstileMode: "enforce" }), "turning it down needs a reason");
    assert(sec.pickSecurityConfig({ turnstileMode: "garbage" }).turnstileMode === "enforce", "stored garbage reads as enforce");
    assert(sec.securityView({}).turnstileMode === "enforce", "default enforce");
    assert(sec.categoryOfKey("turnstileMode") === "signup", "history category");

    /* ---- 11. DB keys (written by the workflow) are picked up without a deploy ---- */
    resetAll();
    unconfigure();
    assert((await turnstile.getKeys()) === null, "no row: not configured");
    fake._tables.turnstile_config.rows.push({ id: "default", site_key: "0x4AAAAAAAfromDb", secret_key: "0x4AAAAAAAdbSecret", hostnames: ["descall.com"], updated_at: new Date().toISOString() });
    const dbKeys = await turnstile.getKeys({ fresh: true });
    assert(dbKeys && dbKeys.source === "db" && dbKeys.siteKey === "0x4AAAAAAAfromDb", "row read " + JSON.stringify(dbKeys && { ...dbKeys, secretKey: "x" }));
    assert(turnstile.allowedHostnames(dbKeys).includes("descall.com"), "row hostnames used");

    console.log("turnstile.integration.test.cjs: all checks passed");
  } finally {
    server.close();
    global.fetch = realFetch;
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
