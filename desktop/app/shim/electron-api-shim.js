/*
 * window.electronAPI on Tauri 2 (window.descallPremium: premium-shim.js), injected with
 * initialization_script before any page script. Same names, shapes and return values as
 * frontend/electron/preload.cjs (main window) and adminPreload.cjs (admin windows, mode
 * "admin"), so frontend/src runs unchanged. electron-api-shim.test.mjs checks both key sets
 * against the Electron preloads and every mapping below.
 *
 * Sync members of the old preload (ipcRenderer.sendSync) are answered from
 * window.__DESCALL_BOOT__ (built per page load by src-tauri/src/boot.rs) plus local caches.
 *
 *  electronAPI member                Electron channel                   Tauri
 *  getVersion                        invoke app-version                 boot value / app_version
 *  setLocale                         send app:locale                    app_set_locale
 *  readClipboardImage                invoke clipboard:read-image        clipboard_read_image (raw PNG)
 *  writeClipboardText                invoke clipboard:write-text        clipboard_write_text
 *  zoom.get / zoom.set               webFrame                           cache / window_set_zoom
 *  checkForUpdates                   invoke check-for-updates           updates_check
 *  restartApp / confirmRestartApp    invoke restart-app(-confirmed)     updates_restart {confirmed}
 *  getUpdateStatus                   invoke get-update-status           updates_status
 *  setVoiceBusy / setActivityBusy    send voice:/activity:set-busy      voice_set_busy / activity_set_busy
 *  minimize/maximize/closeWindow     send window:*                      window_minimize / _toggle_maximize / _close
 *  getContentBox                     invoke window:content-box          window_content_box
 *  retryBoot / bootState             send app:boot-retry / -state       app_boot_retry / app_boot_state
 *  getPrefersReducedTransparency     sendSync                           boot value + change events
 *  downloadFile                      send download-file                 download_file
 *  showNotification / close          send notification:show / close     notification_show / notification_close
 *  getScreenSources / selectDisplay  invoke get-screen-sources / select native-screen-share.js (screen_sources)
 *  isWindowFocused / focusWindow     invoke                             window_is_focused / window_focus
 *  scanProcesses                     invoke scan-processes              processes_scan
 *  overlayShow / Hide / Update       send descall:overlay:*             overlay_show / overlay_hide / overlay_update
 *  setTrayState                      send tray:set-state                tray_set_state
 *  secureToken.get / set / clear     sendSync secure-token:*            boot snapshot + cache / token_set / token_clear
 *  on* listeners                     ipcRenderer.on(channel)            event.listen(same channel name)
 */
