/**
 * Yönetici Paneli › Canlı popup (remake, owner-approved Draft B "Kontrol merkezi", Nov 2026).
 *
 * Header with the Canlı / Kuyruk / Geçmiş / Şablonlar switch and "Yeni popup";
 * five live counters; the Canlı tab follows one popup live (funnel, seen speed,
 * platform and language split, live event feed, recall, resend to missed) with
 * the queue and the history beside it; the recipient table (filters, search,
 * platform, row menu, CSV, resend selected); the composer drawer (tone, icon,
 * audience rules with a live estimate, auto-close, schedule, OK required,
 * "Düzeldi", button, desktop / phone preview, test to my phone, templates);
 * review with a required audit note; recall with a reason and a typed confirmation.
 * Live updates come from `admin:livepopup` on the admin socket (plus a slow poll).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Plus } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { useAdminPerms } from "../dossier/adminPerms.js";
import BanDialog from "../BanDialog.jsx";
import { livePopupApi } from "./livePopupApi.js";
import { TABS, downloadText, draftFromCampaign, draftFromTemplate, emptyDraft, errorKey, fmtNumber } from "./livePopupModel.js";
import { KpiRow, LiveView } from "./LiveView.jsx";
import RecipientsView from "./RecipientsView.jsx";
import ComposerDrawer from "./ComposerDrawer.jsx";
import { EndDialog, RecallDialog, ResolveDialog, UserHistoryDialog } from "./LiveDialogs.jsx";
import { HistoryView, QueueView, TemplatesView } from "./ListViews.jsx";
import "../../../styles/admin-livepopup.css";

export default function LivePopupPage({ socket = null, viewerUsername = "" }) {
  const { t, locale } = useLocale();
  const perms = useAdminPerms();
  const [tab, setTab] = useState("live");
  const [view, setView] = useState("main"); // main | recipients
  const [overview, setOverview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [templates, setTemplates] = useState({ list: [], persistent: true, loaded: false });
  const [composer, setComposer] = useState(null); // { draft, editId }
  const [dialog, setDialog] = useState(null); // { type, ... }
  const [ban, setBan] = useState(null);
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(0);
  const recipientsReload = useRef(null);

  const say = useCallback((text, tone = "ok") => {
    setToast({ text, tone, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const errText = useCallback((err) => {
    const key = errorKey(err);
    return key ? t(key) : err?.message || t("livePopup.err.generic");
  }, [t]);

  const liveId = selectedId || overview?.live?.[0]?.id || null;

  const loadOverview = useCallback(async () => {
    try {
      const data = await livePopupApi.overview();
      setOverview(data);
      setLoadError("");
    } catch (err) {
      setLoadError(err?.message || "error");
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      const data = await livePopupApi.detail(id);
      setDetail(data);
      setDetailError("");
    } catch (err) {
      setDetailError(err?.message || "error");
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await livePopupApi.templates();
      setTemplates({ list: data.templates || [], persistent: data.persistent !== false, loaded: true });
    } catch {
      setTemplates((s) => ({ ...s, loaded: true }));
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadTemplates();
  }, [loadOverview, loadTemplates]);

  useEffect(() => {
    if (detail?.campaign?.id !== liveId) setDetail(null);
    loadDetail(liveId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId, loadDetail]);

  // Live: admin socket pings (throttled) + a slow poll while the tab is visible + a clock for "4 dk önce".
  const refreshRef = useRef(null);
  refreshRef.current = () => {
    loadOverview();
    if (liveId) loadDetail(liveId);
    recipientsReload.current?.();
  };
  useEffect(() => {
    let timer = null;
    let last = 0;
    const ping = () => {
      const now = Date.now();
      const wait = Math.max(0, 1500 - (now - last));
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = null;
        last = Date.now();
        refreshRef.current?.();
      }, wait);
    };
    socket?.on?.("admin:livepopup", ping);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshRef.current?.();
    }, 15000);
    const clock = window.setInterval(() => setTick((n) => n + 1), 10000);
    return () => {
      socket?.off?.("admin:livepopup", ping);
      window.clearInterval(poll);
      window.clearInterval(clock);
      if (timer) window.clearTimeout(timer);
    };
  }, [socket]);

  const openComposer = useCallback((draft = emptyDraft(), editId = null) => setComposer({ draft, editId }), []);
  const openCampaign = useCallback((id) => {
    setSelectedId(id);
    setTab("live");
    setView("main");
  }, []);

  const campaign = detail?.campaign?.id === liveId ? detail.campaign : null;
  const stats = detail?.campaign?.id === liveId ? detail.stats : null;

  const actions = useMemo(
    () => ({
      recall: () => campaign && setDialog({ type: "recall", campaign, stats }),
      resend: async () => {
        if (!campaign) return;
        try {
          const out = await livePopupApi.resend(campaign.id);
          say(t("livePopup.resent", { sent: out.sent, queued: out.queued }));
          refreshRef.current?.();
        } catch (err) {
          say(errText(err), "bad");
        }
      },
      recipients: () => setView("recipients"),
      duplicate: () => campaign && openComposer(draftFromCampaign(campaign)),
      resolve: () => campaign && setDialog({ type: "resolve", campaign, stats }),
      end: () => campaign && setDialog({ type: "end", campaign }),
      csv: async (id = campaign?.id) => {
        if (!id) return;
        try {
          const out = await livePopupApi.exportCsv(id);
          downloadText(out.filename || "popup.csv", out.csv);
        } catch (err) {
          say(errText(err), "bad");
        }
      },
      openUser: (userId) => perms.navigate?.("people", { userId }),
      userHistory: (row) => setDialog({ type: "userHistory", row }),
      ban: (row) => setBan({ id: row.userId, username: row.username, avatarUrl: row.avatarUrl }),
      exempt: async (row) => {
        try {
          await livePopupApi.exempt(row.userId, !row.exempt);
          say(t(row.exempt ? "livePopup.unexempted" : "livePopup.exempted", { user: row.username }));
          recipientsReload.current?.();
        } catch (err) {
          say(errText(err), "bad");
        }
      },
      resendTo: async (ids) => {
        if (!campaign || !ids.length) return;
        try {
          const out = await livePopupApi.resend(campaign.id, ids);
          say(t("livePopup.resent", { sent: out.sent, queued: out.queued }));
          refreshRef.current?.();
          return true;
        } catch (err) {
          say(errText(err), "bad");
          return false;
        }
      },
    }),
    [campaign, stats, say, t, errText, openComposer, perms]
  );

  const queueCount = overview?.queue?.length || 0;
  const tabItems = TABS.map((id) => ({ id, label: id === "queue" && queueCount ? `${t("livePopup.tabs.queue")} · ${fmtNumber(queueCount, locale)}` : t(`livePopup.tabs.${id}`) }));

  const header =
    view === "recipients" && campaign ? null : (
      <header className="lp-hdr">
        <span className="lp-hdr-ic" aria-hidden="true">
          <BellRing size={22} />
        </span>
        <div className="lp-hdr-txt">
          <h1>{t("livePopup.title")}</h1>
          <p>{t("livePopup.subtitle")}</p>
        </div>
        <span className="lp-sp" />
        <div className="lp-seg lp-tabs" role="tablist" aria-label={t("livePopup.title")}>
          {tabItems.map((it) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={tab === it.id}
              className={tab === it.id ? "is-on" : ""}
              onClick={() => {
                setTab(it.id);
                setView("main");
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
        <button type="button" className="lp-btn is-primary" onClick={() => openComposer()} data-testid="lp-new">
          <Plus size={16} />
          {t("livePopup.newPopup")}
        </button>
      </header>
    );

  return (
    <section className="lp" data-testid="live-popup" data-tick={tick}>
      {header}
      {loadError && !overview ? (
        <div className="lp-card lp-error" role="alert">
          <p>{t("livePopup.loadError")}</p>
          <button type="button" className="lp-btn" onClick={loadOverview}>
            {t("livePopup.retry")}
          </button>
        </div>
      ) : null}
      {overview && overview.persistent === false ? <p className="lp-warnline">{t("livePopup.memoryOnly")}</p> : null}

      {view === "recipients" && campaign ? (
        <RecipientsView
          campaign={campaign}
          reloadRef={recipientsReload}
          onBack={() => setView("main")}
          actions={actions}
          canBan={perms.can?.("moderation") !== false}
          canDossier={Boolean(perms.navigate)}
          errText={errText}
        />
      ) : (
        <>
          <KpiRow kpis={overview?.kpis} loading={!overview} />
          {tab === "live" ? (
            <LiveView
              overview={overview}
              campaign={campaign}
              stats={stats}
              loading={Boolean(liveId) && !campaign && !detailError}
              detailError={detailError}
              onRetry={() => loadDetail(liveId)}
              actions={actions}
              onOpenCampaign={openCampaign}
              onTab={setTab}
              onNew={() => openComposer()}
            />
          ) : null}
          {tab === "queue" ? (
            <QueueView
              overview={overview}
              onEdit={(c) => openComposer(draftFromCampaign(c, { keepSchedule: true }), c.id)}
              onChanged={loadOverview}
              say={say}
              errText={errText}
            />
          ) : null}
          {tab === "history" ? <HistoryView onOpen={openCampaign} onCsv={(id) => actions.csv(id)} /> : null}
          {tab === "templates" ? (
            <TemplatesView
              templates={templates}
              onUse={(tpl) => openComposer(draftFromTemplate(tpl, t))}
              onChanged={loadTemplates}
              say={say}
              errText={errText}
            />
          ) : null}
        </>
      )}

      <ComposerDrawer
        open={Boolean(composer)}
        initial={composer?.draft}
        editId={composer?.editId || null}
        viewerUsername={viewerUsername}
        templates={templates}
        connected={overview?.kpis?.connected || 0}
        voiceAvailable={overview?.voiceAvailable !== false}
        onClose={() => setComposer(null)}
        onSent={(out) => {
          setComposer(null);
          say(out.message);
          loadOverview();
          if (out.id && out.status === "live") openCampaign(out.id);
          if (out.status === "scheduled") setTab("queue");
        }}
        onTemplatesChanged={loadTemplates}
        errText={errText}
      />

      <RecallDialog
        open={dialog?.type === "recall"}
        campaign={dialog?.campaign}
        stats={dialog?.stats}
        onClose={() => setDialog(null)}
        onDone={(out) => {
          setDialog(null);
          say(t("livePopup.recall.done", { n: out.closed }));
          refreshRef.current?.();
          if (out.followUp) openCampaign(out.followUp);
        }}
        errText={errText}
      />
      <ResolveDialog
        open={dialog?.type === "resolve"}
        campaign={dialog?.campaign}
        stats={dialog?.stats}
        onClose={() => setDialog(null)}
        onDone={(out) => {
          setDialog(null);
          say(t("livePopup.resolve.done"));
          refreshRef.current?.();
          if (out.followUp) openCampaign(out.followUp);
        }}
        errText={errText}
      />
      <EndDialog
        open={dialog?.type === "end"}
        campaign={dialog?.campaign}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          say(t("livePopup.end.done"));
          refreshRef.current?.();
        }}
        errText={errText}
      />
      <UserHistoryDialog open={dialog?.type === "userHistory"} row={dialog?.row} onClose={() => setDialog(null)} onOpen={(id) => { setDialog(null); openCampaign(id); }} />

      <BanDialog
        open={Boolean(ban)}
        target={ban}
        onClose={() => setBan(null)}
        onBanned={() => {
          setBan(null);
          recipientsReload.current?.();
        }}
      />

      {toast ? (
        <div className={`lp-toast is-${toast.tone}`} role={toast.tone === "bad" ? "alert" : "status"} key={toast.at}>
          {toast.text}
        </div>
      ) : null}
    </section>
  );
}
