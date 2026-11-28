/**
 * Save a generated image (PNG blob) so it ends up where the platform keeps pictures.
 *
 * - Phones (iOS app, iOS/Android browsers) and any browser that can share files: the system
 *   share sheet with the image, which offers "Save Image" (Photos) as well as apps. An <a download>
 *   does nothing in the iOS app's WKWebView, which is why "PNG indir" seemed dead there.
 * - Desktop browsers, Electron and Tauri: a normal file download.
 *
 * Returns "shared" | "downloaded" | "cancelled". Throws only when neither path is possible.
 */
export function preferShareSheet({ nav = typeof navigator !== "undefined" ? navigator : null, win = typeof window !== "undefined" ? window : null } = {}) {
  if (!nav || typeof nav.share !== "function") return false;
  const cap = win?.Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  const ua = String(nav.userAgent || "");
  const touch = Number(nav.maxTouchPoints || 0) > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && touch);
}

export async function saveImageFile(blob, filename, { title = "", nav = typeof navigator !== "undefined" ? navigator : null, win = typeof window !== "undefined" ? window : null, doc = typeof document !== "undefined" ? document : null } = {}) {
  if (!blob) throw new Error("no_image");
  if (preferShareSheet({ nav, win }) && typeof File === "function") {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    const data = title ? { files: [file], title } : { files: [file] };
    if (!nav.canShare || nav.canShare({ files: [file] })) {
      try {
        await nav.share(data);
        return "shared";
      } catch (err) {
        if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) return "cancelled";
        // Fall through to a download.
      }
    }
  }
  if (!doc) throw new Error("no_document");
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  (win?.setTimeout || setTimeout)(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
