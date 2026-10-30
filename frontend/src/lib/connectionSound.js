/**
 * The "disconnect" sound on a dropped realtime socket (3.1.1, owner report:
 * a random "diridirin" while idle, and on every iPhone app resume).
 *
 * The socket drops for harmless reasons: the phone suspends the app in the
 * background (the drop is noticed on resume), Wi-Fi changes, sleep, a server
 * deploy. It reconnects by itself, so the sound only means something while
 * the user is in a voice session (DM / group call, ringing, server voice).
 * Our own `socket.disconnect()` ("io client disconnect", sign-out) is silent.
 */
export function shouldPlayDisconnectSound(reason, voiceBusy) {
  if (reason === "io client disconnect") return false;
  return Boolean(voiceBusy);
}
