/**
 * Run: node frontend/src/lib/heardAbout.selftest.mjs
 * "How did you hear about us?" is asked once after every kind of sign-up and never
 * blocks the app; every sign-up request says which app it came from and which invite
 * is waiting (lib/signupContext.js).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEARD_ABOUT_OPTIONS,
  HEARD_ABOUT_TTL_MS,
  clearHeardAboutPending,
  hasHeardAboutPendingFlag,
  isHeardAboutPending,
  markHeardAboutPending,
} from "./heardAbout.js";
import { signupClientPlatform, signupInviteCode, withSignupContext } from "./signupContext.js";
import { savePendingLanding, savePendingServerInvite } from "./serverInviteRoute.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// --- pending flag ---------------------------------------------------------------
const storage = memoryStorage();
const now = 1_800_000_000_000;
assert.equal(hasHeardAboutPendingFlag({ storage }), false);
assert.equal(isHeardAboutPending("u1", { storage, now }), false);
markHeardAboutPending("u1", { storage, now });
assert.equal(hasHeardAboutPendingFlag({ storage }), true);
assert.equal(isHeardAboutPending("u1", { storage, now: now + 1000 }), true);
assert.equal(isHeardAboutPending("u2", { storage, now: now + 1000 }), false, "another account on the device is not asked");
assert.equal(isHeardAboutPending("u1", { storage, now: now + HEARD_ABOUT_TTL_MS + 1 }), false, "stale question dropped");
assert.equal(hasHeardAboutPendingFlag({ storage }), false);
markHeardAboutPending(null, { storage, now });
assert.equal(isHeardAboutPending("anyone", { storage, now }), true, "unknown id at sign-up: the next signed-in user");
clearHeardAboutPending({ storage });
assert.equal(hasHeardAboutPendingFlag({ storage }), false);

// Same answers as the server (backend lib/signupStats.js HEARD_ABOUT_KEYS).
const stats = readFileSync(join(here, "..", "..", "backend", "lib", "signupStats.js"), "utf8");
const serverKeys = JSON.parse(stats.match(/const HEARD_ABOUT_KEYS = (\[[^\]]*\]);/)[1]);
assert.deepEqual(HEARD_ABOUT_OPTIONS, serverKeys);

// --- sign-up context --------------------------------------------------------------
assert.equal(signupClientPlatform(null), "web");
assert.equal(signupClientPlatform({ electronAPI: { isElectron: true } }), "electron");
const cap = (platform, ua, maxTouchPoints = 0) => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => platform },
  navigator: { userAgent: ua, maxTouchPoints },
});
assert.equal(signupClientPlatform(cap("ios", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")), "ios");
assert.equal(signupClientPlatform(cap("ios", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)), "ipad");
assert.equal(signupClientPlatform(cap("android", "Mozilla/5.0 (Linux; Android 14)")), "android");
assert.equal(signupClientPlatform({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" }, navigator: {} }), "web");

const inv = memoryStorage();
assert.equal(signupInviteCode({ storage: inv }), "");
savePendingLanding("group", "grp_123", { storage: inv });
assert.equal(signupInviteCode({ storage: inv }), "group:grp_123");
savePendingLanding("vanity", "my-server", { storage: inv });
assert.equal(signupInviteCode({ storage: inv }), "vanity:my-server");
savePendingServerInvite("AbCd1234", { storage: inv });
assert.equal(signupInviteCode({ storage: inv }), "server:AbCd1234", "a server invite wins");
const ctx = withSignupContext({ username: "a" }, { win: { electronAPI: { isElectron: true } }, storage: inv });
assert.deepEqual(ctx, { username: "a", clientPlatform: "electron", inviteCode: "server:AbCd1234" });
assert.equal(withSignupContext({ clientPlatform: "ios", inviteCode: "group:x1" }, { win: null, storage: inv }).inviteCode, "group:x1", "given values stay");

// --- wiring -------------------------------------------------------------------------
const api = src("api/auth.js");
assert.equal((api.match(/withSignupContext\(/g) || []).length, 3, "register, Google and Apple carry the context");
const app = src("App.jsx");
assert.match(app, /<HeardAboutPrompt userId=\{me\.id\} \/>/);
assert.equal((app.match(/markHeardAboutPending\(/g) || []).length, 2, "App: password + Google/Apple sign-ups");
const boot = src("site/MarketingBoot.jsx");
assert.equal((boot.match(/markHeardAboutPending\(/g) || []).length, 3, "web: register, register+login, Google");
const prompt = src("components/HeardAboutPrompt.jsx");
// Owner decision (2026-11-13): a centred, themed popup over a scrim instead of a corner card.
// It stays optional: skip, close, Escape and a backdrop click all end it without an answer.
assert.match(prompt, /aria-modal="true"/, "popup dialog");
assert.match(prompt, /className="heard-about-scrim"[^>]*onClick=\{\(\) => finish\("skipped"\)\}/, "backdrop click skips");
assert.match(prompt, /e\.key === "Escape"[\s\S]{0,60}finish\("skipped"\)/, "Escape skips");
assert.ok((prompt.match(/finish\("skipped"\)/g) || []).length >= 4, "skip, close, Escape, backdrop");
const css = src("components/HeardAboutPrompt.css");
assert.match(css, /@media \(max-width: 640px\)[\s\S]*border-radius: 28px 28px 0 0/, "bottom sheet on phones");
assert.match(css, /prefers-reduced-motion: reduce/, "reduced motion");
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) assert.match(m[1], /^var\(--fs-(11|12|13|15|17|20|28)\)$/, `type scale: ${m[1]}`);

console.log("heardAbout.selftest.mjs: ok");
