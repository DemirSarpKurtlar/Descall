// Market 2.0 catalog group C2: every catalog item has a renderer, the renderers keep the
// chat readable and calm (no motion on the bubble box itself, reduced motion honoured),
// card colours keep white text at AAA, and no emoji ships in names or descriptions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOP2_PROFILE_COLORS } from "../lib/shop2ProfileColors.js";
import { PROFILE_COLORS, profileColorClass, profileColorStyle, profileColorSwatch } from "../lib/profileColors.js";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const css = readFileSync(join(here, "shop2-c2.css"), "utf8");
const { items, SET_KEYS } = require("../../backend/catalog/shop2/c2-chat.js");

// Counts per the Market 2.0 plan.
const count = (cat, set) => items.filter((i) => i.category === cat && Boolean(i.set_key) === set).length;
assert.equal(count("chat_bubble", false), 64);
assert.equal(count("chat_bubble", true), 16);
assert.equal(count("name_effect", false), 54);
assert.equal(count("profile_color", false), 15);
assert.equal(count("profile_color", true), 16);
assert.equal(count("typing_flare", false), 16);
assert.equal(SET_KEYS.length, 16);

const BANDS = { common: [150, 300], rare: [300, 550], epic: [550, 900], legendary: [900, 1500] };
const emoji = /\p{Extended_Pictographic}/u;
const keys = new Set();
for (const it of items) {
  assert.match(it.sku, /^s2-[a-z_]+-[a-z0-9-]+$/, it.sku);
  assert.match(it.effect_key, /^s2-[a-z0-9-]+$/, it.sku);
  assert.ok(!keys.has(`${it.category}:${it.effect_key}`), `duplicate effect_key ${it.effect_key}`);
  keys.add(`${it.category}:${it.effect_key}`);
  for (const l of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    assert.ok(it.name[l] && it.description[l], `${it.sku} ${l}`);
    assert.doesNotMatch(it.name[l] + it.description[l], emoji, `${it.sku} ${l} has an emoji`);
    assert.doesNotMatch(it.name[l] + it.description[l], /valorant|takım bul|takim bul/i, it.sku);
  }
  if (!it.set_key) {
    const [lo, hi] = BANDS[it.rarity];
    assert.ok(it.price_descoin >= lo && it.price_descoin <= hi, `${it.sku} price ${it.price_descoin} outside ${it.rarity}`);
  }
  const sel = {
    chat_bubble: `.cosmetic-chat-bubble.bubble-${it.effect_key}`,
    name_effect: `.cosmetic-name-effect.effect-${it.effect_key}`,
    typing_flare: `.typing-shell-${it.effect_key}`,
    profile_color: `.pc-${it.effect_key} {`,
  }[it.category];
  assert.ok(css.includes(sel), `${it.sku}: no renderer (${sel})`);
  if (it.category === "profile_color") assert.ok(SHOP2_PROFILE_COLORS[it.effect_key], `${it.sku}: no palette entry`);
}

// Bubbles: art is opaque and lives on the box or its pseudo-elements; the box never animates
// (Framer Motion owns transform on .message-bubble). Reduced motion and gd-lite stop everything.
for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const sel = m[1].trim();
  if (!/bubble-s2-/.test(sel) || !/animation\s*:/.test(m[2]) || /animation\s*:\s*none/.test(m[2])) continue;
  for (const part of sel.split(",")) assert.match(part, /::(before|after)/, `"${part.trim()}" animates the bubble box`);
}
assert.doesNotMatch(css, /backdrop-filter/, "bubbles are opaque paint, no per-bubble blur");
for (const scope of ["bubble-s2-", "effect-s2-", "typing-s2-"]) {
  assert.match(css, new RegExp(`@media \\(prefers-reduced-motion: reduce\\) \\{[^@]*${scope}`), `${scope} honours prefers-reduced-motion`);
  assert.match(css, new RegExp(`html:is\\(\\.reduce-motion, \\.gd-lite\\) [^{]*${scope}`), `${scope} stops under reduce-motion / gd-lite`);
}
assert.match(css, /\.cosmetic-chat-bubble\[class\*="bubble-s2-"\] \{[^}]*background: var\(--s2-bg\) !important;/);
assert.match(css, /html\[data-theme="light"\] \.cosmetic-name-effect\[class\*="effect-s2-"\]/, "names deepen on light surfaces");

