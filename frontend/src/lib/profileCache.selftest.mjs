// node src/lib/profileCache.selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  peekProfile, storeProfile, invalidateProfile, clearProfileCache, fetchProfileShared, isProfileFresh,
} from "./profileCache.js";

clearProfileCache();
assert.equal(peekProfile("u1"), null);

// Concurrent opens share one request and fill the cache.
let calls = 0;
const load = async (id) => { calls += 1; await new Promise((r) => setTimeout(r, 5)); return { id, bio: "hi" }; };
const [a, b] = await Promise.all([fetchProfileShared("u1", load), fetchProfileShared("u1", load)]);
assert.equal(calls, 1);
assert.deepEqual(a, b);
assert.equal(peekProfile("u1").bio, "hi");
assert.equal(isProfileFresh("u1"), true);

// A failed load does not erase a cached profile.
await fetchProfileShared("u1", async () => null);
assert.equal(peekProfile("u1").bio, "hi");

// Profile updates drop the entry; numeric and string ids match.
storeProfile(7, { id: 7 });
assert.ok(peekProfile("7"));
invalidateProfile("7");
assert.equal(peekProfile(7), null);

// The profile window uses the cache and hides content until the profile is known; the
// hover card shares it; App drops entries on profile updates.
const here = new URL(".", import.meta.url).pathname;
const modal = fs.readFileSync(`${here}../components/social/UserProfileModal.jsx`, "utf8");
assert.match(modal, /peekProfile\(requestedId\)/);
assert.match(modal, /fetchProfileShared\(requestedId/);
assert.match(modal, /is-look-pending/);
const css = fs.readFileSync(`${here}../components/social/ProfileSheet.css`, "utf8");
assert.match(css, /\.user-profile-card\.is-look-pending/);
const hover = fs.readFileSync(`${here}../components/social/UserHoverCard.jsx`, "utf8");
assert.match(hover, /fetchProfileShared\(id, requestPublicProfile\)/);
const app = fs.readFileSync(`${here}../App.jsx`, "utf8");
assert.ok((app.match(/invalidateProfile\(user\.id\)/g) || []).length >= 3);

console.log("profileCache selftest ok");
