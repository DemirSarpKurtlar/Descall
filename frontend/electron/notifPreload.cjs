'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notifAPI', {
  click:   () => ipcRenderer.send('notif:click'),
  close:   () => ipcRenderer.send('notif:close'),
  accept:  () => ipcRenderer.send('notif:accept'),
  decline: () => ipcRenderer.send('notif:decline'),
  pause:   () => ipcRenderer.send('notif:pause'),
  resume:  (remaining) => ipcRenderer.send('notif:resume', remaining),
  // Grouped toast update (same chat tag): { title, body, count }.
  onUpdate: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('notif:update', (_event, payload) => callback(payload));
  },
});
