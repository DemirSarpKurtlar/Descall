// node src/components/admin/errorIssues.selftest.mjs
// Hata Kayıtları (3.7.0): tab wiring, section permission, drawer above the
// admin shell, copy in both languages, the old unused AdminErrorLogs is gone,
// and the devicechange crash guard stays.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const tab = rd("./ErrorIssuesTab.jsx");
const panel = rd("./AdminPanel.jsx");
const perms = rd("../../../backend/lib/adminPermissions.js");
const css = rd("../../styles/admin-errors.css");

assert.match(panel, /\{ id: "errors", label: "admin\.errors", icon: Bug \}/);
assert.match(panel, /tab === "errors" && <ErrorIssuesTab \/>/);
assert.match(rd("./adminNav.js"), /"security", "errors", "audit"/);
assert.match(perms, /"errors",/);
assert.match(perms, /\[\/\^\\\/error-groups\(\\\/\|\$\)\/, "errors"\]/);
assert.ok(!existsSync(new URL("./AdminErrorLogs.jsx", import.meta.url)), "old unused tab removed");
assert.match(tab, /<OverlayPortal>/, "drawer renders in document.body");
const z = Number(css.match(/\.aer-scrim \{[^}]*z-index: (\d+)/)[1]);
assert.ok(z > 99998, "drawer above the in-app admin shell");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*min-height: 44px/);

// ago() helper
const src = tab.match(/export function ago[\s\S]*?\n}\n/)[0].replace("export ", "");
const ago = new Function(`${src}; return ago;`)();
const t = (k, p) => `${k}:${p?.n ?? ""}`;
const now = Date.parse("2026-10-31T12:00:00Z");
assert.equal(ago("2026-10-31T11:59:40Z", t, now), "admin.errJustNow:");
assert.equal(ago("2026-10-31T11:30:00Z", t, now), "admin.errMinAgo:30");
assert.equal(ago("2026-10-31T02:00:00Z", t, now), "admin.errHourAgo:10");
assert.equal(ago("2026-10-25T12:00:00Z", t, now), "admin.errDayAgo:6");

const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");
const keys = new Set([...tab.matchAll(/t\("admin\.(err\w+|errors)"/g)].map((m) => m[1]));
for (const p of ["windows-app", "iphone-app", "ipad-app", "android-app", "iphone-web", "android-web", "desktop-web", "server", "other"]) keys.add(`errPlat_${p}`);
for (const r of ["24h", "7d", "30d"]) keys.add(`errRange_${r}`);
for (const s of ["open", "resolved", "ignored", "all"]) keys.add(`errStatus_${s}`);
for (const key of keys) {
  assert.ok(tr.includes(`"${key}":`), `tr admin.${key}`);
  assert.ok(en.includes(`"${key}":`), `en admin.${key}`);
}
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(tab), "no emoji");

// 3.6.1 crash: devicechange listeners need navigator.mediaDevices.
for (const f of ["../../hooks/useCall.js", "../../hooks/useGroupCall.js"]) {
  const s = rd(f);
  assert.match(s, /if \(!md \|\| typeof md\.addEventListener !== "function"\) return undefined;/, f);
  assert.ok(!/navigator\.mediaDevices\.addEventListener/.test(s), `${f} uses the guarded reference`);
}
console.log("errorIssues.selftest: ok");
