import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { 
  Shield, Users, MessageSquare, Activity, AlertCircle, Settings, 
  FileText, BarChart3, Bell, Search, Filter, Download, RefreshCw,
  Ban, Trash2, Eye, EyeOff, Lock, Unlock, Wifi, WifiOff, Zap,
  Database, Server, Clock, Calendar, MapPin, Smartphone,
  Mail, Send, Image, Paperclip, X, CheckCircle, AlertTriangle,
  Info, MoreHorizontal, ChevronUp, Terminal, Cpu,
  HardDrive, Network, TrendingUp, TrendingDown, UserCheck,
  UserX, MessageCircle, Volume2, VolumeX, Flag, FlagOff,
  History, RotateCcw, Save, Edit3, Layers, Grid, List, PieChart,
  Activity as ActivityIcon, Box, Code, GitBranch, Layers2, Monitor,
  MousePointer, Pause, Square, Maximize2, Minimize2, Copy,
  ExternalLink, FileDown, Printer, Share2, Star, ThumbsUp,
  ThumbsDown, Upload, Video, ZoomIn, ZoomOut, Megaphone,
  Coins, Wrench, Wallet, Plus, Minus, ShoppingBag, BellRing, FolderSearch, LayoutDashboard, Ticket, Award, Bot
} from "../ui/Icon.jsx";
import { adminFetch } from "../../api/adminHttp";
import { getToken } from "../../lib/storage";
import { apiBase } from "../../lib/nodeRouting";
import RippleButton from "../ui/RippleButton";
import AdminFeedbackV3 from "./feedback3/AdminFeedbackV3.jsx";
import SignupStatsWindow from "./signupStats/SignupStatsWindow.jsx";
import { adminRawFetch } from "../../lib/adminStepUp";
import AdminShell from "./AdminShell.jsx";
import { AdminStepUpHost, Admin2faGate, useAdmin2faGate } from "./AdminStepUpHost.jsx";
import { isTabletLayout } from "../../lib/appearancePrefs";
// Mağaza (remake, Draft A + B): catalog desk, storefront, campaigns, gifts, reconciliation.
import AdminShopDesk from "./shopdesk/AdminShopDesk.jsx";
import PromoCodesTab from "./PromoCodesTab";
import SpecialBadgesAdminTab from "../badges/SpecialBadgesAdminTab.jsx";
import AdminModeration from "./AdminModeration";
import AdminLivePopup from "./AdminLivePopup";
import SecurityCenter from "./security/SecurityCenter.jsx";
import AdminAnalytics from "./AdminAnalytics";
import AdminPeople from "./AdminPeople";
import AdminUserDirectory from "./AdminUserDirectory";
import AdminReports from "./AdminReports";
import AdminOverview from "./AdminOverview";
import MaintenanceTab from "./MaintenanceTab";
import AdminSystem from "./system/AdminSystem.jsx";
import SuspiciousTab from "./SuspiciousTab";
import { ShieldWarning, UserGear, Bug, Trophy } from "../ui/Icon.jsx";
import RetentionTab from "./growth/RetentionTab.jsx";
import EconomyTab from "./growth/EconomyTab.jsx";
import AdminStaff from "./AdminStaff.jsx";
import AccessBansTab from "./AccessBansTab.jsx";
import AdminAppeals from "./AdminAppeals.jsx";
import ErrorIssuesTab from "./ErrorIssuesTab.jsx";
import AdminTopUsers from "./AdminTopUsers.jsx";
import AdminDmInbox from "./AdminDmInbox.jsx";
import AdminServerReview from "./AdminServerReview.jsx";
import AdminGames from "./games/AdminGames.jsx";
// İşlem kaydı (owner pick Draft B "Konsol"): audit/AdminAudit.jsx
import AdminAudit from "./audit/AdminAudit.jsx";
// Performans (owner pick Draft A "Konsol"): perf/AdminPerf.jsx
import AdminPerf from "./perf/AdminPerf.jsx";
// Admin Token (owner only, Draft B "Liste ve çalışma alanı"): tokens/AdminTokens.jsx
import AdminTokens from "./tokens/AdminTokens.jsx";
// Sunucu Ağı (owner only, Draft A "Kontrol merkezi"): hybrid server, nodes/AdminNodes.jsx
import AdminNodes from "./nodes/AdminNodes.jsx";
import { Gauge, Crown, UsersThree, ScrollText, Landmark, SlidersHorizontal, Gift, Scale } from "../ui/Icon.jsx";
import { initialTabFromQuery, sectionOfTab, withOwnerTabs } from "./adminNav.js";
import { KeyRound } from "../ui/Icon.jsx";
import { AdminPermsContext } from "./dossier/adminPerms.js";
// Premium Yönetimi (Descall+ / Ultra): its own chunk, loaded when a premium page opens.
const PremiumAdmin = lazy(() => import("./premium/PremiumAdmin.jsx"));
const AdminAgent = lazy(() => import("./AdminAgent.jsx"));
const AdminShop2 = lazy(() => import("./shop2/AdminShop2.jsx"));
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import GlassCheckbox from "../ui/GlassCheckbox";
// Duyurular (remake, Drafts C + A): board, list + inspector, composer, templates, languages.
import AnnouncementsPage from "./announcements/AnnouncementsPage.jsx";
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
  // Bakım sits right after Genel Bakış so it is reachable from the front of the list.
  { id: "maintenance", label: "admin.maintenance", icon: Wrench },
  // Ajan (2026-11-08, phase 1): the Claude assistant; reads with the admin's own sections.
  { id: "agent", label: "agentx.title", icon: Bot },
  { id: "directory", label: "admin.users", icon: Users },
  { id: "analytics", label: "admin.analytics", icon: Activity },
  // Kayıt İstatistikleri opens in its own window (Electron) or an in-app window (web / iPad).
  { id: "signupStats", label: "admin.signupStats", icon: BarChart3 },
  { id: "retention", label: "admin.retention", icon: TrendingUp },
  { id: "economy", label: "admin.economy", icon: Wallet },
  { id: "topUsers", label: "admin.topUsers", icon: Trophy },
  { id: "people", label: "admin.people", icon: FolderSearch },
  { id: "reports", label: "admin.reports", icon: Flag },
  { id: "feedback", label: "admin.feedback", icon: Bell },
  { id: "shop", label: "admin.shop", icon: ShoppingBag },
  { id: "shop2", label: "admin.shop2", icon: Layers },
  { id: "promo", label: "admin.promoCodes", icon: Ticket },
  { id: "specialBadges", label: "badges.adminTab", icon: Award },
  { id: "announcements", label: "admin.announcements", icon: Megaphone },
  { id: "livepopup", label: "admin.livePopup", icon: BellRing },
  { id: "casino", label: "admin.casino", icon: Coins },
  { id: "moderation", label: "admin.moderation", icon: Shield },
  // İtirazlar (ban experience): appeals against bans; shares the "moderation" section.
  { id: "appeals", label: "banAdmin.navAppeals", icon: Scale },
  // DM inceleme (3.7.1): never in the legacy "all sections" default; owner grants it.
  { id: "dmReview", label: "admin.dmReview", icon: MessageCircle },
  // Sunucu inceleme: same gate as DM inceleme (metadata lists, content by reason + audit); owner grants it.
  { id: "serverReview", label: "serverReview.nav", icon: Server },
  { id: "suspicious", label: "sx.tab", icon: ShieldWarning },
  { id: "accessBans", label: "admin.accessBans", icon: Ban },
  // Premium Yönetimi (phase 1): nine pages under the one "premium" section.
  // Descall+ 2.0 workspace (owner pick 5B section 4): list + person + plans, payments, funnel.
  { id: "premiumWorkspace", label: "premiumAdmin.navWorkspace", icon: Gauge },
  { id: "premiumDashboard", label: "premiumAdmin.navDashboard", icon: Gauge },
  { id: "premiumUsers", label: "premiumAdmin.navUsers", icon: Crown },
  { id: "premiumBulk", label: "premiumAdmin.navBulk", icon: UsersThree },
  { id: "premiumHistory", label: "premiumAdmin.navHistory", icon: History },
  { id: "premiumAnalytics", label: "premiumAdmin.navAnalytics", icon: PieChart },
  { id: "premiumFinance", label: "premiumAdmin.navFinance", icon: Landmark },
  { id: "premiumCampaigns", label: "premiumAdmin.navCampaigns", icon: Gift },
  { id: "premiumAudit", label: "premiumAdmin.navAudit", icon: ScrollText },
  { id: "premiumPlans", label: "premiumAdmin.navPlans", icon: SlidersHorizontal },
  { id: "system", label: "admin.system", icon: Settings },
  // Sunucu Ağı (owner pick Draft A "Kontrol merkezi"): owner only, Render + the owner's PC.
  { id: "nodes", label: "anodes.nav", icon: Network },
  { id: "security", label: "admin.security", icon: Lock },
  // Admin Token (owner pick Draft B "Liste ve çalışma alanı"): owner only, bot tokens + MCP.
  { id: "adminToken", label: "atok.nav", icon: KeyRound },
  { id: "errors", label: "admin.errors", icon: Bug },
  // Performans (Draft A "Konsol"): real-user metrics, release regressions, Lighthouse CI.
  { id: "perf", label: "perfAdmin.title", icon: Gauge, badgeTone: "red", newLabel: "perfAdmin.new" },
  { id: "audit", label: "admin.audit", icon: FileText },
  // Yöneticiler (3.3.0): owner only; grants sections to the other admins.
  { id: "staff", label: "admin.staff", icon: UserGear },
];

