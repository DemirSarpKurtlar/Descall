// node src/lib/friendPresenceBatch.selftest.mjs
import assert from "node:assert/strict";
import { fetchFriendPresence, createPresenceHydrator, PER_FRIEND_CONCURRENCY } from "./friendPresenceBatch.js";

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

// Batch: one POST with every id, answer passed through.
{
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return json(200, { presence: { a: { display_name: "X" }, b: null } }); };
  const out = await fetchFriendPresence(["a", "b", "a"], { base: "http://api", token: "t", fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "http://api/api/activity/presence/batch");
  assert.equal(calls[0][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[0][1].body), { ids: ["a", "b"] });
  assert.deepEqual(out, { a: { display_name: "X" }, b: null });
}

// Old backend (404): per-friend GETs, never more than PER_FRIEND_CONCURRENCY at once.
{
  let active = 0, peak = 0, gets = 0;
  const ids = Array.from({ length: 40 }, (_, i) => `f${i}`);
  const fetchImpl = async (url) => {
    if (url.endsWith("/presence/batch")) return json(404, {});
    gets += 1; active += 1; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 2));
    active -= 1;
    return json(200, { presence: { display_name: url.includes("/f3/") ? "Game" : null } });
  };
  const out = await fetchFriendPresence(ids, { token: "t", fetchImpl });
  assert.equal(gets, 40);
  assert.ok(peak <= PER_FRIEND_CONCURRENCY, `peak ${peak}`);
  assert.equal(out.f3.display_name, "Game");
}

// No token / no ids / network error: empty, no throw.
assert.deepEqual(await fetchFriendPresence(["a"], { token: "", fetchImpl: async () => { throw new Error("x"); } }), {});
assert.deepEqual(await fetchFriendPresence([], { token: "t" }), {});
assert.deepEqual(await fetchFriendPresence(["a"], { token: "t", fetchImpl: async () => { throw new Error("offline"); } }), {});

// Hydrator: coalesces concurrent calls and skips a repeat inside the gap.
{
  let t = 0, runs = 0;
  const h = createPresenceHydrator(async () => { runs += 1; }, { minGapMs: 15000, now: () => t });
  await Promise.all([h(), h(), h()]);
  assert.equal(runs, 1, "concurrent calls share one run");
  t = 5000; await h();
  assert.equal(runs, 1, "a reconnect right after a hydrate is skipped");
  await h({ force: true });
  assert.equal(runs, 2, "force runs");
  t = 30000; await h();
  assert.equal(runs, 3, "runs again after the gap");
}

// A run with nothing to do (friends not loaded yet) does not start the gap.
{
  let t = 0, runs = 0, ready = false;
  const h = createPresenceHydrator(async () => { if (!ready) return false; runs += 1; return true; }, { minGapMs: 15000, now: () => t });
  await h();
  ready = true; t = 100; await h();
  assert.equal(runs, 1);
}

console.log("friendPresenceBatch selftest: ok");
