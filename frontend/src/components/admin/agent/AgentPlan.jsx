/* Ajan > Plan sekmesi (Taslak B1): grouped plan, row evidence, dry run and approval. */
import { useEffect, useMemo, useRef, useState } from "react";
import AgentEvidence from "./AgentEvidence.jsx";
import { ActionChip, AgoAvatar, Check3, Ic } from "./agentUi.jsx";
import {
  ROWS_PER_GROUP, ageKey, actionLabelParts, buildGroups, diffChips, dryBar, groupCheckState, joinLabel, riskClass,
  rowDiffMark, toneClass,
} from "./agentOpsModel.js";

const TIMEOUT_CHOICES = ["1h", "6h", "12h", "24h", "3d", "7d", "14d", "30d"];

function DurationMenu({ t, value, onPick, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="ago-pop-anchor" ref={ref}>
      <button type="button" className="ago-btn is-s" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((v) => !v)}>
        {t("agentOps.plan.duration", { d: value ? t(`agentOps.dur.${value}`) : "?" })}
        <Ic name="cd" size={12} />
      </button>
      {open ? (
        <div className="ago-pop ago-menu is-right" role="menu">
          {TIMEOUT_CHOICES.map((id) => (
            <button key={id} type="button" role="menuitemradio" aria-checked={id === value} className={`ago-mi${id === value ? " is-on" : ""}`} onClick={() => { setOpen(false); if (id !== value) onPick(id); }}>
              {t(`agentOps.dur.${id}`)}
              {id === value ? <Ic name="check" size={13} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function banFlagsText(t, p) {
  const out = [];
  if (p.revokeSessions !== false) out.push(t("agentOps.plan.flagSessions"));
  if (p.alsoAccessBan) out.push(t("agentOps.plan.flagDevice"));
  if (p.notifyEmail !== false && !p.alsoAccessBan) out.push(t("agentOps.plan.flagEmail"));
  return out.join(" · ");
}

function verdictPill(t, item) {
  const v = item.verdict;
  if (!v || v.verdict === "ok" || v.verdict === "unselected" || !item.selected) return null;
  const cls = v.verdict === "warn" ? "am" : "hot";
  return <span className={`ago-sg is-${cls}`} title={t("agentOps.plan.verdictTitle", { text: t(`agentOps.code.${v.code}`) })}>{t(`agentOps.code.${v.code}`)}</span>;
}

function Row({ t, item, open, onToggleOpen, onSelect, locked, showAction, catText, diffMark }) {
  const age = ageKey(item.target?.createdAt);
  const sub = [
    age ? t(age.key, { count: age.count }) : null,
    item.target?.emailVerified === false ? t("agentOps.age.unverified") : null,
    item.target?.premium ? t("agentOps.age.premium") : null,
  ].filter(Boolean).join(" · ");
  const name = item.username || (item.userId ? item.userId.slice(0, 8) : t("agentOps.plan.everyone"));
  return (
    <div
      className={`ago-tr ago-prow${open ? " is-sel" : ""}${!item.selected ? " is-off" : ""}${diffMark ? ` is-${diffMark}` : ""}`}
      onClick={onToggleOpen}
      role="row"
    >
      <Check3 state={item.selected ? "on" : "off"} onClick={() => onSelect(!item.selected)} disabled={locked} label={t("agentOps.plan.selectRow", { name })} />
      <div className="ago-ucell">
        <AgoAvatar name={name} url={item.target?.avatarUrl} seed={item.userId || name} />
        <div className="ago-ucell-t">
          <b>{item.userId ? `@${name}` : name}</b>
          {sub ? <small>{sub}</small> : null}
        </div>
      </div>
      <div className="ago-pills2">
        {verdictPill(t, item)}
        {showAction ? <ActionChip action={item.action} params={item.params} t={t} catText={catText} /> : null}
        {(item.evidence?.signals || []).map((s, i) => (
          <span key={i} className={`ago-sg${toneClass(s.tone) ? ` is-${toneClass(s.tone)}` : ""}`}>{s.label}</span>
        ))}
      </div>
      <span className={`ago-rk is-${riskClass(item.risk)} tnum`}>{item.risk ?? ""}</span>
      <button
        type="button"
        className="ago-iconbtn is-s ago-chev"
        aria-expanded={open}
        aria-label={open ? t("agentOps.plan.collapse") : t("agentOps.plan.expand")}
        onClick={(e) => { e.stopPropagation(); onToggleOpen(); }}
      >
        <Ic name={open ? "cd" : "cr"} size={14} />
      </button>
    </div>
  );
}

export default function AgentPlan({
  t, view, loading, error, mode, catText, showDiff, busy, onRetry, onSelect, onEditBan, onEditTimeout,
  onApprove, onSchedule, onSavePlan, onDiscard, onDryRun, onOpenUser, onOpenVersion, onGoQueue,
}) {
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState("grouped");
  const [openRow, setOpenRow] = useState(null);
  const [expanded, setExpanded] = useState({});
  const planId = view?.plan?.id;

  useEffect(() => {
    setOpenRow(null);
    setExpanded({});
  }, [planId]);
  // The first row of a fresh plan opens its evidence (draft B1).
  useEffect(() => {
    if (!view?.items?.length || openRow) return;
    const first = view.items.find((i) => i.status !== "excluded");
    if (first) setOpenRow(first.id);
  }, [view?.items, openRow]);

  const built = useMemo(() => buildGroups(view?.items || [], { mode: groupMode, query }), [view?.items, groupMode, query]);

  if (loading && !view) {
    return (
      <div className="ago-tabbody" aria-busy="true">
        {[0, 1, 2, 3, 4].map((k) => <div key={k} className="ago-skel" style={{ height: k === 0 ? 34 : 40 }} />)}
      </div>
    );
  }
  if (error && !view) {
    return (
      <div className="ago-empty">
        <Ic name="alert" size={22} />
        <p>{error}</p>
        <button type="button" className="ago-btn is-s" onClick={onRetry}>{t("agentOps.retry")}</button>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="ago-empty">
        <span className="ago-empty-ic"><Ic name="shield" size={22} /></span>
        <b>{t("agentOps.plan.emptyTitle")}</b>
        <p>{t("agentOps.plan.emptyBody")}</p>
      </div>
    );
  }

  const { plan } = view;
  const locked = plan.status !== "proposed";
  const dry = plan.dryRun?.summary || null;
  const bar = dryBar(dry);
  const latest = view.versions?.length ? view.versions[view.versions.length - 1] : null;
  const actionText = (a, p) => joinLabel(actionLabelParts(a, p, catText).slice(0, 1), t);
  const chips = showDiff ? diffChips(plan.diff, actionText) : [];
  const anyRunnable = view.items.some((i) => i.selected && i.status === "proposed" && (!i.verdict || ["ok", "warn"].includes(i.verdict.verdict)));
  const approveDisabled = locked || busy || mode === "read" || !anyRunnable || (mode === "dry" && !dry);

  const selectMany = (items, selected) => onSelect(items.filter((i) => i.status === "proposed").map((i) => i.id), selected);

  return (
    <div className="ago-plan">
      <div className="ago-plan-tools">
        <label className="ago-search">
          <Ic name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("agentOps.plan.search")} aria-label={t("agentOps.plan.search")} />
        </label>
        <div className="ago-fps" role="radiogroup" aria-label={t("agentOps.plan.grouped")}>
          {[["grouped", "grouped"], ["risk", "byRisk"], ["cluster", "byCluster"]].map(([id, key]) => (
            <button key={id} type="button" role="radio" aria-checked={groupMode === id} className={`ago-fp${groupMode === id ? " is-on" : ""}`} onClick={() => setGroupMode(id)}>
              {t(`agentOps.plan.${key}`)}
            </button>
          ))}
        </div>
        <span className="ago-sp" />
        <span className="ago-sub tnum">{t("agentOps.plan.selected", { sel: built.selected, total: built.total })}</span>
        {!locked ? (
          <>
            <button type="button" className="ago-iconbtn is-s" onClick={onDryRun} disabled={busy} title={t("agentOps.plan.dryRun")} aria-label={t("agentOps.plan.dryRun")}>
              <Ic name="flask" size={15} />
            </button>
            <button type="button" className="ago-iconbtn is-s ago-discard" onClick={onDiscard} disabled={busy} title={t("agentOps.plan.discard")} aria-label={t("agentOps.plan.discard")}>
              <Ic name="trash" size={15} />
            </button>
          </>
        ) : null}
      </div>

      {showDiff ? (
        <div className="ago-diffbox">
          <div className="ago-lab">
            {plan.version > 1 ? t("agentOps.diff.title", { from: plan.version - 1, to: plan.version }) : t("agentOps.diff.none")}
            {plan.source === "admin_edit" ? <span className="ago-sg is-bl">{t("agentOps.diff.byAdmin")}</span> : null}
          </div>
          {chips.length ? <div className="ago-chips">{chips.map((c, k) => <span key={k} className={`ago-sg is-${c.tone}`}>{t(c.key, c.vars)}</span>)}</div> : plan.version > 1 ? <p className="ago-muted">{t("agentOps.diff.none")}</p> : null}
        </div>
      ) : null}

      <div className="ago-plan-scroll" role="table" aria-label={plan.title}>
        {plan.summary ? <p className="ago-plan-summary">{plan.summary}</p> : null}
        {built.groups.length === 0 ? <p className="ago-muted ago-pad">{t("agentOps.plan.noMatch")}</p> : null}
        {built.groups.map((g) => {
          const all = g.items;
          const showAll = expanded[g.key] || query;
          const visible = showAll ? all : all.slice(0, ROWS_PER_GROUP);
          const hidden = all.length - visible.length;
          const p = g.params || {};
          return (
            <div key={g.key} className="ago-group" role="rowgroup">
              <div className="ago-ghead">
                <Check3 state={groupCheckState(all)} disabled={locked} label={t("agentOps.plan.selectGroup")} onClick={() => selectMany(all, groupCheckState(all) !== "on")} />
                {g.kind === "action" ? <ActionChip action={g.action} params={p} t={t} catText={catText} /> : null}
                {g.kind === "cluster" ? <span className="ago-act is-watch"><Ic name="eye" size={14} /><span className="ago-act-label">{g.cluster || t("agentOps.plan.noCluster")}</span></span> : null}
                {g.kind === "risk" ? <span className="ago-act is-mute"><Ic name="alert" size={14} /><span className="ago-act-label">{t("agentOps.plan.byRisk")}</span></span> : null}
                <b className="ago-gcount">{t("agentOps.plan.accounts", { count: all.length })}</b>
                <span className="ago-sp" />
                {g.kind === "action" && g.action === "ban" ? (
                  <>
                    <span className="ago-sub ago-ellip">{banFlagsText(t, p)}</span>
                    <button type="button" className="ago-btn is-s" disabled={locked || busy} onClick={() => onEditBan(g)}>
                      <Ic name="ban" size={15} />
                      {t("agentOps.plan.editBan")}
                    </button>
                  </>
                ) : null}
                {g.kind === "action" && g.action === "timeout" && !p.durationSeconds ? (
                  <DurationMenu t={t} value={p.presetId} disabled={locked || busy} onPick={(id) => onEditTimeout(g, id)} />
                ) : null}
              </div>
              {visible.map((item) => (
                <div key={item.id}>
                  <Row
                    t={t}
                    item={item}
                    open={openRow === item.id}
                    locked={locked || item.status !== "proposed"}
                    showAction={g.kind !== "action"}
                    catText={catText}
                    diffMark={showDiff ? rowDiffMark(item, plan.diff) : null}
                    onToggleOpen={() => setOpenRow((cur) => (cur === item.id ? null : item.id))}
                    onSelect={(sel) => onSelect([item.id], sel)}
                  />
                  {openRow === item.id ? <AgentEvidence item={item} t={t} onOpenUser={onOpenUser} /> : null}
                </div>
              ))}
              {hidden > 0 ? (
                <button type="button" className="ago-lnk ago-more" onClick={() => setExpanded((e) => ({ ...e, [g.key]: true }))}>
                  {t("agentOps.plan.more", { count: hidden })}
                </button>
              ) : all.length > ROWS_PER_GROUP && !query ? (
                <button type="button" className="ago-lnk ago-more" onClick={() => setExpanded((e) => ({ ...e, [g.key]: false }))}>
                  {t("agentOps.plan.less")}
                </button>
              ) : null}
            </div>
          );
        })}

        {built.excluded.length ? (
          <div className="ago-group is-excluded">
            <div className="ago-ghead">
              <span className="ago-act is-ok"><Ic name="shield" size={14} /><span className="ago-act-label">{t("agentOps.plan.excludedTitle", { count: built.excluded.length })}</span></span>
              <span className="ago-sp" />
              <span className="ago-sub ago-ellip">{t("agentOps.plan.excludedNote")}</span>
            </div>
            {built.excluded.map((item) => (
              <div key={item.id} className="ago-tr ago-xrow">
                <span />
                <div className="ago-ucell">
                  <AgoAvatar name={item.username || "?"} url={item.target?.avatarUrl} seed={item.userId} />
                  <div className="ago-ucell-t"><b>@{item.username || item.userId?.slice(0, 8)}</b></div>
                </div>
                <div className="ago-pills2">
                  <span className="ago-sg is-gr">{t(`agentOps.excl.${item.excludedReason}`)}</span>
                  <ActionChip action={item.action} params={item.params} t={t} catText={catText} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <footer className="ago-plan-foot">
        {locked ? (
          <>
            <div className="ago-foot-note">
              <Ic name={plan.status === "superseded" ? "hist" : "shield"} size={15} />
              <span>
                {plan.status === "superseded" ? t("agentOps.plan.lockedSuperseded")
                  : ["running", "paused", "scheduled"].includes(plan.status) ? t("agentOps.plan.lockedLive")
                    : t("agentOps.plan.lockedDone")}
              </span>
              <span className={`ago-sg ago-status is-${plan.status}`}>{t(`agentOps.status.${plan.status}`)}</span>
            </div>
            <span className="ago-sp" />
            {plan.status === "superseded" && latest && latest.id !== plan.id ? (
              <button type="button" className="ago-btn is-s" onClick={() => onOpenVersion(latest.id)}>{t("agentOps.plan.openLatest")}</button>
            ) : null}
            {plan.status !== "superseded" && plan.status !== "discarded" ? (
              <button type="button" className="ago-btn is-s" onClick={onGoQueue}>{t("agentOps.plan.openQueue")}</button>
            ) : null}
          </>
        ) : (
          <>
            <div className="ago-dry">
              <div className="ago-pbar" aria-hidden="true">
                <i className="is-g" style={{ width: `${bar.g}%` }} />
                <i className="is-a" style={{ width: `${bar.a}%` }} />
                <i className="is-r" style={{ width: `${bar.r}%` }} />
              </div>
              <span className="ago-sub tnum">
                {dry ? t("agentOps.plan.dry", { apply: dry.apply, warn: dry.warn, skip: dry.skip + dry.block }) : t("agentOps.plan.dryPending")}
                {dry?.block ? ` · ${t("agentOps.plan.dryBlocked", { count: dry.block })}` : ""}
              </span>
            </div>
            <span className="ago-sp" />
            <button type="button" className="ago-btn is-ghost is-s" onClick={onSavePlan} disabled={busy}>
              <Ic name="copy" size={15} />
              {t("agentOps.plan.savePlan")}
            </button>
            <button type="button" className="ago-btn is-ghost is-s" onClick={onSchedule} disabled={approveDisabled}>
              <Ic name="cal" size={15} />
              {t("agentOps.plan.schedule")}
            </button>
            <button
              type="button"
              className="ago-btn is-p"
              onClick={onApprove}
              disabled={approveDisabled}
              title={mode === "read" ? t("agentOps.plan.readOnly") : undefined}
            >
              <Ic name="shield" size={15} />
              {busy ? t("agentOps.plan.approving") : t("agentOps.plan.approve")}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
