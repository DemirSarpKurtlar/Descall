const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Expose safe API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app-version'),
  // UI language (LocaleContext, on boot and on change): tray, splash, dialogs, toasts, overlay.
  setLocale: (locale) => ipcRenderer.send('app:locale', String(locale || '').slice(0, 16)),
  // Clipboard image (PNG bytes) for Ctrl+V in the composer
  readClipboardImage: () => ipcRenderer.invoke('clipboard:read-image'),
  // Copy fallback (src/lib/copyText.js): OS clipboard through main. Resolves { ok }.
  writeClipboardText: (text) => (typeof text === 'string'
    ? ipcRenderer.invoke('clipboard:write-text', text)
    : Promise.resolve({ ok: false })),
  // Page zoom (Ctrl + mouse wheel, src/lib/smoothZoom.js): this window's zoom factor.
  zoom: {
    get: () => webFrame.getZoomFactor(),
    set: (factor) => {
      const f = Number(factor);
      if (Number.isFinite(f) && f >= 0.5 && f <= 2) webFrame.setZoomFactor(f);
    },
  },
  
  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  confirmRestartApp: () => ipcRenderer.invoke('restart-app-confirmed'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  // True while a DM call, group call, or server voice channel is up (ringing counts).
  setVoiceBusy: (busy) => ipcRenderer.send('voice:set-busy', Boolean(busy)),
  setActivityBusy: (busy) => ipcRenderer.send('activity:set-busy', Boolean(busy)),
  onConfirmRestart: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update:confirm-restart', handler);
    return () => ipcRenderer.off('update:confirm-restart', handler);
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onMaximizedChange: (callback) => {
    const handler = (_, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.off('window:maximized', handler);
  },
  // 3.7.15: minimized / hidden to tray → the page pauses its animations.
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
  
  // Platform
  platform: process.platform,
  
  // Is electron
  isElectron: true,

  // Main-process errors (electron/mainErrors.cjs), scrubbed of paths: src/lib/sentry.js reports them.
  onMainError: (callback) => {
    const handler = (_, summary) => callback(summary || {});
    ipcRenderer.on('app:main-error', handler);
    return () => ipcRenderer.off('app:main-error', handler);
  },

  // Boot watchdog / "Tekrar dene" (2.11.5): clear SW + caches, reload ignoring cache.
  retryBoot: () => ipcRenderer.send('app:boot-retry'),
  // Boot milestones for main.log and the main-process paint watchdog (2.11.9).
  bootState: (phase, ms) => ipcRenderer.send('app:boot-state', { phase: String(phase || ''), ms: Number(ms) || 0 }),

  // OS transparency switch. The CSS media query is unreliable in Electron
  // (it can stick on "reduce" and flatten Liquid Glass while Chrome stays frosted).
  getPrefersReducedTransparency: () => ipcRenderer.sendSync('native-theme:reduced-transparency'),
  onReducedTransparencyChange: (callback) => {
    const handler = (_, value) => callback(Boolean(value));
    ipcRenderer.on('native-theme:reduced-transparency-changed', handler);
    return () => ipcRenderer.off('native-theme:reduced-transparency-changed', handler);
  },
  
  // Download
  downloadFile: (url, filename) => ipcRenderer.send('download-file', { url, filename }),
  
  // Listen for events from main
  onUpdateAvailable: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.off('update-available', handler);
  },

  onUpdateDownloaded: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.off('update-downloaded', handler);
  },

  // Silent auto-update progress events
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
  
  // Remove listeners
  // Only the two legacy update channels (useElectron.js); page code cannot detach the
  // notification, call or overlay listeners.
  removeAllListeners: (channel) => {
    if (channel === 'update-available' || channel === 'update-downloaded') ipcRenderer.removeAllListeners(channel);
  },
  
  // Notifications
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

  // Desktop screen sharing
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  // Pre-select the in-app picker's source for the next getDisplayMedia call.
  selectDisplaySource: (sourceId) => ipcRenderer.invoke('screen-share:select-source', sourceId),

  // Window focus helpers (used by notificationService)
  isWindowFocused: () => ipcRenderer.invoke('is-window-focused'),
  focusWindow: () => ipcRenderer.invoke('focus-window'),

  // Activity / process scanning
  scanProcesses: () => ipcRenderer.invoke('scan-processes'),


  // Always-on voice mini overlay (Discord-style always-on-top HUD)
  overlayShow: (payload) => ipcRenderer.send('descall:overlay:show', payload || {}),
  overlayHide: () => ipcRenderer.send('descall:overlay:hide'),
  overlayUpdate: (payload) => ipcRenderer.send('descall:overlay:update', payload || {}),
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

// Descall+ (electron/premium/index.cjs): one generic bridge, limited to 'premium:*'
// channels, so feature modules never need a preload change. Main checks the sender and
// the entitlement gate on every call.
const isPremiumChannel = (channel) => typeof channel === 'string' && /^premium:[a-z0-9:_-]{1,64}$/i.test(channel);
contextBridge.exposeInMainWorld('descallPremium', {
  invoke: (channel, ...args) => (isPremiumChannel(channel)
    ? ipcRenderer.invoke(channel, ...args)
    : Promise.reject(new Error('premium channel expected'))),
  on: (channel, fn) => {
    if (!isPremiumChannel(channel) || typeof fn !== 'function') return () => {};
    const handler = (_event, ...args) => fn(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
  },
});

// Log preload loaded
console.log('[Preload] Electron API exposed');
