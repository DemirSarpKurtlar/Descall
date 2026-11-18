'use strict';

/**
 * Electron -> Tauri migration bridge (loaded only when migrationBridgeConfig.cjs
 * MIGRATION_BRIDGE_ENABLED is true; OFF in shipped builds).
 *
 *  1. Ask the server for a plan (GET /api/desktop/migration/plan). The body is signed with
 *     Ed25519; the public key is pinned in migrationBridgeConfig.cjs, so neither GitHub nor
 *     a CDN nor a proxy can push a binary. The plan is bound to this install and user and
 *     expires.
 *  2. Wait for the same quiet moment as an update install (updateDeferral.cjs: no call, no
 *     typing / upload, idle or in the background).
 *  3. Download DescallMigrator.exe and the new setup; size and SHA-256 must match the plan.
 *  4. Decrypt our own secrets with safeStorage, export localStorage of descall://app,
 *     premium files, window state, autostart and locale, and pipe { job, handoff } to
 *     `DescallMigrator.exe --receive-handoff` over stdin (it DPAPI-seals it; plain text
 *     never touches the disk).
 *  5. Spawn `DescallMigrator.exe --run` detached, then quit. The migrator renames the
 *     install to .legacy, installs the new app into the same folder, waits for its "ready"
 *     signal and otherwise rolls back and relaunches us with --migration-failed.
 *
 * Also on every start: report the outcome after a rollback (--migration-failed /
 * --migration-skipped / --migration-needs-help, from `--status`), resume a migration that a
 * crash interrupted, and forward to the new app when a side-by-side move already happened
 * (an all-users Start menu shortcut still pointing at Program Files).
 *
 * Every dependency is passed in (deps), so migrationBridge.selftest.mjs runs it with fakes.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MIN_WIN_BUILD = 19041;
const PLAN_VERSION = 1;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_FAILURE_MS = 3 * 24 * 3600 * 1000;
const HANDOFF_TIMEOUT_MS = 60 * 1000;
const LOOP_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 2 * 60 * 1000;
const MAX_DOWNLOAD = 512 * 1024 * 1024;
const WORK_DIR_NAME = 'Descall-Migration';
const RELAUNCH_FLAGS = { '--migration-failed': 'failed', '--migration-skipped': 'skipped', '--migration-needs-help': 'needs_help' };
const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'descall.com', 'www.descall.com', 'api.descall.com', 'cdn.descall.com']);
const TERMINAL_STEPS = new Set(['ready', 'done', 'skipped', 'needs_help']);
const SECRET_LOCAL_STORAGE_KEYS = ['descall_token', 'token', 'authToken'];

/** Windows build from os.release() ("10.0.22631" -> 22631). */
function winBuild(release = os.release()) {
  const m = /^10\.0\.(\d+)/.exec(String(release));
  return m ? Number(m[1]) : 0;
}

/** True when any pinned key verifies `sigB64` over the exact UTF-8 body. */
function verifyPlanSignature(body, sigB64, publicKeys) {
  if (!sigB64 || !Array.isArray(publicKeys) || !publicKeys.length) return false;
  const sig = Buffer.from(String(sigB64), 'base64');
  if (sig.length !== 64) return false;
  return publicKeys.some((k) => {
    try {
      const key = crypto.createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' });
      return key.asymmetricKeyType === 'ed25519' && crypto.verify(null, Buffer.from(body, 'utf8'), key, sig);
    } catch (_) {
      return false;
    }
  });
}

function isAllowedDownloadUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
  } catch (_) {
    return false;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
function checkArtifact(a, name) {
  if (!a || !isAllowedDownloadUrl(a.url) || !HEX64.test(String(a.sha256)) || !Number.isInteger(a.size) || a.size <= 0 || a.size > MAX_DOWNLOAD) {
    throw new Error(`plan_bad_${name}`);
  }
}

/** Parse a verified plan body; throws Error(code) on anything unexpected. */
function parsePlan(body, { installId, userId, nowSec }) {
  let plan;
  try {
    plan = JSON.parse(body);
  } catch (_) {
    throw new Error('plan_not_json');
  }
  if (!plan || plan.v !== PLAN_VERSION) throw new Error('plan_version');
  if (plan.installId !== installId) throw new Error('plan_other_install');
  if (userId && plan.userId && plan.userId !== userId) throw new Error('plan_other_user');
  if (!(plan.expiresAt > nowSec) || plan.issuedAt > nowSec + 600) throw new Error('plan_expired');
  if (plan.action !== 'migrate') return plan;
  checkArtifact(plan.migrator, 'migrator');
  checkArtifact(plan.setup, 'setup');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(plan.migrationId || ''))) throw new Error('plan_bad_id');
  if (!/^[0-9A-Za-z.+-]{1,32}$/.test(String(plan.setup.version || ''))) throw new Error('plan_bad_setup');
  return plan;
}

