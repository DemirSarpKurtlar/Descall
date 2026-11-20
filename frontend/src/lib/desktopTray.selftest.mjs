// Desktop tray panel, page side (lib/desktopTray.js + its wiring).
// Run from frontend/: node src/lib/desktopTray.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRAY_PUSH_DELAY_MS,
  __resetDesktopTrayForTests,
  acceleratorLabel,
  buildTrayState,
  parseTrayAction,
  publishTray,
  readDocumentLook,
  runTrayAction,
  sameTrayState,
  setTrayHandler,
  startDesktopTray,
} from "./desktopTray.js";

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Accelerators as shown text.
assert.equal(acceleratorLabel("CommandOrControl+Alt+M"), "Ctrl+Alt+M");
assert.equal(acceleratorLabel("CommandOrControl+Alt+M", { mac: true }), "Cmd+Alt+M");
assert.equal(acceleratorLabel("Alt+F10"), "Alt+F10");
assert.equal(acceleratorLabel("Control+Shift+Up"), "Ctrl+Shift+↑");
assert.equal(acceleratorLabel("Mouse4"), "Mouse 4");
assert.equal(acceleratorLabel("ctrl+shift+k"), "ctrl+shift+K");
assert.equal(acceleratorLabel(""), "");
assert.equal(acceleratorLabel(null), "");

// 2. State object.
{
  const s = buildTrayState({
    app: { signedIn: true, name: "Demir", avatarUrl: "https://x/a.png", status: "dnd", statusText: "Kod", unreadMessages: 4.7, friendRequests: -1 },
    voice: { inCall: false, micMuted: true, deafened: false },
    call: { active: true, muted: false, deafened: true },
    clip: { available: true, hotkey: "Alt+F10" },
    hints: { mute: "Ctrl+Shift+M", deafen: "Ctrl+Shift+D" },
    look: { theme: "light", accent: "88,122,245", locale: "tr" },
  });
  assert.equal(s.signedIn, true);
  assert.equal(s.status, "dnd");
  assert.equal(s.unreadMessages, 4);
  assert.equal(s.friendRequests, 0);
  assert.equal(s.inCall, false, "the panel's own voice state wins over the call slot");
  assert.equal(s.micMuted, true);
  assert.equal(s.clipAvailable, true);
  assert.equal(s.hints.clip, "Alt+F10");
  assert.equal(s.theme, "light");
  assert.equal(s.statusUntil, 0, "no timed status in the app");
  const fallback = buildTrayState({ call: { active: true, muted: true, deafened: false } });
  assert.equal(fallback.inCall, true, "call slot used while the bottom-left panel is not mounted");
  assert.equal(fallback.micMuted, true);
  assert.equal(fallback.signedIn, false);
  assert.equal(fallback.status, "online");
  assert.equal(buildTrayState({ clip: null, hints: {} }).hints.clip, "");
  assert.equal(buildTrayState({ app: { status: "busy" } }).status, "online");
  assert.ok(sameTrayState(buildTrayState({}), buildTrayState({})));
}

// 3. Actions from the shell.
assert.deepEqual(parseTrayAction({ action: "status", arg: "idle" }), { action: "status", arg: "idle" });
assert.equal(parseTrayAction({ action: "status", arg: "away" }), null);
assert.deepEqual(parseTrayAction({ action: "openDms", arg: "x" }), { action: "openDms", arg: null });
assert.equal(parseTrayAction({ action: "quit" }), null, "shell actions never reach the page");
assert.equal(parseTrayAction({ action: "constructor" }), null);
assert.equal(parseTrayAction(null), null);
{
  __resetDesktopTrayForTests();
  const log = [];
  const offFallback = setTrayHandler("mute", () => log.push("fallback"), { fallback: true });
  assert.equal(runTrayAction({ action: "mute" }), true);
  const offPanel = setTrayHandler("mute", () => log.push("panel"));
  runTrayAction({ action: "mute" });
  const offNewer = setTrayHandler("mute", () => log.push("newer"));
  runTrayAction({ action: "mute" });
  offNewer();
  runTrayAction({ action: "mute" });
  offPanel();
  runTrayAction({ action: "mute" });
  offFallback();
  assert.equal(runTrayAction({ action: "mute" }), false, "nothing registered");
  assert.deepEqual(log, ["fallback", "panel", "newer", "panel", "fallback"], "a fallback never shadows the real toggle");
  setTrayHandler("status", (s) => log.push(`status:${s}`));
  runTrayAction({ action: "status", arg: "invisible" });
  assert.equal(log.at(-1), "status:invisible");
  assert.equal(runTrayAction({ action: "status", arg: "nope" }), false);
  setTrayHandler("clip", () => { throw new Error("boom"); });
  const warn = console.warn;
  console.warn = () => {};
  assert.equal(runTrayAction({ action: "clip" }), true, "a throwing handler does not break the bridge");
  console.warn = warn;
  assert.equal(typeof setTrayHandler("eval", () => {}), "function", "unknown action: inert unregister");
}

