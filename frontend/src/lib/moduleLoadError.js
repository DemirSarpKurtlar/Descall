/**
 * Vite/Safari chunk-load failures after deploy or route changes.
 * iOS Safari reports: "Importing a module script failed."
 */
export function isModuleLoadError(error) {
  const message = String(error?.message || error || "");
  const name = String(error?.name || "");
  if (/importing a module script failed/i.test(message)) return true;
  if (/failed to fetch dynamically imported module/i.test(message)) return true;
  if (/error loading dynamically imported module/i.test(message)) return true;
  if (/loading chunk [\w-]+ failed/i.test(message)) return true;
  if (/unable to preload css/i.test(message)) return true;
  if (name === "ChunkLoadError") return true;
  return false;
}

const RELOAD_KEY = "descall_module_reload";

export function recoverFromModuleLoadError() {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* private mode — still try a single reload */
  }
  try {
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function clearModuleLoadRecovery() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
