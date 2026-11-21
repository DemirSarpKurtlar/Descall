// Fake Tauri internals + a small JS stand-in for the Rust premium host
// (desktop/app/src-tauri/src/premium/mod.rs): settings store, gate, running features, replies.
// Records every invoke in window.__calls. Runs BEFORE premium-shim.js (real Tauri order).
(() => {
  const cfg = window.__E2E_CFG || {};
  const calls = [];
  window.__calls = calls;
  const listeners = new Map(); // id -> { event, handler }
  let nextId = 1;
  const OFF = ["global_mute", "global_ptt", "media_keys", "per_user_volume_hotkeys", "quick_launcher", "screen_edge_actions"];
  const DEF = { toggle_mute: "CommandOrControl+Alt+M", toggle_deafen: "CommandOrControl+Alt+D", push_to_talk: "Mouse4", quick_launcher: "CommandOrControl+Shift+K", volume_up: "CommandOrControl+Alt+Up", volume_down: "CommandOrControl+Alt+Down" };
  const H = { store: {}, running: new Set(), keys: [], plan: null, verifiedAt: 0, call: { active: false }, reconcileDelayMs: cfg.reconcileDelayMs || 0 };
  window.__mockHost = H;
  const enabled = (k) => (typeof (H.store[k] || {}).enabled === "boolean" ? H.store[k].enabled : !OFF.includes(k));
  const reconcile = () => {
    for (const k of H.keys) { if (enabled(k)) H.running.add(k); else H.running.delete(k); }
    for (const k of [...H.running]) if (!H.keys.includes(k)) H.running.delete(k);
  };
  const OWNER = { hotkeys: "custom_hotkeys", launcher: "quick_launcher" };
  const owner = (ch) => { const m = /^premium:([a-z_]+):/.exec(ch); return m ? OWNER[m[1]] || m[1] : null; };
  const bindings = () => {
    const custom = H.running.has("custom_hotkeys") ? ((H.store.custom_hotkeys || {}).bindings || {}) : {};
    const out = {};
    for (const [a, d] of Object.entries(DEF)) out[a] = Object.prototype.hasOwnProperty.call(custom, a) ? (custom[a] || "") : d;
    return out;
  };
  const snapshot = () => ({ plan: H.plan, keys: H.keys.slice(), verifiedAt: H.verifiedAt, claimed: H.keys.length, lastError: null, verifying: false });
  const emit = (event, payload) => {
    for (const [id, l] of listeners) if (l.event === event) { const cb = window[`_${l.handler}`]; if (cb) cb({ event, id, payload }); }
  };
  window.__emit = emit;
  const ok = (x = {}) => ({ ok: true, ...x });
  function core(channel, a) {
    switch (channel) {
      case "premium:entitlements": {
        const plan = a[0] && a[0].plan ? a[0].plan : null;
        const keys = plan && !cfg.serverRefuses ? (a[0].keys || []).slice() : [];
        // Rust / Electron: the shell's own GET /api/premium/me (network) decides first.
        const apply = () => { H.plan = plan; H.keys = keys; H.verifiedAt = Date.now(); reconcile(); };
        if (cfg.verifyDelayMs) setTimeout(apply, cfg.verifyDelayMs); else setTimeout(apply, 0);
        return ok(snapshot());
      }
      case "premium:verify": reconcile(); return ok({ ...snapshot(), running: [...H.running] });
      case "premium:status": return ok({ ...snapshot(), running: [...H.running], platform: "win32" });
      case "premium:settings:get": return a[0] == null ? ok({ features: H.store }) : ok({ settings: H.store[a[0]] || {} });
      case "premium:settings:set": {
        const k = a[0];
        const next = { ...(H.store[k] || {}) };
        for (const [x, v] of Object.entries(a[1] || {})) { if (v === null) delete next[x]; else next[x] = v; }
        H.store[k] = next;
        // Rust: reconcile on the bus thread (async); cfg.reconcileDelayMs widens that window.
        if (H.reconcileDelayMs) setTimeout(reconcile, H.reconcileDelayMs); else reconcile();
        setTimeout(() => emit("premium:settings-changed", { key: k, settings: next }), 0);
        return ok({ settings: next });
      }
      case "premium:call-state": H.call = a[0] || {}; return ok();
      case "premium:app-state": case "premium:focus-main": return ok();
      default: return undefined;
    }
  }
  function feature(channel, a) {
    const key = owner(channel);
    if (!key || !H.running.has(key)) return { ok: false, error: "locked" };
    const b = bindings();
    switch (channel) {
      case "premium:global_mute:status": return ok({ hotkeys: { bindings: b, customAllowed: H.running.has("custom_hotkeys"), active: ["toggle_mute"], registered: [], failures: [] } });
      case "premium:global_ptt:status": return ok({ mode: "hold", binding: b.push_to_talk, nativeAvailable: true, nativeError: null, hookRunning: Boolean(H.call.active), mouseNeedsNative: false });
      case "premium:media_keys:status": return ok({ inCall: Boolean(H.call.active), active: [], failed: [], mapping: { playPause: "toggle_mute", next: "toggle_deafen", previous: "none", stop: "none" } });
      case "premium:per_user_volume_hotkeys:status": return ok({ step: 10, inCall: false, bindings: b });
      case "premium:hotkeys:status": return ok({ bindings: b, customAllowed: true, active: [], registered: [], failures: [], actions: {}, reserved: ["F12", "CommandOrControl+Shift+I", "F11"] });
      case "premium:hotkeys:check": return ok({ issues: [] });
      case "premium:hotkeys:probe": return ok({ accel: a[0], free: true });
      case "premium:hotkeys:save": {
        const cur = (H.store.custom_hotkeys || {}).bindings || {};
        H.store.custom_hotkeys = { ...(H.store.custom_hotkeys || {}), bindings: { ...cur, ...(a[0] || {}) } };
        return ok({ status: { bindings: bindings(), failures: [] }, issues: [] });
      }
      case "premium:hotkeys:reset": H.store.custom_hotkeys = { ...(H.store.custom_hotkeys || {}), bindings: {} }; return ok({ status: { bindings: bindings(), failures: [] } });
      case "premium:command_center:hotkey": return { ok: true, hotkey: a[0] || "" };
      case "premium:workspace_profiles:bind": return ok({ bound: [] });
      default: return ok();
    }
  }
  function invoke(cmd, args) {
    calls.push([cmd, JSON.parse(JSON.stringify(args === undefined ? null : args))]);
    if (cmd === "plugin:event|listen") { const id = nextId++; listeners.set(id, { event: args.event, handler: args.handler }); return Promise.resolve(id); }
    if (cmd === "plugin:event|unlisten") { listeners.delete(args.eventId); return Promise.resolve(null); }
    if (cmd === "premium_invoke") {
      const { channel, args: a } = args;
      const r = core(channel, a || []);
      const res = r !== undefined ? r : feature(channel, a || []);
      calls[calls.length - 1].push(JSON.parse(JSON.stringify(res)));
      return Promise.resolve(res);
    }
    if (cmd === "scan_processes" || cmd === "screen_sources") return Promise.resolve([]);
    return Promise.resolve(null);
  }
  if (cfg.noTauri) return;
  Object.defineProperty(window, "isTauri", { value: true });
  window.__TAURI_INTERNALS__ = {
    plugins: {},
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    invoke,
    transformCallback(cb, once) {
      const id = nextId++;
      window[`_${id}`] = (x) => { if (once) delete window[`_${id}`]; return cb && cb(x); };
      return id;
    },
  };
  window.__defineTauriGlobal = () => {
    window.__TAURI__ = {
      core: { invoke },
      event: {
        listen: (event, handler) => invoke("plugin:event|listen", { event, target: { kind: "Any" }, handler: window.__TAURI_INTERNALS__.transformCallback(handler) })
          .then((eventId) => () => invoke("plugin:event|unlisten", { event, eventId })),
        emit: (event, payload) => { emit(event, payload); return Promise.resolve(); },
      },
    };
  };
})();
