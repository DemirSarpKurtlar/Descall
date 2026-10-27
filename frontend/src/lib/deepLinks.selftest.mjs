/**
 * 3.0.1 deep links: descall:// scheme + https://descall.com universal links → in-app route.
 * Run: node src/lib/deepLinks.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDeepLink, isWhatsNewPath, HOME_PATH, WHATS_NEW_PATH } from "./deepLinks.js";
import { parseAppRoute, isAuthenticatedAppPath } from "./appRoutes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const p = (url) => resolveDeepLink(url)?.path ?? null;

// Custom scheme
const scheme = {
  "descall://": HOME_PATH,
  "descall://open": HOME_PATH,
  "descall://home": HOME_PATH,
  "descall://app": HOME_PATH,
  "DESCALL://OPEN": HOME_PATH,
  "descall://whats-new": WHATS_NEW_PATH,
  "descall://whatsnew": WHATS_NEW_PATH,
  "descall://yenilikler": WHATS_NEW_PATH,
  "descall://whats-new/": WHATS_NEW_PATH,
  "descall://whats-new?utm_source=appstore#x": WHATS_NEW_PATH,
  "descall:whats-new": WHATS_NEW_PATH,
  "descall:///whats-new": WHATS_NEW_PATH,
  "descall://app/whats-new": WHATS_NEW_PATH,
  "descall://dm/demir": "/direct/demir",
  "descall://direct/demir.sarp": "/direct/demir.sarp",
  "descall://dm": HOME_PATH,
  "descall://group/abc123": "/groups/abc123",
  "descall://groups": "/groups",
  "descall://server/42": "/servers/42",
  "descall://server/42/general": "/servers/42/general",
  "descall://servers": "/servers",
  "descall://friends": "/friends",
  "descall://calls": "/calls",
  "descall://activity": "/activity",
  "descall://settings": "/settings",
  "descall://settings/Appearance": "/settings/appearance",
  "descall://does-not-exist": HOME_PATH,
  "descall://dm/%C3%A7a%C4%9Fr%C4%B1": `/direct/${encodeURIComponent("çağrı")}`,
};
for (const [url, want] of Object.entries(scheme)) assert.equal(p(url), want, url);

// Sanitization: anything odd in an id falls back, never passes through raw.
for (const bad of [
  "descall://dm/..",
  "descall://dm/%2E%2E",
  "descall://dm/a%2Fb",
  "descall://dm/<script>",
  "descall://dm/%E0%A4%A",
  `descall://dm/${"a".repeat(65)}`,
]) {
  assert.equal(p(bad), HOME_PATH, `${bad} must open home`);
}
assert.equal(p("descall://server/42/..%2F..%2Fadmin"), "/servers/42", "bad channel dropped");
assert.equal(p(`descall://${"x".repeat(3000)}`), null, "over-long URLs rejected");

// Universal links
const universal = {
  "https://descall.com/app/whats-new": WHATS_NEW_PATH,
  "https://descall.com/app/whats-new?utm=1": WHATS_NEW_PATH,
  "https://www.descall.com/app/whats-new": WHATS_NEW_PATH,
  "https://DESCALL.com:443/app/whats-new": WHATS_NEW_PATH,
  "https://descall.com/": HOME_PATH,
  "https://descall.com": HOME_PATH,
  "https://descall.com/app": HOME_PATH,
  "https://descall.com/direct": HOME_PATH,
  "https://descall.com/direct/demir": "/direct/demir",
  "https://descall.com/groups/g1": "/groups/g1",
  "https://descall.com/servers/42/general": "/servers/42/general",
  "https://descall.com/friends": "/friends",
  "https://descall.com/settings/privacy": "/settings/privacy",
};
for (const [url, want] of Object.entries(universal)) assert.equal(p(url), want, url);

// Not ours → null (the app must not hijack these)
for (const foreign of [
  "",
  null,
  undefined,
  "whats-new",
  "http://descall.com/app/whats-new",
  "https://evil.com/app/whats-new",
  "https://descall.com.evil.com/app/whats-new",
  "https://descall.com@evil.com/app",
  "https://descall.com/blog/post",
  "https://descall.com/download",
  "javascript:alert(1)",
  "mailto:a@descall.com",
]) {
  assert.equal(resolveDeepLink(foreign), null, `${foreign} must not be routed`);
}

// Every path we produce is one the app router understands.
for (const url of [...Object.keys(scheme), ...Object.keys(universal)]) {
  const out = p(url);
  assert.ok(out.startsWith("/"), url);
  assert.ok(isAuthenticatedAppPath(out), `${out} must be an app path`);
  assert.equal(parseAppRoute(out).unknown, undefined, `${out} must not be an unknown route`);
}

// What's new landing route
assert.ok(isWhatsNewPath("/app/whats-new"));
assert.ok(isWhatsNewPath("/app/whats-new/"));
assert.ok(!isWhatsNewPath("/direct"));
assert.equal(parseAppRoute("/app/whats-new").whatsNew, true);
assert.equal(parseAppRoute("/app/whats-new").view, "chat");
assert.ok(isAuthenticatedAppPath("/app/whats-new"));

// apple-app-site-association: right app id, and every universal path resolves in-app.
const aasa = JSON.parse(fs.readFileSync(path.join(root, "public/.well-known/apple-app-site-association"), "utf8"));
const detail = aasa.applinks.details[0];
assert.deepEqual(detail.appIDs, ["Q9R78TPNXS.com.descall.app"]);
assert.ok(detail.components.length > 0);
for (const c of detail.components) {
  const sample = c["/"].replace("*", "x");
  const out = p(`https://descall.com${sample}`);
  assert.ok(out, `AASA path ${c["/"]} must resolve in the app`);
}
assert.ok(detail.components.some((c) => c["/"] === "/app/whats-new"));

// Native config: scheme + associated domain registered for the app.
const info = fs.readFileSync(path.join(root, "ios/App/App/Info.plist"), "utf8");
assert.match(info, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>descall<\/string>/);
for (const f of ["App.release.entitlements", "App.debug.entitlements"]) {
  const ent = fs.readFileSync(path.join(root, "ios/App/App", f), "utf8");
  assert.match(ent, /com\.apple\.developer\.associated-domains<\/key>\s*<array>\s*<string>applinks:descall\.com<\/string>/, f);
}

// 3.0 notes copy exists in both languages.
for (const loc of ["en", "tr"]) {
  const mod = await import(`../i18n/locales/${loc}.js`);
  const v300 = (mod.default?.nested || mod.nested).updateNotes.v300;
  assert.equal(typeof v300.title, "string", `${loc} title`);
  assert.equal(typeof v300.lead, "string", `${loc} lead`);
  for (let n = 1; n <= 9; n += 1) {
    assert.ok(v300[`n${n}`]?.title && v300[`n${n}`]?.body, `${loc} n${n}`);
  }
}

console.log("deepLinks selftest ok");
