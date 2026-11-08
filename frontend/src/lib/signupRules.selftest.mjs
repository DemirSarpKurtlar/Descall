/**
 * Run: node frontend/src/lib/signupRules.selftest.mjs
 * The register forms' as-you-type checks give the same verdict as the server
 * (backend/lib/signupRules.js, usernamePolicy.js, passwordPolicy.js), and every
 * message they show is translated in every live locale.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  usernameIssue,
  passwordIssue,
  emailIssue,
  signupMessage,
  usernameSuggestion,
  fieldOfCode,
  SIGNUP_MESSAGES,
} from "./signupRules.js";

process.env.SUPABASE_URL ||= "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder-key";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const server = require("../../backend/lib/signupRules.js");
const { RESERVED_USERNAMES } = require("../../backend/lib/usernamePolicy.js");

const usernames = ["", "a", " a ", "ab", "Ali.Veli_-9", "ali veli", "şükrü", "x".repeat(24), "x".repeat(25), "Admin", "SUPPORT", "here", "a@b", "ali!", "  bob  "];
for (const u of usernames) {
  assert.equal(usernameIssue(u), server.usernameIssue(u)?.code ?? null, `username ${JSON.stringify(u)}`);
}
for (const name of RESERVED_USERNAMES) assert.equal(usernameIssue(name), "username_reserved", `reserved list in sync: ${name}`);

for (const p of ["", "1234567", "12345678x", "x".repeat(72), "x".repeat(73)]) {
  const local = passwordIssue(p);
  const remote = server.passwordLengthCode(p);
  assert.equal(local === "password_breached" ? null : local, remote, `password length ${p.length}`);
}
assert.equal(passwordIssue("12345678"), "password_breached");
assert.equal(passwordIssue("Galatasaray"), "password_breached");
assert.equal(passwordIssue("aaaaaaaaaa"), "password_breached");
assert.equal(passwordIssue("kedi-balik-77"), null);

for (const e of ["", "  ", "a@b", "a@b.co", "a b@c.de", `${"x".repeat(250)}@a.co`]) {
  assert.equal(emailIssue(e), server.emailIssueCode(String(e).trim()), `email ${JSON.stringify(e)}`);
}

assert.equal(usernameSuggestion("Şükrü Kaya"), "Sukru_Kaya");
assert.equal(usernameSuggestion("ali veli"), "ali_veli");
assert.equal(usernameSuggestion("José!"), "Jose");
assert.equal(usernameSuggestion("alice"), "", "nothing to suggest for a valid name");
assert.equal(usernameSuggestion("!!"), "", "nothing usable");
assert.equal(usernameSuggestion("admin!"), "", "never suggests a reserved name");

assert.equal(fieldOfCode("username_taken"), "username");
assert.equal(fieldOfCode("weak_password"), "password");
assert.equal(fieldOfCode("EMAIL_INVALID"), "email");
assert.equal(fieldOfCode("under_age"), null);
assert.equal(signupMessage("nope"), null);

// Every message the forms show exists in every live locale's phrases.
const registry = JSON.parse(readFileSync(join(here, "..", "i18n", "locales.json"), "utf8"));
for (const l of registry.locales.filter((x) => x.status === "live" && x.id !== "en")) {
  const mod = await import(pathToFileURL(join(here, "..", "i18n", "locales", `${l.id}.js`)).href);
  const phrases = (mod.default || mod).phrases;
  for (const msg of Object.values(SIGNUP_MESSAGES)) assert.ok(phrases[msg], `${l.id} translates "${msg}"`);
}

// Both register forms use the shared rules.
for (const rel of ["../components/AuthView.jsx", "../site/MarketingAuthModal.jsx"]) {
  const src = readFileSync(join(here, rel), "utf8");
  assert.match(src, /useSignupFieldChecks/, `${rel} checks fields as you type`);
}

console.log("signupRules.selftest.mjs: ok");
