// 3D world UI rules that keep the frame rate (source checks).
// Run: node src/world3d/world3dUi.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// No blurred glass over the live canvas: the compositor re-blurs it every frame.
assert.doesNotMatch(strip(read("./world3d.css")), /backdrop-filter\s*:/, "world3d.css: no backdrop-filter over the canvas");

// One render loop: no timers driving frames inside the engine.
for (const f of ["./engine/WorldEngine.js", "./engine/cameraRig.js", "./engine/avatars.js"]) {
  const src = read(f);
  assert.doesNotMatch(src, /\bset(Interval|Timeout)\s*\(/, `${f}: no timers in the engine`);
}
assert.match(read("./engine/WorldEngine.js"), /engine\.runRenderLoop\(this\.loop\)/);

// Effects are never switched by the frame-rate governor: dynamic resolution only.
const engine = read("./engine/WorldEngine.js");
assert.match(engine, /createResolutionController/);
assert.doesNotMatch(engine, /shouldStepDown|lowerPreset/, "no automatic preset rebuild");

// The entry lives in the call dock, the top-bar pill is gone, the stage is not rendered under the world.
const call = read("../components/CallOverlay.jsx");
assert.doesNotMatch(call, /World3DButton\b/);
assert.match(call, /<World3DDockButton/);
assert.ok(call.indexOf("<World3DDockButton") > call.indexOf('title={t("End call")}'), "after the end-call button, at the end of the dock");
assert.match(call, /world\.stageHidden \? null : \(<>/);
assert.match(call, /data-w3d=\{world\.active \? world\.phase : undefined\}/);
const voice = read("../components/servers/ServerVoicePanel.jsx");
assert.doesNotMatch(voice, /World3DButton\b/);
assert.match(voice, /<World3DDockButton/);
assert.ok(voice.indexOf("<World3DDockButton") > voice.indexOf('{t("Leave")}'), "after the leave button");
assert.match(voice, /world\.stageHidden \? \(\s*<div hidden>[\s\S]*?RemoteScreenAudioSink/, "screen-share audio keeps playing while the stage is hidden");

// Transition and motion preferences.
const launcher = read("./launcher.css");
assert.match(launcher, /\[data-w3d="entering"\] > :not\(\.w3d-host\)/);
assert.match(launcher, /\[data-w3d="leaving"\] > :not\(\.w3d-host\)/);
assert.match(launcher, /400ms/);
assert.match(launcher, /prefers-reduced-motion: reduce/);

// Name tags: moved with transforms, not left / top.
assert.match(engine, /translate3d\(/);
assert.doesNotMatch(read("./World3DView.jsx"), /style\.(left|top)\s*=/);

console.log("world3dUi selftest ok");
