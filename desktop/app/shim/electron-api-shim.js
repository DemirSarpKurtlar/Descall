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

  /** ipcRenderer.on(channel) -> unsubscribe function, like the preload's on* helpers. */
  const on = (event, cb, map = (p) => p) => {
    if (typeof cb !== "function") return noop;
    let un = null;
    let dead = false;
    T.event.listen(event, (e) => {
      try { cb(map(e.payload)); } catch (err) { console.error(err); }
    }).then((u) => { if (dead) u(); else un = u; }).catch(noop);
    return () => { dead = true; if (un) { un(); un = null; } };
  };
  /**
   * window:maximized, plus the state at subscribe time. The shell maximizes a window that was
   * left maximized before the page loads, so that event is gone by the time the title bar
   * subscribes, and its button showed "Maximize" on a maximized window (Electron maximized
   * after the page was up). A real event that arrives first wins over the late answer.
   */
  const onMaximized = (cb) => {
    if (typeof cb !== "function") return noop;
    let seen = false;
    let dead = false;
    const off = on("window:maximized", (v) => { seen = true; cb(v); }, Boolean);
    invoke("plugin:window|is_maximized").then((v) => {
      if (!seen && !dead) cb(Boolean(v));
    }).catch(noop);
    return () => { dead = true; off(); };
  };
  /** Legacy listeners that got (event, info) and are removed with removeAllListeners. */
  const legacy = new Map();
  const onLegacy = (event, cb) => {
    if (typeof cb !== "function") return;
    const off = on(event, (p) => cb({ sender: null }, p));
    if (!legacy.has(event)) legacy.set(event, []);
    legacy.get(event).push(off);
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

  // zoom.get is synchronous (webFrame.getZoomFactor in Electron). WebView2 keeps the zoom of
  // the webview across a reload (boot retry) while this script starts over, so the last value
  // set during this run is mirrored to sessionStorage; a new app start begins at 1 again.
  const ZOOM_KEY = "__descall_zoom";
  let zoomFactor = (() => {
    try { const z = Number(sessionStorage.getItem(ZOOM_KEY)); return Number.isFinite(z) && z >= 0.5 && z <= 2 ? z : 1; } catch (_) { return 1; }
  })();
  let reducedTransparency = Boolean(BOOT.reducedTransparency);
  on("native-theme:reduced-transparency-changed", (v) => { reducedTransparency = Boolean(v); });

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
    readClipboardImage: ADMIN
      ? () => Promise.resolve(null)
      : async () => {
        const buf = await invoke("clipboard_read_image");
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf || []);
        return bytes.length ? bytes : null;
      },
    writeClipboardText: (text) => (typeof text === "string" ? invoke("clipboard_write_text", { text }) : Promise.resolve({ ok: false })),
    zoom: {
      get: () => zoomFactor,
      set: (factor) => {
        const f = Number(factor);
        if (Number.isFinite(f) && f >= 0.5 && f <= 2) {
          zoomFactor = f;
          try { sessionStorage.setItem(ZOOM_KEY, String(f)); } catch (_) { /* ignore */ }
          fire("window_set_zoom", { factor: f });
        }
      },
    },

    checkForUpdates: ADMIN ? () => Promise.resolve({ success: true, skipped: true }) : () => invoke("updates_check"),
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
    onMaximizedChange: (cb) => onMaximized(cb),
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
    onReducedTransparencyChange: (cb) => on("native-theme:reduced-transparency-changed", cb, Boolean),

    downloadFile: ADMIN ? noop : (url, filename) => fire("download_file", { url: String(url || ""), filename: String(filename || "") }),

    onUpdateAvailable: (cb) => onLegacy("update-available", cb),
    onUpdateDownloaded: (cb) => onLegacy("update-downloaded", cb),
    onUpdateDownloading: (cb) => on("update:downloading", cb),
    onUpdateInstalling: (cb) => on("update:installing", cb),
    onUpdateProgress: (cb) => on("update:progress", cb),
    onUpdateReady: (cb) => on("update:ready", cb),
    onUpdateError: (cb) => on("update:error", cb),
    removeAllListeners: (channel) => {
      const offs = legacy.get(String(channel)) || [];
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
        const ns = nativeShare();
        const list = ns ? await ns.getSources() : await invoke("screen_sources").catch(() => []);
        return (Array.isArray(list) ? list : []).map(toElectronSource);
      },
    selectDisplaySource: ADMIN
      ? () => Promise.resolve(false)
      : (sourceId) => {
        const ns = nativeShare();
        if (!ns || typeof sourceId !== "string" || !/^(screen|window):[\w:.-]+$/.test(sourceId)) return Promise.resolve(false);
        return ns.select(sourceId);
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
  // Title bars drag through data-tauri-drag-region (Tauri's drag script). Same walk as that
  // script: a clickable element without the attribute blocks it, "deep" covers the subtree.
  const CLICKABLE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY)$/;
  const ROLES = /^(button|link|menuitem|tab|checkbox|radio|switch|option)$/;
  const inDragRegion = (e) => {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    for (const el of path) {
      if (!el || el.nodeType !== 1 || typeof el.getAttribute !== "function") continue;
      const attr = el.getAttribute("data-tauri-drag-region");
      const clickable = CLICKABLE.test(el.tagName) || ROLES.test(el.getAttribute("role") || "")
        || (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false")
        || (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1");
      if (clickable && attr === null) return false;
      if (attr === null) continue;
      if (attr === "false") return false;
      if (attr === "deep") return true;
      return el === path[0];
    }
    return false;
  };
  window.addEventListener("contextmenu", (e) => {
    // Right-click on a title bar: the Windows window menu, as on Electron's native caption.
    if (!e.defaultPrevented && inDragRegion(e)) fire("window_system_menu");
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
    // F11 maximizes / restores the window, as Electron's windowKeys.cjs did (no fullscreen).
    if (e.key === "F11" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      winCmd("window_toggle_maximize", "toggle_maximize");
    }
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
