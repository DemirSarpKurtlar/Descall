// Glass profile from a DM/group/channel is one viewport sheet (2.9.175).
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
const css = readFileSync(join(root, "styles/glass/social.css"), "utf8");
const swipe = readFileSync(join(root, "hooks/useEdgeSwipeBack.js"), "utf8");

const glassAt = modal.indexOf("if (glassShell)");
const classicAt = modal.indexOf('"user-profile-card"');
assert.ok(glassAt > 0 && classicAt > glassAt, "desktop card stays on the non-glass path");
const glass = modal.slice(glassAt, classicAt);
assert.ok(glass.includes("createPortal(tree, document.body)"), "glass sheet is portaled to the document");
assert.ok(glass.includes('className="g-profile-scrim"'), "scrim covers the chat");
assert.ok(glass.includes("drag={reduceMotion ? false : \"y\"}"), "sheet drags on the y axis");
assert.ok(glass.includes("dismissSheet(info.velocity.y)"), "drag release hands velocity to the spring");
assert.ok(glass.includes("framerSpring(SPRINGS.sheet"), "sheet uses the standard sheet spring");
assert.ok(glass.includes("REDUCED_MOTION_FADE"), "reduced motion fades");
assert.ok(glass.includes('className="g-profile-name-text"'), "name can ellipsis");
assert.ok(!glass.includes("user-hover-card"), "glass sheet is not the hover card");

assert.ok(list.includes("if (glassUi) return;"), "glass tap does not open the hover card");
assert.ok(list.includes("onMouseEnter={glassUi ? undefined"), "glass does not listen for mouseenter");
assert.ok(list.includes("<UserProfileModal"), "message author uses the same profile sheet");
assert.ok(chat.includes("<UserProfileModal"), "DM header uses the same profile sheet");
assert.ok(members.includes("onOpenProfile"), "server members open a profile");
assert.ok(swipe.includes('".g-profile-scrim"'), "edge swipe yields to the sheet");

for (const piece of [
  "top: max(8%, calc(env(safe-area-inset-top, 0px) + 12px))",
  "html.glass-ui .g-profile-scrim > .g-profile-sheet",
  "position: fixed",
  "flex-wrap: nowrap",
  "text-overflow: ellipsis",
  "z-index: 100060",
  "z-index: 100070",
]) {
  assert.ok(css.includes(piece), `social.css missing ${piece}`);
}

console.log("profileSheet.selftest ok");