/** `sub` of our own session JWT (not verified: only to compare with the plan). */
function tokenSubject(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch (_) {
    return null;
  }
}

/** Download `url` to `dest`; size and SHA-256 must match. Written to a temp name first. */
async function downloadVerified({ fetchImpl, url, sha256, size, dest, fsImpl = fs }) {
  if (!isAllowedDownloadUrl(url)) throw new Error('download_bad_url');
  // Reuse a verified copy from an earlier attempt.
  try {
    const have = await fsImpl.promises.readFile(dest);
    if (have.length === size && crypto.createHash('sha256').update(have).digest('hex') === sha256) return dest;
  } catch (_) { /* not there */ }
  const res = await fetchImpl(url, { cache: 'no-store', redirect: 'follow' });
  if (!res || !res.ok) throw new Error(`download_http_${res ? res.status : 0}`);
  const len = Number(res.headers?.get?.('content-length') || 0);
  if (len && len !== size) throw new Error('download_size_mismatch');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== size) throw new Error('download_size_mismatch');
  if (crypto.createHash('sha256').update(buf).digest('hex') !== sha256) throw new Error('download_sha256_mismatch');
  await fsImpl.promises.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  await fsImpl.promises.writeFile(tmp, buf);
  await fsImpl.promises.rename(tmp, dest);
  return dest;
}

/** localStorage of one webContents as { key: value } (the app origin only). */
async function dumpLocalStorage(wc) {
  if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) return {};
  const json = await wc.executeJavaScript(
    '(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o); })()',
    true,
  );
  const out = JSON.parse(json || '{}');
  for (const k of SECRET_LOCAL_STORAGE_KEYS) delete out[k];
  return out;
}

const ACCOUNT_ID = /^[a-f0-9]{12}$/;
const SAFE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,90}\.json$/;

/** premium-settings.json + userData/premium/*.json (as "premium.<name>"), small files only. */
function readPremiumFiles(userData, fsImpl = fs) {
  const out = {};
  const add = (name, file) => {
    try {
      const st = fsImpl.statSync(file);
      if (st.isFile() && st.size <= 1024 * 1024) out[name] = fsImpl.readFileSync(file, 'utf8');
    } catch (_) { /* skip */ }
  };
  add('premium-settings.json', path.join(userData, 'premium-settings.json'));
  try {
    for (const n of fsImpl.readdirSync(path.join(userData, 'premium'))) {
      if (SAFE_NAME.test(n) && Object.keys(out).length < 60) add(`premium.${n}`, path.join(userData, 'premium', n));
    }
  } catch (_) { /* no premium folder */ }
  return out;
}

/** The secret part, built in memory only. */
async function buildHandoff(deps, plan, installId) {
  const ud = deps.app.getPath('userData');
  const readSecret = async (file, opts) => {
    try {
      return deps.fs.existsSync(file) ? await deps.readEncryptedFile(file, opts) : null;
    } catch (_) {
      return null;
    }
  };
  const token = await readSecret(path.join(ud, 'auth-token.bin'), { jwt: true });
  const accounts = [];
  try {
    for (const id of deps.fs.readdirSync(path.join(ud, 'premium', 'accounts'))) {
      if (!ACCOUNT_ID.test(id)) continue;
      const t = await readSecret(path.join(ud, 'premium', 'accounts', id, 'auth-token.bin'), { jwt: true });
      if (t && deps.looksLikeJwt(t)) accounts.push({ id, label: '', token: t, localStorage: await dumpLocalStorage(deps.accountWebContents?.(id)).catch(() => ({})) });
    }
  } catch (_) { /* no extra accounts */ }
  const win = deps.getMainWindow?.();
  let windowState = null;
  try {
    if (win && !win.isDestroyed()) {
      const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
      windowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: Boolean(win.isMaximized?.()), unit: 'dip' };
    }
  } catch (_) { /* keep null */ }
  const exe = deps.app.getPath('exe');
  return {
    version: 1,
    createdAtUnix: Math.floor(deps.now() / 1000),
    electronVersion: deps.app.getVersion(),
    installId,
    migrationId: plan.migrationId,
    installDir: path.dirname(exe),
    perMachine: /\\program files( \(x86\))?\\/i.test(exe),
    token: token && deps.looksLikeJwt(token) ? token : null,
    accounts,
    localStorage: await dumpLocalStorage(win?.webContents).catch(() => ({})),
    windowState,
    autostart: { enabled: Boolean(deps.readOpenAtLogin?.()), disabledByUser: false, decided: true },
    locale: deps.getLocale?.() || null,
    premiumFiles: readPremiumFiles(ud, deps.fs),
    appLockRecord: await readSecret(path.join(ud, 'premium', 'app-lock.bin')),
    flags: {},
  };
}

