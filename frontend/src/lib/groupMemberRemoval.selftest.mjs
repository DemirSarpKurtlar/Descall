// node src/lib/groupMemberRemoval.selftest.mjs
// Group member removal (Oct 2026): list/state helpers, the system-row copy in
// Turkish ("Demir, Can’ı gruptan çıkardı"), list-preview localization and the
// UI wiring that has to stay in place (menu, confirm, banner, socket events).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyGroupMemberGone,
  applyGroupRole,
  canRemoveGroupMember,
  groupRoleOf,
  markGroupRemoved,
  mergeGroupMember,
  parseMemberEvent,
  withoutGroupMember,
} from "./groupMembers.js";
import {
  memberEventFromMessage,
  memberEventSegments,
  removedBannerBody,
  segmentsText,
  localizeMemberEventPreview,
} from "./groupMemberEvents.js";
import { localizeListPreview } from "./listPreview.js";
import tr from "../i18n/locales/tr.js";
import en from "../i18n/locales/en.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

// Minimal translator over the nested `gk` block (same {var} interpolation).
const makeT = (dict) => (key, vars = {}) => {
  const parts = key.split(".");
  let v = dict.nested || dict;
  for (const p of parts) v = v?.[p];
  const str = typeof v === "string" ? v : key;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
};
const trT = makeT(tr);
const enT = makeT(en);

/* ── roles + permission matrix (mirrors backend/lib/groupRoles) ── */
const g = {
  id: "g1",
  created_by: "own",
  members: [{ id: "own" }, { id: "adm" }, { id: "adm2" }, { id: "mem" }, { id: "mem2" }],
  memberIds: ["own", "adm", "adm2", "mem", "mem2"],
  adminIds: ["adm", "adm2"],
  memberCount: 5,
};
assert.equal(groupRoleOf(g, "own"), "owner");
assert.equal(groupRoleOf(g, "adm"), "admin");
assert.equal(groupRoleOf(g, "mem"), "member");
assert.equal(canRemoveGroupMember(g, "own", "adm"), true, "owner removes admin");
assert.equal(canRemoveGroupMember(g, "own", "mem"), true);
assert.equal(canRemoveGroupMember(g, "own", "own"), false, "never self");
assert.equal(canRemoveGroupMember(g, "adm", "mem"), true, "admin removes member");
assert.equal(canRemoveGroupMember(g, "adm", "adm2"), false, "admin cannot remove admin");
assert.equal(canRemoveGroupMember(g, "adm", "own"), false, "nobody removes owner");
assert.equal(canRemoveGroupMember(g, "mem", "mem2"), false, "member cannot remove");
assert.equal(canRemoveGroupMember({ ...g, removed: {} }, "own", "mem"), false, "read-only when removed");

/* ── state updates ── */
const gone = withoutGroupMember(g, "adm", { memberCount: 4 });
assert.deepEqual(gone.memberIds, ["own", "adm2", "mem", "mem2"]);
assert.deepEqual(gone.adminIds, ["adm2"]);
assert.equal(gone.memberCount, 4);
assert.equal(withoutGroupMember(g, "nobody"), g, "no-op keeps identity");
const inherited = withoutGroupMember(g, "own", { ownerId: "adm" });
assert.equal(inherited.created_by, "adm", "owner left: heir becomes owner");
assert.deepEqual(inherited.adminIds, ["adm2"], "heir is no longer listed as admin");
const list = [g, { id: "g2", members: [] }];
const nl = applyGroupMemberGone(list, "g1", "mem");
assert.equal(nl[1], list[1]);
assert.equal(nl[0].memberCount, 4);
assert.equal(applyGroupMemberGone(list, "g1", "zzz"), list);
assert.deepEqual(applyGroupRole(g, "mem", "admin").adminIds, ["adm", "adm2", "mem"]);
assert.deepEqual(applyGroupRole(g, "adm", "member").adminIds, ["adm2"]);
assert.equal(applyGroupRole(g, "adm", "admin"), g);
const rm = markGroupRemoved(g, { by: "own", byUsername: "demir", reason: "spam", removedAt: "2026-10-26T18:58:00Z" });
assert.equal(rm.removed.reason, "spam");
assert.equal(rm.removed.readUntil, "2026-10-26T18:58:00Z");
// Re-add: the server's fresh group ends the removed state.
assert.equal(mergeGroupMember(rm, { group: { id: "g1", members: [{ id: "own" }] } }).removed, null);

