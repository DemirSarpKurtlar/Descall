import { useEffect } from "react";

const OFFSCREEN = "is-offscreen";

/**
 * One IntersectionObserver entry: hide a row far outside the scrollport
 * (content-visibility: auto via .is-offscreen), show it again near it.
 *
 * The row's real height is frozen into its placeholder size first, so hiding
 * it changes no layout. Before (send bug, Nov 2026): the placeholder was the
 * stylesheet's 88 px, so every hide / show moved everything below it, the
 * browser clamped scrollTop when the list sat at the bottom, and rows at the
 * margin flip-flopped as the shift moved them across it.
 */
export function applyOffscreen(entry, readStyle = defaultReadStyle) {
  const el = entry?.target;
  if (!el?.classList) return;
  const off = !entry.isIntersecting;
  if (off === el.classList.contains(OFFSCREEN)) return;
  if (off) {
    const box = Number(entry.boundingClientRect?.height) || 0;
    // Not laid out (0): keep the stylesheet placeholder.
    if (box > 0 && el.style) el.style.containIntrinsicHeight = `auto ${placeholderHeight(box, readStyle(el))}px`;
  }
  el.classList.toggle(OFFSCREEN, off);
}

/**
 * contain-intrinsic-height sizes the content box: padding and border come on
 * top. Desktop / iPad rows have 6 px padding, so the border-box height would
 * add 12 px per hidden row.
 */
export function placeholderHeight(borderBoxHeight, cs) {
  const n = (v) => parseFloat(v) || 0;
  const chrome = cs ? n(cs.paddingTop) + n(cs.paddingBottom) + n(cs.borderTopWidth) + n(cs.borderBottomWidth) : 0;
  // Not rounded: a half pixel per row adds up over a long history.
  return Math.max(0, Math.round(((Number(borderBoxHeight) || 0) - chrome) * 100) / 100);
}

function defaultReadStyle(el) {
  try {
    return typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  } catch {
    return null;
  }
}

/**
 * Mark message groups that sit well outside the scrollport so the browser
 * can skip their layout. Rows inside the margin stay fully painted, which
 * keeps avatar frames (they overflow the row) unclipped.
 *
 * A new message only re-observes the rows; hidden rows stay hidden. (Before:
 * every message un-hid all of them, about +1800 px of layout, and the new
 * observer hid them again a frame later, on every send and every receive.)
 */
export function useOffscreenRows(listRef, rowCount) {
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const nodes = list.querySelectorAll(".message-group");
    if (rowCount < 48 || nodes.length < 48 || typeof IntersectionObserver !== "function") {
      // A short list (or no observer) shows every row.
      list.querySelectorAll(`.message-group.${OFFSCREEN}`).forEach((node) => node.classList.remove(OFFSCREEN));
      return undefined;
    }
    const root = list.closest?.(".messages-container") || null;
    const io = new IntersectionObserver(
      (entries) => { for (const entry of entries) applyOffscreen(entry); },
      { root, rootMargin: "700px 0px", threshold: 0 }
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [listRef, rowCount]);
}
