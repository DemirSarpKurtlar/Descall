/**
 * Yönetici Paneli › Moderasyon (remake, owner-approved Draft A "İşlem masası",
 * Nov 2026). Page head with the Ctrl K user search, five live KPI tiles and four
 * tabs: İşlem uygula (multi-select users, composer, live user preview), Aktif
 * yaptırımlar (board with countdowns, extend, early lift), Geçmiş (filters,
 * daily chart, export, paging) and İçerik filtreleri (flagged queue with
 * context + the word filter, the single source of filter words).
 * Bans always go through BanDialog, one user at a time (bulk = a queue).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Search, RefreshCw, Timer, Ban, Gavel, Flag, AlertTriangle, ChevronRight, X } from "../../ui/Icon.jsx";
import BanDialog from "../BanDialog.jsx";
import { loadModerationMeta, primeModerationMeta } from "../moderationMeta.js";
import { useAdminPerms } from "../dossier/adminPerms.js";
import ActionDesk from "./ActionDesk.jsx";
import SanctionsBoard from "./SanctionsBoard.jsx";
import HistoryTab from "./HistoryTab.jsx";
import ContentFilters from "./ContentFilters.jsx";
import { LiftDialog, RulesDialog } from "./ModDialogs.jsx";
import { ModAvatar } from "./ModParts.jsx";
import { TABS, userFacts } from "./modDeskModel.js";
import "../../../styles/admin-moddesk.css";

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || "");
}

function HeadSearch({ t, onPick }) {
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRows([]);
      return undefined;
    }
    let alive = true;
    setBusy(true);
    const h = setTimeout(() => {
      adminFetch(`/moderation/candidates?q=${encodeURIComponent(term)}`)
        .then((d) => alive && (setRows(d?.users || []), setActive(0)))
        .catch(() => alive && setRows([]))
        .finally(() => alive && setBusy(false));
    }, 220);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [q]);

  const pick = (u) => {
    onPick(u);
    setQ("");
    setRows([]);
    setOpen(false);
  };

  return (
    <div className="mdk-hsearch" ref={boxRef}>
      <label className="mdk-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          placeholder={t("modDesk.head.search")}
          aria-label={t("modDesk.head.search")}
          aria-expanded={open && q.trim().length >= 2}
          aria-controls="mdk-hsearch-list"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              e.currentTarget.blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(rows.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && rows[active]) {
              e.preventDefault();
              pick(rows[active]);
            }
          }}
        />
        <kbd>{isMac() ? "⌘ K" : "Ctrl K"}</kbd>
      </label>
      {open && q.trim().length >= 2 ? (
        <div className="mdk-hsearch-pop" id="mdk-hsearch-list" role="listbox" aria-label={t("modDesk.head.search")}>
          {busy && !rows.length ? <p className="mdk-pop-note">{t("modDesk.loading")}</p> : null}
          {!busy && !rows.length ? <p className="mdk-pop-note">{t("modDesk.pick.noMatch")}</p> : null}
          {rows.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`mdk-pop-row${i === active ? " is-on" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(u)}
            >
              <ModAvatar user={u} size={28} />
              <span>
                <b>{u.displayName || u.username}</b>
                <small>
                  @{u.username} ·{" "}
                  {userFacts(u)
                    .map((f) => t(`modDesk.facts.${f.key}`, { count: f.n }))
                    .join(" · ")}
                </small>
              </span>
              <em>{t("modDesk.head.addToDesk")}</em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ tone, icon: Icon, value, label, link, onLink, loading }) {
  return (
    <div className="mdk-kp">
      <span className={`mdk-ki is-${tone}`} aria-hidden="true">
        <Icon size={17} />
      </span>
      <div>
        <b className="tnum">{loading ? <i className="mdk-skel is-num" /> : value ?? "–"}</b>
        <span>{label}</span>
      </div>
      {link ? (
        <button type="button" className="mdk-lnk" onClick={onLink}>
          {link}
        </button>
      ) : null}
    </div>
  );
}

export default function ModerationDesk({ onGoto, onOpenPerson, socket, initialTab = null }) {
  const { t } = useLocale();
  const perms = useAdminPerms();
  // Sistem › "Küfür filtresi Moderasyon'a taşındı" opens straight on İçerik filtreleri.
  const [tab, setTab] = useState(initialTab || "apply");
  const [summary, setSummary] = useState(null);
  const [summaryErr, setSummaryErr] = useState("");
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState([]);
  const [prefill, setPrefill] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lift, setLift] = useState(null); // sanction item
  const [rulesOpen, setRulesOpen] = useState(false);
  const [banQueue, setBanQueue] = useState(null); // { users, index, category, message, flaggedId }
  const [toast, setToast] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const s = await adminFetch("/moderation/desk");
      setSummary(s);
      setSummaryErr("");
    } catch (e) {
      setSummaryErr(e?.message || t("modDesk.loadError"));
    }
  }, [t]);

  useEffect(() => {
    loadSummary();
    loadModerationMeta()
      .then((m) => {
        setMeta(m);
        primeModerationMeta(m);
      })
      .catch(() => {});
  }, [loadSummary]);

  // Live: every moderation event in the admin room refreshes the numbers and the open tab.
  useEffect(() => {
    if (!socket) return undefined;
    let timer = null;
    const types = new Set(["timeout", "untimeout", "ban", "unban", "kick", "flagged_message", "flagged_decided", "escalation", "sanction_extend", "sanction_message", "word_filter", "mod_templates", "mod_rules", "user_report"]);
    const onUpdate = (p) => {
      if (!p || !types.has(p.type)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        loadSummary();
        setEpoch((n) => n + 1);
      }, 600);
    };
    socket.on("admin:update", onUpdate);
    return () => {
      clearTimeout(timer);
      socket.off("admin:update", onUpdate);
    };
  }, [socket, loadSummary]);

  const refresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setEpoch((n) => n + 1);
    setTimeout(() => setRefreshing(false), 300);
  };

  const showToast = useCallback((text, tone = "green") => {
    setToast({ text, tone, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const h = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(h);
  }, [toast]);

  const changed = useCallback(() => {
    loadSummary();
    setEpoch((n) => n + 1);
  }, [loadSummary]);

  const addToDesk = useCallback((u) => {
    setSelected((cur) => (cur.some((x) => x.id === u.id) ? cur : [...cur, u]));
    setTab("apply");
  }, []);

  /** Sustur / At from elsewhere (queue, board): open the desk with this user and these defaults. */
  const startOnDesk = useCallback((user, opts = {}) => {
    setSelected([user]);
    setPrefill({ ...opts, at: Date.now() });
    setTab("apply");
  }, []);

  const startBan = useCallback((users, opts = {}) => {
    const list = (users || []).filter(Boolean);
    if (!list.length) return;
    setBanQueue({ users: list, index: 0, category: opts.category || null, message: opts.message || "", messageFor: opts.messageFor || null, flaggedId: opts.flaggedId || null, done: 0 });
  }, []);

  const banTarget = banQueue ? banQueue.users[banQueue.index] : null;
  const nextInQueue = banQueue ? banQueue.users[banQueue.index + 1] : null;
  const advanceQueue = useCallback((banned) => {
    setBanQueue((q) => {
      if (!q) return q;
      const done = q.done + (banned ? 1 : 0);
      if (q.index + 1 >= q.users.length) {
        return null;
      }
      return { ...q, index: q.index + 1, done };
    });
  }, []);

  const counts = summary || {};
  const loading = !summary && !summaryErr;
  const tabs = useMemo(
    () => [
      { id: "apply", label: t("modDesk.tab.apply") },
      { id: "active", label: t("modDesk.tab.active"), count: summary ? (counts.activeTimeouts || 0) + (counts.activeBans || 0) : null },
      { id: "history", label: t("modDesk.tab.history") },
      { id: "filters", label: t("modDesk.tab.filters"), count: summary ? counts.flaggedPending || 0 : null, hot: true },
    ],
    [t, summary, counts.activeTimeouts, counts.activeBans, counts.flaggedPending]
  );

  const canAppeals = perms.can ? perms.can("moderation") : true;

  return (
    <section className="mdk" aria-labelledby="mdk-title">
      <header className="mdk-top">
        <div>
          <h1 id="mdk-title">{t("modDesk.title")}</h1>
          <p>{t("modDesk.subtitle")}</p>
        </div>
        <div className="mdk-top-r">
          <HeadSearch t={t} onPick={addToDesk} />
          <button type="button" className="mdk-btn is-head" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "mdk-spin" : ""} aria-hidden="true" />
            {t("modDesk.refresh")}
          </button>
        </div>
      </header>

      {summaryErr ? (
        <div className="mdk-banner is-red" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{summaryErr}</span>
          <button type="button" className="mdk-btn is-xs" onClick={loadSummary}>
            {t("modDesk.retry")}
          </button>
        </div>
      ) : null}

      <div className="mdk-kpis">
        <Kpi tone="am" icon={Timer} value={counts.activeTimeouts} label={t("modDesk.kpi.timeouts")} loading={loading} />
        <Kpi tone="rd" icon={Ban} value={counts.activeBans} label={t("modDesk.kpi.bans")} loading={loading} />
        <Kpi tone="bl" icon={Gavel} value={counts.todayActions} label={t("modDesk.kpi.today")} loading={loading} />
        <Kpi tone="vi" icon={Flag} value={counts.flaggedPending} label={t("modDesk.kpi.flagged")} loading={loading} link={t("modDesk.kpi.review")} onLink={() => setTab("filters")} />
        <Kpi
          tone="gr"
          icon={AlertTriangle}
          value={counts.openAppeals}
          label={t("modDesk.kpi.appeals")}
          loading={loading}
          link={
            canAppeals ? (
              <>
                {t("modDesk.kpi.appealsLink")}
                <ChevronRight size={14} aria-hidden="true" />
              </>
            ) : null
          }
          onLink={() => onGoto?.("appeals")}
        />
      </div>

      <div className="mdk-tabs" role="tablist" aria-label={t("modDesk.title")}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            id={`mdk-tab-${tb.id}`}
            aria-selected={tab === tb.id}
            aria-controls={`mdk-panel-${tb.id}`}
            className={`mdk-tab${tab === tb.id ? " is-on" : ""}`}
            onClick={() => setTab(tb.id)}
            onKeyDown={(e) => {
              const i = TABS.indexOf(tab);
              if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length]);
              if (e.key === "ArrowLeft") setTab(TABS[(i + TABS.length - 1) % TABS.length]);
            }}
          >
            {tb.label}
            {tb.count != null && tb.count > 0 ? <em className={tb.hot ? "is-r" : ""}>{tb.count > 99 ? "99+" : tb.count}</em> : null}
          </button>
        ))}
      </div>

      <div className="mdk-panel" role="tabpanel" id={`mdk-panel-${tab}`} aria-labelledby={`mdk-tab-${tab}`}>
        {tab === "apply" ? (
          <ActionDesk
            meta={meta}
            selected={selected}
            setSelected={setSelected}
            prefill={prefill}
            summary={summary}
            epoch={epoch}
            onChanged={changed}
            onToast={showToast}
            onBan={startBan}
            onLift={setLift}
            onShowAll={() => setTab("active")}
            onOpenRules={() => setRulesOpen(true)}
          />
        ) : null}
        {tab === "active" ? (
          <SanctionsBoard
            meta={meta}
            epoch={epoch}
            onChanged={changed}
            onToast={showToast}
            onLift={setLift}
            onBan={startBan}
            onOpenPerson={onOpenPerson}
          />
        ) : null}
        {tab === "history" ? <HistoryTab meta={meta} epoch={epoch} onToast={showToast} onOpenPerson={onOpenPerson} /> : null}
        {tab === "filters" ? (
          <ContentFilters
            meta={meta}
            epoch={epoch}
            summary={summary}
            onChanged={changed}
            onToast={showToast}
            onTimeout={(user, opts) => startOnDesk(user, { action: "timeout", ...opts })}
            onBan={startBan}
          />
        ) : null}
      </div>

      <LiftDialog
        item={lift}
        meta={meta}
        onClose={() => setLift(null)}
        onDone={(msg) => {
          setLift(null);
          showToast(msg);
          changed();
        }}
      />
      <RulesDialog open={rulesOpen} meta={meta} onClose={() => setRulesOpen(false)} onSaved={(msg) => showToast(msg)} />

      {banQueue && banQueue.users.length > 1 && typeof document !== "undefined" ? createPortal(
        <div className="mdk-queue" role="status" aria-live="polite">
          <span>
            {t("modDesk.queue.label", { i: banQueue.index + 1, n: banQueue.users.length })}
            {nextInQueue ? ` · ${t("modDesk.queue.next", { user: `@${nextInQueue.username}` })}` : ""}
          </span>
          <button type="button" onClick={() => advanceQueue(false)}>
            {t("modDesk.queue.skip")}
          </button>
          <button type="button" aria-label={t("modDesk.queue.stop")} onClick={() => setBanQueue(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>,
        document.body
      ) : null}
      <BanDialog
        open={Boolean(banTarget)}
        target={banTarget}
        meta={meta}
        defaultCategory={banQueue?.category || undefined}
        defaultMessage={(banQueue?.messageFor && banTarget ? banQueue.messageFor(banTarget) : banQueue?.message) || undefined}
        onClose={() => {
          // Closing the dialog moves on to the next person; the queue ends after the last one.
          if (banQueue && banQueue.users.length > 1 && banQueue.index + 1 < banQueue.users.length) advanceQueue(false);
          else setBanQueue(null);
        }}
        onBanned={({ message }) => {
          showToast(message, "red");
          const flaggedId = banQueue?.flaggedId;
          if (flaggedId) {
            adminFetch(`/moderation/flagged/${encodeURIComponent(flaggedId)}/decide`, { method: "POST", body: JSON.stringify({ decision: "sanctioned", note: "ban" }) }).catch(() => {});
          }
          setSelected((cur) => cur.filter((u) => u.id !== banTarget?.id));
          changed();
        }}
      />

      {toast && typeof document !== "undefined"
        ? createPortal(
            <div className={`mdk-toast is-${toast.tone}`} role="status" aria-live="polite" key={toast.at}>
              {toast.text}
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
