/*
 * Tray panel (draft B "Gelismis menu"): the pure part of the page. Builds the rows from the
 * state the shell sends and runs the keyboard model. No DOM access here, so
 * electron/trayMenu.selftest.mjs loads this file in a VM and tests it.
 * Exposed as window.DescallTrayCore (and module.exports under Node).
 */
(function (root) {
  "use strict";

  var STATUSES = ["online", "idle", "dnd", "invisible"];

  function interpolate(text, vars) {
    return String(text == null ? "" : text).replace(/\{(\w+)\}/g, function (m, name) {
      return vars && vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : m;
    });
  }

  function tr(strings, key, vars) {
    var s = strings && typeof strings[key] === "string" ? strings[key] : "";
    return interpolate(s, vars);
  }

  /** Badge text: 1..99, then "99+". */
  function badgeText(n) {
    var c = Math.floor(Number(n) || 0);
    if (c <= 0) return "";
    return c > 99 ? "99+" : String(c);
  }

  /** "25 min", "1 h", "7 h 59 min" (minutes rounded up, so 30 s left still reads 1 min). */
  function formatRemaining(ms, strings) {
    var total = Math.max(1, Math.ceil(Math.max(0, Number(ms) || 0) / 60000));
    var h = Math.floor(total / 60);
    var m = total % 60;
    if (h <= 0) return tr(strings, "remainMin", { m: m });
    if (m === 0) return tr(strings, "remainHour", { h: h });
    return tr(strings, "remainHourMin", { h: h, m: m });
  }

  function statusLabel(strings, s) {
    return tr(strings, STATUSES.indexOf(s) >= 0 ? s : "online");
  }

  /** First letter for the avatar fallback ("#" when there is none). */
  function initialOf(name) {
    var t = String(name || "").trim();
    if (!t) return "D";
    var ch = Array.from ? Array.from(t)[0] : t.charAt(0);
    return String(ch).toLocaleUpperCase();
  }

  function premiumRows(items, depth) {
    var out = [];
    (Array.isArray(items) ? items : []).forEach(function (it) {
      if (!it || typeof it !== "object") return;
      if (it.type === "separator") {
        if (out.length && out[out.length - 1].kind !== "separator") out.push({ kind: "separator" });
        return;
      }
      var id = "premium:" + String(it.id || "");
      if (it.type === "submenu") {
        if (depth > 0) {
          // A third level is shown inline under a small label.
          out.push({ kind: "label", id: id, label: String(it.label || "") });
          premiumRows(it.items, depth + 1).forEach(function (r) { out.push(r); });
          return;
        }
        out.push({ kind: "submenu", id: id, label: String(it.label || ""), icon: null, enabled: it.enabled !== false, children: premiumRows(it.items, depth + 1) });
        return;
      }
      var kind = it.type === "radio" ? "radio" : it.type === "check" ? "check" : "item";
      out.push({
        kind: kind,
        id: id,
        label: String(it.label || ""),
        icon: null,
        enabled: it.enabled !== false,
        checked: Boolean(it.checked),
        action: { action: "premium", arg: String(it.id || "") },
      });
    });
    while (out.length && out[out.length - 1].kind === "separator") out.pop();
    return out;
  }

  /**
   * The whole menu as data: header, optional update banner, rows (separators included).
   * state = { app, shell, strings, premium, placement }.
   */
  function buildModel(state, now) {
    var st = state || {};
    var app = st.app || {};
    var shell = st.shell || {};
    var S = st.strings || {};
    var hints = app.hints || {};
    var t = Number(now) || Date.now();
    var rows = [];

    var header = {
      name: app.name || "Descall",
      avatarUrl: app.avatarUrl || "",
      initial: initialOf(app.name || "Descall"),
      status: STATUSES.indexOf(app.status) >= 0 ? app.status : "online",
      statusText: app.statusText || statusLabel(S, app.status),
      version: shell.version ? "v" + String(shell.version) : "",
      signedIn: Boolean(app.signedIn),
    };

    if (shell.updateVersion) {
      rows.push({
        kind: "banner",
        id: "update",
        label: tr(S, "updateReady", { version: shell.updateVersion }),
        button: tr(S, "restart"),
        icon: "arrowUp",
        enabled: true,
        action: { action: "update" },
      });
    }

    rows.push({ kind: "item", id: "open", label: tr(S, "open"), icon: "open", hint: hints.open || "", enabled: true, action: { action: "open" } });

    if (app.signedIn) {
      var status = header.status;
      rows.push({
        kind: "submenu",
        id: "status",
        label: tr(S, "statusRow", { status: statusLabel(S, status) }),
        icon: "status-" + status,
        enabled: true,
        children: STATUSES.map(function (s) {
          return { kind: "radio", id: "status:" + s, label: statusLabel(S, s), icon: "status-" + s, enabled: true, checked: s === status, action: { action: "status", arg: s } };
        }),
      });
    }

    var snoozeLeft = Number(shell.snoozeUntil) > t ? Number(shell.snoozeUntil) - t : 0;
    rows.push({
      kind: "submenu",
      id: "snooze",
      label: snoozeLeft ? tr(S, "notificationsMuted") : tr(S, "notifications"),
      sub: snoozeLeft ? tr(S, "remaining", { time: formatRemaining(snoozeLeft, S) }) : "",
      icon: snoozeLeft ? "bellOff" : "bell",
      active: Boolean(snoozeLeft),
      enabled: true,
      children: [
        { kind: "item", id: "snooze:30", label: tr(S, "for30"), icon: "clock", enabled: true, action: { action: "snooze", arg: 30 } },
        { kind: "item", id: "snooze:60", label: tr(S, "for1h"), icon: "clock", enabled: true, action: { action: "snooze", arg: 60 } },
        { kind: "item", id: "snooze:480", label: tr(S, "for8h"), icon: "clock", enabled: true, action: { action: "snooze", arg: 480 } },
        { kind: "separator" },
        { kind: "item", id: "snooze:0", label: tr(S, "snoozeOff"), icon: "bell", enabled: Boolean(snoozeLeft), action: { action: "snooze", arg: 0 } },
      ],
    });

    if (app.signedIn) {
      rows.push({ kind: "separator" });
      rows.push({
        kind: "check",
        id: "mute",
        label: app.micMuted ? tr(S, "micOn") : tr(S, "micOff"),
        icon: app.micMuted ? "micOff" : "mic",
        hint: hints.mute || "",
        dim: !app.inCall,
        alert: Boolean(app.micMuted),
        checked: Boolean(app.micMuted),
        enabled: true,
        action: { action: "mute" },
      });
      rows.push({
        kind: "check",
        id: "deafen",
        label: app.deafened ? tr(S, "undeafen") : tr(S, "deafen"),
        icon: app.deafened ? "headphonesOff" : "headphones",
        hint: hints.deafen || "",
        dim: !app.inCall,
        alert: Boolean(app.deafened),
        checked: Boolean(app.deafened),
        enabled: true,
        action: { action: "deafen" },
      });
      // Out of a call the two toggles change the preference the next call starts with.
      if (!app.inCall) rows.push({ kind: "note", id: "voice-note", label: tr(S, "nextCall"), icon: "info" });
      if (app.clipAvailable) {
        rows.push({ kind: "item", id: "clip", label: tr(S, "clip"), icon: "clip", hint: hints.clip || "", enabled: true, action: { action: "clip" } });
      }
      rows.push({ kind: "separator" });
      rows.push({
        kind: "item",
        id: "messages",
        label: tr(S, "messages"),
        icon: "chat",
        badge: app.unreadMessages > 0 ? { text: badgeText(app.unreadMessages), tone: "red", aria: tr(S, "unread", { count: app.unreadMessages }) } : null,
        enabled: true,
        action: { action: "openDms" },
      });
      rows.push({
        kind: "item",
        id: "requests",
        label: tr(S, "friendRequests"),
        icon: "userPlus",
        badge: app.friendRequests > 0 ? { text: badgeText(app.friendRequests), tone: "accent", aria: tr(S, "pending", { count: app.friendRequests }) } : null,
        enabled: true,
        action: { action: "openRequests" },
      });
    }

    var plus = premiumRows(st.premium, 0);
    if (plus.length) {
      rows.push({ kind: "separator" });
      rows.push({ kind: "group", id: "premium-group", label: tr(S, "premium") });
      plus.forEach(function (r) { rows.push(r); });
    }

    rows.push({ kind: "separator" });
    rows.push({
      kind: "switch",
      id: "autostart",
      label: tr(S, shell.autostartKey === "startAtLogin" ? "startAtLogin" : "startWithWindows"),
      icon: "power",
      checked: Boolean(shell.autostart),
      enabled: true,
      action: { action: "autostart" },
    });
    rows.push({ kind: "item", id: "settings", label: tr(S, "settings"), icon: "gear", enabled: true, action: { action: "settings" } });
    rows.push({
      kind: "item",
      id: "quit",
      label: shell.updateVersion ? tr(S, "updateAndQuit", { version: shell.updateVersion }) : tr(S, "quit"),
      icon: "quit",
      danger: true,
      enabled: true,
      action: { action: shell.updateVersion ? "update" : "quit" },
    });

    // No separator at the edges or twice in a row.
    var clean = [];
    rows.forEach(function (r) {
      if (r.kind === "separator" && (!clean.length || clean[clean.length - 1].kind === "separator")) return;
      clean.push(r);
    });
    while (clean.length && clean[clean.length - 1].kind === "separator") clean.pop();

    return { header: header, rows: clean };
  }

  // ---- keyboard model ------------------------------------------------------------------

  var FOCUSABLE = { item: 1, check: 1, radio: 1, submenu: 1, switch: 1, banner: 1 };

  function focusables(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (r && FOCUSABLE[r.kind] && r.enabled !== false) out.push(r.id);
    });
    return out;
  }

  function findRow(rows, id) {
    for (var i = 0; i < (rows || []).length; i++) if (rows[i] && rows[i].id === id) return rows[i];
    return null;
  }

  function step(list, current, delta) {
    if (!list.length) return null;
    var i = list.indexOf(current);
    if (i < 0) return delta > 0 ? list[0] : list[list.length - 1];
    return list[(i + delta + list.length) % list.length];
  }

  /** The child to focus when a submenu opens: the checked one, else the first. */
  function entryChild(row) {
    var kids = (row && row.children) || [];
    for (var i = 0; i < kids.length; i++) if (kids[i].checked && kids[i].enabled !== false && FOCUSABLE[kids[i].kind]) return kids[i].id;
    var list = focusables(kids);
    return list.length ? list[0] : null;
  }

  /**
   * One key press. nav = { focus, open, sub } (row ids). ctx = { rows, flyout: "left"|"right" }.
   * Returns { nav, activate (row id or null), close (panel), handled }.
   */
  function reduceKey(nav, key, ctx) {
    var n = { focus: nav && nav.focus || null, open: nav && nav.open || null, sub: nav && nav.sub || null };
    var rows = (ctx && ctx.rows) || [];
    var flyout = ctx && ctx.flyout === "left" ? "left" : "right";
    var main = focusables(rows);
    var openRow = n.open ? findRow(rows, n.open) : null;
    var inSub = Boolean(openRow && n.sub);
    var subList = openRow ? focusables(openRow.children) : [];
    var res = { nav: n, activate: null, close: false, handled: true };
    var focusedRow = findRow(rows, n.focus);

    function openSub(row) {
      n.open = row.id;
      n.focus = row.id;
      n.sub = entryChild(row);
    }
    function closeSub() {
      if (n.open) n.focus = n.open;
      n.open = null;
      n.sub = null;
    }

    switch (key) {
      case "ArrowDown":
      case "Tab":
        if (inSub) n.sub = step(subList, n.sub, 1);
        else { n.focus = step(main, n.focus, 1); n.open = null; n.sub = null; }
        break;
      case "ArrowUp":
      case "Shift+Tab":
        if (inSub) n.sub = step(subList, n.sub, -1);
        else { n.focus = step(main, n.focus, -1); n.open = null; n.sub = null; }
        break;
      case "Home":
      case "PageUp":
        if (inSub) n.sub = subList[0] || null;
        else { n.focus = main[0] || null; n.open = null; n.sub = null; }
        break;
      case "End":
      case "PageDown":
        if (inSub) n.sub = subList[subList.length - 1] || null;
        else { n.focus = main[main.length - 1] || null; n.open = null; n.sub = null; }
        break;
      case "ArrowRight":
        if (inSub) { if (flyout === "left") closeSub(); }
        else if (focusedRow && focusedRow.kind === "submenu" && focusedRow.enabled !== false) openSub(focusedRow);
        else res.handled = false;
        break;
      case "ArrowLeft":
        if (inSub) { if (flyout === "right") closeSub(); }
        else if (focusedRow && focusedRow.kind === "submenu" && flyout === "left" && focusedRow.enabled !== false) openSub(focusedRow);
        else res.handled = false;
        break;
      case "Enter":
      case " ":
        if (inSub) res.activate = n.sub;
        else if (focusedRow && focusedRow.kind === "submenu") { if (focusedRow.enabled !== false) openSub(focusedRow); }
        else if (focusedRow) res.activate = focusedRow.id;
        break;
      case "Escape":
        if (n.open) closeSub();
        else res.close = true;
        break;
      default:
        res.handled = false;
    }
    res.nav = n;
    return res;
  }

  /** Type-ahead: the next row (after the focused one) whose label starts with ch. */
  function typeahead(rows, current, ch) {
    var c = String(ch || "").toLocaleLowerCase();
    if (!c || c.length !== 1 || c === " ") return null;
    var list = (rows || []).filter(function (r) { return r && FOCUSABLE[r.kind] && r.enabled !== false; });
    if (!list.length) return null;
    var start = 0;
    for (var i = 0; i < list.length; i++) if (list[i].id === current) start = i + 1;
    for (var k = 0; k < list.length; k++) {
      var r = list[(start + k) % list.length];
      if (String(r.label || "").trim().toLocaleLowerCase().indexOf(c) === 0) return r.id;
    }
    return null;
  }

  /** Top of a flyout next to a row: aligned with it, kept inside [pad, height - pad]. */
  function flyoutTop(rowTop, flyoutHeight, windowHeight, pad) {
    var p = Number(pad) || 0;
    var maxTop = Math.max(p, windowHeight - p - flyoutHeight);
    return Math.round(Math.max(p, Math.min(maxTop, rowTop - 6)));
  }

  var api = {
    STATUSES: STATUSES,
    interpolate: interpolate,
    tr: tr,
    badgeText: badgeText,
    formatRemaining: formatRemaining,
    initialOf: initialOf,
    buildModel: buildModel,
    focusables: focusables,
    findRow: findRow,
    entryChild: entryChild,
    reduceKey: reduceKey,
    typeahead: typeahead,
    flyoutTop: flyoutTop,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DescallTrayCore = api;
})(typeof window !== "undefined" ? window : globalThis);
