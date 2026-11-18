import assert from "node:assert/strict";
import { mergeVoiceRoster } from "./voiceRoster.js";

const stream = { id: "s1" };
const participants = [
  { id: "u-new", username: "Member", stream, hasAudio: true },
  { id: "u-old", displayName: "Oldtimer", isScreenSharing: true, screenStream: stream },
];
const seats = [
  { id: "u-me", displayName: "Me" },
  { id: "u-old", displayName: "Oldtimer", equippedVoiceTile: { effect_key: "vt-neon-carsi" }, isScreenSharing: false },
  { id: "u-new", displayName: "Newcomer", username: "newcomer", avatarUrl: "/a.png" },
  { id: "u-listener", displayName: "Listener", muted: true },
];
const out = mergeVoiceRoster(participants, seats, { selfId: "u-me" });

// The placeholder takes the real profile, keeps its media.
const n = out.find((p) => p.id === "u-new");
assert.equal(n.displayName, "Newcomer");
assert.equal(n.username, "newcomer");
assert.equal(n.avatarUrl, "/a.png");
assert.equal(n.stream, stream);
// A cosmetic equipped mid-call shows; live media state stays the participant's.
const o = out.find((p) => p.id === "u-old");
assert.equal(o.equippedVoiceTile.effect_key, "vt-neon-carsi");
assert.equal(o.isScreenSharing, true);
assert.equal(o.screenStream, stream);
// A seated listener without media still gets a tile; you are never added twice.
assert.ok(out.some((p) => p.id === "u-listener"));
assert.ok(!out.some((p) => p.id === "u-me"));
assert.equal(out.length, 3);
// No seat list yet: participants unchanged.
assert.equal(mergeVoiceRoster(participants, null).length, 2);
assert.equal(mergeVoiceRoster(participants, null)[0], participants[0]);
console.log("voiceRoster selftest ok");
