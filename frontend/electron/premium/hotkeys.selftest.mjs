// Descall+ hotkey / PTT / notification-hook logic (no electron). Run from frontend/:
// node electron/premium/hotkeys.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("./hotkeyLogic.cjs");
const { createHotkeyManager } = require("./hotkeys.cjs");
const { bindingToHookSpec, matchHookEvent, createPttState } = require("./pttLogic.cjs");
const notifyHooks = require("./notifyHooks.cjs");

// 1. Accelerator normalisation.
assert.equal(L.normalizeAccelerator("ctrl+shift+m"), "Control+Shift+M");
assert.equal(L.normalizeAccelerator("Shift+CmdOrCtrl+m"), "CommandOrControl+Shift+M");
assert.equal(L.normalizeAccelerator("alt+alt+f5"), "Alt+F5");
assert.equal(L.normalizeAccelerator("mouse4"), "Mouse4");
assert.equal(L.normalizeAccelerator("Ctrl+Mouse4"), "", "mouse buttons take no modifiers");
assert.equal(L.normalizeAccelerator("Ctrl+A+B"), "", "one key only");
assert.equal(L.normalizeAccelerator("Ctrl+Shift"), "", "a key is required");
assert.equal(L.normalizeAccelerator("Ctrl+Nope"), "");
assert.equal(L.normalizeAccelerator("mediaplaypause"), "MediaPlayPause");
assert.equal(L.normalizeAccelerator(42), "");

// 2. Bindings: defaults unless custom hotkeys are allowed; "" switches an action off.
const defaults = L.resolveBindings({ toggle_mute: "Alt+F1" });
assert.equal(defaults.toggle_mute, L.ACTIONS.toggle_mute.default);
const custom = L.resolveBindings({ toggle_mute: "alt+f1", quick_launcher: "", toggle_deafen: "garbage+++" }, { allowCustom: true });
assert.equal(custom.toggle_mute, "Alt+F1");
assert.equal(custom.quick_launcher, "");
assert.equal(custom.toggle_deafen, L.ACTIONS.toggle_deafen.default, "invalid custom value falls back to the default");

// 3. Conflict detection.
const issues = L.findConflicts(
  { toggle_mute: "Ctrl+Alt+M", toggle_deafen: "Control+Alt+M", quick_launcher: "F12", volume_up: "A", volume_down: "Mouse4", push_to_talk: "Mouse4" },
  { platform: "win32" },
);
const by = Object.fromEntries(issues.map((i) => [i.action, i.reason]));
assert.equal(by.toggle_deafen, "duplicate");
assert.equal(issues.find((i) => i.action === "toggle_deafen").other, "toggle_mute");
assert.equal(by.quick_launcher, "reserved");
assert.equal(by.volume_up, "needs_modifier");
assert.equal(by.volume_down, "mouse_not_allowed");
assert.equal(by.push_to_talk, undefined, "mouse is fine for hold-to-talk");
// CommandOrControl and Control are the same key on Windows, not on macOS.
assert.equal(L.findConflicts({ toggle_mute: "CommandOrControl+M", toggle_deafen: "Control+M" }, { platform: "win32" })[0]?.reason, "duplicate");
assert.equal(L.findConflicts({ toggle_mute: "CommandOrControl+M", toggle_deafen: "Control+M" }, { platform: "darwin" }).length, 0);
// isRegistered (globalShortcut.isRegistered) marks bindings already taken.
const taken = L.findConflicts({ toggle_mute: "Ctrl+Alt+K" }, { isRegistered: (a) => a === "Control+Alt+K" });
assert.deepEqual(taken.map((i) => i.reason), ["registered"]);
assert.equal(L.findConflicts({ toggle_mute: "nonsense+" })[0].reason, "invalid");

