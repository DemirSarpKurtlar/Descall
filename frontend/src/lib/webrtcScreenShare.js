/**
 * Screen-share capture + RTP sender tuning for WebRTC mesh calls.
 * DM (1:1) uses a higher-quality profile; group mesh stays conservative.
 */
import { capCaptureSize, getScreenCeiling } from "../plus2/screenCeiling.js";
import { isDesktopShell } from "./desktopShell.js";
import { classifyInboundMedia, guardDisplayCapture, ROLE_SCREEN } from "./screenShareIdentity.js";
import { t } from "../i18n/runtime.js";
import { processScreenShareAudio } from "../premium/audio/streamAudio.js";
import { screenMaxBitrate } from "./screenShareCodec.js";
import {
  applyScreenCodecPreferences,
  encoderConfigFromQuality,
  screenEncoderFor,
  transceiverOf,
  tuneScreenSender,
} from "./screenShareEncoder.js";

// Group calls and server voice rooms start at 1080p / 30 like DM calls (owner decision Nov
// 2026: "herkes en yüksek kalite"); a 3+ person mesh stays capped at 30 fps
// (screenShareCodec.screenShareLimits) and the bitrate ceiling still scales per viewer.
export const GROUP_SCREEN_DEFAULT_QUALITY = {
  resolution: "1080p",
  fps: 30,
  contentHint: "motion",
};

export const DM_SCREEN_DEFAULT_QUALITY = {
  resolution: "1080p",
  fps: 30,
  contentHint: "motion",
};

/** Named presets for the quality panel (resolution + fps + contentHint). */
export const SCREEN_QUALITY_PRESETS = {
  smooth: {
    id: "smooth",
    resolution: "480p",
    fps: 20,
    contentHint: "motion",
  },
  balanced: {
    id: "balanced",
    resolution: "720p",
    fps: 24,
    contentHint: "motion",
  },
  high: {
    id: "high",
    resolution: "1080p",
    fps: 30,
    contentHint: "motion",
  },
  ultra: {
    id: "ultra",
    resolution: "1440p",
    fps: 30,
    contentHint: "motion",
  },
  text: {
    id: "text",
    resolution: "1080p",
    fps: 20,
    contentHint: "detail",
  },
};

const RESOLUTION_MAP = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "2160p": { width: 3840, height: 2160 },
  custom: { width: 1280, height: 720 },
};

function isMobileCapture() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

export function isMobileScreenCapture() {
  return isMobileCapture();
}

/**
 * Native iOS app (Capacitor WKWebView): there is no getDisplayMedia, so the
 * WebRTC capture path is unavailable. DM and group calls (browser mesh) hide
 * their screen-share controls on iPhone / iPad. Server voice channels use the
 * ReplayKit broadcast extension instead when the build ships it
 * (lib/iosScreenBroadcast.js, docs/ios-screen-share.md). Viewing others'
 * shares works everywhere.
 */
export function screenShareUnavailableOnIos() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    const nativeIos = Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
    return nativeIos && typeof navigator?.mediaDevices?.getDisplayMedia !== "function";
  } catch {
    return false;
  }
}

/**
 * Build getDisplayMedia constraints.
 *
 * Mobile: prefer the entire screen (`monitor`). Sharing only the Descall tab
 * (or preferCurrentTab) ends the moment the user switches to YouTube/Safari
 * home, the common “arka plana alınca ekran yansıması koptu” failure.
 *
 * Desktop: omit `displaySurface` by default so Chromium/Edge show the full
 * OS picker (window / entire screen / tab). DES-10: locking `browser` made
 * many users only see the Descall tab. Pass `preferTab: true` only when you
 * explicitly want tab-first (e.g. tab audio UX experiments).
 * Never lock preferCurrentTab, that also dies on background/tab switch.
 */
