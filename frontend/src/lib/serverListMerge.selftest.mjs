import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeFetchedServers, rememberLocalJoin, LOCAL_JOIN_TTL_MS } from "./serverListMerge.js";

const A = { id: "a", name: "A" };
const B = { id: "b", name: "B" };
const NEW = { id: "new", name: "Joined" };

// The race: the list request started at t=100, the user joined "new" at t=150,
// the stale response (without "new") lands at t=200. "new" must survive.
{
  const joins = new Map();
  rememberLocalJoin(joins, "new", 150);
  const out = mergeFetchedServers([A, B], [A, B, NEW], joins, 100, 200);
  assert.deepEqual(out.map((s) => s.id), ["a", "b", "new"]);
}
// Joined before the request started: the response is newer, absence means left/removed.
{
  const joins = new Map();
  rememberLocalJoin(joins, "new", 50);
  const out = mergeFetchedServers([A], [A, NEW], joins, 100, 200);
  assert.deepEqual(out.map((s) => s.id), ["a"]);
}
// Response already has it: no duplicate.
{
  const joins = new Map();
  rememberLocalJoin(joins, "new", 150);
  const out = mergeFetchedServers([A, NEW], [A, NEW], joins, 100, 200);
  assert.deepEqual(out.map((s) => s.id), ["a", "new"]);
}
// No local joins: plain replace (leaving / kicks still apply).
assert.deepEqual(mergeFetchedServers([A], [A, B], new Map(), 100, 200).map((s) => s.id), ["a"]);
// Old entries expire.
{
  const joins = new Map();
  rememberLocalJoin(joins, "new", 0);
  mergeFetchedServers([A], [A], joins, 0, LOCAL_JOIN_TTL_MS + 1);
  assert.equal(joins.size, 0);
}
// Bad input.
assert.deepEqual(mergeFetchedServers(null, null, null, 0, 0), []);

// App wiring: both list fetches merge, and the invite join is remembered.
const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
assert.ok((app.match(/mergeFetchedServers\(/g) || []).length >= 2, "fetchServers and handleRefreshServers merge");
assert.match(app, /rememberLocalJoin\(localJoinsRef\.current, server\.id\)/, "invite join is remembered");

console.log("serverListMerge.selftest.mjs: ok");
