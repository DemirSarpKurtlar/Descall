/**
 * Yönetici Paneli › Kullanıcı dosyası (remake, owner-approved Draft A, Nov 2026).
 * One page for who the account is: hero (risk, Descall+, status chips, five
 * stat tiles), grouped actions (Moderasyon / Hesap / Veri / Daha fazla), and
 * tabs: Genel bakış, Zaman çizelgesi, Bağlantılı hesaplar, Topluluklar,
 * Etkinlik, Cüzdan ve abonelik, Şikayet ve moderasyon, Notlar.
 * Summary: GET /admin/people/:id/dossier; heavy tabs load on their own
 * (/dossier/<section>). Every action is a dialog from dossier/UserActionDialogs.jsx
 * (ban = BanDialog). Never shows message text or raw IP addresses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Award, Ban, Coins, Crown, Download, Eye, Gamepad2, Gift, Globe, History, Lock, LogOut, Megaphone,
  MessageCircle, MoreHorizontal, RefreshCw, ScrollText, Server, ShieldCheck, Timer, UserGear, UserX, X,
} from "../ui/Icon.jsx";
import UserLens from "./UserLens.jsx";
import { adminFetch } from "../../api/adminHttp";
import { saveJsonFile } from "../../lib/saveFile";
import { getUser } from "../../lib/storage";
import { Avatar } from "../ui/Avatar";
import { SkeletonLine } from "../ui/Skeleton";
import { useLocale } from "../../context/LocaleContext";
import { useAdminPerms } from "./dossier/adminPerms.js";
import DossierMenu from "./dossier/DossierMenu.jsx";
import { UserActionHost } from "./dossier/UserActionDialogs.jsx";
import {
  ActivityCard, ActivityTab, CommunitiesTab, IdentityCard, LinkedTab, ModerationTab, NotesCard, NotesTab, RiskCard,
  SessionsCard, TimelineTab, WalletCard, WalletTab,
} from "./dossier/DossierPanels.jsx";
import { DOSSIER_TABS, actionAllowed, errorKey, moreMenuItems, riskTone } from "./dossier/dossierModel.js";
import { compact, dayWhen, num, shortWhen, voiceText } from "./dossier/dossierFormat.js";
import "../../styles/admin-dossier.css";

const enc = encodeURIComponent;

function sourceLabel(key, t) {
  if (!key) return null;
  const map = {
    google_ads: "admin.googleAds",
    google_organic: "admin.googleOrganic",
    discord: "admin.discord",
    reddit: "admin.reddit",
    youtube: "admin.youtube",
    instagram: "admin.instagram",
    twitter: "admin.twitter",
    referral: "admin.referral",
    direct: "admin.direct",
    other: "admin.other",
  };
  return map[key] ? t(map[key]) : key;
}

const EMPTY_SECTION = Object.freeze({ data: null, error: null, loading: false });

/** One lazily loaded dossier tab; kept until the user or the refresh epoch changes. */
function useLazySection(userId, section, enabled, epoch) {
  const [state, setState] = useState(EMPTY_SECTION);
  const owner = useRef(userId);
  const loaded = useRef("");
  const load = useCallback(async () => {
    if (!userId) return;
    const uid = userId;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await adminFetch(`/people/${enc(uid)}/dossier/${section}`);
      if (owner.current === uid) setState({ data, error: null, loading: false });
    } catch (error) {
      if (owner.current === uid) setState({ data: null, error, loading: false });
    }
  }, [userId, section]);
  useEffect(() => {
    if (owner.current !== userId) {
      owner.current = userId;
      loaded.current = "";
      setState(EMPTY_SECTION);
    }
    const key = `${userId}:${epoch}`;
    if (!enabled || loaded.current === key) return;
    loaded.current = key;
    load();
  }, [enabled, epoch, load, userId]);
  return [state, load];
}

