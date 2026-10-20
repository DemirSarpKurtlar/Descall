import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { pastedImageFile } from "../../lib/clipboardImage";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Send, Check, Mic, Smile,
  Plus, Gift, Image, FileText, X, StopCircle, Loader2, Reply,
  Pencil, Timer, CircleHelp,
} from "../ui/Icon.jsx";
import { SLASH_ICONS } from "../polls/slashIconsMap";
import PollCreateSheet from "../polls/PollCreateSheet";
import BanConfirm from "../polls/BanConfirm";
import { useCompact } from "../polls/dsxShared";
import { getServerMembers } from "../../api/servers";
import { getPresenceStatus } from "../../lib/presence";
import GiphyPicker from "./GiphyPicker";
import { getToken } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import { encodeVoiceContent, pickRecorderMime, extensionForMime } from "../../lib/voiceMessage";
import { useT } from "../../context/LocaleContext";
import {
  getSlashCommandsForSurface, slashInsertText, searchSlashCommands, slashMenuSections, slashQueryOf,
  slashArgState, slashNameOf, findSlashCommand, foldTr, TIMEOUT_DURATIONS, PURGE_COUNTS,
} from "../../lib/slashCommands";
import SlashCommandMenu, { SLASH_CATEGORIES, UserPicker, DurationPicker, CountPicker } from "./SlashCommandMenu";
import { hapticWarning } from "../../lib/fluid/haptics";
import { serverHasPermission } from "../../lib/serverPermissions";
import { displayText } from "../../lib/profanity";
import useGlassUi from "../../hooks/useGlassUi";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import { setActivityFlag } from "../../lib/updateTiming";
import { EMOJI_CATEGORIES } from "../../lib/emojiCatalog";



function formatSlowmode(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!n) return "";
  if (n >= 3600) return `${Math.round(n / 3600)}h`;
  if (n >= 60) return `${Math.round(n / 60)}m`;
  return `${n}s`;
}

