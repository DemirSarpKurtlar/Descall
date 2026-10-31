'use strict';

/**
 * Yönetici › Kayıt İstatistikleri opens in its own frameless window (3.0.0, mockup 25).
 * The renderer calls window.open('/admin/signup-stats'); main.cjs's setWindowOpenHandler
 * asks isSignupStatsUrl() and allows only that app-origin route, everything else keeps
 * going to the browser. Pure helpers, tested by adminStatsWindow.selftest.mjs.
 */

const { et } = require('./mainI18n.cjs');

const STATS_PATH = '/admin/signup-stats';
/** 3.1: the whole Yönetici Paneli opens in its own window; the main window stays usable. */
const ADMIN_PANEL_PATH = '/admin/panel';

function isAppRoute(url, routePath, { isDev = false } = {}) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch (_) {
    return false;
  }
  const appOrigin = (u.protocol === 'descall:' && u.host === 'app') || (isDev && u.origin === 'http://localhost:5173');
  return appOrigin && u.pathname.replace(/\/+$/, '') === routePath && !u.username && !u.password;
}

function isSignupStatsUrl(url, opts = {}) {
  return isAppRoute(url, STATS_PATH, opts);
}

function isAdminPanelUrl(url, opts = {}) {
  return isAppRoute(url, ADMIN_PANEL_PATH, opts);
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
    title: et('window.signupStats'),
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

/** Yönetici Paneli window: 1440×900 like the approved mockup, same frameless chrome. */
function adminPanelWindowOptions({ preload, icon, platform = process.platform } = {}) {
  return {
    ...signupStatsWindowOptions({ preload, icon, platform }),
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: et('window.adminPanel'),
  };
}

module.exports = {
  STATS_PATH,
  ADMIN_PANEL_PATH,
  isSignupStatsUrl,
  isAdminPanelUrl,
  signupStatsWindowOptions,
  adminPanelWindowOptions,
};
