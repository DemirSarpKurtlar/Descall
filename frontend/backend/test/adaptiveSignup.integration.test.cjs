"use strict";

/**
 * Uyarlanan kart (growth 1B) server side, against the real /auth router and an in-memory
 * Supabase: POST /identify (new / registered, rate limit), sign-in with the email as the
 * identifier, the passwordless sign-up, GET /password/range/:prefix (k-anonymity proxy with a
 * mocked breach list), POST /username/ideas and the card's measurement (breach_fixed event,
 * signup_attempts.flow).
 */

process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.FEEDBACK_EMAIL_FROM = "support@descall.com";

const http = require("http");
const crypto = require("crypto");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const realFetch = global.fetch;
const rangeCalls = [];
const BREACHED = "galatasaray1905";
const breachedHash = crypto.createHash("sha1").update(BREACHED).digest("hex").toUpperCase();
global.fetch = async (url, opts) => {
  if (url === "https://api.resend.com/emails") return { ok: true, json: async () => ({ id: "fake" }) };
  if (String(url).startsWith("https://api.pwnedpasswords.com/range/")) {
    const prefix = String(url).slice(-5);
    rangeCalls.push({ prefix, padding: opts?.headers?.["Add-Padding"] });
    const lines = [`${"0".repeat(35)}:0`, `${"A".repeat(35)}:3`];
    if (prefix === breachedHash.slice(0, 5)) lines.push(`${breachedHash.slice(5)}:48312`);
    return { ok: true, text: async () => lines.join("\r\n") };
  }
  return realFetch(url, opts);
};

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({ users: [], analytics_events: [], signup_attempts: [] });
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const authRouter = require("../routes/auth");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", { sockets: { sockets: new Map() } });
  app.use("/api/auth", authRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/api/auth` };
}

async function req(base, method, urlPath, { body, headers } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const { server, base } = await startServer();
  try {
    // 1. A normal card sign-up that replaced a breached password with the suggested one.
    let r = await req(base, "POST", "/register", {
      body: {
        username: "demirkaya",
        password: "Vapur-Simit-Kanat-Lodos-47",
        email: "Demir.Kaya@Example.com",
        termsAccepted: true,
        birthDate: "2006-03-14",
        card: { surface: "site", breachWarned: true, fixedVia: "suggested" },
      },
    });
    assert(r.status === 201 && r.body.token, "card register succeeds: " + JSON.stringify(r.body));
    await wait(30);
    const fixed = fake._tables.analytics_events.rows.filter((e) => e.event === "breach_fixed");
    assert(fixed.length === 1 && fixed[0].props.method === "suggested" && fixed[0].props.source === "site", "breach_fixed recorded with method + surface: " + JSON.stringify(fixed));
    const attempts = fake._tables.signup_attempts.rows;
    assert(attempts.some((a) => a.status === "completed" && a.flow === "card" && a.method === "email"), "signup_attempts row has flow=card: " + JSON.stringify(attempts));

    // 2. Identify: the address just used is registered (fresh holder), another is new.
    r = await req(base, "POST", "/identify", { body: { email: "demir.kaya@example.com", surface: "app", visitorKey: "visitor_abcdef12" } });
    assert(r.status === 200 && r.body.status === "registered", "registered email identified: " + JSON.stringify(r.body));
    assert(r.body.emailHint === "d***@example.com", "masked hint: " + r.body.emailHint);
    assert(!("methods" in r.body) && !("provider" in r.body), "identify never discloses sign-in methods");
    await wait(30);
    const routed = fake._tables.analytics_events.rows.filter((e) => e.event === "identifier_routed");
    assert(routed.length === 1 && routed[0].visitor_key === "visitor_abcdef12" && routed[0].props.source === "app", "identifier_routed recorded: " + JSON.stringify(routed));
    r = await req(base, "POST", "/identify", { body: { email: "yeni.kisi@example.com" } });
    assert(r.status === 200 && r.body.status === "new" && !r.body.emailHint, "new email: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/identify", { body: { email: "not-an-email" } });
    assert(r.status === 400 && r.body.code === "EMAIL_INVALID", "invalid email refused");
    r = await req(base, "POST", "/identify", { body: { email: "abc@" } });
    assert(r.status === 400 && r.body.code === "EMAIL_INVALID", "a malformed email stays an email error");

    // 2b. Identify by username: same shape, no email hint, no sign-in methods; unknown -> new.
    r = await req(base, "POST", "/identify", { body: { username: "DemirKaya", surface: "site", visitorKey: "visitor_abcdef12" } });
    assert(r.status === 200 && r.body.status === "registered", "registered username identified: " + JSON.stringify(r.body));
    assert(JSON.stringify(Object.keys(r.body)) === JSON.stringify(["status"]), "username lookup carries nothing else (no emailHint): " + JSON.stringify(r.body));
    r = await req(base, "POST", "/identify", { body: { username: "@demirkaya" } });
    assert(r.status === 200 && r.body.status === "registered", "a leading @ is ignored");
    r = await req(base, "POST", "/identify", { body: { username: "kimseyok42" } });
    assert(r.status === 200 && r.body.status === "new" && JSON.stringify(Object.keys(r.body)) === JSON.stringify(["status"]), "unknown username is new, nothing else: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/identify", { body: { username: "demir kaya" } });
    assert(r.status === 400 && r.body.code === "USERNAME_INVALID", "a name with a space is refused");
    r = await req(base, "POST", "/identify", { body: { username: { $ne: "" } } });
    assert(r.status === 400, "a non-string username is refused: " + r.status);
    await wait(30);
    const routedByName = fake._tables.analytics_events.rows.filter((e) => e.event === "identifier_routed" && e.props.source === "site");
    assert(routedByName.length === 1, "identifier_routed recorded for the username route: " + JSON.stringify(routedByName));

    // 3. Sign in with the email (any case) or the username; wrong password stays generic.
    r = await req(base, "POST", "/login", { body: { username: "DEMIR.kaya@example.com", password: "Vapur-Simit-Kanat-Lodos-47" } });
    assert(r.status === 200 && r.body.token && r.body.user?.username === "demirkaya", "login by email: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/login", { body: { username: "demirkaya", password: "Vapur-Simit-Kanat-Lodos-47" } });
    assert(r.status === 200 && r.body.token, "login by username still works");
    r = await req(base, "POST", "/login", { body: { username: "demir.kaya@example.com", password: "wrong-password" } });
    assert(r.status === 401 && r.body.error === "Invalid username or password.", "wrong password by email is generic");
    r = await req(base, "POST", "/login", { body: { username: "nobody@example.com", password: "wrong-password" } });
    assert(r.status === 401 && r.body.error === "Invalid username or password.", "unknown email is the same generic answer");

    // 4. Passwordless sign-up: no password stored, cannot sign in with any password.
    r = await req(base, "POST", "/register", {
      body: {
        username: "sifresiz",
        passwordless: true,
        email: "sifresiz@example.com",
        termsAccepted: true,
        birthDate: "2001-01-01",
        card: { surface: "ios", breachWarned: true, fixedVia: "own" },
      },
    });
    assert(r.status === 201 && r.body.token && r.body.passwordless === true, "passwordless register: " + JSON.stringify(r.body));
    const pk = fake._tables.users.rows.find((u) => u.username === "sifresiz");
    assert(pk && pk.password_hash === null && pk.auth_provider === "passkey", "no password hash, provider passkey: " + JSON.stringify(pk));
    await wait(30);
    const pkFixed = fake._tables.analytics_events.rows.filter((e) => e.event === "breach_fixed" && e.props.source === "ios");
    assert(pkFixed.length === 1 && pkFixed[0].props.method === "passkey", "passwordless counts as the passkey fix");
    r = await req(base, "POST", "/login", { body: { username: "sifresiz@example.com", password: "anything-at-all" } });
    assert(r.status === 401, "a passwordless account has no password sign-in");
    // A password sign-up still needs a password.
    r = await req(base, "POST", "/register", { body: { username: "nopass", email: "nopass@example.com", termsAccepted: true, birthDate: "2001-01-01" } });
    assert(r.status === 400, "password still required without passwordless: " + JSON.stringify(r.body));
    // The email of a registered account is taken for sign-up (the card routes it to sign-in instead).
    r = await req(base, "POST", "/register", { body: { username: "other1", password: "Kayik-Bulut-Defne-28", email: "demir.kaya@example.com", termsAccepted: true, birthDate: "2001-01-01" } });
    assert(r.status === 409 && r.body.code === "email_taken", "email_taken unchanged: " + JSON.stringify(r.body));

    // 5. Breach range proxy: 5 hex characters only, padding asked, padding rows dropped, cached.
    process.env.PASSWORD_HIBP = "1";
    r = await req(base, "GET", `/password/range/${breachedHash.slice(0, 5).toLowerCase()}`);
    assert(r.status === 200, "range ok: " + r.status);
    assert(r.text.includes(`${breachedHash.slice(5)}:48312`) && !r.text.includes(":0"), "range body has the count, no padding: " + r.text);
    assert(rangeCalls.length === 1 && rangeCalls[0].padding === "true", "asked the list with padding");
    r = await req(base, "GET", `/password/range/${breachedHash.slice(0, 5)}`);
    assert(r.status === 200 && rangeCalls.length === 1, "second lookup served from cache");
    r = await req(base, "GET", "/password/range/XYZ12");
    assert(r.status === 400, "bad prefix refused");
    r = await req(base, "GET", `/password/range/${breachedHash}`);
    assert(r.status === 400 || r.status === 404, "a full hash is never accepted");
    process.env.PASSWORD_HIBP = "0";
    r = await req(base, "GET", "/password/range/ABCDE");
    assert(r.status === 200 && r.text === "", "breach check off: empty range");

    // 6. Username ideas: taken, reserved and invalid ones are dropped, order kept.
    r = await req(base, "POST", "/username/ideas", { body: { candidates: ["demirkaya", "demir.k", "admin", "dkaya", "a", "x".repeat(30), "@demirk07", "DEMIRKAYA"] } });
    assert(r.status === 200, "ideas ok");
    assert(JSON.stringify(r.body.free) === JSON.stringify(["demir.k", "dkaya", "demirk07"]), "free ideas: " + JSON.stringify(r.body));

    // 7. Identify is rate limited per address (hard ceiling).
    let limited = false;
    for (let i = 0; i < 45 && !limited; i += 1) {
      r = await req(base, "POST", "/identify", { body: { email: `kisi${i}@example.com` } });
      if (r.status === 429) limited = true;
    }
    assert(limited, "identify gets 429 after the ceiling");
    console.log("adaptiveSignup.integration: all checks passed");
  } finally {
    server.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