function buildJob(deps, plan, installId, setupPath) {
  const exe = deps.app.getPath('exe');
  const win = deps.getMainWindow?.();
  return {
    id: plan.migrationId,
    installId,
    createdAtUnix: Math.floor(deps.now() / 1000),
    setup: { path: setupPath, sha256: plan.setup.sha256, size: plan.setup.size, version: plan.setup.version, args: plan.setup.args || ['/S', '/D={dir}'] },
    electronExe: exe,
    electronVersion: deps.app.getVersion(),
    launchHidden: Boolean(win && !win.isDestroyed() && !win.isVisible()),
    perMachineHint: /\\program files( \(x86\))?\\/i.test(exe),
    healthTimeoutSecs: plan.healthTimeoutSec || 180,
    minWinBuild: plan.minWinBuild || MIN_WIN_BUILD,
  };
}

/** Pipe `stdinText` to the migrator; resolves with its exit code (-1 on spawn error / timeout). */
function pipeToMigrator(spawnImpl, exe, args, stdinText, timeoutMs = HANDOFF_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(code);
    };
    let child;
    try {
      child = spawnImpl(exe, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    } catch (_) {
      resolve(-1);
      return;
    }
    timer = setTimeout(() => {
      try { child.kill(); } catch (_) { /* gone */ }
      finish(-1);
    }, timeoutMs);
    child.on('error', () => finish(-1));
    child.on('exit', (code) => finish(code == null ? -1 : code));
    child.stdin.on?.('error', () => { /* the migrator closed stdin early: its exit code tells why */ });
    child.stdin.end(stdinText);
  });
}

/** Run the migrator and collect stdout (for --status). */
function runForOutput(spawnImpl, exe, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawnImpl(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (_) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => { try { child.kill(); } catch (_) { /* gone */ } resolve(null); }, timeoutMs);
    child.stdout?.on?.('data', (d) => { if (out.length < 64 * 1024) out += d; });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('exit', (code) => { clearTimeout(timer); resolve(code === 0 ? out : null); });
  });
}

function spawnDetached(spawnImpl, exe, args) {
  const child = spawnImpl(exe, args, { windowsHide: true, detached: true, stdio: 'ignore' });
  child.unref?.();
  return child;
}

/* ---------------------------------------------------------------- local state */

function bridgeStatePath(deps) {
  return path.join(deps.app.getPath('userData'), 'migration-bridge.json');
}

