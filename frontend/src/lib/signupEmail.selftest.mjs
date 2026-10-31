// 3.7.17: a new account needs an email (owner rule). Run: node src/lib/signupEmail.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signupEmailError, SIGNUP_EMAIL_HINT } from "./signupEmail.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");

assert.equal(signupEmailError(""), "Email is required.");
assert.equal(signupEmailError("   "), "Email is required.");
assert.equal(signupEmailError(undefined), "Email is required.");
assert.equal(signupEmailError("nope"), "Enter a valid email address.");
assert.equal(signupEmailError("a@b"), "Enter a valid email address.");
assert.equal(signupEmailError(`${"a".repeat(250)}@b.co`), "Enter a valid email address.");
assert.equal(signupEmailError(" demir@descall.com "), null);

// Same rule as the server.
const auth = readFileSync(join(src, "..", "backend", "routes", "auth.js"), "utf8");
assert.match(auth, /code: "EMAIL_REQUIRED"/);
assert.match(auth, /code: "EMAIL_INVALID"/);

// Every sign-up form asks for it, checks it before sending, and no longer says "optional".
for (const file of ["components/AuthView.jsx", "site/MarketingAuthModal.jsx", "components/download/DownloadPage.jsx"]) {
  const code = readFileSync(join(src, file), "utf8");
  assert.ok(!code.includes('t("Email (optional)")'), `${file}: no "(optional)" label`);
  assert.match(code, /signupEmailError\(email\)/, `${file}: checks the email before register`);
  assert.match(code, /type="email"[\s\S]{0,400}required/, `${file}: email input is required`);
}

for (const [file, lang] of [["i18n/locales/tr.js", "tr"], ["site/marketingPhrases.tr.js", "tr"], ["i18n/locales/en.js", "en"]]) {
  const code = readFileSync(join(src, file), "utf8");
  for (const key of ["Email is required.", "Enter a valid email address.", SIGNUP_EMAIL_HINT]) {
    assert.ok(code.includes(JSON.stringify(key)), `${file} (${lang}) has ${key.slice(0, 30)}`);
  }
}
console.log("signupEmail.selftest ok");
