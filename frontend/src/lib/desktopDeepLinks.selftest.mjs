// node src/lib/desktopDeepLinks.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { desktopDeepLinkBridge, startDesktopDeepLinks } from "./desktopDeepLinks.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeShell(pending = null) {
  let link = pending;
  const listeners = [];
  return {
    api: {
      isElectron: true,
      isTauri: true,
      takeDeepLink: async () => { const u = link; link = null; return u; },
      onDeepLink: (cb) => { listeners.push(cb); return () => listeners.splice(listeners.indexOf(cb), 1); },
    },
    open(url) { link = url; listeners.slice().forEach((cb) => cb()); },
    listeners,
  };
}

// Electron and the web have no bridge: no-op.
assert.equal(desktopDeepLinkBridge({ isElectron: true }), null);
assert.equal(desktopDeepLinkBridge(undefined), null);
assert.equal(typeof startDesktopDeepLinks({ isElectron: true }, () => {}), "function");

// Cold start: the link from the launch arguments routes once the app mounts.
{
  const shell = fakeShell("descall://dm/ayse");
  const paths = [];
  const stop = startDesktopDeepLinks(shell.api, (p) => paths.push(p));
  await tick();
  assert.deepEqual(paths, ["/direct/ayse"]);
  // Second launch while running: event, then take.
  shell.open("descall://server/12/34");
  await tick();
  assert.deepEqual(paths, ["/direct/ayse", "/servers/12/34"]);
  // An event with nothing pending (already taken) routes nothing.
  shell.listeners.forEach((cb) => cb());
  await tick();
  assert.equal(paths.length, 2);
  stop();
  assert.equal(shell.listeners.length, 0, "unsubscribed");
}

// StrictMode remount: the second mount finds nothing, the link routes once.
{
  const shell = fakeShell("descall://friends");
  const paths = [];
  const stop1 = startDesktopDeepLinks(shell.api, (p) => paths.push(p));
  stop1();
  const stop2 = startDesktopDeepLinks(shell.api, (p) => paths.push(p));
  await tick();
  assert.deepEqual(paths, ["/friends"]);
  stop2();
}

// Foreign or broken input never routes; a failing bridge never throws.
{
  const shell = fakeShell("https://evil.example/x");
  const paths = [];
  startDesktopDeepLinks(shell.api, (p) => paths.push(p));
  await tick();
  assert.deepEqual(paths, []);
  const broken = { takeDeepLink: () => Promise.reject(new Error("no command")), onDeepLink: () => { throw new Error("x"); } };
  startDesktopDeepLinks(broken, (p) => paths.push(p));
  await tick();
  assert.deepEqual(paths, []);
}

// The app entry point uses it (nativeDeepLinks.js -> App.jsx startNativeDeepLinks).
const native = readFileSync(new URL("./nativeDeepLinks.js", import.meta.url), "utf8");
assert.match(native, /desktopDeepLinkBridge\(window\.electronAPI\)/);
assert.match(native, /return startDesktopDeepLinks\(desktop, onPath\)/);

console.log("desktopDeepLinks selftest: ok");
