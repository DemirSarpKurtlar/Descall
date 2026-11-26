"use strict";

/**
 * Apple Watch games scores (routes/adminWatchGames.js) on the real /api/admin chain over
 * the fake db:
 *  - members and signed-out callers are refused (403 / 401), every admin may sync,
 *    including an admin limited to one unrelated section (path maps to "overview");
 *  - each admin reads and writes only their own rows; merges keep the better best and
 *    never shrink plays; unknown games are dropped;
 *  - the POST is step-up exempt (one admin's records, nothing on the platform);
 *  - before the migration the API answers storage "unavailable" instead of failing.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const LIMITED = "00000000-0000-4000-8000-0000000000a2";
const MEMBER = "00000000-0000-4000-8000-0000000000a3";

function user(id, username, extra = {}) {
  return { id, username, is_admin: false, active_sessions: [{ id: `s-${username}` }], ...extra };
}

const fakeOpts = { missingTables: [] };
const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, is_super_admin: true }),
    user(LIMITED, "annconly", { is_admin: true, admin_permissions: ["announcements"] }),
    user(MEMBER, "kaan"),
  ],
  admin_watch_game_scores: [
    { user_id: MEMBER, game: "runner", mode: "", best: 999, plays: 1, updated_at: "2026-11-01T00:00:00.000Z" },
  ],
}, fakeOpts);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const { STEP_UP_EXEMPT } = require("../middleware/adminSecondFactor");
const perms = require("../lib/adminPermissions");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", { to: () => ({ emit() {} }), emit() {}, sockets: { sockets: new Map(), adapter: { rooms: new Map() } } });
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, body: json };
}

const session = (id, username) => signToken({ id, username, sid: `s-${username}` });
const P = "/api/admin/watch-games/scores";

(async () => {
  assert(perms.sectionForPath("/watch-games/scores") === "overview", "path maps to overview");
  assert(STEP_UP_EXEMPT.some((re) => re.test("/watch-games/scores")), "score sync is step-up exempt");
  assert(!STEP_UP_EXEMPT.some((re) => re.test("/watch-games/scores/x")), "nothing else under it is exempt");

  const { server, base } = await startServer();
  const owner = session(OWNER, "admin");
  const limited = session(LIMITED, "annconly");
  const member = session(MEMBER, "kaan");
  try {
    let r = await call(base, "GET", P);
    assert(r.status === 401 || r.status === 403, `signed out refused: ${r.status}`);
    r = await call(base, "GET", P, { token: member });
    assert(r.status === 403, `member read refused: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", P, { token: member, body: { scores: [{ game: "runner", mode: "", best: 5000, plays: 2 }] } });
    assert(r.status === 403, `member write refused: ${r.status}`);
    assert(fake._tables.admin_watch_game_scores.rows.find((x) => x.user_id === MEMBER).best === 999, "member row untouched");

    r = await call(base, "GET", P, { token: owner });
    assert(r.status === 200 && r.body.storage === "ok" && Array.isArray(r.body.scores) && r.body.scores.length === 0, `owner empty: ${r.status} ${JSON.stringify(r.body)}`);

    r = await call(base, "POST", P, {
      token: owner,
      body: { scores: [{ game: "runner", mode: "", best: 41, plays: 7 }, { game: "sudoku", mode: "easy", best: 300, plays: 2 }, { game: "tictactoe", mode: "", best: 3 }] },
    });
    assert(r.status === 200 && r.body.scores.length === 2, `owner write: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", P, {
      token: owner,
      body: { scores: [{ game: "runner", mode: "", best: 20, plays: 3 }, { game: "sudoku", mode: "easy", best: 250, plays: 1 }] },
    });
    const by = Object.fromEntries(r.body.scores.map((x) => [`${x.game}:${x.mode}`, x]));
    assert(by["runner:"].best === 41 && by["runner:"].plays === 7, `higher best kept: ${JSON.stringify(by["runner:"])}`);
    assert(by["sudoku:easy"].best === 250 && by["sudoku:easy"].plays === 2, `faster time wins, plays kept: ${JSON.stringify(by["sudoku:easy"])}`);
    assert(r.body.summary.plays === 9 && r.body.summary.games === 2, `summary: ${JSON.stringify(r.body.summary)}`);
    const ownerRows = fake._tables.admin_watch_game_scores.rows.filter((x) => x.user_id === OWNER);
    assert(ownerRows.length === 2 && !ownerRows.some((x) => x.game === "tictactoe"), "only known games stored");

    r = await call(base, "GET", P, { token: limited });
    assert(r.status === 200 && r.body.scores.length === 0, `limited admin sees only their own (none): ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", P, { token: limited, body: { scores: [{ game: "chess", mode: "hard", best: 1, plays: 1 }] } });
    assert(r.status === 200 && r.body.scores.length === 1 && r.body.scores[0].game === "chess", `limited admin write: ${r.status}`);
    r = await call(base, "POST", P, { token: limited, body: { scores: "x" } });
    assert(r.status === 400 && r.body.code === "BAD_SCORES", `bad body: ${r.status}`);

    // Before the migration: storage "unavailable", no error.
    fakeOpts.missingTables.push("admin_watch_game_scores");
    r = await call(base, "GET", P, { token: owner });
    assert(r.status === 200 && r.body.storage === "unavailable" && r.body.scores.length === 0, `missing table read: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", P, { token: owner, body: { scores: [{ game: "runner", mode: "", best: 99, plays: 9 }] } });
    assert(r.status === 200 && r.body.storage === "unavailable", `missing table write: ${r.status} ${JSON.stringify(r.body)}`);
    fakeOpts.missingTables.length = 0;
    console.log("adminWatchGames integration ok");
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
