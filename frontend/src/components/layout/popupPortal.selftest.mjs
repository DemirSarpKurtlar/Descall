/**
 * Run: node frontend/src/components/layout/popupPortal.selftest.mjs
 * Ensures full-page panels (Roles/Roller, Feedback/Geri Bildirim, settings-adjacent overlays, Add Friend, etc.)
 * portal to document.body and keep centered blur scrims — never trapped by sidebar contain.
 */
import { readFileSync } from "node:fs";
import { dirname, join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const ss = readFileSync(pathJoin(root, "ServerSidebar.jsx"), "utf8");
const serversSidebar = readFileSync(pathJoin(root, "../servers/ServersSidebar.jsx"), "utf8");
const roles = readFileSync(pathJoin(root, "../servers/ServerRolesModal.jsx"), "utf8");
const settings = readFileSync(pathJoin(root, "../servers/ServerSettingsModal.jsx"), "utf8");
const invite = readFileSync(pathJoin(root, "../servers/ServerInviteModal.jsx"), "utf8");
const moderation = readFileSync(pathJoin(root, "../servers/ServerModerationModal.jsx"), "utf8");
const community = readFileSync(pathJoin(root, "../servers/ServerCommunityModal.jsx"), "utf8");
const rules = readFileSync(pathJoin(root, "../servers/ServerRulesModal.jsx"), "utf8");
const joinModal = readFileSync(pathJoin(root, "../servers/JoinServerModal.jsx"), "utf8");
const channelPerms = readFileSync(pathJoin(root, "../servers/ChannelPermissionsModal.jsx"), "utf8");
const members = readFileSync(pathJoin(root, "../servers/ServerMembersPanel.jsx"), "utf8");
const modal = readFileSync(pathJoin(root, "../ui/Modal.jsx"), "utf8");
const crop = readFileSync(pathJoin(root, "../ui/ImageCropModal.jsx"), "utf8");
const activity = readFileSync(pathJoin(root, "../activity/ActivityView.jsx"), "utf8");
const legal = readFileSync(pathJoin(root, "../legal/LegalContentModal.jsx"), "utf8");
const feedbackModal = readFileSync(pathJoin(root, "../feedback/FeedbackModal.jsx"), "utf8");
const userFeedbackBtn = readFileSync(pathJoin(root, "../feedback/UserFeedbackButton.jsx"), "utf8");
const css = readFileSync(pathJoin(root, "../../styles/app-layout.css"), "utf8");
const serversCss = readFileSync(pathJoin(root, "../../styles/servers.css"), "utf8");

function assert(c, m) { if (!c) throw new Error(m); }

assert(ss.includes("createPortal("), "ServerSidebar uses createPortal");
assert(ss.includes("Add Friend / Create Group Modal"), "add friend modal present");
assert(ss.includes("Announcements Modal"), "announcements modal present");

assert(ss.includes("Feedback Modal — portal to body"), "ServerSidebar Feedback portal comment");
assert(ss.includes("className=\"feedback-overlay\""), "ServerSidebar Feedback uses feedback-overlay");
assert(/createPortal\([\s\S]*?feedback-overlay[\s\S]*?document\.body/.test(ss), "ServerSidebar Feedback createPortal to document.body");
assert(feedbackModal.includes("createPortal("), "FeedbackModal must createPortal");
assert(feedbackModal.includes("document.body"), "FeedbackModal must portal to document.body");
assert(feedbackModal.includes("feedback-overlay"), "FeedbackModal uses feedback-overlay");
assert(userFeedbackBtn.includes("createPortal("), "UserFeedbackButton must createPortal");
assert(userFeedbackBtn.includes("document.body"), "UserFeedbackButton must portal to document.body");
assert(userFeedbackBtn.includes("feedback-overlay"), "UserFeedbackButton uses feedback-overlay");
assert((ss.match(/createPortal\(\s*\n?\s*<AnimatePresence>/g) || []).length >= 2 || ss.split("createPortal(").length >= 7, "modals portaled");
assert(ss.includes("document.body"), "portals to document.body");
assert(!/includes\(query\.toLowerCase\(\)\)\s*, document\.body\)/.test(ss), "filter not corrupted");

for (const [name, src] of [
  ["ServerRolesModal", roles],
  ["ServerSettingsModal", settings],
  ["ServerInviteModal", invite],
  ["ServerModerationModal", moderation],
  ["ServerCommunityModal", community],
  ["ServerRulesModal", rules],
  ["JoinServerModal", joinModal],
  ["ChannelPermissionsModal", channelPerms],
  ["Modal", modal],
  ["ImageCropModal", crop],
  ["ActivityView ManualStatus", activity],
  ["LegalContentModal", legal],
]) {
  assert(src.includes("createPortal("), name + " must createPortal");
  assert(src.includes("document.body"), name + " must portal to document.body");
}

assert(members.includes("createPortal("), "ServerMembersPanel nick overlay must portal");
assert(serversSidebar.includes("return createPortal("), "ServersSidebar inline overlays must portal");
assert(activity.includes("activity-modal-backdrop"), "ActivityView status modal present");

assert(css.includes("z-index: 100050"), "modal z-index above settings bleed");
assert(css.includes("blur(20px)"), "modal blur scrim");
assert(!/body\.electron-app[\s\S]{0,200}inset:\s*auto/.test(css), "electron must not reset modal inset to auto");
assert(/body\.electron-app \.server-modal-overlay/.test(css), "electron rules cover server-modal-overlay");
assert(/body\.electron-app \.img-crop-overlay/.test(css), "electron rules cover img-crop-overlay");
assert(/body\.electron-app \.legal-modal-backdrop/.test(css), "electron rules cover legal-modal-backdrop");

assert(/\.server-modal-overlay\s*\{[\s\S]*?blur\(20px\)/.test(serversCss), "server-modal-overlay uses strong blur");
assert(/\.server-modal-overlay\s*\{[\s\S]*?z-index:\s*100050/.test(serversCss), "server-modal-overlay z-index 100050");

assert(/\.feedback-overlay\s*\{[\s\S]*?blur\(20px\)/.test(css), "feedback-overlay uses strong blur");
assert(/\.feedback-overlay\s*\{[\s\S]*?z-index:\s*100050/.test(css), "feedback-overlay z-index 100050");
assert(/body\.electron-app \.feedback-overlay/.test(css), "electron rules cover feedback-overlay");
assert(/contain:\s*layout paint/.test(css), "sidebar still has contain (portals are the escape hatch)");

console.log("popupPortal.selftest.mjs: ok");
