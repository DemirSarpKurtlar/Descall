/**
 * Re-send this side's ICE candidates once the peer is reachable (27 Nov 2026).
 *
 * A DM callee whose app was not running has no socket while the caller
 * trickles its candidates; it only gets what the server buffered for the
 * ring. When that buffer missed them (fixed on the server, but older servers,
 * a cluster node switch or a socket that was down while gathering can still
 * lose some) the callee answers without any caller candidate and ICE never
 * connects: "Bağlanıyor…" until the call times out.
 *
 * So the side that already gathered re-sends its candidates of the current
 * ICE session when the peer is provably online and the link is not up yet:
 *   - the answer arrived (the callee's socket just sent it);
 *   - the peer asked for our media state (requestState: it just connected or
 *     reconnected; the native iOS engine sends it right after its answer).
 * Duplicates are harmless (addIceCandidate ignores a known candidate). Pure;
 * see localIceReplay.selftest.mjs.
 */

export const MAX_ICE_REPLAYS = 3;
export const MAX_LOGGED_CANDIDATES = 48;

function serialize(candidate) {
  if (!candidate) return null;
  try {
    if (typeof candidate.toJSON === "function") return candidate.toJSON();
  } catch {
    /* fall through */
  }
  if (typeof candidate.candidate !== "string" || !candidate.candidate) return null;
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    usernameFragment: candidate.usernameFragment ?? null,
  };
}

function ufragOf(c) {
  if (c && typeof c.usernameFragment === "string" && c.usernameFragment) return c.usernameFragment;
  const m = /\bufrag\s+(\S+)/.exec(String(c?.candidate || ""));
  return m ? m[1] : "";
}

export function isIceUp(pc) {
  const ice = pc?.iceConnectionState;
  return ice === "connected" || ice === "completed" || pc?.connectionState === "connected";
}

export function createLocalIceLog({ max = MAX_LOGGED_CANDIDATES, maxReplays = MAX_ICE_REPLAYS } = {}) {
  let owner = null;
  let ufrag = "";
  let list = [];
  let replays = 0;

  /** A new peer connection starts a new log. */
  function bind(pc) {
    if (pc === owner) return;
    owner = pc;
    ufrag = "";
    list = [];
    replays = 0;
  }

  /** onicecandidate (also the ones the socket could not send right then). */
  function add(pc, candidate) {
    bind(pc);
    const c = serialize(candidate);
    if (!c || !c.candidate) return false;
    const u = ufragOf(c);
    if (u && ufrag && u !== ufrag) {
      // ICE restart: the old session's candidates are dead.
      list = [];
      replays = 0;
    }
    if (u) ufrag = u;
    if (list.length >= max) return false;
    if (list.some((x) => x.candidate === c.candidate && x.sdpMid === c.sdpMid)) return false;
    list.push(c);
    return true;
  }

  /**
   * Candidates to re-send now, or [] (link already up, nothing gathered,
   * other pc, replay budget spent).
   */
  function takeReplay(pc) {
    if (!pc || pc !== owner || !list.length || isIceUp(pc) || replays >= maxReplays) return [];
    replays += 1;
    return list.slice();
  }

  return { bind, add, takeReplay, _state: () => ({ ufrag, size: list.length, replays }) };
}
