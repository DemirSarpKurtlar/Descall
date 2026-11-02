/**
 * Renderer side of the Descall+ hotkey, audio and notification features
 * (one hook, called once from App.jsx).
 *
 * Everywhere: starts the audio / notification runtimes, hooks notification
 * sounds (focus mode, profiles, notification output device) and shows the
 * after-game summary.
 * Desktop app only (window.descallPremium): tells main the call state, runs
 * global hotkey / PTT / tray / quick reply / quick launcher requests from
 * main, switches devices on devicechange (auto_device_switch) and mirrors the
 * device profiles to the tray.
 *
 * With no membership every listener is a no-op and nothing polls.
 */
import { useEffect, useRef } from "react";
import { t } from "../i18n/runtime.js";
import { authedRequest } from "../api/authedHttp";
import { setAudioPlayHook } from "../lib/audioManager";
import notificationService from "../lib/notificationService";
import { readAudioPrefs, setOutputSink, writeAudioPref } from "../lib/callAudioDevices";
import { readParticipantGain, readVoiceProfile, writeVoiceProfile } from "../lib/voiceProfile";
import { hasPremiumFeature, subscribePremium } from "./premiumStore.js";
import { buildIndex, search } from "./launcher/launcherSearch.js";
import { planSwitch } from "./audio/devicePreference.js";
import { BUILTIN_PRESETS, presetToPatch, resolveProfile as resolveDeviceProfile } from "./audio/audioProfiles.js";
import { featureOn, notificationSinkId, onAudioSettings, settingsOf, startPremiumAudioRuntime, updateAudioSettings } from "./audio/premiumAudioRuntime.js";
import { getPinnedVoiceUser } from "./audio/pinnedUser.js";
import { mirrorFocusToMain, premiumSoundAllowed, setDeferredFlusher, setFocus, startPremiumNotifyRuntime } from "./notify/premiumNotify.js";

const CALL_CUES = new Set(["userJoin", "userLeave", "channelJoin", "channelLeave", "mute", "unmute", "deafen", "undeafen", "outgoingCall", "callEnd", "callConnected"]);

function bridge() {
  return typeof window !== "undefined" ? window.descallPremium || null : null;
}

/** Apply a mic preset (built-in or saved): capture settings + gain. */
export async function applyMicPreset(preset) {
  if (!preset) return;
  const { voicePatch, gain } = presetToPatch(preset);
  writeVoiceProfile(voicePatch);
  await updateAudioSettings("mic_presets", { gain, activePresetId: preset.id || null });
}

/** Apply a device profile: input, output and preset. Returns what was missing. */
export async function applyDeviceProfile(profile) {
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { devices = []; }
  const saved = settingsOf("mic_presets").presets || [];
  const r = resolveDeviceProfile(profile, devices, saved);
  if (r.inputId) writeAudioPref("input", r.inputId);
  if (r.outputId) {
    writeAudioPref("output", r.outputId);
    setOutputSink(r.outputId).catch(() => {});
  }
  if (r.preset) await applyMicPreset(r.preset);
  await updateAudioSettings("audio_device_profiles", { activeId: profile.id });
  return r.missing;
}

/** Quick reply through the existing iOS route: notify token, then POST /api/messages/quick-reply. */
let notifyToken = { token: "", exp: 0 };
async function sendQuickReply(conv, text) {
  if (!hasPremiumFeature("quick_reply")) return false;
  if (!notifyToken.token || Date.now() > notifyToken.exp - 60000) {
    const r = await authedRequest("/api/messages/notify-token", { method: "POST" });
    notifyToken = { token: r?.token || "", exp: Date.parse(r?.expiresAt || "") || Date.now() + 10 * 60000 };
  }
  const { API_BASE_URL } = await import("../config/api");
  const res = await fetch(`${API_BASE_URL}/api/messages/quick-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${notifyToken.token}` },
    body: JSON.stringify({ conv, text }),
  });
  if (res.status === 401) notifyToken = { token: "", exp: 0 };
  return res.ok;
}

