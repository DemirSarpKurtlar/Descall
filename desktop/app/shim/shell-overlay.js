/*
 * Voice overlay window (descall-shell://localhost/overlay.html). Same contract as
 * frontend/electron/overlayPreload.cjs (window.overlayAPI.action) and the same card
 * (overlayHtml.cjs). The shell pushes state with window.__overlayUpdate(state), exactly as
 * overlayWindow.cjs did through executeJavaScript.
 */
(function () {
  "use strict";
  var T = window.__TAURI__;
  var req = window.__descallShellRequire;
  if (!T || !T.core || !req) return;
  var lang = (window.__DESCALL_OVERLAY__ && window.__DESCALL_OVERLAY__.locale) || "en";
  req("./mainI18n.cjs").setLocale(lang);
  var overlay = req("./overlayHtml.cjs");
  Object.defineProperty(window, "overlayAPI", {
    configurable: false,
    writable: false,
    value: Object.freeze({
      action: function (type) {
        if (type !== "mute" && type !== "deafen" && type !== "leave") return;
        T.core.invoke("overlay_action", { action: type }).catch(function () {});
      },
    }),
  });
  window.__descallMountShellPage(overlay.buildOverlayHtml({ lang: lang }));
})();
