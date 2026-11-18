'use strict';
/**
 * NOT WIRED: nothing in frontend/electron requires this file. Ships with the Electron "bridge"
 * release only after the P0 gate passes on real Windows hardware, behind DESCALL_MIGRATION_BRIDGE=1.
 * Ships in the last Electron line (e.g. 3.10.x) through the normal electron-updater channel.
 * Wire-up in main.cjs: after app 'ready' + first update check, call startMigrationLoop(ctx).
 *
 *  1. Ask the server for a plan (staged rollout, kill switch). The plan is signed with an
 *     Ed25519 key that is pinned here, so neither GitHub nor a CDN can push a binary.
 *  2. Wait for the same quiet moment as an update install (updateDeferral.cjs): no call, no
 *     typing/upload, not just after a call.
 *  3. Download DescallMigrator.exe + Descall-Setup-<v>.exe (Tauri NSIS), check size + SHA-256
 *     from the signed plan.
 *  4. Export secrets with safeStorage, localStorage of descall://app and every account
 *     partition, premium files, window state, autostart, locale -> pipe JSON to
 *     `DescallMigrator.exe --receive-handoff` (it DPAPI-seals it; plaintext never hits disk).
 *  5. Spawn `DescallMigrator.exe --run --setup <path>` detached, then quit (isQuitting = true).
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PLAN_URL = 'https://api.descall.com/api/desktop/migration/plan';
const REPORT_URL = 'https://api.descall.com/api/desktop/migration/report';
// Ed25519 public key (SPKI, base64). The private half is offline (release signing machine).
const PLAN_PUBKEY_B64 = 'REPLACE_WITH_ED25519_SPKI_BASE64';
const MIN_WIN_BUILD = 19041; // Windows 10 2004: WGC cursor toggle + process loopback

function winBuild() {
  const m = /^10\.0\.(\d+)/.exec(os.release());
  return m ? Number(m[1]) : 0;
}

function verifyPlan(body, sigB64) {
  const key = crypto.createPublicKey({ key: Buffer.from(PLAN_PUBKEY_B64, 'base64'), format: 'der', type: 'spki' });
  return crypto.verify(null, Buffer.from(body, 'utf8'), key, Buffer.from(String(sigB64 || ''), 'base64'));
}

async function fetchPlan({ net, installId, version }) {
  const url = `${PLAN_URL}?installId=${encodeURIComponent(installId)}&v=${encodeURIComponent(version)}&build=${winBuild()}`;
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const body = await res.text();
  if (!verifyPlan(body, res.headers.get('x-descall-plan-sig'))) throw new Error('plan signature invalid');
  const plan = JSON.parse(body);
  // { action: 'migrate'|'wait'|'none', wave, notBefore, migrator: {url,sha256,size}, setup: {url,sha256,size,version} }
  if (plan.installId !== installId) throw new Error('plan for another install');
  return plan;
}

async function download({ net, url, sha256, size, dest }) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== size) throw new Error('size mismatch');
  if (crypto.createHash('sha256').update(buf).digest('hex') !== sha256) throw new Error('sha256 mismatch');
  await fs.promises.writeFile(dest, buf);
  return dest;
}

/** localStorage of one webContents as { key: value } (the app origin only). */
async function dumpLocalStorage(wc) {
  if (!wc || wc.isDestroyed()) return {};
  const json = await wc.executeJavaScript(
    '(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o); })()',
    true,
  );
  return JSON.parse(json || '{}');
}

