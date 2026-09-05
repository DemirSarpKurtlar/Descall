'use strict';

/**
 * Riot Sign-On (RSO) OAuth via in-app BrowserWindow (Electron).
 * Primary Companion auth path — opens auth.riotgames.com; never asks for password.
 * Lockfile remains optional (see riotLocalAuth.cjs).
 */

const { BrowserWindow, ipcMain, shell } = require('electron');

let authWindow = null;

function isAllowedAuthNavigation(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'auth.riotgames.com' || host.endsWith('.riotgames.com')) return true;
    if (host === 'authenticate.riotgames.com') return true;
    if (host === 'des-call.onrender.com' || host.endsWith('.onrender.com')) return true;
    if (host === 'descall.com' || host === 'www.descall.com') return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    return false;
  } catch {
    return false;
  }
}

function parseRiotLinkResult(url) {
  try {
    const u = new URL(url);
    const status = u.searchParams.get('riot_link');
    if (!status) return null;
    return {
      status,
      reason: u.searchParams.get('reason') || '',
      url,
    };
  } catch {
    return null;
  }
}

function closeAuthWindow() {
  try {
    if (authWindow && !authWindow.isDestroyed()) authWindow.close();
  } catch {
    /* ignore */
  }
  authWindow = null;
}

/**
 * @param {() => import('electron').BrowserWindow | null} getMainWindow
 */
function registerRiotRsoAuthIPC(getMainWindow) {
  ipcMain.handle('valorant:rso-open', async (_evt, payload = {}) => {
    const url = String(payload?.url || '').trim();
    if (!url.startsWith('https://auth.riotgames.com/')) {
      return { ok: false, error: 'Invalid Riot Sign-On URL (expected auth.riotgames.com)' };
    }

    closeAuthWindow();

    const parent = typeof getMainWindow === 'function' ? getMainWindow() : null;
    authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: false,
      show: true,
      autoHideMenuBar: true,
      title: 'Riot Sign-On — Descall',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const finish = (result) => {
      try {
        const main = typeof getMainWindow === 'function' ? getMainWindow() : null;
        if (main && !main.isDestroyed()) {
          main.webContents.send('valorant:rso-result', result);
          main.focus();
        }
      } catch {
        /* ignore */
      }
      closeAuthWindow();
    };

    const maybeFinishFromUrl = (navUrl) => {
      const parsed = parseRiotLinkResult(navUrl);
      if (!parsed) return false;
      if (parsed.status === 'success') {
        finish({ ok: true, status: 'success' });
        return true;
      }
      finish({
        ok: false,
        status: 'error',
        error: parsed.reason || 'Riot Sign-On failed',
      });
      return true;
    };

    authWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
      if (isAllowedAuthNavigation(openUrl)) {
        authWindow.loadURL(openUrl).catch(() => {});
      } else {
        shell.openExternal(openUrl).catch(() => {});
      }
      return { action: 'deny' };
    });

    authWindow.webContents.on('will-navigate', (event, navUrl) => {
      if (maybeFinishFromUrl(navUrl)) {
        event.preventDefault();
        return;
      }
      if (!isAllowedAuthNavigation(navUrl)) {
        event.preventDefault();
        shell.openExternal(navUrl).catch(() => {});
      }
    });

    authWindow.webContents.on('will-redirect', (event, navUrl) => {
      if (maybeFinishFromUrl(navUrl)) {
        event.preventDefault();
      }
    });

    authWindow.webContents.on('did-navigate', (_event, navUrl) => {
      maybeFinishFromUrl(navUrl);
    });

    authWindow.webContents.on('did-navigate-in-page', (_event, navUrl) => {
      maybeFinishFromUrl(navUrl);
    });

    authWindow.on('closed', () => {
      authWindow = null;
    });

    try {
      await authWindow.loadURL(url);
      return { ok: true, mode: 'browserWindow' };
    } catch (err) {
      closeAuthWindow();
      // Fallback: system browser (user returns via web redirect toast flow)
      try {
        await shell.openExternal(url);
        return { ok: true, mode: 'external' };
      } catch (err2) {
        return {
          ok: false,
          error: err2?.message || err?.message || 'Failed to open Riot Sign-On',
        };
      }
    }
  });

  ipcMain.handle('valorant:rso-cancel', async () => {
    closeAuthWindow();
    return { ok: true };
  });
}

module.exports = {
  registerRiotRsoAuthIPC,
  closeAuthWindow,
};
