/**
 * Jump to the first unread message (messaging phase 4).
 *
 * A chat opens at its newest message. When the "Yeni mesajlar" separator is
 * then above the visible area, a glass pill at the top offers to jump to it
 * (also Shift+PageUp, see lib/shortcuts). The pill goes away for that chat
 * once the separator has been on screen, after a jump, or when dismissed.
 */

/**
 * Space a floating header takes at the top of the scroller: its
 * scroll-padding-top (desktop floating header) or, on the phone glass
 * layout, how far the chat header overlaps the scroller.
 */
export function headerSpaceOf(scroller) {
  if (!scroller || typeof window === "undefined") return 0;
  let space = 0;
  try {
    space = parseFloat(window.getComputedStyle(scroller).scrollPaddingTop) || 0;
    const head = scroller.closest?.(".main-panel")?.querySelector?.(".chat-top-chrome .panel-header");
    if (head) space = Math.max(space, headerOverlap(head.getBoundingClientRect(), scroller.getBoundingClientRect()));
  } catch {
    /* ignore */
  }
  return space;
}

/**
 * `top` of the pill row inside the chat panel (.main-panel): just under the
 * chat header. The row is a child of the panel, not of the scroller, so it
 * paints above the phone header's scroll-edge fade.
 */
export function pillTopFor({ headerBottom = null, hostTop = 0, gap = 8 }) {
  if (!Number.isFinite(headerBottom)) return gap;
  return Math.max(0, Math.round(headerBottom - hostTop)) + gap;
}

export function pillTopIn(host) {
  const head = host?.querySelector?.(".chat-top-chrome .panel-header");
  if (!head) return pillTopFor({});
  return pillTopFor({ headerBottom: head.getBoundingClientRect().bottom, hostTop: host.getBoundingClientRect().top });
}

/** px of the header that sits over the scroller's top edge (0 when it is above it). */
export function headerOverlap(headRect, scrollerRect) {
  if (!headRect || !scrollerRect) return 0;
  return Math.max(0, Math.round(headRect.bottom - scrollerRect.top));
}

/**
 * true when the separator sits above what the reader sees (show the pill),
 * false once any of it is visible under the header.
 */
export function separatorAbove({ sepBottom, scrollerTop, headerSpace = 0, slack = 4 }) {
  if (!Number.isFinite(sepBottom) || !Number.isFinite(scrollerTop)) return false;
  return sepBottom < scrollerTop + headerSpace + slack;
}

/** scrollTop that puts the separator just under the header. */
export function jumpTarget({ scrollTop, sepTop, scrollerTop, headerSpace = 0, gap = 8 }) {
  return Math.max(0, Math.round(scrollTop + (sepTop - scrollerTop) - headerSpace - gap));
}

/** Window event the keyboard shortcut sends to the open message list. */
export const JUMP_UNREAD_EVENT = "descall:jump-unread";