async function buildHandoff(ctx) {
  const { app, safeStorage, mainWindow, readEncryptedFile, looksLikeJwt, premium, readOpenAtLogin, autostartDecided, getLocale } = ctx;
  const ud = app.getPath('userData');
  const readSecret = async (file, opts) => {
    try { return fs.existsSync(file) ? await readEncryptedFile(safeStorage, fs, file, opts) : null; } catch (_) { return null; }
  };
  const token = await readSecret(path.join(ud, 'auth-token.bin'), { legacyPlain: looksLikeJwt });
  const accounts = [];
  for (const acct of (premium?.listAccounts?.() || [])) {
    const t = await readSecret(path.join(ud, 'premium', 'accounts', acct.id, 'auth-token.bin'), { legacyPlain: looksLikeJwt });
    if (t) accounts.push({ id: acct.id, label: acct.label || '', token: t, localStorage: await dumpLocalStorage(premium.accountWebContents?.(acct.id)) });
  }
  const premiumFiles = {};
  for (const name of ['premium-settings.json', 'custom-layouts.json', 'window-layouts.json', 'widgets.json']) {
    const p = path.join(ud, 'premium', name);
    try { if (fs.existsSync(p)) premiumFiles[name] = fs.readFileSync(p, 'utf8'); } catch (_) {}
  }
  let windowState = null;
  try { windowState = { ...JSON.parse(fs.readFileSync(path.join(ud, 'window-state.json'), 'utf8')), unit: 'dip' }; } catch (_) {}
  const local = await dumpLocalStorage(mainWindow?.webContents);
  delete local.descall_token; // never in clear (the shell keeps it in DPAPI)
  return {
    version: 1,
    createdAtUnix: Math.floor(Date.now() / 1000),
    electronVersion: app.getVersion(),
    installId: ctx.installId,
    installDir: path.dirname(app.getPath('exe')),
    perMachine: /program files/i.test(app.getPath('exe')),
    token: token && looksLikeJwt(token) ? token : null,
    accounts,
    localStorage: local,
    windowState,
    autostart: { enabled: readOpenAtLogin(), disabledByUser: false, decided: autostartDecided() },
    locale: getLocale(),
    premiumFiles,
    appLockRecord: await readSecret(path.join(ud, 'premium', 'app-lock.bin')),
    flags: { devtools: fs.existsSync(path.join(ud, 'devtools-enabled')) },
  };
}

function runMigrator(exe, args, stdinJson) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: [stdinJson ? 'pipe' : 'ignore', 'ignore', 'ignore'], detached: !stdinJson });
    child.on('error', () => resolve(-1));
    if (stdinJson) {
      child.stdin.end(stdinJson);
      child.on('exit', (code) => resolve(code));
    } else {
      child.unref();
      resolve(0);
    }
  });
}

async function report(net, body) {
  try { await net.fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch (_) {}
}

/** One attempt. ctx.isQuietMoment() = updateDeferral's decision (no call, idle/background). */
async function tryMigrate(ctx) {
  const { app, net, log } = ctx;
  if (process.platform !== 'win32' || !app.isPackaged) return 'skip';
  if (winBuild() < MIN_WIN_BUILD) return 'unsupported-os';
  const plan = await fetchPlan({ net, installId: ctx.installId, version: app.getVersion() });
  if (!plan || plan.action !== 'migrate') return plan?.action || 'none';
  if (!ctx.isQuietMoment()) return 'wait';
  const dir = path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'Descall-Migration');
  await fs.promises.mkdir(dir, { recursive: true });
  const migrator = await download({ net, ...plan.migrator, dest: path.join(dir, 'DescallMigrator.exe') });
  const setup = await download({ net, ...plan.setup, dest: path.join(dir, `Descall-Setup-${plan.setup.version}.exe`) });
  if (!ctx.isQuietMoment()) return 'wait'; // re-check after the download
  const handoff = JSON.stringify(await buildHandoff(ctx));
  const code = await runMigrator(migrator, ['--receive-handoff'], handoff);
  if (code !== 0) { await report(net, { installId: ctx.installId, step: 'handoff', code }); return 'handoff-failed'; }
  await report(net, { installId: ctx.installId, step: 'start', wave: plan.wave });
  await runMigrator(migrator, ['--run', '--setup', setup], null);
  log.info('[migration] migrator started, quitting Electron');
  ctx.quitForMigration(); // sets isQuitting, hides tray, app.quit()
  return 'started';
}

/** Every 30 min (and at boot after the first update check); backs off on errors. */
function startMigrationLoop(ctx) {
  let delay = 60 * 1000;
  const tick = async () => {
    let r = 'error';
    try { r = await tryMigrate(ctx); } catch (err) { ctx.log.warn('[migration]', err?.message || err); }
    if (r === 'started' || r === 'skip' || r === 'unsupported-os') return;
    delay = r === 'error' || r.endsWith('failed') ? Math.min(delay * 2, 6 * 3600 * 1000) : 30 * 60 * 1000;
    setTimeout(tick, delay);
  };
  setTimeout(tick, delay);
}

module.exports = { startMigrationLoop, tryMigrate, buildHandoff, verifyPlan, winBuild, MIN_WIN_BUILD };
