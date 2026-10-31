// Hover card shows the full profile (3.7.11): merge rules, cache, dedupe, model.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cachedHoverProfile, cachedMutual, clearHoverProfileCache, currentActivity, hoverCardModel, loadHoverProfile, loadMutual, mergeHoverProfile, sinceLabel, HOVER_CLOSE_GRACE_MS } from "./hoverProfile.js";

const here = dirname(fileURLToPath(import.meta.url));

// Translators straight from the shell catalogs (no app boot in Node).
const { formatMessage } = await import("../i18n/message.js");
const { SHELL_TR } = await import("../i18n/locales/shell.tr.js");
const { SHELL_EN } = await import("../i18n/locales/shell.en.js");
const pick = (cat, key) => key.replace(/^shell\./, "").split(".").reduce((o, k) => o?.[k], cat);
const trT = (key, vars) => formatMessage(pick(SHELL_TR, key), vars, "tr-TR");
const enT = (key, vars) => formatMessage(pick(SHELL_EN, key), vars, "en-US");
const TR = { t: trT, locale: "tr" };

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

// 3.7.13 design C: "Şu an", mutual, message box, name below the banner seam.
const now = Date.parse("2026-10-31T12:00:00Z");
assert.equal(sinceLabel("2026-10-31T11:48:00Z", now, trT), "12 dk");
assert.equal(sinceLabel("2026-10-31T10:45:00Z", now, trT), "1 sa 15 dk");
assert.equal(sinceLabel("2026-10-28T12:00:00Z", now, trT), "3 gün");
assert.equal(sinceLabel(null, now), "");
assert.equal(sinceLabel("2026-10-31T11:59:40Z", now, trT), "az önce");
assert.equal(sinceLabel("2026-10-31T10:45:00Z", now, enT), "1 h 15 min");
assert.equal(sinceLabel("2026-10-28T12:00:00Z", now, enT), "3 d");
const servers = [{ id: "s1", name: "Descall Geliştirme", channels: [{ id: "c1", name: "Genel" }] }];
const voice = { s1: { c1: { members: [{ id: "u1" }, { id: "u2" }], memberCount: 2 } } };
const v = currentActivity("u2", { voiceStatesByServer: voice, servers }, now, TR);
assert.equal(v.kind, "voice");
assert.equal(v.title, "Genel");
assert.equal(v.subtitle, "Descall Geliştirme");
assert.equal(v.count, 2);
const fp = { u3: { displayName: "Minecraft oynuyor", appName: "Minecraft", appType: "game", startedAt: "2026-10-31T11:00:00Z" } };
const g = currentActivity("u3", { friendPresence: fp, voiceStatesByServer: voice, servers }, now, TR);
assert.equal(g.kind, "game");
assert.equal(g.title, "Minecraft oynuyor");
assert.equal(g.subtitle, "1 sa");
assert.equal(currentActivity("u2", { friendPresence: { u2: fp.u3 }, voiceStatesByServer: voice, servers }, now).kind, "voice", "voice wins over app activity");
assert.equal(currentActivity("nobody", { friendPresence: fp, voiceStatesByServer: voice, servers }, now), null);
assert.equal(currentActivity("u2", {}, now), null);

let mcalls = 0;
const fetchMutual = async () => {
  mcalls += 1;
  return { mutualFriends: [{ id: "f1", username: "ali" }], mutualServers: [{ id: "s1", name: "X" }], count: 1 };
};
const [m1] = await Promise.all([loadMutual("Yigit", fetchMutual), loadMutual("yigit", fetchMutual)]);
assert.equal(mcalls, 1, "one mutual request, case-insensitive key");
assert.deepEqual(m1, { friends: [{ id: "f1", username: "ali" }], servers: [{ id: "s1", name: "X" }] });
assert.ok(cachedMutual("YIGIT"));
assert.equal(await loadMutual("err", async () => { throw new Error("x"); }), null);
assert.ok(HOVER_CLOSE_GRACE_MS >= 150 && HOVER_CLOSE_GRACE_MS <= 400);

assert.match(card, /currentActivity\(userId, ctx/);
assert.match(card, /loadMutual\(username, fetchMutual\)/);
assert.match(card, /ctx\.sendDm\(userId, text\)/, "message box sends a DM");
assert.match(card, /className="uhc3-msg"/);
const css = readFileSync(join(here, "../styles/user-hover-card.css"), "utf8");
assert.match(css, /\.uhc3-top \{[^}]*margin-top: -42px;/);
assert.match(css, /\.uhc3-id \{[^}]*padding-top: 50px;/, "name starts 8px below the banner seam (42px of avatar hangs below it)");
assert.match(css, /\.user-hover-card\.uhc3 \{ pointer-events: auto;/);
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.match(list, /onPointerEnter=\{cancelHoverClose\}/);
assert.match(list, /const hideHoverCard = \(\) => scheduleHoverClose\(\);/, "leaving the avatar waits for the pointer to reach the card");
const layout = readFileSync(join(here, "../components/layout/AppLayout.jsx"), "utf8");
assert.match(layout, /<HoverCardContext\.Provider value=\{hoverCardValue\}>/);
assert.match(layout, /socket\.emit\("dm:send", \{ toUserId, text \}\)/);

console.log("hoverProfile.selftest.mjs: ok");
