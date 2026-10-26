/** Status menu ("Durum ayarla") placement in the glass UI. */
/** Gap between the toolbar avatar and the status menu under it (pt). */
export const GLASS_STATUS_GAP = 8;

/**
 * Toolbar avatar's box (GlassMeButton). The status menu hangs from it:
 * left-aligned with it, GLASS_STATUS_GAP below it. null when it is not on
 * screen; the CSS fallback then uses the same toolbar metrics.
 */
export function glassStatusAnchor(doc = typeof document !== "undefined" ? document : null) {
  const el = doc?.querySelector?.('[data-gid="toolbar-avatar"]');
  const r = el?.getBoundingClientRect?.();
  if (!r || r.width <= 0 || r.height <= 0) return null;
  return { left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
}

export function glassStatusMenuStyle(anchor) {
  if (!anchor) return { "--g-mat-origin": "22px 0%" };
  return {
    "--g-status-left": `${anchor.left}px`,
    "--g-status-top": `${anchor.bottom + GLASS_STATUS_GAP}px`,
    // Grows out of the avatar's centre.
    "--g-mat-origin": `${Math.round(anchor.width / 2)}px 0%`,
  };
}
