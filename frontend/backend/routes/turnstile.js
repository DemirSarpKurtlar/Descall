"use strict";

/**
 * Turnstile public endpoints (lib/turnstile.js).
 *
 *   GET /api/turnstile/config  { enabled, siteKey, mode, actions, bridgeUrl } for the
 *                              client. The site key is public by design; nothing secret.
 *   GET /api/turnstile/frame   the in-app bridge page. Turnstile checks the hostname of
 *                              the page that runs the widget, and the apps run on
 *                              descall://localhost (iOS), https://localhost (Android),
 *                              descall://app (Electron) and https://tauri.localhost (Tauri),
 *                              none of which can be a widget hostname. The apps frame this
 *                              page instead (its host is a widget hostname) and receive the
 *                              token by postMessage.
 *
 * Bridge safety: the page renders the widget only after a hello message from an allowed
 * parent origin (the browser sets event.origin, it cannot be forged), and posts the token
 * back to exactly that origin. A site that frames the page to farm tokens never gets one.
 * frame-ancestors is not used for that check on purpose: WebKit and WebView2 do not
 * agree on matching custom schemes (descall:, tauri:) in CSP source lists, and a refused
 * frame would silently cost every app sign-up its check.
 */

const crypto = require("crypto");
const express = require("express");
const turnstile = require("../lib/turnstile");

const router = express.Router();

/** Parent pages that may receive a token from the bridge (exact origins). */
const BRIDGE_PARENTS = Object.freeze([
  "descall://app",
  "descall://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  "https://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
  "tauri://localhost",
  "https://descall.com",
  "https://www.descall.com",
]);
const DEV_PARENT_RE = "^http://(localhost|127\\.0\\.0\\.1)(:\\d{1,5})?$";

router.get("/config", async (_req, res) => {
  try {
    const cfg = await turnstile.publicConfig();
    res.set("Cache-Control", "no-store");
    res.json(cfg);
  } catch {
    res.set("Cache-Control", "no-store");
    res.json({ enabled: false, siteKey: null, mode: "off", actions: {}, bridgeUrl: null });
  }
});

function bridgeCsp(nonce) {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
    `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    "connect-src https://challenges.cloudflare.com",
    "style-src 'unsafe-inline'",
    "img-src data: https://challenges.cloudflare.com",
  ].join("; ");
}

/** The bridge document. Exported for the selftest. */
function bridgeHtml({ siteKey, nonce }) {
  const cfg = JSON.stringify({ siteKey: siteKey || "", parents: BRIDGE_PARENTS, devParent: DEV_PARENT_RE, actions: turnstile.ACTIONS }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Descall</title>
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}#w{display:flex;justify-content:center;align-items:center;min-height:65px}</style>
</head><body><div id="w"></div>
<script nonce="${nonce}">
(function () {
  var C = ${cfg};
  var devRe = new RegExp(C.devParent);
  var parentOrigin = null, nonce = "", widgetId = null, loaded = false, pending = null;
  function post(ev, data) {
    if (!parentOrigin) return;
    try { window.parent.postMessage({ type: "descall-hc", nonce: nonce, event: ev, data: data || null }, parentOrigin); } catch (e) {}
  }
  function start(o) {
    if (!C.siteKey) { post("error", { code: "config" }); return; }
    var ts = window.turnstile;
    if (!ts) { pending = o; return; }
    if (widgetId !== null) { try { ts.remove(widgetId); } catch (e) {} widgetId = null; }
    widgetId = ts.render("#w", {
      sitekey: C.siteKey,
      action: o.action,
      theme: o.theme,
      language: o.language,
      appearance: "interaction-only",
      "refresh-expired": "manual",
      "response-field": false,
      callback: function (t) { post("token", { token: t }); },
      "error-callback": function (code) { post("error", { code: String(code || "") }); return true; },
      "expired-callback": function () { post("expired"); },
      "timeout-callback": function () { post("timeout"); },
      "before-interactive-callback": function () { post("interactive"); },
      "after-interactive-callback": function () { post("interactiveDone"); },
      "unsupported-callback": function () { post("unsupported"); }
    });
  }
  window.__dcTsLoaded = function () { loaded = true; if (pending) { var o = pending; pending = null; start(o); } };
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || typeof m !== "object" || m.type !== "descall-hc-hello") return;
    var ok = C.parents.indexOf(e.origin) >= 0 || devRe.test(e.origin);
    if (!ok) return;
    if (parentOrigin && parentOrigin !== e.origin) return;
    parentOrigin = e.origin;
    nonce = String(m.nonce || "").slice(0, 64);
    var action = C.actions.indexOf(m.action) >= 0 ? m.action : "register";
    var theme = m.theme === "light" ? "light" : "dark";
    var language = /^[a-z]{2}(-[a-z]{2})?$/.test(String(m.language || "")) ? m.language : "auto";
    post("hello", { loaded: loaded });
    if (m.reset && widgetId !== null && window.turnstile) { try { window.turnstile.reset(widgetId); } catch (err) {} return; }
    var o = { action: action, theme: theme, language: language };
    if (loaded) start(o); else pending = o;
  });
})();
</script>
<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&amp;onload=__dcTsLoaded" async defer></script>
</body></html>`;
}

router.get("/frame", async (_req, res) => {
  let siteKey = "";
  try {
    const cfg = await turnstile.publicConfig();
    siteKey = cfg.enabled ? cfg.siteKey || "" : "";
  } catch {
    siteKey = "";
  }
  const nonce = crypto.randomBytes(16).toString("base64");
  // The API's own headers forbid framing and scripts; this one page replaces them.
  res.removeHeader("X-Frame-Options");
  res.set("Content-Security-Policy", bridgeCsp(nonce));
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  res.type("html").send(bridgeHtml({ siteKey, nonce }));
});

module.exports = router;
module.exports.BRIDGE_PARENTS = BRIDGE_PARENTS;
module.exports.bridgeHtml = bridgeHtml;
module.exports.bridgeCsp = bridgeCsp;
