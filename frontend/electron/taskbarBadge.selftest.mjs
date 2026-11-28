// Unread badge on the taskbar button (every user, Discord-like): the raster (text, 0 hides,
// 1-9, 9+, whole-pixel layout at 16 px, same pixels as the Rust twin), the size per scale
// factor, the controller per platform, and the single owner of the overlay icon.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const B = require("./taskbarBadge.cjs");

const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const count = (img, rgba) => {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (rgba.every((v, k) => img.data[i + k] === v)) n += 1;
  return n;
};

test("text: nothing at 0, 1-9 as is, 9+ above nine", () => {
  for (const zero of [0, -3, "x", null, undefined, NaN]) {
    assert.equal(B.badgeText(zero), "", String(zero));
    assert.equal(B.renderBadge(zero, 16), null, `no badge for ${zero}`);
  }
  for (let n = 1; n <= 9; n += 1) assert.equal(B.badgeText(n), String(n));
  assert.equal(B.badgeText(10), "9+");
  assert.equal(B.badgeText(99999), "9+");
  assert.equal(B.badgeText(3.9), "3");
});

test("raster: red disc, white bold count, transparent corners", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 42]) {
    for (const size of [16, 32]) {
      const img = B.renderBadge(n, size);
      assert.equal(img.width, size);
      assert.equal(img.data.length, size * size * 4);
      assert.equal(img.text, n > 9 ? "9+" : String(n));
      assert.equal(px(img, 0, 0)[3], 0, `${n}@${size}: corner transparent`);
      assert.equal(px(img, size - 1, size - 1)[3], 0);
      const white = count(img, [255, 255, 255, 255]);
      const red = count(img, [242, 63, 67, 255]);
      assert.ok(white >= (size === 16 ? 10 : 40), `${n}@${size}: count drawn (${white})`);
      assert.ok(red > white, `${n}@${size}: on a red disc`);
      assert.equal(px(img, 1, size / 2).join(), "242,63,67,255", "disc reaches the left edge");
    }
  }
});

test("16 px: whole-pixel layout so the strokes stay crisp", () => {
  assert.deepEqual(B.layout("3", 16), { gw: 6, gh: 10, sw: 2, gap: 0, x0: 5, y0: 3 });
  assert.deepEqual(B.layout("9+", 16), { gw: 5, gh: 8, sw: 2, gap: 2, x0: 2, y0: 4 });
  // The "1" stem is two solid white columns (no grey anti-aliasing) at 16 px.
  const one = B.renderBadge(1, 16);
  for (let y = 5; y <= 11; y += 1) {
    assert.equal(px(one, 7, y).join(), "255,255,255,255", `stem 7,${y}`);
    assert.equal(px(one, 8, y).join(), "255,255,255,255", `stem 8,${y}`);
  }
});

test("size follows the display scale factor", () => {
  assert.equal(B.badgeSize(1), 16);
  assert.equal(B.badgeSize(1.25), 20);
  assert.equal(B.badgeSize(1.5), 24);
  assert.equal(B.badgeSize(2), 32);
  assert.equal(B.badgeSize(0), 16);
  assert.equal(B.badgeSize(undefined), 16);
  assert.equal(B.badgeSize(9), 64);
});

test("same pixels as the Tauri shell (descall-shell taskbar_badge.rs pins these too)", () => {
  const pins = [
    [1, 16, "09eba214"],
    [3, 16, "9ee59464"],
    [8, 16, "44b056b5"],
    [42, 16, "6840393f"],
    [5, 20, "74903d2d"],
    [9, 24, "70196b0a"],
    [3, 32, "04537ae8"],
    [10, 32, "8b92f326"],
    [6, 48, "83d6cfd9"],
  ];
  for (const [n, size, sum] of pins) assert.equal(B.checksum(B.renderBadge(n, size).data), sum, `${n} at ${size} px`);
  const rust = fs.readFileSync(path.join(here, "..", "..", "desktop", "crates", "descall-shell", "src", "taskbar_badge.rs"), "utf8");
  for (const [n, size, sum] of pins) assert.ok(rust.includes(`(${n}, ${size}, "${sum}")`), `Rust test pins ${n}@${size}`);
});

