import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCachedDmPrefs, writeCachedDmPrefs, sameDmListPrefs, reconcileDmPrefs } from "./dmPrefsCache.js";
import { applyDmListPrefs, prefsMapFromList } from "./dmConversationPrefs.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };

const store = mem();
const prefs = prefsMapFromList([
  { peerId: "b", pinned: true, pinnedAt: "2026-10-01T10:00:00Z" },
  { peerId: "c", pinned: true, pinnedAt: "2026-10-02T10:00:00Z" },
  { peerId: "d", hidden: true },
  { peerId: "e" }, // no visible effect: not persisted
]);
writeCachedDmPrefs("u1", prefs, store);
const cached = readCachedDmPrefs("u1", store);
assert.deepEqual(Object.keys(cached).sort(), ["b", "c", "d"]);
assert.deepEqual(readCachedDmPrefs("u2", store), {}, "per user");
assert.deepEqual(readCachedDmPrefs(null, store), {});
store.setItem("descall:dmPrefs:v1:bad", "{oops");
assert.deepEqual(readCachedDmPrefs("bad", store), {});

// First paint from cache already has pinned chats on top, in pin order, hidden removed.
const dms = ["a", "b", "c", "d"].map((id, i) => ({ id, username: id, lastActivity: new Date(Date.UTC(2026, 9, 10 - i)).toISOString() }));
const fromCache = applyDmListPrefs(dms, cached).map((d) => d.id);
const fromServer = applyDmListPrefs(dms, prefs).map((d) => d.id);
assert.deepEqual(fromCache, ["c", "b", "a"]);
assert.deepEqual(fromCache, fromServer, "cache order === server order: no jump");

// Reconcile keeps the same object (no re-sort/re-render) when nothing visible changed.
assert.equal(sameDmListPrefs(cached, prefs), true);
assert.equal(reconcileDmPrefs(cached, prefs), cached);
const changed = prefsMapFromList([{ peerId: "b", pinned: true, pinnedAt: "2026-10-01T10:00:00Z" }]);
assert.equal(reconcileDmPrefs(cached, changed), changed);
assert.equal(sameDmListPrefs({}, {}), true);

// Wiring in App.jsx
const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
assert.match(app, /useState\(\(\) => readCachedDmPrefs\(/);
assert.match(app, /writeCachedDmPrefs\(me\.id, dmPrefs\)/);
assert.doesNotMatch(app, /setDmPrefs\(prefsMapFromList\(/, "server prefs always go through reconcile");

console.log("dmPrefsCache.selftest ok");