export function buildDisplayMediaConstraints({ width, height, fps, preferTab } = {}) {
  const mobile = isMobileCapture();
  const video = {
    cursor: "motion",
    frameRate: { ideal: fps, max: Math.max(fps, 30) },
  };
  if (!mobile && width && height) {
    video.width = { ideal: width };
    video.height = { ideal: height };
  }
  if (mobile) {
    video.displaySurface = "monitor";
  } else if (preferTab === true) {
    video.displaySurface = "browser";
  }
  // Desktop default: no displaySurface → full source picker (window/screen/tab).

  return {
    video,
    // Chromium still requires the user to tick “Share audio”. Detailed
    // constraints preserve tab loudness; some engines only accept `true`.
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // Keep the sharer hearing their own tab/video (true would mute it).
      suppressLocalAudioPlayback: false,
      // Echo fix (3.7.33): system/window loopback must not include Descall's
      // own playback (the other participants' voices), or viewers hear
      // themselves inside the share. Chromium 141+ / Electron 43.4+ honour
      // this by capturing `loopbackWithoutChrome`.
      restrictOwnAudio: true,
    },
    preferCurrentTab: false,
    selfBrowserSurface: "include",
    surfaceSwitching: "include",
    systemAudio: "include",
    monitorTypeSurfaces: "include",
  };
}

/** Either desktop app (Electron or Tauri: both expose the electronAPI capture members). */
export function isElectronRuntime() {
  return typeof window !== "undefined" && isDesktopShell();
}

/** True when we have at least one viable capture path (Electron desktopCapturer or getDisplayMedia). */
export function canCaptureScreen() {
  if (typeof window === "undefined") return false;
  if (isElectronRuntime() && typeof window.electronAPI?.getScreenSources === "function") return true;
  if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function") {
    return true;
  }
  return false;
}

function screenShareUnsupportedError() {
  const secure = typeof window === "undefined" ? true : Boolean(window.isSecureContext);
  const err = new Error(
    secure
      ? t("Screen sharing is not available in this browser.")
      : t("Screen sharing requires a secure connection (HTTPS).")
  );
  err.name = "NotSupportedError";
  err.code = "SCREEN_SHARE_UNSUPPORTED";
  return err;
}

/**
 * getDisplayMedia with progressive constraint fallbacks.
 * Firefox/Safari reject Chromium-only fields (displaySurface, systemAudio, …);
 * some mobile/WebViews reject audio constraints entirely.
 */
export async function getDisplayMediaStream(opts = {}) {
  if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
    throw screenShareUnsupportedError();
  }

  const primary = buildDisplayMediaConstraints(opts);
  if (opts.audio === false) {
    // The shell cannot leave Descall's own playback out of system audio here
    // (Electron select-source policy "off"): never ask for it.
    const videoOnly = [{ ...primary, audio: false }, { video: true, audio: false }];
    let lastErr = null;
    for (const constraints of videoOnly) {
      try {
        return await navigator.mediaDevices.getDisplayMedia(constraints);
      } catch (err) {
        lastErr = err;
        if (err?.name === "NotAllowedError" || err?.name === "AbortError") throw err;
      }
    }
    throw lastErr || screenShareUnsupportedError();
  }
  const attempts = [
    primary,
    // Engines that reject the detailed audio object may still accept the
    // own-audio exclusion on its own; try that before the bare `true`.
    { ...primary, audio: { restrictOwnAudio: true } },
    { ...primary, audio: true },
    { ...primary, audio: false },
    {
      video: {
        cursor: "motion",
        frameRate: primary.video?.frameRate,
      },
      audio: true,
    },
    {
      video: true,
      audio: true,
    },
    {
      video: true,
      audio: false,
    },
  ];

  let lastErr = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      lastErr = err;
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") throw err;
    }
  }
  throw lastErr || screenShareUnsupportedError();
}

/** Split desktopCapturer sources into screens and windows (ids are "screen:…" / "window:…"). */
export function groupScreenSources(sources = []) {
  const screens = [];
  const windows = [];
  for (const s of Array.isArray(sources) ? sources : []) {
    if (!s || typeof s.id !== "string") continue;
    (s.id.startsWith("screen:") ? screens : windows).push(s);
  }
  return { screens, windows };
}

