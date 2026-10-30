/**
 * Save a JSON value as a file on every platform (3.6.0, KVKK veri dışa aktarma).
 * Web and Electron: a normal download. iPhone / iPad app (WKWebView ignores
 * <a download> on blobs): the share sheet with the file ("Dosyalara Kaydet").
 * Returns "shared" | "downloaded" | "cancelled".
 */
export async function saveJsonFile(filename, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const type = "application/json";
  try {
    if (typeof File !== "undefined" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
      const isAppleTouch = /iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const file = new File([text], filename, { type });
      if (isAppleTouch && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: filename });
        return "shared";
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") return "cancelled";
    /* fall back to a download */
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

/** Filename from a Content-Disposition header, or the fallback. */
export function filenameFromDisposition(header, fallback) {
  const m = /filename="?([^";]+)"?/i.exec(String(header || ""));
  return m ? m[1] : fallback;
}
