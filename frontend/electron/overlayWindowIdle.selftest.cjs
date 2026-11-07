// Voice overlay idle teardown: a hidden overlay is destroyed after OVERLAY_IDLE_DESTROY_MS,
// showing it again cancels that, and the next show recreates the window.
// Run: node frontend/electron/overlayWindowIdle.selftest.cjs (electron is stubbed).
'use strict';
const assert = require('assert');
const Module = require('module');
const os = require('os');

const created = [];
class FakeWebContents {
  isLoadingMainFrame() { return false; }
  once() {}
  executeJavaScript() { return Promise.resolve(); }
}
class FakeBrowserWindow {
  constructor() {
    this.visible = false;
    this.destroyed = false;
    this.handlers = {};
    this.webContents = new FakeWebContents();
    created.push(this);
  }
  setVisibleOnAllWorkspaces() {}
  setBackgroundColor() {}
  setHasShadow() {}
  setAlwaysOnTop() {}
  loadFile() { return Promise.resolve(); }
  once(ev, fn) { this.handlers[ev] = fn; }
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  // Electron closes asynchronously: 'closed' fires later.
  close() { setImmediate(() => { this.destroyed = true; this.handlers.closed?.(); }); }
  static getAllWindows() { return created.filter((w) => !w.destroyed); }
}
const fakeElectron = {
  BrowserWindow: FakeBrowserWindow,
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
  ipcMain: { on() {} },
  app: { getPath: () => os.tmpdir(), getLocale: () => 'en', getPreferredSystemLanguages: () => ['en'] },
};
const origLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, ...rest);
};

// Manual timers so the 60 s delay runs instantly.
const timers = new Map();
let nextId = 1;
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => {
  const id = nextId++;
  timers.set(id, { fn, ms });
  return { id, unref() {} };
};
global.clearTimeout = (t) => { if (t && typeof t === 'object') timers.delete(t.id); };
const runTimers = () => {
  const due = [...timers.entries()];
  timers.clear();
  for (const [, t] of due) t.fn();
  return due;
};

const ov = require('./overlayWindow.cjs');
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  assert.strictEqual(ov.OVERLAY_IDLE_DESTROY_MS, 60_000);

  // Show, hide: one idle timer of 60 s; it destroys the hidden window.
  ov.showOverlayWindow({ title: 'Call' });
  assert.strictEqual(created.length, 1);
  assert.strictEqual(ov.isOverlayWindowVisible(), true);
  ov.hideOverlayWindow();
  assert.strictEqual(timers.size, 1, 'hide schedules the idle teardown');
  assert.strictEqual([...timers.values()][0].ms, 60_000);
  runTimers();
  await tick();
  assert.strictEqual(created[0].destroyed, true, 'hidden overlay destroyed after the idle delay');

  // Next show recreates it.
  ov.showOverlayWindow({ title: 'Call 2' });
  assert.strictEqual(created.length, 2, 'ensureOverlayWindow recreates the window');
  assert.strictEqual(ov.isOverlayWindowVisible(), true);

  // Hide then show again before the delay: timer cancelled, same window kept.
  ov.hideOverlayWindow();
  assert.strictEqual(timers.size, 1);
  ov.showOverlayWindow({ title: 'Call 3' });
  assert.strictEqual(timers.size, 0, 'showing again cancels the idle teardown');
  assert.strictEqual(created.length, 2);
  assert.strictEqual(created[1].destroyed, false);

  // Window closed by the timer, then a new one created before 'closed' fires:
  // the old window's close handler must not clear the new one.
  ov.hideOverlayWindow();
  runTimers();
  ov.showOverlayWindow({ title: 'Call 4' });
  assert.strictEqual(created.length, 3);
  await tick();
  assert.strictEqual(created[1].destroyed, true);
  assert.strictEqual(ov.isOverlayWindowVisible(), true, 'new overlay survives the old one closing');

  // destroyOverlayWindow clears a pending idle timer.
  ov.hideOverlayWindow();
  assert.strictEqual(timers.size, 1);
  ov.destroyOverlayWindow();
  assert.strictEqual(timers.size, 0);
  await tick();

  global.setTimeout = realSetTimeout;
  console.log('overlayWindowIdle.selftest.cjs: ok');
})().catch((e) => { console.error(e); process.exit(1); });
