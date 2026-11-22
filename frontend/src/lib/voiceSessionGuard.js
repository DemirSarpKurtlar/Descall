/**
 * One voice session per device (feedback 2026-11-22, "2 sesli sohbet birden katılıyo").
 *
 * A server voice channel and a DM call / group call used to run side by side: joining a
 * voice channel during a call (or starting / accepting a call while sitting in a voice
 * channel) kept both microphones live and both rooms audible. Discord parity: the
 * session the user just entered wins and the other one is left.
 *
 * DM call and group call already exclude each other (useCall / useGroupCall decline the
 * other kind while busy); this only arbitrates server voice against them. An incoming
 * ring does not count: only a call the user placed or accepted. Pure:
 * voiceSessionGuard.selftest.mjs.
 */

const DM_SESSION_MODES = new Set(["outgoing", "active"]);

/** { dm, group, server } booleans for the current hook state. */
export function voiceSessionsOf({ call, groupCall, serverVoice } = {}) {
  return {
    dm: DM_SESSION_MODES.has(call?.mode),
    group: Boolean(groupCall?.isInCall),
    server: Boolean(serverVoice?.isInVoice),
    serverChannelId: serverVoice?.activeChannelId != null ? String(serverVoice.activeChannelId) : "",
  };
}

/**
 * Which sessions to end after a state change (prev -> next). Returns a subset of
 * ["dm", "group", "server"]. A server session "starts" when the user is newly in voice or
 * moved to another channel.
 */
export function voiceSessionsToEnd(prev, next) {
  const p = prev || { dm: false, group: false, server: false, serverChannelId: "" };
  const n = next || { dm: false, group: false, server: false, serverChannelId: "" };
  const callNow = n.dm || n.group;
  if (!n.server || !callNow) return [];
  const callStarted = (n.dm && !p.dm) || (n.group && !p.group);
  const serverStarted = !p.server || (n.serverChannelId && n.serverChannelId !== p.serverChannelId);
  if (callStarted && !serverStarted) return ["server"];
  if (serverStarted && !callStarted) return [n.dm ? "dm" : null, n.group ? "group" : null].filter(Boolean);
  // Both at once (state restored together) or neither changed (both were already up):
  // keep the call, the voice channel can be rejoined with one click.
  return ["server"];
}