const SVG_NS = "http://www.w3.org/2000/svg";
function pickerIcon(paths) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * Electron source picker (polish pass). Styled by `.electron-screen-picker-*` in
 * styles/app-layout.css: the shared scrim (overlay.css list) and a heavy frost card
 * (frost.css list), Ekranlar / Pencereler tabs with counts, tiles that are real buttons
 * (Tab / arrow keys / Enter), app icons on window tiles, a refresh button, Escape to
 * cancel, focus kept inside and given back on close.
 * @param {Array} sources from electronAPI.getScreenSources()
 * @param {{ refresh?: () => Promise<Array> }} [opts]
 * @returns {Promise<string|null>} source id or null if cancelled
 */
export function showElectronScreenPicker(sources = [], { refresh } = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    let groups = groupScreenSources(sources);
    let tab = groups.screens.length || !groups.windows.length ? "screens" : "windows";
    const opener = typeof document !== "undefined" ? document.activeElement : null;

    const overlay = document.createElement("div");
    overlay.className = "electron-screen-picker-overlay";
    const modal = document.createElement("div");
    modal.className = "electron-screen-picker-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "esp-title");

    const done = (id) => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      try { opener?.focus?.(); } catch { /* opener gone */ }
      resolve(id);
    };

    const header = document.createElement("div");
    header.className = "electron-screen-picker-header";
    const title = document.createElement("h3");
    title.id = "esp-title";
    title.textContent = t("core.screenPicker.title");
    const actions = document.createElement("div");
    actions.className = "electron-screen-picker-actions";
    if (typeof refresh === "function") {
      const refreshBtn = document.createElement("button");
      refreshBtn.type = "button";
      refreshBtn.className = "electron-screen-picker-icon-btn";
      refreshBtn.setAttribute("aria-label", t("core.screenPicker.refresh"));
      refreshBtn.title = t("core.screenPicker.refresh");
      refreshBtn.appendChild(pickerIcon(["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"]));
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        try {
          const next = await refresh();
          if (Array.isArray(next)) { groups = groupScreenSources(next); render(); }
        } catch { /* keep the old list */ }
        refreshBtn.disabled = false;
      });
      actions.appendChild(refreshBtn);
    }
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "electron-screen-picker-icon-btn";
    closeBtn.setAttribute("aria-label", t("Close"));
    closeBtn.appendChild(pickerIcon(["M18 6 6 18", "M6 6l12 12"]));
    closeBtn.addEventListener("click", () => done(null));
    actions.appendChild(closeBtn);
    header.append(title, actions);

    const tabs = document.createElement("div");
    tabs.className = "electron-screen-picker-tabs";
    tabs.setAttribute("role", "tablist");
    const tabBtn = (key, label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "electron-screen-picker-tab";
      b.setAttribute("role", "tab");
      b.dataset.tab = key;
      b.addEventListener("click", () => { tab = key; render(); });
      b._label = label;
      return b;
    };
    const screensTab = tabBtn("screens", t("core.screenPicker.screens"));
    const windowsTab = tabBtn("windows", t("core.screenPicker.windows"));
    tabs.append(screensTab, windowsTab);

    const tip = document.createElement("p");
    tip.className = "electron-screen-picker-tip";
    tip.textContent = t("core.screenPicker.tip");

    const grid = document.createElement("div");
    grid.className = "electron-screen-picker-grid";
    grid.setAttribute("role", "tabpanel");

    function tile(source, index) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "electron-screen-picker-item";
      const name = source.name || `${t("core.screenPicker.screen")} ${index + 1}`;
      item.setAttribute("aria-label", name);
      const thumb = document.createElement("img");
      thumb.src = source.thumbnailDataURL || "";
      thumb.alt = "";
      thumb.draggable = false;
      const label = document.createElement("span");
      label.className = "electron-screen-picker-label";
      if (source.appIconDataURL) {
        const icon = document.createElement("img");
        icon.className = "electron-screen-picker-appicon";
        icon.src = source.appIconDataURL;
        icon.alt = "";
        label.appendChild(icon);
      }
      const text = document.createElement("span");
      text.textContent = name;
      label.appendChild(text);
      item.append(thumb, label);
      item.addEventListener("click", () => done(source.id));
      return item;
    }

    function render() {
      for (const [btn, key, list] of [[screensTab, "screens", groups.screens], [windowsTab, "windows", groups.windows]]) {
        btn.textContent = `${btn._label} · ${list.length}`;
        btn.setAttribute("aria-selected", tab === key ? "true" : "false");
        btn.tabIndex = tab === key ? 0 : -1;
      }
      grid.replaceChildren();
      const list = tab === "screens" ? groups.screens : groups.windows;
      if (!list.length) {
        const empty = document.createElement("p");
        empty.className = "electron-screen-picker-empty";
        empty.textContent = t("core.screenPicker.empty");
        grid.appendChild(empty);
        return;
      }
      list.forEach((s, i) => grid.appendChild(tile(s, i)));
    }

    function focusables() {
      return [...modal.querySelectorAll("button:not([disabled])")].filter((b) => b.tabIndex !== -1);
    }
    function moveInGrid(current, key) {
      const items = [...grid.querySelectorAll(".electron-screen-picker-item")];
      const i = items.indexOf(current);
      if (i < 0) return false;
      const top = items[0].offsetTop;
      const cols = Math.max(1, items.filter((el) => el.offsetTop === top).length);
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
      const next = items[Math.max(0, Math.min(items.length - 1, i + step))];
      next?.focus();
      return true;
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); return; }
      if (e.key === "Tab") {
        const list = focusables();
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        return;
      }
      if (/^Arrow/.test(e.key)) {
        const el = document.activeElement;
        if (el?.classList?.contains("electron-screen-picker-tab") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          tab = tab === "screens" ? "windows" : "screens";
          render();
          (tab === "screens" ? screensTab : windowsTab).focus();
        } else if (moveInGrid(el, e.key)) {
          e.preventDefault();
        }
      }
    }

    modal.append(header, tabs, tip, grid);
    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(null);
    });
    render();
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey, true);
    (grid.querySelector(".electron-screen-picker-item") || closeBtn).focus();
  });
}

