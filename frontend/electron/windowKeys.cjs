'use strict';

/**
 * Window keyboard shortcuts (F11 maximize, F12 / Ctrl+Shift+I DevTools), bound per window
 * with webContents 'before-input-event'. Before the polish pass they were globalShortcut
 * registrations: OS-wide, so F11 in a browser or F12 in an editor went to Descall (and F11
 * popped a tray-hidden window up maximized). Pure parts are tested by windowKeys.selftest.mjs.
 *
 * DevTools in a packaged build: off unless userData/devtools-enabled exists (support opt-in).
 * The console runs in the trusted app origin, where the session token is reachable over IPC,
 * so "paste this into the console" self-XSS must not work for ordinary users.
 */

const DEVTOOLS_OPT_IN_FILE = 'devtools-enabled';

/**
 * 'maximize' | 'devtools' | null for an Electron before-input-event `input`.
 * Only keyDown, never auto-repeat, and never with Alt (AltGr layouts).
 */
function windowKeyAction(input, { platform = process.platform } = {}) {
  if (!input || input.type !== 'keyDown' || input.isAutoRepeat || input.alt) return null;
  const key = String(input.key || '');
  const code = String(input.code || '');
  const mod = platform === 'darwin' ? Boolean(input.meta) : Boolean(input.control);
  if ((key === 'F11' || code === 'F11') && !mod && !input.shift) return 'maximize';
  if ((key === 'F12' || code === 'F12') && !mod && !input.shift) return 'devtools';
  if (mod && input.shift && (code === 'KeyI' || key.toLowerCase() === 'i')) return 'devtools';
  return null;
}

/** DevTools allowed: always in a dev run, in a packaged build only with the opt-in file. */
function devToolsAllowed({ isPackaged, userDataDir, existsSync }) {
  if (!isPackaged) return true;
  if (!userDataDir || typeof existsSync !== 'function') return false;
  try {
    return Boolean(existsSync(require('path').join(userDataDir, DEVTOOLS_OPT_IN_FILE)));
  } catch (_) {
    return false;
  }
}

/**
 * Binds the shortcuts on one window. onMaximize(win) toggles maximize; DevTools toggle only
 * when allowDevTools. The event is consumed only for a key that was handled.
 */
function bindWindowKeys(win, { onMaximize, allowDevTools = false, platform = process.platform } = {}) {
  if (!win || !win.webContents) return;
  win.webContents.on('before-input-event', (event, input) => {
    const action = windowKeyAction(input, { platform });
    if (action === 'maximize' && typeof onMaximize === 'function') {
      event.preventDefault();
      onMaximize(win);
    } else if (action === 'devtools' && allowDevTools) {
      event.preventDefault();
      try { win.webContents.toggleDevTools(); } catch (_) { /* window gone */ }
    }
  });
}

module.exports = { DEVTOOLS_OPT_IN_FILE, windowKeyAction, devToolsAllowed, bindWindowKeys };
