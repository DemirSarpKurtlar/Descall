'use strict';

/**
 * Preload of the tray panel window (trayMenuWindow.cjs). The page gets exactly three calls;
 * main checks the sender and every action against trayMenuModel.cjs ACTIONS.
 * Sandboxed: requires nothing but electron.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayMenuAPI', {
  getState: () => ipcRenderer.invoke('tray-menu:get-state'),
  onState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('tray-menu:state', handler);
    return () => ipcRenderer.removeListener('tray-menu:state', handler);
  },
  act: (action, arg) => ipcRenderer.send('tray-menu:act', {
    action: String(action || '').slice(0, 32),
    arg: arg === undefined ? null : arg,
  }),
});
