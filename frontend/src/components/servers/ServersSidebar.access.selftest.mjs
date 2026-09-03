/**
 * Run: node frontend/src/components/servers/ServersSidebar.access.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const sidebar = readFileSync(join(root, "ServersSidebar.jsx"), "utf8");
const members = readFileSync(join(root, "ServerMembersPanel.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/servers.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const bind = readFileSync(join(root, "../../socket/bindServerSocketHandlers.js"), "utf8");
const roleAssign = readFileSync(join(root, "ServerMemberRoleAssign.jsx"), "utf8");

assert(
  !/canManageRoles && channel\.type !== "category"/.test(sidebar),
  "channel ... menu must not hide Channel access on categories"
);
assert(sidebar.includes('title={t("Channel access")}'), "categories need a Channel access control");
assert(sidebar.includes('className="server-channel-menu is-ported"'), "channel ... menu must portal so it is not clipped");
assert(members.includes("canActOnServerMember"), "member ... Roles/Kick actions must use owner-aware hierarchy");
assert(members.includes("me?.id"), "member actions must pass meId so you cannot edit yourself");
assert(roleAssign.includes("You cannot change your own roles."), "role chips must lock the current user");
assert(bind.includes("server:channel:hidden"), "permission loss must hide the channel immediately");
assert(bind.includes("server:channel:leave"), "hidden channels must leave the socket room");
assert(css.includes(".server-channel-menu.is-ported"), "ported channel menu needs fixed stacking");
assert(
  /@media \(hover: none\)[\s\S]{0,180}\.server-channel-row-actions/.test(css),
  "touch devices must keep the channel ... button tappable"
);

console.log("ServersSidebar.access.selftest.mjs: ok");
