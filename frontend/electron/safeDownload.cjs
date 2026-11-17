'use strict';

/**
 * download-file IPC: the renderer names the file, main writes it into Downloads.
 * Before, path.join(downloads, filename) took the name as is, so
 * "..\\..\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\x.bat"
 * wrote outside Downloads. Pure, tested by safeDownload.selftest.mjs.
 */
const path = require('path');

const MAX_NAME_LENGTH = 180;
const MAX_EXT_LENGTH = 16;
const FALLBACK_NAME = 'download';
// CON, PRN, AUX, NUL, COM0-9, LPT0-9 (plus the superscript digits Windows also reserves),
// with or without an extension, any case.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/**
 * Basename only, no reserved or control characters, no Windows device names,
 * no leading dots, no trailing dots or spaces, at most MAX_NAME_LENGTH characters
 * (the extension is kept when it is short). Never empty.
 */
function sanitizeDownloadFilename(name) {
  let s = String(name == null ? '' : name);
  try { s = s.normalize('NFC'); } catch (_) { /* keep as is */ }
  // Basename: the last segment for either separator, whatever platform main runs on.
  s = s.split(/[\\/]/).pop() || '';
  // Reserved on Windows (<>:"/\|?*) and control characters (C0, DEL, C1).
  s = s.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_');
  // Bidi overrides and zero-width characters can disguise the real extension.
  s = s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
  s = s.trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (!s) return FALLBACK_NAME;
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  if (s.length > MAX_NAME_LENGTH) {
    const ext = path.extname(s);
    if (ext && ext.length <= MAX_EXT_LENGTH) {
      s = s.slice(0, MAX_NAME_LENGTH - ext.length).replace(/[. ]+$/, '') + ext;
    } else {
      s = s.slice(0, MAX_NAME_LENGTH).replace(/[. ]+$/, '');
    }
  }
  return s || FALLBACK_NAME;
}

/**
 * Absolute destination for a renderer-named download: always a direct child of dir.
 * Throws if the result would not be (it cannot after sanitizing; this is the second lock).
 */
function resolveDownloadPath(dir, name) {
  const base = path.resolve(String(dir || ''));
  const safe = sanitizeDownloadFilename(name);
  const filePath = path.resolve(base, safe);
  if (path.dirname(filePath) !== base || path.basename(filePath) !== safe) {
    throw new Error('download path escapes the downloads folder');
  }
  return { filePath, name: safe };
}

/**
 * "name.ext" → "name (1).ext", "name (2).ext", … while `exists(path)` says the file is taken,
 * so a download never silently overwrites a file the user already has.
 */
function uniqueDownloadPath(filePath, exists) {
  if (typeof exists !== 'function' || !exists(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = path.join(dir, `${base} (${i})${ext}`);
    if (!exists(candidate)) return candidate;
  }
  return path.join(dir, `${base} (${Date.now()})${ext}`);
}

/** Only http(s) URLs are fetched for download-file. */
function isDownloadableUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch (_) {
    return false;
  }
}

module.exports = {
  MAX_NAME_LENGTH,
  sanitizeDownloadFilename,
  resolveDownloadPath,
  uniqueDownloadPath,
  isDownloadableUrl,
};
