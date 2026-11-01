/**
 * Camera modes of the 3D world (pure, no Babylon): the mode state machine, the
 * per-user preferences, the eased mode blend, mouse look, the free-cam flight model and
 * the small helpers the camera rig shares.
 *
 *   third  orbit follow behind the avatar (default): drag to orbit, wheel to zoom,
 *          click the floor to walk there, the boom pulls in at walls
 *   first  eyes of the avatar: pointer-lock mouse look (click, Esc releases), WASD
 *          relative to the view, own head / hair / headwear hidden from this camera
 *   free   detached fly camera clamped to the room: WASD, Q / E down / up, Shift faster,
 *          mouse look; the avatar stays where it is; R flies back to the avatar
 *
 * V cycles the modes; every change eases over MODE_BLEND_MS.
 */

export const CAMERA_MODES = Object.freeze(["third", "first", "free"]);
export const MODE_BLEND_MS = 500;

export const FOV_RANGE = Object.freeze([55, 100]); // horizontal degrees
export const SENSITIVITY_RANGE = Object.freeze([0.25, 3]);
export const DEFAULT_CAMERA_PREFS = Object.freeze({ mode: "third", fov: 69, sensitivity: 1, invertY: false, headBob: false });

/** Radians per pixel of mouse movement at sensitivity 1. */
export const LOOK_RAD_PER_PX = 0.0022;
export const PITCH_LIMITS = Object.freeze({ first: [-1.3, 1.25], free: [-1.45, 1.45] });

export const FREE_SPEED = 2.4; // m/s
export const FREE_FAST = 5.5; // m/s with Shift
export const FREE_ACCEL = 7; // 1/s, how fast the velocity reaches the input
export const FREE_BRAKE = 9; // 1/s, how fast it stops when the keys are released

export function isCameraMode(mode) {
  return CAMERA_MODES.includes(mode);
}

/** V: third -> first -> free -> third. */
export function nextMode(mode) {
  const i = CAMERA_MODES.indexOf(mode);
  return CAMERA_MODES[(Math.max(0, i) + 1) % CAMERA_MODES.length];
}

/** What input does in each mode. */
export function modePolicy(mode) {
  return {
    clickToWalk: mode === "third",
    clickLocksPointer: mode === "first" || mode === "free",
    dragOrbits: mode === "third",
    movesAvatar: mode !== "free",
    hideOwnHead: mode === "first",
    flies: mode === "free",
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normalizePrefs(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
  return {
    mode: isCameraMode(p.mode) ? p.mode : DEFAULT_CAMERA_PREFS.mode,
    fov: Math.round(clamp(num(p.fov, DEFAULT_CAMERA_PREFS.fov), FOV_RANGE[0], FOV_RANGE[1])),
    sensitivity: Math.round(clamp(num(p.sensitivity, DEFAULT_CAMERA_PREFS.sensitivity), SENSITIVITY_RANGE[0], SENSITIVITY_RANGE[1]) * 100) / 100,
    invertY: p.invertY === true,
    headBob: p.headBob === true,
  };
}

export function prefsKey(userId) {
  return `descall:world3d:camera:${String(userId || "me")}`;
}

/** Per-user camera preferences from localStorage (private mode, quota and bad JSON fall back to defaults). */
export function loadCameraPrefs(storage, userId) {
  try {
    const raw = storage?.getItem?.(prefsKey(userId));
    return normalizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizePrefs(null);
  }
}

export function saveCameraPrefs(storage, userId, prefs) {
  const p = normalizePrefs(prefs);
  try {
    storage?.setItem?.(prefsKey(userId), JSON.stringify(p));
  } catch {
    /* private mode / quota: the choice still applies to this session */
  }
  return p;
}

export function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Mode state: { mode, lastAvatarMode, blend: { from, to, start, duration } | null }. */
export function createCameraState(mode = "third") {
  const m = isCameraMode(mode) ? mode : "third";
  return { mode: m, lastAvatarMode: m === "free" ? "third" : m, blend: null };
}

/** Switch to `to`; the rig eases from the old pose to the new one over the blend. */
export function switchMode(state, to, now, duration = MODE_BLEND_MS) {
  if (!isCameraMode(to) || to === state.mode) return state;
  return {
    mode: to,
    lastAvatarMode: to === "free" ? state.lastAvatarMode : to,
    blend: { from: state.mode, to, start: now, duration },
  };
}

export function cycleMode(state, now) {
  return switchMode(state, nextMode(state.mode), now);
}

/** R in free cam: back to the avatar in the mode used before flying off. */
export function returnToAvatar(state, now) {
  if (state.mode !== "free") return state;
  return switchMode(state, state.lastAvatarMode || "third", now);
}

/** Eased blend weight of the new mode's pose, 1 when no blend is running. */
export function blendWeight(state, now) {
  const b = state.blend;
  if (!b) return 1;
  if (b.duration <= 0) return 1;
  return easeInOutCubic((now - b.start) / b.duration);
}

export function blendDone(state, now) {
  return !state.blend || now - state.blend.start >= state.blend.duration;
}

/** Mouse look: dx, dy in pixels. Returns { yaw, pitch } with pitch clamped. */
export function applyLook(look, dx, dy, { sensitivity = 1, invertY = false } = {}, limits = PITCH_LIMITS.first) {
  const k = LOOK_RAD_PER_PX * sensitivity;
  const yaw = look.yaw + dx * k;
  const pitch = clamp(look.pitch + (invertY ? -dy : dy) * k, limits[0], limits[1]);
  return { yaw, pitch };
}

/** Forward unit vector of yaw / pitch (yaw 0 looks at +Z, positive pitch looks down). */
export function lookDirection(yaw, pitch, out = { x: 0, y: 0, z: 0 }) {
  const c = Math.cos(pitch);
  out.x = Math.sin(yaw) * c;
  out.y = -Math.sin(pitch);
  out.z = Math.cos(yaw) * c;
  return out;
}

/** Exponential smoothing that is frame-rate independent. */
export function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function dampAngle(current, target, rate, dt) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-rate * dt));
}