// 4. Debounced push through the bridge, one listener for actions.
{
  __resetDesktopTrayForTests();
  const sent = [];
  let listener = null;
  let unsubscribed = false;
  const bridge = {
    setTrayState: (s) => sent.push(s),
    onTrayAction: (cb) => { listener = cb; return () => { unsubscribed = true; }; },
  };
  const stop = startDesktopTray(bridge);
  publishTray("app", { signedIn: true, name: "A", unreadMessages: 1 });
  publishTray("app", { signedIn: true, name: "A", unreadMessages: 2 });
  publishTray("voice", { inCall: true, micMuted: false, deafened: false });
  await sleep(TRAY_PUSH_DELAY_MS + 60);
  assert.equal(sent.length, 1, "bursts are folded into one push");
  assert.equal(sent[0].unreadMessages, 2);
  assert.equal(sent[0].inCall, true);
  publishTray("app", { signedIn: true, name: "A", unreadMessages: 2 });
  await sleep(TRAY_PUSH_DELAY_MS + 60);
  assert.equal(sent.length, 1, "unchanged state is not sent again");
  publishTray("bogus", { x: 1 });
  let ran = null;
  setTrayHandler("openRequests", () => { ran = "requests"; });
  listener({ action: "openRequests" });
  assert.equal(ran, "requests");
  stop();
  assert.equal(unsubscribed, true);
  publishTray("app", { signedIn: false });
  await sleep(TRAY_PUSH_DELAY_MS + 60);
  assert.equal(sent.length, 1, "nothing is sent after stop");
  assert.equal(typeof startDesktopTray(null), "function", "web / mobile: no bridge, no-op");
  assert.equal(typeof startDesktopTray({}), "function");
}

// 5. Theme from the document.
{
  const fakeDoc = (attrs, vars) => ({
    documentElement: { lang: "tr", getAttribute: (k) => attrs[k] ?? null },
    _vars: vars,
  });
  globalThis.getComputedStyle = (el) => ({ getPropertyValue: (k) => (currentVars[k] ?? "") });
  let currentVars = { "--g-scheme": "light", "--g-brand-rgb": "88, 122, 245" };
  assert.deepEqual(readDocumentLook(fakeDoc({}, currentVars)), { theme: "light", accent: "88,122,245", locale: "tr" });
  currentVars = {};
  assert.equal(readDocumentLook(fakeDoc({ "data-theme": "light" })).theme, "light", "data-theme when no glass scheme");
  currentVars = { "--g-scheme": "dark" };
  assert.equal(readDocumentLook(fakeDoc({ "data-theme": "light" })).theme, "dark", "the glass scheme wins");
  assert.equal(readDocumentLook(null).theme, "dark");
  delete globalThis.getComputedStyle;
}

// 6. Wiring: the app's own code paths run the actions.
{
  const src = (p) => readFileSync(join(here, "..", p), "utf8");
  const app = src("App.jsx");
  assert.match(app, /useDesktopTray\(\{ me, myStatus, dmUnread, groupUnread, friendRequests, navigate, setStatus: handleStatusChange \}\)/, "status goes through handleStatusChange (status:set)");
  const hook = src("hooks/useDesktopTray.js");
  assert.match(hook, /setTrayHandler\("openDms", \(\) => go\("\/direct"\)\)/);
  assert.match(hook, /setTrayHandler\("openRequests", \(\) => go\("\/friends"\)\)/);
  assert.match(hook, /setTrayHandler\("openSettings", \(\) => go\("\/settings"\)\)/);
  assert.match(hook, /setTrayHandler\("mute", \(\) => runCallAction\("mute"\), \{ fallback: true \}\)/);
  const uvp = src("components/layout/UserVoicePanel.jsx");
  assert.match(uvp, /setTrayHandler\("mute", toggleMute\), setTrayHandler\("deafen", toggleDeafen\)/, "the panel's own toggles (idle preference included)");
  assert.match(uvp, /publishTray\("voice", \{ inCall: live, micMuted: muted, deafened \}\)/);
  const host = src("premium/gaming/PremiumGamingHost.jsx");
  assert.match(host, /setTrayHandler\("clip", \(\) => saveClip\(\)\)/, "instant clip saves through clipController");
  const preload = readFileSync(join(here, "..", "..", "electron", "preload.cjs"), "utf8");
  assert.match(preload, /setTrayState: \(state\) => ipcRenderer\.send\('tray:set-state'/);
  assert.match(preload, /ipcRenderer\.on\('tray:action', handler\)/);
}

__resetDesktopTrayForTests();
console.log("desktopTray.selftest ok");
