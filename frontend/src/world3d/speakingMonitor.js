/**
 * Speaking detection for the 3D world without React state.
 *
 * The flat call UI meters every tile with useVoiceActivity, which sets React state on
 * every level change (up to 25 times a second per speaker). Inside the world that meant
 * a React commit per sample for every member. Here each member's stream is subscribed
 * to the shared analyser graph (lib/voiceActivity.js) directly, the same gate and hold
 * decide "speaking", and only the on / off edges are reported (to the engine for the
 * mouth and to the name tag's class), never the level.
 */
import { subscribeVoiceActivity } from "../lib/voiceActivity";
import { createSpeakingGate, SPEAKING_ATTACK_MS, SPEAKING_HOLD_MS, SPEAKING_RELEASE_MS } from "../lib/voiceActivityMath";
import { speakingThreshold } from "../lib/voiceProfile";

/**
 * onChange(id, speaking) fires on edges only. update(members) takes [{ id, stream, muted }].
 * External speaker ids (LiveKit active speakers) merge in through setExternal(ids).
 */
export function createSpeakingMonitor({ onChange, holdMs = SPEAKING_HOLD_MS } = {}) {
  const subs = new Map(); // id -> { stream, muted, unsub, gate, raw, held, timer }
  const state = new Map(); // id -> combined speaking (last reported)
  let external = new Set();

  const emit = (id) => {
    const s = subs.get(id);
    const v = Boolean((s && (s.raw || s.held)) || external.has(id));
    if (state.get(id) === v) return;
    state.set(id, v);
    onChange?.(id, v);
  };

  function setRaw(id, on) {
    const s = subs.get(id);
    if (!s || s.raw === on) return;
    s.raw = on;
    if (on) {
      clearTimeout(s.timer);
      s.timer = 0;
      s.held = true;
    } else {
      // keep the ring through short gaps between words (same hold as the call tiles)
      clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = 0;
        s.held = false;
        emit(id);
      }, holdMs);
    }
    emit(id);
  }

  function drop(id) {
    const s = subs.get(id);
    if (!s) return;
    s.unsub?.();
    clearTimeout(s.timer);
    subs.delete(id);
    emit(id);
  }

  return {
    update(members = []) {
      const seen = new Set();
      for (const m of members) {
        const id = String(m.id);
        seen.add(id);
        const stream = m.muted ? null : m.stream || null;
        const cur = subs.get(id);
        if (cur && cur.stream === stream) continue;
        if (cur) drop(id);
        if (!stream) continue;
        const gate = createSpeakingGate({ onThreshold: speakingThreshold(), attackMs: SPEAKING_ATTACK_MS, releaseMs: SPEAKING_RELEASE_MS });
        const entry = { stream, gate, raw: false, held: false, timer: 0, unsub: null };
        subs.set(id, entry);
        entry.unsub = subscribeVoiceActivity(stream, { onRms: (rms, now) => setRaw(id, gate.push(rms, now)) });
      }
      for (const id of [...subs.keys()]) if (!seen.has(id)) drop(id);
      for (const id of [...state.keys()]) if (!seen.has(id) && !external.has(id)) emit(id);
    },
    setExternal(ids) {
      const next = new Set([...(ids || [])].map(String));
      const touched = new Set([...external, ...next]);
      external = next;
      for (const id of touched) emit(id);
    },
    isSpeaking(id) {
      return Boolean(state.get(String(id)));
    },
    dispose() {
      for (const id of [...subs.keys()]) {
        const s = subs.get(id);
        s.unsub?.();
        clearTimeout(s.timer);
      }
      subs.clear();
      state.clear();
    },
  };
}
