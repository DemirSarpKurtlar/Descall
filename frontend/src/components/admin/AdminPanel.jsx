import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { 
  Shield, Users, MessageSquare, Activity, AlertCircle, Settings, 
  FileText, BarChart3, Bell, Search, Filter, Download, RefreshCw,
  Ban, Trash2, Eye, EyeOff, Lock, Unlock, Wifi, WifiOff, Zap,
  Database, Server, Clock, Calendar, MapPin, Smartphone,
  Mail, Send, Image, Paperclip, X, CheckCircle, AlertTriangle,
  Info, MoreHorizontal, ChevronDown, ChevronUp, Terminal, Cpu,
  HardDrive, Network, TrendingUp, TrendingDown, UserCheck,
  UserX, MessageCircle, Volume2, VolumeX, Flag, FlagOff,
  History, RotateCcw, Save, Edit3, Layers, Grid, List, PieChart,
  Activity as ActivityIcon, Box, Code, GitBranch, Layers2, Monitor,
  MousePointer, Play, Pause, Square, Maximize2, Minimize2, Copy,
  ExternalLink, FileDown, Printer, Share2, Star, ThumbsUp,
  ThumbsDown, Upload, Video, Voicemail, ZoomIn, ZoomOut, Megaphone,
  Coins, DollarSign, Wallet, Plus, Minus, ShoppingBag, Sparkles, BellRing, FolderSearch, LayoutDashboard
} from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { API_BASE_URL } from "../../config/api";
import RippleButton from "../ui/RippleButton";
import AdminFeedback from "./AdminFeedback";
import AdminShop from "./AdminShop";
import AdminDimaai from "./AdminDimaai";
import AdminVoiceRecordings from "./AdminVoiceRecordings";
import AdminModeration from "./AdminModeration";
import AdminLivePopup from "./AdminLivePopup";
import AdminAnalytics from "./AdminAnalytics";
import AdminPeople from "./AdminPeople";
import AdminReports from "./AdminReports";
import AdminOverview from "./AdminOverview";
import { useLocale } from "../../context/LocaleContext";
import {
  parseAppDate,
  formatAppDateTime,
  istanbulDayKey,
  istanbulHour,
} from "../../lib/datetime";

function presenceStatusLabel(status, t) {
  const s = String(status || "online");
  if (s === "idle") return t("Idle");
  if (s === "dnd") return t("Do Not Disturb");
  if (s === "invisible") return t("Invisible");
  if (s === "offline") return t("Offline");
  return t("Online Now");
}

const TABS = [
  { id: "overview", label: "admin.overview", icon: LayoutDashboard },
  { id: "analytics", label: "admin.analytics", icon: Activity },
  { id: "people", label: "admin.people", icon: FolderSearch },
  { id: "reports", label: "admin.reports", icon: Flag },
  { id: "feedback", label: "admin.feedback", icon: Bell },
  { id: "shop", label: "admin.shop", icon: ShoppingBag },
  { id: "dimaai", label: "admin.dimaai.title", icon: Sparkles },
  { id: "voice", label: "Voice recordings", icon: Voicemail },
  { id: "announcements", label: "admin.announcements", icon: Megaphone },
  { id: "livepopup", label: "admin.livePopup", icon: BellRing },
  { id: "casino", label: "admin.casino", icon: Coins },
  { id: "moderation", label: "admin.moderation", icon: Shield },
  { id: "system", label: "admin.system", icon: Settings },
  { id: "security", label: "admin.security", icon: Lock },
  { id: "maintenance", label: "admin.maintenance", icon: Server },
  { id: "audit", label: "admin.audit", icon: FileText },
];

