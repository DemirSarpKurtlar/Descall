// Run: node src/components/layout/newCreate.selftest.mjs
// "Yeni" sheet (3.7.14, owner pick draft A): no tabs; add by username, Create
// group card, invite link card, people you may know; group screen with photo,
// chips, search, round checks and the "N kişi seçildi" footer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const modal = read("../friends/NewCreateModal.jsx");
const side = read("./ServerSidebar.jsx");
const css = read("../../styles/new-create.css");
const frost = read("../../styles/frost.css");
const tr = read("../../i18n/locales/newCreate.tr.js");
const en = read("../../i18n/locales/newCreate.en.js");
const trMain = read("../../i18n/locales/tr.js");
const enMain = read("../../i18n/locales/en.js");

// Portalled, scrim keeps the shared backdrop class (overlay.css, Android back, edge swipe).
assert.match(modal, /createPortal\(/);
assert.match(modal, /document\.body/);
assert.match(modal, /className=\{`add-modal-backdrop nc-scrim/);
assert.match(modal, /import "\.\.\/\.\.\/styles\/new-create\.css";/);
// No tabs any more; ServerSidebar renders the new sheet and keeps its handlers.
assert.doesNotMatch(side, /add-modal-tab|quick-add-card|group-members-select|group-member-option/);
assert.match(side, /<NewCreateModal[\s\S]*?onAddFriend=\{handleAddFriend\}[\s\S]*?onQuickAdd=\{handleQuickAdd\}[\s\S]*?onCreateGroup=\{handleCreateGroup\}/);
assert.match(side, /screen=\{addTab === "group" \? "group" : "start"\}/);
assert.match(side, /focusUsername=\{addTab === "friend"\}/);
assert.match(side, /if \(showAddModal && addTab !== "group"\)/);
// Start screen: username field + inline Ekle, Create group card, invite card, suggestions.
assert.match(modal, /className="nc-field nc-user"/);
assert.match(modal, /className="nc-inline-btn" disabled=\{addLoading \|\| !friendUsername\.trim\(\)\}/);
assert.match(modal, /className="nc-card" onClick=\{\(\) => go\("group"\)\}/);
assert.match(modal, /toPublicShareUrl\(buildFriendInviteUrl\(handle\)\)/);
assert.match(modal, /copyText\(inviteUrl\)/);
assert.match(modal, /navigator\.share/);
assert.match(modal, /nc\.copied/);
assert.match(modal, /t\("Finding people you may know\.\.\."\)/);
assert.match(modal, /nc\.peopleEmpty/);
assert.match(modal, /t\("Try again"\)/);
assert.match(modal, /nc-pill is-sent/);
// Group screen: back, photo (crop + upload after create), chips, search, checks, footer.
assert.match(modal, /className="nc-back" onClick=\{\(\) => go\("start"\)\}/);
assert.match(modal, /<ImageCropModal/);
assert.match(modal, /validateAvatarFile\(file\)/);
assert.match(side, /uploadFile\(photo\)[\s\S]*?setGroupAvatar\(data\.group\.id, up\.url\)[\s\S]*?onGroupAvatarChanged\?\.\(/);
assert.match(modal, /className="nc-member-chip"/);
assert.match(modal, /filterFriends\(friends, query\)/);
assert.match(modal, /foldTr\(/);
assert.match(modal, /className=\{`nc-check\$\{on \? " is-on" : ""\}`\}/);
assert.match(modal, /nc\.selectedCount", \{ count: selected\.length, max: GROUP_MAX \}/);
assert.match(modal, /export const GROUP_MAX = 15;/);
assert.match(side, /if \(prev\.length >= GROUP_MAX_PICK\) return prev;/);
assert.match(modal, /disabled=\{addLoading \|\| !nameOk\}/);
// No text glyphs for checks / close (owner rule: icons only, no emoji).
for (const src of [modal, side]) assert.doesNotMatch(src, /[✓✔×]/);
assert.doesNotMatch(tr + en, /\p{Extended_Pictographic}/u);
// Material: frost surface in every frost.css list, light theme, fallbacks, phone sheet, reduced motion.
assert.equal((frost.match(/\.nc-sheet,/g) || []).length, 4);
assert.match(css, /:root\[data-theme="light"\] \.nc-sheet/);
assert.match(css, /html\.a11y-solid \.nc-sheet/);
assert.match(css, /\.nc-sheet\.is-phone/);
assert.match(css, /@media \(max-width: 600px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
// Strings registered in both locales with matching keys.
assert.match(trMain, /import \{ NC_TR \} from "\.\/newCreate\.tr\.js";[\s\S]*nc: NC_TR,/);
assert.match(enMain, /import \{ NC_EN \} from "\.\/newCreate\.en\.js";[\s\S]*nc: NC_EN,/);
const keys = (s) => [...s.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]).sort().join(",");
assert.equal(keys(tr), keys(en), "newCreate tr/en keys must match");
for (const k of [...modal.matchAll(/t\("nc\.([a-zA-Z]+)"/g)].map((m) => m[1])) {
  assert.ok(new RegExp(`^\\s{2}${k}:`, "m").test(tr), `nc.${k} missing in newCreate.tr.js`);
}
console.log("newCreate.selftest ok");
