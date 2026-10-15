// List cards (server, group, DM, channel, friend, member) keep ~18px
// horizontal padding and a real gap so title text cannot sit on the
// rounded edge. Run: node src/styles/list-card-padding.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

const servers = read("servers.css");
const layout = read("app-layout.css");
const rows = read("conv-rows.css");
const desktopChat = read("glass-desktop/chat.css");
const desktopCommunity = read("glass-desktop/community.css");
const desktopSocial = read("glass-desktop/social.css");
const glassChat = read("glass/chat.css");
const glassSocial = read("glass/social.css");
const mobile = read("mobile.css");

assert.match(servers, /\.server-list-item\s*\{[^}]*padding:\s*12px 18px/);
assert.match(servers, /\.server-list\s*\{[^}]*gap:\s*8px/);
assert.match(servers, /\.server-channel-row\s*\{[^}]*padding:\s*10px 18px/);
assert.match(servers, /\.server-channel-row-wrap\s*\{[^}]*margin:\s*4px 8px/);

assert.match(layout, /\.dm-item\s*\{[^}]*padding:\s*12px 18px/);
assert.match(layout, /\.group-item\s*\{[^}]*padding:\s*12px 18px/);
assert.match(layout, /\.friend-item\s*\{[^}]*padding:\s*10px 18px/);
assert.match(layout, /\.member-row\s*\{[^}]*padding:\s*10px 18px/);

assert.match(rows, /\.conv-group-wrap\.is-desktop,\s*\.conv-group-wrap\.is-swipeable\s*\{[^}]*margin:\s*4px 8px/);
assert.match(rows, /padding-right:\s*44px !important/);
assert.equal(rows.includes("html.glass-ui"), false);

assert.match(desktopChat, /html\.glass-desktop button\.conv-row\s*\{[^}]*padding:\s*12px 18px/);
assert.match(desktopCommunity, /html\.glass-desktop \.server-list-item\s*\{[^}]*padding:\s*12px 18px/);
assert.match(desktopCommunity, /html\.glass-desktop \.member-row,\s*html\.glass-desktop \.server-member-row\s*\{[^}]*padding:\s*10px 18px/);
assert.match(desktopSocial, /html\.glass-desktop \.friend-item\s*\{[^}]*padding:\s*10px 18px/);

assert.match(glassChat, /padding:\s*12px 18px !important/);
assert.match(glassSocial, /html\.glass-ui \.g-friend-row\s*\{[^}]*padding:\s*12px 18px/);
assert.match(glassSocial, /html\.glass-ui \.app-root\.g-shell \.servers-sidebar \.server-list-item\s*\{[^}]*padding:\s*12px 18px/);
assert.match(glassSocial, /html\.glass-ui \.app-root\.g-shell \.g-server-pane \.server-channel-row\s*\{[^}]*padding:\s*10px 18px/);

assert.match(mobile, /\.dm-item,\s*\.group-item,\s*\.friend-item\s*\{[^}]*padding:\s*12px 18px/);

console.log("list-card-padding.selftest ok");
