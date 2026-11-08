import { Capacitor, registerPlugin } from "@capacitor/core";
import { resolveDeepLink } from "./deepLinks.js";

/**
 * 3.0.1: iOS deep links, Android App Links too. DescallDeepLinkPlugin (.swift on
 * iOS, .java on Android, same API) keeps the last opened descall:// or
 * https://descall.com URL (a cold start delivers it before the web app is
 * loaded) and fires "url"; we take it, resolve it with resolveDeepLink and hand
 * the in-app path to the router. takePending clears the URL natively, so the
 * event and the startup read never route it twice.
 * Web, Electron and older native builds without the plugin: no-op.
 */

const IS_NATIVE_SHELL =
  typeof window !== "undefined" &&
  Capacitor.isNativePlatform() &&
  ["ios", "android"].includes(Capacitor.getPlatform());

let plugin = null;

function nativePlugin() {
  if (!IS_NATIVE_SHELL) return null;
  if (!plugin) plugin = registerPlugin("DescallDeepLink");
  return plugin;
}

export function startNativeDeepLinks(onPath) {
  const p = nativePlugin();
  if (!p || typeof onPath !== "function") return () => {};
  let stopped = false;
  let handle = null;

  const drain = async () => {
    if (stopped) return;
    try {
      const res = await p.takePending();
      const url = res?.url;
      // Once taken natively the URL is gone, so route it even if this
      // listener was just torn down (StrictMode remount).
      if (!url) return;
      const link = resolveDeepLink(url);
      if (link?.path) onPath(link.path);
    } catch {
      /* older build without the plugin */
    }
  };

  Promise.resolve()
    .then(() => p.addListener("url", () => { drain(); }))
    .then((h) => {
      if (stopped) h?.remove?.();
      else handle = h;
    })
    .catch(() => {});
  drain();

  return () => {
    stopped = true;
    try {
      handle?.remove?.();
    } catch {
      /* ignore */
    }
  };
}