/**
 * Unified screen capture for DM / group / server voice.
 * Electron → desktopCapturer picker; web → getDisplayMedia with soft fallbacks.
 * Multiple participants may call this concurrently, there is no single-sharer lock.
 */
export async function captureScreenShareStream(opts = {}) {
  // Descall+ stream_audio_control: shared audio through a gain stage (untouched without it).
  return processScreenShareAudio(await captureScreenShareStreamRaw(opts));
}

export const SCREEN_AUDIO_VIDEO_ONLY_NOTICE = "System audio cannot be shared on this PC; sharing video only.";
let videoOnlyNoticeShown = false;

/** Once per app run: the share goes out without system audio (it would carry the call). */
function noticeVideoOnly(notify) {
  if (videoOnlyNoticeShown || typeof notify !== "function") return;
  videoOnlyNoticeShown = true;
  try {
    notify(t(SCREEN_AUDIO_VIDEO_ONLY_NOTICE));
  } catch {
    /* a notice must never break the share */
  }
}

/** Test hook. */
export function _resetScreenShareNotices() {
  videoOnlyNoticeShown = false;
}

async function captureScreenShareStreamRaw(opts = {}) {
  const { width, height, fps, preferTab, pickSource = showElectronScreenPicker, notify } = opts;

  if (isElectronRuntime() && typeof window.electronAPI?.getScreenSources === "function") {
    try {
      const sources = await window.electronAPI.getScreenSources();
      if (Array.isArray(sources) && sources.length > 0) {
        const sourceId = await pickSource(sources, {
          refresh: () => window.electronAPI.getScreenSources(),
        });
        if (!sourceId) {
          const err = new Error("Screen share cancelled");
          err.name = "AbortError";
          throw err;
        }
        if (typeof window.electronAPI?.selectDisplaySource === "function") {
          // Echo fix (3.7.33, 4.2.1): route the chosen source through
          // getDisplayMedia; Electron main grants system audio only as
          // loopbackWithoutChrome (Descall's own playback left out) and answers
          // { ok, audio: "exclude-self" | "off" }. The Tauri shell answers
          // true and runs its own native lane with its own notices.
          // The legacy chromeMediaSource:"desktop" path below captures the
          // whole system mix, including the call, and viewers hear themselves.
          let electronPolicy = null;
          try {
            const picked = await window.electronAPI.selectDisplaySource(sourceId);
            electronPolicy = picked && typeof picked === "object" ? picked : null;
            if (picked) {
              const audioOff = electronPolicy?.audio === "off";
              const stream = await getDisplayMediaStream({ width, height, fps, preferTab, ...(audioOff ? { audio: false } : {}) });
              if (electronPolicy && !stream.getAudioTracks().length) noticeVideoOnly(notify);
              return guardDisplayCapture(stream);
            }
          } catch (err) {
            if (err?.name === "NotAllowedError" || err?.name === "AbortError") throw err;
            console.warn("[ScreenShare] Electron getDisplayMedia path failed, video-only fallback:", err);
          }
          // Never fall back to whole-system loopback: that is the echo.
          if (electronPolicy) noticeVideoOnly(notify);
          return await captureElectronDesktop(sourceId, { width, height, fps }, { audio: false });
        }
        // A shell without selectDisplaySource: desktop audio there is the whole
        // system mix (the call included), so the share is video only.
        noticeVideoOnly(notify);
        return await captureElectronDesktop(sourceId, { width, height, fps }, { audio: false });
      }
      // Empty sources (macOS Screen Recording denied), try getDisplayMedia next.
    } catch (err) {
      if (err?.name === "AbortError" || err?.name === "NotAllowedError") throw err;
      if (err?.code === "SCREEN_SHARE_CAMERA_REFUSED" || err?.code === "SCREEN_SHARE_ROLE_MISMATCH") throw err;
      console.warn("[ScreenShare] Electron desktopCapturer path failed, trying getDisplayMedia:", err);
    }
  }

  if (typeof navigator?.mediaDevices?.getDisplayMedia === "function") {
    const stream = await getDisplayMediaStream({ width, height, fps, preferTab });
    return guardDisplayCapture(stream);
  }

  throw screenShareUnsupportedError();
}

