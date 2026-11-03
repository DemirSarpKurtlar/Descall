import assert from "node:assert/strict";
import {
  parseServerInviteFromLocation as parse,
  isServerInviteLocation,
  serverInvitePath,
  savePendingServerInvite,
  peekPendingServerInvite,
  takePendingServerInvite,
  PENDING_TTL_MS,
  serverInviteErrorKey,
  isFinalInviteError,
} from "./serverInviteRoute.js";
import { resolveDeepLink } from "./deepLinks.js";
import { parseDescallInviteUrl } from "./inviteLinks.js";

// Route parsing: the link the server hands out is /servers/join/:code.
assert.equal(parse({ pathname: "/servers/join/K7QM2XRD" }), "K7QM2XRD");
assert.equal(parse({ pathname: "/servers/join/K7QM2XRD/" }), "K7QM2XRD");
assert.equal(parse({ pathname: "/invite/s/abc_12-x" }), "abc_12-x");
assert.equal(parse({ pathname: "/", search: "?si=K7QM2XRD" }), "K7QM2XRD");
assert.equal(parse({ pathname: "/", search: "?serverInvite=K7QM2XRD" }), "K7QM2XRD");
// Not server invites.
assert.equal(parse({ pathname: "/invite/K7QM2XRD" }), null, "group invite");
assert.equal(parse({ pathname: "/servers/abc" }), null);
assert.equal(parse({ pathname: "/servers/join" }), null);
assert.equal(parse({ pathname: "/servers/join/a" }), null, "too short");
assert.equal(parse({ pathname: "/servers/join/<script>" }), null);
assert.equal(parse({ pathname: "/servers/join/%3Cx%3E" }), null);
assert.equal(isServerInviteLocation({ pathname: "/servers/join/!!" }), true, "malformed still a server-invite URL");
assert.equal(isServerInviteLocation({ pathname: "/servers/abc" }), false);
assert.equal(serverInvitePath("K7QM2XRD"), "/servers/join/K7QM2XRD");
assert.equal(serverInvitePath("../x"), null);

// The pending code survives login / sign-up (and a new tab via localStorage), with a TTL.
function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const s = mem();
assert.equal(savePendingServerInvite("K7QM2XRD", { storage: s, now: 1000 }), true);
assert.equal(peekPendingServerInvite({ storage: s, now: 2000 }), "K7QM2XRD");
assert.equal(peekPendingServerInvite({ storage: s, now: 1000 + PENDING_TTL_MS + 1 }), null, "stale");
assert.equal(takePendingServerInvite({ storage: s, now: 2000 }), "K7QM2XRD");
assert.equal(peekPendingServerInvite({ storage: s, now: 2000 }), null, "taken once");
assert.equal(savePendingServerInvite("bad code!", { storage: s }), false);
s.setItem("descall:pendingServerInvite", "{not json");
assert.equal(peekPendingServerInvite({ storage: s }), null);

// Error copy.
assert.equal(serverInviteErrorKey({ status: 410, code: "INVITE_EXPIRED" }), "This invite is invalid or has expired.");
assert.equal(serverInviteErrorKey({ status: 404, code: "INVITE_INVALID" }), "This invite is invalid or has expired.");
assert.equal(serverInviteErrorKey({ status: 403, code: "BANNED" }), "You are banned from this server.");
assert.equal(serverInviteErrorKey({ status: 400, code: "MAX_JOINED_SERVERS" }), "You have reached the server limit. Leave a server to join this one.");
assert.equal(serverInviteErrorKey({ status: 429 }), "Too many attempts. Wait a little and try again.");
assert.equal(serverInviteErrorKey({ status: 500 }), "Could not reach Descall. Check your connection and try again.");
assert.equal(isFinalInviteError({ status: 410 }), true);
assert.equal(isFinalInviteError({ status: 500 }), false);

// iOS: universal link + custom scheme keep the code (before: /servers/join → /servers/join, code dropped
// for descall://invite/…, and the in-app route then showed the servers home).
assert.equal(resolveDeepLink("https://descall.com/servers/join/K7QM2XRD").path, "/servers/join/K7QM2XRD");
assert.equal(resolveDeepLink("https://www.descall.com/invite/s/K7QM2XRD").path, "/servers/join/K7QM2XRD");
assert.equal(resolveDeepLink("descall://invite/K7QM2XRD").path, "/servers/join/K7QM2XRD");
assert.equal(resolveDeepLink("descall://servers/join/K7QM2XRD").path, "/servers/join/K7QM2XRD");
assert.equal(resolveDeepLink("descall://join/K7QM2XRD").path, "/servers/join/K7QM2XRD");
assert.equal(resolveDeepLink("descall://servers/abc").path, "/servers/abc", "plain server route unchanged");

// Chat embeds still detect the canonical link.
assert.deepEqual(parseDescallInviteUrl("https://descall.com/servers/join/K7QM2XRD")?.kind, "server");

console.log("serverInviteRoute selftest OK");
