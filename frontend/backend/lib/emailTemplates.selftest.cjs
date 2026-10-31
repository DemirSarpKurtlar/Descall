"use strict";
// node backend/lib/emailTemplates.selftest.cjs
// Designed code emails (3.7.8): every purpose in both languages, escaping,
// preheader, plain-text twin, no emoji, no space inside the code.
const assert = require("assert");
const { buildCodeEmail, langFrom, PURPOSES } = require("./emailTemplates");

assert.equal(langFrom("en-US,en;q=0.9"), "en");
assert.equal(langFrom("tr-TR,tr;q=0.9,en;q=0.8"), "tr");
assert.equal(langFrom(""), "tr", "Turkish by default");
assert.equal(langFrom("en-US", "tr"), "tr", "the account language wins");

const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
for (const lang of ["tr", "en"]) {
  for (const purpose of PURPOSES) {
    const m = buildCodeEmail({ purpose, code: "603167", username: "demir", lang, year: 2026 });
    assert.ok(m.subject.startsWith("603167"), `${lang}/${purpose} subject leads with the code`);
    assert.ok(m.html.includes(">603167<"), `${lang}/${purpose} code is one unbroken string`);
    assert.ok(m.text.includes("603167"), `${lang}/${purpose} plain text has the code`);
    assert.match(m.html, /<div style="display:none;max-height:0;overflow:hidden;/, "hidden preheader");
    assert.match(m.html, new RegExp(`<html lang="${lang}"`));
    assert.match(m.html, /support@descall\.com/);
    assert.ok(!emoji.test(m.html + m.subject + m.text), `${lang}/${purpose} no emoji`);
    assert.ok(!/<script/i.test(m.html));
  }
}
const signup = buildCodeEmail({ purpose: "email_verify_signup", code: "111222", username: "ayse", lang: "tr" });
assert.match(signup.html, /Descall&#39;a hoş geldin, ayse!/);
assert.match(signup.html, /Sırada ne var\?/);
assert.match(signup.html, /apps\.apple\.com\/app\/id6820558264/);
assert.match(signup.html, /descall\.com\/tr\/download/);
const login = buildCodeEmail({ purpose: "2fa_login", code: "1", lang: "tr" });
assert.ok(!/Sırada ne var/.test(login.html), "steps only in the welcome email");
assert.match(login.html, /Giriş kodun/);
// Usernames are escaped.
const evil = buildCodeEmail({ purpose: "email_verify_signup", code: "1", username: "<img src=x onerror=1>" });
assert.ok(!evil.html.includes("<img src=x"), "username escaped");
console.log("emailTemplates.selftest: ok");
