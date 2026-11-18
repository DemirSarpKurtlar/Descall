// Polish pass: Escape closes every server modal (it only worked on a few).
// Run: node src/hooks/useEscapeClose.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hook = readFileSync(join(here, "useEscapeClose.js"), "utf8");
const servers = join(here, "..", "components", "servers");
const read = (f) => readFileSync(join(servers, f), "utf8");

// Top-most layer only, never over an alert / menu / cropper, never mid-IME, window listener.
assert.match(hook, /stack\[stack\.length - 1\] !== token/);
assert.match(hook, /e\.isComposing/);
assert.match(hook, /\[role="alertdialog"\]/);
assert.match(hook, /window\.addEventListener\("keydown", onKey\)/);

const wired = {
  "ServerRolesModal.jsx": /useEscapeClose\(onClose, \{ enabled: !busy \}\)/,
  "ServerSettingsModal.jsx": /useEscapeClose\(onClose, \{ enabled: !busy && !uploading && !cropSrc && !stacked \}\)/,
  "ServerInviteModal.jsx": /useEscapeClose\(onClose\)/,
  "ServerCommunityModal.jsx": /useEscapeClose\(onClose, \{ enabled: !busy \}\)/,
  "ServerModerationModal.jsx": /useEscapeClose\(onClose\)/,
  "JoinServerModal.jsx": /useEscapeClose\(onClose, \{ enabled: !busy \}\)/,
  "ServerRulesModal.jsx": /useEscapeClose\(onClose, \{ enabled: !busy \}\)/,
  "ServerMembersPanel.jsx": /useEscapeClose\(\(\) => setNickTarget\(null\), \{ enabled: Boolean\(nickTarget\) && !busy \}\)/,
};
for (const [file, re] of Object.entries(wired)) {
  const src = read(file);
  assert.match(src, /import useEscapeClose from "\.\.\/\.\.\/hooks\/useEscapeClose";/, file);
  assert.match(src, re, file);
}
const sidebar = read("ServersSidebar.jsx");
assert.equal((sidebar.match(/useEscapeClose\(onClose/g) || []).length, 2, "channel form + create server");
console.log("useEscapeClose selftest ok");
