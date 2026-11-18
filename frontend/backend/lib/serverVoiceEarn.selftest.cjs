"use strict";
// server-voice-10 / 11: who may earn voice DesCoin in a server voice seat.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "p";
const assert = require("node:assert/strict");
const { seatCanEarn } = require("./serverVoiceEnforce");

const now = 1_000_000;
const seat = (o = {}) => ({ id: "u", channelType: "voice", canSpeakPermission: true, canStream: true, muted: false, ...o });

assert.equal(seatCanEarn(seat(), "voice", now), true, "open mic earns");
assert.equal(seatCanEarn(seat({ deafened: true }), "voice", now), false, "self-deafened does not earn");
assert.equal(seatCanEarn(seat({ muted: true }), "voice", now), false, "muted, never spoke");
assert.equal(seatCanEarn(seat({ muted: true, lastUnmutedAt: now - 5_000 }), "voice", now), false, "a plain self-mute never earns");
assert.equal(seatCanEarn(seat({ muted: true, ptt: true, lastUnmutedAt: now - 5_000 }), "voice", now), true, "push-to-talk released 5 s ago");
assert.equal(seatCanEarn(seat({ muted: true, ptt: true, lastUnmutedAt: now - 60_000 }), "voice", now), false, "released a minute ago");
assert.equal(seatCanEarn(seat({ muted: true, ptt: true, lastUnmutedAt: now - 1_000, serverMuted: true }), "voice", now), false, "server mute wins");
assert.equal(seatCanEarn(seat({ isScreenSharing: true }), "screenshare", now), true);
console.log("serverVoiceEarn selftest ok");
