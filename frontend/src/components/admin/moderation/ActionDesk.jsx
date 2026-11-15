/**
 * İşlem uygula (Draft A1): 1. Kullanıcı seç (multi-select, filters, search),
 * 2. İşlem türü (Sustur / Yasakla / At, templates, Süre, Kategori, note with
 * variables, the Kademe warning) and the right column: what the user sees
 * (live, ticking) and "Yakında bitiyor".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { Search, Timer, Ban, UserMinus, Layout, Plus, Zap, Eye, Clock, Lock, Check, X } from "../../ui/Icon.jsx";
import { ModAvatar, useNow, durationText, remainingText, categoryText } from "./ModParts.jsx";
import { SaveTemplateDialog } from "./ModDialogs.jsx";
import {
  CANDIDATE_FILTERS,
  CUSTOM,
  FEATURED_CATEGORIES,
  MESSAGE_MAX,
  TIMEOUT_PILLS,
  VARS,
  buildBulkPayload,
  composerError,
  durationSecondsOf,
  elapsedShare,
  fillMessage,
  pillForSeconds,
  toCanonicalTokens,
  toLocalTokens,
  toggleSelection,
  topEscalation,
  userChip,
  userFacts,
} from "./modDeskModel.js";

const ACTION_ICON = { timeout: Timer, ban: Ban, kick: UserMinus };

function UserPicker({ t, selected, setSelected, multi, setMulti }) {
  const [filter, setFilter] = useState("reported");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const term = q.trim();
    const h = setTimeout(
      () => {
        const qs = term ? `q=${encodeURIComponent(term)}` : `filter=${filter}`;
        adminFetch(`/moderation/candidates?${qs}`)
          .then((d) => {
            if (!alive) return;
            setRows(d?.users || []);
            setErr("");
          })
          .catch((e) => alive && (setErr(e?.message || t("modDesk.loadError")), setRows([])));
      },
      term ? 250 : 0
    );
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [filter, q, t]);

  // Selected people stay on top even when the filter would hide them.
  const list = useMemo(() => {
    const base = rows || [];
    const ids = new Set(base.map((u) => u.id));
    return [...selected.filter((u) => !ids.has(u.id)), ...base];
  }, [rows, selected]);

  const toggle = (u) => {
    if (multi) setSelected((cur) => toggleSelection(cur, u));
    else setSelected((cur) => (cur.length === 1 && cur[0].id === u.id ? [] : [u]));
  };

  return (
    <div className="mdk-card mdk-pick">
      <h3>
        <span className="mdk-step">1</span>
        {t("modDesk.pick.title")}
        <button type="button" className="mdk-x" aria-pressed={multi} onClick={() => setMulti(!multi)}>
          {multi ? t("modDesk.pick.multiOn") : t("modDesk.pick.multiOff")}
        </button>
      </h3>
      <label className="mdk-inp">
        <Search size={16} aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modDesk.pick.search")} aria-label={t("modDesk.pick.search")} />
      </label>
      <div className="mdk-pills is-sm is-b" role="group" aria-label={t("modDesk.pick.filters")}>
        {CANDIDATE_FILTERS.map((f) => (
          <button key={f} type="button" className={!q.trim() && filter === f ? "is-on" : ""} aria-pressed={!q.trim() && filter === f} onClick={() => (setQ(""), setFilter(f))}>
            {t(`modDesk.pick.f.${f}`)}
          </button>
        ))}
      </div>
      <div className="mdk-ulist" role="listbox" aria-multiselectable={multi} aria-label={t("modDesk.pick.title")}>
        {rows == null ? (
          [0, 1, 2, 3, 4].map((i) => <div key={i} className="mdk-urow is-skel"><i className="mdk-skel is-av" /><i className="mdk-skel is-line" /></div>)
        ) : list.length === 0 ? (
          <p className="mdk-empty">{err || (q.trim() ? t("modDesk.pick.noMatch") : t(`modDesk.pick.empty.${filter}`))}</p>
        ) : (
          list.map((u) => {
            const on = selected.some((s) => s.id === u.id);
            const chip = userChip(u);
            return (
              <button key={u.id} type="button" role="option" aria-selected={on} className={`mdk-urow${on ? " is-sel" : ""}`} onClick={() => toggle(u)} disabled={u.isAdmin} title={u.isAdmin ? t("modDesk.pick.adminProtected") : undefined}>
                <span className={`mdk-cb${on ? " is-on" : ""}`} aria-hidden="true">{on ? <Check size={11} /> : null}</span>
                <ModAvatar user={u} size={30} />
                <span className="mdk-um">
                  <b>{u.displayName || u.username}</b>
                  <small>
                    @{u.username} · {userFacts(u).map((f) => t(`modDesk.facts.${f.key}`, { count: f.n })).join(" · ")}
                  </small>
                </span>
                {u.isAdmin ? <span className="mdk-chip is-blue is-mini">{t("modDesk.pick.admin")}</span> : null}
                {!u.isAdmin && chip ? (
                  <span className={`mdk-chip is-mini is-${chip.kind === "muted" ? "gold" : "red"}`}>
                    {chip.kind === "nth" ? t("modDesk.chip.nth", { n: chip.n }) : t(`modDesk.chip.${chip.kind}`)}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
      {selected.length ? (
        <div className="mdk-selbar">
          <span>
            <b>{t("modDesk.pick.selected", { count: selected.length })}</b>
            <small>{selected.map((u) => `@${u.username}`).join(", ")}</small>
          </span>
          <button type="button" className="mdk-btn is-xs" onClick={() => setSelected([])}>
            {t("modDesk.pick.clear")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SeeAsUser({ t, action, durationSecs, categoryLabel, message, firstUser, startedAt, locale }) {
  const now = useNow(1000);
  const left = Math.max(0, startedAt + durationSecs * 1000 - now);
  const Icon = ACTION_ICON[action] || Timer;
  return (
    <div className="mdk-card mdk-see">
      <h3>
        <Eye size={16} aria-hidden="true" />
        {t("modDesk.see.title")}
      </h3>
      <div className={`mdk-pv is-${action}`}>
        <div className="mdk-pv-bar">
          <Icon size={16} aria-hidden="true" />
          {action === "timeout" ? (
            <span>
              {t("modDesk.see.mutedFor", { duration: durationText(durationSecs, t) })} · <span className="tnum">{remainingText(left || durationSecs * 1000, t)}</span>
            </span>
          ) : action === "kick" ? (
            <span>{t("modDesk.see.kicked")}</span>
          ) : (
            <span>{t("modDesk.see.banned")}</span>
          )}
        </div>
        <div className="mdk-pv-body">
          {t("modDesk.see.reason", { reason: categoryLabel })}
          {message ? (
            <>
              <br />
              {message}
            </>
          ) : null}
          {!message && firstUser ? (
            <>
              <br />
              <span className="mdk-muted">{t(`modDesk.see.default.${action}`)}</span>
            </>
          ) : null}
          {action === "ban" ? (
            <>
              <br />
              <span className="mdk-muted">{t("modDesk.see.banHint")}</span>
            </>
          ) : null}
        </div>
        <div className="mdk-pv-comp">
          <span>{action === "kick" ? t("modDesk.see.kickComposer") : action === "ban" ? t("modDesk.see.banComposer") : t("modDesk.see.composer")}</span>
          <Lock size={16} aria-hidden="true" />
        </div>
        {action === "timeout" && durationSecs ? (
          <p className="mdk-pv-foot">{t("modDesk.see.until", { at: formatAppDateTime(new Date(startedAt + durationSecs * 1000).toISOString(), locale) })}</p>
        ) : null}
      </div>
    </div>
  );
}

function EndingSoon({ t, items, onLift, onShowAll, meta }) {
  const now = useNow(1000);
  const list = (items || []).filter((i) => i.endsAt && Date.parse(i.endsAt) > now).slice(0, 4);
  return (
    <div className="mdk-card mdk-soon">
      <h3>
        <Clock size={16} aria-hidden="true" />
        {t("modDesk.soon.title")}
        <button type="button" className="mdk-x" onClick={onShowAll}>
          {t("modDesk.soon.all")}
        </button>
      </h3>
      {items == null ? (
        [0, 1, 2].map((i) => <div key={i} className="mdk-srow is-skel"><i className="mdk-skel is-av" /><i className="mdk-skel is-line" /></div>)
      ) : !list.length ? (
        <p className="mdk-empty">{t("modDesk.soon.empty")}</p>
      ) : (
        list.map((it) => {
          const share = elapsedShare(it.startedAt, it.endsAt, now);
          const red = it.type === "ban";
          return (
            <div key={it.key} className="mdk-srow">
              <ModAvatar user={it.user} size={28} />
              <div className="mdk-sm">
                <b>@{it.user.username}</b>
                <small>
                  {t(`modDesk.type.${it.type}`)} · {categoryText(it.category, t, meta?.categories)}
                </small>
                <div className="mdk-pb">
                  <i style={{ width: `${Math.round(share * 100)}%` }} className={red ? "is-red" : "is-amber"} />
                </div>
              </div>
              <div className="mdk-sr">
                <div className={`mdk-cd tnum${red ? " is-red" : ""}`}>{remainingText(Date.parse(it.endsAt) - now, t)}</div>
                <button type="button" className="mdk-link-muted" onClick={() => onLift(it)}>
                  {t("modDesk.soon.lift")}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function ActionDesk({ meta, selected, setSelected, prefill, summary, epoch, onChanged, onToast, onBan, onLift, onShowAll, onOpenRules }) {
  const { t, locale } = useLocale();
  const [multi, setMulti] = useState(true);
  const [action, setAction] = useState("timeout");
  const [durationId, setDurationId] = useState("1h");
  const [customMinutes, setCustomMinutes] = useState("");
  const [category, setCategory] = useState("spam");
  const [otherText, setOtherText] = useState("");
  const [allCats, setAllCats] = useState(false);
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [tplReady, setTplReady] = useState(true);
  const [saveTpl, setSaveTpl] = useState(false);
  const [escalations, setEscalations] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [flaggedId, setFlaggedId] = useState(null);
  const [previewStart, setPreviewStart] = useState(() => Date.now());
  const msgRef = useRef(null);

  const varNames = useMemo(() => Object.fromEntries(VARS.map((v) => [v, t(`modDesk.var.${v}`)])), [t]);
  const categories = meta?.categories || [];
  const restCategories = useMemo(() => categories.filter((c) => !FEATURED_CATEGORIES.includes(c.id)), [categories]);
  const durationSecs = action === "timeout" ? durationSecondsOf(durationId, customMinutes) : 0;

  const loadTemplates = useCallback(() => {
    adminFetch("/moderation/templates")
      .then((d) => {
        setTemplates(d?.templates || []);
        setTplReady(d?.ready !== false);
      })
      .catch(() => setTemplates([]));
  }, []);
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates, epoch]);

  // Defaults handed over from the flagged queue ("Sustur" on a message).
  useEffect(() => {
    if (!prefill) return;
    if (prefill.action) setAction(prefill.action);
    if (prefill.category && categories.some((c) => c.id === prefill.category)) setCategory(prefill.category);
    else if (prefill.category) setCategory("language");
    setFlaggedId(prefill.flaggedId || null);
    setResult(null);
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPreviewStart(Date.now());
  }, [durationId, customMinutes, action]);

  // Kademe kuralları: ask the server what the rules say for the selected people.
  useEffect(() => {
    if (!selected.length || action === "ban" || !category) {
      setEscalations([]);
      return undefined;
    }
    let alive = true;
    const h = setTimeout(() => {
      const ids = selected.map((u) => u.id).join(",");
      const secs = action === "timeout" ? durationSecs : "";
      adminFetch(`/moderation/escalation?userIds=${ids}&category=${encodeURIComponent(category)}&action=${action}&seconds=${secs}`)
        .then((d) => alive && setEscalations(d?.items || []))
        .catch(() => alive && setEscalations([]));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [selected, category, action, durationSecs, epoch]);

  const esc = topEscalation(escalations);
  const escUser = esc ? selected.find((u) => u.id === esc.userId) : null;
  const catLabel = category === "other" && otherText.trim() ? otherText.trim() : categoryText(category, t, categories);

  const labelFor = useCallback(
    (u) => ({
      user: u?.displayName || u?.username || "",
      duration: action === "timeout" ? durationText(durationSecs, t) : "",
      category: catLabel,
      until: action === "timeout" && durationSecs ? formatAppDateTime(new Date(Date.now() + durationSecs * 1000).toISOString(), locale) : "",
    }),
    [action, durationSecs, t, catLabel, locale]
  );
  const previewMessage = message.trim() ? fillMessage(message, labelFor(selected[0] || { username: t("modDesk.see.sampleUser") }), varNames) : "";

  const applyTemplate = (tpl) => {
    setTemplateId(tpl.id);
    setAction(tpl.action);
    if (categories.length === 0 || categories.some((c) => c.id === tpl.category)) setCategory(tpl.category);
    if (tpl.action === "timeout") {
      const pill = tpl.presetId && TIMEOUT_PILLS.includes(tpl.presetId) ? tpl.presetId : pillForSeconds(tpl.durationSeconds);
      setDurationId(pill);
      if (pill === CUSTOM) setCustomMinutes(String(Math.round((tpl.durationSeconds || 0) / 60)));
    }
    setMessage(tpl.message ? toLocalTokens(tpl.message, varNames) : t(`modDesk.tplMsg.${tpl.action}`, { user: `{${varNames.user}}`, duration: `{${varNames.duration}}`, category: `{${varNames.category}}` }));
  };

  const removeTemplate = async (tpl) => {
    try {
      await adminFetch(`/moderation/templates/${tpl.id}`, { method: "DELETE" });
      if (templateId === tpl.id) setTemplateId(null);
      loadTemplates();
    } catch (e) {
      setErr(e?.message || t("modDesk.actionFailed"));
    }
  };

  const insertVar = (v) => {
    const token = `{${varNames[v]}}`;
    const el = msgRef.current;
    if (!el) return setMessage((m) => `${m}${token}`);
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = `${message.slice(0, start)}${token}${message.slice(end)}`.slice(0, MESSAGE_MAX);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const reset = () => {
    setSelected([]);
    setMessage("");
    setOtherText("");
    setTemplateId(null);
    setFlaggedId(null);
    setErr("");
    setResult(null);
  };

  const problem = composerError({ action, users: selected, category, otherText, durationId, customMinutes });

  const submit = async () => {
    if (problem) {
      setErr(t(`modDesk.err.${problem}`));
      return;
    }
    setErr("");
    if (action === "ban") {
      const tpl = message;
      onBan(selected, { category: category === "other" ? null : category, messageFor: (u) => (tpl.trim() ? fillMessage(tpl, labelFor(u), varNames).trim().slice(0, MESSAGE_MAX) : ""), flaggedId });
      return;
    }
    setBusy(true);
    try {
      const body = buildBulkPayload({ action, users: selected, category, otherText, durationId, customMinutes, message: toCanonicalTokens(message, varNames), templateId, flaggedId, names: varNames, labelFor });
      const res = await adminFetch("/moderation/bulk", { method: "POST", body: JSON.stringify(body) });
      const ok = (res?.results || []).filter((r) => r.ok);
      const failed = (res?.results || []).filter((r) => !r.ok);
      const suggestions = ok.filter((r) => r.escalation?.outcome === "suggested").map((r) => ({ ...r.escalation, user: selected.find((u) => u.id === r.userId) }));
      setResult({ ok: ok.length, failed: failed.map((f) => ({ ...f, user: selected.find((u) => u.id === f.userId) })), suggestions });
      if (ok.length) {
        onToast(action === "timeout" ? t("modDesk.done.timeout", { count: ok.length, duration: durationText(durationSecs, t) }) : t("modDesk.done.kick", { count: ok.length }));
        setSelected((cur) => cur.filter((u) => !ok.some((r) => r.userId === u.id)));
        setFlaggedId(null);
        onChanged();
      }
    } catch (e) {
      setErr(e?.message || t("modDesk.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const n = selected.length;
  const primaryLabel =
    action === "timeout"
      ? n
        ? t("modDesk.cta.timeout", { count: n, duration: durationText(durationSecs || 0, t) })
        : t("modDesk.cta.timeoutNone")
      : action === "kick"
        ? n
          ? t("modDesk.cta.kick", { count: n })
          : t("modDesk.cta.kickNone")
        : n
          ? t("modDesk.cta.ban", { count: n })
          : t("modDesk.cta.banNone");
  const PrimaryIcon = ACTION_ICON[action];

  return (
    <div className="mdk-cols is-apply">
      <UserPicker t={t} selected={selected} setSelected={setSelected} multi={multi} setMulti={setMulti} />

      <div className="mdk-card mdk-composer">
        <h3>
          <span className="mdk-step">2</span>
          {t("modDesk.comp.title")}
          <button type="button" className="mdk-x" onClick={onOpenRules}>
            {t("modDesk.comp.rules")}
          </button>
        </h3>
        <div className="mdk-seg" role="radiogroup" aria-label={t("modDesk.comp.title")}>
          {["timeout", "ban", "kick"].map((a) => {
            const Icon = ACTION_ICON[a];
            return (
              <button key={a} type="button" role="radio" aria-checked={action === a} className={action === a ? `is-on is-${a}` : ""} onClick={() => setAction(a)}>
                <Icon size={16} aria-hidden="true" />
                {t(`modDesk.act.${a}`)}
                {a === "ban" ? <small>{t("modDesk.act.banHint")}</small> : null}
              </button>
            );
          })}
        </div>

        <div>
          <div className="mdk-lab">{t("modDesk.comp.templates")}</div>
          <div className="mdk-tpl">
            {templates == null ? <i className="mdk-skel is-pill" /> : null}
            {(templates || []).map((tpl) => (
              <span key={tpl.id} className={`mdk-tpl-chip${templateId === tpl.id ? " is-on" : ""}`}>
                <button type="button" onClick={() => applyTemplate(tpl)} aria-pressed={templateId === tpl.id}>
                  <Layout size={16} aria-hidden="true" />
                  {tpl.name || `${categoryText(tpl.category, t, categories)} · ${tpl.action === "timeout" ? durationText(tpl.durationSeconds, t) : t(`modDesk.act.${tpl.action}`)}`}
                </button>
                <button type="button" className="mdk-tpl-x" aria-label={t("modDesk.comp.tplDelete")} onClick={() => removeTemplate(tpl)}>
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <button type="button" className="mdk-tpl-add" onClick={() => setSaveTpl(true)} disabled={!tplReady} title={!tplReady ? t("modDesk.notReady") : undefined}>
              <Plus size={16} aria-hidden="true" />
              {t("modDesk.comp.tplSave")}
            </button>
          </div>
        </div>

        {action === "timeout" ? (
          <div>
            <div className="mdk-lab">{t("modDesk.comp.duration")}</div>
            <div className="mdk-pills is-sm" role="group" aria-label={t("modDesk.comp.duration")}>
              {TIMEOUT_PILLS.map((id) => (
                <button key={id} type="button" className={durationId === id ? "is-on" : ""} aria-pressed={durationId === id} onClick={() => setDurationId(id)}>
                  {t(`modDesk.pill.${id}`)}
                </button>
              ))}
              <button type="button" className={durationId === CUSTOM ? "is-on" : ""} aria-pressed={durationId === CUSTOM} onClick={() => setDurationId(CUSTOM)}>
                {t("modDesk.pill.custom")}
              </button>
              {durationId === CUSTOM ? (
                <label className="mdk-mini-inp">
                  <input type="number" min={1} inputMode="numeric" value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} placeholder="60" aria-label={t("modDesk.comp.minutes")} autoFocus />
                  <span>{t("modDesk.comp.minutes")}</span>
                </label>
              ) : null}
            </div>
          </div>
        ) : null}

        <div>
          <div className="mdk-lab">{t("modDesk.comp.category")}</div>
          <div className="mdk-pills is-sm is-b" role="group" aria-label={t("modDesk.comp.category")}>
            {FEATURED_CATEGORIES.map((id) => (
              <button key={id} type="button" className={category === id ? "is-on" : ""} aria-pressed={category === id} onClick={() => setCategory(id)}>
                {categoryText(id, t, categories)}
              </button>
            ))}
            {allCats
              ? restCategories.map((c) => (
                  <button key={c.id} type="button" className={category === c.id ? "is-on" : ""} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                    {categoryText(c.id, t, categories)}
                  </button>
                ))
              : null}
            <button type="button" className={!allCats && !FEATURED_CATEGORIES.includes(category) ? "is-on" : ""} aria-expanded={allCats} onClick={() => setAllCats((v) => !v)}>
              {allCats ? t("modDesk.comp.fewerCats") : t("modDesk.comp.allCats", { count: categories.length || 30 })}
            </button>
          </div>
          {category === "other" ? (
            <input className="mdk-field mdk-other" value={otherText} onChange={(e) => setOtherText(e.target.value)} maxLength={200} placeholder={t("modDesk.comp.otherPh")} aria-label={t("modDesk.comp.otherPh")} />
          ) : null}
        </div>

        <div>
          <label className="mdk-lab" htmlFor="mdk-msg">
            {t("modDesk.comp.message")}
          </label>
          <textarea id="mdk-msg" ref={msgRef} className="mdk-field mdk-ta" value={message} maxLength={MESSAGE_MAX} rows={2} onChange={(e) => setMessage(e.target.value)} placeholder={t(`modDesk.comp.messagePh.${action}`)} />
          <div className="mdk-vars" role="group" aria-label={t("modDesk.comp.vars")}>
            {VARS.map((v) => (
              <button key={v} type="button" onClick={() => insertVar(v)}>{`{${varNames[v]}}`}</button>
            ))}
          </div>
        </div>

        {esc && escUser ? (
          <div className="mdk-esc" role="note">
            <Zap size={16} aria-hidden="true" />
            <div>
              <b>
                {t(esc.windowDays === 30 ? `modDesk.esc.title30.${action}` : `modDesk.esc.title.${action}`, { user: `@${escUser.username}`, n: esc.nth, days: esc.windowDays })}
              </b>
              <br />
              {t("modDesk.esc.body", { rule: esc.ruleName || t("modDesk.rules.suggestedName"), step: stepText(esc.step, t) })}
            </div>
            {esc.step.kind === "ban" ? (
              <button type="button" className="mdk-btn is-red is-xs" onClick={() => onBan([escUser], { category, message: "" })}>
                <Ban size={14} aria-hidden="true" />
                {t("modDesk.esc.toBan")}
              </button>
            ) : esc.step.kind === "timeout" ? (
              <button type="button" className="mdk-btn is-xs" onClick={() => (setAction("timeout"), setDurationId(pillForSeconds(esc.step.seconds)), pillForSeconds(esc.step.seconds) === CUSTOM && setCustomMinutes(String(Math.round(esc.step.seconds / 60))))}>
                {t("modDesk.esc.useStep")}
              </button>
            ) : null}
          </div>
        ) : null}

        {result && (result.failed.length || result.suggestions.length) ? (
          <div className="mdk-result" role="status">
            {result.failed.map((f) => (
              <p key={f.userId}>{t(`modDesk.fail.${f.code === "ADMIN_PROTECTED" || f.code === "SELF" ? f.code : "other"}`, { user: `@${f.user?.username || "?"}` })}</p>
            ))}
            {result.suggestions.map((s) => (
              <p key={s.user?.id || s.ruleId}>
                {t("modDesk.esc.after", { user: `@${s.user?.username || "?"}`, step: stepText(s.step, t) })}{" "}
                <button type="button" className="mdk-link" onClick={() => onBan([s.user], { category })}>
                  {t("modDesk.esc.toBan")}
                </button>
              </p>
            ))}
          </div>
        ) : null}

        {err ? (
          <p className="mdk-err" role="alert">
            {err}
          </p>
        ) : null}

        <div className="mdk-row">
          <button type="button" className="mdk-btn is-ghost" onClick={reset} disabled={busy}>
            {t("modDesk.cancel")}
          </button>
          <button type="button" className={`mdk-btn is-big is-${action}`} onClick={submit} disabled={busy || !n}>
            <PrimaryIcon size={16} aria-hidden="true" />
            {busy ? t("modDesk.working") : primaryLabel}
          </button>
        </div>
      </div>

      <div className="mdk-side">
        <SeeAsUser t={t} locale={locale} action={action} durationSecs={durationSecs || 3600} categoryLabel={catLabel} message={previewMessage} firstUser={selected[0]} startedAt={previewStart} />
        <EndingSoon t={t} items={summary ? summary.endingSoon : null} onLift={onLift} onShowAll={onShowAll} meta={meta} />
      </div>

      <SaveTemplateDialog
        open={saveTpl}
        defaults={{ action, category, durationSeconds: action === "timeout" ? durationSecs : null, presetId: action === "timeout" && durationId !== CUSTOM ? durationId : null, message: toCanonicalTokens(message, varNames), suggestedName: `${catLabel} · ${action === "timeout" ? durationText(durationSecs, t) : t(`modDesk.act.${action}`)}` }}
        onClose={() => setSaveTpl(false)}
        onSaved={(tpl) => {
          setSaveTpl(false);
          setTemplateId(tpl?.id || null);
          loadTemplates();
          onToast(t("modDesk.tpl.saved"));
        }}
      />
    </div>
  );
}

/** "24 saat yasak", "30 dk susturma", "kalıcı yasak", "uyarı", "atma". */
export function stepText(step, t) {
  if (!step) return "";
  if (step.kind === "warn") return t("modDesk.stepText.warn");
  if (step.kind === "kick") return t("modDesk.stepText.kick");
  if (step.kind === "ban") return step.seconds == null ? t("modDesk.stepText.banPermanent") : t("modDesk.stepText.ban", { duration: durationText(step.seconds, t) });
  return t("modDesk.stepText.timeout", { duration: durationText(step.seconds, t) });
}
