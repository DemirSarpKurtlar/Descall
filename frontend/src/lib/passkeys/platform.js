/**
 * Which passkey path runs here (lib/passkeys/index.js routes every call through it):
 *
 *   ios      Capacitor iOS app: DescallPasskey plugin (ASAuthorizationPlatformPublicKey-
 *            CredentialProvider, iOS 16+). The WKWebView origin is capacitor://localhost,
 *            so in-page WebAuthn cannot use rp id descall.com.
 *   android  Capacitor Android app: DescallPasskey plugin (androidx.credentials, Android 9+).
 *   tauri    Rust / Tauri desktop app on Windows 10 1903+: the passkey_* commands call
 *            webauthn.dll with rp id descall.com (Windows Hello inside the app).
 *   handoff  Electron app, or the Tauri app where webauthn.dll is missing: the ceremony runs
 *            in the default browser at https://descall.com/passkey/desktop and the app
 *            collects the result (lib/passkeys/handoff.js).
 *   web      a browser on descall.com (or a subdomain), with WebAuthn.
 *   null     no passkeys here (other hosts such as previews, insecure context, old browser).
 *
 * Pure: everything it reads comes from `env` (tests pass a fake window).
 */

export const PASSKEY_RP_ID = "descall.com";

function capacitorPlatform(win) {
  try {
    const cap = win?.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
    return typeof cap.getPlatform === "function" ? cap.getPlatform() : null;
  } catch {
    return null;
  }
}

function isTauri(win) {
  try {
    if (win?.__TAURI_INTERNALS__ && typeof win.__TAURI_INTERNALS__ === "object") return true;
    return win?.electronAPI?.isTauri === true;
  } catch {
    return false;
  }
}

function isDesktopBridge(win) {
  try {
    return Boolean(win?.electronAPI) || isTauri(win);
  } catch {
    return false;
  }
}

/** True when this page's host may use `rpId` (same host or a subdomain). */
export function hostMatchesRpId(hostname, rpId = PASSKEY_RP_ID) {
  const h = String(hostname || "").toLowerCase();
  const r = String(rpId || "").toLowerCase();
  return Boolean(h && r) && (h === r || h.endsWith(`.${r}`));
}

export function webAuthnSupported(win) {
  try {
    return Boolean(win?.isSecureContext && win.PublicKeyCredential && win.navigator?.credentials && typeof win.navigator.credentials.get === "function");
  } catch {
    return false;
  }
}

/**
 * @param {Window} [win]
 * @param {object} [opts] { rpId }
 * @returns {"ios"|"android"|"tauri"|"handoff"|"web"|null}
 */
export function detectPasskeyPath(win = typeof window !== "undefined" ? window : undefined, { rpId = PASSKEY_RP_ID } = {}) {
  if (!win) return null;
  const cap = capacitorPlatform(win);
  if (cap === "ios") return "ios";
  if (cap === "android") return "android";
  if (cap) return null;
  if (isTauri(win)) {
    const api = win.electronAPI;
    return api && typeof api.passkeyCreate === "function" && typeof api.passkeyGet === "function" ? "tauri" : "handoff";
  }
  if (isDesktopBridge(win)) return "handoff";
  if (!webAuthnSupported(win)) return null;
  return hostMatchesRpId(win.location?.hostname, rpId) ? "web" : null;
}

/** Platform label the server stores with a passkey / a sign-in. */
export function serverPlatformFor(path, win = typeof window !== "undefined" ? window : undefined) {
  switch (path) {
    case "ios":
      return "ios";
    case "android":
      return "android";
    case "tauri":
      return "windows";
    case "handoff":
      return isTauri(win) ? "windows" : "electron";
    default:
      return "web";
  }
}
