// Electron 45 API migration (clipboard.read, async safeStorage). Run from frontend/:
//   node electron/electron45.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, readFileSync as rf } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { pickImageType, readClipboardImagePng } = require("./clipboardImage.cjs");
const { encryptText, decryptBuffer, readEncryptedFile, encryptionAvailable, looksLikeJwt, looksLikeJsonObject } = require("./tokenCrypto.cjs");

// ---- clipboard image -------------------------------------------------------------------
assert.equal(pickImageType(["text/plain", "image/png"]), "image/png");
assert.equal(pickImageType(["image/jpeg", "image/png"]), "image/png");
assert.equal(pickImageType(["image/jpeg"]), "image/jpeg");
assert.equal(pickImageType(["text/html"]), null);
assert.equal(pickImageType(undefined), null);

const blob = (bytes) => ({ size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
const item = (map) => ({ types: Object.keys(map), getType: async (t) => map[t] });
const fakeNative = {
  createFromBuffer: (buf) => ({ isEmpty: () => buf.length === 0, toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47, ...buf]) }),
};

{
  const png = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3];
  const out = await readClipboardImagePng({ clipboard: { read: async () => [item({ "text/plain": blob([65]), "image/png": blob(png) })] }, nativeImage: fakeNative });
  assert.deepEqual([...out], png, "PNG bytes are returned as they are");
}
{
  const out = await readClipboardImagePng({ clipboard: { read: async () => [item({ "image/jpeg": blob([9, 9]) })] }, nativeImage: fakeNative });
  assert.deepEqual([...out], [0x89, 0x50, 0x4e, 0x47, 9, 9], "other image types are re-encoded to PNG");
}
{
  const out = await readClipboardImagePng({ clipboard: { read: async () => [item({ "image/jpeg": blob([1]) }), item({ "image/png": blob([2]) })] }, nativeImage: fakeNative });
  assert.deepEqual([...out], [2], "a PNG item wins over an earlier JPEG item");
}
assert.equal(await readClipboardImagePng({ clipboard: { read: async () => [item({ "text/plain": blob([65]) })] }, nativeImage: fakeNative }), null, "no image → null");
assert.equal(await readClipboardImagePng({ clipboard: { read: async () => [] }, nativeImage: fakeNative }), null);
assert.equal(await readClipboardImagePng({ clipboard: { read: async () => { throw new Error("denied"); } }, nativeImage: fakeNative }), null, "errors → null");
assert.equal(await readClipboardImagePng({ clipboard: { read: async () => [item({ "image/png": blob([1, 2, 3, 4]) })] }, nativeImage: fakeNative, maxBytes: 3 }), null, "over the cap → null");
assert.equal(await readClipboardImagePng({ clipboard: {}, nativeImage: fakeNative }), null, "no clipboard.read → null");

// ---- async safeStorage -----------------------------------------------------------------
const fakeStore = (available, { reEncrypt = false } = {}) => ({
  isAsyncEncryptionAvailable: async () => available,
  encryptStringAsync: async (s) => Buffer.from(`enc:${s}`, "utf8"),
  decryptStringAsync: async (b) => {
    const s = Buffer.from(b).toString("utf8");
    if (!s.startsWith("enc:")) throw new Error("Error while decrypting the ciphertext provided to safeStorage.decryptString.");
    return { result: s.slice(4), shouldReEncrypt: reEncrypt };
  },
});

assert.equal(await encryptionAvailable(fakeStore(true)), true);
assert.equal(await encryptionAvailable(fakeStore(false)), false);
assert.equal(await encryptionAvailable({}), false, "no async API → plain text");
assert.equal(await encryptionAvailable({ isAsyncEncryptionAvailable: async () => { throw new Error("x"); } }), false);
assert.equal((await encryptText(fakeStore(true), "jwt")).toString(), "enc:jwt");
assert.equal((await encryptText(fakeStore(false), "jwt")).toString(), "jwt", "no key store → UTF-8 like before");
assert.deepEqual(await decryptBuffer(fakeStore(true), Buffer.from("enc:jwt")), { text: "jwt", reEncrypt: false });
assert.deepEqual(await decryptBuffer(fakeStore(false), Buffer.from("jwt")), { text: "jwt", reEncrypt: false });
await assert.rejects(() => decryptBuffer(fakeStore(true), Buffer.from("plain")), "undecryptable data throws (caller logs and returns null)");
// Linux: Electron 42 said "no encryption" (basic_text) and wrote plain text; 45 says yes.
const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InUxIn0.sig_part";
assert.deepEqual(await decryptBuffer(fakeStore(true), Buffer.from(jwt), { legacyPlain: looksLikeJwt }), { text: jwt, reEncrypt: true }, "legacy plain JWT accepted once, re-encrypted");
await assert.rejects(() => decryptBuffer(fakeStore(true), Buffer.from("not a token"), { legacyPlain: looksLikeJwt }));
assert.deepEqual(await decryptBuffer(fakeStore(true), Buffer.from('{"salt":"x"}'), { legacyPlain: looksLikeJsonObject }), { text: '{"salt":"x"}', reEncrypt: true });
assert.equal(looksLikeJsonObject("[1]"), false);
assert.equal(looksLikeJwt("a.b.c"), false, "too short to be a session token");
{
  const dir = mkdtempSync(path.join(os.tmpdir(), "descall-e45-"));
  const file = path.join(dir, "auth-token.bin");
  writeFileSync(file, "enc:old");
  assert.equal(await readEncryptedFile(fakeStore(true, { reEncrypt: true }), fs, file), "old");
  assert.equal(rf(file, "utf8"), "enc:old", "re-encrypted copy written");
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- no main-process code uses the APIs Electron 44/45 removed or deprecated --------------
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "e2e" || /^v?\d/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.cjs$/.test(e.name)) files.push(p);
  }
};
walk(here);
const banned = [
  [/safeStorage\.(isEncryptionAvailable|encryptString|decryptString)\s*\(/, "sync safeStorage (deprecated in 45, removed in 46): use tokenCrypto.cjs"],
  [/clipboard\.(readImage|writeImage|readHTML|writeHTML|readRTF|writeRTF|readBookmark|writeBookmark|readBuffer|writeBuffer|availableFormats|readFindText|writeFindText)\s*\(/, "clipboard helper removed in Electron 44: use clipboard.read()/write()"],
  [/(login|settings)\.wasOpenedAsHidden|\bopenAsHidden\s*:|\.restoreState\b/, "macOS 12 login item fields removed in Electron 44"],
  [/contentTracing\.enableHeapProfiling/, "removed in Electron 45"],
];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`])\/\/.*$/gm, "$1");
for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  for (const [re, why] of banned) {
    assert.ok(!re.test(src), `${path.relative(here, f)}: ${why}`);
  }
}
// Sandboxed preloads: Electron 45 removed Buffer / setImmediate / events / timers / url there.
for (const f of files.filter((p) => /[Pp]reload\.cjs$/.test(p))) {
  const src = stripComments(readFileSync(f, "utf8"));
  assert.ok(!/\bBuffer\b|\bsetImmediate\b|\bclearImmediate\b/.test(src), `${path.relative(here, f)}: Buffer / setImmediate are gone in sandboxed preloads (Electron 45)`);
  const reqs = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  for (const r of reqs) assert.ok(/^electron(\/(renderer|common))?$/.test(r), `${path.relative(here, f)}: sandboxed preload may only require electron, not ${r}`);
}

console.log("electron45.selftest OK");