export default function MessageComposer({
  onSend,
  disabled = false,
  activeDmUser,
  activeGroup,
  activeChannel = null,
  activeServer = null,
  onTypingDmStart,
  onTypingDmStop,
  onTypingGroupStart,
  onTypingGroupStop,
  onTypingChannelStart,
  onTypingChannelStop,
  replyTo = null,
  onClearReply,
  editingMessage = null,
  onCancelEdit,
  onSaveEdit,
  me = null,
  onlineUsers = [],
  recentMessages = [],
}) {
  const t = useT();
  const glass = useGlassUi();
  const reduceMotion = useReducedMotion();
  // Critically damped spring (ζ = 1, response 0.35s). Reduced motion is a fade.
  const replyStripTransition = !glass
    ? { duration: 0.16 }
    : (reduceMotion ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.default));
  // Cancel sits outside the field. preventDefault keeps the textarea focused
  // so the iOS keyboard stays up while the strip springs out.
  const keepComposerFocus = (event) => {
    event.preventDefault();
  };
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashMenuRef = useRef(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [waveBars, setWaveBars] = useState(() => Array(24).fill(0.15));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pendingAttach, setPendingAttach] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  // Smart update timing (2.11.0): unsent text, a recording or an upload holds any restart/reload.
  const activityKeyRef = useRef(`composer:${Math.random().toString(36).slice(2, 9)}`);
  const composerBusy = Boolean(message.trim()) || uploading || isRecording || Boolean(pendingAttach);
  useEffect(() => {
    setActivityFlag(activityKeyRef.current, composerBusy);
  }, [composerBusy]);
  useEffect(() => () => setActivityFlag(activityKeyRef.current, false), []);
  const [sendFlash, setSendFlash] = useState(false);
  const [slowmodeUntil, setSlowmodeUntil] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const slowmodeSeconds = Math.max(0, Math.floor(Number(activeChannel?.slowmodeSeconds) || 0));
  const slowmodeLabel = formatSlowmode(slowmodeSeconds);
  const bypassSlowmode =
    Boolean(activeServer) &&
    (serverHasPermission(activeServer, "MANAGE_MESSAGES") ||
      serverHasPermission(activeServer, "ADMINISTRATOR"));
  const slowmodeRemaining = Math.max(0, Math.ceil((slowmodeUntil - nowTick) / 1000));
  const slowmodeBlocked = Boolean(activeChannel?.id) && !bypassSlowmode && slowmodeRemaining > 0;
  const inputRef = useRef(null);
  const messageRef = useRef("");
  const editStashRef = useRef(null);
  const editIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimeRef = useRef(0);
  const timerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const attachBtnRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sendingRef = useRef(false);

  messageRef.current = message;

  useEffect(() => {
    if (!glass) return undefined;
    const id = editingMessage?.id || null;
    if (id && editIdRef.current !== id) {
      if (editIdRef.current == null) editStashRef.current = messageRef.current;
      editIdRef.current = id;
      const text = editingMessage.text || "";
      setMessage(text);
      let timer = 0;
      const place = () => {
        const el = inputRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch { /* ignore */ }
      };
      const frame = requestAnimationFrame(place);
      timer = window.setTimeout(place, 60);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
    if (!id && editIdRef.current) {
      editIdRef.current = null;
      const stash = editStashRef.current;
      editStashRef.current = null;
      if (stash != null) setMessage(stash);
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [glass, editingMessage]);

  useEffect(() => {
    // Autofocus on mobile opens the iOS keyboard and often leaves the shell
    // stuck elevated after dismiss, only autofocus desktop / large screens.
    const isNarrow = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
    if (isNarrow) return;
    inputRef.current?.focus();
  }, [activeDmUser?.id, activeGroup?.id, replyTo?.id]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    const onBlur = () => {
      // After keyboard dismiss animation (~280ms), avoid mid-slide scroll jumps.
      window.setTimeout(() => {
        try {
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        } catch { /* ignore */ }
      }, 280);
    };
    el.addEventListener("blur", onBlur);
    return () => el.removeEventListener("blur", onBlur);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest(".emoji-picker") && !e.target.closest(".composer-action-btn")) {
        setShowEmojiPicker(false);
      }
      if (!e.target.closest(".attachment-menu") && !e.target.closest(".composer-action-btn")) {
        setShowAttachmentMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const emitTypingStop = useCallback(() => {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    if (activeDmUser) onTypingDmStop?.(activeDmUser.id);
    else if (activeGroup) onTypingGroupStop?.(activeGroup.id);
    else if (activeChannel?.id) onTypingChannelStop?.(activeChannel.id);
  }, [
    activeDmUser,
    activeGroup,
    activeChannel?.id,
    onTypingDmStop,
    onTypingGroupStop,
    onTypingChannelStop,
  ]);

  const emitTypingStart = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      if (activeDmUser) onTypingDmStart?.(activeDmUser.id);
      else if (activeGroup) onTypingGroupStart?.(activeGroup.id);
      else if (activeChannel?.id) onTypingChannelStart?.(activeChannel.id);
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(emitTypingStop, 3000);
  }, [
    activeDmUser,
    activeGroup,
    activeChannel?.id,
    onTypingDmStart,
    onTypingGroupStart,
    onTypingChannelStart,
    emitTypingStop,
  ]);

  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      emitTypingStop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDmUser?.id, activeGroup?.id, activeChannel?.id]);

  const slashCommands = useMemo(
    () =>
      getSlashCommandsForSurface({
        activeChannel,
        activeGroup,
        activeDmUser,
        permissionFlags: activeServer?.myPermissions?.flags || {},
        isOwner: Boolean(activeServer?.isOwner),
      }).map((cmd) => ({
        ...cmd,
        Icon: SLASH_ICONS[cmd.name] || CircleHelp,
      })),
    [activeChannel, activeGroup, activeDmUser, activeServer?.isOwner, activeServer?.myPermissions?.flags]
  );

  // Esc closes the menu for the text typed so far; typing again reopens it.
  const [slashDismissedFor, setSlashDismissedFor] = useState(null);
  const [slashCategory, setSlashCategory] = useState("all");
  const slashQuery = slashDismissedFor !== null && slashDismissedFor === message ? null : slashQueryOf(message);
  const slashMenuOpen = slashQuery !== null && slashCommands.length > 0;
  const slashSearch = useMemo(
    () => (slashMenuOpen ? searchSlashCommands(slashCommands, slashQuery) : []),
    [slashMenuOpen, slashCommands, slashQuery]
  );
  const slashSections = useMemo(
    () => slashMenuSections(slashSearch, { query: slashQuery || "", category: slashCategory }),
    [slashSearch, slashQuery, slashCategory]
  );
  const slashMatches = useMemo(() => slashSections.flatMap((sec) => sec.items), [slashSections]);
  const compactUi = useCompact(720);
  const [wideMenu, setWideMenu] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1100);
  useEffect(() => {
    const onResize = () => setWideMenu(window.innerWidth >= 1100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!slashMenuOpen) setSlashCategory("all");
  }, [slashMenuOpen]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashMatches.length, message, slashCategory]);

  // 2.12.0 poll create sheet and the /ban confirm.
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const [banConfirm, setBanConfirm] = useState(null);

  const focusInputAt = useCallback((pos) => {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const p = pos ?? el.value.length;
      el.selectionStart = el.selectionEnd = p;
    });
  }, []);

  const openPollSheet = useCallback(() => {
    setMessage("");
    setSlashIndex(0);
    setPollSheetOpen(true);
  }, []);

  const applySlashCommand = useCallback((cmd) => {
    if (!cmd) return;
    if (cmd.locked) {
      hapticWarning();
      return;
    }
    if (cmd.name === "poll") {
      openPollSheet();
      return;
    }
    const insert = slashInsertText(cmd);
    setMessage(insert);
    setSlashIndex(0);
    focusInputAt(insert.length);
  }, [openPollSheet, focusInputAt]);

  // Error card suggestions ("Bunu mu demek istedin?") put a command in the composer.
  useEffect(() => {
    const onInsert = (event) => {
      const text = String(event?.detail?.text || "");
      if (!text) return;
      setMessage(text);
      focusInputAt(text.length);
    };
    window.addEventListener("descall:composer-insert", onInsert);
    return () => window.removeEventListener("descall:composer-insert", onInsert);
  }, [focusInputAt]);

  /* ---------- argument pickers (user / duration / count) ---------- */
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerDismissedFor, setPickerDismissedFor] = useState(null);
  const [serverMembers, setServerMembers] = useState({ serverId: null, list: null });
  const argState = useMemo(() => {
    if (slashMenuOpen || (pickerDismissedFor !== null && pickerDismissedFor === message)) return null;
    const st = slashArgState(message);
    if (!st) return null;
    const available = slashCommands.find((c) => c.name === st.cmd.name);
    if (!available || available.locked) return null;
    return st;
  }, [message, slashMenuOpen, pickerDismissedFor, slashCommands]);
  const pickerKind = !argState
    ? null
    : argState.cmd.userArg && argState.argIndex === 0
      ? "user"
      : argState.cmd.durationArg && argState.argIndex === 1
        ? "duration"
        : argState.cmd.countArg && argState.argIndex === 0 && /^\d{0,3}$/.test(argState.argText)
          ? "count"
          : null;

  const serverIdForPicker = activeChannel?.id ? activeServer?.id || activeChannel?.serverId : null;
  useEffect(() => {
    if (pickerKind !== "user" || !serverIdForPicker) return;
    if (serverMembers.serverId === serverIdForPicker && serverMembers.list) return;
    let cancelled = false;
    getServerMembers(serverIdForPicker)
      .then((data) => !cancelled && setServerMembers({ serverId: serverIdForPicker, list: data?.members || [] }))
      .catch(() => !cancelled && setServerMembers({ serverId: serverIdForPicker, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [pickerKind, serverIdForPicker, serverMembers.serverId, serverMembers.list]);

  const pickerUserSections = useMemo(() => {
    if (pickerKind !== "user") return [];
    const q = foldTr(String(argState.argText || "").replace(/^@/, ""));
    const selfId = me?.id || null;
    const excludeSelf = !["user", "avatar"].includes(argState.cmd.name);
    const roles = Array.isArray(activeServer?.roles) ? activeServer.roles : [];
    const roleInfo = (roleIds) => {
      const ids = new Set((roleIds || []).map(String));
      const top = roles
        .filter((r) => !r.isEveryone && ids.has(String(r.id)))
        .sort((a, b) => (b.position || 0) - (a.position || 0))[0];
      if (!top) return { roleName: null, roleColor: null };
      const n = Number(top.color) || 0;
      return { roleName: top.name, roleColor: n ? `#${n.toString(16).padStart(6, "0")}` : null };
    };
    const norm = (u) => ({
      id: u.userId || u.id,
      username: u.username,
      displayName: u.displayName || u.display_name || null,
      nickname: u.nickname || null,
      avatarUrl: u.avatarUrl || u.avatar_url || null,
      roleIds: u.roleIds || [],
    });
    const matches = (u) => !q || [u.username, u.displayName, u.nickname].some((v) => v && foldTr(v).includes(q));
    const ok = (u) => u?.id && u.username && matches(u) && !(excludeSelf && selfId && String(u.id) === String(selfId));
    let pool = [];
    if (serverIdForPicker) pool = (serverMembers.serverId === serverIdForPicker ? serverMembers.list || [] : []).map(norm);
    else if (activeGroup) pool = (activeGroup.members || []).map(norm);
    else if (activeDmUser) pool = [norm(activeDmUser), ...(me ? [norm(me)] : [])];
    const byId = new Map(pool.map((u) => [String(u.id), u]));
    const recentIds = [];
    for (let i = (recentMessages || []).length - 1; i >= 0 && recentIds.length < 12; i -= 1) {
      const m = recentMessages[i];
      const sid = m?.sender?.id || m?.from?.id || m?.senderId || m?.sender_id;
      if (sid && !recentIds.includes(String(sid)) && byId.has(String(sid))) recentIds.push(String(sid));
    }
    const decorate = (u) => {
      const presence = getPresenceStatus(onlineUsers, u.id);
      const live = (onlineUsers || []).find((x) => String(x.id) === String(u.id));
      const custom = live?.customStatus?.text || (typeof live?.customStatus === "string" ? live.customStatus : null);
      return { user: u, presence, status: custom || null, ...(serverIdForPicker ? roleInfo(u.roleIds) : {}) };
    };
    const here = recentIds.map((id) => byId.get(id)).filter(ok).slice(0, 4);
    const hereIds = new Set(here.map((u) => String(u.id)));
    const rest = pool
      .filter((u) => !hereIds.has(String(u.id)) && ok(u))
      .sort((a, b) => {
        const qa = foldTr(a.username).startsWith(q) ? 0 : 1;
        const qb = foldTr(b.username).startsWith(q) ? 0 : 1;
        return qa - qb || String(a.username).localeCompare(String(b.username), "tr");
      })
      .slice(0, 8);
    const out = [];
    if (here.length) out.push({ id: "here", label: activeChannel?.id ? "BU KANALDA" : "BU SOHBETTE", items: here.map(decorate) });
    if (rest.length) out.push({ id: "all", label: activeChannel?.id ? "SUNUCU ÜYELERİ" : activeGroup ? "GRUP ÜYELERİ" : "SOHBET", items: rest.map(decorate) });
    return out;
  }, [pickerKind, argState, me, activeServer?.roles, serverIdForPicker, serverMembers, activeGroup, activeDmUser, recentMessages, onlineUsers, activeChannel?.id]);
  const pickerUsers = useMemo(() => pickerUserSections.flatMap((s) => s.items), [pickerUserSections]);

  const timeoutTarget = useMemo(() => {
    if (pickerKind !== "duration") return null;
    const handle = String(argState.before[0] || "").replace(/^@/, "");
    const list = serverMembers.list || [];
    const hit = list.find((m) => foldTr(m.username || "") === foldTr(handle));
    return hit ? { ...hit, id: hit.userId } : handle ? { username: handle } : null;
  }, [pickerKind, argState, serverMembers.list]);

  const pickerCount = pickerKind === "user" ? pickerUsers.length : pickerKind === "duration" ? TIMEOUT_DURATIONS.length : pickerKind === "count" ? PURGE_COUNTS.length : 0;
  useEffect(() => {
    if (pickerKind === "duration") setPickerIndex(1);
    else setPickerIndex(0);
  }, [pickerKind, argState?.argText]);

  const fillArg = useCallback((value) => {
    const first = message.split(" ")[0];
    const before = argState?.before || [];
    const next = `${first} ${[...before, value].join(" ")} `;
    setMessage(next);
    focusInputAt(next.length);
  }, [message, argState, focusInputAt]);

  const pickFromPicker = useCallback((index = pickerIndex) => {
    if (pickerKind === "user") {
      const it = pickerUsers[index];
      if (it) fillArg(`@${it.user.username}`);
      return Boolean(it);
    }
    if (pickerKind === "duration") {
      const d = TIMEOUT_DURATIONS[index];
      if (d) fillArg(d.token);
      return Boolean(d);
    }
    if (pickerKind === "count") {
      const c = PURGE_COUNTS[index];
      if (c) {
        const first = message.split(" ")[0];
        const next = `${first} ${c}`;
        setMessage(next);
        focusInputAt(next.length);
      }
      return Boolean(c);
    }
    return false;
  }, [pickerKind, pickerUsers, pickerIndex, fillArg, message, focusInputAt]);

  const withReply = (payload) => {
    if (!replyTo) return payload;
    const replyMeta = {
      id: replyTo.id,
      text: replyTo.text || "",
      mediaType: replyTo.mediaType,
      from: replyTo.from || { username: replyTo.username },
    };
    if (typeof payload === "string") {
      return { type: "text", text: payload, replyTo: replyMeta };
    }
    return { ...payload, replyTo: replyMeta };
  };

  useEffect(() => {
    setSlowmodeUntil(0);
  }, [activeChannel?.id, slowmodeSeconds]);

  useEffect(() => {
    if (!slowmodeUntil) return undefined;
    const id = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [slowmodeUntil]);

  useEffect(() => {
    const onSlowmode = (event) => {
      const detail = event?.detail || {};
      if (!activeChannel?.id || String(detail.channelId) !== String(activeChannel.id)) return;
      const wait = Math.max(1, Math.ceil(Number(detail.retryAfterSeconds) || 1));
      setSlowmodeUntil(Date.now() + wait * 1000);
      setNowTick(Date.now());
    };
    window.addEventListener("descall:slowmode", onSlowmode);
    return () => window.removeEventListener("descall:slowmode", onSlowmode);
  }, [activeChannel?.id]);

  const armLocalSlowmode = () => {
    if (!activeChannel?.id || !slowmodeSeconds || bypassSlowmode) return;
    setSlowmodeUntil(Date.now() + slowmodeSeconds * 1000);
    setNowTick(Date.now());
  };

  const handleSend = () => {
    if (glass && editingMessage) {
      const next = message.trim();
      const original = String(editingMessage.text || "").trim();
      if (!next || next === original || disabled) return;
      onSaveEdit?.({ ...editingMessage, newText: next });
      return;
    }
    if (disabled || slowmodeBlocked || sendingRef.current) return;
    sendingRef.current = true;
    window.setTimeout(() => {
      sendingRef.current = false;
    }, 450);
    clearTimeout(typingTimerRef.current);
    emitTypingStop();

    const flash = () => {
      setSendFlash(true);
      window.setTimeout(() => setSendFlash(false), 480);
    };

    if (pendingAttach) {
      // Typed text goes with the attachment as its caption (one message).
      const caption = message.trim();
      onSend?.(withReply(caption ? { ...pendingAttach, text: caption } : { ...pendingAttach }));
      if (caption) setMessage("");
      setPendingAttach(null);
      if (pendingAttach.previewUrl) URL.revokeObjectURL(pendingAttach.previewUrl);
      onClearReply?.();
      armLocalSlowmode();
      flash();
      return;
    }

    if (!message.trim()) return;
    const text = message.trim();
    const typedName = slashNameOf(text);
    const typedCmd = typedName ? findSlashCommand(typedName) : null;
    // "/poll" alone opens the create sheet; "/poll Soru | A | B" stays the quick path.
    if (typedCmd?.name === "poll" && !/\s/.test(text)) {
      const allowed = slashCommands.find((c) => c.name === "poll");
      if (allowed && !allowed.locked) {
        openPollSheet();
        return;
      }
    }
    // "/ban @x sebep" asks first.
    if (typedCmd?.name === "ban" && activeChannel?.id && !banConfirm) {
      const parts = text.split(/\s+/);
      const handle = String(parts[1] || "").replace(/^@/, "");
      if (handle) {
        const hit = (serverMembers.list || []).find((m) => foldTr(m.username || "") === foldTr(handle));
        setBanConfirm({
          first: parts[0],
          handle,
          targetName: hit?.nickname || hit?.displayName || handle,
          reason: parts.slice(2).join(" "),
        });
        return;
      }
    }
    onSend?.(withReply(text));
    setMessage("");
    onClearReply?.();
    armLocalSlowmode();
    flash();
  };

  const handleKeyDown = (e) => {
    if (slashMenuOpen) {
      if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        setSlashCategory(SLASH_CATEGORIES[Number(e.key) - 1]?.id || "all");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissedFor(message);
        return;
      }
    }
    if (slashMenuOpen && slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        const cmd = slashMatches[slashIndex] || slashMatches[0];
        const typed = message.trim().slice(1).toLocaleLowerCase("tr");
        const exact = cmd && (cmd.name === typed || (cmd.aliases || []).includes(typed));
        // "/help" + Enter runs it; picking only completes when there is more to type.
        if (e.key === "Enter" && exact && cmd.name !== "poll" && !slashInsertText(cmd).endsWith(" ")) {
          e.preventDefault();
          handleSend();
          return;
        }
        e.preventDefault();
        applySlashCommand(cmd);
        return;
      }
    }
    if (pickerKind && pickerCount > 0) {
      const horizontal = pickerKind !== "user";
      const nextKey = horizontal ? ["ArrowRight", "ArrowDown"] : ["ArrowDown"];
      const prevKey = horizontal ? ["ArrowLeft", "ArrowUp"] : ["ArrowUp"];
      if (nextKey.includes(e.key)) {
        e.preventDefault();
        setPickerIndex((i) => (i + 1) % pickerCount);
        return;
      }
      if (prevKey.includes(e.key)) {
        e.preventDefault();
        setPickerIndex((i) => (i - 1 + pickerCount) % pickerCount);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPickerDismissedFor(message);
        return;
      }
      const typedArg = argState?.argText || "";
      const optionalUser = pickerKind === "user" && argState?.cmd.args?.[0]?.optional && !typedArg;
      const typedCount = pickerKind === "count" && /^\d+$/.test(typedArg) && Number(typedArg) >= 1 && Number(typedArg) <= 100;
      const typedDuration = pickerKind === "duration" && TIMEOUT_DURATIONS.some((d) => d.token === typedArg);
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !optionalUser && !typedCount && !typedDuration)) {
        e.preventDefault();
        pickFromPicker();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && glass && editingMessage) {
      e.preventDefault();
      onCancelEdit?.();
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    if (e.key === "Escape" && replyTo) {
      onClearReply?.();
    }
  };

  const stageFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    formData.append("purpose", "message");
    formData.append("file", file);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const previewUrl =
        data.mediaType === "image" || file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null;
      setPendingAttach({
        type: "media",
        mediaUrl: data.url,
        mediaType: data.mediaType,
        originalName: data.originalName || file.name,
        mimeType: data.mimeType || file.type,
        size: data.size || file.size,
        previewUrl,
      });
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError(err.message);
      setTimeout(() => setUploadError(""), 4000);
    } finally {
      setUploading(false);
    }
  };

  // Ctrl+V / Cmd+V: clipboard images (screenshots, copied images, copied image
  // files) are staged as an attachment; text paste is left to the textarea.
  const onPaste = async (e) => {
    const file = pastedImageFile(e.clipboardData);
    if (file) {
      e.preventDefault();
      await stageFile(file);
      return;
    }
    const hasText = Boolean(e.clipboardData?.getData?.("text/plain"));
    if (hasText || typeof window === "undefined" || !window.electronAPI?.readClipboardImage) return;
    // Electron: some sources (e.g. Snipping Tool, copied file in Explorer) give
    // the paste event no File; read the clipboard image in the main process.
    try {
      const png = await window.electronAPI.readClipboardImage();
      if (png && png.byteLength) {
        e.preventDefault?.();
        await stageFile(new File([png], `pasted-${Date.now()}.png`, { type: "image/png" }));
      }
    } catch {
      /* clipboard read is best effort */
    }
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    await stageFile(file);
    e.target.value = "";
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) await stageFile(file);
  };

  const startWaveform = (stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.max(1, Math.floor(data.length / 24));
        const bars = [];
        for (let i = 0; i < 24; i += 1) {
          bars.push(Math.max(0.12, (data[i * step] || 0) / 255));
        }
        setWaveBars(bars);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* ignore */
    }
  };

  const stopWaveform = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setWaveBars(Array(24).fill(0.15));
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      const mimeType = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const actualMime = recorder.mimeType || mimeType || "audio/webm";
      audioChunksRef.current = [];
      recordingTimeRef.current = 0;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopWaveform();
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        if (!blob.size) {
          setUploadError(t("Empty recording, try again."));
          setTimeout(() => setUploadError(""), 4000);
          return;
        }
        const durationSec = Math.max(1, recordingTimeRef.current || 1);
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append("purpose", "message");
          const ext = extensionForMime(actualMime);
          formData.append("file", blob, `voice-${Date.now()}.${ext}`);
          const res = await fetch(`${API_BASE_URL}/api/media/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
            body: formData,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Voice upload failed");
          onSend?.(withReply({
            type: "media",
            mediaUrl: data.url,
            mediaType: "voice",
            // The server stores voice notes as AAC/M4A; report what was stored.
            mimeType: data.mimeType || actualMime,
            originalName: data.originalName || `voice.${ext}`,
            size: data.size || blob.size,
            duration: durationSec,
            text: encodeVoiceContent(durationSec),
          }));
          onClearReply?.();
        } catch (err) {
          setUploadError(err.message);
          setTimeout(() => setUploadError(""), 4000);
        } finally {
          setUploading(false);
        }
      };
      recorder.onerror = () => {
        stopWaveform();
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        setUploadError(t("Recording failed."));
        setTimeout(() => setUploadError(""), 4000);
      };
      // timeslice helps finalize duration metadata on some browsers
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      startWaveform(stream);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          const next = t + 1;
          recordingTimeRef.current = next;
          if (next >= 120) {
            // auto-stop at 2 minutes
            try {
              mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop();
            } catch {
              /* ignore */
            }
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error("Recording failed:", err);
      setUploadError(t("Microphone access denied."));
      setTimeout(() => setUploadError(""), 4000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSend, replyTo, onClearReply]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.requestData?.();
      } catch {
        /* ignore */
      }
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    setIsRecording(false);
  }, []);

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    if (!el) { setMessage((m) => m + emoji); return; }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const before = message.slice(0, start);
    const after = message.slice(end);
    const next = before + emoji + after;
    setMessage(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length;
      el.focus();
    });
  };

  const handleGifSelect = (gif) => {
    onSend?.(withReply({ type: "gif", mediaUrl: gif.url, mediaType: "gif", title: gif.title }));
    setShowGiphy(false);
    onClearReply?.();
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const editing = Boolean(glass && editingMessage);
  const editOriginal = String(editingMessage?.text || "").trim();
  const canSaveEdit = editing && Boolean(message.trim()) && message.trim() !== editOriginal;
  const canSend = editing
    ? canSaveEdit
    : Boolean(message.trim() || pendingAttach) && !slowmodeBlocked;

  return (
    <div
      className={`message-composer${dragOver ? " is-dragover" : ""}${sendFlash ? " is-sending" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <GiphyPicker
        isOpen={showGiphy}
        onClose={() => setShowGiphy(false)}
        onSelectGif={handleGifSelect}
        anchorRef={attachBtnRef}
      />

      <AnimatePresence>
        {slowmodeLabel && !replyTo && (
          <motion.div
            className="composer-slowmode-hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Timer size={13} />
            <span>
              {slowmodeBlocked
                ? t("Slowmode: wait {time}", { time: `${slowmodeRemaining}s` })
                : t("Slowmode is on: {time} between messages", { time: slowmodeLabel })}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {replyTo && !editing && (
          <motion.div
            className="composer-reply-bar"
            initial={glass
              ? (reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, height: 0 })
              : { opacity: 0, height: 0 }}
            animate={glass
              ? (reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" })
              : { opacity: 1, height: "auto" }}
            exit={glass
              ? (reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, height: 0 })
              : { opacity: 0, height: 0 }}
            transition={replyStripTransition}
          >
            <Reply size={14} />
            <div className="composer-reply-meta">
              <strong>{t("Replying to")} {replyTo.from?.displayName || replyTo.from?.display_name || replyTo.from?.username || t("message")}</strong>
              <span>
                {replyTo.text
                  ? displayText(String(replyTo.text).slice(0, 100))
                  : replyTo.mediaType
                  ? `📎 ${replyTo.mediaType}`
                  : t("Message")}
              </span>
            </div>
            <button
              type="button"
              className="composer-reply-clear"
              onPointerDown={keepComposerFocus}
              onMouseDown={keepComposerFocus}
              onClick={() => {
                onClearReply?.();
                inputRef.current?.focus({ preventScroll: true });
              }}
              aria-label={t("Cancel reply")}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <motion.div
            className="composer-reply-bar composer-edit-bar"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, height: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, height: 0 }}
            transition={replyStripTransition}
          >
            <Pencil size={14} />
            <div className="composer-reply-meta">
              <strong>{t("Edit message")}</strong>
              <span>
                {displayText(String(editingMessage.text || "").replace(/\s+/g, " ").slice(0, 100))}
              </span>
            </div>
            <button
              type="button"
              className="composer-reply-clear"
              onPointerDown={keepComposerFocus}
              onMouseDown={keepComposerFocus}
              onClick={() => {
                onCancelEdit?.();
                inputRef.current?.focus({ preventScroll: true });
              }}
              aria-label={t("Cancel edit")}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingAttach && (
          <motion.div
            className="composer-attach-preview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            {pendingAttach.previewUrl ? (
              <img src={pendingAttach.previewUrl} alt="" className="composer-attach-thumb" />
            ) : (
              <div className="composer-attach-file">
                <FileText size={18} />
              </div>
            )}
            <div className="composer-attach-meta">
              <strong>{pendingAttach.originalName || t("Attachment")}</strong>
              <span>{pendingAttach.mediaType}</span>
            </div>
            <button
              type="button"
              className="composer-reply-clear"
              onClick={() => {
                if (pendingAttach.previewUrl) URL.revokeObjectURL(pendingAttach.previewUrl);
                setPendingAttach(null);
              }}
              aria-label={t("Remove attachment")}
              onPointerDown={keepComposerFocus}
              onMouseDown={keepComposerFocus}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {slashMenuOpen ? (
          <SlashCommandMenu
            key="slash-menu"
            menuRef={slashMenuRef}
            sections={slashSections}
            flat={slashMatches}
            activeIndex={slashIndex}
            onHover={setSlashIndex}
            onPick={applySlashCommand}
            query={slashQuery || ""}
            category={slashCategory}
            onCategory={setSlashCategory}
            compact={compactUi}
            showDetail={wideMenu}
            allCommands={slashCommands}
            onPickFrequent={applySlashCommand}
          />
        ) : pickerKind === "user" ? (
          <UserPicker
            key="slash-user"
            menuRef={slashMenuRef}
            query={String(argState?.argText || "").replace(/^@/, "")}
            sections={pickerUserSections}
            activeIndex={pickerIndex}
            onHover={setPickerIndex}
            onPick={(it) => fillArg(`@${it.user.username}`)}
            compact={compactUi}
            self={argState?.cmd.args?.[0]?.optional ? me : null}
          />
        ) : pickerKind === "duration" ? (
          <DurationPicker
            key="slash-duration"
            menuRef={slashMenuRef}
            durations={TIMEOUT_DURATIONS}
            activeIndex={pickerIndex}
            onHover={setPickerIndex}
            onPick={(d) => fillArg(d.token)}
            target={timeoutTarget}
            compact={compactUi}
          />
        ) : pickerKind === "count" ? (
          <CountPicker
            key="slash-count"
            menuRef={slashMenuRef}
            counts={PURGE_COUNTS}
            activeIndex={pickerIndex}
            onHover={setPickerIndex}
            onPick={(c) => {
              const next = `${message.split(" ")[0]} ${c}`;
              setMessage(next);
              focusInputAt(next.length);
            }}
            compact={compactUi}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {pollSheetOpen ? (
          <PollCreateSheet
            key="poll-create"
            compact={compactUi}
            targetLabel={
              activeChannel?.id
                ? `# ${activeChannel.name || "kanal"} kanalına`
                : activeGroup
                  ? `${activeGroup.name || "Grup"} grubuna`
                  : activeDmUser
                    ? `${activeDmUser.displayName || activeDmUser.display_name || activeDmUser.username} ile sohbete`
                    : ""
            }
            onClose={() => {
              setPollSheetOpen(false);
              focusInputAt(0);
            }}
            onSubmit={async (poll) => {
              onSend?.(withReply({ type: "poll", poll }));
              onClearReply?.();
              return { ok: true };
            }}
          />
        ) : null}
        {banConfirm ? (
          <BanConfirm
            key="ban-confirm"
            targetName={banConfirm.targetName}
            reason={banConfirm.reason}
            onCancel={() => {
              setBanConfirm(null);
              focusInputAt();
            }}
            onConfirm={(reason) => {
              const text = `${banConfirm.first} @${banConfirm.handle}${reason ? ` ${reason}` : ""}`;
              setBanConfirm(null);
              onSend?.(withReply(text));
              setMessage("");
              onClearReply?.();
            }}
          />
        ) : null}
      </AnimatePresence>

      {glass && showAttachmentMenu && (
        <button
          type="button"
          className="g-attach-scrim"
          aria-label={t("Close")}
          onClick={() => setShowAttachmentMenu(false)}
        />
      )}
      <AnimatePresence>
        {showAttachmentMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={glass ? "attachment-menu g-open" : "attachment-menu"}
          >
            <button className="attachment-item" onClick={() => { imageInputRef.current?.click(); setShowAttachmentMenu(false); }}>
              <div className="attachment-icon"><Image size={24} /></div>
              <span className="attachment-label">{t("Upload Image")}</span>
            </button>
            <button className="attachment-item" onClick={() => { fileInputRef.current?.click(); setShowAttachmentMenu(false); }}>
              <div className="attachment-icon"><FileText size={24} /></div>
              <span className="attachment-label">{t("Upload File")}</span>
            </button>
            <button className="attachment-item" onClick={() => { hapticImpactLight(); setShowGiphy(true); setShowAttachmentMenu(false); }}>
              <div className="attachment-icon"><Gift size={24} /></div>
              <span className="attachment-label">{t("Send GIF")}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="emoji-picker"
          >
            <div className="emoji-picker-header">
              <span>{t("Emojis")}</span>
              <button className="emoji-picker-close" onClick={() => setShowEmojiPicker(false)} aria-label={t("Close")}><X size={14} /></button>
            </div>
            <div className="emoji-picker-body">
              {EMOJI_CATEGORIES.map((cat) => (
                <div key={cat.nameKey} className="emoji-category">
                  <span className="emoji-category-name">{t(cat.nameKey)}</span>
                  <div className="emoji-grid">
                    {cat.emojis.map((em) => (
                      <button key={em} className="emoji-btn" onClick={() => insertEmoji(em)}>{em}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" style={{ display: "none" }} onChange={uploadFile} />
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json" style={{ display: "none" }} onChange={uploadFile} />

      <div className="composer-row">
      <div className="composer-left">
        <motion.button
          ref={attachBtnRef}
          className={`composer-action-btn${glass && showAttachmentMenu ? " is-open" : ""}`}
          onClick={() => {
            if (!showAttachmentMenu) hapticImpactLight();
            setShowAttachmentMenu(!showAttachmentMenu);
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title={t("Add Attachment")}
          aria-label={t("Add Attachment")}
        >
          <Plus size={24} />
        </motion.button>
      </div>

      <div className="composer-input-wrapper">
        {uploading ? (
          <div className="recording-bar">
            <Loader2 size={16} className="spin" style={{ animation: "spin 1s linear infinite" }} />
            <span className="recording-label">{t("Uploading file…")}</span>
          </div>
        ) : isRecording ? (
          <div className="recording-bar recording-wave">
            <div className="recording-pulse" />
            <div className="composer-waveform" aria-hidden="true">
              {waveBars.map((v, i) => (
                <span key={i} style={{ height: `${Math.round(8 + v * 22)}px` }} />
              ))}
            </div>
            <span className="recording-label">{formatTime(recordingTime)}</span>
          </div>
        ) : uploadError ? (
          <div className="recording-bar" style={{ color: "var(--danger)" }}>
            <X size={14} />
            <span className="recording-label">{uploadError}</span>
          </div>
        ) : (
          <textarea
            ref={inputRef}
            onPaste={onPaste}
            value={message}
            onChange={(e) => {
              if (e.target.scrollTop) e.target.scrollTop = 0;
              setMessage(e.target.value);
              if (e.target.value) emitTypingStart();
              else emitTypingStop();
            }}
            onScroll={(e) => {
              // iOS scrolls the caret inside a one-line field and hides the text.
              if (e.target.scrollTop) e.target.scrollTop = 0;
            }}
            onFocus={(e) => {
              if (e.target.scrollTop) e.target.scrollTop = 0;
            }}
            onKeyDown={handleKeyDown}
            placeholder={dragOver ? t("Drop file to attach…") : (glass && activeChannel?.name && !activeDmUser && !activeGroup ? t("Message #{name}…", { name: activeChannel.name }) : t("Message…"))}
            className="composer-input"
            rows={1}
            style={{ minHeight: "44px", maxHeight: "120px", resize: "none" }}
          />
        )}
      </div>

      <div className="composer-right">
        <motion.button className="composer-action-btn" onClick={() => {
          if (!showEmojiPicker) hapticImpactLight();
          setShowEmojiPicker(!showEmojiPicker);
        }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title={t("Emoji")} aria-label={t("Emoji")}>
          <Smile size={24} />
        </motion.button>

        {isRecording ? (
          <motion.button className="composer-action-btn recording" onClick={stopRecording} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title={t("Stop Recording")} aria-label={t("Stop Recording")}>
            <StopCircle size={24} color="#f23f43" />
          </motion.button>
        ) : (
          <motion.button className="composer-action-btn" onClick={startRecording} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title={t("Voice Message")} aria-label={t("Voice Message")}>
            <Mic size={24} />
          </motion.button>
        )}

        <motion.button
          className={`composer-send-btn ${canSend ? "active" : ""}${sendFlash ? " is-flashing" : ""}`}
          onClick={handleSend}
          disabled={!canSend || disabled}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={editing ? t("Save") : t("Send Message")}
          aria-label={editing ? t("Save") : t("Send Message")}
        >
          <span className="composer-send-flash" aria-hidden />
          {editing ? <Check size={20} /> : <Send size={20} />}
        </motion.button>
      </div>
      </div>
    </div>
  );
}
