'use strict';

/**
 * Small JSON settings store for Descall+ desktop features: userData/premium-settings.json.
 *
 *   store.get(path, fallback)        dotted path read ("features.mini_mode.enabled")
 *   store.set(path, value)           write + debounced flush
 *   store.feature(key)               settings object of one feature ({} when unset)
 *   store.patchFeature(key, patch)   shallow merge into one feature's settings
 *   store.onChange(fn)               fn(path) after every write
 *   store.flush()                    write now (before quit)
 *
 * Writes go to a temp file then rename, so a crash never leaves half a file. A corrupt
 * file is moved aside and the store starts empty. No electron import (selftested).
 */

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 512 * 1024;
const FLUSH_MS = 400;
const BAD_SEGMENT = /^(__proto__|prototype|constructor)$/;

function splitPath(p) {
  const parts = String(p || '').split('.').filter(Boolean);
  if (!parts.length || parts.some((s) => BAD_SEGMENT.test(s))) throw new Error(`bad store path: ${p}`);
  return parts;
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function createStore(file, { log = null, flushMs = FLUSH_MS } = {}) {
  let data = {};
  let timer = null;
  const listeners = new Set();

  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    }
  } catch (err) {
    try { log?.warn?.('[premium] settings unreadable, starting fresh:', err?.message || err); } catch (_) { /* ignore */ }
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch (_) { /* ignore */ }
    data = {};
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    try {
      const text = JSON.stringify(data, null, 2);
      if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('settings too large');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, text, 'utf8');
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      try { log?.warn?.('[premium] settings write failed:', err?.message || err); } catch (_) { /* ignore */ }
      return false;
    }
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(flush, flushMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function get(p, fallback) {
    let node = data;
    for (const part of splitPath(p)) {
      if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) return fallback;
      node = node[part];
    }
    return node === undefined ? fallback : clone(node);
  }

  function set(p, value) {
    const parts = splitPath(p);
    let node = data;
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== 'object' || Array.isArray(node[part])) node[part] = {};
      node = node[part];
    }
    const last = parts[parts.length - 1];
    if (value === undefined) delete node[last];
    else node[last] = clone(value);
    scheduleFlush();
    for (const fn of [...listeners]) {
      try { fn(p); } catch (_) { /* ignore */ }
    }
    return true;
  }

  function feature(key) {
    const v = get(`features.${key}`, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  function patchFeature(key, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return feature(key);
    const next = { ...feature(key) };
    for (const [k, v] of Object.entries(patch)) {
      if (BAD_SEGMENT.test(k)) continue;
      if (v === null || v === undefined) delete next[k];
      else next[k] = v;
    }
    set(`features.${key}`, next);
    return next;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function all() {
    return clone(data);
  }

  return { get, set, feature, patchFeature, onChange, flush, all, file };
}

module.exports = { createStore };
