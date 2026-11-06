/**
 * Descall+ / Ultra gaming and productivity host. Mounted (lazily) by AppLayout only for
 * members on desktop / web, never on iOS, so free users load none of this.
 * Everything is off until the user turns it on: no timers, windows, capture or listeners
 * run for a feature that is disabled or not in the plan.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { usePremium } from "../usePremium.js";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "./ui.jsx";
import { brandRgb, logPremiumEvent, pinvoke, pon, setAppBridge } from "./bridge.js";
import { subscribeActiveSpeakers } from "../../lib/activeSpeakers.js";
import { resolveAvatarUrl, resolveDisplayName } from "../../lib/userProfile.js";
import { gameNameFromActivity } from "../../lib/gameActivity.js";
import { API_BASE_URL } from "../../config/api";
import { recordLocalSession, stepGame } from "./gameData.js";
import { emptyState, evaluate, idleThresholdSec, normalizeRules } from "./ruleEngine.js";
import { runAction } from "./actions.js";
import { applyProfile, mergeProfiles, profileName } from "./workspaceProfiles.js";
import { configureClip, saveClip, stopClip, useClipState } from "./clipController.js";
import { captureClipboard } from "./clipboardHistory.js";
import { recentTargets, sendFileTo } from "./sendMedia.js";
import AppLockScreen from "./AppLockScreen.jsx";
import "./gaming.css";

const CommandCenterView = lazy(() => import("./CommandCenterView.jsx"));
const ClipEditor = lazy(() => import("./ClipEditor.jsx"));
const GamingHub = lazy(() => import("./GamingHub.jsx"));

const nameOf = (u) => resolveDisplayName(u) || u?.username || "";
const hudAvatar = (u) => {
  const url = resolveAvatarUrl(u);
  return url && /^(https:\/\/|data:image\/)/i.test(url) ? url : "";
};

function useThrottled(fn, ms) {
  const last = useRef(0);
  const timer = useRef(null);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    const wait = last.current + ms - Date.now();
    clearTimeout(timer.current);
    if (wait <= 0) { last.current = Date.now(); latest.current(); }
    else timer.current = setTimeout(() => { last.current = Date.now(); latest.current(); }, wait);
  }, [ms]);
}

export default function PremiumGamingHost({
  me, socket, friends = [], dms = [], groups = [], servers = [], activeServer = null, onlineUsers = [],
  call, groupCall, serverVoice, myStatus, onStatusChange, onOpenDm, onGroupSelect, activity,
  dmUnread = {}, groupUnread = {}, friendRequests = [],
}) {
  const t = useT();
  const { has, plan } = usePremium();
  const desktop = typeof window !== "undefined" && Boolean(window.descallPremium);

  const [voiceHud] = useFeatureSettings("voice_hud", DEFAULTS.voice_hud);
  const [gamingHud] = useFeatureSettings("gaming_hud", DEFAULTS.gaming_hud);
  const [clipCfg] = useFeatureSettings("instant_clip", DEFAULTS.instant_clip);
  const [clipboardCfg] = useFeatureSettings("clipboard_history", DEFAULTS.clipboard_history);
  const [dropCfg, updateDrop] = useFeatureSettings("quick_file_drop", DEFAULTS.quick_file_drop);
  const [wp] = useFeatureSettings("workspace_profiles", DEFAULTS.workspace_profiles);
  const [auto] = useFeatureSettings("desktop_automations", DEFAULTS.desktop_automations);
  const [cc] = useFeatureSettings("command_center", DEFAULTS.command_center);
  const [widgets, updateWidgets] = useFeatureSettings("widgets", DEFAULTS.widgets);
  const clip = useClipState();
  const [ccOpen, setCcOpen] = useState(false);
  const [hub, setHub] = useState(null);

  // ---- call / presence snapshot ------------------------------------------------------
  const dmActive = call?.mode === "active" || call?.mode === "outgoing";
  const groupActive = Boolean(groupCall?.isInCall);
  const serverActive = Boolean(serverVoice?.isInVoice);
  const inCall = dmActive || groupActive || serverActive;
  const callTitle = dmActive ? nameOf(call?.peer) : groupActive ? (groups.find((g) => g.id === groupCall?.activeGroupId)?.name || t("callui.overlay.groupCall")) : serverActive ? (serverVoice?.channelName || t("callui.overlay.voiceChannel")) : "";
  const callSinceRef = useRef({ key: "", at: 0 });
  const callKey = inCall ? `${dmActive ? "dm" : groupActive ? "group" : "server"}:${callTitle}` : "";
  if (callSinceRef.current.key !== callKey) callSinceRef.current = { key: callKey, at: callKey ? Date.now() : 0 };

  const statusOf = useCallback((id) => {
    const u = onlineUsers.find((x) => String(x.id) === String(id));
    return u ? (u.status && u.status !== "invisible" ? u.status : "online") : "offline";
  }, [onlineUsers]);
  const gameOf = useCallback((id) => gameNameFromActivity(activity?.friendPresence?.[id]), [activity?.friendPresence]);

  const voiceChannels = useMemo(() => {
    const out = [];
    for (const s of [activeServer, ...servers]) {
      for (const c of s?.channels || []) {
        if ((c.type === "voice" || c.type === "stage") && !out.some((x) => x.id === c.id)) out.push({ serverId: s.id, serverName: s.name, id: c.id, name: c.name, type: c.type });
      }
    }
    return out.slice(0, 60);
  }, [activeServer, servers]);
  const textChannels = useMemo(() => (activeServer?.channels || []).filter((c) => c.type === "text").slice(0, 10).map((c) => ({ serverId: activeServer.id, id: c.id, label: `${activeServer.name} / ${c.name}` })), [activeServer]);
  const recentDms = useMemo(() => [...dms].filter((d) => d?.id).sort((a, b) => String(b.lastActivity || "").localeCompare(String(a.lastActivity || ""))).slice(0, 10)
    .map((d) => ({ id: d.id, user: d, preview: typeof d.lastMessage === "string" ? d.lastMessage.slice(0, 60) : "", unread: dmUnread[d.id] || 0 })), [dms, dmUnread]);
  const notifications = useMemo(() => {
    const out = [];
    for (const r of friendRequests.slice(0, 5)) out.push({ id: `fr:${r.id}`, label: t("premiumGaming.commandCenter.friendRequest", { name: nameOf(r.from || r.user || r) }) });
    for (const d of recentDms) if (d.unread) out.push({ id: `dm:${d.id}`, label: t("premiumGaming.commandCenter.dmUnread", { name: nameOf(d.user), count: d.unread }), open: () => onOpenDm?.(d.user) });
    for (const g of groups) if (groupUnread[g.id]) out.push({ id: `g:${g.id}`, label: t("premiumGaming.commandCenter.groupUnread", { name: g.name, count: groupUnread[g.id] }), open: () => onGroupSelect?.(g) });
    return out.slice(0, 12);
  }, [friendRequests, recentDms, groups, groupUnread, onOpenDm, onGroupSelect, t]);

  const actionsRef = useRef({});
  actionsRef.current = {
    setStatus: (s) => onStatusChange?.(s),
    openDm: (u) => onOpenDm?.(u),
    joinVoice: (serverId, channel) => serverVoice?.join?.(serverId, channel),
    switchProfile: (id) => applyProfile(id, "action"),
    openHud: (hud) => import("../featureSettings.js").then((m) => m.setFeatureSettings(hud, { on: true })),
  };
  useEffect(() => {
    setAppBridge({
      me, friends, groups, recentDms, voiceChannels, textChannels, notifications, statusOf, gameOf, activity, plan,
      callInfo: { active: inCall, title: callTitle },
      actions: {
        setStatus: (...a) => actionsRef.current.setStatus(...a),
        openDm: (...a) => actionsRef.current.openDm(...a),
        joinVoice: (...a) => actionsRef.current.joinVoice(...a),
        switchProfile: (...a) => actionsRef.current.switchProfile(...a),
        openHud: (...a) => actionsRef.current.openHud(...a),
      },
    });
  }, [me, friends, groups, recentDms, voiceChannels, textChannels, notifications, statusOf, gameOf, activity, plan, inCall, callTitle]);

  // ---- game sessions + automations ---------------------------------------------------
  const game = gameNameFromActivity(activity?.currentActivity);
  const gameStateRef = useRef({ game: null, since: 0 });
  const autoStateRef = useRef(emptyState());
  const autoOn = has("desktop_automations") && auto.on;
  const rulesRef = useRef([]);
  rulesRef.current = autoOn ? normalizeRules(auto.rules) : [];
  const fire = useCallback((event) => {
    if (!rulesRef.current.length) return;
    const r = evaluate(rulesRef.current, event, autoStateRef.current);
    autoStateRef.current = r.state;
    for (const f of r.fired) {
      runAction(f.action);
      logPremiumEvent("automation", f.ruleName || t(`premiumGaming.automations.triggers.${event.type === "tick" ? "time_window" : event.type}`));
    }
  }, [t]);

  useEffect(() => {
    const step = stepGame(gameStateRef.current, game || null);
    gameStateRef.current = step.state;
    if (step.ended) {
      if (has("game_session_history")) recordLocalSession(step.ended);
      fire({ type: "game_stopped", game: step.ended.game });
    }
    if (step.started) fire({ type: "game_started", game: step.started });
  }, [game, has, fire]);

  const wasInCall = useRef(inCall);
  useEffect(() => {
    if (wasInCall.current === inCall) return;
    wasInCall.current = inCall;
    fire({ type: inCall ? "call_joined" : "call_left" });
  }, [inCall, fire]);

  const hasTimeRules = rulesRef.current.some((r) => r.enabled && r.trigger.type === "time_window");
  useEffect(() => {
    if (!hasTimeRules) return undefined;
    fire({ type: "tick", now: new Date() });
    const id = setInterval(() => fire({ type: "tick", now: new Date() }), 60_000);
    return () => clearInterval(id);
  }, [hasTimeRules, fire]);

  const idleSec = autoOn ? idleThresholdSec(auto.rules) : 0;
  useEffect(() => {
    if (!desktop || !has("desktop_automations")) return undefined;
    pinvoke("premium:desktop_automations:watch-idle", idleSec);
    const off = pon("premium:desktop_automations:idle", (m) => fire({ type: "idle", idle: Boolean(m?.idle), seconds: m?.seconds }));
    return () => { off(); };
  }, [desktop, has, idleSec, fire]);

  // ---- voice HUD -----------------------------------------------------------------------
  const voiceHudOn = desktop && has("voice_hud") && voiceHud.on;
  const speakersRef = useRef(new Set());
  const members = useMemo(() => {
    if (!inCall) return [];
    if (dmActive) return [me, call?.peer].filter(Boolean).map((u) => ({ id: u.id, name: nameOf(u), avatar: hudAvatar(u), muted: u.id === me?.id ? Boolean(call?.muted) : false }));
    const list = groupActive ? groupCall?.participants || [] : serverVoice?.participants || [];
    const selfMuted = groupActive ? groupCall?.isMuted : serverVoice?.muted;
    const all = [{ ...me, isMuted: selfMuted }, ...list.filter((p) => String(p.id) !== String(me?.id))];
    return all.filter((p) => p && p.id).slice(0, 10).map((p) => ({ id: p.id, name: nameOf(p), avatar: hudAvatar(p), muted: Boolean(p.isMuted || p.muted) }));
  }, [inCall, dmActive, groupActive, me, call?.peer, call?.muted, groupCall?.participants, groupCall?.isMuted, serverVoice?.participants, serverVoice?.muted]);

  const pushVoice = useThrottled(() => {
    pinvoke("premium:voice_hud:state", {
      title: inCall ? callTitle : t("premiumGaming.voiceHud.title"),
      members: members.map((m) => ({ ...m, speaking: speakersRef.current.has(String(m.id)) })),
      labels: { empty: t("premiumGaming.voiceHud.empty"), muted: t("premiumGaming.voiceHud.muted") },
      brandRgb: brandRgb(),
    });
  }, 250);

  useEffect(() => {
    if (!voiceHudOn) { if (desktop && has("voice_hud")) pinvoke("premium:voice_hud:close"); return undefined; }
    pinvoke("premium:voice_hud:config", { corner: voiceHud.corner, scale: voiceHud.scale, opacity: voiceHud.opacity, margin: voiceHud.margin })
      .then(() => pinvoke("premium:voice_hud:open")).then(() => pushVoice());
    return subscribeActiveSpeakers((cur) => {
      speakersRef.current = new Set(cur?.ids || []);
      pushVoice();
    });
  }, [voiceHudOn, voiceHud.corner, voiceHud.scale, voiceHud.opacity, voiceHud.margin, desktop, has, pushVoice]);
  useEffect(() => { if (voiceHudOn) pushVoice(); }, [voiceHudOn, members, callTitle, pushVoice]);

  // ---- gaming HUD + widgets (ping, friends, call) --------------------------------------
  const gamingHudOn = desktop && has("gaming_hud") && gamingHud.on;
  const widgetsOn = desktop && has("widgets") && widgets.on && Array.isArray(widgets.widgets) && widgets.widgets.length > 0;
  const [ping, setPing] = useState(null);
  useEffect(() => {
    if (!gamingHudOn || !gamingHud.showPing) return undefined;
    let live = true;
    const measure = async () => {
      if (document.hidden && !gamingHudOn) return;
      const t0 = performance.now();
      try {
        await fetch(`${API_BASE_URL}/api/health`, { method: "GET", cache: "no-store" });
        if (live) setPing(performance.now() - t0);
      } catch { if (live) setPing(null); }
    };
    measure();
    const id = setInterval(measure, 5000);
    return () => { live = false; clearInterval(id); };
  }, [gamingHudOn, gamingHud.showPing]);

  const onlineFriends = useMemo(() => friends.filter((f) => statusOf(f.id) !== "offline").slice(0, 12).map((f) => ({ id: f.id, name: nameOf(f), status: statusOf(f.id), sub: gameOf(f.id) || "" })), [friends, statusOf, gameOf]);
  const callInfo = inCall ? { title: callTitle, since: callSinceRef.current.at, countLabel: t("premiumGaming.gamingHud.people", { count: Math.max(1, members.length || (dmActive ? 2 : 1)) }) } : null;

  useEffect(() => {
    if (!gamingHudOn) { if (desktop && has("gaming_hud")) pinvoke("premium:gaming_hud:close"); return; }
    pinvoke("premium:gaming_hud:config", { corner: gamingHud.corner, scale: gamingHud.scale, opacity: gamingHud.opacity, margin: gamingHud.margin }).then(() => pinvoke("premium:gaming_hud:open"));
  }, [gamingHudOn, gamingHud.corner, gamingHud.scale, gamingHud.opacity, gamingHud.margin, desktop, has]);
  useEffect(() => {
    if (!gamingHudOn) return;
    pinvoke("premium:gaming_hud:state", {
      labels: {
        title: t("premiumGaming.gamingHud.hudTitle"), clock: t("premiumGaming.gamingHud.clock"), descall: t("premiumGaming.gamingHud.descallPing"),
        livekit: t("premiumGaming.gamingHud.voicePing"), ms: t("premiumGaming.gamingHud.ms"), noCall: t("premiumGaming.gamingHud.noCall"),
        friends: t("premiumGaming.gamingHud.friends"), noFriends: t("premiumGaming.gamingHud.noFriends"),
      },
      show: { clock: gamingHud.showClock, ping: gamingHud.showPing, call: gamingHud.showCall, friends: gamingHud.showFriends },
      ping: { descall: ping, livekit: null },
      call: callInfo,
      friends: onlineFriends.slice(0, 6),
      brandRgb: brandRgb(),
    });
  }, [gamingHudOn, gamingHud.showClock, gamingHud.showPing, gamingHud.showCall, gamingHud.showFriends, ping, callInfo?.title, callInfo?.since, callInfo?.countLabel, onlineFriends, t]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!desktop || !has("widgets")) return;
    if (!widgetsOn) { pinvoke("premium:widgets:close-all"); return; }
    pinvoke("premium:widgets:apply", widgets.widgets);
  }, [widgetsOn, widgets.widgets, desktop, has]);
  useEffect(() => {
    if (!widgetsOn) return undefined;
    return pon("premium:widgets:moved", (m) => {
      if (!m?.id) return;
      updateWidgets({ widgets: (widgets.widgets || []).map((w) => (w.id === m.id ? { ...w, x: m.x, y: m.y } : w)) });
    });
  }, [widgetsOn, widgets.widgets, updateWidgets]);
  useEffect(() => {
    if (!widgetsOn) return;
    const kinds = new Set(widgets.widgets.map((w) => w.kind));
    const b = brandRgb();
    if (kinds.has("friends")) pinvoke("premium:widgets:state", "friends", { title: t("premiumGaming.widgets.kinds.friends"), empty: t("premiumGaming.gamingHud.noFriends"), items: onlineFriends, brandRgb: b });
    if (kinds.has("calls")) pinvoke("premium:widgets:state", "calls", { title: t("premiumGaming.widgets.kinds.calls"), empty: t("premiumGaming.gamingHud.noCall"), items: inCall ? members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, sub: callTitle })) : [], brandRgb: b });
    if (kinds.has("notifications")) pinvoke("premium:widgets:state", "notifications", { title: t("premiumGaming.widgets.kinds.notifications"), empty: t("premiumGaming.commandCenter.noNotifications"), items: notifications.map((n) => ({ id: n.id, name: n.label, status: "online" })), brandRgb: b });
  }, [widgetsOn, widgets.widgets, onlineFriends, inCall, members, callTitle, notifications, t]);

  // ---- instant clip ------------------------------------------------------------------
  const clipAllowed = desktop && has("instant_clip");
  useEffect(() => {
    configureClip(clipCfg, clipAllowed);
  }, [clipAllowed, clipCfg.on, clipCfg.sourceId, clipCfg.windowSec]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopClip(), []);
  useEffect(() => {
    if (!clipAllowed) return undefined;
    pinvoke("premium:instant_clip:hotkey", clipCfg.on ? clipCfg.hotkey : "");
    return pon("premium:instant_clip:save", () => saveClip());
  }, [clipAllowed, clipCfg.on, clipCfg.hotkey]);

  // ---- clipboard history -----------------------------------------------------------
  const clipboardOn = has("clipboard_history") && clipboardCfg.on;
  useEffect(() => (clipboardOn ? captureClipboard(document) : undefined), [clipboardOn]);

  // ---- quick file drop -------------------------------------------------------------
  const dropAllowed = desktop && has("quick_file_drop");
  const dropTargets = useMemo(() => recentTargets({ dms: recentDms.map((d) => d.user), groups, channels: textChannels }), [recentDms, groups, textChannels]);
  const dropLabels = useMemo(() => ({ drop: t("premiumGaming.quickDrop.drop"), target: t("premiumGaming.quickDrop.target"), noTargets: t("premiumGaming.quickDrop.noTargets"), sending: t("premiumGaming.common.sending"), tooBig: t("premiumGaming.quickDrop.tooBig"), close: t("premiumGaming.common.close") }), [t]);
  useEffect(() => {
    if (!dropAllowed) return;
    pinvoke("premium:quick_file_drop:state", { targets: dropTargets, labels: dropLabels, trayLabel: t("premiumGaming.quickDrop.tray"), brandRgb: brandRgb() });
  }, [dropAllowed, dropTargets, dropLabels, t]);
  useEffect(() => {
    if (!dropAllowed) return;
    pinvoke(dropCfg.on ? "premium:quick_file_drop:open" : "premium:quick_file_drop:close");
  }, [dropAllowed, dropCfg.on]);
  useEffect(() => {
    if (!dropAllowed) return undefined;
    return pon("premium:quick_file_drop:files", async (m) => {
      let ok = 0;
      for (const f of m?.files || []) {
        try {
          await sendFileTo(socket, m.target, new File([f.data], f.name, { type: f.type }));
          ok += 1;
        } catch { /* reported below */ }
      }
      const status = ok === (m?.files || []).length ? t("premiumGaming.quickDrop.sent", { count: ok }) : t("premiumGaming.quickDrop.failed");
      pinvoke("premium:quick_file_drop:state", { targets: dropTargets, labels: dropLabels, dropStatus: status, brandRgb: brandRgb() });
    });
  }, [dropAllowed, socket, dropTargets, dropLabels, t]);
  // The drop zone's own close button turns the setting off.
  useEffect(() => {
    if (!dropAllowed || !dropCfg.on) return undefined;
    return pon("premium:quick_file_drop:closed", () => updateDrop({ on: false }));
  }, [dropAllowed, dropCfg.on, updateDrop]);

  // ---- workspace profiles ----------------------------------------------------------
  const wpAllowed = has("workspace_profiles");
  const profiles = useMemo(() => mergeProfiles(wp.profiles), [wp.profiles]);
  useEffect(() => {
    if (!desktop || !wpAllowed) return;
    pinvoke("premium:workspace_profiles:bind", { trayTitle: t("premiumGaming.workspace.trayTitle"), profiles: profiles.map((p) => ({ id: p.id, label: profileName(t, p), hotkey: p.hotkey, active: wp.active === p.id })) });
  }, [desktop, wpAllowed, profiles, wp.active, t]);
  useEffect(() => {
    if (!wpAllowed) return undefined;
    return pon("premium:workspace_profiles:switch", (m) => { if (m?.id) applyProfile(m.id, m.via || "tray"); });
  }, [wpAllowed]);

  // ---- command center ---------------------------------------------------------------
  const ccAllowed = has("command_center");
  useEffect(() => {
    if (!ccAllowed) return undefined;
    if (desktop) pinvoke("premium:command_center:hotkey", cc.hotkey || "");
    const offMain = pon("premium:command_center:toggle", () => setCcOpen((v) => !v));
    const onEvt = () => setCcOpen(true);
    window.addEventListener("descall:premium:command-center", onEvt);
    return () => { offMain(); window.removeEventListener("descall:premium:command-center", onEvt); };
  }, [ccAllowed, desktop, cc.hotkey]);

  // ---- multi account labels -----------------------------------------------------------
  useEffect(() => {
    if (!desktop || !has("multi_account")) return;
    pinvoke("premium:multi_account:labels", { menu: t("premiumGaming.multiAccount.menu"), add: t("premiumGaming.multiAccount.add"), main: nameOf(me) || t("premiumGaming.multiAccount.main"), unnamed: t("premiumGaming.multiAccount.unnamed") });
  }, [desktop, has, me, t]);

  // ---- hub (panels) -------------------------------------------------------------------
  useEffect(() => {
    const onOpen = (e) => setHub({ key: e?.detail?.key || null });
    // In-window shortcut (not global): Ctrl/Cmd+Shift+G opens the hub.
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && String(e.key).toLowerCase() === "g") {
        e.preventDefault();
        setHub((h) => (h ? null : { key: null }));
      }
    };
    window.addEventListener("descall:premium:gaming-hub", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("descall:premium:gaming-hub", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      {desktop && has("app_lock") ? <AppLockScreen /> : null}
      <Suspense fallback={null}>
        {ccOpen && ccAllowed ? <CommandCenterView onClose={() => setCcOpen(false)} /> : null}
        {clip.editor && clipAllowed ? <ClipEditor snap={clip.editor} socket={socket} /> : null}
        {hub ? <GamingHub initialKey={hub.key} onClose={() => setHub(null)} /> : null}
      </Suspense>
    </>
  );
}