/**
 * Free cam flight: state { pos, vel } (plain {x,y,z}), input { forward, right, up } in
 * -1..1 plus fast, yaw / pitch of the view. Velocity eases towards the input (smooth
 * start and stop); the position stays inside the room box (minus margin).
 */
export function stepFreeCam(state, input, yaw, pitch, dt, bounds, margin = 0.25) {
  const fwd = lookDirection(yaw, pitch);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let tx = fwd.x * input.forward + rx * input.right;
  let ty = fwd.y * input.forward + input.up;
  let tz = fwd.z * input.forward + rz * input.right;
  const len = Math.hypot(tx, ty, tz);
  const speed = input.fast ? FREE_FAST : FREE_SPEED;
  if (len > 1e-6) {
    tx = (tx / len) * speed;
    ty = (ty / len) * speed;
    tz = (tz / len) * speed;
  }
  const rate = len > 1e-6 ? FREE_ACCEL : FREE_BRAKE;
  const k = 1 - Math.exp(-rate * dt);
  state.vel.x += (tx - state.vel.x) * k;
  state.vel.y += (ty - state.vel.y) * k;
  state.vel.z += (tz - state.vel.z) * k;
  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  state.pos.z += state.vel.z * dt;
  if (bounds) {
    const axes = [["x", bounds.minX, bounds.maxX], ["y", bounds.minY, bounds.maxY], ["z", bounds.minZ, bounds.maxZ]];
    for (const [a, lo, hi] of axes) {
      const l = lo + margin;
      const h = hi - margin;
      if (state.pos[a] < l) {
        state.pos[a] = l;
        if (state.vel[a] < 0) state.vel[a] = 0;
      } else if (state.pos[a] > h) {
        state.pos[a] = h;
        if (state.vel[a] > 0) state.vel[a] = 0;
      }
    }
  }
  return state;
}

/**
 * Subtle first-person head bob from walking speed (m/s): returns the vertical and
 * sideways offset in metres for the bob phase (radians, advanced by the caller).
 */
export function headBob(phase, speed) {
  const k = clamp(speed / 3, 0, 1);
  return { y: Math.abs(Math.sin(phase)) * 0.035 * k - 0.0175 * k, x: Math.cos(phase) * 0.018 * k };
}

/** Wheel zoom of the third-person boom. */
export function zoomRadius(radius, wheelDeltaY, [min, max] = [1.6, 9]) {
  return clamp(radius * Math.exp(wheelDeltaY * 0.0012), min, max);
}
