// Every web viewport from 320 to 2560 px gets exactly one Liquid Glass layer
// (html.glass-ui or html.glass-desktop). Before 2.10.114 a 769–959 px window
// with a tall viewport (e.g. 900×930) matched neither gate and painted the
// legacy flat theme (teal CTA, one-letter DM names, ⋯ on every row).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldEnableGlassDesktop, webGlassMode } from "./glassDesktop.js";
import { shouldEnableGlass } from "./glassUi.js";

const layers = (width, height) => {
  const desktop = shouldEnableGlassDesktop({
    isElectron: false,
    viewportOk: webGlassMode({ width, height }) === "desktop",
  });
  const ui = shouldEnableGlass({
    isNativeIos: false,
    viewportWidth: width,
    viewportShortSide: Math.min(width, height),
  });
  return { desktop, ui };
};

const heights = [360, 430, 600, 700, 768, 930, 1080, 1366, 1440];
let checked = 0;
for (let width = 320; width <= 2560; width += 4) {
  for (const height of heights) {
    const { desktop, ui } = layers(width, height);
    assert.ok(desktop !== ui, `${width}×${height}: exactly one glass layer (desktop=${desktop}, ui=${ui}); legacy theme otherwise`);
    checked += 1;
  }
}
for (const [w, h] of [[360, 780], [600, 930], [768, 1024], [820, 1180], [900, 930], [1024, 768], [1180, 820], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) {
  const { desktop, ui } = layers(w, h);
  assert.ok(desktop || ui, `${w}×${h} must not fall back to the legacy theme`);
}
assert.equal(layers(900, 930).desktop, true, "the reported 900×930 window gets glass-desktop");
assert.equal(layers(390, 844).ui, true, "phones keep glass-ui");
assert.equal(layers(852, 393).ui, true, "phone landscape keeps glass-ui");
assert.equal(shouldEnableGlassDesktop({ isElectron: true, viewportOk: false }), true, "Electron is glass-desktop at every width");

const here = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(here, "../styles/glass-desktop/shell.css"), "utf8");
const rows = readFileSync(join(here, "../styles/conv-rows.css"), "utf8");
assert.match(shell, /@media \(max-width: 1024px\)[\s\S]*?--sidebar-width: 272px/, "tablet list column is at least 272px");
assert.match(rows, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*:not\(:hover\):not\(:focus-within\):not\(\.menu-open\) > \.conv-more-btn[\s\S]*opacity: 0/, "⋯ shows on hover only");
assert.match(shell, /html\.glass-desktop \.nav-rail \.nav-rail-bottom \{[^}]*border-top: 0 !important;[^}]*background: transparent !important/, "rail footer has no slab or divider");
assert.match(shell, /html\.glass-desktop \.nav-rail \.rail-user-panel \{[^}]*background: transparent !important/, "rail avatar has no lighter tile");
console.log(`glassBreakpoints.selftest ok (${checked} viewports)`);
