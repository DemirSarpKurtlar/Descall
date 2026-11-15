/**
 * Oyunlar / Kredi dialogs:
 *  - LimitsDialog  (Draft B frame 3) personal limits with the bot message the player
 *                  would see, the change list and the previous limit
 *  - CreditDialog  add / remove / set credits, reason required, player notice,
 *                  new balance + rank preview, credit history on the right
 *  - ReasonDialog  quick switches (leaderboard hide, transfers, reset) with a reason
 *  - NoteDialog    admin note on the account (same notes as the user file)
 */
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { resolveRef } from "../../../i18n/serverText.js";
import { formatAppDate, formatTimeAgo } from "../../../lib/datetime";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { Calendar, Check, ChevronRight, Coins, History, Minus, PenLine, Plus, Shield, SlidersHorizontal } from "../../ui/Icon.jsx";
import { Delta, GAvatar, GDialog, ICONS, Seg, Skel, Switch } from "./GamesUi.jsx";
import {
  ADJUST_CATEGORIES,
  ADJUST_OPS,
  ADJUST_PRESETS,
  FREEZE_OPTIONS,
  GLOBAL_MAX_BET,
  LIMIT_RANGES,
  REASON_MAX,
  adjustmentSummary,
  canSubmitAdjust,
  formLimits,
  ledgerView,
  limitParts,
  limitsBody,
  limitsDiff,
  limitsForm,
  parseAmount,
  previewBalance,
  previewNotice,
  qs,
  rankAfter,
  reasonOk,
  sliderPct,
} from "./gamesModel.js";

function deltaClass(d) {
  if (d > 0) return "agm-pos";
  return d < 0 ? "agm-neg" : "";
}

export function errorText(t, err) {
  const code = err?.code;
  const map = {
    REASON_REQUIRED: "gamesAdmin.err.reason",
    REASON_TOO_LONG: "gamesAdmin.err.reasonLong",
    BAD_AMOUNT: "gamesAdmin.err.amount",
    BAD_LIMITS: "gamesAdmin.err.limits",
    LIMITS_UNAVAILABLE: "gamesAdmin.err.limitsUnavailable",
    NOTES_UNAVAILABLE: "gamesAdmin.err.notesUnavailable",
    STEP_UP_REQUIRED: "gamesAdmin.err.stepUp",
    ADMIN_PERMISSION_DENIED: "gamesAdmin.err.permission",
  };
  return t(map[code] || "gamesAdmin.err.generic");
}

function partsText(t, locale, parts) {
  return parts
    .map((p) => {
      const vars = {};
      for (const [k, v] of Object.entries(p.vars || {})) {
        if (k === "date") vars[k] = v ? formatAppDate(v, locale, { day: "numeric", month: "short", year: undefined }) : "";
        else vars[k] = typeof v === "number" ? formatNumber(v, locale) : v;
      }
      return t(p.key, vars);
    })
    .join(" · ");
}

export function limitSummaryText(t, locale, limits) {
  return partsText(t, locale, limitParts(limits));
}

/* ======================= Limits ======================= */

