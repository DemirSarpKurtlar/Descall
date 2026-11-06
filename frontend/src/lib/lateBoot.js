/**
 * Work that can wait until after first paint, in its own chunk so the marketing first-paint
 * bundle stays inside its budget: the desktop app's smooth Ctrl + wheel zoom, and (after 3 s)
 * reporting of uncaught errors to admin > Error logs.
 */
export function lateBoot() {
  if (window.electronAPI?.zoom) {
    import("./smoothZoom.js").then((m) => m.installSmoothZoom()).catch(() => {});
  }
  window.setTimeout(() => {
    import("../utils/errorHandler.js").then((m) => m.installGlobalErrorReporting()).catch(() => {});
  }, 3000);
}
