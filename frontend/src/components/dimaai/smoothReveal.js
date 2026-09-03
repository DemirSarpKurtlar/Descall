/**
 * Reveal streamed text smoothly. Speeds up when backlog is large so long
 * pauses followed by a big chunk still feel like typing, not a dump.
 */
export function createSmoothRevealer({
  onUpdate,
  minCharsPerTick = 2,
  maxCharsPerTick = 18,
  intervalMs = 16,
  preferWords = true,
} = {}) {
  let pending = "";
  let shown = "";
  let timer = null;
  let closed = false;

  const clear = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const charsThisTick = () => {
    const backlog = pending.length;
    if (backlog > 400) return maxCharsPerTick;
    if (backlog > 160) return Math.max(minCharsPerTick, Math.floor(maxCharsPerTick * 0.75));
    if (backlog > 60) return Math.max(minCharsPerTick, Math.floor(maxCharsPerTick * 0.5));
    return minCharsPerTick;
  };

  const takeChunk = () => {
    if (!pending) return "";
    const target = charsThisTick();
    if (!preferWords || pending.length <= target) {
      const take = pending.slice(0, Math.max(1, target));
      pending = pending.slice(take.length);
      return take;
    }
    let n = target;
    const slice = pending.slice(0, Math.min(pending.length, target + 16));
    const space = slice.search(/\s/);
    if (space >= target) n = space + 1;
    else if (space > 0 && space < target) n = Math.max(target, space + 1);
    const take = pending.slice(0, n);
    pending = pending.slice(n);
    return take;
  };

  const tick = () => {
    timer = null;
    if (closed) return;
    const piece = takeChunk();
    if (!piece) return;
    shown += piece;
    onUpdate?.(shown, piece);
    if (pending) {
      // Faster ticks when catching up a large backlog.
      const wait = pending.length > 200 ? 8 : intervalMs;
      timer = setTimeout(tick, wait);
    }
  };

  return {
    push(chunk) {
      if (closed || chunk == null) return;
      pending += String(chunk);
      if (timer == null) timer = setTimeout(tick, intervalMs);
    },
    flush() {
      clear();
      if (pending) {
        shown += pending;
        pending = "";
        onUpdate?.(shown, "");
      }
      return shown;
    },
    getShown: () => shown,
    getPending: () => pending,
    isBusy: () => Boolean(pending) || timer != null,
    dispose() {
      closed = true;
      clear();
    },
  };
}
