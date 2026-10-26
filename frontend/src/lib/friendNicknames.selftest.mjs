import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const nick = await import("./friendNicknames.js");
const { resolveDisplayName } = await import("./userProfile.js");

assert.equal(nick.cleanNickname("  Kanka   Ayşe "), "Kanka Ayşe");
assert.equal(nick.cleanNickname("x".repeat(50)).length, nick.NICKNAME_MAX);
assert.equal(nick.getNickname("u1"), "");
let calls = 0;
const off = nick.subscribeNicknames(() => { calls += 1; });
assert.equal(nick.setNickname("u1", " Kuzen "), "Kuzen");
assert.equal(nick.getNickname("u1"), "Kuzen");
assert.equal(calls, 1);
assert.equal(resolveDisplayName({ id: "u1", username: "ayse", displayName: "Ayşe" }), "Kuzen");
assert.equal(resolveDisplayName({ id: "u2", username: "mert" }), "mert");
// Survives a reload (fresh cache, same storage).
nick.__resetNicknamesForTest();
assert.equal(nick.getNickname("u1"), "Kuzen");
// Empty removes it.
nick.setNickname("u1", "   ");
assert.equal(nick.getNickname("u1"), "");
assert.equal(resolveDisplayName({ id: "u1", username: "ayse", displayName: "Ayşe" }), "Ayşe");
// Corrupt storage does not throw.
mem.set("descall:nicknames:v1", "{nope");
nick.__resetNicknamesForTest();
assert.equal(nick.getNickname("u1"), "");
off();
console.log("friendNicknames selftest ok");
