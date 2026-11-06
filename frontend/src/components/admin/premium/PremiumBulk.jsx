import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle, Copy, ShieldCheck, UsersThree, XCircle } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { copyText } from "../../../lib/copyText";
import PromoPeoplePicker from "../PromoPeoplePicker.jsx";
import { premiumBulk, premiumPickerSearch } from "./premiumApi.js";
import { BULK_MAX, buildBulkPayload, createIdempotency } from "./premiumModel.js";
import ActionFields, { formForModel, freshActionForm } from "./ActionFields.jsx";
import { ErrorLine, Kpi, PageHead, PlanChip, When, errorText, num } from "./PremiumUi.jsx";

function durationText(body, locale, t) {
  if (body.unlimited) return t("premiumAdmin.unlimited");
  if (body.days) return t("premiumAdmin.dur.days", { n: body.days });
  if (body.ends_at) return <When value={body.ends_at} locale={locale} />;
  return "–";
}

/** Toplu Üyelik İşlemleri: pick people, one op, confirm the count, then per-person results. */
export default function PremiumBulk() {
  const { t, locale } = useLocale();
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState(() => freshActionForm());
  const [step, setStep] = useState("form");
  const [pending, setPending] = useState(null);
  const [formErr, setFormErr] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const idem = useRef(createIdempotency()).current;

  const review = () => {
    const pre = buildBulkPayload(formForModel(form), people, { requestId: "pending" });
    if (!pre.ok) return setFormErr(pre.error);
    const { request_id: _drop, ...rest } = pre.body;
    setPending({ ...rest, request_id: idem.idFor("bulk", rest) });
    setFormErr(null);
    setSendErr(null);
    setStep("confirm");
  };

  const submit = async () => {
    if (!pending || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      const out = await premiumBulk(pending);
      idem.succeeded();
      setResult({ ...out, body: pending });
      setStep("result");
    } catch (err) {
      // Retrying sends the same request_id: people already done are not done twice.
      setSendErr(err);
    } finally {
      setSending(false);
    }
  };

  const restart = () => {
    setPeople([]);
    setForm(freshActionForm());
    setPending(null);
    setResult(null);
    setStep("form");
  };

  const nameOf = (id) => {
    const u = people.find((p) => p.id === id);
    return u ? (u.display_name || u.username) : String(id).slice(0, 8);
  };

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navBulk")} sub={t("premiumAdmin.bulk.sub")} />
      <ol className="pa-steps" aria-label={t("premiumAdmin.bulk.steps")}>
        {["form", "confirm", "result"].map((s, i) => (
          <li key={s} className={step === s ? "is-on" : ""} aria-current={step === s ? "step" : undefined}><span className="tnum">{i + 1}</span>{t(`premiumAdmin.bulk.step.${s}`)}</li>
        ))}
      </ol>

      {step === "form" ? (
        <div className="pa-two">
          <div className="agr-card">
            <h3><UsersThree size={16} aria-hidden="true" /> {t("premiumAdmin.bulk.people")}<span className="pa-count tnum">{t("premiumAdmin.bulk.selected", { n: people.length, max: BULK_MAX })}</span></h3>
            <PromoPeoplePicker value={people} onChange={setPeople} t={t} search={premiumPickerSearch} label={t("premiumAdmin.bulk.pick")} />
            {people.length ? <button type="button" className="mt-btn sm ghost" onClick={() => setPeople([])}>{t("premiumAdmin.bulk.clear")}</button> : <p className="pc-hint">{t("premiumAdmin.bulk.pickHint")}</p>}
          </div>
          <div className="agr-card">
            <h3>{t("premiumAdmin.bulk.action")}</h3>
            <ActionFields form={form} onChange={(f) => { setForm(f); setFormErr(null); }} t={t} />
            {formErr ? <p className="pc-hint is-err" role="alert">{errorText(formErr, t)}</p> : null}
            <div className="mt-form-foot">
              <button type="button" className="mt-btn primary" disabled={!people.length} onClick={review}>{t("premiumAdmin.bulk.continue", { n: people.length })}</button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "confirm" && pending ? (
        <div className="agr-card pa-confirm">
          <div className="pa-confirm-ico"><AlertTriangle size={22} aria-hidden="true" /></div>
          <h3>{t("premiumAdmin.bulk.confirmTitle", { n: pending.user_ids.length })}</h3>
          <p className="muted">{t("premiumAdmin.bulk.confirmBody", { n: pending.user_ids.length, op: t(`premiumAdmin.op.${pending.op}`) })}</p>
          <dl className="pa-dl pa-dl-grid">
            <div><dt>{t("premiumAdmin.f.op")}</dt><dd>{t(`premiumAdmin.op.${pending.op}`)}</dd></div>
            <div><dt>{t("premiumAdmin.f.plan")}</dt><dd>{pending.plan ? <PlanChip plan={pending.plan} t={t} /> : "–"}</dd></div>
            <div><dt>{t("premiumAdmin.dur.label")}</dt><dd>{durationText(pending, locale, t)}</dd></div>
            <div><dt>{t("premiumAdmin.f.free")}</dt><dd>{pending.is_free ? t("premiumAdmin.yes") : t("premiumAdmin.no")}</dd></div>
            <div className="pa-dl-wide"><dt>{t("premiumAdmin.f.reason")}</dt><dd>{pending.reason}</dd></div>
            <div className="pa-dl-wide"><dt>{t("premiumAdmin.f.requestId")}</dt><dd className="pa-mono">{pending.request_id}</dd></div>
          </dl>
          <ul className="pa-people-mini">
            {people.slice(0, 24).map((u) => <li key={u.id}>{u.display_name || u.username}</li>)}
            {people.length > 24 ? <li className="mt-muted">{t("premiumAdmin.bulk.andMore", { n: people.length - 24 })}</li> : null}
          </ul>
          <ErrorLine error={sendErr} t={t} />
          <div className="mt-form-foot">
            <span className="pc-hint"><ShieldCheck size={13} aria-hidden="true" /> {t("premiumAdmin.stepUpHint")}</span>
            <button type="button" className="mt-btn" disabled={sending} onClick={() => setStep("form")}><ArrowLeft size={14} /> {t("premiumAdmin.back")}</button>
            <button type="button" className="mt-btn primary" disabled={sending} onClick={submit}>
              {sending ? t("premiumAdmin.applying") : sendErr ? t("premiumAdmin.retry") : t("premiumAdmin.bulk.apply", { n: pending.user_ids.length })}
            </button>
          </div>
        </div>
      ) : null}

      {step === "result" && result ? (
        <>
          <div className="agr-kpis pa-kpis n4">
            <Kpi label={t("premiumAdmin.bulk.total")} value={num(result.batch?.total ?? result.body.user_ids.length, locale, t)} />
            <Kpi label={t("premiumAdmin.bulk.ok")} value={num(result.batch?.ok, locale, t)} tone="ok" />
            <Kpi label={t("premiumAdmin.bulk.failed")} value={num(result.batch?.failed, locale, t)} tone={result.batch?.failed ? "bad" : ""} />
            <Kpi label={t("premiumAdmin.f.date")} value={<When value={result.batch?.created_at} locale={locale} />} />
          </div>
          <div className="agr-card">
            <h3>{t("premiumAdmin.bulk.results")}</h3>
            <p className="pa-batch">
              <span>{t("premiumAdmin.f.batch")}</span> <code className="pa-mono">{result.batch?.id || "–"}</code>
              {result.batch?.id ? (
                <button type="button" className="pc-ibtn" aria-label={t("premiumAdmin.copy")} onClick={async () => { await copyText(result.batch.id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              ) : null}
            </p>
            <div className="pa-table-wrap">
              <table className="agr-table pa-table">
                <thead><tr><th>{t("premiumAdmin.f.user")}</th><th>{t("premiumAdmin.f.status")}</th><th>{t("premiumAdmin.bulk.reasonCol")}</th></tr></thead>
                <tbody>
                  {[...(result.results || [])].sort((a, b) => Number(a.ok) - Number(b.ok)).map((r) => (
                    <tr key={r.user_id} className={r.ok ? "" : "is-bad"}>
                      <td>{nameOf(r.user_id)}</td>
                      <td>{r.ok ? <span className="pa-res is-ok"><CheckCircle size={14} /> {t("premiumAdmin.bulk.rowOk")}</span> : <span className="pa-res is-bad"><XCircle size={14} /> {t("premiumAdmin.bulk.rowFailed")}</span>}</td>
                      <td className="pa-reason">{r.ok ? "–" : errorText(r.error || "generic", t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-form-foot">
              <button type="button" className="mt-btn primary" onClick={restart}>{t("premiumAdmin.bulk.again")}</button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
