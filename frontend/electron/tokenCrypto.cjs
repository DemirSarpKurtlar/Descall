'use strict';

/**
 * Encrypt / decrypt small secrets (session token, PIN record, account tokens) with the
 * asynchronous safeStorage API (Electron 45).
 *
 * Electron 45 deprecated safeStorage.isEncryptionAvailable / encryptString / decryptString
 * and removes them in 46 (Chromium dropped the synchronous OSCrypt backend). The async
 * methods use the same per-platform key store (DPAPI on Windows), so a file written by the
 * old sync encryptString still decrypts here; nobody has to sign in again after the update.
 *
 * Same fallback as before: no encryption available (a Linux box without a key ring) means
 * the value is stored as plain UTF-8, exactly what the sync code did.
 *
 * Pass the safeStorage object in (main.cjs, premium features), so the self-test can use a fake.
 */

/** True when the async key store can encrypt. Never throws. */
async function encryptionAvailable(safeStorage) {
  try {
    if (!safeStorage || typeof safeStorage.isAsyncEncryptionAvailable !== 'function') return false;
    return Boolean(await safeStorage.isAsyncEncryptionAvailable());
  } catch (_) {
    return false;
  }
}

/** Buffer to write to disk for `text` (encrypted, or UTF-8 when no key store is available). */
async function encryptText(safeStorage, text) {
  const value = String(text ?? '');
  if (await encryptionAvailable(safeStorage)) return safeStorage.encryptStringAsync(value);
  return Buffer.from(value, 'utf8');
}

/** A session JWT (three base64url parts). */
const looksLikeJwt = (text) => /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*$/.test(text);
/** A JSON object (the app lock PIN record, the account list). */
const looksLikeJsonObject = (text) => {
  if (!/^\s*\{/.test(text)) return false;
  try { const v = JSON.parse(text); return Boolean(v) && typeof v === 'object'; } catch (_) { return false; }
};

/**
 * Text stored in `buf`. `{ text, reEncrypt }`: reEncrypt is true when Chromium asks for the
 * value to be written again with the current key (decryptStringAsync shouldReEncrypt), or
 * when a legacy plain-text copy was accepted.
 *
 * `legacyPlain(text)`: on Linux the old sync check said "no encryption" (basic_text store)
 * while the async one says yes, so files written by Electron 42 there are plain UTF-8.
 * When decryption fails and the raw bytes pass this check they are accepted once and
 * re-encrypted. Otherwise it throws, like decryptString did.
 */
async function decryptBuffer(safeStorage, buf, { legacyPlain = null } = {}) {
  if (await encryptionAvailable(safeStorage)) {
    let out;
    try {
      out = await safeStorage.decryptStringAsync(buf);
    } catch (err) {
      const raw = Buffer.from(buf).toString('utf8');
      if (typeof legacyPlain === 'function' && legacyPlain(raw)) return { text: raw, reEncrypt: true };
      throw err;
    }
    // Electron 45 returns { result, shouldReEncrypt }; accept a bare string too.
    if (typeof out === 'string') return { text: out, reEncrypt: false };
    return { text: String(out?.result ?? ''), reEncrypt: Boolean(out?.shouldReEncrypt) };
  }
  return { text: Buffer.from(buf).toString('utf8'), reEncrypt: false };
}

/** decryptBuffer + rewrite the file when Chromium asks for it (best effort). */
async function readEncryptedFile(safeStorage, fs, file, opts = {}) {
  const buf = await fs.promises.readFile(file);
  const { text, reEncrypt } = await decryptBuffer(safeStorage, buf, opts);
  if (reEncrypt && text) {
    try { await fs.promises.writeFile(file, await encryptText(safeStorage, text)); } catch (_) { /* keep the old copy */ }
  }
  return text;
}

module.exports = { encryptionAvailable, encryptText, decryptBuffer, readEncryptedFile, looksLikeJwt, looksLikeJsonObject };
