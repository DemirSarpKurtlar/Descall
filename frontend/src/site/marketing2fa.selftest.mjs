// node src/site/marketing2fa.selftest.mjs
// descall.com sign-in (3.7.6): the 2FA step reached the server with an empty
// body because the modal calls onVerify2fa(pendingToken, code) and the boot
// handler only read an object, so every correct code said "Code is required."
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const boot = rd("./MarketingBoot.jsx");
const modal = rd("./MarketingAuthModal.jsx");

const src = boot.slice(boot.indexOf("export function verify2faArgs"), boot.indexOf("/**\n * Lightweight"));
const { verify2faArgs } = await import(`data:text/javascript,${encodeURIComponent(src)}`);
assert.deepEqual(verify2faArgs("pend.tok", " 603167 "), { pendingToken: "pend.tok", code: "603167" }, "modal shape (token, code)");
assert.deepEqual(verify2faArgs({ pendingToken: "p", code: "123456" }), { pendingToken: "p", code: "123456" }, "object shape");
assert.deepEqual(verify2faArgs({ token: "p", otp: "1" }), { pendingToken: "p", code: "1" });
assert.deepEqual(verify2faArgs(undefined, undefined), { pendingToken: "", code: "" });

// The modal and the boot handler agree on the call shape.
assert.match(modal, /onVerify2fa\?\.\(twoFa\.pendingToken, code\.trim\(\)\)/);
assert.match(boot, /async \(payloadOrToken, codeArg\) =>/);
assert.match(boot, /verify2faArgs\(payloadOrToken, codeArg\)/);
assert.match(boot, /apiVerify2fa\(pendingToken, code\)/);
console.log("marketing2fa.selftest: ok");
