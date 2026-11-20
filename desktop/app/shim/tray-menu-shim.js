/*
 * window.trayMenuAPI for the tray panel window (label "tray-menu", page
 * frontend/dist/tray-menu/tray-menu.html). Same three calls as
 * frontend/electron/trayMenuPreload.cjs; the shell (src-tauri/src/tray_menu.rs) checks the
 * window label and every action against descall_shell::tray_panel::validate_action.
 * Capability: capabilities/tray-menu.json (event listen only, no other plugin).
 */
(() => {
  "use strict";
  if (window.top !== window || window.trayMenuAPI) return;
  const T = window.__TAURI__;
  if (!T || !T.core || !T.event) return;
  Object.defineProperty(window, "trayMenuAPI", {
    value: Object.freeze({
      getState: () => T.core.invoke("tray_menu_state"),
      onState: (callback) => {
        if (typeof callback !== "function") return () => {};
        let un = null;
        let dead = false;
        T.event.listen("tray-menu:state", (e) => callback(e.payload)).then((u) => {
          if (dead) u();
          else un = u;
        }).catch(() => {});
        return () => {
          dead = true;
          if (un) un();
          un = null;
        };
      },
      act: (action, arg) => {
        T.core.invoke("tray_menu_act", { action: String(action || "").slice(0, 32), arg: arg === undefined ? null : arg }).catch(() => {});
      },
    }),
    writable: false,
    configurable: false,
  });
})();
