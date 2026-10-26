"use strict";
// acquireCapLock: per-key serialization for count → insert → re-count cap checks.
const assert = require("node:assert/strict");
const { acquireCapLock, capLockSize } = require("../lib/capLock");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Same key runs strictly one after another, in arrival order.
  const log = [];
  const job = (key, name, ms) => (async () => {
    const release = await acquireCapLock(key);
    try { log.push(`${name}+`); await sleep(ms); log.push(`${name}-`); } finally { release(); }
  })();
  await Promise.all([job("owned:u1", "a", 30), job("owned:u1", "b", 5), job("owned:u1", "c", 5)]);
  assert.deepEqual(log, ["a+", "a-", "b+", "b-", "c+", "c-"]);

  // Different keys do not wait for each other.
  const order = [];
  await Promise.all([
    (async () => { const r = await acquireCapLock("roles:s1"); await sleep(40); order.push("slow"); r(); })(),
    (async () => { const r = await acquireCapLock("roles:s2"); order.push("fast"); r(); })(),
  ]);
  assert.deepEqual(order, ["fast", "slow"]);

  // Double release is harmless; finished keys are dropped.
  const r1 = await acquireCapLock("folders:u2");
  r1(); r1();
  assert.equal(capLockSize(), 0);

  // A holder that never releases cannot wedge the key.
  await acquireCapLock("channels:s3", { timeoutMs: 30 });
  const t0 = Date.now();
  const r2 = await acquireCapLock("channels:s3");
  assert.ok(Date.now() - t0 < 1000, "auto-released");
  r2();
  assert.equal(capLockSize(), 0);

  console.log("capLock.unit: ok");
})().catch((err) => { console.error(err); process.exit(1); });
