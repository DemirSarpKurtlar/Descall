'use strict';

/**
 * Quiet Downloads cleanup for Descall Windows Setup installers.
 * Electron-only — browsers cannot delete files from the user's Downloads folder.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETUP_EXE_RE = /^Descall-Setup-(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\.exe$/i;
const SETUP_BLOCKMAP_RE = /^Descall-Setup-(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\.exe\.blockmap$/i;

function resolveDownloadsDir(app) {
  try {
    if (app && typeof app.getPath === 'function') {
      const p = app.getPath('downloads');
      if (p) return p;
    }
  } catch (_) { /* fall through */ }
  return path.join(os.homedir(), 'Downloads');
}

function normalizeVersion(v) {
  return String(v || '').trim().replace(/^v/i, '');
}

function parseSemverParts(v) {
  return normalizeVersion(v).split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
}

function cmpSemver(a, b) {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function listSetupArtifacts(dir) {
  const setups = [];
  const blockmaps = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const e = new Error(err?.message || String(err));
    e.code = err?.code;
    throw e;
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const name = ent.name;
    let m = name.match(SETUP_EXE_RE);
    if (m) {
      const full = path.join(dir, name);
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(full).mtimeMs; } catch (_) { /* ignore */ }
      setups.push({ name, version: m[1], full, mtimeMs });
      continue;
    }
    m = name.match(SETUP_BLOCKMAP_RE);
    if (m) {
      blockmaps.push({ name, version: m[1], full: path.join(dir, name) });
    }
  }
  return { setups, blockmaps };
}

function pickKeepSetup(setups, keepVersion) {
  if (!setups.length) return null;
  const prefer = normalizeVersion(keepVersion);
  if (prefer) {
    const match = setups.find((s) => normalizeVersion(s.version) === prefer);
    if (match) return match;
  }
  return setups.slice().sort((a, b) => {
    const c = cmpSemver(b.version, a.version);
    if (c) return c;
    return b.mtimeMs - a.mtimeMs;
  })[0];
}

/**
 * Delete older Descall-Setup-*.exe (+ matching .blockmap) from Downloads.
 * Keeps the installer matching keepVersion when present, otherwise the newest.
 * Never touches unrelated Downloads files. No dialogs.
 */
function cleanOldDescallSetups({ app, keepVersion, log } = {}) {
  const logger = log || { info() {}, warn() {} };
  try {
    const dir = resolveDownloadsDir(app);
    if (!dir || !fs.existsSync(dir)) {
      logger.info(`[setup-cleanup] downloads dir missing: ${dir || '(empty)'}`);
      return { deleted: [], kept: null, dir };
    }

    let setups;
    let blockmaps;
    try {
      ({ setups, blockmaps } = listSetupArtifacts(dir));
    } catch (err) {
      logger.warn(`[setup-cleanup] readdir failed: ${err?.message}`);
      return { deleted: [], kept: null, dir, error: err?.message };
    }

    if (!setups.length && !blockmaps.length) {
      return { deleted: [], kept: null, dir };
    }

    const keep = pickKeepSetup(setups, keepVersion);
    const keepVer = keep ? normalizeVersion(keep.version) : null;
    const deleted = [];

    for (const s of setups) {
      if (keep && s.full === keep.full) continue;
      try {
        fs.unlinkSync(s.full);
        deleted.push(s.name);
        logger.info(`[setup-cleanup] deleted ${s.name}`);
      } catch (err) {
        logger.warn(`[setup-cleanup] failed to delete ${s.name}: ${err?.message}`);
      }
    }

    for (const b of blockmaps) {
      if (keepVer && normalizeVersion(b.version) === keepVer) continue;
      try {
        fs.unlinkSync(b.full);
        deleted.push(b.name);
        logger.info(`[setup-cleanup] deleted ${b.name}`);
      } catch (err) {
        logger.warn(`[setup-cleanup] failed to delete ${b.name}: ${err?.message}`);
      }
    }

    if (deleted.length) {
      logger.info(`[setup-cleanup] kept=${keep?.name || '(none)'} deleted=${deleted.length} dir=${dir}`);
    } else {
      logger.info(`[setup-cleanup] nothing to delete (kept=${keep?.name || '(none)'})`);
    }

    return { deleted, kept: keep?.name || null, dir };
  } catch (err) {
    logger.warn(`[setup-cleanup] unexpected: ${err?.message}`);
    return { deleted: [], kept: null, error: err?.message };
  }
}

