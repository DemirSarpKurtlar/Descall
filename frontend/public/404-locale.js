/* 404 page words in the UI language. Static page, no bundle: a file (not an inline
   script) so the site CSP needs no extra hash. Same rule as the inline boot locale in
   index.html and src/i18n/detect.js: stored choice, then a Turkey device -> tr, then
   the first device language with an entry, else en. Drafts only with
   descall_i18n_preview=1. LIVE must equal the "live" ids of src/i18n/locales.json
   (src/site404Locale.selftest.mjs checks it). */
(function () {
  var COPY = {
    "en": { title: "Page not found | Descall", body: "This page does not exist on Descall.", home: "Home", download: "Download" },
    "tr": { title: "Sayfa bulunamadı | Descall", body: "Bu sayfa Descall’da yok.", home: "Ana sayfa", download: "İndir" },
    "de": { title: "Seite nicht gefunden | Descall", body: "Diese Seite gibt es auf Descall nicht.", home: "Startseite", download: "Herunterladen" },
    "es": { title: "Página no encontrada | Descall", body: "Esta página no existe en Descall.", home: "Inicio", download: "Descargar" },
    "fr": { title: "Page introuvable | Descall", body: "Cette page n'existe pas sur Descall.", home: "Accueil", download: "Télécharger" },
    "pt-BR": { title: "Página não encontrada | Descall", body: "Esta página não existe no Descall.", home: "Início", download: "Baixar" },
    "ru": { title: "Страница не найдена | Descall", body: "Такой страницы на Descall нет.", home: "Главная", download: "Скачать" }
  };
  var LIVE = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"];
  var ids = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"];
  var preview = false;
  try { preview = localStorage.getItem("descall_i18n_preview") === "1"; } catch (eP) {}
  function usable(id) { return preview || LIVE.indexOf(id) >= 0; }
  function pick(value) {
    var raw = String(value || "").replace(/^\s+|\s+$/g, "").replace(/_/g, "-").toLowerCase();
    if (!raw) return null;
    var i;
    for (i = 0; i < ids.length; i += 1) if (ids[i].toLowerCase() === raw) return usable(ids[i]) ? ids[i] : null;
    var base = raw.split("-")[0];
    for (i = 0; i < ids.length; i += 1) if (ids[i].toLowerCase().split("-")[0] === base && usable(ids[i])) return ids[i];
    return null;
  }
  var locale = null;
  try {
    locale = pick(localStorage.getItem("descall_language"));
    if (!locale) {
      var saved = JSON.parse(localStorage.getItem("descall_user_settings") || localStorage.getItem("descall_settings") || "{}");
      locale = pick(saved && saved.language);
    }
  } catch (eS) {}
  var path = (location.pathname || "/").replace(/\/+$/, "");
  // A site language prefix (/de, /pt-br, from the ids above) names the page language
  // and wins over the stored choice. /tr keeps its old rule (only without a stored choice).
  for (var p = 0; p < ids.length; p += 1) {
    var pre = "/" + ids[p].toLowerCase();
    if (ids[p] !== "en" && ids[p] !== "tr" && (path === pre || path.indexOf(pre + "/") === 0) && usable(ids[p])) locale = ids[p];
  }
  if (!locale && (path === "/tr" || path.indexOf("/tr/") === 0)) locale = pick("tr");
  var langs = [];
  try { langs = [navigator.language].concat(navigator.languages || []).filter(Boolean); } catch (eN) {}
  if (!locale) {
    var turkey = false;
    try {
      for (var t = 0; t < langs.length; t += 1) {
        var l = String(langs[t]).toLowerCase();
        if (l === "tr" || l.indexOf("tr-") === 0 || /-tr$/.test(l)) turkey = true;
      }
      if ((Intl.DateTimeFormat().resolvedOptions().timeZone || "") === "Europe/Istanbul") turkey = true;
    } catch (eT) {}
    if (turkey) locale = pick("tr");
  }
  for (var d = 0; !locale && d < langs.length; d += 1) locale = pick(langs[d]);
  locale = locale || "en";
  var c = COPY[locale] || COPY.en;
  try {
    document.documentElement.lang = locale;
    document.title = c.title;
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var n = 0; n < nodes.length; n += 1) {
      var key = nodes[n].getAttribute("data-i18n");
      if (c[key]) nodes[n].textContent = c[key];
    }
  } catch (eD) {}
})();
