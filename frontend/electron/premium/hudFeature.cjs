'use strict';

/**
 * Shared logic for the voice HUD and the gaming HUD (Ultra). Both are click-through,
 * always-on-top, transparent windows driven entirely by state the renderer pushes
 * (throttled there to a few updates per second). Off until the user turns them on.
 */

const kit = require('./overlayKit.cjs');

function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

function normalizeConfig(raw = {}, defaults) {
  const corner = ['tl', 'tr', 'bl', 'br'].includes(raw.corner) ? raw.corner : defaults.corner;
  return {
    corner,
    margin: clampNum(raw.margin, 0, 400, 16),
    scale: clampNum(raw.scale, 0.75, 1.5, 1),
    opacity: clampNum(raw.opacity, 0.3, 1, 0.92),
    width: clampNum(raw.width, 160, 520, defaults.width),
    clickThrough: raw.clickThrough !== false,
  };
}

function createHudFeature({ key, kind, defaults, heightFor }) {
  let ctx = null;
  let config = normalizeConfig({}, defaults);
  let lastState = null;
  let visible = false;

  const id = `hud:${key}`;

  function bounds(state) {
    const w = Math.round(config.width * config.scale);
    const h = Math.round(heightFor(state || {}) * config.scale);
    return kit.cornerBounds(config.corner, w, h, config.margin);
  }

  function show() {
    visible = true;
    kit.open({ id, kind, bounds: bounds(lastState), clickThrough: config.clickThrough, opacity: config.opacity, focusable: false, state: decorate(lastState) });
    return { ok: true, visible: true };
  }

  function hide() {
    visible = false;
    kit.close(id);
    return { ok: true, visible: false };
  }

  function decorate(state) {
    return state ? { ...state, scale: 1 } : { scale: 1 };
  }

  function update(state) {
    const prevH = heightFor(lastState || {});
    lastState = state && typeof state === 'object' ? state : {};
    if (!visible) return { ok: true, visible: false };
    const o = kit.get(id);
    if (!o) return show();
    if (heightFor(lastState) !== prevH) {
      try { o.win.setBounds(bounds(lastState)); } catch (_) { /* ignore */ }
    }
    kit.send(id, decorate(lastState));
    return { ok: true, visible: true };
  }

  return {
    key,
    start(c) {
      ctx = c;
      config = normalizeConfig(ctx.store(key).read({}), defaults);
      ctx.handle(`premium:${key}:open`, () => show());
      ctx.handle(`premium:${key}:close`, () => hide());
      ctx.handle(`premium:${key}:state`, (_e, state) => update(state));
      ctx.handle(`premium:${key}:config`, (_e, raw) => {
        config = normalizeConfig(raw || {}, defaults);
        ctx.store(key).write(config);
        if (visible) show();
        return { ok: true, config };
      });
      ctx.handle(`premium:${key}:status`, () => ({ ok: true, visible, config, bounds: kit.get(id)?.win.getBounds() || null }));
    },
    stop() {
      hide();
      ctx = null;
    },
    _normalizeConfig: normalizeConfig,
  };
}

module.exports = { createHudFeature, normalizeConfig };
