// Run from frontend/: node src/components/auth/signupUsername.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./SignupUsernamePicker.jsx", import.meta.url), "utf8");
const body = src.slice(src.indexOf("export const USERNAME_RULE"), src.indexOf("/**\n * Username step"));
const mod = await import("data:text/javascript," + encodeURIComponent(body));
assert.equal(mod.localUsernameError("a"), "At least 2 characters.");
assert.equal(mod.localUsernameError("ayse yilmaz"), "Only letters, numbers, _ . and -");
assert.equal(mod.localUsernameError("ayse_y"), null);
assert.equal(mod.usernameFromName("Ayşe Yılmaz"), "ayseyilmaz");
assert.equal(mod.usernameFromName("Çağrı Öztürk"), "cagriozturk");
const auth = readFileSync(new URL("../../../backend/routes/auth.js", import.meta.url), "utf8");
assert.match(auth, /apple_username_required/);
assert.match(auth, /router\.get\("\/username\/check"/);
assert.match(auth, /username_taken/);
const api = readFileSync(new URL("../../api/auth.js", import.meta.url), "utf8");
assert.match(api, /payload\.usernameStep = true/);
console.log("signupUsername.selftest: ok");
