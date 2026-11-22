// One voice session per device (feedback 2026-11-22): server voice vs DM / group calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { voiceSessionsOf, voiceSessionsToEnd } from "./voiceSessionGuard.js";

const here = dirname(fileURLToPath(import.meta.url));
const S = (dm, group, server, ch = server ? "A" : "") => ({ dm, group, server, serverChannelId: ch });
const idle = S(false, false, false);

assert.deepEqual(voiceSessionsOf({}), idle);
assert.deepEqual(voiceSessionsOf({ call: { mode: "incoming" }, serverVoice: { isInVoice: true, activeChannelId: 7 } }), S(false, false, true, "7"), "a ring is not a session");
assert.equal(voiceSessionsOf({ call: { mode: "outgoing" } }).dm, true);
assert.equal(voiceSessionsOf({ call: { mode: "active" } }).dm, true);
assert.equal(voiceSessionsOf({ groupCall: { isInCall: true } }).group, true);

// Alone: nothing to end.
assert.deepEqual(voiceSessionsToEnd(idle, S(true, false, false)), []);
assert.deepEqual(voiceSessionsToEnd(idle, S(false, false, true)), []);
assert.deepEqual(voiceSessionsToEnd(null, S(false, true, false)), []);

// In a voice channel, then place / accept a DM call: the voice channel is left.
assert.deepEqual(voiceSessionsToEnd(S(false, false, true), S(true, false, true)), ["server"]);
// ... or join a group call.
assert.deepEqual(voiceSessionsToEnd(S(false, false, true), S(false, true, true)), ["server"]);
// In a DM call, then join a voice channel: the call ends.
assert.deepEqual(voiceSessionsToEnd(S(true, false, false), S(true, false, true)), ["dm"]);
// In a group call, then join a voice channel: the group call is left.
assert.deepEqual(voiceSessionsToEnd(S(false, true, false), S(false, true, true)), ["group"]);
// Switching voice channel during a call (call older): the call ends, the new channel stays.
assert.deepEqual(voiceSessionsToEnd(S(true, false, true, "A"), S(true, false, true, "B")), ["dm"]);
// Both appear together (restored state): keep the call.
assert.deepEqual(voiceSessionsToEnd(idle, S(true, false, true)), ["server"]);
// Ringing while in voice: nothing yet.
assert.deepEqual(voiceSessionsToEnd(S(false, false, true), voiceSessionsOf({ call: { mode: "incoming" }, serverVoice: { isInVoice: true, activeChannelId: "A" } })), []);

// App wires the guard next to the overlay hooks.
const app = readFileSync(join(here, "../App.jsx"), "utf8");
assert.match(app, /useVoiceSessionGuard\(\{ call, groupCall, serverVoice \}\)/);
const hook = readFileSync(join(here, "../hooks/useVoiceSessionGuard.js"), "utf8");
assert.match(hook, /s\?\.leave\?\.\(\)/);
assert.match(hook, /c\?\.endCall\?\.\(c\?\.peer\?\.id\)/);
assert.match(hook, /g\?\.leaveCall\?\.\(\)/);

console.log("voiceSessionGuard selftest ok");
