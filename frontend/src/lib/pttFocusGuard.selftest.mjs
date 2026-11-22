// Push-to-talk released when the window loses focus while the key is held (hot mic).
// Run: node frontend/src/lib/pttFocusGuard.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPttFocusGuard } from "./pttFocusGuard.js";
import { isPushToTalkRelease, matchPushToTalkEvent } from "./voiceProfile.js";

const sent = [];
const g = createPttFocusGuard((d) => sent.push(d));

// Key down, Alt+Tab away: one "up", so the hooks close the microphone.
g.key(true);
assert.equal(g.held, true);
assert.equal(g.lostFocus(), true);
assert.deepEqual(sent.at(-1), { down: false, source: "focus-lost" });
assert.equal(g.held, false);
// A second blur (or page hidden right after) does not send another one.
assert.equal(g.lostFocus(), false);
assert.equal(sent.length, 2);

// Normal press and release in the window: nothing extra on blur.
g.key(true);
g.key(false);
assert.equal(g.lostFocus(), false);
assert.deepEqual(sent.slice(-2), [{ down: true }, { down: false }]);

// Key auto-repeat (many keydowns) still needs only one release.
g.key(true);
g.key(true);
g.key(true);
const before = sent.length;
assert.equal(g.lostFocus(), true);
assert.equal(sent.length, before + 1);

// Descall+ global push-to-talk seen: the shell's keyboard hook reports the real key state
// from any window, so a blur must not cut the mic while the key is still down.
const g2sent = [];
const g2 = createPttFocusGuard((d) => g2sent.push(d));
g2.observe({ down: true });
g2.key(true);
g2.observe({ down: true, source: "global" });
assert.equal(g2.lostFocus(), false);
assert.deepEqual(g2sent, [{ down: true }]);
g2.observe(null);

// Release order: Ctrl+Shift+M let go as Shift, then M. The keyup of M no longer matches the
// combination (shiftKey false), which left the mic open; the Shift keyup ends the hold.
{
  const up = (o) => ({ type: "keyup", ...o });
  assert.equal(matchPushToTalkEvent(up({ code: "KeyM", key: "m", ctrlKey: true }), "mod+shift+m"), false, "the old matcher misses it");
  assert.equal(isPushToTalkRelease(up({ code: "ShiftLeft", key: "Shift", ctrlKey: true }), "mod+shift+m"), true);
  assert.equal(isPushToTalkRelease(up({ code: "KeyM", key: "m" }), "mod+shift+m"), true, "the letter, whatever modifiers are left");
  assert.equal(isPushToTalkRelease(up({ code: "ControlLeft", key: "Control", shiftKey: true }), "mod+shift+space"), true);
  assert.equal(isPushToTalkRelease(up({ code: "MetaLeft", key: "Meta" }), "mod+shift+m"), true, "Cmd on a Mac");
  assert.equal(isPushToTalkRelease(up({ code: "AltLeft", key: "Alt" }), "alt+shift+m"), true);
  assert.equal(isPushToTalkRelease(up({ code: "AltLeft", key: "Alt" }), "mod+shift+m"), false, "Alt is not part of Ctrl+Shift+M");
  assert.equal(isPushToTalkRelease(up({ code: "KeyK", key: "k" }), "mod+shift+m"), false, "other keys do not end it");
  assert.equal(isPushToTalkRelease({ type: "keydown", code: "KeyM", key: "M" }, "mod+shift+m"), false, "keydown never releases");
  assert.equal(isPushToTalkRelease(up({ code: "KeyM" }), "nope"), false);
}

// App.jsx routes the in-window key, blur and page hidden through the guard.
const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "..", "App.jsx"), "utf8");
const at = app.indexOf("createPttFocusGuard(");
assert.ok(at > 0, "App.jsx uses createPttFocusGuard");
const body = app.slice(at, app.indexOf("}, []);", at));
assert.match(body, /guard\.key\(event\.type === "keydown"\)/, "keys go through the guard");
assert.match(body, /addEventListener\("blur", onBlur\)/, "window blur releases a held key");
assert.match(body, /addEventListener\("visibilitychange", onVisibility\)/, "page hidden releases a held key");
assert.match(body, /addEventListener\("descall:ptt", onPtt\)/, "global push-to-talk is noticed");
assert.match(body, /guard\.held && isPushToTalkRelease\(event, profile\.pttAccelerator\)\)[\s\S]{0,160}guard\.key\(false\)/, "a modifier let go first ends the hold");

console.log("pttFocusGuard.selftest: ok");
