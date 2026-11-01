const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, protocol, Menu, MenuItem, desktopCapturer, globalShortcut, Tray, powerMonitor, session, screen, safeStorage, net, systemPreferences, nativeTheme, clipboard } = require('electron');
const { pathToFileURL } = require('url');
const { measureWindowOcclusion, fitBoundsToWorkArea } = require('./windowOcclusion.cjs');
const { showNotificationWindow, closeShownNotification, updateShownNotification } = require('./notificationWindow.cjs');
const { describeNotification } = require('./notificationCard.cjs');
const { registerProcessScannerIPC } = require('./processScanner.cjs');
const { registerOverlayIPC, destroyOverlayWindow, hideOverlayWindow, isOverlayWindowVisible, refreshOverlayLanguage } = require('./overlayWindow.cjs');
const { autoUpdater } = require('electron-updater');
const {
  decideUpdateInstall,
  applyDeferralEvent,
  createDeferralState,
} = require('./updateDeferral.cjs');
const log = require('electron-log');
const { launchUpdateAfterExit } = require('./updateRecover.cjs');
const { buildElectronCsp, inlineScriptHashes } = require('./cspPolicy.cjs');
const {
  AUTOSTART_ARGS,
  decideColdStart,
  isFreshRelaunchMarker,
  loginItemSettings,
  UPDATER_RELAUNCH_MAX_AGE_MS,
} = require('./launchVisibility.cjs');
const path = require('path');
const fs = require('fs');

// Packaged boot smoke (2.11.11, electron/bootSmoke.cjs): real main window, exit 0 only
// when the app painted, the splash is gone and no inline script was blocked by the CSP.
// The explicit flag wins over a DESCALL_SMOKE=1 left in the environment (2.11.13: the
// release script's earlier quick smoke set it, so the boot smoke exited at once).
const smokeBoot = process.argv.includes('--descall-smoke-boot') || process.env.DESCALL_SMOKE === 'boot';
const smokeLaunch = !smokeBoot && (process.env.DESCALL_SMOKE === '1' || process.argv.includes('--descall-smoke'));
if (smokeLaunch || smokeBoot) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.disableHardwareAcceleration();
}
const {
  cleanOldDescallSetups,
  isDescallSetupDownloadUrl,
  downloadDescallSetupViaElectron,
  bindSessionSetupDownloadCleanup,
  versionFromSetupFilename,
} = require('./setupDownloadsCleanup.cjs');
const {
  SPLASH_LOAD_TIMEOUT_MS,
  READY_FALLBACK_MS,
  BOOT_RETRY_STORAGES,
  shouldRetryLoad,
  nextLoadRetryDelay,
  shouldReloadAfterCrash,
  raceWithTimeout,
  PAINT_NUDGE_MS,
  paintWatchdogStep,
  shouldArmPaintWatchdog,
  appLooksPainted,
  SPLASH_RESCUE_MS,
  normalizeBootReport,
} = require('./bootWatchdog.cjs');
const { resolveDistFile } = require('./appProtocolPath.cjs');
const { applyWorldGpuPreference, writeMarker: writeWorldGpuMarker } = require('./gpuPreference.cjs');

// 3D world: discrete GPU on Windows dual-GPU laptops once this user has opened the world
// (see gpuPreference.cjs; never in smoke runs, which use software GL on purpose).
applyWorldGpuPreference({ app, fs, path, smoke: smokeLaunch || smokeBoot });
const { isSignupStatsUrl, signupStatsWindowOptions, isAdminPanelUrl, adminPanelWindowOptions } = require('./adminStatsWindow.cjs');
const { et, getLocale, initLocale, setUiLocale, onLocaleChange } = require('./mainI18n.cjs');

// Logging
log.transports.file.level = 'info';
log.info('App starting...');

// Standard scheme so packaged pages can call https APIs with webSecurity on.
// file:// cannot. Register before ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'descall',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function distRoot() {
  const candidates = [
    path.join(process.resourcesPath || '', 'dist'),
    path.join(app.getAppPath(), 'dist'),
    path.join(__dirname, 'dist'),
    path.join(__dirname, '..', 'dist'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || null;
}

let cachedAppCsp = null;
/** Hashed CSP for the shipped index.html (cached), or the legacy policy if it cannot be read. */
function appDocumentCsp(root) {
  if (cachedAppCsp) return cachedAppCsp;
  try {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    cachedAppCsp = buildElectronCsp(html);
    log.info(`[csp] app document policy: ${inlineScriptHashes(html).length} inline script hashes${/\r/.test(html) ? ' (index.html has CR line endings, hashed as LF)' : ''}`);
  } catch (err) {
    log.warn('[csp] could not hash index.html, using the fallback policy:', err?.message || err);
    cachedAppCsp = buildElectronCsp(null);
  }
  return cachedAppCsp;
}

function registerDescallProtocol() {
  const root = distRoot();
  if (!root) return null;
  protocol.handle('descall', (request) => {
    try {
      const url = new URL(request.url);
      // SPA routes serve the app document (2.11.11), and the document's relative
      // ./assets and ./brand URLs resolve from any route depth: a reload on
      // descall://app/settings/shop asks for /settings/assets/… (2.13.1, appProtocolPath.cjs).
      const resolved = resolveDistFile(root, url.pathname, (p) => fs.existsSync(p));
      if (resolved.forbidden) return new Response('forbidden', { status: 403 });
      const filePath = resolved.filePath;
      if (!/\.html?$/i.test(filePath)) return net.fetch(pathToFileURL(filePath).href);
      // HTML documents carry the hashed CSP themselves, independent of webRequest coverage.
      return net.fetch(pathToFileURL(filePath).href).then((res) => {
        const headers = new Headers(res.headers);
        headers.set('Content-Security-Policy', appDocumentCsp(root));
        if (!headers.get('content-type')) headers.set('content-type', 'text/html; charset=utf-8');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      });
    } catch (err) {
      log.warn('[protocol] descall fetch failed:', err?.message || err);
      return new Response('bad request', { status: 400 });
    }
  });
  return root;
}

function tokenFilePath() {
  return path.join(app.getPath('userData'), 'auth-token.bin');
}

// Renderer boot watchdog / "Tekrar dene" (index.html, 2.11.5): drop the service
// worker and Cache Storage plus the HTTP cache, then reload ignoring cache.
// The session (localStorage, IndexedDB, cookies, safeStorage token) is kept.
async function clearAndReloadRenderer(wc, why) {
  log.warn(`[boot] clean reload (${why})`);
  try { await wc.session.clearStorageData({ storages: BOOT_RETRY_STORAGES }); } catch (err) { log.warn('[boot] clear sw/cache storage failed:', err?.message || err); }
  try { await wc.session.clearCache(); } catch (err) { log.warn('[boot] clear http cache failed:', err?.message || err); }
  try { if (!wc.isDestroyed()) wc.reloadIgnoringCache(); } catch (_) { /* window gone */ }
}

ipcMain.on('app:boot-retry', async (event) => {
  const wc = event.sender;
  if (!mainWindow || mainWindow.isDestroyed() || wc !== mainWindow.webContents) return;
  log.warn('[boot] renderer asked for a boot retry');
  await clearAndReloadRenderer(wc, 'renderer-retry');
});

// Renderer boot milestones (2.11.9): index.html reports when the boot splash is
// really gone ('painted'), when its own watchdog fired, and when React mounted.
// They land in main.log, so a stuck start leaves evidence, and they feed the
// main-process paint watchdog in createMainWindow.
let rendererBoot = { painted: false, loadStartedAt: 0 };
ipcMain.on('app:boot-state', (event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
  const report = normalizeBootReport(payload);
  if (!report) return;
  const since = rendererBoot.loadStartedAt ? Date.now() - rendererBoot.loadStartedAt : null;
  log.info(`[boot] renderer ${report.phase} (page ${report.ms ?? '?'}ms, load+${since ?? '?'}ms)`);
  if (report.phase === 'app-mounted') smokeAppMounted = true;
  if (report.phase === 'inline-missing') {
    log.error('[boot] index.html inline boot scripts did not run (CSP hash mismatch?); React removes the splash itself');
  }
  if (report.phase === 'painted' || report.phase === 'forced-dismiss') {
    rendererBoot.painted = true;
    // The splash just went away: make sure Windows presents the new frame,
    // even if the window was minimized/occluded while it changed.
    try { mainWindow.webContents.invalidate(); } catch (_) { /* ignore */ }
  }
});

// UI language (LocaleContext → preload electronAPI.setLocale) on boot and on every
// change: tray menu, splash, dialogs, notification cards and the overlay follow it.
ipcMain.on('app:locale', (event, locale) => {
  const w = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  if (!w || (w !== mainWindow && w !== signupStatsWindow && w !== adminPanelWindow)) return;
  if (setUiLocale(String(locale || '').slice(0, 16))) log.info(`[i18n] main-process language: ${getLocale()}`);
});
onLocaleChange(() => {
  rebuildTrayMenu?.();
  refreshOverlayLanguage();
});

ipcMain.on('secure-token:get', (event) => {
  try {
    const file = tokenFilePath();
    if (!fs.existsSync(file)) {
      event.returnValue = null;
      return;
    }
    const buf = fs.readFileSync(file);
    event.returnValue = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8');
  } catch (err) {
    log.warn('[secure-token] read failed:', err?.message || err);
    event.returnValue = null;
  }
});

ipcMain.on('secure-token:set', (event, token) => {
  try {
    const file = tokenFilePath();
    const value = String(token || '');
    if (!value) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      event.returnValue = true;
      return;
    }
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value)
      : Buffer.from(value, 'utf8');
    fs.writeFileSync(file, buf);
    event.returnValue = true;
  } catch (err) {
    log.warn('[secure-token] write failed:', err?.message || err);
    event.returnValue = false;
  }
});

ipcMain.on('secure-token:clear', (event) => {
  try {
    const file = tokenFilePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    event.returnValue = true;
  } catch {
    event.returnValue = false;
  }
});

// Background / tray: keep the renderer fully awake so socket events keep
// arriving and the message sound can play without a prior click (the app
// can boot straight into the tray with no user gesture at all).
try {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  // Frameless windows are often marked occluded, so document.hidden stays
  // true while the user is looking at the app. Chromium then skips
  // backdrop-filter entirely and the glass shell paints as flat dark.
  // Chrome on the same page does not do this. Do not set transparent:true
  // on Windows — a layered window skips the DWM taskbar inset.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  // Linux compositors drop in-page backdrop-filter unless this is set
  // before ready. Windows stays a normal framed client (see createMainWindow):
  // a layered transparent window skips the DWM taskbar inset.
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-transparent-visuals');
  }
} catch (_) { /* ignore */ }

