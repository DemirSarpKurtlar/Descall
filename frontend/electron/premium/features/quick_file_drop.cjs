'use strict';

const { wrapFeature } = require('../compat.cjs');

/**
 * Quick file drop (Descall+): a small always-on-top drop zone. Files dropped on it are read
 * in the drop window, handed to the main window and sent to the chosen recent chat through
 * the normal upload path (/api/media/upload, same 100 MB server cap). Paths never leave
 * main; only the file name and bytes do.
 */

const kit = require('../overlayKit.cjs');

const ID = 'quickdrop';
const MAX_BYTES = 100 * 1024 * 1024;
let ctx = null;
let state = { labels: {}, targets: [], target: '', status: '', maxBytes: MAX_BYTES };
let trayLabel = '';

function open() {
  kit.open({
    id: ID,
    kind: 'quickdrop',
    bounds: kit.cornerBounds('br', 220, 170, 24),
    clickThrough: false,
    focusable: true,
    opacity: 0.97,
    state,
    onAction: (type, payload) => {
      if (type === 'close') close();
      else if (type === 'pick') state = { ...state, target: String(payload?.target || '') };
      else if (type === 'drop') onDrop(payload);
    },
  });
  return { ok: true, open: true };
}

function close() {
  kit.close(ID);
  return { ok: true, open: false };
}

function onDrop(payload) {
  const target = String(payload?.target || '');
  if (!target || !state.targets.some((t) => t.id === target)) return;
  const files = (Array.isArray(payload?.files) ? payload.files : [])
    .slice(0, 10)
    .filter((f) => f && f.data && f.data.byteLength > 0 && f.data.byteLength <= MAX_BYTES)
    .map((f) => ({ name: String(f.name || 'file').slice(0, 180), type: String(f.type || 'application/octet-stream').slice(0, 120), data: f.data }));
  if (!files.length) return;
  state = { ...state, target };
  ctx?.sendToRenderer('premium:quick_file_drop:files', { target, files });
}

function updateTray() {
  if (!ctx) return;
  ctx.setTrayItems(trayLabel ? [{ label: trayLabel, click: () => (kit.get(ID) ? close() : open()) }] : []);
}

module.exports = wrapFeature({
  key: 'quick_file_drop',
  start(c) {
    ctx = c;
    ctx.handle('premium:quick_file_drop:open', () => open());
    ctx.handle('premium:quick_file_drop:close', () => close());
    ctx.handle('premium:quick_file_drop:state', (_e, next) => {
      const targets = (Array.isArray(next?.targets) ? next.targets : []).slice(0, 12)
        .map((t) => ({ id: String(t.id || '').slice(0, 120), label: String(t.label || '').slice(0, 60) }))
        .filter((t) => t.id);
      state = {
        ...state,
        labels: next?.labels && typeof next.labels === 'object' ? next.labels : state.labels,
        targets,
        target: targets.some((t) => t.id === state.target) ? state.target : targets[0]?.id || '',
        status: '',
        dropStatus: next?.dropStatus == null ? undefined : String(next.dropStatus).slice(0, 80),
        brandRgb: next?.brandRgb || '',
      };
      kit.send(ID, state);
      if (typeof next?.trayLabel === 'string' && next.trayLabel !== trayLabel) {
        trayLabel = next.trayLabel.slice(0, 60);
        updateTray();
      }
      return { ok: true };
    });
    ctx.handle('premium:quick_file_drop:status', () => ({ ok: true, open: Boolean(kit.get(ID)) }));
  },
  stop() {
    close();
    trayLabel = '';
    ctx = null;
  },
});
