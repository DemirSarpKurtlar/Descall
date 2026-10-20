// Bundled by run.mjs for the WebKit call e2e (real iceConfig + peer factory).
import { ensureIceServersForCall, getIceServers, preloadIceServers, iceServersHaveTurn } from "../../src/lib/iceConfig.js";
import { createPeerConnection, commitLocalDescription } from "../../src/lib/webrtcPeerFactory.js";

function toneStream() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const dst = ctx.createMediaStreamDestination();
  osc.connect(dst); osc.start();
  return dst.stream;
}

window.runPeer = async ({ role, mode, timeoutMs = 15000 }) => {
  const ch = new BroadcastChannel("call-e2e");
  // App start preloads; the server hands out credentials that expire (the
  // phone then sits in the background) → the sync getter is STUN-only.
  await preloadIceServers();
  const iceServers = mode === "fixed" ? await ensureIceServersForCall({ timeoutMs: 3000 }) : getIceServers();
  const pc = createPeerConnection({ iceServers });
  const stream = toneStream();
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  const pending = [];
  pc.onicecandidate = (e) => { if (e.candidate) ch.postMessage({ from: role, ice: e.candidate.toJSON() }); };
  ch.onmessage = async ({ data }) => {
    if (data.from === role) return;
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      for (const c of pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (data.sdp.type === "offer") {
        const ans = await pc.createAnswer();
        await commitLocalDescription(pc, ans);
        ch.postMessage({ from: role, sdp: { type: "answer", sdp: pc.localDescription.sdp } });
      }
    } else if (data.ice) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.ice).catch(() => {});
      else pending.push(data.ice);
    } else if (data.ready && role === "caller") {
      const offer = await pc.createOffer();
      await commitLocalDescription(pc, offer);
      ch.postMessage({ from: role, sdp: { type: "offer", sdp: pc.localDescription.sdp } });
    }
  };
  if (role === "callee") ch.postMessage({ from: role, ready: true });
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (pc.connectionState === "failed") break;
    if (pc.connectionState === "connected") {
      const stats = await pc.getStats();
      let inPk = 0, pair = null;
      stats.forEach((s) => {
        if (s.type === "inbound-rtp" && s.kind === "audio") inPk = s.packetsReceived;
        if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") {
          pair = `${stats.get(s.localCandidateId)?.candidateType}/${stats.get(s.remoteCandidateId)?.candidateType}`;
        }
      });
      if (inPk > 5) return { ok: true, ms: Math.round(performance.now() - t0), pair, inPk, hadTurn: iceServersHaveTurn(iceServers) };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { ok: false, state: pc.connectionState, ice: pc.iceConnectionState, hadTurn: iceServersHaveTurn(iceServers) };
};
