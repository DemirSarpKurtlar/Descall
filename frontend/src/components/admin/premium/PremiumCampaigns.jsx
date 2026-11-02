import { useEffect, useState } from "react";
import { BarChart3, Info, Pause, Pencil, Plus, RefreshCw, Ticket } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { confirmAction } from "../../../lib/glassConfirm";
import { generateCode } from "../../../lib/promoCode";
import PromoPeoplePicker from "../PromoPeoplePicker.jsx";
import {
  premiumCampaignCreate, premiumCampaignStats, premiumCampaignUpdate, premiumCampaigns, premiumPickerSearch,
} from "./premiumApi.js";
import { CAMPAIGN_KINDS, PLANS, buildCampaignPayload, dateToLocalInput, normalizeCampaignCode } from "./premiumModel.js";
import { useLoad } from "./useLoad.js";
import { DateInput, ErrorLine, Field, Kpi, PageHead, PlanChip, RefreshButton, Seg, ToggleRow, When, errorText, num } from "./PremiumUi.jsx";

function freshCampaign() {
  return {
    id: null, code: generateCode().slice(0, 12), kind: "free_membership", planLimit: "plus", durationDays: "30", value: "",
    startDate: "", startTime: "00:00", endDate: "", endTime: "23:59", totalLimit: "", perUserLimit: "1", allowedUsers: [], active: true,
  };
}

function fromRow(c) {
  const s = dateToLocalInput(c.starts_at);
  const e = dateToLocalInput(c.ends_at);
  const people = Array.isArray(c.allowed_users) && c.allowed_users.length
    ? c.allowed_users
    : (c.allowed_user_ids || []).map((id) => ({ id, username: String(id).slice(0, 8) }));
  return {
    id: c.id, code: c.code || "", kind: c.kind || "free_membership", planLimit: c.plan_id || "", durationDays: c.duration_days ? String(c.duration_days) : "",
    value: c.value != null ? String(c.value) : "", startDate: s.date, startTime: s.time || "00:00", endDate: e.date, endTime: e.time || "23:59",
    totalLimit: c.total_limit != null ? String(c.total_limit) : "", perUserLimit: c.per_user_limit != null ? String(c.per_user_limit) : "1",
    allowedUsers: people, active: c.active !== false,
  };
}

export function campaignStatus(c, now = Date.now()) {
  if (!c.active) return "disabled";
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return "ended";
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return "scheduled";
  if (c.total_limit != null && Number(c.redeemed_count) >= Number(c.total_limit)) return "full";
  return "active";
}

