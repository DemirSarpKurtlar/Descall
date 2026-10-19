// Voice-note playback fallback (2.13.2). New notes are stored as AAC/M4A by the server, but
// notes recorded on Chromium/Electron before that are WebM/Opus, which iOS / Safari cannot
// decode. For those, POST /api/media/voice-compat returns a signed URL to an M4A copy.
import { API_BASE_URL } from "../config/api.js";
import { getToken } from "./storage.js";

const cache = new Map();

/** File extension of the stored object behind a media URL (signed, ref or public). */
export function voiceExtOf(url) {
  const s = String(url || "").split(/[?#]/)[0];
  const m = s.match(/\.([A-Za-z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : "";
}

/** True when this element most likely cannot decode the original note. */
export function needsVoiceCompat(url, audioEl) {
  const ext = voiceExtOf(url);
  if (ext !== "webm" && ext !== "ogg" && ext !== "opus") return false;
  if (!audioEl || typeof audioEl.canPlayType !== "function") return false;
  const type = ext === "webm" ? 'audio/webm; codecs="opus"' : 'audio/ogg; codecs="opus"';
  return audioEl.canPlayType(type) === "";
}

/** Resolve an M4A copy of a voice note. Returns the URL or null. Deduplicated per URL. */
export function fetchVoiceCompatUrl(url, { fetchImpl = globalThis.fetch } = {}) {
  const key = String(url || "").split("?")[0];
  if (!key || typeof fetchImpl !== "function") return Promise.resolve(null);
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    try {
      const res = await fetchImpl(`${API_BASE_URL}/api/media/voice-compat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.url === "string" && data.url ? data.url : null;
    } catch {
      return null;
    }
  })();
  cache.set(key, job);
  job.then((v) => { if (!v) cache.delete(key); });
  return job;
}
