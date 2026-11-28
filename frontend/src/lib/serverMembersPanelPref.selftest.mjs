// Server member list panel: the open / closed choice survives channel, server and
// tab switches and reloads (lib/serverMembersPanelPref.js), only where the panel
// docks (desktop layout, server text channel or server shell), and ChatPanel's
// switch effects no longer reset it.
// Run: node src/lib/serverMembersPanelPref.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVER_MEMBERS_PANEL_KEY,
  readServerMembersPanelOpen,
  writeServerMembersPanelOpen,
  subscribeServerMembersPanel,
  serverMembersPanelDocks,
  resolveMembersPanelOpen,
  __resetServerMembersPanelPref,
} from "./serverMembersPanelPref.js";

function memStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

// Default closed, as before.
__resetServerMembersPanelPref();
assert.equal(readServerMembersPanelOpen(memStore()), false);
assert.equal(readServerMembersPanelOpen(null), false);

// Round trip (a reload reads the same store).
{
  const s = memStore();
  assert.equal(writeServerMembersPanelOpen(true, s), true);
  assert.equal(s.data.get(SERVER_MEMBERS_PANEL_KEY), "1");
  assert.equal(readServerMembersPanelOpen(s), true);
  writeServerMembersPanelOpen(false, s);
  assert.equal(s.data.get(SERVER_MEMBERS_PANEL_KEY), "0");
  assert.equal(readServerMembersPanelOpen(s), false);
  // Stored value wins over the in-memory fallback.
  assert.equal(readServerMembersPanelOpen(memStore({ [SERVER_MEMBERS_PANEL_KEY]: "1" })), true);
  assert.equal(readServerMembersPanelOpen(memStore({ [SERVER_MEMBERS_PANEL_KEY]: "garbage" })), false);
}

// Private mode: setItem / getItem throw, the session keeps the choice.
{
  __resetServerMembersPanelPref();
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readServerMembersPanelOpen(broken), false);
  writeServerMembersPanelOpen(true, broken);
  assert.equal(readServerMembersPanelOpen(broken), true);
  writeServerMembersPanelOpen(false, broken);
  assert.equal(readServerMembersPanelOpen(broken), false);
}

// Subscribers hear every write (the header button and the panel re-render together).
{
  __resetServerMembersPanelPref();
  const seen = [];
  const off = subscribeServerMembersPanel((v) => seen.push(v));
  writeServerMembersPanelOpen(true, memStore());
  writeServerMembersPanelOpen(false, memStore());
  off();
  writeServerMembersPanelOpen(true, memStore());
  assert.deepEqual(seen, [true, false]);
}

// Where the saved choice applies.
const desk = { isMobile: false, activeView: "servers", hasServer: true };
assert.equal(serverMembersPanelDocks({ ...desk, channelType: "text" }), true);
assert.equal(serverMembersPanelDocks({ ...desk, channelType: "announcement" }), true);
assert.equal(serverMembersPanelDocks({ ...desk, channelType: null }), true, "server shell (just switched server)");
assert.equal(serverMembersPanelDocks({ ...desk, channelType: "voice" }), false, "voice room: not forced");
assert.equal(serverMembersPanelDocks({ ...desk, channelType: "stage" }), false, "stage: not forced");
assert.equal(serverMembersPanelDocks({ ...desk, channelType: "text", isMobile: true }), false, "phone layout: not forced");
assert.equal(serverMembersPanelDocks({ ...desk, channelType: "text", activeView: "chat" }), false, "other tabs");
assert.equal(serverMembersPanelDocks({ ...desk, channelType: "text", activeView: "groups" }), false);
assert.equal(serverMembersPanelDocks({ ...desk, hasServer: false, channelType: null }), false, "server list still loading");
assert.equal(serverMembersPanelDocks(), false);

// What shows.
assert.equal(resolveMembersPanelOpen({ docks: true, saved: true }), true);
assert.equal(resolveMembersPanelOpen({ docks: true, saved: false, local: true }), false, "docked ignores local state");
assert.equal(resolveMembersPanelOpen({ docks: true, saved: true, searchOpen: true }), false, "search hides it for now");
assert.equal(resolveMembersPanelOpen({ docks: true, saved: true, pinnedOpen: true }), false, "pins hide it for now");
assert.equal(resolveMembersPanelOpen({ docks: false, saved: true, local: false }), false, "voice / phone: not forced");
assert.equal(resolveMembersPanelOpen({ docks: false, saved: false, local: true }), true, "groups / phone sheet: local");

