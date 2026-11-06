import assert from "node:assert/strict";
import {
  savePendingLanding,
  peekPendingLanding,
  takePendingLanding,
  clearPendingLanding,
  inviteLandingChannel,
  PENDING_TTL_MS,
  serverInviteErrorKey,
} from "./serverInviteRoute.js";

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// Vanity + group invites keep their value through login (3.7.32, plan items 3 & 4).
{
  const s = mem();
  assert.equal(savePendingLanding("vanity", "My-Server", { storage: s, now: 1000 }), true);
  assert.equal(peekPendingLanding("vanity", { storage: s, now: 2000 }), "my-server");
  assert.equal(takePendingLanding("vanity", { storage: s, now: 2000 }), "my-server");
  assert.equal(peekPendingLanding("vanity", { storage: s, now: 2000 }), null);
}
{
  const s = mem();
  savePendingLanding("group", "AbC_123", { storage: s, now: 0 });
  assert.equal(peekPendingLanding("group", { storage: s, now: PENDING_TTL_MS }), "AbC_123");
  assert.equal(peekPendingLanding("group", { storage: s, now: PENDING_TTL_MS + 1 }), null, "stale dropped");
  clearPendingLanding("group", { storage: s });
  assert.equal(s.m.size, 0);
}
{
  // Legacy bare values from older builds still resume.
  const s = mem();
  s.setItem("descall:pendingInvite", "legacyCode");
  s.setItem("descall:pendingServerVanity", "old-slug");
  assert.equal(peekPendingLanding("group", { storage: s }), "legacyCode");
  assert.equal(peekPendingLanding("vanity", { storage: s }), "old-slug");
  // Garbage rejected.
  assert.equal(savePendingLanding("vanity", "../x", { storage: s }), false);
  assert.equal(savePendingLanding("nope", "abc", { storage: s }), false);
}
{
  // Server kind shares the 3.7.31 slot.
  const s = mem();
  savePendingLanding("server", "K7QM2XRD", { storage: s });
  assert.equal(peekPendingLanding("server", { storage: s }), "K7QM2XRD");
}

// Channel-bound invites open the channel (plan item 2), never a voice channel.
{
  const server = { id: "s", channels: [{ id: "t1", type: "text" }, { id: "v1", type: "voice" }, { id: "c", type: "category" }] };
  assert.equal(inviteLandingChannel(server, "t1")?.id, "t1");
  assert.equal(inviteLandingChannel(server, "v1"), null);
  assert.equal(inviteLandingChannel(server, "c"), null);
  assert.equal(inviteLandingChannel(server, "missing"), null);
  assert.equal(inviteLandingChannel(server, null), null);
  assert.equal(inviteLandingChannel(null, "t1"), null);
}

// Banned copy (plan item 6).
assert.equal(serverInviteErrorKey({ code: "BANNED", status: 403 }), "You are banned from this server.");
console.log("pendingLanding selftest OK");