// Card colours: white text stays AAA on every stop, original palette untouched.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
for (const [key, [a, b, accent, angle, mid]] of Object.entries(SHOP2_PROFILE_COLORS)) {
  for (const hex of [a, b, accent, mid]) assert.match(hex, /^#[0-9a-f]{6}$/, `${key} ${hex}`);
  for (const hex of [a, b, mid]) assert.ok(1.05 / (lum(hex) + 0.05) >= 7, `${key} ${hex} keeps white text AAA`);
  assert.ok(Number.isFinite(angle));
  assert.equal(PROFILE_COLORS[key], undefined, "Market 2.0 keys stay out of the 3.7.10 palette");
}
assert.equal(profileColorClass("ruby"), "has-pcolor");
assert.equal(profileColorClass("s2-set-gece-limani"), "has-pcolor pcolor-s2 pc-s2-set-gece-limani");
assert.deepEqual(profileColorStyle("s2-pc-cosmos"), { "--pc-a": "#141a3e", "--pc-b": "#04050e", "--pc-accent": "#c6b7ff", "--pc-angle": "180deg", "--pc-c": "#0a0e26" });
assert.match(profileColorSwatch({ equippedProfileColor: { effect_key: "s2-pc-cocoa" } }), /^linear-gradient\(180deg, #4a2a1a 0%, #2e1a10 55%, #160c06 100%\)$/);
assert.equal(profileColorClass({ equippedProfileColor: { effect_key: "s2-nope" } }), "");

// Set name colour in chat (coordinator decision): message authors carry equippedProfileColor,
// NameEffectText falls back to the set colour when no name effect is worn, and both inks read
// at AA (4.5:1) on the dark chat and the light chat.
const userProfileSrc = readFileSync(join(here, "../../backend/lib/userProfile.js"), "utf8");
const chatKeys = userProfileSrc.slice(userProfileSrc.indexOf("const CHAT_COSMETIC_KEYS"), userProfileSrc.indexOf("];", userProfileSrc.indexOf("const CHAT_COSMETIC_KEYS")));
assert.match(chatKeys, /"equippedProfileColor"/, "chat senders carry the card colour");
const cosmeticsSrc = readFileSync(join(here, "../components/ui/Cosmetics.jsx"), "utf8");
const net = cosmeticsSrc.slice(cosmeticsSrc.indexOf("export function NameEffectText"), cosmeticsSrc.indexOf("\n}\n", cosmeticsSrc.indexOf("export function NameEffectText")));
assert.ok(net.indexOf("equippedNameEffect") < net.indexOf("equippedProfileColor"), "a worn name effect wins");
assert.match(net, /startsWith\("s2-set-"\) && shop2ProfileColor\(colourKey\)/, "only known Market 2.0 set colours");
assert.match(net, /`s2-name-colour pc-\$\{colourKey\}`/);
const cr = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
for (const k of SET_KEYS) {
  const rule = css.match(new RegExp(`\\.pc-s2-set-${k} \\{ --pc-name: linear-gradient\\(100deg, ([^)]*)\\);`));
  assert.ok(rule, `${k}: dark name ink`);
  for (const hex of rule[1].match(/#[0-9a-f]{6}/g)) assert.ok(cr(hex, "#1b1d26") >= 4.5, `${k} ${hex} on dark chat`);
  const light = css.match(new RegExp(`\\.pc-s2-set-${k} \\{ --pc-name-l: linear-gradient\\(100deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`));
  assert.ok(light, `${k}: light name ink`);
  for (const hex of light.slice(1)) assert.ok(cr(hex, "#eef1f8") >= 4.5, `${k} ${hex} on light chat`);
}
assert.match(css, /\.s2-name-colour \{[^}]*background-image: var\(--pc-name, linear-gradient\(currentColor, currentColor\)\)/, "never invisible without a palette var");

console.log(`shop2-c2.selftest ok (${items.length} items)`);
