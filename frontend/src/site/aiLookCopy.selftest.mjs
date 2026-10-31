// Guards the 2026-10-19 "looks AI-made" copy pass. Run: node src/site/aiLookCopy.selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAppleMobileUa, APP_STORE_URL } from "./appStoreLink.js";
import tr from "../i18n/locales/tr.js";
import { MARKETING_TR } from "./marketingPhrases.tr.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

assert.ok(isAppleMobileUa("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"));
assert.ok(isAppleMobileUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), "iPadOS desktop UA");
assert.ok(!isAppleMobileUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0));
assert.ok(!isAppleMobileUa("Mozilla/5.0 (Linux; Android 14)"));
assert.match(APP_STORE_URL, /^https:\/\/apps\.apple\.com\/app\/id\d+$/);

const dl = read("components/download/DownloadPage.jsx");
for (const bad of ["10K+", "\"4.9\"", "50+", "unlimited", "ultimate", "Crystal clear", "End-to-End", "gradient-text"]) {
  assert.ok(!dl.includes(bad), `DownloadPage still has ${bad}`);
}
const home = read("site/pages/HomePage.jsx");
assert.ok(!home.includes('{t("Download")} {t("Desktop")}'), "hero joins two translations");
assert.ok(home.includes("APP_STORE_URL"));
assert.ok(read("site/MarketingLayout.jsx").includes("APP_STORE_URL"), "sticky bar App Store");
assert.ok(!read("components/VoiceEffectsPanel.jsx").includes("Powered by"));
assert.ok(!read("site/pages/WhoOwnsDescallPage.jsx").includes('tr ? "Keep exploring" : "Keep exploring"'));
assert.ok(read("components/activity/ActivitySidebar.jsx").includes("STATUS_META["), "activity row shows real status");

const P = tr.phrases;
assert.equal(P["Forgot your password?"], "Şifreni mi unuttun?");
assert.equal(MARKETING_TR["Forgot your password?"], "Şifreni mi unuttun?");
assert.equal(P["By continuing, you agree to our Terms of Service"], "Devam ederek Hizmet Şartları'nı kabul etmiş olursun");
assert.equal(P["Do Not Disturb"], "Rahatsız Etmeyin");
assert.equal(P["Download the desktop app"], "Masaüstü uygulamasını indir");
for (const k of ["Available", "Sleeping", "Layout", "Toggle mute", "Developer", "Korea"]) assert.notEqual(P[k], k, `${k} untranslated`);
assert.ok(!("Welcome Back" in P) && !("Get Started" in P), "duplicate-case keys");
console.log("aiLookCopy.selftest.mjs: ok");
