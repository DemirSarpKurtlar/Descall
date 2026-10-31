// node src/components/admin/userLens.selftest.mjs
// Kullanıcının gözünden (3.7.2): every check the server can return has copy,
// sorting, wiring, no message content, phone sizes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const ui = rd("./UserLens.jsx");
const dossier = rd("./AdminUserDossier.jsx");
const lib = rd("../../../backend/lib/userLens.js");
const route = rd("../../../backend/routes/adminPeople.js");
const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");

// Pure helpers.
const src = ui.slice(ui.indexOf("export const STATUS_ORDER"), ui.indexOf("const STATUS_ICON"));
const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
assert.deepEqual(mod.sortChecks([{ id: "a", status: "ok" }, { id: "b", status: "blocked" }, { id: "c", status: "warn" }]).map((c) => c.id), ["b", "c", "a"]);
assert.deepEqual(mod.serverSummary({ counts: { total: 5, visible: 3, hidden: 2 } }), { visible: 3, total: 5, hasHidden: true });

// Every check id/status pair the server emits has a label in both languages.
const pairs = new Set();
for (const m of lib.matchAll(/check\("(\w+)", ([^)]*?)(?:,|\))/g)) {
  const statuses = [...m[2].matchAll(/"(ok|blocked|warn|info)"/g)].map((x) => x[1]);
  for (const st of statuses) pairs.add(`${m[1]}_${st}`);
}
assert.ok(pairs.size >= 15, `found ${pairs.size} check labels`);
for (const p of pairs) {
  assert.ok(tr.includes(`"lens_${p}":`), `tr lens_${p}`);
  assert.ok(en.includes(`"lens_${p}":`), `en lens_${p}`);
}
for (const key of new Set([...ui.matchAll(/t\("admin\.(\w+)"/g)].map((m) => m[1]))) {
  assert.ok(tr.includes(`"${key}":`), `tr admin.${key}`);
  assert.ok(en.includes(`"${key}":`), `en admin.${key}`);
}

// Server: read-only, audited, no message tables, section people.
assert.match(route, /router\.get\("\/people\/:id\/lens"/);
assert.match(route, /"user_lens"/);
assert.ok(!/_messages/.test(lib), "never reads message tables");
assert.match(lib, /accessBans\.peek\(/, "peek does not record a hit");

// Client wiring.
assert.match(dossier, /<UserLens userId=\{userId\} onClose=/);
assert.match(ui, /<OverlayPortal>/);
assert.ok(![...ui].some((c) => (c.codePointAt(0) >= 0x1f300 && c.codePointAt(0) <= 0x1faff) || (c.codePointAt(0) >= 0x2600 && c.codePointAt(0) <= 0x27bf)), "no emoji");
const css = rd("../../styles/admin-lens.css");
assert.match(css, /z-index: 100040/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*height: 44px/);
console.log("userLens.selftest: ok");
