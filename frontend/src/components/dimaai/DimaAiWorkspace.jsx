import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Plus,
  Send,
  Square,
  Trash2,
  ArrowLeft,
  MessageSquare,
  Search,
  Lightbulb,
  PenLine,
  ScanSearch,
  Wand2,
  Pencil,
  ChevronDown,
  Paperclip,
  X,
  Mic,
  MicOff,
  Settings2,
  Star,
  Pin,
  FileText,
} from "lucide-react";
import { useLocale, useT } from "../../context/LocaleContext";
import {
  createDimaConversation,
  deleteDimaConversation,
  getDimaConversation,
  listDimaConversations,
  streamDimaMessage,
  isDimaAbortError,
  stopDimaGeneration,
  uploadDimaAttachment,
  getDimaSettings,
  listDimaModels,
  updateDimaSettings,
  listDimaMemories,
  deleteDimaMemory,
  patchDimaConversation,
  exportDimaConversation,
  confirmDimaAction,
  rejectDimaAction,
} from "../../api/dimaai";
import { formatRelTime, formatBytes, historyBucket } from "./historyUtils";
import { shouldApplyAccountFetch, shouldWipeConversationOnError } from "./accountScope";
import {
  readThreadCache,
  peekThreadCache,
  writeThreadCache,
  dropThreadCache,
  clearThreadCache,
} from "./threadCache";
import { createSmoothRevealer } from "./smoothReveal";
import { isUserAdmin } from "../../lib/userProfile";
import { DimaBubble } from "./DimaChatTurn";
import { DimaHistorySkeleton, DimaThreadSkeleton } from "../ui/Skeleton";
import DimaSettingsPanel from "./DimaSettingsPanel";
import { mergePendingActionLists } from "./pendingActions";
import { isDimaScrollerNearBottom } from "./dimaScroll";
import {
  DEFAULT_MODEL_TIERS,
  MODEL_MENU_IDS,
  MODEL_MENU_META,
  mapLegacyTier,
  readStoredModelTier,
  writeStoredModelTier,
} from "./dimaModelTier";

function dimaUserError(err, t) {
  if (err?.code === "quota") return t("dimaai.capacity") || err.message;
  if (err?.code === "missing_provider") return t("dimaai.modelUnavailable") || err.message;
  const msg = String(err?.message || "");
  if (/could not complete|isteği tamamlayamadı/i.test(msg)) {
    return t("dimaai.requestFailed") || msg;
  }
  return msg || t("dimaai.unavailable");
}

function suggestionItems(locale) {
  const tr = String(locale || "").startsWith("tr");
  return [
    { id: "explain", prompt: tr ? "Şu kavramı basitçe açıkla: " : "Explain this concept in simple terms: ", icon: Lightbulb },
    { id: "write", prompt: tr ? "Şu konuda net bir mesaj yazmama yardım et: " : "Help me write a clear message about: ", icon: PenLine },
    { id: "analyze", prompt: tr ? "Bunu analiz et ve önemli noktaları listele:\n\n" : "Analyze this and list the key takeaways:\n\n", icon: ScanSearch },
    { id: "brainstorm", prompt: tr ? "Şunun için fikir üret: " : "Brainstorm ideas for: ", icon: Wand2 },
  ];
}


function pinMobileViewport() {
  try {
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  } catch {
    /* ignore */
  }
}

function conversationIdFromPath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "dimaai") return null;
  return parts[1] || null;
}

function isTransientDimaMessage(m) {
  if (!m) return false;
  if (m.streaming || m._tmp || m._keep) return true;
  const id = String(m.id || "");
  return id.startsWith("tmp-");
}

function mapConversationMessages(data, prev = []) {
  const localByActionId = new Map();
  for (const msg of prev) {
    for (const action of msg.pendingActions || msg.meta?.pendingActions || []) {
      if (action?.id) localByActionId.set(action.id, action);
    }
  }
  const mapped = (data.messages || [])
    .filter(
      (m) =>
        m.role !== "assistant" ||
        m.stopped ||
        m.meta?.stopped ||
        String(m.content || "").trim() ||
        String(m.thought || m.meta?.thought || "").trim() ||
        (Array.isArray(m.meta?.pendingActions) && m.meta.pendingActions.length) ||
        (Array.isArray(m.pendingActions) && m.pendingActions.length),
    )
    .map((m) => {
      const serverPending = m.pendingActions || m.meta?.pendingActions || [];
      const pendingActions = mergePendingActionLists(
        serverPending,
        serverPending.map((a) => localByActionId.get(a.id)).filter(Boolean),
      );
      return {
        ...m,
        thought: m.thought || m.meta?.thought || "",
        stopped: Boolean(m.stopped || m.meta?.stopped),
        citations: m.meta?.citations,
        attachments: m.meta?.attachments,
        pendingActions,
        meta: { ...(m.meta || {}), pendingActions },
      };
    });

  // Keep optimistic/streaming local bubbles the server has not echoed yet.
  // Prevents empty/broken thread after send when GET races the stream.
  if (!prev?.length) return mapped;
  const serverContents = new Set(
    mapped
      .filter((m) => m.role === "user")
      .map((m) => String(m.content || "").trim())
      .filter(Boolean),
  );
  const extras = prev.filter((m) => {
    if (!isTransientDimaMessage(m)) return false;
    if (m.role === "assistant" && (m.streaming || m.stopped)) return true;
    if (m.role === "user") {
      const body = String(m.content || "").trim();
      return body && !serverContents.has(body);
    }
    return Boolean(String(m.content || "").trim() || String(m.thought || "").trim());
  });
  if (!extras.length) return mapped;
  if (!mapped.length) return [...prev];
  return [...mapped, ...extras.filter((e) => !mapped.some((s) => s.id === e.id))];
}

/** Prefer local thread when a reload would shrink/blank an in-flight send. */
function preferLiveThread(prev, next) {
  if (!prev?.length) return next || [];
  if (!next?.length) return prev;
  const prevLive = prev.some(isTransientDimaMessage);
  if (prevLive && next.length < prev.length) return prev;
  return next;
}

