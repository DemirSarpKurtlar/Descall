/**
 * Workspace profiles (Ultra): Gaming, Work and Everyday bundles of status, notification
 * profile, widget layout and audio profile. Switch from the UI, the tray or a hotkey
 * (main: features/workspace_profiles.cjs) or from an automation rule.
 */
import { useMemo } from "react";
import { useFeatureSettings, getFeatureSettings, setFeatureSettings } from "../featureSettings.js";
import { getAppBridge, logPremiumEvent, pinvoke } from "./bridge.js";
import { writeVoiceProfile } from "../../lib/voiceProfile.js";
import { t as tRuntime } from "../../i18n/runtime.js";

export const NOTIFICATION_CHOICES = ["keep", "all", "mentions", "none"];
export const AUDIO_CHOICES = ["keep", "noise_on", "noise_strong", "noise_off", "ptt_on", "ptt_off"];

export const BUILTIN = [
  { id: "game", status: "dnd", notification: "mentions", layout: "", audio: "noise_strong", hotkey: "CommandOrControl+Alt+1" },
  { id: "work", status: "online", notification: "all", layout: "", audio: "noise_on", hotkey: "CommandOrControl+Alt+2" },
  { id: "daily", status: "online", notification: "all", layout: "", audio: "keep", hotkey: "CommandOrControl+Alt+3" },
];

export function mergeProfiles(stored) {
  const list = Array.isArray(stored) ? stored : [];
  return BUILTIN.map((b) => ({ ...b, ...(list.find((p) => p && p.id === b.id) || {}) }));
}

export function profileName(t, p) {
  if (p?.name) return p.name;
  return t(`premiumGaming.workspace.names.${p?.id || "daily"}`);
}

export function useProfiles() {
  const [s] = useFeatureSettings("workspace_profiles", { profiles: [] });
  return useMemo(() => mergeProfiles(s.profiles), [s.profiles]);
}

/** Apply a profile by id. Returns the profile or null. */
export async function applyProfile(id, via = "ui") {
  const s = await getFeatureSettings("workspace_profiles");
  const p = mergeProfiles(s?.profiles).find((x) => x.id === id);
  if (!p) return null;
  const app = getAppBridge();
  if (p.status && app.actions?.setStatus) app.actions.setStatus(p.status);
  if (p.notification && p.notification !== "keep") {
    try { window.dispatchEvent(new CustomEvent("descall:premium:notification-profile", { detail: { id: p.notification, via } })); } catch { /* ignore */ }
  }
  if (p.audio && p.audio !== "keep") {
    if (p.audio === "noise_on") writeVoiceProfile({ noiseMode: "on" });
    else if (p.audio === "noise_strong") writeVoiceProfile({ noiseMode: "strong" });
    else if (p.audio === "noise_off") writeVoiceProfile({ noiseMode: "off" });
    else if (p.audio === "ptt_on") writeVoiceProfile({ pushToTalk: true });
    else if (p.audio === "ptt_off") writeVoiceProfile({ pushToTalk: false });
    try { window.dispatchEvent(new CustomEvent("descall:premium:audio-profile", { detail: { id: p.audio, via } })); } catch { /* ignore */ }
  }
  if (p.layout) await pinvoke("premium:custom_layouts:apply", p.layout);
  await setFeatureSettings("workspace_profiles", { active: p.id });
  logPremiumEvent("profile", profileName(tRuntime, p));
  return p;
}
