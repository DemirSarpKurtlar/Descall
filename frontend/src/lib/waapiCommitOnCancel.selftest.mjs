// Black flicker on open / close (owner report, Nov 2026): framer-motion's WAAPI
// animations must never hand back a stale inline style for a frame.
// Run: node src/lib/waapiCommitOnCancel.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitBeforeCancel, installWaapiCommitOnCancel, isFramerWaapiOptions } from "./waapiCommitOnCancel.js";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "..", "..");
const require = createRequire(join(front, "package.json"));

// ── 1. Fake DOM: a finished / running animation commits before it cancels ──
function fakeWindow() {
  const log = [];
  class Animation {
    constructor(target, keyframes, options) {
      Object.assign(this, { effect: { target }, keyframes, options, playState: "running" });
    }
    commitStyles() {
      const [prop, frames] = Object.entries(this.keyframes)[0];
      const value = this.playState === "finished" ? frames.at(-1) : frames[0];
      this.effect.target.style[prop] = String(value);
      log.push(`commit ${prop}=${value}`);
    }
    cancel() {
      this.playState = "idle";
      log.push("cancel");
    }
  }
  class Element {
    constructor() {
      this.style = {};
      this.isConnected = true;
    }
  }
  Element.prototype.animate = function animate(keyframes, options) {
    return new Animation(this, keyframes, options);
  };
  return { win: { Element }, log };
}
// framer-motion's exact option object (waapi/index.mjs startWaapiAnimation)
const framerOpts = { delay: 0, duration: 180, easing: "ease-out", fill: "both", iterations: 1, direction: "normal" };

{
  const { win, log } = fakeWindow();
  assert.equal(installWaapiCommitOnCancel(win), true, "installs");
  assert.equal(installWaapiCommitOnCancel(win), false, "only once");

  // Close: the scrim's inline opacity is still the resting "1". Without the
  // commit, cancel() on the finished fade-out shows opacity 1 for a frame.
  const scrim = new win.Element();
  scrim.style.opacity = "1";
  const fadeOut = scrim.animate({ opacity: [1, 0] }, framerOpts);
  fadeOut.playState = "finished";
  fadeOut.cancel();
  assert.equal(scrim.style.opacity, "0", "finished fade-out leaves opacity 0 inline (no pop back to dark)");
  assert.deepEqual(log.splice(0), ["commit opacity=0", "cancel"], "commit happens before cancel");

  // Open: inline is the `initial` 0; the finished fade-in must stay at 1.
  const card = new win.Element();
  card.style.opacity = "0";
  const fadeIn = card.animate({ opacity: [0, 1] }, framerOpts);
  fadeIn.playState = "finished";
  fadeIn.cancel();
  assert.equal(card.style.opacity, "1", "finished fade-in keeps opacity 1 (no one-frame vanish)");

  // Not rendered: plain cancel, never throws.
  const gone = new win.Element();
  gone.isConnected = false;
  const a = gone.animate({ opacity: [1, 0] }, framerOpts);
  log.length = 0;
  a.cancel();
  assert.deepEqual(log, ["cancel"], "detached target: no commit");

  // Already idle: no commit.
  const idle = new win.Element().animate({ opacity: [0, 1] }, framerOpts);
  idle.playState = "idle";
  log.length = 0;
  idle.cancel();
  assert.deepEqual(log, ["cancel"], "idle animation: no commit");

  // Other WAAPI users keep the standard revert-on-cancel.
  const other = new win.Element();
  other.style.opacity = "1";
  const shake = other.animate({ opacity: [1, 0] }, { duration: 300, fill: "forwards" });
  shake.playState = "finished";
  log.length = 0;
  shake.cancel();
  assert.equal(other.style.opacity, "1", "non-framer animation is not committed");
  assert.deepEqual(log, ["cancel"]);

  // commitStyles throwing (display: none) still cancels.
  const throwing = new win.Element().animate({ opacity: [0, 1] }, framerOpts);
  throwing.commitStyles = () => { throw new Error("not rendered"); };
  throwing.playState = "finished";
  assert.doesNotThrow(() => throwing.cancel());
  assert.equal(throwing.playState, "idle");
}
{
  // No WAAPI / no commitStyles (old WebKit): untouched, no crash.
  assert.equal(installWaapiCommitOnCancel({}), false);
  assert.equal(installWaapiCommitOnCancel(undefined), false);
  const bare = { cancel() {} };
  assert.equal(commitBeforeCancel(bare), bare);
  assert.equal(bare.cancel.name, "cancel", "no commitStyles: cancel left as is");
}
assert.equal(isFramerWaapiOptions(framerOpts), true);
assert.equal(isFramerWaapiOptions({ duration: 200, fill: "both" }), false);
assert.equal(isFramerWaapiOptions(null), false);
assert.equal(isFramerWaapiOptions(300), false);

