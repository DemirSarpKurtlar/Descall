// Camera on → off returns the tile to the avatar. Run: node src/lib/videoPresence.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideVideoPresence, holdVideoPresence, readVideoTracks, VIDEO_MUTE_HOLD_MS } from "./videoPresence.js";

const live = { readyState: "live", muted: false, enabled: true };
const muted = { readyState: "live", muted: true, enabled: true };
const ended = { readyState: "ended", muted: false, enabled: true };
const disabled = { readyState: "live", muted: false, enabled: false };

// Live camera → video.
assert.deepEqual(decideVideoPresence({ cameraOn: true, tracks: [live] }), { mount: true, show: true, reason: "live" });
assert.equal(decideVideoPresence({ cameraOn: null, tracks: [live] }).show, true, "unknown camera state trusts the track");
// The reported bug: camera signaled off while the remote track is still "live" → avatar, video stays mounted.
assert.deepEqual(decideVideoPresence({ cameraOn: false, tracks: [live] }), { mount: true, show: false, reason: "camera-off" });
// Track muted (replaceTrack(null) / LiveKit mute / sender stopped frames) → avatar (after hold).
assert.equal(decideVideoPresence({ cameraOn: true, tracks: [muted] }).reason, "muted");
assert.equal(decideVideoPresence({ cameraOn: true, tracks: [muted] }).show, false);
// Ended / disabled / none.
assert.deepEqual(decideVideoPresence({ tracks: [ended] }), { mount: false, show: false, reason: "ended" });
assert.equal(decideVideoPresence({ tracks: [disabled] }).reason, "disabled");
assert.equal(decideVideoPresence({ tracks: [] }).reason, "no-track");
assert.equal(decideVideoPresence({ cameraOn: true, tracks: [ended, live] }).show, true, "one good track is enough");

// Hold: a short frame stall keeps the video; then the avatar comes back.
let st = holdVideoPresence({ show: false, holdUntil: 0 }, decideVideoPresence({ tracks: [live] }), 0);
assert.deepEqual(st, { show: true, holdUntil: 0 });
st = holdVideoPresence(st, decideVideoPresence({ tracks: [muted] }), 1000);
assert.equal(st.show, true);
assert.equal(st.holdUntil, 1000 + VIDEO_MUTE_HOLD_MS);
st = holdVideoPresence(st, decideVideoPresence({ tracks: [muted] }), 1000 + VIDEO_MUTE_HOLD_MS - 1);
assert.equal(st.show, true, "still holding");
st = holdVideoPresence(st, decideVideoPresence({ tracks: [muted] }), 1000 + VIDEO_MUTE_HOLD_MS + 1);
assert.deepEqual(st, { show: false, holdUntil: 0 }, "hold expired → avatar");
// Unmute (camera on again) → video at once.
st = holdVideoPresence(st, decideVideoPresence({ tracks: [live] }), 5000);
assert.equal(st.show, true);
// Signaled camera-off is never held.
st = holdVideoPresence({ show: true, holdUntil: 0 }, decideVideoPresence({ cameraOn: false, tracks: [live] }), 6000);
assert.equal(st.show, false);
// A muted track that never showed does not flash video.
st = holdVideoPresence({ show: false, holdUntil: 0 }, decideVideoPresence({ tracks: [muted] }), 7000);
assert.equal(st.show, false);

// Fake MediaStream snapshot.
const fake = { getVideoTracks: () => [{ readyState: "live", muted: true, enabled: true }, null] };
assert.deepEqual(readVideoTracks(fake), [{ readyState: "live", muted: true, enabled: true }]);
assert.deepEqual(readVideoTracks(null), []);

// Wiring: every tile asks useVideoPresence and keeps the <video> mounted for the cross-fade.
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
for (const file of ["../components/voice/DmRemoteParticipantSlot.jsx", "../components/CallOverlay.jsx", "../components/servers/ServerVoicePanel.jsx"]) {
  const src = read(file);
  assert.match(src, /useVideoPresence\(/, `${file} uses useVideoPresence`);
  assert.match(src, /tile-video-layer/, `${file} fades the video layer`);
  assert.match(src, /tile-avatar-layer/, `${file} fades the avatar layer`);
}
const css = read("../styles/ui-polish.css");
assert.match(css, /\.tile-video-layer\s*\{[^}]*transition:\s*opacity/);
assert.match(css, /prefers-reduced-motion: reduce\)\s*\{[^}]*\.tile-video-layer/);

console.log("videoPresence selftest ok");
