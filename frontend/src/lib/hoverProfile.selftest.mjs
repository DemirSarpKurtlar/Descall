// Hover card shows the full profile (3.7.11): merge rules, cache, dedupe, model.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cachedHoverProfile, clearHoverProfileCache, hoverCardModel, loadHoverProfile, mergeHoverProfile } from "./hoverProfile.js";

const here = dirname(fileURLToPath(import.meta.url));

// Merge: full profile fills cosmetics, live presence stays from the base.
const base = { id: "u1", username: "demir", status: "online", lastSeen: "2026-10-31T10:00:00Z", equippedCountry: { id: "tr" } };
const full = { id: "u1", username: "demir", status: "offline", lastSeen: null, bio: "Founder", equippedBanner: { asset_url: "https://x/b.png" }, equippedProfileColor: { effect_key: "ocean" }, bannerUrl: "" };
const m = mergeHoverProfile(base, full);
assert.equal(m.status, "online", "live status wins");
assert.equal(m.lastSeen, "2026-10-31T10:00:00Z");
assert.equal(m.bio, "Founder");
assert.equal(m.equippedBanner.asset_url, "https://x/b.png");
assert.deepEqual(m.equippedCountry, { id: "tr" }, "base fields kept when the profile has none");
assert.equal(mergeHoverProfile(base, { id: "other", bio: "x" }), base, "never merge another account");
assert.equal(mergeHoverProfile(base, null), base);

// Model: shop items reach the card.
const model = hoverCardModel(m);
assert.equal(model.bannerUrl, "https://x/b.png", "equipped shop banner");
assert.equal(model.colorClass, "has-pcolor");
assert.equal(model.colorStyle["--pc-a"], "#0f3d63");
const withBg = hoverCardModel({ ...m, equippedBackground: { asset_url: "https://x/bg.png" }, equippedProfileAura: { effect_key: "frost-veil" } });
assert.equal(withBg.backgroundUrl, "https://x/bg.png");
assert.equal(withBg.colorClass, "", "a background image wins over the card colour");
assert.equal(withBg.auraClass, "cosmetic-profile-aura aura-frost-veil");
assert.equal(hoverCardModel({ id: "x", banner_url: "https://x/up.png" }).bannerUrl, "https://x/up.png", "uploaded banner still works");

// Cache + dedupe.
clearHoverProfileCache();
let calls = 0;
const fetchProfile = async (id) => {
  calls += 1;
  return { id, bio: "hi" };
};
const [a, b] = await Promise.all([loadHoverProfile("u9", fetchProfile), loadHoverProfile("u9", fetchProfile)]);
assert.equal(calls, 1, "one request for two hovers");
assert.equal(a.bio, "hi");
assert.equal(b.bio, "hi");
await loadHoverProfile("u9", fetchProfile);
assert.equal(calls, 1, "cached");
assert.ok(cachedHoverProfile("u9"));
assert.equal(cachedHoverProfile("u9", Date.now() + 61_000), null, "expires after a minute");
assert.equal(await loadHoverProfile("u8", async () => { throw new Error("down"); }), null, "a failed request resolves to null");
assert.equal(await loadHoverProfile("", fetchProfile), null);

// Wiring.
const card = readFileSync(join(here, "../components/social/UserHoverCard.jsx"), "utf8");
assert.match(card, /loadHoverProfile\(userId, fetchPublicProfile\)/);
assert.match(card, /\/auth\/users\//);
assert.match(card, /StatusBadge status=\{statusKey\} user=\{merged\}/, "presence flare on the avatar");
assert.match(card, /NameEffectText user=\{merged\}/);
assert.match(card, /CountryBadge user=\{merged\}/);
assert.match(card, /"user-hover-card"/, "keeps the root class for frost / overlay / card colour rules");
assert.doesNotMatch(card, /\p{Extended_Pictographic}/u, "no emoji");

console.log("hoverProfile.selftest.mjs: ok");
