'use strict';

const { wrapFeature } = require('../compat.cjs');

/**
 * Multiple accounts (Ultra). Each extra account runs in its own window on its own session
 * partition (session.fromPartition('persist:acct-<id>')): separate localStorage, IndexedDB,
 * cookies and cache, so nothing of account A leaks into account B. Each account's JWT is
 * kept in its own safeStorage-encrypted file (userData/premium/accounts/<id>/auth-token.bin),
 * chosen by main.cjs's secure-token handlers from the sender's session.
 * The partition gets the same descall:// protocol handler and media permission list as the
 * default session; the CSP is carried by the protocol response itself, so it is unchanged.
 * Premium IPC from an account window is refused (entitlements belong to the main account).
 * The tray label comes from the account's own JWT (username claim), read in main.
 * Cost: one full renderer per extra account (~200-400 MB), so the switcher caps it at 3.
 */

const { BrowserWindow, session, app, safeStorage } = require('electron');
const { readEncryptedFile, looksLikeJwt } = require('../../tokenCrypto.cjs');
const hostHooks = require('../hostHooks.cjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_EXTRA = 3;
let ctx = null;
let labels = { menu: '', add: '', main: '' };
const windows = new Map(); // id -> BrowserWindow
const sessions = new Map(); // id -> Session
const protocolDone = new WeakSet();

function store() {
  return ctx.store('accounts');
}

function readAccounts() {
  const v = store().read({ accounts: [] });
  return (Array.isArray(v.accounts) ? v.accounts : []).filter((a) => a && /^[a-f0-9]{12}$/.test(a.id));
}

function writeAccounts(list) {
  store().write({ accounts: list });
}

function accountDir(id) {
  const dir = path.join(ctx.storeDir(), 'accounts', id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionFor(id) {
  if (sessions.has(id)) return sessions.get(id);
  const ses = session.fromPartition(`persist:acct-${id}`);
  sessions.set(id, ses);
  const host = ctx.host() || {};
  if (!protocolDone.has(ses)) {
    protocolDone.add(ses);
    try { host.registerAppProtocolOn?.(ses); } catch (err) { ctx.log('protocol on partition failed', err?.message || err); }
    const allowed = Array.isArray(host.mediaPermissions) ? host.mediaPermissions : [];
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.includes(permission)));
    ses.setPermissionCheckHandler((_wc, permission) => allowed.includes(permission));
  }
  return ses;
}

function tokenFileForSession(ses) {
  if (!ses || ses === session.defaultSession) return null;
  for (const [id, s] of sessions) {
    if (s !== ses) continue;
    const dir = path.join(app.getPath('userData'), 'premium', 'accounts', id);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
    return path.join(dir, 'auth-token.bin');
  }
  return null;
}

function open(id) {
  const acct = readAccounts().find((a) => a.id === id);
  if (!acct) return { ok: false, error: 'missing' };
  const existing = windows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return { ok: true, id };
  }
  const host = ctx.host() || {};
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: labelFor(acct) || 'Descall',
    show: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      partition: `persist:acct-${id}`,
      preload: host.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });
  sessionFor(id);
  windows.set(id, win);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (windows.get(id) === win) windows.delete(id); });
  win.loadURL(host.appUrl ? host.appUrl() : 'descall://app/index.html').catch(() => {});
  return { ok: true, id };
}

function add() {
  const list = readAccounts();
  if (list.length >= MAX_EXTRA) return { ok: false, error: 'limit', max: MAX_EXTRA };
  const id = crypto.randomBytes(6).toString('hex');
  list.push({ id, label: '', createdAt: new Date().toISOString() });
  writeAccounts(list);
  accountDir(id);
  rebuildTray();
  return open(id);
}

async function remove(id) {
  const list = readAccounts();
  if (!list.some((a) => a.id === id)) return { ok: false, error: 'missing' };
  const win = windows.get(id);
  if (win && !win.isDestroyed()) win.destroy();
  windows.delete(id);
  try { await sessionFor(id).clearStorageData(); } catch (_) { /* ignore */ }
  try { fs.rmSync(path.join(ctx.storeDir(), 'accounts', id), { recursive: true, force: true }); } catch (_) { /* ignore */ }
  sessions.delete(id);
  usernames.delete(id);
  writeAccounts(list.filter((a) => a.id !== id));
  rebuildTray();
  return { ok: true };
}

