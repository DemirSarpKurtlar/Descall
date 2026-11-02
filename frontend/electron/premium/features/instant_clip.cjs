'use strict';

const { wrapFeature } = require('../compat.cjs');

/**
 * Instant clip (Ultra), main-process side: capture source list (desktopCapturer), the save
 * hotkey, a save-to-disk dialog and CPU / RAM metrics. The ring buffer itself runs in the
 * main window renderer (getUserMedia desktop source + MediaRecorder segments), only while
 * the user has it turned on.
 */

const { desktopCapturer, app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

let ctx = null;
let hotkey = '';

function metrics() {
  const win = ctx?.getMainWindow();
  let rendererPid = null;
  try { rendererPid = win ? win.webContents.getOSProcessId() : null; } catch (_) { rendererPid = null; }
  const all = app.getAppMetrics();
  const sum = { cpuPercent: 0, workingSetMB: 0, privateMB: 0 };
  let renderer = null;
  for (const m of all) {
    const ws = (m.memory?.workingSetSize || 0) / 1024;
    const pv = (m.memory?.privateBytes || 0) / 1024;
    sum.cpuPercent += m.cpu?.percentCPUUsage || 0;
    sum.workingSetMB += ws;
    sum.privateMB += pv;
    if (m.pid === rendererPid) renderer = { cpuPercent: m.cpu?.percentCPUUsage || 0, workingSetMB: ws, privateMB: pv };
  }
  const r = (x) => Math.round(x * 10) / 10;
  return {
    ok: true,
    at: Date.now(),
    total: { cpuPercent: r(sum.cpuPercent), workingSetMB: r(sum.workingSetMB), privateMB: r(sum.privateMB) },
    renderer: renderer ? { cpuPercent: r(renderer.cpuPercent), workingSetMB: r(renderer.workingSetMB), privateMB: r(renderer.privateMB) } : null,
    processes: all.length,
  };
}

module.exports = wrapFeature({
  key: 'instant_clip',
  start(c) {
    ctx = c;
    ctx.handle('premium:instant_clip:sources', async () => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 240, height: 135 }, fetchWindowIcons: false });
        return {
          ok: true,
          sources: sources.slice(0, 40).map((s) => ({
            id: s.id,
            name: String(s.name || '').slice(0, 80),
            kind: String(s.id).startsWith('screen:') ? 'screen' : 'window',
            thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
          })),
          systemAudio: process.platform === 'win32',
        };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    });
    ctx.handle('premium:instant_clip:hotkey', (_e, accel) => {
      ctx.unregisterHotkeys();
      hotkey = '';
      if (!accel) return { ok: true, hotkey: '' };
      const ok = ctx.registerHotkey(String(accel).slice(0, 40), () => ctx.sendToRenderer('premium:instant_clip:save', { at: Date.now() }));
      hotkey = ok ? String(accel) : '';
      return { ok, hotkey };
    });
    ctx.handle('premium:instant_clip:metrics', () => metrics());
    ctx.handle('premium:instant_clip:save-file', async (_e, name, bytes) => {
      if (!bytes || !bytes.byteLength) return { ok: false };
      const win = ctx.getMainWindow();
      const safe = String(name || 'clip.webm').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'clip.webm';
      const res = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('videos'), safe), filters: [{ name: 'WebM', extensions: ['webm'] }] });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(res.filePath, Buffer.from(bytes));
      return { ok: true };
    });
  },
  stop() {
    hotkey = '';
    ctx = null;
  },
  _metrics: () => metrics(),
});
