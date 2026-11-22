"use strict";

/**
 * The bootstrap allow-list (lib/nodeKeys/bootstrapEnv.js) stays in step with the backend
 * source: every environment variable the backend reads is classified SHARED (sent to the PC
 * node) or LOCAL (never sent), no name is both, no listed name is stale, and pick() returns
 * only SHARED names that are set, never a node / platform / OS variable.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const B = require("./bootstrapEnv");

/* ---- the real backend source ---- */
const scanned = B.scanSource();
assert.ok(scanned.size > 80, `the scan found ${scanned.size} names`);
for (const must of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET", "REDIS_URL", "PORT", "DESCALL_NODE_ROLE", "DESCOIN_ANTIBOT_RATES", "DESCALL_CLUSTER_BEAT_MS", "APNS_USE_SANDBOX"]) {
  assert.ok(scanned.has(must), `scan sees ${must}`);
}
const { unclassified, both, stale } = B.audit(scanned);
assert.deepEqual(
  unclassified,
  [],
  `backend reads environment variables that lib/nodeKeys/bootstrapEnv.js does not classify (add each to SHARED, sent to the PC node, or LOCAL, never sent): ${unclassified.map((n) => `${n} (${scanned.get(n).join(", ")})`).join("; ")}`
);
assert.deepEqual(both, [], `SHARED names that are also local: ${both.join(", ")}`);
assert.deepEqual(stale, [], `listed in bootstrapEnv.js but no longer read by the backend: ${stale.join(", ")}`);
assert.equal(new Set(B.SHARED).size, B.SHARED.length, "no duplicate in SHARED");
assert.deepEqual([...B.SHARED], [...B.SHARED].sort(), "SHARED is sorted");

/* ---- node / platform names are never shared ---- */
for (const n of ["REDIS_URL", "PORT", "NODE_ENV", "DESCALL_NODE_ROLE", "DESCALL_NODE_KEY", "DESCALL_NODE_CONTROL_TOKEN", "DESCALL_NODE_ANYTHING_NEW", "RENDER", "RENDER_EXTERNAL_URL", "RENDER_GIT_COMMIT", "RENDER_FUTURE_VAR", "HOME", "PATH", "HOSTNAME", "NODE_OPTIONS", "EDGE_BRIDGE_SECRET", "FFMPEG_PATH", "VERCEL"]) {
  assert.equal(B.isShared(n), false, `${n} is never sent`);
  assert.equal(B.isLocal(n), true, `${n} is local`);
}
for (const n of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET", "TOTP_ENC_KEY", "WEB_PUSH_PRIVATE_KEY", "LIVEKIT_URL"]) assert.ok(B.isShared(n), `${n} is shared`);
assert.equal(B.isShared("lowercase_name"), false);
assert.equal(B.isShared("NOT_A_BACKEND_VAR"), false, "an unclassified name is never sent");

/* ---- pick(): only set SHARED names ---- */
const env = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-value",
  JWT_SECRET: "jwt-value",
  TOTP_ENC_KEY: "",
  APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
  REDIS_URL: "redis://red-internal:6379",
  PORT: "10000",
  NODE_ENV: "production",
  DESCALL_NODE_ROLE: "primary",
  DESCALL_NODE_ID: "render",
  RENDER_EXTERNAL_URL: "https://des-call.onrender.com",
  HOME: "/opt/render",
  PATH: "/usr/bin",
  HOSTNAME: "srv-1",
  SOMETHING_UNCLASSIFIED: "x",
  MEDIA_URL_SECRET: "a".repeat(B.MAX_VALUE + 1),
  GH_TOKEN: "with\u0000nul",
};
const got = B.pick(env);
assert.deepEqual(Object.keys(got).sort(), ["APNS_PRIVATE_KEY", "JWT_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"], `picked: ${Object.keys(got).join(", ")}`);
assert.ok(got.APNS_PRIVATE_KEY.includes("\n"), "multi-line values are kept as they are");
assert.deepEqual(B.pick({}), {}, "nothing set: nothing sent");
assert.deepEqual(Object.keys(B.pick({ LIVEKIT_URL: "wss://x.livekit.cloud" })), ["LIVEKIT_URL"], "LiveKit only when the primary has it");

/* ---- the scanner itself on a fixture tree ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-env-"));
try {
  fs.mkdirSync(path.join(tmp, "lib"));
  fs.mkdirSync(path.join(tmp, "test"));
  fs.mkdirSync(path.join(tmp, "node_modules"));
  fs.writeFileSync(path.join(tmp, "lib", "a.js"), "const a = process.env.ALPHA_ONE; const b = env.BETA; const c = process.env['GAMMA_X'];\n");
  fs.writeFileSync(path.join(tmp, "lib", "b.cjs"), "function flag(name, env = process.env) { return env[name]; }\nflag(\"DELTA_FLAG\");\n");
  fs.writeFileSync(path.join(tmp, "lib", "c.selftest.cjs"), "process.env.ONLY_IN_TESTS = '1';\n");
  fs.writeFileSync(path.join(tmp, "test", "d.js"), "process.env.TEST_DIR_VAR;\n");
  fs.writeFileSync(path.join(tmp, "node_modules", "e.js"), "process.env.DEP_VAR;\n");
  const s = B.scanSource(tmp);
  assert.deepEqual([...s.keys()].sort(), ["ALPHA_ONE", "BETA", "DELTA_FLAG", "GAMMA_X"], `fixture scan: ${[...s.keys()].join(", ")}`);
  const a = B.audit(s);
  assert.deepEqual(a.unclassified, ["ALPHA_ONE", "BETA", "DELTA_FLAG", "GAMMA_X"], "a new read that is not classified fails the selftest");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`bootstrapEnv.selftest: ok (${scanned.size} names read, ${B.SHARED.length} shared, ${B.LOCAL.length} local)`);
