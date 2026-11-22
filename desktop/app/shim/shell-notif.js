/*
 * Notification capsule window (descall-shell://localhost/notif.html). Same contract as
 * frontend/electron/notifPreload.cjs (window.notifAPI) and the same markup: the capsule is
 * built by the Electron module notificationCard.cjs, loaded by runtime.js.
 * The shell injects window.__DESCALL_NOTIF__ = { locale, title, body, data, type, avatarUrl,
 * appIcon, from, duration, count } before this page loads.
 */
(function () {
  "use strict";
  var T = window.__TAURI__;
  var input = window.__DESCALL_NOTIF__ || {};
  var req = window.__descallShellRequire;
  if (!T || !T.core || !req) return;
  var i18n = req("./mainI18n.cjs");
  i18n.setLocale(input.locale || "en");
  var card = req("./notificationCard.cjs");

  function act(action, extra) {
    var args = { action: action };
    if (extra) for (var k in extra) args[k] = extra[k];
    return T.core.invoke("notif_action", args).catch(function () {});
  }
  var updateHandlers = [];
  Object.defineProperty(window, "notifAPI", {
    configurable: false,
    writable: false,
    value: Object.freeze({
      click: function () { act("click"); },
      close: function () { act("close"); },
      accept: function () { act("accept"); },
      decline: function () { act("decline"); },
      pause: function () { act("pause"); },
      resume: function (remaining) { act("resume", { remaining: Number(remaining) || 0 }); },
      // Grouped toast (same chat tag): the shell sends the raw payload, the capsule wants
      // { title, body, context, count } like main.cjs computed with describeNotification.
      onUpdate: function (cb) { if (typeof cb === "function") updateHandlers.push(cb); },
    }),
  });
  // Only this capsule's updates: the global listen() also hears updates sent to the other
  // capsules (every grouped toast used to take the newest chat's text).
  var meta = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.metadata;
  var label = String((meta && meta.currentWebview && meta.currentWebview.label) || "");
  var own = label ? { target: { kind: "WebviewWindow", label: label } } : undefined;
  T.event.listen("notif:update", function (e) {
    var p = (e && e.payload) || {};
    var m = card.describeNotification({ title: p.title, body: p.body, data: p.data, appIcon: p.appIcon, avatarUrl: p.avatarUrl });
    updateHandlers.forEach(function (cb) {
      try { cb({ title: m.name, body: m.preview || "", context: m.context || "", count: p.count || 1 }); } catch (err) { console.error(err); }
    });
  }, own);

  var model = card.describeNotification({
    title: input.title || "",
    body: input.body || "",
    data: input.data || {},
    appIcon: Boolean(input.appIcon),
    avatarUrl: input.avatarUrl || null,
  });
  var html = card.buildNotificationHtml({
    title: model.name,
    body: model.preview || "",
    type: input.type || "default",
    avatarUrl: input.avatarUrl || (input.data && input.data.avatarUrl) || null,
    appIcon: Boolean(input.appIcon),
    from: input.from || null,
    duration: Number(input.duration) || 0,
    count: Number(input.count) || 1,
    model: model,
  });
  window.__descallMountShellPage(html);
})();
