"use strict";

/**
 * Legacy /api/feedback/list, /:id/view, /:id/reply and DELETE /:id expose and
 * change every user's feedback. They must be admin-only (they used to accept
 * any signed-in user) and must not echo database errors to the client.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: "u-admin", username: "demir", is_admin: true, active_sessions: [{ id: "s-a" }] },
    { id: "u-user", username: "ayse", is_admin: false, active_sessions: [{ id: "s-u" }] },
  ],
  user_feedback: [
    { id: "fb-1", user_id: "u-other", username: "mehmet", message: "private text", viewed: false, admin_replies: [], created_at: "2026-10-01T00:00:00.000Z" },
  ],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const router = require("../routes/legacyFeedbackAdmin");

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
  const app = express();
  app.use(express.json());
  app.use("/api/feedback", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: "u-admin", username: "demir", sid: "s-a" });
  const user = signToken({ id: "u-user", username: "ayse", sid: "s-u" });
  const rows = () => fake._tables.user_feedback.rows;
  try {
    let r = await call(base, "GET", "/api/feedback/list");
    assert(r.status === 401, "anonymous list refused");

    r = await call(base, "GET", "/api/feedback/list", { token: user });
    assert(r.status === 403 && !JSON.stringify(r.body).includes("private text"), "non-admin cannot list feedback");
    r = await call(base, "POST", "/api/feedback/fb-1/view", { token: user });
    assert(r.status === 403 && rows()[0].viewed === false, "non-admin cannot mark viewed");
    r = await call(base, "POST", "/api/feedback/fb-1/reply", { token: user, body: { message: "fake admin reply" } });
    assert(r.status === 403 && rows()[0].admin_replies.length === 0, "non-admin cannot reply as admin");
    r = await call(base, "DELETE", "/api/feedback/fb-1", { token: user });
    assert(r.status === 403 && rows().length === 1, "non-admin cannot delete feedback");

    r = await call(base, "GET", "/api/feedback/list", { token: admin });
    assert(r.status === 200 && r.body.feedback?.length === 1, "admin can list feedback");
    r = await call(base, "POST", "/api/feedback/fb-1/reply", { token: admin, body: { message: "thanks" } });
    assert(r.status === 200 && rows()[0].admin_replies.length === 1, "admin can reply");
    r = await call(base, "DELETE", "/api/feedback/fb-1", { token: admin });
    assert(r.status === 200 && rows().length === 0, "admin can delete");

    // Database errors are not echoed to the client.
    const realFrom = fake.from.bind(fake);
    fake.from = (table) => {
      if (table !== "user_feedback") return realFrom(table);
      const q = { select: () => q, order: async () => ({ data: null, error: { message: "relation secret_internal_detail does not exist" } }) };
      return q;
    };
    r = await call(base, "GET", "/api/feedback/list", { token: admin });
    fake.from = realFrom;
    assert(r.status === 500 && !JSON.stringify(r.body).includes("secret_internal_detail"), "db error message not leaked");

    console.log("legacyFeedbackAdmin: all checks passed");
  } finally {
    server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
