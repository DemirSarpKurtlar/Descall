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
 *
 * Each graph owns an AudioContext (its own audio render thread). They were
 * never closed: a group / server voice member you had boosted kept one alive
 * after they left. releasePlaybackGain(el) closes it when the element goes.
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
      // The boost graph plays through the context, not the element's sink.
      const unregister = registerSinkContext(ctx);
      graph = { ctx, gain: node, limiter, unregister };
      graphs.set(el, graph);
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

/** The element is going away (peer left, call ended): close its boost graph. */
export function releasePlaybackGain(el) {
  const graph = el ? graphs.get(el) : null;
  if (!graph) return false;
  graphs.delete(el);
  try { graph.unregister?.(); } catch { /* ignore */ }
  try {
    const p = graph.ctx.close();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* already closed */
  }
  return true;
}

/** Test hook: the graph of an element, or null. */
export function __playbackGraph(el) {
  return graphs.get(el) || null;
}
