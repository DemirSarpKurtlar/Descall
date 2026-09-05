/**
 * Run: node frontend/src/App.nav-dm.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(root, "App.jsx"), "utf8");
const layout = readFileSync(join(root, "components/layout/AppLayout.jsx"), "utf8");
const avatar = readFileSync(join(root, "components/ui/Avatar.jsx"), "utf8");
const chatPanel = readFileSync(join(root, "components/layout/ChatPanel.jsx"), "utf8");
const dimaCss = readFileSync(join(root, "styles/dimaai.css"), "utf8");
const lfgCss = readFileSync(join(root, "styles/lfg.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  !/if \(view === "calls" \|\| view === "activity" \|\| view === "friends"\)[\s\S]{0,200}onDmSelect\?\.\(null\)/.test(layout),
  "AppLayout must not race-navigate via onDmSelect(null) on tab switch",
);

assert(
  /requestedRoute\.view === "play" \|\| requestedRoute\.view === "dimaai"/.test(app),
  "route sync must keep conversation mounted under play/dimaai",
);

assert(
  /activeDmRef\.current\?\.id !== withUserId/.test(app)
    && /activeDmRef\.current\?\.id === peerId/.test(app),
  "DM history/REST must ignore stale peer loading chrome",
);

assert(
  /dm\?\.username \? directPath\(dm\)/.test(app),
  "returning to chat from play/dimaai must restore the kept DM path",
);

assert(
  /stickyIdentityRef/.test(avatar) && !/identityChanged/.test(avatar),
  "Avatar stickySrc must be identity-gated without setState-during-render",
);

assert(
  /setProfileTarget\(null\)/.test(chatPanel)
    && /setShowMembers\(false\)/.test(chatPanel),
  "ChatPanel must clear profile/members on conversation switch",
);

assert(
  /dima-settings-overlay[\s\S]{0,220}left:\s*var\(--nav-rail-width/.test(dimaCss),
  "Dima settings overlay must not cover the nav rail",
);
assert(
  /lfg-modal-overlay[\s\S]{0,160}left:\s*var\(--nav-rail-width/.test(lfgCss),
  "LFG modal overlay must not cover the nav rail",
);

console.log("App.nav-dm.selftest.mjs: ok");
