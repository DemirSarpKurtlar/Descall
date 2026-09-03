import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const appLayout = readFileSync(join(root, "app-layout.css"), "utf8");
const dima = readFileSync(join(root, "dimaai.css"), "utf8");
const mobile = readFileSync(join(root, "mobile.css"), "utf8");
const kbHook = readFileSync(join(root, "../hooks/useMobileKeyboard.js"), "utf8");

assert(
  /\[data-view="play"\],\s*\n\.app-root\[data-view="dimaai"\]/.test(appLayout)
    || /\[data-view="dimaai"\][\s\S]{0,120}grid-template-columns:\s*var\(--nav-rail-width\)\s+1fr/.test(appLayout),
  "DimaAI must use the 2-column rail + workspace grid (not the default sidebar column)",
);

assert(
  /grid-template-columns:\s*minmax\(240px,\s*300px\)\s+minmax\(0,\s*1fr\)/.test(dima),
  "DimaAI inner chat column must be minmax(0, 1fr) so it can grow",
);

assert(
  /\[data-view="dimaai"\][\s\S]{0,80}grid-template-columns:\s*1fr\s*!important/.test(mobile),
  "Mobile DimaAI must be full-bleed like Play",
);

assert(!/\.dima-history \{[\s\S]{0,200}translateX\(-110%\)/.test(dima), "history sidebar must not start off-canvas");
assert(/\.dima-workspace\.is-chat \.dima-history/.test(dima), "mobile chat pane must hide history, not overlay it");
assert(/\.dima-back-btn/.test(dima), "DimaAI needs a visible back control");
assert(/\.dima-dock/.test(dima), "composer must sit in a docked footer");
assert(/\.dima-history-new/.test(dima), "history menu needs a primary new-chat control");
assert(/--vv-offset-left/.test(dima), "keyboard-open DimaAI must follow visualViewport.offsetLeft");
assert(/--vv-width/.test(dima), "keyboard-open DimaAI must use visualViewport.width");
assert(
  !/html\.kb-open \.app-root\.is-mobile\[data-view="dimaai"\] \{[\s\S]{0,280}transform:\s*translateY/.test(dima),
  "keyboard-open DimaAI must not translateY the shell (that slides the page sideways)",
);
assert(
  /html\.kb-open \.app-root\.is-mobile\[data-view="dimaai"\] \{[\s\S]{0,280}position:\s*fixed/.test(dima),
  "keyboard-open DimaAI must pin the shell to the visual viewport",
);
assert(
  /\.app-root\.is-mobile \.dima-input \{[\s\S]{0,220}font-size:\s*16px/.test(dima),
  "mobile DimaAI input must be 16px so iOS does not focus-zoom",
);
assert(/--vv-offset-left/.test(kbHook) && /--vv-width/.test(kbHook), "keyboard hook must publish visual viewport width and offsetLeft");
assert(/:has\(\.dima-workspace\.is-chat\)/.test(dima), "open DimaAI thread must hide the mobile tab bar");
assert(/\.dima-agent-bubble/.test(dima), "compose drafts must render as a message bubble, not a JSON fence");
assert(/\.dima-agent-to/.test(dima), "compose drafts must show a recipient row");
assert(/\.dima-agent-card-pill/.test(dima), "pending compose cards need an approval pill");
assert(/\.dima-artifact/.test(dima) && /\.dima-artifact-frame/.test(dima), "live HTML preview needs an iframe stage");


assert(
  /\.app-root\.is-mobile \.dima-scroll:has\(\.dima-thread\) \{[\s\S]{0,120}padding-bottom:\s*calc\(96px/.test(dima),
  "mobile DimaAI scroll area must keep ChatGPT-like padding-bottom above the composer",
);
assert(
  /\.app-root\.is-mobile \.dima-topbar \{[\s\S]{0,80}padding:\s*6px/.test(dima),
  "mobile DimaAI topbar must be compacted",
);
assert(
  /\.app-root\.is-mobile \.dima-welcome-orb/.test(dima),
  "mobile DimaAI empty-state orb must have a compact override",
);
assert(
  /Keep 2-col suggestion tiles/.test(dima)
    || /\.dima-suggestions \{ grid-template-columns: 1fr 1fr; gap: 8px; \}/.test(dima),
  "narrow DimaAI suggestions must stay 2-column (not a tall single column)",
);
assert(
  !/@media \(max-width: 720px\) \{[\s\S]{0,80}\.dima-suggestions \{ grid-template-columns: 1fr; \}/.test(dima),
  "must not force single-column suggestions under 720px",
);

console.log("dimaai.layout.selftest.mjs: ok");