// ── 2. The installed framer-motion still has the hand-off this guards ──
const fmRoot = dirname(require.resolve("framer-motion/package.json"));
const waapi = readFileSync(join(fmRoot, "dist/es/animation/animators/waapi/index.mjs"), "utf8");
const optsSrc = waapi.match(/element\.animate\(\s*keyframeOptions\s*,\s*\{([\s\S]*?)\}\s*\)/);
assert.ok(optsSrc, "framer startWaapiAnimation calls element.animate(keyframeOptions, {...})");
const keys = [...optsSrc[1].matchAll(/^\s*([a-z]+)\s*[:,]/gim)].map((m) => m[1]).sort();
assert.deepEqual(keys, ["delay", "direction", "duration", "easing", "fill", "iterations"],
  "framer's WAAPI option shape changed: update isFramerWaapiOptions or drop the shim if framer now commits before cancel");
assert.match(optsSrc[1], /fill:\s*"both"/);
const accel = readFileSync(join(fmRoot, "dist/es/animation/animators/AcceleratedAnimation.mjs"), "utf8");
const onfinish = accel.match(/animation\.onfinish\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\};/);
assert.ok(onfinish, "framer AcceleratedAnimation sets animation.onfinish");
assert.ok(/motionValue\.set\(/.test(onfinish[1]) && /this\.cancel\(\)/.test(onfinish[1]),
  "framer onfinish = deferred motionValue.set + immediate cancel (the one-frame stale style this shim fixes)");

// ── 3. Installed at boot, before anything renders ──
const main = readFileSync(join(here, "..", "main.jsx"), "utf8");
const installAt = main.indexOf("installWaapiCommitOnCancel()");
assert.ok(installAt > 0, "main.jsx installs the shim");
for (const later of ["ReactDOM.createRoot", "createRoot("]) {
  const at = main.indexOf(later);
  if (at > 0) assert.ok(installAt < at, `shim installed before ${later}`);
}

// ── 4. Scrims fade from transparent, never from an opaque black slab ──
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const overlay = strip(readFileSync(join(here, "..", "styles", "overlay.css"), "utf8"));
assert.match(overlay, /@keyframes dc-overlay-fade\s*\{\s*from\s*\{\s*opacity:\s*0;?\s*\}/, "scrim entrance starts at opacity 0");
const alphaOf = (decl) => {
  const m = decl.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : null;
};
for (const [name, max] of [["--overlay-dim", 0.6]]) {
  for (const m of overlay.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))) {
    const a = alphaOf(m[1]);
    assert.ok(a !== null && a <= max, `${name} is a translucent dim (alpha ${a} <= ${max}), not an opaque slab`);
  }
}
// The Settings scrim (desktop + glass) is translucent in every theme.
for (const file of ["settings.css", "settings-v3.css", "glass-desktop/surfaces.css"]) {
  const css = strip(readFileSync(join(here, "..", "styles", file), "utf8"));
  for (const rule of css.matchAll(/([^{}]*\.user-settings-shell[^{}]*)\{([^}]*)\}/g)) {
    for (const bg of rule[2].matchAll(/background(?:-color)?:\s*([^;]+);/g)) {
      const a = alphaOf(bg[1]);
      if (a !== null) assert.ok(a < 0.9, `${file} ${rule[1].trim()}: settings scrim alpha ${a} < 0.9`);
      assert.ok(!/^\s*(#000\b|#000000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/.test(bg[1]), `${file}: settings scrim never opaque black`);
    }
  }
}

console.log("waapiCommitOnCancel selftest ok");
