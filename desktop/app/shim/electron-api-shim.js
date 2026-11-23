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
  // The boot script carries it on the import start only, for the whole life of the window: the
  // marker keeps a reload from writing it over settings changed since. The marker names the
  // import (BOOT.importId): a later migration (after a rollback the user went on in Electron)
  // imports again and must not be skipped because an earlier one already ran in this profile.
  try {
    const imp = BOOT.importLocalStorage;
    const IMPORT_KEY = "__descall_import_v1";
    const id = typeof BOOT.importId === "string" && BOOT.importId ? BOOT.importId : "";
    const prev = imp ? localStorage.getItem(IMPORT_KEY) : null;
    if (imp && (id ? prev !== id : prev === null)) {
      for (const [k, v] of Object.entries(imp)) localStorage.setItem(k, v);
      localStorage.setItem(IMPORT_KEY, id || String(Date.now()));
    }
  } catch (_) { /* storage disabled */ }

  // secureToken: get() is synchronous for the page. The boot snapshot answers it; a set or
  // clear during this run wins and is mirrored to sessionStorage, so a reload (boot retry)
  // sees it before the next app start writes a new snapshot.
  const TOKEN_OVERRIDE = "__descall_token_override";
  /** storage.js / secureToken.js SECURE_TOKEN_KEY: the page's own fallback copy. */
  const LOCAL_TOKEN_KEY = "descall_token";
  let tokenCache = (() => {
    try { const o = sessionStorage.getItem(TOKEN_OVERRIDE); if (o !== null) return o || null; } catch (_) { /* ignore */ }
    return BOOT.token || null;
  })();
  const remember = (v) => { tokenCache = v || null; try { sessionStorage.setItem(TOKEN_OVERRIDE, v || ""); } catch (_) { /* ignore */ } };
  // The sign-in token and the imported settings stay in this closure: window.__DESCALL_BOOT__
  // keeps the other values only, so the token is not readable from window (for any page
  // script, after a sign-out, until the next start). Electron's preload never put it on window.
  if ("token" in BOOT || "importLocalStorage" in BOOT) {
    const rest = {};
    for (const [k, v] of Object.entries(BOOT)) if (k !== "token" && k !== "importLocalStorage" && k !== "importId") rest[k] = v;
    try { Object.defineProperty(window, "__DESCALL_BOOT__", { value: Object.freeze(rest), writable: false, configurable: false, enumerable: false }); } catch (_) { /* not configurable */ }
  }
  // Signed out: the Descall+ desktop features (global hotkeys, push-to-talk input, tray
  // entries) stop at once, as Electron main resets its gate on secure-token:clear. The page
  // keeps its plan in memory and only pushes it again on the next sign-in.
  const premiumSignedOut = () => {
    try {
      const p = window.descallPremium;
      if (p && typeof p.invoke === "function") p.invoke("premium:entitlements", { keys: [], plan: null, token: "" }).catch(() => {});
    } catch (_) { /* ignore */ }
  };

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

  // Quit (tray Quit): Electron's app.quit() closed the window, so the page ran its pagehide /
  // beforeunload handlers (unsent draft saved, voice channel left at once, app time flushed).
  // app.exit() tears WebView2 down without them; the shell sends app:will-quit to the main
  // window and waits a moment before it exits (state::exit_after_unload).
  let willQuit = false;
  if (LABEL === "main") {
    on("app:will-quit", () => {
      if (willQuit) return;
      willQuit = true;
      let hide;
      try { hide = new PageTransitionEvent("pagehide", { persisted: false }); } catch (_) { hide = new Event("pagehide"); }
      try { window.dispatchEvent(hide); } catch (err) { console.error(err); }
      try { window.dispatchEvent(new Event("beforeunload")); } catch (err) { console.error(err); }
    });
  }

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

    // Screen share: the native lane (native-screen-share.js) owns these two. Without a usable
    // native lane (no WebView2 shared buffers) the list is empty, so webrtcScreenShare.js goes
    // straight to getDisplayMedia: one picker (WebView2's), not ours and then WebView2's with
    // the first choice ignored.
    getScreenSources: ADMIN
      ? () => Promise.resolve([])
      : async () => {
        // main.cjs answers [] on any capture error; the picker never sees a rejection. Without
        // the native lane the page uses getDisplayMedia's own picker (one picker, T7 L4).
        try {
          const ns = nativeShare();
          if (!ns || ns.supported === false) return [];
          const list = await ns.getSources();
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
      // true / false like the sendSync reply; a token the store refuses (over 16 KB,
      // commands/system.rs) is not cached either.
      set: (token) => {
        const v = String(token || "");
        if (v.length > 16 * 1024) return false;
        remember(v);
        if (!v) {
          fire("token_clear");
          premiumSignedOut();
          return true;
        }
        // Electron answered false when safeStorage could not write the file, and storage.js
        // then kept the token in localStorage. The answer is async here: when the store
        // refuses it (DPAPI / disk error), keep the same localStorage copy, or the session
        // would be gone at the next start. storage.js moves it back into the store then.
        const keepLocal = () => {
          if (LABEL !== "main" || tokenCache !== v) return;
          try { localStorage.setItem(LOCAL_TOKEN_KEY, v); } catch (_) { /* storage disabled */ }
        };
        invoke("token_set", { token: v }).then((ok) => { if (ok === false) keepLocal(); }, keepLocal);
        return true;
      },
      clear: () => { remember(""); fire("token_clear"); premiumSignedOut(); return true; },
    },
    onOverlayAction: (cb) => on("descall:overlay:action", cb),

    // Tray panel (draft B, src/lib/desktopTray.js); admin windows get a no-op like adminPreload.
    setTrayState: ADMIN ? noop : (state) => fire("tray_set_state", { state: state && typeof state === "object" ? state : {} }),
    onTrayAction: ADMIN ? () => noop : (cb) => on("tray:action", cb, (p) => p || {}),
  };

  // Shell-only extras the Electron preload did not have (the page probes them optionally).
  const extras = {
    isTauri: true,
    // descall:// links opened from Windows (src/lib/desktopDeepLinks.js): the shell keeps the
    // link until the page takes it, and announces new ones while the page runs.
    takeDeepLink: ADMIN ? () => Promise.resolve(null) : () => invoke("deep_link_take").then((u) => (typeof u === "string" && u ? u : null), () => null),
    onDeepLink: ADMIN ? () => noop : (cb) => on("app:deep-link", cb, () => undefined),
    // Passkeys (frontend/src/lib/passkeys, path "tauri"): webauthn.dll with rp id descall.com
    // (src-tauri/src/commands/passkey.rs). Options and results are WebAuthn JSON strings;
    // errors reject with a code (canceled, no_credential, already_registered, busy, ...).
    passkeyAvailable: ADMIN
      ? () => Promise.resolve({ available: false, reason: "admin_window" })
      : () => invoke("passkey_available").catch(() => ({ available: false, reason: "command_missing" })),
    passkeyCreate: ADMIN ? () => Promise.reject("unsupported") : (options) => invoke("passkey_create", { options: String(options || "") }),
    passkeyGet: ADMIN ? () => Promise.reject("unsupported") : (options) => invoke("passkey_get", { options: String(options || "") }),
    passkeyCancel: ADMIN ? noop : () => fire("passkey_cancel"),
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
  // Selected text keeps a menu too (Electron offered Copy; webview.rs trims it to Copy).
  const hasSelection = () => {
    try { return Boolean(window.getSelection && String(window.getSelection() || "").trim()); } catch (_) { return false; }
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
    if (!isEditable(e.target) && !hasSelection()) e.preventDefault();
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
    // F11 maximizes / restores this window (Electron windowKeys.cjs, main and admin windows):
    // key down only, no auto-repeat, no Ctrl / Shift / Alt (AltGr layouts).
    if ((e.key === "F11" || e.code === "F11") && !e.repeat && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      winCmd("window_toggle_maximize", "toggle_maximize");
    }
    // Alt+Space: the window menu, as on a captioned window (Electron's frameless window got it
    // from Windows). WebView2 has the keyboard focus, so the key never reached the window's
    // default handling. Not AltGr (Ctrl+Alt); the shell skips it when Windows already opened
    // the menu itself.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat && (e.code === "Space" || e.key === " ")) {
      e.preventDefault();
      fire("window_system_menu", { keyboard: true });
    }
    // Alt+F4 closes this window (the main window hides to the tray), as Windows did for
    // Electron's window; with WebView2 holding the focus the key may stay in the page.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat && (e.key === "F4" || e.code === "F4")) {
      e.preventDefault();
      winCmd("window_close", "close");
    }
    // F12 / Ctrl+Shift+I: DevTools (windowKeys.cjs). WebView2's own shortcut is off with the
    // browser accelerator keys; the shell opens them only in a dev run or with the support
    // opt-in file (webview::devtools_allowed), otherwise the command does nothing.
    const devKey = (e.key === "F12" || e.code === "F12") ? !(e.ctrlKey || e.metaKey) && !e.shiftKey
      : (e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === "KeyI" || String(e.key || "").toLowerCase() === "i");
    if (devKey && !e.repeat && !e.altKey) fire("window_toggle_devtools");
  }, true);
  // Windows 11 Snap layouts (src-tauri/src/snap.rs): the shell lays an invisible native input
  // sink over the page's maximize button ([data-snap-layout]) that answers HTMAXBUTTON, so
  // Windows offers the snap layouts on hover; the sink also takes the clicks (maximize /
  // restore) and right-click. The page reports where its button is (the visible one on top,
  // e.g. the app lock bar over the main title bar) and mirrors the sink's hover / press into
  // data-snap-state, since the page itself no longer sees the pointer there.
  let snapSent;
  let snapEl = null;
  let snapQueued = false;
  const snapTarget = () => {
    const doc = document;
    if (!doc || typeof doc.querySelectorAll !== "function" || typeof doc.elementFromPoint !== "function") return null;
    const list = doc.querySelectorAll("[data-snap-layout]");
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const el = list[i];
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && (hit === el || el.contains(hit))) return { el, r };
    }
    return null;
  };
  const snapReport = () => {
    snapQueued = false;
    let t = null;
    try { t = snapTarget(); } catch (_) { t = null; }
    if (snapEl && (!t || t.el !== snapEl)) { try { snapEl.removeAttribute("data-snap-state"); } catch (_) { /* gone */ } }
    snapEl = t ? t.el : null;
    const rect = t ? { x: t.r.left, y: t.r.top, width: t.r.width, height: t.r.height, dpr: Number(window.devicePixelRatio) || 1 } : null;
    const key = JSON.stringify(rect);
    if (key === snapSent) return;
    snapSent = key;
    fire("window_snap_button", { rect });
  };
  const snapSoon = () => {
    if (snapQueued) return;
    snapQueued = true;
    (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(snapReport);
  };
  on("window:snap-state", (state) => {
    if (!snapEl) return;
    if (state === "hover" || state === "press") snapEl.setAttribute("data-snap-state", state);
    else snapEl.removeAttribute("data-snap-state");
  });
  // Bars come and go (sign-in, app lock, admin loading screens) and move with zoom: a light
  // check every second, sent only when the button moved. Not in the tray or minimized
  // (html.app-backgrounded / app-hidden, idle-perf.test.mjs): no repeating timer there; it
  // starts again when the window is back (app:visibility, focus, resize).
  let snapTimer = 0;
  const snapAway = () => {
    if (!document || typeof document.elementFromPoint !== "function") return true; // no layout: nothing to check
    const c = document.documentElement && document.documentElement.classList;
    if (c && typeof c.contains === "function" && (c.contains("app-backgrounded") || c.contains("app-hidden"))) return true;
    return document.visibilityState === "hidden";
  };
  const snapTick = () => {
    snapTimer = 0;
    if (snapAway()) return;
    snapSoon();
    snapTimer = setTimeout(snapTick, 1000);
  };
  const snapWatch = () => {
    snapSoon();
    if (!snapTimer && typeof setTimeout === "function") snapTimer = setTimeout(snapTick, 1000);
  };
  on("app:visibility", (p) => { if (!(p && p.backgrounded)) snapWatch(); });
  window.addEventListener("resize", snapWatch);
  window.addEventListener("focus", snapWatch);
  document.addEventListener("DOMContentLoaded", snapWatch);

  // Mouse back / forward buttons navigate history in WebView2.
  const blockNavButtons = (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
  window.addEventListener("mouseup", blockNavButtons, true);
  window.addEventListener("mousedown", blockNavButtons, true);
  window.addEventListener("auxclick", blockNavButtons, true);
  const markTauri = () => { if (document.documentElement) document.documentElement.classList.add("tauri-app"); };
  markTauri();
  document.addEventListener("DOMContentLoaded", markTauri);

  // Start-up: the shell showed the main window on PageLoadEvent::Finished, i.e. after the
  // main bundle had been parsed and run, so a cold start showed nothing for that long.
  // Electron put its splash window up at once. Tell the shell as soon as index.html has
  // mounted the boot splash (a frame later, or 120 ms if no frame comes while hidden):
  // app_boot_state "splash" shows the window then (commands/app.rs; only for a normal
  // start that has not mounted the app yet, never for a tray / minimized start).
  if (!ADMIN && LABEL === "main") {
    let seen = false;
    let told = false;
    const tell = () => {
      if (told) return;
      told = true;
      fire("app_boot_state", { phase: "splash", ms: Math.round((window.performance && performance.now()) || 0) });
    };
    let watch = null;
    const onSplash = () => {
      if (seen || !document.getElementById("boot-splash")) return;
      seen = true;
      if (watch) watch.disconnect();
      try { requestAnimationFrame(() => setTimeout(tell, 0)); } catch (_) { /* no frames */ }
      setTimeout(tell, 120);
    };
    try {
      watch = new MutationObserver(onSplash);
      watch.observe(document, { childList: true, subtree: true });
    } catch (_) { /* no observer: PageLoadEvent::Finished shows the window */ }
    document.addEventListener("DOMContentLoaded", () => { onSplash(); if (watch) watch.disconnect(); }, { once: true });
  }

  // Page warnings and errors to main.log (Electron logged console-message during the boot
  // window): console.warn / console.error of the first minute, uncaught errors, unhandled
  // rejections and CSP violations (blocked URL without its query). The shell drops tokens,
  // caps and rate-limits the lines (app_log).
  const LOG_MAX = 80;
  const LOG_WINDOW_MS = 60000;
  const logStart = Date.now();
  let logged = 0;
  const describe = (v) => {
    if (v instanceof Error || (v && typeof v === "object" && typeof v.message === "string")) return `${v.name || "Error"}: ${v.message}`;
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  };
  const sendLog = (level, parts) => {
    if (logged >= LOG_MAX) return;
    logged += 1;
    let text = "";
    try { text = parts.map(describe).join(" "); } catch (_) { text = "(unprintable)"; }
    fire("app_log", { level, message: String(text).slice(0, 2400) });
  };
  const withoutQuery = (u) => {
    try { const x = new URL(String(u)); return `${x.origin}${x.pathname}`; } catch (_) { return String(u || "").slice(0, 120); }
  };
  try {
    for (const level of ["warn", "error"]) {
      const orig = console[level];
      if (typeof orig !== "function") continue;
      console[level] = function descallConsole(...args) {
        try { if (Date.now() - logStart < LOG_WINDOW_MS) sendLog(level, args); } catch (_) { /* never break the page's logging */ }
        return orig.apply(this, args);
      };
    }
  } catch (_) { /* console not writable */ }
  window.addEventListener("error", (e) => {
    if (e && e.message) sendLog("error", [`uncaught: ${e.message} @ ${withoutQuery(e.filename)}:${e.lineno || 0}`]);
  });
  window.addEventListener("unhandledrejection", (e) => sendLog("error", ["unhandled rejection:", e && e.reason]));
  document.addEventListener("securitypolicyviolation", (e) => {
    sendLog("warn", [`CSP ${e.effectiveDirective || e.violatedDirective} blocked ${withoutQuery(e.blockedURI)}`]);
  });

  // External links: the Rust navigation guard refuses non-app URLs; open http(s) and mailto
  // in the default browser instead (Electron setWindowOpenHandler + shell.openExternal).
  // Bubble phase on window, after React's root listener: a link the app handles itself
  // (preventDefault, e.g. a private file chip that first fetches a fresh signed URL) is left
  // alone, as Electron only acted on the navigation the page did not cancel. The capture
  // listener on document ran first and opened the stale URL in the browser as well.
  window.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || e.defaultPrevented || e.button > 1) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    const external = url.origin !== location.origin && (/^https?:$/.test(url.protocol) || url.protocol === "mailto:");
    if (external) {
      e.preventDefault();
      invoke("plugin:opener|open_url", { url: url.href }).catch(noop);
    }
  });
})();
