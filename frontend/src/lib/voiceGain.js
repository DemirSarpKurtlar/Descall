/**
 * Playback gain for a remote <audio> element.
 * HTMLMediaElement.volume stops at 1, so 100–200% goes through a GainNode.
 * The graph is created only the first time someone asks for a boost, and
 * after that every level (including mute) stays on that node.
 *
 * Boost: the GainNode alone pushed loud speech past full scale, and the
 * output hard-clipped (crackle on the loud syllables at 150–200%). A limiter
 * (DynamicsCompressorNode set as a brick wall just under 0 dBFS) now sits
 * after the gain, so a boost makes quiet voices louder without clipping.
 */

import { registerSinkContext, registerSinkElement } from "./callAudioDevices.js";

const graphs = new WeakMap();

/** Brick-wall limiter just under full scale (DynamicsCompressorNode values). */
export const BOOST_LIMITER = Object.freeze({
  threshold: -1.5,
  knee: 0,
  ratio: 20,
  attack: 0.002,
  release: 0.15,
});

function buildLimiter(ctx) {
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = BOOST_LIMITER.threshold;
  node.knee.value = BOOST_LIMITER.knee;
  node.ratio.value = BOOST_LIMITER.ratio;
  node.attack.value = BOOST_LIMITER.attack;
  node.release.value = BOOST_LIMITER.release;
  return node;
}

export function applyPlaybackGain(el, gain) {
  const level = Math.max(0, Math.min(2, Number(gain) || 0));
  if (!el) return level;
  // Every remote-audio element passes through here: follow the chosen speaker.
  registerSinkElement(el);
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
    let ctx = null;
    try {
      ctx = new AC();
      const source = ctx.createMediaElementSource(el);
      const node = ctx.createGain();
      const limiter = buildLimiter(ctx);
      source.connect(node);
      node.connect(limiter);
      limiter.connect(ctx.destination);
      graph = { ctx, gain: node, limiter };
      graphs.set(el, graph);
      // The boost graph plays through the context, not the element's sink.
      registerSinkContext(ctx);
    } catch {
      try { ctx?.close?.(); } catch { /* ignore */ }
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

/** Test hook: the graph of an element, or null. */
export function __playbackGraph(el) {
  return graphs.get(el) || null;
}
