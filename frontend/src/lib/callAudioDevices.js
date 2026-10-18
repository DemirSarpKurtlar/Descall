/**
 * Call audio devices (2.10.113): microphone / speaker choice that works live
 * mid-call and persists.
 *
 * Electron root causes this fixes:
 *   - setSinkId was applied to one <audio> element only. Remote audio also
 *     plays through the boost graph (voiceGain: an AudioContext, whose output
 *     ignores the element's sink), the screen-share sink and group/server
 *     elements, and an element created later never got the choice.
 *   - Electron's permission check denied "speaker-selection", so setSinkId
 *     rejected; the hooks swallowed the error (`.catch(() => {})`).
 *   - The choice lived only in hook state (reset every call); the Settings
 *     page's selectedAudioIn / selectedAudioOut were never read by calls.
 *   - The device-change recapture compared the noise-suppressed track's id
 *     ("WebAudio-…", never an input id) with the inputs, so every
 *     devicechange looked like "current mic missing".
 */

export const SETTINGS_KEY = "descall_user_settings";
export const LEGACY_SETTINGS_KEY = "descall_settings";

function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function readSettings(storage) {
  if (!storage) return {};
  try {
    const primary = JSON.parse(storage.getItem(SETTINGS_KEY) || "{}");
    if (primary && Object.keys(primary).length) return primary;
    return JSON.parse(storage.getItem(LEGACY_SETTINGS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

/** { input, output } device ids ("" = system default). */
export function readAudioPrefs(storage = defaultStorage()) {
  const s = readSettings(storage);
  return {
    input: typeof s.selectedAudioIn === "string" ? s.selectedAudioIn : "",
    output: typeof s.selectedAudioOut === "string" ? s.selectedAudioOut : "",
  };
}

/** kind: "input" | "output". Writes both settings keys (Settings page reads them). */
export function writeAudioPref(kind, deviceId, storage = defaultStorage()) {
  if (!storage) return;
  const key = kind === "output" ? "selectedAudioOut" : "selectedAudioIn";
  const next = { ...readSettings(storage), [key]: deviceId || "" };
  try {
    const json = JSON.stringify(next);
    storage.setItem(SETTINGS_KEY, json);
    storage.setItem(LEGACY_SETTINGS_KEY, json);
  } catch {
    /* quota / private mode */
  }
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent("descall:audio-device-pref", { detail: { kind, deviceId: deviceId || "" } }));
    }
  } catch {
    /* ignore */
  }
}

/** The id when it is in the list (or the default), else "" (system default). */
export function pickAvailable(deviceId, devices = []) {
  const id = deviceId || "";
  if (!id || id === "default") return id === "default" ? "default" : "";
  return (devices || []).some((d) => d?.deviceId === id) ? id : "";
}

/** Track ids produced by Web Audio (noise suppression) are not input ids. */
export function isProcessedTrackId(id) {
  return /^WebAudio-/i.test(String(id || ""));
}

/** Real capture device id of the live mic (raw track when processed). */
export function liveMicDeviceId(stream, rawTrack) {
  const id = stream?.getAudioTracks?.()?.[0]?.getSettings?.()?.deviceId || "";
  if (id && !isProcessedTrackId(id)) return id;
  const raw = rawTrack?.getSettings?.()?.deviceId || "";
  return raw && !isProcessedTrackId(raw) ? raw : "";
}

// ── Output sink registry ────────────────────────────────────────────────

const sink = {
  id: "",
  elements: new Set(),
  contexts: new Set(),
  applied: new WeakMap(),
  log: (...args) => console.warn("[AudioOutput]", ...args),
};

export function getOutputSinkId() {
  return sink.id;
}

function sinkSupported(target) {
  return target && typeof target.setSinkId === "function";
}

async function applyTo(target, id) {
  if (!sinkSupported(target)) return { ok: false, skipped: true };
  if (sink.applied.get(target) === id) return { ok: true, unchanged: true };
  try {
    // AudioContext: "" is the default device; elements accept "" too.
    await target.setSinkId(id || "");
    sink.applied.set(target, id);
    return { ok: true };
  } catch (err) {
    sink.log("setSinkId failed", err?.name || String(err));
    return { ok: false, error: err?.name || "Error" };
  }
}

function prune() {
  for (const el of sink.elements) {
    if (el && el.isConnected === false && !el.srcObject) sink.elements.delete(el);
  }
  for (const ctx of sink.contexts) {
    if (ctx?.state === "closed") sink.contexts.delete(ctx);
  }
}

/** Every remote-audio element / boost AudioContext registers itself here. */
export function registerSinkElement(el) {
  if (!el) return () => {};
  sink.elements.add(el);
  if (sink.id || sink.applied.has(el)) void applyTo(el, sink.id);
  return () => sink.elements.delete(el);
}

export function registerSinkContext(ctx) {
  if (!ctx) return () => {};
  sink.contexts.add(ctx);
  if (sink.id || sink.applied.has(ctx)) void applyTo(ctx, sink.id);
  return () => sink.contexts.delete(ctx);
}

/**
 * Route all call audio to `deviceId` ("" = default). Media elements in the
 * document are included, so nothing playing call audio is missed.
 * Resolves { applied, failed, errors }.
 */
export async function setOutputSink(deviceId, { doc = typeof document !== "undefined" ? document : null } = {}) {
  sink.id = deviceId || "";
  prune();
  const targets = new Set([...sink.elements, ...sink.contexts]);
  try {
    doc?.querySelectorAll?.("audio, video")?.forEach?.((el) => targets.add(el));
  } catch {
    /* ignore */
  }
  let applied = 0;
  let failed = 0;
  const errors = [];
  for (const target of targets) {
    const res = await applyTo(target, sink.id);
    if (res.ok) applied += 1;
    else if (!res.skipped) {
      failed += 1;
      if (res.error) errors.push(res.error);
    }
  }
  return { applied, failed, errors };
}

/** Test hook. */
export function __resetSinkRegistry(log) {
  sink.id = "";
  sink.elements.clear();
  sink.contexts.clear();
  sink.applied = new WeakMap();
  if (log) sink.log = log;
}

// ── Microphone swap ─────────────────────────────────────────────────────

/**
 * Replace the call microphone without renegotiation: capture `deviceId`
 * (exact), keep the enabled state, RTCRtpSender.replaceTrack, swap it into the
 * local stream and stop the old track. Throws when capture fails; the old
 * track keeps sending in that case (it is only stopped after success).
 */
export async function swapMicTrack({ pc, stream, acquire, deviceId, excludeSenders = [], enabled }) {
  const old = stream?.getAudioTracks?.()?.[0] || null;
  const wasEnabled = enabled ?? (old ? old.enabled !== false : true);
  const fresh = await acquire(deviceId || "");
  const track = fresh?.getAudioTracks?.()?.[0];
  if (!track) throw Object.assign(new Error("no-audio-track"), { name: "NotFoundError" });
  track.enabled = wasEnabled;
  const senders = typeof pc?.getSenders === "function" ? pc.getSenders() : [];
  const skip = new Set(excludeSenders.filter(Boolean));
  const sender =
    senders.find((s) => !skip.has(s) && old && s.track === old) ||
    senders.find((s) => !skip.has(s) && s.track?.kind === "audio") ||
    (typeof pc?.getTransceivers === "function"
      ? pc.getTransceivers().find((t) => !t.stopped && !skip.has(t.sender) && t.receiver?.track?.kind === "audio")?.sender
      : null) ||
    null;
  if (sender) await sender.replaceTrack(track);
  if (stream) {
    for (const t of stream.getAudioTracks()) {
      try {
        stream.removeTrack(t);
      } catch {
        /* ignore */
      }
      if (t !== track) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }
    stream.addTrack(track);
  }
  return { track, sender, replaced: Boolean(sender) };
}

// ── iOS route menu model ────────────────────────────────────────────────

/**
 * Output rows for the iOS menu from the native AVAudioSession snapshot
 * (DescallAudioRouter.state()): [{ id, kind, name, selected }]. Bluetooth HFP
 * and wired headsets appear as "input:<uid>": choosing their input is how iOS
 * moves the call's output to AirPods / the headset, so they are outputs too.
 */
export function iosOutputRows(snapshot) {
  const selected = snapshot?.selected || "";
  return (snapshot?.routes || [])
    .filter((r) => r && r.id)
    .map((r) => ({ id: r.id, kind: r.kind || r.id, name: r.name || "", selected: r.id === selected }));
}

/** Built-in mic choice keeps the current built-in output (speaker / receiver). */
export function iosBuiltInMicRoute(snapshot) {
  const sel = snapshot?.selected || "";
  return sel === "receiver" ? "receiver" : "speaker";
}

/** Input rows: built-in microphone + external inputs ("input:<uid>"). */
export function iosInputRows(snapshot, builtInName = "iPhone") {
  const selected = snapshot?.selected || "";
  const inputs = (snapshot?.routes || []).filter((r) => r && String(r.id || "").startsWith("input:"));
  const externalSelected = inputs.some((r) => r.id === selected);
  const rows = [{ id: "builtin", kind: "builtin", name: builtInName, selected: !externalSelected }];
  for (const r of inputs) rows.push({ id: r.id, kind: r.kind || "input", name: r.name || r.id, selected: r.id === selected });
  return rows;
}

/**
 * Capture with the saved microphone (exact id); a device that is gone
 * (OverconstrainedError / NotFoundError) falls back to the system default.
 */
export async function acquirePreferredMic(acquire, base = {}, preferredId = readAudioPrefs().input) {
  const id = preferredId && preferredId !== "default" ? preferredId : "";
  if (!id) return acquire(base);
  try {
    return await acquire({ ...base, audio: { ...(typeof base.audio === "object" ? base.audio : {}), deviceId: { exact: id } } });
  } catch (err) {
    if (err?.name !== "OverconstrainedError" && err?.name !== "NotFoundError") throw err;
    console.warn("[CallAudio] saved microphone unavailable, using the default");
    return acquire(base);
  }
}