function isDescallSetupDownloadUrl(url) {
  try {
    const u = String(url || '');
    if (!/Descall-Setup-/i.test(u)) return false;
    return /\.exe(\.blockmap)?(\?|#|$)/i.test(u);
  } catch {
    return false;
  }
}

function filenameFromSetupUrl(url) {
  try {
    const base = path.basename(new URL(url).pathname);
    if (SETUP_EXE_RE.test(base) || SETUP_BLOCKMAP_RE.test(base)) return base;
  } catch (_) { /* ignore */ }
  return null;
}

function versionFromSetupFilename(name) {
  const m = String(name || '').match(SETUP_EXE_RE) || String(name || '').match(SETUP_BLOCKMAP_RE);
  return m ? m[1] : null;
}

/**
 * Download a GitHub Setup asset into Downloads via Electron, then prune older installers.
 */
function downloadDescallSetupViaElectron({ webContents, session, app, url, log } = {}) {
  const logger = log || { info() {}, warn() {} };
  if (!isDescallSetupDownloadUrl(url)) return false;
  const filename = filenameFromSetupUrl(url);
  if (!filename) return false;

  const downloadsDir = resolveDownloadsDir(app);
  try { fs.mkdirSync(downloadsDir, { recursive: true }); } catch (_) { /* ignore */ }
  const savePath = path.join(downloadsDir, filename);
  const keepVersion = versionFromSetupFilename(filename);

  const sess = session || webContents?.session;
  if (!sess) {
    logger.warn('[setup-cleanup] no session for Setup download');
    return false;
  }

  const onWillDownload = (_event, item) => {
    try {
      const itemName = item.getFilename?.() || path.basename(item.getURL?.() || '');
      if (!SETUP_EXE_RE.test(itemName) && !SETUP_BLOCKMAP_RE.test(itemName) && itemName !== filename) {
        return;
      }
      item.setSavePath(savePath);
      item.once('done', (_e, state) => {
        if (state === 'completed') {
          logger.info(`[setup-cleanup] Setup download finished: ${filename}`);
          cleanOldDescallSetups({ app, keepVersion, log: logger });
        } else {
          logger.warn(`[setup-cleanup] Setup download state=${state} file=${filename}`);
        }
      });
    } catch (err) {
      logger.warn(`[setup-cleanup] will-download handler failed: ${err?.message}`);
    }
  };

  // One-shot listener for this download
  sess.once('will-download', onWillDownload);

  try {
    if (webContents && typeof webContents.downloadURL === 'function') {
      webContents.downloadURL(url);
    } else if (typeof sess.downloadURL === 'function') {
      sess.downloadURL(url);
    } else {
      sess.removeListener?.('will-download', onWillDownload);
      logger.warn('[setup-cleanup] downloadURL unavailable');
      return false;
    }
    logger.info(`[setup-cleanup] downloading Setup via Electron → ${savePath}`);
    return true;
  } catch (err) {
    try { sess.removeListener?.('will-download', onWillDownload); } catch (_) { /* ignore */ }
    logger.warn(`[setup-cleanup] downloadURL failed: ${err?.message}`);
    return false;
  }
}

/**
 * Attach a persistent will-download hook so any Descall-Setup save into Downloads
 * triggers older-installer cleanup (no dialogs).
 */
function bindSessionSetupDownloadCleanup({ session, app, log } = {}) {
  const logger = log || { info() {}, warn() {} };
  if (!session || typeof session.on !== 'function') return () => {};

  const handler = (_event, item) => {
    try {
      const name = item.getFilename?.() || '';
      if (!SETUP_EXE_RE.test(name) && !SETUP_BLOCKMAP_RE.test(name)) return;
      const keepVersion = versionFromSetupFilename(name);
      item.once('done', (_e, state) => {
        if (state === 'completed') {
          logger.info(`[setup-cleanup] session download done: ${name}`);
          // Slight delay so the file is fully visible to readdir
          setTimeout(() => {
            cleanOldDescallSetups({ app, keepVersion, log: logger });
          }, 250);
        }
      });
    } catch (err) {
      logger.warn(`[setup-cleanup] session will-download failed: ${err?.message}`);
    }
  };

  session.on('will-download', handler);
  return () => {
    try { session.removeListener('will-download', handler); } catch (_) { /* ignore */ }
  };
}

module.exports = {
  resolveDownloadsDir,
  cleanOldDescallSetups,
  isDescallSetupDownloadUrl,
  filenameFromSetupUrl,
  versionFromSetupFilename,
  downloadDescallSetupViaElectron,
  bindSessionSetupDownloadCleanup,
  SETUP_EXE_RE,
  SETUP_BLOCKMAP_RE,
  cmpSemver,
};
