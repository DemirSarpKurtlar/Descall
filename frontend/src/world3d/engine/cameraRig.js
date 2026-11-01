/**
 * Camera rig of the 3D world: one TargetCamera driven by hand in three modes
 * (cameraModes.js has the pure rules and the tests).
 *
 *   third  orbit follow: drag to orbit, wheel zooms (1.6 - 9 m), damped yaw / pitch /
 *          zoom / focus, a slight right-shoulder offset while following, and the boom pulls
 *          in so the camera never leaves the room
 *   first  eye of the avatar (the engine passes the eye point), pointer-lock mouse look
 *   free   detached flight inside the room box
 *
 * Mode changes blend position, view direction and FOV over MODE_BLEND_MS. Nothing here
 * allocates per frame.
 */
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { clampBoom } from "./collision.js";
import {
  PITCH_LIMITS,
  applyLook,
  blendDone,
  blendWeight,
  createCameraState,
  cycleMode,
  damp,
  dampAngle,
  lookDirection,
  modePolicy,
  returnToAvatar,
  stepFreeCam,
  switchMode,
  zoomRadius,
} from "./cameraModes.js";

const DEG = Math.PI / 180;
const THIRD_PITCH = [0.05, 1.2];
const ZOOM = [1.6, 9];
const SHOULDER = 0.32;
const DRAG_PX = 6;

