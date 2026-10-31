/**
 * Camera facing for calls (3.0.0 D2).
 *
 * - One preferred facing ("user" front / "environment" back) shared by DM and
 *   group calls, flipped with a single button.
 * - Only the FRONT camera is mirrored in the local preview. The back camera is
 *   never mirrored, and the published track is never mirrored at all, so the
 *   remote view is always the right way round.
 *
 * The facing comes from the live track (getSettings().facingMode). Desktop
 * webcams usually report no facingMode; they are front cameras, so they keep
 * the mirror unless we explicitly asked for the back camera.
 */

export const FACING_USER = "user";
export const FACING_ENVIRONMENT = "environment";

let preferredFacing = FACING_USER;

export function getPreferredFacing() {
  return preferredFacing;
}

export function setPreferredFacing(facing) {
  preferredFacing = facing === FACING_ENVIRONMENT ? FACING_ENVIRONMENT : FACING_USER;
  return preferredFacing;
}

export function nextFacing(facing = preferredFacing) {
  return facing === FACING_ENVIRONMENT ? FACING_USER : FACING_ENVIRONMENT;
}

/**
 * Video constraints for a call camera. A chosen device wins; otherwise the
 * preferred facing. `exact` is used for a flip so the browser can't quietly
 * hand back the same camera (callers fall back to the plain hint).
 */
export function cameraVideoConstraints({ deviceId = "", facing = preferredFacing, exact = false } = {}) {
  if (deviceId) return { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } };
  return { width: 1280, height: 720, facingMode: exact ? { exact: facing } : facing };
}

/** Tag a captured camera track with the facing we asked for. */
export function tagCameraTrack(track, facing) {
  if (track && typeof track === "object") {
    try {
      track.__descallFacing = facing === FACING_ENVIRONMENT ? FACING_ENVIRONMENT : FACING_USER;
    } catch {
      /* frozen track objects in tests */
    }
  }
  return track;
}

/**
 * Facing from the camera's name. Phones name their cameras ("Back Camera",
 * "Arka Üçlü Kamera", "Front Camera", "Ön Kamera", "camera2 1, facing back")
 * and some report no or a stale facingMode after a flip, which left the back
 * camera mirrored (3.7.6).
 */
export function labelFacing(label) {
  const l = String(label || "").toLocaleLowerCase("tr");
  if (!l) return null;
  if (/\b(back|rear|environment|world)\b|facing back|\barka\b|trasera|arrière|rück/.test(l)) return FACING_ENVIRONMENT;
  if (/\b(front|user|facetime|selfie)\b|facing front|(^|[\s(])ön([\s)]|$)|frontal|avant/.test(l)) return FACING_USER;
  return null;
}

/** "user" | "environment" | null for a camera track. */
export function trackFacing(track) {
  if (!track) return null;
  const named = labelFacing(track.label);
  if (named) return named;
  let settings = {};
  try {
    settings = (typeof track.getSettings === "function" && track.getSettings()) || {};
  } catch {
    settings = {};
  }
  const f = settings.facingMode;
  if (f === FACING_USER) return FACING_USER;
  if (f === FACING_ENVIRONMENT || f === "left" || f === "right") return FACING_ENVIRONMENT;
  if (track.__descallFacing === FACING_ENVIRONMENT || track.__descallFacing === FACING_USER) return track.__descallFacing;
  return null;
}

function isScreenTrack(track) {
  if (!track) return false;
  const role = track.__descallRole;
  if (role === "screen" || role === "screen-audio") return true;
  try {
    const s = (typeof track.getSettings === "function" && track.getSettings()) || {};
    if (s.displaySurface) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Mirror the local preview of this track? Front camera only. */
export function shouldMirrorLocal(track) {
  if (!track || track.kind === "audio") return false;
  if (isScreenTrack(track)) return false;
  return trackFacing(track) !== FACING_ENVIRONMENT;
}

/** First video track of a stream, or null. */
export function streamCameraTrack(stream) {
  try {
    return stream?.getVideoTracks?.()?.[0] || null;
  } catch {
    return null;
  }
}

/** A flip button only makes sense with two or more cameras. */
export function canFlipCamera(videoInputs) {
  if (!Array.isArray(videoInputs)) return false;
  return videoInputs.filter((d) => d && d.kind !== "audioinput" && d.kind !== "audiooutput").length >= 2;
}

/**
 * Capture the camera for `facing`. Tries `exact` first, then the hint, so a
 * single-camera device still gets its only camera.
 */
export async function captureFacingCamera(getUserMedia, facing) {
  const attempt = (exact) => getUserMedia({ audio: false, video: cameraVideoConstraints({ facing, exact }) });
  let stream;
  try {
    stream = await attempt(true);
  } catch (err) {
    if (err?.name !== "OverconstrainedError" && err?.name !== "NotFoundError" && err?.name !== "ConstraintNotSatisfiedError") throw err;
    stream = await attempt(false);
  }
  const track = streamCameraTrack(stream);
  if (track) tagCameraTrack(track, facing);
  return { stream, track };
}
