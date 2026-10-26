import assert from "node:assert/strict";
import {
  normalizeCode, codeGroups, displayCode, generateCode, mmss, dativeSuffixForNumber,
  popupUntil, shortWhen, longDate, historyWhen, fmtNum, lockLeft, CODE_ALPHABET,
} from "./promoCode.js";

assert.equal(normalizeCode(" k7qm-2xrd 9pla–v4te!! extra"), "K7QM2XRD9PLAV4TE");
assert.deepEqual(codeGroups("K7QM2XRD9P"), ["K7QM", "2XRD", "9P", ""]);
assert.equal(displayCode("k7qm2xrd9plav4te"), "K7QM–2XRD–9PLA–V4TE");
assert.equal(displayCode("k7qm2xrd9plav4te", "-"), "K7QM-2XRD-9PLA-V4TE");

const seen = new Set();
for (let i = 0; i < 500; i += 1) {
  const c = generateCode();
  assert.equal(c.length, 16);
  for (const ch of c) assert(CODE_ALPHABET.includes(ch), ch);
  assert(!/[O0I1]/.test(c));
  seen.add(c);
}
assert.equal(seen.size, 500, "codes are unique");
// 32 symbols divide 256 evenly, so every byte maps straight onto the alphabet (no modulo bias).
const seq = (n) => Uint8Array.from({ length: n }, (_, i) => i);
assert.equal(generateCode(seq), CODE_ALPHABET.slice(0, 16));
assert.equal(generateCode((n) => Uint8Array.from({ length: n }, () => 255)), "9".repeat(16));

assert.equal(mmss(582), "09:42");
assert.equal(mmss(0), "00:00");
assert.equal(mmss(-3), "00:00");
assert.equal(mmss(600), "10:00");

assert.equal(dativeSuffixForNumber(59), "a");
assert.equal(dativeSuffixForNumber(50), "ye");
assert.equal(dativeSuffixForNumber(30), "a");
assert.equal(dativeSuffixForNumber(6), "ya");
assert.equal(dativeSuffixForNumber(23), "e");
assert.equal(dativeSuffixForNumber(0), "a");
assert.equal(dativeSuffixForNumber(20), "ye");

// 31 Oct 2026 23:59 TRT = 20:59Z
assert.equal(popupUntil("2026-10-31T20:59:00Z", "tr"), "31 Ekim 23:59’a");
assert.equal(popupUntil("2026-10-31T20:59:00Z", "en"), "October 31, 23:59");
assert.equal(popupUntil("2026-11-01T17:00:00Z", "tr"), "1 Kasım 20:00’ye");
assert.equal(popupUntil("bad"), "");
assert.equal(shortWhen("2026-10-31T20:59:00Z"), "31 Eki 23:59");
assert.equal(shortWhen(null), "—");
assert.equal(longDate("2026-11-02T09:00:00Z"), "2 Kasım 2026");

const now = Date.parse("2026-10-26T11:02:00Z");
assert.deepEqual(historyWhen("2026-10-26T11:02:00Z", now), { today: "14:02" });
assert.deepEqual(historyWhen("2025-10-29T09:00:00Z", now), { date: "29 Eki 2025" });
// Day boundary is TRT: 22:30Z on the 25th is already the 26th in Türkiye.
assert.deepEqual(historyWhen("2026-10-25T22:30:00Z", now), { today: "01:30" });

assert.equal(fmtNum(1240, "tr"), "1.240");
assert.equal(fmtNum(1240, "en"), "1,240");
assert.equal(lockLeft(now + 9500, now), 10);
assert.equal(lockLeft(now - 1, now), 0);
console.log("promoCode selftest: ok");
