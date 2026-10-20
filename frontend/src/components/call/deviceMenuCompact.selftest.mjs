// 2.11.3: audio device menus are compact on web/Electron, one shared component + stylesheet.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../../styles/call-device-menu.css");
const jsx = read("./DevicePicker.jsx");
const rule = (sel) => {
  const m = css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `rule ${sel}`);
  return m[2];
};
const px = (block, prop) => {
  const m = block.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([\\d.]+)px`));
  return m ? Number(m[1]) : NaN;
};

const menu = rule(".call-device-menu");
assert.match(menu, /max-width:\s*min\(320px/, "menu width capped at 320px");
assert.ok(px(menu, "padding") <= 6, "tight menu padding");
assert.ok(px(menu, "border-radius") <= 16 || /border-radius:\s*var\(--r-(?:sm|md)\)/.test(menu), "compact radius");

const name = rule(".call-device-name");
const fs = px(name, "font-size");
assert.ok(fs >= 12 && fs <= 13, `device name 12-13px (${fs})`);
assert.match(name, /text-overflow:\s*ellipsis/);
assert.match(name, /white-space:\s*nowrap/);
assert.match(rule(".call-device-text"), /min-width:\s*0/, "text column can shrink so ellipsis works");

const row = rule(".call-device-row");
const rh = px(row, "min-height");
assert.ok(rh >= 30 && rh <= 32, `row 30-32px (${rh})`);
assert.ok(px(rule(".call-device-heading"), "font-size") <= 12, "compact header");

const ico = rule(".call-device-ico");
assert.ok(px(ico, "width") >= 16 && px(ico, "width") <= 18, "icon box 16-18px");
const glyph = jsx.match(/<Icon size=\{(\d+)\}/);
assert.ok(glyph && Number(glyph[1]) >= 16 && Number(glyph[1]) <= 18, "glyph 16-18px");

// Full device name in a tooltip; JS width clamp matches the CSS cap.
assert.match(jsx, /title=\{row\.detail \? `\$\{row\.name\}/);
assert.match(jsx, /DEVICE_MENU_MAX_W = 320/);
assert.match(jsx, /Math\.min\(size\.w \|\| \d+, DEVICE_MENU_MAX_W/);

// Touch keeps a 44pt hit target (apple-design), web/Electron stay compact.
assert.match(css, /@media \(pointer: coarse\)\s*\{\s*\.call-device-row\s*\{\s*min-height:\s*44px/);

// Heavy frosted glass, never see-through: still a frost surface.
assert.match(read("../../styles/frost.css"), /\.call-device-menu/);

// One shared component everywhere the mic / output menus open.
for (const [file, needle] of [
  ["../layout/UserVoicePanel.jsx", "CallDeviceMenu"],
  ["../CallOverlay.jsx", "DockDeviceSlot"],
  ["../servers/ServerVoicePanel.jsx", "DockDeviceSlot"],
]) {
  const src = read(file);
  assert.ok(src.includes(needle) && src.includes("call/DevicePicker"), `${file} uses the shared DevicePicker`);
}
console.log("deviceMenuCompact selftest ok");
