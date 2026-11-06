const { contextBridge, ipcRenderer, webFrame } = require('electron');

/**
 * Preload for the admin windows (Kayıt İstatistikleri, Yönetici Paneli). They boot only the
 * admin pages (main.jsx), which need the window controls, the language, the appearance
 * switch and the session token. They never record the screen, read the clipboard or the
 * process list, download files, drive the call overlay or install updates, so those
 * capabilities are not wired here: the same keys exist (shared app code may probe them)
 * but they answer the "nothing available" value without any IPC.
 *
 * Sandboxed preloads cannot require local files, so this mirrors preload.cjs by hand;
 * adminPreload.selftest.mjs keeps the two key sets identical and checks the stubs.
 */
const noop = () => {};

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app-version'),
  setLocale: (locale) => ipcRenderer.send('app:locale', String(locale || '').slice(0, 16)),
  // Not in the admin windows: no clipboard image (composer paste falls back to the browser).
  readClipboardImage: () => Promise.resolve(null),
  // Page zoom (Ctrl + mouse wheel, src/lib/smoothZoom.js), same as the main window.
  zoom: {
    get: () => webFrame.getZoomFactor(),
    set: (factor) => {
      const f = Number(factor);
      if (Number.isFinite(f) && f >= 0.5 && f <= 2) webFrame.setZoomFactor(f);
    },
  },

  // Updates are driven by the main window only.
  checkForUpdates: () => Promise.resolve({ success: true, skipped: true }),
  restartApp: () => Promise.resolve({ installing: false }),
  confirmRestartApp: () => Promise.resolve({ installing: false }),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  // Main accepts these only from the main window; harmless here.
  setVoiceBusy: (busy) => ipcRenderer.send('voice:set-busy', Boolean(busy)),
  setActivityBusy: (busy) => ipcRenderer.send('activity:set-busy', Boolean(busy)),
  onConfirmRestart: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update:confirm-restart', handler);
    return () => ipcRenderer.off('update:confirm-restart', handler);
  },

  // Window controls (main.cjs controlledWindow() picks this window).
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onMaximizedChange: (callback) => ipcRenderer.on('window:maximized', (_, isMaximized) => callback(isMaximized)),
  onAppVisibility: (callback) => {
    const handler = (_, payload) => callback(payload || {});
    ipcRenderer.on('app:visibility', handler);
    return () => ipcRenderer.removeListener('app:visibility', handler);
  },
  getContentBox: () => ipcRenderer.invoke('window:content-box'),
  onContentBox: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('window:content-box', handler);
    return () => ipcRenderer.off('window:content-box', handler);
  },

  platform: process.platform,
  isElectron: true,

  retryBoot: () => ipcRenderer.send('app:boot-retry'),
  bootState: (phase, ms) => ipcRenderer.send('app:boot-state', { phase: String(phase || ''), ms: Number(ms) || 0 }),

  getPrefersReducedTransparency: () => ipcRenderer.sendSync('native-theme:reduced-transparency'),
  onReducedTransparencyChange: (callback) => {
    const handler = (_, value) => callback(Boolean(value));
    ipcRenderer.on('native-theme:reduced-transparency-changed', handler);
    return () => ipcRenderer.off('native-theme:reduced-transparency-changed', handler);
  },

  // Not in the admin windows: no downloads into the user's folder.
  downloadFile: noop,

  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', callback);
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', callback);
  },
  onUpdateDownloading: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update:downloading', handler);
    return () => ipcRenderer.off('update:downloading', handler);
  },
  onUpdateInstalling: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update:installing', handler);
    return () => ipcRenderer.off('update:installing', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.off('update:progress', handler);
  },
  onUpdateReady: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update:ready', handler);
    return () => ipcRenderer.off('update:ready', handler);
  },
  onUpdateError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.off('update:error', handler);
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  requestNotificationPermission: () => ipcRenderer.invoke('notification:request-permission'),
  showNotification: (title, options) => ipcRenderer.send('notification:show', { title, options }),
  closeNotification: (payload) => ipcRenderer.send('notification:close', payload || {}),
  onNotificationClick: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('notification:click', handler);
    return () => ipcRenderer.off('notification:click', handler);
  },
  onNotificationClicked: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('notification:click', handler);
    return () => ipcRenderer.off('notification:click', handler);
  },
  onCallAccept: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('notification:call-accept', handler);
    return () => ipcRenderer.off('notification:call-accept', handler);
  },
  onCallDecline: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('notification:call-decline', handler);
    return () => ipcRenderer.off('notification:call-decline', handler);
  },

  // Not in the admin windows: no screen capture sources.
  getScreenSources: () => Promise.resolve([]),
  selectDisplaySource: () => Promise.resolve(false),

  isWindowFocused: () => ipcRenderer.invoke('is-window-focused'),
  focusWindow: () => ipcRenderer.invoke('focus-window'),

  // Not in the admin windows: no process list.
  scanProcesses: () => Promise.resolve([]),

  // Not in the admin windows: the call overlay belongs to the main window.
  overlayShow: noop,
  overlayHide: noop,
  overlayUpdate: noop,
  // The admin pages read the session token (API calls, socket). Same as preload.cjs;
  // see AGENTS.md "Electron trust boundary" for the planned follow-up.
  secureToken: {
    get: () => ipcRenderer.sendSync('secure-token:get'),
    set: (token) => ipcRenderer.sendSync('secure-token:set', token),
    clear: () => ipcRenderer.sendSync('secure-token:clear'),
  },

  onOverlayAction: (callback) => {
    const handler = (_, action) => callback(action);
    ipcRenderer.on('descall:overlay:action', handler);
    return () => ipcRenderer.off('descall:overlay:action', handler);
  },
});
