"use strict";

const assert = require("node:assert/strict");
const { expandTurnUrls, liveKitEndpoints } = require("./turnUrls");

const expanded = expandTurnUrls("turns:turn.descall.com:443");
assert.deepEqual(expanded, [
  "turn:turn.descall.com:443?transport=udp",
  "turns:turn.descall.com:443",
]);
assert.deepEqual(expandTurnUrls("turn:turn.descall.com:3478"), ["turn:turn.descall.com:3478"]);

process.env.LIVEKIT_URL = "wss://eu.example";
process.env.LIVEKIT_URLS = "wss://us.example, wss://eu.example";
assert.deepEqual(liveKitEndpoints(), ["wss://eu.example", "wss://us.example"]);
delete process.env.LIVEKIT_URLS;

console.log("turnUrls.selftest: ok");