function rebuildTray() {
  if (!ctx) return;
  if (!labels.menu) { ctx.setTrayItems([]); return; }
  const list = readAccounts();
  // Names come from the cache; a background re-read rebuilds once more if one changed.
  refreshUsernames().catch(() => {});
  const items = [
    { label: labels.main || 'Descall', click: () => { const w = ctx.getMainWindow(); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } } },
    ...list.map((a) => ({ label: labelFor(a) || labels.unnamed || a.id, click: () => open(a.id) })),
  ];
  if (list.length < MAX_EXTRA && labels.add) items.push({ type: 'separator' }, { label: labels.add, click: () => add() });
  ctx.setTrayItems([{ label: labels.menu, submenu: items }]);
}

// Username claim of an account's stored JWT (display only, never trusted for auth).
// Electron 45: safeStorage is async (tokenCrypto.cjs), so the names are decrypted in the
// background into this cache; the tray, window titles and the list read the cache.
const usernames = new Map();

async function refreshUsername(id) {
  let name = '';
  try {
    const file = path.join(app.getPath('userData'), 'premium', 'accounts', id, 'auth-token.bin');
    if (fs.existsSync(file)) {
      const jwt = await readEncryptedFile(safeStorage, fs, file, { legacyPlain: looksLikeJwt });
      const payload = JSON.parse(Buffer.from(String(jwt).split('.')[1] || '', 'base64url').toString('utf8'));
      name = String(payload.username || '').slice(0, 40);
    }
  } catch (_) { /* unreadable token: no name */ }
  const changed = (usernames.get(id) || '') !== name;
  usernames.set(id, name);
  return changed;
}

/** Re-read every account's name; rebuilds the tray when one changed. */
async function refreshUsernames() {
  let changed = false;
  for (const a of readAccounts()) {
    if (await refreshUsername(a.id)) changed = true;
  }
  if (changed) rebuildTray();
}

function tokenUsername(id) {
  return usernames.get(id) || '';
}

function labelFor(a) {
  return tokenUsername(a.id) || a.label || '';
}

function isAccountWebContents(wc) {
  for (const w of windows.values()) if (w && !w.isDestroyed() && w.webContents === wc) return true;
  return false;
}

function listPublic() {
  return readAccounts().map((a) => ({ id: a.id, label: labelFor(a), createdAt: a.createdAt, open: Boolean(windows.get(a.id) && !windows.get(a.id).isDestroyed()), signedIn: fs.existsSync(path.join(ctx.storeDir(), 'accounts', a.id, 'auth-token.bin')) }));
}

module.exports = wrapFeature({
  key: 'multi_account',
  start(c) {
    ctx = c;
    // Sessions of known accounts exist up front so their token files resolve.
    for (const a of readAccounts()) sessionFor(a.id);
    hostHooks.set('tokenFileForSession', tokenFileForSession);
    hostHooks.set('isAccountWebContents', isAccountWebContents);
    refreshUsernames().catch(() => {});
    ctx.handle('premium:multi_account:list', async () => {
      await refreshUsernames().catch(() => {});
      return { ok: true, accounts: listPublic(), max: MAX_EXTRA };
    });
    ctx.handle('premium:multi_account:add', () => add());
    ctx.handle('premium:multi_account:open', (_e, id) => open(String(id || '')));
    ctx.handle('premium:multi_account:remove', (_e, id) => remove(String(id || '')));
    ctx.handle('premium:multi_account:labels', (_e, next = {}) => {
      labels = {
        menu: String(next.menu || '').slice(0, 40),
        add: String(next.add || '').slice(0, 40),
        main: String(next.main || '').slice(0, 60),
        unnamed: String(next.unnamed || '').slice(0, 40),
      };
      rebuildTray();
      return { ok: true };
    });
  },
  stop() {
    for (const w of windows.values()) { try { if (!w.isDestroyed()) w.destroy(); } catch (_) { /* ignore */ } }
    windows.clear();
    // Sessions stay registered: tokens of extra accounts still resolve to their own files.
    ctx = null;
  },
  _tokenFileForSession: tokenFileForSession,
});
