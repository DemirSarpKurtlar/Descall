import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isGoogleSignInOffered } from "./googleSignInOffer.js";

const here = dirname(fileURLToPath(import.meta.url));

assert.equal(isGoogleSignInOffered({}), true, "web offers Google");
assert.equal(
  isGoogleSignInOffered({ electronAPI: { isElectron: true } }),
  false,
  "Electron hides Google (descall:// cannot load GIS)"
);
assert.equal(
  isGoogleSignInOffered({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    },
  }),
  false,
  "iOS keeps Sign in with Apple only"
);
assert.equal(
  isGoogleSignInOffered({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android",
    },
  }),
  true,
  "Android still offers Google"
);

const button = readFileSync(join(here, "../components/auth/GoogleSignInButton.jsx"), "utf8");
assert.match(button, /isGoogleSignInOffered/);
assert.doesNotMatch(button, /err\.message/);
assert.match(button, /Could not load Google sign-in/);

const tr = readFileSync(join(here, "../i18n/locales/tr.js"), "utf8");
assert.match(tr, /Could not load Google sign-in\. You can still sign in with your username and password\./);
assert.match(tr, /Google ile giriş yüklenemedi/);

console.log("googleSignInOffer.selftest ok");
