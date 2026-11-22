/*
 * window.descallHud for the Descall+ HUD / widget / quick drop windows (port of
 * frontend/electron/premium/hudPreload.cjs): state in, whitelisted actions out. Files dropped on
 * the drop zone go up as raw bodies (premium_blob_put); only the file name travels, never a path.
 * '.drag' elements move the window (Electron's -webkit-app-region: drag): WebView2 turns a CSS
 * drag region into a native caption, which swallowed the clicks on the quick drop zone's close
 * button and target list (both sit inside '.drag') and gave the HUDs a system menu, so the CSS
 * region is switched off here and the shim drags instead (the main title bar does the same).
 * 'ready' waits for the state listener: Tauri's listen() is an IPC round trip, Electron's
 * ipcRenderer.on was synchronous, and the shell answers 'ready' with the last state.
 */
(() => {
  "use strict";
  if (window.top !== window || window.descallHud) return;
  const T = window.__TAURI__;
  if (!T || !T.core || !T.event) return;
  const ACTIONS = new Set(["ready", "drop", "open", "close", "moved", "pick", "size"]);
  // Only this window's state: the global listen() also hears the state sent to every other
  // HUD / widget window (emit_to narrows nothing for it).
  const meta = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.metadata;
  const label = String((meta && meta.currentWebview && meta.currentWebview.label) || "");
  const own = label ? { target: { kind: "WebviewWindow", label } } : undefined;
  const send = (kind, payload) => T.core.invoke("premium_hud_action", { kind, payload: payload == null ? null : payload }).catch(() => {});

  async function dropFiles(payload) {
    const files = [];
    let skipped = 0;
    for (const f of (payload && Array.isArray(payload.files) ? payload.files : []).slice(0, 10)) {
      try {
        const handle = await T.core.invoke("premium_blob_put", f.data);
        files.push({ name: String(f.name || "file"), type: String(f.type || ""), size: f.size, data: handle });
      } catch (_) { skipped += 1; /* too large or refused: counted, the drop zone says it failed */ }
    }
    if (files.length || skipped) send("drop", { target: payload.target, files, skipped });
  }

  let listening = Promise.resolve();

  Object.defineProperty(window, "descallHud", {
    value: Object.freeze({
      onState: (cb) => {
        if (typeof cb !== "function") return () => {};
        let un = null;
        let dead = false;
        // An unsubscribe before listen() resolved used to leave the listener registered.
        const p = T.event.listen("descall:hud:state", (e) => cb(e.payload || {}), own).then((u) => { if (dead) u(); else un = u; });
        listening = listening.then(() => p).catch(() => {});
        return () => { dead = true; if (un) { un(); un = null; } };
      },
      action: (type, payload) => {
        if (!ACTIONS.has(type)) return;
        if (type === "drop") { dropFiles(payload); return; }
        if (type === "ready") { listening.then(() => send(type, payload)); return; }
        send(type, payload);
      },
      fileName: (file) => String((file && file.name) || "").split(/[\\/]/).pop(),
    }),
    writable: false,
    configurable: false,
  });

  const NO_CSS_DRAG = ".drag,.drag *,.nodrag{-webkit-app-region:no-drag!important;app-region:no-drag!important}";
  const addStyle = () => {
    if (document.getElementById("descall-hud-tauri")) return;
    const st = document.createElement("style");
    st.id = "descall-hud-tauri";
    st.textContent = NO_CSS_DRAG;
    (document.head || document.documentElement).appendChild(st);
  };
  if (document.documentElement) addStyle();
  document.addEventListener("DOMContentLoaded", addStyle);

  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !e.target || !e.target.closest) return;
    if (!e.target.closest(".drag") || e.target.closest(".nodrag, select, button, input")) return;
    const w = T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;
    if (w) w.startDragging().catch(() => {});
  });
})();
