"use strict";

/** Pure voice / screen-share earning decisions (plan §4, §5). */

const PRESENCE_FRESH_MS = 45_000;
const INPUT_AFK_MS = 5 * 60_000;
const FRAME_STALE_MS = 2 * 60_000;
const OTHER_SPOKE_MS = 5 * 60_000;
const FRAME_DELTA_MIN = 0.01;

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string[]} p.others              other participants in this call
 * @param {(id:string)=>boolean} p.isRealOther  unlinked, not same subnet, risk < zero threshold
 * @param {(id:string)=>any} p.presenceOf  latest presence beat {at, visible, inputAt}
 * @param {object} p.self                  my state {inputAt, frameChangedAt, vadAt, vad}
 * @param {(id:string)=>number} p.lastSpokeAt
 * @param {number} p.now
 */
function evaluateScreenshare(p) {
  const now = p.now ?? Date.now();
  const self = p.self || {};
  if (!self.inputAt || now - self.inputAt > INPUT_AFK_MS) return { ok: false, reason: "sharer_afk" };
  if (!self.frameChangedAt || now - self.frameChangedAt > FRAME_STALE_MS) return { ok: false, reason: "static_screen" };
  const viewers = (p.others || []).filter((id) => {
    if (!p.isRealOther(id)) return false;
    const b = p.presenceOf(id);
    return b && now - b.at <= PRESENCE_FRESH_MS && b.visible && b.inputAt && now - b.inputAt <= INPUT_AFK_MS;
  });
  if (!viewers.length) return { ok: false, reason: "no_active_viewer" };
  return { ok: true, reason: null, viewers: viewers.length };
}

/** Returns a multiplier: 1 mutual talk, 0.5 only I talk, 0 not allowed. */
function evaluateVoice(p) {
  const now = p.now ?? Date.now();
  const self = p.self || {};
  if (!self.vad) return { ok: false, mult: 0, reason: "no_vad" };
  const real = (p.others || []).filter((id) => p.isRealOther(id));
  if (!real.length) return { ok: false, mult: 0, reason: "no_real_participant" };
  const mutual = real.some((id) => now - (p.lastSpokeAt(id) || 0) <= OTHER_SPOKE_MS);
  return { ok: true, mult: mutual ? 1 : 0.5, reason: mutual ? null : "one_sided" };
}

module.exports = { evaluateScreenshare, evaluateVoice, FRAME_DELTA_MIN, PRESENCE_FRESH_MS, INPUT_AFK_MS };
