// Descall+ desktop windows, pure parts: window geometry (multi-monitor fitting, snapping,
// docking, display mapping), taskbar badge raster, screen-edge detection, pop-out route
// rules, and the feature module contract.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const kit = require("./windowKit.cjs");
const icons = require("./badgeIcon.cjs");
const tiers = require("./featureTiers.cjs");

// Feature modules require mainI18n (no electron import), so they load under plain Node.
const edge = require("./features/screen_edge_actions.cjs");
const multi = require("./features/multi_window.cjs");

test("windowKit: frame names, fitting, snapping, docking, display mapping", () => {
  assert.equal(kit.kindForFrame("descall-premium-call"), "call");
  assert.equal(kit.kindForFrame("descall-premium-mini"), null, "mini mode is the in-app call card now, not a window");
  assert.equal(kit.kindForFrame("descall-premium-evil"), null);
  assert.equal(kit.kindForFrame("_blank"), null);
  const primary = { x: 0, y: 0, width: 1920, height: 1040 };
  const second = { x: 1920, y: 0, width: 1280, height: 1000 };
  assert.deepEqual(kit.fitToWorkAreas({ x: 100, y: 100, width: 300, height: 200 }, [primary, second], primary), { x: 100, y: 100, width: 300, height: 200 });
  const rescued = kit.fitToWorkAreas({ x: 4000, y: 200, width: 400, height: 300 }, [primary], primary);
  assert.ok(rescued.x >= 0 && rescued.x + rescued.width <= 1920, JSON.stringify(rescued));
  assert.equal(kit.fitToWorkAreas({ x: 0, y: 0, width: 0, height: 0 }, [primary], primary), null);
  assert.deepEqual(kit.snapToEdges({ x: 10, y: 1040 - 210, width: 300, height: 200 }, primary), { x: 0, y: 840, width: 300, height: 200 });
  assert.deepEqual(kit.dockedBounds(primary, "right", 300), { x: 1620, y: 0, width: 300, height: 1040 });
  assert.deepEqual(kit.dockedBounds(second, "left", 300), { x: 1920, y: 0, width: 300, height: 1000 });
  const mapped = kit.mapBetweenDisplays({ x: 2560, y: 500, width: 640, height: 400 }, second, primary);
  assert.deepEqual(mapped, { x: 960, y: 520, width: 960, height: 416 });
  assert.equal(kit.boundsKey("popout", "/direct/deniz"), "bounds.popout__direct_deniz");
  assert.equal(kit.boundsKey("call"), "bounds.call");
});

test("windowKit: behaviour defaults without always_on_top / window_opacity", () => {
  const ctx = { gate: { has: () => false }, store: { get: (_p, d) => d } };
  assert.equal(kit.onTopFor(ctx, "call"), true);
  assert.equal(kit.onTopFor(ctx, "call"), true);
  assert.equal(kit.onTopFor(ctx, "main"), false);
  assert.equal(kit.opacityFor(ctx, "call"), 1);
  const on = { gate: { has: () => true }, store: { get: (p, d) => ({ "features.always_on_top.main": true, "features.window_opacity.call": 0.1 })[p] ?? d } };
  assert.equal(kit.onTopFor(on, "main"), true);
  assert.equal(kit.opacityFor(on, "call"), 0.3, "clamped to 30 %");
  assert.equal(kit.opacityFor(on, "main"), 1, "the main window never fades");
});

test("badgeIcon: unread badge pixels and glyphs", () => {
  assert.equal(icons.unreadBadge(0), null);
  const one = icons.unreadBadge(3, 16);
  assert.equal(one.data.length, 16 * 16 * 4);
  assert.equal(one.text, "3");
  assert.equal(icons.unreadBadge(42).text, "9+");
  assert.equal(one.data[(8 * 16 + 8) * 4 + 3], 255, "centre is opaque");
  assert.equal(one.data[3], 0, "corner is transparent");
  for (const name of Object.keys(icons.GLYPHS)) {
    assert.equal(icons.GLYPHS[name].length, 16, name);
    assert.ok(icons.GLYPHS[name].every((row) => row.length === 16), name);
    assert.ok(icons.glyph(name).data.some((b) => b === 255), name);
  }
});

test("screen edge detection and pop-out route rules", () => {
  const b = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.equal(edge.atEdge({ x: 0, y: 500 }, b, "left"), true);
  assert.equal(edge.atEdge({ x: 5, y: 500 }, b, "left"), false);
  assert.equal(edge.atEdge({ x: 1919, y: 500 }, b, "right"), true);
  assert.equal(edge.atEdge({ x: 1919, y: 1200 }, b, "right"), false);
  assert.equal(edge.defaultEnabled, false, "cursor polling stays off until the user turns it on");
  assert.equal(multi.MAX, 4);
  assert.equal(multi.validRoute("/direct/deniz"), "/direct/deniz");
  assert.equal(multi.validRoute("/servers/s1/c2"), "/servers/s1/c2");
  assert.equal(multi.validRoute("/groups/g1"), "/groups/g1");
  for (const bad of ["https://evil.example/", "/settings/security", "/direct/../x", "/direct/a?x=1", "/servers/s1", "javascript:alert(1)", "/direct/a b"]) {
    assert.equal(multi.validRoute(bad), null, bad);
  }
});

test("every desktop feature module is a contract key with start/stop", () => {
  const dir = path.join(here, "features");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".cjs"));
  assert.ok(files.length >= 12, files.join(","));
  for (const f of files) {
    const mod = require(path.join(dir, f));
    assert.equal(`${mod.key}.cjs`, f, "file name is the feature key");
    assert.ok(Object.prototype.hasOwnProperty.call(tiers.TIERS, mod.key), `${mod.key} is a contract key`);
    assert.equal(typeof mod.start, "function");
    assert.equal(typeof mod.stop, "function");
  }
});

test("every renderer settings panel names a contract key", () => {
  const dir = path.join(here, "..", "..", "src", "premium", "settings");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsx"))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const m = text.match(/export const key = "([a-z_]+)";/);
    assert.ok(m, `${f} exports key`);
    assert.equal(`${m[1]}.jsx`, f);
    assert.ok(Object.prototype.hasOwnProperty.call(tiers.TIERS, m[1]), m[1]);
    assert.match(text, /export function Panel\(/, `${f} exports Panel`);
  }
});