// 4. Manager: registers only actions with a handler, releases only its own.
function fakeShortcuts({ refuse = [] } = {}) {
  const map = new Map();
  return {
    map,
    register(a, fn) { if (refuse.includes(a) || map.has(a)) return false; map.set(a, fn); return true; },
    unregister(a) { map.delete(a); },
    isRegistered(a) { return map.has(a); },
  };
}
const store = { data: {}, feature(k) { return this.data[k] || {}; } };
const gs = fakeShortcuts({ refuse: ["CommandOrControl+Alt+D"] });
gs.register("F12", () => {}); // Descall's own devtools key stays put
const mgr = createHotkeyManager({ globalShortcut: gs, store, log: { info() {}, warn() {} } });
assert.equal(gs.map.size, 1, "nothing registered while no feature is on");
let fired = 0;
mgr.setHandler("toggle_mute", () => { fired += 1; });
mgr.setHandler("toggle_deafen", () => {});
assert.ok(gs.map.has("CommandOrControl+Alt+M"));
gs.map.get("CommandOrControl+Alt+M")();
assert.equal(fired, 1);
const st = mgr.status();
assert.deepEqual(st.failures.map((f) => [f.action, f.reason]), [["toggle_deafen", "taken"]], "another app holds it");
// Custom map applies only while custom hotkeys are allowed.
store.data.custom_hotkeys = { bindings: { toggle_mute: "Alt+Shift+F9" } };
mgr.apply();
assert.ok(gs.map.has("CommandOrControl+Alt+M"));
mgr.setCustomAllowed(true);
assert.ok(gs.map.has("Alt+Shift+F9") && !gs.map.has("CommandOrControl+Alt+M"));
// check(): a binding Descall itself holds for that action is not a conflict; F12 is reserved.
assert.deepEqual(mgr.check({ toggle_mute: "Alt+Shift+F9" }), []);
assert.equal(mgr.check({ quick_launcher: "F12" })[0].reason, "reserved");
// probe(): free vs. held by someone else.
assert.equal(mgr.probe("Alt+Shift+F10").free, true);
assert.equal(gs.map.has("Alt+Shift+F10"), false, "probe releases what it grabbed");
assert.equal(mgr.probe("CommandOrControl+Alt+D").free, false);
mgr.setHandler("toggle_mute", null);
mgr.setHandler("toggle_deafen", null);
assert.deepEqual([...gs.map.keys()], ["F12"], "dispose of features leaves only Descall's own keys");

// 5. PTT: hook spec + edges.
const K = { M: 50, Space: 57, F13: 91, Backquote: 41, ArrowUp: 3 };
assert.deepEqual(bindingToHookSpec("Mouse4", K), { kind: "mouse", button: 4 });
const sp = bindingToHookSpec("Ctrl+Space", K);
assert.equal(sp.keycode, 57);
assert.equal(sp.ctrl, true);
assert.equal(bindingToHookSpec("Up", K).keycode, 3);
assert.equal(bindingToHookSpec("Ctrl+Nope", K), null);
assert.equal(matchHookEvent(sp, "keydown", { keycode: 57, ctrlKey: true }), "down");
assert.equal(matchHookEvent(sp, "keydown", { keycode: 57, ctrlKey: false }), null, "modifier required to start");
assert.equal(matchHookEvent(sp, "keyup", { keycode: 57 }), "up", "release ends talk whatever else is held");
assert.equal(matchHookEvent({ kind: "mouse", button: 4 }, "mousedown", { button: 4 }), "down");
assert.equal(matchHookEvent({ kind: "mouse", button: 4 }, "mousedown", { button: 5 }), null);
assert.equal(matchHookEvent({ kind: "mouse", button: 4 }, "keydown", { keycode: 4 }), null);

// Talk state: key repeat does not re-fire, release tail, toggle timeout.
const timers = [];
const fakeTimers = {
  setTimeout(fn, ms) { const t = { fn, ms, live: true }; timers.push(t); return t; },
  clearTimeout(t) { if (t) t.live = false; },
};
const flush = () => { for (const t of timers.splice(0)) if (t.live) t.fn(); };
const changes = [];
const p = createPttState({ onChange: (v) => changes.push(v), releaseDelayMs: 150, timeoutMs: 5000, timers: fakeTimers });
p.press(); p.press(); p.press();
assert.deepEqual(changes, [true]);
p.release();
assert.deepEqual(changes, [true], "tail keeps talking briefly");
p.press(); // pressed again inside the tail: no gap
flush();
assert.deepEqual(changes, [true]);
p.release();
flush();
assert.deepEqual(changes, [true, false]);
p.toggle();
assert.deepEqual(changes, [true, false, true]);
flush(); // timeout
assert.deepEqual(changes, [true, false, true, false]);
p.toggle(); p.toggle();
assert.deepEqual(changes.slice(-2), [true, false]);

// 6. Notification hooks: pass-through, decorate, drop, failing hook ignored.
const payload = { title: "a", options: { data: { type: "dm", fromId: "u1" } } };
assert.equal(notifyHooks.run(payload), payload);
const off1 = notifyHooks.register("x", (pl) => ({ ...pl, marked: true }));
const off2 = notifyHooks.register("bad", () => { throw new Error("boom"); });
assert.equal(notifyHooks.run(payload).marked, true);
const off3 = notifyHooks.register("drop", () => null);
assert.equal(notifyHooks.run(payload), null);
off1(); off2(); off3();
assert.equal(notifyHooks.run(payload), payload);
assert.equal(notifyHooks.showQuickReply({}), false, "no native handler -> capsule");

console.log("premium hotkeys.selftest ok");
