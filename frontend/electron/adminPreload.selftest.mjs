// Admin windows get a reduced bridge. Run from frontend/: node electron/adminPreload.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/** Runs a preload file against a fake electron module; returns the exposed API and the IPC log. */
function loadPreload(file) {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
  const calls = [];
  let exposed = null;
  const ipcRenderer = {
    invoke: (ch, ...a) => { calls.push(["invoke", ch, ...a]); return Promise.resolve(`invoked:${ch}`); },
    send: (ch, ...a) => { calls.push(["send", ch, ...a]); },
    sendSync: (ch, ...a) => { calls.push(["sendSync", ch, ...a]); return `sync:${ch}`; },
    on: (ch) => { calls.push(["on", ch]); },
    off: () => {},
    removeListener: () => {},
    removeAllListeners: (ch) => { calls.push(["removeAllListeners", ch]); },
  };
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => {
      // preload.cjs also exposes descallPremium (Descall+ bridge); the admin preload does not need it.
      if (name === "descallPremium") return;
      assert.equal(name, "electronAPI"); exposed = api;
    } },
    ipcRenderer,
  };
  const sandbox = {
    require: (m) => { assert.equal(m, "electron", `${file} requires only electron (sandboxed preload)`); return electron; },
    process: { platform: "win32" },
    console: { log: () => {} },
    Promise,
    String, Number, Boolean,
  };
  vm.runInNewContext(src, sandbox, { filename: file });
  assert.ok(exposed, `${file} exposes electronAPI`);
  return { api: exposed, calls };
}

const full = loadPreload("preload.cjs");
const admin = loadPreload("adminPreload.cjs");

// Same shape: shared app code may probe any key, so nothing is missing or extra.
assert.deepEqual(Object.keys(admin.api).sort(), Object.keys(full.api).sort(), "admin bridge has exactly the keys of preload.cjs");
assert.deepEqual(Object.keys(admin.api.secureToken).sort(), Object.keys(full.api.secureToken).sort());
for (const k of Object.keys(full.api)) {
  assert.equal(typeof admin.api[k], typeof full.api[k], `${k} has the same type`);
}

// Capabilities the admin pages never use: answered locally, no IPC at all.
const STUBBED = {
  readClipboardImage: null,
  getScreenSources: [],
  scanProcesses: [],
  checkForUpdates: { success: true, skipped: true },
  restartApp: { installing: false },
  confirmRestartApp: { installing: false },
};
for (const [k, value] of Object.entries(STUBBED)) {
  const before = admin.calls.length;
  const out = admin.api[k]();
  assert.ok(out instanceof Promise, `${k} still returns a promise`);
  // JSON compare: values built inside the vm context have that realm's prototypes.
  assert.equal(JSON.stringify(await out), JSON.stringify(value), `${k} answers ${JSON.stringify(value)}`);
  assert.equal(admin.calls.length, before, `${k} sends no IPC`);
}
for (const k of ["downloadFile", "overlayShow", "overlayHide", "overlayUpdate"]) {
  const before = admin.calls.length;
  assert.equal(admin.api[k]("https://x/y.exe", "y.exe"), undefined);
  assert.equal(admin.calls.length, before, `${k} sends no IPC`);
}
const adminSrc = readFileSync(new URL("./adminPreload.cjs", import.meta.url), "utf8");
for (const ch of ["clipboard:read-image", "get-screen-sources", "scan-processes", "download-file", "descall:overlay:show", "descall:overlay:hide", "descall:overlay:update", "check-for-updates", "restart-app"]) {
  assert.ok(!adminSrc.includes(`'${ch}'`), `adminPreload.cjs never sends ${ch}`);
}

// What the admin pages need still goes through, on the same channels as preload.cjs.
const SAME_IPC = [
  ["getVersion"], ["setLocale", "tr"], ["minimizeWindow"], ["maximizeWindow"], ["closeWindow"],
  ["getPrefersReducedTransparency"], ["getContentBox"], ["bootState", "painted", 5], ["retryBoot"],
  ["getUpdateStatus"], ["isWindowFocused"], ["focusWindow"], ["requestNotificationPermission"],
  ["showNotification", "t", { body: "b" }], ["closeNotification", { tag: "x" }], ["setVoiceBusy", true], ["setActivityBusy", false],
];
for (const [k, ...args] of SAME_IPC) {
  full.calls.length = 0;
  admin.calls.length = 0;
  full.api[k](...args);
  admin.api[k](...args);
  assert.equal(JSON.stringify(admin.calls), JSON.stringify(full.calls), `${k} sends the same IPC`);
  assert.ok(admin.calls.length > 0, `${k} reaches main`);
}
for (const k of ["get", "set", "clear"]) {
  full.calls.length = 0;
  admin.calls.length = 0;
  assert.equal(admin.api.secureToken[k]("tok"), full.api.secureToken[k]("tok"), `secureToken.${k} unchanged`);
  assert.equal(JSON.stringify(admin.calls), JSON.stringify(full.calls));
}
assert.equal(admin.api.isElectron, true);
assert.equal(admin.api.platform, "win32");

// Wiring: both admin windows load it, the main window keeps the full bridge, and it ships.
const main = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
assert.match(main, /signupStatsWindowOptions\(\{ preload: path\.join\(__dirname, 'adminPreload\.cjs'\)/);
assert.match(main, /adminPanelWindowOptions\(\{ preload: path\.join\(__dirname, 'adminPreload\.cjs'\)/);
// The main window and the Descall+ feature loader (pop-outs, mini mode, PiP: same app document,
// sender-checked as aux windows) use the full bridge; no admin window does.
assert.equal((main.match(/'preload\.cjs'/g) || []).length, 2, "only the main window and the Descall+ loader use preload.cjs");
assert.match(main, /preloadPath: path\.join\(__dirname, 'preload\.cjs'\)/);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.ok(pkg.build.files.includes("electron/**/*"), "electron/adminPreload.cjs is packaged");

console.log("adminPreload.selftest: ok");
