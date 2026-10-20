// node src/lib/gameActivity.selftest.mjs — only real games show as "… oynuyor".
import assert from "node:assert/strict";
import { gameNameFromActivity, isNonGameName } from "./gameActivity.js";
import { activityGameName, statusSubline } from "./userVoicePanel.js";

// The reported bug: Discord (communication) became "Using Discord oynuyor".
assert.equal(activityGameName({ appName: "Discord", appType: "communication", displayName: "Using Discord" }), "");
assert.equal(activityGameName({ displayName: "Using Discord" }), "");
assert.equal(statusSubline({ statusLabel: "Çevrimiçi", game: activityGameName({ displayName: "Using Discord" }), t: (k, v) => (k === "uvp.playing" ? `${v.name} oynuyor` : k) }).text, "Çevrimiçi");
// Mislabelled as game (old builds / stale rows): still rejected by name.
for (const n of ["Discord", "Discord PTB", "Discord Canary", "Descall", "Steam", "Epic Games Launcher", "Google Chrome", "Firefox", "Spotify", "OBS Studio", "Overwolf", "NVIDIA Overlay", "Battle.net", "Using Discord"]) {
  assert.equal(gameNameFromActivity({ appName: n, appType: "game", displayName: `Playing ${n}` }), "", n);
  assert.ok(isNonGameName(n), n);
}
// Real games keep working.
assert.equal(activityGameName({ appName: "Counter-Strike 2", appType: "game", displayName: "Playing Counter-Strike 2" }), "Counter-Strike 2");
assert.equal(activityGameName({ displayName: "Playing Minecraft" }), "Minecraft");
assert.equal(activityGameName({ name: "Minecraft" }), "Minecraft");
assert.equal(activityGameName({ appType: "manual", displayName: "Elden Ring" }), "Elden Ring");
assert.equal(activityGameName({ appType: "music", appName: "Spotify", displayName: "Listening to Spotify" }), "");
assert.equal(activityGameName({ appType: "browser", appName: "Opera GX", displayName: "Browsing with Opera GX" }), "");
assert.equal(activityGameName(null), "");
console.log("gameActivity.selftest.mjs: ok");
