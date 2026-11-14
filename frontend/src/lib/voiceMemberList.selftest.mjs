// Sidebar list under a busy voice channel. Run: node src/lib/voiceMemberList.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VOICE_LIST_COLLAPSED, visibleVoiceMembers } from "./voiceMemberList.js";

const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, username: `user${i}` }));

// Small channels: everyone, no "+N more".
assert.deepEqual(visibleVoiceMembers(people(5)).hiddenCount, 0);
assert.equal(visibleVoiceMembers(people(VOICE_LIST_COLLAPSED)).shown.length, VOICE_LIST_COLLAPSED);

// 20 people: 12 rows + "+8 more" (the old slice(0, 12) hid 8 people with no hint).
const twenty = visibleVoiceMembers(people(20));
assert.equal(twenty.shown.length, 12);
assert.equal(twenty.hiddenCount, 8);

// Expanded: all 20.
const open = visibleVoiceMembers(people(20), { expanded: true });
assert.equal(open.shown.length, 20);
assert.equal(open.hiddenCount, 0);

// You are always listed, even when you joined 17th.
const me = visibleVoiceMembers(people(20), { pinId: "u16" });
assert.equal(me.shown.length, 12);
assert.equal(me.hiddenCount, 8);
assert.equal(me.shown[11].id, "u16");
assert.ok(me.shown.slice(0, 11).every((m, i) => m.id === `u${i}`), "order of the others is kept");
// Already visible: unchanged.
assert.deepEqual(visibleVoiceMembers(people(20), { pinId: "u3" }).shown.map((m) => m.id), people(12).map((m) => m.id));
// Numeric ids match string ids.
assert.equal(visibleVoiceMembers([...people(15), { id: 99 }], { pinId: "99" }).shown.at(-1).id, 99);

// Junk tolerated.
assert.deepEqual(visibleVoiceMembers(null).shown, []);
assert.equal(visibleVoiceMembers([null, { id: "a" }, {}]).shown.length, 1);

const sidebar = readFileSync(new URL("../components/servers/ServersSidebar.jsx", import.meta.url), "utf8");
assert.doesNotMatch(sidebar, /voiceMembers\.slice\(0,\s*12\)/, "no silent 12-person cap");
assert.match(sidebar, /visibleVoiceMembers\(voiceMembers/);
// The "+N" row reuses the translated "More" / "Show less" strings (all live locales).
assert.match(sidebar, /t\("More"\)\} \(\+\$\{voiceList\.hiddenCount\}\)/);
assert.match(sidebar, /t\("Show less"\)/);

console.log("voiceMemberList selftest: ok");
