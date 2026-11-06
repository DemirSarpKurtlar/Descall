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
  // Height the HUD page measured for its own content (CSS px scaled to window px). The
  // heightFor() estimate is only the first guess: a two-line call row or long names made
  // the real content taller and the bottom of the friends list was cut off.
  let measuredH = 0;

  const id = `hud:${key}`;

  function bounds(state) {
    const w = Math.round(config.width * config.scale);
    const h = measuredH || Math.round(heightFor(state || {}) * config.scale);
    return kit.cornerBounds(config.corner, w, h, config.margin);
  }

  function show() {
    visible = true;
    kit.open({ id, kind, bounds: bounds(lastState), clickThrough: config.clickThrough, opacity: config.opacity, focusable: false, state: decorate(lastState), onAction });
    return { ok: true, visible: true };
  }

  function onAction(type, payload) {
    if (type !== 'size' || !payload) return;
    // The page measures its content in its own CSS px, which are window px here (the
    // overlay's zoom factor is 1 and the HUD's own scale is applied as CSS zoom, which the
    // measurement already includes).
    const need = Number(payload.need);
    if (!Number.isFinite(need)) return;
    const next = Math.max(60, Math.min(900, Math.round(need)));
    if (Math.abs(next - measuredH) < 2) return;
    measuredH = next;
    const o = kit.get(id);
    if (o) { try { o.win.setBounds(bounds(lastState)); } catch (_) { /* ignore */ } }
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
    if (!measuredH && heightFor(lastState) !== prevH) {
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
        measuredH = 0;
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