export default function DimaAiWorkspace({ me, isMobile, onClose, isAdmin: isAdminProp }) {
  const isAdmin = Boolean(isAdminProp) || isUserAdmin(me);
  const t = useT();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = conversationIdFromPath(location.pathname);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState(() => {
    const id = conversationIdFromPath(typeof window !== "undefined" ? window.location.pathname : "");
    return peekThreadCache(id)?.messages || [];
  });
  const [threadLoading, setThreadLoading] = useState(() => {
    const id = conversationIdFromPath(typeof window !== "undefined" ? window.location.pathname : "");
    if (!id) return false;
    return !peekThreadCache(id);
  });
  const [title, setTitle] = useState(() => {
    const id = conversationIdFromPath(typeof window !== "undefined" ? window.location.pathname : "");
    return peekThreadCache(id)?.conversation?.title || "";
  });
  const [activeMeta, setActiveMeta] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [softRetryStatus, setSoftRetryStatus] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [mobileShowList, setMobileShowList] = useState(
    () => !!isMobile && !conversationIdFromPath(typeof window !== "undefined" ? window.location.pathname : ""),
  );
  const [pendingFiles, setPendingFiles] = useState([]);
  const [modelTier, setModelTierState] = useState(() => readStoredModelTier() || "dima_1_1_fast");
  const [modelTiers, setModelTiers] = useState(DEFAULT_MODEL_TIERS);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelTierRef = useRef(readStoredModelTier() || "dima_1_1_fast");
  const lastLoadedConvRef = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const threadAbortRef = useRef(null);
  const setModelTier = useCallback((next) => {
    const mapped = mapLegacyTier(typeof next === "function" ? next(modelTierRef.current) : next);
    modelTierRef.current = mapped;
    writeStoredModelTier(mapped);
    setModelTierState(mapped);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    memoryEnabled: true,
    ttsEnabled: false,
    customInstructions: "",
    modelTier: "dima_1_1_fast",
    nsfwEnabled: false,
    agentEnabled: false,
  });
  const [memories, setMemories] = useState([]);
  const [actionBusyId, setActionBusyId] = useState(null);
  const [listening, setListening] = useState(false);
  const abortRef = useRef(null);
  const accountIdRef = useRef(me?.id || null);
  accountIdRef.current = me?.id || null;
  const loadGenRef = useRef(0);
  const loadAbortRef = useRef(null);
  const historyLoadedForRef = useRef(null);
  const historyRef = useRef([]);
  historyRef.current = history;
  const softRetryTimerRef = useRef(null);
  const quotaSoftRetriedRef = useRef(false);
  const activeIdRef = useRef(null);
  const stopLockRef = useRef(false);
  const streamingTmpIdRef = useRef(null);
  const localStoppedRef = useRef(null);
  const suppressReloadUntilRef = useRef(0);
  const stopRef = useRef(() => {});
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const scrollerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recogRef = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const labels = useMemo(
    () => ({
      copy: t("dimaai.copy") || "Copy",
      regenerate: t("dimaai.regenerate") || "Regenerate",
      retry: t("dimaai.retry") || "Retry",
      share: t("dimaai.share") || "Share",
      edit: t("dimaai.edit") || "Edit",
      resend: t("dimaai.resend") || "Resend",
      thinking: t("dimaai.thinking") || (locale?.startsWith("tr") ? "Düşünüyor" : "Thinking"),
      thinkingBusy: t("dimaai.thinkingBusy") || (locale?.startsWith("tr") ? "Düşünüyor…" : "Thinking…"),
      thinkingShow: t("dimaai.thinkingShow") || (locale?.startsWith("tr") ? "Düşünceyi göster" : "Show thinking"),
      stopped: t("dimaai.stopped") || (locale?.startsWith("tr") ? "Durduruldu" : "Stopped"),
      copyCode: t("dimaai.copyCode") || "Copy code",
      downloadCode: t("dimaai.downloadCode") || "Download",
      copied: t("dimaai.copied") || "Copied",
      preview: t("dimaai.preview") || "Preview",
      code: t("dimaai.code") || "Code",
      output: t("dimaai.output") || "Output",
      run: t("dimaai.run") || "Run",
      running: t("dimaai.running") || "Running…",
      expand: t("dimaai.expand") || "Expand",
      shrink: t("dimaai.shrink") || t("common.close") || "Close",
      htmlLive: t("dimaai.htmlLive") || "Live preview",
      htmlLiveHint: t("dimaai.htmlLiveHint") || "Runs in a sandbox inside Descall",
      pythonLive: t("dimaai.pythonLive") || "Python",
      pythonLiveHint: t("dimaai.pythonLiveHint") || "Run this script in Descall",
      pythonWait: t("dimaai.pythonWait") || "Waiting for the script to finish writing…",
      pythonIdle: t("dimaai.pythonIdle") || "Press Run to execute",
      pythonEmpty: t("dimaai.pythonEmpty") || "Finished with no output.",
      pythonFailed: t("dimaai.pythonFailed") || "Could not run this script.",
      cancelEdit: t("common.cancel") || "Cancel",
      sources: t("dimaai.sources") || (locale?.startsWith("tr") ? "Kaynaklar" : "Sources"),
      attach: t("dimaai.attach") || "Attach",
      settings: t("dimaai.settings") || "Settings",
      voice: t("dimaai.voice") || "Voice",
      export: t("dimaai.export") || "Export",
      favorite: t("dimaai.favorite") || "Favorite",
      pin: t("dimaai.pin") || "Pin",
      memories: t("dimaai.memories") || "Memories",
      customInstructions: t("dimaai.customInstructions") || "Custom instructions",
      nsfwOn: t("dimaai.nsfwOn") || "+18 / NSFW",
      nsfwHint: t("dimaai.nsfwHint") || "Admin only. Unrestricted adult chat when on.",
      memoryOn: t("dimaai.memoryOn") || "Memory",
      ttsOn: t("dimaai.ttsOn") || "Read replies aloud",
      agentOn: t("dimaai.agentOn") || "Personal agent",
      agentHint: t("dimaai.agentHint") || "Let Dima act on your Descall account. Messages still need your approval.",
      agentApprove: t("dimaai.agentApprove") || "Approve & send",
      agentCancel: t("dimaai.agentCancel") || "Cancel",
      agentSent: t("dimaai.agentSent") || "Sent",
      agentCancelled: t("dimaai.agentCancelled") || "Cancelled",
      agentExpired: t("dimaai.agentExpired") || "Expired",
      agentFailed: t("dimaai.agentFailed") || "Could not complete that action.",
      agentAction: t("dimaai.agentAction") || "Account action",
      assistant: t("dimaai.assistant") || "Dima",
      agentDoneEdit: t("dimaai.agentDoneEdit") || "Done",
      model: t("dimaai.model") || "Model",
    }),
    [t, locale],
  );

  const beginAccountFetch = useCallback(() => {
    const startedUserId = accountIdRef.current;
    const startedGen = loadGenRef.current;
    const signal = loadAbortRef.current?.signal;
    return {
      startedUserId,
      startedGen,
      signal,
      isCurrent: () =>
        shouldApplyAccountFetch({
          startedUserId,
          currentUserId: accountIdRef.current,
          aborted: Boolean(signal?.aborted),
          startedGen,
          currentGen: loadGenRef.current,
        }),
    };
  }, []);

  const loadHistory = useCallback(async (searchQ) => {
    const fetchCtx = beginAccountFetch();
    try {
      const data = await listDimaConversations(searchQ, { signal: fetchCtx.signal });
      if (!fetchCtx.isCurrent()) return;
      setHistory(data.conversations || []);
      setHistoryError("");
      historyLoadedForRef.current = fetchCtx.startedUserId;
    } catch (err) {
      if (isDimaAbortError(err, fetchCtx.signal) || !fetchCtx.isCurrent()) return;
      // Never keep another account's threads if this account has not loaded yet.
      if (historyLoadedForRef.current !== fetchCtx.startedUserId) {
        setHistory([]);
      }
      setHistoryError(dimaUserError(err, t) || t("dimaai.historyError"));
    } finally {
      if (fetchCtx.isCurrent()) setHistoryLoading(false);
    }
  }, [beginAccountFetch, t]);

  const loadConversation = useCallback(async (id, opts = {}) => {
    const fetchCtx = beginAccountFetch();
    const userId = accountIdRef.current;
    threadAbortRef.current?.abort();
    const threadAc = new AbortController();
    threadAbortRef.current = threadAc;
    if (!id) {
      setThreadLoading(false);
      setMessages([]);
      setTitle("");
      setActiveMeta(null);
      return;
    }
    // After Stop, keep the local Durduruldu bubble for THIS chat — never block opening another one.
    const force = Boolean(opts?.force);
    const holdThisChat =
      !force &&
      lastLoadedConvRef.current === id &&
      (stopLockRef.current ||
        busyRef.current ||
        Date.now() < suppressReloadUntilRef.current);
    if (holdThisChat) {
      setThreadLoading(false);
      return;
    }
    const openingFresh = lastLoadedConvRef.current !== id;
    const cached = readThreadCache(userId, id) || peekThreadCache(id);
    if (cached?.messages?.length) {
      setMessages(cached.messages);
      setTitle(cached.conversation?.title || historyRef.current.find((c) => c.id === id)?.title || "");
      setActiveMeta(cached.conversation || null);
      lastLoadedConvRef.current = id;
      setThreadLoading(false);
    } else if (openingFresh) {
      setThreadLoading(true);
      setMessages([]);
      const listed = historyRef.current.find((c) => c.id === id);
      setTitle(listed?.title || "");
      setActiveMeta(listed || null);
    }
    try {
      const data = await getDimaConversation(id, { signal: threadAc.signal });
      if (!fetchCtx.isCurrent() || activeIdRef.current !== id || threadAc.signal.aborted) return;
      // Merge against live UI + cache so a GET during/after send cannot blank the thread.
      const livePrev =
        activeIdRef.current === id && Array.isArray(messagesRef?.current)
          ? messagesRef.current
          : cached?.messages || [];
      const mapped = mapConversationMessages(data, livePrev);
      const local = localStoppedRef.current;
      let nextMessages =
        local &&
        local.conversationId === id &&
        local.message &&
        !mapped.some((m) => m.stopped || m.id === local.message.id)
          ? [...mapped, local.message]
          : mapped;
      nextMessages = preferLiveThread(livePrev, nextMessages);
      // Never blank a populated thread with an empty server snapshot for the same chat.
      if (!nextMessages.length && livePrev.length) {
        nextMessages = livePrev;
      }
      setMessages(nextMessages);
      const nextTitle =
        data.conversation?.title ||
        cached?.conversation?.title ||
        historyRef.current.find((c) => c.id === id)?.title ||
        "";
      if (nextTitle) setTitle(nextTitle);
      setActiveMeta(data.conversation || cached?.conversation || null);
      writeThreadCache(userId, id, {
        messages: nextMessages,
        conversation: data.conversation || cached?.conversation || null,
      });
      const incomingTier = data.conversation?.model_tier
        ? mapLegacyTier(data.conversation.model_tier)
        : null;
      // Only adopt server tier when opening a different conversation — never after send.
      if (incomingTier && openingFresh) {
        setModelTier(incomingTier);
      }
      lastLoadedConvRef.current = id;
      setError("");
      setEditingId(null);
      setThreadLoading(false);
    } catch (err) {
      if (
        isDimaAbortError(err, threadAc.signal) ||
        isDimaAbortError(err, fetchCtx.signal) ||
        !fetchCtx.isCurrent()
      ) {
        return;
      }
      if (shouldWipeConversationOnError(err)) {
        setMessages([]);
        setTitle("");
        setActiveMeta(null);
        lastLoadedConvRef.current = null;
        localStoppedRef.current = null;
        dropThreadCache(userId, id);
        setError("");
        setThreadLoading(false);
        if (activeIdRef.current === id) {
          navigateRef.current("/dimaai", { replace: true });
        }
        return;
      }
      setThreadLoading(false);
      setError(dimaUserError(err, tRef.current));
    }
  }, [beginAccountFetch]);

  const refreshSettings = useCallback(async () => {
    const fetchCtx = beginAccountFetch();
    try {
      const data = await getDimaSettings({ signal: fetchCtx.signal });
      if (!fetchCtx.isCurrent()) return;
      if (data.settings) {
        setSettings(data.settings);
        // Prefer sticky local pick; only seed blank new-chat from settings if nothing stored.
        if (!activeId && !lastLoadedConvRef.current && !readStoredModelTier()) {
          setModelTier(mapLegacyTier(data.settings.modelTier || modelTierRef.current || "dima_1_1_fast"));
        }
      }
    } catch (err) {
      if (isDimaAbortError(err, fetchCtx.signal)) return;
    }
  }, [activeId, beginAccountFetch]);

  useEffect(() => {
    listDimaModels()
      .then((data) => {
        const tiers = (data?.tiers || []).map((tier) => ({
          ...tier,
          available: tier.available !== false,
        }));
        if (tiers.length) setModelTiers(tiers);
        else setModelTiers(DEFAULT_MODEL_TIERS);
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  const refreshMemories = useCallback(async () => {
    const fetchCtx = beginAccountFetch();
    try {
      const data = await listDimaMemories({ signal: fetchCtx.signal });
      if (!fetchCtx.isCurrent()) return;
      setMemories(data.memories || []);
    } catch (err) {
      if (isDimaAbortError(err, fetchCtx.signal)) return;
    }
  }, [beginAccountFetch]);

  useEffect(() => {
    if (!modelMenuOpen) return undefined;
    const onDoc = (e) => {
      if (!e.target?.closest?.(".dima-model-menu")) setModelMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [modelMenuOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (modelMenuOpen) {
        setModelMenuOpen(false);
        return;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (busyRef.current) {
        stopRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, modelMenuOpen]);

  useEffect(() => {
    document.title = `${t("dimaai.title")} — ${t("dimaai.assistant")}`;
    const meta = document.querySelector('meta[name="description"]');
    const prev = meta?.getAttribute("content");
    if (meta) meta.setAttribute("content", "Dima 1.1 — AI assistant inside Descall.");
    return () => {
      document.title = "Descall";
      if (meta && prev) meta.setAttribute("content", prev);
      try { recogRef.current?.stop?.(); } catch { /* ignore */ }
      loadAbortRef.current?.abort();
      threadAbortRef.current?.abort();
    };
  }, [t]);

  const prevAccountRef = useRef(null);

  useEffect(() => {
    loadGenRef.current += 1;
    historyLoadedForRef.current = null;
    loadAbortRef.current?.abort();
    threadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    abortRef.current = null;

    if (prevAccountRef.current && prevAccountRef.current !== me?.id) {
      clearThreadCache();
    }
    prevAccountRef.current = me?.id || null;

    setHistory([]);
    setHistoryLoading(Boolean(me?.id));
    const cached =
      me?.id && activeIdRef.current ? readThreadCache(me.id, activeIdRef.current) : null;
    if (cached?.messages?.length) {
      setMessages(cached.messages);
      setTitle(cached.conversation?.title || "");
      setActiveMeta(cached.conversation || null);
      setThreadLoading(false);
      lastLoadedConvRef.current = activeIdRef.current;
    } else {
      setMessages([]);
      setThreadLoading(Boolean(activeIdRef.current));
      setTitle("");
      setActiveMeta(null);
      lastLoadedConvRef.current = null;
    }
    setMemories([]);
    setError("");
    setDraft("");
    setPendingFiles([]);
    setQuery("");
    setCopiedId(null);
    setEditingId(null);
    setSettingsOpen(false);
    setSettings({
      memoryEnabled: true,
      ttsEnabled: false,
      customInstructions: "",
      modelTier: "dima_1_1_fast",
      nsfwEnabled: false,
      agentEnabled: false,
    });
    localStoppedRef.current = null;
    stopLockRef.current = false;
    suppressReloadUntilRef.current = 0;
    streamingTmpIdRef.current = null;

    if (me?.id) {
      loadHistory();
      refreshSettings();
    }

    return () => {
      ac.abort();
    };
    // Intentionally only reset when the signed-in account changes — not on locale/t.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (isMobile && activeId) setMobileShowList(false);
  }, [isMobile, activeId]);

  useEffect(() => {
    loadConversation(activeId);
  }, [activeId, loadConversation]);

  useEffect(() => {
    if (!me?.id || !activeId || threadLoading) return;
    if (!messages.length) return;
    writeThreadCache(me.id, activeId, { messages, conversation: activeMeta });
  }, [me?.id, activeId, messages, activeMeta, threadLoading]);

  const pinDimaScroller = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottomRef.current) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    programmaticScrollRef.current = false;
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [activeId]);

  useEffect(() => {
    pinDimaScroller();
  }, [messages, busy, pinDimaScroller]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || !isMobile) return undefined;
    const onBlur = () => {
      window.setTimeout(pinMobileViewport, 40);
      window.setTimeout(pinMobileViewport, 280);
    };
    el.addEventListener("blur", onBlur);
    return () => el.removeEventListener("blur", onBlur);
  }, [isMobile]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 148)}px`;
  }, [draft]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      loadHistory(query.trim());
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, loadHistory]);

  const groupedHistory = useMemo(() => {
    const items = history;
    const buckets = { today: [], yesterday: [], previous: [] };
    for (const c of items) {
      buckets[historyBucket(c.updated_at || c.created_at)].push(c);
    }
    return buckets;
  }, [history]);

  const stop = () => {
    const controller = abortRef.current;
    // Always lock first — even if fetch already aborted (Failed to fetch race).
    stopLockRef.current = true;
    if (softRetryTimerRef.current) {
      window.clearTimeout(softRetryTimerRef.current);
      softRetryTimerRef.current = null;
    }
    setSoftRetryStatus("");
    setError("");
    const tmpId = streamingTmpIdRef.current;
    setMessages((prev) => {
      const next = prev.map((m) => {
        if ((tmpId && m.id === tmpId) || m.streaming || m.stopped) {
          return {
            ...m,
            streaming: false,
            stopped: true,
            // Non-empty placeholder so aggressive filters never drop the bubble.
            content: m.content || "",
            thought: m.thought || "",
            _keep: true,
            meta: {
              ...(m.meta || {}),
              stopped: true,
              thought: m.thought || m.meta?.thought || undefined,
            },
          };
        }
        return m;
      });
      const kept = next.find((m) => m.id === tmpId) || next.find((m) => m.stopped);
      if (kept) {
        localStoppedRef.current = {
          conversationId: activeIdRef.current || activeId,
          message: { ...kept },
        };
      }
      suppressReloadUntilRef.current = Date.now() + 20000;
      return next;
    });
    if (controller && !controller.signal.aborted) controller.abort();
    const convId = activeIdRef.current || activeId;
    if (convId) stopDimaGeneration(convId).catch(() => {});
  };

  stopRef.current = stop;

  const openNew = () => {
    stop();
    localStoppedRef.current = null;
    suppressReloadUntilRef.current = 0;
    stopLockRef.current = false;
    lastLoadedConvRef.current = null;
    setMessages([]);
    setTitle("");
    setActiveMeta(null);
    setThreadLoading(false);
    setDraft("");
    setPendingFiles([]);
    setError("");
    setSoftRetryStatus("");
    setEditingId(null);
    setModelMenuOpen(false);
    // Keep modelTier / localStorage — new chat must not snap back to Fast.
    navigate("/dimaai");
    if (isMobile) setMobileShowList(false);
    inputRef.current?.focus();
  };

  const goHome = () => {
    if (onClose) onClose();
    else navigate("/direct");
  };

  const backToList = () => {
    setMobileShowList(true);
  };

  const speakIfEnabled = (text) => {
    if (!settings.ttsEnabled || typeof window === "undefined") return;
    try {
      window.speechSynthesis?.cancel();
      const u = new SpeechSynthesisUtterance(String(text || "").slice(0, 1200));
      u.lang = locale?.startsWith("tr") ? "tr-TR" : "en-US";
      window.speechSynthesis?.speak(u);
    } catch {
      /* ignore */
    }
  };

  const send = async (text, { regenerate = false, editMessageId = null } = {}) => {
    const content = String(text || draft).trim();
    const filesReady = pendingFiles.filter((f) => f.status === "ready" && f.attachment?.id);
    if (!content && !regenerate && !filesReady.length) return;
    if (busy) return;
    const selectedTier = mapLegacyTier(modelTierRef.current || modelTier);
    modelTierRef.current = selectedTier;
    writeStoredModelTier(selectedTier);
    setError("");
    setSoftRetryStatus("");
    quotaSoftRetriedRef.current = false;
    stickToBottomRef.current = true;
    setBusy(true);
    stopLockRef.current = false;
    localStoppedRef.current = null;
    suppressReloadUntilRef.current = 0;
    let controller = null;

    let conversationId = activeId;
    try {
      if (!conversationId) {
        const created = await createDimaConversation(content || filesReady[0]?.attachment?.name || t("dimaai.newChat"), {
          modelTier: selectedTier,
        });
        conversationId = created.conversation.id;
        setHistory((prev) => [created.conversation, ...prev.filter((c) => c.id !== conversationId)]);
        setTitle(created.conversation.title);
        setActiveMeta(created.conversation);
        lastLoadedConvRef.current = conversationId;
        // Seed cache + suppress reload BEFORE navigate so activeId effect cannot wipe the send UI.
        suppressReloadUntilRef.current = Date.now() + 15000;
        if (accountIdRef.current) {
          writeThreadCache(accountIdRef.current, conversationId, {
            messages: messagesRef.current || [],
            conversation: created.conversation,
          });
        }
        navigate(`/dimaai/${conversationId}`, { replace: true });
        updateDimaSettings({ modelTier: selectedTier }).catch(() => {});
      } else if (conversationId) {
        patchDimaConversation(conversationId, { modelTier: selectedTier }).catch(() => {});
        updateDimaSettings({ modelTier: selectedTier }).catch(() => {});
      }

      const attachmentIds = filesReady.map((f) => f.attachment.id);
      const displayFiles = filesReady.map((f) => f.attachment);

      if (editMessageId) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === editMessageId);
          if (idx < 0) return prev;
          const kept = prev.slice(0, idx);
          return [
            ...kept,
            {
              id: `tmp-user-${Date.now()}`,
              role: "user",
              content: content || "(attachment)",
              created_at: new Date().toISOString(),
              meta: { attachments: displayFiles },
            },
          ];
        });
        setDraft("");
        setEditingId(null);
        setPendingFiles([]);
      } else if (!regenerate) {
        const userMsg = {
          id: `tmp-user-${Date.now()}`,
          role: "user",
          content: content || "(attachment)",
          created_at: new Date().toISOString(),
          meta: { attachments: displayFiles },
        };
        setMessages((prev) => {
          const next = [...prev, userMsg];
          if (accountIdRef.current && conversationId) {
            writeThreadCache(accountIdRef.current, conversationId, {
              messages: next,
              conversation: activeMeta || { id: conversationId },
            });
          }
          return next;
        });
        setDraft("");
        setPendingFiles([]);
      } else {
        setMessages((prev) => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i -= 1) {
            if (copy[i].role === "assistant") {
              copy.splice(i, 1);
              break;
            }
          }
          return copy;
        });
      }

      const isCapacityErr = (err) =>
        err?.code === "quota" ||
        err?.code === "unavailable" ||
        /at capacity|şu an yoğun|temporarily unavailable|kullanılamıyor/i.test(String(err?.message || ""));

      const sleepAbortable = (ms, signal) =>
        new Promise((resolve, reject) => {
          if (signal?.aborted) {
            const e = new Error("aborted");
            e.code = "aborted";
            reject(e);
            return;
          }
          let timer = null;
          const onAbort = () => {
            if (timer) window.clearTimeout(timer);
            softRetryTimerRef.current = null;
            const e = new Error("aborted");
            e.code = "aborted";
            reject(e);
          };
          timer = window.setTimeout(() => {
            softRetryTimerRef.current = null;
            signal?.removeEventListener?.("abort", onAbort);
            resolve();
          }, Math.max(0, Number(ms) || 0));
          softRetryTimerRef.current = timer;
          signal?.addEventListener?.("abort", onAbort, { once: true });
        });

      let streamRegenerate = regenerate;
      let streamEditMessageId = editMessageId;
      let softRetried = false;
      let result;
      let tmpId;
      let contentReveal;
      let thoughtReveal;

      softRetryLoop: while (true) {
        tmpId = `tmp-ai-${Date.now()}`;
        streamingTmpIdRef.current = tmpId;
        setMessages((prev) => [
          ...prev.filter(
            (m) =>
              !(m.streaming && !(m.content || "").trim() && !(m.thought || "").trim()),
          ),
          { id: tmpId, _tmp: tmpId, role: "assistant", content: "", thought: "", streaming: true },
        ]);

        controller = new AbortController();
        abortRef.current = controller;

        contentReveal = createSmoothRevealer({
          minCharsPerTick: 2,
          maxCharsPerTick: 16,
          intervalMs: 16,
          onUpdate: (shown) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tmpId
                  ? {
                      ...m,
                      content: shown,
                      // If user already Stopped, never flip streaming back on.
                      streaming: stopLockRef.current ? false : m.streaming,
                      stopped: stopLockRef.current ? true : m.stopped,
                    }
                  : m,
              ),
            );
          },
        });
        thoughtReveal = createSmoothRevealer({
          minCharsPerTick: 3,
          maxCharsPerTick: 20,
          intervalMs: 14,
          onUpdate: (shown) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tmpId
                  ? {
                      ...m,
                      thought: shown,
                      streaming: stopLockRef.current ? false : m.streaming,
                      stopped: stopLockRef.current ? true : m.stopped,
                    }
                  : m,
              ),
            );
          },
        });

        try {
          result = await streamDimaMessage({
            conversationId,
            content: content || " ",
            regenerate: streamRegenerate,
            editMessageId: streamEditMessageId,
            attachmentIds,
            modelTier: selectedTier,
            signal: controller.signal,
            onToken: (chunk) => contentReveal.push(chunk),
            onThought: (chunk) => thoughtReveal.push(chunk),
            onPendingAction: (action) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tmpId
                    ? {
                        ...m,
                        pendingActions: [
                          ...(m.pendingActions || []).filter((a) => a.id !== action.id),
                          action,
                        ],
                      }
                    : m,
                ),
              );
            },
          });
        } catch (err) {
          // Safety net: treat abort / Failed-to-fetch-on-abort as soft stop.
          // Flush revealers so pending thought/content is not lost.
          if (isDimaAbortError(err, controller.signal)) {
            result = {
              role: "assistant",
              content: contentReveal.flush(),
              thought: thoughtReveal.flush(),
              stopped: true,
            };
          } else if (isCapacityErr(err) && !softRetried && !stopLockRef.current) {
            contentReveal.dispose();
            thoughtReveal.dispose();
            softRetried = true;
            quotaSoftRetriedRef.current = true;
            setError("");
            setSoftRetryStatus(
              t("dimaai.softRetryWaiting") ||
                (locale?.startsWith("tr")
                  ? "Yoğunluk var, birkaç saniye içinde tekrar deniyorum…"
                  : "Busy right now — retrying in a few seconds…"),
            );
            setMessages((prev) =>
              prev.filter(
                (m) =>
                  m.id !== tmpId ||
                  String(m.content || "").trim() ||
                  String(m.thought || "").trim(),
              ),
            );
            const waitMs = Number(err.retryAfterMs) > 0 ? Number(err.retryAfterMs) : 15000;
            try {
              await sleepAbortable(waitMs, controller.signal);
            } catch {
              setSoftRetryStatus("");
              if (stopLockRef.current || controller.signal.aborted) {
                const abortedErr = new Error("aborted");
                abortedErr.code = "aborted";
                throw abortedErr;
              }
              throw err;
            }
            if (stopLockRef.current || controller.signal.aborted) {
              setSoftRetryStatus("");
              const abortedErr = new Error("aborted");
              abortedErr.code = "aborted";
              throw abortedErr;
            }
            setSoftRetryStatus("");
            // Soft retry once as regenerate — user message already persisted.
            streamRegenerate = true;
            streamEditMessageId = null;
            continue softRetryLoop;
          } else {
            contentReveal.dispose();
            thoughtReveal.dispose();
            throw err;
          }
        }

        break softRetryLoop;
      }

      const wasStopped =
        Boolean(result?.stopped) || controller.signal.aborted || stopLockRef.current;

      // If the server only delivered the full text at the end, feed leftovers into the revealer
      // and WAIT for the typewriter — do not flush immediately (that looked like a dump).
      // On Stop: flush immediately so all received tokens stay visible (never wipe).
      const netContent = String(result?.content || "");
      const shownContent = contentReveal.getShown();
      if (netContent.length > shownContent.length) {
        contentReveal.push(netContent.slice(shownContent.length));
      }
      const netThought = String(result?.thought || "");
      const shownThought = thoughtReveal.getShown();
      if (netThought.length > shownThought.length) {
        thoughtReveal.push(netThought.slice(shownThought.length));
      }

      if (wasStopped) {
        contentReveal.flush();
        thoughtReveal.flush();
      } else {
        const deadline = Date.now() + 45000;
        while ((contentReveal.isBusy() || thoughtReveal.isBusy()) && Date.now() < deadline) {
          if (controller.signal.aborted) break;
          await new Promise((r) => setTimeout(r, 24));
        }
        contentReveal.flush();
        thoughtReveal.flush();
      }
      contentReveal.dispose();
      thoughtReveal.dispose();

      const finalContent = String(
        contentReveal.getShown() || result?.content || "",
      ).trim();
      const pendingFromStream = result?.pendingActions || result?.meta?.pendingActions || [];
      if (!finalContent && !wasStopped && !(pendingFromStream || []).length) {
        if (stopLockRef.current) {
          // Empty Stop during Thinking — keep bubble, do not throw into capacity banner.
        } else {
          throw new Error(t("dimaai.unavailable") || t("dimaai.capacity"));
        }
      }
      const finalThought = String(
        thoughtReveal.getShown() || result?.thought || "",
      ).trim();
      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === tmpId
              ? {
                  ...(result || m),
                  id: result?.id || m.id,
                  streaming: false,
                  stopped: Boolean(wasStopped),
                  content: finalContent || m.content || "",
                  thought: finalThought || m.thought || "",
                  citations: result?.citations,
                  pendingActions: pendingFromStream.length
                    ? pendingFromStream
                    : m.pendingActions,
                  meta: {
                    ...(result?.meta || {}),
                    citations: result?.citations,
                    thought: finalThought || undefined,
                    stopped: Boolean(wasStopped) || undefined,
                    pendingActions: pendingFromStream.length
                      ? pendingFromStream
                      : m.pendingActions,
                  },
                }
              : m,
          )
          .filter((m) => {
            if (m.role !== "assistant") return true;
            if (m.stopped || m.streaming) return true;
            if (stopLockRef.current && m.id === tmpId) return true;
            return Boolean(
              String(m.content || "").trim() ||
              String(m.thought || "").trim() ||
              (m.pendingActions || []).length,
            );
          }),
      );
      if (wasStopped) setError("");
      if (finalContent && !wasStopped) speakIfEnabled(finalContent);
      try {
        await loadHistory(query.trim());
      } catch {
        /* history refresh must never become a Failed to fetch banner after Stop */
      }
      // Don't reload conversation immediately — it replaces typed text and kills the stream feel.
      // On Stop: skip reload entirely (server may not yet have thought-only partials); local state wins.
      if (!wasStopped) {
        suppressReloadUntilRef.current = Math.max(
          suppressReloadUntilRef.current,
          Date.now() + 2500,
        );
        window.setTimeout(() => {
          if (conversationId) loadConversation(conversationId, { force: true });
          if (settingsOpen) refreshMemories();
        }, 900);
      } else if (settingsOpen) {
        window.setTimeout(() => refreshMemories(), 200);
      }
    } catch (err) {
      const stopped =
        stopLockRef.current ||
        isDimaAbortError(err, controller?.signal) ||
        isDimaAbortError(err, abortRef.current?.signal);
      if (stopped) {
        setError("");
        const tmpId = streamingTmpIdRef.current;
        setMessages((prev) =>
          prev.map((m) => {
            if ((tmpId && m.id === tmpId) || m.streaming || m.stopped) {
              return {
                ...m,
                streaming: false,
                stopped: true,
                content: m.content || "",
                thought: m.thought || "",
                meta: { ...(m.meta || {}), stopped: true, thought: m.thought || m.meta?.thought },
              };
            }
            return m;
          }),
        );
      } else if (stopLockRef.current) {
        // Capacity / Failed to fetch / auth arrived after Stop — keep Durduruldu, no banner.
        setError("");
        const tmpId = streamingTmpIdRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            (tmpId && m.id === tmpId) || m.streaming || m.stopped
              ? {
                  ...m,
                  streaming: false,
                  stopped: true,
                  content: m.content || "",
                  thought: m.thought || "",
                  meta: { ...(m.meta || {}), stopped: true, thought: m.thought || m.meta?.thought },
                }
              : m,
          ),
        );
      } else {
        setSoftRetryStatus("");
        setError(dimaUserError(err, t));
        setMessages((prev) =>
          prev.filter((m) => {
            if (m.stopped) return true;
            return !(m.streaming && !(m.content || "").trim() && !(m.thought || "").trim());
          }),
        );
      }
    } finally {
      abortRef.current = null;
      // Keep streamingTmpIdRef + stopLockRef until the next send() so late errors cannot wipe Stop.
      setBusy(false);
    }
  };

  const onCopy = async (message) => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      setCopiedId(message.id || message._tmp);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      /* ignore */
    }
  };

  const onShare = async (message) => {
    const text = String(message.content || "").trim();
    const shareData = {
      title: t("dimaai.title") || "DimaAI",
      text: text.slice(0, 4000),
      url: typeof window !== "undefined" ? window.location.href : undefined,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(text);
        setCopiedId(message.id || message._tmp);
        setTimeout(() => setCopiedId(null), 1200);
      }
    } catch {
      /* ignore cancel */
    }
  };

  const onEdit = (message) => {
    if (busy) return;
    setEditingId(message.id);
    setDraft(message.content || "");
    inputRef.current?.focus();
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.streaming);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  const onRetry = () => {
    if (!lastUser || busy) return;
    send(lastUser.content, { regenerate: true });
  };

  const onDelete = async (id, event) => {
    event?.stopPropagation();
    try {
      await deleteDimaConversation(id);
      dropThreadCache(accountIdRef.current, id);
      setHistory((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) openNew();
    } catch (err) {
      setError(dimaUserError(err, t));
    }
  };

  const toggleFavorite = async (id, event) => {
    event?.stopPropagation();
    const item = history.find((c) => c.id === id);
    if (!item) return;
    try {
      const data = await patchDimaConversation(id, { isFavorite: !item.is_favorite });
      setHistory((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.conversation } : c)));
      if (activeId === id) setActiveMeta((m) => ({ ...(m || {}), ...data.conversation }));
    } catch (err) {
      setError(dimaUserError(err, t));
    }
  };

  const togglePin = async (id, event) => {
    event?.stopPropagation();
    const item = history.find((c) => c.id === id) || activeMeta;
    if (!item) return;
    try {
      const data = await patchDimaConversation(id, { isPinned: !item.is_pinned });
      setHistory((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.conversation } : c)));
      if (activeId === id) setActiveMeta((m) => ({ ...(m || {}), ...data.conversation }));
      await loadHistory(query.trim());
    } catch (err) {
      setError(dimaUserError(err, t));
    }
  };

  const onExport = async () => {
    if (!activeId) return;
    try {
      const data = await exportDimaConversation(activeId);
      const blob = new Blob([data.markdown || ""], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(data.title || "dimaai-chat").replace(/[^\w\-]+/g, "_").slice(0, 40)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(dimaUserError(err, t));
    }
  };

  const onShareChat = async () => {
    if (!activeId) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = messages
      .map((m) => `${m.role === "user" ? "You" : "Dima"}: ${m.content}`)
      .join("\n\n")
      .slice(0, 3500);
    try {
      if (navigator.share) await navigator.share({ title: title || t("dimaai.title"), text, url });
      else {
        await navigator.clipboard.writeText(url || text);
        setCopiedId("chat");
        setTimeout(() => setCopiedId(null), 1200);
      }
    } catch {
      /* ignore */
    }
  };

  const onPickFiles = async (fileList) => {
    const files = [...(fileList || [])].slice(0, 4);
    for (const file of files) {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      setPendingFiles((prev) => [
        ...prev,
        {
          localId,
          name: file.name,
          size: file.size,
          mime: file.type,
          kind: file.type.startsWith("image/") ? "image" : "document",
          previewUrl,
          progress: 0,
          status: "uploading",
        },
      ]);
      try {
        const data = await uploadDimaAttachment(file, {
          conversationId: activeId,
          onProgress: (p) => {
            setPendingFiles((prev) =>
              prev.map((f) => (f.localId === localId ? { ...f, progress: p } : f)),
            );
          },
        });
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.localId === localId
              ? {
                  ...f,
                  progress: 100,
                  status: "ready",
                  attachment: data.attachment,
                  previewText: data.previewText,
                  previewUrl: data.attachment?.previewUrl || previewUrl,
                }
              : f,
          ),
        );
      } catch (err) {
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.localId === localId ? { ...f, status: "error", error: err.message } : f,
          ),
        );
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePending = (localId) => {
    setPendingFiles((prev) => {
      const hit = prev.find((f) => f.localId === localId);
      if (hit?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((f) => f.localId !== localId);
    });
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError(locale?.startsWith("tr") ? "Bu tarayıcı ses tanımayı desteklemiyor." : "Speech recognition is not supported in this browser.");
      return;
    }
    if (listening) {
      try { recogRef.current?.stop?.(); } catch { /* ignore */ }
      setListening(false);
      return;
    }
    const recog = new SR();
    recog.lang = locale?.startsWith("tr") ? "tr-TR" : "en-US";
    recog.interimResults = true;
    recog.continuous = false;
    recog.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      setDraft((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}${text}`.trimStart());
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    setListening(true);
    recog.start();
  };

  const patchPendingAction = useCallback((actionId, next) => {
    setMessages((prev) =>
      prev.map((m) => {
        const list = m.pendingActions || m.meta?.pendingActions;
        if (!Array.isArray(list) || !list.some((a) => a.id === actionId)) return m;
        const pendingActions = list.map((a) => (a.id === actionId ? { ...a, ...next } : a));
        return {
          ...m,
          pendingActions,
          meta: { ...(m.meta || {}), pendingActions },
        };
      }),
    );
  }, []);

  const onConfirmAction = useCallback(async (action, editedText) => {
    if (!action?.id) return;
    setActionBusyId(action.id);
    try {
      const data = await confirmDimaAction(action.id, {
        text: editedText !== undefined ? editedText : undefined,
      });
      patchPendingAction(action.id, {
        ...(data.action || {}),
        status: data.action?.status || "confirmed",
        preview: {
          ...(action.preview || {}),
          ...(data.action?.preview || {}),
          ...(editedText !== undefined ? { body: editedText } : {}),
        },
      });
    } catch (err) {
      if (err?.action?.status && err.action.status !== "pending") {
        patchPendingAction(action.id, err.action);
        return;
      }
      throw err;
    } finally {
      setActionBusyId(null);
    }
  }, [patchPendingAction]);

  const onRejectAction = useCallback(async (action) => {
    if (!action?.id) return;
    setActionBusyId(action.id);
    try {
      const data = await rejectDimaAction(action.id);
      patchPendingAction(action.id, {
        ...(data.action || {}),
        status: data.action?.status || "rejected",
      });
    } finally {
      setActionBusyId(null);
    }
  }, [patchPendingAction]);

  const saveSettings = async (patch) => {
    try {
      const data = await updateDimaSettings(patch);
      setSettings(data.settings);
      if (patch.modelTier) setModelTier(patch.modelTier);
    } catch (err) {
      setError(dimaUserError(err, t));
    }
  };

  const openSettings = async () => {
    setSettingsOpen(true);
    await refreshSettings();
    await refreshMemories();
  };

  const empty = !threadLoading && messages.length === 0 && !busy;
  const showChatPane = !isMobile || !mobileShowList;
  const canSend =
    (Boolean(draft.trim()) || pendingFiles.some((f) => f.status === "ready")) &&
    !busy &&
    !pendingFiles.some((f) => f.status === "uploading");
  const historySections = [
    ["today", groupedHistory.today],
    ["yesterday", groupedHistory.yesterday],
    ["previous", groupedHistory.previous],
  ];
  const historyEmpty = history.length === 0;
  const searchEmpty = !historyEmpty && historySections.every(([, items]) => items.length === 0);

  const openHistoryChat = (c) => {
    if (c.id !== activeId) {
      const cached = readThreadCache(accountIdRef.current, c.id) || peekThreadCache(c.id);
      if (cached?.messages?.length) {
        setMessages(cached.messages);
        setTitle(c.title || cached.conversation?.title || "");
        setActiveMeta(cached.conversation || c);
        lastLoadedConvRef.current = c.id;
        setThreadLoading(false);
      } else {
        setThreadLoading(true);
        setMessages([]);
        setTitle(c.title || "");
      }
    }
    navigate(`/dimaai/${c.id}`);
    if (isMobile) setMobileShowList(false);
  };

  const renderHistoryItem = (c) => (
    <div
      key={c.id}
      role="button"
      tabIndex={0}
      className={`dima-history-item ${activeId === c.id ? "active" : ""}${c.is_pinned ? " is-pinned" : ""}${c.is_favorite ? " is-fav" : ""}`}
      onClick={() => openHistoryChat(c)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openHistoryChat(c);
        }
      }}
    >
      <span className="dima-history-orb" aria-hidden="true">
        <MessageSquare size={14} />
      </span>
      <span className="dima-history-copy">
        <span className="dima-history-name">
          {c.is_pinned ? <Pin size={11} /> : null}
          {c.is_favorite ? <Star size={11} /> : null}
          {c.title || t("dimaai.newChat")}
        </span>
        <span className="dima-history-time">
          {formatRelTime(c.updated_at || c.created_at, locale)}
        </span>
      </span>
      <span className="dima-history-actions">
        <button
          type="button"
          className="dima-history-del"
          onClick={(e) => toggleFavorite(c.id, e)}
          aria-label={labels.favorite}
          title={labels.favorite}
        >
          <Star size={13} fill={c.is_favorite ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          className="dima-history-del"
          onClick={(e) => onDelete(c.id, e)}
          aria-label={t("common.delete")}
        >
          <Trash2 size={14} />
        </button>
      </span>
    </div>
  );

  const submitComposer = () => {
    if (editingId) {
      send(draft, { editMessageId: editingId });
    } else {
      send(draft);
    }
  };

  return (
    <section
      className={`dima-workspace${showChatPane && isMobile ? " is-chat" : ""}`}
      data-dimaai="1"
    >
      <aside className="dima-history">
        <div className="dima-history-head">
          <div className="dima-history-title">
            {onClose && (
              <button
                type="button"
                className="dima-back-btn"
                onClick={goHome}
                title={t("Back to Descall")}
                aria-label={t("Back to Descall")}
              >
                <ArrowLeft size={18} />
                <span className="dima-back-label">{t("nav.chats")}</span>
              </button>
            )}
            <div className="dima-history-brand">
              <span className="dima-kicker">{t("dimaai.title")}</span>
              <strong>{t("dimaai.history")}</strong>
            </div>
          </div>
        </div>

        <button type="button" className="dima-history-new" onClick={openNew}>
          <Plus size={16} />
          {t("dimaai.newChat")}
        </button>

        <label className="dima-history-search">
          <Search size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dimaai.search")}
            aria-label={t("dimaai.search")}
          />
        </label>

        <div className="dima-history-list">
          {historyLoading ? (
            <DimaHistorySkeleton count={8} label={t("Loading conversations")} />
          ) : (
            <>
          {historyEmpty && !historyError && (
            <div className="dima-history-empty">
              <Sparkles size={18} />
              <p>{t("dimaai.noHistory")}</p>
            </div>
          )}
          {historyError && (
            <div className="dima-history-empty">
              <p>{historyError}</p>
              <button type="button" className="dima-history-new" onClick={() => loadHistory(query.trim())}>
                {t("common.retry") || t("Retry")}
              </button>
            </div>
          )}
          {searchEmpty && <p className="dima-muted">{t("dimaai.noSearch")}</p>}
          {historySections.map(([key, items]) =>
            items.length ? (
              <div key={key} className="dima-history-group">
                <h3>{t(`dimaai.group.${key}`)}</h3>
                {items.map(renderHistoryItem)}
              </div>
            ) : null,
          )}
            </>
          )}
        </div>
      </aside>

      <div className="dima-main">
        <header className="dima-topbar">
          {isMobile && (
            <button
              type="button"
              className="dima-back-btn"
              onClick={backToList}
              aria-label={t("common.back")}
            >
              <ArrowLeft size={18} />
              <span className="dima-back-label">{t("dimaai.history")}</span>
            </button>
          )}
          <div className="dima-topbar-text">
            <h1>{title || t("dimaai.title")}</h1>
          </div>
          <div className="dima-topbar-actions">
            <button type="button" className="dima-new-btn" onClick={openNew}>
              <Plus size={14} /> <span>{t("dimaai.newChat")}</span>
            </button>
            <button type="button" className="dima-icon-btn" onClick={openSettings} title={labels.settings} aria-label={labels.settings}>
              <Settings2 size={15} />
            </button>
          </div>
        </header>

        <div
          className="dima-scroll"
          ref={scrollerRef}
          onScroll={(e) => {
            if (programmaticScrollRef.current) return;
            stickToBottomRef.current = isDimaScrollerNearBottom(e.currentTarget);
          }}
        >
          {threadLoading ? (
            <DimaThreadSkeleton count={5} />
          ) : empty ? (
            <div className="dima-welcome is-compact">
              <div className="dima-welcome-orb" aria-hidden="true">
                <Sparkles size={28} />
              </div>
              <h2>{t("dimaai.taglineShort") || "How can I help?"}</h2>
              <p className="dima-welcome-lede">
                {t("dimaai.tagline") || t("Your AI assistant inside Descall.")}
              </p>
              <div className="dima-suggestions">
                {suggestionItems(locale).map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="dima-chip"
                      onClick={() => {
                        setDraft(s.prompt);
                        inputRef.current?.focus();
                      }}
                    >
                      <span className="dima-chip-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span>{t(`dimaai.suggest.${s.id}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="dima-thread">
              {messages
                .filter(
                  (m) =>
                    m.streaming ||
                    m.stopped ||
                    m._keep ||
                    String(m.content || "").trim() ||
                    String(m.thought || "").trim() ||
                    (m.pendingActions || m.meta?.pendingActions || []).length,
                )
                .map((m) => (
                <DimaBubble
                  key={m.id}
                  message={m}
                  copiedId={copiedId}
                  youLabel={t("common.you")}
                  labels={labels}
                  locale={locale}
                  onCopy={onCopy}
                  onShare={onShare}
                  onEdit={onEdit}
                  canEdit={!busy && m.role === "user"}
                  canRegenerate={!busy && lastAssistant?.id === m.id && !m.error}
                  canRetry={!busy && lastAssistant?.id === m.id && Boolean(m.error)}
                  onRegenerate={() => send(lastUser?.content || m.content, { regenerate: true })}
                  onRetry={onRetry}
                  onConfirmAction={onConfirmAction}
                  onRejectAction={onRejectAction}
                  actionBusyId={actionBusyId}
                />
              ))}
            </div>
          )}
        </div>

        {softRetryStatus && !error && (
          <div className="dima-soft-status" role="status">
            <span>{softRetryStatus}</span>
          </div>
        )}

        {error && (
          <div className="dima-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="dima-error-retry"
              onClick={() => {
                setError("");
                setSoftRetryStatus("");
                if (lastUser) send(lastUser.content, { regenerate: true });
              }}
            >
              {labels.retry}
            </button>
          </div>
        )}

        <div className="dima-dock">
          {editingId && (
            <div className="dima-edit-banner">
              <Pencil size={14} />
              <span>{labels.edit}</span>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft("");
                }}
              >
                {labels.cancelEdit}
              </button>
            </div>
          )}

          {pendingFiles.length > 0 && (
            <div className="dima-pending-files">
              {pendingFiles.map((f) => (
                <div key={f.localId} className={`dima-file-chip${f.status === "error" ? " is-error" : ""}`}>
                  {f.previewUrl ? (
                    <img src={f.previewUrl} alt="" className="dima-file-thumb" />
                  ) : (
                    <FileText size={14} />
                  )}
                  <span className="dima-file-meta">
                    <strong>{f.name}</strong>
                    <em>
                      {f.status === "uploading"
                        ? `${f.progress || 0}%`
                        : f.status === "error"
                          ? f.error || t("common.error")
                          : formatBytes(f.size)}
                    </em>
                  </span>
                  <button type="button" className="dima-file-remove" onClick={() => removePending(f.localId)} aria-label={t("common.close")}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="dima-composer"
            onSubmit={(e) => {
              e.preventDefault();
              submitComposer();
            }}
          >
            <div className="dima-composer-tools">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.docx,.csv,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                hidden
                onChange={(e) => onPickFiles(e.target.files)}
              />
              <button
                type="button"
                className="dima-tool-btn"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                title={labels.attach}
                aria-label={labels.attach}
              >
                <Paperclip size={16} />
              </button>
              <button
                type="button"
                className={`dima-tool-btn${listening ? " is-active" : ""}`}
                onClick={toggleMic}
                disabled={busy}
                title={labels.voice}
                aria-label={labels.voice}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <div className="dima-model-menu" title={labels.model}>
                <button
                  type="button"
                  className={`dima-model-pill${modelMenuOpen ? " is-open" : ""}`}
                  disabled={busy}
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  onClick={() => setModelMenuOpen((v) => !v)}
                >
                  <span className="dima-model-pill-label">
                    {(MODEL_MENU_META[modelTier]?.shortLabel) || "1.1 Fast"}
                  </span>
                  <ChevronDown size={14} />
                </button>
                {modelMenuOpen && (
                  <div className="dima-model-dropdown" role="listbox">
                    {MODEL_MENU_IDS.map((id) => {
                      const meta = MODEL_MENU_META[id];
                      const tier = modelTiers.find((t) => t.id === id) || DEFAULT_MODEL_TIERS.find((t) => t.id === id);
                      const unavailable = tier?.available === false;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="option"
                          aria-selected={modelTier === id}
                          className={`dima-model-option${modelTier === id ? " is-active" : ""}${unavailable ? " is-disabled" : ""}`}
                          disabled={unavailable || busy}
                          onClick={() => {
                            if (unavailable) return;
                            setModelTier(id);
                            updateDimaSettings({ modelTier: id }).catch(() => {});
                            if (activeId) patchDimaConversation(activeId, { modelTier: id }).catch(() => {});
                            setModelMenuOpen(false);
                          }}
                        >
                          <strong>{meta?.shortLabel || id}</strong>
                          <span>{tier?.description || meta?.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <textarea
              ref={inputRef}
              className="dima-input"
              rows={1}
              value={draft}
              placeholder={t("dimaai.placeholder")}
              disabled={busy}
              enterKeyHint="send"
              onFocus={() => {
                if (!isMobile) return;
                pinMobileViewport();
                requestAnimationFrame(() => {
                  pinMobileViewport();
                  pinDimaScroller();
                });
              }}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitComposer();
                }
              }}
            />
            <div className="dima-composer-bar">
              <span className="dima-composer-hint">{t("dimaai.composerHint")}</span>
              {busy ? (
                <button
                  type="button"
                  className="dima-send is-stop"
                  onClick={stop}
                  aria-label={t("dimaai.stop")}
                  title={t("dimaai.stop")}
                >
                  <Square size={15} />
                  <span className="dima-stop-label">{t("dimaai.stop")}</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className={`dima-send${canSend ? " is-ready" : ""}`}
                  disabled={!canSend}
                  aria-label={editingId ? labels.resend : t("common.send")}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </form>
          <p className="dima-foot">{t("dimaai.disclaimer")}</p>
        </div>
      </div>

      {settingsOpen && (
        <DimaSettingsPanel
          me={me}
          settings={settings}
          memories={memories}
          isAdmin={isAdmin}
          onClose={() => setSettingsOpen(false)}
          onPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          onSave={saveSettings}
          onRefreshMemories={refreshMemories}
          onDeleteMemory={async (id) => {
            await deleteDimaMemory(id);
            setMemories((prev) => prev.filter((x) => x.id !== id));
          }}
        />
      )}
    </section>
  );
}
