/**
 * "Yazarken sızıntı kontrolü" of the sign-up card (growth 1B). The password never leaves the
 * device: it is hashed here (SHA-1, as the breach list is keyed) and only the first 5 hex
 * characters are sent (backend GET /auth/password/range/:prefix, a k-anonymity range proxy
 * of the Have I Been Pwned list). The range comes back with every suffix of that prefix and
 * the match is made here. The server runs the same check on submit, so this is guidance;
 * it never weakens the server rule.
 *
 * checkPasswordBreach(password, { fetchRange, signal }) ->
 *   { status: "clean" | "breached" | "unknown", count }
 * "unknown": the list could not be reached (offline, timeout); the card says so quietly.
 */

const RANGE_TTL_MS = 10 * 60 * 1000;
const rangeCache = new Map(); // prefix -> { at, body } (ranges only, never a password)

function toHex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Plain SHA-1 for webviews without crypto.subtle (insecure contexts, very old engines). */
export function sha1Fallback(text) {
  const bytes = new TextEncoder().encode(String(text));
  const ml = bytes.length * 8;
  const withPad = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml >>> 0);
  dv.setUint32(withPad.length - 8, Math.floor(ml / 0x100000000));
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i += 1) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i += 1) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("").toUpperCase();
}

export async function sha1Hex(text) {
  const subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : null;
  if (subtle && typeof subtle.digest === "function") {
    try {
      return toHex(await subtle.digest("SHA-1", new TextEncoder().encode(String(text))));
    } catch {
      /* fall through */
    }
  }
  return sha1Fallback(text);
}

/** Count for a full hash in a range body ("SUFFIX:COUNT" lines), 0 when absent. */
export function countInRange(body, hash) {
  const suffix = String(hash || "").toUpperCase().slice(5);
  if (suffix.length !== 35) return 0;
  for (const line of String(body || "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    if (line.slice(0, i).trim().toUpperCase() === suffix) return Math.max(0, Math.floor(Number(line.slice(i + 1)) || 0));
  }
  return 0;
}

async function rangeFor(prefix, fetchRange, signal, now) {
  const hit = rangeCache.get(prefix);
  if (hit && now - hit.at < RANGE_TTL_MS) return hit.body;
  const body = await fetchRange(prefix, { signal });
  rangeCache.set(prefix, { at: now, body: String(body || "") });
  if (rangeCache.size > 200) rangeCache.delete(rangeCache.keys().next().value);
  return String(body || "");
}

export async function checkPasswordBreach(password, { fetchRange, signal, now = Date.now() } = {}) {
  const pw = String(password ?? "");
  if (!pw || typeof fetchRange !== "function") return { status: "unknown", count: 0 };
  try {
    const hash = await sha1Hex(pw);
    if (signal?.aborted) return { status: "unknown", count: 0, aborted: true };
    const body = await rangeFor(hash.slice(0, 5), fetchRange, signal, now);
    const count = countInRange(body, hash);
    return count > 0 ? { status: "breached", count } : { status: "clean", count: 0 };
  } catch (err) {
    return { status: "unknown", count: 0, aborted: Boolean(signal?.aborted || err?.name === "AbortError") };
  }
}

/** Tests only. */
export function __clearBreachCache() {
  rangeCache.clear();
}
