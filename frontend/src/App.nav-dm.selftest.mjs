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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  !/if \(view === "calls" \|\| view === "activity" \|\| view === "friends"\)[\s\S]{0,200}onDmSelect\?\.\(null\)/.test(layout),
  "AppLayout must not race-navigate via onDmSelect(null) on tab switch",
);

assert(
  !/["']play["']|valorant|riot_link/i.test(app),
  "no Play view or Riot link callback left in App.jsx (2.13.0)",
);

assert(
  /activeDmRef\.current\?\.id !== withUserId/.test(app)
    && /activeDmRef\.current\?\.id === peerId/.test(app),
  "DM history/REST must ignore stale peer loading chrome",
);

assert(
  /dm\?\.username \? directPath\(dm\)/.test(app),
  "returning to chat must restore the kept DM path",
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

console.log("App.nav-dm.selftest.mjs: ok");
