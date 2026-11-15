/**
 * Draft B table: severity dot, Zaman (relative + local clock), İşlemi yapan,
 * İşlem (coloured label), Hedef (avatar + name, or a chip for non-user
 * targets), Ayrıntı, row menu. Rows of an open anomaly are tinted red; the
 * selected row blue. Click = detail drawer, right click / ⋯ / Shift+F10 = menu,
 * arrows move, Enter opens.
 */
import { useRef } from "react";
import { MoreHorizontal, Server, Undo2, Layers } from "../../ui/Icon.jsx";
import { ActionChip, Av } from "./AuditUi.jsx";
import { SEV_TONE, clock, handle, mergedCount, targetOf } from "./auditModel.js";
import { detailText, relText, sentenceText } from "./auditText.js";

export default function AuditTable({ entries, users, servers, loading, err, onRetry, selectedId, onSelect, onOpen, onMenu, anomalySeries, freshIds, undoneMap, now, t, locale, catLabel, onUserClick }) {
  const bodyRef = useRef(null);

  const move = (dir) => {
    if (!entries.length) return;
    const i = Math.max(0, entries.findIndex((e) => e.id === selectedId));
    const next = entries[Math.min(entries.length - 1, Math.max(0, (selectedId ? i + dir : 0)))];
    if (!next) return;
    onSelect(next.id);
    bodyRef.current?.querySelector(`[data-row="${CSS.escape(next.id)}"]`)?.focus({ preventScroll: false });
  };

  return (
    <div className="alg-tbl" role="table" aria-label={t("auditLog.table.label")} aria-busy={loading ? "true" : undefined}>
      <div className="alg-th" role="row">
        <span role="columnheader" aria-hidden="true" />
        <span role="columnheader">{t("auditLog.table.time")}</span>
        <span role="columnheader">{t("auditLog.table.actor")}</span>
        <span role="columnheader">{t("auditLog.table.action")}</span>
        <span role="columnheader">{t("auditLog.table.target")}</span>
        <span role="columnheader">{t("auditLog.table.detail")}</span>
        <span role="columnheader" aria-hidden="true" />
      </div>
      <div ref={bodyRef} role="rowgroup">
        {loading && !entries.length
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="alg-tr is-skel" role="row">
                <span className="alg-sev" />
                <span className="alg-skel" style={{ width: 110, height: 12 }} />
                <span className="alg-skel" style={{ width: 100, height: 12 }} />
                <span className="alg-skel" style={{ width: 120, height: 22, borderRadius: 8 }} />
                <span className="alg-skel" style={{ width: 90, height: 12 }} />
                <span className="alg-skel" style={{ width: 200, height: 12 }} />
                <span />
              </div>
            ))
          : null}
        {err && !entries.length ? (
          <div className="alg-tbl-empty" role="row">
            <p role="cell">{t("auditLog.table.failed")}</p>
            <button type="button" className="alg-btn is-ghost" onClick={onRetry}>
              {t("auditLog.retry")}
            </button>
          </div>
        ) : null}
        {!loading && !err && !entries.length ? (
          <div className="alg-tbl-empty" role="row">
            <p role="cell">
              <b>{t("auditLog.table.empty")}</b>
              <small>{t("auditLog.table.emptyHint")}</small>
            </p>
          </div>
        ) : null}
        {entries.map((e) => {
          const sentence = sentenceText(e, users, servers, t, locale);
          const series = anomalySeries?.get(e.id) || null;
          const tgt = targetOf(e, users, servers);
          const undone = undoneMap?.get(e.id) || null;
          const n = mergedCount(e);
          const agent = e.action === "agent_run" || e.action === "agent_tool";
          const cls = ["alg-tr", series ? "is-an" : "", selectedId === e.id ? "is-sel" : "", freshIds?.has(e.id) ? "is-fresh" : ""].filter(Boolean).join(" ");
          const actorUser = e.actorId ? users?.[e.actorId] : null;
          return (
            <div
              key={e.id}
              className={cls}
              role="row"
              tabIndex={0}
              data-row={e.id}
              aria-selected={selectedId === e.id}
              aria-label={sentence}
              title={sentence}
              data-testid="audit-row"
              onClick={() => {
                onSelect(e.id);
                onOpen(e);
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                onSelect(e.id);
                onMenu(e, { x: ev.clientX, y: ev.clientY });
              }}
              onKeyDown={(ev) => {
                if (ev.target !== ev.currentTarget) return;
                if (ev.key === "ArrowDown") {
                  ev.preventDefault();
                  move(1);
                } else if (ev.key === "ArrowUp") {
                  ev.preventDefault();
                  move(-1);
                } else if (ev.key === "Enter") {
                  ev.preventDefault();
                  onOpen(e);
                } else if (ev.key === "ContextMenu" || (ev.shiftKey && ev.key === "F10")) {
                  ev.preventDefault();
                  const r = ev.currentTarget.getBoundingClientRect();
                  onMenu(e, { x: r.right - 40, y: r.bottom - 6 });
                }
              }}
              onFocus={() => onSelect(e.id)}
            >
              <span className={`alg-sev is-${SEV_TONE[e.severity] || "gray"}`} role="cell" aria-label={t(`auditLog.sev.${e.severity || "low"}`)} />
              <span className="alg-cell alg-time" role="cell">
                <b>{relText(e.at, now, t)}</b> <span className="alg-muted tnum">{clock(e.at, locale)}</span>
              </span>
              <span className="alg-cell" role="cell">
                <Av user={actorUser} name={e.actorUsername || "?"} />
                <span className="alg-t">{handle(e.actorUsername || "?")}</span>
              </span>
              <span className="alg-cell" role="cell">
                <ActionChip action={e.action} category={e.category} t={t} />
              </span>
              <span className="alg-cell" role="cell">
                {agent ? (
                  <span className="alg-mk is-violet">{t("auditLog.table.tools", { n: e.count || 1 })}</span>
                ) : tgt.kind === "user" ? (
                  <>
                    <Av user={tgt.userId ? users?.[tgt.userId] : null} name={tgt.label} />
                    <button
                      type="button"
                      className="alg-t alg-u"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (tgt.userId) onUserClick(tgt.userId);
                      }}
                      tabIndex={-1}
                    >
                      {tgt.label}
                    </button>
                  </>
                ) : tgt.kind === "server" ? (
                  <span className="alg-mk">
                    <Server size={14} />
                    {tgt.label}
                  </span>
                ) : tgt.label ? (
                  <span className="alg-mk" title={String(e.target)}>
                    {tgt.label}
                  </span>
                ) : (
                  <span className="alg-muted">—</span>
                )}
              </span>
              <span className="alg-cell alg-detail" role="cell">
                {undone ? (
                  <span className="alg-mk is-blue">
                    <Undo2 size={13} />
                    {t("auditLog.table.undoneBy", { user: handle(undone) })}
                  </span>
                ) : null}
                {n > 1 ? (
                  <span className="alg-mk">
                    <Layers size={13} />
                    {t("auditLog.table.merged", { n })}
                  </span>
                ) : null}
                {freshIds?.has(e.id) ? <span className="alg-mk is-green">{t("auditLog.table.fresh")}</span> : null}
                <span className="alg-t alg-muted">{detailText(e, t, catLabel, series ? { series } : {})}</span>
              </span>
              <span className="alg-cell alg-more-c" role="cell">
                <button
                  type="button"
                  className="alg-mbtn"
                  aria-label={t("auditLog.table.more", { sentence })}
                  aria-haspopup="menu"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect(e.id);
                    const r = ev.currentTarget.getBoundingClientRect();
                    onMenu(e, { x: r.right, y: r.bottom + 4, anchor: ev.currentTarget });
                  }}
                  tabIndex={-1}
                >
                  <MoreHorizontal size={18} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
