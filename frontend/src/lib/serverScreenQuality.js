/**
 * Server voice screen share quality (server-voice-21): the pick from the shared
 * ScreenShareQualityPanel ({ resolution, fps, contentHint }), validated and
 * remembered per device. Mesh limits are applied later by resolveScreenCaptureSize.
 */
import { GROUP_SCREEN_DEFAULT_QUALITY } from "./webrtcScreenShare.js";

export const SERVER_SCREEN_QUALITY_KEY = "descall:serverScreenQuality";
const RESOLUTIONS = new Set(["480p", "720p", "1080p", "1440p"]);
const FPS = new Set([15, 20, 24, 30, 60]);
const HINTS = new Set(["motion", "detail", "text"]);

export function cleanServerScreenQuality(input) {
  const q = input && typeof input === "object" ? input : {};
  const fps = Number(q.fps);
  return {
    resolution: RESOLUTIONS.has(q.resolution) ? q.resolution : GROUP_SCREEN_DEFAULT_QUALITY.resolution,
    fps: FPS.has(fps) ? fps : GROUP_SCREEN_DEFAULT_QUALITY.fps,
    contentHint: HINTS.has(q.contentHint) ? q.contentHint : GROUP_SCREEN_DEFAULT_QUALITY.contentHint,
  };
}

export function readServerScreenQuality(store = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const raw = store?.getItem?.(SERVER_SCREEN_QUALITY_KEY);
    return cleanServerScreenQuality(raw ? JSON.parse(raw) : null);
  } catch {
    return cleanServerScreenQuality(null);
  }
}

export function writeServerScreenQuality(quality, store = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    store?.setItem?.(SERVER_SCREEN_QUALITY_KEY, JSON.stringify(cleanServerScreenQuality(quality)));
  } catch {
    /* private mode / quota: the pick only lasts this session */
  }
}
