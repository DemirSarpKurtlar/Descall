'use strict';

// Quick launcher window bridge (electron/premium/features/quick_launcher.cjs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  strings: () => ipcRenderer.invoke('premium:launcher:strings'),
  query: (q) => ipcRenderer.invoke('premium:launcher:query', String(q || '').slice(0, 120)),
  run: (item) => ipcRenderer.invoke('premium:launcher:run', {
    id: String(item?.id || '').slice(0, 200),
    focus: Boolean(item?.focus),
  }),
  close: () => ipcRenderer.invoke('premium:launcher:close'),
  onReset: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('premium:launcher:reset', (_event, strings) => callback(strings || {}));
  },
});
