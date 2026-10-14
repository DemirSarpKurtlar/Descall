"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";

const { decideSession, SESSION_LESS_ACCEPT_BEFORE_MS } = require("./sessionGuard");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const before = Math.floor((SESSION_LESS_ACCEPT_BEFORE_MS - 86_400_000) / 1000);
const after = Math.floor((SESSION_LESS_ACCEPT_BEFORE_MS + 86_400_000) / 1000);

assert(decideSession({ sub: "u", iat: before }).ok, "legacy token without sid stays valid");
const fresh = decideSession({ sub: "u", iat: after });
assert(!fresh.ok && fresh.code === "SESSION_REQUIRED", "new token without sid is rejected");

const missing = decideSession({ sub: "u", sid: "gone", iat: after }, { activeIds: new Set(["other"]) });
assert(!missing.ok && missing.code === "SESSION_REVOKED", "sid missing from active sessions is revoked");

const present = decideSession({ sub: "u", sid: "live", iat: after }, { activeIds: ["live"] });
assert(present.ok, "sid still in active sessions is allowed");

const supabase = require("../db/supabase");
const { sessionAllowed } = require("./sessionGuard");
supabase.from = () => ({
  select() { return this; },
  eq() { return this; },
  maybeSingle: async () => {
    throw new Error("db down");
  },
});

(async () => {
  const failed = await sessionAllowed({ sub: "u", sid: "sid-1", iat: after });
  assert(!failed.ok && failed.code === "SESSION_CHECK_FAILED", "lookup failure is closed");
  console.log("sessionGuard.selftest.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
