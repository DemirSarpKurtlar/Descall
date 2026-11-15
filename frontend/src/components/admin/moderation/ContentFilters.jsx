/**
 * İçerik filtreleri (Draft A3): İşaretli mesajlar with the conversation around
 * each one (Bağlam, audited) and one-click decisions, next to the Kelime filtresi
 * (rules with kind / severity / language / action, 7-day sparks, a live test
 * box and the weekly numbers). The word filter is the single source of filter
 * words for the whole app (the old System box writes the same rules).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Flag, Filter, Check, Trash2, Timer, Ban, MessageSquare } from "../../ui/Icon.jsx";
import DossierMenu from "../dossier/DossierMenu.jsx";
import { ModAvatar, Chip, Select, Highlighted, categoryText, durationText } from "./ModParts.jsx";
import { RULE_ACTIONS, RULE_KINDS, SEVERITIES, detectKind, highlightSegments, languageTabs, oldestParts, sevTone, sparkHeights } from "./modDeskModel.js";

const QUEUE_FILTERS = [
  { id: "pending", status: "pending", source: "all" },
  { id: "filter", status: "pending", source: "filter" },
  { id: "user_report", status: "pending", source: "user_report" },
  { id: "decided", status: "decided", source: "all" },
];

function whereLine(item, t, locale) {
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt));
  if (item.source === "user_report") {
    const ctx = t(`modDesk.flag.ctx.${item.convType}`);
    return `${ctx}${item.reporter?.username ? ` · ${t("modDesk.flag.reportedBy", { user: `@${item.reporter.username}` })}` : ""} · ${time}`;
  }
  return `${item.where || t(`modDesk.flag.ctx.${item.convType}`)} · ${time}`;
}

function sourceChip(item, t, cats) {
  if (item.source === "user_report") return { tone: "gold", text: t("modDesk.flag.src.userReport") };
  if (item.source === "admin") return { tone: "blue", text: t("modDesk.flag.src.admin") };
  if (item.ruleKind === "regex") return { tone: "red", text: `${t("modDesk.flag.src.regex")} · ${categoryText(item.category, t, cats)}` };
  return { tone: item.severity === "low" ? "gold" : "red", text: `${t("modDesk.flag.src.filter")} · ${t(`modDesk.sev.${item.severity || "medium"}`)}` };
}

function FlagCard({ item, t, locale, cats, autoContext, onDecide, onTimeout, onBan, busy }) {
  const [ctx, setCtx] = useState(null); // null | "loading" | [] | messages
  const [ctxErr, setCtxErr] = useState("");
  const chip = sourceChip(item, t, cats);
  const decided = item.status !== "pending";

  const loadContext = useCallback(() => {
    setCtx("loading");
    adminFetch(`/moderation/flagged/${encodeURIComponent(item.id)}/context`)
      .then((d) => {
        setCtx(d?.messages || []);
        setCtxErr("");
      })
      .catch((e) => {
        setCtx(null);
        setCtxErr(e?.message || t("modDesk.loadError"));
      });
  }, [item.id, t]);

  useEffect(() => {
    if (autoContext && item.canContext) loadContext();
  }, [autoContext, item.canContext, loadContext]);

  const hm = (iso) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <article className="mdk-msg" aria-label={`@${item.author?.username || "?"}`}>
      <div className="mdk-mh">
        <ModAvatar user={item.author} size={24} />
        <b>@{item.author?.username || "?"}</b>
        <small>{whereLine(item, t, locale)}</small>
        <span className="mdk-mh-chips">
          {item.blocked ? <Chip tone="gray">{t("modDesk.flag.blocked")}</Chip> : null}
          <Chip tone={chip.tone}>{chip.text}</Chip>
        </span>
      </div>
      <div className="mdk-mt">
        <Highlighted segments={highlightSegments(item.content, item.matches)} />
      </div>
      {Array.isArray(ctx) && ctx.length ? (
        <div className="mdk-ctx" aria-label={t("modDesk.flag.context")}>
          {ctx.map((m) => (
            <span key={m.id} className={m.flagged ? "is-me" : ""}>
              <b>@{m.author?.username || "?"}</b> {hm(m.createdAt)} · {m.flagged ? t("modDesk.flag.thisMessage") : m.content || t("modDesk.flag.noText")}
            </span>
          ))}
        </div>
      ) : null}
      {Array.isArray(ctx) && !ctx.length ? <p className="mdk-ctx-note">{t("modDesk.flag.noContext")}</p> : null}
      {ctxErr ? <p className="mdk-err">{ctxErr}</p> : null}
      {decided ? (
        <p className="mdk-decided">
          {t(`modDesk.flag.status.${item.status}`)}
          {item.decidedBy?.username ? ` · @${item.decidedBy.username}` : ""}
        </p>
      ) : (
        <div className="mdk-mact">
          <button type="button" className="mdk-btn is-xs" disabled={busy} onClick={() => onDecide(item, "approve")}>
            <Check size={14} aria-hidden="true" />
            {t("modDesk.flag.approve")}
          </button>
          <button type="button" className="mdk-btn is-xs" disabled={busy || !item.canRemove} title={!item.canRemove ? t("modDesk.flag.cantRemove") : undefined} onClick={() => onDecide(item, "remove")}>
            <Trash2 size={14} aria-hidden="true" />
            {t("modDesk.flag.remove")}
          </button>
          <button type="button" className="mdk-btn is-xs is-amber-text" disabled={busy} onClick={() => onTimeout(item)}>
            <Timer size={14} aria-hidden="true" />
            {t("modDesk.act.timeout")}
          </button>
          <button type="button" className="mdk-btn is-xs is-red-text" disabled={busy} onClick={() => onBan(item)}>
            <Ban size={14} aria-hidden="true" />
            {t("modDesk.act.ban")}
          </button>
          {item.canContext && !Array.isArray(ctx) ? (
            <button type="button" className="mdk-btn is-xs" disabled={ctx === "loading"} onClick={loadContext}>
              <MessageSquare size={14} aria-hidden="true" />
              {ctx === "loading" ? t("modDesk.loading") : t("modDesk.flag.context")}
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}

function FlaggedQueue({ t, locale, meta, epoch, summary, onChanged, onToast, onTimeout, onBan }) {
  const [filter, setFilter] = useState("pending");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const cats = meta?.categories || [];

  const load = useCallback(() => {
    const f = QUEUE_FILTERS.find((x) => x.id === filter) || QUEUE_FILTERS[0];
    adminFetch(`/moderation/flagged?status=${f.status}&source=${f.source}`)
      .then((d) => {
        setData(d || { items: [] });
        setErr("");
      })
      .catch((e) => {
        setErr(e?.message || t("modDesk.loadError"));
        setData((cur) => cur || { items: [], ready: true });
      });
  }, [filter, t]);
  useEffect(() => {
    load();
  }, [load, epoch]);

  const decide = async (item, decision) => {
    setBusyId(item.id);
    const before = data;
    setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== item.id) } : d)); // optimistic
    try {
      await adminFetch(`/moderation/flagged/${encodeURIComponent(item.id)}/decide`, { method: "POST", body: JSON.stringify({ decision }) });
      onToast(t(`modDesk.flag.done.${decision}`, { user: `@${item.author?.username || "?"}` }));
      onChanged();
    } catch (e) {
      setData(before);
      onToast(e?.message || t("modDesk.actionFailed"), "red");
    } finally {
      setBusyId(null);
    }
  };

  const pending = summary?.flaggedPending ?? null;
  const oldest = oldestParts(summary?.flaggedOldestAt);
  const items = data?.items || [];
  const firstWithContext = items.find((i) => i.canContext && i.status === "pending")?.id;

  return (
    <div className="mdk-card mdk-queue-card">
      <h3>
        <Flag size={16} aria-hidden="true" />
        {t("modDesk.flag.title")}
        {pending != null ? (
          <span className="mdk-x is-static">
            {t("modDesk.flag.pending", { count: pending })}
            {oldest ? ` · ${t("modDesk.flag.oldest", { age: t(`modDesk.du.${oldest.unit}`, { n: oldest.n }) })}` : ""}
          </span>
        ) : null}
      </h3>
      <div className="mdk-pills is-sm is-b" role="group" aria-label={t("modDesk.flag.title")}>
        {QUEUE_FILTERS.map((f) => (
          <button key={f.id} type="button" className={filter === f.id ? "is-on" : ""} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {t(`modDesk.flag.f.${f.id}`)}
          </button>
        ))}
      </div>
      {data && data.ready === false ? <p className="mdk-note">{t("modDesk.flag.notReady")}</p> : null}
      {err ? (
        <p className="mdk-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mdk-msgs">
        {data == null ? (
          [0, 1, 2].map((i) => <div key={i} className="mdk-msg is-skel"><i className="mdk-skel is-line" /><i className="mdk-skel is-line" /></div>)
        ) : !items.length ? (
          <p className="mdk-empty">{t(`modDesk.flag.empty.${filter}`)}</p>
        ) : (
          items.map((item) => (
            <FlagCard
              key={item.id}
              item={item}
              t={t}
              locale={locale}
              cats={cats}
              busy={busyId === item.id}
              autoContext={item.id === firstWithContext}
              onDecide={decide}
              onTimeout={(it) => onTimeout(it.author, { category: it.category, flaggedId: it.id })}
              onBan={(it) => onBan([it.author], { category: it.category, flaggedId: it.id })}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RuleRow({ rule, t, onPatch, onRemove }) {
  const sevRef = useRef(null);
  const actRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const heights = sparkHeights(rule.spark);
  return (
    <div className="mdk-trw mdk-wrow" role="row">
      <span className="mdk-cell mdk-mono" role="cell" title={rule.display}>
        {rule.display}
      </span>
      <span className="mdk-cell mdk-muted" role="cell">{t(`modDesk.kind.${rule.kind}`)}</span>
      <span role="cell">
        <button ref={sevRef} type="button" className={`mdk-sev is-${sevTone(rule.severity)}`} aria-haspopup="menu" aria-expanded={menu === "sev"} onClick={() => setMenu("sev")}>
          {t(`modDesk.sev.${rule.severity}`)}
        </button>
      </span>
      <span role="cell">
        <button ref={actRef} type="button" className="mdk-act-btn" aria-haspopup="menu" aria-expanded={menu === "act"} onClick={() => setMenu("act")}>
          {t(`modDesk.ruleAction.${rule.action}`)}
        </button>
      </span>
      <span className="mdk-spark-cell" role="cell" title={t("modDesk.wf.hits7d", { count: rule.hits7d })}>
        <span className="mdk-spark" aria-hidden="true">
          {heights.map((h, i) => (
            <i key={i} style={{ height: `${h}%` }} />
          ))}
        </span>
        <b className="tnum">{rule.hits7d}</b>
      </span>
      <span role="cell">
        <button type="button" className="mdk-ib" aria-label={t("modDesk.wf.remove", { rule: rule.display })} onClick={() => onRemove(rule)}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </span>
      <DossierMenu
        open={menu === "sev"}
        anchorRef={sevRef}
        onClose={() => setMenu(null)}
        label={t("modDesk.wf.severity")}
        width={200}
        items={SEVERITIES.map((s) => ({ id: s, label: t(`modDesk.sev.${s}`), icon: s === rule.severity ? Check : undefined, onSelect: () => onPatch(rule, { severity: s }) }))}
      />
      <DossierMenu
        open={menu === "act"}
        anchorRef={actRef}
        onClose={() => setMenu(null)}
        label={t("modDesk.wf.col.action")}
        width={280}
        items={RULE_ACTIONS.map((a) => ({ id: a, label: t(`modDesk.ruleAction.${a}`), sub: t(`modDesk.ruleActionSub.${a}`), icon: a === rule.action ? Check : undefined, onSelect: () => onPatch(rule, { action: a }) }))}
      />
    </div>
  );
}

function TestBox({ t, epoch }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  useEffect(() => {
    const value = text;
    if (!value.trim()) {
      setRes(null);
      return undefined;
    }
    let alive = true;
    const h = setTimeout(() => {
      adminFetch(`/moderation/filter/test?text=${encodeURIComponent(value.slice(0, 1500))}`)
        .then((d) => alive && setRes({ ...d, text: value }))
        .catch(() => alive && setRes(null));
    }, 220);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [text, epoch]);
  const segs = highlightSegments(text, res && res.text === text ? res.matches : []);
  const v = res?.verdict;
  return (
    <div>
      <label className="mdk-lab" htmlFor="mdk-testbox">
        {t("modDesk.wf.test")}
      </label>
      <div className="mdk-testbox">
        <div className="mdk-test-mirror" aria-hidden="true">
          <Highlighted segments={segs} />
          {"​"}
        </div>
        <textarea id="mdk-testbox" value={text} rows={1} spellCheck={false} onChange={(e) => setText(e.target.value)} placeholder={t("modDesk.wf.testPh")} />
      </div>
      <div className="mdk-res" aria-live="polite">
        {text.trim() ? (
          v ? (
            <>
              <span className={`mdk-sev is-${sevTone(v.severity)}`}>{t("modDesk.wf.matches", { count: v.count })}</span>
              <span>
                {t("modDesk.wf.verdict", { severity: t(`modDesk.sev.${v.severity}`), outcome: t(`modDesk.outcome.${v.action}`, { duration: durationText(v.timeoutSeconds || 3600, t) }) })}
              </span>
            </>
          ) : (
            <>
              <span className="mdk-sev is-ok">{t("modDesk.wf.noMatch")}</span>
              <span>{t("modDesk.wf.clean")}</span>
            </>
          )
        ) : (
          <span className="mdk-muted">{t("modDesk.wf.testHint")}</span>
        )}
      </div>
    </div>
  );
}

function WordFilter({ t, epoch, onToast }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [lang, setLang] = useState("tr");
  const [input, setInput] = useState("");
  const [kind, setKind] = useState("auto");
  const [severity, setSeverity] = useState("high");
  const [busy, setBusy] = useState(false);
  const [addErr, setAddErr] = useState("");

  const load = useCallback(() => {
    adminFetch("/moderation/filter")
      .then((d) => {
        setData(d);
        setErr("");
      })
      .catch((e) => setErr(e?.message || t("modDesk.loadError")));
  }, [t]);
  useEffect(() => {
    load();
  }, [load, epoch]);

  const tabs = languageTabs(data?.counts?.byLanguage);
  const rules = useMemo(() => (data?.rules || []).filter((r) => r.language === lang).sort((a, b) => b.hits7d - a.hits7d || (a.source === "default") - (b.source === "default")), [data, lang]);
  const ready = data?.ready !== false;
  const effectiveKind = kind === "auto" ? detectKind(input) : kind;

  const add = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setAddErr("");
    try {
      await adminFetch("/moderation/filter/rules", { method: "POST", body: JSON.stringify({ pattern: input, kind: effectiveKind, severity, language: lang }) });
      setInput("");
      setKind("auto");
      onToast(t("modDesk.wf.added"));
      load();
    } catch (e) {
      const code = String(e?.code || "");
      setAddErr(code.startsWith("RULE_") ? t(`modDesk.wf.err.${code}`) : e?.message || t("modDesk.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (rule, body) => {
    setData((d) => (d ? { ...d, rules: d.rules.map((r) => (r.id === rule.id ? { ...r, ...body } : r)) } : d));
    try {
      await adminFetch(`/moderation/filter/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      onToast(e?.message || t("modDesk.actionFailed"), "red");
      load();
    }
  };

  const remove = async (rule) => {
    const before = data;
    setData((d) => (d ? { ...d, rules: d.rules.filter((r) => r.id !== rule.id) } : d));
    try {
      await adminFetch(`/moderation/filter/rules/${rule.id}`, { method: "DELETE" });
      onToast(t("modDesk.wf.removed", { rule: rule.display }));
      load();
    } catch (e) {
      setData(before);
      onToast(e?.message || t("modDesk.actionFailed"), "red");
    }
  };

  const stats = data?.stats || {};
  const fp = stats.falsePositiveRate == null ? "–" : t("modDesk.wf.percent", { n: Math.round(stats.falsePositiveRate * 100) });

  return (
    <div className="mdk-card mdk-wf">
      <h3>
        <Filter size={16} aria-hidden="true" />
        {t("modDesk.wf.title")}
        {data ? <span className="mdk-x is-static">{t("modDesk.wf.counts", { defaults: data.counts.defaults, admin: data.counts.admin })}</span> : null}
      </h3>
      {!ready ? <p className="mdk-note">{t("modDesk.wf.notReady")}</p> : null}
      {err ? (
        <p className="mdk-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mdk-lt" role="tablist" aria-label={t("modDesk.wf.language")}>
        {tabs.map((tb) => (
          <button key={tb.id} type="button" role="tab" aria-selected={lang === tb.id} className={lang === tb.id ? "is-on" : ""} onClick={() => setLang(tb.id)}>
            {t(`modDesk.lang.${tb.id}`)}
            <em>{tb.count}</em>
          </button>
        ))}
      </div>
      <div className="mdk-addrow">
        <input
          className="mdk-field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("modDesk.wf.inputPh")}
          aria-label={t("modDesk.wf.inputPh")}
          disabled={!ready}
          spellCheck={false}
        />
        <Select
          value={kind === "auto" ? effectiveKind : kind}
          onChange={setKind}
          label={t("modDesk.wf.col.kind")}
          width={200}
          disabled={!ready}
          options={RULE_KINDS.map((k) => ({ id: k, label: t(`modDesk.kind.${k}`) }))}
        />
        <Select value={severity} onChange={setSeverity} label={t("modDesk.wf.severity")} prefix={t("modDesk.wf.severity")} width={200} disabled={!ready} options={SEVERITIES.map((s) => ({ id: s, label: t(`modDesk.sev.${s}`) }))} />
        <button type="button" className="mdk-btn is-primary" onClick={add} disabled={!ready || busy || !input.trim()}>
          {t("modDesk.wf.add")}
        </button>
      </div>
      {addErr ? (
        <p className="mdk-err" role="alert">
          {addErr}
        </p>
      ) : null}
      <div className="mdk-table is-words" role="table" aria-label={t("modDesk.wf.title")}>
        <div className="mdk-th mdk-wrow" role="row">
          {["expr", "kind", "severity", "action", "week"].map((c) => (
            <span key={c} role="columnheader">{t(`modDesk.wf.col.${c}`)}</span>
          ))}
          <span />
        </div>
        <div className="mdk-wlist">
          {data == null ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="mdk-trw mdk-wrow is-skel"><i className="mdk-skel is-line" /></div>)
          ) : !rules.length ? (
            <p className="mdk-empty">{t("modDesk.wf.empty")}</p>
          ) : (
            rules.map((r) => <RuleRow key={r.id} rule={r} t={t} onPatch={patch} onRemove={remove} />)
          )}
        </div>
      </div>
      <TestBox t={t} epoch={epoch} />
      <div className="mdk-mini">
        <div>
          <b className="tnum">{data ? stats.matches7d ?? 0 : "–"}</b>
          <span>{t("modDesk.wf.stat.matches")}</span>
        </div>
        <div>
          <b className="tnum">{data ? stats.blocked7d ?? 0 : "–"}</b>
          <span>{t("modDesk.wf.stat.blocked")}</span>
        </div>
        <div>
          <b className="tnum">{fp}</b>
          <span>{t("modDesk.wf.stat.fp")}</span>
        </div>
        <div>
          <b className="mdk-cell">{stats.topWhere || "–"}</b>
          <span>{t("modDesk.wf.stat.top")}</span>
        </div>
      </div>
    </div>
  );
}

export default function ContentFilters({ meta, epoch, summary, onChanged, onToast, onTimeout, onBan }) {
  const { t, locale } = useLocale();
  return (
    <div className="mdk-cols is-filters">
      <FlaggedQueue t={t} locale={locale} meta={meta} epoch={epoch} summary={summary} onChanged={onChanged} onToast={onToast} onTimeout={onTimeout} onBan={onBan} />
      <WordFilter t={t} epoch={epoch} onToast={onToast} />
    </div>
  );
}
