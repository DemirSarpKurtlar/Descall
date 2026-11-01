/**
 * "Karakterini oluştur" (phase 5) on the engine side, kept out of WorldEngine.js:
 *  - saved looks from the server roster / `world:look` applied to avatars (and remembered
 *    for avatars created later, through engine.lookOverrides),
 *  - live preview of the local avatar while the panel is open,
 *  - the preview camera: eases to a flattering three-quarter front view of your own
 *    avatar, framed to the left of the panel, then lets you orbit; eases back on close.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { clampBoom } from "./collision.js";
import { resolveLook } from "./look.js";

const PREVIEW = { radius: 3.45, beta: 1.47, side: 0.3, frame: 0.66, height: 0.98 };
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
    this.view = null; // re-pick the angle from where you stand now
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

  /**
   * Pick the side angle and distance once per open: the three-quarter front view if the
   * line of sight is clear, otherwise the nearest angle where no furniture or wall sits
   * between the camera and the avatar (ray test against the room only).
   */
  chooseView() {
    const e = this.engine;
    const av = e.avatars.get(e.selfId);
    if (!av || !e.scene) return { side: PREVIEW.side, radius: PREVIEW.radius };
    const front = Math.atan2(Math.cos(av.yaw), Math.sin(av.yaw));
    const roomOnly = (m) => m.isEnabled() && m.isVisible && !m.metadata?.avatarId && !/^(COL_|ROOM_BOUNDS|FLOOR|shadow_|blob)/.test(m.name) && !/rug/i.test(m.name) && m.getTotalVertices() > 0;
    // the room's meshes have frozen world matrices and do not sync their bounding boxes;
    // bring the boxes to world space once so the ray test sees the furniture where it is
    for (const m of e.scene.meshes) {
      if (m.doNotSyncBoundingInfo && roomOnly(m)) m.getBoundingInfo().update(m.getWorldMatrix());
    }
    const blocked = (from, to) => {
      const d = to.subtract(from);
      const len = d.length();
      d.scaleInPlace(1 / len);
      try {
        return Boolean(e.scene.pickWithRay(new Ray(from.add(d.scale(0.4)), d, Math.max(0.1, len - 0.4)), roomOnly, true)?.hit);
      } catch {
        return false;
      }
    };
    let best = null;
    for (const side of [PREVIEW.side, -PREVIEW.side, 0, 0.6, -0.6, 0.95, -0.95]) {
      const a = front + side;
      const dir = new Vector3(Math.cos(a) * Math.sin(PREVIEW.beta), Math.cos(PREVIEW.beta), Math.sin(a) * Math.sin(PREVIEW.beta));
      const right = new Vector3(-Math.sin(a), 0, Math.cos(a));
      const target = new Vector3(av.position.x, av.position.y + PREVIEW.height, av.position.z).addInPlace(right.scale(PREVIEW.frame));
      const room = e.bounds ? clampBoom(target, dir, PREVIEW.radius, e.bounds, 0.25) : PREVIEW.radius;
      // the camera must see the feet, knees, middle and head: a sofa back between you and
      // the camera would hide the legs, a wall or a lamp the whole body
      for (const radius of [PREVIEW.radius, 3.0, 2.6, 2.2].filter((r) => r <= room + 1e-6)) {
        const cam = target.add(dir.scale(radius));
        const seen = [0.12, 0.62, PREVIEW.height, 1.75].every((h) => !blocked(new Vector3(av.position.x, av.position.y + h, av.position.z), cam));
        if (!seen) continue;
        if (radius >= PREVIEW.radius - 1e-6) return { side, radius };
        if (!best || radius > best.radius) best = { side, radius };
        break;
      }
    }
    return best || { side: PREVIEW.side, radius: 2.2 };
  }

  previewTarget(out) {
    const e = this.engine;
    const av = e.avatars.get(e.selfId);
    if (!av) return null;
    const yaw = av.yaw;
    if (!this.view) this.view = this.chooseView();
    const alpha = Math.atan2(Math.cos(yaw), Math.sin(yaw)) + this.view.side;
    const right = new Vector3(-Math.sin(alpha), 0, Math.cos(alpha));
    // mid-body (lower when seated), shifted so the avatar stands left of the panel
    const seated = av.state === "sit" || av.state === "sitDown";
    out.set(av.position.x, av.position.y + (seated ? PREVIEW.height - 0.3 : PREVIEW.height), av.position.z).addInPlace(right.scale(PREVIEW.frame));
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
      const want = this.view?.radius ?? PREVIEW.radius;
      const allowed = e.bounds ? clampBoom(c.target, dir, want, e.bounds, 0.25) : want;
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
    c.radius = this.view?.radius ?? PREVIEW.radius;
    this.cam.mode = "hold";
  }

  dispose() {
    if (this.cam?.observer) this.engine.scene?.onBeforeRenderObservable.remove(this.cam.observer);
    this.cam = null;
  }
}