ipcMain.on('native-theme:reduced-transparency', (event) => {
  try {
    event.returnValue = Boolean(nativeTheme.prefersReducedTransparency);
  } catch (_) {
    event.returnValue = false;
  }
});

try {
  nativeTheme.on('updated', () => {
    let value = false;
    try { value = Boolean(nativeTheme.prefersReducedTransparency); } catch (_) { value = false; }
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.webContents.send('native-theme:reduced-transparency-changed', value);
      } catch (_) { /* ignore */ }
    }
  });
} catch (_) { /* ignore */ }

// Auto-updater — NSIS Setup installs always track the newest GitHub release.
// Portable .exe cannot self-update; users must install Setup once.
//
// Feed uses generic "latest/download" URLs (not GitHub Releases API) so
// Render/desktop clients are not blocked by API rate limits.
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = true;
// Do not let electron-updater spawn NSIS from inside this process. The
// recovery launcher starts the installer only after Descall.exe has exited,
// so ffmpeg.dll is not replaced while it is still mapped (0xc000007b).
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;
// Full Setup download is more reliable than delta/blockmap across jumps
autoUpdater.disableDifferentialDownload = true;
// App is not code-signed — signature checks would block every update
if (process.platform === 'win32') {
  try {
    autoUpdater.verifyUpdateCodeSignature = false;
  } catch (_) { /* older electron-updater */ }
}

const UPDATE_FEED_URL =
  'https://github.com/DemirSarpKurtlar/Descall/releases/latest/download/';

try {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: UPDATE_FEED_URL,
    channel: 'latest',
  });
  log.info('[updater] feed =', UPDATE_FEED_URL);
} catch (err) {
  log.warn('[updater] setFeedURL(generic) failed, falling back to github provider:', err?.message);
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'DemirSarpKurtlar',
      repo: 'Descall',
    });
  } catch (err2) {
    log.warn('[updater] setFeedURL(github) also failed:', err2?.message);
  }
}


function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(process.resourcesPath || '', 'dist', 'icon.png'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'icon.ico'),
  ];
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch (_) {}
  }
  return undefined;
}

let updateReady = false;
let updateVersion = null;
let downloadedInstallerPath = null;
let downloadedInstallerSize = null;
let updateCheckTimer = null;
let updateRetryTimer = null;
let installTimer = null;
let installWaitTimer = null;
let updateCheckInFlight = false;
let powerHooksBound = false;
/** Renderer-reported voice session. Overlay visibility is OR'd in at read time. */
let voiceBusyFromRenderer = false;
/** Renderer: unsent composer text / upload / recording (2.11.1). */
let userBusyFromRenderer = false;
/** OS session lock. Input-idle time is read from powerMonitor on each decision. */
let sessionLocked = false;
let deferral = createDeferralState();
let lastHoldReason = null;
let installStarted = false;
/** Discord-style gate: splash stays up until check finishes / update installs. */
let prelaunchActive = false;
let prelaunchResolvers = null;
let mainLaunchStarted = false;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes while running (incl. background/tray)
const UPDATE_INSTALL_POLL_MS = 5 * 1000;         // re-evaluate grace / idle / background
const PRELAUNCH_CHECK_TIMEOUT_MS = 25 * 1000;
const PRELAUNCH_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;


/** Quietly prune older Descall-Setup-*.exe from the user's Downloads (Electron-only). */
function pruneOldSetupDownloads(reason, keepVersion) {
  try {
    const keep = keepVersion || updateVersion || (app.isPackaged ? app.getVersion() : null);
    const result = cleanOldDescallSetups({ app, keepVersion: keep, log });
    if (result?.deleted?.length) {
      log.info(`[setup-cleanup] ${reason}: removed ${result.deleted.length} old installer(s), kept=${result.kept || '(none)'}`);
    } else {
      log.info(`[setup-cleanup] ${reason}: no old installers to remove (kept=${result?.kept || '(none)'})`);
    }
  } catch (err) {
    log.warn(`[setup-cleanup] ${reason} failed:`, err?.message || err);
  }
}

function startUpdateInstall(reason, { forceRun } = {}) {
  const installerPath = downloadedInstallerPath || autoUpdater.downloadedUpdateHelper?.file || null;
  if (process.platform !== 'win32') {
    autoUpdater.quitAndInstall(true, true);
    return true;
  }
  launchUpdateAfterExit({
    installerPath,
    expectedSize: downloadedInstallerSize,
    bootOkPath: path.join(app.getPath('userData'), 'boot-ok'),
    version: updateVersion || app.getVersion(),
    forceRun: Boolean(forceRun),
    productExe: 'Descall.exe',
    log,
  });
  log.info(`[updater] ${reason}: installer staged, waiting for this process to exit`);
  return true;
}

function applyDownloadedUpdate(reason = 'auto', { allowDuringCall = false } = {}) {
  if (installStarted) return true;
  if (!updateReady || !app.isPackaged) return false;
  // Last line of defense for every automatic path, including anything that
  // used to install immediately. Explicit confirm and the pre-window splash
  // gate opt in. A normal quit installs from before-quit, after DLLs unmap.
  if (!allowDuringCall && isBusyWithLiveSession()) {
    log.info(`[updater] install blocked — voice session active (${reason})`);
    return false;
  }
  log.info(`[updater] install (${reason}) → v${updateVersion || '?'}`);
  installStarted = true;
  isQuitting = true;
  try {
    startUpdateInstall(reason, { forceRun: true });
    app.quit();
    return true;
  } catch (err) {
    log.error('[updater] install failed:', err?.message || err);
    installStarted = false;
    isQuitting = false;
    return false;
  }
}

function isAppInBackground() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return true; // tray / no window
    if (!mainWindow.isVisible() || mainWindow.isMinimized()) return true;
    if (!mainWindow.isFocused()) return true;
    return false;
  } catch (_) {
    return true;
  }
}

/**
 * Busy when the renderer says so (DM / group / server voice, including an
 * incoming ring) OR the always-on-top voice overlay is up. Either signal
 * blocks an automatic restart. Defaults to not-busy; a crashed or reloaded
 * renderer clears the flag (see bindVoiceBusyLifecycle).
 */
function isBusyWithLiveSession() {
  try {
    return voiceBusyFromRenderer || isOverlayWindowVisible();
  } catch (_) {
    return voiceBusyFromRenderer;
  }
}

function readSystemIdleMs() {
  try {
    const seconds = powerMonitor.getSystemIdleTime();
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 1000);
  } catch (_) {
    return 0;
  }
}

function syncDeferralSignals(now = Date.now()) {
  const busy = isBusyWithLiveSession();
  if (busy !== deferral.voiceBusy) {
    deferral = applyDeferralEvent(deferral, { type: 'voice-busy', busy, now });
  }
  if (userBusyFromRenderer !== deferral.userBusy) {
    deferral = applyDeferralEvent(deferral, { type: 'user-busy', busy: userBusyFromRenderer, now });
  }
  deferral = applyDeferralEvent(deferral, {
    type: 'presence',
    now,
    appInBackground: isAppInBackground(),
    systemIdleMs: readSystemIdleMs(),
    sessionLocked,
    prelaunch: prelaunchActive,
  });
}

function noteUpdateReady() {
  syncDeferralSignals();
  deferral = applyDeferralEvent(deferral, { type: 'update-ready', now: Date.now() });
}

/**
 * Crash, reload, or window close. The call cannot survive the renderer, so
 * busy goes back to false. If a call was up, the post-call grace still runs
 * so we don't restart in the same instant the process died.
 */
function resetVoiceBusyFromLifecycle(why) {
  const wasBusy = isBusyWithLiveSession() || deferral.voiceBusy;
  log.info(`[updater] voice-busy reset (${why}) wasBusy=${wasBusy}`);
  try { hideOverlayWindow(); } catch (_) { /* overlay already gone */ }
  voiceBusyFromRenderer = false;
  userBusyFromRenderer = false;
  deferral = applyDeferralEvent(deferral, { type: 'user-busy', busy: false, now: Date.now() });
  if (!wasBusy) return;
  deferral = applyDeferralEvent(
    { ...deferral, voiceBusy: true },
    { type: 'reset-voice', now: Date.now() },
  );
}

function bindVoiceBusyLifecycle(win) {
  if (!win || win.isDestroyed?.()) return;
  const contents = win.webContents;
  // The first did-finish-load is the initial document. Busy is still false
  // and the renderer reports after React mounts. Later loads are reloads —
  // the call died with the old page, so the flag must not stay stuck.
  let mainFrameLoads = 0;
  contents.on('render-process-gone', () => resetVoiceBusyFromLifecycle('render-process-gone'));
  contents.on('did-finish-load', () => {
    mainFrameLoads += 1;
    if (mainFrameLoads === 1) return;
    resetVoiceBusyFromLifecycle('did-finish-load');
  });
  win.on('closed', () => resetVoiceBusyFromLifecycle('closed'));
}

function installQuietly(reason) {
  // Re-check at the door. A call that started after the scheduler said "go"
  // must not be cut, and this must not flip the relaunch-to-background flag
  // when we bail out.
  if (isBusyWithLiveSession()) {
    log.info(`[updater] quiet install refused — live voice session (${reason})`);
    return false;
  }
  if (userBusyFromRenderer) {
    log.info(`[updater] quiet install refused — typing/uploading (${reason})`);
    return false;
  }
  // Come back exactly as backgrounded: minimized stays minimized (taskbar
  // button, unfocused), tray-hidden stays hidden. Either way nothing is
  // raised and nothing takes focus.
  let mode = 'hidden';
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mode = 'minimized';
  } catch (_) { /* ignore */ }
  const previousBackground = startInBackgroundMode();
  setUpdaterRelaunch(true);
  setStartInBackground(true, mode);
  const installed = applyDownloadedUpdate(reason);
  if (!installed) {
    // A call slipped in, or quitAndInstall threw. Don't leave the next
    // launch stuck in the tray because of an install that never happened.
    setUpdaterRelaunch(false);
    if (previousBackground) setStartInBackground(true, previousBackground);
    else setStartInBackground(false);
  }
  return installed;
}

