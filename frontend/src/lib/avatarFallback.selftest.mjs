import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AVATAR_PALETTE, avatarColor, avatarInitials, avatarKey, crc32 } from "./avatarFallback.js";

assert.equal(crc32("hello"), 0x3610a686); // zlib.crc32(b"hello")
assert.equal(crc32("Ayşe Yılmaz") >>> 0, crc32("Ayşe Yılmaz"));
assert.equal(AVATAR_PALETTE.length, 8);
assert.equal(avatarInitials("Ayşe Yılmaz"), "AY");
assert.equal(avatarInitials("Mert Kaya"), "MK");
assert.equal(avatarInitials("Zeynep"), "Z");
assert.equal(avatarInitials("Elif Şahin"), "EŞ");
assert.equal(avatarInitials("Burak Öz"), "BÖ");
assert.equal(avatarInitials("cinar.baskin"), "CB");
assert.equal(avatarInitials("ilker ışık"), "İI");
assert.equal(avatarInitials(""), "?");
assert.equal(avatarInitials("  "), "?");
// Colour follows the id, not the name.
const a = avatarColor(avatarKey({ id: "u-1", displayName: "Ayşe" }));
const b = avatarColor(avatarKey({ id: "u-1", displayName: "Ayşe Yeni" }));
assert.equal(a, b);
assert.ok(AVATAR_PALETTE.includes(avatarColor("x")));
// Palette spread: 200 ids hit all 8 colours.
assert.equal(new Set(Array.from({ length: 200 }, (_, i) => avatarColor(`user-${i}`))).size, 8);

// WCAG contrast of white text on every swatch ≥ 4.5.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
for (const hex of AVATAR_PALETTE) {
  const ratio = 1.05 / (lum(hex) + 0.05);
  assert.ok(ratio >= 4.5, `${hex}: white text contrast ${ratio.toFixed(2)} < 4.5`);
}

const avatar = readFileSync(new URL("../components/ui/Avatar.jsx", import.meta.url), "utf8");
assert.match(avatar, /avatarInitials\(/);
assert.match(avatar, /--avatar-bg/);
const css = readFileSync(new URL("../styles/avatar.css", import.meta.url), "utf8");
const inner = css.slice(css.indexOf(".ui-avatar-inner {"), css.indexOf("}", css.indexOf(".ui-avatar-inner {")));
assert.equal(/linear-gradient/.test(inner), false, "flat fill, no sheen/gradient");
const group = readFileSync(new URL("../components/groups/GroupIcon.jsx", import.meta.url), "utf8");
assert.match(group, /avatarColor\(/);
console.log("avatarFallback.selftest ok");
