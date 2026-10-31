// 3.7.16: every server surface follows the desktop glass theme (owner report).
// Run: node src/styles/glass-desktop/serverSurfaces.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..");
const css = readFileSync(join(here, "server-surfaces.css"), "utf8");
const index = readFileSync(join(here, "index.css"), "utf8");
const servers = readFileSync(join(src, "styles", "servers.css"), "utf8");
const members = readFileSync(join(src, "components", "servers", "ServerMembersPanel.jsx"), "utf8");
const sidebar = readFileSync(join(src, "components", "servers", "ServersSidebar.jsx"), "utf8");

assert.match(index, /@import "\.\/server-surfaces\.css";/);

// The field rule must out-rank servers.css `.server-field input:not()x3` (0,4,1).
assert.match(css, /html\.glass-desktop \.server-field input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="color"\]\),/);
assert.match(css, /background: var\(--gd-field-bg\);/);
// Cancel in Server Settings is !important in servers.css.
assert.match(css, /html\.glass-desktop \.server-settings-cancel \{[\s\S]*?background: var\(--gd-chip\) !important;/);
// Danger ghost buttons keep their red ink.
assert.match(css, /\.server-ghost-btn:not\(\.danger\):not\(\.is-danger-ghost\) \{ color: var\(--gd-t1\); \}/);

for (const cls of [
  "server-voice-screen", "server-voice-screen-badge", "server-stage-pill", "server-voice-count",
  "server-unread-badge", "server-roles-tab", "server-invite-item", "server-moderation-row",
  "server-audit-row", "server-perm-list", "sra-list", "server-channel-perms-footer",
  "server-template-card", "server-community-option", "server-rules-text", "invite-landing-card",
]) {
  assert.ok(css.includes(`.${cls}`), `server-surfaces.css themes .${cls}`);
}
// No opaque Discord greys / reds left in the overrides.
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
for (const bad of ["--surface-2)", "--surface-3)", "#f23f43", "#0b0d10", "#b5bac1", "#5865f2"]) {
  assert.ok(!noComments.includes(bad), `no ${bad} in server-surfaces.css`);
}
assert.match(noComments, /html\.glass-desktop\.a11y-solid \.invite-landing-card/);

// Menus are portaled so the glass panels (backdrop-filter + overflow hidden) cannot clip them.
assert.match(members, /\{menuMember && typeof document !== "undefined" && createPortal\(/);
assert.match(sidebar, /function ServerMenuFrame\(\{ glass, open, onClose, children, anchorRef \}\)/);
assert.match(sidebar, /if \(\(glass \|\| pinned\) && typeof document !== "undefined"\) return createPortal\(tree, document\.body\);/);
assert.match(sidebar, /anchorRef=\{serverMenuBtnRef\}/);
assert.match(servers, /\.server-dropdown\.is-portaled \{\s*z-index: 12000;/);

console.log("serverSurfaces.selftest ok");
