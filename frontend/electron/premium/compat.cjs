'use strict';

/**
 * Adapter for the gaming / productivity feature modules: wraps the host ctx (index.cjs) with
 * the few helpers they share (event-first handlers, JSON files under userData/premium,
 * global hotkeys released on stop, a shared service map, static tray items).
 *
 *   module.exports = wrapFeature({ key, defaultEnabled, start(c), stop() })
 *
 * Inside start(c): c.handle(channel, (event, ...args) => ..., { anySender }),
 * c.sendToRenderer, c.getMainWindow, c.store(name).read/write, c.storeDir(),
 * c.registerHotkey(accel, fn), c.unregisterHotkeys(), c.setTrayItems([...]), c.shared,
 * c.host() -> { registerAppProtocolOn, mediaPermissions, preloadPath, appUrl }, c.base.
 */

const fs = require('fs');
const path = require('path');
const hostHooks = require('./hostHooks.cjs');

const shared = new Map();

function wrapFeature(def) {
  let c = null;
  let hotkeys = new Set();
  let globalShortcut = null;

  function storeDir() {
    const dir = path.join(c.base.app.getPath('userData'), 'premium');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
    return dir;
  }

  function jsonStore(name) {
    const file = path.join(storeDir(), `${String(name).replace(/[^a-z0-9_-]/gi, '')}.json`);
    return {
      file,
      read(fallback) {
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
      },
      write(value) {
        try { fs.writeFileSync(file, JSON.stringify(value)); return true; } catch (_) { return false; }
      },
    };
  }

  function unregisterHotkeys() {
    for (const a of hotkeys) { try { globalShortcut.unregister(a); } catch (_) { /* ignore */ } }
    hotkeys = new Set();
  }

  return {
    key: def.key,
    defaultEnabled: def.defaultEnabled,
    start(base) {
      ({ globalShortcut } = require('electron'));
      c = {
        key: def.key,
        base,
        gate: base.gate,
        log: (...a) => { try { base.log.info(`[premium:${def.key}]`, ...a); } catch (_) { /* ignore */ } },
        getMainWindow: () => base.mainWindow(),
        sendToRenderer: (channel, payload) => base.send(channel, payload),
        store: jsonStore,
        storeDir,
        shared,
        host: () => ({
          registerAppProtocolOn: hostHooks.get('registerAppProtocolOn'),
          mediaPermissions: hostHooks.get('mediaPermissions') || [],
          preloadPath: base.preload,
          appUrl: () => base.appUrl('/'),
        }),
        handle(channel, fn, { anySender = false } = {}) {
          base.handle(channel, (...args) => {
            const event = args.pop();
            return fn(event, ...args);
          }, { from: anySender ? 'app' : 'main' });
        },
        registerHotkey(accel, fn) {
          if (!accel) return false;
          try {
            if (hotkeys.has(accel)) globalShortcut.unregister(accel);
            const ok = globalShortcut.register(accel, () => { if (base.gate.has(def.key)) fn(); });
            if (ok) hotkeys.add(accel);
            return ok;
          } catch (_) {
            return false;
          }
        },
        unregisterHotkeys,
        setTrayItems(items) {
          const list = Array.isArray(items) ? items : [];
          base.setTrayItems(() => list);
        },
        windows: base.windows,
      };
      def.start(c);
    },
    stop() {
      try { def.stop(); } finally {
        unregisterHotkeys();
        c = null;
      }
    },
    _def: def,
  };
}

module.exports = { wrapFeature, shared };
