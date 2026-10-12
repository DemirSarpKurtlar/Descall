import { useEffect } from "react";

/**
 * Mark message groups that sit well outside the scrollport so the browser
 * can skip their layout. Rows inside the margin stay fully painted, which
 * keeps avatar frames (they overflow the row) unclipped.
 */
export function useOffscreenRows(listRef, rowCount) {
  useEffect(() => {
    const list = listRef.current;
    if (!list || rowCount < 48) return undefined;
    const root = list.closest?.(".messages-container") || null;
    const nodes = list.querySelectorAll(".message-group");
    if (nodes.length < 48 || typeof IntersectionObserver !== "function") return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("is-offscreen", !entry.isIntersecting);
        }
      },
      { root, rootMargin: "700px 0px", threshold: 0 }
    );
    nodes.forEach((node) => io.observe(node));
    return () => {
      nodes.forEach((node) => node.classList.remove("is-offscreen"));
      io.disconnect();
    };
  }, [listRef, rowCount]);
}