function evaluatePendingUpdate(reason) {
  if (!updateReady || installStarted) {
    if (!updateReady && installWaitTimer) {
      clearInterval(installWaitTimer);
      installWaitTimer = null;
    }
    return { action: 'wait', reason: 'no-update' };
  }
  // Splash: no window and no call yet. Do not wait out a grace period.
  if (prelaunchActive) {
    applyDownloadedUpdate('prelaunch', { allowDuringCall: true });
    return { action: 'install', reason: 'prelaunch' };
  }
  if (!app.isPackaged) return { action: 'wait', reason: 'unpackaged' };

  syncDeferralSignals();
  const decision = decideUpdateInstall({ ...deferral, now: Date.now() });
  if (decision.action !== 'install') {
    if (lastHoldReason !== decision.reason) {
      log.info(`[updater] holding staged update (${decision.reason})`);
      lastHoldReason = decision.reason;
    }
    return decision;
  }

  // Re-read busy / idle / grace immediately before install. A call that
  // started during the grace window (or during this tick) cancels it.
  syncDeferralSignals();
  const again = decideUpdateInstall({ ...deferral, now: Date.now() });
  if (again.action !== 'install') {
    log.info(`[updater] install re-check aborted (${again.reason}) was ${decision.reason}`);
    lastHoldReason = again.reason;
    return again;
  }

  lastHoldReason = null;
  log.info(`[updater] applying staged update (${again.reason} via ${reason})`);
  const installed = installQuietly(again.reason);
  if (!installed && isBusyWithLiveSession()) {
    syncDeferralSignals();
    queueSilentInstallRetry();
  }
  return again;
}

/** Keep evaluating until the update is installed or discarded. */
function queueSilentInstallRetry() {
  if (installWaitTimer) return;
  installWaitTimer = setInterval(() => {
    evaluatePendingUpdate('poll');
  }, UPDATE_INSTALL_POLL_MS);
}

function scheduleSilentInstall() {
  if (installTimer) {
    clearTimeout(installTimer);
    installTimer = null;
  }
  if (!updateReady) return;
  // Splash/prelaunch: install before the main window exists (no focus steal).
  if (prelaunchActive) {
    applyDownloadedUpdate('prelaunch', { allowDuringCall: true });
    return;
  }
  if (!app.isPackaged) return;

  noteUpdateReady();
  queueSilentInstallRetry();
  evaluatePendingUpdate('staged');
}

/**
 * Tray "Güncelle ve Çık" and the in-app Restart button. A live call is not
 * cut silently — the renderer shows a confirm dialog. Quitting the app
 * without this prompt still applies the update from before-quit, after this
 * process has exited. Windows does not spawn NSIS from inside the app.
 */
function requestExplicitInstall(reason) {
  if (!updateReady) {
    isQuitting = true;
    app.relaunch();
    app.quit();
    return { installing: false, relaunch: true };
  }
  syncDeferralSignals();
  if (isBusyWithLiveSession()) {
    log.info(`[updater] explicit restart (${reason}) while voice-busy — asking confirmation`);
    try { showMainWindow(); } catch (_) { /* window not up yet */ }
    try {
      mainWindow?.webContents?.send('update:confirm-restart', {
        version: updateVersion,
        reason,
      });
    } catch (_) { /* renderer gone — do not install */ }
    return { needsConfirm: true, installing: false };
  }
  const installed = applyDownloadedUpdate(reason, { allowDuringCall: false });
  return { installing: installed, needsConfirm: false };
}

function checkForAppUpdates(reason = 'manual') {
  if (!app.isPackaged) {
    log.info(`[updater] skip check (${reason}) — not packaged`);
    return Promise.resolve(null);
  }
  if (updateReady) {
    log.info(`[updater] skip check (${reason}) — update already downloaded, waiting for quit/next launch`);
    return Promise.resolve(null);
  }
  if (updateCheckInFlight) {
    log.info(`[updater] skip check (${reason}) — already in flight`);
    return Promise.resolve(null);
  }
  updateCheckInFlight = true;
  log.info(`[updater] checking for updates (${reason})… current=${app.getVersion()} feed=${UPDATE_FEED_URL}`);
  return autoUpdater.checkForUpdates()
    .then((result) => {
      if (updateRetryTimer) {
        clearTimeout(updateRetryTimer);
        updateRetryTimer = null;
      }
      const next = result?.updateInfo?.version;
      if (next) log.info(`[updater] check result: latest=${next}`);
      return result;
    })
    .catch((err) => {
      log.error(`[updater] check failed (${reason}):`, err?.message || err);
      if (!updateRetryTimer && !prelaunchActive) {
        updateRetryTimer = setTimeout(() => {
          updateRetryTimer = null;
          checkForAppUpdates('retry');
        }, 2 * 60 * 1000);
      }
      return null;
    })
    .finally(() => {
      updateCheckInFlight = false;
    });
}

function scheduleBackgroundUpdateChecks() {
  if (!app.isPackaged) return;
  if (updateCheckTimer) clearInterval(updateCheckTimer);

  // Keep polling while running — including minimized, unfocused, and tray.
  updateCheckTimer = setInterval(() => checkForAppUpdates('interval-5m'), UPDATE_CHECK_INTERVAL_MS);
  setTimeout(() => checkForAppUpdates('post-open'), 45 * 1000);

  if (!powerHooksBound) {
    powerHooksBound = true;
    try {
      powerMonitor.on('resume', () => {
        setTimeout(() => checkForAppUpdates('resume'), 5 * 1000);
      });
      powerMonitor.on('lock-screen', () => {
        sessionLocked = true;
        evaluatePendingUpdate('lock-screen');
      });
      powerMonitor.on('unlock-screen', () => {
        sessionLocked = false;
        setTimeout(() => checkForAppUpdates('unlock'), 5 * 1000);
      });
    } catch (err) {
      log.warn('[updater] powerMonitor hooks unavailable:', err?.message);
    }
  }
}

function updateSplash(payload) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  try {
    const js = `window.__splashUpdate && window.__splashUpdate(${JSON.stringify(payload)});`;
    splashWindow.webContents.executeJavaScript(js, true).catch(() => {});
  } catch (_) { /* ignore */ }
}

function resolvePrelaunch(outcome) {
  if (!prelaunchResolvers) return;
  const { resolve } = prelaunchResolvers;
  prelaunchResolvers = null;
  resolve(outcome);
}

// Paths
const isDev = process.env.NODE_ENV === 'development';
/** Yönetici › Kayıt İstatistikleri window (electron/adminStatsWindow.cjs). */
let signupStatsWindow = null;
/** Yönetici Paneli window (3.1): the whole admin panel, main window stays usable. */
let adminPanelWindow = null;
const isPackaged = app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let tray = null;
let rebuildTrayMenu = null;
let isQuitting = false;

// Persist "running in background" for a quiet updater relaunch only.
// A manual shortcut launch ignores this file (see decideColdStart). It must
// not hide the next Start-menu / desktop / taskbar launch after a tray quit.
const BG_FLAG = () => path.join(app.getPath('userData'), 'start-in-background');
const RELAUNCH_FLAG = () => path.join(app.getPath('userData'), 'updater-relaunch');
function setStartInBackground(on, mode = 'hidden') {
  try {
    if (on) fs.writeFileSync(BG_FLAG(), mode === 'minimized' ? 'minimized' : 'hidden');
    else if (fs.existsSync(BG_FLAG())) fs.unlinkSync(BG_FLAG());
  } catch {}
}
/** null | 'hidden' (closed to tray) | 'minimized' */
function startInBackgroundMode() {
  try {
    if (!fs.existsSync(BG_FLAG())) return null;
    const raw = String(fs.readFileSync(BG_FLAG(), 'utf8') || '').trim();
    return raw === 'minimized' ? 'minimized' : 'hidden';
  } catch {
    return null;
  }
}
function setUpdaterRelaunch(on) {
  try {
    if (on) fs.writeFileSync(RELAUNCH_FLAG(), '1');
    else if (fs.existsSync(RELAUNCH_FLAG())) fs.unlinkSync(RELAUNCH_FLAG());
  } catch {}
}

/** Read-and-delete. A stale marker must not hide a later manual launch. */
function consumeUpdaterRelaunch() {
  try {
    if (!fs.existsSync(RELAUNCH_FLAG())) return false;
    const mtime = fs.statSync(RELAUNCH_FLAG()).mtimeMs;
    try { fs.unlinkSync(RELAUNCH_FLAG()); } catch {}
    return isFreshRelaunchMarker(mtime, Date.now(), UPDATER_RELAUNCH_MAX_AGE_MS);
  } catch {
    return false;
  }
}

let coldStartDecision = null;
/** Set when a second process arrives before the window exists (still on splash). */
let userRequestedShow = false;

function resolveColdStart() {
  if (coldStartDecision) return coldStartDecision;
  let login = {};
  try {
    login = app.getLoginItemSettings({ args: AUTOSTART_ARGS }) || {};
  } catch (_) { /* before ready, or the platform has no login-item API */ }
  coldStartDecision = decideColdStart({
    argv: process.argv,
    wasOpenedAtLogin: Boolean(login.wasOpenedAtLogin),
    wasOpenedAsHidden: Boolean(login.wasOpenedAsHidden),
    backgroundMode: startInBackgroundMode(),
    updaterRelaunch: consumeUpdaterRelaunch(),
  });
  log.info(`[boot] cold start ${coldStartDecision.reason} → ${coldStartDecision.action}`);
  return coldStartDecision;
}

function readOpenAtLogin() {
  try {
    const settings = app.getLoginItemSettings({ args: AUTOSTART_ARGS }) || {};
    if (process.platform === 'win32') {
      return Boolean(settings.executableWillLaunchAtLogin || settings.openAtLogin);
    }
    return Boolean(settings.openAtLogin);
  } catch (_) {
    return false;
  }
}

function syncLoginItem(openAtLogin) {
  try {
    app.setLoginItemSettings(loginItemSettings(openAtLogin));
  } catch (err) {
    log.warn('[boot] login item update failed:', err?.message || err);
  }
}

/**
 * First packaged run turns auto-start on. An older Run key that is already
 * enabled but lacks --hidden/--autostart is rewritten so boot stays hidden
 * and a shortcut launch does not.
 */
function ensureAutostartLoginItem() {
  if (!isPackaged) return;
  let settings = {};
  try {
    settings = app.getLoginItemSettings({ args: AUTOSTART_ARGS }) || {};
  } catch (_) {
    return;
  }
  const enabled = process.platform === 'win32'
    ? Boolean(settings.executableWillLaunchAtLogin || settings.openAtLogin)
    : Boolean(settings.openAtLogin);
  if (!enabled || !settings.openAtLogin) syncLoginItem(true);
}