export default function AdminPanel({ socket, onClose, onAdminChanged }) {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState("overview");
  const [dossierUserId, setDossierUserId] = useState(null);
  const [openReportCount, setOpenReportCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [userQ, setUserQ] = useState("");
  const [userDetails, setUserDetails] = useState(null);
  const [userSessions, setUserSessions] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [messages, setMessages] = useState([]);
  const [msgQ, setMsgQ] = useState("");
  const [audit, setAudit] = useState([]);
  const [system, setSystem] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  
  // Enhanced Error Log States
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorQ, setErrorQ] = useState("");
  const [errorSourceFilter, setErrorSourceFilter] = useState("all");
  const [errorUserFilter, setErrorUserFilter] = useState("all");
  const [errorSeverityFilter, setErrorSeverityFilter] = useState("all");
  const [errorTimeRange, setErrorTimeRange] = useState("24h");
  const [errorSources, setErrorSources] = useState([]);
  const [errorUsers, setErrorUsers] = useState([]);
  const [expandedError, setExpandedError] = useState(null);
  const [realtimeErrors, setRealtimeErrors] = useState(true);
  const [errorStats, setErrorStats] = useState(null);
  const [selectedErrors, setSelectedErrors] = useState(new Set());
  const [autoRefreshErrors, setAutoRefreshErrors] = useState(true);
  const errorLogEndRef = useRef(null);
  
  // User Feedback States
  const [feedbacks, setFeedbacks] = useState([]);
  const [feedbackFilter, setFeedbackFilter] = useState("all");
  const [feedbackStatus, setFeedbackStatus] = useState("all");
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [feedbackReply, setFeedbackReply] = useState("");
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);
  const [feedbackCategories, setFeedbackCategories] = useState([]);
  const [feedbackPriority, setFeedbackPriority] = useState("all");

  // Announcements States
  const [announcements, setAnnouncements] = useState([]);
  const [announcementDraft, setAnnouncementDraft] = useState({
    title: "", content: "", priority: "normal", color: "#5865F2",
    pinned: false, target: "all", emoji: "📢",
  });
  const [showComposePanel, setShowComposePanel] = useState(false);
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [announcementError, setAnnouncementError] = useState("");

  // Success/Error Messages
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  
  // Moderation States
  const [bannedWords, setBannedWords] = useState([]);
  const [spamPatterns, setSpamPatterns] = useState([]);
  const [moderationQueue, setModerationQueue] = useState([]);
  const [autoModSettings, setAutoModSettings] = useState(null);
  const [reportedContent, setReportedContent] = useState([]);
  const [shadowBannedUsers, setShadowBannedUsers] = useState([]);
  const [slowModeSettings, setSlowModeSettings] = useState(null);
  const [ipBlacklist, setIpBlacklist] = useState([]);
  
  // Analytics States
  const [trafficData, setTrafficData] = useState([]);
  const [userGrowth, setUserGrowth] = useState([]);
  const [messageStats, setMessageStats] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [deviceStats, setDeviceStats] = useState([]);
  const [geographicData, setGeographicData] = useState([]);
  const [retentionData, setRetentionData] = useState([]);
  const [performanceMetrics, setPerformanceMetrics] = useState([]);
  
  // Security States
  const [failedLogins, setFailedLogins] = useState([]);
  const [suspiciousActivities, setSuspiciousActivities] = useState([]);
  const [activeThreats, setActiveThreats] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [twoFactorStats, setTwoFactorStats] = useState(null);
  const [tokenBlacklist, setTokenBlacklist] = useState([]);
  
  // Maintenance States
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [chatFrozen, setChatFrozen] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [cacheStats, setCacheStats] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  
  // Casino/Credits States
  const [userCredits, setUserCredits] = useState([]);
  const [creditSearch, setCreditSearch] = useState("");
  const [selectedCreditUser, setSelectedCreditUser] = useState(null);
  const [creditAmount, setCreditAmount] = useState(1000);
  const [creditReason, setCreditReason] = useState("");
  const [creditOperation, setCreditOperation] = useState("add"); // 'add' or 'remove'
  const [creditHistory, setCreditHistory] = useState([]);
  const [creditStats, setCreditStats] = useState(null);
  const [gameHistory, setGameHistory] = useState([]);
  
  // UI States
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const [dateRange, setDateRange] = useState("7d");
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [sortBy, setSortBy] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [exportFormat, setExportFormat] = useState("json");
  const [modalContent, setModalContent] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(null);
  const [bulkAction, setBulkAction] = useState(null);
  
  // Real-time updates
  const [liveUsers, setLiveUsers] = useState([]);
  const [liveMessages, setLiveMessages] = useState([]);
  const [systemAlerts, setSystemAlerts] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  
  // Activity States - Last 24h tracking
  const [recentRegistrations, setRecentRegistrations] = useState([]);
  const [recentOnlineUsers, setRecentOnlineUsers] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLastUpdated, setActivityLastUpdated] = useState(null);
  const [activitySubTab, setActivitySubTab] = useState("registrations"); // "registrations" | "online"

  // Member pulse — recently active + newly joined (durable last_seen)
  const [newlyJoinedMembers, setNewlyJoinedMembers] = useState([]);
  const [recentlyActiveMembers, setRecentlyActiveMembers] = useState([]);
  const [memberPulseLoading, setMemberPulseLoading] = useState(false);
  const [memberPulseUpdated, setMemberPulseUpdated] = useState(null);
  const [memberPulseOnlineCount, setMemberPulseOnlineCount] = useState(0);
  const [memberPulseVisibleCount, setMemberPulseVisibleCount] = useState(0);
  const [memberPulseInvisibleCount, setMemberPulseInvisibleCount] = useState(0);
  const [memberPulseStatusCounts, setMemberPulseStatusCounts] = useState(null);
  
  // Engagement States - User interaction stats
  const [engagementStats, setEngagementStats] = useState(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementLastUpdated, setEngagementLastUpdated] = useState(null);
  const [engagementSubTab, setEngagementSubTab] = useState("overview"); // "overview" | "messages" | "calls"
  
  // Growth States - User growth analytics
  const [growthData, setGrowthData] = useState([]);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthLastUpdated, setGrowthLastUpdated] = useState(null);
  const [growthPeriod, setGrowthPeriod] = useState("7d"); // "24h" | "7d" | "30d"
  const [attributionStats, setAttributionStats] = useState(null);

  const loadStats = useCallback(async () => {
    const d = await adminFetch("/stats");
    setStats(d);
  }, []);

  const loadReportSummary = useCallback(async () => {
    try {
      const d = await adminFetch("/reports/summary");
      setOpenReportCount(d.openCount || 0);
      return d;
    } catch {
      return null;
    }
  }, []);

  const loadUsers = useCallback(async () => {
    const q = userQ ? `?q=${encodeURIComponent(userQ)}` : "";
    const d = await adminFetch(`/users${q}`);
    setUsers(d.users || []);
  }, [userQ]);

  const loadAllUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem("descall_token");
      console.log("[ADMIN] Loading users, token:", !!token);
      console.log("[ADMIN] API_BASE_URL:", API_BASE_URL);
      
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      
      console.log("[ADMIN] Users response:", d);
      const list = (d.users || []).map((u) => ({
        ...u,
        is_admin: Boolean(u.is_admin) || u.role === "admin" || u.username === "admin",
      }));
      setUsers(list);
    } catch (e) {
      console.error("[ADMIN] Failed to load users:", e);
      setErr(e.message);
    }
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const token = localStorage.getItem("descall_token");
      const res = await fetch(`${API_BASE_URL}/api/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setAnnouncements(d.announcements || []);
    } catch (e) {
      console.error("[ADMIN] Failed to load announcements:", e);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    const q = msgQ ? `?q=${encodeURIComponent(msgQ)}` : "";
    const d = await adminFetch(`/messages${q}`);
    setMessages(d.messages || []);
  }, [msgQ]);

  const loadAudit = useCallback(async () => {
    const d = await adminFetch("/audit?limit=300");
    setAudit(d.entries || []);
  }, []);

  const loadSystem = useCallback(async () => {
    const d = await adminFetch("/system");
    setSystem(d);
  }, []);

  const loadErrors = useCallback(async () => {
    const d = await adminFetch("/errors");
    const logs = Array.isArray(d) ? d : Array.isArray(d?.errors) ? d.errors : [];
    setErrorLogs(logs);
    setErrorSources(d?.sources || []);
    setErrorUsers(d?.usersWithErrors || []);
  }, []);

  const loadMemberPulse = useCallback(async () => {
    setMemberPulseLoading(true);
    try {
      const d = await adminFetch("/member-pulse?limit=40");
      const joined = Array.isArray(d?.newlyJoined) ? d.newlyJoined : [];
      const active = Array.isArray(d?.recentlyActive) ? d.recentlyActive : [];
      setNewlyJoinedMembers(joined);
      setRecentlyActiveMembers(active);
      setMemberPulseOnlineCount(Number(d?.connectedCount ?? d?.onlineCount) || 0);
      setMemberPulseVisibleCount(Number(d?.visibleCount) || 0);
      setMemberPulseInvisibleCount(Number(d?.invisibleCount) || 0);
      setMemberPulseStatusCounts(d?.statusCounts || null);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              onlineUsers: Number(d?.connectedCount ?? d?.onlineCount) || prev.onlineUsers,
              connectedCount: Number(d?.connectedCount ?? d?.onlineCount) || prev.connectedCount,
              visibleCount: Number(d?.visibleCount) || prev.visibleCount,
              invisibleCount: Number(d?.invisibleCount) || prev.invisibleCount,
              statusCounts: d?.statusCounts || prev.statusCounts,
            }
          : prev,
      );
      setMemberPulseUpdated(new Date());

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      setRecentRegistrations(
        joined.filter((u) => {
          const createdMs = parseAppDate(u.created_at)?.getTime();
          return Number.isFinite(createdMs) && now - createdMs <= dayMs;
        })
      );
      setRecentOnlineUsers(
        active.filter((u) => {
          if (u.isOnline) return true;
          const seenMs = parseAppDate(u.last_seen)?.getTime();
          return Number.isFinite(seenMs) && now - seenMs <= dayMs;
        })
      );
      setActivityLastUpdated(new Date());
    } catch (e) {
      console.error("[ADMIN] Failed to load member pulse:", e);
      throw e;
    } finally {
      setMemberPulseLoading(false);
    }
  }, []);

  // Load activity data - recent registrations and online users (last 24h)
  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      await loadMemberPulse();
    } catch (e) {
      console.error("[ADMIN] Failed to load activity:", e);
    } finally {
      setActivityLoading(false);
    }
  }, [loadMemberPulse]);

  // Load engagement stats - user interactions
  const loadEngagement = useCallback(async () => {
    setEngagementLoading(true);
    try {
      // Fetch messages for stats
      const messagesRes = await adminFetch("/messages");
      const allMessages = messagesRes.messages || [];
      
      // Fetch users for activity data
      const usersRes = await adminFetch("/users?limit=500");
      const allUsers = usersRes.users || [];
      
      // Calculate engagement stats
      const totalMessages = allMessages.length;
      const messagesLast24h = allMessages.filter(m => {
        const msgDate = parseAppDate(m.timestamp);
        return msgDate && msgDate >= new Date(Date.now() - 24 * 60 * 60 * 1000);
      }).length;
      
      const messagesLast7d = allMessages.filter(m => {
        const msgDate = parseAppDate(m.timestamp);
        return msgDate && msgDate >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }).length;
      
      // Active users (sent at least one message)
      const activeUserIds = new Set(allMessages.map(m => m.user_id || m.from));
      const activeUsers = activeUserIds.size;
      
      // Most active hours
      const hourCounts = {};
      allMessages.forEach(m => {
        const hour = istanbulHour(m.timestamp);
        if (hour == null) return;
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      const peakHours = Object.entries(hourCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([hour, count]) => ({ hour: parseInt(hour), count }));
      
      setEngagementStats({
        totalMessages,
        messagesLast24h,
        messagesLast7d,
        activeUsers,
        totalUsers: allUsers.length,
        peakHours,
        avgMessagesPerUser: allUsers.length > 0 ? (totalMessages / allUsers.length).toFixed(1) : 0
      });
      setEngagementLastUpdated(new Date());
    } catch (e) {
      console.error("[ADMIN] Failed to load engagement:", e);
    } finally {
      setEngagementLoading(false);
    }
  }, []);

  // Load growth data - user registration trends
  const loadGrowth = useCallback(async () => {
    setGrowthLoading(true);
    try {
      const d = await adminFetch("/users?limit=500");
      const allUsers = d.users || [];
      const totalUsersCount = Number(d.total) || allUsers.length;
      
      // Generate daily growth data based on registration dates
      const dailyData = {};
      const now = new Date();
      
      // Initialize last 30 Istanbul calendar days
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateKey = istanbulDayKey(date);
        dailyData[dateKey] = { date: dateKey, newUsers: 0, totalUsers: 0 };
      }
      
      // Count registrations per Istanbul day
      allUsers.forEach(u => {
        if (u.created_at) {
          const dateKey = istanbulDayKey(u.created_at);
          if (dailyData[dateKey]) {
            dailyData[dateKey].newUsers++;
          }
        }
      });
      
      // Calculate cumulative totals (prefer API exact total when available)
      const windowRegs = Object.values(dailyData).reduce((sum, day) => sum + day.newUsers, 0);
      let runningTotal = Math.max(0, totalUsersCount - windowRegs);
      Object.keys(dailyData).sort().forEach(dateKey => {
        runningTotal += dailyData[dateKey].newUsers;
        dailyData[dateKey].totalUsers = runningTotal;
      });
      
      setGrowthData(Object.values(dailyData));
      setGrowthLastUpdated(new Date());
      try {
        const attr = await adminFetch("/attribution");
        setAttributionStats(attr || null);
      } catch (attrErr) {
        console.warn("[ADMIN] attribution stats unavailable:", attrErr?.message || attrErr);
      }
    } catch (e) {
      console.error("[ADMIN] Failed to load growth:", e);
    } finally {
      setGrowthLoading(false);
    }
  }, []);

  // Load casino/credits data
  const loadCasinoData = useCallback(async () => {
    try {
      const [creditsRes, historyRes, statsRes] = await Promise.all([
        adminFetch("/credits"),
        adminFetch("/credits/history?limit=100"),
        adminFetch("/credits/stats")
      ]);
      setUserCredits(creditsRes.users || []);
      setCreditHistory(historyRes.history || []);
      setCreditStats(statsRes);
      setGameHistory(historyRes.games || []);
    } catch (e) {
      console.error("[ADMIN] Failed to load casino data:", e);
      throw e;
    }
  }, []);

  // Credit management functions
  const updateUserCredits = async (userId, amount, operation, reason) => {
    try {
      // Ensure amount is a number
      const numericAmount = parseInt(amount, 10);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error("Invalid amount");
      }
      const res = await adminFetch("/credits/update", {
        method: "POST",
        body: JSON.stringify({ userId, amount: numericAmount, operation, reason })
      });
      setSuccessMessage(
        operation === "add"
          ? t("Credits added to user successfully")
          : t("Credits removed from user successfully")
      );
      await loadCasinoData(); // Refresh data
      return res;
    } catch (e) {
      console.error("[Admin] Credit update error:", e);
      setErrorMessage(t("Failed to update credits: {message}", { message: e.message }));
      throw e;
    }
  };

  useEffect(() => {
    adminFetch("/snapshot")
      .then(setSnapshot)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onSync = (p) => setSnapshot(p);
    const onUp = (p) => {
      setSnapshot((s) => (s ? { ...s, lastEvent: p } : s));
      if (p?.type === "presence") {
        loadStats().catch(() => {});
        loadMemberPulse().catch(() => {});
      }
      if (p?.type === "user_report") {
        loadReportSummary().catch(() => {});
        if (p.autoOpen && p.targetId) {
          setDossierUserId(p.targetId);
          setTab("reports");
        }
      }
    };
    socket.on("admin:sync", onSync);
    socket.on("admin:update", onUp);
    socket.emit("admin:subscribe");
    return () => {
      socket.off("admin:sync", onSync);
      socket.off("admin:update", onUp);
    };
  }, [socket, loadStats, loadMemberPulse, loadReportSummary]);

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        await loadStats();
        await loadReportSummary();
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, [loadStats, loadReportSummary]);

  useEffect(() => {
    if (tab === "moderation") loadAllUsers().catch((e) => setErr(e.message));
    if (tab === "security" || tab === "system" || tab === "maintenance") {
      loadSystem().catch((e) => setErr(e.message));
    }
    if (tab === "audit") loadAudit().catch((e) => setErr(e.message));
    if (tab === "announcements") loadAnnouncements().catch((e) => setErr(e.message));
    if (tab === "casino") loadCasinoData().catch((e) => setErr(e.message));
  }, [tab, loadAllUsers, loadAudit, loadSystem, loadAnnouncements, loadCasinoData]);

  const act = async (fn) => {
    try {
      setBusy(true);
      setErr("");
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userQ.trim().toLowerCase();
    if (!q) return users || [];
    return (users || []).filter((u) => {
      const name = String(u.username || "").toLowerCase();
      const id = String(u.id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [users, userQ]);

  const usersOnlineCount = useMemo(
    () => (users || []).filter((u) => u.isOnline).length,
    [users]
  );
  const usersAdminCount = useMemo(
    () => (users || []).filter((u) => u.is_admin).length,
    [users]
  );

  return (
    <motion.div
      className="admin-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="admin-container"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <header className="admin-top">
          {/* Success/Error Messages */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="admin-success-banner"
              >
                <CheckCircle size={16} />
                <span>{successMessage}</span>
              </motion.div>
            )}
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="admin-error-banner"
              >
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

        <div className="admin-header-content">
          <div className="admin-header-icon">
            <Shield size={32} />
          </div>
          <div>
            <h1>{t("admin.title")}</h1>
            <p className="admin-sub">{t("admin.subtitle")}</p>
          </div>
        </div>
        <RippleButton type="button" className="admin-close" onClick={onClose}>
          <X size={20} />
        </RippleButton>
      </header>

      {err && (
        <motion.div 
          className="admin-error"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertTriangle size={16} />
          {err}
        </motion.div>
      )}

      <nav className="admin-tabs">
        {TABS.map((tabDef) => {
          const Icon = tabDef.icon;
          return (
            <motion.button
              key={tabDef.id}
              type="button"
              className={`admin-tab ${tab === tabDef.id ? "active" : ""}`}
              onClick={() => setTab(tabDef.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon size={16} />
              {tabDef.id === "voice"
                ? (locale === "tr" ? "Ses kayıtları" : "Voice recordings")
                : t(tabDef.label)}
              {tabDef.id === "reports" && openReportCount > 0 ? (
                <span className="admin-tab-badge">{openReportCount > 99 ? "99+" : openReportCount}</span>
              ) : null}
            </motion.button>
          );
        })}
      </nav>

      <div className="admin-body">
        {tab === "feedback" && (
          <section className="admin-section admin-section-full">
            <AdminFeedback socket={socket} />
          </section>
        )}

        {tab === "shop" && (
          <section className="admin-section admin-section-full">
            <AdminShop />
          </section>
        )}


        {tab === "dimaai" && (
          <AdminDimaai />
        )}

        {tab === "voice" && <AdminVoiceRecordings socket={socket} />}

        {tab === "livepopup" && <AdminLivePopup />}

        {tab === "announcements" && (
          <section className="admin-section admin-section-full">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <Megaphone size={22} style={{ color: "#5865F2" }} /> {t("Announcements")}
                </h2>
                <p className="muted" style={{ marginTop: 4 }}>{t("Broadcast messages to all users in real-time")}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <RippleButton type="button" onClick={() => act(loadAnnouncements)} disabled={busy} style={{ minWidth: 90 }}>
                  <RefreshCw size={14} /> {t("Refresh")}
                </RippleButton>
                <RippleButton
                  type="button"
                  className={showComposePanel ? "admin-btn-red" : "admin-btn-green"}
                  onClick={() => { setShowComposePanel((v) => !v); setAnnouncementError(""); }}
                >
                  {showComposePanel ? <><X size={14} /> {t("Cancel")}</> : <><Send size={14} /> {t("Compose")}</>}
                </RippleButton>
              </div>
            </div>

            {/* Compose Panel */}
            <AnimatePresence>
              {showComposePanel && (
                <motion.div
                  key="compose"
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: "var(--surface-2)",
                    border: `1px solid ${announcementDraft.color}44`,
                    borderRadius: 14,
                    padding: 24,
                    marginBottom: 28,
                    boxShadow: `0 0 0 1px ${announcementDraft.color}22, 0 8px 32px rgba(0,0,0,0.3)`,
                  }}
                >
                  <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "var(--text-0)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Edit3 size={16} style={{ color: announcementDraft.color }} /> {t("New Announcement")}
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    {/* Emoji picker quick-select */}
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("Icon")}</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["📢", "🚨", "✅", "⚠️", "🔔", "🎉", "🔧", "📌"].map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setAnnouncementDraft((d) => ({ ...d, emoji: em }))}
                            style={{
                              width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 18,
                              background: announcementDraft.emoji === em ? announcementDraft.color + "33" : "var(--surface-3)",
                              outline: announcementDraft.emoji === em ? `2px solid ${announcementDraft.color}` : "none",
                              transition: "all 0.15s",
                            }}
                          >{em}</button>
                        ))}
                      </div>
                    </div>

                    {/* Priority + Color + Target */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("Priority")}</label>
                          <select
                            className="admin-input"
                            value={announcementDraft.priority}
                            onChange={(e) => {
                              const colors = { normal: "#5865F2", important: "#F0B232", urgent: "#DA373C" };
                              setAnnouncementDraft((d) => ({ ...d, priority: e.target.value, color: colors[e.target.value] }));
                            }}
                            style={{ width: "100%" }}
                          >
                            <option value="normal">{t("🔵 Normal")}</option>
                            <option value="important">{t("🟡 Important")}</option>
                            <option value="urgent">{t("🔴 Urgent")}</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("Color")}</label>
                          <input
                            type="color"
                            value={announcementDraft.color}
                            onChange={(e) => setAnnouncementDraft((d) => ({ ...d, color: e.target.value }))}
                            style={{ width: 44, height: 38, border: "none", borderRadius: 8, cursor: "pointer", padding: 2, background: "transparent" }}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("Target Audience")}</label>
                        <select
                          className="admin-input"
                          value={announcementDraft.target}
                          onChange={(e) => setAnnouncementDraft((d) => ({ ...d, target: e.target.value }))}
                          style={{ width: "100%" }}
                        >
                          <option value="all">{t("👥 All Users")}</option>
                          <option value="online">{t("🟢 Online Users")}</option>
                          <option value="admins">{t("🛡️ Admins Only")}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Title */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("Title")}</label>
                    <input
                      className="admin-input"
                      placeholder={t("Announcement title...")}
                      value={announcementDraft.title}
                      onChange={(e) => setAnnouncementDraft((d) => ({ ...d, title: e.target.value }))}
                      maxLength={100}
                      style={{ width: "100%", fontSize: 15, fontWeight: 600 }}
                    />
                  </div>

                  {/* Content */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("Message")}</label>
                    <textarea
                      className="admin-input"
                      placeholder={t("Write your announcement content...")}
                      value={announcementDraft.content}
                      onChange={(e) => setAnnouncementDraft((d) => ({ ...d, content: e.target.value }))}
                      rows={4}
                      maxLength={1000}
                      style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }}
                    />
                    <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {announcementDraft.content.length}/1000
                    </div>
                  </div>

                  {/* Pin toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <button
                      type="button"
                      onClick={() => setAnnouncementDraft((d) => ({ ...d, pinned: !d.pinned }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 7, padding: "7px 14px",
                        borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                        background: announcementDraft.pinned ? announcementDraft.color + "22" : "var(--surface-3)",
                        color: announcementDraft.pinned ? announcementDraft.color : "var(--text-2)",
                        outline: announcementDraft.pinned ? `1.5px solid ${announcementDraft.color}` : "none",
                        transition: "all 0.15s",
                      }}
                    >
                      <Flag size={13} /> {announcementDraft.pinned ? t("Pinned") : t("Pin to top")}
                    </button>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Pinned announcements appear at the top of the list")}</span>
                  </div>

                  {/* Live Preview */}
                  {(announcementDraft.title || announcementDraft.content) && (
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>{t("Preview")}</label>
                      <div style={{
                        background: "var(--surface-1)", borderRadius: 12, padding: "14px 16px",
                        borderLeft: `4px solid ${announcementDraft.color}`,
                        border: `1px solid ${announcementDraft.color}33`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 18 }}>{announcementDraft.emoji}</span>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-0)" }}>{announcementDraft.title || t("Untitled")}</span>
                          {announcementDraft.pinned && <Flag size={12} style={{ color: announcementDraft.color }} />}
                          <span style={{
                            marginLeft: "auto", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                            padding: "2px 8px", borderRadius: 4,
                            background: announcementDraft.priority === "urgent" ? "#DA373C22" : announcementDraft.priority === "important" ? "#F0B23222" : "#5865F222",
                            color: announcementDraft.priority === "urgent" ? "#DA373C" : announcementDraft.priority === "important" ? "#F0B232" : "#5865F2",
                          }}>{announcementDraft.priority}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{announcementDraft.content || t("No message yet.")}</p>
                      </div>
                    </div>
                  )}

                  {announcementError && (
                    <div style={{ background: "#DA373C22", border: "1px solid #DA373C44", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#DA373C", display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertCircle size={14} /> {announcementError}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <RippleButton type="button" onClick={() => setShowComposePanel(false)}>{t("Cancel")}</RippleButton>
                    <RippleButton
                      type="button"
                      className="admin-btn-green"
                      disabled={announcementSubmitting || !announcementDraft.title.trim() || !announcementDraft.content.trim()}
                      onClick={async () => {
                        setAnnouncementSubmitting(true);
                        setAnnouncementError("");
                        try {
                          const token = localStorage.getItem("descall_token");
                          const res = await fetch(`${API_BASE_URL}/api/admin/announcements`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify(announcementDraft),
                          });
                          if (!res.ok) {
                            const body = await res.json().catch(() => ({}));
                            throw new Error(body.error || `Server error ${res.status}`);
                          }
                          setAnnouncementDraft({ title: "", content: "", priority: "normal", color: "#5865F2", pinned: false, target: "all", emoji: "📢" });
                          setShowComposePanel(false);
                          await loadAnnouncements();
                        } catch (e) {
                          setAnnouncementError(e.message);
                        } finally {
                          setAnnouncementSubmitting(false);
                        }
                      }}
                    >
                      {announcementSubmitting ? t("Sending...") : <><Send size={14} /> {t("Publish")}</>}
                    </RippleButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Announcements list */}
            {announcements.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                <Megaphone size={44} style={{ opacity: 0.3, marginBottom: 14 }} />
                <p style={{ margin: 0, fontSize: 15 }}>{t("No announcements yet")}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13 }}>{t("Compose one above to broadcast to your users.")}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...announcements]
                  .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (parseAppDate(b.created_at)?.getTime() || 0) - (parseAppDate(a.created_at)?.getTime() || 0))
                  .map((a) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      style={{
                        background: "var(--surface-2)",
                        borderRadius: 12,
                        padding: "16px 18px",
                        borderLeft: `4px solid ${a.color || "#5865F2"}`,
                        border: `1px solid ${(a.color || "#5865F2")}22`,
                        position: "relative",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{a.emoji || "📢"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-0)" }}>{a.title}</span>
                            {a.pinned && (
                              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: a.color || "#5865F2", fontWeight: 600 }}>
                                <Flag size={11} /> {t("Pinned")}
                              </span>
                            )}
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                              padding: "2px 8px", borderRadius: 4,
                              background: a.priority === "urgent" ? "#DA373C22" : a.priority === "important" ? "#F0B23222" : "#5865F222",
                              color: a.priority === "urgent" ? "#DA373C" : a.priority === "important" ? "#F0B232" : "#5865F2",
                            }}>{a.priority}</span>
                            {a.target && a.target !== "all" && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", background: "var(--surface-3)", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                {a.target}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a.content}</p>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
                            {a.author && <span>{t("By")} <strong style={{ color: "var(--text-3)" }}>{a.author}</strong></span>}
                            <span>·</span>
                            <span>{formatAppDateTime(a.created_at, locale)}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            title={a.pinned ? t("Unpin") : t("Pin")}
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem("descall_token");
                                const res = await fetch(`${API_BASE_URL}/api/admin/announcements/${a.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ pinned: !a.pinned }),
                                });
                                if (!res.ok) {
                                  const body = await res.json().catch(() => ({}));
                                  throw new Error(body.error || `Server error ${res.status}`);
                                }
                                setAnnouncementError("");
                                await loadAnnouncements();
                              } catch (e) {
                                setAnnouncementError(e.message || t("Pin toggle failed"));
                              }
                            }}
                            style={{
                              background: a.pinned ? (a.color || "#5865F2") + "22" : "var(--surface-3)",
                              border: "none", borderRadius: 7, width: 32, height: 32,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", color: a.pinned ? (a.color || "#5865F2") : "var(--text-muted)",
                              transition: "all 0.15s",
                            }}
                          >
                            <Flag size={14} />
                          </button>
                          <button
                            type="button"
                            title={t("Delete")}
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem("descall_token");
                                const res = await fetch(`${API_BASE_URL}/api/admin/announcements/${a.id}`, {
                                  method: "DELETE",
                                  headers: { Authorization: `Bearer ${token}` },
                                });
                                if (!res.ok) {
                                  const body = await res.json().catch(() => ({}));
                                  throw new Error(body.error || `Server error ${res.status}`);
                                }
                                setAnnouncementError("");
                                await loadAnnouncements();
                              } catch (e) {
                                setAnnouncementError(e.message || t("Failed to delete announcement"));
                              }
                            }}
                            style={{
                              background: "var(--surface-3)", border: "none", borderRadius: 7, width: 32, height: 32,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", color: "var(--text-muted)", transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#DA373C22"; e.currentTarget.style.color = "#DA373C"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
              </div>
            )}
          </section>
        )}

        {tab === "casino" && (
          <section className="admin-section admin-section-full">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <Coins size={22} style={{ color: "#f59e0b" }} /> {t("Casino / Credits Management")}
                </h2>
                <p className="muted" style={{ marginTop: 4 }}>{t("Manage user credits and view Blackjack statistics")}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <RippleButton type="button" onClick={() => act(loadCasinoData)} disabled={busy} style={{ minWidth: 90 }}>
                  <RefreshCw size={14} /> {t("Refresh")}
                </RippleButton>
              </div>
            </div>

            {/* Stats Overview */}
            {creditStats && (
              <div className="admin-grid" style={{ marginBottom: 24 }}>
                <div className="admin-card" style={{ background: "linear-gradient(135deg, #f59e0b22, #d9770622)", borderColor: "#f59e0b44" }}>
                  <span style={{ color: "#f59e0b" }}>{t("Total Credits in System")}</span>
                  <strong style={{ color: "#f59e0b", fontSize: 24 }}>{(creditStats.totalCredits || 0).toLocaleString()}</strong>
                </div>
                <div className="admin-card">
                  <span>{t("Total Players")}</span>
                  <strong>{creditStats.totalPlayers || 0}</strong>
                </div>
                <div className="admin-card">
                  <span>{t("Games Played")}</span>
                  <strong>{creditStats.totalGames || 0}</strong>
                </div>
                <div className="admin-card">
                  <span>{t("Avg Credits/User")}</span>
                  <strong>{Math.round((creditStats.totalCredits || 0) / (creditStats.totalPlayers || 1)).toLocaleString()}</strong>
                </div>
              </div>
            )}

            {/* Credit Management Section */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
              {/* Search and Manage Users */}
              <div style={{ background: "var(--surface-2)", borderRadius: 14, padding: 20, border: "1px solid var(--border-2)" }}>
                <h3 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Search size={18} /> {t("Find User")}
                </h3>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input
                    className="admin-input"
                    placeholder={t("Search by username...")}
                    value={creditSearch}
                    onChange={(e) => setCreditSearch(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                
                {/* User List */}
                <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {userCredits
                    .filter(u => !creditSearch || u.username?.toLowerCase().includes(creditSearch.toLowerCase()))
                    .slice(0, 20)
                    .map(user => (
                      <motion.div
                        key={user.user_id}
                        onClick={() => setSelectedCreditUser(user)}
                        style={{
                          padding: "12px 14px",
                          background: selectedCreditUser?.user_id === user.user_id ? "rgba(102, 120, 255, 0.2)" : "var(--surface-3)",
                          borderRadius: 10,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          border: selectedCreditUser?.user_id === user.user_id ? "1px solid #6678ff" : "1px solid transparent",
                        }}
                        whileHover={{ scale: 1.01 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ 
                            width: 36, height: 36, borderRadius: "50%", 
                            background: "linear-gradient(135deg, #6678ff, #7d6bff)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 600, fontSize: 14, color: "white"
                          }}>
                            {user.username?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{user.username || t("Unknown")}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("ID: {id}...", { id: user.user_id?.slice(0, 8) })}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: 16, color: "#f59e0b" }}>
                            <Wallet size={14} style={{ display: "inline", marginRight: 4 }} />
                            {user.credits?.toLocaleString() || 0}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {t("{count} games", { count: user.games_played || 0 })}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  {userCredits.filter(u => !creditSearch || u.username?.toLowerCase().includes(creditSearch.toLowerCase())).length === 0 && (
                    <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                      <p>{t("No users found")}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Credit Operations */}
              <div style={{ background: "var(--surface-2)", borderRadius: 14, padding: 20, border: "1px solid var(--border-2)" }}>
                <h3 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <DollarSign size={18} /> {t("Manage Credits")}
                </h3>
                
                {selectedCreditUser ? (
                  <div>
                    <div style={{ 
                      background: "var(--surface-3)", 
                      padding: "14px 16px", 
                      borderRadius: 10, 
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{selectedCreditUser.username}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Current Balance")}</div>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>
                        {selectedCreditUser.credits?.toLocaleString() || 0}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setCreditOperation("add")}
                          style={{
                            flex: 1,
                            padding: "10px",
                            borderRadius: 8,
                            border: "none",
                            cursor: "pointer",
                            background: creditOperation === "add" ? "#22c55e" : "var(--surface-3)",
                            color: creditOperation === "add" ? "white" : "var(--text-1)",
                            fontWeight: 600,
                          }}
                        >
                          <Plus size={14} style={{ display: "inline", marginRight: 6 }} />
                          {t("Add Credits")}
                        </button>
                        <button
                          onClick={() => setCreditOperation("remove")}
                          style={{
                            flex: 1,
                            padding: "10px",
                            borderRadius: 8,
                            border: "none",
                            cursor: "pointer",
                            background: creditOperation === "remove" ? "#ef4444" : "var(--surface-3)",
                            color: creditOperation === "remove" ? "white" : "var(--text-1)",
                            fontWeight: 600,
                          }}
                        >
                          <Minus size={14} style={{ display: "inline", marginRight: 6 }} />
                          {t("Remove Credits")}
                        </button>
                      </div>

                      <div>
                        <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>{t("Amount")}</label>
                        <input
                          type="number"
                          className="admin-input"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                          min="1"
                          max="1000000"
                          style={{ width: "100%" }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>{t("Reason (optional)")}</label>
                        <input
                          className="admin-input"
                          value={creditReason}
                          onChange={(e) => setCreditReason(e.target.value)}
                          placeholder={t("e.g., Bonus, Correction, etc.")}
                          style={{ width: "100%" }}
                        />
                      </div>

                      <RippleButton
                        type="button"
                        className={creditOperation === "add" ? "admin-btn-green" : "admin-btn-red"}
                        onClick={() => act(() => updateUserCredits(selectedCreditUser.user_id, creditAmount, creditOperation, creditReason))}
                        disabled={busy || creditAmount <= 0}
                        style={{ width: "100%", marginTop: 8 }}
                      >
                        {busy ? t("Processing...") : (
                          <>{creditOperation === "add" ? <Plus size={16} /> : <Minus size={16} />} {t("{op} {amount} Credits", { op: creditOperation === "add" ? t("Add") : t("Remove"), amount: creditAmount.toLocaleString() })}</>
                        )}
                      </RippleButton>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
                    <Coins size={44} style={{ opacity: 0.3, marginBottom: 14 }} />
                    <p>{t("Select a user from the list to manage their credits")}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Game History */}
            <div style={{ background: "var(--surface-2)", borderRadius: 14, padding: 20, border: "1px solid var(--border-2)" }}>
              <h3 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                <History size={18} /> {t("Recent Game History")}
              </h3>
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("User")}</th>
                      <th>{t("Bet")}</th>
                      <th>{t("Result")}</th>
                      <th>{t("Win Amount")}</th>
                      <th>{t("Time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameHistory.slice(0, 20).map((game, idx) => (
                      <tr key={idx}>
                        <td>{game.username || game.user_id?.slice(0, 8)}</td>
                        <td>{game.bet_amount?.toLocaleString() || 0}</td>
                        <td>
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: game.result === 'win' || game.result === 'blackjack' ? '#22c55e22' : game.result === 'loss' ? '#ef444422' : '#6b728022',
                            color: game.result === 'win' || game.result === 'blackjack' ? '#22c55e' : game.result === 'loss' ? '#ef4444' : '#9ca3af',
                          }}>
                            {game.result?.toUpperCase() || 'PUSH'}
                          </span>
                        </td>
                        <td style={{ color: game.win_amount > 0 ? '#22c55e' : 'var(--text-1)' }}>
                          {game.win_amount > 0 ? '+' : ''}{game.win_amount?.toLocaleString() || 0}
                        </td>
                        <td style={{ fontSize: 13, color: "var(--text-muted)" }}>
                          {game.played_at ? formatAppDateTime(game.played_at, locale) : '-'}
                        </td>
                      </tr>
                    ))}
                    {gameHistory.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                          {t("No games played yet")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "moderation" && (
          <>
            <AdminModeration
              users={users}
              onRefreshUsers={() => {
                loadAllUsers().catch(() => {});
                loadSystem().catch(() => {});
              }}
            />
            <section className="admin-section" style={{ marginTop: 16 }}>
              <h2>{t("Content filters")}</h2>
              <p className="muted">{t("Profanity filter and flagged messages")}</p>
              <div className="admin-toolbar">
                <RippleButton type="button" onClick={() => act(loadSystem)} disabled={busy}>
                  {t("Refresh")}
                </RippleButton>
              </div>
              {system && (
                <div className="admin-form">
                  <h3>{t("Flagged Messages")}</h3>
                  <div className="flagged-messages-list">
                    {system.flaggedMessages?.length > 0 ? (
                      system.flaggedMessages.map((msg) => (
                        <div key={msg.id} className="flagged-message-item">
                          <span>{msg.text}</span>
                          <span className="badge">{msg.reason}</span>
                        </div>
                      ))
                    ) : (
                      <p className="muted">{t("No flagged messages")}</p>
                    )}
                  </div>
                  <h3>{t("Profanity Filter")}</h3>
                  <label>
                    {t("Add word to filter")}
                    <input className="admin-input" id="prof-moderation" placeholder={t("Enter word...")} />
                    <RippleButton
                      type="button"
                      onClick={() => {
                        const w = document.getElementById("prof-moderation")?.value?.trim();
                        if (!w) return;
                        act(async () => {
                          await adminFetch("/profanity", { method: "POST", body: JSON.stringify({ word: w }) });
                          await loadSystem();
                        });
                      }}
                    >
                      {t("Add")}
                    </RippleButton>
                  </label>
                  <div className="profanity-list">
                    {system.profanityWords?.length > 0 ? (
                      system.profanityWords.map((word) => (
                        <span key={word} className="profanity-tag">{word}</span>
                      ))
                    ) : (
                      <p className="muted">{t("No filter words")}</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "overview" && (
          <AdminOverview
            onOpenPerson={setDossierUserId}
            onGoto={setTab}
          />
        )}

        {tab === "analytics" && <AdminAnalytics />}

        {tab === "people" && (
          <AdminPeople
            selectedUserId={dossierUserId}
            onSelectUser={setDossierUserId}
            onRefreshInbox={loadReportSummary}
          />
        )}

        {tab === "reports" && (
          <AdminReports
            selectedUserId={dossierUserId}
            onSelectUser={setDossierUserId}
            onOpenDossier={(id) => {
              setDossierUserId(id);
            }}
          />
        )}

        {tab === "security" && (
          <section className="admin-section">
            <h2>{t("Security Center")}</h2>
            <p className="muted">{t("Security settings and access control")}</p>
            
            <div className="security-grid">
              <div className="security-card">
                <h3>{t("Access Control")}</h3>
                <label>
                  <input 
                    type="checkbox" 
                    checked={system?.config?.registrationEnabled !== false}
                    onChange={(e) => act(async () => {
                      await adminFetch("/system", {
                        method: "PATCH",
                        body: JSON.stringify({ registrationEnabled: e.target.checked }),
                      });
                      await loadSystem();
                    })}
                  />
                  {t("Allow new user registrations")}
                </label>
                
                <label>
                  <input 
                    type="checkbox" 
                    checked={system?.config?.dmEnabled !== false}
                    onChange={(e) => act(async () => {
                      await adminFetch("/system", {
                        method: "PATCH",
                        body: JSON.stringify({ dmEnabled: e.target.checked }),
                      });
                      await loadSystem();
                    })}
                  />
                  {t("Enable direct messages")}
                </label>
                
                <label>
                  <input 
                    type="checkbox" 
                    checked={system?.config?.groupCreationEnabled !== false}
                    onChange={(e) => act(async () => {
                      await adminFetch("/system", {
                        method: "PATCH",
                        body: JSON.stringify({ groupCreationEnabled: e.target.checked }),
                      });
                      await loadSystem();
                    })}
                  />
                  {t("Allow group creation")}
                </label>
              </div>
              
              <div className="security-card">
                <h3>{t("Rate Limits")}</h3>
                <label>
                  {t("Max login attempts per minute")}
                  <input 
                    type="number" 
                    className="admin-input"
                    defaultValue={system?.config?.maxLoginAttempts || 5}
                    key={`login-${system?.config?.maxLoginAttempts || 5}`}
                    onBlur={(e) => act(async () => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next) || next <= 0) return;
                      await adminFetch("/system", {
                        method: "PATCH",
                        body: JSON.stringify({ maxLoginAttempts: next }),
                      });
                      await loadSystem();
                    })}
                  />
                </label>
                
                <label>
                  {t("Max messages per minute")}
                  <input 
                    type="number" 
                    className="admin-input"
                    defaultValue={system?.config?.maxMessagesPerMinute || 60}
                    key={`msg-${system?.config?.maxMessagesPerMinute || 60}`}
                    onBlur={(e) => act(async () => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next) || next <= 0) return;
                      await adminFetch("/system", {
                        method: "PATCH",
                        body: JSON.stringify({ maxMessagesPerMinute: next }),
                      });
                      await loadSystem();
                    })}
                  />
                </label>
              </div>
            </div>
          </section>
        )}

        {tab === "maintenance" && (
          <section className="admin-section">
            <h2>{t("System Maintenance")}</h2>
            <p className="muted">{t("System maintenance and cleanup tools")}</p>
            
            <div className="maintenance-grid">
              <div className="maintenance-card">
                <h3>{t("Cache Management")}</h3>
                <RippleButton
                  type="button"
                  onClick={() =>
                    act(async () => {
                      await adminFetch("/cache/clear", { method: "POST" });
                      setSuccessMessage(t("Cache cleared successfully"));
                      setTimeout(() => setSuccessMessage(""), 3000);
                    })
                  }
                >
                  {t("Clear System Cache")}
                </RippleButton>
                <p className="muted">{t("Clears all temporary caches")}</p>
              </div>
              
              <div className="maintenance-card">
                <h3>{t("Log Management")}</h3>
                <RippleButton
                  type="button"
                  onClick={() =>
                    act(async () => {
                      await adminFetch("/logs/archive", { method: "POST" });
                      setSuccessMessage(t("Old logs archived successfully"));
                      setTimeout(() => setSuccessMessage(""), 3000);
                    })
                  }
                >
                  {t("Archive Old Logs")}
                </RippleButton>
                <p className="muted">{t("Archives logs older than 30 days")}</p>
              </div>
              
              <div className="maintenance-card">
                <h3>{t("Database")}</h3>
                <RippleButton
                  type="button"
                  onClick={() =>
                    act(async () => {
                      const d = await adminFetch("/backup", { method: "POST" });
                      setSuccessMessage(t("Backup created: {id}", { id: d.backupId }));
                      setTimeout(() => setSuccessMessage(""), 5000);
                    })
                  }
                >
                  {t("Create Backup")}
                </RippleButton>
                <p className="muted">{t("Creates a full system backup")}</p>
              </div>
              
              <div className="maintenance-card danger">
                <h3>{t("Danger Zone")}</h3>
                <RippleButton
                  type="button"
                  className="danger"
                  onClick={() =>
                    act(async () => {
                      if (!window.confirm(t("Restart Node process?\n\nAll connections will be lost."))) return;
                      await adminFetch("/restart", { method: "POST" });
                    })
                  }
                >
                  {t("Restart Server")}
                </RippleButton>
                <p className="muted warning">{t("Immediately restarts the server")}</p>
              </div>
            </div>
          </section>
        )}

        {tab === "system" && (
          <section className="admin-section">
            {system && (
              <div className="admin-form">
                <label>
                  {t("Max message length")}
                  <input
                    type="number"
                    defaultValue={system.config?.maxMessageLength}
                    onBlur={(e) =>
                      act(async () => {
                        await adminFetch("/system", {
                          method: "PATCH",
                          body: JSON.stringify({ maxMessageLength: Number(e.target.value) }),
                        });
                        await loadSystem();
                      })
                    }
                  />
                </label>
                <label>
                  {t("Rate limit (ms)")}
                  <input
                    type="number"
                    defaultValue={system.config?.rateLimitGlobalMs}
                    onBlur={(e) =>
                      act(async () => {
                        await adminFetch("/system", {
                          method: "PATCH",
                          body: JSON.stringify({ rateLimitGlobalMs: Number(e.target.value) }),
                        });
                        await loadSystem();
                      })
                    }
                  />
                </label>
                <label>
                  {t("Slow mode (seconds)")}
                  <input
                    type="number"
                    defaultValue={system.config?.slowModeSeconds}
                    onBlur={(e) =>
                      act(async () => {
                        await adminFetch("/chat/slowmode", {
                          method: "POST",
                          body: JSON.stringify({ seconds: Number(e.target.value) }),
                        });
                        await loadSystem();
                      })
                    }
                  />
                </label>
                <div className="admin-row">
                  <RippleButton
                    type="button"
                    onClick={() =>
                      act(async () => {
                        await adminFetch("/chat/freeze", {
                          method: "POST",
                          body: JSON.stringify({ frozen: !system.config?.chatFrozen }),
                        });
                        await loadSystem();
                      })
                    }
                  >
                    {t("Toggle chat freeze")}
                  </RippleButton>
                  <RippleButton
                    type="button"
                    onClick={() =>
                      act(async () => {
                        await adminFetch("/maintenance", {
                          method: "POST",
                          body: JSON.stringify({ enabled: !system.config?.maintenanceMode }),
                        });
                        await loadSystem();
                      })
                    }
                  >
                    {t("Toggle maintenance")}
                  </RippleButton>
                </div>
                <label>
                  {t("Broadcast")}
                  <textarea
                    className="admin-textarea"
                    placeholder={t("Announcement text")}
                    id="bc-text"
                  />
                  <RippleButton
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("bc-text");
                      const text = el?.value?.trim();
                      if (!text) return;
                      act(async () => {
                        await adminFetch("/broadcast", { method: "POST", body: JSON.stringify({ text }) });
                      });
                    }}
                  >
                    {t("Send broadcast")}
                  </RippleButton>
                </label>
                <label>
                  {t("Profanity word")}
                  <input className="admin-input" id="prof" />
                  <RippleButton
                    type="button"
                    onClick={() => {
                      const w = document.getElementById("prof")?.value?.trim();
                      if (!w) return;
                      act(async () => {
                        await adminFetch("/profanity", { method: "POST", body: JSON.stringify({ word: w }) });
                        await loadSystem();
                      });
                    }}
                  >
                    {t("Add filter")}
                  </RippleButton>
                </label>
                <div className="admin-row">
                  <RippleButton
                    type="button"
                    onClick={() =>
                      act(async () => {
                        await adminFetch("/backup", { method: "POST", body: JSON.stringify({}) });
                      })
                    }
                  >
                    {t("Memory backup (JSON response in network tab)")}
                  </RippleButton>
                  <RippleButton
                    type="button"
                    className="danger"
                    onClick={() =>
                      act(async () => {
                        if (!window.confirm(t("Restart Node process?"))) return;
                        await adminFetch("/restart", { method: "POST", body: JSON.stringify({}) });
                      })
                    }
                  >
                    {t("Restart server")}
                  </RippleButton>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "audit" && (
          <section className="admin-section">
            <table className="admin-table compact">
              <thead>
                <tr>
                  <th>{t("Time")}</th>
                  <th>{t("Actor")}</th>
                  <th>{t("Action")}</th>
                  <th>{t("Target")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td>{e.at}</td>
                    <td>{e.actorUsername}</td>
                    <td>{e.action}</td>
                    <td className="mono">{String(e.target)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
      </motion.div>
    </motion.div>
  );
}
