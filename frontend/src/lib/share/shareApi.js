/**
 * Share sheet HTTP client (web and the Android share page). Bearer session of this
 * device; uploads go to POST /api/media/upload (purpose=message), the upload the chat
 * composer uses, with real progress (XHR). Errors carry { status, code, offline }.
 */
import { apiBase } from "../nodeRouting.js";
import { getToken } from "../storage.js";

const TIMEOUT_MS = 20000;

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function fail(status, code, extra = {}) {
  const err = new Error(code || `HTTP ${status}`);
  err.status = status;
  err.code = code || (status ? `http_${status}` : "network");
  Object.assign(err, extra);
  return err;
}

export function createShareApi({ base = () => apiBase(), token = () => getToken(), fetchImpl = (...a) => fetch(...a), XHR = typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest : null } = {}) {
  async function request(path, { method = "GET", body, signal } = {}) {
    if (!online()) throw fail(0, "offline", { offline: true });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    signal?.addEventListener?.("abort", onAbort);
    let res;
    try {
      res = await fetchImpl(`${base()}${path}`, {
        method,
        cache: "no-store",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Descall-Client": "share-sheet", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (signal?.aborted) throw fail(0, "cancelled");
      throw fail(0, ctl.signal.aborted ? "timeout" : online() ? "network" : "offline", { offline: !online() || !ctl.signal.aborted });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw fail(res.status, data?.error || data?.code || (res.status === 401 ? "unauthorized" : null), { data });
    return data;
  }

  /** item: { file: Blob, name, kind }. → { url, mediaType, mimeType, size, originalName } */
  function upload(item, { onProgress, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (!online()) return reject(fail(0, "offline", { offline: true }));
      if (!XHR || !item?.file) return reject(fail(0, "upload_failed"));
      const xhr = new XHR();
      xhr.open("POST", `${base()}/api/media/upload`);
      xhr.timeout = 10 * 60 * 1000;
      if (token()) xhr.setRequestHeader("Authorization", `Bearer ${token()}`);
      xhr.setRequestHeader("X-Descall-Client", "share-sheet");
      xhr.upload.onprogress = (e) => onProgress?.(e.loaded, e.lengthComputable ? e.total : undefined);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || "{}"); } catch { data = {}; }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data);
        else reject(fail(xhr.status, xhr.status === 413 ? "too_large" : xhr.status === 415 ? "type" : data?.code || "upload_failed"));
      };
      xhr.onerror = () => reject(fail(0, online() ? "network" : "offline", { offline: true }));
      xhr.ontimeout = () => reject(fail(0, "timeout", { offline: true }));
      xhr.onabort = () => reject(fail(0, "cancelled"));
      signal?.addEventListener?.("abort", () => xhr.abort());
      const form = new FormData();
      form.append("purpose", "message");
      form.append("file", item.file, item.name || "file");
      xhr.send(form);
    });
  }

  return {
    base,
    request,
    targets: (opts) => request("/api/native/share/targets", opts),
    precheck: (body, opts) => request("/api/native/share/precheck", { method: "POST", body, ...opts }),
    send: (body, opts) => request("/api/native/share/send", { method: "POST", body, ...opts }),
    undo: (body, opts) => request("/api/native/share/undo", { method: "POST", body, ...opts }),
    linkPreview: (url, opts) => request(`/api/link-preview?url=${encodeURIComponent(url)}`, opts),
    upload,
  };
}
