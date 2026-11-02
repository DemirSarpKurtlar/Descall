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
 * Premium IPC from an account window is refused (entitlements belong to the main account),
 * except 'premium:multi_account:whoami', checked here against the account sessions.
 * Cost: one full renderer per extra account (~200-400 MB), so the switcher caps it at 3.
 */

const { BrowserWindow, session, app, ipcMain } = require('electron');
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
    title: acct.label || 'Descall',
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
  writeAccounts(list.filter((a) => a.id !== id));
  rebuildTray();
  return { ok: true };
}

function rebuildTray() {
  if (!ctx) return;
  if (!labels.menu) { ctx.setTrayItems([]); return; }
  const list = readAccounts();
  const items = [
    { label: labels.main || 'Descall', click: () => { const w = ctx.getMainWindow(); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } } },
    ...list.map((a) => ({ label: a.label || labels.unnamed || a.id, click: () => open(a.id) })),
  ];
  if (list.length < MAX_EXTRA && labels.add) items.push({ type: 'separator' }, { label: labels.add, click: () => add() });
  ctx.setTrayItems([{ label: labels.menu, submenu: items }]);
}

function listPublic() {
  return readAccounts().map((a) => ({ id: a.id, label: a.label, createdAt: a.createdAt, open: Boolean(windows.get(a.id) && !windows.get(a.id).isDestroyed()), signedIn: fs.existsSync(path.join(ctx.storeDir(), 'accounts', a.id, 'auth-token.bin')) }));
}

module.exports = wrapFeature({
  key: 'multi_account',
  start(c) {
    ctx = c;
    // Sessions of known accounts exist up front so their token files resolve.
    for (const a of readAccounts()) sessionFor(a.id);
    hostHooks.set('tokenFileForSession', tokenFileForSession);
    ctx.handle('premium:multi_account:list', () => ({ ok: true, accounts: listPublic(), max: MAX_EXTRA }));
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
    // An account window reports who signed in, so the tray can show the name. Registered on
    // ipcMain directly: the host only lets the main window and its own windows through.
    ipcMain.removeHandler('premium:multi_account:whoami');
    ipcMain.handle('premium:multi_account:whoami', (event, who = {}) => {
      if (!ctx) return { ok: false };
      const ses = event.sender.session;
      const id = [...sessions].find(([, s2]) => s2 === ses)?.[0];
      if (!id) return { ok: false };
      const list = readAccounts().map((a) => (a.id === id ? { ...a, label: String(who.username || '').slice(0, 40) } : a));
      writeAccounts(list);
      rebuildTray();
      return { ok: true, id };
    });
  },
  stop() {
    ipcMain.removeHandler('premium:multi_account:whoami');
    for (const w of windows.values()) { try { if (!w.isDestroyed()) w.destroy(); } catch (_) { /* ignore */ } }
    windows.clear();
    // Sessions stay registered: tokens of extra accounts still resolve to their own files.
    ctx = null;
  },
  _tokenFileForSession: tokenFileForSession,
});
