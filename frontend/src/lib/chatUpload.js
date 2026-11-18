/**
 * Chat attachment upload (polish messaging-01 / 12 / 21): POST /api/media/upload
 * with progress and cancel, and a translated error instead of raw parser text.
 *
 *   uploadChatFile(file, { base, token, onProgress, signal, filename })
 *     → { url, mediaType, originalName, mimeType, size }
 *     throws an Error with .code: "TOO_LARGE" | "TYPE" | "FAILED" | "ABORTED".
 *   checkChatFile(file) → null or the same codes, before any byte is sent.
 *   uploadErrorKey(code) → the msg5.upload.* key to show.
 */

export const CHAT_UPLOAD_MAX_MB = 100;
export const CHAT_UPLOAD_MAX_BYTES = CHAT_UPLOAD_MAX_MB * 1024 * 1024;

export function checkChatFile(file) {
  if (!file) return "FAILED";
  if (Number(file.size) > CHAT_UPLOAD_MAX_BYTES) return "TOO_LARGE";
  return null;
}

export function codeForResponse(status, body) {
  const code = String(body?.code || "");
  if (status === 413 || code === "FILE_TOO_LARGE") return "TOO_LARGE";
  if (status === 415 || code === "FILE_TYPE_NOT_ALLOWED") return "TYPE";
  return "FAILED";
}

export function uploadErrorKey(code) {
  if (code === "TOO_LARGE") return "msg5.upload.tooLarge";
  if (code === "TYPE") return "msg5.upload.typeNotAllowed";
  return "msg5.upload.failed";
}

function fail(code) {
  const err = new Error(code);
  err.code = code;
  if (code === "ABORTED") err.name = "AbortError";
  return err;
}

export function uploadChatFile(file, { base = "", token = "", onProgress, signal, filename } = {}) {
  const pre = checkChatFile(file);
  if (pre) return Promise.reject(fail(pre));
  if (signal?.aborted) return Promise.reject(fail("ABORTED"));
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("purpose", "message");
    if (filename) form.append("file", file, filename);
    else form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/api/media/upload`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const onAbort = () => { try { xhr.abort(); } catch { /* ignore */ } };
    signal?.addEventListener?.("abort", onAbort, { once: true });
    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
    }
    xhr.onload = () => {
      signal?.removeEventListener?.("abort", onAbort);
      let body = null;
      try { body = JSON.parse(xhr.responseText || "null"); } catch { body = null; }
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) return resolve(body);
      return reject(fail(codeForResponse(xhr.status, body)));
    };
    xhr.onerror = () => { signal?.removeEventListener?.("abort", onAbort); reject(fail("FAILED")); };
    xhr.onabort = () => reject(fail("ABORTED"));
    xhr.send(form);
  });
}
