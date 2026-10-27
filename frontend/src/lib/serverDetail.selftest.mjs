/**
 * Run: node frontend/src/lib/serverDetail.selftest.mjs
 */
import { mergeServerDetail } from "./serverDetail.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const prev = { id: "s1", name: "A", unread: 3, channels: [{ id: "c1", name: "genel" }], myPermissions: { flags: { VIEW_CHANNEL: true } } };
// Same payload, new objects (what every fetch returns): keep prev.
const same = JSON.parse(JSON.stringify({ id: "s1", name: "A", channels: prev.channels, myPermissions: prev.myPermissions }));
assert(mergeServerDetail(prev, same) === prev, "identical detail must keep the same object");
// Client-only fields not in the payload stay and do not count as a change.
assert(mergeServerDetail(prev, { id: "s1" }).unread === 3, "client fields survive");
// A real change makes a new merged object.
const renamed = mergeServerDetail(prev, { ...same, name: "B" });
assert(renamed !== prev && renamed.name === "B" && renamed.unread === 3, "changed name merges");
const moreChannels = mergeServerDetail(prev, { ...same, channels: [...same.channels, { id: "c2", name: "ses" }] });
assert(moreChannels !== prev && moreChannels.channels.length === 2, "changed channels merge");
const perms = mergeServerDetail(prev, { ...same, myPermissions: { flags: { VIEW_CHANNEL: false } } });
assert(perms !== prev && perms.myPermissions.flags.VIEW_CHANNEL === false, "changed permissions merge");
assert(mergeServerDetail(prev, null) === prev, "no payload keeps prev");
assert(mergeServerDetail(null, { id: "s2" }).id === "s2", "no prev takes the payload");
console.log("serverDetail selftest ok");
