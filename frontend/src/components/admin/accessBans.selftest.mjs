// node src/components/admin/accessBans.selftest.mjs
// Erişim Yasakları (3.5.0): tab wiring, device id on API + socket, form rules,
// copy in both languages, no raw IPs on screen, phone targets.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const tab = rd("./AccessBansTab.jsx");
const panel = rd("./AdminPanel.jsx");
const nav = rd("./adminNav.js");
const http = rd("../../api/http.js");
const socket = rd("../../socket.js");
const dev = rd("../../lib/deviceId.js");
const perms = rd("../../../backend/lib/adminPermissions.js");
const css = rd("../../styles/admin-access.css");

assert.match(panel, /\{ id: "accessBans", label: "admin\.accessBans", icon: Ban \}/);
assert.match(panel, /tab === "accessBans" && <AccessBansTab \/>/);
assert.match(nav, /"suspicious", "accessBans"\]/);
assert.match(perms, /"accessBans",/);
assert.match(perms, /\[\/\^\\\/access-bans\(\\\/\|\$\)\/, "accessBans"\]/);

// Device id: header on every public API call, `device` in the socket handshake.
assert.match(http, /\.\.\.deviceHeaders\(\),/);
assert.match(socket, /device: getDeviceId\(\)/);
assert.match(dev, /"X-Descall-Device"/);
assert.match(dev, /const RE = \/\^\[A-Za-z0-9_-\]\{16,80\}\$\//, "same shape the server accepts");
assert.match(rd("../../../backend/lib/accessBans.js"), /const DEVICE_RE = \/\^\[A-Za-z0-9_-\]\{16,80\}\$\//);

// Form rules (canSubmitBan is exported pure; evaluate it from source).
const src = tab.match(/const IP_RE = [^\n]+\n/)[0] + tab.match(/export function canSubmitBan[\s\S]*?\n}\n/)[0].replace("export ", "");
const canSubmitBan = new Function(`${src}; return canSubmitBan;`)();
assert.equal(canSubmitBan({ mode: "ip", ip: "88.230.1.2" }), true);
assert.equal(canSubmitBan({ mode: "network", ip: "2a02:e0::5" }), true);
assert.equal(canSubmitBan({ mode: "ip", ip: "merhaba" }), false);
assert.equal(canSubmitBan({ mode: "account", username: "@a" }), false);
assert.equal(canSubmitBan({ mode: "account", username: "@trol" }), true);

// Copy, no emoji, GlassCheckbox only, phone 44pt.
const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");
const keys = new Set([...tab.matchAll(/t\("admin\.(ab\w+|accessBans)"/g)].map((m) => m[1]));
for (const k of ["accessBans", "abLead", "abNew", "abBan", "abRevoke", "abHitsTitle"]) keys.add(k);
for (const prefix of ["abMode_", "abModeHint_", "abConfirm_"]) for (const m of ["ip", "network", "account"]) keys.add(prefix + m);
for (const d of ["1d", "7d", "30d", "90d", "permanent"]) keys.add(`abDur_${d}`);
for (const k of ["ip", "network", "device"]) keys.add(`abKind_${k}`);
for (const s of ["active", "ended", "all"]) keys.add(`abStatus_${s}`);
for (const key of keys) {
  assert.ok(new RegExp(`"${key}":`).test(tr), `tr admin.${key}`);
  assert.ok(new RegExp(`"${key}":`).test(en), `en admin.${key}`);
}
assert.ok(!/type="checkbox"/.test(tab), "GlassCheckbox only");
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(tab), "no emoji");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*min-height: 44px/);
console.log("accessBans.selftest: ok");