/**
 * desktopCapturer getUserMedia. System-audio constraints fail on some Macs
 * and used to discard the chosen source, falling through to a capture that
 * could come back as the camera. Retry video-only for the same source id,
 * then refuse the result if it is a camera track.
 */
async function captureElectronDesktop(sourceId, size, { audio = true } = {}) {
  const withAudio = buildElectronDesktopConstraints(sourceId, size);
  const videoOnly = { audio: false, video: withAudio.video };
  if (!audio) return guardDisplayCapture(await navigator.mediaDevices.getUserMedia(videoOnly));
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(withAudio);
  } catch (err) {
    if (err?.name === "NotAllowedError" || err?.name === "AbortError") throw err;
    stream = await navigator.mediaDevices.getUserMedia(videoOnly);
  }
  return guardDisplayCapture(stream);
}

/**
 * Electron desktopCapture constraints.
 * Windows loopback audio must NOT reuse the video sourceId.
 */
export function buildElectronDesktopConstraints(sourceId, { width, height, fps }) {
  const isWin =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent || "");
  const audio = isWin
    ? {
        mandatory: {
          chromeMediaSource: "desktop",
        },
      }
    : {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
        },
      };
  return {
    audio,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxWidth: width,
        maxHeight: height,
        maxFrameRate: fps,
      },
    },
  };
}

/**
 * Prefer real display/tab/system audio on the screen stream.
 * Do NOT mix the call microphone in as a fallback, that doubles voice and
 * still fails to carry “yayın sesi” (YouTube/game audio), especially on mobile
 * Safari/Chrome where system audio simply isn’t capturable.
 *
 * @returns {{ track: MediaStreamTrack|null, source: 'display'|null }}
 */
export async function ensureScreenShareAudioTrack(screenStream, _localMicStream) {
  if (!screenStream) return { track: null, source: null };
  const existing = screenStream.getAudioTracks().find((t) => t && t.readyState !== "ended");
  if (existing) {
    try {
      if ("contentHint" in existing) existing.contentHint = "music";
    } catch {
      /* ignore */
    }
    return { track: existing, source: "display" };
  }
  return { track: null, source: null };
}

/**
 * @param {object} quality
 * @param {{ maxFps?: number, peerCount?: number }} [opts]
 */
