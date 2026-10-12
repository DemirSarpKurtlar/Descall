/**
 * Playback gain for a remote <audio> element.
 * HTMLMediaElement.volume stops at 1, so 100–200% goes through a GainNode.
 * The graph is created only the first time someone asks for a boost, and
 * after that every level (including mute) stays on that node.
 */

const graphs = new WeakMap();

export function applyPlaybackGain(el, gain) {
  const level = Math.max(0, Math.min(2, Number(gain) || 0));
  if (!el) return level;
  const existing = graphs.get(el);
  if (!existing && level <= 1) {
    el.volume = level;
    return level;
  }
  let graph = existing;
  if (!graph) {
    const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) {
      el.volume = Math.min(1, level);
      return Math.min(1, level);
    }
    try {
      const ctx = new AC();
      const source = ctx.createMediaElementSource(el);
      const node = ctx.createGain();
      source.connect(node);
      node.connect(ctx.destination);
      graph = { ctx, gain: node };
      graphs.set(el, graph);
    } catch {
      el.volume = Math.min(1, level);
      return Math.min(1, level);
    }
  }
  el.volume = 1;
  graph.gain.gain.value = level;
  if (graph.ctx.state === "suspended") {
    graph.ctx.resume().catch(() => {});
  }
  return level;
}
