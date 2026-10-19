// O3 ownership transfer UI (2.12.2): approved glass mockup contract.
// Run: node src/components/servers/OwnershipTransfer.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tr from "../../i18n/locales/tr.js";
import en from "../../i18n/locales/en.js";
import { trDative, trGenitive } from "../../lib/trSuffix.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const ui = read("OwnershipTransfer.jsx");
const settings = read("ServerSettingsModal.jsx");
const sidebar = read("ServersSidebar.jsx");
const sockets = read("../../socket/bindServerSocketHandlers.js");
const app = read("../../App.jsx");
const css = read("../../styles/ownership-transfer.css").replace(/\/\*[\s\S]*?\*\//g, "");
const frost = read("../../styles/frost.css");

// Turkish copy, word for word from the approved mockup.
const o3 = tr.nested.o3;
const want = {
  dangerZone: "Tehlikeli bölge",
  transferTitle: "Sahipliği devret",
  transferHint: "Sunucuyu başka bir üyeye ver. Sen üye olarak kalırsın.",
  transferBtn: "Devret…",
  deleteTitle: "Sunucuyu sil",
  deleteHint: "Kanallar, mesajlar ve ekler kalıcı olarak silinir.",
  deleteBtn: "Sil…",
  sub: "{serverGen} yeni sahibini seç.",
  search: "Üye ara…",
  member: "Üye",
  irreversible: "Bu işlem geri alınamaz.",
  confirmLabel: "Onaylamak için sunucu adını yaz",
  password: "Şifren",
  cancel: "Vazgeç",
  transferTo: "{nameDat} devret",
  leaveTitle: "Sunucunun sahibisin",
  leaveSub: "Ayrılmadan önce ne olacağını seç.",
  leaveTransfer: "Önce sahipliği devret",
  leaveTransferHint: "Yeni sahibi seç, sonra ayrıl. Sunucu ve mesajlar kalır.",
  leaveDelete: "Sunucuyu sil ve ayrıl",
  leaveDeleteHint: "Herkes için kalıcı olarak silinir. Sunucu adını yazarak onaylarsın.",
  received: "{nameGen} sahibi artık sensin",
};
for (const [k, v] of Object.entries(want)) assert.equal(o3[k], v, `tr o3.${k}`);
assert.match(o3.warnStay, /^\{name\} sunucunun sahibi olur: sunucuyu silebilir, seni atabilir ya da yetkilerini kaldırabilir\. Sen rollerinle birlikte üye olarak kalırsın\. Geri almak için \{nameGen\} sahipliği sana devretmesi gerekir\.$/);
assert.deepEqual(Object.keys(en.nested.o3).sort(), Object.keys(o3).sort(), "en/tr o3 keys match");

const used = [...ui.matchAll(/t\("(o3\.[a-zA-Z]+)"/g), ...sockets.matchAll(/t\("(o3\.[a-zA-Z]+)"/g)].map((m) => m[1].slice(3));
for (const k of used) assert.ok(k in o3, `missing tr o3.${k}`);
assert.ok(!/t\("(?!o3\.)/.test(ui), "every string in the O3 UI goes through o3.* keys");
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
assert.equal(fill(o3.transferTo, { nameDat: trDative("Zeynep") }), "Zeynep'e devret");
assert.equal(fill(o3.sub, { serverGen: trGenitive("Alpha Topluluğu") }), "Alpha Topluluğu'nun yeni sahibini seç.");
assert.equal(fill(o3.received, { nameGen: trGenitive("Alpha Topluluğu") }), "Alpha Topluluğu'nun sahibi artık sensin");

// Danger zone: Server Settings › Overview, owner only.
assert.match(ui, /export function ServerDangerZone[\s\S]*?if \(!server\?\.isOwner\) return null;/);
assert.match(settings, /<ServerDangerZone[\s\S]*?onTransfer=\{\(\) => onRequestTransfer\?\.\(server\)\}[\s\S]*?onDelete=\{\(\) => onRequestDelete\?\.\(server\)\}/);
assert.match(sidebar, /onRequestTransfer=\{\(server\) => setTransfer\(\{ server, leaveAfter: false \}\)\}/);
assert.match(sidebar, /onRequestDelete=\{\(server\) => setConfirm\(\{ mode: "delete", server \}\)\}/);

// Transfer dialog: search, radio rows with role chips, warning, name check, password, "<isim>'e devret".
assert.match(ui, /role="radiogroup"/);
assert.match(ui, /role="radio"[\s\S]*?aria-checked=\{sel\}/);
assert.match(ui, /className=\{`o3-chip\$\{isAdminRole\(r\) \? " is-admin" : ""\}`\}/);
assert.match(ui, /className="o3-note" role="note"/);
assert.match(ui, /className=\{nameMatches \? "is-ok" : ""\}/);
assert.match(ui, /autoComplete="current-password"/);
assert.match(ui, /const canSubmit = Boolean\(selected\) && nameMatches && \(!passwordRequired \|\| password\.length > 0\) && !busy;/);
assert.match(ui, /filter\(\(m\) => !m\.isOwner\)/, "the owner is not a candidate");
assert.match(ui, /transferServerOwnership\(server\.id, \{\s*userId: selected\.userId,/);

// Owner pressing "Sunucudan ayrıl" gets the sheet, never a direct delete.
assert.match(sidebar, /confirm && confirm\.mode === "leave" && confirm\.server\.isOwner \? \(\s*\/\/ O3[^\n]*\n\s*<OwnerLeaveSheet/);
assert.match(sidebar, /onTransferFirst=\{\(\) => \{[\s\S]*?setTransfer\(\{ server, leaveAfter: true \}\);/);
assert.match(sidebar, /onDeleteAndLeave=\{\(\) => setConfirm\(\{ mode: "leave-delete", server: confirm\.server \}\)\}/);
assert.match(sidebar, /if \(leaveAfter\) \{[\s\S]*?await onLeaveServer\?\.\(server\.id\);/);
const leaveButtons = (sidebar.match(/openConfirm\("leave"\)/g) || []).length;
assert.ok(leaveButtons >= 3, "owners see Sunucudan ayrıl in the classic and the glass header menu");
assert.match(sidebar, /server\.isOwner \? \(\s*<>\s*<button[\s\S]*?setConfirm\(\{ mode: "leave", server \}\)/, "row context menu: owners can leave too");

// Live: server:updated derives isOwner per viewer; the new owner gets a toast + system notification.
assert.match(sockets, /"server:ownership:received",\n\];/);
assert.match(sockets, /ownerChanged && meId \? \{ isOwner: String\(ownerChanged\.toUserId\) === String\(meId\) \}/);
assert.match(sockets, /t\("o3\.received", \{ name, nameGen: trGenitive\(name\) \}\)/);
assert.match(app, /type === "server-owner"\) && data\.serverId/, "iOS push tap opens the server");

// Heavy frosted glass only: both surfaces are in every frost.css block.
assert.equal((frost.match(/\.o3-transfer, \.o3-leave-sheet/g) || []).length, 4);
assert.ok(!/\.o3-(transfer|leave-sheet)[^{]*\{[^}]*background(-color)?:/.test(css), "no own background on the frosted surfaces");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /@media \(prefers-contrast: more\)/);
assert.equal((css.match(/font-size: 16px;/g) || []).length, 2, "inputs are 16px (iOS: no zoom on focus)");
assert.match(ui, /useReducedMotion\(\)/);
assert.match(ui, /framerSpring\(SPRINGS\.sheet\)/);
assert.match(ui, /info\.offset\.y \+ project\(info\.velocity\.y\)/, "sheet dismiss projects release velocity");
console.log("OwnershipTransfer selftest ok");
