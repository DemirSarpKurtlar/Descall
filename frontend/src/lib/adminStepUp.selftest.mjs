// Run: node src/lib/adminStepUp.selftest.mjs
// Admin step-up on the client (3.2.0): prompt once on STEP_UP_REQUIRED, retry
// with the token, reuse it for 15 min, gate on ADMIN_2FA_REQUIRED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = new EventTarget();
globalThis.CustomEvent = class extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } };
const m = await import("./adminStepUp.js");

// No host listening → the prompt rejects at once (never hangs a request).
await assert.rejects(m.requestStepUp(), (e) => e.code === "STEP_UP_REQUIRED");

// Host answers with a code → token stored → request retried with the header.
let prompts = 0;
window.addEventListener(m.STEP_UP_EVENT, (e) => {
  e.detail.handled = true;
  prompts += 1;
  queueMicrotask(() => { m.setStepUpToken("tok-1", 900); e.detail.resolve("tok-1"); });
});
const seen = [];
const send = async (headers) => {
  seen.push(headers["X-Admin-Step-Up"] || null);
  if (!headers["X-Admin-Step-Up"]) throw Object.assign(new Error("need code"), { code: "STEP_UP_REQUIRED" });
  return "done";
};
assert.equal(await m.runWithStepUp(send), "done");
assert.deepEqual(seen, [null, "tok-1"]);
assert.equal(prompts, 1);
// Token reused (no new prompt) until it expires.
assert.equal(await m.runWithStepUp(send), "done");
assert.equal(prompts, 1);
assert.deepEqual(m.stepUpHeaders(Date.now() + 15 * 60 * 1000), {}, "expires (renewed a minute early)");

// Parallel requests share one prompt.
m.clearStepUpToken();
const [a, b] = await Promise.all([m.runWithStepUp(send), m.runWithStepUp(send)]);
assert.equal(a, "done"); assert.equal(b, "done");
assert.equal(prompts, 2);

// ADMIN_2FA_REQUIRED → gate event, error rethrown.
let gate = 0;
window.addEventListener(m.ADMIN_2FA_EVENT, () => { gate += 1; });
await assert.rejects(m.runWithStepUp(async () => { throw Object.assign(new Error("x"), { code: "ADMIN_2FA_REQUIRED" }); }));
assert.equal(gate, 1);

// Paths.
assert.equal(m.isAdminApiPath("/api/admin/shop/gift"), true);
assert.equal(m.isAdminApiPath("/admin/overview"), true);
assert.equal(m.isAdminApiPath("/api/auth/2fa/status"), false);

// Wiring: every admin request path goes through it.
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
assert.match(read("../api/adminHttp.js"), /return runWithStepUp\(\(extra\) => adminFetchOnce\(/);
assert.match(read("../api/authedHttp.js"), /if \(isAdminApiPath\(path\)\) return runWithStepUp/);
assert.doesNotMatch(read("../components/admin/AdminPanel.jsx"), /await fetch\(`\$\{API_BASE_URL\}\/api\/admin/);
assert.match(read("../components/admin/AdminPanel.jsx"), /<AdminStepUpHost \/>/);
assert.match(read("../components/admin/AdminPanel.jsx"), /admin2faRequired \? \(\s*<Admin2faGate/);
console.log("adminStepUp.selftest ok");
