/**
 * "Karakterini oluştur" (phase 5) on the engine side, kept out of WorldEngine.js:
 *  - saved looks from the server roster / `world:look` applied to avatars (and remembered
 *    for avatars created later, through engine.lookOverrides),
 *  - live preview of the local avatar while the panel is open,
 *  - the preview camera: eases to a flattering three-quarter front view of your own
 *    avatar, framed to the left of the panel, then lets you orbit; eases back on close.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { clampBoom } from "./collision.js";
import { resolveLook } from "./look.js";

const PREVIEW = { radius: 2.75, beta: 1.36, side: 0.34, frame: 0.6, lift: 0.78 };
const EASE_IN_S = 1.1;
const EASE_OUT_S = 0.7;

function angleTo(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class Customizer {
  constructor(engine) {
    this.engine = engine;
    this.base = { ...(engine.lookOverrides || {}) }; // harness presets (by index)
    this.saved = new Map(); // userId -> saved spec (server)
    this.previewSpec = null;
    this.cam = null;
  }

  /** Server roster (members with .look). Updates existing avatars, seeds new ones. */
  setRoomLooks(members) {
    for (const m of members || []) {
      const id = String(m.id);
      if (m.look && typeof m.look === "object") this.saved.set(id, m.look);
    }
    this.syncOverrides();
    for (const m of members || []) this.refresh(String(m.id));
  }

  /** `world:look` from the server: { id, look }. */
  onRemoteLook(ev) {
    if (!ev || ev.id == null) return;
    const id = String(ev.id);
    if (ev.look && typeof ev.look === "object") this.saved.set(id, ev.look);
    else this.saved.delete(id);
    this.syncOverrides();
    if (id === this.engine.selfId && this.previewSpec) return; // keep the live preview while editing
    this.refresh(id);
  }

  /** The spec an avatar shows now (saved look, harness preset or the free default). */
  specFor(id) {
    const sid = String(id);
    return this.saved.get(sid) || null;
  }

  syncOverrides() {
    const o = { ...this.base };
    for (const [id, spec] of this.saved) o[id] = spec;
    this.engine.lookOverrides = o;
  }

  refresh(id) {
    const av = this.engine.avatars.get(id);
    if (!av) return;
    const o = this.engine.lookOverrides?.[id];
    if (o == null) return;
    const spec = typeof o === "object" ? o : null;
    if (!spec) return;
    this.apply(av, spec);
  }

  apply(av, spec) {
    const look = resolveLook(spec, av.id);
    if (av.look && av.look.face === look.face && av.look.groups.join() === look.groups.join() && JSON.stringify(av.look.colors) === JSON.stringify(look.colors)) return av.look;
    const before = [av.face];
    av.applyLook(look);
    this.syncMirror(av, before);
    return look;
  }

  syncMirror(av, before = []) {
    const e = this.engine;
    const list = e.mirror && e.mirrorAvatars ? e.mirror.renderList : null;
    if (!list) return;
    for (const m of before) {
      const i = m ? list.indexOf(m) : -1;
      if (i >= 0 && !m.isEnabled()) list.splice(i, 1);
    }
    for (const m of [av.dressed, av.face]) if (m && !list.includes(m)) list.push(m);
  }

  /** Live edit of your own avatar (panel). Pass null to go back to the saved look. */
  preview(spec) {
    const self = this.engine.avatars.get(this.engine.selfId);
    this.previewSpec = spec || null;
    if (!self) return null;
    const target = spec || this.specFor(this.engine.selfId);
    if (target) return this.apply(self, target);
    // no saved look: back to the default the room assigned
    return null;
  }

  /** The look your avatar wears now (for the panel's starting point). */
  currentSpec() {
    const self = this.engine.avatars.get(this.engine.selfId);
    return self?.look?.spec || null;
  }

  // ------------------------------------------------------------ preview camera

  openCamera() {
    const e = this.engine;
    if (!e.camera || !e.scene) return;
    if (this.cam?.observer) e.scene.onBeforeRenderObservable.remove(this.cam.observer);
    const c = e.camera;
    this.cam = {
      mode: "in",
      t: 0,
      last: e.nowMs(),
      restore: this.cam?.restore || { alpha: c.alpha, beta: c.beta, radius: c.radius, target: c.target.clone() },
    };
    e.cameraLocked = true;
    this.cam.observer = e.scene.onBeforeRenderObservable.add(() => this.stepCamera());
  }

  closeCamera() {
    if (!this.cam) return;
    this.cam.mode = "out";
    this.cam.t = 0;
  }

  previewTarget(out) {
    const e = this.engine;
    const av = e.avatars.get(e.selfId);
    if (!av) return null;
    const head = av.headPosition(new Vector3());
    const yaw = av.yaw;
    const alpha = Math.atan2(Math.cos(yaw), Math.sin(yaw)) + PREVIEW.side;
    const right = new Vector3(-Math.sin(alpha), 0, Math.cos(alpha));
    out.set(av.position.x, head.y - PREVIEW.lift, av.position.z).addInPlace(right.scale(PREVIEW.frame));
    return alpha;
  }

  stepCamera() {
    const e = this.engine;
    const st = this.cam;
    if (!st || e.disposed) return;
    const now = e.nowMs();
    const dt = Math.min(0.1, Math.max(0, (now - st.last) / 1000));
    st.last = now;
    st.t += dt;
    const c = e.camera;
    const k = 1 - Math.exp(-dt * 5.5);
    if (st.mode === "out") {
      const r = st.restore;
      c.alpha += angleTo(c.alpha, r.alpha) * k;
      c.beta += (r.beta - c.beta) * k;
      c.radius += (r.radius - c.radius) * k;
      c.target.copyFrom(Vector3.Lerp(c.target, r.target, k));
      if (st.t >= EASE_OUT_S) {
        e.scene.onBeforeRenderObservable.remove(st.observer);
        this.cam = null;
        e.cameraLocked = false;
      }
      return;
    }
    const target = new Vector3();
    const alpha = this.previewTarget(target);
    if (alpha == null) return;
    // follow the avatar always; force the framing only while easing in (then you can orbit / zoom)
    c.target.copyFrom(Vector3.Lerp(c.target, target, st.mode === "in" ? k : Math.min(1, dt * 6)));
    if (st.mode === "in") {
      c.alpha += angleTo(c.alpha, alpha) * k;
      c.beta += (PREVIEW.beta - c.beta) * k;
      const dir = new Vector3(Math.cos(c.alpha) * Math.sin(c.beta), Math.cos(c.beta), Math.sin(c.alpha) * Math.sin(c.beta));
      const allowed = e.bounds ? clampBoom(c.target, dir, PREVIEW.radius, e.bounds, 0.25) : PREVIEW.radius;
      c.radius += (allowed - c.radius) * k;
      if (st.t >= EASE_IN_S) st.mode = "hold";
    }
  }

  /** Jump straight to the end of the ease (evidence capture with stepped frames). */
  settleCamera() {
    if (!this.cam) return;
    const c = this.engine.camera;
    if (this.cam.mode === "out") {
      const r = this.cam.restore;
      Object.assign(c, { alpha: r.alpha, beta: r.beta, radius: r.radius });
      c.target.copyFrom(r.target);
      this.engine.scene.onBeforeRenderObservable.remove(this.cam.observer);
      this.cam = null;
      this.engine.cameraLocked = false;
      return;
    }
    const target = new Vector3();
    const alpha = this.previewTarget(target);
    if (alpha == null) return;
    c.target.copyFrom(target);
    c.alpha = alpha;
    c.beta = PREVIEW.beta;
    c.radius = PREVIEW.radius;
    this.cam.mode = "hold";
  }

  dispose() {
    if (this.cam?.observer) this.engine.scene?.onBeforeRenderObservable.remove(this.cam.observer);
    this.cam = null;
  }
}
