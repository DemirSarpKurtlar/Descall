"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-key";

const assert = require("assert");
const opt = require("./marketingOptIn");

const tokens = opt.createOptInTokens();
assert.equal(tokens.confirmToken.length, 64);
assert.equal(tokens.unsubscribeToken.length, 64);
assert.notEqual(tokens.confirmToken, tokens.unsubscribeToken);

const link = opt.unsubscribeUrl(tokens.unsubscribeToken, { PUBLIC_APP_URL: "https://descall.com" });
const text = opt.marketingFooterText(link);
const html = opt.marketingFooterHtml(link);
assert.match(text, /Unsubscribe any time/);
assert.match(text, /unsubscribe\?token=/);
assert.match(html, /unsubscribe\?token=/);
assert.doesNotMatch(`${text}\n${html}`, /postal|DMCA agent|MARKETING_POSTAL/i);

const missing = opt.isMissingTable({ code: "42P01", message: 'relation "marketing_subscribers" does not exist' });
assert.equal(missing, true);
assert.equal(opt.isMissingTable({ message: "network down" }), false);

const tr = opt.copyFor("tr");
const en = opt.copyFor("en");
assert.match(tr.subject, /onaylayın/);
assert.match(en.text, /will not email you/);
assert.doesNotMatch(JSON.stringify(tr) + JSON.stringify(en), /DMCA|postal/i);

console.log("marketingOptIn.selftest ok");
