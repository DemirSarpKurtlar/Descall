// node src/lib/presence.selftest.mjs
import assert from "node:assert/strict";
import { getPresenceStatus, isVisiblyOnline } from "./presence.js";

const STATUSES = ["online", "idle", "dnd", "invisible", "offline", undefined];
const list = (n, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, status: STATUSES[(i + offset) % STATUSES.length] }));
const reference = (users, id) => {
  if (!id || !Array.isArray(users)) return "offline";
  const hit = users.find((u) => u && u.id === id);
  if (!hit) return "offline";
  const s = hit.status || "online";
  return s === "invisible" || s === "offline" ? "offline" : s;
};

// Same answers as the linear scan, for short (scan) and long (indexed) lists.
for (const n of [0, 3, 15, 16, 17, 300]) {
  const users = list(n);
  for (let i = -1; i <= n; i++) {
    const id = i < 0 ? "" : `u${i}`;
    assert.equal(getPresenceStatus(users, id), reference(users, id), `n=${n} id=${id}`);
    assert.equal(isVisiblyOnline(users, id), ["online", "idle", "dnd"].includes(reference(users, id)));
  }
}

// Not an array / no id -> offline.
assert.equal(getPresenceStatus(null, "u1"), "offline");
assert.equal(getPresenceStatus(undefined, "u1"), "offline");
assert.equal(getPresenceStatus(list(40), null), "offline");

// First entry wins on duplicate ids (as Array.find did).
const dup = [...list(20), { id: "u0", status: "dnd" }];
assert.equal(getPresenceStatus(dup, "u0"), reference(dup, "u0"));

// A new list (state is replaced on every presence change) is never served
// from the previous list's index.
const a = list(50);
assert.equal(getPresenceStatus(a, "u1"), "idle");
const b = a.map((u) => (u.id === "u1" ? { ...u, status: "dnd" } : u));
assert.equal(getPresenceStatus(b, "u1"), "dnd");
assert.equal(getPresenceStatus(a, "u1"), "idle");

// Holes / null entries do not throw.
const holes = [...list(30), null, undefined, { id: "late", status: "online" }];
assert.equal(getPresenceStatus(holes, "late"), "online");

console.log("presence selftest ok");
