import { API_BASE_URL } from "../config/api";
import { getToken } from "./storage";

export const MIN_DURATION_MS = 3000;

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function liveAudioTracks(stream) {
  if (!stream || typeof stream.getAudioTracks !== "function") return [];
  return stream.getAudioTracks().filter((t) => t && t.readyState === "live");
}

function uniq(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Mix later getMeta() snapshots so hangup still has room + peer ids. */
export function mergeVoiceMeta(base = {}, extra = {}) {
  const a = base && typeof base === "object" ? base : {};
  const b = extra && typeof extra === "object" ? extra : {};
  const listKeys = [
    "dmPeerIds",
    "dm_peer_ids",
    "participantIds",
    "participant_ids",
    "participantUsernames",
    "participant_usernames",
  ];
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v == null || v === "") continue;
    if (listKeys.includes(k)) {
      out[k] = uniq([...(Array.isArray(out[k]) ? out[k] : []), ...(Array.isArray(v) ? v : [v])]);
      continue;
    }
    out[k] = v;
  }
  if (a.startedAt && !b.startedAt) out.startedAt = a.startedAt;
  if (a.kind && !b.kind) out.kind = a.kind;
  return out;
}

function encodeWav(floatChunks, sampleRate) {
  let total = 0;
  for (const c of floatChunks) total += c.length;
  if (!total) return null;
  const pcm = new Int16Array(total);
  let o = 0;
  for (const c of floatChunks) {
    for (let i = 0; i < c.length; i += 1) {
      const x = Math.max(-1, Math.min(1, c[i]));
      pcm[o++] = x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
    }
  }
  const bytes = pcm.byteLength;
  const buf = new ArrayBuffer(44 + bytes);
  const view = new DataView(buf);
  const ascii = (off, s) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, bytes, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * Mix local + remote audio into a PCM WAV (human voice), MediaRecorder as fallback.
 * start() arms capture even if tracks appear a second later (server join race).
 * stopAndUpload() never throws and never blocks hangup (fire-and-forget POST).
 */
export function createVoiceSessionCapture() {
  let recorder = null;
  let mixedCtx = null;
  let dest = null;
  let mixGain = null;
  let processor = null;
  let pollTimer = null;
  let startedAtMs = 0;
  let startedAtIso = null;
  let stopped = false;
  let armed = false;
  let mimeType = "";
  const chunks = [];
  const pcmChunks = [];
  const knownTracks = new Set();
  let getLocalStream = null;
  let getRemoteStreams = null;
  let getMeta = null;
  let metaSnapshot = {};

  function resumeCtx(ctx) {
    try {
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function refreshMeta() {
    try {
      metaSnapshot = mergeVoiceMeta(metaSnapshot, getMeta?.() || {});
    } catch {
      /* ignore */
    }
  }

  function attachTrack(track) {
    if (!track || knownTracks.has(track.id) || track.readyState !== "live") return;
    knownTracks.add(track.id);
    if (!mixedCtx || !mixGain) return;
    try {
      const src = mixedCtx.createMediaStreamSource(new MediaStream([track]));
      src.connect(mixGain);
    } catch {
      /* some browsers reject ended/remote tracks */
    }
  }

  function ensureRecorder() {
    if (stopped || recorder) return false;
    const mixTracks = dest ? dest.stream.getAudioTracks() : [];
    if (mixTracks.length) {
      try {
        resumeCtx(mixedCtx);
        startRecorder(dest.stream);
        return true;
      } catch {
        /* fall through to local */
      }
    }
    const local = (() => {
      try {
        return getLocalStream?.();
      } catch {
        return null;
      }
    })();
    const localTracks = liveAudioTracks(local);
    if (!localTracks.length) return false;
    try {
      startRecorder(new MediaStream(localTracks));
      return true;
    } catch {
      return false;
    }
  }

  function harvestTracks() {
    const streams = [];
    try {
      const local = getLocalStream?.();
      if (local) streams.push(local);
    } catch {
      /* ignore */
    }
    try {
      const remotes = getRemoteStreams?.() || [];
      for (const s of remotes) if (s) streams.push(s);
    } catch {
      /* ignore */
    }
    for (const stream of streams) {
      for (const track of liveAudioTracks(stream)) attachTrack(track);
    }
    ensureRecorder();
  }

  function startRecorder(stream) {
    mimeType = pickRecorderMime();
    const opts = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
    recorder = new MediaRecorder(stream, opts);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(1000);
  }

  function start(opts = {}) {
    if (stopped || armed) return false;
    armed = true;
    getLocalStream = opts.getLocalStream;
    getRemoteStreams = opts.getRemoteStreams;
    getMeta = opts.getMeta;
    startedAtMs = Date.now();
    startedAtIso = new Date(startedAtMs).toISOString();
    refreshMeta();
    if (!metaSnapshot.startedAt) metaSnapshot.startedAt = startedAtIso;

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try {
          mixedCtx = new Ctx({ sampleRate: 48000 });
        } catch {
          mixedCtx = new Ctx();
        }
        resumeCtx(mixedCtx);
        mixGain = mixedCtx.createGain();
        mixGain.gain.value = 1;
        dest = mixedCtx.createMediaStreamDestination();
        try {
          processor = mixedCtx.createScriptProcessor(4096, 2, 1);
          mixGain.connect(processor);
          processor.connect(dest);
          processor.onaudioprocess = (e) => {
            if (stopped) return;
            const left = e.inputBuffer.getChannelData(0);
            const right =
              e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : left;
            const mono = new Float32Array(left.length);
            for (let i = 0; i < left.length; i += 1) mono[i] = (left[i] + right[i]) * 0.5;
            pcmChunks.push(mono);
          };
        } catch {
          processor = null;
          mixGain.connect(dest);
        }
        harvestTracks();
        pollTimer = setInterval(() => {
          harvestTracks();
          refreshMeta();
        }, 1000);
        return true;
      }
    } catch {
      /* mix unavailable — local fallback */
    }

    const ok = ensureRecorder();
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        harvestTracks();
        refreshMeta();
      }, 1000);
    }
    return ok || armed;
  }

  function teardownMixer() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (processor) {
      try {
        processor.disconnect();
      } catch {
        /* ignore */
      }
      processor.onaudioprocess = null;
      processor = null;
    }
    mixGain = null;
    if (mixedCtx) {
      try {
        mixedCtx.close();
      } catch {
        /* ignore */
      }
      mixedCtx = null;
    }
    dest = null;
  }

  function blobFromChunks() {
    if (!chunks.length) return null;
    const type = mimeType || chunks[0]?.type || "audio/webm";
    return new Blob(chunks, { type });
  }

  function bestBlob() {
    const rate = mixedCtx?.sampleRate || 48000;
    const wav = encodeWav(pcmChunks, rate);
    if (wav && wav.size > 1024) return wav;
    return blobFromChunks();
  }

  function postBlob(blob, durationMs) {
    const token = getToken();
    if (!token || !blob || blob.size < 256) return;
    refreshMeta();
    const endedAt = new Date().toISOString();
    const payload = {
      ...metaSnapshot,
      kind: metaSnapshot.kind,
      startedAt: metaSnapshot.startedAt || startedAtIso,
      endedAt: metaSnapshot.endedAt || endedAt,
      durationMs: metaSnapshot.durationMs || durationMs,
    };
    const form = new FormData();
    const type = String(blob.type || "").toLowerCase();
    const ext = type.includes("wav") ? "wav" : type.includes("mp4") ? "m4a" : "webm";
    form.append("audio", blob, `session.${ext}`);
    form.append("metadata", JSON.stringify(payload));
    const base = API_BASE_URL || "";
    const url = `${base}/api/voice-recordings`;
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
      .then(async (res) => {
        if (res.ok) return;
        let body = "";
        try {
          body = await res.text();
        } catch {
          /* ignore */
        }
        console.warn("[voiceCapture] upload", res.status, body.slice(0, 240));
      })
      .catch((err) => {
        console.warn("[voiceCapture] upload failed:", err?.message || err);
      });
  }

  function finish(upload) {
    if (stopped) return;
    stopped = true;
    const elapsed = Date.now() - startedAtMs;
    refreshMeta();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    const rec = recorder;
    recorder = null;
    const flush = () => {
      const blob = bestBlob();
      teardownMixer();
      if (upload && elapsed >= MIN_DURATION_MS) postBlob(blob, elapsed);
    };
    if (!rec || rec.state === "inactive") {
      setTimeout(flush, 60);
      return;
    }
    rec.onstop = flush;
    try {
      rec.stop();
    } catch {
      setTimeout(flush, 60);
    }
  }

  return {
    start,
    stopAndUpload() {
      try {
        finish(true);
      } catch {
        /* never block hangup */
      }
    },
    abort() {
      try {
        finish(false);
      } catch {
        /* ignore */
      }
    },
  };
}

export { pickRecorderMime };
