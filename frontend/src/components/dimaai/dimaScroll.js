/** How close to the bottom counts as "follow the stream". */
export const DIMA_STICK_THRESHOLD_PX = 120;

/** True when the thread scroller is pinned near the latest message. */
export function isDimaScrollerNearBottom(el, thresholdPx = DIMA_STICK_THRESHOLD_PX) {
  if (!el) return true;
  const height = Number(el.scrollHeight) || 0;
  const top = Number(el.scrollTop) || 0;
  const view = Number(el.clientHeight) || 0;
  return height - top - view <= thresholdPx;
}
