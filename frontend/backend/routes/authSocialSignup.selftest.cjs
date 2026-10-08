"use strict";

// Sign in with Google / Apple: a NEW account is only created after the app sent
// termsAccepted + birthDate (428 <provider>_signup_required otherwise); existing
// accounts log in unchanged. Runs the real /auth router against in-memory mocks
// of Supabase, google-auth-library and Apple token verification.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";
process.env.JWT_SECRET = process.env.JWT_SECRET || "selftest-jwt-secret-selftest-jwt-secret";
process.env.GOOGLE_CLIENT_ID = "selftest-client.apps.googleusercontent.com";

const path = require("path");
const Module = require("module");

const inserts = [];
const EXISTING_GOOGLE = { id: "u-google", username: "gexisting", google_id: "g-existing", email: "old@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", birth_date: null };
const EXISTING_APPLE = { id: "u-apple", username: "aexisting", apple_sub: "a-existing", email_confirmed_at: null, birth_date: null };

function builder(table) {
  const st = { table, op: "select", filters: {}, payload: null };
  const result = (single) => {
    if (st.op === "insert") {
      inserts.push({ table, payload: st.payload });
      const row = Array.isArray(st.payload) ? st.payload[0] : st.payload;
      return { data: { id: "u-new", ...row }, error: null };
    }
    if (table === "users" && st.op === "select") {
      if (st.filters.google_id === "g-existing") return { data: EXISTING_GOOGLE, error: null };
      if (st.filters.apple_sub === "a-existing") return { data: EXISTING_APPLE, error: null };
      if (st.filters.id) return { data: { id: st.filters.id, active_sessions: [] }, error: null };
      if (st.filters.username) return { data: null, error: null };
      return { data: single ? null : [], error: null };
    }
    return { data: single ? null : [], error: null, count: 0 };
  };
  const b = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve, reject) => Promise.resolve(result(false)).then(resolve, reject);
        }
        if (prop === "single" || prop === "maybeSingle") return () => Promise.resolve(result(true));
        return (...args) => {
          if (prop === "insert" || prop === "upsert") {
            st.op = "insert";
            st.payload = args[0];
          } else if (prop === "update") st.op = st.op === "insert" ? "insert" : "update";
          else if (prop === "delete") st.op = "delete";
          else if (prop === "eq" || prop === "ilike") st.filters[args[0]] = args[1];
          return b;
        };
      },
    }
  );
  return b;
}

const supabaseMock = {
  from: (table) => builder(table),
  rpc: () => Promise.resolve({ data: null, error: null }),
  storage: { from: () => ({}) },
};

class OAuth2ClientMock {
  async verifyIdToken({ idToken }) {
    const map = {
      "tok-existing": { sub: "g-existing", email: "old@example.com", email_verified: true },
      "tok-new": { sub: "g-new", email: "fresh@example.com", email_verified: true, name: "Fresh" },
    };
    const payload = map[idToken];
    if (!payload) throw new Error("bad token");
    return { getPayload: () => payload };
  }
}

const appleMock = {
  verifyIdentityToken: async (token) => {
    if (token === "apple-existing") return { sub: "a-existing", email: null, emailVerified: false, isPrivateEmail: true };
    if (token === "apple-new") return { sub: "a-new", email: null, emailVerified: false, isPrivateEmail: true };
    throw new Error("bad token");
  },
};

const backendRoot = path.resolve(__dirname, "..");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "google-auth-library") return { OAuth2Client: OAuth2ClientMock };
  if (parent && (request === "../db/supabase" || request === "./db/supabase")) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (resolved === path.join(backendRoot, "db", "supabase")) return supabaseMock;
  }
  if (parent && request === "../lib/appleAuth" && parent.filename === path.join(backendRoot, "routes", "auth.js")) return appleMock;
  return origLoad.apply(this, arguments);
};

const express = require("express");
const router = require("./auth");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function main() {
  const app = express();
  app.use(express.json());
  app.set("io", null);
  app.use("/auth", router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  const post = async (route, body) => {
    const r = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const userInserts = () => inserts.filter((i) => i.table === "users").length;

  try {
    // Google, Login tab, new account → 428, nothing created.
    let r = await post("/google", { credential: "tok-new" });
    assert(r.status === 428, `google new w/o terms → 428 (got ${r.status})`);
    assert(r.body.code === "google_signup_required" && r.body.requiresSignup === true, "google_signup_required code");
    assert(/Register tab/.test(r.body.error), "older clients get an actionable message");
    assert(userInserts() === 0, "no user created without terms + DOB");

    // Terms but no DOB → still 428.
    r = await post("/google", { credential: "tok-new", termsAccepted: true });
    assert(r.status === 428 && userInserts() === 0, "terms without DOB → 428");

    // DOB but no terms → still 428.
    r = await post("/google", { credential: "tok-new", birthDate: "2000-01-01" });
    assert(r.status === 428 && userInserts() === 0, "DOB without terms → 428");

    // Under 13 → 403 under_age, nothing created.
    const kid = new Date();
    kid.setFullYear(kid.getFullYear() - 10);
    r = await post("/google", { credential: "tok-new", termsAccepted: true, birthDate: kid.toISOString().slice(0, 10) });
    assert(r.status === 403 && r.body.code === "under_age", `under 13 blocked (got ${r.status} ${r.body.code})`);
    assert(userInserts() === 0, "no user created for under 13");

    // Invalid DOB → 400.
    r = await post("/google", { credential: "tok-new", termsAccepted: true, birthDate: "not-a-date" });
    assert(r.status === 400 && r.body.code === "birth_date_invalid", "invalid DOB → 400");

    // Terms + DOB → created with birth_date + terms_accepted_at.
    r = await post("/google", { credential: "tok-new", termsAccepted: true, birthDate: "2000-02-03" });
    assert(r.status === 200 && r.body.token && r.body.isNewUser === true, `google signup ok (got ${r.status} ${JSON.stringify(r.body).slice(0, 200)})`);
    const created = inserts.filter((i) => i.table === "users").pop();
    const row = Array.isArray(created.payload) ? created.payload[0] : created.payload;
    assert(row.birth_date === "2000-02-03", "birth_date stored");
    assert(row.terms_accepted_at, "terms_accepted_at stored");
    assert(row.google_id === "g-new", "google_id stored");

    // Existing Google account, Login tab, no terms/DOB → logs in unchanged.
    const before = userInserts();
    r = await post("/google", { credential: "tok-existing" });
    assert(r.status === 200 && r.body.token && r.body.isNewUser === false, `existing google login unchanged (got ${r.status})`);
    assert(userInserts() === before, "existing login creates nothing");

    // Bad Google token → 401.
    r = await post("/google", { credential: "tok-bad" });
    assert(r.status === 401, "bad google token → 401");

    // Apple keeps the same behaviour through the shared gate.
    r = await post("/apple", { identityToken: "apple-new" });
    assert(r.status === 428 && r.body.code === "apple_signup_required", "apple new w/o terms → 428 apple_signup_required");
    r = await post("/apple", { identityToken: "apple-existing" });
    assert(r.status === 200 && r.body.token, `existing apple login unchanged (got ${r.status})`);
  } finally {
    server.close();
  }
  console.log("authSocialSignup.selftest.cjs: ok");
  // Fire-and-forget analytics/notify timers may keep the loop alive.
  setTimeout(() => process.exit(0), 50).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