/**
 * The single "bring Descall back" path: tray click, tray menu, taskbar/shortcut
 * relaunch (second-instance), notification click and the focus-window IPC all
 * funnel here, so a hidden-to-tray window can never stay off the taskbar.
 */
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  setStartInBackground(false);
  try { mainWindow.setSkipTaskbar(false); } catch (_) { /* ignore */ }
  try { if (mainWindow.isMinimized()) mainWindow.restore(); } catch (_) { /* ignore */ }
  try { mainWindow.show(); } catch (_) { /* ignore */ }
  // Windows refuses focus() from a background process; a short always-on-top
  // pulse + moveTop is what actually raises the window from the tray.
  try { mainWindow.setAlwaysOnTop(true); } catch (_) { /* ignore */ }
  try { mainWindow.moveTop(); } catch (_) { /* ignore */ }
  try { mainWindow.setAlwaysOnTop(false); } catch (_) { /* ignore */ }
  try { mainWindow.focus(); } catch (_) { /* ignore */ }
  try { app.focus({ steal: true }); } catch (_) { /* ignore */ }
}


// Splash status lines in the active language (electron/i18n/<id>.json "splash").
const SPLASH_TEXT = {
  get checking() { return et('splash.checking'); },
  get starting() { return et('splash.starting'); },
  get installing() { return et('splash.installing'); },
  get downloading() { return et('splash.downloading'); },
  get upToDate() { return et('splash.upToDate'); },
  get checkFailed() { return et('splash.checkFailed'); },
};

// Discord-like update / boot splash (blocks main window until ready).
// The window itself is empty. Acrylic, vibrancy, and the OS shadow paint a
// square grey frame around the card on Windows 11. Only the HTML card is glass.
function createSplashWindow() {
  const splashOptions = {
    icon: resolveAppIcon(),
    width: 420,
    height: 500,
    frame: false,
    thickFrame: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  };
  splashWindow = new BrowserWindow(splashOptions);
  try { splashWindow.setBackgroundColor('#00000000'); } catch (_) { /* ignore */ }
  try { splashWindow.setHasShadow(false); } catch (_) { /* ignore */ }

  const splashPath = path.join(__dirname, 'splash.html');
  // Language and first status line travel in the query, so the card never flashes another language.
  const query = { lang: getLocale(), status: SPLASH_TEXT.checking, loading: et('splash.loading') };
  const ready = splashWindow.loadFile(splashPath, { query }).catch((err) => {
    log.warn('[splash] loadFile failed, using inline fallback:', err?.message);
    return splashWindow.loadURL(`data:text/html,${encodeURIComponent(
      '<!doctype html><html><body style="margin:0;background:transparent;height:100vh"></body></html>'
    )}`);
  });

  splashWindow.once('ready-to-show', () => {
    try {
      splashWindow.webContents.executeJavaScript(
        `window.__splashSetVersion && window.__splashSetVersion(${JSON.stringify(app.getVersion())});`,
        true
      ).catch(() => {});
    } catch (_) { /* ignore */ }
    const launch = resolveColdStart();
    if (!userRequestedShow && !launch.showSplash) {
      log.info(`[boot] ${launch.reason} — splash stays hidden`);
      return;
    }
    splashWindow.show();
    splashWindow.center();
  });

  // Never let a splash that does not finish loading hold the update gate and
  // the main window back (2.11.5 boot watchdog).
  return raceWithTimeout(ready, SPLASH_LOAD_TIMEOUT_MS).then((r) => {
    if (r?.timedOut) log.warn(`[splash] loadFile did not settle in ${SPLASH_LOAD_TIMEOUT_MS}ms, continuing`);
  });
}

function openMainApp() {
  if (mainLaunchStarted) return;
  mainLaunchStarted = true;
  prelaunchActive = false;
  updateSplash({ status: SPLASH_TEXT.starting, detail: '', busy: true, showProgress: false });
  createMainWindow();
  createTray();
  if (smokeBoot) runBootSmoke();
}

let smokeCspInlineBlocked = 0;
let smokeAppMounted = false;
function runBootSmoke() {
  const { BOOT_SMOKE_POLL_MS, BOOT_SMOKE_PROBE, evaluateBootSmoke, isInlineCspViolation } = require('./bootSmoke.cjs');
  const started = Date.now();
  const win = mainWindow;
  if (!win || win.isDestroyed()) { console.error('[smoke-boot] FAIL no main window'); app.exit(21); return; }
  win.webContents.on('console-message', (e, legacyLevel, legacyMessage) => {
    const message = String(e?.message ?? legacyMessage ?? '');
    if (isInlineCspViolation(message)) {
      smokeCspInlineBlocked += 1;
      console.error(`[smoke-boot] CSP blocked: ${message.slice(0, 300)}`);
    }
  });
  let finished = false;
  const tick = async () => {
    if (finished) return;
    let sample = null;
    try { if (!win.isDestroyed()) sample = await win.webContents.executeJavaScript(BOOT_SMOKE_PROBE, true); } catch (_) { sample = null; }
    const verdict = evaluateBootSmoke({ sample, cspInlineBlocked: smokeCspInlineBlocked, appMounted: smokeAppMounted, elapsedMs: Date.now() - started });
    if (!verdict.done) { setTimeout(tick, BOOT_SMOKE_POLL_MS); return; }
    finished = true;
    const result = { ok: verdict.ok, reason: verdict.reason, elapsedMs: Date.now() - started, version: app.getVersion(), sample };
    const line = `[smoke-boot] ${verdict.ok ? 'OK' : 'FAIL'} ${JSON.stringify(result)}`;
    if (verdict.ok) { console.log(line); log.info(line); } else { console.error(line); log.error(line); }
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'smoke-boot.json'), JSON.stringify(result, null, 2)); } catch (_) { /* ignore */ }
    const shot = process.env.DESCALL_SMOKE_SHOT;
    if (shot && !win.isDestroyed()) {
      try { const img = await win.webContents.capturePage(); fs.writeFileSync(shot, img.toPNG()); } catch (err) { console.error('[smoke-boot] screenshot failed', err?.message || err); }
    }
    isQuitting = true;
    app.exit(verdict.ok ? 0 : 21);
  };
  setTimeout(tick, BOOT_SMOKE_POLL_MS);
}

/**
 * Discord-style gate: check GitHub latest before opening chat UI.
 * If an update exists → download on splash → quitAndInstall (never open main).
 * If already latest / offline / timeout → open main.
 */
async function runPrelaunchUpdateGate() {
  if (!app.isPackaged || smokeBoot) {
    openMainApp();
    return;
  }

  prelaunchActive = true;
  updateSplash({
    status: SPLASH_TEXT.checking,
    detail: '',
    busy: true,
    showProgress: false,
  });

  const outcomePromise = new Promise((resolve) => {
    prelaunchResolvers = { resolve };
  });

  const checkTimeout = setTimeout(() => {
    log.warn('[updater] prelaunch check timed out — opening app');
    resolvePrelaunch({ type: 'timeout' });
  }, PRELAUNCH_CHECK_TIMEOUT_MS);

  try {
    const result = await checkForAppUpdates('prelaunch');
    // If updater returned without emitting available/not-available yet, wait on events.
    // If the promise failed/null and no event arrived shortly, fall through via timeout.
    if (!result && prelaunchResolvers) {
      setTimeout(() => {
        if (prelaunchResolvers) {
          log.warn('[updater] prelaunch check returned empty — opening app');
          resolvePrelaunch({ type: 'error' });
        }
      }, 1500);
    }
  } catch (err) {
    log.error('[updater] prelaunch check threw:', err?.message || err);
    clearTimeout(checkTimeout);
    resolvePrelaunch({ type: 'error', error: err });
  }

  const outcome = await outcomePromise;
  clearTimeout(checkTimeout);

  if (outcome?.type === 'update-downloaded') {
    updateSplash({
      status: SPLASH_TEXT.installing,
      detail: outcome.version ? `v${outcome.version}` : '',
      busy: true,
      showProgress: true,
      percent: 100,
    });
    const installed = applyDownloadedUpdate('prelaunch-downloaded', { allowDuringCall: true });
    if (installed) return;
  }

  if (outcome?.type === 'update-available' || outcome?.type === 'downloading') {
    // Stay on splash until download finishes — never open main mid-update.
    let downloadTimer = null;
    const downloadOutcome = await new Promise((resolve) => {
      prelaunchResolvers = { resolve };
      downloadTimer = setTimeout(() => {
        log.warn('[updater] prelaunch download timed out — opening app');
        resolve({ type: 'download-timeout' });
      }, PRELAUNCH_DOWNLOAD_TIMEOUT_MS);
    });
    if (downloadTimer) clearTimeout(downloadTimer);
    prelaunchResolvers = null;

    if (downloadOutcome?.type === 'update-downloaded') {
      updateSplash({
        status: SPLASH_TEXT.installing,
        detail: downloadOutcome.version ? `v${downloadOutcome.version}` : '',
        busy: true,
        showProgress: true,
        percent: 100,
      });
      const installed = applyDownloadedUpdate('prelaunch-downloaded', { allowDuringCall: true });
      if (installed) return; // process relaunches after install
    }
  }

  // up-to-date / error / timeout → continue into the app
  openMainApp();
}

function publishContentBox(win) {
  const target = win || mainWindow;
  if (!target || target.isDestroyed?.()) return;
  try {
    target.webContents.send('window:content-box', measureWindowOcclusion(target));
  } catch (_) { /* window closing */ }
}

function sendMaximized(win, value) {
  try { win?.webContents?.send('window:maximized', !!value); } catch (_) {}
}

function toggleMaximize(win) {
  if (!win || win.isDestroyed?.()) return;
  try { if (win.isFullScreen()) win.setFullScreen(false); } catch (_) {}
  try {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } catch (_) {}
}

let containingRestoredWindow = false;

/**
 * Pull a restored window back into the work area. A 1400×900 default on a
 * 125% laptop (logical height ~800) hangs off the bottom and clips the
 * composer. Maximized windows are left alone: setContentBounds clears the
 * maximized state and Electron then paints across the taskbar.
 */
function containRestoredWindow(win) {
  if (containingRestoredWindow) return;
  if (!win || win.isDestroyed?.()) return;
  try {
    if (win.isMaximized() || win.isFullScreen()) return;
  } catch (_) {
    return;
  }
  let bounds;
  let area;
  try {
    bounds = win.getContentBounds();
    area = screen.getDisplayMatching(bounds)?.workArea;
  } catch (_) {
    return;
  }
  if (!bounds || !area) return;
  const overflows =
    bounds.x < area.x - 1
    || bounds.y < area.y - 1
    || bounds.x + bounds.width > area.x + area.width + 1
    || bounds.y + bounds.height > area.y + area.height + 1;
  if (!overflows) return;
  const fitted = fitBoundsToWorkArea(bounds, area, { minWidth: 1200, minHeight: 700 });
  containingRestoredWindow = true;
  try {
    win.setMinimumSize(fitted.minWidth, fitted.minHeight);
    win.setContentBounds({ x: fitted.x, y: fitted.y, width: fitted.width, height: fitted.height });
  } catch (_) { /* display gone */ }
  containingRestoredWindow = false;
}