export class CameraRig {
  constructor(scene, canvas, { bounds, prefs, onModeChange, onPointerLock } = {}) {
    this.scene = scene;
    this.canvas = canvas;
    this.bounds = bounds;
    this.cb = { onModeChange, onPointerLock };
    const cam = new TargetCamera("cam", new Vector3(3, 1.6, 0), scene);
    cam.minZ = 0.05;
    cam.maxZ = 120;
    cam.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
    this.camera = cam;
    this.prefs = { ...prefs };
    cam.fov = this.prefs.fov * DEG;
    this.state = createCameraState(this.prefs.mode);
    // third person orbit (look yaw / pitch: the direction the camera looks)
    this.orbit = { yaw: 0, pitch: 0.4, radius: 5, tYaw: 0, tPitch: 0.4, tRadius: 5, boom: 5 };
    this.focus = new Vector3(3, 0.8, 3);
    this.roomFocus = new Vector3(3, 0.8, 3);
    this.follow = 0; // 0 = hero framing, 1 = following the avatar
    // first person / free cam look
    this.look = { yaw: 0, pitch: 0.1 };
    this.free = { pos: { x: 0, y: 1.6, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    // pose of the frame (and the pose a blend starts from)
    this.pos = new Vector3();
    this.dir = new Vector3(0, 0, 1);
    this.fromPos = new Vector3();
    this.fromDir = new Vector3(0, 0, 1);
    this.tmp = new Vector3();
    this.tmp2 = new Vector3();
    this.tmpDir = { x: 0, y: 0, z: 1 };
    this.drag = null;
    this.locked = false;
    this.bind();
  }

  get mode() {
    return this.state.mode;
  }

  get policy() {
    return modePolicy(this.state.mode);
  }

  /** Yaw WASD walks along (third: where the camera looks, first: the look yaw). */
  get walkYaw() {
    return this.state.mode === "third" ? this.orbit.yaw : this.look.yaw;
  }

  setPrefs(prefs) {
    this.prefs = { ...this.prefs, ...prefs };
    this.camera.fov = this.prefs.fov * DEG;
  }

  /** Hero framing from the room GLB: camera position + the point it looks at. */
  setHero(pos, target) {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.z - pos.z;
    const r = Math.hypot(dx, dy, dz) || 1;
    const o = this.orbit;
    this.hero = { pos: pos.clone(), target: target.clone() };
    o.yaw = o.tYaw = Math.atan2(dx, dz);
    o.pitch = o.tPitch = Math.min(THIRD_PITCH[1], Math.max(THIRD_PITCH[0], -Math.asin(dy / r)));
    o.radius = o.tRadius = o.boom = Math.min(ZOOM[1], Math.max(ZOOM[0], r));
    this.focus.copyFrom(target);
    this.roomFocus.copyFrom(target);
    this.heroRadius = o.radius;
    this.follow = 0;
    this.look.yaw = o.yaw;
    this.look.pitch = 0.1;
    this.free.pos.x = pos.x;
    this.free.pos.y = pos.y;
    this.free.pos.z = pos.z;
    this.writePose(this.pos, this.dir, 0, null);
    this.fromPos.copyFrom(this.pos);
    this.fromDir.copyFrom(this.dir);
    this.apply(this.pos, this.dir);
  }

  resetView() {
    if (this.hero) this.setHero(this.hero.pos, this.hero.target);
  }

  // ------------------------------------------------------------ modes

  setMode(mode, now) {
    const next = switchMode(this.state, mode, now);
    this.changeState(next);
  }

  cycle(now) {
    this.changeState(cycleMode(this.state, now));
  }

  returnToAvatar(now) {
    this.changeState(returnToAvatar(this.state, now));
  }

  changeState(next) {
    if (next === this.state) return;
    const prev = this.state.mode;
    // blend from wherever the camera is right now (also mid-blend)
    this.fromPos.copyFrom(this.camera.position);
    this.fromDir.copyFrom(this.dir);
    const curYaw = Math.atan2(this.dir.x, this.dir.z);
    const curPitch = -Math.asin(Math.max(-1, Math.min(1, this.dir.y)));
    if (next.mode === "first" || next.mode === "free") {
      this.look.yaw = curYaw;
      this.look.pitch = next.mode === "first" ? Math.max(-0.2, Math.min(0.35, curPitch)) : curPitch;
    }
    if (next.mode === "free") {
      this.free.pos.x = this.camera.position.x;
      this.free.pos.y = this.camera.position.y;
      this.free.pos.z = this.camera.position.z;
      this.free.vel.x = this.free.vel.y = this.free.vel.z = 0;
    }
    if (next.mode === "third") {
      // keep the heading the user had: the orbit continues behind the same direction
      this.orbit.yaw = this.orbit.tYaw = curYaw;
      this.orbit.tPitch = Math.min(THIRD_PITCH[1], Math.max(0.25, curPitch));
      this.orbit.pitch = this.orbit.tPitch;
      this.follow = Math.max(this.follow, 1);
    }
    if (prev !== "third" && next.mode === "third") this.exitLock();
    this.state = next;
    this.cb.onModeChange?.(next.mode, prev);
  }

  // ------------------------------------------------------------ input

  bind() {
    const c = this.canvas;
    this.onDown = (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this.drag = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, button: e.button, id: e.pointerId };
      try {
        c.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is optional */
      }
    };
    this.onMove = (e) => {
      if (this.locked) {
        this.lookBy(e.movementX || 0, e.movementY || 0);
        return;
      }
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) d.moved = true;
      if (!d.moved) return;
      if (this.state.mode === "third") {
        const k = 0.0045 * this.prefs.sensitivity;
        this.orbit.tYaw += dx * k;
        this.orbit.tPitch = Math.min(THIRD_PITCH[1], Math.max(THIRD_PITCH[0], this.orbit.tPitch + (this.prefs.invertY ? -dy : dy) * k));
      } else {
        this.lookBy(dx, dy);
      }
    };
    this.onUp = (e) => {
      const d = this.drag;
      this.drag = null;
      try {
        c.releasePointerCapture?.(e.pointerId);
      } catch {
        /* not captured */
      }
      // a click (no drag) in first person / free cam takes the mouse
      if (d && !d.moved && d.button === 0 && this.policy.clickLocksPointer) this.requestLock();
    };
    this.onWheel = (e) => {
      if (this.state.mode !== "third") return;
      e.preventDefault();
      this.orbit.tRadius = zoomRadius(this.orbit.tRadius, e.deltaY, ZOOM);
    };
    this.onContext = (e) => e.preventDefault();
    this.onLockChange = () => {
      const locked = document.pointerLockElement === c;
      if (locked === this.locked) return;
      this.locked = locked;
      this.cb.onPointerLock?.(locked);
    };
    this.onLockError = () => {
      this.locked = false;
      this.cb.onPointerLock?.(false);
    };
    c.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", this.onContext);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("pointerlockerror", this.onLockError);
  }

  lookBy(dx, dy) {
    const limits = this.state.mode === "free" ? PITCH_LIMITS.free : PITCH_LIMITS.first;
    const next = applyLook(this.look, dx, dy, this.prefs, limits);
    this.look.yaw = next.yaw;
    this.look.pitch = next.pitch;
  }

