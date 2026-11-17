/**
 * Run: node frontend/src/lib/aasa.selftest.mjs
 * Every https link the iOS app routes (deepLinks.js) must be claimed by
 * public/.well-known/apple-app-site-association, or iOS opens Safari instead
 * of the app (group invites /invite/<code>, /i/<code> and vanity /s/<slug>
 * used to be missing).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDeepLink, HOME_PATH } from "./deepLinks.js";

const here = dirname(fileURLToPath(import.meta.url));
const aasa = JSON.parse(readFileSync(join(here, "../../public/.well-known/apple-app-site-association"), "utf8"));
const details = aasa?.applinks?.details || [];
assert.ok(details.length > 0, "AASA has applinks details");
assert.ok(details.every((d) => Array.isArray(d.appIDs) && d.appIDs.includes("Q9R78TPNXS.com.descall.app")), "AASA names the app");

const patterns = details.flatMap((d) => d.components || []).filter((c) => !c.exclude).map((c) => c["/"]);
const toRe = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
const claimed = (path) => patterns.some((p) => toRe(p).test(path));

const ROUTED = [
  "/app/whats-new",
  "/direct",
  "/direct/ayse",
  "/groups",
  "/groups/g-1",
  "/servers",
  "/servers/s-1",
  "/servers/s-1/c-1",
  "/servers/join/AbCd12",
  "/invite/s/AbCd12",
  "/invite/AbC123",
  "/i/AbC123",
  "/s/my-clan",
  "/friends",
  "/calls",
  "/activity",
  "/settings",
  "/settings/profile",
];
for (const path of ROUTED) {
  const link = resolveDeepLink(`https://descall.com${path}`);
  assert.ok(link?.path, `${path} resolves in the app`);
  if (path !== "/direct") assert.notEqual(link.path, HOME_PATH, `${path} routes somewhere specific`);
  assert.ok(claimed(path), `${path} is claimed by the AASA file`);
}

// Public-only pages must stay in the browser.
for (const path of ["/", "/login", "/register", "/download", "/legal/privacy"]) {
  assert.equal(claimed(path), false, `${path} stays on the web`);
}

console.log("aasa selftest OK");
