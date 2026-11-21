/*
 * window.descallHud for the Descall+ HUD / widget / quick drop windows (port of
 * frontend/electron/premium/hudPreload.cjs): state in, whitelisted actions out. Files dropped on
 * the drop zone go up as raw bodies (premium_blob_put); only the file name travels, never a path.
 * '.drag' elements move the window (Electron's -webkit-app-region: drag).
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
    for (const f of (payload && Array.isArray(payload.files) ? payload.files : []).slice(0, 10)) {
      try {
        const handle = await T.core.invoke("premium_blob_put", f.data);
        files.push({ name: String(f.name || "file"), type: String(f.type || ""), size: f.size, data: handle });
      } catch (_) { /* too large or refused: skipped */ }
    }
    if (files.length) send("drop", { target: payload.target, files });
  }

  Object.defineProperty(window, "descallHud", {
    value: Object.freeze({
      onState: (cb) => {
        if (typeof cb !== "function") return () => {};
        let un = null;
        let dead = false;
        T.event.listen("descall:hud:state", (e) => cb(e.payload || {}), own).then((u) => { if (dead) u(); else un = u; }).catch(() => {});
        return () => { dead = true; if (un) un(); un = null; };
      },
      action: (type, payload) => {
        if (!ACTIONS.has(type)) return;
        if (type === "drop") { dropFiles(payload); return; }
        send(type, payload);
      },
      fileName: (file) => String((file && file.name) || "").split(/[\\/]/).pop(),
    }),
    writable: false,
    configurable: false,
  });

  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !e.target || !e.target.closest) return;
    if (!e.target.closest(".drag") || e.target.closest(".nodrag, select, button, input")) return;
    const w = T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;
    if (w) w.startDragging().catch(() => {});
  });
})();
