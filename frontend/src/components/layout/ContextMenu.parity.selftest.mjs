/**
 * Every action that hides behind a three-dot / hover button must also be
 * reachable by right-clicking the item itself, in a pointer-anchored menu.
 * Covers the four sidebar lists: DMs, groups, servers, server channels.
 *
 * Run: node frontend/src/components/layout/ContextMenu.parity.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const convos = readFileSync(join(root, "ServerSidebar.jsx"), "utf8");
const servers = readFileSync(join(root, "../servers/ServersSidebar.jsx"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const count = (haystack, needle) => haystack.split(needle).length - 1;

// ── DM list ────────────────────────────────────────────────────────────────
const dmList = convos.slice(convos.indexOf("function DMList("), convos.indexOf("const DM_SWIPE_WIDTH"));
assert(/onContextMenu=\{\(e\) => \{[\s\S]{0,320}setOpenMenuId\(dm\.id\)/.test(dmList), "right-click on a DM row must open its menu");
assert(/setMenuPoint\(\{ id: dm\.id, x: e\.clientX, y: e\.clientY \}\)/.test(dmList), "the DM right-click menu must open at the pointer");
// One menu component for both entry points → identical action sets.
assert(count(dmList, "<DmContextMenu") === 1, "kebab and right-click must share one DM menu (no divergent action list)");
assert(dmList.includes("<ConvMoreButton"), "the DM kebab button must still exist");
assert(/anchorPoint=\{menuPoint\?\.id === dm\.id \? menuPoint : null\}/.test(dmList), "the DM menu must receive the pointer anchor");

// ── group list ─────────────────────────────────────────────────────────────
const groupList = convos.slice(convos.indexOf("function GroupList("), convos.indexOf("const GROUP_SWIPE_WIDTH"));
assert(/onContextMenu=\{\(e\) => \{[\s\S]{0,360}setOpenMenuId\(group\.id\)/.test(groupList), "right-click on a group row must open its menu");
assert(/setMenuPoint\(\{ id: group\.id, x: e\.clientX, y: e\.clientY \}\)/.test(groupList), "the group right-click menu must open at the pointer");
assert(count(groupList, "<GroupContextMenu") === 1, "kebab and right-click must share one group menu");
assert(groupList.includes("<ConvMoreButton"), "the group kebab button must still exist");

// Both shared menus support pointer anchoring with viewport flipping.
for (const [name, fn] of [
  ["DmContextMenu", convos.slice(convos.indexOf("function DmContextMenu("), convos.indexOf("function AddMemberDialog("))],
  ["GroupContextMenu", convos.slice(convos.indexOf("function GroupContextMenu("), convos.indexOf("function ConfirmDialog("))],
]) {
  assert(fn.includes("anchorPoint"), `${name} must accept a pointer anchor`);
  assert(fn.includes("window.innerWidth") && fn.includes("window.innerHeight"), `${name} must stay inside the viewport`);
}

// ── server channels ────────────────────────────────────────────────────────
const channelRow = servers.slice(servers.indexOf("function ChannelRow("), servers.indexOf("function CursorContextMenu("));
assert(/onContextMenu=\{\(e\) => \{[\s\S]{0,420}onOpenMenuAt\(\)/.test(channelRow), "right-click on a channel row must force-open its menu");
assert(channelRow.includes("setCursorPoint({ x: e.clientX, y: e.clientY })"), "the channel menu must open at the pointer on right-click");
assert(count(channelRow, 'className="server-channel-menu is-ported"') === 1, "kebab and right-click must share one channel menu");
for (const action of ["Mute channel", "Channel access", "Edit channel", "Delete channel"]) {
  assert(channelRow.includes(`t("${action}")`), `channel menu must still offer ${action}`);
}
assert(servers.includes("onOpenMenuAt={() => {"), "channel rows must be wired to force-open the menu on right-click");

// ── category rows: hover-only buttons must be mirrored in a right-click menu ─
const catMenu = servers.slice(servers.indexOf("const renderCategoryMenu"), servers.indexOf("const renderLeaveDeleteConfirm"));
for (const action of ["Create channel", "Channel access", "Edit category", "Delete category"]) {
  assert(catMenu.includes(`t("${action}")`), `category right-click menu must offer ${action}`);
}
assert(/onContextMenu=\{\(e\) => \{[\s\S]{0,260}setCatMenu\(\{ node, x: e\.clientX, y: e\.clientY \}\)/.test(servers), "right-click on a category row must open the category menu at the pointer");

// ── server list rows ───────────────────────────────────────────────────────
const serverMenu = servers.slice(servers.indexOf("const renderServerRowMenu"), servers.indexOf("const renderFolderMenu"));
for (const action of ["Open server", "Move to folder", "Unfiled", "Delete server", "Leave server"]) {
  assert(serverMenu.includes(`t("${action}")`), `server row right-click menu must offer ${action}`);
}
assert(/onContextMenu=\{\(e\) => \{[\s\S]{0,260}setServerMenu\(\{ server, x: e\.clientX, y: e\.clientY \}\)/.test(servers), "right-click on a server row must open its menu at the pointer");
assert(count(servers, "renderLeaveDeleteConfirm()") === 2, "leave/delete confirmation must render in both the list and in-server views");

// folder headers: the hover-only trash button must be mirrored too
const folderMenu = servers.slice(servers.indexOf("const renderFolderMenu"), servers.indexOf("const renderCategoryMenu"));
assert(folderMenu.includes('t("Delete folder")'), "folder right-click menu must offer Delete folder");

// ── shared primitive behaves like a native menu ─────────────────────────────
const cursorMenu = servers.slice(servers.indexOf("function CursorContextMenu("), servers.indexOf("function ChannelFormModal("));
assert(cursorMenu.includes("createPortal"), "the context menu must portal out of the sidebar so it is never clipped");
assert(cursorMenu.includes('"Escape"'), "Escape must close the context menu");
assert(cursorMenu.includes('addEventListener("mousedown"'), "an outside click must close the context menu");
assert(cursorMenu.includes('addEventListener("scroll"'), "scrolling must dismiss the context menu");
assert(cursorMenu.includes("window.innerWidth") && cursorMenu.includes("window.innerHeight"), "the context menu must flip inside the viewport");

console.log("ContextMenu.parity.selftest.mjs: ok");
