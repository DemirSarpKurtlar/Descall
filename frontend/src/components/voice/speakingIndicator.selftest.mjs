// Guards the speaking-ring flicker fix (2.9.14x) and remote state badges.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const voiceCss = read("../../styles/voice-speaking.css");
const polishCss = read("../../styles/ui-polish.css");
const serversCss = read("../../styles/servers.css");
const rings = read("./SpeakingRings.jsx");
const dmSlot = read("./DmRemoteParticipantSlot.jsx");
const overlay = read("../CallOverlay.jsx");
const avatar = read("../ui/Avatar.jsx");
const sidebar = read("../servers/ServersSidebar.jsx");
const panel = read("../servers/ServerVoicePanel.jsx");
const useCall = read("../../hooks/useCall.js");
const useGroupCall = read("../../hooks/useGroupCall.js");
const useServerVoice = read("../../hooks/useServerVoice.js");

const keyframes = (css, name) => {
  const i = css.indexOf(`@keyframes ${name}`);
  assert.ok(i >= 0, `missing @keyframes ${name}`);
  let depth = 0;
  for (let j = css.indexOf("{", i); j < css.length; j += 1) {
    if (css[j] === "{") depth += 1;
    if (css[j] === "}" && --depth === 0) return css.slice(i, j + 1);
  }
  throw new Error(`unterminated @keyframes ${name}`);
};

// 1. Speaking must never change `animation` on avatar-only tiles: that re-ran
//    the one-shot join pop (opacity 0 -> 1) whenever speech ended = black blink.
for (const css of [voiceCss, polishCss]) {
  const m = css.match(/\.participant-tile--avatar-only\.is-speaking\s*\{([^}]*)\}/g) || [];
  for (const rule of m) assert.doesNotMatch(rule, /animation\s*:/, rule);
}
assert.match(polishCss, /\.participant-tile\.is-speaking:not\(\.participant-tile--avatar-only\)/);

// 2. Ring keyframes only scale (no opacity / colour dips) and loop seamlessly.
for (const [css, name] of [
  [voiceCss, "speakingRingsGlow"],
  [voiceCss, "speakingRingsWave"],
  [serversCss, "server-voice-speak-ring"],
]) {
  const kf = keyframes(css, name);
  assert.doesNotMatch(kf, /opacity|border-color|box-shadow/, `${name} must only animate transform`);
  assert.match(kf, /0%,\s*100%/, `${name} must start and end on the same frame`);
}

// 3. Rings are always mounted; speaking toggles a class (fade + play-state).
assert.match(rings, /speaking-rings\$\{speaking \? " is-active" : ""\}/);
assert.match(voiceCss, /animation-play-state:\s*paused/);
assert.match(voiceCss, /\.speaking-rings\.is-active > span\s*\{\s*animation-play-state:\s*running/);
assert.doesNotMatch(dmSlot, /\{isSpeaking && \(\s*<>\s*<span[\s\S]*?speaking-ring/, "DM rings must not mount on speaking");
assert.match(dmSlot, /<SpeakingRings speaking=\{isSpeaking\} \/>/);
assert.match(overlay, /<SpeakingRings speaking=\{isSpeaking\} level=\{level\} \/>/);

// 4. Off-edge hold against VAD flapping everywhere the ring renders.
for (const [name, src] of [["DM slot", dmSlot], ["ParticipantTile", overlay], ["sidebar", sidebar], ["voice panel", panel]]) {
  assert.match(src, /useHeldSpeaking\(/, `${name} must hold the speaking off-edge`);
}

// 5. Voice avatars keep one root element type (no div <-> motion.div remount).
assert.match(avatar, /const speakingCapable = animate === "speaking";/);
assert.match(avatar, /speakingCapable \|\| isSpeaking \? motion\.div : "div"/);

// 6. Remote mute / deafen / camera badges: state is broadcast with deafen,
//    re-requested on join / reconnect, and rendered on every tile.
assert.match(useCall, /deafened: peerDeafened/);
assert.match(useCall, /requestState: true/);
assert.match(useCall, /remoteDeafened,/);
assert.match(useGroupCall, /deafened, requestState \}\) => \{/);
assert.match(useGroupCall, /participants: participantsWithMedia,/);
assert.match(useServerVoice, /deafened: next,/);
assert.match(dmSlot, /<ParticipantStateIcons[\s\S]*?deafened=\{isDeafened\}/);
assert.match(overlay, /isDeafened=\{Boolean\(call\?\.remoteDeafened\)\}/);
assert.match(overlay, /deafened: Boolean\(p\.isDeafened\)/);

console.log("speakingIndicator selftest ok");
