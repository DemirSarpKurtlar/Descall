// node src/lib/desktopDeepLinks.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { desktopDeepLinkBridge, startDesktopDeepLinks } from "./desktopDeepLinks.js";
import { resolveDeepLink } from "./deepLinks.js";

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

// Hostile descall: links (any web page or document can make Windows start the app with one;
// the shell only checks scheme, length and control characters): whatever they hold, the page
// routes to an in-app path without traversal, a second scheme or a protocol-relative URL.
{
  const hostile = [
    "descall://settings/..%2F..%2Fadmin",
    "descall://settings/%2e%2e",
    "descall://dm/%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "descall://dm/a%2Fb",
    "descall://server/1/%2F%2Fevil.example",
    "descall:javascript:alert(1)",
    "descall://app//evil.example/x",
    "descall:////evil.example",
    "descall://invite/../../admin",
    "descall://join/%E0%A4%A",
    "descall://settings/profile?picker=avatar%22onerror",
    `descall://dm/${"a".repeat(3000)}`,
    "descall://whats-new#//evil.example",
  ];
  for (const url of hostile) {
    const link = resolveDeepLink(url);
    if (link === null) continue;
    const out = link.path;
    assert.ok(out.startsWith("/") && !out.startsWith("//"), `${url} -> ${out}: an app path`);
    assert.ok(!/(^|\/)\.\.?(\/|$)/.test(decodeURIComponent(out.split("?")[0])), `${url} -> ${out}: no dot segments`);
    assert.ok(!/[<>"'\s]/.test(out) && !/^\/[a-z][a-z0-9+.-]*:/i.test(out), `${url} -> ${out}: nothing to inject`);
    assert.ok(!out.includes("evil.example"), `${url} -> ${out}`);
  }
  assert.equal(resolveDeepLink("descall://settings/..%2F..%2Fadmin").path, "/settings");
  assert.equal(resolveDeepLink("descall://settings/profile?picker=avatar%22onerror").path, "/settings/profile");
}

// The app entry point uses it (nativeDeepLinks.js -> App.jsx startNativeDeepLinks).
const native = readFileSync(new URL("./nativeDeepLinks.js", import.meta.url), "utf8");
assert.match(native, /desktopDeepLinkBridge\(window\.electronAPI\)/);
assert.match(native, /return startDesktopDeepLinks\(desktop, onPath\)/);

console.log("desktopDeepLinks selftest: ok");
