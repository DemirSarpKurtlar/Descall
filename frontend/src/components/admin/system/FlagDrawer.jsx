/**
 * Flag editor drawer (Draft A frame A2): status segments, platforms, rollout percent with
 * the stable-bucket note, the always-on team, reason, automatic rollback, "try on my own
 * account first", and the change history with "Buna dön". Also the all-flags history drawer.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { formatAppDateTime } from "../../../lib/datetime";
import { Globe, History, Monitor, Plus, Search, Send, Smartphone, Undo2, X } from "../../ui/Icon.jsx";
import { FLAG_ICONS } from "./SystemCards.jsx";
import { Avatar, Check, Drawer, Popover, Skel } from "./SystemUi.jsx";
import { MODES, PLATFORMS, TICKS, avatarColor, flagBody, normalizeRule, reachEstimate, ruleError, sameRule, stateTitle } from "./systemModel.js";

const PLATFORM_ICON = { web: Globe, electron: Monitor, ios: Smartphone, android: Smartphone };

function when(at, locale) {
  return formatAppDateTime(at, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit", second: undefined });
}

export function StateTitle({ state }) {
  const { t } = useLocale();
  const parts = stateTitle(state);
  if (!parts) return <>{t("sysx.drawer.unknownState")}</>;
  return <>{parts.map((p) => (p.list ? p.list.map((k) => t(k)).join(", ") : t(p.key, p.vars))).join(" · ")}</>;
}

function StaffPicker({ open, onClose, anchorRef, onPick, exclude }) {
  const { t } = useLocale();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const id = setTimeout(() => {
      adminFetch(`/system/staff-search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => alive && (setRows(r.people || []), setErr(false)))
        .catch(() => alive && (setRows([]), setErr(true)));
    }, q ? 220 : 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [open, q]);
  useEffect(() => {
    if (!open) {
      setQ("");
      setRows(null);
    }
  }, [open]);
  const list = (rows || []).filter((p) => !exclude.includes(p.id));
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} label={t("sysx.drawer.addStaff")} width={280} align="start" testId="sys-staff-picker">
      <label className="asx-search">
        <Search size={14} />
        <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sysx.drawer.searchPh")} aria-label={t("sysx.drawer.searchPh")} />
      </label>
      <div className="asx-pop-list" role="listbox" aria-label={t("sysx.drawer.addStaff")}>
        {rows == null ? (
          <Skel h={30} />
        ) : list.length ? (
          list.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected="false" className="asx-mi" onClick={() => onPick(p)}>
              <Avatar name={p.username} color={avatarColor(p.username)} />
              <span>@{p.username}</span>
              {p.staff ? <em className="asx-chip is-blue">{t("sysx.drawer.staffChip")}</em> : null}
            </button>
          ))
        ) : (
          <p className="asx-empty-s">{err ? t("sysx.err.generic") : t("sysx.drawer.noResults")}</p>
        )}
      </div>
    </Popover>
  );
}

export default function FlagDrawer({ flag, totalUsers, names: initialNames, onClose, onSaved, onError }) {
  const { t, locale } = useLocale();
  const titleId = useId();
  const [draft, setDraft] = useState(() => normalizeRule(flag?.rule));
  const [names, setNames] = useState(initialNames || {});
  const [reason, setReason] = useState("");
  const [autoRollback, setAutoRollback] = useState(false);
  const [tryFirst, setTryFirst] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState({ loading: true, entries: [], persistent: true, err: false });
  const [picker, setPicker] = useState(false);
  const addRef = useRef(null);
  const key = flag?.key;

  const loadHistory = useCallback(() => {
    if (!key) return;
    setHist((h) => ({ ...h, loading: true }));
    adminFetch(`/system/flags/${key}/history`)
      .then((r) => {
        setHist({ loading: false, entries: r.entries || [], persistent: r.persistent !== false, err: false });
        setNames((n) => ({ ...n, ...(r.names || {}) }));
      })
      .catch(() => setHist({ loading: false, entries: [], persistent: true, err: true }));
  }, [key]);

  useEffect(() => {
    setDraft(normalizeRule(flag?.rule));
    setTried(false);
    loadHistory();
    // Only when another flag opens; live updates of the same flag keep the edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!flag) return null;
  const Icon = FLAG_ICONS[flag.icon] || Monitor;
  const current = normalizeRule(flag.rule);
  const server = flag.kind === "server";
  const single = flag.allowed?.length === 1;
  const dirty = !sameRule(draft, current);
  const err = dirty ? ruleError(flag, draft) : null;
  const est = reachEstimate(draft, totalUsers);
  const canTry = flag.kind === "client";

  const setMode = (mode) =>
    setDraft((d) => {
      const next = { ...d, mode };
      if (mode === "rollout" && (d.percent <= 0 || d.percent >= 100)) next.percent = 25;
      if (mode === "all") next.percent = 100;
      return next;
    });
  const togglePlatform = (p) =>
    setDraft((d) => ({ ...d, platforms: d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || d.platforms.includes(x)) }));

  const save = async () => {
    if (err || busy) return;
    setBusy(true);
    try {
      if (tryFirst && canTry && !tried) {
        await adminFetch(`/system/flags/${key}/try`, { method: "POST", body: JSON.stringify({ rule: normalizeRule(draft) }) });
        setTried(true);
        return;
      }
      const r = await adminFetch(`/system/flags/${key}`, { method: "PATCH", body: JSON.stringify(flagBody(draft, { reason, autoRollback })) });
      onSaved?.(r, { key, kind: "save" });
      setReason("");
      setTried(false);
      loadHistory();
    } catch (e) {
      onError?.(e);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (entry) => {
    setBusy(true);
    try {
      const r = await adminFetch(`/system/flags/${key}/restore`, { method: "POST", body: JSON.stringify({ historyId: entry.id, reason }) });
      onSaved?.(r, { key, kind: "restore" });
      if (r.flag?.rule) setDraft(normalizeRule(r.flag.rule));
      loadHistory();
    } catch (e) {
      onError?.(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} labelledBy={titleId} testId="sys-flag-drawer" busy={busy}>
      <header className="asx-dh">
        <span className="asx-dh-ic is-blue" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="asx-dh-t">
          <h2 id={titleId}>{t(`sysx.flag.${key}.name`)}</h2>
          <p>
            <span className="asx-kbd">{key}</span> · {t(`sysx.flag.${key}.long`)}
          </p>
        </div>
        <button type="button" className="asx-xbtn" onClick={onClose} disabled={busy} aria-label={t("sysx.close")}>
          <X size={16} />
        </button>
      </header>
      <div className="asx-drawer-body">
        <div>
          <div className="asx-lab" id={`${titleId}-mode`}>
            {t("sysx.drawer.status")}
          </div>
          <div className="asx-seg" role="radiogroup" aria-labelledby={`${titleId}-mode`}>
            {MODES.map((m) => {
              const disabled = server && (m === "staff" || m === "rollout");
              return (
                <button key={m} type="button" role="radio" aria-checked={draft.mode === m} className={draft.mode === m ? "is-on" : ""} disabled={disabled || busy} onClick={() => setMode(m)} data-autofocus={draft.mode === m ? "" : undefined} data-testid={`sys-mode-${m}`}>
                  {t(`sysx.mode.${m}`)}
                </button>
              );
            })}
          </div>
          {server ? <p className="asx-hint">{t("sysx.drawer.serverWide")}</p> : null}
        </div>

        {!server ? (
          <div>
            <div className="asx-lab">{t("sysx.drawer.platforms")}</div>
            <div className="asx-pl is-big" role="group" aria-label={t("sysx.drawer.platforms")}>
              {PLATFORMS.map((p) => {
                const PIcon = PLATFORM_ICON[p];
                const allowed = flag.allowed?.includes(p);
                const on = single ? allowed : draft.platforms.includes(p);
                return (
                  <button key={p} type="button" className={`${on ? "is-on" : ""}${allowed ? "" : " is-na"}`} aria-pressed={on} disabled={!allowed || single || busy || draft.mode === "off"} onClick={() => togglePlatform(p)}>
                    <PIcon size={16} />
                    {allowed ? t(`sysx.platform.${p}`) : t("sysx.drawer.separateFlag", { name: t(`sysx.platform.${p}`) })}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {!server ? (
          <div className={draft.mode === "rollout" ? "" : "asx-dim"}>
            <div className="asx-lab asx-lab-row">
              <span id={`${titleId}-pct`}>{t("sysx.drawer.percent")}</span>
              <b className="tnum">{t("sysx.pct", { n: draft.mode === "all" ? 100 : draft.percent })}</b>
            </div>
            <input
              type="range"
              className="asx-slider"
              min={0}
              max={100}
              step={1}
              value={draft.mode === "all" ? 100 : draft.percent}
              style={{ "--asx-v": `${draft.mode === "all" ? 100 : draft.percent}%` }}
              aria-labelledby={`${titleId}-pct`}
              aria-valuetext={t("sysx.pct", { n: draft.percent })}
              disabled={draft.mode !== "rollout" || busy}
              onChange={(e) => setDraft((d) => ({ ...d, percent: Number(e.target.value) }))}
              data-testid="sys-percent"
            />
            <div className="asx-ticks" aria-hidden="true">
              {TICKS.map((v) => (
                <span key={v} style={{ left: `${v}%` }} className={v === 0 ? "is-first" : v === 100 ? "is-last" : ""}>
                  {t("sysx.pct", { n: v })}
                </span>
              ))}
            </div>
            <p className="asx-hint">
              {t("sysx.drawer.approx", { n: formatNumber(est.n, locale), total: est.total ? formatNumber(est.total, locale) : "–" })}
            </p>
          </div>
        ) : null}

        {!server ? (
          <div>
            <div className="asx-lab">{t(flag.kind === "edge" ? "sysx.drawer.staffEdge" : "sysx.drawer.staff")}</div>
            <div className="asx-ucs">
              {draft.staff.map((id) => {
                const name = names[id] || id.slice(0, 8);
                return (
                  <span className="asx-uc" key={id}>
                    <Avatar name={name} color={avatarColor(name)} />@{name}
                    <button type="button" aria-label={t("sysx.drawer.removeStaff", { name })} disabled={busy} onClick={() => setDraft((d) => ({ ...d, staff: d.staff.filter((x) => x !== id) }))}>
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              <span className="asx-rel">
                <button ref={addRef} type="button" className="asx-uc is-add" aria-haspopup="dialog" aria-expanded={picker} disabled={busy || draft.staff.length >= 50} onClick={() => setPicker((v) => !v)} data-testid="sys-staff-add">
                  <Plus size={14} />
                  {t("sysx.drawer.add")}
                </button>
                <StaffPicker
                  open={picker}
                  onClose={() => setPicker(false)}
                  anchorRef={addRef}
                  exclude={draft.staff}
                  onPick={(p) => {
                    setNames((n) => ({ ...n, [p.id]: p.username }));
                    setDraft((d) => ({ ...d, staff: [...d.staff, p.id] }));
                    setPicker(false);
                    addRef.current?.focus();
                  }}
                />
              </span>
            </div>
          </div>
        ) : null}

        <label className="asx-fld">
          <span className="asx-lab">{t("sysx.drawer.reason")}</span>
          <textarea className="asx-ta" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("sysx.drawer.reasonPh")} disabled={busy} data-testid="sys-flag-reason" />
        </label>

        <div className="asx-chks">
          <Check checked={autoRollback} onChange={setAutoRollback} disabled={busy || server}>
            {t("sysx.drawer.autoRollback")}
          </Check>
          <Check checked={tryFirst && canTry} onChange={(v) => (setTryFirst(v), setTried(false))} disabled={busy || !canTry}>
            {canTry ? t("sysx.drawer.tryFirst") : t("sysx.drawer.tryClientOnly")}
          </Check>
          {flag.guard ? <p className="asx-hint is-amber">{t("sysx.drawer.guardOn", { time: when(flag.guard.until, locale) })}</p> : null}
        </div>

        <div>
          <div className="asx-lab">
            <History size={12} /> {t("sysx.drawer.history")}
          </div>
          {!hist.persistent ? <p className="asx-hint">{t("sysx.drawer.historyMemory")}</p> : null}
          {hist.loading ? (
            <>
              <Skel h={48} r={12} />
              <Skel h={48} r={12} />
            </>
          ) : hist.err ? (
            <p className="asx-err">
              {t("sysx.err.generic")}{" "}
              <button type="button" className="asx-link" onClick={loadHistory}>
                {t("sysx.retry")}
              </button>
            </p>
          ) : hist.entries.length ? (
            hist.entries.map((e) => (
              <div className="asx-hi" key={e.id}>
                <b>
                  <StateTitle state={e.state} />
                </b>
                <small>
                  {[e.by ? `@${e.by}` : t("sysx.system"), when(e.at, locale), e.reason ? `"${e.reason}"` : null, e.auto ? t("sysx.drawer.autoReverted") : null].filter(Boolean).join(" · ")}
                </small>
                {e.current ? (
                  <span className="asx-chip is-green">{t("sysx.drawer.now")}</span>
                ) : e.state ? (
                  <button type="button" className="asx-btn is-sm" disabled={busy} onClick={() => restore(e)} data-testid={`sys-restore-${e.id}`}>
                    <Undo2 size={14} />
                    {t("sysx.drawer.revert")}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="asx-empty-s">{t("sysx.drawer.emptyHistory")}</p>
          )}
        </div>
      </div>
      <footer className="asx-drawer-f">
        {tried ? <p className="asx-hint is-blue">{t("sysx.drawer.tried")}</p> : null}
        {err ? (
          <p className="asx-hint is-red" role="alert">
            {t(err)}
          </p>
        ) : null}
        <div className="asx-row">
          <button type="button" className="asx-btn" onClick={onClose} disabled={busy}>
            {t("sysx.cancel")}
          </button>
          <button type="button" className="asx-btn is-p" onClick={save} disabled={busy || !dirty || Boolean(err)} data-testid="sys-flag-save">
            <Send size={16} />
            {busy ? t("sysx.saving") : tryFirst && canTry && !tried ? t("sysx.drawer.tryNow") : tried ? t("sysx.drawer.publishNow") : t("sysx.drawer.save")}
          </button>
        </div>
      </footer>
    </Drawer>
  );
}

/** "Değişiklik geçmişi" of the flags card: every flag change, newest first. */
export function FlagsHistoryDrawer({ open, onClose, onOpenFlag }) {
  const { t, locale } = useLocale();
  const titleId = useId();
  const [state, setState] = useState({ loading: true, entries: [], err: false, persistent: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    adminFetch("/system/flags/history")
      .then((r) => setState({ loading: false, entries: r.entries || [], err: false, persistent: r.persistent !== false }))
      .catch(() => setState({ loading: false, entries: [], err: true, persistent: true }));
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  const groups = useMemo(() => state.entries, [state.entries]);
  return (
    <Drawer open={open} onClose={onClose} labelledBy={titleId} testId="sys-flags-history">
      <header className="asx-dh">
        <span className="asx-dh-ic is-blue" aria-hidden="true">
          <History size={20} />
        </span>
        <div className="asx-dh-t">
          <h2 id={titleId}>{t("sysx.flags.historyTitle")}</h2>
          <p>{t("sysx.flags.historySub")}</p>
        </div>
        <button type="button" className="asx-xbtn" onClick={onClose} aria-label={t("sysx.close")}>
          <X size={16} />
        </button>
      </header>
      <div className="asx-drawer-body">
        {!state.persistent ? <p className="asx-hint">{t("sysx.drawer.historyMemory")}</p> : null}
        {state.loading ? (
          Array.from({ length: 5 }, (_, i) => <Skel key={i} h={48} r={12} />)
        ) : state.err ? (
          <p className="asx-err">
            {t("sysx.err.generic")}{" "}
            <button type="button" className="asx-link" onClick={load}>
              {t("sysx.retry")}
            </button>
          </p>
        ) : groups.length ? (
          groups.map((e) => (
            <button type="button" className="asx-hi is-btn" key={e.id} onClick={() => onOpenFlag(e.key)}>
              <b>
                {t(`sysx.flag.${e.key}.name`)} · <StateTitle state={e.state} />
              </b>
              <small>{[e.by ? `@${e.by}` : t("sysx.system"), when(e.at, locale), e.reason ? `"${e.reason}"` : null, e.revertedAt ? t("sysx.drawer.reverted") : null].filter(Boolean).join(" · ")}</small>
            </button>
          ))
        ) : (
          <p className="asx-empty-s">{t("sysx.drawer.emptyHistory")}</p>
        )}
      </div>
    </Drawer>
  );
}
