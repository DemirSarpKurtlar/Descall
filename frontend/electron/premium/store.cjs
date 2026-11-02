'use strict';

/**
 * Per-feature settings for the Descall+ desktop modules, kept on this device
 * (userData/premium-settings.json). Small JSON, written debounced.
 * No electron import, so selftests can load it with a temp dir.
 */

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 256 * 1024;

function createStore({ dir, file = 'premium-settings.json', debounceMs = 250 } = {}) {
  const filePath = dir ? path.join(dir, file) : null;
  let data = {};
  let timer = null;
  const listeners = new Set();

  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw.length < MAX_BYTES) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
      }
    } catch (_) { /* first run or unreadable: start empty */ }
  }

  function flush() {
    timer = null;
    if (!filePath) return;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (_) { /* disk full / read-only: settings stay in memory */ }
  }

  function get(key) {
    const v = data[key];
    return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : {};
  }

  function set(key, patch) {
    if (typeof key !== 'string' || !key || key.length > 64) return get(key);
    const next = { ...get(key), ...(patch && typeof patch === 'object' ? patch : {}) };
    const json = JSON.stringify(next);
    if (json.length > MAX_BYTES / 4) return get(key);
    data[key] = JSON.parse(json);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
    for (const fn of listeners) {
      try { fn(key, get(key)); } catch (_) { /* keep others */ }
    }
    return get(key);
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { get, set, onChange, flush: () => { if (timer) clearTimeout(timer); flush(); }, filePath };
}

module.exports = { createStore };
