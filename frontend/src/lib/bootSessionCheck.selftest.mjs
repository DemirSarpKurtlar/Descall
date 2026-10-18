// Boot /auth/me check never hangs (2.11.5). Run from frontend/: node src/lib/bootSessionCheck.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBootSession, withDeadline, isBootAuthFailure, BOOT_ME_TIMEOUT_MS, BOOT_ME_BACKOFF_MS } from "./bootSessionCheck.js";

const here = dirname(fileURLToPath(import.meta.url));
const noSleep = () => Promise.resolve();

// Hanging request: every attempt is cut at the deadline, then "network".
{
  let calls = 0;
  const signals = [];
  const t0 = Date.now();
  const r = await checkBootSession({
    token: "t",
    fetchMe: (_tok, { signal }) => { calls += 1; signals.push(signal); return new Promise(() => {}); },
    timeoutMs: 30,
    sleep: noSleep,
  });
  assert.equal(r.status, "network");
  assert.equal(calls, BOOT_ME_BACKOFF_MS.length + 1, "retried with backoff");
  assert.ok(signals.every((s) => s && s.aborted), "each hung attempt is aborted");
  assert.equal(r.error?.code, "boot-timeout");
  assert.ok(Date.now() - t0 < 2000);
}

// Second attempt answers.
{
  let calls = 0;
  const r = await checkBootSession({
    token: "t",
    fetchMe: () => { calls += 1; return calls === 1 ? Promise.reject(Object.assign(new Error("Load failed"), { code: "transient", status: 0 })) : Promise.resolve({ user: { id: "u1" } }); },
    sleep: noSleep,
  });
  assert.deepEqual([r.status, r.user.id, r.attempts], ["ok", "u1", 2]);
}

// 401 stops immediately (sign out), 503 does not.
{
  let calls = 0;
  const r = await checkBootSession({ token: "t", fetchMe: () => { calls += 1; return Promise.reject(Object.assign(new Error("HTTP 401"), { status: 401 })); }, sleep: noSleep });
  assert.equal(r.status, "auth");
  assert.equal(calls, 1);
  assert.equal(isBootAuthFailure({ status: 503, message: "jwt service down" }), false);
  assert.equal(isBootAuthFailure({ message: "invalid token" }), true);
}

// Cancel between attempts.
{
  let cancelled = false;
  const r = await checkBootSession({ token: "t", fetchMe: () => { cancelled = true; return Promise.reject(new Error("x")); }, isCancelled: () => cancelled, sleep: noSleep });
  assert.equal(r.status, "cancelled");
}

// withDeadline passes through fast results and errors.
assert.equal(await withDeadline(() => Promise.resolve(7), 50), 7);
await assert.rejects(withDeadline(() => Promise.reject(new Error("boom")), 50), /boom/);
assert.ok(BOOT_ME_TIMEOUT_MS <= 15000, "per-attempt cap stays short");

// App.jsx uses it, renders BootErrorScreen with "Tekrar dene", and getMe forwards the signal.
const app = readFileSync(join(here, "..", "App.jsx"), "utf8");
assert.match(app, /checkBootSession\(\{/);
assert.match(app, /<BootErrorScreen/);
assert.doesNotMatch(app, /const \{ user \} = await getMe\(token\);\n\s*if \(!cancelled && sessionEpochRef\.current === bootEpoch\) \{\n\s*commitSessionUser\(user\);\n\s*if \(bootStatus\)/, "old unbounded boot getMe is gone");
const auth = readFileSync(join(here, "..", "api", "auth.js"), "utf8");
assert.match(auth, /export function getMe\(token, \{ signal \} = \{\}\)/);
const tr = readFileSync(join(here, "..", "i18n", "locales", "tr.js"), "utf8");
assert.match(tr, /"Boot retry": "Tekrar dene"/);

console.log("bootSessionCheck.selftest: ok");