export function resolveScreenCaptureSize(quality = {}, opts = {}) {
  const key = quality.resolution || "720p";
  const size = RESOLUTION_MAP[key] || RESOLUTION_MAP["720p"];
  const peerCount = Math.max(1, opts.peerCount || 1);
  // 1:1 and SFU: 60 FPS. A mesh of 3+ encodes one copy per viewer, so it tops out at 30
  // (screenShareCodec.screenShareLimits, the same for every user).
  const hardCap = opts.maxFps ?? (peerCount <= 2 ? 60 : 30);
  const fps = Math.min(Math.max(Number(quality.fps) || (peerCount <= 2 ? 30 : 20), 10), hardCap);
  // Descall+ 2.0: the plan's ceiling (null until Descall+ is on sale here, so nothing changes today).
  return capCaptureSize({ ...size, fps }, getScreenCeiling(opts.serverId || ""));
}

/**
 * Encoder bitrate ceiling for one screen sender (screenShareCodec.screenMaxBitrate). Same
 * for every user; a mesh of 3+ viewers caps each copy because the sharer uploads one each.
 */
export function screenBitrateForPeerCount(peerCount, resolution = "720p", fps = 30, transport = "mesh") {
  return screenMaxBitrate({ resolution, fps, peerCount, transport });
}

/** Human-readable Mbps ceiling for the quality panel. */
export function estimateScreenShareMbps(quality = {}, peerCount = 2) {
  const bps = screenMaxBitrate({
    resolution: quality.resolution || "720p",
    fps: Number(quality.fps) || 24,
    peerCount,
  });
  return Math.round(bps / 100_000) / 10;
}

export function matchScreenQualityPreset(quality = {}) {
  const res = quality.resolution || "720p";
  const fps = Number(quality.fps) || 24;
  const hint = quality.contentHint === "detail" || quality.contentHint === "text" ? "detail" : "motion";
  for (const preset of Object.values(SCREEN_QUALITY_PRESETS)) {
    if (
      preset.resolution === res &&
      Number(preset.fps) === fps &&
      (preset.contentHint === "detail" ? "detail" : "motion") === hint
    ) {
      return preset.id;
    }
  }
  return "custom";
}

/**
 * Soft post-capture tuning. Never force hard W×H after getDisplayMedia —
 * that freezes orientation when a phone rotates into landscape video.
 *
 * Also prepares the encoder session of this track (screenShareEncoder.js): the content
 * mode, the size and how many encodes run, and whether AV1 is worth it on this device
 * (hardware probe + CPU budget). addDedicatedSender then orders the codecs from it.
 */
export async function optimizeScreenShareTrack(
  track,
  { fps, contentHint = "motion", resolution, peerCount = 1, transport = "mesh" } = {}
) {
  if (!track || track.kind !== "video") return;
  try {
    if ("contentHint" in track) {
      // "text" for code / slides (sharpest), "detail" for apps, "motion" for games / video.
      if (contentHint === "text") {
        try {
          track.contentHint = "text";
        } catch {
          track.contentHint = "detail";
        }
        if (track.contentHint !== "text") track.contentHint = "detail";
      } else if (contentHint === "detail") {
        track.contentHint = "detail";
      } else {
        track.contentHint = "motion";
      }
    }
  } catch {
    /* ignore */
  }

  if (track.readyState !== "live") return;

  try {
    const session = screenEncoderFor(track);
    session?.configure(encoderConfigFromQuality({ resolution, fps, contentHint }, { fps, peerCount, transport }));
    await session?.prepare();
  } catch {
    /* no encoder session: browser defaults */
  }

  try {
    await track.applyConstraints({ frameRate: { ideal: fps, max: fps } });
  } catch {
    try {
      await track.applyConstraints({ frameRate: { ideal: fps } });
    } catch {
      /* leave track as-is */
    }
  }
}

/**
 * Bitrate / frame-rate ceiling, degradation preference by content (text keeps resolution,
 * games balance) for one screen sender. Pass `pc` to also make sure the codec order is set
 * (addDedicatedSender already does it for every screen sender).
 */
