// DM call volume (ses düzeyi): each peer plays at their own level.
// Before: useCall kept the level in a ref that only a remembered level could
// overwrite, so a peer you never adjusted inherited the last call's level
// (turn A down to 30% or mute A, then call B: B at 30% or silent, the menu
// saying 100%).
// Run from frontend/: node src/lib/peerVolume.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { createPeerVolume } = await import("./peerVolume.js");
const { readParticipantGain } = await import("./voiceProfile.js");

// 1. The reported case: A turned down, then a call with B (never adjusted).
{
  const v = createPeerVolume();
  assert.equal(v.forPeer("A"), 1, "first call with A: 100%");
  assert.equal(v.set("A", 0.3), 0.3);
  assert.equal(readParticipantGain("A"), 0.3, "A's level is remembered");
  v.forPeer(null); // hang up
  assert.equal(v.forPeer("B"), 1, "B starts at 100%, not A's 30%");
  assert.equal(v.level(), 1);
  assert.equal(v.forPeer("A"), 0.3, "A again: A's remembered level");
}

// 2. Muted A, then B: B is audible.
{
  const v = createPeerVolume();
  v.forPeer("A2");
  v.set("A2", 0);
  assert.equal(v.forPeer("B2"), 1, "B is not silent because A was muted");
  assert.equal(v.forPeer("A2"), 0, "A stays muted (that was remembered)");
  assert.equal(v.toggleMute("A2"), 1, "unmute a peer muted in an earlier call: 100%");
}

// 3. Mute / unmute restores the level; boost is clamped to 200%.
{
  const v = createPeerVolume();
  v.forPeer("C");
  v.set("C", 1.6);
  assert.equal(v.toggleMute("C"), 0);
  assert.equal(v.toggleMute("C"), 1.6);
  assert.equal(v.set("C", 7), 2, "never above 200%");
  assert.equal(v.set("C", -1), 0);
  assert.equal(v.set("C", "x"), 1, "garbage is 100%");
}

// 4. Injected storage (no writes without a peer id).
{
  const writes = [];
  const v = createPeerVolume({ read: () => null, write: (id, g) => writes.push([id, g]) });
  v.set(null, 0.5);
  v.set("D", 0.5);
  assert.deepEqual(writes, [["D", 0.5]]);
}

// 5. useCall wiring: no level survives a peer change.
const src = readFileSync(new URL("../hooks/useCall.js", import.meta.url), "utf8");
assert.match(src, /createPeerVolume\(\)/);
assert.doesNotMatch(src, /remoteVolumeRef/, "the old shared ref is gone");
assert.doesNotMatch(src, /if \(stored == null\) return;/, "no early return that keeps the old level");
const effect = src.slice(src.indexOf("// Each peer plays at their own remembered level"), src.indexOf("const toggleParticipantMute"));
assert.match(effect, /peerVolumeRef\.current\.forPeer\(peer\?\.id \?\? null\)/);
assert.match(effect, /\}, \[peer\?\.id\]\);/);

// 6. Call menu mute toggle starts from the remembered level (was 100% when the
// slider had not been touched in this session, so unmute lost e.g. 50%).
const overlay = readFileSync(new URL("../components/CallOverlay.jsx", import.meta.url), "utf8");
const toggle = overlay.slice(overlay.indexOf("onToggleVoiceMute={() => {"), overlay.indexOf("showScreenVolume="));
assert.match(toggle, /userVolumes\[key\] \?\? participantVolumePercent\(null, id\)/);
assert.doesNotMatch(toggle, /userVolumes\[key\] \?\? 100;/);

console.log("peerVolume selftest ok");
