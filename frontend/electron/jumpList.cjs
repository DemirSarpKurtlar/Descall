'use strict';

/**
 * 4.2: Windows taskbar jump list (right click on the Descall taskbar button).
 *
 *   Tasks:          Yeni mesaj, Arkadaşlar, status (Çevrimiçi / Boşta / Rahatsız etme / Görünmez)
 *   Son sohbetler:  up to 5 recent DMs
 *
 * The page sends its state (src/lib/jumpList.js jumpListPayload, electronAPI.setJumpList);
 * this module validates it and builds the categories for app.setJumpList. A task starts
 * Descall.exe with one `--descall-task=...` argument; the single-instance lock hands it to
 * the running app (second-instance) or the new instance keeps it until the page takes it.
 * Pure: no electron import, tested by jumpList.selftest.mjs.
 */

const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const MAX_RECENT = 5;
const ARG_PREFIX = '--descall-task=';
const USERNAME_RE = /^[\p{L}\p{N}_.-]{1,64}$/u;
const LABEL_KEYS = ['newMessage', 'friends', 'online', 'idle', 'dnd', 'invisible', 'recent', 'tasks', 'status', 'openChat'];
/** The page always sends every label in the UI language; a missing one shows its key. */
const DEFAULT_LABELS = Object.freeze(Object.fromEntries(LABEL_KEYS.map((k) => [k, k])));

/** Jump list titles: one line, no control characters, Windows' 260 limit well under. */
function cleanText(v, max = 80) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

function normalizeJumpListState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const labels = {};
  const given = src.labels && typeof src.labels === 'object' ? src.labels : {};
  for (const k of LABEL_KEYS) labels[k] = cleanText(given[k]) || DEFAULT_LABELS[k];
  const recent = [];
  const seen = new Set();
  for (const r of Array.isArray(src.recent) ? src.recent : []) {
    const username = cleanText(r && r.username, 64);
    if (!USERNAME_RE.test(username) || seen.has(username)) continue;
    seen.add(username);
    recent.push({ username, name: cleanText(r.name, 60) || username });
    if (recent.length >= MAX_RECENT) break;
  }
  return { signedIn: Boolean(src.signedIn), recent, labels };
}

function sameJumpListState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Categories for app.setJumpList, or null (Windows' own list) when signed out.
 * @param {object} state  normalizeJumpListState() result
 * @param {object} opts   { exePath, iconPath?, iconIndex? }
 */
function buildJumpList(state, { exePath, iconPath = '', iconIndex = 0 } = {}) {
  if (!state || !state.signedIn || !exePath) return null;
  const L = state.labels;
  const task = (title, arg, description = '') => {
    const item = { type: 'task', title, description: description || title, program: exePath, args: `${ARG_PREFIX}${arg}` };
    if (iconPath) {
      item.iconPath = iconPath;
      item.iconIndex = iconIndex;
    }
    return item;
  };
  const tasks = [
    task(L.newMessage, 'newMessage'),
    task(L.friends, 'friends'),
    { type: 'separator' },
    ...STATUSES.map((s) => task(`${L.status}: ${L[s]}`, `status:${s}`)),
  ];
  const categories = [{ type: 'tasks', items: tasks }];
  if (state.recent.length) {
    categories.push({
      type: 'custom',
      name: L.recent,
      items: state.recent.map((r) =>
        task(r.name, `dm:${encodeURIComponent(r.username)}`, L.openChat.split('{name}').join(r.name))
      ),
    });
  }
  return categories;
}

/**
 * The task in a command line, or null. Only the exact shapes buildJumpList writes are
 * accepted (any local process can start Descall.exe with arguments).
 *   { action: 'newMessage' } | { action: 'friends' } | { action: 'status', arg }
 *   | { action: 'open', path: '/direct/<username>' }
 */
function parseJumpTask(argv) {
  const list = Array.isArray(argv) ? argv : [];
  const hit = list.find((a) => typeof a === 'string' && a.startsWith(ARG_PREFIX));
  if (!hit) return null;
  const value = hit.slice(ARG_PREFIX.length);
  if (value === 'newMessage' || value === 'friends') return { action: value };
  if (value.startsWith('status:')) {
    const s = value.slice(7);
    return STATUSES.includes(s) ? { action: 'status', arg: s } : null;
  }
  if (value.startsWith('dm:')) {
    let username = '';
    try {
      username = decodeURIComponent(value.slice(3));
    } catch (_) {
      return null;
    }
    return USERNAME_RE.test(username) ? { action: 'open', path: `/direct/${encodeURIComponent(username)}` } : null;
  }
  return null;
}

module.exports = {
  STATUSES,
  MAX_RECENT,
  ARG_PREFIX,
  DEFAULT_LABELS,
  normalizeJumpListState,
  sameJumpListState,
  buildJumpList,
  parseJumpTask,
};
