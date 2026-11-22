// node src/lib/sentryShell.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { desktopShellTag, isDesktopDevOrigin, isLocalHost, isPackagedTauriOrigin } from "./sentryShell.js";

// The packaged Tauri app reports errors (it used to count as a dev origin: *.localhost).
assert.equal(isPackagedTauriOrigin("https:", "tauri.localhost"), true);
assert.equal(isPackagedTauriOrigin("https:", "TAURI.localhost"), true);
assert.equal(isDesktopDevOrigin("https:", "tauri.localhost"), false);
assert.equal(isLocalHost("tauri.localhost"), true, "still a local host name for the web rule");

// Dev runs of either shell stay off.
assert.equal(isDesktopDevOrigin("http:", "localhost"), true);
assert.equal(isDesktopDevOrigin("http:", "127.0.0.1"), true);
// Packaged Electron (descall://app) reports.
assert.equal(isDesktopDevOrigin("descall:", "app"), false);
// Other *.localhost hosts are not the Tauri app.
assert.equal(isPackagedTauriOrigin("https:", "descall-shell.localhost"), false);
assert.equal(isDesktopDevOrigin("https:", "descall-shell.localhost"), true);

assert.equal(desktopShellTag({ isElectron: true, isTauri: true }), "tauri");
assert.equal(desktopShellTag({ isElectron: true }), "electron");
assert.equal(desktopShellTag(undefined), null);
assert.equal(desktopShellTag({}), null);

// sentry.js uses the shared rule (not its own *.localhost check) for desktop shells.
const src = readFileSync(new URL("./sentry.js", import.meta.url), "utf8");
assert.match(src, /isDesktopDevOrigin\(/, "sentry.js must use isDesktopDevOrigin for desktop shells");
assert.match(src, /desktopShell:/, "sentry.js tags the desktop shell kind");

console.log("sentryShell selftest: ok");
