/*
 * Tray panel page (draft B "Gelismis menu"), loaded by both desktop shells from the app
 * build (dist/tray-menu/tray-menu.html). The shell gives it window.trayMenuAPI:
 *   getState() -> Promise<state>, onState(cb) -> unsubscribe, act(action, arg).
 * Rows and the keyboard model come from tray-menu-core.js; this file only draws and listens.
 * Every action is checked again by the shell (allow list), the page is never trusted.
 */
(function () {
  "use strict";

  var core = window.DescallTrayCore;
  var api = window.trayMenuAPI;
  var card = document.getElementById("card");
  var fly = document.getElementById("flyout");
  var stage = document.getElementById("stage");
  if (!core || !card || !fly || !stage) return;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var DEFAULT_ACCENT = "88,122,245";
  var ICONS = {
    open: "<rect x='3' y='4' width='18' height='16' rx='3'/><path d='M3 9h18'/><path d='M7 6.5h.01M10 6.5h.01'/>",
    bell: "<path d='M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/>",
    bellOff: "<path d='M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5'/><path d='M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/><path d='m2 2 20 20'/>",
    clock: "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>",
    mic: "<rect x='9' y='2' width='6' height='13' rx='3'/><path d='M19 10v2a7 7 0 0 1-14 0v-2'/><path d='M12 19v3'/>",
    micOff: "<path d='m2 2 20 20'/><path d='M18.89 13.23A7.12 7.12 0 0 0 19 12v-2'/><path d='M5 10v2a7 7 0 0 0 12 5'/><path d='M15 9.34V5a3 3 0 0 0-5.68-1.33'/><path d='M9 9v3a3 3 0 0 0 5.12 2.12'/><path d='M12 19v3'/>",
    headphones: "<path d='M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3'/>",
    headphonesOff: "<path d='M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 2.6-6.4'/><path d='M8.3 3.9A9 9 0 0 1 21 12v5'/><path d='M21 14h-3a2 2 0 0 0-1.4.6'/><path d='m2 2 20 20'/>",
    clip: "<rect x='2' y='6' width='14' height='12' rx='2.5'/><path d='m16 10.5 5.2-3a.5.5 0 0 1 .8.4v8.2a.5.5 0 0 1-.8.4L16 13.5'/><circle cx='9' cy='12' r='2.2'/>",
    chat: "<path d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z'/>",
    userPlus: "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M19 8v6M22 11h-6'/>",
    sparkle: "<path d='M12 3c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7Z'/><path d='M19 3v3M17.5 4.5h3'/>",
    power: "<path d='M12 2v9'/><path d='M18.4 6.6a9 9 0 1 1-12.8 0'/>",
    gear: "<circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/>",
    quit: "<path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'/><path d='m16 17 5-5-5-5'/><path d='M21 12H9'/>",
    arrowUp: "<path d='M12 19V5'/><path d='m5 12 7-7 7 7'/>",
    chevronRight: "<path d='m9 18 6-6-6-6'/>",
    chevronLeft: "<path d='m15 18-6-6 6-6'/>",
    check: "<path d='M20 6 9 17l-5-5'/>",
    info: "<circle cx='12' cy='12' r='9'/><path d='M12 16v-4.5M12 8h.01'/>",
  };

  var state = null;
  var model = null;
  var nav = { focus: null, open: null, sub: null };
  var lastOpenSeq = null;
  var lastAck = -1;
  var keyboard = false;
  var hadFocus = false;
  var openTimer = null;
  var closeTimer = null;

  // ---- small DOM helpers --------------------------------------------------------------

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null && text !== "") n.textContent = String(text);
    return n;
  }

  // Icons are static markup from the table above, never data from the state.
  function icon(name, cls) {
    var wrap = el("span", "ico" + (cls ? " " + cls : ""));
    wrap.setAttribute("aria-hidden", "true");
    if (name && name.indexOf("status-") === 0) {
      wrap.appendChild(el("span", "sdot s-" + name.slice(7)));
      return wrap;
    }
    var body = ICONS[name];
    if (!body) return wrap;
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = body;
    wrap.appendChild(svg);
    return wrap;
  }

  function hintCaps(hint) {
    var box = el("span", "keys");
    box.setAttribute("aria-hidden", "true");
    String(hint).split("+").forEach(function (part) {
      var p = part.trim();
      if (p) box.appendChild(el("kbd", null, p));
    });
    return box;
  }

  function domId(prefix, id) {
    return prefix + "-" + String(id).replace(/[^A-Za-z0-9_-]/g, "_");
  }

  function send(action, arg) {
    if (api && typeof api.act === "function") api.act(action, arg);
  }

  // ---- state ----------------------------------------------------------------------------

  function apply(next) {
    if (!next || typeof next !== "object") return;
    var reopened = next.openSeq !== lastOpenSeq;
    state = next;
    if (reopened) {
      lastOpenSeq = next.openSeq;
      nav = { focus: null, open: null, sub: null };
      keyboard = false;
      hadFocus = false;
      clearTimers();
    }
    render(reopened);
    if (typeof next.seq === "number" && next.seq > lastAck) {
      lastAck = next.seq;
      send("ack", next.seq);
    }
  }

  function clearTimers() {
    if (openTimer) { clearTimeout(openTimer); openTimer = null; }
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }

  function placement() {
    return (state && state.placement) || { cardLeft: 14, vertical: "bottom", flyout: "left", pad: 14, gap: 6, card: 290, flyoutWidth: 232 };
  }

  // ---- render ---------------------------------------------------------------------------

  function render(reopened) {
    var app = (state && state.app) || {};
    var S = (state && state.strings) || {};
    var root = document.documentElement;
    root.setAttribute("data-theme", app.theme === "light" ? "light" : "dark");
    root.setAttribute("lang", String((state && state.lang) || app.locale || "en").replace(/[^A-Za-z-]/g, "") || "en");
    root.style.setProperty("--accent-rgb", app.accent || DEFAULT_ACCENT);
    document.body.classList.toggle("kbd", keyboard);

    var p = placement();
    card.style.left = (Number(p.cardLeft) || 0) + "px";
    card.style.width = (Number(p.card) || 290) + "px";
    card.style.top = p.vertical === "top" ? (Number(p.pad) || 0) + "px" : "auto";
    card.style.bottom = p.vertical === "top" ? "auto" : (Number(p.pad) || 0) + "px";
    card.style.maxHeight = "calc(100vh - " + 2 * (Number(p.pad) || 0) + "px)";
    card.setAttribute("aria-label", core.tr(S, "menuLabel"));

    model = core.buildModel(state, Date.now());
    if (nav.focus && !core.findRow(model.rows, nav.focus)) nav.focus = null;
    var openRow = nav.open ? core.findRow(model.rows, nav.open) : null;
    if (!openRow || openRow.kind !== "submenu") { nav.open = null; nav.sub = null; }

    var frag = document.createDocumentFragment();
    frag.appendChild(renderHeader(model.header, S));
    model.rows.forEach(function (row, i) { frag.appendChild(renderRow(row, i, false)); });
    card.textContent = "";
    card.appendChild(frag);

    if (reopened) {
      card.classList.remove("enter");
      void card.offsetWidth; // restart the one-shot entry animation
      card.classList.add("enter");
      card.scrollTop = 0;
    }
    renderFlyout();
    syncFocus();
  }

  function renderHeader(h, S) {
    var head = el("div", "head");
    head.setAttribute("role", "none");
    var av = el("span", "avatar");
    av.setAttribute("aria-hidden", "true");
    if (h.avatarUrl) {
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = h.avatarUrl;
      img.addEventListener("error", function () {
        img.remove();
        av.insertBefore(el("span", "initial", h.initial), av.firstChild);
      });
      av.appendChild(img);
    } else {
      av.appendChild(el("span", "initial", h.initial));
    }
    if (h.signedIn) av.appendChild(el("span", "sdot ring s-" + h.status));
    head.appendChild(av);
    var copy = el("span", "who");
    copy.appendChild(el("span", "name", h.name));
    if (h.signedIn) copy.appendChild(el("span", "status", h.statusText));
    head.appendChild(copy);
    if (h.version) {
      var chip = el("span", "chip", h.version);
      chip.setAttribute("title", core.tr(S, "version", { version: h.version.replace(/^v/, "") }));
      head.appendChild(chip);
    }
    return head;
  }

  function renderRow(row, index, inFlyout) {
    if (row.kind === "separator") {
      var sep = el("div", "sep");
      sep.setAttribute("role", "separator");
      return sep;
    }
    if (row.kind === "group" || row.kind === "label") {
      var g = el("div", row.kind === "group" ? "group" : "glabel");
      g.setAttribute("role", "presentation");
      if (row.kind === "group") g.appendChild(icon("sparkle", "ico-sm"));
      g.appendChild(el("span", null, row.label));
      return g;
    }
    if (row.kind === "banner") return renderBanner(row);
    if (row.kind === "note") {
      var note = el("div", "note");
      note.setAttribute("role", "presentation");
      note.appendChild(icon(row.icon || "info", "ico-sm"));
      note.appendChild(el("span", null, row.label));
      return note;
    }

    var r = el("div", "row");
    r.id = domId(inFlyout ? "sub" : "row", row.id);
    r.dataset.id = row.id;
    r.tabIndex = -1;
    var role = "menuitem";
    if (row.kind === "check" || row.kind === "switch") role = "menuitemcheckbox";
    if (row.kind === "radio") role = "menuitemradio";
    r.setAttribute("role", role);
    if (role !== "menuitem") r.setAttribute("aria-checked", row.checked ? "true" : "false");
    if (row.enabled === false) r.setAttribute("aria-disabled", "true");
    if (row.kind === "submenu") {
      r.setAttribute("aria-haspopup", "menu");
      r.setAttribute("aria-expanded", nav.open === row.id ? "true" : "false");
      if (nav.open === row.id) r.setAttribute("aria-controls", "flyout");
    }
    if (row.dim) r.classList.add("dim");
    if (row.danger) r.classList.add("danger");
    if (row.alert) r.classList.add("alert");
    if (row.active) r.classList.add("active");
    if (row.kind === "radio" && row.checked) r.classList.add("checked");
    if (nav.open === row.id) r.classList.add("open");

    // Rows without an icon keep the icon column, so every label starts at the same x.
    r.appendChild(row.icon ? icon(row.icon) : el("span", "ico"));

    var text = el("span", "text");
    text.appendChild(el("span", "label", row.label));
    if (row.sub) text.appendChild(el("span", "sub", row.sub));
    r.appendChild(text);

    var aria = row.label + (row.sub ? ", " + row.sub : "");
    if (row.badge) {
      var b = el("span", "badge " + (row.badge.tone === "red" ? "red" : "accent"), row.badge.text);
      b.setAttribute("aria-hidden", "true");
      r.appendChild(b);
      aria += ", " + row.badge.aria;
    }
    if (row.hint) r.appendChild(hintCaps(row.hint));
    if (row.kind === "switch") {
      var sw = el("span", "switch" + (row.checked ? " on" : ""));
      sw.setAttribute("aria-hidden", "true");
      sw.appendChild(el("span", "knob"));
      r.appendChild(sw);
    }
    if (row.kind === "radio" && row.checked) r.appendChild(icon("check", "tick"));
    if (row.kind === "submenu") r.appendChild(icon(placement().flyout === "left" ? "chevronLeft" : "chevronRight", "chev"));
    r.setAttribute("aria-label", aria);
    return r;
  }

  function renderBanner(row) {
    var box = el("div", "banner");
    box.setAttribute("role", "none");
    box.appendChild(icon("arrowUp", "up"));
    // "Update ready · v4.0.2": title on top, the version under it (every catalog uses " · ").
    var cut = row.label.lastIndexOf(" · ");
    var copy = el("span", "btext");
    copy.appendChild(el("span", "btitle", cut > 0 ? row.label.slice(0, cut) : row.label));
    if (cut > 0) copy.appendChild(el("span", "bver", row.label.slice(cut + 3)));
    box.appendChild(copy);
    var btn = el("div", "row bbtn", row.button);
    btn.id = domId("row", row.id);
    btn.dataset.id = row.id;
    btn.tabIndex = -1;
    btn.setAttribute("role", "menuitem");
    btn.setAttribute("aria-label", row.label + ", " + row.button);
    box.appendChild(btn);
    return box;
  }

  function renderFlyout() {
    var row = nav.open ? core.findRow(model.rows, nav.open) : null;
    if (!row) {
      fly.hidden = true;
      fly.textContent = "";
      fly.removeAttribute("aria-labelledby");
      return;
    }
    var p = placement();
    var frag = document.createDocumentFragment();
    (row.children || []).forEach(function (c, i) { frag.appendChild(renderRow(c, i, true)); });
    fly.textContent = "";
    fly.appendChild(frag);
    fly.setAttribute("aria-labelledby", domId("row", row.id));
    fly.style.width = (Number(p.flyoutWidth) || 232) + "px";
    var cardLeft = Number(p.cardLeft) || 0;
    var left = p.flyout === "left" ? cardLeft - (Number(p.gap) || 0) - (Number(p.flyoutWidth) || 232) : cardLeft + (Number(p.card) || 290) + (Number(p.gap) || 0);
    fly.style.left = Math.max(0, left) + "px";
    fly.hidden = false;
    var anchor = document.getElementById(domId("row", row.id));
    var top = anchor ? anchor.getBoundingClientRect().top : 0;
    fly.style.top = core.flyoutTop(top, fly.offsetHeight, window.innerHeight, Number(p.pad) || 0) + "px";
  }

  function rowElement(id, inSub) {
    return document.getElementById(domId(inSub ? "sub" : "row", id));
  }

  function syncFocus() {
    document.body.classList.toggle("kbd", keyboard);
    var all = document.querySelectorAll(".row.is-focus");
    for (var i = 0; i < all.length; i++) all[i].classList.remove("is-focus");
    var target = null;
    if (nav.open && nav.sub) target = rowElement(nav.sub, true);
    if (!target && nav.focus) target = rowElement(nav.focus, false);
    if (nav.open) {
      var parent = rowElement(nav.open, false);
      if (parent) parent.classList.add("is-focus");
    }
    if (target) {
      target.classList.add("is-focus");
      if (document.activeElement !== target) target.focus({ preventScroll: false });
      card.removeAttribute("aria-activedescendant");
    } else if (document.activeElement !== card && !card.contains(document.activeElement)) {
      card.focus({ preventScroll: true });
    }
  }

  // ---- actions --------------------------------------------------------------------------

  function locate(id) {
    if (!model) return null;
    var row = core.findRow(model.rows, id);
    if (row) return row;
    var open = nav.open ? core.findRow(model.rows, nav.open) : null;
    return open ? core.findRow(open.children, id) : null;
  }

  /** Optimistic local change, so a toggle answers at once; the shell's next state wins. */
  function optimistic(action, arg) {
    if (!state) return;
    var app = state.app || (state.app = {});
    var shell = state.shell || (state.shell = {});
    if (action === "mute") app.micMuted = !app.micMuted;
    else if (action === "deafen") app.deafened = !app.deafened;
    else if (action === "autostart") shell.autostart = !shell.autostart;
    else if (action === "status") app.status = arg;
  }

  function activate(id) {
    var row = locate(id);
    if (!row || row.enabled === false) return;
    if (row.kind === "submenu") {
      openSub(row, true);
      return;
    }
    if (!row.action) return;
    optimistic(row.action.action, row.action.arg);
    send(row.action.action, row.action.arg === undefined ? null : row.action.arg);
    var keepsOpen = row.action.action === "mute" || row.action.action === "deafen" || row.action.action === "autostart";
    if (keepsOpen) render(false);
    else { nav = { focus: null, open: null, sub: null }; clearTimers(); }
  }

  function openSub(row, focusChild) {
    clearTimers();
    nav.open = row.id;
    nav.focus = row.id;
    nav.sub = focusChild ? core.entryChild(row) : null;
    renderFlyout();
    var parent = rowElement(row.id, false);
    if (parent) {
      parent.setAttribute("aria-expanded", "true");
      parent.setAttribute("aria-controls", "flyout");
      parent.classList.add("open");
    }
    syncFocus();
  }

  function closeSub() {
    clearTimers();
    if (!nav.open) return;
    var parent = rowElement(nav.open, false);
    if (parent) {
      parent.setAttribute("aria-expanded", "false");
      parent.removeAttribute("aria-controls");
      parent.classList.remove("open");
    }
    nav.focus = nav.open;
    nav.open = null;
    nav.sub = null;
    renderFlyout();
    syncFocus();
  }

  // ---- input ----------------------------------------------------------------------------

  card.addEventListener("pointermove", function (e) {
    var r = e.target.closest ? e.target.closest(".row") : null;
    if (!r || !card.contains(r)) return;
    var id = r.dataset.id;
    if (keyboard) { keyboard = false; document.body.classList.remove("kbd"); }
    if (nav.focus === id && !nav.sub) return;
    var row = locate(id);
    nav.focus = id;
    if (nav.open && nav.open !== id) {
      nav.sub = null;
      if (!closeTimer) closeTimer = setTimeout(function () { closeTimer = null; if (nav.open && nav.focus !== nav.open) closeSub(); }, 260);
    }
    if (row && row.kind === "submenu" && nav.open !== id && row.enabled !== false) {
      if (openTimer) clearTimeout(openTimer);
      openTimer = setTimeout(function () { openTimer = null; if (nav.focus === id) openSub(row, false); }, 140);
    } else if (nav.open === id) {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      nav.sub = null;
    }
    syncFocus();
  });

  fly.addEventListener("pointermove", function (e) {
    var r = e.target.closest ? e.target.closest(".row") : null;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (nav.open) nav.focus = nav.open;
    if (!r) return;
    if (keyboard) keyboard = false;
    if (nav.sub === r.dataset.id) return;
    nav.sub = r.dataset.id;
    syncFocus();
  });

  function onClick(e) {
    var r = e.target.closest ? e.target.closest(".row") : null;
    if (!r) return;
    e.preventDefault();
    activate(r.dataset.id);
  }
  card.addEventListener("click", onClick);
  fly.addEventListener("click", onClick);
  // A click on the transparent part of the window (around the card) closes the menu.
  stage.addEventListener("mousedown", function (e) {
    if (e.target === stage) send("close");
  });
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  document.addEventListener("keydown", function (e) {
    if (!model) return;
    var key = e.key === "Tab" && e.shiftKey ? "Shift+Tab" : e.key === "Spacebar" ? " " : e.key;
    if (e.altKey && key === "F4") return;
    var res = core.reduceKey(nav, key, { rows: model.rows, flyout: placement().flyout });
    if (res.handled) {
      e.preventDefault();
      keyboard = true;
      var wasOpen = nav.open;
      nav = res.nav;
      if (res.close) { send("close"); return; }
      if (nav.open !== wasOpen) {
        if (wasOpen) {
          var old = rowElement(wasOpen, false);
          if (old) { old.setAttribute("aria-expanded", "false"); old.removeAttribute("aria-controls"); old.classList.remove("open"); }
        }
        if (nav.open) {
          var cur = rowElement(nav.open, false);
          if (cur) { cur.setAttribute("aria-expanded", "true"); cur.setAttribute("aria-controls", "flyout"); cur.classList.add("open"); }
        }
        renderFlyout();
      }
      syncFocus();
      if (res.activate) activate(res.activate);
      return;
    }
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var inSub = Boolean(nav.open && nav.sub);
      var list = inSub ? (core.findRow(model.rows, nav.open) || {}).children : model.rows;
      var hit = core.typeahead(list, inSub ? nav.sub : nav.focus, e.key);
      if (hit) {
        e.preventDefault();
        keyboard = true;
        if (inSub) nav.sub = hit;
        else { nav.focus = hit; if (nav.open && nav.open !== hit) { nav.open = null; nav.sub = null; renderFlyout(); } }
        syncFocus();
      }
    }
  });

  window.addEventListener("focus", function () { hadFocus = true; });
  window.addEventListener("blur", function () {
    if (!hadFocus) return;
    hadFocus = false;
    send("close");
  });

  // The remaining snooze time stays current while the menu is up.
  setInterval(function () {
    if (!state || !document.hasFocus()) return;
    var until = Number(state.shell && state.shell.snoozeUntil) || 0;
    if (until && (until > Date.now() - 60000)) render(false);
  }, 15000);

  if (api && typeof api.onState === "function") api.onState(apply);
  if (api && typeof api.getState === "function") {
    Promise.resolve(api.getState()).then(apply, function () { /* the shell retries with onState */ });
  }
})();
