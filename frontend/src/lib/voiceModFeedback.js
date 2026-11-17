/**
 * Voice moderation feedback (server mute / deafen / move / disconnect / stage role).
 * The action closes its menu at once and the server answers a moment later, so the
 * error toast cannot live inside the menu (it was unmounted and the error was lost).
 * `armVoiceModFeedback(toast)` listens for the next `descall:server-voice-mod-error`
 * (dispatched by useServerVoice) for a few seconds, independent of any component.
 */
export const VOICE_MOD_ERROR_EVENT = "descall:server-voice-mod-error";
const WINDOW_MS = 6000;

let disarm = null;

export function armVoiceModFeedback(toast, { target = typeof window !== "undefined" ? window : null, windowMs = WINDOW_MS } = {}) {
  if (!target || typeof toast !== "function") return () => {};
  disarm?.();
  const onError = (event) => {
    const message = event?.detail?.message;
    if (message) toast(message, "error");
    stop();
  };
  const timer = setTimeout(() => stop(), windowMs);
  function stop() {
    clearTimeout(timer);
    target.removeEventListener(VOICE_MOD_ERROR_EVENT, onError);
    if (disarm === stop) disarm = null;
  }
  target.addEventListener(VOICE_MOD_ERROR_EVENT, onError);
  disarm = stop;
  return stop;
}
