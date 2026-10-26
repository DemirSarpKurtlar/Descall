// Glass profile from a DM/group/channel is one viewport sheet (2.9.175);
// Master Update A2 rebuilt it after mockups #29/#30.
// Run: node frontend/src/lib/profileSheet.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modal = readFileSync(join(root, "components/social/UserProfileModal.jsx"), "utf8");
const list = readFileSync(join(root, "components/chat/MessageList.jsx"), "utf8");
const chat = readFileSync(join(root, "components/layout/ChatPanel.jsx"), "utf8");
const members = readFileSync(join(root, "components/servers/ServerMembersPanel.jsx"), "utf8");
const css = readFileSync(join(root, "components/social/ProfileSheet.css"), "utf8");
const report = readFileSync(join(root, "components/social/ReportUserModal.jsx"), "utf8");
const menu = readFileSync(join(root, "components/ui/GlassActionMenu.jsx"), "utf8");
const icons = readFileSync(join(root, "components/social/ProfileSheetIcons.jsx"), "utf8");
const swipe = readFileSync(join(root, "hooks/useEdgeSwipeBack.js"), "utf8");

// Master Update A2: one glass profile (mockup #29) on iPhone (sheet) and iPad/desktop (form).
const glassAt = modal.indexOf("if (glassShell || glassDesktop)");
const classicAt = modal.indexOf('"user-profile-card"');
assert.ok(glassAt > 0 && classicAt > glassAt, "the classic card stays on the non-glass path");
const glass = modal.slice(glassAt, classicAt);
assert.ok(glass.includes("createPortal(tree, document.body)"), "glass profile is portaled to the document");
assert.ok(glass.includes("pfs-scrim"), "scrim covers the chat");
assert.ok(glass.includes('drag: reduceMotion ? false : "y"'), "sheet drags on the y axis");
assert.ok(glass.includes("dismissSheet(info.velocity.y)"), "drag release hands velocity to the spring");
assert.ok(glass.includes("framerSpring(SPRINGS.sheet"), "sheet uses the standard sheet spring");
assert.ok(glass.includes("REDUCED_MOTION_FADE"), "reduced motion fades");
assert.ok(!glass.includes("user-hover-card"), "glass profile is not the hover card");
// ⋯ at the top AND the danger group at the bottom (Demir's decision).
assert.ok(glass.includes('data-testid="profile-more"') && glass.includes('variant="ios"'), "⋯ opens the iOS-style menu");
assert.ok(glass.includes('data-testid="profile-safety-report"') && glass.includes('data-testid="profile-safety-block"'), "report + block also sit at the bottom");
assert.ok(glass.includes("profile.blockFoot"), "block footnote explains what blocking does");
for (const id of ['"share"', '"copy"', '"nickname"', '"report"', '"block"']) {
  assert.ok(modal.includes(`id: ${id}`), `⋯ menu item ${id}`);
}
// Escape: the report sheet / ⋯ menu close first, the profile only when it is on top.
assert.ok(modal.includes("if (reportOpen || moreOpen) return;"), "profile Escape yields to the top layer");

// Report flow (mockup #30): 8 reasons, done sheet, then the block offer.
for (const r of ["harassment", "hate_speech", "threats", "spam", "impersonation", "nsfw", "doxxing", "other"]) {
  assert.ok(report.includes(`"${r}"`), `report reason ${r}`);
}
assert.ok(report.includes('data-testid="report-block-offer"'), "after a report the sheet offers a block");
assert.ok(report.includes("onCloseRef.current = onClose") && report.includes("}, [open, targetId]);"), "parent re-renders do not reset the done step");

// Menu: iOS variant + optional offset.
assert.ok(menu.includes("g-action-menu--ios") && menu.includes("grp-menu-catcher--ios"), "GlassActionMenu has the iOS variant");
assert.ok(menu.includes("offset?.x") && menu.includes("offset?.y"), "GlassActionMenu accepts an offset");
assert.ok(icons.includes("M12 20h9") && icons.includes('r="1.6"'), "mockup glyphs (pen, ⋯) are used");

assert.ok(list.includes("if (glassUi) return;"), "glass tap does not open the hover card");
assert.ok(list.includes("onMouseEnter={glassUi ? undefined"), "glass does not listen for mouseenter");
assert.ok(list.includes("<UserProfileModal"), "message author uses the same profile sheet");
assert.ok(list.includes("menuOpenedAt.current < 450"), "touch tap does not toggle the just-opened toolbar shut");
assert.ok(chat.includes("<UserProfileModal"), "DM header uses the same profile sheet");
assert.ok(members.includes("onOpenProfile"), "server members open a profile");
for (const sel of ['".g-profile-scrim"', '".pfs-scrim"', '".rps-overlay"']) {
  assert.ok(swipe.includes(sel), `edge swipe yields to ${sel}`);
}

for (const piece of [
  ".pfs-scrim",
  "z-index: 100060",
  ".rps-overlay { z-index: 100070; }",
  "backdrop-filter: blur(40px) saturate(200%)",
  ':root[data-theme="light"] .pfs-heavy',
  ":root:root:root:root:root .grp-menu.g-action-menu--ios",
  "text-overflow: ellipsis",
]) {
  assert.ok(css.includes(piece), `ProfileSheet.css missing ${piece}`);
}

console.log("profileSheet.selftest ok");
