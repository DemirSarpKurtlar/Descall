/**
 * Intentionally a no-op.
 *
 * Earlier versions rewrote the viewport meta and attached document-level
 * touch/gesture listeners. On iOS Safari that fought the keyboard shell and
 * could leave a solid black screen after boot. Pinch/zoom policy is handled
 * only via CSS (16px inputs) until we have a proven-safe approach.
 */
export function installMobileZoomLock() {
  /* no-op */
}
