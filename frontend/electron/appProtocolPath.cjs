'use strict';

/**
 * descall://app/… → file under dist/ (2.13.1). Pure, tested by appProtocolPath.selftest.mjs.
 *
 * The Electron build uses Vite base "./", so index.html asks for ./assets/index-*.js and
 * ./brand/*.svg relative to the page URL. The app uses real routes (BrowserRouter), so a
 * reload on descall://app/settings/shop requested descall://app/settings/assets/… and
 * descall://app/settings/brand/…: the JS never loaded (the boot splash hung on "Sunucuya
 * bağlanılıyor…") and both splash logos were broken images. A path with a file extension
 * that does not exist is now retried with its leading route segments dropped, so
 * /settings/assets/x.js → /assets/x.js. Paths never leave dist/ (403).
 */
const path = require('path');

function safeDecode(p) {
  try { return decodeURIComponent(p); } catch (_) { return p; }
}

/**
 * root: dist directory. pathname: URL pathname ('/settings/shop', '/settings/assets/a.js').
 * exists(absPath) → boolean. Returns { filePath, forbidden, spa, rewritten }.
 */
function resolveDistFile(root, pathname, exists) {
  const rootAbs = path.resolve(root);
  const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
  const inside = (p) => p === rootAbs || p.startsWith(rootPrefix);
  let rel = safeDecode(String(pathname || '/'));
  if (!rel || rel === '/') rel = '/index.html';
  // SPA route (descall://app/direct …): serve the app document (2.11.11).
  if (!path.posix.extname(rel)) {
    return { filePath: path.join(rootAbs, 'index.html'), forbidden: false, spa: true, rewritten: false };
  }
  const direct = path.resolve(rootAbs, '.' + path.posix.normalize('/' + rel.replace(/\\/g, '/')));
  if (!inside(direct) || /(^|[\\/])\.\.([\\/]|$)/.test(rel)) {
    return { filePath: direct, forbidden: true, spa: false, rewritten: false };
  }
  if (exists(direct)) return { filePath: direct, forbidden: false, spa: false, rewritten: false };
  const segments = rel.split('/').filter(Boolean);
  for (let i = 1; i < segments.length; i += 1) {
    const candidate = path.resolve(rootAbs, segments.slice(i).join('/'));
    if (inside(candidate) && exists(candidate)) {
      return { filePath: candidate, forbidden: false, spa: false, rewritten: true };
    }
  }
  return { filePath: direct, forbidden: false, spa: false, rewritten: false };
}

module.exports = { resolveDistFile };