/* ── parsing + copy ── */
assert.deepEqual(parseMemberEvent('{"actorId":"own","actorName":"Demir","targetId":"mem","targetName":"Can"}'), {
  actorId: "own", actorName: "Demir", targetId: "mem", targetName: "Can",
});
assert.equal(parseMemberEvent("not json"), null);
const removedMsg = { type: "member_removed", memberEvent: '{"actorId":"own","actorName":"Demir","targetId":"mem","targetName":"Can"}' };
const ev = memberEventFromMessage(removedMsg, { meId: "zzz" });
assert.equal(segmentsText(memberEventSegments(ev, trT)), "Demir, Can’ı gruptan çıkardı");
assert.deepEqual(memberEventSegments(ev, trT).filter((s) => s.bold).map((s) => s.text), ["Demir", "Can’ı"]);
assert.equal(segmentsText(memberEventSegments(ev, enT)), "Demir removed Can");
const evMe = memberEventFromMessage(removedMsg, { meId: "mem" });
assert.equal(segmentsText(memberEventSegments(evMe, trT)), "Demir seni gruptan çıkardı");
const ali = memberEventFromMessage({ type: "member_removed", memberEvent: '{"actorId":"own","actorName":"Demir","targetId":"x","targetName":"Ali"}' });
assert.equal(segmentsText(memberEventSegments(ali, trT)), "Demir, Ali’yi gruptan çıkardı");
const left = memberEventFromMessage({ type: "member_left", memberEvent: '{"actorId":"x","actorName":"Ece"}' });
assert.equal(segmentsText(memberEventSegments(left, trT)), "Ece gruptan ayrıldı");
// Live names win over the stored snapshot.
const renamed = memberEventFromMessage(removedMsg, { members: [{ id: "mem", displayName: "Canan" }] });
assert.equal(renamed.targetName, "Canan");
assert.equal(memberEventFromMessage({ type: "text", text: "hi" }), null);

// Banner: locative on the time, 'sen' form.
assert.equal(
  removedBannerBody({ actorName: "Demir", time: "21:58" }, trT),
  "Demir seni 21:58’de çıkardı. Eski mesajları okuyabilirsin ama yeni mesaj gönderemezsin.",
);
assert.match(removedBannerBody({ actorName: "Demir", time: "21:40" }, trT), /21:40’ta/);

// List previews come from the backend in English; localized on the client.
assert.equal(localizeMemberEventPreview("demir removed can", trT), "demir, can’ı gruptan çıkardı");
assert.equal(localizeMemberEventPreview("demir removed you", trT), "demir seni gruptan çıkardı");
assert.equal(localizeMemberEventPreview("ece left the group", trT), "ece gruptan ayrıldı");
assert.equal(localizeMemberEventPreview("demir: removed it", trT), null, "normal chat text untouched");
assert.equal(localizeListPreview("demir removed you", trT), "demir seni gruptan çıkardı");

/* ── Turkish copy: 'sen' form, no 'siz' ── */
const gkTr = JSON.stringify(tr.nested?.gk || tr.gk || {});
assert.ok(gkTr.length > 50, "tr gk block present");
assert.doesNotMatch(gkTr, /iniz|ınız|sınız|siniz|abilirsiniz/, "Turkish copy uses 'sen'");
for (const k of ["remove", "confirmTitle", "confirmBody", "bannerTitle", "bannerDismiss", "errCooldown"]) {
  assert.ok((tr.nested?.gk || tr.gk)?.[k], `tr gk.${k}`);
  assert.ok((en.nested?.gk || en.gk)?.[k], `en gk.${k}`);
}

/* ── wiring guards ── */
const app = read("../App.jsx");
for (const ev of ["group:member:removed", "group:removed", "group:member:left", "group:left", "group:member:role"]) {
  assert.ok(app.includes(`socket.on("${ev}"`), `App listens to ${ev}`);
}
assert.match(app, /message_type === "member_removed"/, "normalizeGroupMessage maps member events");
const list2 = read("../components/chat/MessageList.jsx");
assert.match(list2, /GroupMemberEventRow/, "MessageList renders the system row");
const panel = read("../components/layout/ChatPanel.jsx");
assert.match(panel, /GroupRemovedBanner/, "composer is replaced by the removed banner");
assert.match(panel, /memberMenu\.layer/, "member menu layer mounted");
const comp = read("../components/groups/GroupMemberRemoval.jsx");
assert.match(comp, /server-member-menu gk-menu/, "menu uses the heavy-frost surface");
assert.match(comp, /createPortal/, "menu portals to body");
const frost = read("../styles/frost.css");
assert.match(frost, /\.server-member-menu/, "server-member-menu is in the heavy frost list");
const css = read("../components/groups/GroupMemberRemoval.css");
assert.match(css, /\.gk-removed\{[^}]*backdrop-filter:blur\(40px\)/, "removed banner is heavy glass");

console.log("groupMemberRemoval selftest ok");
