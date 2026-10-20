// Stable participant tiles during reconnection + the leave transition.
// Run from frontend/: node src/lib/callTileState.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CALL_END_FADE_AT_MS,
  CALL_END_PILL_DELAY_MS,
  TILE_LEAVE_MS,
  dmRawStatus,
  dmTilePhase,
  groupTileTroubled,
  showReconnectOverlay,
  tileMotion,
} from "./callTileState.js";
import { createStatusDebouncer } from "./callConnectionMachine.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// 1. Phase: once live, trouble is "reconnecting" on the SAME tile — never
//    back to the connecting placeholder (that swap remounted the tile).
const base = { mode: "active", hasPeer: true };
assert.equal(dmTilePhase({ ...base, everLive: false, status: "connecting" }), "connecting");
assert.equal(dmTilePhase({ ...base, everLive: true, status: "connected" }), "live");
assert.equal(dmTilePhase({ ...base, everLive: true, status: "reconnecting" }), "reconnecting");
assert.equal(dmTilePhase({ ...base, everLive: true, status: "lost" }), "reconnecting");
assert.equal(dmTilePhase({ ...base, everLive: true, status: "connecting" }), "live", "a renegotiation is not a reconnect");
assert.equal(dmTilePhase({ ...base, everLive: false, status: "reconnecting" }), "connecting");
assert.equal(dmTilePhase({ ...base, everLive: true, status: "connected", ending: { at: 1 } }), "leaving");
assert.equal(dmTilePhase({ mode: null, hasPeer: false, everLive: false }), "hidden");

assert.equal(dmRawStatus({ mode: "active", peerConnectionState: "reconnecting", remoteMediaReady: true }), "reconnecting");
assert.equal(dmRawStatus({ mode: "active", peerConnectionState: "disconnected", remoteMediaReady: true }), "lost");
assert.equal(dmRawStatus({ mode: "active", peerConnectionState: "ended", remoteMediaReady: false }), "connected");
assert.equal(dmRawStatus({ mode: "active", peerConnectionState: "connected", remoteMediaReady: true, connectionQuality: "poor" }), "connected",
  "poor quality is not a reconnect (the old code flipped the tile on it)");

// 2. Simulated ICE blips: the visible phase stays "live" for short blips.
{
  const d = createStatusDebouncer({ initial: "connected" });
  const seen = new Set();
  let t = 0;
  for (const [raw, dur] of [["reconnecting", 400], ["connected", 3000], ["reconnecting", 600], ["connected", 2000]]) {
    d.push(raw, t);
    for (let s = 0; s < dur; s += 50) {
      t += 50;
      seen.add(dmTilePhase({ ...base, everLive: true, status: d.tick(t) }));
    }
  }
  assert.deepEqual([...seen], ["live"]);
  d.push("reconnecting", t);
  t += 800;
  assert.equal(dmTilePhase({ ...base, everLive: true, status: d.tick(t) }), "reconnecting");
  assert.ok(showReconnectOverlay("reconnecting"));
  assert.ok(!showReconnectOverlay("connected"));
}

// 3. Group tiles: trouble marks the tile instead of removing the person.
assert.ok(groupTileTroubled({ connectionState: "reconnecting" }));
assert.ok(groupTileTroubled({ connectionQuality: "failed" }));
assert.ok(!groupTileTroubled({ connectionState: "connected", connectionQuality: "poor" }));

// 4. Leave transition: fade + scale + blur, springs, reduced motion = crossfade.
{
  const m = tileMotion({ reduced: false });
  assert.equal(m.cell.leave.opacity, 0);
  assert.match(m.cell.leave.filter, /blur/);
  assert.ok(m.inner.leave.scale < 1 && m.inner.leave.scale >= 0.85);
  assert.equal(m.inner.shown.transition.type, "spring");
  assert.equal(m.cell.enter.transform, undefined, "grid cells must stay transform-free");
  const r = tileMotion({ reduced: true });
  assert.deepEqual(Object.keys(r.cell.leave).sort(), ["opacity", "transition"]);
  assert.equal(r.inner.leave.scale, undefined);
  assert.ok(TILE_LEAVE_MS >= 300 && TILE_LEAVE_MS <= 450);
  assert.ok(CALL_END_PILL_DELAY_MS < CALL_END_FADE_AT_MS);
}

// 5. Wiring: one stable tile (no AnimatePresence mode="wait" swap), overlay,
//    useCall keeps the overlay up for the transition, grid AnimatePresence.
{
  const slot = read("../components/voice/DmRemoteParticipantSlot.jsx");
  const overlay = read("../components/CallOverlay.jsx");
  const useCall = read("../hooks/useCall.js");
  const hook = read("../hooks/useDmRemoteParticipant.js");
  const css = read("../styles/call-grid.css");
  assert.doesNotMatch(slot, /AnimatePresence mode="wait"/);
  assert.match(slot, /<ReconnectOverlay show=\{reconnecting && live && showVideo\} \/>/, "pill only on video tiles; avatar tiles use the chip");
  assert.match(slot, /<ConnectionBadge status=\{dmChipStatus\(phase, connectionStatus\)\} \/>/, "chip follows the tile phase");
  assert.match(slot, /data-phase=\{phase\}/);
  assert.match(hook, /createStatusDebouncer/);
  assert.match(overlay, /<TileMotion key=\{`dm-remote-/);
  assert.match(overlay, /<TileMotion key=\{tile\.id\}>/);
  assert.match(overlay, /reconnecting=\{tile\.reconnecting\}/);
  assert.match(overlay, /call-ended-pill/);
  assert.match(overlay, /t\("Call ended"\)/);
  assert.doesNotMatch(overlay, /call\.declineIncoming\?\.\(\);\s*\}, 30_000\)/, "no local 30 s decline (it declined on every device)");
  assert.match(useCall, /export const CALL_ENDING_MS = \d+/);
  assert.match(useCall, /setEnding\(\{ reason/);
  assert.match(css, /\.call-reconnect-overlay/);
  assert.match(css, /\.call-ended-pill/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  const tr = read("../i18n/locales/tr.js");
  assert.match(tr, /"Reconnecting…": "Yeniden bağlanıyor…"/);
  assert.match(tr, /"Call ended": "Arama sona erdi"/);
}

console.log("callTileState.selftest ok");

// 2.13.6: chip and tile share one state.
{
  const { dmChipStatus } = await import("./callTileState.js");
  const assert = (await import("node:assert/strict")).default;
  assert.equal(dmChipStatus("reconnecting", "reconnecting"), "reconnecting");
  assert.equal(dmChipStatus("live", "connected"), "connected");
  assert.equal(dmChipStatus("live", "lost"), "disconnected");
  assert.equal(dmChipStatus("live", "reconnecting"), "reconnecting");
  console.log("dmChipStatus ok");
}
