/** True inside the Capacitor iOS / Android shell (Electron and browsers → false). */
export function isNativeMobileApp() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}
