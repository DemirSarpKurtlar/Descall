/* Descall Setup UI (draft B, "wide cinematic window").
   The Rust host drives a single model through window.__setup.patch(...) and receives user intent
   through window.ipc.postMessage(JSON). Without a host (Chromium preview) a demo backend plays the
   same messages, so every screen and state can be rendered headless. */
(function () {
  "use strict";
  const { LANGS, S, trLocative, pick } = window.SetupI18n;
  const { ic, symbol, wordmark } = window.SetupIcons;
  const params = new URLSearchParams(location.search);
  const HOST = !!(window.ipc && window.ipc.postMessage);
  const MB = 1048576, GB = 1073741824;
  const LINKS = {
    license: { tr: "https://descall.com/kosullar", "*": "https://descall.com/terms" },
    privacy: { tr: "https://descall.com/gizlilik", "*": "https://descall.com/privacy" },
    support: { tr: "https://descall.com/iletisim", "*": "https://descall.com/contact" },
    offline: { "*": "https://descall.com/download" },
    notes: { "*": "https://github.com/DemirSarpKurtlar/Descall/releases" },
  };

  /* ------------------------------------------------------------------ model */
  const M = {
    screen: "boot", lang: "en", version: "4.0.0", arch: "x64", publisher: "Descall",
    dir: "", need: 0, free: 0, drive: "C:",
    sys: { os: "Windows 11", osOk: true, wvOk: true, diskOk: true },
    opts: { autostart: true, desktop: true, autoUpdate: true },
    existing: null,
    metrics: { download: 18.4 * MB, launch: 0.8, memory: -0.52 },
    dl: { phase: "connect", paused: false, embedded: false, part: 0, parts: 0, got: 0, total: 0, speed: 0, eta: null, server: null, files: { done: 0, total: 0 }, verify: 0, stepPct: 0 },
    err: null, done: null, mig: null, upd: null,
    log: [], logPath: "",
    ui: { menu: false, hover: null, confirm: false, slide: 0, details: false, copied: false },
  };
  let L = S.en;
  let built = "";
  let logSeq = 0;
  const bindCache = new Map();

  /* ------------------------------------------------------------- helpers */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tag = () => (M.lang === "pt-BR" ? "pt-BR" : M.lang);
  function raw(key) { return (L[key] != null ? L[key] : S.en[key] != null ? S.en[key] : key); }
  /** Escaped text; args are plain text and get escaped. */
  function t(key, args) {
    return esc(raw(key)).replace(/\{(\w+)\}/g, (m, k) => (args && args[k] != null ? esc(args[k]) : m));
  }
  /** Escaped template whose args are already HTML. */
  function th(key, args) {
    return esc(raw(key)).replace(/\{(\w+)\}/g, (m, k) => (args && args[k] != null ? String(args[k]) : m));
  }
  /** Keys ending in _html: [[link]] and **bold** markup, everything else escaped. */
  function rich(key, links, args) {
    let i = 0;
    return th(key, args)
      .replace(/\[\[(.+?)\]\]/g, (m, x) => `<a class="link" data-act="url" data-arg="${esc(links[i++] || "")}">${x}</a>`)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  const nf = new Map();
  function num(v, d) {
    const k = tag() + d;
    if (!nf.has(k)) nf.set(k, new Intl.NumberFormat(tag(), { minimumFractionDigits: d, maximumFractionDigits: d }));
    return nf.get(k).format(v);
  }
  function mbv(bytes, d) { const v = (bytes || 0) / MB; return num(v, d == null ? (v >= 100 ? 0 : 1) : d); }
  function size(bytes, d) { return mbv(bytes, d) + " " + raw("mb"); }
  function gbv(bytes) { const v = (bytes || 0) / GB; return num(v, v >= 10 ? 0 : 1) + " " + raw("gb"); }
  function pctStr(p) { return new Intl.NumberFormat(tag(), { style: "percent", maximumFractionDigits: 0 }).format((p || 0) / 100); }
  function pctHtml(p) {
    return new Intl.NumberFormat(tag(), { style: "percent", maximumFractionDigits: 0 }).formatToParts((p || 0) / 100)
      .map((x) => (x.type === "percentSign" ? `<small>${esc(x.value)}</small>` : x.type === "literal" ? "" : esc(x.value))).join("");
  }
  function pctLoc(p) { return M.lang === "tr" ? pctStr(p) + "'" + trLocative(p) : pctStr(p); }
  /** Rounded percent that only shows 100 once the work is really complete. */
  function shownPct(p) { return p >= 100 ? 100 : Math.min(99, Math.round(p || 0)); }
  /** One number for compact surfaces (toast, migration): download 70 %, verify 5 %, install 25 %. */
  function overallPct() {
    const d = M.dl;
    let p = 0;
    if (d.phase === "download") p = d.total ? (d.got / d.total) * 70 : 0;
    else if (d.phase === "verify") p = 70 + (d.verify || 0) * 5;
    else if (d.phase === "install") p = 75 + (d.files.total ? d.files.done / d.files.total : 0) * 25;
    return shownPct(p);
  }
  function secs(v) { return num(v, v < 10 && v % 1 ? 1 : 0) + " " + raw("sec"); }
  function etaHtml(s) {
    if (s == null || !isFinite(s)) return "–";
    if (s < 60) return `~${num(Math.max(1, Math.round(s)), 0)} <small>${t("sec")}</small>`;
    return `~${num(Math.round(s / 60), 0)} <small>${t("min")}</small>`;
  }
  function shortPath(p) {
    const m = /^([A-Za-z]:\\Users\\)[^\\]+(\\.*)$/.exec(p || "");
    return m ? m[1] + "…" + m[2] : p || "";
  }
  function link(name) { const l = LINKS[name]; return l[M.lang] || l["*"]; }
  function langName(code) { const x = LANGS.find((l) => l[0] === code); return x ? x[2] : code; }
  function hhmmss(d) { return d.toTimeString().slice(0, 8); }
  const send = (cmd, extra) => {
    const msg = Object.assign({ cmd }, extra || {});
    if (HOST) window.ipc.postMessage(JSON.stringify(msg));
    else Demo.handle(msg);
  };
  function merge(dst, src) {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v) && dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])) merge(dst[k], v);
      else dst[k] = v;
    }
  }

  /* ------------------------------------------------------------ art side */
  const ART_BASE = `<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
    <svg class="orbits" viewBox="0 0 420 420"><defs><linearGradient id="oh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#aabeff" stop-opacity="0"/><stop offset="1" stop-color="#aabeff"/></linearGradient></defs>
    <circle cx="210" cy="210" r="86"/><circle cx="210" cy="210" r="128"/><circle cx="210" cy="210" r="172"/><circle cx="210" cy="210" r="208"/>
    <circle class="o-hi" cx="210" cy="210" r="128"/><circle class="o-hi" cx="210" cy="210" r="172" style="animation-duration:14s;animation-direction:reverse"/></svg>`;
  const brandBig = (tag1, tag2) => `<div class="brand"><span class="sym">${symbol()}</span><span class="word">${wordmark("#fff")}</span>
        <p class="tag">${tag1}<br><b>${tag2}</b></p></div>`;
  const brandSmall = (extra) => `<div class="brand" style="margin-top:30px"><span class="sym" style="width:80px;height:80px">${symbol()}</span><span class="word" style="height:22px;margin-top:18px">${wordmark("#fff")}</span>${extra || ""}</div>`;
  const metric = (b, s) => `<div class="metric"><b>${b}</b><span>${s}</span></div>`;

  const SLIDES = [
    { k: "n1", a: 2.6, b: 0.8, unit: "s", w: 31 },
    { k: "n2", a: 410, b: 190, unit: "mb", w: 46 },
    { k: "n3", a: 184, b: 18, unit: "mb", w: 10 },
    { k: "n4", words: true, w: 100 },
    { k: "n5", words: true, w: 100 },
  ];
  function slideVal(sl, v) { return sl.unit === "s" ? secs(v) : num(v, 0) + " " + t("mb"); }
  function slideHtml(i) {
    const sl = SLIDES[i];
    const va = sl.words ? `<b class="word" style="color:rgba(255,255,255,.55)">${t(sl.k + "_v1")}</b>` : `<b style="color:rgba(255,255,255,.55)">${slideVal(sl, sl.a)}</b>`;
    const vb = sl.words ? `<b class="word">${t(sl.k + "_v2")}</b>` : `<b>${slideVal(sl, sl.b)}</b>`;
    return `<div class="slide"><div class="pic"><div class="gpic">
          <div class="col old"><span>${t(sl.k + "_a")}</span><div class="barv"><i style="width:100%"></i></div>${va}</div>
          <div class="col"><span>${t(sl.k + "_b")}</span><div class="barv"><i style="width:${sl.w}%"></i></div>${vb}</div></div></div>
        <div class="t">${t(sl.k + "_t")}</div>
        <div class="d">${t(sl.k + "_d")}</div></div>`;
  }
  function newsCard() {
    const n = SLIDES.length, i = M.ui.slide;
    return `<div class="card-news">
        <div class="hd"><span class="eyebrow" style="color:rgba(235,238,255,.6)">${t("news")}</span><span class="chip acc" data-b="slideno">${i + 1} / ${n}</span></div>
        <div data-b="slide">${slideHtml(i)}</div>
        <div class="nav"><span class="dots" data-b="dots">${dots()}</span><span class="arrows"><span role="button" tabindex="0" data-act="prev" aria-label="‹">${ic("chevl")}</span><span role="button" tabindex="0" data-act="next" aria-label="›">${ic("chevr")}</span></span></div>
      </div>`;
  }
  function dots() { return SLIDES.map((_, j) => `<i class="${j === M.ui.slide ? "on" : ""}" data-act="slide" data-arg="${j}"></i>`).join(""); }

  function artFor(screen) {
    const v = t("version_arch", { v: M.version, arch: M.arch });
    if (screen === "welcome") {
      const m = M.metrics;
      return {
        cls: "art", html: `${brandBig(t("tag1"), t("tag2"))}
      <div class="metrics">${metric(esc(size(m.download, 0)), t("m_setup"))}${metric(esc(secs(m.launch)), t("m_launch"))}${metric(esc(pctStr(m.memory * 100)), t("m_memory"))}</div>
      <div class="foot"><span>${v}</span><span>${t("new_core")}</span></div>`,
      };
    }
    if (screen === "progress") return { cls: "art", html: brandSmall() + newsCard() };
    if (screen === "migration") {
      const c = (M.mig && M.mig.cmp) || { setup: [184, 18], launch: [2.6, 0.8], memory: [410, 190] };
      const row = (label, pair, fmt) => `<div class="row"><span>${t(label)}</span><div class="pair"><i class="o" style="width:100%"></i><i class="n" style="width:${Math.max(4, Math.round((pair[1] / pair[0]) * 100))}%"></i></div><b>${esc(fmt(pair[0], true))} → ${esc(fmt(pair[1]))}</b></div>`;
      const fmb = (x, bare) => num(x, 0) + (bare ? "" : " " + raw("mb"));
      const fs = (x, bare) => num(x, 1) + (bare ? "" : " " + raw("sec"));
      return {
        cls: "art", html: `${brandSmall(`<p class="tag" style="font-size:var(--fs-13)">${t("mg_tag")}</p>`)}
      <div class="cmp">
        <span class="eyebrow" style="color:rgba(235,238,255,.6)">${t("mg_cmp")}</span>
        ${row("mg_setup", c.setup, fmb)}${row("mg_launch", c.launch, fs)}${row("mg_memory", c.memory, fmb)}
      </div>`,
      };
    }
    if (screen === "done") {
      const it = (icon, b, s) => `<div class="it"><span class="k">${ic(icon)}</span><div><b>${t(b)}</b><span>${t(s)}</span></div></div>`;
      return {
        cls: "art", html: `${brandSmall()}
      <div class="newsl">
        <span class="eyebrow" style="color:rgba(235,238,255,.6);margin-bottom:2px">${t("in_release")}</span>
        ${it("rocket", "b1", "b1_d")}${it("cpu", "b2", "b2_d")}${it("video", "b3", "b3_d")}
      </div>`,
      };
    }
    if (screen === "error") {
      const e = M.err || {}, d = M.dl;
      const dlKinds = ["net", "disk", "locked"];
      const tags = dlKinds.includes(e.kind) ? [t("e_tag1"), t("e_tag2")] : [t("tag1"), t("tag2")];
      const parts = d.parts || 0, ready = e.partsReady != null ? e.partsReady : parts;
      return {
        cls: "art dim", html: `${brandBig(tags[0], tags[1])}
      <div class="metrics">${metric(esc(size(e.kept != null ? e.kept : d.got)), t("e_kept"))}${metric(esc(num(ready, 0) + " / " + num(parts, 0)), t("e_parts"))}${metric(esc(size(e.left != null ? e.left : Math.max(0, d.total - d.got))), t("e_left"))}</div>
      <div class="foot"><span>${v}</span><span>${t("e_code", { code: e.code || "" })}</span></div>`,
      };
    }
    return { cls: "art", html: brandBig(t("tag1"), t("tag2")) };
  }

  /* ---------------------------------------------------------- panel side */
  function titlebar(extra) {
    return `<div class="titlebar" data-drag><span class="tb-mark">${symbol()}</span><span class="tb-title">${t("title")}</span><span class="tb-fill"></span>${extra || ""}<button class="tb-btn" data-act="minimize" aria-label="${t("minimize")}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 12h12"/></svg></button><button class="tb-btn tb-close" data-act="close" aria-label="${t("close_window")}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M17 7 7 17M7 7l10 10"/></svg></button></div>`;
  }
  function stepper(states, warn) {
    const names = ["step1", "step2", "step3"];
    return `<div class="stepper">${names.map((n, i) => {
      const st = states[i];
      let num = `<span class="n">${i + 1}</span>`;
      if (st === "ok") num = `<span class="n">${ic("check")}</span>`;
      if (st === "on" && warn && i === 1) num = `<span class="n" style="background:var(--warn);box-shadow:0 0 12px rgba(245,181,74,.5);color:#1a1206">!</span>`;
      return (i ? `<span class="ln"></span>` : "") + `<span class="s${st ? " " + st : ""}">${num}${t(n)}</span>`;
    }).join("")}</div>`;
  }
  const opt = (name, icon, title, sub, on, oiStyle, locked) =>
    `<div class="opt glass-tile" role="switch" tabindex="0" aria-checked="${on}" ${locked ? 'aria-disabled="true"' : `data-act="toggle" data-arg="${name}"`}${oiStyle ? ' style="align-items:center"' : ""}><span class="oi"${oiStyle ? ` style="${oiStyle}"` : ""}>${ic(icon)}</span><div class="tx"><b>${title}</b><span>${sub}</span></div><span class="switch${on ? " on" : ""}" data-b="sw_${name}"></span></div>`;

  function sysTile() {
    const s = M.sys;
    const checks = [s.osOk, s.wvOk, s.diskOk];
    const passed = checks.filter(Boolean).length;
    const ok = passed === checks.length;
    const sub = ok ? esc(`${s.os} · WebView2`) : !s.osOk ? t("sys_os_bad") : !s.diskOk ? t("sys_disk_bad") : t("sys_wv_bad");
    return `<div class="opt glass-tile" style="align-items:center"><span class="oi${ok ? "" : " warn"}"${ok ? ' style="background:var(--ok-soft);color:var(--ok);box-shadow:inset 0 0 0 1px rgba(63,212,154,.25)"' : ""}>${ic("cpu")}</span><div class="tx"><b>${t(ok ? "sys_ok" : "sys_bad")}</b><span>${sub}</span></div><span class="chip ${ok ? "ok" : "warn"}">${ic(ok ? "check" : "alert")}${passed}/${checks.length}</span></div>`;
  }
  const canInstall = () => M.sys.osOk && M.sys.diskOk && !M.dirError;

  function panelWelcome() {
    const up = !!(M.existing && M.existing.version);
    const menu = LANGS.map(([code, short, name]) => {
      const sel = code === M.lang;
      return `<div class="mi${sel ? " sel" : ""}${M.ui.hover === code && !sel ? " hover" : ""}" role="option" tabindex="0" aria-selected="${sel}" data-act="lang" data-arg="${code}"><span class="code">${short}</span>${esc(name)}${sel ? `<span class="sub">${ic("check", "", "width:14px;height:14px;color:var(--accent-hi)")}</span>` : ""}</div>`;
    }).join("");
    const deskKept = !!(M.existing && M.existing.desktopShortcut);
    const tb = `<span class="lang-wrap${M.ui.menu ? " open" : ""}" data-b="langwrap"><span class="select" role="button" tabindex="0" aria-haspopup="listbox" aria-label="${t("language")}" data-act="menu">${ic("globe")}${esc(langName(M.lang))}${ic("chev")}</span>
        <div class="menu" role="listbox">${menu}</div></span>`;
    return {
      tb,
      html: `<div class="content">
        ${stepper(["on", "", ""])}
        <div class="head"><h1 class="h1">${t(up ? "w_h1_up" : "w_h1")}</h1><p>${up ? t("w_p_up", { from: M.existing.version }) : t("w_p")}</p></div>
        <div class="lbl">${t("location")} <span class="quiet">${t("no_admin")}</span></div>
        <div class="field">${ic("folder", "quiet")}<span class="path" data-b="path"></span><button class="btn btn-sm btn-secondary" data-act="browse">${t("browse")}</button></div>
        <div class="disk"><span data-b="need"></span><div class="bar" data-b="diskbar"><i></i></div><span data-b="free"></span></div>
        <div class="lbl">${t("startup")}</div>
        <div class="opts2">
          ${opt("autostart", "power", t("o_auto"), t("o_auto_d"), M.opts.autostart)}
          ${opt("desktop", "monitor", t("o_desk"), deskKept ? t("o_desk_kept") : t("o_desk_d"), M.opts.desktop || deskKept, null, deskKept)}
        </div>
        <div class="opts2" style="margin-top:10px">
          ${opt("autoUpdate", "refresh", t("o_upd"), t("o_upd_d"), M.opts.autoUpdate, "background:rgba(255,255,255,.06);color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--line)")}
          ${sysTile()}
        </div>
      </div>
      <div class="ftr">
        <div class="legal">${rich("legal_html", [link("license"), link("privacy")])}</div>
        <button class="btn btn-lg btn-primary" data-act="install"${canInstall() ? "" : " disabled"}>${t(up ? "update_btn" : "install")}${ic("arrow")}</button>
      </div>`,
    };
  }

  function panelProgress() {
    const d = M.dl;
    const confirm = M.ui.confirm ? `<div class="confirm" role="alertdialog" aria-modal="true"><b>${t("cancel_q")}</b><p>${t("cancel_d")}</p><div class="row"><button class="btn btn-sm btn-ghost" data-act="cancel-no">${t("cancel_no")}</button><button class="btn btn-sm btn-danger" data-act="cancel-yes">${t("cancel_yes")}</button></div></div>` : "";
    const vs = (n, icon, title, sub) => `<div class="vs" data-b="vs${n}"><span class="k" data-b="vk${n}">${ic(icon)}</span><div class="t"><b>${title}</b><span>${sub}</span></div><span class="r" data-b="vr${n}"></span></div>`;
    const busy = d.phase === "download" || d.phase === "connect";
    return {
      tb: "",
      html: `<div class="content" style="padding-bottom:16px">
        ${stepper(["ok", "on", ""])}
        <div class="big"><span class="pct" data-b="pct"></span><span class="what" data-b="what"></span></div>
        <div class="bar lg" data-b="bar"><i></i></div>
        <div class="kv4">
          <div><span>${t("k_got")}</span><b data-b="kv1"></b></div>
          <div><span>${t("k_speed")}</span><b data-b="kv2"></b></div>
          <div><span>${t("k_eta")}</span><b data-b="kv3"></b></div>
          <div><span>${t("k_server")}</span><b data-b="kv4"></b></div>
        </div>
        <div class="vsteps">
          ${vs(1, "download", t("v_dl"), t("v_dl_d"))}
          ${vs(2, "shield", t("v_ver"), t("v_ver_d"))}
          ${vs(3, "package", t("v_inst"), t("v_inst_d", { n: num(d.files.total || 0, 0) }))}
        </div>
        <div class="lbl" style="margin:12px 0 0"><span style="display:flex;align-items:center;gap:7px"><span class="dot live" style="color:var(--ok)"></span>${t("live_log")}</span><span class="quiet copy" role="button" tabindex="0" data-act="copy" data-b="copy">${t("copy")}</span></div>
        <div class="log well" style="margin-top:8px" data-log="live"></div>
      </div>
      <div class="ftr" style="padding-top:12px;padding-bottom:14px">
        <div class="legal">${ic("lock", "", "width:13px;height:13px")} ${t(d.embedded ? "embedded" : "signed", { pub: M.publisher })}</div>
        ${busy ? `<button class="btn btn-ghost" data-act="pause" data-b="pausebtn"></button>` : ""}<button class="btn btn-secondary" data-act="cancel"${d.phase === "install" ? " disabled" : ""}>${t("cancel")}</button>
      </div>${confirm}`,
    };
  }

  function bindProgress() {
    const d = M.dl;
    const dlPct = d.total ? Math.min(100, (d.got / d.total) * 100) : 0;
    let pct = dlPct, what;
    const partNo = num(Math.min(d.parts, Math.max(1, d.part)), 0);
    if (d.phase === "connect") what = `<span class="spinner"></span>${t("p_connect")}`;
    else if (d.phase === "download") what = d.paused ? `${ic("pause")}${t("p_paused", { i: partNo, n: num(d.parts, 0) })}` : `<span class="spinner"></span>${t("p_dl", { i: partNo, n: num(d.parts, 0) })}`;
    else if (d.phase === "verify") { pct = (d.verify || 0) * 100; what = `<span class="spinner"></span>${t("p_verify")}`; }
    else { pct = d.files.total ? (d.files.done / d.files.total) * 100 : 0; what = `<span class="spinner"></span>${t("p_install", { i: num(d.files.done, 0), n: num(d.files.total, 0) })}`; }
    const rp = shownPct(pct);
    const order = { connect: 0, download: 0, verify: 1, install: 2 }[d.phase];
    const spin = '<span class="spinner" style="width:12px;height:12px"></span>';
    const row = (n, icon, pctTxt) => {
      const st = order > n - 1 ? "ok" : order === n - 1 ? "on" : "";
      return {
        ["vs" + n]: { cls: { on: st === "on", ok: st === "ok" } },
        ["vk" + n]: { html: st === "ok" ? ic("check") : st === "on" ? (d.paused ? ic("pause") : spin) : ic(icon) },
        ["vr" + n]: { html: st === "ok" ? `<span class="ok">${t("done_s")}</span>` : st === "on" ? esc(pctTxt) : t("queued") },
      };
    };
    const srv = d.server;
    return Object.assign({
      pct: { html: pctHtml(rp) },
      what: { html: what },
      bar: { w: rp, cls: { paused: !!d.paused } },
      kv1: { html: d.embedded ? `${mbv(d.total)} <small>${t("mb")}</small>` : `${mbv(d.got)} <small>/ ${esc(size(d.total))}</small>` },
      kv2: { html: d.speed && !d.paused ? `${num(d.speed / MB, 1)} <small>${t("mbps")}</small>` : "–" },
      kv3: { html: d.phase === "download" && !d.paused ? etaHtml(d.eta) : "–" },
      kv4: { html: srv ? `${esc(srv.label)} <small>${num(srv.ms, 0)} ${t("ms")}</small>` : "–" },
      pausebtn: { html: d.paused ? `${ic("play")}${t("resume")}` : `${ic("pause")}${t("pause")}` },
      copy: { text: M.ui.copied ? raw("copied") : raw("copy"), cls: { ok: !!M.ui.copied } },
    }, row(1, "download", pctStr(shownPct(dlPct))), row(2, "shield", pctStr(shownPct((d.verify || 0) * 100))), row(3, "package", pctStr(rp)));
  }

  function panelDone() {
    const dn = M.done || {};
    const chip = (ok, txt) => (ok ? `<span class="chip ok">${ic("check")}${txt}</span>` : `<span class="quiet">${txt}</span>`);
    const desk = dn.desktop === "kept" ? chip(true, t("kept")) : dn.desktop === "added" ? chip(true, t("added")) : chip(false, t("not_added"));
    const sparks = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + 0.3, r = 0.74 + (i % 3) * 0.06;
      return `<span class="spark" style="left:${50 + Math.cos(a) * r * 100}%;top:${50 + Math.sin(a) * r * 100}%;opacity:${(0.45 + (i % 3) * 0.25).toFixed(2)};transform:translate(-50%,-50%) scale(${0.7 + (i % 2) * 0.6})"></span>`;
    }).join("");
    const tile = (icon, b, s, arg) => `<div class="glass-tile" role="button" tabindex="0" data-act="launch" data-arg="${arg}">${ic(icon)}<b>${t(b)}</b><span>${t(s)}</span></div>`;
    return {
      tb: "",
      html: `<div class="content">
        ${stepper(["ok", "ok", "on"])}
        <div class="done-hd">
          <div class="check-burst${M.ui.played ? "" : " play"}"><span class="ring"></span><span class="ring r2"></span><span class="disc"><svg viewBox="0 0 24 24"><path d="M5.5 12.5l4.2 4.2L18.5 7.8"/></svg></span>${sparks}</div>
          <div><h1 class="h1">${t("d_h1")}</h1><p class="muted" style="margin:6px 0 0;font-size:var(--fs-13)">${t("d_p", { v: M.version, secs: num(dn.secs || 0, 0) })}</p></div>
        </div>
        <div class="sum glass-tile">
          <div class="r">${ic("folder")}${t("r_loc")}<span class="v mono" title="${esc(M.dir)}">${esc(shortPath(M.dir))}</span></div>
          <div class="r">${ic("power")}${t("r_auto")}<span class="v">${chip(!!dn.autostart, t(dn.autostart ? "on" : "off"))}</span></div>
          <div class="r">${ic("monitor")}${t("r_desk")}<span class="v">${desk}</span></div>
          <div class="r">${ic("shield")}${t("r_sig")}<span class="v">${t("sig_v", { n: num(dn.files || 0, 0) })}</span></div>
        </div>
        <div class="lbl" style="margin-top:16px">${t("first")} <span class="quiet">${t("first_q")}</span></div>
        <div class="first">
          ${tile("user", "f1", "f1_d", "friends")}${tile("hash", "f2", "f2_d", "servers")}${tile("mic", "f3", "f3_d", "mic")}
        </div>
      </div>
      <div class="ftr">
        <div class="legal"><a class="link" data-act="url" data-arg="${esc(link("notes"))}">${t("notes")}</a> · <a class="link" data-act="openlog" title="${esc(M.logPath)}">${t("setup_log")}</a></div>
        <button class="btn btn-lg btn-secondary" data-act="close">${t("close")}</button>
        <button class="btn btn-lg btn-primary" data-act="launch">${t("open")}${ic("arrow")}</button>
      </div>`,
    };
  }

  const ERR = {
    net: { icon: "wifioff", t: "e_net", tips: ["t_net1", "t_net2", "t_net3"], btns: [["restart", "refresh", "restart_dl"], ["resume", "play", "resume_dl"]] },
    disk: { icon: "drive", t: "e_disk", tips: ["t_disk1", "t_disk2", "t_disk3"], btns: [["browse", "folder", "change_loc"], ["resume", "play", "resume_dl"]] },
    locked: { icon: "alert", t: "e_locked", tips: ["t_lock1", "t_lock2", "t_lock3"], btns: [["close", null, "cancel"], ["closeapp", "power", "close_app"]] },
    integrity: { icon: "shield", t: "e_integrity", red: true, tips: ["t_int1", "t_int2", "t_int3"], btns: [["close", null, "close"], ["restart", "refresh", "restart_dl"]] },
    install: { icon: "package", t: "e_install", red: true, tips: ["t_inst1", "t_inst2", "t_inst3"], btns: [["close", null, "close"], ["retry", "refresh", "retry"]] },
    migrate: { icon: "undo", t: "e_migrate", tips: ["t_inst1", "t_inst2", "t_inst3"], btns: [["keepold", null, "keep_old"], ["retry", "refresh", "retry"]] },
    system: { icon: "monitor", t: "e_system", tips: ["t_sys1", "t_sys2", "t_sys3"], btns: [["close", null, "close"]] },
  };
  function diagTiles(e) {
    const g = e.diag || {};
    const ok = (txt) => `<b>${ic("check", "", "color:var(--ok)")}${txt}</b>`;
    const bad = (txt) => `<b style="color:var(--err)">${ic("x")}${txt}</b>`;
    const plain = (txt) => `<b>${txt}</b>`;
    const tile = (label, val) => `<div class="well"><span>${t(label)}</span>${val}</div>`;
    switch (e.kind) {
      case "net": return tile("dg_net", g.net ? ok(t("connected")) : bad(t("not_connected"))) + tile("dg_proxy", g.proxy ? plain(ic("alert", "", "color:var(--warn)") + t("detected")) : ok(t("none"))) + tile("dg_data", ok(t("verified")));
      case "disk": return tile("dg_need", plain(esc(size(e.need)))) + tile("dg_free", bad(esc(size(e.free)))) + tile("dg_data", ok(t("verified")));
      case "locked": return tile("dg_proc", bad(t("running", { n: num(e.procs || 1, 0) }))) + tile("dg_data", ok(t("verified"))) + tile("dg_backup", ok(t("restored")));
      case "integrity": return tile("dg_hash", bad(t("failed"))) + tile("dg_sig", g.sig === false ? bad(t("failed")) : ok(t("verified"))) + tile("dg_files", ok(t("restored")));
      default: return tile("dg_files", bad(t("denied"))) + tile("dg_data", ok(t("verified"))) + tile("dg_backup", ok(t("restored")));
    }
  }
  function panelError() {
    const e = M.err || { kind: "install" };
    const k = ERR[e.kind] || ERR.install;
    const desc = e.kind === "net" ? th("e_net_d", { pct: esc(pctLoc(e.pct || 0)) })
      : e.kind === "disk" ? t("e_disk_d", { need: size(e.need), free: size(e.free), drive: e.drive || M.drive })
      : t(k.t + "_d");
    const cd = e.kind === "net" && e.retryIn != null ? `<div class="cd">${t("auto_retry")}<br><b data-b="cd">${num(e.retryIn, 0)} ${t("sec")}</b></div>` : "";
    const tipLink = (key) => (key === "t_net3" || key === "t_int3") ? ` <a class="link" data-act="url" data-arg="${esc(link("offline"))}" style="margin-left:2px">descall.com/download</a>` : "";
    const btn = ([act, icon, label], i, arr) => `<button class="btn ${i === arr.length - 1 && arr.length > 1 ? "btn-primary" : "btn-secondary"}" data-act="${act}">${icon ? ic(icon) : ""}${t(label)}</button>`;
    return {
      tb: "",
      html: `<div class="content">
        ${stepper(["ok", "on", ""], true)}
        <div class="ebanner${k.red ? " err" : ""}"><span class="k">${ic(k.icon)}</span><div><b>${t(k.t)}</b><span>${desc}</span></div>${cd}</div>
        <div class="bar paused" style="margin-top:14px;height:8px"><i style="width:${Math.round(e.pct != null ? e.pct : 100)}%"></i></div>
        <div class="diag">${diagTiles(e)}</div>
        <div class="log well" style="margin-top:12px;flex:none" data-log="tail"></div>
        <div class="tips">${k.tips.map((x, i) => `<div><span class="n">${i + 1}</span>${t(x)}${tipLink(x)}</div>`).join("")}</div>
      </div>
      <div class="ftr">
        <div class="legal"><a class="link" data-act="url" data-arg="${esc(link("support"))}">${ic("buoy", "", "width:14px;height:14px")} ${t("support")}</a> · <a class="link" data-act="openlog" title="${esc(M.logPath)}">${t("setup_log")}</a></div>
        ${k.btns.map(btn).join("\n        ")}
      </div>`,
    };
  }

  function panelMigration() {
    const g = M.mig || { rows: {} };
    const r = g.rows || {};
    const row = (id, icon, title, sub, okText) => {
      const x = r[id] || { st: "wait" };
      let rt;
      if (x.st === "ok") rt = `<span class="chip ok">${ic("check")}${okText(x)}</span>`;
      else if (x.st === "warn") rt = `<span class="chip warn">${ic("alert")}${t("x_ses_warn")}</span>`;
      else if (x.st === "run" && x.total) rt = `<span class="quiet tnum" style="font-size:var(--fs-11)">${esc(mbv(x.done, 0))} / ${esc(size(x.total, 0))}</span><div class="bar"><i style="width:${Math.round((x.done / x.total) * 100)}%"></i></div>`;
      else if (x.st === "run") rt = `<span class="spinner"></span>`;
      else rt = `<span class="chip">${t("waiting")}</span>`;
      return `<div class="xi glass-tile ${x.st}"><span class="k">${ic(icon)}</span><div><b>${typeof title === "function" ? title(x) : title}</b><span>${typeof sub === "function" ? sub(x) : sub}</span></div><div class="rt">${rt}</div></div>`;
    };
    const fin = !!g.finished;
    const from = g.installing && !fin ? t("mg_installing", { pct: pctStr(g.installPct != null ? g.installPct : overallPct()) }) : t("mg_from", { from: g.from || "", to: g.to || M.version });
    const lower = M.ui.details ? `<div class="log well tall mg-log" data-log="live"></div>`
      : `<div class="note">${ic("undo")}<span>${rich("mg_note_html", [], { d: num(g.days || 14, 0) })}</span></div>`;
    return {
      tb: "",
      html: `<div class="content">
        <div class="stepper"><span class="chip acc">${ic("sparkles")}${t("mg_chip")}</span><span class="quiet" style="font-weight:500" data-b="mgfrom">${from}</span></div>
        <div class="head"><h1 class="h1">${t(fin ? "mg_h1_done" : "mg_h1")}</h1><p>${t("mg_p")}</p></div>
        <div class="xfer">
          ${row("set", "sliders", t("x_set"), (x) => t("x_set_d", { n: num(x.n || 0, 0) }), () => t("x_set_ok"))}
          ${row("ses", "key", t("x_ses"), (x) => t(x.st === "warn" ? "x_ses_relogin" : "x_ses_d"), () => t("x_ses_ok"))}
          ${row("sh", "keyboard", t("x_sh"), t("x_sh_d"), (x) => t("x_sh_ok", { n: num(x.n || 0, 0) }))}
          ${row("cl", "trash", (x) => t(x.st === "ok" ? "x_cl_done" : "x_cl"), t("x_cl_d"), () => t("x_cl_ok"))}
        </div>
        ${lower}
      </div>
      <div class="ftr">
        <div class="legal" data-b="mgfoot">${fin && g.launchIn != null ? t("mg_foot_done", { s: num(g.launchIn, 0) }) : t("mg_foot")}</div>
        <button class="btn btn-ghost" data-act="details">${t(M.ui.details ? "hide_details" : "details")}</button><button class="btn ${fin ? "btn-primary" : "btn-secondary"}" data-act="launch"${fin ? "" : " disabled"}>${t("open")}</button>
      </div>`,
    };
  }

  function updateToast() {
    const u = M.upd || {};
    const notes = (u.notes && u.notes.length ? u.notes : ["u_n1", "u_n2"]).slice(0, 3).map((n, i) => {
      const text = typeof n === "string" ? (n.startsWith("u_") ? t(n) : esc(n)) : esc(n[M.lang] || n.en || "");
      return `<li>${ic(i % 2 ? "zap" : "sparkles")}${text}</li>`;
    }).join("");
    let top, body, acts;
    if (u.phase === "installing" || u.phase === "done") {
      const done = u.phase === "done";
      top = `<span class="t1">${t(done ? "u_done" : "u_installing", { v: u.v })}</span><span class="chip ${done ? "ok" : "acc"}" style="margin-left:auto">${done ? ic("check") : '<span class="spinner" style="width:11px;height:11px;border-width:1.5px"></span>'}<span data-b="uppct">${esc(pctStr(done ? 100 : u.pct != null ? u.pct : overallPct()))}</span></span>`;
      body = `<div class="sub">${t(done ? "u_done_d" : "u_installing_d")}</div><div class="bar${done ? " done" : ""}" data-b="upbar"><i style="width:${done ? 100 : Math.round(u.pct != null ? u.pct : overallPct())}%"></i></div>`;
      acts = "";
    } else if (u.phase === "error") {
      top = `<span class="t1">${t("u_error")}</span><span class="chip err" style="margin-left:auto">${ic("x")}${esc(u.code || "")}</span>`;
      body = `<div class="sub">${t("u_error_d")}</div>`;
      acts = `<div class="acts"><a class="quiet link" data-act="openlog" style="font-weight:500">${t("setup_log")}</a><button class="btn btn-sm btn-ghost" data-act="later">${t("later")}</button><button class="btn btn-sm btn-primary" data-act="update-now">${ic("refresh")}${t("retry")}</button></div>`;
    } else {
      top = `<span class="t1">${t("u_ready", { v: u.v })}</span><span class="chip ok" style="margin-left:auto">${ic("check")}${t("u_dled")}</span>`;
      body = `<ul>${notes}</ul>`;
      acts = `<div class="acts"><span class="quiet">${t("u_meta", { size: size(u.size || 0), s: num(u.secs || 4, 0) })}</span><button class="btn btn-sm btn-ghost" data-act="later">${t("later")}</button><button class="btn btn-sm btn-primary" data-act="update-now">${ic("refresh")}${t("restart")}</button></div>`;
    }
    return `<div class="win toast-b" role="dialog" aria-label="${t("u_ready", { v: u.v })}">
      <div class="strip" data-drag><span>${symbol()}</span></div>
      <div class="bd" data-drag>
        <div class="top">${top}</div>
        ${body}
        ${acts}
      </div>
    </div>`;
  }

  function fauxApp() {
    const w = [62, 80, 54, 70, 46, 66, 58];
    const msgs = [[90, 70], [60], [84, 40], [72, 88, 30]];
    return `<div class="fauxapp"><div class="rail"><i></i><i></i><i></i><i></i><i></i></div><div class="side">${w.map((x) => `<b style="width:${x}%"></b>`).join("")}</div><div class="main">${msgs.map((m) => `<div class="msg"><i></i><div><b></b>${m.map((x) => `<b style="width:${x}%"></b>`).join("")}</div></div>`).join("")}</div></div>`;
  }

  /* ------------------------------------------------------------- render */
  const root = document.getElementById("root");
  const STAGE = !HOST && params.get("exe") !== "1";
  document.documentElement.classList.toggle("exe", !STAGE);

  function structKey() {
    const e = M.err || {};
    return [M.screen, M.lang, M.ui.menu, M.ui.hover, M.ui.confirm, M.ui.details, e.kind, e.code, M.dl.phase, M.dl.embedded, !!(M.mig && M.mig.finished),
      M.screen === "migration" ? JSON.stringify(M.mig && M.mig.rows) + (M.mig && M.mig.installPct) : "", M.screen === "update" ? JSON.stringify(M.upd) : "",
      M.screen === "welcome" ? JSON.stringify([M.opts, M.sys, M.existing, !!M.dirError]) : "", M.screen === "done" ? JSON.stringify(M.done) : "",
      M.screen === "error" ? JSON.stringify([M.err, M.dl.got, M.dl.parts]) : ""].join("|");
  }

  function buildWindow() {
    if (M.screen === "update") {
      const toast = updateToast();
      root.innerHTML = STAGE
        ? `<section class="shot scene">${fauxApp()}<div class="toast-pos">${toast}</div></section>`
        : `<div class="frame toast-frame"><div class="desk"></div>${toast}</div>`;
      if (!STAGE) {
        const win = root.querySelector(".toast-b");
        const h = win.getBoundingClientRect().height;
        const desk = root.querySelector(".desk");
        desk.style.left = "-280px";
        desk.style.top = -(360 - 26 - h) + "px";
        send("resize", { w: 452, h: Math.ceil(h) });
      }
      return;
    }
    let win = root.querySelector(".win.b");
    if (!win) {
      const shell = `<div class="win b"><aside class="art">${ART_BASE}</aside><div class="panel"></div></div>`;
      root.innerHTML = STAGE ? `<section class="shot"><div class="frame">${shell}</div></section>` : `<div class="frame"><div class="desk"></div>${shell}</div>`;
      win = root.querySelector(".win.b");
    }
    const art = win.querySelector("aside.art");
    const a = artFor(M.screen);
    art.className = a.cls;
    [...art.children].forEach((c) => { if (!c.classList.contains("blob") && !c.classList.contains("orbits")) c.remove(); });
    art.insertAdjacentHTML("beforeend", a.html);
    const p = { welcome: panelWelcome, progress: panelProgress, done: panelDone, error: panelError, migration: panelMigration }[M.screen];
    const panel = win.querySelector(".panel");
    if (!p) { panel.innerHTML = titlebar(""); return; }
    const out = p();
    panel.innerHTML = titlebar(out.tb) + out.html;
    if (M.screen === "done") M.ui.played = true;
  }

  function bindings() {
    if (M.screen === "welcome") {
      const lowDisk = M.free && M.need && M.free < M.need * 3;
      return {
        path: { text: shortPath(M.dir), title: M.dir },
        need: { text: M.dirError ? raw("dir_bad") : raw("need").replace("{size}", size(M.need, 0)), cls: { "dir-bad": !!M.dirError } },
        free: { text: raw("free").replace("{drive}", M.drive).replace("{size}", gbv(M.free)) },
        diskbar: { w: M.free ? Math.min(100, Math.max(4, (M.need / M.free) * 100)) : 4, cls: { low: !!lowDisk } },
      };
    }
    if (M.screen === "progress") return bindProgress();
    if (M.screen === "update" && M.upd && M.upd.phase === "installing" && M.upd.pct == null) {
      const p = overallPct();
      return { uppct: { text: pctStr(p) }, upbar: { w: p } };
    }
    if (M.screen === "migration" && M.mig && M.mig.installing && !M.mig.finished && M.mig.installPct == null) return { mgfrom: { text: raw("mg_installing").replace("{pct}", pctStr(overallPct())) } };
    if (M.screen === "error" && M.err && M.err.retryIn != null) return { cd: { text: num(M.err.retryIn, 0) + " " + raw("sec") } };
    return {};
  }

  function applyBindings() {
    const b = bindings();
    for (const k of Object.keys(b)) {
      const el = root.querySelector(`[data-b="${k}"]`);
      if (!el) continue;
      const v = b[k];
      const sig = JSON.stringify(v);
      if (bindCache.get(el) === sig) continue;
      bindCache.set(el, sig);
      if (v.text != null) el.textContent = v.text;
      if (v.html != null) el.innerHTML = v.html;
      if (v.title != null) el.title = v.title;
      if (v.w != null) { const i = el.querySelector(":scope > i"); if (i) i.style.width = v.w + "%"; }
      if (v.cls) for (const c of Object.keys(v.cls)) el.classList.toggle(c, !!v.cls[c]);
    }
  }

  function logLine(e) {
    const a = e.a || {};
    const args = {};
    for (const k of Object.keys(a)) {
      const v = a[k];
      if (k === "host") args[k] = `<span class="ac">${esc(v)}</span>`;
      else if (k === "size") args[k] = esc(size(v));
      else if (k === "got") args[k] = esc(a.size != null ? mbv(v) : size(v));
      else if (k === "secs") args[k] = esc(secs(v));
      else if (k === "i" && a.n != null) args[k] = esc(String(v).padStart(String(a.n).length, "0"));
      else args[k] = esc(typeof v === "number" ? num(v, 0) : v);
    }
    args.ok = `<span class="ok">${t("done_s")}</span>`;
    const msg = th(e.k, args);
    const cls = e.lv === "warn" ? "wa" : e.lv === "err" ? "er" : "";
    return `<div class="ln"><span class="ts">${esc(e.t)}</span><span${cls ? ` class="${cls}"` : ""}>${msg}</span></div>`;
  }
  function renderLogs() {
    root.querySelectorAll("[data-log]").forEach((box) => {
      const mode = box.getAttribute("data-log");
      const list = mode === "tail" ? M.log.slice(-5) : M.log.slice(-60);
      const last = list.length ? list[list.length - 1].id : -1;
      const sig = M.lang + ":" + last + ":" + list.length + ":" + (M.dl.paused ? 1 : 0) + M.screen;
      if (box.__sig === sig) return;
      box.__sig = sig;
      box.innerHTML = list.map(logLine).join("");
      const active = (M.screen === "progress" && !M.dl.paused) || (M.screen === "error" && M.err && M.err.retryIn != null) || (M.screen === "migration" && !(M.mig && M.mig.finished));
      const lastLn = box.lastElementChild;
      if (lastLn && active) lastLn.lastElementChild.classList.add("cur");
      box.scrollTop = box.scrollHeight;
    });
  }

  let queued = false;
  function render() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderNow();
    });
  }
  function renderNow() {
    if (M.screen === "boot") return;
    L = S[M.lang] || S.en;
    document.documentElement.lang = M.lang;
    document.title = raw("title");
    const key = structKey();
    if (key !== built) { built = key; bindCache.clear(); buildWindow(); }
    applyBindings();
    renderLogs();
  }

  /* -------------------------------------------------------------- input */
  let slideTimer = null;
  function reduceMotion() { return document.documentElement.classList.contains("rm") || matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function armSlides() {
    clearInterval(slideTimer);
    if (reduceMotion() || params.get("freeze")) return;
    slideTimer = setInterval(() => { if (M.screen === "progress") setSlide(M.ui.slide + 1); }, 8000);
  }
  function setSlide(i) {
    M.ui.slide = (i + SLIDES.length) % SLIDES.length;
    const box = root.querySelector('[data-b="slide"]');
    if (!box) return;
    box.innerHTML = slideHtml(M.ui.slide);
    root.querySelector('[data-b="slideno"]').textContent = `${M.ui.slide + 1} / ${SLIDES.length}`;
    root.querySelector('[data-b="dots"]').innerHTML = dots();
  }

  function act(name, arg, el) {
    switch (name) {
      case "menu": M.ui.menu = !M.ui.menu; M.ui.hover = null; break;
      case "lang": M.ui.menu = false; M.lang = arg; send("lang", { lang: arg }); armSlides(); break;
      case "toggle": M.opts[arg] = !M.opts[arg]; break;
      case "browse": send("browse"); break;
      case "install": if (canInstall()) send("install", { dir: M.dir, opts: M.opts, lang: M.lang }); break;
      case "pause": send(M.dl.paused ? "resume" : "pause"); break;
      case "cancel": M.ui.confirm = true; break;
      case "cancel-no": M.ui.confirm = false; break;
      case "cancel-yes": M.ui.confirm = false; send("cancel"); break;
      case "copy": {
        const text = M.log.map((e) => e.t + "  " + (el ? "" : "") + stripTags(logLine(e).replace(/^.*?<\/span>/, ""))).join("\r\n");
        send("copy", { text });
        M.ui.copied = true;
        setTimeout(() => { M.ui.copied = false; render(); }, 1600);
        break;
      }
      case "prev": setSlide(M.ui.slide - 1); armSlides(); return;
      case "next": setSlide(M.ui.slide + 1); armSlides(); return;
      case "slide": setSlide(+arg); armSlides(); return;
      case "details": M.ui.details = !M.ui.details; break;
      case "url": send("url", { url: arg }); return;
      case "openlog": send("openlog"); return;
      case "launch": send("launch", arg ? { open: arg } : {}); return;
      case "close":
        // Closing mid-download asks first (parts are kept); mid-install it waits for the swap to finish.
        if (M.screen === "progress" && M.dl.phase !== "install") { M.ui.confirm = true; break; }
        if (M.screen === "progress" || (M.screen === "migration" && !(M.mig && M.mig.finished))) return;
        send("close"); return;
      default: send(name); return; /* minimize, resume, restart, retry, closeapp, keepold, later, update-now */
    }
    render();
  }
  function stripTags(h) { const d = document.createElement("div"); d.innerHTML = h; return d.textContent; }

  root.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") {
      if (M.ui.menu && !ev.target.closest(".lang-wrap")) { M.ui.menu = false; render(); }
      return;
    }
    ev.preventDefault();
    act(el.getAttribute("data-act"), el.getAttribute("data-arg"), el);
  });
  root.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0 || !HOST) return;
    if (ev.target.closest("[data-drag]") && !ev.target.closest("button,[data-act],a,.lang-wrap")) send("drag");
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (M.ui.menu || M.ui.confirm) { M.ui.menu = false; M.ui.confirm = false; render(); }
      return;
    }
    if ((ev.key === "Enter" || ev.key === " ") && document.activeElement && document.activeElement.matches("[data-act][role],[data-act][tabindex]")) {
      ev.preventDefault();
      document.activeElement.click();
    }
  });
  document.addEventListener("contextmenu", (ev) => { if (HOST) ev.preventDefault(); });

  /* ------------------------------------------------------------ host API */
  window.__setup = {
    patch(p) {
      if (p.lang) p.lang = pick(p.lang);
      const was = M.screen;
      merge(M, p);
      if (p.rm != null) document.documentElement.classList.toggle("rm", !!p.rm);
      if (was !== M.screen) { M.ui.menu = false; M.ui.confirm = false; if (M.screen === "progress") armSlides(); }
      render();
    },
    log(entries) {
      for (const e of [].concat(entries)) {
        e.id = logSeq++;
        if (!e.t) e.t = hhmmss(new Date());
        const last = M.log[M.log.length - 1];
        if (e.rep && last && last.k === e.k) M.log[M.log.length - 1] = e;
        else M.log.push(e);
      }
      if (M.log.length > 400) M.log.splice(0, M.log.length - 400);
      render();
    },
    model: M,
  };
  if (HOST) send("ready");

  /* ---------------------------------------------------------------- demo
     ?demo=<screen>[&variant=..]&lang=..&menu=1&hover=en&exe=1&freeze=1 -- fixtures reproduce draft B. */
  const Demo = {
    handle(msg) {
      if (msg.cmd === "lang") return;
      if (msg.cmd === "pause") { M.dl.paused = true; render(); }
      if (msg.cmd === "resume") { M.dl.paused = false; render(); }
    },
    start() {
      const lang = params.get("lang") || "tr";
      const variant = params.get("variant") || "";
      const screen = params.get("demo") || "welcome";
      const dl = { phase: "download", paused: false, part: 9, parts: 14, got: 11.4 * MB, total: 18.4 * MB, speed: 3.1 * MB, eta: 2, server: { label: lang === "tr" ? "İstanbul" : "Istanbul", ms: 18 }, files: { done: 0, total: 346 }, verify: 0 };
      const base = {
        lang, version: "4.0.0", arch: "x64", publisher: params.get("pub") || "Descall Teknoloji A.Ş.",
        dir: "C:\\Users\\demir\\AppData\\Local\\Programs\\Descall", need: 92 * MB, free: 214 * GB, drive: "C:",
        sys: { os: "Windows 11", osOk: true, wvOk: true, diskOk: true }, dl,
        logPath: "C:\\Users\\demir\\AppData\\Local\\Descall-Setup\\logs\\setup.log",
        ui: { menu: params.get("menu") === "1", hover: params.get("hover"), slide: screen === "progress" ? 1 : 0, confirm: variant === "confirm", details: variant === "details", played: !!params.get("freeze") },
      };
      const L1 = [
        ["16:42:07", "l_connected", { host: "cdn-ist.descall.com", tls: "TLS 1.3" }],
        ["16:42:08", "l_manifest", { v: "4.0.0", n: 14, size: 18.4 * MB }],
        ["16:42:10", "l_part_ok", { i: 7, n: 14, size: 1.3 * MB, secs: 0.4 }],
        ["16:42:11", "l_part_ok", { i: 8, n: 14, size: 1.3 * MB, secs: 0.4 }],
        ["16:42:11", "l_part_dl", { i: 9, n: 14, got: 0.8 * MB, size: 1.3 * MB }],
      ];
      const LERR = [
        ["16:42:11", "l_part_dl", { i: 9, n: 14, got: 0.8 * MB, size: 1.3 * MB }],
        ["16:42:12", "l_net_slow", { s: 3 }, "warn"],
        ["16:42:15", "l_net_lost", { code: "WSAENETUNREACH" }, "err"],
        ["16:42:15", "l_saved", { n: 9, size: 11.4 * MB }],
        ["16:42:16", "l_retry_wait", { i: 1, n: 5 }],
      ];
      const logs = (arr) => arr.map(([tt, k, a, lv]) => ({ t: tt, k, a, lv }));
      window.__setup.patch(base);
      if (screen === "welcome") {
        if (variant === "upgrade") window.__setup.patch({ existing: { version: "3.9.3", desktopShortcut: true } });
        if (variant === "unsupported") window.__setup.patch({ sys: { os: "Windows 10 1909", osOk: false } });
        if (variant === "lowdisk") window.__setup.patch({ free: 60 * MB, sys: { diskOk: false } });
        window.__setup.patch({ screen: "welcome" });
      } else if (screen === "progress") {
        window.__setup.log(logs(L1));
        if (variant === "connect") window.__setup.patch({ dl: { phase: "connect", got: 0, part: 0, speed: 0, eta: null, server: null } });
        if (variant === "paused" || variant === "confirm") window.__setup.patch({ dl: { paused: variant === "paused" } });
        if (variant === "verify") { window.__setup.patch({ dl: { phase: "verify", got: 18.4 * MB, part: 14, verify: 0.58, speed: 0 } }); window.__setup.log(logs([["16:42:14", "l_part_ok", { i: 14, n: 14, size: 1.1 * MB, secs: 0.3 }]])); }
        if (variant === "install") { window.__setup.patch({ dl: { phase: "install", got: 18.4 * MB, part: 14, verify: 1, speed: 0, files: { done: 212, total: 346 } } }); window.__setup.log(logs([["16:42:15", "l_verify_ok", {}], ["16:42:16", "l_extract", { n: 212 }]])); }
        if (variant === "embedded") { window.__setup.patch({ dl: { phase: "verify", embedded: true, got: 18.4 * MB, part: 14, verify: 0.4, speed: 0, server: null } }); }
        window.__setup.patch({ screen: "progress" });
      } else if (screen === "error") {
        window.__setup.log(logs(LERR));
        const kinds = {
          net: { kind: "net", code: "NET-2EFD", pct: 62, partsReady: 9, kept: 11.4 * MB, left: 7.0 * MB, retryIn: 8, diag: { net: false, proxy: false } },
          disk: { kind: "disk", code: "DSK-0070", pct: 62, partsReady: 9, kept: 11.4 * MB, left: 7.0 * MB, need: 92 * MB, free: 41 * MB, drive: "C:" },
          locked: { kind: "locked", code: "LCK-0020", pct: 100, partsReady: 14, kept: 18.4 * MB, left: 0, procs: 3 },
          integrity: { kind: "integrity", code: "SIG-0BAD", pct: 100, partsReady: 0, kept: 0, left: 18.4 * MB, diag: { sig: true } },
          install: { kind: "install", code: "INS-0005", pct: 100, partsReady: 14, kept: 18.4 * MB, left: 0 },
          migrate: { kind: "migrate", code: "MIG-0102", pct: 100, partsReady: 14, kept: 18.4 * MB, left: 0 },
          system: { kind: "system", code: "SYS-4A61", pct: 0, partsReady: 0, kept: 0, left: 18.4 * MB },
        };
        window.__setup.patch({ err: kinds[variant || "net"], screen: "error" });
      } else if (screen === "done") {
        window.__setup.patch({ done: { secs: 31, files: 346, autostart: true, desktop: variant === "kept" ? "kept" : "added" }, screen: "done" });
      } else if (screen === "migration") {
        const rows = {
          set: { st: "ok", n: 42 }, ses: { st: "ok" }, sh: { st: "ok", n: 18 }, cl: { st: "run", done: 121 * MB, total: 184 * MB },
        };
        let mig = { from: "3.9.3", to: "4.0.0", days: Number(params.get("days") || 14), rows, cmp: { setup: [184, 18], launch: [2.6, 0.8], memory: [410, 190] } };
        if (variant === "installing") mig = Object.assign(mig, { installPct: 48, rows: { set: { st: "wait" }, ses: { st: "wait" }, sh: { st: "wait" }, cl: { st: "wait" } } });
        if (variant === "session") mig.rows = { set: { st: "ok", n: 42 }, ses: { st: "run" }, sh: { st: "wait" }, cl: { st: "wait" } };
        if (variant === "finished") mig = Object.assign(mig, { finished: true, launchIn: 3, rows: Object.assign({}, rows, { cl: { st: "ok" } }) });
        window.__setup.log(logs([["16:51:02", "l_mig_settings", { n: 42 }], ["16:51:02", "l_mig_session", {}], ["16:51:03", "l_mig_shell", { n: 18 }], ["16:51:04", "l_mig_clean", { size: 121 * MB }]]));
        window.__setup.patch({ mig, screen: "migration" });
      } else if (screen === "update") {
        const upd = { v: "4.0.1", size: 2.4 * MB, secs: 4, phase: variant || "ready", pct: 64, code: "UPD-0011" };
        window.__setup.patch({ upd, screen: "update" });
      }
      if (params.get("rm") === "1") window.__setup.patch({ rm: true });
      merge(M.ui, { menu: base.ui.menu, confirm: base.ui.confirm });
      renderNow();
      document.body.setAttribute("data-ready", "1");
    },
  };
  if (!HOST) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Demo.start());
    else Demo.start();
  }
})();
