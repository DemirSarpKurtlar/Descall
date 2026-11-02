'use strict';

// Bridge for premium HUD / widget / drop windows. Nothing but state in and whitelisted actions out.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const ACTIONS = new Set(['ready', 'drop', 'open', 'close', 'moved', 'pick']);

contextBridge.exposeInMainWorld('descallHud', {
  onState: (cb) => {
    const h = (_e, s) => cb(s || {});
    ipcRenderer.on('premium:hud:state', h);
    return () => ipcRenderer.off('premium:hud:state', h);
  },
  action: (type, payload) => {
    if (!ACTIONS.has(type)) return;
    ipcRenderer.send('premium:hud:action', { type, payload: payload == null ? null : payload });
  },
  // Only used for the quick drop zone: the real path is never sent, just the name.
  fileName: (file) => {
    try { return String(webUtils.getPathForFile(file) || file.name || '').split(/[\\/]/).pop(); } catch (_) { return file && file.name; }
  },
});
