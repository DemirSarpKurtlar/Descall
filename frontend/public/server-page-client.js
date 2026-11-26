/*
 * Public server page (descall.com/s/<slug>) in the browser: the smart join button,
 * share, and the page counters. Loaded by server-page.js as a same-origin file (the
 * site CSP allows 'self' scripts, never inline ones). No framework, no dependencies.
 *
 * Join:
 *   Android   intent:// URL: Chrome opens the Descall app, or the web flow when it is not
 *             installed (S.browser_fallback_url).
 *   iOS       descall://s/<slug>; if the page is still visible after a moment the app is
 *             not installed and the web flow starts.
 *   Desktop   the web flow (the QR box continues on the phone).
 *   Web flow  signed in: /app?sv=<slug> (the vanity landing, bans and verification are
 *             checked there); signed out: the slug waits in the pending landing slot
 *             (src/lib/serverInviteRoute.js) and /register opens; after sign-up the
 *             app joins by itself.
 * Counters: one "view" per load and one "join_click" per click (sendBeacon, text/plain).
 */
(function () {
  "use strict";
  var el = document.getElementById("sp-data");
  if (!el) return;
  var data;
  try {
    data = JSON.parse(el.textContent || "{}");
  } catch (e) {
    return;
  }
  var slug = String(data.slug || "");
  if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(slug)) return;
  var t = data.t || {};
  var api = String(data.api || "https://des-call.onrender.com");
  var hitUrl = api + "/api/public-pages/s/" + encodeURIComponent(slug) + "/hit";
  var ua = navigator.userAgent || "";
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function param(name) {
    try {
      return new URLSearchParams(location.search).get(name) || "";
    } catch (e) {
      return "";
    }
  }
  var src = (param("src") || param("utm_source")).slice(0, 32);

  function beacon(type) {
    var body = JSON.stringify({ type: type, ref: document.referrer || "", src: src });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(hitUrl, new Blob([body], { type: "text/plain" }))) return;
    } catch (e) {
      /* fall back to fetch */
    }
    try {
      fetch(hitUrl, { method: "POST", body: body, headers: { "content-type": "text/plain" }, keepalive: true, mode: "no-cors", credentials: "omit" });
    } catch (e) {
      /* counters are best effort */
    }
  }

  var toastEl = document.querySelector(".toast");
  var toastTimer = 0;
  function toast(text, link) {
    if (!toastEl) return;
    toastEl.textContent = text;
    if (link) {
      var a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.text;
      toastEl.appendChild(a);
    }
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, link ? 8000 : 2600);
  }

  /** Same pending slot the app reads after sign-up (PENDING_LANDING_KEYS.vanity). */
  function rememberLanding() {
    var at = Date.now();
    var landing = JSON.stringify({ value: slug, at: at });
    var visit = JSON.stringify({ slug: slug, src: src || sourceFromReferrer(), at: at });
    [window.localStorage, window.sessionStorage].forEach(function (s) {
      try {
        s.setItem("descall:pendingServerVanity", landing);
        s.setItem("descall:publicPageVisit", visit);
      } catch (e) {
        /* private mode */
      }
    });
  }

  function sourceFromReferrer() {
    var host = "";
    try {
      host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
    } catch (e) {
      host = "";
    }
    if (!host) return "direct";
    if (/(^|\.)google\./.test(host)) return "google";
    if (/(^|\.)bing\.com$/.test(host)) return "bing";
    if (/(^|\.)yandex\./.test(host)) return "yandex";
    if (/(^|\.)duckduckgo\.com$/.test(host)) return "duckduckgo";
    if (/whatsapp|^wa\.me$/.test(host)) return "whatsapp";
    if (/telegram|^t\.me$/.test(host)) return "telegram";
    if (/(^|\.)(x|twitter)\.com$|^t\.co$/.test(host)) return "x";
    if (/instagram\.com$/.test(host)) return "instagram";
    if (/facebook\.com$|messenger\.com$/.test(host)) return "facebook";
    if (/reddit\.com$/.test(host)) return "reddit";
    if (/discord/.test(host)) return "discord";
    if (/youtube\.com$|^youtu\.be$/.test(host)) return "youtube";
    if (/tiktok\.com$/.test(host)) return "tiktok";
    if (/(^|\.)descall\.com$/.test(host)) return "descall";
    return "other";
  }

  function signedIn() {
    try {
      return Boolean(window.localStorage.getItem("descall_token"));
    } catch (e) {
      return false;
    }
  }

  function webFlowUrl() {
    return signedIn() ? "/app?sv=" + encodeURIComponent(slug) : "/register";
  }

  function busy(btn, on) {
    if (!btn) return;
    if (on) btn.setAttribute("aria-busy", "true");
    else btn.removeAttribute("aria-busy");
  }

  function openApp(btn) {
    rememberLanding();
    var web = new URL(webFlowUrl(), location.origin).toString();
    if (isAndroid) {
      location.href =
        "intent://s/" + encodeURIComponent(slug) + "#Intent;scheme=descall;package=com.descall.app;S.browser_fallback_url=" + encodeURIComponent(web) + ";end";
      return;
    }
    if (isIOS) {
      busy(btn, true);
      var left = false;
      var onHide = function () {
        if (document.hidden) left = true;
      };
      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("pagehide", onHide);
      var started = Date.now();
      location.href = "descall://s/" + encodeURIComponent(slug);
      setTimeout(function () {
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", onHide);
        busy(btn, false);
        // Still here (and not just back from the app): the app is not installed.
        if (!left && !document.hidden && Date.now() - started < 4000) {
          toast(t.opening || "", { href: web, text: t.continueWeb || "" });
          location.href = web;
        }
      }, 1600);
      return;
    }
    location.href = web;
  }

  document.addEventListener("click", function (ev) {
    var target = ev.target && ev.target.closest ? ev.target.closest("[data-join],[data-open],[data-share]") : null;
    if (!target) return;
    if (target.hasAttribute("data-share")) {
      ev.preventDefault();
      var url = data.url || location.href.split("?")[0];
      if (navigator.share) {
        navigator.share({ title: data.name || document.title, url: url }).catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast(t.copied || "");
        }, function () {});
      }
      return;
    }
    ev.preventDefault();
    if (target.hasAttribute("data-join")) beacon("join_click");
    openApp(target);
  });

  if (document.visibilityState === "prerender") {
    document.addEventListener("visibilitychange", function once() {
      if (document.visibilityState !== "prerender") {
        document.removeEventListener("visibilitychange", once);
        beacon("view");
      }
    });
  } else {
    beacon("view");
  }
})();
