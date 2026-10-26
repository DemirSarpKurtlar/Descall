import assert from "node:assert/strict";
import { pickFastestLiveKitUrl, _resetLiveKitPickForTests, LIVEKIT_PICK_TTL_MS } from "./voiceProfile.js";

let t = 0;
const now = () => t;
const delays = { "https://a.example": 300, "https://b.example": 20 };
let probes = 0;
const fetchImpl = (url) => {
  probes += 1;
  return new Promise((resolve) => setTimeout(resolve, delays[url] ?? 10));
};

_resetLiveKitPickForTests();
assert.equal(await pickFastestLiveKitUrl(["wss://only.example"], { fetchImpl, now }), "wss://only.example");
assert.equal(probes, 0, "a single URL is never probed");

const started = Date.now();
const won = await pickFastestLiveKitUrl(["wss://a.example", "wss://b.example"], { fetchImpl, now });
assert.equal(won, "wss://b.example");
assert.ok(Date.now() - started < 200, "first answer wins without waiting for the slowest");
assert.equal(probes, 2);

let probed = false;
t = 60_000;
assert.equal(await pickFastestLiveKitUrl(["wss://a.example", "wss://b.example"], { fetchImpl, now, onProbe: () => { probed = true; } }), "wss://b.example");
assert.equal(probed, false, "cached winner skips the probe");
assert.equal(probes, 2);

t = LIVEKIT_PICK_TTL_MS + 120_000;
await pickFastestLiveKitUrl(["wss://a.example", "wss://b.example"], { fetchImpl, now });
assert.equal(probes, 4, "stale cache probes again");

// Every endpoint failing falls back to the first URL.
_resetLiveKitPickForTests();
const failing = () => Promise.reject(new Error("down"));
assert.equal(await pickFastestLiveKitUrl(["wss://a.example", "wss://b.example"], { fetchImpl: failing, now }), "wss://a.example");

console.log("liveKitUrlPick.selftest: ok");
