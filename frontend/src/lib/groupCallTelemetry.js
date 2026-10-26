/**
 * 3.0.0 (A0): aggregate setup telemetry for group mesh calls and server voice
 * (LiveKit). One summary per call / join, sent through callTelemetry.js:
 *
 *   kind        "group" | "server"
 *   peers       most peers seen at once (mesh) / remote participants (SFU)
 *   peersAudio  peers we received audio packets from
 *   firstAudioMs ms from join to the first inbound audio packet of any peer
 *   silentPeers peers whose outbound audio packetsSent stayed 0 (our mic
 *               never reached them: the "they can't hear me" case)
 *   marks       gumStart, gumEnd, tokenMs, lkConnectMs, lkFirstAudioMs, ...
 *
 * No ids, names or counts that could identify anyone.
 */

const POLL_MS = 500;
const MAX_WATCH_MS = 20_000;

export function createGroupCallTelemetry({
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  send = () => {},
  context = () => ({}),
  pollMs = POLL_MS,
  maxWatchMs = MAX_WATCH_MS,
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
} = {}) {
  let st = null;
  let timer = null;

  function stop() {
    if (timer != null) clearTimer(timer);
    timer = null;
  }

  function begin(kind, direction, callType = "voice") {
    stop();
    st = {
      t0: now(),
      kind: kind === "server" ? "server" : "group",
      direction: direction || "outgoing",
      callType: callType || "voice",
      marks: {},
      extra: {},
      peers: new Map(), // opaque key -> { sent, received }
      maxPeers: 0,
      reconnects: 0,
      done: false,
    };
  }

  function mark(name) {
    if (!st || st.done || st.marks[name] != null) return;
    st.marks[name] = Math.round(now() - st.t0);
  }

  function set(key, value) {
    if (!st || st.done) return;
    st.extra[key] = value;
  }

  function countReconnect() {
    if (st && !st.done) st.reconnects += 1;
  }

  /** Feed one stats sample for a peer (key is only used locally). */
  function notePeer(key, { sent = 0, received = 0 } = {}) {
    if (!st || st.done || key == null) return;
    const prev = st.peers.get(key) || { sent: 0, received: 0 };
    const next = { sent: Math.max(prev.sent, Number(sent) || 0), received: Math.max(prev.received, Number(received) || 0) };
    st.peers.set(key, next);
    st.maxPeers = Math.max(st.maxPeers, st.peers.size);
    if (next.received > 0) mark("firstAudio");
  }

  async function sampleOnce(getPeers) {
    if (!st || st.done) return;
    let entries = [];
    try {
      entries = Array.from(getPeers() || []);
    } catch {
      entries = [];
    }
    await Promise.all(
      entries.map(async ([key, pc]) => {
        if (!pc || typeof pc.getStats !== "function" || pc.connectionState === "closed") return;
        try {
          const stats = await pc.getStats();
          let sent = 0;
          let received = 0;
          stats.forEach((r) => {
            if (r.kind !== "audio") return;
            if (r.type === "outbound-rtp") sent += Number(r.packetsSent) || 0;
            if (r.type === "inbound-rtp") received += Number(r.packetsReceived) || 0;
          });
          notePeer(key, { sent, received });
        } catch {
          /* ignore */
        }
      })
    );
  }

  /** Poll [key, RTCPeerConnection] pairs until every peer flows both ways. */
  function watch(getPeers) {
    if (!st || st.done || timer != null) return;
    const startedAt = now();
    let busy = false;
    timer = setTimer(async () => {
      if (!st || st.done) return stop();
      if (now() - startedAt > maxWatchMs) return stop();
      if (busy) return;
      busy = true;
      try {
        await sampleOnce(getPeers);
        const peers = Array.from(st?.peers?.values() || []);
        if (peers.length && peers.every((p) => p.sent > 0 && p.received > 0)) stop();
      } finally {
        busy = false;
      }
    }, pollMs);
  }

  function summary(result) {
    const peers = Array.from(st.peers.values());
    const m = st.marks;
    return {
      kind: st.kind,
      direction: st.direction,
      callType: st.callType,
      result,
      ...m,
      peers: st.maxPeers,
      peersAudio: peers.filter((p) => p.received > 0).length,
      silentPeers: peers.filter((p) => p.sent === 0).length,
      firstAudioMs: m.firstAudio ?? null,
      reconnects: st.reconnects,
      // set() values win (SFU: peers / media come from the LiveKit room).
      ...st.extra,
      ...context(),
    };
  }

  function finish(result = "ended") {
    if (!st || st.done) return null;
    stop();
    const s = summary(result);
    st.done = true;
    try {
      send(s);
    } catch {
      /* ignore */
    }
    return s;
  }

  return { begin, mark, set, countReconnect, notePeer, sampleOnce, watch, finish, _state: () => st };
}