test("BGRA copy and PNG", () => {
  const img = B.renderBadge(3, 16);
  const bgra = B.toBgra(img.data);
  assert.equal(bgra[0], img.data[2]);
  assert.equal(bgra[2], img.data[0]);
  assert.notEqual(bgra, img.data);
  const png = B.encodePng(img);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 16);
});

function fakeElectron({ scaleFactor = 1 } = {}) {
  const calls = [];
  const win = {
    destroyed: false,
    isDestroyed() { return this.destroyed; },
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    setOverlayIcon: (img, desc) => calls.push(["overlay", img, desc]),
  };
  const electron = {
    app: { dock: { setBadge: (t) => calls.push(["dock", t]) }, setBadgeCount: (n) => calls.push(["count", n]) },
    nativeImage: { createFromBitmap: (buf, o) => ({ width: o.width, height: o.height, bytes: buf.length }) },
    screen: { getDisplayMatching: () => ({ scaleFactor }) },
  };
  return { calls, win, electron };
}

test("Windows: overlay icon at the scale factor, cleared at 0, only on a change", () => {
  const { calls, win, electron } = fakeElectron({ scaleFactor: 2 });
  const badge = B.createTaskbarBadge({ electron, getWindow: () => win, describe: (n) => `${n} unread`, platform: "win32", log: null });
  badge.set(3);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { width: 32, height: 32, bytes: 32 * 32 * 4 }, "drawn at 200 %");
  assert.equal(calls[0][2], "3 unread");
  badge.set(3);
  assert.equal(calls.length, 1, "same count: nothing to do");
  badge.refresh();
  assert.equal(calls.length, 2, "shown from the tray: set again on the new button");
  badge.rescale();
  assert.equal(calls.length, 2, "same display: nothing to do");
  badge.set(0);
  assert.deepEqual(calls.at(-1), ["overlay", null, ""], "0 hides the badge");
  const before = calls.length;
  badge.refresh();
  assert.equal(calls.length, before, "nothing to restore at 0");
  win.destroyed = true;
  badge.set(5);
  assert.equal(calls.length, before, "no window, no call");
});

test("macOS dock and Linux launcher count", () => {
  const mac = fakeElectron();
  const m = B.createTaskbarBadge({ electron: mac.electron, getWindow: () => null, platform: "darwin", log: null });
  m.set(7);
  m.set(150);
  m.set(0);
  assert.deepEqual(mac.calls, [["dock", "7"], ["dock", "99+"], ["dock", ""]]);
  const lin = fakeElectron();
  const l = B.createTaskbarBadge({ electron: lin.electron, getWindow: () => null, platform: "linux", log: null });
  l.set(4);
  l.set(0);
  assert.deepEqual(lin.calls, [["count", 4], ["count", 0]]);
});

test("free for every user: main.cjs owns the badge, Descall+ no longer sets it", () => {
  const main = fs.readFileSync(path.join(here, "main.cjs"), "utf8");
  assert.match(main, /taskbarBadge\.set\(next\.badgeCount\)/, "tray state from the page drives it, no plan check");
  assert.doesNotMatch(main, /setOverlayIcon/, "only taskbarBadge.cjs touches the overlay");
  const plus = fs.readFileSync(path.join(here, "premium", "features", "taskbar_plus.cjs"), "utf8");
  for (const owned of ["setOverlayIcon", "setBadgeCount", "dock?.setBadge", "dock.setBadge"]) {
    assert.ok(!plus.includes(owned), `taskbar_plus does not call ${owned}`);
  }
  const plusRs = fs.readFileSync(path.join(here, "..", "..", "desktop", "app", "src-tauri", "src", "premium", "features", "taskbar_plus.rs"), "utf8");
  assert.ok(!plusRs.includes("set_overlay_icon"), "Tauri taskbar_plus does not set the overlay either");
});
