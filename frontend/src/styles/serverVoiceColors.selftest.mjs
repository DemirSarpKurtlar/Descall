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

// Speaking (owner decision Nov 2026): ONE --speaking token for every speaking ring, dot and flag
// (calls used iOS #30D158, the server list #23A55A). Dark: the online green. Light: one step deeper.
const tokensCss = read("design-tokens.css");
assert.equal((tokensCss.match(/--speaking: var\(--status-online\);/g) || []).length, 1, "--speaking defaults to the online green, defined once");
const lightBlock = tokensCss.match(/\[data-theme="light"\] \{([\s\S]*?)\n\}/)[1];
const lightSpeaking = (lightBlock.match(/--speaking: (#[0-9a-f]{6});/i) || [])[1];
assert.ok(lightSpeaking, "light theme sets its --speaking");
const successHex = tokensCss.match(/--success: (#[0-9a-f]{6});/i)[1];
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const n = h.replace("#", ""); const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(n.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
// Dark call tiles (glass call tile, mosaic, DM tile) and the dark surfaces the server list sits on.
for (const bg of ["#171d38", "#1d2748", "#0b0c12", "#111214", "#1e1f22", "#2b2d31", "#313338"]) {
  assert.ok(ratio(successHex, bg) >= 3, `--speaking ${successHex} on ${bg}: ${ratio(successHex, bg).toFixed(2)}:1 < 3:1`);
}
for (const bg of ["#ffffff", "#f2f3f5", "#e3e5e8"]) {
  assert.ok(ratio(lightSpeaking, bg) >= 3, `light --speaking ${lightSpeaking} on ${bg}: ${ratio(lightSpeaking, bg).toFixed(2)}:1 < 3:1`);
}
const RAW_GREEN = /#30d158|#23a55a|#4ade80|#3ddc84|rgba\((48, ?209, ?88|35, ?165, ?(90|89)|74, ?222, ?128|61, ?220, ?132)|var\(--success\)|var\(--g-ok/i;
const speakingFiles = [
  "voice-speaking.css", "call-grid.css", "ui-polish.css", "servers.css", "mini-call-card.css", "screen-share-v1.css",
  "glass/call.css", "glass-desktop/calls.css", "shop2-c4.css", "cosmetics-premium.css", "store-purchase-modal.css",
  "../world3d/world3d.css", "../premium/story/story.css", "../components/voice/CallTapCard.css",
];
let speakingRules = 0;
for (const f of speakingFiles) {
  const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    if (!/speak(?!er)|is-talk|\.p\.talk|\.w\.sp\b|w3d-dot|mcc-wave\.is-active|mcc-avatar::after/.test(sel)) continue;
    if (!/(color|background|border|box-shadow)[^;]*:/.test(body) || !/(#|rgba|var\(--(success|g-ok|speaking|ss-accent))/.test(body)) continue;
    speakingRules++;
    assert.doesNotMatch(body, RAW_GREEN, `${f}: ${sel.trim()} uses var(--speaking), not a raw green`);
    assert.doesNotMatch(body, /--ss-accent/, `${f}: ${sel.trim()} speaking ring is green, not the accent`);
  }
}
assert.ok(speakingRules >= 20, `speaking rules found (${speakingRules})`);
assert.match(read("../components/voice/DmRemoteParticipantSlot.jsx"), /background: "var\(--speaking\)"/, "DM tile speaking dot uses --speaking");

console.log("serverVoiceColors selftest OK");
