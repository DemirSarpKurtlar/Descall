/**
 * Is the full-screen call (CallOverlay) minimized? Shared so the phone "Ada" pill
 * (components/calls/AdaCallHost.jsx) can bring the full screen back from any
 * screen. Before this the flag lived inside CallOverlay and a minimized call on a
 * phone had no reliable way back. Tiny external store, no React import.
 */
let minimized = false;
const listeners = new Set();

export function getCallMinimized() {
  return minimized;
}

export function setCallMinimized(next) {
  const v = Boolean(next);
  if (v === minimized) return;
  minimized = v;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeCallMinimized(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
