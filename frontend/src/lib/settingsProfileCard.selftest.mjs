import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { profileCardModel, statusDotOf, effectRoom, bannerUrlOf, fallbackBanner } from "./settingsProfileCard.js";
import { avatarEffectGeometry } from "./avatarEffectGeometry.js";

// Display name, handle and the staff line.
const me = { username: "Admin", displayName: "Demirr", equippedBanner: { asset_url: "https://x/b.webp" } };
const m = profileCardModel(me, { status: "online", isAdmin: true, teamLabel: "Descall ekibi" });
assert.equal(m.display, "Demirr");
assert.equal(m.handle, "@admin");
assert.equal(m.meta, "@admin · Descall ekibi");
assert.equal(m.bannerUrl, "https://x/b.webp");
assert.equal(m.bannerFallback, null);
assert.equal(profileCardModel({ username: "ayse" }, { isAdmin: false, teamLabel: "Descall ekibi" }).meta, "@ayse");
assert.equal(profileCardModel(null, { fallbackName: "Kullanıcı" }).display, "Kullanıcı");

// Banner sources: equipped item, then bannerUrl / banner_url, else a seeded gradient.
assert.equal(bannerUrlOf({ bannerUrl: "a" }), "a");
assert.equal(bannerUrlOf({ banner_url: "b" }), "b");
const fb = profileCardModel({ username: "ayse" });
assert.equal(fb.bannerUrl, null);
assert.equal(fb.bannerFallback, fallbackBanner("ayse"));
assert.match(fb.bannerFallback, /^linear-gradient/);

// Status: invisible / offline paint no dot.
assert.equal(statusDotOf("online"), "online");
assert.equal(statusDotOf("dnd"), "dnd");
assert.equal(statusDotOf("idle"), "idle");
assert.equal(statusDotOf("invisible"), null);
assert.equal(statusDotOf("offline"), null);
assert.equal(statusDotOf(undefined), "online");

// Stray-arc fix: the room kept around the avatar covers the effect inset (12%).
for (const size of [56, 64, 72, 84]) assert.ok(effectRoom(size) >= avatarEffectGeometry(size).outset + 4, `room ${size}`);

// CSS contract: the banner clips itself, the card never clips the avatar ring,
// heavy frost has a Reduce Transparency fallback, light theme is covered.
const css = readFileSync(new URL("../styles/settings-profile-card.css", import.meta.url), "utf8");
const cardRule = css.match(/\.spc\s*\{[^}]*\}/)?.[0] || "";
assert.ok(cardRule, "card rule");
assert.ok(!/overflow:\s*hidden/.test(cardRule), "card must not clip the avatar effect");
assert.match(css, /\.spc-banner\s*\{[^}]*overflow:\s*hidden/);
assert.match(css, /backdrop-filter:\s*blur\(/);
assert.match(css, /prefers-reduced-transparency:\s*reduce/);
assert.match(css, /html\.a11y-solid/);
assert.match(css, /data-theme="light"/);
assert.match(css, /#4F7CFF/i);

// Wiring: both the desktop sidebar and the phone menu use the card, edit opens the profile tab.
const panel = readFileSync(new URL("../components/layout/UserPanel.jsx", import.meta.url), "utf8");
assert.equal((panel.match(/<SettingsProfileCard\b/g) || []).length, 2, "desktop + mobile");
assert.ok(!/className="s3-hero"/.test(panel), "old hero removed");
assert.match(panel, /onEdit=\{\(\) => openTab\("profile"\)\}/);
const comp = readFileSync(new URL("../components/settings/SettingsProfileCard.jsx", import.meta.url), "utf8");
assert.match(comp, /t\("Edit profile"\)/);
assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(comp), "no emoji");

// Copy: "Profili düzenle" exists in every shipped language.
for (const [file, want] of [["tr", "Profili düzenle"], ["en", "Edit profile"], ["de", "Profil bearbeiten"]]) {
  const src = readFileSync(new URL(`../i18n/locales/${file}.js`, import.meta.url), "utf8");
  assert.ok(src.includes(`"Edit profile": "${want}"`), file);
}
for (const file of ["es", "fr", "pt-BR", "ru"]) {
  const src = readFileSync(new URL(`../i18n/locales/${file}.js`, import.meta.url), "utf8");
  assert.match(src, /"Edit profile": "[^"]+"/, file);
}
console.log("settingsProfileCard selftest ok");
