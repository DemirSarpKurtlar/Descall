/*
 * window.launcherAPI for the quick launcher window (port of
 * frontend/electron/premium/launcher/launcherPreload.cjs); the page
 * (frontend/dist/premium-launcher/launcher.html) is unchanged.
 *
 * window.__TAURI__ is read per call, with __TAURI_INTERNALS__ as the fallback (as in
 * premium-shim.js): the global API bundle is not guaranteed to exist yet when an init script
 * runs, and without launcherAPI the launcher opened as an empty box.
 */
(() => {
  "use strict";
  if (window.top !== window || window.launcherAPI) return;
  const tauri = () => window.__TAURI__ || null;
  const internals = () => window.__TAURI_INTERNALS__ || null;
  if (!tauri() && !internals()) return;
  const meta = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.metadata;
  const label = String((meta && meta.currentWebview && meta.currentWebview.label) || "");
  // Events sent to this window only (a global listen hears emit_to aimed at any window).
  const own = label ? { target: { kind: "WebviewWindow", label } } : undefined;
  function invoke(cmd, args) {
    const T = tauri();
    if (T && T.core && typeof T.core.invoke === "function") return T.core.invoke(cmd, args);
    const I = internals();
    if (I && typeof I.invoke === "function") return I.invoke(cmd, args);
    return Promise.reject(new Error("tauri ipc unavailable"));
  }
  function listen(event, handler) {
    const T = tauri();
    if (T && T.event && typeof T.event.listen === "function") return T.event.listen(event, handler, own);
    const I = internals();
    if (!I || typeof I.transformCallback !== "function") return Promise.reject(new Error("tauri events unavailable"));
    return I.invoke("plugin:event|listen", { event, target: own ? own.target : { kind: "Any" }, handler: I.transformCallback(handler) });
  }
  const call = (channel, ...args) => invoke("premium_invoke", { channel, args });
  Object.defineProperty(window, "launcherAPI", {
    value: Object.freeze({
      strings: () => call("premium:launcher:strings"),
      query: (q) => call("premium:launcher:query", String(q || "").slice(0, 120)),
      run: (item) => call("premium:launcher:run", {
        id: String((item && item.id) || "").slice(0, 200),
        focus: Boolean(item && item.focus),
      }),
      close: () => call("premium:launcher:close"),
      onReset: (callback) => {
        if (typeof callback !== "function") return;
        listen("premium:launcher:reset", (e) => callback((e && e.payload) || {})).catch(() => {});
      },
    }),
    writable: false,
    configurable: false,
  });
})();