function LimitRow({ id, title, sub, value, onChange, lowLabel, highLabel, valueText }) {
  const r = LIMIT_RANGES[id];
  const pct = sliderPct(id, value);
  return (
    <div className="agm-lim">
      <div>
        <b id={`agm-lim-${id}`}>{title}</b>
        <small>{sub}</small>
      </div>
      <div>
        <input
          type="range"
          className="agm-range"
          min={r.min}
          max={r.max}
          step={r.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-labelledby={`agm-lim-${id}`}
          aria-valuetext={valueText}
          style={{ "--pct": `${pct}%` }}
          data-testid={`agm-lim-${id}`}
        />
        <div className="agm-slv">
          <span>{lowLabel}</span>
          <b className="tnum">{valueText}</b>
          <span>{highLabel}</span>
        </div>
      </div>
    </div>
  );
}

export function LimitsDialog({ open, onClose, player, limits, preset, onSaved }) {
  const { t, locale } = useLocale();
  const stored = limits?.stored || null;
  const [form, setForm] = useState(() => limitsForm(stored));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setForm({ ...limitsForm(stored), ...(preset || {}) });
      setErr("");
    }
  }, [open, stored, preset]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const n = (v) => formatNumber(v, locale);
  const next = useMemo(() => formLimits(form, stored), [form, stored]);
  const notice = useMemo(() => previewNotice(next), [next]);
  const diff = useMemo(() => limitsDiff(stored, form), [stored, form]);
  const prev = (limits?.history || []).find((h) => h.previous && limitParts(h.previous).length);
  const frozenNow = Boolean(stored?.freezeIndefinite || (stored?.frozenUntil && new Date(stored.frozenUntil).getTime() > Date.now()));
  const canSave = reasonOk(form.reason) && limits?.ready !== false;

  const valueOf = (row, v) => {
    if (row === "transfers") return v ? t("gamesAdmin.limits.on") : t("gamesAdmin.limits.off");
    if (row === "freeze") {
      if (!v) return t("gamesAdmin.limits.none");
      if (v === "forever") return t("gamesAdmin.limits.indefinite");
      return formatAppDate(v, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit" });
    }
    if (v == null) return t("gamesAdmin.limits.none");
    return row === "dailyHandCap" ? n(v) : n(v);
  };

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    setErr("");
    try {
      const res = await adminFetch(`/credits/players/${player.id}/limits`, { method: "PUT", body: JSON.stringify(limitsBody(form)) });
      onSaved?.(res.limits);
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const aside = (
    <>
      <div className="agm-lab">{t("gamesAdmin.limits.userSees")}</div>
      <div className="agm-botmsg" data-testid="agm-bot-preview">
        <div className="agm-bh">
          <span className="agm-bot-av" aria-hidden="true">
            O
          </span>
          {t("gamesAdmin.limits.botName")}
          <em>{t("gamesAdmin.limits.botTag")}</em>
        </div>
        {notice ? resolveRef(notice) : <span className="agm-muted">{t("gamesAdmin.limits.noNotice")}</span>}
      </div>
      <div className="agm-lab" style={{ marginTop: 16 }}>
        {t("gamesAdmin.limits.change")}
      </div>
      {diff
        .filter((d) => d.id !== "freeze" || d.changed || d.from)
        .map((d) => (
          <div key={d.id} className={`agm-diff${d.changed ? " is-changed" : ""}`}>
            <span>{t(`gamesAdmin.limits.diff_${d.id}`)}</span>
            {d.changed ? (
              <>
                <s>{valueOf(d.id, d.from)}</s>
                <ChevronRight size={14} aria-hidden="true" />
                <b>{valueOf(d.id, d.to)}</b>
              </>
            ) : (
              <b className="is-same">{valueOf(d.id, d.to)}</b>
            )}
          </div>
        ))}
      {prev ? (
        <div className="agm-info" style={{ marginTop: 12 }}>
          <History size={16} aria-hidden="true" />
          <span>
            {t("gamesAdmin.limits.previous", {
              summary: limitSummaryText(t, locale, prev.previous),
              who: prev.actor ? `@${prev.actor}` : "—",
              date: formatAppDate(prev.at, locale, { day: "numeric", month: "short", year: undefined }),
            })}
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <GDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={SlidersHorizontal}
      tone="blue"
      title={t("gamesAdmin.limits.title", { user: player?.username || "" })}
      subtitle={t("gamesAdmin.limits.subtitle", { max: n(GLOBAL_MAX_BET) })}
      aside={aside}
      width={650}
      testId="agm-limits"
    >
      {limits?.ready === false ? <div className="agm-warn">{t("gamesAdmin.err.limitsUnavailable")}</div> : null}
      <LimitRow
        id="maxBet"
        title={t("gamesAdmin.limits.maxBet")}
        sub={t("gamesAdmin.limits.maxBetSub", { min: n(LIMIT_RANGES.maxBet.min), max: n(GLOBAL_MAX_BET) })}
        value={form.maxBet}
        onChange={(v) => set({ maxBet: Math.max(LIMIT_RANGES.maxBet.min, v) })}
        lowLabel={n(LIMIT_RANGES.maxBet.min)}
        highLabel={n(LIMIT_RANGES.maxBet.max)}
        valueText={n(form.maxBet)}
      />
      <LimitRow
        id="dailyLossCap"
        title={t("gamesAdmin.limits.loss")}
        sub={t("gamesAdmin.limits.lossSub")}
        value={form.dailyLossCap}
        onChange={(v) => set({ dailyLossCap: v })}
        lowLabel={t("gamesAdmin.limits.off")}
        highLabel={n(LIMIT_RANGES.dailyLossCap.max)}
        valueText={form.dailyLossCap > 0 ? n(form.dailyLossCap) : t("gamesAdmin.limits.off")}
      />
      <LimitRow
        id="dailyHandCap"
        title={t("gamesAdmin.limits.hands")}
        sub={t("gamesAdmin.limits.handsSub")}
        value={form.dailyHandCap}
        onChange={(v) => set({ dailyHandCap: v })}
        lowLabel={t("gamesAdmin.limits.off")}
        highLabel={t("gamesAdmin.limits.handsN", { n: LIMIT_RANGES.dailyHandCap.max })}
        valueText={form.dailyHandCap > 0 ? t("gamesAdmin.limits.handsN", { n: form.dailyHandCap }) : t("gamesAdmin.limits.off")}
      />
      <div className="agm-lim">
        <div>
          <b id="agm-lim-transfer">{t("gamesAdmin.limits.transfer")}</b>
          <small>{t("gamesAdmin.limits.transferSub")}</small>
        </div>
        <div className="agm-lim-sw">
          <span className="agm-muted">{form.transfersEnabled ? t("gamesAdmin.limits.on") : t("gamesAdmin.limits.off")}</span>
          <Switch checked={form.transfersEnabled} onChange={(v) => set({ transfersEnabled: v })} label={t("gamesAdmin.limits.transfer")} />
        </div>
      </div>
      <div>
        <div className="agm-lab" id="agm-freeze-lab">
          {t("gamesAdmin.limits.freeze")}
        </div>
        <div className="agm-pills" role="radiogroup" aria-labelledby="agm-freeze-lab" data-testid="agm-freeze">
          {frozenNow ? (
            <button type="button" role="radio" aria-checked={form.freeze === "keep"} className={form.freeze === "keep" ? "is-on" : ""} onClick={() => set({ freeze: "keep" })}>
              {stored?.freezeIndefinite
                ? t("gamesAdmin.limits.freezeKeepForever")
                : t("gamesAdmin.limits.freezeKeep", { date: formatAppDate(stored.frozenUntil, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit" }) })}
            </button>
          ) : null}
          {FREEZE_OPTIONS.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={form.freeze === id} className={form.freeze === id ? "is-on" : ""} onClick={() => set({ freeze: id })}>
              {t(`gamesAdmin.limits.freeze_${id}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="agm-exp">
        <label className="agm-lab" htmlFor="agm-exp-date" style={{ margin: 0 }}>
          {t("gamesAdmin.limits.until")}
        </label>
        <span className="agm-inp agm-date">
          <Calendar size={16} aria-hidden="true" />
          <input id="agm-exp-date" type="date" value={form.expiresAt} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(e) => set({ expiresAt: e.target.value })} aria-describedby="agm-exp-hint" />
        </span>
        <label className="agm-chk">
          <GlassCheckbox checked={form.autoLift} onChange={(e) => set({ autoLift: e.target.checked })} disabled={!form.expiresAt} />
          {t("gamesAdmin.limits.autoLift")}
        </label>
      </div>
      <p id="agm-exp-hint" className="agm-hint">
        {form.expiresAt ? (form.autoLift ? t("gamesAdmin.limits.untilHintLift") : t("gamesAdmin.limits.untilHintKeep")) : t("gamesAdmin.limits.untilHintNone")}
      </p>
      <div>
        <label className="agm-lab" htmlFor="agm-lim-reason">
          {t("gamesAdmin.reasonRequired")}
        </label>
        <textarea id="agm-lim-reason" className="agm-ta" rows={2} maxLength={REASON_MAX} value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder={t("gamesAdmin.limits.reasonPh")} data-autofocus />
      </div>
      {err ? (
        <p className="agm-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="agm-row">
        <button type="button" className="agm-btn" onClick={onClose} disabled={busy}>
          {t("gamesAdmin.cancel")}
        </button>
        <button type="button" className="agm-btn is-primary" onClick={submit} disabled={!canSave || busy} data-testid="agm-limits-apply">
          <Check size={16} />
          {busy ? t("gamesAdmin.saving") : t("gamesAdmin.limits.apply")}
        </button>
      </div>
    </GDialog>
  );
}

/* ======================= Credits ======================= */

function HistoryList({ playerId, open, refreshKey }) {
  const { t, locale } = useLocale();
  const [kind, setKind] = useState("all");
  const [state, setState] = useState({ loading: true, entries: [], err: "" });
  const [summary, setSummary] = useState({ count: 0, net: 0 });
  useEffect(() => {
    if (!open || !playerId) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, err: "" }));
    const k = kind === "all" ? "" : kind;
    adminFetch(`/credits/players/${playerId}/ledger${qs({ kind: k, limit: 8 })}`)
      .then((r) => {
        if (!live) return;
        const entries = kind === "all" ? (r.entries || []).filter((e) => e.kind !== "game") : r.entries || [];
        setState({ loading: false, entries, err: "" });
      })
      .catch((e) => live && setState({ loading: false, entries: [], err: errorText(t, e) }));
    return () => {
      live = false;
    };
  }, [open, playerId, kind, refreshKey, t]);
  useEffect(() => {
    if (!open || !playerId) return;
    adminFetch(`/credits/players/${playerId}/ledger${qs({ kind: "admin", limit: 100 })}`)
      .then((r) => setSummary(adjustmentSummary(r.entries)))
      .catch(() => {});
  }, [open, playerId, refreshKey]);
  return (
    <>
      <div className="agm-lab">{t("gamesAdmin.credit.history")}</div>
      <div className="agm-mini2">
        <div>
          <b className="tnum">{formatNumber(summary.count, locale)}</b>
          <span>{t("gamesAdmin.credit.adjust30")}</span>
        </div>
        <div>
          <b>
            <Delta value={summary.net} />
          </b>
          <span>{t("gamesAdmin.credit.net")}</span>
        </div>
      </div>
      <div className="agm-hist" aria-busy={state.loading}>
        {state.loading ? (
          [0, 1, 2].map((i) => <Skel key={i} h={46} r={12} style={{ display: "block", marginBottom: 6 }} />)
        ) : state.err ? (
          <p className="agm-err">{state.err}</p>
        ) : !state.entries.length ? (
          <p className="agm-muted agm-empty-s">{t("gamesAdmin.credit.historyEmpty")}</p>
        ) : (
          state.entries.map((e) => <HistoryItem key={e.id} entry={e} />)
        )}
      </div>
      <Seg
        label={t("gamesAdmin.credit.history")}
        value={kind}
        onChange={setKind}
        items={[
          { id: "all", label: t("gamesAdmin.ledger.f_all") },
          { id: "admin", label: t("gamesAdmin.ledger.f_admin") },
          { id: "bonus", label: t("gamesAdmin.ledger.f_bonus") },
          { id: "transfer", label: t("gamesAdmin.ledger.f_transfer") },
        ]}
      />
    </>
  );
}

function HistoryItem({ entry }) {
  const { t, locale } = useLocale();
  const v = ledgerView(entry);
  const Icon = ICONS[v.icon] || Coins;
  const sign = entry.delta > 0 ? "+" : entry.delta < 0 ? "−" : "";
  const title = t(v.titleKey, { ...(v.titleVars || {}), game: v.titleVars?.game ? t(v.titleVars.game) : "", result: v.titleVars?.result ? t(v.titleVars.result) : "" });
  return (
    <div className="agm-hi">
      <span className={`agm-ic is-${v.tone}`} aria-hidden="true">
        <Icon size={16} />
      </span>
      <div>
        <b>
          {sign}
          {formatNumber(Math.abs(entry.delta), locale)} · {title}
        </b>
        <small>{v.parts.map((p) => (p.text != null ? p.text : t(p.key, p.vars))).join(" · ")}</small>
      </div>
      <time dateTime={entry.at}>{formatAppDate(entry.at, locale, { day: "numeric", month: "short", year: undefined })}</time>
    </div>
  );
}

export function CreditDialog({ open, onClose, player, balance, stats, players, onDone }) {
  const { t, locale } = useLocale();
  const [op, setOp] = useState("add");
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState("support");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (open) {
      setOp("add");
      setAmountText("");
      setCategory("support");
      setReason("");
      setNotify(true);
      setErr("");
    }
  }, [open]);
  const amount = parseAmount(amountText);
  const current = Number(balance) || 0;
  const after = previewBalance(current, op, amount);
  const n = (v) => formatNumber(v, locale);
  const canSubmit = canSubmitAdjust({ op, amount: op === "set" && amountText === "" ? -1 : amount, reason });
  const hidden = Boolean(player?.flags?.hidden);
  const rankNow = stats?.rank ?? null;
  const rankNext = rankNow != null && !hidden && players?.length ? rankAfter(players, player?.id, after) : null;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    try {
      const res = await adminFetch(`/credits/players/${player.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ operation: op, amount, reason: reason.trim(), category, notify }),
      });
      setRefreshKey((k) => k + 1);
      onDone?.(res);
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel =
    op === "add"
      ? t("gamesAdmin.credit.submitAdd", { n: n(amount) })
      : op === "remove"
        ? t("gamesAdmin.credit.submitRemove", { n: n(amount) })
        : t("gamesAdmin.credit.submitSet", { n: n(amount) });

  return (
    <GDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Coins}
      tone="amber"
      title={t("gamesAdmin.credit.title", { user: player?.username || "" })}
      subtitle={t("gamesAdmin.credit.subtitle", { balance: n(current), hands: n(stats?.hands || 0), last: stats?.lastPlayedAt ? formatTimeAgo(stats.lastPlayedAt, t, new Date(), locale) : "—" })}
      aside={<HistoryList playerId={player?.id} open={open} refreshKey={refreshKey} />}
      width={620}
      testId="agm-credit"
    >
      <div>
        <div className="agm-lab" id="agm-op-lab">
          {t("gamesAdmin.credit.operation")}
        </div>
        <div className="agm-ops" role="radiogroup" aria-labelledby="agm-op-lab">
          {ADJUST_OPS.map((id) => {
            const Icon = id === "add" ? Plus : id === "remove" ? Minus : SlidersHorizontal;
            return (
              <button key={id} type="button" role="radio" aria-checked={op === id} className={`agm-op is-${id}${op === id ? " is-on" : ""}`} onClick={() => setOp(id)}>
                <Icon size={16} />
                {t(`gamesAdmin.credit.op_${id}`)}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="agm-lab" htmlFor="agm-amount">
          {op === "set" ? t("gamesAdmin.credit.newBalanceLabel") : t("gamesAdmin.credit.amount")}
        </label>
        <div className="agm-amount">
          <input
            id="agm-amount"
            inputMode="numeric"
            autoComplete="off"
            value={amountText === "" ? "" : n(amount)}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            data-autofocus
            data-testid="agm-amount"
          />
          <span>{t("gamesAdmin.credits")}</span>
        </div>
        {op !== "set" ? (
          <div className="agm-chips">
            {ADJUST_PRESETS.map((v) => (
              <button key={v} type="button" className="agm-chipbtn" onClick={() => setAmountText(String(amount + v))} aria-label={t("gamesAdmin.credit.addPreset", { n: n(v) })}>
                +{n(v)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <div className="agm-lab" id="agm-cat-lab">
          {t("gamesAdmin.credit.reasonLabel")}
        </div>
        <div className="agm-pills" role="radiogroup" aria-labelledby="agm-cat-lab">
          {ADJUST_CATEGORIES.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={category === id} className={category === id ? "is-on" : ""} onClick={() => setCategory(id)}>
              {t(`gamesAdmin.category.${id}`)}
            </button>
          ))}
        </div>
        <textarea
          className="agm-ta"
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("gamesAdmin.credit.reasonPh")}
          aria-label={t("gamesAdmin.credit.reasonLabel")}
          style={{ marginTop: 8 }}
          data-testid="agm-credit-reason"
        />
      </div>
      <label className="agm-chk">
        <GlassCheckbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        {t("gamesAdmin.credit.notify")}
      </label>
      <div className="agm-newbal" aria-live="polite">
        <Coins size={18} aria-hidden="true" />
        <span className="agm-muted">{t("gamesAdmin.credit.newBalance")}</span>
        <b className="tnum">{n(current)}</b>
        <ChevronRight size={16} aria-hidden="true" />
        <b className={`tnum ${deltaClass(after - current)}`}>{n(after)}</b>
        {rankNow != null && rankNext != null && rankNext !== rankNow ? <span className="agm-chip is-gray">{t("gamesAdmin.credit.rank", { from: rankNow, to: rankNext })}</span> : null}
      </div>
      <div className="agm-info">
        <Shield size={16} aria-hidden="true" />
        <span>{t("gamesAdmin.credit.pointsOnly")}</span>
      </div>
      {err ? (
        <p className="agm-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="agm-row">
        <button type="button" className="agm-btn" onClick={onClose} disabled={busy}>
          {t("gamesAdmin.cancel")}
        </button>
        <button type="button" className="agm-btn is-primary" onClick={submit} disabled={!canSubmit || busy} data-testid="agm-credit-submit">
          {op === "remove" ? <Minus size={16} /> : <Plus size={16} />}
          {busy ? t("gamesAdmin.saving") : submitLabel}
        </button>
      </div>
    </GDialog>
  );
}

/* ======================= Reason (quick actions) ======================= */

export function ReasonDialog({ open, onClose, icon, tone = "blue", title, subtitle, body, confirmLabel, danger = false, withNotify = false, onSubmit, testId }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setReason("");
      setErr("");
      setNotify(true);
    }
  }, [open]);
  const submit = async () => {
    if (!reasonOk(reason)) return;
    setBusy(true);
    setErr("");
    try {
      await onSubmit(reason.trim(), notify);
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GDialog open={open} onClose={onClose} busy={busy} icon={icon} tone={tone} title={title} subtitle={subtitle} width={520} testId={testId}>
      {body}
      <div>
        <label className="agm-lab" htmlFor="agm-q-reason">
          {t("gamesAdmin.reasonRequired")}
        </label>
        <textarea id="agm-q-reason" className="agm-ta" rows={3} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("gamesAdmin.reasonPh")} data-autofocus />
      </div>
      {withNotify ? (
        <label className="agm-chk">
          <GlassCheckbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          {t("gamesAdmin.credit.notify")}
        </label>
      ) : null}
      {err ? (
        <p className="agm-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="agm-row">
        <button type="button" className="agm-btn" onClick={onClose} disabled={busy}>
          {t("gamesAdmin.cancel")}
        </button>
        <button type="button" className={`agm-btn ${danger ? "is-danger" : "is-primary"}`} onClick={submit} disabled={!reasonOk(reason) || busy} data-testid={testId ? `${testId}-ok` : undefined}>
          {busy ? t("gamesAdmin.saving") : confirmLabel}
        </button>
      </div>
    </GDialog>
  );
}

/* ======================= Notes ======================= */

export function NoteDialog({ open, onClose, player, onDone }) {
  const { t, locale } = useLocale();
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState({ loading: true, list: [], ready: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open || !player?.id) return;
    setBody("");
    setErr("");
    setNotes({ loading: true, list: [], ready: true });
    adminFetch(`/credits/players/${player.id}/notes`)
      .then((r) => setNotes({ loading: false, list: r.notes || [], ready: r.ready !== false }))
      .catch(() => setNotes({ loading: false, list: [], ready: true }));
  }, [open, player?.id]);
  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setErr("");
    try {
      await adminFetch(`/credits/players/${player.id}/notes`, { method: "POST", body: JSON.stringify({ body: text }) });
      onDone?.();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GDialog open={open} onClose={onClose} busy={busy} icon={PenLine} tone="violet" title={t("gamesAdmin.note.title", { user: player?.username || "" })} subtitle={t("gamesAdmin.note.subtitle")} width={540} testId="agm-note">
      {!notes.ready ? <div className="agm-warn">{t("gamesAdmin.err.notesUnavailable")}</div> : null}
      <textarea className="agm-ta" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("gamesAdmin.note.ph")} aria-label={t("gamesAdmin.note.title", { user: player?.username || "" })} data-autofocus />
      {notes.list.length ? (
        <div className="agm-notes">
          <div className="agm-lab">{t("gamesAdmin.note.recent")}</div>
          {notes.list.slice(0, 4).map((nt) => (
            <div key={nt.id} className="agm-note">
              <p>{nt.body}</p>
              <small>
                {nt.authorUsername ? `@${nt.authorUsername} · ` : ""}
                {formatAppDate(nt.at, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit" })}
              </small>
            </div>
          ))}
        </div>
      ) : null}
      {err ? (
        <p className="agm-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="agm-row">
        <button type="button" className="agm-btn" onClick={onClose} disabled={busy}>
          {t("gamesAdmin.cancel")}
        </button>
        <button type="button" className="agm-btn is-primary" onClick={submit} disabled={!body.trim() || busy || !notes.ready}>
          {busy ? t("gamesAdmin.saving") : t("gamesAdmin.note.save")}
        </button>
      </div>
    </GDialog>
  );
}

export { GAvatar };
