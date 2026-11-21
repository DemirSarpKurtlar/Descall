import { useEffect, useRef } from "react";

/** Below this many messages the list is cheap enough to lay out in full. */
export const OFFSCREEN_MIN_MESSAGES = 48;
/** A few groups are enough when they are long (one sender, hundreds of bubbles). */
export const OFFSCREEN_MIN_GROUPS = 4;
const ROW_SELECTOR = ".message-group";

/**
 * Mark message groups that sit well outside the scrollport so the browser
 * can skip their layout. Rows inside the margin stay fully painted, which
 * keeps avatar frames (they overflow the row) unclipped.
 *
 * One observer lives for the list element. New rows (a new message, the
 * tail-first open filling in the older history, a loaded page) are observed
 * as they mount; rows already marked keep their class. Re-creating the
 * observer per message used to strip `is-offscreen` from every row first,
 * which laid out the whole history again on each incoming message.
 */
export function useOffscreenRows(listRef, rowCount) {
  const stateRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    const current = stateRef.current;
    const usable = Boolean(list) && rowCount >= OFFSCREEN_MIN_MESSAGES && typeof IntersectionObserver === "function";
    if (!usable) {
      if (current) destroyOffscreenTracker(current);
      stateRef.current = null;
      return;
    }
    const root = list.closest?.(".messages-container") || null;
    let st = current;
    if (st && (st.list !== list || st.root !== root)) {
      destroyOffscreenTracker(st);
      st = null;
    }
    if (!st) {
      if (list.querySelectorAll(ROW_SELECTOR).length < OFFSCREEN_MIN_GROUPS) return;
      st = createOffscreenTracker(list, root);
      stateRef.current = st;
    }
    syncOffscreenTracker(st);
  }, [listRef, rowCount]);

  useEffect(() => () => {
    if (stateRef.current) destroyOffscreenTracker(stateRef.current);
    stateRef.current = null;
  }, []);
}

export function createOffscreenTracker(list, root) {
  const st = { list, root, nodes: new Set(), io: null, mo: null, raf: 0 };
  st.io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle("is-offscreen", !entry.isIntersecting);
      }
    },
    { root, rootMargin: "700px 0px", threshold: 0 }
  );
  // Rows that mount without a message-count change (tail-first open, regrouping).
  if (typeof MutationObserver === "function") {
    st.mo = new MutationObserver(() => {
      if (st.raf || typeof requestAnimationFrame !== "function") return;
      st.raf = requestAnimationFrame(() => {
        st.raf = 0;
        syncOffscreenTracker(st);
      });
    });
    st.mo.observe(list, { childList: true });
  }
  return st;
}

export function syncOffscreenTracker(st) {
  for (const node of st.nodes) {
    if (node.parentNode !== st.list) {
      st.io.unobserve(node);
      st.nodes.delete(node);
    }
  }
  for (const node of st.list.querySelectorAll(`:scope > ${ROW_SELECTOR}`)) {
    if (st.nodes.has(node)) continue;
    st.nodes.add(node);
    st.io.observe(node);
  }
}

export function destroyOffscreenTracker(st) {
  if (st.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(st.raf);
  st.mo?.disconnect();
  st.io.disconnect();
  st.nodes.forEach((node) => node.classList.remove("is-offscreen"));
  st.nodes.clear();
}
