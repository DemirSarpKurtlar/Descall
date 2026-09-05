/**
 * Run: node frontend/src/components/layout/AppLayout.view-transition.selftest.mjs
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
const messagesCss = readFileSync(join(root, "../../styles/messages.css"), "utf8");

assert(layout.includes("app-main-slot"), "main views must share a slot so play/dimaai can crossfade");
assert(layout.includes("app-main-view"), "play/dimaai/chat must render inside an animated main view");
assert(layout.includes("useReducedMotion"), "view transition must respect reduced motion");
assert(layout.includes("hideDesktopPlaySidebar"), "mobile must keep the drawer contents while sliding to LFG/DimaAI");
assert(css.includes(".app-main-slot"), "main slot must fill the app grid cell");
assert(css.includes(".app-main-view"), "animated view wrapper styles must exist");
assert(layout.includes("app-chat-keep"), "chat must stay mounted under LFG/Dima AI");
assert(
  !layout.includes('view === "friends" || view === "play" || view === "dimaai"'),
  "LFG/Dima AI must not clear the open conversation",
);


assert(
  css.includes(".app-chat-keep[hidden]") && css.includes("display: none !important"),
  "chat keep must use display:none !important so LFG/Dima fill the column",
);
assert(
  /\.messages-container \{[\s\S]{0,180}min-height:\s*0/.test(css),
  "messages-container must flex-fill with min-height 0 so the composer stays at the bottom",
);
assert(
  /\.messages-container \{[\s\S]{0,220}overflow-y:\s*auto/.test(css),
  "messages-container is the chat scrollport",
);
assert(
  /\.message-list \{[\s\S]{0,280}height:\s*auto/.test(css),
  "message-list must be height:auto so content grows and the container scrolls",
);
assert(
  !/\.message-list \{[\s\S]{0,120}flex:\s*1/.test(css),
  "message-list must not flex:1 fill the viewport (that nested-clip bug kills wheel scroll)",
);

assert(
  !/if \(activeView === "play" \|\| activeView === "dimaai"\) return activeView/.test(layout),
  "play/dimaai must not use a separate motion key (that flashes server empty under LFG/Dima)",
);
assert(
  /flex:\s*1 1 0/.test(css),
  "chat column children must use flex 1 1 0 so empty composer pins to the bottom",
);


assert(
  !/\.message-list \{[\s\S]{0,120}flex:\s*1/.test(messagesCss),
  "messages.css .message-list must not flex:1 fill (nested clip kills wheel scroll)",
);
assert(
  /\.msg-edit-actions[\s\S]{0,180}gap:\s*8px/.test(messagesCss),
  "Save/Cancel edit actions must be spaced as separate buttons",
);


assert(
  /activeView === "play" \? \([\s\S]{0,40}<ValorantHub/.test(layout),
  "ValorantHub must mount only when activeView is play",
);
assert(
  layout.includes('import ValorantHub from "../valorant/ValorantHub"'),
  "AppLayout must import ValorantHub for the Play slot",
);
assert(
  !/activeView === "play" \? \([\s\S]{0,40}<LfgWorkspace/.test(layout),
  "LfgWorkspace must not mount directly from AppLayout (wrap via ValorantHub)",
);
assert(
  /activeView === "dimaai" \? \([\s\S]{0,40}<DimaAiWorkspace/.test(layout),
  "DimaAiWorkspace must mount only when activeView is dimaai",
);
assert(
  !/\.app-main-view\s*>\s*\.lfg-workspace,[\s\S]{0,60}\.app-main-view\s*>\s*\.dima-workspace\s*\{[\s\S]{0,80}position:\s*absolute/.test(css),
  "must not unconditionally absolute-position LFG/Dima under .app-main-view",
);
assert(
  /:not\(\[data-view="play"\]\)\s*\.valorant-hub/.test(css)
    && /:not\(\[data-view="play"\]\)\s*\.lfg-workspace/.test(css)
    && /:not\(\[data-view="dimaai"\]\)\s*\.dima-workspace/.test(css)
    && /display:\s*none\s*!important/.test(css),
  "inactive play/dimaai workspaces must hard-hide via data-view",
);
assert(
  /\[data-view="play"\]\s*\.valorant-hub/.test(css),
  "play view must absolute-position ValorantHub (not bare LFG)",
);


assert(
  !/if \(view === "calls" \|\| view === "activity" \|\| view === "friends"\)[\s\S]{0,180}onDmSelect\?\.\(null\)/.test(layout),
  "handleViewChange must not call onDmSelect(null) — that navigates to /direct and races the tab path",
);
assert(
  !/if \(view === "servers"\)[\s\S]{0,120}onDmSelect\?\.\(null\)/.test(layout),
  "handleViewChange must not clear DM via onDmSelect when opening servers (navigate race)",
);

console.log("AppLayout.view-transition.selftest.mjs: ok");

