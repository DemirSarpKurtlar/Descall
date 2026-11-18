// node src/lib/profileLook.selftest.mjs
// Polish scan Nov 2026: the hover card shares the profile window's cache, follows its
// invalidation, and the profile window never stays blank (skeleton, timeout, retry).
import assert from "node:assert/strict";
import fs from "node:fs";
import { storeProfile, invalidateProfile, clearProfileCache, onProfileDropped } from "./profileCache.js";
import { cachedHoverProfile, instantHoverProfile, loadHoverProfile, clearHoverProfileCache } from "./hoverProfile.js";

clearProfileCache();
clearHoverProfileCache();

// A profile the profile window loaded paints the hover card at once.
storeProfile("u1", { id: "u1", bio: "from window" });
assert.equal(instantHoverProfile("u1").bio, "from window");
assert.equal(instantHoverProfile(""), null);

// The hover card's own entry wins while fresh, and goes with a profile update.
await loadHoverProfile("u2", async (id) => ({ id, bio: "hover" }));
assert.equal(cachedHoverProfile("u2").bio, "hover");
invalidateProfile("u2");
assert.equal(cachedHoverProfile("u2"), null, "user:profile:updated drops the hover entry too");

await loadHoverProfile("u3", async (id) => ({ id, bio: "x" }));
clearProfileCache();
assert.equal(cachedHoverProfile("u3"), null, "logout clears the hover cache too");

// Listeners get the id, or null for a full clear; unsubscribe works.
const seen = [];
const off = onProfileDropped((id) => seen.push(id));
invalidateProfile("u9");
clearProfileCache();
off();
invalidateProfile("u10");
assert.deepEqual(seen, ["u9", null]);

// Wiring in the components.
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const modal = read("../components/social/UserProfileModal.jsx");
assert.match(modal, /PROFILE_LOAD_TIMEOUT_MS/, "the profile request has a timeout");
assert.match(modal, /signal: ctrl\.signal/);
assert.match(modal, /ProfileLookSkeleton/, "a neutral skeleton shows while the first look loads");
assert.match(modal, /profile-load-error/, "a failed load offers a retry");
const css = read("../components/social/ProfileSheet.css");
assert.match(css, /:not\(\.pfs-look-skel\)/, "the pending rule does not hide the skeleton");
const hover = read("../components/social/UserHoverCard.jsx");
assert.match(hover, /instantHoverProfile/, "the hover card reads the shared cache first");
assert.match(hover, /lookReady/, "the hover card waits for the real look");

console.log("profileLook selftest ok");