export async function optimizeScreenShareSender(
  sender,
  { maxBitrate = 2_200_000, maxFramerate = 30, pc = null, transport = "mesh" } = {}
) {
  if (!sender) return;
  const track = sender.track || null;
  const session = track && track.kind === "video" ? screenEncoderFor(track) : null;
  if (session && pc && !session.senders().includes(sender)) session.attach(pc, sender);
  const ok = await tuneScreenSender(sender, {
    maxBitrate,
    maxFramerate,
    contentHint: session?.config?.contentHint || track?.contentHint || "motion",
    transport,
  });
  if (!ok) console.warn("[ScreenShare] setParameters failed");
}

/**
 * Sender added for a viewer that joined mid-share (or after a glare rollback): same
 * ceiling as the others, from the share's encoder session (quality pick, fps, transport).
 */
export function tuneLateScreenSender(pc, sender, peerCount = 1) {
  const track = sender?.track || null;
  if (!track || track.kind !== "video") return Promise.resolve();
  const cfg = screenEncoderFor(track)?.config || {};
  return optimizeScreenShareSender(sender, {
    maxBitrate: screenMaxBitrate({
      resolution: cfg.resolution || "1080p",
      fps: cfg.fps || 30,
      peerCount: Math.max(1, peerCount),
      transport: cfg.transport || "mesh",
    }),
    maxFramerate: cfg.fps || 30,
    pc,
    transport: cfg.transport || "mesh",
  }).catch(() => {});
}

/** Prefer AV1 > VP9 > browser default for screen share on this sender's transceiver. */
export function preferScreenCodecs(pc, sender) {
  if (!pc || !sender) return null;
  const track = sender.track || null;
  const session = track ? screenEncoderFor(track) : null;
  const transceiver = transceiverOf(pc, sender);
  if (!transceiver) return null;
  return applyScreenCodecPreferences(transceiver, {
    blocked: session?.blocked || [],
    av1Allowed: session ? session.av1Ok() : true,
  });
}

/**
 * Watch a display track for orientation / size changes (portrait → landscape).
 * Calls `onResize({ width, height })` when settings change.
 * Returns a cleanup function.
 */
export function watchScreenTrackResize(track, onResize) {
  if (!track || track.kind !== "video" || typeof onResize !== "function") {
    return () => {};
  }

  let lastW = 0;
  let lastH = 0;
  const emit = () => {
    try {
      const settings = track.getSettings?.() || {};
      const w = Number(settings.width) || 0;
      const h = Number(settings.height) || 0;
      if (!w || !h) return;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      onResize({ width: w, height: h, settings });
    } catch {
      /* ignore */
    }
  };

  emit();

  const onEnded = () => cleanup();
  try {
    track.addEventListener?.("ended", onEnded);
  } catch {
    /* ignore */
  }

  // Some browsers fire `resize` on MediaStreamTrack
  const onTrackResize = () => emit();
  try {
    track.addEventListener?.("resize", onTrackResize);
  } catch {
    /* ignore */
  }

  const poll = setInterval(emit, 500);

  function cleanup() {
    clearInterval(poll);
    try {
      track.removeEventListener?.("ended", onEnded);
      track.removeEventListener?.("resize", onTrackResize);
    } catch {
      /* ignore */
    }
  }

  return cleanup;
}

/**
 * Decide whether an incoming remote video track is screen share vs camera.
 * `announcement` (stream id / mids) is the signal. `peerExpectsScreen` alone
 * is ignored, that used to label the camera as the share.
 */
export function isRemoteScreenVideoTrack(
  track,
  {
    rawStream = null,
    streamId = null,
    mid = null,
    source = null,
    trackName = null,
    announcement = null,
    displaySurface = null,
  } = {}
) {
  if (!track || track.kind !== "video") return false;
  let surface = displaySurface;
  if (!surface) {
    try {
      surface = track.getSettings?.().displaySurface || null;
    } catch {
      surface = null;
    }
  }
  return (
    classifyInboundMedia({
      kind: "video",
      source,
      trackName,
      streamId: streamId || rawStream?.id || null,
      mid,
      displaySurface: surface,
      label: track.label || "",
      announcement,
      localRole: track.__descallRole || null,
    }) === ROLE_SCREEN
  );
}