function loadBridgeState(deps) {
  try {
    const v = JSON.parse(deps.fs.readFileSync(bridgeStatePath(deps), 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch (_) {
    return {};
  }
}

function saveBridgeState(deps, s) {
  try {
    deps.fs.writeFileSync(bridgeStatePath(deps), JSON.stringify(s));
  } catch (_) { /* best effort */ }
}

/** Retry policy: at most MAX_ATTEMPTS per migration id, 3 days apart after a failure. */
function shouldAttempt(state, plan, nowMs) {
  const same = state.migrationId === plan.migrationId;
  const attempts = same ? Number(state.attempts || 0) : 0;
  if (attempts >= MAX_ATTEMPTS && !plan.retryFailed) return false;
  if (same && state.lastFailureAt && nowMs - state.lastFailureAt < RETRY_AFTER_FAILURE_MS && !plan.retryFailed) return false;
  return true;
}

/** Stable install id: electron-updater's .updaterId when present, else our own. */
function installIdFor(deps) {
  const ud = deps.app.getPath('userData');
  for (const f of ['.updaterId', 'migration-install-id']) {
    try {
      const v = deps.fs.readFileSync(path.join(ud, f), 'utf8').trim();
      if (/^[A-Za-z0-9-]{8,64}$/.test(v)) return v;
    } catch (_) { /* next */ }
  }
  const id = crypto.randomUUID();
  try { deps.fs.writeFileSync(path.join(ud, 'migration-install-id'), id); } catch (_) { /* in memory */ }
  return id;
}

function workDir(deps) {
  const base = deps.env.LOCALAPPDATA || deps.app.getPath('temp');
  return path.join(base, WORK_DIR_NAME);
}

/* ---------------------------------------------------------------- server */

async function report(deps, token, body) {
  if (!token) return;
  try {
    await deps.fetch(`${deps.config.API_BASE}/api/desktop/migration/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ winBuild: winBuild(deps.osRelease), electronVersion: deps.app.getVersion(), ...body }),
    });
  } catch (_) { /* telemetry never blocks */ }
}

async function fetchPlan(deps, token, installId) {
  const q = new URLSearchParams({ installId, v: deps.app.getVersion(), build: String(winBuild(deps.osRelease)), arch: deps.arch, platform: deps.platform });
  const res = await deps.fetch(`${deps.config.API_BASE}/api/desktop/migration/plan?${q}`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
  if (!res || !res.ok) throw new Error(`plan_http_${res ? res.status : 0}`);
  const body = await res.text();
  const sig = res.headers?.get?.('x-descall-plan-sig');
  if (!sig) return { action: 'none', reason: 'unsigned' };
  if (!verifyPlanSignature(body, sig, deps.config.PLAN_PUBLIC_KEYS)) throw new Error('plan_signature_invalid');
  return parsePlan(body, { installId, userId: tokenSubject(token), nowSec: Math.floor(deps.now() / 1000) });
}

/* ---------------------------------------------------------------- one attempt */

async function tryMigrate(deps) {
  if (deps.platform !== 'win32' || !deps.app.isPackaged || deps.arch !== 'x64') return 'skip';
  if (!deps.config.PLAN_PUBLIC_KEYS?.length) return 'no-key';
  const token = await deps.readToken();
  if (!token) return 'signed-out';
  const installId = installIdFor(deps);
  const state = loadBridgeState(deps);
  if (winBuild(deps.osRelease) < MIN_WIN_BUILD) {
    if (!state.unsupportedReported) {
      await report(deps, token, { installId, event: 'unsupported_os' });
      saveBridgeState(deps, { ...state, unsupportedReported: true });
    }
    return 'unsupported-os';
  }
  const plan = await fetchPlan(deps, token, installId);
  if (plan.action !== 'migrate') return plan.reason || 'none';
  if (!shouldAttempt(state, plan, deps.now())) return 'backoff';
  const base = { installId, migrationId: plan.migrationId };
  if (state.offeredFor !== plan.migrationId) {
    await report(deps, token, { ...base, event: 'offered' });
    saveBridgeState(deps, { ...state, offeredFor: plan.migrationId });
  }
  if (!deps.isQuietMoment()) return 'wait';

  const dir = workDir(deps);
  const migrator = await downloadVerified({ fetchImpl: deps.fetch, ...plan.migrator, dest: path.join(dir, 'DescallMigrator.exe'), fsImpl: deps.fs });
  const setup = await downloadVerified({ fetchImpl: deps.fetch, ...plan.setup, dest: path.join(dir, `Descall-Setup-${plan.setup.version}.exe`), fsImpl: deps.fs });
  await report(deps, token, { ...base, event: 'downloaded' });
  if (!deps.isQuietMoment()) return 'wait'; // re-check after the download

  const next = { ...loadBridgeState(deps), migrationId: plan.migrationId };
  next.attempts = (state.migrationId === plan.migrationId ? Number(state.attempts || 0) : 0) + 1;
  saveBridgeState(deps, next);

  const envelope = JSON.stringify({ job: buildJob(deps, plan, installId, setup), handoff: await buildHandoff(deps, plan, installId) });
  const code = await pipeToMigrator(deps.spawn, migrator, ['--receive-handoff'], envelope);
  if (code !== 0) {
    saveBridgeState(deps, { ...next, lastFailureAt: deps.now() });
    await report(deps, token, { ...base, event: 'handoff_failed', code: `exit_${code < 0 ? 'spawn' : code}` });
    return 'handoff-failed';
  }
  await report(deps, token, { ...base, event: 'handoff_ok' });
  await report(deps, token, { ...base, event: 'started' });
  spawnDetached(deps.spawn, migrator, ['--run']);
  deps.log.info('[migration] migrator started, quitting Electron');
  deps.quitForMigration();
  return 'started';
}

/* ---------------------------------------------------------------- on every start */

/** After a rollback / skip relaunch: report the migrator's outcome. */
async function reportRelaunchOutcome(deps) {
  const flag = Object.keys(RELAUNCH_FLAGS).find((f) => deps.argv.includes(f));
  if (!flag) return null;
  const exe = path.join(workDir(deps), 'DescallMigrator.exe');
  const out = deps.fs.existsSync(exe) ? await runForOutput(deps.spawn, exe, ['--status']) : null;
  let outcome = null;
  try { outcome = out ? JSON.parse(out) : null; } catch (_) { outcome = null; }
  const state = loadBridgeState(deps);
  saveBridgeState(deps, { ...state, lastFailureAt: deps.now(), lastOutcome: outcome?.event || RELAUNCH_FLAGS[flag] });
  const token = await deps.readToken();
  if (outcome && outcome.installId && outcome.event && outcome.event !== 'in_progress') {
    const { installId, migrationId, event, step, code, durationMs, strategy, perMachine, resumes, steps } = outcome;
    await report(deps, token, { installId, migrationId, event, step, code, durationMs, strategy, perMachine, resumes, steps });
  }
  return outcome?.event || RELAUNCH_FLAGS[flag];
}

/** A crash left the migration unfinished: hand it back to the migrator (it holds a lock). */
function resumeIfInterrupted(deps) {
  const dir = workDir(deps);
  const exe = path.join(dir, 'DescallMigrator.exe');
  try {
    const st = JSON.parse(deps.fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    if (st && st.step && !TERMINAL_STEPS.has(st.step) && deps.fs.existsSync(exe)) {
      spawnDetached(deps.spawn, exe, ['--resume']);
      return true;
    }
  } catch (_) { /* nothing to resume */ }
  return false;
}

function samePath(a, b) {
  const n = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return n(a) === n(b);
}

/** Side-by-side move done (machine-wide install): start the new app instead of us. */
function forwardIfMigrated(deps) {
  try {
    const rec = JSON.parse(deps.fs.readFileSync(path.join(workDir(deps), 'cleanup.json'), 'utf8'));
    if (!rec || rec.strategy !== 'side_by_side') return false;
    if (!samePath(rec.oldDir, path.dirname(deps.app.getPath('exe')))) return false;
    const newExe = path.join(deps.env.LOCALAPPDATA || '', 'Programs', 'Descall', 'Descall.exe');
    if (!deps.fs.existsSync(newExe)) return false;
    spawnDetached(deps.spawn, newExe, deps.argv.includes('--hidden') ? ['--hidden'] : []);
    deps.quitForMigration();
    return true;
  } catch (_) {
    return false;
  }
}

/** Boot hook + loop (every 30 min, backs off on errors). Returns a stop function. */
function start(deps) {
  if (deps.platform !== 'win32') return () => {};
  if (forwardIfMigrated(deps)) return () => {};
  resumeIfInterrupted(deps);
  reportRelaunchOutcome(deps).catch((err) => deps.log.warn('[migration] outcome report failed:', err?.message || err));
  let timer = null;
  let stopped = false;
  let delay = FIRST_CHECK_MS;
  const tick = async () => {
    if (stopped) return;
    let r = 'error';
    try {
      r = await tryMigrate(deps);
    } catch (err) {
      deps.log.warn('[migration]', err?.message || err);
    }
    deps.log.info(`[migration] ${r}`);
    if (['started', 'skip', 'unsupported-os', 'no-key'].includes(r) || stopped) return;
    delay = r === 'error' || r.endsWith('failed') ? Math.min(delay * 2, 6 * 3600 * 1000) : LOOP_MS;
    timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, delay);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

module.exports = {
  MIN_WIN_BUILD,
  MAX_ATTEMPTS,
  winBuild,
  verifyPlanSignature,
  isAllowedDownloadUrl,
  parsePlan,
  tokenSubject,
  downloadVerified,
  dumpLocalStorage,
  readPremiumFiles,
  buildHandoff,
  buildJob,
  pipeToMigrator,
  shouldAttempt,
  installIdFor,
  tryMigrate,
  reportRelaunchOutcome,
  resumeIfInterrupted,
  forwardIfMigrated,
  start,
};
