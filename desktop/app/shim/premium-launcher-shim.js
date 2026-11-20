/*
 * window.launcherAPI for the quick launcher window (port of
 * frontend/electron/premium/launcher/launcherPreload.cjs); the page
 * (frontend/dist/premium-launcher/launcher.html) is unchanged.
 */
(() => {
  "use strict";
  if (window.top !== window || window.launcherAPI) return;
  const T = window.__TAURI__;
  if (!T || !T.core || !T.event) return;
  const call = (channel, ...args) => T.core.invoke("premium_invoke", { channel, args });
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
        T.event.listen("premium:launcher:reset", (e) => callback(e.payload || {}));
      },
    }),
    writable: false,
    configurable: false,
  });
})();
