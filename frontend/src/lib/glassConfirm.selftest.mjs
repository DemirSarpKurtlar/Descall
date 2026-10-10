// Shared iOS glass confirm + message-delete ack tracking.
// Run: node src/lib/glassConfirm.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { confirmAction, splitConfirmCopy } from "./glassConfirm.js";
import {
  _resetMessageDeleteFeedback,
  resolveMessageDeleted,
  resolveMessageDeleteFailed,
  resolveMessageDeleteFailedForScope,
  trackMessageDelete,
} from "./messageDeleteFeedback.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.deepEqual(splitConfirmCopy("Kick Ada from this server?"), {
  title: "Kick Ada from this server?",
  message: "",
});
const block = "Block Ada? They won't be able to message you, call you, or send you friend requests.";
const split = splitConfirmCopy(block);
assert.equal(split.title, "Block Ada?");
assert.match(split.message, /^They won't/);

const seen = [];
globalThis.window = {
  confirm(text) {
    seen.push(text);
    return false;
  },
};
const cancelled = await confirmAction({
  message: "Delete folder \"Ops\"? Servers will stay unfiled.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
});
assert.equal(cancelled, false);
assert.equal(seen[0], "Delete folder \"Ops\"? Servers will stay unfiled.");

globalThis.window.confirm = () => true;
const accepted = await confirmAction({ message: "Unlink?", confirmLabel: "Unlink", danger: false });
assert.equal(accepted, true);

_resetMessageDeleteFeedback();
assert.equal(resolveMessageDeleted("missing"), false);
trackMessageDelete("m1", "server:c1", 30);
assert.equal(resolveMessageDeleted("m1"), true);
assert.equal(resolveMessageDeleted("m1"), false);

trackMessageDelete("m2", "dm:peer", 30);
assert.equal(resolveMessageDeleteFailed("m2"), true);

trackMessageDelete("m3", "server:c9", 30);
assert.equal(resolveMessageDeleteFailedForScope("server:c9"), true);
assert.equal(resolveMessageDeleteFailedForScope("server:c9"), false);

let timedOut = false;
const orig = globalThis.setTimeout;
trackMessageDelete("m4", "group:g1", 20);
await new Promise((r) => orig(() => r(), 40));
assert.equal(resolveMessageDeleted("m4"), false);
timedOut = true;
assert.equal(timedOut, true);
_resetMessageDeleteFeedback();

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const alert = src("components/ui/GlassConfirm.jsx");
assert.match(alert, /scale: 1\.1/);
assert.match(alert, /SPRINGS\.materialize/);
assert.match(alert, /REDUCED_MOTION_FADE/);
assert.match(alert, /hapticWarning/);
assert.match(alert, /Alerts do not dismiss from the scrim/);
assert.match(alert, /role="alertdialog"/);

const css = src("styles/glass/alert.css");
assert.match(css, /width: min\(300px/);
assert.match(css, /max-width: 300px/);
assert.match(css, /\.g-alert-btn\.is-cancel[\s\S]*font-weight: 600/);
assert.match(css, /\.g-alert-btn\.is-danger[\s\S]*color: var\(--g-red\)/);
assert.match(css, /\.g-alert-btn:active/);
assert.match(src("styles/glass/index.css"), /alert\.css/);
assert.match(src("hooks/useEdgeSwipeBack.js"), /\.g-alert-scrim/);

const sidebar = src("components/layout/ServerSidebar.jsx");
assert.match(sidebar, /<GlassConfirm/);
assert.match(sidebar, /if \(danger && !glass\) hapticWarning/);

for (const rel of [
  "components/servers/ServersSidebar.jsx",
  "components/servers/ServerMembersPanel.jsx",
  "components/servers/ServerRolesModal.jsx",
  "components/settings/RiotLinkCard.jsx",
  "components/lfg/LfgWorkspace.jsx",
  "lib/blockedUsers.js",
  "components/settings/DeleteAccountSection.jsx",
]) {
  const file = src(rel);
  assert.match(file, /GlassConfirm|confirmAction/, rel);
}

assert.match(src("components/layout/AdminMenu.jsx"), /window\.confirm/);
assert.match(src("components/settings/SettingsPanelNew.jsx"), /window\.confirm/);

const messages = src("components/chat/MessageList.jsx");
assert.match(messages, /title=\{t\("Delete message"\)\}/);
assert.match(messages, /This message will be deleted for everyone/);
assert.match(messages, /if \(glass\)/);
assert.match(messages, /trackMessageDelete/);
assert.match(messages, /emitDelete\(\)/);

const tr = src("i18n/locales/tr.js");
assert.match(tr, /"Delete message": "Mesajı sil"/);
assert.match(tr, /"This message will be deleted for everyone. This cannot be undone.": "Bu mesaj herkes için silinecek. Bu işlem geri alınamaz."/);

const handlers = readFileSync(join(root, "../backend/socket/handlers.js"), "utf8");
assert.match(handlers, /socket\.on\("dm:message:delete"/);
assert.match(handlers, /socket\.on\("group:message:delete"/);
assert.match(handlers, /dm:message:deleted/);
assert.match(handlers, /group:message:deleted/);

console.log("glassConfirm.selftest ok");
