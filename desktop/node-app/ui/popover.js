/* Descall Node tray popover. The app (src/popover.rs) sends a ready view model built by
   descall_node::view (every label already formatted, tr / en); this page only lays it out,
   sends the owner's clicks back and previews the capacity while a slider moves.
   Without Tauri (screenshots, tests) it reads window.__NODE_MOCK__. */
(function () {
  "use strict";

  var T = window.__TAURI__;
  var mock = window.__NODE_MOCK__ || null;
  var bridge = T && T.core ? {
    state: function () { return T.core.invoke("node_state"); },
    act: function (action) { return T.core.invoke("node_act", { action: action }); },
    cfg: function (patch) { return T.core.invoke("node_cfg", { patch: patch }); },
    setupSave: function (values, skip) { return T.core.invoke("node_setup_save", { values: values, skipBootstrap: Boolean(skip) }); },
    setupRefresh: function () { return T.core.invoke("node_setup_refresh"); },
    setupWipe: function () { return T.core.invoke("node_setup_wipe"); },
    autostart: function (on) { return T.core.invoke("node_autostart", { on: on }); },
    logs: function () { return T.core.invoke("node_logs"); },
    resize: function (h) { return T.core.invoke("node_resize", { height: h }); },
    onState: function (cb) { return T.event.listen("node:state", function (e) { cb(e.payload); }); },
  } : {
    state: function () { return Promise.resolve(mock && mock.state); },
    act: function () { return Promise.resolve(); },
    cfg: function () { return Promise.resolve(); },
    setupSave: function () { return Promise.resolve({ ok: true, fetched: 41 }); },
    setupRefresh: function () { return Promise.resolve((mock && mock.refresh) || { ok: true, fetched: 41 }); },
    setupWipe: function () { return Promise.resolve(); },
    autostart: function () { return Promise.resolve(); },
    logs: function () { return Promise.resolve((mock && mock.logs) || []); },
    resize: function () { return Promise.resolve(); },
    onState: function () {},
  };

  var $ = function (id) { return document.getElementById(id); };
  var S = {}; // strings of the current language
  var current = null;
  var viewName = "main";
  var dragging = { ram: false, cpu: false };
  var cfgTimer = null;
  var wipeArmed = 0;
  var autoSetupShown = false;
  var advOpen = null; // the "Gelişmiş (elle gir)" section, kept open across re-renders
  var setupBusy = false;
  var setupErrKey = null; // the last save / refresh error stays until the next try

  function s(key, args) {
    var v = Object.prototype.hasOwnProperty.call(S, key) ? S[key] : key;
    if (args) Object.keys(args).forEach(function (k) { v = v.split("{" + k + "}").join(String(args[k])); });
    return v;
  }
  function text(id, v) { var el = $(id); if (el && el.textContent !== v) el.textContent = v == null ? "" : v; }
  function tr() { return (current && current.view && current.view.lang || "tr").indexOf("tr") === 0; }
  function grouped(n) {
    var sep = tr() ? "." : ",";
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }
  function gb1(mb) { var v = (mb / 1024).toFixed(1); return (tr() ? v.replace(".", ",") : v) + " GB"; }

  /* Same formula as descall_node::capacity::estimate_users and the admin panel. */
  function estimate(ramMb, cap) {
    var usable = ramMb * (cap.headroom || 0.85) - cap.baseMb;
    if (usable <= 0) return 0;
    return Math.floor(usable / cap.perUserMb);
  }

  function show(name) {
    viewName = name;
    if (name !== "setup") setupErrKey = null;
    ["main", "setup", "logs"].forEach(function (n) { $("view-" + n).hidden = n !== name; });
    if (name === "setup") renderSetup();
    if (name === "logs") loadLogs();
    fit();
  }

  function fit() {
    requestAnimationFrame(function () {
      var h = Math.ceil($("card").scrollHeight);
      bridge.resize(h);
    });
  }

  /* ---------------- main view ---------------- */

  function renderMain(v) {
    document.documentElement.lang = v.lang;
    text("title", v.title);
    text("host", v.host);
    $("pill").dataset.tone = v.pill.tone;
    $("trayIc").dataset.tone = v.tone;
    text("pillText", v.pill.label);
    var err = $("error");
    err.hidden = !v.error;
    text("error", v.error || "");

    var g = v.gauges;
    text("gRamLabel", g.ram.label); text("gRam", g.ram.value); $("gRamBar").style.width = g.ram.pct + "%";
    text("gCpuLabel", g.cpu.label); text("gCpu", g.cpu.value); $("gCpuBar").style.width = g.cpu.pct + "%";
    text("gConnLabel", g.conns.label); text("gConn", g.conns.value); text("gConnSub", g.conns.sub);
    $("spark").setAttribute("points", v.spark || "");

    var sl = v.sliders;
    text("sRamLabel", s("slider.ram"));
    text("sCpuLabel", s("slider.cpu"));
    if (!dragging.ram) { $("sRam").value = sl.ramMb; text("sRamValue", sl.ramLabel); text("capacity", sl.capacityLabel); }
    if (!dragging.cpu) { $("sCpu").value = sl.cores; text("sCpuValue", sl.coresLabel); }
    text("syncHint", sl.syncHint);

    renderToggle("tGame", v.game);
    renderToggle("tSched", v.schedule);

    var box = $("buttons");
    box.className = "grid " + (v.buttons.length === 1 ? "g1" : v.buttons.length === 2 ? "g2" : "g3");
    box.style.gridTemplateColumns = "repeat(" + v.buttons.length + ", 1fr)";
    var html = v.buttons.map(function (b) {
      return '<button type="button" class="btn' + (b.primary ? " p" : "") + '" data-act="' + b.id + '"' + (b.disabled ? " disabled" : "") + "></button>";
    }).join("");
    if (box.dataset.sig !== html) { box.innerHTML = html; box.dataset.sig = html; }
    Array.prototype.forEach.call(box.children, function (el, i) { el.textContent = v.buttons[i].label; });

    text("footerText", v.footer.text);
    text("footerBadge", v.footer.badge);
    $("nTunnelDot").dataset.tone = v.net.tunnel.tone; text("nTunnel", v.net.tunnel.label + " " + v.net.tunnel.text);
    $("nKvDot").dataset.tone = v.net.kv.tone; text("nKv", v.net.kv.label + " " + v.net.kv.text);
    text("lLogs", s("link.logs"));
    text("lSetup", s("link.settings"));
  }

  function renderToggle(id, t) {
    var el = $(id);
    el.setAttribute("aria-checked", t.on ? "true" : "false");
    $(id + "Sw").classList.toggle("off", !t.on);
    text(id + "Label", t.label);
    text(id + "Hint", t.hint);
  }

  function apply(state) {
    if (!state) return;
    current = state;
    S = state.strings || S;
    renderMain(state.view);
    if (viewName === "main" && state.view.needsSetup && !autoSetupShown) {
      autoSetupShown = true;
      show("setup");
      return;
    }
    if (viewName === "setup" && !$("setupForm").dataset.dirty) renderSetup();
    fit();
  }

  function sendCfg(patch) {
    clearTimeout(cfgTimer);
    cfgTimer = setTimeout(function () { bridge.cfg(patch); }, 250);
  }

  $("sRam").addEventListener("input", function (e) {
    dragging.ram = true;
    var mb = Number(e.target.value);
    text("sRamValue", gb1(mb));
    if (current) text("capacity", s("slider.capacity", { n: grouped(estimate(mb, current.view.sliders.capacity)) }));
  });
  $("sRam").addEventListener("change", function (e) { dragging.ram = false; sendCfg({ ramMb: Number(e.target.value) }); });
  $("sCpu").addEventListener("input", function (e) { dragging.cpu = true; text("sCpuValue", s("slider.cores", { n: e.target.value })); });
  $("sCpu").addEventListener("change", function (e) { dragging.cpu = false; sendCfg({ cores: Number(e.target.value) }); });

  function toggle(id, key) {
    $(id).addEventListener("click", function () {
      var on = $(id).getAttribute("aria-checked") !== "true";
      $(id).setAttribute("aria-checked", on ? "true" : "false");
      $(id + "Sw").classList.toggle("off", !on);
      var patch = {}; patch[key] = on;
      bridge.cfg(patch);
    });
  }
  toggle("tGame", "gameModeEnabled");
  toggle("tSched", "scheduleEnabled");

  $("buttons").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    var a = b.dataset.act;
    if (a === "setup") return show("setup");
    if (a === "logs") return show("logs");
    b.disabled = true;
    bridge.act(a).finally(function () { b.disabled = false; });
  });
  $("lLogs").addEventListener("click", function (e) { e.preventDefault(); show("logs"); });
  $("lSetup").addEventListener("click", function (e) { e.preventDefault(); show("setup"); });

  /* ---------------- setup view ---------------- */

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  function renderSetup(errors) {
    if (!current) return;
    var st = current.setup || { fields: [], complete: false };
    var boot = current.bootstrap || {};
    var first = !st.complete && !current.configuredOnce;
    text("setupTitle", s(first ? "setup.title" : "setup.titleEdit"));
    var missing = st.fields.filter(function (f) { return f.required && !f.set; }).length;
    text("setupMissing", missing ? s("setup.missing", { n: missing }) : current.view.host);
    text("setupIntro", s("setup.intro"));
    var byGroup = function (g) { return st.fields.filter(function (f) { return f.group === g; }); };
    var advErr = errors && byGroup("advanced").some(function (f) { return errors[f.id]; });
    if (advOpen === null) advOpen = Boolean(boot.skip);
    if (advErr) advOpen = true;
    var form = $("setupForm");
    form.innerHTML =
      '<div class="group"><div class="xs mut">' + esc(s("setup.group.connection")) + "</div>" +
        byGroup("connection").map(function (f) { return fieldHtml(f, errors && errors[f.id]); }).join("") + "</div>" +
      autoHtml(byGroup("auto")[0], boot) +
      '<details class="adv"' + (advOpen ? " open" : "") + '><summary class="small">' + esc(s("setup.group.advanced")) + "</summary>" +
        '<p class="xs mut">' + esc(s("setup.advancedHint")) + "</p>" +
        '<label class="row sp small skip"><span>' + esc(s("setup.skipBootstrap")) + '</span><button type="button" class="sw' + (boot.skip ? "" : " off") + '" id="skipSw" role="switch" aria-checked="' + (boot.skip ? "true" : "false") + '"></button></label>' +
        byGroup("advanced").map(function (f) { return fieldHtml(f, errors && errors[f.id]); }).join("") +
      "</details>";
    delete form.dataset.dirty;
    form.dataset.skip = boot.skip ? "1" : "";
    text("autostartLabel", s("setup.autostart"));
    $("autostartSw").classList.toggle("off", !current.autostart);
    $("autostartSw").setAttribute("aria-checked", current.autostart ? "true" : "false");
    text("setupWipe", wipeArmed > Date.now() ? s("setup.wipeConfirm").split(".")[0] + "?" : s("setup.wipe"));
    text("setupCancel", s("setup.cancel"));
    text("setupSave", setupBusy ? s("setup.saving") : s(first ? "setup.save" : "setup.saveEdit"));
    $("setupSave").disabled = setupBusy;
    $("setupCancel").disabled = first && !st.complete;
    // A revoked key (or another error) says why the setup is open.
    var se = $("setupError");
    var msg = setupErrKey ? s(setupErrKey) : current.view.error || "";
    se.hidden = !msg;
    se.textContent = msg;
  }

  /* The environment from the primary: how many settings, when, and the refresh action. */
  function autoHtml(f, boot) {
    if (!f) return "";
    var line;
    if (boot.skip) line = s("setup.auto.skipped");
    else if (f.set && boot.at) line = s("setup.auto.got", { n: f.count, when: whenText(boot.at) });
    else if (f.set) line = s("setup.auto.gotNoTime", { n: f.count });
    else line = s("setup.auto.none");
    var canRefresh = !boot.skip && current.configuredOnce;
    return '<div class="group auto"><div class="xs mut">' + esc(s("setup.group.auto")) + "</div>" +
      '<div class="field autof"><div class="row sp"><span class="small' + (f.set && !boot.skip ? " okline" : "") + '" id="autoLine">' + esc(line) + "</span>" +
      (canRefresh ? '<button type="button" class="btn mini" id="setupRefresh"' + (setupBusy ? " disabled" : "") + ">" + esc(s("setup.refresh")) + "</button>" : "") +
      '</div><div class="xs mut hint" id="autoNote" hidden></div></div></div>';
  }

  function whenText(ms) {
    try {
      return new Date(ms).toLocaleString(tr() ? "tr-TR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function fieldHtml(f, err) {
    var state = f.set ? '<span class="state set">' + esc(f.id === "extraEnv" && f.count ? s("setup.count", { n: f.count }) : s("setup.set")) + "</span>"
      : f.required ? '<span class="state req">' + esc(s("setup.required")) + "</span>"
      : '<span class="state unset">' + esc(s("setup.notSet")) + "</span>";
    var secretSet = f.secret && f.set;
    var control;
    if (f.id === "extraEnv") {
      control = '<textarea data-id="' + f.id + '"' + (secretSet ? " hidden" : "") + ' placeholder="KEY=value"></textarea>';
    } else {
      // A default (the Render primary URL) is filled in and saved with the form until changed.
      var shown = f.secret ? "" : (f.value || f["default"] || "");
      control = '<input data-id="' + f.id + '" type="' + (f.secret ? "password" : "text") + '"' + (secretSet ? " hidden" : "") +
        ' value="' + esc(shown) + '" data-orig="' + esc(f.secret ? "" : f.value) + '">';
    }
    var actions = secretSet ? '<span class="row" style="gap:6px"><button type="button" class="btn mini" data-replace="' + f.id + '">' + esc(s("setup.replace")) + "</button>" +
      (f.required ? "" : '<button type="button" class="btn mini d" data-clear="' + f.id + '">' + esc(s("setup.clear")) + "</button>") + "</span>" : "";
    return '<div class="field' + (err ? " bad" : "") + '" data-field="' + f.id + '"><div class="row sp"><b class="small">' + esc(s("setup.f." + f.id)) + "</b>" +
      '<span class="row" style="gap:8px">' + state + actions + "</span></div>" + control +
      '<div class="xs mut hint">' + esc(s("setup.h." + f.id)) + "</div>" + (err ? '<div class="err">' + esc(s(err)) + "</div>" : "") + "</div>";
  }

  $("setupForm").addEventListener("input", function () { $("setupForm").dataset.dirty = "1"; });
  $("setupForm").addEventListener("toggle", function (e) {
    if (e.target.classList && e.target.classList.contains("adv")) { advOpen = e.target.open; fit(); }
  }, true);
  $("setupForm").addEventListener("click", function (e) {
    var sw = e.target.closest("#skipSw");
    if (sw) {
      var on = sw.classList.contains("off");
      sw.classList.toggle("off", !on);
      sw.setAttribute("aria-checked", on ? "true" : "false");
      $("setupForm").dataset.skip = on ? "1" : "";
      $("setupForm").dataset.dirty = "1";
      return;
    }
    if (e.target.closest("#setupRefresh")) { refreshFromServer(); return; }
    var rep = e.target.closest("[data-replace]");
    var clr = e.target.closest("[data-clear]");
    if (rep) {
      var inp = $("setupForm").querySelector('[data-id="' + rep.dataset.replace + '"]');
      inp.hidden = false; inp.dataset.touched = "1"; inp.focus(); rep.hidden = true;
      $("setupForm").dataset.dirty = "1"; fit();
    }
    if (clr) {
      var c = $("setupForm").querySelector('[data-id="' + clr.dataset.clear + '"]');
      c.value = ""; c.dataset.touched = "1"; c.dataset.cleared = "1";
      clr.closest(".field").querySelector(".state").textContent = s("setup.notSet");
      $("setupForm").dataset.dirty = "1";
    }
  });
  $("autostartSw").addEventListener("click", function () {
    var on = $("autostartSw").classList.contains("off");
    $("autostartSw").classList.toggle("off", !on);
    bridge.autostart(on);
  });
  $("setupCancel").addEventListener("click", function () { show("main"); });
  function setBusy(on) {
    setupBusy = on;
    $("setupSave").disabled = on;
    var first = current && !(current.setup || {}).complete && !current.configuredOnce;
    text("setupSave", on ? s("setup.saving") : s(first ? "setup.save" : "setup.saveEdit"));
    var r = $("setupRefresh");
    if (r) { r.disabled = on; r.textContent = on ? s("setup.refreshing") : s("setup.refresh"); }
  }

  function showSetupError(key) {
    setupErrKey = key || null;
    var se = $("setupError");
    se.hidden = !key;
    se.textContent = key ? s(key) : "";
    fit();
  }

  $("setupSave").addEventListener("click", function () {
    if (setupBusy) return;
    var values = {};
    Array.prototype.forEach.call($("setupForm").querySelectorAll("[data-id]"), function (el) {
      var id = el.dataset.id;
      if (el.hidden && !el.dataset.cleared) return;
      if (el.dataset.cleared) { values[id] = ""; return; }
      var v = el.value;
      if (el.type === "password" || el.tagName === "TEXTAREA") { if (v.trim()) values[id] = v; return; }
      if (v !== (el.dataset.orig || "")) values[id] = v;
    });
    var skip = $("setupForm").dataset.skip === "1";
    showSetupError(null);
    setBusy(true);
    bridge.setupSave(values, skip).then(function (r) {
      setBusy(false);
      if (r && r.ok) {
        // Typed secrets leave the page right away.
        Array.prototype.forEach.call($("setupForm").querySelectorAll("input,textarea"), function (el) { el.value = ""; });
        if (r.state) apply(r.state);
        show("main");
      } else {
        renderSetup(r && r.errors);
        if (r && r.error) showSetupError(r.error);
        fit();
      }
    }, function () {
      setBusy(false);
      showSetupError("setup.err.bootstrapServer");
    });
  });

  /* "Ayarları sunucudan yenile": the key's setup window must be open on the primary. */
  function refreshFromServer() {
    if (setupBusy) return;
    showSetupError(null);
    setBusy(true);
    bridge.setupRefresh().then(function (r) {
      setBusy(false);
      if (r && r.ok) {
        var note = $("autoNote");
        if (note) { note.hidden = false; note.textContent = s("setup.refreshed", { n: r.fetched }); }
        fit();
      } else {
        showSetupError((r && r.error) || "setup.err.bootstrapServer");
      }
    }, function () {
      setBusy(false);
      showSetupError("setup.err.bootstrapServer");
    });
  }
  $("setupWipe").addEventListener("click", function () {
    if (wipeArmed > Date.now()) {
      wipeArmed = 0;
      bridge.setupWipe().then(function () { return bridge.state(); }).then(function (st) { apply(st); renderSetup(); });
      return;
    }
    wipeArmed = Date.now() + 5000;
    var se = $("setupError");
    se.hidden = false;
    se.textContent = s("setup.wipeConfirm");
    text("setupWipe", s("setup.wipe") + " ?");
    fit();
    setTimeout(function () { if (wipeArmed && wipeArmed <= Date.now()) { text("setupWipe", s("setup.wipe")); se.hidden = true; fit(); } }, 5100);
  });

  /* ---------------- logs view ---------------- */

  function loadLogs() {
    text("logsTitle", s("logs.title"));
    text("logsHint", s("logs.hint"));
    text("logsBack", s("logs.back"));
    text("logsOpen", s("logs.open"));
    text("logsRefresh", s("logs.refresh"));
    bridge.logs().then(function (lines) {
      var box = $("logLines");
      if (!lines || !lines.length) { box.textContent = s("logs.empty"); return; }
      box.innerHTML = lines.map(function (l) {
        var lv = l.indexOf("] [error]") > 0 ? "lv-error" : l.indexOf("] [warn]") > 0 ? "lv-warn" : "";
        return '<span class="' + lv + '">' + esc(l) + "</span>";
      }).join("\n");
      box.scrollTop = box.scrollHeight;
    });
  }
  $("logsBack").addEventListener("click", function () { show("main"); });
  $("logsRefresh").addEventListener("click", loadLogs);
  $("logsOpen").addEventListener("click", function () { bridge.act("openLogs"); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (viewName !== "main" && !(current && current.view.needsSetup)) show("main");
      else bridge.act("close");
    }
  });
  document.addEventListener("contextmenu", function (e) { if (!e.target.closest("input,textarea,pre")) e.preventDefault(); });

  bridge.onState(apply);
  bridge.state().then(function (st) {
    apply(st);
    var q = new URLSearchParams(location.search).get("view");
    if (q === "setup" || q === "logs") show(q);
    if (st && st.openView) show(st.openView);
  });
})();
