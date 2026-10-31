'use strict';

/**
 * Main-process text (splash, tray, dialogs, notification cards, voice overlay,
 * window titles). Catalogs: electron/i18n/<id>.json, one per locale of
 * src/i18n/locales.json (packaged with the app, see package.json build.files).
 *
 * Active language:
 *   1. the UI language the renderer reports (preload electronAPI.setLocale ->
 *      'app:locale'), remembered in userData/ui-locale.json for the next splash;
 *   2. else the OS languages matched against the live locales (a Turkish device
 *      keeps Turkish, a draft match falls back to English, like src/i18n/detect.js).
 * et(key, vars) falls back to English, then to the key.
 * No electron import, so selftests can load it.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_DIR = path.join(__dirname, 'i18n');
const REGISTRY_PATH = path.join(__dirname, '..', 'src', 'i18n', 'locales.json');

function loadRegistry() {
  try {
    const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (data && Array.isArray(data.locales) && data.locales.length) return data;
  } catch (_) { /* packaged without src/: fall back below */ }
  return { fallback: 'en', locales: [{ id: 'en', status: 'live' }, { id: 'tr', status: 'live' }] };
}

const REGISTRY = loadRegistry();
const FALLBACK = REGISTRY.fallback || 'en';
const LOCALES = REGISTRY.locales.map((l) => ({ id: String(l.id), status: String(l.status || 'draft') }));
const IDS = LOCALES.map((l) => l.id);

const catalogs = new Map();
function catalog(id) {
  if (catalogs.has(id)) return catalogs.get(id);
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, `${id}.json`), 'utf8'));
  } catch (_) {
    data = null;
  }
  catalogs.set(id, data);
  return data;
}

function lookup(data, key) {
  let node = data;
  for (const part of String(key).split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined || vars[name] === null ? m : String(vars[name])));
}

/**
 * Registered locale id for a language value ("tr-TR", "pt", "pt_BR", "de-AT"), or null.
 * liveOnly: drafts do not count (OS detection); a UI choice may be a draft (preview).
 */
function matchLocale(value, { liveOnly = false } = {}) {
  const raw = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  if (!raw) return null;
  const ok = (l) => !liveOnly || l.status === 'live';
  const exact = LOCALES.find((l) => l.id.toLowerCase() === raw);
  if (exact) return ok(exact) ? exact.id : null;
  const base = raw.split('-')[0];
  if (!/^[a-z]{2,3}$/.test(base)) return null;
  const same = LOCALES.find((l) => l.id.toLowerCase().split('-')[0] === base);
  return same && ok(same) ? same.id : null;
}

/** Pure: the language main-process text uses. */
function resolveLocale({ ui = null, os = [], timeZone = '' } = {}) {
  const fromUi = matchLocale(ui);
  if (fromUi) return fromUi;
  const langs = (Array.isArray(os) ? os : [os]).filter(Boolean).map((l) => String(l).replace(/_/g, '-').toLowerCase());
  const trOk = matchLocale('tr', { liveOnly: true });
  if (trOk && (langs.some((l) => l === 'tr' || l.startsWith('tr-')) || timeZone === 'Europe/Istanbul' || langs.some((l) => l.endsWith('-tr')))) {
    return trOk;
  }
  for (const lang of langs) {
    const hit = matchLocale(lang, { liveOnly: true });
    if (hit) return hit;
  }
  return FALLBACK;
}

let active = FALLBACK;
let uiLocale = null;
let storePath = null;
const listeners = new Set();

function getLocale() {
  return active;
}

function apply(next) {
  if (!next || next === active) return false;
  active = next;
  for (const fn of listeners) {
    try { fn(active); } catch (_) { /* a listener must not break the others */ }
  }
  return true;
}

/** Locale the renderer reports. Returns true when the active language changed. */
function setUiLocale(value) {
  const id = matchLocale(value);
  if (!id) return false;
  uiLocale = id;
  if (storePath) {
    try { fs.writeFileSync(storePath, JSON.stringify({ locale: id }), 'utf8'); } catch (_) { /* ignore */ }
  }
  return apply(id);
}

/** Direct switch (selftests, previews). */
function setLocale(value) {
  const id = matchLocale(value);
  return id ? apply(id) : false;
}

/**
 * Boot: last UI language from userData, else the OS languages.
 * osLanguages: app.getPreferredSystemLanguages() plus app.getLocale().
 */
function initLocale({ userDataDir = null, osLanguages = [] } = {}) {
  if (userDataDir) {
    storePath = path.join(userDataDir, 'ui-locale.json');
    try {
      const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      uiLocale = matchLocale(saved?.locale);
    } catch (_) { /* first run */ }
  }
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { /* ignore */ }
  apply(resolveLocale({ ui: uiLocale, os: osLanguages, timeZone }));
  return active;
}

function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function etFor(locale, key, vars) {
  const text = lookup(catalog(locale), key) ?? lookup(catalog(FALLBACK), key) ?? String(key);
  return interpolate(text, vars);
}

function et(key, vars) {
  return etFor(active, key, vars);
}

/** One namespace for every locale ({ en: {...}, tr: {...} }), for pages that switch on their own (overlay). */
function namespaceForAll(ns) {
  const out = {};
  const base = (catalog(FALLBACK) || {})[ns] || {};
  for (const id of IDS) {
    const own = (catalog(id) || {})[ns] || {};
    out[id] = { ...base, ...own };
  }
  return out;
}

module.exports = {
  LOCALE_IDS: IDS,
  FALLBACK_LOCALE: FALLBACK,
  matchLocale,
  resolveLocale,
  initLocale,
  setUiLocale,
  setLocale,
  getLocale,
  onLocaleChange,
  et,
  etFor,
  namespaceForAll,
  catalog,
};
