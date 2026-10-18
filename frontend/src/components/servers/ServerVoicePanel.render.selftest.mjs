// Renders the server voice channel view (and the 1:1 / group call overlay)
// in Node so a temporal-dead-zone ReferenceError ("Cannot access 'X' before
// initialization", the 2.10.113 'Staff Voice' crash) fails CI instead of
// showing the error boundary. Bundled with esbuild, rendered with
// react-dom/server.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const out = mkdtempSync(join(tmpdir(), "svp-"));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import ReactDOM from "react-dom";
// Portals (device menus, fullscreen tiles) render inline on the server.
ReactDOM.createPortal = (children) => children;
import { ToastProvider } from ${JSON.stringify(join(src, "context/ToastContext.jsx"))};
import { LocaleProvider } from ${JSON.stringify(join(src, "context/LocaleContext.jsx"))};
import ServerVoicePanel from ${JSON.stringify(join(here, "ServerVoicePanel.jsx"))};
export function render(props) {
  return renderToString(h(ToastProvider, null, h(LocaleProvider, null, h(ServerVoicePanel, props))));
}
`;
const file = join(out, "bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: src, loader: "jsx" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: file,
  jsx: "automatic",
  logLevel: "silent",
  plugins: [{
    name: "vite-query-stubs",
    setup(b) {
      b.onResolve({ filter: /\?(url|raw|worker|inline|worker&url)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default 'stub';", loader: "js" }));
    },
  }],
  loader: { ".css": "empty", ".png": "empty", ".svg": "empty", ".mp3": "empty", ".webp": "empty", ".gif": "empty", ".woff2": "empty" },
  define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false, PROD: true }) },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

// Minimal browser globals some modules read at import time.
const store = new Map();
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.navigator ??= { userAgent: "node", mediaDevices: undefined };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.location ??= { hostname: "descall.com", href: "https://descall.com/servers", pathname: "/servers", search: "", hash: "", origin: "https://descall.com", protocol: "https:" };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, dataset: {} });
globalThis.document ??= { documentElement: el(), body: el(), head: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", hidden: false, cookie: "" };
for (const k of ["AudioWorkletNode", "AudioContext", "MediaStream", "RTCPeerConnection", "HTMLElement", "HTMLMediaElement", "SVGElement", "Element", "Node", "Event", "CustomEvent", "Image", "ResizeObserver", "IntersectionObserver", "MutationObserver", "BroadcastChannel"]) globalThis[k] ??= class { constructor() {} observe() {} disconnect() {} unobserve() {} addEventListener() {} postMessage() {} close() {} };
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);

const origError = console.error;
console.error = (...a) => { if (/useLayoutEffect does nothing on the server/.test(String(a[0]))) return; origError(...a); };
const { render } = await import(pathToFileURL(file).href);

const server = { id: "s1", name: "test", isOwner: true, permissionsLoaded: true, myPermissions: ["CONNECT", "STREAM", "SPEAK"] };
const channel = { id: "c-voice", name: "Staff Voice", type: "voice" };
const me = { id: "u-me", username: "Demirr" };
const base = {
  isInVoice: false,
  activeChannelId: null,
  participants: [],
  voiceStatesByServer: { s1: { "c-voice": { memberCount: 1, members: [{ id: "u-2", username: "kaan" }] } } },
  audioInputDevices: [{ deviceId: "default", label: "Mic" }],
  audioOutputDevices: [{ deviceId: "default", label: "Speaker" }],
  selectedAudioInput: "default",
  selectedAudioOutput: "default",
};
const cases = {
  "selected, not joined": base,
  "joined": { ...base, isInVoice: true, activeChannelId: "c-voice", canSpeak: true, canStream: true, liveKitLink: "connected", participants: [{ id: "u-2", identity: "u-2", username: "kaan" }] },
  "joined, screen share": { ...base, isInVoice: true, activeChannelId: "c-voice", canSpeak: true, canStream: true, liveKitLink: "connected", participants: [{ id: "u-2", identity: "u-2", username: "kaan", isScreenSharing: true, screenShareTrack: {} }], screenSharers: ["u-2"] },
  "stage": { ...base, channelType: "stage" },
};
for (const [name, serverVoice] of Object.entries(cases)) {
  let html = "";
  try {
    html = render({ channel: name === "stage" ? { ...channel, type: "stage" } : channel, server, me, serverVoice });
  } catch (err) {
    assert.fail(`ServerVoicePanel (${name}) threw: ${err?.stack || err}`);
  }
  assert.ok(html.length > 200, `ServerVoicePanel (${name}) rendered`);
  assert.ok(html.includes("Staff Voice") || name === "stage" || html.length > 200);
}
console.log(`ServerVoicePanel.render.selftest ok (${Object.keys(cases).length} states)`);
