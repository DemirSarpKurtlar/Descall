'use strict';

/**
 * Windows toast identity for native notifications (quick_reply).
 *
 * APP_USER_MODEL_ID must equal package.json build.appId: electron-builder's
 * NSIS script writes it on the Start Menu shortcut (WinShell::SetLnkAUMI).
 * TOAST_CLSID is fixed forever: electron/installer.nsh writes the same value
 * as the shortcut's System.AppUserModel.ToastActivatorCLSID and registers it
 * under HKCU\Software\Classes\CLSID\{...}\LocalServer32 for cold starts.
 * Changing it breaks reply activation for every installed copy.
 */

const APP_USER_MODEL_ID = 'com.descall.app';
const TOAST_CLSID = '{BCF5A315-F914-4A7E-95BD-313CBE4B661B}';

let ready = false;

/** Call once, early in main (before any notification). Windows only. */
function applyToastIdentity(app, { platform = process.platform, log = console } = {}) {
  if (platform !== 'win32' || !app) return false;
  try {
    app.setAppUserModelId(APP_USER_MODEL_ID);
    if (typeof app.setToastActivatorCLSID === 'function') app.setToastActivatorCLSID(TOAST_CLSID);
    // The shortcut with these properties only exists in an installed build.
    // The portable build has no shortcut (electron-builder sets PORTABLE_EXECUTABLE_DIR).
    ready = Boolean(app.isPackaged) && !process.env.PORTABLE_EXECUTABLE_DIR;
  } catch (err) {
    ready = false;
    log.warn('[toast] identity setup failed:', err?.message || err);
  }
  return ready;
}

function toastIdentityReady() {
  return ready;
}

module.exports = { APP_USER_MODEL_ID, TOAST_CLSID, applyToastIdentity, toastIdentityReady };
