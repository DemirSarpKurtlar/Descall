'use strict';

/**
 * Composer paste fallback (`clipboard:read-image`): the clipboard image as PNG bytes, or null.
 *
 * Electron 44 rebuilt the main-process clipboard on the W3C Clipboard API and removed
 * clipboard.readImage(). clipboard.read() resolves to ClipboardItem[] whose getType(mime)
 * resolves to a Blob. Chromium exposes a bitmap on the OS clipboard (a Windows screenshot,
 * CF_DIB) as image/png, so PNG is tried first; any other image/* type is re-encoded to PNG
 * through nativeImage so the renderer keeps getting PNG bytes as before.
 *
 * Pass `clipboard` and `nativeImage` in (main.cjs), so the self-test can use fakes.
 */

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function pickImageType(types) {
  const list = Array.isArray(types) ? types.map(String) : [];
  if (list.includes('image/png')) return 'image/png';
  return list.find((t) => /^image\/[a-z0-9.+-]+$/i.test(t)) || null;
}

async function readClipboardImagePng({ clipboard, nativeImage, maxBytes = MAX_IMAGE_BYTES }) {
  try {
    if (!clipboard || typeof clipboard.read !== 'function') return null;
    const items = await clipboard.read();
    if (!Array.isArray(items)) return null;
    let item = null;
    let type = null;
    for (const it of items) {
      const t = pickImageType(it?.types);
      if (t === 'image/png') { item = it; type = t; break; }
      if (t && !item) { item = it; type = t; }
    }
    if (!item || !type) return null;
    const blob = await item.getType(type);
    if (!blob || typeof blob.arrayBuffer !== 'function') return null;
    if (typeof blob.size === 'number' && blob.size > maxBytes) return null;
    let bytes = Buffer.from(await blob.arrayBuffer());
    if (!bytes.length) return null;
    if (type !== 'image/png') {
      const img = nativeImage?.createFromBuffer?.(bytes);
      if (!img || img.isEmpty()) return null;
      bytes = img.toPNG();
    }
    return bytes.length > maxBytes ? null : bytes;
  } catch (_) {
    return null;
  }
}

module.exports = { MAX_IMAGE_BYTES, pickImageType, readClipboardImagePng };
