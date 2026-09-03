/**
 * Run: node frontend/src/components/layout/AppLayout.grid-empty.selftest.mjs
 *
 * Guards the v2.9.16 DM empty-state / nav-rail overlap bug:
 * extra in-flow .app-root children (or re-boxing .app-sidebar-shell) must not
 * steal grid tracks so empty-state paints over the rail and leaves a black void.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const layout = readFileSync(join(root, "AppLayout.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/app-layout.css"), "utf8");
const titlebar = readFileSync(join(root, "../../styles/titlebar.css"), "utf8");
const mobile = readFileSync(join(root, "../../styles/mobile.css"), "utf8");
const feedbackModal = readFileSync(join(root, "../feedback/FeedbackModal.jsx"), "utf8");
const chatPanel = readFileSync(join(root, "ChatPanel.jsx"), "utf8");

assert(
  /\.app-sidebar-shell\s*\{[\s\S]{0,80}display:\s*contents/.test(css),
  "desktop .app-sidebar-shell must use display:contents so rail+sidebar become grid items",
);

assert(
  !/\.app-root\s*>\s*\*:not\(\.app-notif-banner\):not\(\.app-feedback-banner\)\s*\{/.test(css),
  "blanket .app-root > * { grid-row:1 } must stay gone — it re-boxes the sidebar shell",
);

assert(
  /\.app-root\s+\.app-sidebar-shell\s*>\s*\.nav-rail\s*\{[\s\S]{0,80}grid-column:\s*1/.test(css),
  "nav-rail must be explicitly placed on grid column 1",
);

assert(
  /\.app-sidebar-shell\s*>\s*\.sidebar-secondary[\s\S]{0,120}grid-column:\s*2/.test(css),
  "sidebar-secondary must be explicitly placed on grid column 2 (chat/groups/friends/calls)",
);

assert(
  /\.app-root\s*>\s*\.app-main-slot\s*\{[\s\S]{0,80}grid-column:\s*-2\s*\/\s*-1/.test(css),
  "app-main-slot must occupy the last flexible track (minmax(0,1fr))",
);

assert(
  /grid-template-columns:\s*var\(--nav-rail-width\)\s+var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/.test(css),
  "default app-root must be rail | sidebar | minmax(0,1fr)",
);

assert(
  /body\.electron-app\s+\.app-sidebar-shell/.test(titlebar) === false ||
    /Do NOT set height on \.app-sidebar-shell/.test(titlebar),
  "Electron must not set height on .app-sidebar-shell (re-boxes display:contents)",
);

assert(
  !/body\.electron-app[^{]*\{[^}]*\.app-sidebar-shell/.test(titlebar.replace(/\s+/g, " ")) &&
    !/body\.electron-app \.app-container,\s*body\.electron-app \.app-root,\s*body\.electron-app \.nav-rail,\s*body\.electron-app \.sidebar-secondary,\s*body\.electron-app \.server-icon-bar,\s*body\.electron-app \.app-sidebar-shell/.test(
      titlebar,
    ),
  "titlebar height !important list must omit .app-sidebar-shell",
);

assert(
  feedbackModal.includes("createPortal") && feedbackModal.includes("feedback-overlay"),
  "FeedbackModal must portal to document.body with .feedback-overlay (never an app-root grid child)",
);

assert(
  layout.includes("<FeedbackModal") && layout.includes("app-sidebar-shell") && layout.includes("app-main-slot"),
  "AppLayout still hosts FeedbackModal + sidebar shell + main slot",
);

assert(
  /<EmptyState[\s\S]{0,200}Your chats live here|emptyCopy[\s\S]{0,200}Your chats live here/.test(chatPanel) ||
    chatPanel.includes('t("Your chats live here")'),
  "ChatPanel empty DM state must still use EmptyState / Your chats live here",
);

assert(
  /\.app-main-slot\s+\.empty-state|\.main-panel\s*>\s*\.messages-container\s*>\s*\.empty-state/.test(css),
  "empty-state containment rules must scope empty-state to the main chat column",
);

assert(
  /@media\s*\(min-width:\s*769px\)\s*\{[\s\S]{0,120}\.app-sidebar-shell\s*\{[\s\S]{0,40}display:\s*contents/.test(
    mobile,
  ),
  "mobile.css desktop breakpoint must keep display:contents on the sidebar shell",
);

console.log("AppLayout.grid-empty.selftest.mjs: ok");
