'use strict';

/**
 * Yönetici › Kayıt İstatistikleri opens in its own frameless window (3.0.0, mockup 25).
 * The renderer calls window.open('/admin/signup-stats'); main.cjs's setWindowOpenHandler
 * asks isSignupStatsUrl() and allows only that app-origin route, everything else keeps
 * going to the browser. Pure helpers, tested by adminStatsWindow.selftest.mjs.
 */

const STATS_PATH = '/admin/signup-stats';

function isSignupStatsUrl(url, { isDev = false } = {}) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch (_) {
    return false;
  }
  const appOrigin = (u.protocol === 'descall:' && u.host === 'app') || (isDev && u.origin === 'http://localhost:5173');
  return appOrigin && u.pathname.replace(/\/+$/, '') === STATS_PATH && !u.username && !u.password;
}

/** BrowserWindow options: 1240×856 like the mockup, same frameless chrome as the main window. */
function signupStatsWindowOptions({ preload, icon, platform = process.platform } = {}) {
  return {
    width: 1240,
    height: 856,
    minWidth: 900,
    minHeight: 620,
    show: true,
    frame: false,
    title: 'Kayıt İstatistikleri — Descall Yönetici',
    autoHideMenuBar: true,
    fullscreenable: false,
    backgroundColor: '#14151e',
    ...(platform === 'darwin' ? { titleBarStyle: 'hidden' } : {}),
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload,
    },
  };
}

module.exports = { STATS_PATH, isSignupStatsUrl, signupStatsWindowOptions };
