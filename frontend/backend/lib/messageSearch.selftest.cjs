"use strict";
// node backend/lib/messageSearch.selftest.cjs
const assert = require("assert");
const s = require("./messageSearch");

assert.equal(s.cleanQuery("  a "), "", "too short");
assert.equal(s.cleanQuery("  merhaba   dünya "), "merhaba dünya");
assert.equal(s.cleanQuery("x".repeat(500)).length, 100);
assert.equal(s.likePattern("100%_ok"), "%100\\%\\_ok%", "wildcards escaped");
assert.equal(s.likePattern("İstanbul"), "%_stanbul%", "Turkish i letters become single-char wildcards");
assert.equal(s.likePattern("çiçek"), "%ç_çek%");
assert.equal(s.searchableText("__voice__:abc"), null);
assert.equal(s.searchableText('{"type":"call_summary","status":"ended"}'), null);
assert.equal(s.searchableText("  selam "), "selam");
assert.equal(s.searchableText(""), null);
assert.ok(s.matches("İSTANBUL'a gidiyoruz", "istanbul"));
assert.ok(s.matches("Işık", "isik"));
assert.ok(s.matches("Çiçek aldım", "cicek"), "accent-insensitive");
assert.ok(!s.matches("ankara", "istanbul"));
const sn = s.snippet("Merhaba, yarın İstanbul'a gidiyoruz, sen de gel", "istanbul", 10);
assert.equal(sn.text.slice(sn.start, sn.end), "İstanbul");
assert.ok(sn.text.startsWith("…") && sn.text.endsWith("…"));
const short = s.snippet("selam nasılsın", "nasıl");
assert.equal(short.text, "selam nasılsın");
assert.equal(short.text.slice(short.start, short.end), "nasıl");
console.log("messageSearch.selftest: ok");