(() => {
  "use strict";
  if (window.top !== window) return; // main frame only (iframes never get the bridge)
  const T = window.__TAURI__;
  const BOOT = window.__DESCALL_BOOT__ || {};
  if (!T || !T.core || !T.event) return;
  const ADMIN = BOOT.mode === "admin";
  const invoke = (cmd, args) => T.core.invoke(cmd, args);
  const fire = (cmd, args) => { invoke(cmd, args).catch(() => {}); };
  const noop = () => {};
  const winCmd = (cmd, core) => {
    invoke(cmd).catch((err) => {
      console.warn(`[shell] ${cmd} failed, using plugin:window|${core}`, err);
      invoke(`plugin:window|${core}`).catch(noop);
    });
  };

  // Tauri's global event.listen() hears an event emitted to ANY window: emit_to("main", ...)
  // also reached the Descall+ pop-out and extra-account windows (they run this shim too), so a
  // notification click or a call accept ran there as well, and the main window's maximize,
  // content box and visibility leaked into them. ipcRenderer.on only ever heard its own
  // webContents: listen for events sent to this window only.
  const META = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.metadata;
  const LABEL = String((META && META.currentWebview && META.currentWebview.label) || "");
  const OWN = LABEL ? { target: { kind: "WebviewWindow", label: LABEL } } : undefined;

  /** ipcRenderer.on(channel) -> unsubscribe function, like the preload's on* helpers. */
  const on = (event, cb, map = (p) => p) => {
    if (typeof cb !== "function") return noop;
    let un = null;
    let dead = false;
    T.event.listen(event, (e) => {
      try { cb(map(e.payload)); } catch (err) { console.error(err); }
    }, OWN).then((u) => { if (dead) u(); else un = u; }).catch(noop);
    return () => { dead = true; if (un) { un(); un = null; } };
  };
  /**
   * The two legacy update channels (useElectron.js): callback(data) and an unsubscribe
   * function like every other on* member of preload.cjs, plus removeAllListeners(channel).
   */
  const legacy = new Map();
  const onLegacy = (event, cb) => {
    if (typeof cb !== "function") return noop;
    const off = on(event, cb);
    if (!legacy.has(event)) legacy.set(event, new Set());
    legacy.get(event).add(off);
    return () => { off(); const set = legacy.get(event); if (set) set.delete(off); };
  };

  // One-time Electron import of localStorage (descall://app -> https://tauri.localhost).
  try {
    const imp = BOOT.importLocalStorage;
    if (imp && !localStorage.getItem("__descall_import_v1")) {
      for (const [k, v] of Object.entries(imp)) localStorage.setItem(k, v);
      localStorage.setItem("__descall_import_v1", String(Date.now()));
    }
  } catch (_) { /* storage disabled */ }

  // secureToken: get() is synchronous for the page. The boot snapshot answers it; a set or
  // clear during this run wins and is mirrored to sessionStorage, so a reload (boot retry)
  // sees it before the next app start writes a new snapshot.
  const TOKEN_OVERRIDE = "__descall_token_override";
  let tokenCache = (() => {
    try { const o = sessionStorage.getItem(TOKEN_OVERRIDE); if (o !== null) return o || null; } catch (_) { /* ignore */ }
    return BOOT.token || null;
  })();
  const remember = (v) => { tokenCache = v || null; try { sessionStorage.setItem(TOKEN_OVERRIDE, v || ""); } catch (_) { /* ignore */ } };
  // Electron read the token file on every get(): a sign-in or sign-out in another owner window
  // (admin, pop-out) was seen at once. The shell sends the new value to every owner window
  // (commands/system.rs publish_token); extra-account windows never get the owner's.
  on("secure-token:changed", (p) => { remember(p && typeof p.token === "string" ? p.token : ""); });

  // zoom.get() is synchronous (webFrame.getZoomFactor). WebView2 keeps the controller's zoom
  // across a reload (boot retry) while this script starts again at 1, so the factor last set is
  // kept in sessionStorage and re-applied: get() and the real zoom agree after a reload too.
  const ZOOM_KEY = "__descall_zoom";
  const okZoom = (f) => Number.isFinite(f) && f >= 0.5 && f <= 2;
  let zoomFactor = (() => {
    try { const z = Number(sessionStorage.getItem(ZOOM_KEY)); if (okZoom(z)) return z; } catch (_) { /* ignore */ }
    return 1;
  })();
  if (zoomFactor !== 1) fire("window_set_zoom", { factor: zoomFactor });

  // getPrefersReducedTransparency() is synchronous (sendSync). The boot snapshot is written
  // once per window, so after a reload it can be stale: ask the shell once at start and tell
  // the page's listeners when the answer differs, as the change event would have.
  let reducedTransparency = Boolean(BOOT.reducedTransparency);
  const transparencyListeners = new Set();
  const setReducedTransparency = (v) => {
    const next = Boolean(v);
    if (next === reducedTransparency) return;
    reducedTransparency = next;
    transparencyListeners.forEach((cb) => { try { cb(next); } catch (err) { console.error(err); } });
  };
  on("native-theme:reduced-transparency-changed", setReducedTransparency);
  invoke("app_reduced_transparency").then((v) => { if (typeof v === "boolean") setReducedTransparency(v); }, noop);

  const nativeShare = () => window.__descallNativeShare || null;
  const toElectronSource = (s) => ({
    id: s.id,
    name: s.name,
    thumbnailDataURL: s.thumbnailDataURL || s.thumbnailDataUrl || "",
    appIconDataURL: s.appIconDataURL || s.appIconDataUrl || null,
  });

  const api = {
    getVersion: () => (BOOT.version ? Promise.resolve(BOOT.version) : invoke("app_version")),
    setLocale: (locale) => fire("app_set_locale", { locale: String(locale || "").slice(0, 16) }),
    // PNG bytes or null; never rejects (clipboardImage.cjs returns null on any failure).
    readClipboardImage: ADMIN
      ? () => Promise.resolve(null)
      : async () => {
        try {
          const buf = await invoke("clipboard_read_image");
          const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(Array.isArray(buf) ? buf : []);
          return bytes.length ? bytes : null;
        } catch (_) {
          return null;
        }
      },
    // Resolves { ok } and never rejects (clipboardText.cjs).
    writeClipboardText: (text) => (typeof text === "string"
      ? invoke("clipboard_write_text", { text }).then((r) => (r && typeof r === "object" ? r : { ok: Boolean(r) }), () => ({ ok: false }))
      : Promise.resolve({ ok: false })),
    zoom: {
      get: () => zoomFactor,
      set: (factor) => {
        const f = Number(factor);
        if (!okZoom(f)) return;
        zoomFactor = f;
        try { sessionStorage.setItem(ZOOM_KEY, String(f)); } catch (_) { /* ignore */ }
        fire("window_set_zoom", { factor: f });
      },
    },

    checkForUpdates: ADMIN
      ? () => Promise.resolve({ success: true, skipped: true })
      : () => invoke("updates_check").catch((err) => ({ success: false, error: String((err && err.message) || err || "") })),
    // restart-app: in a call the shell answers needsConfirm and sends update:confirm-restart;
    // restart-app-confirmed is the only mid-call install (updateDeferral rules).
    restartApp: ADMIN ? () => Promise.resolve({ installing: false }) : () => invoke("updates_restart", { confirmed: false }),
    confirmRestartApp: ADMIN ? () => Promise.resolve({ installing: false }) : () => invoke("updates_restart", { confirmed: true }),
    getUpdateStatus: () => invoke("updates_status"),
    setVoiceBusy: (busy) => fire("voice_set_busy", { busy: Boolean(busy) }),
    setActivityBusy: (busy) => fire("activity_set_busy", { busy: Boolean(busy) }),
    onConfirmRestart: (cb) => on("update:confirm-restart", cb),

    // Shell command first, Tauri's own window command (capabilities/default.json) if it fails,
    // so the title bar buttons never stay dead (owner report, desktop-v4.0.1).
    minimizeWindow: () => winCmd("window_minimize", "minimize"),
    maximizeWindow: () => winCmd("window_toggle_maximize", "toggle_maximize"),
    closeWindow: () => winCmd("window_close", "close"),
    onMaximizedChange: (cb) => on("window:maximized", cb, Boolean),
    onAppVisibility: (cb) => on("app:visibility", cb, (p) => p || {}),
    // Main-process errors (preload onMainError); admin windows get a no-op like adminPreload.
    onMainError: ADMIN ? () => noop : (cb) => on("app:main-error", cb, (p) => p || {}),
    getContentBox: () => invoke("window_content_box"),
    onContentBox: (cb) => on("window:content-box", cb),

    platform: BOOT.platform || "win32",
    isElectron: true, // the page's desktop branches key on this

    retryBoot: () => fire("app_boot_retry"),
    bootState: (phase, ms) => fire("app_boot_state", { phase: String(phase || ""), ms: Number(ms) || 0 }),

    getPrefersReducedTransparency: () => reducedTransparency,
    onReducedTransparencyChange: (cb) => {
      if (typeof cb !== "function") return noop;
      transparencyListeners.add(cb);
      return () => { transparencyListeners.delete(cb); };
    },

    downloadFile: ADMIN ? noop : (url, filename) => fire("download_file", { url: String(url || ""), filename: String(filename || "") }),

    onUpdateAvailable: (cb) => onLegacy("update-available", cb),
    onUpdateDownloaded: (cb) => onLegacy("update-downloaded", cb),
    onUpdateDownloading: (cb) => on("update:downloading", cb),
    onUpdateInstalling: (cb) => on("update:installing", cb),
    onUpdateProgress: (cb) => on("update:progress", cb),
    onUpdateReady: (cb) => on("update:ready", cb),
    onUpdateError: (cb) => on("update:error", cb),
    removeAllListeners: (channel) => {
      const offs = [...(legacy.get(String(channel)) || [])];
      legacy.delete(String(channel));
      offs.forEach((off) => off());
    },

    requestNotificationPermission: () => Promise.resolve(true),
    showNotification: (title, options) => fire("notification_show", { payload: { title: String(title ?? ""), options: options || {} } }),
    closeNotification: (payload) => fire("notification_close", { payload: payload || {} }),
    onNotificationClick: (cb) => on("notification:click", cb),
    onNotificationClicked: (cb) => on("notification:click", cb),
    onCallAccept: (cb) => on("notification:call-accept", cb),
    onCallDecline: (cb) => on("notification:call-decline", cb),

    // Screen share: the native lane (native-screen-share.js) owns these two.
    getScreenSources: ADMIN
      ? () => Promise.resolve([])
      : async () => {
        // main.cjs answers [] on any capture error; the picker never sees a rejection.
        try {
          const ns = nativeShare();
          const list = ns ? await ns.getSources() : await invoke("screen_sources");
          return (Array.isArray(list) ? list : []).filter((s) => s && typeof s.id === "string").map(toElectronSource);
        } catch (_) {
          return [];
        }
      },
    selectDisplaySource: ADMIN
      ? () => Promise.resolve(false)
      : (sourceId) => {
        const ns = nativeShare();
        if (!ns || typeof sourceId !== "string" || !/^(screen|window):[\w:.-]+$/.test(sourceId)) return Promise.resolve(false);
        return Promise.resolve().then(() => ns.select(sourceId)).then(Boolean, () => false);
      },

    isWindowFocused: () => invoke("window_is_focused"),
    focusWindow: () => invoke("window_focus"),
    scanProcesses: ADMIN ? () => Promise.resolve([]) : () => invoke("processes_scan"),

    overlayShow: ADMIN ? noop : (payload) => fire("overlay_show", { payload: payload || {} }),
    overlayHide: ADMIN ? noop : () => fire("overlay_hide"),
    overlayUpdate: ADMIN ? noop : (payload) => fire("overlay_update", { payload: payload || {} }),
    secureToken: {
      get: () => tokenCache,
      set: (token) => { const v = String(token || ""); remember(v); fire(v ? "token_set" : "token_clear", v ? { token: v } : undefined); return true; },
      clear: () => { remember(""); fire("token_clear"); return true; },
    },
    onOverlayAction: (cb) => on("descall:overlay:action", cb),

    // Tray panel (draft B, src/lib/desktopTray.js); admin windows get a no-op like adminPreload.
    setTrayState: ADMIN ? noop : (state) => fire("tray_set_state", { state: state && typeof state === "object" ? state : {} }),
    onTrayAction: ADMIN ? () => noop : (cb) => on("tray:action", cb, (p) => p || {}),
  };

  // Shell-only extras the Electron preload did not have (the page probes them optionally).
  const extras = {
    isTauri: true,
  };
  for (const [k, v] of Object.entries(extras)) Object.defineProperty(api, k, { value: v, enumerable: false });

  Object.defineProperty(window, "electronAPI", { value: Object.freeze(api), writable: false, configurable: false });
  // window.descallPremium comes from premium-shim.js (the premium plugin's init script, which
  // runs before this one and skips admin windows).

  // Electron never showed a browser menu and had no browser shortcuts. WebView2 has both
  // (Back, Reload, Save as, Print, More tools). The shell also turns them off natively
  // (src-tauri/src/webview.rs); this is the page-side net. Bubble phase on window: the app's own
  // menus (they preventDefault in their handlers) run first; editable fields keep cut/copy/paste.
  const isEditable = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const tag = n.tagName;
      if (tag === "TEXTAREA") return !n.disabled;
      if (tag === "INPUT") return !n.disabled && !/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test(n.type || "");
      if (n.isContentEditable) return true;
    }
    return false;
  };
  window.addEventListener("contextmenu", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  const blockedKey = (e) => {
    const k = String(e.key || "");
    const ctrl = e.ctrlKey || e.metaKey;
    if (k === "F5" || k === "BrowserBack" || k === "BrowserForward" || k === "BrowserRefresh" || k === "BrowserHome") return true;
    if (e.altKey && !ctrl && (k === "ArrowLeft" || k === "ArrowRight" || k === "Home")) return true;
    if (ctrl && /^[rpsuoj]$/i.test(k) && !e.altKey) return true; // reload, print, save, source, open, downloads
    if (ctrl && e.shiftKey && /^[ijc]$/i.test(k)) return true; // devtools
    if (k === "F12" || k === "F3" || k === "F7") return true;
    return false;
  };
  window.addEventListener("keydown", (e) => {
    if (blockedKey(e)) e.preventDefault();
  }, true);
  // Mouse back / forward buttons navigate history in WebView2.
  const blockNavButtons = (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
  window.addEventListener("mouseup", blockNavButtons, true);
  window.addEventListener("mousedown", blockNavButtons, true);
  window.addEventListener("auxclick", blockNavButtons, true);
  const markTauri = () => { if (document.documentElement) document.documentElement.classList.add("tauri-app"); };
  markTauri();
  document.addEventListener("DOMContentLoaded", markTauri);

  // External links: the Rust navigation guard refuses non-app URLs; open http(s) and mailto
  // in the default browser instead (Electron setWindowOpenHandler + shell.openExternal).
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || e.defaultPrevented) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    const external = url.origin !== location.origin && (/^https?:$/.test(url.protocol) || url.protocol === "mailto:");
    if (external) {
      e.preventDefault();
      invoke("plugin:opener|open_url", { url: url.href }).catch(noop);
    }
  }, true);
})();
