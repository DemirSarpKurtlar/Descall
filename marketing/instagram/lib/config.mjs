/**
 * Paths, brand tokens and the output spec. Everything else reads from here.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PIPELINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(PIPELINE_DIR, "..", "..");
export const CONTENT_DIR = join(PIPELINE_DIR, "content");
export const POSTED_LOG_PATH = join(PIPELINE_DIR, "posted-log.json");
export const POLICY_PATH = join(PIPELINE_DIR, "policy.json");

export function loadPolicy(path = POLICY_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Brand look. Colors: docs/brand/new-logo/svg (symbol blue #587AF5) and the marketing
 * site tokens in frontend/src/site/site.css (--mkt-bg, --mkt-accent, --mkt-accent-2,
 * --mkt-text, --mkt-muted). Font: Inter (the site's body font), shipped in the repo.
 */
export const BRAND = Object.freeze({
  bg: "#08090d",
  surface: "rgba(22, 26, 38, 0.78)",
  blue: "#587AF5",
  accent: "#8eacff",
  accent2: "#2ad4b8",
  text: "#f4f6fb",
  muted: "#d4dbe6",
  danger: "#f25f5c",
  fonts: {
    medium: join(REPO_ROOT, "descall-video/public/fonts/Inter-Medium.woff2"),
    semibold: join(REPO_ROOT, "descall-video/public/fonts/Inter-SemiBold.woff2"),
    bold: join(REPO_ROOT, "descall-video/public/fonts/Inter-Bold.woff2"),
  },
  symbolSvg: join(REPO_ROOT, "docs/brand/new-logo/svg/descall-symbol-white.svg"),
  wordmarkSvg: join(REPO_ROOT, "docs/brand/new-logo/svg/descall-wordmark-white.svg"),
});

/**
 * Output spec, inside Instagram's Reels limits (Graph API "Reels specifications":
 * MP4, moov atom first, H.264 progressive, closed GOP, 4:2:0, 23-60 fps, AAC up to
 * 48 kHz mono/stereo, 9:16 recommended).
 */
export const SPEC = Object.freeze({
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: "h264",
  pixFmt: "yuv420p",
  audioCodec: "aac",
  audioRate: 48000,
  audioChannels: 2,
  maxBytes: 100 * 1024 * 1024,
});

/** Timing defaults (seconds). */
export const TIMING = Object.freeze({
  hook: 2.0,
  cta: 3.2,
  sceneMin: 2.4,
  sceneMax: 4.6,
  sceneBase: 1.7,
  perWord: 0.26,
  perVisualItem: 0.25,
});

export const GRAPH_DEFAULT_VERSION = "v24.0";
export const STORAGE_BUCKET = "marketing-reels";
export const ISTANBUL_TZ = "Europe/Istanbul";
