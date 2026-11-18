/**
 * Layout-independent world keys (polish world-social-15): WASD / E / B / G follow the
 * physical key (KeyboardEvent.code), so they also work on Russian, Greek or other
 * non-Latin layouts; e.key is only the fallback when code is missing.
 */
const CODE_TO_KEY = {
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
  KeyE: "e",
  KeyB: "b",
  KeyG: "g",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  Escape: "escape",
};

/** Internal key name for a keyboard event ("w", "arrowup", "shift", ...), or "". */
export function worldKeyOf(e) {
  if (!e) return "";
  const byCode = CODE_TO_KEY[e.code];
  if (byCode) return byCode;
  return String(e.key || "").toLowerCase();
}