/**
 * Sections this admin may open (GET /admin/me/permissions, 3.3.0). The server
 * checks every request too; this only hides what would answer 403. Until the
 * answer arrives only Genel Bakış is listed.
 */
export function visibleTabs(sections) {
  const allow = new Set(Array.isArray(sections) ? sections : ["overview"]);
  allow.add("overview");
  return TABS.filter((x) => allow.has(sectionOfTab(x.id)));
}

function useAdminPermissions(socket) {
  const [perm, setPerm] = useState({ sections: null, owner: false });
  const load = useCallback(() => {
    adminFetch("/me/permissions")
      .then((d) => setPerm({ sections: withOwnerTabs(Array.isArray(d?.sections) ? d.sections : ["overview"], Boolean(d?.owner)), owner: Boolean(d?.owner) }))
      .catch(() => setPerm((p) => (p.sections ? p : { sections: ["overview"], owner: false })));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!socket) return undefined;
    const on = () => load();
    socket.on("admin:permissions", on);
    return () => socket.off("admin:permissions", on);
  }, [socket, load]);
  return [perm, load];
}

/** "phone" (iPhone glass / narrow window), "ipad", or "desktop" for the 3.0 admin screens. */
function readAdminLayout() {
  if (typeof window === "undefined") return "desktop";
  const html = document.documentElement;
  if (html.classList.contains("glass-ui") || window.innerWidth < 720) return "phone";
  return isTabletLayout(window) ? "ipad" : "desktop";
}

