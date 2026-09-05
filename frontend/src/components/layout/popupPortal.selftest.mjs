/**
 * Run: node frontend/src/components/layout/popupPortal.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const ss = readFileSync(join(root, "ServerSidebar.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/app-layout.css"), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }
assert(ss.includes("createPortal("), "ServerSidebar uses createPortal");
assert(ss.includes("Add Friend / Create Group Modal"), "add friend modal present");
assert(ss.includes("Announcements Modal"), "announcements modal present");
assert((ss.match(/createPortal\(\s*\n?\s*<AnimatePresence>/g) || []).length >= 2 || ss.split("createPortal(").length >= 7, "modals portaled");
assert(ss.includes("document.body"), "portals to document.body");
assert(!/includes\(query\.toLowerCase\(\)\)\s*, document\.body\)/.test(ss), "filter not corrupted");
assert(css.includes("z-index: 100050"), "modal z-index above settings bleed");
assert(css.includes("blur(20px)"), "modal blur scrim");
assert(!/body\.electron-app[\s\S]{0,200}inset:\s*auto/.test(css), "electron must not reset modal inset to auto");
console.log("popupPortal.selftest.mjs: ok");
