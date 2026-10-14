"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-xx";

const express = require("express");
const jwt = require("jsonwebtoken");
const supabase = require("../db/supabase");
const { resetLimits } = require("./rateLimit");
const { toPublicUser } = require("./userProfile");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const raw = {
  id: "user-1",
  username: "ada",
  password_hash: "secret-hash",
  google_id: "gid",
  email: "ada@descall.com",
  display_name: "Ada",
};
const pub = toPublicUser(raw);
assert(pub.id === "user-1" && pub.username === "ada", "public user keeps identity");
assert(!("password_hash" in pub) && !("google_id" in pub) && !("email" in pub), "settings payload drops secrets");

let inserted = null;
supabase.from = (table) => {
  if (table === "users") {
    return {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: { active_sessions: [{ id: "sid-1" }] }, error: null }),
    };
  }
  return {
    insert(row) {
      inserted = row;
      return { select: async () => ({ data: [{ id: "err-1" }], error: null }) };
    },
  };
};

const errorsRouter = require("../routes/errors");
const app = express();
app.use(express.json());
app.use("/api/errors", errorsRouter);

function post(body, token) {
  return new Promise((resolve) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      const headers = { "content-type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(`http://127.0.0.1:${port}/api/errors`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      server.close(() => resolve({ status: res.status, json }));
    });
  });
}

(async () => {
  resetLimits();
  const anon = await post({ message: "boom", userId: "forged", username: "attacker" });
  assert(anon.status === 200, "anonymous report is accepted");
  assert(inserted.user_id === "anonymous", "client userId is ignored");
  assert(inserted.user_id !== "forged", "forged id is not stored");

  const token = jwt.sign({ sub: "real-user", username: "ada", sid: "sid-1" }, process.env.JWT_SECRET);
  const authed = await post({ message: "boom", userId: "forged", username: "attacker" }, token);
  assert(authed.status === 200, "authed report is accepted");
  assert(inserted.user_id === "real-user", "reporter id comes from the token");

  resetLimits();
  let limited = null;
  for (let i = 0; i < 31; i += 1) {
    limited = await post({ message: "again" });
  }
  assert(limited.status === 429, "error ingest is rate limited");
  console.log("clientErrorIngest.selftest.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