export default function AdminUserDossier({ userId, onRefreshInbox, highlightReportId = null, intent = null, onOpenPerson }) {
  const { t, locale } = useLocale();
  const perms = useAdminPerms();
  const can = perms.can;
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("overview");
  const [action, setAction] = useState(null);
  const [lensOpen, setLensOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notes, setNotes] = useState({ ready: null, list: [], error: "" });
  const moreRef = useRef(null);
  const usedIntent = useRef(null);
  const toastTimer = useRef(null);
  const me = getUser()?.id || null;

  const say = useCallback((text, tone = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch(`/people/${enc(userId)}/dossier`);
      setDossier(data);
      setNotes((n) => ({ ...n, ready: data?.notes?.ready ?? null, list: data?.notes?.ready === false ? [] : n.list.length && n.userId === userId ? n.list : data?.notes?.latest || [], userId }));
    } catch (err) {
      setError(err.message || t("admin.dossierLoadError"));
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    setTab("overview");
    setAction(null);
    setNotes({ ready: null, list: [], error: "" });
    load().catch(() => {});
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    setEpoch((e) => e + 1);
    load().catch(() => {});
  }, [load]);

  // Shortcut from "Şüpheli Davranışlar": open the matching dialog. Nothing runs by itself.
  useEffect(() => {
    if (!intent || !dossier || usedIntent.current === intent.at) return;
    usedIntent.current = intent.at;
    if (intent.intent === "timeout") setAction("timeout");
    if (intent.intent === "ban") setAction("ban");
    if (intent.intent === "freeze") setAction("freeze");
  }, [intent, dossier]);

  const wantTimeline = tab === "timeline";
  const [timeline, loadTimeline] = useLazySection(userId, "timeline", wantTimeline || Boolean(dossier), epoch);
  const [linked, loadLinked] = useLazySection(userId, "linked", tab === "linked", epoch);
  const [communities, loadCommunities] = useLazySection(userId, "communities", tab === "communities", epoch);
  const [activity, loadActivity] = useLazySection(userId, "activity", tab === "activity" || tab === "overview", epoch);
  const [wallet, loadWallet] = useLazySection(userId, "wallet", tab === "wallet", epoch);

  // Full notes list (the summary carries the latest two).
  useEffect(() => {
    if (!userId || !(tab === "notes" || tab === "overview")) return undefined;
    let alive = true;
    adminFetch(`/people/${enc(userId)}/notes`)
      .then((d) => alive && setNotes((n) => ({ ...n, ready: Boolean(d?.ready), list: Array.isArray(d?.notes) ? d.notes : [], userId })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, tab, epoch]);

  const addNote = useCallback(
    async (body) => {
      try {
        const d = await adminFetch(`/people/${enc(userId)}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim() }) });
        setNotes((n) => ({ ...n, ready: true, error: "", list: [d.note, ...n.list] }));
        return true;
      } catch (e) {
        const k = errorKey(e);
        setNotes((n) => ({ ...n, ready: e?.code === "NOTES_UNAVAILABLE" ? false : n.ready, error: k ? t(k) : e?.message || t("dossier.err_generic") }));
        return false;
      }
    },
    [userId, t]
  );
  const deleteNote = useCallback(
    async (note) => {
      try {
        await adminFetch(`/people/${enc(userId)}/notes/${enc(note.id)}`, { method: "DELETE" });
        setNotes((n) => ({ ...n, error: "", list: n.list.filter((x) => x.id !== note.id) }));
      } catch (e) {
        const k = errorKey(e);
        setNotes((n) => ({ ...n, error: k ? t(k) : e?.message || t("dossier.err_generic") }));
      }
    },
    [userId, t]
  );

  const dismissReport = useCallback(
    async (report) => {
      try {
        await adminFetch(`/reports/${enc(report.id)}/dismiss`, { method: "POST", body: "{}" });
        say(t("dossier.done_dismiss"));
        load();
        onRefreshInbox?.();
      } catch (e) {
        say(e?.message || t("dossier.err_generic"), "bad");
      }
    },
    [load, onRefreshInbox, say, t]
  );

  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // KVKK veri dışa aktarma (3.6.0): the same file the account owner gets.
      const data = await adminFetch(`/people/${userId}/export`);
      const day = new Date().toISOString().slice(0, 10);
      await saveJsonFile(t("adminx.dossier.exportFile", { username: data?.account?.username || userId, day }), data);
      say(t("admin.dataExported"));
    } catch (e) {
      say(e?.message || t("dossier.err_generic"), "bad");
    } finally {
      setExporting(false);
    }
  };

  const identity = dossier?.identity || {};
  const stats = dossier?.stats || {};
  const risk = dossier?.risk || { score: 0, level: "low", reasons: [] };
  const mod = dossier?.moderation || {};
  const sub = dossier?.subscription || null;
  const reports = dossier?.reports || { against: [], openCount: 0 };
  const online = identity.presence ? identity.presence.status !== "offline" : null;
  const user = useMemo(
    () => (dossier ? { id: identity.id || userId, username: identity.username, displayName: identity.displayName, avatarUrl: identity.avatarUrl, isAdmin: identity.isAdmin, isOwner: identity.isOwner } : null),
    [dossier, identity.id, identity.username, identity.displayName, identity.avatarUrl, identity.isAdmin, identity.isOwner, userId]
  );

  const open = (id) => {
    setMoreOpen(false);
    if (id === "lens") return setLensOpen(true);
    if (id === "export") return doExport();
    if (id === "dmReview") return perms.navigate?.("dmReview", { query: identity.username || "" });
    if (id === "serverReview") return perms.navigate?.("serverReview", { query: identity.username ? `@${identity.username}` : "" });
    return setAction(id);
  };
  const allowed = (id) => actionAllowed(id, perms) && (id !== "dmReview" && id !== "serverReview" ? true : Boolean(perms.navigate));
  const openPerson = (id) => (onOpenPerson ? onOpenPerson(id) : perms.navigate?.("people", { userId: id }));

  const moreItems = useMemo(() => {
    const meta = {
      gift: { icon: Gift, sub: t("dossier.m_giftSub") },
      premium: { icon: Crown, sub: sub?.active ? t("dossier.m_premiumSubActive") : t("dossier.m_premiumSub") },
      credits: { icon: Gamepad2, sub: t("dossier.m_creditsSub") },
      popup: { icon: Megaphone, sub: online ? t("dossier.m_popupSubOnline") : t("dossier.m_popupSubOffline") },
      dmReview: { icon: MessageCircle, sub: t("dossier.m_dmReviewSub") },
      serverReview: { icon: Server, sub: t("dossier.m_serverReviewSub") },
      accessBan: { icon: Lock, sub: t("dossier.m_accessBanSub") },
      audit: { icon: ScrollText, sub: t("dossier.m_auditSub") },
      untimeout: { icon: Timer, sub: t("dossier.m_untimeoutSub") },
      unban: { icon: ShieldCheck, sub: t("dossier.m_unbanSub") },
      makeAdmin: { icon: UserGear, sub: identity.isAdmin ? t("dossier.m_removeAdminSub") : t("dossier.m_makeAdminSub"), danger: identity.isAdmin },
    };
    return moreMenuItems({ ...perms, identity, moderation: mod })
      .filter((id) => id === "sep" || allowed(id))
      .filter((id, i, arr) => id !== "sep" || (i > 0 && arr[i - 1] !== "sep" && i < arr.length - 1))
      .map((id) =>
        id === "sep"
          ? "sep"
          : {
              id,
              label: id === "makeAdmin" ? (identity.isAdmin ? t("dossier.removeAdmin") : t("dossier.makeAdmin")) : t(`dossier.m_${id}`),
              ...meta[id],
              onSelect: () => open(id),
            }
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms, identity, mod, sub, online, t]);

  if (!userId) return null;

  const tabCount = {
    timeline: timeline.data?.items?.length || null,
    linked: stats.linked || null,
    communities: stats.servers != null || stats.groups != null ? (stats.servers || 0) + (stats.groups || 0) || null : null,
    moderation: reports.openCount || null,
    notes: notes.list.length || dossier?.notes?.count || null,
  };
  const presence = identity.presence?.status || "offline";
  const age = identity.accountAgeDays;

  return (
    <div className="dsr" data-testid="dsr">
      {loading && !dossier ? (
        <div className="dsr-skel" aria-busy="true">
          <div className="dsr-hero">
            <SkeletonLine width={76} height={76} />
            <div style={{ flex: 1 }}>
              <SkeletonLine width="38%" height={22} />
              <SkeletonLine width="62%" height={14} />
            </div>
          </div>
          <div className="dsr-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dsr-card">
                <SkeletonLine width="34%" height={12} />
                <SkeletonLine width="80%" height={14} />
                <SkeletonLine width="56%" height={14} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="dsr-warn is-bad" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" className="dsr-btn is-sm" onClick={() => load()}>
            {t("dossier.retry")}
          </button>
        </div>
      ) : null}

      {dossier ? (
        <>
          <header className="dsr-hero" data-testid="dsr-hero">
            <div className="dsr-av">
              <Avatar name={identity.displayName || identity.username || "?"} size={76} user={{ avatarUrl: identity.avatarUrl, username: identity.username, displayName: identity.displayName }} />
              <span className={`dsr-dot is-${presence}`} title={t(`dossier.presence_${presence}`)} aria-label={t(`dossier.presence_${presence}`)} />
            </div>
            <div className="dsr-hid">
              <div className="dsr-hname">
                <h2>{identity.displayName || identity.username}</h2>
                <span className={`dsr-chip c-${riskTone(risk.level)}`}>{t("dossier.riskChip", { level: t(`dossier.risk_${risk.level}`), score: risk.score })}</span>
                {sub?.active ? <span className="dsr-chip c-blue">{t(`dossier.plan_${sub.plan || "plus"}`)}</span> : null}
                {identity.emailVerified ? <span className="dsr-chip c-gray">{t("dossier.verifiedEmail")}</span> : null}
                {mod.banned ? <span className="dsr-chip c-red">{t("dossier.banned")}</span> : null}
                {mod.timeout ? <span className="dsr-chip c-gold">{t("dossier.timedOut")}</span> : null}
                {dossier.wallet?.frozen ? <span className="dsr-chip c-violet">{t("dossier.walletFrozenChip")}</span> : null}
                {identity.isAdmin ? <span className="dsr-chip c-blue">{t("admin.adminBadge")}</span> : null}
                {identity.pendingDeletion ? <span className="dsr-chip c-red">{t("dossier.pendingDeletion")}</span> : null}
              </div>
              <div className="dsr-hmeta">
                <span>@{identity.username}</span>
                <span>
                  <History size={14} />
                  {age != null
                    ? t("dossier.signupLine", { when: dayWhen(dossier.signup?.at || identity.createdAt, locale), days: num(age, locale) })
                    : dayWhen(identity.createdAt, locale)}
                </span>
                <span>{online ? t("dossier.onlineNow") : t("dossier.lastSeen", { when: identity.lastSeen ? shortWhen(identity.lastSeen, locale) : t("dossier.never") })}</span>
                {dossier.signup?.country || dossier.signup?.firstSource ? (
                  <span>
                    <Globe size={14} />
                    {[dossier.signup?.country, sourceLabel(dossier.signup?.firstSource, t)].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="dsr-stats">
              <button type="button" className="dsr-st" onClick={() => setTab("moderation")}>
                <b className="tnum">{num(stats.openReports, locale)}</b>
                <span>{t("dossier.statReports")}</span>
              </button>
              <button type="button" className="dsr-st" onClick={() => (allowed("sessions") ? setAction("sessions") : null)}>
                <b className="tnum">{num(stats.devices, locale)}</b>
                <span>{t("dossier.statDevices")}</span>
              </button>
              <button type="button" className="dsr-st" onClick={() => setTab("linked")}>
                <b className="tnum">{num(stats.linked, locale)}</b>
                <span>{t("dossier.statLinked")}</span>
              </button>
              <button type="button" className="dsr-st" onClick={() => setTab("activity")}>
                <b className="tnum">{voiceText(stats.voiceSeconds30d, t)}</b>
                <span>{t("dossier.statVoice")}</span>
              </button>
              <button type="button" className="dsr-st" onClick={() => setTab("wallet")}>
                <b className="tnum">{compact(stats.descoin, locale)}</b>
                <span>DesCoin</span>
              </button>
            </div>
          </header>

          <div className="dsr-acts" role="toolbar" aria-label={t("dossier.actions")}>
            {allowed("timeout") || allowed("ban") || allowed("kick") ? (
              <div className="dsr-grp">
                <span className="dsr-gl">{t("dossier.g_moderation")}</span>
                {allowed("timeout") ? (
                  <button type="button" className="dsr-ab is-amber" onClick={() => open(mod.timeout ? "untimeout" : "timeout")}>
                    <Timer size={16} />
                    {mod.timeout ? t("dossier.untimeoutShort") : t("dossier.a_timeout")}
                  </button>
                ) : null}
                {allowed("ban") ? (
                  <button type="button" className="dsr-ab is-red" onClick={() => open(mod.banned ? "unban" : "ban")}>
                    <Ban size={16} />
                    {mod.banned ? t("dossier.unbanShort") : t("dossier.a_ban")}
                  </button>
                ) : null}
                {allowed("kick") ? (
                  <button type="button" className="dsr-ab" onClick={() => open("kick")}>
                    <UserX size={16} />
                    {t("dossier.a_kick")}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="dsr-grp">
              <span className="dsr-gl">{t("dossier.g_account")}</span>
              {allowed("sessions") ? (
                <button type="button" className="dsr-ab" onClick={() => open("sessions")}>
                  <LogOut size={16} />
                  {t("dossier.a_sessions")}
                </button>
              ) : null}
              {allowed("wallet") || allowed("freeze") ? (
                <button type="button" className="dsr-ab is-violet" onClick={() => open(allowed("wallet") ? "wallet" : "freeze")}>
                  <Coins size={16} />
                  {t("dossier.a_wallet")}
                </button>
              ) : null}
              {allowed("badges") ? (
                <button type="button" className="dsr-ab" onClick={() => open("badges")}>
                  <Award size={16} />
                  {t("dossier.a_badge")}
                </button>
              ) : null}
            </div>
            <div className="dsr-grp">
              <span className="dsr-gl">{t("dossier.g_data")}</span>
              <button type="button" className="dsr-ab is-blue" onClick={() => open("lens")}>
                <Eye size={16} />
                {t("dossier.a_lens")}
              </button>
              <button type="button" className="dsr-ab" onClick={() => open("export")} disabled={exporting}>
                <Download size={16} />
                {t("dossier.a_export")}
              </button>
            </div>
            <div className="dsr-acts-end">
              {moreItems.length ? (
                <button
                  type="button"
                  ref={moreRef}
                  className={`dsr-ab is-more${moreOpen ? " is-open" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                  data-testid="dsr-more"
                >
                  <MoreHorizontal size={16} />
                  {t("dossier.more")}
                </button>
              ) : null}
              <button type="button" className="dsr-ab is-icon" onClick={refresh} aria-label={t("common.refresh")} title={t("common.refresh")}>
                <RefreshCw size={16} className={loading ? "spin" : ""} />
              </button>
            </div>
          </div>
          <DossierMenu open={moreOpen} anchorRef={moreRef} onClose={() => setMoreOpen(false)} items={moreItems} label={t("dossier.more")} testId="dsr-more-menu" />

          <nav className="dsr-tabs" role="tablist" aria-label={t("dossier.title")}>
            {DOSSIER_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`dsr-tab${tab === id ? " is-on" : ""}`}
                onClick={() => setTab(id)}
                data-testid={`dsr-tab-${id}`}
              >
                {t(`dossier.tab_${id}`)}
                {tabCount[id] ? <em className={`tnum${id === "moderation" ? " is-red" : ""}`}>{num(tabCount[id], locale)}</em> : null}
              </button>
            ))}
          </nav>

          {tab === "overview" ? (
            <div className="dsr-grid" data-testid="dsr-overview">
              <RiskCard risk={risk} />
              <SessionsCard sessions={dossier.sessions} onManage={allowed("sessions") ? () => open("sessions") : null} />
              <NotesCard notes={notes} onAll={() => setTab("notes")} onAdd={addNote} />
              <IdentityCard dossier={dossier} sourceLabel={(k) => sourceLabel(k, t)} />
              <ActivityCard activity={activity} onMore={() => setTab("activity")} />
              <WalletCard dossier={dossier} />
            </div>
          ) : null}
          {tab === "timeline" ? <TimelineTab section={timeline} onRetry={loadTimeline} /> : null}
          {tab === "linked" ? <LinkedTab section={linked} onRetry={loadLinked} onOpenPerson={openPerson} onAction={open} canAccessBan={allowed("accessBan")} /> : null}
          {tab === "communities" ? (
            <CommunitiesTab
              section={communities}
              onRetry={loadCommunities}
              canServerReview={allowed("serverReview")}
              onOpenServer={(s) => perms.navigate?.("serverReview", { query: s.name || "", serverId: s.id })}
            />
          ) : null}
          {tab === "activity" ? <ActivityTab section={activity} onRetry={loadActivity} /> : null}
          {tab === "wallet" ? <WalletTab section={wallet} onRetry={loadWallet} onAction={open} can={can} /> : null}
          {tab === "moderation" ? <ModerationTab dossier={dossier} highlightReportId={highlightReportId} onAction={open} onDismiss={dismissReport} can={can} /> : null}
          {tab === "notes" ? <NotesTab notes={notes} me={me} onAdd={addNote} onDelete={deleteNote} /> : null}
        </>
      ) : null}

      {toast ? (
        <div className={`dsr-toast${toast.tone === "bad" ? " is-bad" : ""}`} role="status">
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label={t("dossier.close")}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      {lensOpen ? <UserLens userId={userId} onClose={() => setLensOpen(false)} /> : null}
      {user ? (
        <UserActionHost
          action={action}
          user={user}
          can={can}
          context={{
            sessions: dossier.sessions,
            subscription: sub,
            online,
            reportCount: reports.against?.length || 0,
            deviceCount: stats.devices,
            defaultCategory: reports.against?.[0]?.reason,
          }}
          onClose={() => setAction(null)}
          onDone={(message, opts) => {
            say(message);
            if (!opts?.keepOpen) setAction(null);
            load();
            setEpoch((e) => e + 1);
            onRefreshInbox?.();
          }}
        />
      ) : null}
    </div>
  );
}
