// Push-to-talk released when the window loses focus while the key is held (hot mic).
// Run: node frontend/src/lib/pttFocusGuard.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPttFocusGuard } from "./pttFocusGuard.js";

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

console.log("pttFocusGuard.selftest: ok");
