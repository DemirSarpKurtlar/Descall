/**
 * Yönetici Paneli › Duyurular (remake, owner-approved Drafts C + A, Nov 2026).
 *
 * Header with search (Ctrl K), Pano / Liste switch, "Şablondan oluştur" and
 * "Oluştur"; five summary counters; the publishing board (Draft C: pinned
 * strip, five columns, drag with confirmation) or the list with the inspection
 * panel (Draft A); the composer with live desktop + phone preview and the
 * language step; the template gallery; row menu, delete with a reason (archive
 * by default), take down with a reason, extend, history + restore, CSV export,
 * second-admin approval. Every change is audited on the server; undo toasts
 * follow publish, take down and archive. Live updates: `admin:announcements`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { annApi } from "./announcementsApi.js";
import {
  byColumn,
  downloadText,
  draftFromItem,
  dropAction,
  emptyDraft,
  errorKey,
  filterItems,
  fmtDateTime,
  fmtNumber,
  fmtPct,
  pinnedOrder,
  seenRate,
} from "./announcementsModel.js";
import BoardView, { PinStrip } from "./BoardView.jsx";
import ListView from "./ListView.jsx";
import Inspector from "./Inspector.jsx";
import Composer from "./Composer.jsx";
import TemplateGallery from "./TemplateGallery.jsx";
import { ApproveDialog, ConfirmPopover, DeleteDialog, EndPopover, ExtendDialog, HistoryDialog, SaveTemplateDialog, SchedulePopover } from "./Dialogs.jsx";
import { Drawer, Ic, Menu, Seg, Skeleton } from "./ui.jsx";
import "../../../styles/announcements.css";
import "../../../styles/admin-announcements.css";

const VIEW_KEY = "descall.annc.view";
const SHORTCUT = ["Ctrl", "K"].join(" ");

function KpiRow({ k, locale, t }) {
  const tiles = [
    { id: "live", icon: "megaphone", c: "#587af5", v: fmtNumber(k?.live ?? 0, locale), l: t("annc.kpi.live"), x: k?.liveWeek ? t("annc.kpi.week", { n: k.liveWeek }) : "" },
    { id: "scheduled", icon: "clock", c: "#9b5de5", v: fmtNumber(k?.scheduled ?? 0, locale), l: t("annc.kpi.scheduled"), x: k?.pending ? t("annc.kpi.pending", { n: k.pending }) : "" },
    { id: "drafts", icon: "note", c: "#f2a93b", v: fmtNumber(k?.drafts ?? 0, locale), l: t("annc.kpi.drafts"), x: "" },
    { id: "seen", icon: "eye", c: "#34c77b", v: k?.avgSeen == null ? "—" : fmtPct(k.avgSeen, locale), l: t("annc.kpi.seen"), x: k?.seenDelta ? t(k.seenDelta > 0 ? "annc.kpi.deltaUp" : "annc.kpi.deltaDown", { n: fmtNumber(Math.abs(k.seenDelta), locale) }) : "", down: k?.seenDelta < 0 },
    { id: "click", icon: "click", c: "#22c3a6", v: k?.clickRate == null ? "—" : fmtPct(k.clickRate, locale, 1), l: t("annc.kpi.click"), x: "" },
  ];
  return (
    <div className="an-kpis" data-testid="an-kpis">
      {tiles.map((x) => (
        <div key={x.id} className="an-kp">
          <span className="an-kp-ic" style={{ background: `${x.c}26`, color: x.c }} aria-hidden="true">
            <Ic name={x.icon} size={20} />
          </span>
          <div>
            <b className="tnum">{x.v}</b>
            <span>{x.l}</span>
          </div>
          {x.x ? <small className={x.down ? "is-down" : ""}>{x.x}</small> : null}
        </div>
      ))}
    </div>
  );
}

export default function AnnouncementsPage({ socket = null, onLiveCount = null }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [view, setView] = useState(() => {
    try {
      return window.localStorage?.getItem(VIEW_KEY) === "list" ? "list" : "board";
    } catch {
      return "board";
    }
  });
  const [tab, setTab] = useState("live");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ audience: "all", lang: "all" });
  const [selectedId, setSelectedId] = useState(null);
  const [drawerId, setDrawerId] = useState(null);
  const [composer, setComposer] = useState(null); // { draft, mode, templateLabel }
  const [gallery, setGallery] = useState(false);
  const [dlg, setDlg] = useState(null); // { type, item, anchor, ... }
  const [busy, setBusy] = useState(false);
  const [dlgErr, setDlgErr] = useState("");
  const [menu, setMenu] = useState(null); // { item, anchor }
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [sorts, setSorts] = useState({});
  const [history, setHistory] = useState({ loading: false, list: [] });
  const searchRef = useRef(null);
  const colRefs = useRef({});
  const reloadTimer = useRef(null);

  const say = useCallback((text, tone = "ok", action = null) => setToast({ text, tone, action, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.action ? 7000 : 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const errText = useCallback((e) => {
    const k = errorKey(e);
    return k ? t(k) : e?.message || t("annc.err.generic");
  }, [t]);

  const load = useCallback(async () => {
    try {
      const r = await annApi.overview();
      setData(r);
      setLoadErr("");
      onLiveCount?.(r?.kpis?.live || 0);
    } catch (e) {
      setLoadErr(errText(e));
    }
  }, [errText, onLiveCount]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!socket?.on) return undefined;
    const on = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 500);
    };
    socket.on("admin:announcements", on);
    return () => {
      socket.off?.("admin:announcements", on);
      clearTimeout(reloadTimer.current);
    };
  }, [socket, load]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(VIEW_KEY, view);
    } catch {
      /* storage off */
    }
  }, [view]);

  // Ctrl K / Cmd K: search.
  useEffect(() => {
    const on = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select?.();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const items = useMemo(() => data?.items || [], [data]);
  const filtered = useMemo(() => filterItems(items, { q, ...filters }), [items, q, filters]);
  const cols = useMemo(() => {
    const c = byColumn(filtered);
    for (const [col, mode] of Object.entries(sorts)) {
      if (mode === "seen" && c[col]) c[col] = [...c[col]].sort((a, b) => (seenRate(b) || 0) - (seenRate(a) || 0));
    }
    return c;
  }, [filtered, sorts]);
  const counts = useMemo(() => {
    const c = byColumn(items);
    return { live: c.live.length, scheduled: c.scheduled.length, draft: c.draft.length, pending: c.pending.length, ended: c.ended.length, archived: c.archived.length };
  }, [items]);
  const pinned = useMemo(() => pinnedOrder(items), [items]);
  const byId = useCallback((id) => items.find((i) => i.id === id) || null, [items]);
  const listItems = view === "list" ? cols[tab] || [] : [];
  const selected = byId(selectedId) || (view === "list" ? listItems[0] || null : null);
  const meta = { me: data?.me, translateAvailable: data?.translateAvailable };

  const openCompose = (draft = emptyDraft(), templateLabel = "", mode = "create") => {
    setGallery(false);
    setComposer({ draft, templateLabel, mode });
  };

  const closeDlg = () => {
    if (busy) return;
    setDlg(null);
    setDlgErr("");
  };

  /** Run an API call with the shared busy / error / reload handling. */
  const run = async (fn, { ok, undo, keepDlg = false } = {}) => {
    setBusy(true);
    setDlgErr("");
    try {
      const r = await fn();
      if (!keepDlg) setDlg(null);
      if (ok) say(typeof ok === "function" ? ok(r) : ok, "ok", undo || null);
      await load();
      return r;
    } catch (e) {
      const msg = errText(e);
      if (dlg) setDlgErr(msg);
      else say(msg, "err");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const resultText = (r) => {
    if (r?.result === "pending") return t("annc.toast.pending");
    if (r?.result === "scheduled") return t("annc.toast.scheduled", { when: fmtDateTime(r.item?.startsAt, locale) });
    if (r?.result === "live") return r?.reached != null ? t("annc.toast.liveReached", { n: fmtNumber(r.reached, locale) }) : t("annc.toast.live");
    if (r?.result === "draft") return t("annc.toast.draft");
    if (r?.result === "template") return t("annc.toast.template");
    return t("annc.toast.saved");
  };

  const undoLive = (id) => ({ label: t("annc.toast.recall"), run: () => run(() => annApi.end(id, "mistake", t("annc.toast.recallNote")), { ok: t("annc.toast.recalled") }) });

  async function act(kind, item, extra = {}) {
    if (!item && !["compose"].includes(kind)) return;
    setMenu(null);
    switch (kind) {
      case "open":
        if (view === "board") setDrawerId(item.id);
        else setSelectedId(item.id);
        return;
      case "edit":
        setDrawerId(null);
        openCompose(draftFromItem(item), "", "edit");
        return;
      case "duplicate":
        await run(() => annApi.duplicate(item.id), { ok: t("annc.toast.copied") });
        return;
      case "history": {
        setDlg({ type: "history", item });
        setHistory({ loading: true, list: [] });
        try {
          const r = await annApi.versions(item.id);
          setHistory({ loading: false, list: r.versions || [] });
        } catch (e) {
          setHistory({ loading: false, list: [] });
          setDlgErr(errText(e));
        }
        return;
      }
      case "extend":
        setDlg({ type: "extend", item });
        return;
      case "export":
        await run(async () => {
          const r = await annApi.exportCsv(item.id);
          downloadText(r.filename, r.csv);
          return r;
        }, { ok: t("annc.toast.exported") });
        return;
      case "saveTemplate":
        setDlg({ type: "saveTemplate", item });
        return;
      case "pin":
        await run(() => annApi.pin(item.id, !item.pinned), { ok: item.pinned ? t("annc.toast.unpinned") : t("annc.toast.pinned") });
        return;
      case "archive":
        await run(() => annApi.archive(item.id), { ok: t("annc.toast.archived"), undo: { label: t("annc.toast.undo"), run: () => run(() => annApi.unarchive(item.id), { ok: t("annc.toast.unarchived") }) } });
        return;
      case "unarchive":
        await run(() => annApi.unarchive(item.id), { ok: t("annc.toast.unarchived") });
        return;
      case "delete": {
        setDlg({ type: "delete", item, openSessions: 0 });
        try {
          const r = await annApi.detail(item.id);
          setDlg((d) => (d?.type === "delete" && d.item.id === item.id ? { ...d, openSessions: r.openSessions || 0 } : d));
        } catch {
          /* count is a hint */
        }
        return;
      }
      case "publish":
        await run(() => annApi.publish(item.id, {}), { ok: resultText, undo: item.needsApproval ? null : undoLive(item.id) });
        return;
      case "submit":
        await run(() => annApi.submit(item.id), { ok: t("annc.toast.pending") });
        return;
      case "unschedule":
        await run(() => annApi.unschedule(item.id), { ok: t("annc.toast.unscheduled") });
        return;
      case "approve":
        setDlg({ type: "approve", item });
        return;
      case "end":
        setDlg({ type: "end", item, anchor: extra.anchor || null });
        return;
      case "reopen":
        if (item.endsAt && Date.parse(item.endsAt) <= Date.now()) setDlg({ type: "extend", item });
        else await run(() => annApi.reopen(item.id), { ok: t("annc.toast.reopened") });
        return;
      default:
    }
  }

  const menuItems = (item) => {
    const list = [];
    if (item.status === "draft") list.push({ id: "publish", icon: "send", label: item.needsApproval ? t("annc.composer.sendApproval") : t("annc.composer.publishNow"), sub: item.needsApproval ? t("annc.menu.approvalSub") : null, onSelect: () => act("publish", item) });
    if (item.status === "pending") list.push({ id: "approve", icon: "shield", label: t("annc.appr.review"), onSelect: () => act("approve", item) });
    if (item.status === "scheduled") {
      list.push({ id: "publishNow", icon: "send", label: t("annc.menu.publishNow"), onSelect: () => act("publish", item) });
      list.push({ id: "unschedule", icon: "undo", label: t("annc.menu.unschedule"), onSelect: () => act("unschedule", item) });
    }
    if (item.status === "live") list.push({ id: "end", icon: "archive", label: t("annc.menu.end"), sub: t("annc.menu.endSub"), onSelect: () => act("end", item, { anchor: menu?.anchor }) });
    if (item.status === "ended") list.push({ id: "reopen", icon: "refresh", label: t("annc.menu.reopen"), onSelect: () => act("reopen", item) });
    if (list.length) list.push("sep");
    if (item.status !== "archived") list.push({ id: "edit", icon: "note", label: t("annc.act.edit"), sub: t("annc.menu.editSub"), onSelect: () => act("edit", item) });
    list.push({ id: "copy", icon: "copy", label: t("annc.act.copy"), sub: t("annc.menu.copySub"), onSelect: () => act("duplicate", item) });
    list.push({ id: "history", icon: "history", label: t("annc.menu.history"), sub: t("annc.menu.historySub", { n: Math.max(1, item.version || 1), who: item.versions?.lastBy || item.updatedByName || item.author || "—" }), onSelect: () => act("history", item) });
    if (["live", "scheduled", "ended"].includes(item.status)) list.push({ id: "extend", icon: "timer", label: t("annc.menu.extend"), sub: item.endsAt ? t("annc.menu.extendSub", { when: fmtDateTime(item.endsAt, locale) }) : t("annc.menu.extendNone"), onSelect: () => act("extend", item) });
    if (["live", "ended", "archived"].includes(item.status)) list.push({ id: "export", icon: "chart", label: t("annc.menu.export"), sub: "CSV", onSelect: () => act("export", item) });
    list.push({ id: "tpl", icon: "tpl", label: t("annc.menu.saveTemplate"), onSelect: () => act("saveTemplate", item) });
    if (["live", "scheduled"].includes(item.status)) {
      list.push("sep");
      list.push({ id: "pin", icon: "pin", label: item.pinned ? t("annc.act.unpin") : t("annc.act.pin"), onSelect: () => act("pin", item) });
    }
    list.push("sep");
    if (item.status !== "archived") list.push({ id: "archive", icon: "archive", label: t("annc.menu.archive"), sub: t("annc.menu.archiveSub"), onSelect: () => act("archive", item) });
    else list.push({ id: "unarchive", icon: "undo", label: t("annc.act.unarchive"), onSelect: () => act("unarchive", item) });
    list.push({ id: "delete", icon: "trash", label: t("annc.menu.delete"), sub: t("annc.menu.deleteSub"), danger: true, onSelect: () => act("delete", item) });
    return list;
  };

  /* ---------------- board drop ---------------- */

  const onDrop = (id, to) => {
    const item = byId(id);
    if (!item) return;
    const a = dropAction(item.status, to, { needsApproval: item.needsApproval });
    const anchor = colRefs.current[to];
    if (!a) {
      if (item.status !== to) say(t("annc.board.cantMove", { from: t(`annc.col.${item.status}`), to: t(`annc.col.${to}`) }), "err");
      return;
    }
    if (a === "submit") return run(() => annApi.submit(item.id), { ok: t("annc.toast.pending") });
    if (a === "unschedule") return run(() => annApi.unschedule(item.id), { ok: t("annc.toast.unscheduled") });
    if (a === "approve") return setDlg({ type: "approve", item });
    if (a === "reject") return setDlg({ type: "approve", item });
    if (a === "end") return setDlg({ type: "end", item, anchor });
    if (a === "schedule") return setDlg({ type: "schedule", item, anchor });
    if (a === "publish") return setDlg({ type: "publishNow", item, anchor });
    if (a === "reopen") return setDlg({ type: "reopen", item, anchor });
    return undefined;
  };

  const pinCard = (id, index) => {
    const item = byId(id);
    if (!item) return;
    if (!["live", "scheduled"].includes(item.status)) {
      say(t("annc.pins.onlyLive"), "err");
      return;
    }
    const ids = pinned.map((p) => p.id).filter((x) => x !== id);
    ids.splice(index, 0, id);
    run(() => annApi.pins(ids), { ok: t("annc.toast.pinned") });
  };

  const reorderPins = (ids) => run(() => annApi.pins(ids), { ok: t("annc.toast.order") });

  const drawerItem = byId(drawerId);
  const dItem = dlg?.item ? byId(dlg.item.id) || dlg.item : null;

  return (
    <div className="an" data-testid="an-page">
      <div className="an-top">
        <div className="an-top-txt">
          <h1>{t("annc.title")}</h1>
          <p>{t("annc.subtitle")}</p>
        </div>
        <span className="an-sp" />
        <Seg
          items={[
            { id: "board", icon: "board", label: t("annc.view.board") },
            { id: "list", icon: "list", label: t("annc.view.list") },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            setDrawerId(null);
          }}
          label={t("annc.view.label")}
          className="an-viewseg"
          testId="an-viewseg"
        />
        <label className="an-search">
          <Ic name="search" size={18} />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("annc.search")} aria-label={t("annc.search")} />
          <kbd>{SHORTCUT}</kbd>
        </label>
        <button type="button" className="an-btn is-lg" onClick={() => setGallery(true)} data-testid="an-open-gallery">
          <Ic name="tpl" size={18} />
          {view === "board" ? t("annc.fromTemplate") : t("annc.templates")}
        </button>
        <button type="button" className="an-btn is-lg is-primary" onClick={() => openCompose()} data-testid="an-create">
          <Ic name="plus" size={18} />
          {t("annc.create")}
        </button>
      </div>

      {data && !data.schemaReady ? <p className="an-warnline">{t("annc.schemaMissing")}</p> : null}
      {loadErr ? (
        <div className="an-err" role="alert">
          <Ic name="alert" size={15} />
          {loadErr}
          <button type="button" className="an-linkbtn" onClick={load}>
            {t("annc.retry")}
          </button>
        </div>
      ) : null}

      {data ? <KpiRow k={data.kpis} locale={locale} t={t} /> : (
        <div className="an-kpis">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={78} r={16} />)}</div>
      )}

      {!data ? (
        <div className="an-board">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={420} r={18} />)}</div>
      ) : view === "board" ? (
        <>
          <PinStrip pinned={pinned} onReorder={reorderPins} onPinCard={pinCard} onUnpin={(a) => act("pin", a)} dragging={dragging} t={t} />
          <BoardView
            cols={cols}
            onOpen={(i) => act("open", i)}
            onDrop={onDrop}
            onMenu={(item, anchor) => setMenu({ item, anchor })}
            menuFor={menu?.item?.id}
            onCompose={() => openCompose()}
            dragging={dragging}
            setDragging={setDragging}
            pendingEnd={dlg?.type === "end" && dlg.anchor === colRefs.current.ended ? dItem : null}
            colRefs={colRefs}
            onShowArchive={() => {
              setView("list");
              setTab("archived");
            }}
            onColumnSort={(col, mode) => {
              if (mode === "list") {
                setView("list");
                setTab(col);
              } else setSorts((s) => ({ ...s, [col]: mode }));
            }}
            sorts={sorts}
          />
        </>
      ) : (
        <div className="an-split">
          <ListView
            tab={tab}
            setTab={(x) => {
              setTab(x);
              setSelectedId(null);
            }}
            counts={counts}
            items={listItems}
            selectedId={selected?.id}
            onSelect={(i) => setSelectedId(i.id)}
            onPin={(i) => act("pin", i)}
            onMenu={(item, anchor) => setMenu({ item, anchor })}
            menuFor={menu?.item?.id}
            onReorderPins={reorderPins}
            filters={filters}
            setFilters={setFilters}
          />
          <Inspector item={selected} onAction={(k, i) => act(k, i)} me={data.me} />
        </div>
      )}

      <Menu open={Boolean(menu)} anchorRef={menu?.anchor} onClose={() => setMenu(null)} items={menu ? menuItems(menu.item) : []} label={menu?.item?.title} width={300} testId="an-rowmenu" />

      <Drawer open={Boolean(drawerItem)} onClose={() => setDrawerId(null)} labelledBy="an-drawer-t" width={430} testId="an-drawer">
        <div className="an-drawer-hd">
          <h2 id="an-drawer-t" className="an-ell">{drawerItem?.title}</h2>
          <button
            type="button"
            className="an-ibtn"
            aria-label={t("annc.more")}
            aria-haspopup="menu"
            ref={(el) => {
              if (!colRefs.current.__drawerMenu) colRefs.current.__drawerMenu = { current: null };
              colRefs.current.__drawerMenu.current = el;
            }}
            onClick={() => setMenu({ item: drawerItem, anchor: colRefs.current.__drawerMenu })}
          >
            <Ic name="more" size={18} />
          </button>
          <button type="button" className="an-ibtn" onClick={() => setDrawerId(null)} aria-label={t("annc.close")}>
            <Ic name="x" size={18} />
          </button>
        </div>
        <Inspector item={drawerItem} onAction={(k, i) => act(k, i)} me={data?.me} testId="an-drawer-insp" />
      </Drawer>

      {composer ? (
        <Composer
          open
          initial={composer.draft}
          mode={composer.mode}
          templateLabel={composer.templateLabel}
          items={items}
          meta={meta}
          say={say}
          onClose={() => setComposer(null)}
          onOpenGallery={() => {
            setComposer(null);
            setGallery(true);
          }}
          onSaved={(r) => {
            setComposer(null);
            say(resultText(r), "ok", r.result === "live" && r.item?.id ? undoLive(r.item.id) : null);
            if (r.item?.id) {
              if (view === "list") {
                setTab(r.item.status === "archived" ? "archived" : r.item.status);
                setSelectedId(r.item.id);
              }
            }
            load();
          }}
        />
      ) : null}

      <TemplateGallery open={gallery} onClose={() => setGallery(false)} onUse={(draft, label, mode) => openCompose(draft, label, mode === "template" ? "template" : "create")} meta={meta} say={say} />

      <DeleteDialog
        open={dlg?.type === "delete"}
        item={dItem}
        openSessions={dlg?.openSessions || 0}
        me={data?.me}
        busy={busy}
        error={dlgErr}
        onClose={closeDlg}
        onConfirm={(body) =>
          run(() => annApi.remove(dItem.id, body), {
            ok: body.archiveInstead ? t("annc.toast.archived") : t("annc.toast.deleted"),
            undo: body.archiveInstead ? { label: t("annc.toast.undo"), run: () => run(() => annApi.unarchive(dItem.id), { ok: t("annc.toast.unarchived") }) } : null,
          }).then((r) => {
            if (r && selectedId === dItem.id) setSelectedId(null);
            if (r && drawerId === dItem.id) setDrawerId(null);
          })
        }
      />
      <EndPopover
        open={dlg?.type === "end"}
        anchorRef={dlg?.anchor || colRefs.current.ended}
        item={dItem}
        busy={busy}
        error={dlgErr}
        onClose={closeDlg}
        onConfirm={({ reason, note }) => run(() => annApi.end(dItem.id, reason, note), { ok: t("annc.toast.ended"), undo: { label: t("annc.toast.undo"), run: () => run(() => annApi.reopen(dItem.id), { ok: t("annc.toast.reopened") }) } })}
      />
      <SchedulePopover open={dlg?.type === "schedule"} anchorRef={dlg?.anchor} item={dItem} busy={busy} error={dlgErr} onClose={closeDlg} onConfirm={(at) => run(() => annApi.publish(dItem.id, { startsAt: at }), { ok: resultText })} />
      <ConfirmPopover
        open={dlg?.type === "publishNow"}
        anchorRef={dlg?.anchor}
        busy={busy}
        error={dlgErr}
        onClose={closeDlg}
        icon="send"
        title={t("annc.board.publishTitle")}
        body={dItem ? t("annc.board.publishBody", { title: dItem.title }) : ""}
        confirmLabel={t("annc.composer.publishNow")}
        onConfirm={() => run(() => annApi.publish(dItem.id, { startsAt: null }), { ok: resultText, undo: undoLive(dItem.id) })}
      />
      <ConfirmPopover
        open={dlg?.type === "reopen"}
        anchorRef={dlg?.anchor}
        busy={busy}
        error={dlgErr}
        onClose={closeDlg}
        icon="refresh"
        title={t("annc.board.reopenTitle")}
        body={dItem ? t("annc.board.reopenBody", { title: dItem.title }) : ""}
        confirmLabel={t("annc.menu.reopen")}
        onConfirm={() => run(() => annApi.reopen(dItem.id), { ok: t("annc.toast.reopened") })}
      />
      <ExtendDialog open={dlg?.type === "extend"} item={dItem} me={data?.me} busy={busy} error={dlgErr} onClose={closeDlg} onConfirm={(at) => run(() => annApi.extend(dItem.id, at), { ok: t("annc.toast.extended") })} />
      <HistoryDialog
        open={dlg?.type === "history"}
        item={dItem}
        versions={history.list}
        loading={history.loading}
        busy={busy}
        error={dlgErr}
        onClose={closeDlg}
        onRestore={(v) => run(() => annApi.restore(dItem.id, v), { ok: t("annc.toast.restored", { v }) })}
      />
      <ApproveDialog
        open={dlg?.type === "approve"}
        item={dItem}
        me={data?.me}
        busy={busy}
        error={dlgErr}
        onClose={closeDlg}
        onApprove={(note) => run(() => annApi.approve(dItem.id, note), { ok: resultText })}
        onReject={(note) => run(() => annApi.reject(dItem.id, note), { ok: t("annc.toast.sentBack") })}
      />
      <SaveTemplateDialog open={dlg?.type === "saveTemplate"} item={dItem} busy={busy} error={dlgErr} onClose={closeDlg} onConfirm={(name) => run(() => annApi.saveAsTemplate(dItem.id, { name }), { ok: t("annc.toast.template") })} />

      {toast ? (
        <div className={`an-toast is-${toast.tone}`} role="status" aria-live="polite" data-testid="an-toast">
          <Ic name={toast.tone === "err" ? "alert" : "tick"} size={16} />
          <span>{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              className="an-linkbtn"
              onClick={() => {
                const a = toast.action;
                setToast(null);
                a.run();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
