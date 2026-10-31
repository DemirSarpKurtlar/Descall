// node src/components/social/adminBadge.selftest.mjs
// Descall staff badge (3.7.4, owner pick "D · Ekip etiketi").
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const jsx = rd("./AdminBadge.jsx");
const css = rd("./AdminBadge.css");
const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");

// Structure: brand square with the Descall mark, then the label (none on "mark").
assert.match(jsx, /className="dsc-admin-badge-mark"/);
assert.match(jsx, /<DescallMark size=\{variant === "chip" \? 13 : 11\} \/>/);
assert.match(jsx, /variant === "mark" \? null : <span className="dsc-admin-badge-label">/);
assert.ok(!/Shield/.test(jsx), "the old shield is gone");
assert.match(jsx, /t\("staffBadge\.long"\)/);
assert.match(jsx, /t\("staffBadge\.short"\)/);

// Copy.
assert.match(tr, /"staffBadge": \{\s*"tip": "Descall ekibi",\s*"short": "EKİP",\s*"long": "DESCALL EKİBİ"/);
assert.match(en, /"staffBadge": \{\s*"tip": "Descall staff",\s*"short": "STAFF",\s*"long": "DESCALL STAFF"/);

// Look: brand gradient square, no glow, no hover lift, light theme + contrast variants.
assert.match(css, /linear-gradient\(180deg, var\(--staff-a\), var\(--staff-b\)\)/);
assert.ok(!/0 0 1[0-9]px/.test(css) && !/:hover/.test(css), "no glow, no hover lift");
assert.match(css, /:root\[data-theme="light"\] \.dsc-admin-badge/);
assert.match(css, /@media \(forced-colors: active\)/);
assert.ok(![...jsx + css].some((c) => (c.codePointAt(0) >= 0x1f300 && c.codePointAt(0) <= 0x1faff) || (c.codePointAt(0) >= 0x2600 && c.codePointAt(0) <= 0x27bf)), "no emoji");
console.log("adminBadge.selftest: ok");
