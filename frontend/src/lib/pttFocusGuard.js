/**
 * Push-to-talk held in the window, then the window loses focus (Alt+Tab, a click into a game
 * or another app while the key is down): the keyup goes to the other app, so the call never
 * heard "up" and the microphone stayed open until the next press (a hot mic). Seen on the
 * Tauri desktop app, where the in-call mini card and capsules make switching away mid-call
 * common; the same gap was in Electron and on the web.
 *
 * The guard tracks the in-window key and sends one "up" when the window blurs or the page
 * is hidden while it is held. Descall+ global push-to-talk ("global" events from the shell's
 * keyboard hook) reports the real key state from any window, so once it is seen the guard
 * leaves the release to it (otherwise holding the key while clicking into a game would cut
 * the mic that global push-to-talk exists to keep open).
 */
export function createPttFocusGuard(dispatch) {
  let held = false;
  let globalSeen = false;
  return {
    /** An in-window PTT key event (keydown / keyup that matched the accelerator). */
    key(down) {
      held = Boolean(down);
      dispatch({ down: held });
    },
    /** Any descall:ptt event; global ones mean the shell's hook owns the key state. */
    observe(detail) {
      if (detail && detail.source === "global") globalSeen = true;
    },
    /** window blur / page hidden. Returns true when it released the microphone. */
    lostFocus() {
      if (!held) return false;
      held = false;
      if (globalSeen) return false;
      dispatch({ down: false, source: "focus-lost" });
      return true;
    },
    get held() {
      return held;
    },
  };
}