function CampaignForm({ initial, onSaved, onCancel, t }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(initial); setErr(null); }, [initial]);
  const set = (patch) => { setF((p) => ({ ...p, ...patch })); setErr(null); };
  const money = f.kind === "percent" || f.kind === "fixed";

  const save = async () => {
    const out = buildCampaignPayload(f);
    if (!out.ok) return setErr(out.error);
    setBusy(true);
    try {
      const saved = f.id ? await premiumCampaignUpdate(f.id, out.body) : await premiumCampaignCreate(out.body);
      onSaved(saved?.campaign?.id || saved?.id || f.id);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agr-card pa-camp-form">
      <h3><Ticket size={16} aria-hidden="true" /> {f.id ? t("premiumAdmin.camp.edit") : t("premiumAdmin.camp.new")}</h3>
      <Field label={t("premiumAdmin.f.code")} hint={t("premiumAdmin.camp.codeHint")}>
        <div className="mt-in pa-code-in">
          <input className="pa-mono" value={f.code} autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" disabled={Boolean(f.id)}
            onChange={(e) => set({ code: normalizeCampaignCode(e.target.value) })} />
          {!f.id ? (
            <button type="button" className="pc-ibtn" aria-label={t("premiumAdmin.camp.generate")} title={t("premiumAdmin.camp.generate")} onClick={() => set({ code: generateCode().slice(0, 12) })}><RefreshCw size={15} /></button>
          ) : null}
        </div>
      </Field>
      <div className="mt-f pa-f">
        <span>{t("premiumAdmin.camp.kind")}</span>
        <Seg label={t("premiumAdmin.camp.kind")} value={f.kind} onChange={(kind) => set({ kind })} options={CAMPAIGN_KINDS.map((k) => [k, t(`premiumAdmin.camp.kindOpt.${k}`)])} />
        {money ? <p className="pa-callout"><Info size={14} aria-hidden="true" /> <span>{t("premiumAdmin.camp.noMoneyEffect")}</span></p> : null}
      </div>
      <div className="mt-two">
        <div className="mt-f pa-f">
          <span>{t("premiumAdmin.camp.planLimit")}</span>
          <Seg label={t("premiumAdmin.camp.planLimit")} value={f.planLimit || ""} onChange={(planLimit) => set({ planLimit })}
            options={[["", t("premiumAdmin.camp.anyPlan"), f.kind === "free_membership"], ...PLANS.map((p) => [p, t(`premiumAdmin.plan.${p}`)])]} />
        </div>
        <Field label={t("premiumAdmin.camp.durationDays")}>
          <div className="mt-in"><input className="tnum" type="number" inputMode="numeric" min={1} value={f.durationDays} onChange={(e) => set({ durationDays: e.target.value.replace(/\D/g, "").slice(0, 4) })} /><span className="mt-muted">{t("premiumAdmin.dur.daysUnit")}</span></div>
        </Field>
      </div>
      {money ? (
        <Field label={f.kind === "percent" ? t("premiumAdmin.camp.percentValue") : t("premiumAdmin.camp.fixedValue")}>
          <div className="mt-in"><input className="tnum" type="number" inputMode="numeric" min={1} value={f.value} onChange={(e) => set({ value: e.target.value.replace(/\D/g, "").slice(0, 7) })} /></div>
        </Field>
      ) : null}
      <div className="mt-two">
        <Field label={t("premiumAdmin.camp.starts")} hint={!f.startDate ? t("premiumAdmin.camp.startsNow") : null}>
          <DateInput label={t("premiumAdmin.camp.starts")} value={f.startDate} onChange={(startDate) => set({ startDate })} time timeValue={f.startTime} onTime={(startTime) => set({ startTime })} />
        </Field>
        <Field label={t("premiumAdmin.camp.ends")} hint={!f.endDate ? t("premiumAdmin.camp.noEnd") : null}>
          <DateInput label={t("premiumAdmin.camp.ends")} value={f.endDate} onChange={(endDate) => set({ endDate })} time timeValue={f.endTime} onTime={(endTime) => set({ endTime })} />
        </Field>
      </div>
      <div className="mt-two">
        <Field label={t("premiumAdmin.camp.totalLimit")}>
          <div className="mt-in"><input className="tnum" type="number" inputMode="numeric" min={1} value={f.totalLimit} placeholder={t("premiumAdmin.camp.noLimit")} onChange={(e) => set({ totalLimit: e.target.value.replace(/\D/g, "").slice(0, 7) })} /></div>
        </Field>
        <Field label={t("premiumAdmin.camp.perUser")}>
          <div className="mt-in"><input className="tnum" type="number" inputMode="numeric" min={1} value={f.perUserLimit} onChange={(e) => set({ perUserLimit: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
        </Field>
      </div>
      <PromoPeoplePicker value={f.allowedUsers} onChange={(allowedUsers) => set({ allowedUsers })} t={t} search={premiumPickerSearch} label={t("premiumAdmin.camp.allowed")} />
      <p className="pc-hint">{f.allowedUsers.length ? t("premiumAdmin.camp.allowedSome", { n: f.allowedUsers.length }) : t("premiumAdmin.camp.allowedAll")}</p>
      <ToggleRow label={t("premiumAdmin.camp.active")} hint={t("premiumAdmin.camp.activeHint")} on={f.active} onChange={(active) => set({ active })} />
      {err ? <p className="pc-hint is-err" role="alert">{errorText(err, t)}</p> : null}
      <div className="mt-form-foot">
        {f.id ? <button type="button" className="mt-btn" onClick={onCancel}>{t("premiumAdmin.cancel")}</button> : null}
        <button type="button" className="mt-btn primary" disabled={busy} onClick={save}>{busy ? t("premiumAdmin.applying") : f.id ? t("premiumAdmin.save") : t("premiumAdmin.camp.create")}</button>
      </div>
    </div>
  );
}

function Stats({ campaign, locale, t }) {
  const { data, error, busy } = useLoad(() => premiumCampaignStats(campaign.id), [campaign.id]);
  const s = data?.stats || data || {};
  const recent = s.recent || s.redemptions_recent || [];
  return (
    <div className="agr-card">
      <h3><BarChart3 size={16} aria-hidden="true" /> {t("premiumAdmin.camp.stats")} <span className="pa-mono pa-count">{campaign.code}</span></h3>
      <ErrorLine error={error} t={t} />
      {busy && !data ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : null}
      {data ? (
        <>
          <div className="agr-kpis pa-kpis n3">
            <Kpi label={t("premiumAdmin.camp.redemptions")} value={num(s.redemptions ?? s.redeemed_count, locale, t)}
              hint={campaign.total_limit != null ? t("premiumAdmin.camp.ofLimit", { n: num(campaign.total_limit, locale, t) }) : t("premiumAdmin.camp.noLimit")} />
            <Kpi label={t("premiumAdmin.camp.uniqueUsers")} value={num(s.unique_users, locale, t)} />
            <Kpi label={t("premiumAdmin.camp.stillActive")} value={num(s.still_active, locale, t)} hint={t("premiumAdmin.camp.stillActiveHint")} />
          </div>
          {recent.length ? (
            <ul className="pa-recent">
              {recent.slice(0, 8).map((r, i) => (
                <li key={r.id || i}><span>{r.user?.display_name || r.user?.username || r.username || String(r.user_id || "").slice(0, 8)}</span><When value={r.at || r.created_at} locale={locale} /></li>
              ))}
            </ul>
          ) : <p className="pa-empty">{t("premiumAdmin.camp.noRedemptions")}</p>}
        </>
      ) : null}
    </div>
  );
}

/** Kupon ve Kampanyalar: GET/POST/PATCH /admin/premium/campaigns, GET /campaigns/:id/stats. */
export default function PremiumCampaigns() {
  const { t, locale } = useLocale();
  const { data, error, busy, reload } = useLoad(() => premiumCampaigns(), []);
  const [editing, setEditing] = useState(() => freshCampaign());
  const [selId, setSelId] = useState(null);
  const [actErr, setActErr] = useState(null);
  const list = data?.campaigns || data?.items || [];
  const sel = list.find((c) => c.id === selId) || null;

  const disable = async (c) => {
    const ok = await confirmAction({
      title: t("premiumAdmin.camp.disableTitle", { code: c.code }),
      message: t("premiumAdmin.camp.disableBody"),
      confirmLabel: t("premiumAdmin.camp.disable"),
      cancelLabel: t("premiumAdmin.cancel"),
      danger: true,
    });
    if (!ok) return;
    setActErr(null);
    try {
      await premiumCampaignUpdate(c.id, { active: false });
      await reload();
    } catch (e) {
      setActErr(e);
    }
  };

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navCampaigns")} sub={t("premiumAdmin.camp.sub")}>
        <button type="button" className="mt-btn sm" onClick={() => setEditing(freshCampaign())}><Plus size={14} /> {t("premiumAdmin.camp.new")}</button>
        <RefreshButton onClick={reload} busy={busy} t={t} />
      </PageHead>
      <div className="pa-two">
        <div className="pa-col">
          <CampaignForm initial={editing} t={t} onCancel={() => setEditing(freshCampaign())}
            onSaved={async (id) => { await reload(); setEditing(freshCampaign()); if (id) setSelId(id); }} />
        </div>
        <div className="pa-col">
          <div className="agr-card">
            <h3>{t("premiumAdmin.camp.list")}<span className="pa-count tnum">{num(list.length, locale, t)}</span></h3>
            <ErrorLine error={error || actErr} t={t} onRetry={reload} />
            {busy && !data ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : null}
            {data && !list.length ? <p className="pa-empty">{t("premiumAdmin.camp.empty")}</p> : null}
            {list.length ? (
              <ul className="pa-camps">
                {list.map((c) => {
                  const st = campaignStatus(c);
                  return (
                    <li key={c.id} className={selId === c.id ? "is-on" : ""}>
                      <button type="button" className="pa-camp-main" onClick={() => setSelId(c.id)}>
                        <span className="pa-mono pa-camp-code">{c.code}</span>
                        <span className="pa-camp-meta">
                          <span className={`pa-state is-${st === "active" ? "active" : st === "scheduled" ? "scheduled" : "expired"}`}>{t(`premiumAdmin.camp.status.${st}`)}</span>
                          <span>{t(`premiumAdmin.camp.kindOpt.${c.kind}`)}</span>
                          {c.plan_id ? <PlanChip plan={c.plan_id} t={t} /> : null}
                          {c.duration_days ? <span>{t("premiumAdmin.dur.days", { n: c.duration_days })}</span> : null}
                        </span>
                        <span className="pa-camp-use tnum">{num(c.redeemed_count ?? 0, locale, t)} / {c.total_limit != null ? num(c.total_limit, locale, t) : "∞"}</span>
                      </button>
                      <span className="pa-camp-acts">
                        <button type="button" className="pc-ibtn" aria-label={t("premiumAdmin.camp.edit")} title={t("premiumAdmin.camp.edit")} onClick={() => setEditing(fromRow(c))}><Pencil size={14} /></button>
                        {c.active ? <button type="button" className="pc-ibtn" aria-label={t("premiumAdmin.camp.disable")} title={t("premiumAdmin.camp.disable")} onClick={() => disable(c)}><Pause size={14} /></button> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          {sel ? <Stats campaign={sel} locale={locale} t={t} /> : list.length ? <p className="pc-hint">{t("premiumAdmin.camp.pickForStats")}</p> : null}
          {sel?.ends_at || sel?.starts_at ? (
            <p className="pc-hint">{t("premiumAdmin.camp.window")}: <When value={sel.starts_at} locale={locale} empty={t("premiumAdmin.camp.startsNow")} /> {"–"} <When value={sel.ends_at} locale={locale} empty={t("premiumAdmin.camp.noEnd")} /></p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