function voiceSurface({ call, groupCall, serverVoice }) {
  const dm = call?.mode === "active" || call?.mode === "outgoing";
  if (dm) return { kind: "dm", api: call, muted: Boolean(call?.muted), deafened: Boolean(call?.deafened), title: call?.peer?.username || "" };
  if (groupCall?.isInCall) return { kind: "group", api: groupCall, muted: Boolean(groupCall?.isMuted), deafened: Boolean(groupCall?.deafened), title: "" };
  if (serverVoice?.isInVoice) return { kind: "server", api: serverVoice, muted: Boolean(serverVoice?.muted), deafened: Boolean(serverVoice?.deafened), title: serverVoice?.channelName || "" };
  return null;
}

export function usePremiumAudioBridge({ call, groupCall, serverVoice, friends, groups, servers, dmByUserId, onOpenDm, onOpenSettings, onStatusChange }) {
  const ctxRef = useRef({});
  ctxRef.current = { call, groupCall, serverVoice, friends, groups, servers, dmByUserId, onOpenDm, onOpenSettings, onStatusChange };
  const launcherIndexRef = useRef([]);

  // Runtimes + sound hook + deferred summary (web and desktop).
  useEffect(() => {
    startPremiumAudioRuntime();
    startPremiumNotifyRuntime();
    setAudioPlayHook((type) => {
      if (!premiumSoundAllowed(type)) return { block: true };
      if (!CALL_CUES.has(type)) {
        const sinkId = notificationSinkId();
        if (sinkId) return { sinkId };
      }
      return null;
    });
    setDeferredFlusher((summary) => {
      if (!summary?.count) return;
      const names = summary.people.join(", ");
      notificationService.show({
        title: t("premiumAudio.smartGame.summaryTitle"),
        body: summary.more
          ? t("premiumAudio.smartGame.summaryBodyMore", { count: summary.count, names, more: summary.more })
          : t("premiumAudio.smartGame.summaryBody", { count: summary.count, names }),
        tag: "descall-premium-game-summary",
        data: { type: "announcement" },
      });
    });
    return () => {
      setAudioPlayHook(null);
      setDeferredFlusher(null);
    };
  }, []);

  // Call state -> main (media keys, PTT hook and volume hotkeys run only in calls).
  const surface = voiceSurface({ call, groupCall, serverVoice });
  const callKey = surface ? `${surface.kind}:${surface.muted ? 1 : 0}:${surface.deafened ? 1 : 0}:${surface.title}` : "";
  useEffect(() => {
    const b = bridge();
    if (!b) return;
    const s = voiceSurface(ctxRef.current);
    b.invoke("premium:call-state", s ? { active: true, muted: s.muted, deafened: s.deafened, kind: s.kind, title: s.title } : { active: false }).catch(() => {});
  }, [callKey]);

  // Main -> renderer requests (desktop only).
  useEffect(() => {
    const b = bridge();
    if (!b) return undefined;
    const offs = [];
    const on = (ch, fn) => offs.push(b.on(ch, fn));

    on("premium:hotkey", (msg = {}) => {
      const action = String(msg.action || "");
      const s = voiceSurface(ctxRef.current);
      if (action === "toggle_mute" || action === "toggle_deafen") {
        if (!s) return;
        if (action === "toggle_mute") s.api.toggleMute?.();
        else s.api.toggleDeafen?.();
        return;
      }
      if ((action === "volume_up" || action === "volume_down") && s && hasPremiumFeature("per_user_volume_hotkeys")) {
        const userId = getPinnedVoiceUser();
        if (!userId || typeof s.api.setParticipantVolume !== "function") return;
        const step = Math.max(0.05, Math.min(0.5, (Number(msg.step) || 10) / 100));
        const cur = s.api.participantVolumes?.[userId] ?? readParticipantGain(userId) ?? 1;
        const next = Math.max(0, Math.min(2, Math.round((Number(cur) + (action === "volume_up" ? step : -step)) * 100) / 100));
        s.api.setParticipantVolume(userId, next);
      }
    });

    on("premium:ptt", (msg = {}) => {
      window.dispatchEvent(new CustomEvent("descall:ptt", { detail: { down: Boolean(msg.down), source: "global" } }));
    });

    on("premium:tray-action", async (msg = {}) => {
      if (msg.action === "focus") {
        await setFocus(Number(msg.minutes) || 0);
      } else if (msg.action === "audio-profile") {
        const p = (settingsOf("audio_device_profiles").profiles || []).find((x) => x.id === msg.id);
        if (p) await applyDeviceProfile(p);
      }
    });

    on("premium:quick-reply", async (msg = {}) => {
      try {
        const ok = await sendQuickReply(String(msg.conv || ""), String(msg.text || ""));
        if (!ok) throw new Error("failed");
      } catch {
        notificationService.show({ title: t("premiumAudio.quickReply.failedTitle"), body: t("premiumAudio.quickReply.failedBody"), tag: "descall-premium-qr-fail", data: { type: "announcement" } });
      }
    });

    on("premium:launcher-query", (msg = {}) => {
      const c = ctxRef.current;
      const s = voiceSurface(c);
      const actions = [
        s && { id: "action:mute", title: s.muted ? t("premiumAudio.launcher.unmute") : t("premiumAudio.launcher.mute"), subtitle: t("premiumAudio.launcher.voice"), run: { type: "hotkey", action: "toggle_mute" } },
        s && { id: "action:deafen", title: s.deafened ? t("premiumAudio.launcher.undeafen") : t("premiumAudio.launcher.deafen"), subtitle: t("premiumAudio.launcher.voice"), run: { type: "hotkey", action: "toggle_deafen" } },
        { id: "action:status:online", title: t("premiumAudio.launcher.statusOnline"), subtitle: t("premiumAudio.launcher.status"), run: { type: "status", status: "online" } },
        { id: "action:status:idle", title: t("premiumAudio.launcher.statusIdle"), subtitle: t("premiumAudio.launcher.status"), run: { type: "status", status: "idle" } },
        { id: "action:status:dnd", title: t("premiumAudio.launcher.statusDnd"), subtitle: t("premiumAudio.launcher.status"), run: { type: "status", status: "dnd" } },
        { id: "action:status:invisible", title: t("premiumAudio.launcher.statusInvisible"), subtitle: t("premiumAudio.launcher.status"), run: { type: "status", status: "invisible" } },
        { id: "action:settings", title: t("premiumAudio.launcher.openSettings"), subtitle: t("premiumAudio.launcher.app"), focus: true, run: { type: "settings" } },
        hasPremiumFeature("focus_mode") && { id: "action:focus:60", title: t("premiumAudio.launcher.focus60"), subtitle: t("premiumAudio.launcher.focus"), run: { type: "focus", minutes: 60 } },
        hasPremiumFeature("focus_mode") && { id: "action:focus:off", title: t("premiumAudio.launcher.focusOff"), subtitle: t("premiumAudio.launcher.focus"), run: { type: "focus", minutes: 0 } },
      ].filter(Boolean);
      const dms = Object.values(c.dmByUserId || {}).map((d) => d?.user || d?.peer || d).filter((u) => u && u.id);
      const index = buildIndex({ friends: c.friends, dms, groups: c.groups, servers: c.servers, actions, t });
      launcherIndexRef.current = index;
      const results = search(index, String(msg.q || ""), { limit: 12 });
      b.invoke("premium:launcher:results", { id: msg.id, results }).catch(() => {});
    });

    on("premium:launcher-run", (msg = {}) => {
      const item = launcherIndexRef.current.find((x) => x.id === msg.id);
      const run = item?.run;
      if (!run) return;
      const c = ctxRef.current;
      const s = voiceSurface(c);
      if (run.type === "dm") {
        c.onOpenDm?.({ id: run.userId, username: run.username });
      } else if (run.type === "group") {
        window.dispatchEvent(new CustomEvent("descall:notification-click", { detail: { type: "group", groupId: run.groupId, groupName: run.groupName } }));
      } else if (run.type === "server" || run.type === "channel") {
        window.dispatchEvent(new CustomEvent("descall:notification-click", {
          detail: { type: "server-message", serverId: run.serverId, serverName: run.serverName, channelId: run.type === "channel" && run.channelType !== "voice" ? run.channelId : null, channelName: run.channelName },
        }));
      } else if (run.type === "hotkey" && s) {
        if (run.action === "toggle_mute") s.api.toggleMute?.();
        else s.api.toggleDeafen?.();
      } else if (run.type === "status") {
        c.onStatusChange?.(run.status);
      } else if (run.type === "settings") {
        c.onOpenSettings?.();
      } else if (run.type === "focus") {
        setFocus(run.minutes);
      }
    });

    return () => offs.forEach((off) => { try { off?.(); } catch { /* ignore */ } });
  }, []);

  // Focus end time + device profiles -> tray (desktop).
  useEffect(() => {
    if (!bridge()) return undefined;
    const mirrorProfiles = () => {
      if (!hasPremiumFeature("audio_device_profiles")) return;
      const s = settingsOf("audio_device_profiles");
      bridge()?.invoke("premium:audio_device_profiles:mirror", { profiles: (s.profiles || []).map((p) => ({ id: p.id, name: p.name })), activeId: s.activeId }).catch(() => {});
    };
    const offA = onAudioSettings((key) => { if (key === "audio_device_profiles" || key === "*") mirrorProfiles(); });
    const offP = subscribePremium(() => { mirrorProfiles(); mirrorFocusToMain(); });
    mirrorProfiles();
    mirrorFocusToMain();
    return () => { offA(); offP(); };
  }, []);

  // auto_device_switch: listen to devicechange only while the feature is on.
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (!md?.addEventListener) return undefined;
    let prev = null;
    let listening = false;
    const snapshot = () => md.enumerateDevices().then((list) => { prev = list; }).catch(() => {});
    const onChange = async () => {
      let next = [];
      try { next = await md.enumerateDevices(); } catch { return; }
      const before = prev || next;
      prev = next;
      const s = settingsOf("auto_device_switch");
      const prefs = readAudioPrefs();
      const inPlan = planSwitch({ prev: before, next, order: s.inputOrder, currentId: prefs.input, kind: "audioinput", headsetFirst: s.headsetFirst !== false });
      const live = voiceSurface(ctxRef.current);
      if (inPlan) {
        writeAudioPref("input", inPlan.deviceId);
        // Mid-call: swap the live mic too (the hooks' own device setter).
        try { await live?.api?.setAudioInput?.(inPlan.deviceId); } catch { /* keep the current mic */ }
      }
      const outPlan = planSwitch({ prev: before, next, order: s.outputOrder, currentId: prefs.output, kind: "audiooutput", headsetFirst: s.headsetFirst !== false });
      if (outPlan) {
        writeAudioPref("output", outPlan.deviceId);
        setOutputSink(outPlan.deviceId).catch(() => {});
        try { await live?.api?.setAudioOutput?.(outPlan.deviceId); } catch { /* ignore */ }
      }
    };
    const sync = () => {
      const want = featureOn("auto_device_switch");
      if (want && !listening) {
        listening = true;
        snapshot();
        md.addEventListener("devicechange", onChange);
      } else if (!want && listening) {
        listening = false;
        md.removeEventListener("devicechange", onChange);
      }
    };
    const offA = onAudioSettings(sync);
    const offP = subscribePremium(sync);
    sync();
    return () => {
      offA();
      offP();
      if (listening) md.removeEventListener("devicechange", onChange);
    };
  }, []);
}

export { BUILTIN_PRESETS, readVoiceProfile };
export default usePremiumAudioBridge;