// Journey: open on #genel, switch channel, voice room, server, tab, reload.
{
  __resetServerMembersPanelPref();
  const s = memStore();
  const shown = (ctx) => resolveMembersPanelOpen({
    docks: serverMembersPanelDocks(ctx),
    saved: readServerMembersPanelOpen(s),
    local: false,
  });
  writeServerMembersPanelOpen(true, s);
  assert.equal(shown({ ...desk, channelType: "text" }), true, "opened on a text channel");
  assert.equal(shown({ ...desk, channelType: "announcement" }), true, "another text channel");
  assert.equal(shown({ ...desk, channelType: "voice" }), false, "voice room");
  assert.equal(shown({ ...desk, channelType: "text" }), true, "back to text: restored");
  assert.equal(shown({ ...desk, channelType: null }), true, "another server");
  assert.equal(shown({ ...desk, activeView: "chat", channelType: null, hasServer: false }), false, "DMs tab");
  assert.equal(shown({ ...desk, channelType: "text" }), true, "back from the DMs tab");
  assert.equal(shown({ ...desk, channelType: "text", isMobile: true }), false, "window under 768 px");
  assert.equal(shown({ ...desk, channelType: "text" }), true, "wide again");
  __resetServerMembersPanelPref(); // reload: memory gone, the store stays
  assert.equal(readServerMembersPanelOpen(s), true, "after reload");
  writeServerMembersPanelOpen(false, s);
  assert.equal(shown({ ...desk, channelType: "text" }), false, "closed stays closed");
}

// Wiring: ChatPanel reads the pref and its switch effects only reset local state.
const here = dirname(fileURLToPath(import.meta.url));
const chatPanel = readFileSync(join(here, "../components/layout/ChatPanel.jsx"), "utf8");
assert.match(chatPanel, /useSyncExternalStore\(subscribeServerMembersPanel, readServerMembersPanelOpen/);
assert.match(chatPanel, /serverMembersPanelDocks\(\{[\s\S]{0,200}isMobile,[\s\S]{0,200}channelType: activeChannel\?\.type/);
assert.match(chatPanel, /const showMembers = resolveMembersPanelOpen\(/);
assert.match(chatPanel, /if \(membersDock\) \{\s*writeServerMembersPanelOpen\(open\)/);
assert.ok(!/useState\(false\);\s*\/\/[^\n]*\n?\s*const \[showMembers/.test(chatPanel) && !/\[showMembers, setShowMembers\] = useState/.test(chatPanel),
  "showMembers must not be plain component state any more");
const switchEffect = chatPanel.match(/setPinnedMessages\(\[\]\);[\s\S]{0,200}?\}, \[activeDmUser\?\.id, activeGroup\?\.id, activeChannel\?\.id\]\);/)?.[0] || "";
assert.ok(switchEffect, "conversation switch effect found");
assert.ok(!/setShowMembers\(/.test(switchEffect), "a channel switch must not write the saved choice");
assert.match(switchEffect, /setLooseMembers\(false\)/);
const leaveEffect = chatPanel.match(/if \(!activeDmUser && !activeGroup && !\(activeView === "servers" && activeServer\)\) \{[\s\S]{0,80}\}/)?.[0] || "";
assert.ok(leaveEffect && !/setShowMembers\(/.test(leaveEffect), "leaving the server surface must not write the saved choice");
const pinToggle = chatPanel.match(/const togglePinnedPanel = \(\) => \{[\s\S]{0,400}?setShowSearch\(false\);/)?.[0] || "";
assert.ok(pinToggle && !/setShowMembers\(/.test(pinToggle), "the pin popover must not clear the saved choice");
const headerRight = chatPanel.split('className="header-right"')[1]?.split("</header>")[0] || "";
assert.match(headerRight, /onClick=\{\(\) => \{ setShowSearch\(!showSearch\); setLooseMembers\(false\); \}\}/, "search must not clear the saved choice");
assert.match(headerRight, /className=\{`icon-btn \$\{showMembers \? "active" : ""\}`\}[\s\S]{0,120}aria-pressed=\{showMembers\}/, "members button pressed state follows the panel");

console.log("serverMembersPanelPref.selftest.mjs: ok");
