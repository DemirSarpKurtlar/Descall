// Run: node src/styles/glass-desktop/voiceRoomTheme.selftest.mjs
// 3.7.15 owner reports: themed server voice room + call "Kişiler" panel + server
// step hint, and the message list as its own stacking layer under the floating header.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const calls = read("./calls.css");
const fh = read("./floatingHeader.css");
const servers = read("../servers.css");
const people = read("../call-people.css");
const overlay = read("../../components/CallOverlay.jsx");
const sidebar = read("../../components/servers/ServersSidebar.jsx");

// Voice room uses the panel glass, no opaque slab, floating glass dock.
assert.match(calls, /html\.glass-desktop \.main-panel \.server-voice-panel \{\s*background-color: transparent !important;/);
assert.match(calls, /html\.glass-desktop \.main-panel \.server-voice-dock \{\s*border-top: 0;\s*background: transparent;/);
assert.match(calls, /html\.glass-desktop \.main-panel \.server-voice-dock-group \{[\s\S]*?backdrop-filter: blur\(var\(--gd-blur-panel\)\)/);
assert.match(calls, /html\.glass-desktop\.a11y-solid \.main-panel \.server-voice-dock-group/);

// Hovered bubbles (z 25) stay under the header: the list is its own layer.
assert.match(fh, /html\.glass-desktop \.main-panel\.is-floating-header > \.messages-container \{\s*position: relative;\s*z-index: 0;\s*\}/);

// Server step hint: themed glass chip with an icon tile.
assert.match(sidebar, /className="server-step-hint-ic"/);
assert.match(servers, /html\.glass-desktop \.server-step-hint \{[\s\S]*?var\(--gd-chip/);

// Call people panel: classes instead of the inline #1e1f23 slab.
assert.doesNotMatch(overlay, /background: "#1e1f23"/);
assert.match(overlay, /className=\{`call-people-panel\$\{narrowViewport \? " is-narrow" : ""\}`\}/);
assert.match(overlay, /import "\.\.\/styles\/call-people\.css";/);
assert.match(people, /html\.glass-desktop \.call-people-panel \{[\s\S]*?var\(--gd-glass-fill\)/);
assert.match(people, /prefers-reduced-motion/);
assert.match(calls, /html\.glass-desktop \.main-panel \.server-voice-tile \{[\s\S]*?var\(--gd-heavy-base\)/);
assert.match(calls, /html\.glass-desktop \.main-panel \.server-voice-tile-meta \{[\s\S]*?backdrop-filter: blur\(16px\)/);
assert.match(calls, /html\.glass-desktop\.a11y-solid \.main-panel \.server-voice-tile,/);
console.log("voiceRoomTheme.selftest ok");