  requestLock() {
    if (this.locked || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === "function") p.catch(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) {
      try {
        document.exitPointerLock();
      } catch {
        /* not locked */
      }
    }
  }

  // ------------------------------------------------------------ frame

  /**
   * ctx: { avatar: Vector3 (feet), moving: bool, eye: Vector3 | null (first person),
   *        fly: { forward, right, up, fast } (free cam keys) }
   */
  update(dt, now, ctx) {
    const mode = this.state.mode;
    if (mode === "third") this.updateThird(dt, ctx);
    if (mode === "free") stepFreeCam(this.free, ctx.fly, this.look.yaw, this.look.pitch, dt, this.bounds);
    this.writePose(this.pos, this.dir, dt, ctx);
    if (!blendDone(this.state, now)) {
      const w = blendWeight(this.state, now);
      Vector3.LerpToRef(this.fromPos, this.pos, w, this.pos);
      this.tmp2.copyFrom(this.dir);
      Vector3.LerpToRef(this.fromDir, this.tmp2, w, this.dir);
      // opposite directions would pass through zero: take the target direction then
      if (this.dir.lengthSquared() < 1e-6) this.dir.copyFrom(this.tmp2);
      this.dir.normalize();
    } else if (this.state.blend) {
      this.state = { ...this.state, blend: null };
    }
    this.apply(this.pos, this.dir);
  }

  updateThird(dt, ctx) {
    const o = this.orbit;
    if (ctx.moving) this.follow = Math.min(1, this.follow + dt * 0.8);
    o.yaw = dampAngle(o.yaw, o.tYaw, 14, dt);
    o.pitch = damp(o.pitch, o.tPitch, 14, dt);
    o.radius = damp(o.radius, o.tRadius, 10, dt);
    const k = 0.55 * this.follow;
    const a = ctx.avatar;
    const fx = this.roomFocus.x + (a.x - this.roomFocus.x) * k;
    const fy = this.roomFocus.y + (1.0 - this.roomFocus.y) * k;
    const fz = this.roomFocus.z + (a.z - this.roomFocus.z) * k;
    this.focus.x = damp(this.focus.x, fx, 3, dt);
    this.focus.y = damp(this.focus.y, fy, 3, dt);
    this.focus.z = damp(this.focus.z, fz, 3, dt);
  }

  /** Pose of the current mode into pos / dir (no blend). */
  writePose(pos, dir, dt, ctx) {
    const mode = this.state.mode;
    if (mode === "third") {
      const o = this.orbit;
      const d = lookDirection(o.yaw, o.pitch, this.tmpDir);
      // shoulder: shift the whole boom to the right while following
      const s = SHOULDER * this.follow * Math.min(1, o.radius / 3);
      const rx = Math.cos(o.yaw) * s;
      const rz = -Math.sin(o.yaw) * s;
      this.tmp.set(this.focus.x + rx, this.focus.y, this.focus.z + rz);
      this.tmp2.set(-d.x, -d.y, -d.z);
      const allowed = this.bounds ? clampBoom(this.tmp, this.tmp2, o.radius, this.bounds, 0.25) : o.radius;
      // pull in at once (never through a wall), let go smoothly
      o.boom = allowed < o.boom || !dt ? allowed : damp(o.boom, allowed, 6, dt);
      const r = Math.min(o.radius, o.boom);
      pos.set(this.tmp.x - d.x * r, this.tmp.y - d.y * r, this.tmp.z - d.z * r);
      dir.set(d.x, d.y, d.z);
    } else if (mode === "first") {
      const d = lookDirection(this.look.yaw, this.look.pitch, this.tmpDir);
      const e = ctx?.eye;
      if (e) pos.copyFrom(e);
      dir.set(d.x, d.y, d.z);
    } else {
      const d = lookDirection(this.look.yaw, this.look.pitch, this.tmpDir);
      pos.set(this.free.pos.x, this.free.pos.y, this.free.pos.z);
      dir.set(d.x, d.y, d.z);
    }
  }

  apply(pos, dir) {
    const cam = this.camera;
    cam.position.copyFrom(pos);
    // Euler angles straight from the direction (setTarget allocates)
    cam.rotation.set(-Math.asin(Math.max(-1, Math.min(1, dir.y))), Math.atan2(dir.x, dir.z), 0);
  }

  dispose() {
    const c = this.canvas;
    this.exitLock();
    c.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.onContext);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("pointerlockerror", this.onLockError);
  }
}
