"use strict";

/** GET/PUT /api/me/appearance: own row only, sanitized, signed-in only. */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: "u-a", username: "demir", active_sessions: [{ id: "s-a" }] },
    { id: "u-b", username: "ayse", active_sessions: [{ id: "s-b" }] },
  ],
  user_appearance_settings: [{ user_id: "u-b", settings: { themeMode: "light", accentColor: "#EC4899" }, updated_at: "2026-10-01T00:00:00.000Z" }],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const router = require("../routes/meAppearance");
const { sanitizeAppearance } = require("../lib/appearanceSettings");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function call(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function run() {
  assert(JSON.stringify(sanitizeAppearance({ themeMode: "auto", accentColor: "#8e6cf6", fontStep: 2, x: 1 })) === JSON.stringify({ themeMode: "auto", accentColor: "#8E6CF6", fontStep: 2 }), "sanitize keeps known keys");
  assert(Object.keys(sanitizeAppearance({ themeMode: "neon", accentColor: "red", fontStep: 7, reduceMotion: "1" })).length === 0, "sanitize drops bad values");

  const app = express();
  app.use(express.json());
  app.use("/api/me", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const a = signToken({ id: "u-a", username: "demir", sid: "s-a" });
  const b = signToken({ id: "u-b", username: "ayse", sid: "s-b" });
  const rows = () => fake._tables.user_appearance_settings.rows;
  try {
    let r = await call(base, "GET", "/api/me/appearance");
    assert(r.status === 401, "anonymous refused");
    r = await call(base, "PUT", "/api/me/appearance", { body: { appearance: { themeMode: "dark" } } });
    assert(r.status === 401, "anonymous write refused");

    r = await call(base, "GET", "/api/me/appearance", { token: a });
    assert(r.status === 200 && r.body.appearance === null, "nothing saved yet");

    r = await call(base, "PUT", "/api/me/appearance", { token: a, body: { appearance: { themeMode: "auto", accentColor: "#30B05A", fontStep: 3, reduceMotion: true, user_id: "u-b" } } });
    assert(r.status === 200 && r.body.appearance.accentColor === "#30B05A" && r.body.updatedAt, "own appearance saved");
    const mine = rows().find((x) => x.user_id === "u-a");
    assert(mine && mine.settings.fontStep === 3 && !("user_id" in mine.settings), "stored sanitized under the caller");
    assert(rows().find((x) => x.user_id === "u-b").settings.themeMode === "light", "another user's row untouched");

    r = await call(base, "PUT", "/api/me/appearance", { token: a, body: { appearance: { reduceTransparency: true } } });
    assert(r.status === 200 && r.body.appearance.fontStep === 3 && r.body.appearance.reduceTransparency === true, "patch merges");

    r = await call(base, "PUT", "/api/me/appearance", { token: a, body: { appearance: { accentColor: "url(javascript:1)" } } });
    assert(r.status === 400, "nothing valid -> 400");

    r = await call(base, "GET", "/api/me/appearance", { token: b });
    assert(r.status === 200 && r.body.appearance.accentColor === "#EC4899" && r.body.appearance.fontStep === undefined, "each user reads their own");
    console.log("meAppearance.integration.test ok");
  } finally {
    server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
