/**
 * Yönetici Paneli › İşlem kaydı (section audit). Owner pick: Draft B "Konsol"
 * (scratchpad audit-drafts B1 / B2 / B3), built one to one:
 *   B1  query bar with filter tokens, saved views, KPI tiles, per-admin activity
 *       chart, "Kim ne kadar yaptı", the "Olağan dışı" banner, the table and its
 *       right-click menu
 *   B2  the anomaly review (undo the selected, mark reviewed, suspend a section)
 *   B3  "Yeniden yasakla" opens the shared BanDialog, linked to the entry
 * Plus: readable sentences per action, targets resolved to people (Kullanıcı
 * dosyası), relative + local time (UTC in the detail), merged copies, agent
 * bursts as one row, live stream, CSV / JSON export (audited itself), detail
 * drawer with before / after, request facts, notes and undo.
 * Server: routes/adminAuditConsole.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatDate } from "../../../i18n/format.js";
import { copyText } from "../../../lib/copyText.js";
import { Ban, Bell, ChevronDown, Code, Copy, Download, Eye, FileText, SlidersHorizontal, Target, Undo2, User, Users } from "../../ui/Icon.jsx";
import BanDialog from "../BanDialog.jsx";
import { categoryLabel, loadModerationMeta } from "../moderationMeta.js";
import { useAdminPerms } from "../dossier/adminPerms.js";
import AuditQueryBar from "./AuditQueryBar.jsx";
import AuditTable from "./AuditTable.jsx";
import AuditDrawer from "./AuditDrawer.jsx";
import { ActivityChart, AnomalyBanner, KpiRow, Leaderboard, PendingBanner, ViewsRow } from "./AuditOverview.jsx";
import { AnomalyReviewDialog, FiltersDialog, RulesDialog, SaveViewDialog, UndoDialog } from "./AuditDialogs.jsx";
import { AuditMenu } from "./AuditUi.jsx";
import { BUILTIN_VIEWS, entryLink, handle, parseEntryLink, qs, queryToTokens, sameQuery, setToken, targetOf, tokensToQuery } from "./auditModel.js";
import { actionLabel } from "./auditText.js";
import "../../../styles/admin-audit.css";

const PAGE = 60;
const HIDDEN_KEY = "descall.audit.hiddenAlerts";

function readHidden() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(HIDDEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function AdminAudit({ socket, onGoto }) {
  const { t, locale } = useLocale();
  const { can, owner, navigate } = useAdminPerms();
  const [tokens, setTokens] = useState([]);
  const [merge, setMerge] = useState(true);
  const [page, setPage] = useState({ loading: true, more: false, entries: [], users: {}, servers: {}, nextCursor: null, err: "", durable: true });
  const [summary, setSummary] = useState({ loading: true, data: null, err: "" });
  const [live, setLive] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [drawer, setDrawer] = useState(null); // { id, preview }
  const [drawerKey, setDrawerKey] = useState(0);
  const [menu, setMenu] = useState(null); // { entry, point, anchor }
  const [exportOpen, setExportOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // review | undo | saveView | rules | filters | ban
  const [undoEntry, setUndoEntry] = useState(null);
  const [banCtx, setBanCtx] = useState(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [hidden, setHidden] = useState(readHidden);
  const [pendingBusy, setPendingBusy] = useState(null);
  const [modMeta, setModMeta] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const inputRef = useRef(null);
  const exportRef = useRef(null);
  const reqSeq = useRef(0);
  const liveRef = useRef(live);
  liveRef.current = live;

  const query = useMemo(() => tokensToQuery(tokens, { merge }), [tokens, merge]);
  const queryKey = JSON.stringify(query);

  const notify = useCallback((text, tone = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let alive = true;
    loadModerationMeta()
      .then((m) => alive && setModMeta(m))
      .catch(() => {});
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const catLabel = useCallback((id) => categoryLabel(id, modMeta?.categories, t), [modMeta, t]);

  /* ---------------- data ---------------- */

  const loadPage = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      const seq = ++reqSeq.current;
      setPage((p) => ({ ...p, loading: !append, more: append, err: "" }));
      try {
        const d = await adminFetch(`/audit${qs({ ...query, limit: PAGE, cursor })}`);
        if (seq !== reqSeq.current) return;
        setPage((p) => ({
          loading: false,
          more: false,
          err: "",
          durable: d.durable !== false,
          nextCursor: d.nextCursor || null,
          users: { ...(append ? p.users : {}), ...(d.users || {}) },
          servers: { ...(append ? p.servers : {}), ...(d.servers || {}) },
          entries: append ? [...p.entries, ...(d.entries || []).filter((e) => !p.entries.some((x) => x.id === e.id))] : d.entries || [],
        }));
        if (!append) setNewCount(0);
      } catch (e) {
        if (seq !== reqSeq.current) return;
        setPage((p) => ({ ...p, loading: false, more: false, err: e?.message || t("auditLog.table.failed") }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey, t]
  );

  const loadSummary = useCallback(async (fresh = false) => {
    try {
      const d = await adminFetch(`/audit/summary${fresh ? "?fresh=1" : ""}`);
      setSummary({ loading: false, data: d, err: "" });
    } catch (e) {
      setSummary((s) => ({ loading: false, data: s.data, err: e?.message || "" }));
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);
  useEffect(() => {
    loadSummary();
    const id = setInterval(() => loadSummary(), 60000);
    return () => clearInterval(id);
  }, [loadSummary]);

  // Deep link "#audit/<id>" opens that entry.
  useEffect(() => {
    const id = parseEntryLink(typeof window !== "undefined" ? window.location.hash : "");
    if (id) setDrawer({ id, preview: null });
  }, []);

  // Ctrl K / Cmd K focuses the query bar.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Live stream: the server pings the admin room for every new entry.
  const pullTimer = useRef(null);
  const summaryTimer = useRef(null);
  const pullNew = useCallback(async () => {
    const newest = page.entries[0]?.at || null;
    try {
      const d = await adminFetch(`/audit${qs({ ...query, limit: PAGE, after: newest })}`);
      const rows = d.entries || [];
      if (!rows.length) return;
      setPage((p) => {
        // A new copy of an agent run / merged row replaces the older one.
        const keep = p.entries.filter((e) => !rows.some((r) => r.id === e.id));
        return { ...p, users: { ...p.users, ...(d.users || {}) }, servers: { ...p.servers, ...(d.servers || {}) }, entries: [...rows, ...keep].slice(0, 600) };
      });
      setFreshIds((s) => {
        const n = new Set(s);
        for (const r of rows) n.add(r.id);
        return n;
      });
      setTimeout(() => setFreshIds((s) => {
        const n = new Set(s);
        for (const r of rows) n.delete(r.id);
        return n;
      }), 6000);
    } catch {
      /* next ping retries */
    }
  }, [page.entries, query]);
  const pullRef = useRef(pullNew);
  pullRef.current = pullNew;

  useEffect(() => {
    if (!socket) return undefined;
    const onAudit = () => {
      if (liveRef.current) {
        clearTimeout(pullTimer.current);
        pullTimer.current = setTimeout(() => pullRef.current(), 500);
      } else {
        setNewCount((n) => n + 1);
      }
      clearTimeout(summaryTimer.current);
      summaryTimer.current = setTimeout(() => loadSummary(), liveRef.current ? 3000 : 15000);
    };
    const onUpdate = (p) => {
      if (p && ["audit_review", "audit_suspend_request"].includes(p.type)) loadSummary(true);
    };
    socket.on("admin:audit", onAudit);
    socket.on("admin:update", onUpdate);
    return () => {
      socket.off("admin:audit", onAudit);
      socket.off("admin:update", onUpdate);
      clearTimeout(pullTimer.current);
      clearTimeout(summaryTimer.current);
    };
  }, [socket, loadSummary]);

  /* ---------------- derived ---------------- */

  const sum = summary.data;
  const me = sum?.me || null;
  const savedViews = sum?.views || [];
  const allViews = useMemo(() => [...BUILTIN_VIEWS.map((v) => ({ ...v, builtin: true })), ...savedViews], [savedViews]);
  const activeViewId = useMemo(() => {
    const hit = allViews.find((v) => sameQuery(v.query, { ...query, merge: undefined }));
    return hit ? hit.id : null;
  }, [allViews, query]);

  const anomalies = useMemo(() => (sum?.anomalies || []).filter((a) => !hidden.has(a.key)), [sum, hidden]);
  const banner = anomalies.length ? anomalies[Math.min(reviewIdx, anomalies.length - 1)] : null;
  const anomalySeries = useMemo(() => {
    const m = new Map();
    for (const a of sum?.anomalies || []) {
      const ordered = [...(a.targets || [])].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
      ordered.forEach((x, i) => m.set(x.entryId, { index: i + 1, count: ordered.length }));
    }
    return m;
  }, [sum]);
  const undoneMap = useMemo(() => {
    const m = new Map();
    for (const e of page.entries) if (e.meta?.undoOf) m.set(String(e.meta.undoOf), e.actorUsername || "?");
    return m;
  }, [page.entries]);
  const users = useMemo(() => ({ ...(sum?.users || {}), ...page.users }), [sum, page.users]);

  /* ---------------- actions ---------------- */

  const pickView = (id) => {
    const v = allViews.find((x) => x.id === id);
    if (!v) return;
    setTokens(queryToTokens(v.query));
  };

  const drill = (id) => {
    const day = { kind: "range", value: "24h" };
    if (id === "total") setTokens([day]);
    else if (id === "critical") setTokens([day, { kind: "sev", value: ["critical"] }]);
    else if (id === "agent") setTokens([day, { kind: "source", value: "agent" }]);
    else if (id === "denied") setTokens([day, { kind: "cat", value: ["denied"] }]);
    else if (id === "undone") setTokens([day, { kind: "flag", value: "undo" }]);
  };

  const openEntry = (e) => setDrawer({ id: e.id, preview: e });

  const filterTarget = (e) => {
    const tgt = targetOf(e, users, page.servers);
    const value = tgt.kind === "user" && tgt.label ? tgt.label.replace(/^@/, "") : String(e.target);
    setTokens((cur) => setToken(cur, { kind: "target", value }));
    setDrawer(null);
  };

  const setActor = (name) => setTokens((cur) => setToken(cur, { kind: "actor", value: [name] }));

  const copyLink = async (e) => {
    const ok = await copyText(entryLink(window.location.origin, e.id));
    notify(ok ? t("auditLog.menu.copied") : t("auditLog.err.generic"), ok ? "ok" : "error");
  };
  const copyJson = async (e) => {
    const ok = await copyText(JSON.stringify(e, null, 2));
    notify(ok ? t("auditLog.menu.copied") : t("auditLog.err.generic"), ok ? "ok" : "error");
  };

  const openDossier = (userId) => {
    if (!userId) return;
    setDrawer(null);
    navigate?.("people", { userId });
  };

  const startUndo = (e) => {
    setDrawer(null);
    setUndoEntry(e);
    setDialog("undo");
  };

  const startReban = (e, map = users) => {
    const tgt = targetOf(e, map, page.servers);
    const u = tgt.userId ? map[tgt.userId] : null;
    if (!tgt.userId) return;
    setDrawer(null);
    setBanCtx({
      entry: e,
      target: { id: tgt.userId, username: u?.username || tgt.label.replace(/^@/, ""), displayName: u?.displayName || null, avatarUrl: u?.avatarUrl || null, isAdmin: Boolean(u?.isAdmin) },
    });
    setDialog("ban");
  };

  const runExport = async (format) => {
    try {
      const r = await adminFetch(`/audit/export${qs({ ...query, format })}`);
      download(r.filename, r.mime, r.content);
      notify(t("auditLog.export.done", { n: r.rows || 0 }));
      loadPage();
    } catch (e) {
      notify(e?.message || t("auditLog.export.failed"), "error");
    }
  };

  const deleteView = async (v) => {
    try {
      await adminFetch(`/audit/views/${encodeURIComponent(v.id)}`, { method: "DELETE" });
      notify(t("auditLog.views.deleted", { name: v.name }));
      loadSummary(true);
    } catch (e) {
      notify(e?.message || t("auditLog.err.generic"), "error");
    }
  };

  const decidePending = async (p, approve) => {
    setPendingBusy(p.id);
    try {
      await adminFetch(`/audit/reviews/${encodeURIComponent(p.id)}/${approve ? "approve" : "decline"}`, { method: "POST", body: "{}" });
      notify(approve ? t("auditLog.anomaly.approved") : t("auditLog.anomaly.declined"));
      loadSummary(true);
      loadPage();
    } catch (e) {
      notify(e?.message || t("auditLog.err.generic"), "error");
    } finally {
      setPendingBusy(null);
    }
  };

  const hideAnomaly = (a) => {
    setHidden((s) => {
      const n = new Set(s);
      n.add(a.key);
      try {
        sessionStorage.setItem(HIDDEN_KEY, JSON.stringify([...n]));
      } catch {
        /* private mode */
      }
      return n;
    });
    setReviewIdx(0);
  };

  const afterChange = (msg) => {
    setDialog(null);
    setUndoEntry(null);
    notify(msg);
    loadPage();
    loadSummary(true);
    setDrawerKey((k) => k + 1);
  };

  const menuItems = (e) => {
    if (!e) return [];
    const tgt = targetOf(e, users, page.servers);
    const items = [{ id: "open", label: t("auditLog.menu.open"), icon: Eye, kbd: "Enter", onSelect: () => openEntry(e) }];
    if (tgt.label && e.action !== "agent_run") items.push({ id: "related", label: t("auditLog.menu.related", { target: tgt.label }), icon: Target, onSelect: () => filterTarget(e) });
    if (tgt.kind === "user" && tgt.userId && can("people")) items.push({ id: "dossier", label: t("auditLog.menu.dossier"), icon: User, onSelect: () => openDossier(tgt.userId) });
    items.push({ id: "byActor", label: t("auditLog.menu.byActor", { actor: handle(e.actorUsername || "?") }), icon: Users, onSelect: () => setActor(e.action === "agent_run" ? "agent" : e.actorUsername) });
    const danger = [];
    if ((e.action === "unban" || e.action === "appeal_accept") && tgt.userId && can("moderation")) {
      danger.push({ id: "reban", label: t("auditLog.menu.reban"), sub: t("auditLog.menu.rebanSub"), icon: Ban, danger: true, onSelect: () => startReban(e) });
    }
    if (e.undoable && !undoneMap.has(e.id)) danger.push({ id: "undo", label: t("auditLog.menu.undo"), sub: t("auditLog.menu.undoSub"), icon: Undo2, danger: true, onSelect: () => startUndo(e) });
    if (danger.length) items.push("sep", ...danger);
    items.push("sep", { id: "link", label: t("auditLog.menu.copyLink"), icon: Copy, onSelect: () => copyLink(e) }, { id: "json", label: t("auditLog.menu.copyJson"), icon: Code, onSelect: () => copyJson(e) });
    return items;
  };

  const kpis = sum?.kpis || null;

  return (
    <div className="alg" data-testid="audit-console">
      <div className="alg-top">
        <div>
          <h1>{t("auditLog.title")}</h1>
          <p className="alg-crumb">{t("auditLog.crumb")}</p>
        </div>
        <div className="alg-topr">
          <button type="button" className={`alg-live${live ? " is-on" : ""}`} aria-pressed={live} onClick={() => setLive((v) => !v)} title={live ? t("auditLog.live.turnOff") : t("auditLog.live.turnOn")} data-testid="audit-live">
            <span className="alg-pulse" aria-hidden="true" />
            {live ? t("auditLog.live.on") : t("auditLog.live.off")}
          </button>
          <button ref={exportRef} type="button" className="alg-btn" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((v) => !v)} data-testid="audit-export">
            <Download size={18} />
            {t("auditLog.export.button")}
            <ChevronDown size={16} />
          </button>
          <button type="button" className="alg-btn" onClick={() => setDialog("rules")} data-testid="audit-rules-btn">
            <Bell size={18} />
            {t("auditLog.rules.button")}
          </button>
        </div>
      </div>

      <div className="alg-qrow">
        <AuditQueryBar tokens={tokens} onChange={setTokens} admins={sum?.admins || []} t={t} inputRef={inputRef} />
        <button type="button" className="alg-btn alg-filters-btn" onClick={() => setDialog("filters")} data-testid="audit-filters-btn">
          <SlidersHorizontal size={18} />
          {t("auditLog.query.filters")}
        </button>
      </div>

      <ViewsRow
        builtins={BUILTIN_VIEWS}
        saved={savedViews}
        counts={sum?.counts}
        activeId={activeViewId}
        onPick={pickView}
        onSave={() => setDialog("saveView")}
        onDelete={deleteView}
        viewsReady={sum ? sum.viewsReady !== false : true}
        t={t}
        locale={locale}
        me={me?.id}
      />

      <KpiRow kpis={kpis} loading={summary.loading} t={t} locale={locale} onDrill={drill} />

      <div className="alg-bgrid">
        <ActivityChart
          chart={sum?.chart}
          loading={summary.loading}
          users={users}
          t={t}
          locale={locale}
          onPickHour={(at) => {
            const from = new Date(Date.parse(at)).toISOString();
            const to = new Date(Date.parse(at) + 3600e3 - 1).toISOString();
            setTokens((cur) => setToken(cur, { kind: "range", value: "custom", from, to }));
          }}
        />
        <Leaderboard rows={sum?.leaderboard} loading={summary.loading} users={users} t={t} locale={locale} onPick={(name) => setActor(name)} />
      </div>

      <PendingBanner items={sum?.pending} owner={owner} t={t} onDecide={decidePending} busyId={pendingBusy} />

      {banner ? (
        <AnomalyBanner
          anomaly={banner}
          more={anomalies.length - 1}
          t={t}
          locale={locale}
          onReview={() => setDialog("review")}
          onHide={() => hideAnomaly(banner)}
          onNext={() => setReviewIdx((i) => (i + 1) % anomalies.length)}
        />
      ) : null}

      {!page.durable ? <p className="alg-info is-amber">{t("auditLog.notDurable")}</p> : null}

      {newCount > 0 && !live ? (
        <button type="button" className="alg-newp" onClick={() => loadPage()}>
          <ChevronDown size={16} />
          {t("auditLog.live.newRows", { n: newCount })}
        </button>
      ) : null}

      <AuditTable
        entries={page.entries}
        users={users}
        servers={page.servers}
        loading={page.loading}
        err={page.err}
        onRetry={() => loadPage()}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpen={openEntry}
        onMenu={(entry, point) => setMenu({ entry, point })}
        anomalySeries={anomalySeries}
        freshIds={freshIds}
        undoneMap={undoneMap}
        now={now}
        t={t}
        locale={locale}
        catLabel={catLabel}
        onUserClick={(id) => (can("people") ? openDossier(id) : null)}
      />

      {page.entries.length ? (
        <div className="alg-more">
          {page.nextCursor ? (
            <button type="button" className="alg-btn is-ghost" disabled={page.more} onClick={() => loadPage({ append: true, cursor: page.nextCursor })} data-testid="audit-load-more">
              {page.more ? t("auditLog.table.loadingMore") : t("auditLog.table.loadMore")}
            </button>
          ) : (
            <span className="alg-muted alg-small">{t("auditLog.table.end")}</span>
          )}
        </div>
      ) : null}

      <AuditMenu
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        point={menu?.point || null}
        items={menuItems(menu?.entry)}
        label={t("auditLog.menu.label")}
        width={330}
        testId="audit-menu"
      />
      <AuditMenu
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        anchorRef={exportRef}
        width={280}
        label={t("auditLog.export.button")}
        testId="audit-export-menu"
        items={[
          { id: "csv", label: t("auditLog.export.csv"), sub: t("auditLog.export.csvSub"), icon: FileText, onSelect: () => runExport("csv") },
          { id: "json", label: t("auditLog.export.json"), sub: t("auditLog.export.jsonSub"), icon: Code, onSelect: () => runExport("json") },
        ]}
      />

      <AuditDrawer
        entryId={drawer?.id || null}
        preview={drawer?.preview || null}
        reloadKey={drawerKey}
        onClose={() => {
          setDrawer(null);
          if (typeof window !== "undefined" && /^#audit\//.test(window.location.hash)) {
            try {
              window.history.replaceState(null, "", window.location.pathname + window.location.search);
            } catch {
              /* ignore */
            }
          }
        }}
        users={users}
        servers={page.servers}
        now={now}
        t={t}
        locale={locale}
        catLabel={catLabel}
        can={can}
        notify={notify}
        onUndo={(e) => startUndo(e)}
        onReban={(e, map) => startReban(e, map)}
        onDossier={openDossier}
        onFilterTarget={filterTarget}
        onCopyLink={copyLink}
        onCopyJson={copyJson}
      />

      <AnomalyReviewDialog
        anomaly={dialog === "review" ? banner : null}
        onClose={() => setDialog(null)}
        onDone={(msg) => afterChange(msg)}
        t={t}
        locale={locale}
        catLabel={catLabel}
        owner={owner}
        ownerName={sum?.ownerName}
        can={can}
        onGotoStaff={() => {
          setDialog(null);
          onGoto?.("staff");
        }}
      />
      <UndoDialog entry={dialog === "undo" ? undoEntry : null} users={users} servers={page.servers} onClose={() => setDialog(null)} onDone={afterChange} t={t} locale={locale} catLabel={catLabel} now={now} />
      <SaveViewDialog
        open={dialog === "saveView"}
        tokens={tokens}
        query={query}
        onClose={() => setDialog(null)}
        onSaved={(v) => {
          setDialog(null);
          notify(t("auditLog.views.saved", { name: v.name }));
          loadSummary(true);
        }}
        t={t}
      />
      <RulesDialog
        open={dialog === "rules"}
        onClose={() => setDialog(null)}
        onSaved={(msg) => {
          setDialog(null);
          notify(msg);
          loadSummary(true);
        }}
        t={t}
        locale={locale}
      />
      <FiltersDialog
        open={dialog === "filters"}
        tokens={tokens}
        merge={merge}
        admins={sum?.admins || []}
        onClose={() => setDialog(null)}
        onApply={(next, m) => {
          setTokens(next);
          setMerge(m);
          setDialog(null);
        }}
        t={t}
        locale={locale}
      />
      {dialog === "ban" && banCtx ? (
        <BanDialog
          open
          target={banCtx.target}
          onClose={() => {
            setDialog(null);
            setBanCtx(null);
          }}
          onBanned={({ message }) => afterChange(message || t("auditLog.reban.done", { target: handle(banCtx.target.username) }))}
          contextNote={t("auditLog.reban.note", { when: formatDate(banCtx.entry.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: actionLabel(banCtx.entry, t).toLocaleLowerCase(locale) })}
          extraBody={{ auditLink: banCtx.entry.id }}
        />
      ) : null}

      {toast ? (
        <div className={`alg-toast${toast.tone === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

