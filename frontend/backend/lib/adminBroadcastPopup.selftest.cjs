"use strict";

const assert = require("node:assert/strict");
const {
  buildPopupPayload,
  selectRecipients,
  checkRateLimit,
  deliverPopup,
  rememberSend,
  listRecent,
} = require("./adminBroadcastPopup");

let r = buildPopupPayload({ title: "  ", body: "hello" }, { actor: { id: "a1", username: "admin" } });
assert.equal(r.ok, false);
assert.match(r.error, /title/i);

r = buildPopupPayload({ title: "Hello", body: "   " }, { actor: { id: "a1", username: "admin" } });
assert.equal(r.ok, false);
assert.match(r.error, /message|body/i);

r = buildPopupPayload(
  { title: "x".repeat(200), body: "ok" },
  { actor: { id: "a1", username: "admin" } },
);
assert.equal(r.ok, false);

r = buildPopupPayload(
  {
    title: "  Maintenance  ",
    body: "Voice is back.",
    severity: "URGENT",
    emoji: "🚨",
    durationMs: 30000,
    requireAck: true,
    ctaLabel: "Open status",
    ctaUrl: "https://descall.com/status",
  },
  { actor: { id: "a1", username: "admin" }, now: new Date("2026-08-25T21:00:00.000Z") },
);
assert.equal(r.ok, true);
assert.equal(r.popup.title, "Maintenance");
assert.equal(r.popup.body, "Voice is back.");
assert.equal(r.popup.severity, "urgent");
assert.equal(r.popup.emoji, "🚨");
assert.equal(r.popup.durationMs, 30000);
assert.equal(r.popup.requireAck, true);
assert.equal(r.popup.ctaLabel, "Open status");
assert.equal(r.popup.ctaUrl, "https://descall.com/status");
assert.equal(r.popup.from.username, "admin");
assert.ok(r.popup.id);

r = buildPopupPayload(
  { title: "Hi", body: "There", ctaLabel: "Go", ctaUrl: "javascript:alert(1)" },
  { actor: { id: "a1", username: "admin" } },
);
assert.equal(r.ok, false);

r = buildPopupPayload(
  { title: "Hi", body: "There", ctaUrl: "/download" },
  { actor: { id: "a1", username: "admin" } },
);
assert.equal(r.ok, true);
assert.equal(r.popup.ctaUrl, "/download");

const live = [
  { id: "u1", username: "ada", status: "online" },
  { id: "u2", username: "bob", status: "invisible" },
  { id: "u3", username: "cara", status: "dnd" },
  { id: "a1", username: "admin", status: "online" },
];

assert.deepEqual(
  selectRecipients(live, { audience: "connected", includeSelf: true, actorId: "a1" }).map((u) => u.id),
  ["u1", "u2", "u3", "a1"],
);
assert.deepEqual(
  selectRecipients(live, { audience: "visible", includeSelf: false, actorId: "a1" }).map((u) => u.id),
  ["u1", "u3"],
);
assert.deepEqual(
  selectRecipients(live, { audience: "connected", includeSelf: false, actorId: "a1" }).map((u) => u.id),
  ["u1", "u2", "u3"],
);

const emitted = [];
const io = {
  to(room) {
    return {
      emit(event, payload) {
        emitted.push({ room, event, payload });
      },
    };
  },
  sockets: {
    adapter: {
      rooms: new Map([
        ["user:u1", new Set(["s1"])],
        ["user:u2", new Set(["s2"])],
        ["user:ghost", new Set()],
      ]),
    },
  },
};

const popup = r.popup;
const delivered = deliverPopup(io, [{ id: "u1" }, { id: "u2" }, { id: "ghost" }, { id: "offline" }], popup);
assert.equal(delivered, 2);
assert.equal(emitted.length, 2);
assert.equal(emitted[0].event, "admin:popup");
assert.equal(emitted[0].room, "user:u1");
assert.equal(emitted[1].room, "user:u2");

const now = 1_000_000;
assert.equal(checkRateLimit("a1", now).ok, true);
rememberSend(
  {
    actorId: "a1",
    actorUsername: "admin",
    popup,
    delivered: 2,
    audience: "connected",
    at: new Date(now).toISOString(),
  },
  now,
);
assert.equal(checkRateLimit("a1", now + 1000).ok, false);
assert.equal(checkRateLimit("a1", now + 10_000).ok, true);
assert.equal(checkRateLimit("other", now + 1000).ok, true);

const recent = listRecent();
assert.equal(recent[0].delivered, 2);
assert.equal(recent[0].popup.title, "Hi");

console.log("adminBroadcastPopup.selftest.cjs: ok");
