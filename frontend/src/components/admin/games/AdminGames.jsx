/**
 * Yönetici Paneli › Oyunlar / Kredi (section casino). Owner pick: Draft B
 * "Oyuncu çalışma alanı" (scratchpad games-drafts B1 / B2 / B3), built one to one:
 *   Oyuncular   player list + workspace (balance chart, per game, credit ledger
 *               with the running balance, "Daha fazla" menu, hand history drawer
 *               with the card replay, personal limits with the bot preview)
 *   İstatistik  KPIs, circulation over time, anomalies, per-game stats,
 *               leaderboard (hide), latest hands
 *   Kurallar    the fixed game rules
 * Game credits are points only: never money, never DesCoin, never convertible.
 * Server: routes/adminCasino.js (every change audited, step-up code, admin room).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { Ban, Download, EyeOff, Eye, Send, Undo2 } from "../../ui/Icon.jsx";
import BanDialog from "../BanDialog.jsx";
import { useAdminPerms } from "../dossier/adminPerms.js";
import { CreditDialog, LimitsDialog, NoteDialog, ReasonDialog, errorText } from "./GamesDialogs.jsx";
import HistoryDrawer from "./HistoryDrawer.jsx";
import { PlayerList, Workspace } from "./PlayersView.jsx";
import { RulesView, StatsView } from "./StatsView.jsx";
import { Seg, downloadCsv } from "./GamesUi.jsx";
import { parseHandLink, qs } from "./gamesModel.js";
import "../../../styles/admin-games.css";

const LIST_LIMIT = 300;

export default function AdminGames({ socket }) {
  const { t, locale } = useLocale();
  const { can } = useAdminPerms();
  const canBan = can("moderation");
  const [tab, setTab] = useState("players");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("balance");
  const [list, setList] = useState({ loading: true, players: [], counts: {}, total: 0, err: "" });
  const [selectedId, setSelectedId] = useState(null);
  const [ws, setWs] = useState({ loading: false, data: null, err: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialog, setDialog] = useState(null); // credit | limits | history | note | reason | ban
  const [limitsPreset, setLimitsPreset] = useState(null);
  const [reason, setReason] = useState(null);
  const [focusHand, setFocusHand] = useState(null);
  const [stats, setStats] = useState({ loading: false, data: null, err: "" });
  const [statDays, setStatDays] = useState(30);
  const [rules, setRules] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const searchRef = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;

  const notify = useCallback((text, tone = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const loadList = useCallback(async () => {
    setList((s) => ({ ...s, loading: true, err: "" }));
    try {
      const r = await adminFetch(`/credits/players${qs({ q: debounced, filter, sort, limit: LIST_LIMIT })}`);
      setList({ loading: false, players: r.players || [], counts: r.counts || {}, total: r.total || 0, err: "", ready: r.ready });
      setSelectedId((cur) => cur || (typeof window !== "undefined" && window.innerWidth < 900 ? null : r.players?.[0]?.id) || null);
    } catch (e) {
      setList((s) => ({ ...s, loading: false, err: errorText(t, e) }));
    }
  }, [debounced, filter, sort, t]);
  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadWs = useCallback(
    async (id, { quiet = false } = {}) => {
      if (!id) return;
      if (!quiet) setWs((s) => ({ loading: true, data: s.data?.player?.id === id ? s.data : null, err: "" }));
      try {
        const data = await adminFetch(`/credits/players/${id}`);
        if (selectedRef.current === id) setWs({ loading: false, data, err: "" });
      } catch (e) {
        if (selectedRef.current === id) setWs({ loading: false, data: null, err: errorText(t, e) });
      }
    },
    [t]
  );
  useEffect(() => {
    if (selectedId) loadWs(selectedId);
  }, [selectedId, loadWs]);

  const refreshAll = useCallback(() => {
    if (selectedRef.current) loadWs(selectedRef.current, { quiet: true });
    setRefreshKey((k) => k + 1);
    loadList();
  }, [loadWs, loadList]);

  // Ctrl / Cmd K focuses the player search.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k" && tab === "players") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  // "El bağlantısını kopyala" links: #games/<userId>/<handId>.
  useEffect(() => {
    const link = parseHandLink(typeof window !== "undefined" ? window.location.hash : "");
    if (!link) return;
    setTab("players");
    setSelectedId(link.userId);
    if (link.handId) {
      setFocusHand(link.handId);
      setDialog("history");
    }
  }, []);

  // Live: another admin changed a wallet / limits / note.
  useEffect(() => {
    if (!socket) return undefined;
    const onUpdate = (p) => {
      const type = String(p?.type || "");
      if (!type.startsWith("casino_") && type !== "user_note") return;
      if (p.userId && p.userId === selectedRef.current) {
        loadWs(p.userId, { quiet: true });
        setRefreshKey((k) => k + 1);
      }
      loadList();
    };
    socket.on("admin:update", onUpdate);
    return () => socket.off("admin:update", onUpdate);
  }, [socket, loadWs, loadList]);

  const loadStats = useCallback(async () => {
    setStats((s) => ({ ...s, loading: true, err: "" }));
    try {
      const data = await adminFetch(`/credits/overview${qs({ days: statDays })}`);
      setStats({ loading: false, data, err: "" });
    } catch (e) {
      setStats({ loading: false, data: null, err: errorText(t, e) });
    }
  }, [statDays, t]);
  useEffect(() => {
    if (tab === "stats") loadStats();
    if (tab === "rules" && !rules) adminFetch("/credits/rules").then(setRules).catch((e) => notify(errorText(t, e), "error"));
  }, [tab, loadStats, rules, notify, t]);

  const data = ws.data;
  const player = data ? { ...data.player, flags: data.flags } : null;

  const exportPlayers = async () => {
    try {
      const r = await adminFetch(`/credits/players/export${qs({ q: debounced, filter, sort })}`);
      downloadCsv(r.filename, r.csv);
      notify(t("gamesAdmin.toast.exported", { n: formatNumber(r.rows, locale) }));
    } catch (e) {
      notify(errorText(t, e), "error");
    }
  };

  const exportLedger = async () => {
    try {
      const r = await adminFetch(`/credits/players/${selectedId}/ledger/export`);
      downloadCsv(r.filename, r.csv);
      notify(t("gamesAdmin.toast.exported", { n: formatNumber(r.rows, locale) }));
    } catch (e) {
      notify(errorText(t, e), "error");
    }
  };

  const patchFlags = (userId, body) => adminFetch(`/credits/players/${userId}/flags`, { method: "PATCH", body: JSON.stringify(body) });

  const openReason = (kind, target) => {
    const user = target || player;
    if (!user) return;
    const handle = `@${user.username || "?"}`;
    const configs = {
      hide: {
        icon: EyeOff,
        tone: "gray",
        title: t("gamesAdmin.menu.hide"),
        subtitle: t("gamesAdmin.reason.hideSub", { user: handle }),
        confirmLabel: t("gamesAdmin.menu.hide"),
        run: (r) => patchFlags(user.id, { leaderboardHidden: true, reason: r }),
        done: t("gamesAdmin.toast.hidden", { user: handle }),
      },
      show: {
        icon: Eye,
        tone: "blue",
        title: t("gamesAdmin.menu.show"),
        subtitle: t("gamesAdmin.reason.showSub", { user: handle }),
        confirmLabel: t("gamesAdmin.menu.show"),
        run: (r) => patchFlags(user.id, { leaderboardHidden: false, reason: r }),
        done: t("gamesAdmin.toast.shown", { user: handle }),
      },
      transfersOff: {
        icon: Send,
        tone: "violet",
        title: t("gamesAdmin.menu.transfersOff"),
        subtitle: t("gamesAdmin.reason.transfersOffSub", { user: handle }),
        confirmLabel: t("gamesAdmin.menu.transfersOff"),
        run: (r) => patchFlags(user.id, { transfersEnabled: false, reason: r }),
        done: t("gamesAdmin.toast.transfersOff", { user: handle }),
      },
      transfersOn: {
        icon: Send,
        tone: "blue",
        title: t("gamesAdmin.menu.transfersOn"),
        subtitle: t("gamesAdmin.reason.transfersOnSub", { user: handle }),
        confirmLabel: t("gamesAdmin.menu.transfersOn"),
        run: (r) => patchFlags(user.id, { transfersEnabled: true, reason: r }),
        done: t("gamesAdmin.toast.transfersOn", { user: handle }),
      },
      reset: {
        icon: Undo2,
        tone: "red",
        danger: true,
        withNotify: true,
        title: t("gamesAdmin.menu.reset"),
        subtitle: t("gamesAdmin.reason.resetSub", { user: handle }),
        body: <div className="agm-warn">{t("gamesAdmin.reason.resetWarn")}</div>,
        confirmLabel: t("gamesAdmin.reason.resetOk"),
        run: (r, n) => adminFetch(`/credits/players/${user.id}/reset`, { method: "POST", body: JSON.stringify({ reason: r, notify: n }) }),
        done: t("gamesAdmin.toast.reset", { user: handle }),
      },
    };
    setReason({ kind, userId: user.id, ...configs[kind] });
    setDialog("reason");
  };

  const onAction = (action) => {
    if (!player) return;
    if (action === "exportLedger") return exportLedger();
    if (["hide", "show", "transfersOff", "transfersOn", "reset"].includes(action)) return openReason(action);
    if (action === "freeze") {
      setLimitsPreset({ freeze: data.flags.frozen ? "none" : "24h" });
      setDialog("limits");
      return;
    }
    if (action === "limits") setLimitsPreset(null);
    if (action === "history") setFocusHand(null);
    if (action === "ban" && !canBan) {
      notify(t("gamesAdmin.err.banPermission"), "error");
      return;
    }
    setDialog(action);
  };

  const closeDialog = () => setDialog(null);
  const crumb = tab === "players" ? t("gamesAdmin.crumbPlayers") : t("gamesAdmin.crumbPoints");

  const toggleHiddenFromBoard = (row) => openReason(row.hidden ? "show" : "hide", row);
  const openPlayer = (id) => {
    setTab("players");
    setSelectedId(id);
  };

  const tabs = useMemo(
    () => [
      { id: "players", label: t("gamesAdmin.tab.players"), testId: "agm-tab-players" },
      { id: "stats", label: t("gamesAdmin.tab.stats"), testId: "agm-tab-stats" },
      { id: "rules", label: t("gamesAdmin.tab.rules"), testId: "agm-tab-rules" },
    ],
    [t]
  );

  return (
    <div className="agm" data-testid="agm">
      <header className="agm-top">
        <div>
          <h1>{t("gamesAdmin.title")}</h1>
          <p className="agm-crumb">{crumb}</p>
        </div>
        <div className="agm-hr">
          <Seg items={tabs} value={tab} onChange={setTab} label={t("gamesAdmin.tab.label")} />
          <button type="button" className="agm-btn agm-btn-lg" onClick={exportPlayers}>
            <Download size={18} />
            {t("gamesAdmin.export")}
          </button>
        </div>
      </header>

      {tab === "players" ? (
        <div className={`agm-split${selectedId ? " has-selection" : ""}`}>
          <PlayerList
            state={list}
            query={query}
            setQuery={setQuery}
            filter={filter}
            setFilter={setFilter}
            sort={sort}
            setSort={setSort}
            selectedId={selectedId}
            onSelect={setSelectedId}
            searchRef={searchRef}
          />
          <Workspace data={data} loading={ws.loading} err={ws.err} players={list.players} refreshKey={refreshKey} onAction={onAction} onBack={() => setSelectedId(null)} showBack onNotify={notify} />
        </div>
      ) : tab === "stats" ? (
        <StatsView data={stats.data} loading={stats.loading} err={stats.err} days={statDays} setDays={setStatDays} onOpenPlayer={openPlayer} onToggleHidden={toggleHiddenFromBoard} />
      ) : (
        <RulesView rules={rules} />
      )}

      {player ? (
        <>
          <CreditDialog
            open={dialog === "credit"}
            onClose={closeDialog}
            player={player}
            balance={data.wallet?.credits ?? 1000}
            stats={data.stats}
            players={list.players}
            onDone={(r) => {
              closeDialog();
              notify(t("gamesAdmin.toast.credits", { user: `@${player.username}`, n: formatNumber(r.newBalance, locale) }));
              refreshAll();
            }}
          />
          <LimitsDialog
            open={dialog === "limits"}
            onClose={closeDialog}
            player={player}
            limits={data.limits}
            preset={limitsPreset}
            onSaved={() => {
              closeDialog();
              notify(t("gamesAdmin.toast.limits", { user: `@${player.username}` }));
              refreshAll();
            }}
          />
          <HistoryDrawer open={dialog === "history"} onClose={closeDialog} player={player} stats={data.stats} focusHandId={focusHand} onNotify={notify} />
          <NoteDialog
            open={dialog === "note"}
            onClose={closeDialog}
            player={player}
            onDone={() => {
              closeDialog();
              notify(t("gamesAdmin.toast.note", { user: `@${player.username}` }));
            }}
          />
          <BanDialog
            open={dialog === "ban"}
            target={{ id: player.id, username: player.username, displayName: player.displayName, avatarUrl: player.avatarUrl, isAdmin: player.isAdmin }}
            onClose={closeDialog}
            onBanned={({ message }) => {
              closeDialog();
              notify(message || t("gamesAdmin.toast.banned", { user: `@${player.username}` }));
              refreshAll();
            }}
          />
        </>
      ) : null}
      <ReasonDialog
        open={dialog === "reason" && Boolean(reason)}
        onClose={closeDialog}
        icon={reason?.icon || Ban}
        tone={reason?.tone}
        title={reason?.title || ""}
        subtitle={reason?.subtitle}
        body={reason?.body}
        danger={reason?.danger}
        withNotify={reason?.withNotify}
        confirmLabel={reason?.confirmLabel || ""}
        testId="agm-reason"
        onSubmit={async (r, n) => {
          await reason.run(r, n);
          closeDialog();
          notify(reason.done);
          refreshAll();
          if (tab === "stats") loadStats();
        }}
      />
      {toast ? (
        <div className={`agm-toast${toast.tone === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