function initialWindowBounds() {
  let area = null;
  try { area = screen.getPrimaryDisplay()?.workArea || null; } catch (_) { area = null; }
  return fitBoundsToWorkArea(
    { width: 1400, height: 900 },
    area,
    { minWidth: 1200, minHeight: 700 },
  );
}

// Create main window
function createMainWindow() {
  const initial = initialWindowBounds();
  mainWindow = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
    minWidth: initial.minWidth,
    minHeight: initial.minHeight,
    show: false,
    skipTaskbar: false,
    // Frameless — React TitleBar provides window controls (avoids double title bars).
    // titleBarStyle:'hidden' is a macOS caption. On Windows it reserves a native
    // caption inset and the page then paints ~40px past the visible client.
    frame: false,
    // macOS: a transparent window plus vibrancy lets backdrop-filter composite
    // the same aurora the web shell blurs. The page still paints that aurora
    // on html/body, so the desktop does not show through the panels.
    // Windows: do not set transparent or thickFrame:false. Electron 41 only
    // indents a maximized frameless client out of the taskbar while the window
    // keeps WS_THICKFRAME (GetClientAreaInsets). A layered transparent window
    // skips that inset and paints across the taskbar.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden', transparent: true, vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000' }
      : { backgroundColor: '#0d0e13' }),
    ...(process.platform === 'linux' ? { transparent: true, backgroundColor: '#00000000' } : {}),
    // Do not set thickFrame:false. Electron 41 indents a maximized frameless
    // client out of the taskbar only while the window stays maximized AND
    // keeps WS_THICKFRAME (GetClientAreaInsets, GetDwmFrameInsetsInPixels,
    // WidgetSizeIsClientSize in electron_desktop_window_tree_host_win.cc).
    // thickFrame:false strips that style, and unmaximize+setBounds(workArea)
    // clears the maximized state, so neither inset runs and the client is
    // painted across the taskbar on every screen.
    fullscreenable: false,
    icon: resolveAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
      // Hidden-to-tray must not throttle sockets/timers — notifications and
      // the update poller keep running in the background.
      backgroundThrottling: false
    }
  });

  mainWindow.setMenu(null);
  require('./viewportSync.cjs').attachViewportSync(mainWindow, { log: (m) => { try { log.warn(m); } catch (_) {} } });
  Menu.setApplicationMenu(null);
  bindVoiceBusyLifecycle(mainWindow);

  // Close → minimize to tray instead of quitting.
  // NEVER quitAndInstall here: close-to-tray is how Demir backgrounds the app;
  // quitAndInstall(true,true) relaunches and steals focus.
  mainWindow.on('close', (e) => {
    if (isQuitting) return; // real quit (tray → Çıkış / updater install)
    e.preventDefault();
    // Safety net: with no tray icon the window would become unreachable, so
    // fall back to a plain minimize instead of hiding.
    if (!tray || (typeof tray.isDestroyed === 'function' && tray.isDestroyed())) {
      log.warn('[window] close requested but no tray icon — minimizing instead of hiding');
      try { mainWindow.setSkipTaskbar(false); } catch (_) {}
      mainWindow.minimize();
      return;
    }
    // Close-to-background: hide to tray, not minimize (no taskbar stub).
    try { mainWindow.setSkipTaskbar(true); } catch (_) {}
    mainWindow.hide();
    setStartInBackground(true, 'hidden');
    showNotificationWindow({
      title: 'Descall',
      body: et('notice.background'),
      type: 'default',
      appIcon: true,
      duration: 5000,
    });
  });

  // IPC handlers for window controls
  // A secondary app window (Kayıt İstatistikleri, Yönetici Paneli) drives its own controls; everything else is the main window.
  const controlledWindow = (event) => {
    const w = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    return w && w !== mainWindow && (w === signupStatsWindow || w === adminPanelWindow) ? w : mainWindow;
  };
  ipcMain.on('window:minimize', (event) => {
    controlledWindow(event)?.minimize();
  });

  ipcMain.on('window:maximize', (event) => {
    toggleMaximize(controlledWindow(event));
  });

  ipcMain.on('window:close', (event) => {
    controlledWindow(event)?.close();
  });

  const publishBox = () => publishContentBox(mainWindow);
  mainWindow.on('resize', publishBox);
  mainWindow.on('move', publishBox);
  mainWindow.on('restore', () => {
    containRestoredWindow(mainWindow);
    publishBox();
  });
  mainWindow.on('show', publishBox);
  mainWindow.on('maximize', () => {
    sendMaximized(mainWindow, true);
    publishBox();
  });
  mainWindow.on('unmaximize', () => {
    sendMaximized(mainWindow, false);
    containRestoredWindow(mainWindow);
    publishBox();
  });
  mainWindow.on('enter-full-screen', () => {
    try { mainWindow.setFullScreen(false); } catch (_) {}
    try { if (!mainWindow.isMaximized()) mainWindow.maximize(); } catch (_) {}
  });

  // Notification permission probe (actual show goes through module-level IPC below)
  ipcMain.handle('notification:request-permission', async () => true);

  // Allow screen capture permissions
  // 'speaker-selection' (2.10.113): without it Chromium rejects
  // HTMLMediaElement/AudioContext.setSinkId, so picking a speaker in a call
  // silently did nothing.
  // pointerLock: first-person mouse look in the 3D world (click to look, Esc releases)
  const MEDIA_PERMISSIONS = ['media', 'display-capture', 'screen', 'audioCapture', 'videoCapture', 'speaker-selection', 'pointerLock'];
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(MEDIA_PERMISSIONS.includes(permission));
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return MEDIA_PERMISSIONS.includes(permission);
  });

  // Make navigator.mediaDevices.getDisplayMedia work in Electron (DM/group/server).
  // Without this handler Chromium reports screen share as unsupported.
  try {
    mainWindow.webContents.session.setDisplayMediaRequestHandler(
      async (request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 1, height: 1 },
          });
          if (!sources.length) {
            callback({});
            return;
          }
          const screen =
            sources.find((s) => String(s.id || '').startsWith('screen:')) || sources[0];
          const wantsAudio = request?.audioRequested !== false;
          callback({
            video: screen,
            // Loopback is system audio. A video-only retry must not require it,
            // or a Mac/Windows loopback failure cancels the whole share.
            ...(wantsAudio ? { audio: 'loopback' } : {}),
          });
        } catch (err) {
          log.error('setDisplayMediaRequestHandler error:', err);
          callback({});
        }
      },
      // Prefer the OS picker when the platform supports it (macOS/Windows).
      { useSystemPicker: true }
    );
  } catch (err) {
    log.warn('setDisplayMediaRequestHandler unavailable:', err?.message || err);
  }

  // Native right-click behaviour. The in-app lists (DMs, groups, servers,
  // channels) render their own context menus, so the OS menu must only step in
  // for text fields / selections — never pop a DevTools menu on top of them.
  mainWindow.webContents.on('context-menu', (_event, params = {}) => {
    const menu = new Menu();

    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'undo' }));
      menu.append(new MenuItem({ role: 'redo' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'cut' }));
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({ role: 'paste' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    } else if (String(params.selectionText || '').trim()) {
      menu.append(new MenuItem({ role: 'copy' }));
    }

    // Debug entries only in dev builds; F12 / Ctrl+Shift+I stay bound always.
    if (!app.isPackaged) {
      if (menu.items.length) menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Toggle Developer Tools',
        click: () => mainWindow?.webContents.toggleDevTools(),
      }));
      menu.append(new MenuItem({
        label: 'Reload',
        click: () => mainWindow?.webContents.reload(),
      }));
    }

    // Nothing OS-level to offer → leave the click to the app's own menu.
    if (!menu.items.length) return;
    menu.popup();
  });

  // CSP for the renderer: inline scripts are allowed by sha256 of the shipped index.html, not 'unsafe-inline'.
  const cspRoot = isDev ? null : distRoot();
  const rendererCsp = cspRoot ? appDocumentCsp(cspRoot) : buildElectronCsp(null, { dev: isDev });
  // Only the app document (descall://app/…) gets the hashed policy. Everything else in this
  // session (notification and overlay files) keeps the pre-2.11.2 policy.
  const legacyCsp = buildElectronCsp(null);
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const isAppDocument = /^descall:\/\/app\//i.test(details.url || '');
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isAppDocument ? rendererCsp : legacyCsp],
      }
    });
  });

  // Load app. Boot watchdog (2.11.5, bootWatchdog.cjs): a failed main-frame
  // load is retried with backoff, then the user gets Tekrar dene / Çıkış; a
  // renderer crash during boot reloads; a window that never becomes
  // ready-to-show is revealed anyway so the renderer's error state is reachable.
  const win = mainWindow;
  const appUrl = isDev ? 'http://localhost:5173' : 'descall://app/index.html';
  let loadFailures = 0;
  let loadRetryTimer = null;
  let bootCrashReloads = 0;
  let booted = false;
  const loadApp = () => {
    if (!win || win.isDestroyed()) return;
    win.loadURL(appUrl).catch((err) => {
      // did-fail-load carries the retry; this only logs.
      log.warn(`[boot] loadURL rejected: ${err?.code || ''} ${err?.message || err}`);
    });
  };
  const askToRetryLoad = (detail) => {
    if (!win || win.isDestroyed()) return;
    revealMainWindow('load-failed');
    dialog.showMessageBox(win, {
      type: 'error',
      title: 'Descall',
      message: et('dialog.loadFailed'),
      detail: et('dialog.loadFailedDetail', { detail }),
      buttons: [et('dialog.retry'), et('dialog.quit')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(({ response }) => {
      if (response === 0) {
        loadFailures = 0;
        loadApp();
      } else {
        isQuitting = true;
        app.quit();
      }
    }).catch(() => {});
  };
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!shouldRetryLoad({ errorCode, isMainFrame })) return;
    const delay = nextLoadRetryDelay(loadFailures);
    loadFailures += 1;
    log.warn(`[boot] main frame load failed (${errorCode} ${errorDescription}) ${validatedURL || ''} attempt=${loadFailures} next=${delay ?? 'ask'}`);
    if (loadRetryTimer) clearTimeout(loadRetryTimer);
    if (delay == null) {
      askToRetryLoad(`${errorCode} ${errorDescription || ''}`.trim());
      return;
    }
    loadRetryTimer = setTimeout(() => { loadRetryTimer = null; loadApp(); }, delay);
  });
  win.webContents.on('did-finish-load', () => { loadFailures = 0; });

  // Paint watchdog (2.11.9, bootWatchdog.paintWatchdogStep). Runs in main, so it
  // also covers a renderer that never gets to its own timers or a window whose
  // last presented frame is stale (splash shown although the app is up).
  let paintTimer = null;
  let paintReloads = 0;
  let paintAsked = false;
  let paintNudged = false;
  const stopPaintWatchdog = () => { if (paintTimer) { clearInterval(paintTimer); paintTimer = null; } };
  const snapshotRenderer = () => win.webContents.executeJavaScript(`(() => {
    const s = document.querySelectorAll('#boot-splash');
    const r = document.getElementById('root');
    return JSON.stringify({ splashes: s.length, failed: [...s].map((x) => x.getAttribute('data-boot-failed') || '').join(','),
      hidden: [...s].map((x) => x.classList.contains('boot-splash--hide')).join(','), rootChildren: r ? r.childElementCount : -1,
      rootText: r ? (r.innerText || '').replace(/\\s+/g, ' ').trim().length : -1, rootH: r ? Math.round(r.getBoundingClientRect().height) : -1,
      vis: document.visibilityState, holds: window.__descallBootHolds, path: location.pathname, ready: document.readyState });
  })()`, true).catch((err) => `snapshot failed: ${err?.message || err}`);
  // The app painted under a splash nothing will remove (index.html's inline boot
  // scripts did not run, 2.11.11): remove it from main. executeJavaScript is not
  // bound by the page's script-src, so this works whatever the CSP did.
  const rescueStuckSplash = () => win.webContents.executeJavaScript(`(() => {
    const s = document.querySelectorAll('#boot-splash');
    if (!s.length) return '';
    if (window.__descallBootHolds > 0) return '';
    const r = document.getElementById('root');
    const text = r ? (r.innerText || '').replace(/\\s+/g, ' ').trim().length : 0;
    const h = r ? r.getBoundingClientRect().height : 0;
    if (!r || !r.firstElementChild || h < 80 || !text) return '';
    for (const n of s) n.remove();
    return JSON.stringify({ removed: s.length, inline: typeof window.__descallDismissBootSplash === 'function', path: location.pathname });
  })()`, true).catch(() => '');
  let rescueBusy = false;
  let paintTickBusy = false;
  let paintGen = 0;
  // Armed per document (2.13.1): only a main-frame, cross-document navigation boots the
  // renderer again. did-start-loading also fires for pushState, so 2.11.9 re-armed on every
  // in-app navigation and "clean reloaded" a healthy app 22 s later (Mağaza → Ülkeler).
  win.webContents.on('did-start-navigation', (details, legacyUrl, legacyInPlace, legacyMainFrame) => {
    const nav = details && typeof details === 'object' && 'isSameDocument' in details
      ? { isMainFrame: details.isMainFrame, isSameDocument: details.isSameDocument }
      : { isMainFrame: legacyMainFrame, isSameDocument: legacyInPlace };
    if (!shouldArmPaintWatchdog(nav)) return;
    rendererBoot = { painted: false, loadStartedAt: Date.now() };
    paintNudged = false;
    paintTickBusy = false;
    stopPaintWatchdog();
    const gen = ++paintGen;
    paintTimer = setInterval(async () => {
      if (win.isDestroyed()) { stopPaintWatchdog(); return; }
      const elapsedMs = Date.now() - rendererBoot.loadStartedAt;
      if (!rendererBoot.painted && elapsedMs >= SPLASH_RESCUE_MS && !rescueBusy) {
        rescueBusy = true;
        const rescued = await rescueStuckSplash();
        rescueBusy = false;
        if (rescued) {
          log.error(`[boot] removed a splash stuck over the painted app after ${elapsedMs}ms: ${rescued}`);
          rendererBoot.painted = true;
          try { win.webContents.invalidate(); } catch (_) { /* ignore */ }
          stopPaintWatchdog();
          return;
        }
      }
      let step = paintWatchdogStep({ painted: rendererBoot.painted, elapsedMs, reloads: paintReloads, asked: paintAsked });
      if (step === 'none') { if (rendererBoot.painted) stopPaintWatchdog(); return; }
      // The painted report can be lost (IPC raced the load, renderer reported early): never
      // reload or nag over an app that is visibly up with no boot splash.
      if (paintTickBusy) return;
      paintTickBusy = true;
      // A wedged renderer may never answer: the watchdog still moves on after 2 s.
      const raced = await raceWithTimeout(snapshotRenderer(), 2000);
      paintTickBusy = false;
      const snap = raced.timedOut ? 'snapshot timed out' : raced.value;
      if (win.isDestroyed() || gen !== paintGen || !paintTimer) return;
      if (appLooksPainted(snap)) {
        log.info(`[boot] app is up without a painted report after ${elapsedMs}ms, watchdog stands down: ${snap}`);
        rendererBoot.painted = true;
        stopPaintWatchdog();
        return;
      }
      step = paintWatchdogStep({ painted: rendererBoot.painted, elapsedMs, reloads: paintReloads, asked: paintAsked });
      if (step === 'nudge') {
        if (paintNudged) return;
        paintNudged = true;
        log.warn(`[boot] not painted after ${elapsedMs}ms: ${snap}`);
        try { win.webContents.invalidate(); } catch (_) { /* ignore */ }
        return;
      }
      if (step === 'reload') {
        paintReloads += 1;
        log.warn(`[boot] still not painted after ${elapsedMs}ms: ${snap}`);
        stopPaintWatchdog();
        clearAndReloadRenderer(win.webContents, 'paint-watchdog');
        return;
      }
      if (step === 'ask') {
        paintAsked = true;
        stopPaintWatchdog();
        log.error(`[boot] gave up waiting for paint after ${elapsedMs}ms: ${snap}`);
        if (!win.isVisible()) return; // tray/autostart: the next show re-checks via invalidate
        dialog.showMessageBox(win, {
          type: 'error',
          title: 'Descall',
          message: et('dialog.openFailed'),
          detail: et('dialog.openFailedDetail'),
          buttons: [et('dialog.retry'), et('dialog.quit')],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        }).then(({ response }) => {
          if (response === 0) { paintAsked = false; paintReloads = 0; clearAndReloadRenderer(win.webContents, 'user-retry'); }
          else { isQuitting = true; app.quit(); }
        }).catch(() => {});
      }
    }, 1000);
  });
  win.once('closed', stopPaintWatchdog);

  // Coming back from minimized/tray: present a fresh frame. A window that was
  // minimized while the renderer booted (updater relaunch) could otherwise keep
  // showing the splash frame it had when it went away.
  for (const ev of ['show', 'restore', 'focus']) {
    win.on(ev, () => { try { win.webContents.invalidate(); } catch (_) { /* ignore */ } });
  }

  // Renderer warnings/errors and [boot] lines go to main.log (evidence for stuck starts).
  win.webContents.on('console-message', (e, legacyLevel, legacyMessage) => {
    const level = e?.level ?? legacyLevel;
    const message = String(e?.message ?? legacyMessage ?? '');
    const isWarn = level === 'warning' || level === 'error' || level === 2 || level === 3;
    if (!isWarn && !message.startsWith('[boot]')) return;
    if (rendererBoot.painted && !isWarn) return;
    if (rendererBoot.painted && Date.now() - rendererBoot.loadStartedAt > 60000) return; // boot window only
    // CSP reports carry the hash Chromium wanted at the very end: keep it.
    const max = /Content Security Policy/i.test(message) ? 2400 : 400;
    log.info(`[renderer:${level}] ${message.slice(0, max)}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    const reason = details?.reason;
    if (!shouldReloadAfterCrash({ booted, crashReloads: bootCrashReloads, reason })) return;
    bootCrashReloads += 1;
    log.warn(`[boot] renderer gone during boot (${reason}), reload ${bootCrashReloads}`);
    setTimeout(() => { try { if (!win.isDestroyed()) win.webContents.reload(); } catch (_) { /* ignore */ } }, 500);
  });

  if (isDev) {
    loadApp();
    mainWindow.webContents.openDevTools();
  } else {
    const root = distRoot();
    console.log('Loading from:', root);
    if (root) {
      loadApp();
    } else {
      dialog.showErrorBox(et('dialog.indexMissingTitle'), et('dialog.indexMissing'));
    }
  }

  let revealed = false;
  function revealMainWindow(why) {
    if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
    revealed = true;
    if (why !== 'ready-to-show') log.warn(`[boot] revealing main window without ready-to-show (${why})`);
    setTimeout(() => { booted = true; }, 30 * 1000);
    containRestoredWindow(mainWindow);
    if (splashWindow && !splashWindow.isDestroyed()) {
      try { splashWindow.close(); } catch (_) { /* ignore */ }
      splashWindow = null;
    }
    const launch = resolveColdStart();
    if (userRequestedShow || launch.action === 'show') {
      // Manual shortcut, taskbar, or Start menu: show and focus after splash.
      showMainWindow();
    } else if (launch.action === 'minimize') {
      log.info('[boot] updater relaunch (minimized) — showInactive then minimize');
      try { mainWindow.setSkipTaskbar(false); } catch (_) { /* ignore */ }
      mainWindow.showInactive();
      mainWindow.minimize();
    } else {
      log.info(`[boot] ${launch.reason} — window stays hidden`);
      try { mainWindow.setSkipTaskbar(true); } catch (_) { /* ignore */ }
    }

    // Background polling only after the Discord-style prelaunch gate
    scheduleBackgroundUpdateChecks();
  }
  // Show window when ready (unless we were in the tray and the updater relaunched)
  mainWindow.once('ready-to-show', () => revealMainWindow('ready-to-show'));
  const readyFallback = setTimeout(() => revealMainWindow('ready-timeout'), READY_FALLBACK_MS);
  mainWindow.once('closed', () => clearTimeout(readyFallback));

  // Window events
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const tryBackgroundCheck = (reason) => {
    checkForAppUpdates(reason);
  };
  // 3.7.15 idle CPU: backgroundThrottling is off (sockets / sounds must keep running
  // in the tray), so Chromium never tells the page it is hidden. Tell it ourselves:
  // the renderer pauses CSS animations while minimized / hidden (html.app-backgrounded).
  const sendVisibility = (backgrounded) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:visibility', { backgrounded });
    } catch (_) { /* ignore */ }
  };
  // Update checks on blur were firing on every alt-tab: at most one per 15 minutes.
  let lastBlurCheck = 0;
  mainWindow.on('minimize', () => {
    // Minimize keeps the taskbar button — clicking it restores natively.
    try { mainWindow.setSkipTaskbar(false); } catch (_) { /* ignore */ }
    setStartInBackground(true, 'minimized');
    sendVisibility(true);
    tryBackgroundCheck('minimize');
  });
  mainWindow.on('hide', () => {
    setStartInBackground(true, 'hidden');
    sendVisibility(true);
    tryBackgroundCheck('hide');
  });
  mainWindow.on('show', () => { setStartInBackground(false); sendVisibility(false); });
  mainWindow.on('focus', () => { setStartInBackground(false); sendVisibility(false); });
  mainWindow.on('restore', () => { setStartInBackground(false); sendVisibility(false); });
  mainWindow.on('blur', () => {
    if (!isAppInBackground()) return;
    const now = Date.now();
    if (now - lastBlurCheck < 15 * 60 * 1000) return;
    lastBlurCheck = now;
    tryBackgroundCheck('blur');
  });

  // Handle external links — Descall Setup assets download in-app so we can prune older installers
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Yönetici › Kayıt İstatistikleri: its own window (one at a time).
    if (isSignupStatsUrl(url, { isDev })) {
      if (signupStatsWindow && !signupStatsWindow.isDestroyed()) {
        if (signupStatsWindow.isMinimized()) signupStatsWindow.restore();
        signupStatsWindow.focus();
        return { action: 'deny' };
      }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: signupStatsWindowOptions({ preload: path.join(__dirname, 'preload.cjs'), icon: resolveAppIcon() }),
      };
    }
    // Yönetici Paneli: its own window (one at a time), the main window stays usable.
    if (isAdminPanelUrl(url, { isDev })) {
      if (adminPanelWindow && !adminPanelWindow.isDestroyed()) {
        if (adminPanelWindow.isMinimized()) adminPanelWindow.restore();
        adminPanelWindow.focus();
        return { action: 'deny' };
      }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: adminPanelWindowOptions({ preload: path.join(__dirname, 'preload.cjs'), icon: resolveAppIcon() }),
      };
    }
    if (isDescallSetupDownloadUrl(url)) {
      downloadDescallSetupViaElectron({
        webContents: mainWindow.webContents,
        app,
        url,
        log,
      });
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-create-window', (win, { url }) => {
    const isStats = isSignupStatsUrl(url, { isDev });
    const isPanel = !isStats && isAdminPanelUrl(url, { isDev });
    if (!isStats && !isPanel) return;
    if (isStats) signupStatsWindow = win;
    else adminPanelWindow = win;
    const ownRoute = isStats ? isSignupStatsUrl : isAdminPanelUrl;
    win.setMenu(null);
    win.on('closed', () => {
      if (signupStatsWindow === win) signupStatsWindow = null;
      if (adminPanelWindow === win) adminPanelWindow = null;
    });
    win.on('maximize', () => win.webContents.send('window:maximized', true));
    win.on('unmaximize', () => win.webContents.send('window:maximized', false));
    win.webContents.setWindowOpenHandler(({ url: next }) => {
      if (/^https?:/i.test(next)) shell.openExternal(next);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, next) => {
      if (!ownRoute(next, { isDev })) event.preventDefault();
    });
  });

  // Security: Prevent navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.includes('localhost') && !url.startsWith('file://')) {
      event.preventDefault();
      if (isDescallSetupDownloadUrl(url)) {
        downloadDescallSetupViaElectron({
          webContents: mainWindow.webContents,
          app,
          url,
          log,
        });
        return;
      }
      shell.openExternal(url);
    }
  });
}

function createTray() {
  if (tray && !(typeof tray.isDestroyed === 'function' && tray.isDestroyed())) return tray;

  try {
    const iconPath = resolveAppIcon();
    const icon = iconPath
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();
    tray = new Tray(icon);
  } catch (err) {
    // Without a tray the close button falls back to minimize (see 'close').
    log.error('[tray] could not create tray icon:', err?.message || err);
    tray = null;
    return null;
  }

  tray.setToolTip('Descall');

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: et('tray.open'),
      click: () => {
        showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: et('tray.startWithWindows'),
      type: 'checkbox',
      checked: readOpenAtLogin(),
      click: (item) => {
        syncLoginItem(item.checked);
        tray.setContextMenu(buildMenu());
      },
    },
    { type: 'separator' },
    {
      label: updateReady ? et('tray.updateAndQuit', { version: updateVersion || '' }) : et('tray.quit'),
      click: () => {
        if (updateReady) {
          // In a voice chat this asks before cutting the call. Otherwise it
          // installs. A plain quit with a staged update installs from before-quit
          // after this process releases Descall.exe and ffmpeg.dll.
          const result = requestExplicitInstall('tray');
          if (result?.needsConfirm) return;
          if (result?.installing) return;
        }
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  rebuildTrayMenu = () => {
    if (!tray || (typeof tray.isDestroyed === 'function' && tray.isDestroyed())) return;
    try { tray.setContextMenu(buildMenu()); } catch (_) { /* ignore */ }
  };

  tray.setContextMenu(buildMenu());
  // Left click / double click always restores + focuses the window.
  tray.on('click', () => {
    showMainWindow();
  });
  tray.on('double-click', () => {
    showMainWindow();
  });
  tray.on('right-click', () => {
    try { tray.popUpContextMenu(buildMenu()); } catch (_) { /* ignore */ }
  });
  return tray;
}

// App events
app.whenReady().then(async () => {
  // A second process that lost the single-instance lock must not create a
  // splash, check for updates or touch userData (2.11.9: the updater relaunch
  // plus a manual start used to run both boots side by side for a moment).
  if (!gotTheLock) return;
  try {
    const bootDir = app.getPath('userData');
    fs.mkdirSync(bootDir, { recursive: true });
    fs.writeFileSync(path.join(bootDir, 'boot-ok'), String(app.getVersion()), 'utf8');
  } catch (err) {
    log.warn('[boot] boot-ok write failed:', err?.message || err);
  }
  if (smokeLaunch) {
    log.info('[smoke] process started, exiting');
    app.exit(0);
    return;
  }

  // Main-process language before the splash: last UI language, else the OS languages.
  try {
    const osLanguages = [...(app.getPreferredSystemLanguages?.() || []), app.getLocale()];
    initLocale({ userDataDir: app.getPath('userData'), osLanguages });
  } catch (err) {
    log.warn('[i18n] locale init failed:', err?.message || err);
  }

  registerDescallProtocol();
  if (!smokeBoot) ensureAutostartLoginItem();

  try {
    bindSessionSetupDownloadCleanup({ session: session.defaultSession, app, log });
  } catch (err) {
    log.warn('[setup-cleanup] session bind failed:', err?.message || err);
  }
  // After an update is applied (or on every launch), drop older Setup installers from Downloads
  pruneOldSetupDownloads('app-ready', app.isPackaged ? app.getVersion() : null);

  registerProcessScannerIPC();
  registerOverlayIPC(() => mainWindow);

  globalShortcut.register('F12', () => mainWindow?.webContents.toggleDevTools());
  globalShortcut.register('CommandOrControl+Shift+I', () => mainWindow?.webContents.toggleDevTools());
  globalShortcut.register('F11', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    toggleMaximize(mainWindow);
  });

  app.on('activate', () => {
    if (mainWindow) {
      showMainWindow();
    } else if (!mainLaunchStarted && !prelaunchActive) {
      openMainApp();
    }
  });

  // Discord-like flow: splash first → check/update → only then open main UI
  await createSplashWindow();
  await runPrelaunchUpdateGate();
  scheduleBackgroundUpdateChecks();
});

app.on('window-all-closed', () => {
  // Don't quit — stay in tray
});

app.on('before-quit', () => {
  isQuitting = true;
  destroyOverlayWindow();
  if (!updateReady || installStarted || !app.isPackaged) return;
  try {
    installStarted = true;
    startUpdateInstall('quit', { forceRun: false });
  } catch (err) {
    installStarted = false;
    log.error('[updater] quit install failed:', err?.message || err);
  }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log.info('[updater] Checking for update...');
  if (prelaunchActive) {
    updateSplash({
      status: SPLASH_TEXT.checking,
      detail: '',
      busy: true,
      showProgress: false,
    });
  }
});

autoUpdater.on('update-available', (info) => {
  log.info('[updater] Update available, downloading:', info.version);
  updateVersion = info.version || updateVersion;
  if (prelaunchActive) {
    updateSplash({
      status: SPLASH_TEXT.downloading,
      detail: info.version ? `v${info.version}` : '',
      busy: true,
      showProgress: true,
      percent: 0,
    });
    resolvePrelaunch({ type: 'update-available', version: info.version });
  } else {
    mainWindow?.webContents?.send('update:downloading', { version: info.version });
  }
});

autoUpdater.on('update-not-available', (info) => {
  log.info('[updater] Already up-to-date:', info.version);
  if (prelaunchActive) {
    updateSplash({
      status: SPLASH_TEXT.upToDate,
      detail: info.version ? `v${info.version}` : '',
      busy: true,
      showProgress: false,
    });
    resolvePrelaunch({ type: 'up-to-date', version: info.version });
  }
});

autoUpdater.on('error', (err) => {
  log.error('[updater] Error:', err?.message ?? err);
  if (prelaunchActive) {
    updateSplash({
      status: SPLASH_TEXT.checkFailed,
      detail: SPLASH_TEXT.starting,
      busy: true,
      showProgress: false,
    });
    resolvePrelaunch({ type: 'error', error: err });
  } else {
    mainWindow?.webContents?.send('update:error', { message: err?.message || String(err) });
  }
});

autoUpdater.on('download-progress', ({ percent, bytesPerSecond, transferred, total }) => {
  log.info(`[updater] Downloading: ${percent.toFixed(1)}% (${bytesPerSecond} B/s)`);
  if (prelaunchActive) {
    const mb = total > 0 ? `${(transferred / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` : '';
    updateSplash({
      status: SPLASH_TEXT.downloading,
      detail: mb,
      busy: true,
      showProgress: true,
      percent,
    });
  } else {
    mainWindow?.webContents?.send('update:progress', { percent, bytesPerSecond, transferred, total });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('[updater] Update downloaded:', info.version);
  updateReady = true;
  updateVersion = info.version;
  downloadedInstallerPath = info?.downloadedFile || autoUpdater.downloadedUpdateHelper?.file || null;
  const files = Array.isArray(info?.files) ? info.files : [];
  const exeFile = files.find((file) => String(file?.url || "").toLowerCase().endsWith(".exe")) || files[0];
  downloadedInstallerSize = Number(exeFile?.size) || null;
  pruneOldSetupDownloads('update-downloaded', info.version);

  if (prelaunchActive) {
    updateSplash({
      status: SPLASH_TEXT.installing,
      detail: info.version ? `v${info.version}` : '',
      busy: true,
      showProgress: true,
      percent: 100,
    });
    resolvePrelaunch({ type: 'update-downloaded', version: info.version });
    // Install immediately from splash — do not open main first
    scheduleSilentInstall();
    return;
  }

  const deferredForCall = isBusyWithLiveSession();
  mainWindow?.webContents?.send('update:ready', {
    version: info.version,
    deferred: deferredForCall,
  });
  // Staged only — do not send update:installing (that used to imply an immediate restart).
  rebuildTrayMenu?.();

  showNotificationWindow({
    title: 'Descall',
    body: et(deferredForCall ? 'update.downloadedDeferred' : 'update.downloaded', { version: info.version }),
    type: 'default',
    appIcon: true,
    duration: 8000,
    // Do not show()/focus() — notification must not steal the window.
  });

  scheduleSilentInstall();
});

// ─── Notification IPC ────────────────────────────────────────────────────────
// tag → { win, count } — one toast per chat / call; repeats update it in place.
const activeNotifByTag = new Map();

function mainWindowInFront() {
  try {
    return Boolean(
      mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() &&
      !mainWindow.isMinimized() && mainWindow.isFocused()
    );
  } catch (_) {
    return false;
  }
}

function showAppNotification({ title, options = {} } = {}) {
  const { body, tag = 'descall', data = {}, requireInteraction = false, avatarUrl = null } = options;

  const isCall    = data?.type === 'call' || data?.type === 'group-call';
  // Descall in front: the in-app UI (message list, incoming call card) is
  // already showing this. A toast on top would be a duplicate.
  if (mainWindowInFront() && (isCall || !requireInteraction)) return null;

  const notifType = isCall ? 'call' : (String(tag).startsWith('mention') ? 'mention' : 'default');
  const duration  = isCall || requireInteraction ? 0 : 5000;
  const APP_KINDS = new Set(['friend-online', 'announcement']);
  const appIcon = !avatarUrl && (!data?.type || APP_KINDS.has(data.type));
  // 3.0.0 (mockup 33): capsule content — name + group / "şimdi", one-line
  // preview, status dot or group badge, "Mesaj" pill; calls "Ayşe arıyor...".
  const model = describeNotification({ title, body, data, appIcon, avatarUrl });
  const cardTitle = model.name;
  // "Mesaj" on "Mert çevrimiçi" opens that DM.
  const clickData = (d) => (d?.type === 'friend-online' && d.userId
    ? { type: 'dm', conversationId: d.userId, fromId: d.userId, from: d.username || '' }
    : (d || {}));

  // Grouping: another message for the same chat updates the visible toast
  // (new text + count chip, timer restarts) instead of closing and
  // re-opening a window for every message.
  const existing = activeNotifByTag.get(tag);
  if (existing && !isCall) {
    const count = (existing.count || 1) + 1;
    if (updateShownNotification(existing.win, { title: cardTitle, body: model.preview || '', context: model.context || '', count })) {
      existing.count = count;
      existing.data = data || {};
      return existing.win;
    }
  }
  if (existing) {
    activeNotifByTag.delete(tag);
    closeShownNotification(existing.win);
  }

  const entry = { win: null, count: 1, data: data || {} };
  const win = showNotificationWindow({
    title: cardTitle,
    body: model.preview || '',
    type: notifType,
    avatarUrl: avatarUrl || data?.avatarUrl || null,
    appIcon,
    from: data?.from || data?.username || null,
    duration,
    model,
    onClick: () => {
      showMainWindow();
      // Always send a consistent envelope so the renderer can route by data.type
      // (latest grouped message's data, so the click opens the right chat).
      mainWindow?.webContents?.send('notification:click', {
        title,
        body,
        tag,
        data: clickData(entry.data),
      });
    },
    onAccept: isCall ? () => {
      showMainWindow();
      mainWindow?.webContents?.send('notification:call-accept', data || {});
    } : undefined,
    onDecline: isCall ? () => {
      mainWindow?.webContents?.send('notification:call-decline', data || {});
    } : undefined,
  });

  if (win) {
    entry.win = win;
    activeNotifByTag.set(tag, entry);
    win.once('closed', () => {
      if (activeNotifByTag.get(tag) === entry) activeNotifByTag.delete(tag);
    });
  }
  return win;
}

ipcMain.on('notification:show', (_event, payload = {}) => {
  showAppNotification(payload);
});

// Incoming-call toasts use duration 0. The renderer closes them by tag when
// the ring ends (accept, decline, cancel, end, miss, answered elsewhere).
ipcMain.on('notification:close', (_event, payload = {}) => {
  const tags = Array.isArray(payload.tags) ? payload.tags : [payload.tag];
  for (const tag of tags) {
    if (!tag || !activeNotifByTag.has(tag)) continue;
    const entry = activeNotifByTag.get(tag);
    activeNotifByTag.delete(tag);
    closeShownNotification(entry?.win);
  }
});

ipcMain.handle('show-notification', (_event, payload = {}) => {
  const title = payload?.title;
  const options = payload?.options
    ? payload.options
    : {
        body: payload?.body,
        tag: payload?.tag,
        data: payload?.data,
        requireInteraction: payload?.requireInteraction,
        silent: payload?.silent,
        avatarUrl: payload?.avatarUrl,
      };
  showAppNotification({ title, options });
  return true;
});

// IPC handlers
// Composer paste fallback: clipboard image as PNG bytes (null when none).
ipcMain.handle('clipboard:read-image', () => {
  try {
    const img = clipboard.readImage();
    if (!img || img.isEmpty()) return null;
    const png = img.toPNG();
    return png.length > 25 * 1024 * 1024 ? null : png;
  } catch {
    return null;
  }
});

ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  if (!isPackaged) return { success: true, skipped: true };
  try {
    const result = await checkForAppUpdates('ipc');
    return { success: true, updateInfo: result?.updateInfo || null, updateReady, updateVersion };
  } catch (err) {
    log.error('[updater] Manual check failed:', err?.message);
    return { success: false, error: err?.message };
  }
});

ipcMain.on('world3d:prefer-high-performance-gpu', (event) => {
  if (!mainWindow || mainWindow.isDestroyed?.() || event.sender !== mainWindow.webContents) return;
  try {
    if (writeWorldGpuMarker(app.getPath('userData'), { fs, path })) log.info('[world3d] discrete GPU requested from the next launch');
  } catch (_) { /* ignore */ }
});

ipcMain.on('voice:set-busy', (event, busy) => {
  if (!mainWindow || mainWindow.isDestroyed?.() || event.sender !== mainWindow.webContents) return;
  const next = Boolean(busy);
  if (next === voiceBusyFromRenderer && next === deferral.voiceBusy) return;
  voiceBusyFromRenderer = next;
  deferral = applyDeferralEvent(deferral, { type: 'voice-busy', busy: next, now: Date.now() });
  log.info(`[updater] voice-busy=${next} graceUntil=${deferral.graceUntil || 0} armed=${deferral.callDeferralArmed}`);
  if (updateReady) evaluatePendingUpdate('voice-busy');
});

ipcMain.on('activity:set-busy', (event, busy) => {
  if (!mainWindow || mainWindow.isDestroyed?.() || event.sender !== mainWindow.webContents) return;
  const next = Boolean(busy);
  if (next === userBusyFromRenderer) return;
  userBusyFromRenderer = next;
  deferral = applyDeferralEvent(deferral, { type: 'user-busy', busy: next, now: Date.now() });
  if (updateReady && !next) evaluatePendingUpdate('user-busy');
});

ipcMain.handle('restart-app', () => requestExplicitInstall('ipc'));

ipcMain.handle('restart-app-confirmed', () => {
  // The user explicitly chose to end the call and restart.
  if (!updateReady) {
    isQuitting = true;
    app.relaunch();
    app.quit();
    return { installing: false, relaunch: true };
  }
  const decision = decideUpdateInstall({
    ...deferral,
    updateReady: true,
    voiceBusy: isBusyWithLiveSession(),
    now: Date.now(),
    explicitConfirm: true,
  });
  if (decision.reason !== 'user-confirmed') {
    return { installing: false };
  }
  const installed = applyDownloadedUpdate('user-confirmed', { allowDuringCall: true });
  return { installing: installed };
});

ipcMain.handle('get-update-status', () => {
  return { updateReady, updateVersion };
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  toggleMaximize(mainWindow);
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:content-box', () => measureWindowOcclusion(mainWindow));

ipcMain.handle('is-window-focused', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  // Frameless pencerelerde hide()/minimize() sonrası isFocused() güvenilmez şekilde
  // true dönebiliyor (bilinen Electron davranışı). Görünürlük/minimize durumunu da
  // kontrol etmeden bu sonuca güvenmek, arka planda veya minimize iken bildirimlerin
  // "pencere zaten görünüyor" sanılıp atlanmasına yol açıyordu.
  if (!mainWindow.isVisible() || mainWindow.isMinimized()) return false;
  return mainWindow.isFocused();
});

ipcMain.handle('focus-window', () => {
  showMainWindow();
});

// Desktop capturer — screen share sources
ipcMain.handle('get-screen-sources', async () => {
  try {
    if (process.platform === 'darwin' && systemPreferences?.getMediaAccessStatus) {
      const access = systemPreferences.getMediaAccessStatus('screen');
      if (access === 'denied' || access === 'restricted') {
        log.warn('[ScreenShare] macOS Screen Recording permission is', access);
      }
    }
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 240 },
      fetchWindowIcons: true,
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnailDataURL: s.thumbnail.toDataURL(),
    }));
  } catch (err) {
    log.error('get-screen-sources error:', err);
    return [];
  }
});

// Security: Handle downloads
ipcMain.on('download-file', async (event, { url, filename }) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(url);
    const buffer = await response.buffer();
    
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, filename);
    
    fs.writeFileSync(filePath, buffer);

    const setupVer = versionFromSetupFilename(filename);
    if (setupVer || isDescallSetupDownloadUrl(url)) {
      pruneOldSetupDownloads('download-file', setupVer);
    }
    
    shell.showItemInFolder(filePath);
    return { success: true, path: filePath };
  } catch (error) {
    log.error('Download error:', error);
    return { success: false, error: error.message };
  }
});

// Register custom protocol for sounds
app.on('ready', () => {
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.substr(6); // Remove 'app://'
    const filePath = path.join(__dirname, '..', url);
    callback({ path: filePath });
  });
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Shortcut, taskbar, or Start menu while a tray instance is already up.
    userRequestedShow = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow();
      return;
    }
    try {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.show();
        splashWindow.center();
      }
    } catch (_) { /* splash not up yet — ready-to-show will honor userRequestedShow */ }
  });
}

log.info('Electron main process initialized');