function useAdminLayout() {
  const [layout, setLayout] = useState(readAdminLayout);
  useEffect(() => {
    const on = () => setLayout(readAdminLayout());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return layout;
}

export default function AdminPanel({ socket, onClose, onAdminChanged, viewerUsername, standalone = false }) {
  const { t, locale } = useLocale();
  // "El bağlantısını kopyala" (Oyunlar / Kredi) links open the panel on that page: #games/<user>/<hand>.
  // ?tab=<id> opens a page directly (the Descall Node tray app opens ?tab=nodes); a page this
  // viewer may not open falls back to Genel Bakış below.
  const [tab, setTab] = useState(() => (typeof window !== "undefined" && /^#games\//.test(window.location.hash) ? "casino" : typeof window !== "undefined" && /^#audit\//.test(window.location.hash) ? "audit" : initialTabFromQuery(typeof window !== "undefined" ? window.location.search : "") || "overview"));
  const [perm] = useAdminPermissions(socket);
  const tabs = useMemo(() => visibleTabs(perm.sections), [perm.sections]);
  const can = useCallback((id) => Array.isArray(perm.sections) && perm.sections.includes(id), [perm.sections]);
  // A section taken away while open falls back to Genel Bakış.
  useEffect(() => {
    if (perm.sections && !tabs.some((x) => x.id === tab)) setTab("overview");
  }, [perm.sections, tabs, tab]);
  // 3.2.0: every admin call 403s with ADMIN_2FA_REQUIRED until the app is set up.
  const [admin2faRequired, setAdmin2faRequired] = useAdmin2faGate();
  const [panelEpoch, setPanelEpoch] = useState(0);
  const [dossierUserId, setDossierUserId] = useState(null);
  const [reportAlert, setReportAlert] = useState(null);
  const [presenceTick, setPresenceTick] = useState(0);
  const lastPresenceRefresh = useRef(0);
  const adminLayout = useAdminLayout();
  /** Every section switch goes through here (Kayıt İstatistikleri is a section since 3.1). */
  const selectTab = useCallback((id) => setTab(id), []);
  // Admin Token › "İşlem kaydında gör" opens İşlem kaydı filtered by the token's name.
  const [auditQuery, setAuditQuery] = useState(null);
  useEffect(() => {
    if (tab !== "audit") setAuditQuery(null);
  }, [tab]);
  // Sistem › "Küfür filtresi Moderasyon'a taşındı" opens Moderasyon on İçerik filtreleri.
  const [moderationTab, setModerationTab] = useState(null);
  useEffect(() => {
    if (tab !== "moderation") setModerationTab(null);
  }, [tab]);
  const [feedbackUnread, setFeedbackUnread] = useState(0);
  // Ban / timeout / wallet-freeze shortcuts from the suspicious tab open the existing dossier tools.
  const [dossierIntent, setDossierIntent] = useState(null);
  // Kullanıcı dosyası: "DM inceleme'de aç" / "Sunucu inceleme'de aç" open those pages pre-filtered.
  const [reviewNav, setReviewNav] = useState(null);
  const navigateFromDossier = useCallback(
    (target, params = {}) => {
      if (target === "people" && params.userId) {
        setDossierIntent(null);
        setDossierUserId(params.userId);
        setTab("people");
        return;
      }
      if (target === "dmReview" || target === "serverReview") {
        setReviewNav({ tab: target, query: params.query || "", serverId: params.serverId || "", at: Date.now() });
        setTab(target);
      }
    },
    []
  );
  const permsValue = useMemo(
    () => ({
      can,
      owner: Boolean(perm.owner),
      navigate: (target, params) => {
        if (target !== "people" && !can(target)) return;
        navigateFromDossier(target, params);
      },
    }),
    [can, perm.owner, navigateFromDossier]
  );
  const [openReportCount, setOpenReportCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [userQ, setUserQ] = useState("");
  const [userDetails, setUserDetails] = useState(null);
  const [userSessions, setUserSessions] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [messages, setMessages] = useState([]);
  const [msgQ, setMsgQ] = useState("");
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
  
  // Duyurular: live count for the menu badge (reported by AnnouncementsPage).
  const [announcementsLive, setAnnouncementsLive] = useState(0);
  // Performans: open release regressions (red menu badge), kept fresh by admin:update.
  const [perfAlerts, setPerfAlerts] = useState(0);
  const canPerf = Array.isArray(perm.sections) && perm.sections.includes("perf");
  useEffect(() => {
    if (!canPerf) return undefined;
    let alive = true;
    const load = () =>
      adminFetch("/perf/alerts")
        .then((d) => alive && setPerfAlerts((d?.alerts || []).filter((a) => a.status === "open").length))
        .catch(() => {});
    load();
    const on = (p) => {
      if (p?.type === "perf_alert") load();
    };
    socket?.on?.("admin:update", on);
    return () => {
      alive = false;
      socket?.off?.("admin:update", on);
    };
  }, [canPerf, socket]);

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

  // Member pulse, recently active + newly joined (durable last_seen)
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
      const token = getToken();
      console.log("[ADMIN] Loading users, token:", !!token);
      console.log("[ADMIN] API base:", apiBase());
      
      const res = await adminRawFetch(`${apiBase()}/api/admin/users`, {
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

  const loadMessages = useCallback(async () => {
    const q = msgQ ? `?q=${encodeURIComponent(msgQ)}` : "";
    const d = await adminFetch(`/messages${q}`);
    setMessages(d.messages || []);
  }, [msgQ]);

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

  const canSystem = can("system");
  useEffect(() => {
    if (!canSystem) return;
    adminFetch("/snapshot")
      .then(setSnapshot)
      .catch(() => {});
  }, [canSystem]);

  useEffect(() => {
    if (!socket) return;
    const onSync = (p) => setSnapshot(p);
    const onUp = (p) => {
      setSnapshot((s) => (s ? { ...s, lastEvent: p } : s));
      // Presence changes on every connect / disconnect: at most one Genel Bakis refresh per
      // 10 s, and only while it is open (polish admin-b-19; was two reads per event).
      if (p?.type === "presence") {
        const now = Date.now();
        if (now - lastPresenceRefresh.current >= 10000) {
          lastPresenceRefresh.current = now;
          setPresenceTick((n) => n + 1);
        }
      }
      if (p?.type === "user_report" && can("reports")) {
        loadReportSummary().catch(() => {});
        // Never yank the admin out of what they are doing: offer the dossier instead.
        if (p.autoOpen && p.targetId) setReportAlert({ targetId: p.targetId, openCount: Number(p.openCount) || 0 });
      }
    };
    socket.on("admin:sync", onSync);
    socket.on("admin:update", onUp);
    socket.emit("admin:subscribe");
    return () => {
      socket.off("admin:sync", onSync);
      socket.off("admin:update", onUp);
    };
  }, [socket, loadReportSummary, can]);

  useEffect(() => {
    // Overview owns its own banner. A failed background stats read must not
    // paint a second "bağlantı gecikti" line above the tabs.
    if (!perm.sections) return;
    loadStats().catch(() => {});
    if (can("reports")) loadReportSummary().catch(() => {});
  }, [loadStats, loadReportSummary, perm.sections, can]);

  useEffect(() => {
    if (tab === "system" || tab === "maintenance") {
      loadSystem().catch((e) => setErr(e.message));
    }
  }, [tab, loadAllUsers, loadSystem]);

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

  const shellBadges = { reports: openReportCount, feedback: feedbackUnread, announcements: announcementsLive, perf: perfAlerts };
  const banner = (
    <>
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
      {reportAlert ? (
        <div className="admin-report-alert" role="status" data-testid="admin-report-alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{t("admin.reportAlert", { n: reportAlert.openCount })}</span>
          <button
            type="button"
            className="admin-report-alert-go"
            onClick={() => {
              setDossierUserId(reportAlert.targetId);
              setTab("reports");
              setReportAlert(null);
            }}
          >
            {t("admin.reportAlertOpen")}
          </button>
          <button type="button" className="admin-report-alert-x" aria-label={t("Close")} onClick={() => setReportAlert(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {err && (
        <motion.div className="admin-error" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <AlertTriangle size={16} />
          {err}
        </motion.div>
      )}
    </>
  );
  // Electron: the whole panel is its own window (standalone); elsewhere the scrim + card host it.
  const frame = (node) =>
    standalone ? node : (
      <motion.div
        className={`admin-shell${adminLayout === "phone" ? " is-phone" : ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="admin-container has-adm"
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ type: "spring", damping: 26, stiffness: 300 }}
        >
          {node}
        </motion.div>
      </motion.div>
    );

  return frame(
    <AdminShell
      tabs={tabs}
      current={tab}
      onSelect={selectTab}
      badges={shellBadges}
      layout={adminLayout}
      standalone={standalone}
      onClose={onClose}
      viewer={viewerUsername}
      owner={perm.owner}
      banner={banner}
    >
      <AdminStepUpHost />
      <AdminPermsContext.Provider value={permsValue}>
      <Fragment key={panelEpoch}>
      {admin2faRequired ? (
        <Admin2faGate onReady={() => { setAdmin2faRequired(false); setPanelEpoch((n) => n + 1); }} />
      ) : tab === "feedback" ? (
        <AdminFeedbackV3
          embedded
          socket={socket}
          layout={adminLayout}
          onGoto={(id) => selectTab(tabs.some((x) => x.id === id) ? id : "overview")}
          onClose={onClose}
          onUnread={setFeedbackUnread}
          onOpenProfile={(id) => {
            setDossierUserId(id);
            setTab("people");
          }}
        />
      ) : tab === "signupStats" ? (
        <SignupStatsWindow embedded layout={adminLayout} />
      ) : (
      <div className="admin-body">
        {tab === "shop" && (
          <section className="admin-section admin-section-full">
            <AdminShopDesk />
          </section>
        )}



        {tab === "shop2" && (
          <Suspense fallback={null}>
            <AdminShop2
              socket={socket}
              onOpenUser={(id) => {
                setDossierUserId(id);
                setTab("people");
              }}
              onGoto={selectTab}
            />
          </Suspense>
        )}
        {tab === "livepopup" && <AdminLivePopup socket={socket} viewerUsername={viewerUsername} />}
        {tab === "agent" && (
          <Suspense fallback={null}>
            <AdminAgent
              onOpenUser={(id) => {
                setDossierUserId(id);
                setTab("people");
              }}
              onGoto={selectTab}
            />
          </Suspense>
        )}

        {tab === "staff" && perm.owner && <AdminStaff tabs={TABS} />}

        {tab === "accessBans" && <AccessBansTab />}
        {tab === "appeals" && <AdminAppeals />}

        {tab === "errors" && <ErrorIssuesTab />}
        {tab === "retention" && <RetentionTab />}
        {tab === "economy" && <EconomyTab />}
        {tab === "topUsers" && <AdminTopUsers />}
        {tab === "dmReview" && (
          <AdminDmInbox
            key={reviewNav?.tab === "dmReview" ? reviewNav.at : "dm"}
            initialQuery={reviewNav?.tab === "dmReview" ? reviewNav.query : ""}
          />
        )}
        {tab === "serverReview" && (
          <AdminServerReview
            key={reviewNav?.tab === "serverReview" ? reviewNav.at : "sr"}
            initialQuery={reviewNav?.tab === "serverReview" ? reviewNav.query : ""}
            initialServerId={reviewNav?.tab === "serverReview" ? reviewNav.serverId : ""}
            canBan={can("moderation")}
            onOpenPerson={
              can("people")
                ? (id) => {
                    setDossierUserId(id);
                    setTab("people");
                  }
                : undefined
            }
          />
        )}
        {sectionOfTab(tab) === "premium" && (
          <Suspense fallback={<p className="muted">{t("Loading...")}</p>}>
            <PremiumAdmin page={tab} />
          </Suspense>
        )}

        {/* Duyurular (remake, owner-approved Drafts C + A): announcements/AnnouncementsPage.jsx */}
        {tab === "announcements" && <AnnouncementsPage socket={socket} onLiveCount={setAnnouncementsLive} />}

        {/* Oyunlar / Kredi (owner pick Draft B "Oyuncu çalışma alanı"): games/AdminGames.jsx */}
        {tab === "casino" && <AdminGames socket={socket} />}

        {tab === "moderation" && (
          // Moderasyon İşlem masası (Draft A): the word filter and the flagged queue live inside it.
          <AdminModeration
            socket={socket}
            initialTab={moderationTab}
            onGoto={selectTab}
            onOpenPerson={(id) => {
              if (!id) return;
              setDossierUserId(id);
              setTab("people");
            }}
          />
        )}

        {tab === "overview" && (
          <AdminOverview
            onOpenPerson={setDossierUserId}
            onGoto={selectTab}
            can={can}
            refreshKey={presenceTick}
          />
        )}

        {tab === "directory" && (
          <AdminUserDirectory
            onOpenPerson={(id) => {
              setDossierUserId(id);
              setTab("people");
            }}
          />
        )}

        {tab === "analytics" && <AdminAnalytics />}

        {tab === "people" && (
          <AdminPeople
            selectedUserId={dossierUserId}
            onSelectUser={(id) => {
              setDossierIntent(null);
              setDossierUserId(id);
            }}
            onRefreshInbox={loadReportSummary}
            dossierIntent={dossierIntent}
          />
        )}

        {tab === "suspicious" && (
          <SuspiciousTab
            role="admin"
            onOpenTool={
              !can("people")
                ? undefined
                : (id, intent) => {
                    setDossierUserId(id);
                    setDossierIntent({ intent, at: Date.now() });
                    setTab("people");
                  }
            }
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

        {/* Güvenlik Merkezi (remake, Draft A "Komuta merkezi"): ./security/SecurityCenter.jsx */}
        {tab === "security" && (
          <SecurityCenter
            socket={socket}
            onNavigate={(id) => {
              if (can(id)) setTab(id);
            }}
            onOpenUser={(id) => {
              setDossierIntent(null);
              setDossierUserId(id);
              setTab("people");
            }}
          />
        )}

        {tab === "maintenance" && <MaintenanceTab socket={socket} />}

        {tab === "promo" && <PromoCodesTab />}
        {tab === "specialBadges" && <SpecialBadgesAdminTab />}

        {/* Sistem (owner pick Draft A "Kontrol merkezi"): system/AdminSystem.jsx */}
        {tab === "system" && (
          <AdminSystem
            socket={socket}
            onGoto={(id, opts = {}) => {
              if (id === "moderation" && opts.sub) setModerationTab(opts.sub);
              selectTab(tabs.some((x) => x.id === id) ? id : "overview");
            }}
          />
        )}

        {/* Sunucu Ağı (owner pick Draft A "Kontrol merkezi"): nodes/AdminNodes.jsx */}
        {tab === "nodes" && perm.owner && (
          <AdminNodes
            socket={socket}
            onGoto={(id, opts = {}) => {
              if (id === "audit") setAuditQuery(opts.q ? { q: opts.q, at: Date.now() } : null);
              selectTab(tabs.some((x) => x.id === id) ? id : "overview");
            }}
          />
        )}

        {/* Performans (owner pick Draft A "Konsol"): perf/AdminPerf.jsx */}
        {tab === "perf" && <AdminPerf socket={socket} onGoto={(id) => selectTab(tabs.some((x) => x.id === id) ? id : "overview")} onLiveCount={setPerfAlerts} />}

        {/* İşlem kaydı (owner pick Draft B "Konsol"): audit/AdminAudit.jsx */}
        {tab === "audit" && (
          <AdminAudit
            key={auditQuery?.at || "audit"}
            socket={socket}
            initialQuery={auditQuery?.q ? { q: auditQuery.q } : null}
            onGoto={(id) => selectTab(tabs.some((x) => x.id === id) ? id : "overview")}
          />
        )}

        {/* Admin Token (owner pick Draft B "Liste ve çalışma alanı"): tokens/AdminTokens.jsx */}
        {tab === "adminToken" && perm.owner && (
          <AdminTokens
            socket={socket}
            viewerUsername={viewerUsername}
            onGoto={(id, opts = {}) => {
              if (id === "audit") setAuditQuery(opts.q ? { q: opts.q, at: Date.now() } : null);
              selectTab(tabs.some((x) => x.id === id) ? id : "overview");
            }}
          />
        )}
      </div>
      )}
      </Fragment>
      </AdminPermsContext.Provider>
    </AdminShell>
  );
}
