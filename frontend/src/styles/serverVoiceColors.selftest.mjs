// Color pass for servers and voice/video: off-palette hard-codes stay out,
// light theme keeps readable ink, only Hang up is solid red.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const deviceMenu = read("call-device-menu.css");
assert.doesNotMatch(deviceMenu, /#0a84ff/i, "call device menu uses the accent token, not iOS blue");

const servers = read("servers.css");
assert.doesNotMatch(servers, /#fee75c/i, "no Discord yellow in the server UI (use --warning / --warning-text)");
assert.doesNotMatch(servers, /#f59e0b|#fbbf24/i, "no Tailwind amber in the server UI");
assert.match(servers, /\.server-voice-flag\.is-muted\.is-server \{[^}]*var\(--danger\) 24%/, "server-mute chip is a tinted chip, not solid red");

const ssq = read("screen-share-quality.css");
assert.doesNotMatch(ssq, /#fde68a|#c7d2fe|#86efac/i, "screen share quality panel uses semantic tokens");

const speaking = read("voice-speaking.css");
const stateIcon = speaking.match(/\n\.participant-state-icon \{[^}]*\}/)?.[0] || "";
assert.ok(stateIcon, "participant-state-icon rule exists");
assert.doesNotMatch(stateIcon, /rgba\(237, 66, 69/, "muted tile badge is not a solid Discord-red disc");

assert.doesNotMatch(read("call-grid.css"), /#c4b5fd|129, 140, 248/i, "ringing tile uses the accent, not Tailwind violet/indigo");
assert.doesNotMatch(read("mini-call-card.css"), /#5e6ad2/i, "mini call card group avatar uses the accent");

// Server hub sheets turn light in the light theme: inline pale ink would vanish.
for (const f of ["kit.jsx", "menus.jsx", "pagesGeneral.jsx", "pagesMisc.jsx", "pagesPeople.jsx", "sheets.jsx"]) {
  const src = read(`../components/servers/hub/${f}`);
  assert.doesNotMatch(src, /rgba\(235,238,255/, `${f}: use --svh-t2/3/4 instead of inline pale ink`);
  assert.doesNotMatch(src, /"#8FA6FF"/i, `${f}: use --svh-link`);
}
const svh = read("../components/servers/hub/svh.css");
assert.match(svh, /html\[data-theme="light"\] \.svh-root\{[^}]*--svh-t3:/, "hub light theme defines --svh-t3");

// Back to servers: the app's chevron back chip.
const sidebar = read("../components/servers/ServersSidebar.jsx");
assert.match(sidebar, /server-back-btn"[\s\S]{0,200}<ChevronLeft size=\{20\} \/>/, "Back to servers uses ChevronLeft");
assert.match(servers, /html\.glass-desktop \.server-shell-header \.server-back-btn \{[^}]*border-radius: 50%/, "desktop back button is a round chip");

// Role colors: lightness clamp only, never a replacement color.
const layout = read("app-layout.css");
assert.match(layout, /\.member-name\.has-role-color \{\s*color: oklch\(from var\(--role-color\) max\(l, 0\.62\) c h\)/);

console.log("serverVoiceColors selftest OK");
