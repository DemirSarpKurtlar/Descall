/**
 * Draft B "Vitrin ve kampanyalar": storefront sections in the order the user shop shows
 * them (drag or Alt + arrow keys to reorder, switch on/off), the rotating section rule, the
 * campaign calendar (week / 7 weeks / list) and the limited and time-limited items.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Box, Calendar, GripVertical, Plus, Star } from "../../ui/Icon.jsx";
import { Repeat } from "./shopDeskIcons.js";
import {
  barGeometry, calendarRange, campaignScopeInfo, isLimited, itemStatus, moveId, nowLinePct, num, salesSpeed, stockInfo, timeLeft,
} from "./shopDeskModel.js";
import { Empty, ItemThumb, NewTag, Pill, Seg, Toggle, errMsg } from "./ui.jsx";
import OpsStrip from "./OpsStrip.jsx";
import SectionDialog from "./SectionDialog.jsx";

export default function StorefrontTab({ data, items, itemsById, kpis, mismatchCount, goTab, openCampaign, openDrawer, afterWrite, showToast, onShowLimited, reload }) {
  const [preview, setPreview] = useState(null);
  const [sectionDlg, setSectionDlg] = useState(null);
  const sections = data?.sections || [];

  const loadPreview = useCallback(async () => {
    try {
      const d = await adminFetch("/shop/sections/preview");
      setPreview(d.preview || {});
    } catch {
      setPreview({});
    }
  }, []);
  useEffect(() => {
    loadPreview();
  }, [loadPreview, data]);

  return (
    <div className="sdk-ops">
      <OpsStrip kpis={kpis} mismatchCount={mismatchCount} reconcileAt={data?.reconcile?.started_at} onReconcile={() => goTab("reconcile")} />
      <div className="sdk-b1">
        <SectionsCard
          sections={sections}
          itemsById={itemsById}
          preview={preview}
          installed={data?.installed?.sections !== false}
          onAdd={() => setSectionDlg({ section: null })}
          onEdit={(s) => setSectionDlg({ section: s })}
          afterWrite={afterWrite}
          showToast={showToast}
          reload={reload}
        />
        <div className="sdk-b1-right">
          <CalendarCard campaigns={data?.campaigns || []} sections={sections} itemsById={itemsById} installed={data?.installed?.campaigns !== false} openCampaign={openCampaign} />
          <LimitedCard items={items} openDrawer={openDrawer} afterWrite={afterWrite} showToast={showToast} onShowLimited={onShowLimited} />
        </div>
      </div>
      <SectionDialog
        open={Boolean(sectionDlg)}
        section={sectionDlg?.section || null}
        items={items.filter((it) => !it.retired)}
        onClose={() => setSectionDlg(null)}
        onDone={(msg) => {
          setSectionDlg(null);
          afterWrite(msg);
        }}
      />
    </div>
  );
}

function SectionsCard({ sections, itemsById, preview, installed, onAdd, onEdit, afterWrite, showToast }) {
  const { t, locale } = useLocale();
  const [order, setOrder] = useState(() => sections.map((s) => s.id));
  const [dragId, setDragId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [enabledOverride, setEnabledOverride] = useState({});
  useEffect(() => {
    setOrder(sections.map((s) => s.id));
    setEnabledOverride({});
  }, [sections]);
  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);

  const saveOrder = async (ids) => {
    try {
      await adminFetch("/shop/sections/order", { method: "POST", body: JSON.stringify({ ids }) });
      afterWrite(t("shopDesk.orderSaved"));
    } catch (e) {
      setOrder(sections.map((s) => s.id));
      showToast(errMsg(t, e), null, "bad");
    }
  };
  const toggle = async (s, on) => {
    setBusyId(s.id);
    setEnabledOverride((m) => ({ ...m, [s.id]: on }));
    try {
      await adminFetch(`/shop/sections/${s.id}`, { method: "PATCH", body: JSON.stringify({ enabled: on }) });
      afterWrite(on ? t("shopDesk.secShown", { name: s.title }) : t("shopDesk.secHidden", { name: s.title }));
    } catch (e) {
      setEnabledOverride((m) => ({ ...m, [s.id]: !on }));
      showToast(errMsg(t, e), null, "bad");
    } finally {
      setBusyId(null);
    }
  };

  const rotating = sections.find((s) => s.kind === "rotating" && s.enabled !== false);
  const rotInfo = rotating ? preview?.[rotating.id] : null;

  const meta = (s) => {
    const p = preview?.[s.id];
    const n = p ? p.total : null;
    const cfg = s.config || {};
    const visibleFrom = s.visible_from && Date.parse(s.visible_from) > Date.now() ? new Date(s.visible_from) : null;
    if (s.enabled === false || enabledOverride[s.id] === false) {
      return visibleFrom ? t("shopDesk.secDraftFrom", { date: visibleFrom.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("shopDesk.secDraft");
    }
    if (s.kind === "manual") return t("shopDesk.secMetaManual", { n: n ?? (s.item_ids || []).length });
    if (s.kind === "rotating") return t("shopDesk.secMetaRotating", { n: n ?? cfg.count ?? 8 });
    if (s.kind === "new") return t("shopDesk.secMetaNew", { days: cfg.days || 14, n: n ?? 0 });
    if (s.kind === "bestsellers") return t("shopDesk.secMetaBest", { n: n ?? 0 });
    if (s.kind === "limited") {
      const left = timeLeft(p?.endsAt);
      return left ? t("shopDesk.secMetaLimitedEnds", { n: n ?? 0, d: left.d, h: left.h }) : t("shopDesk.secMetaLimited", { n: n ?? 0 });
    }
    return t("shopDesk.secMetaCategory", { cat: t(`shopDesk.cat.${cfg.category || "countries"}`), n: n ?? 0 });
  };

  return (
    <section className="sdk-card sdk-sections" aria-labelledby="sdk-sec-h">
      <div className="sdk-card-head">
        <h2 id="sdk-sec-h" className="sdk-card-title">
          <Star size={20} />
          {t("shopDesk.sectionsTitle")}
          <NewTag />
        </h2>
        <button type="button" className="sdk-link is-strong" onClick={onAdd} disabled={!installed}>
          <Plus size={17} />
          {t("shopDesk.addSection")}
        </button>
      </div>
      <p className="sdk-muted sdk-card-sub">{t("shopDesk.sectionsSub")}</p>
      {!installed ? (
        <p className="sdk-muted">{t("shopDesk.notInstalled")}</p>
      ) : !sections.length ? (
        <Empty icon={Star} title={t("shopDesk.noSections")} body={t("shopDesk.noSectionsBody")} action={<button type="button" className="sdk-btn is-primary" onClick={onAdd}><Plus size={16} />{t("shopDesk.addSection")}</button>} />
      ) : (
        <ol className="sdk-seclist" aria-label={t("shopDesk.sectionsTitle")}>
          {order.map((id, idx) => {
            const s = byId.get(id);
            if (!s) return null;
            const on = enabledOverride[s.id] ?? s.enabled !== false;
            const thumbs = (preview?.[s.id]?.itemIds || []).slice(0, 4).map((x) => itemsById.get(String(x))).filter(Boolean);
            return (
              <li
                key={id}
                className={`sdk-sec${dragId === id ? " is-drag" : ""}${idx === 0 ? " is-first" : ""}${on ? "" : " is-off"}`}
                draggable
                onDragStart={(e) => {
                  setDragId(id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== id) setOrder((o) => moveId(o, dragId, id));
                }}
                onDragEnd={() => {
                  setDragId(null);
                  if (order.join() !== sections.map((x) => x.id).join()) saveOrder(order);
                }}
              >
                <button
                  type="button"
                  className="sdk-grip"
                  aria-label={t("shopDesk.dragHint", { name: s.title })}
                  onKeyDown={(e) => {
                    if (!e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
                    e.preventDefault();
                    const j = idx + (e.key === "ArrowUp" ? -1 : 1);
                    if (j < 0 || j >= order.length) return;
                    const next = moveId(order, id, order[j]);
                    setOrder(next);
                    saveOrder(next);
                  }}
                >
                  <GripVertical size={18} />
                </button>
                <button type="button" className="sdk-sec-main" onClick={() => onEdit(s)}>
                  <b>{s.title}</b>
                  <small>{meta(s)}</small>
                </button>
                <span className="sdk-sec-thumbs" aria-hidden="true">
                  {thumbs.map((it) => (
                    <ItemThumb key={it.id} item={it} size={34} />
                  ))}
                </span>
                <Toggle checked={on} busy={busyId === s.id} onChange={(v) => toggle(s, v)} label={t("shopDesk.secToggle", { name: s.title })} />
              </li>
            );
          })}
        </ol>
      )}
      {rotating ? (
        <div className="sdk-rot">
          <h3>
            <Repeat size={19} />
            {t("shopDesk.rotTitle", { name: rotating.title })}
          </h3>
          <dl>
            <dt>{t("shopDesk.rotNext")}</dt>
            <dd>{rotInfo?.nextRotationAt ? new Date(rotInfo.nextRotationAt).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}</dd>
            <dt>{t("shopDesk.rotPool")}</dt>
            <dd>
              {[
                (rotating.config?.rarities || []).map((r) => t(`shopDesk.rarity.${r}`)).join(t("shopDesk.andSep")) || t("shopDesk.allRarities"),
                t("shopDesk.nItems", { n: num(rotInfo?.poolSize ?? 0, locale) }),
              ].join(" · ")}
            </dd>
            <dt>{t("shopDesk.rotRule")}</dt>
            <dd>{rotInfo?.repeatFreeWeeks ? t("shopDesk.rotRuleText", { n: Math.min(4, rotInfo.repeatFreeWeeks) }) : t("shopDesk.rotRuleSmall")}</dd>
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function CalendarCard({ campaigns, sections, itemsById, installed, openCampaign }) {
  const { t, locale } = useLocale();
  const [view, setView] = useState("weeks");
  const now = Date.now();
  const range = useMemo(() => calendarRange(now, 7, view === "week" ? "week" : "weeks"), [view, now]);
  const rows = campaigns.filter((c) => c.status !== "ended" || Date.parse(c.ends_at) > range.start).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const nowPct = nowLinePct(range, now);
  const fmtD = (ms) => new Date(ms).toLocaleDateString(locale, view === "week" ? { weekday: "short", day: "numeric" } : { day: "numeric", month: "short" });
  const span = (c) => `${new Date(c.starts_at).toLocaleDateString(locale, { day: "numeric", month: "short" })}-${new Date(c.ends_at).toLocaleDateString(locale, { day: "numeric", month: "short" })}`;
  const describe = (c) => {
    const s = campaignScopeInfo(c, itemsById);
    if (c.kind === "storefront") return t("shopDesk.calStorefront", { name: sections.find((x) => x.id === s.id)?.title || "-" });
    const scope =
      s.kind === "all"
        ? t("shopDesk.scope.all")
        : s.kind === "categories"
          ? s.list.map((x) => t(`shopDesk.cat.${x}`)).join(", ")
          : s.kind === "items"
            ? s.n === 1 && s.first ? s.first : t("shopDesk.nItems", { n: s.n })
            : "-";
    return c.kind === "discount" ? `${scope} %${c.discount_pct}` : t("shopDesk.calDrop", { scope });
  };
  const barLabel = (c) => {
    if (c.status === "draft") return t("shopDesk.campDraft");
    if (c.kind === "discount") return c.status === "active" ? t("shopDesk.calActivePct", { n: c.discount_pct }) : `%${c.discount_pct}`;
    if (c.kind === "drop") return t("shopDesk.calDropBar");
    return t("shopDesk.calShelfBar");
  };
  return (
    <section className="sdk-card sdk-cal" aria-labelledby="sdk-cal-h">
      <div className="sdk-card-head">
        <h2 id="sdk-cal-h" className="sdk-card-title">
          <Calendar size={20} />
          {t("shopDesk.calTitle")}
          <NewTag />
        </h2>
        <div className="sdk-card-actions">
          <span className="sdk-today">
            <i />
            {t("shopDesk.todayIs", { date: new Date(now).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}
          </span>
          <Seg small value={view} onChange={setView} label={t("shopDesk.calTitle")} items={[{ id: "week", label: t("shopDesk.cal.week") }, { id: "weeks", label: t("shopDesk.cal.weeks") }, { id: "list", label: t("shopDesk.cal.list") }]} />
        </div>
      </div>
      {!installed ? (
        <p className="sdk-muted">{t("shopDesk.notInstalled")}</p>
      ) : !rows.length ? (
        <Empty icon={Calendar} title={t("shopDesk.noCampaigns")} body={t("shopDesk.noCampaignsBody")} action={<button type="button" className="sdk-btn is-primary" onClick={() => openCampaign(null)}><Plus size={16} />{t("shopDesk.newCampaign")}</button>} />
      ) : view === "list" ? (
        <ul className="sdk-camplist">
          {rows.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => openCampaign(c.id)}>
                <span>
                  <b>{c.name}</b>
                  <small>
                    {describe(c)} · {span(c)}
                  </small>
                </span>
                <Pill tone={{ active: "green", scheduled: "amber", draft: "gray", ended: "gray" }[c.status] || "gray"}>{t(`shopDesk.cs.${c.status}`)}</Pill>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sdk-gantt" role="table" aria-label={t("shopDesk.calTitle")}>
          <div className="sdk-gantt-h" role="row">
            <span role="columnheader">{t("shopDesk.calCampaign")}</span>
            <div className="sdk-gantt-cols">
              {range.cols.map((col) => (
                <span key={col.at} role="columnheader">
                  {fmtD(col.at)}
                </span>
              ))}
            </div>
          </div>
          {rows.map((c) => {
            const g = barGeometry(c.starts_at, c.ends_at, range);
            return (
              <div key={c.id} className="sdk-gantt-r" role="row">
                <button type="button" className="sdk-gantt-name" role="cell" onClick={() => openCampaign(c.id)}>
                  <b>{c.name}</b>
                  <small>
                    {describe(c)} · {span(c)}
                  </small>
                </button>
                <div className="sdk-gantt-track" role="cell">
                  {range.cols.map((col) => (
                    <i key={col.at} />
                  ))}
                  {g ? (
                    <button
                      type="button"
                      className={`sdk-gbar is-${c.kind} is-${c.status}`}
                      style={{ left: `${g.left}%`, width: `${g.width}%` }}
                      onClick={() => openCampaign(c.id)}
                      aria-label={`${c.name}: ${barLabel(c)}`}
                    >
                      {barLabel(c)}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {nowPct != null ? <span className="sdk-nowline" style={{ left: `calc(var(--gantt-name) + (100% - var(--gantt-name)) * ${nowPct / 100})` }} aria-hidden="true" /> : null}
        </div>
      )}
    </section>
  );
}

function LimitedCard({ items, openDrawer, afterWrite, showToast, onShowLimited }) {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(null);
  const limited = items
    .filter((it) => !it.retired && isLimited(it) && itemStatus(it) !== "expired")
    .sort((a, b) => (Date.parse(a.availability?.endsAt || "") || Infinity) - (Date.parse(b.availability?.endsAt || "") || Infinity));
  const toggle = async (it, on) => {
    setBusy(it.id);
    try {
      await adminFetch(`/shop/desk/items/${it.id}`, { method: "PATCH", body: JSON.stringify({ active: on }) });
      afterWrite(on ? t("shopDesk.toastActivated", { name: it.name }) : t("shopDesk.toastDeactivated", { name: it.name }));
    } catch (e) {
      showToast(errMsg(t, e), null, "bad");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="sdk-card sdk-limited" aria-labelledby="sdk-lim-h">
      <div className="sdk-card-head">
        <h2 id="sdk-lim-h" className="sdk-card-title">
          <Box size={20} />
          {t("shopDesk.limitedTitle")}
          <NewTag />
        </h2>
        {limited.length ? (
          <button type="button" className="sdk-link" onClick={onShowLimited}>
            {t("shopDesk.allN", { n: limited.length })}
          </button>
        ) : null}
      </div>
      {!limited.length ? (
        <Empty icon={Box} title={t("shopDesk.noLimited")} body={t("shopDesk.noLimitedBody")} />
      ) : (
        <table className="sdk-table sdk-limtable">
          <thead>
            <tr>
              <th>{t("shopDesk.col.item")}</th>
              <th>{t("shopDesk.col.stockLeft")}</th>
              <th>{t("shopDesk.col.ends")}</th>
              <th>{t("shopDesk.col.speed")}</th>
              <th aria-label={t("shopDesk.col.status")} />
            </tr>
          </thead>
          <tbody>
            {limited.slice(0, 6).map((it) => {
              const s = stockInfo(it);
              const left = timeLeft(it.availability?.endsAt);
              const speed = salesSpeed(it.sales?.n7);
              return (
                <tr key={it.id} className="sdk-row" onClick={() => openDrawer(it.id, "edit")}>
                  <td>
                    <div className="sdk-item">
                      <ItemThumb item={it} size={44} />
                      <div>
                        <b>{it.name}</b>
                        <small className="sdk-muted">{t(`shopDesk.cat.${it.category}`)}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {s ? (
                      <span className="sdk-stock">
                        <small className="tnum">
                          {num(s.left, locale)} / {num(s.limit, locale)}
                        </small>
                        <span className={`sdk-meter ${s.left / Math.max(1, s.limit) < 0.2 ? "is-amber" : "is-violet"}`}>
                          <i style={{ width: `${Math.round((s.left / Math.max(1, s.limit)) * 100)}%` }} />
                        </span>
                      </span>
                    ) : (
                      <span className="sdk-muted">{t("shopDesk.unlimited")}</span>
                    )}
                  </td>
                  <td className={left && left.d < 3 ? "sdk-amber" : ""}>
                    {!left ? t("shopDesk.noEndShort") : left.d >= 3 ? t("shopDesk.inDays", { n: left.d }) : t("shopDesk.timeLeftShort", { d: left.d, h: left.h })}
                  </td>
                  <td className="sdk-muted">{speed.unit === "hour" ? t("shopDesk.perHour", { n: speed.value }) : t("shopDesk.perDay", { n: num(speed.value, locale) })}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Toggle checked={it.active} busy={busy === it.id} onChange={(on) => toggle(it, on)} label={t("shopDesk.activeToggle", { name: it.name })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

