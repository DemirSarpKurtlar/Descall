import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Coins, Crown, Search, ShieldCheck } from "../../ui/Icon.jsx";
import { Avatar } from "../../ui/Avatar";
import { useLocale } from "../../../context/LocaleContext";
import { premiumApply, premiumUser, premiumUserSearch } from "./premiumApi.js";
import { MONTHLY_DESCOIN, buildApplyPayload, createIdempotency, previewChange, subscriptionState } from "./premiumModel.js";
import ActionFields, { defaultOp, formForModel, freshActionForm, opAllowed } from "./ActionFields.jsx";
import EventsTable from "./EventsTable.jsx";
import { ChangeSummary, EndCell, ErrorLine, Modal, PageHead, PlanChip, RefreshButton, StateChip, When, errorText, num } from "./PremiumUi.jsx";

const DEBOUNCE = 220;

function Person({ u, size = 32 }) {
  return <Avatar name={u.display_name || u.username} size={size} user={{ id: u.id, username: u.username, avatarUrl: u.avatar_url }} animate="none" />;
}

function SearchCard({ selectedId, onPick, t }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ status: "idle", users: [] });
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setState({ status: "idle", users: [] });
      return undefined;
    }
    const ctl = new AbortController();
    setState((s) => ({ ...s, status: "loading" }));
    const id = setTimeout(() => {
      premiumUserSearch(term, { signal: ctl.signal })
        .then((d) => { if (!ctl.signal.aborted) setState({ status: "done", users: d?.users || [] }); })
        .catch((err) => { if (!ctl.signal.aborted && err?.name !== "AbortError") setState({ status: "error", users: [], error: err }); });
    }, DEBOUNCE);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);

  return (
    <div className="agr-card pa-search-card">
      <h3>{t("premiumAdmin.users.find")}</h3>
      <div className="mt-in pa-search">
        <Search size={14} className="mt-i" />
        <input type="search" value={q} autoComplete="off" spellCheck={false} placeholder={t("premiumAdmin.users.searchPh")} aria-label={t("premiumAdmin.users.searchPh")} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="pc-hint">{t("premiumAdmin.users.searchHint")}</p>
      {state.status === "error" ? <ErrorLine error={state.error} t={t} /> : null}
      {state.status === "loading" && !state.users.length ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : null}
      {state.status === "done" && !state.users.length ? <p className="pa-empty">{t("premiumAdmin.users.noMatch", { q: q.trim() })}</p> : null}
      {state.users.length ? (
        <ul className="pa-hits" role="listbox" aria-label={t("premiumAdmin.users.results")}>
          {state.users.map((u) => {
            const st = subscriptionState(u.subscription);
            return (
              <li key={u.id} role="option" aria-selected={selectedId === u.id}>
                <button type="button" className={selectedId === u.id ? "is-on" : ""} onClick={() => onPick(u.id)}>
                  <Person u={u} />
                  <span className="pa-hit-who">
                    <b>{u.display_name || u.username}</b>
                    <span>@{u.username}{u.email_masked ? ` · ${u.email_masked}` : ""}</span>
                  </span>
                  <span className="pa-hit-sub">
                    <PlanChip plan={st.plan} t={t} />
                    {st.state !== "none" ? <StateChip state={st.state} t={t} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Detail({ data, locale, t }) {
  const u = data.user || {};
  const sub = data.subscription || null;
  const st = subscriptionState(sub);
  const coin = sub?.plan_id ? MONTHLY_DESCOIN[sub.plan_id] : null;
  return (
    <div className="agr-card pa-detail">
      <div className="pa-detail-head">
        <Person u={u} size={44} />
        <div>
          <h3>{u.display_name || u.username}</h3>
          <p className="muted">@{u.username}{u.email_masked ? ` · ${u.email_masked}` : ""}</p>
        </div>
      </div>
      <dl className="pa-dl pa-dl-grid">
        <div><dt>{t("premiumAdmin.f.plan")}</dt><dd><PlanChip plan={st.plan} t={t} /></dd></div>
        <div><dt>{t("premiumAdmin.f.status")}</dt><dd><StateChip state={st.state} t={t} />{st.daysLeft != null ? <span className="mt-muted pa-left">{t("premiumAdmin.daysLeft", { n: st.daysLeft })}</span> : null}</dd></div>
        <div><dt>{t("premiumAdmin.f.start")}</dt><dd><When value={sub?.started_at} locale={locale} /></dd></div>
        <div><dt>{t("premiumAdmin.f.end")}</dt><dd><EndCell sub={sub} locale={locale} t={t} /></dd></div>
        <div><dt>{t("premiumAdmin.f.free")}</dt><dd>{sub?.plan_id ? (sub.is_free ? t("premiumAdmin.yes") : t("premiumAdmin.no")) : "–"}</dd></div>
        <div><dt>{t("premiumAdmin.f.source")}</dt><dd>{sub?.source ? t(`premiumAdmin.source.${sub.source}`) : "–"}</dd></div>
        <div className="pa-dl-wide">
          <dt>{t("premiumAdmin.f.nextCoin")}</dt>
          <dd>
            {st.state === "active" && sub?.next_coin_at ? (
              <span className="pa-coin"><Coins size={14} aria-hidden="true" /> <span className="tnum">{t("premiumAdmin.coinAmount", { n: num(coin, locale, t) })}</span> · <When value={sub.next_coin_at} locale={locale} /></span>
            ) : <span className="mt-muted">–</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const OP_TONE = { cancel: "dangerfill", set_end: "primary" };

export default function PremiumUsers() {
  const { t, locale } = useLocale();
  const [selId, setSelId] = useState(null);
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => freshActionForm());
  const [formErr, setFormErr] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [done, setDone] = useState(null);
  const idem = useRef(createIdempotency()).current;
  const seq = useRef(0);

  const load = useCallback(async (id) => {
    if (!id) return;
    const my = ++seq.current;
    setBusy(true);
    setLoadErr(null);
    try {
      const d = await premiumUser(id);
      if (my === seq.current) setData(d);
    } catch (err) {
      if (my === seq.current) setLoadErr(err);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, []);

  const pick = (id) => {
    setSelId(id);
    setData(null);
    setDone(null);
    setFormErr(null);
    setForm(freshActionForm());
    load(id);
  };

  const sub = data?.subscription || null;
  useEffect(() => {
    // An op that does not fit this member falls back to the first one that does.
    if (data && !opAllowed(form.op, sub)) setForm((f) => ({ ...f, op: defaultOp(sub) }));
  }, [data, sub, form.op]);

  const review = () => {
    setDone(null);
    const now = Date.now();
    const pre = buildApplyPayload(formForModel(form), { requestId: "pending", current: sub, now });
    if (!pre.ok) return setFormErr(pre.error);
    const { request_id: _drop, ...rest } = pre.body;
    const body = { ...rest, request_id: idem.idFor(`user:${selId}`, rest) };
    setFormErr(null);
    setSendErr(null);
    setConfirm({ body, preview: previewChange(sub, body, now) });
  };

  const apply = async () => {
    if (!confirm || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      await premiumApply(selId, confirm.body);
      idem.succeeded();
      setDone({ op: confirm.body.op, at: new Date().toISOString() });
      setConfirm(null);
      setForm((f) => ({ ...freshActionForm(f.op === "grant" ? "extend" : f.op), plan: f.plan }));
      await load(selId);
    } catch (err) {
      // The same body (and request_id) is sent again on retry: the server treats it as one action.
      setSendErr(err);
    } finally {
      setSending(false);
    }
  };

  const user = data?.user;
  const events = useMemo(() => data?.events || [], [data]);

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navUsers")} sub={t("premiumAdmin.users.sub")}>
        {selId ? <RefreshButton onClick={() => load(selId)} busy={busy} t={t} /> : null}
      </PageHead>
      <div className={`pa-split-view${selId ? " has-sel" : ""}`}>
        <div className="pa-col pa-col-list">
          <SearchCard selectedId={selId} onPick={pick} t={t} />
        </div>
        <div className="pa-col pa-col-main">
          {!selId ? (
            <div className="agr-card pa-placeholder"><Crown size={22} aria-hidden="true" /><p>{t("premiumAdmin.users.pickHint")}</p></div>
          ) : (
            <>
              <button type="button" className="mt-btn sm ghost pa-back" onClick={() => { setSelId(null); setData(null); }}><ArrowLeft size={14} /> {t("premiumAdmin.users.back")}</button>
              <ErrorLine error={loadErr} t={t} onRetry={() => load(selId)} />
              {!data && busy ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : null}
              {data ? (
                <>
                  <Detail data={data} locale={locale} t={t} />
                  <div className="agr-card pa-action">
                    <h3>{t("premiumAdmin.users.actions")}</h3>
                    <ActionFields form={form} onChange={(f) => { setForm(f); setFormErr(null); }} t={t} current={sub} />
                    {formErr ? <p className="pc-hint is-err" role="alert">{errorText(formErr, t)}</p> : null}
                    {done ? <p className="pc-hint is-ok" role="status"><Check size={13} /> {t("premiumAdmin.users.applied", { op: t(`premiumAdmin.op.${done.op}`) })}</p> : null}
                    <div className="mt-form-foot">
                      <span className="pc-hint"><ShieldCheck size={13} aria-hidden="true" /> {t("premiumAdmin.stepUpHint")}</span>
                      <button type="button" className="mt-btn primary" onClick={review}>{t("premiumAdmin.review")}</button>
                    </div>
                  </div>
                  <div className="agr-card">
                    <h3>{t("premiumAdmin.users.history")}<span className="pa-count tnum">{num(events.length, locale, t)}</span></h3>
                    <EventsTable events={events} locale={locale} t={t} />
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      {confirm ? (
        <Modal onClose={() => !sending && setConfirm(null)} wide label={t("premiumAdmin.confirm.title")}>
          <h2>{t("premiumAdmin.confirm.title")}</h2>
          <p className="mt-muted">{t("premiumAdmin.confirm.body", { op: t(`premiumAdmin.op.${confirm.body.op}`), name: user?.display_name || user?.username || "" })}</p>
          <ChangeSummary before={confirm.preview.before} after={confirm.preview.after} locale={locale} t={t} />
          <dl className="pa-dl pa-confirm-dl">
            <div><dt>{t("premiumAdmin.f.reason")}</dt><dd>{confirm.body.reason}</dd></div>
            {confirm.body.note ? <div><dt>{t("premiumAdmin.f.note")}</dt><dd>{confirm.body.note}</dd></div> : null}
            <div><dt>{t("premiumAdmin.f.requestId")}</dt><dd className="pa-mono">{confirm.body.request_id}</dd></div>
          </dl>
          {sendErr ? <ErrorLine error={sendErr} t={t} /> : null}
          <div className="mt-modal-acts">
            <button type="button" className="mt-btn" disabled={sending} onClick={() => setConfirm(null)}>{t("premiumAdmin.cancel")}</button>
            <button type="button" className={`mt-btn ${OP_TONE[confirm.body.op] || "primary"}`} disabled={sending} onClick={apply}>
              {sending ? t("premiumAdmin.applying") : sendErr ? t("premiumAdmin.retry") : t("premiumAdmin.confirm.apply")}
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
