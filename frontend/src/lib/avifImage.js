// AVIF copies of user images (avatars, banners, group photos, server icons).
//
// The backend (frontend/backend/lib/imageVariants.js) stores a smaller AVIF next to every
// still image it can convert and marks the original's name with "-av1":
//   .../storage/v1/object/public/media/avatars/1763900000000-abc1234-av1.png   (original)
//   .../storage/v1/object/public/media/avatars/1763900000000-abc1234-av1.avif  (sibling)
// The sibling is stored before the marked URL is ever handed out, so preferAvif() may
// switch to it without a round trip, but only when this browser decodes AVIF (detected once
// by decoding a 1x1 AVIF; Safari / WKWebView before iOS 16 and old Android WebViews say no
// and keep the original). Components still fall back to the original on a load error.
// Chat attachments do not need this: GET /api/media/f negotiates on the Accept header.

const MARKED_RE =
  /^(https:\/\/[^/?#]+\/storage\/v1\/object\/public\/media\/(?:avatars|banners|images)\/\d{10,}-[a-z0-9]{1,16}-av1)\.(?:jpe?g|png|webp)((?:[?#].*)?)$/i;
const SIBLING_RE =
  /^(https:\/\/[^/?#]+\/storage\/v1\/object\/public\/media\/(?:avatars|banners|images)\/\d{10,}-[a-z0-9]{1,16}-av1)\.avif((?:[?#].*)?)$/i;

export const AVIF_SUPPORT_KEY = "descall:avif-support:v1";

// 1x1 opaque AVIF (sharp 0.35, AV1 8-bit 4:2:0), 283 bytes.
export const AVIF_PROBE =
  "data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAApbWRhdBIACgc4AAaQENBpMhQZQmMEwAA0AACQQMkJx78MAh80QA==";

/** The AVIF sibling of a marked public image URL (query / hash kept), else null. */
export function avifSiblingUrl(url) {
  if (typeof url !== "string" || !url) return null;
  const m = url.match(MARKED_RE);
  return m ? `${m[1]}.avif${m[2] || ""}` : null;
}

/** True for a URL produced by avifSiblingUrl. */
export function isAvifSiblingUrl(url) {
  return typeof url === "string" && SIBLING_RE.test(url);
}

let supported = null; // null = unknown yet
let detecting = null;

function readCached(storage) {
  try {
    const v = storage?.getItem?.(AVIF_SUPPORT_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function writeCached(storage, value) {
  try {
    storage?.setItem?.(AVIF_SUPPORT_KEY, value ? "1" : "0");
  } catch {
    /* private mode / quota: detection simply runs again next start */
  }
}

/**
 * Decodes the probe once per start (the result of the previous start is used meanwhile, so
 * the first avatars of a session already pick the right file). Resolves to a boolean.
 */
export function detectAvifSupport({ ImageCtor = typeof Image !== "undefined" ? Image : null, storage = safeLocalStorage(), timeoutMs = 3000 } = {}) {
  if (detecting) return detecting;
  if (supported == null) supported = readCached(storage);
  if (!ImageCtor) {
    detecting = Promise.resolve(Boolean(supported));
    return detecting;
  }
  detecting = new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      supported = ok;
      writeCached(storage, ok);
      resolve(ok);
    };
    try {
      const img = new ImageCtor();
      const timer = setTimeout(() => finish(false), timeoutMs);
      img.onload = () => {
        clearTimeout(timer);
        finish(img.width > 0 && img.height > 0);
      };
      img.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      img.src = AVIF_PROBE;
    } catch {
      finish(false);
    }
  });
  return detecting;
}

function safeLocalStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Synchronous answer: true only once this browser is known to decode AVIF. */
export function isAvifSupported() {
  if (supported == null) supported = readCached(safeLocalStorage());
  return supported === true;
}

/** `url`, or its AVIF sibling when there is one and this browser decodes AVIF. */
export function preferAvif(url) {
  if (!isAvifSupported()) return url;
  return avifSiblingUrl(url) || url;
}

/** Test hook: forget the detection state. */
export function _resetAvifSupportForTests(value = null) {
  supported = value;
  detecting = null;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  detectAvifSupport();
}
