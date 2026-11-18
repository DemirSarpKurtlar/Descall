/*
 * window.electronAPI on Tauri 2 (injected with initialization_script, before any page script).
 * Same names and shapes as frontend/electron/preload.cjs, so frontend/src stays unchanged.
 * Sync methods of the old preload (ipcRenderer.sendSync) are answered from
 * window.__DESCALL_BOOT__ (built by src-tauri/src/boot.rs per page load) plus an in-memory cache.
 */
(() => {
  "use strict";
  if (window.top !== window) return; // main frame only (iframes never get the bridge)
  const T = window.__TAURI__;
  const BOOT = window.__DESCALL_BOOT__ || {};
  if (!T || !T.core) return;
  const invoke = (cmd, args) => T.core.invoke(cmd, args);
  const fire = (cmd, args) => { invoke(cmd, args).catch(() => {}); };
  /** ipcRenderer.on(channel) -> unsubscribe function, same as the preload's `on*` helpers. */
  const on = (event, cb, map = (p) => p) => {
    let un = null; let dead = false;
    T.event.listen(event, (e) => { try { cb(map(e.payload)); } catch (err) { console.error(err); } })
      .then((u) => { if (dead) u(); else un = u; });
    return () => { dead = true; if (un) un(); };
  };

  // One-time Electron import of localStorage (descall://app -> https://tauri.localhost).
  try {
    const imp = BOOT.importLocalStorage;
    if (imp && !localStorage.getItem("__descall_import_v1")) {
      for (const [k, v] of Object.entries(imp)) localStorage.setItem(k, v);
      localStorage.setItem("__descall_import_v1", String(Date.now()));
    }
  } catch (_) { /* storage disabled */ }

  // secureToken: sync get from the boot snapshot; a set/clear during this run wins and is
  // mirrored to sessionStorage so a reload (boot retry) sees it before the next app start.
  const TOKEN_OVERRIDE = "__descall_token_override";
  let tokenCache = (() => {
    try { const o = sessionStorage.getItem(TOKEN_OVERRIDE); if (o !== null) return o || null; } catch (_) {}
    return BOOT.token || null;
  })();
  const remember = (v) => { tokenCache = v || null; try { sessionStorage.setItem(TOKEN_OVERRIDE, v || ""); } catch (_) {} };

  let zoomFactor = 1;
  let reducedTransparency = Boolean(BOOT.reducedTransparency);

  const api = {
    getVersion: () => Promise.resolve(BOOT.version || invoke("app_version")),
    setLocale: (locale) => fire("app_set_locale", { locale: String(locale || "").slice(0, 16) }),
    readClipboardImage: async () => {
      const buf = await invoke("clipboard_read_image");
      const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf || []);
      return bytes.length ? bytes : null;
    },
    writeClipboardText: (text) => (typeof text === "string" ? invoke("clipboard_write_text", { text }) : Promise.resolve({ ok: false })),
    zoom: {
      get: () => zoomFactor,
      set: (factor) => {
        const f = Number(factor);
        if (Number.isFinite(f) && f >= 0.5 && f <= 2) { zoomFactor = f; fire("window_set_zoom", { factor: f }); }
      },
    },

    checkForUpdates: () => invoke("updates_check"),
    // restart-app: in a call the shell answers with update:confirm-restart instead (the page
    // asks the user); restart-app-confirmed is the only mid-call install (updateDeferral.cjs).
    restartApp: () => invoke("updates_restart", { confirmed: false }),
    confirmRestartApp: () => invoke("updates_restart", { confirmed: true }),
    getUpdateStatus: () => invoke("updates_status"),
    setVoiceBusy: (busy) => fire("voice_set_busy", { busy: Boolean(busy) }),
    setActivityBusy: (busy) => fire("activity_set_busy", { busy: Boolean(busy) }),
    onConfirmRestart: (cb) => on("update:confirm-restart", cb),

    minimizeWindow: () => fire("window_minimize"),
    maximizeWindow: () => fire("window_toggle_maximize"),
    closeWindow: () => fire("window_close"),
    onMaximizedChange: (cb) => on("window:maximized", cb, Boolean),
    onAppVisibility: (cb) => on("app:visibility", cb, (p) => p || {}),
    getContentBox: () => invoke("window_content_box"),
    onContentBox: (cb) => on("window:content-box", cb),

    platform: BOOT.platform || "win32",
    isElectron: true, // the page's desktop branches key on this; isTauri tells them apart
    isTauri: true,

    onMainError: (cb) => on("app:main-error", cb, (p) => p || {}),
    retryBoot: () => fire("app_boot_retry"),
    bootState: (phase, ms) => fire("app_boot_state", { phase: String(phase || ""), ms: Number(ms) || 0 }),

    getPrefersReducedTransparency: () => reducedTransparency,
    onReducedTransparencyChange: (cb) => on("native-theme:reduced-transparency-changed", (v) => { reducedTransparency = Boolean(v); cb(reducedTransparency); }),

    downloadFile: (url, filename) => fire("download_file", { url, filename }),

    onUpdateAvailable: (cb) => on("update-available", cb),
    onUpdateDownloaded: (cb) => on("update-downloaded", cb),
    onUpdateDownloading: (cb) => on("update:downloading", cb),
    onUpdateInstalling: (cb) => on("update:installing", cb),
    onUpdateProgress: (cb) => on("update:progress", cb),
    onUpdateReady: (cb) => on("update:ready", cb),
    onUpdateError: (cb) => on("update:error", cb),
    removeAllListeners: () => { /* legacy update channels only; listeners above return their own unsubscribe */ },

    requestNotificationPermission: () => Promise.resolve(true),
    showNotification: (title, options) => fire("notification_show", { payload: { title, options } }),
    closeNotification: (payload) => fire("notification_close", { payload: payload || {} }),
    onNotificationClick: (cb) => on("notification:click", cb),
    onNotificationClicked: (cb) => on("notification:click", cb),
    onCallAccept: (cb) => on("notification:call-accept", cb),
    onCallDecline: (cb) => on("notification:call-decline", cb),

    // Screen share: the native lane (native-screen-share.js) owns these two.
    getScreenSources: () => window.__descallNativeShare.getSources(),
    selectDisplaySource: (sourceId) => window.__descallNativeShare.select(sourceId),

    isWindowFocused: () => invoke("window_is_focused"),
    focusWindow: () => invoke("window_focus"),
    scanProcesses: () => invoke("processes_scan"),

    overlayShow: (payload) => fire("overlay_show", { payload: payload || {} }),
    overlayHide: () => fire("overlay_hide"),
    overlayUpdate: (payload) => fire("overlay_update", { payload: payload || {} }),
    secureToken: {
      get: () => tokenCache,
      set: (token) => { const v = String(token || ""); remember(v); fire(v ? "token_set" : "token_clear", v ? { token: v } : undefined); return true; },
      clear: () => { remember(""); fire("token_clear"); return true; },
    },
    onOverlayAction: (cb) => on("descall:overlay:action", cb),
  };

  Object.defineProperty(window, "electronAPI", { value: Object.freeze(api), writable: false, configurable: false });
  // window.descallPremium comes from premium-shim.js (injected by the premium plugin).

  // External links: the Rust on_navigation guard refuses non-app URLs; open them in the
  // default browser instead (Electron setWindowOpenHandler + shell.openExternal).
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.host !== location.host && /^https?:$/.test(url.protocol)) {
      e.preventDefault();
      T.core.invoke("plugin:opener|open_url", { url: url.href }).catch(() => window.open(url.href, "_blank"));
    }
  }, true);
})();
