import { Gift } from "../../ui/Icon.jsx";
import { OPS, PLANS, localInputToDate, subscriptionState } from "./premiumModel.js";
import { DateInput, DurationField, Field, Seg, ToggleRow } from "./PremiumUi.jsx";

export function freshActionForm(op = "grant") {
  return {
    op,
    plan: "plus",
    startDate: "",
    startTime: "00:00",
    duration: { mode: "preset", days: 30 },
    isFree: true,
    note: "",
    reason: "",
  };
}

/** The form as premiumModel.buildApplyPayload / buildBulkPayload expect it. */
export function formForModel(f) {
  return { ...f, start: f.startDate ? localInputToDate(f.startDate, f.startTime || "00:00") : null };
}

/** Which ops make sense for this member (null current = bulk: every op). */
export function opAllowed(op, current) {
  if (current === undefined) return true;
  const st = subscriptionState(current).state;
  if (op === "grant") return true;
  if (st === "none") return false;
  if (op === "extend") return !current.unlimited;
  if (op === "cancel") return st === "active";
  return true;
}

/**
 * Plan, start, duration, Sınırsız, ücretsiz, admin note and reason for one op.
 * `current` is the member's subscription (undefined in bulk).
 */
export default function ActionFields({ form, onChange, t, current, ops = OPS }) {
  const set = (patch) => onChange({ ...form, ...patch });
  const op = form.op;
  const showPlan = op === "grant" || op === "change_plan";
  const showDuration = op === "grant" || op === "extend" || op === "set_end";
  return (
    <div className="pa-fields">
      <div className="mt-f pa-f">
        <span>{t("premiumAdmin.f.op")}</span>
        <div className="pa-ops" role="radiogroup" aria-label={t("premiumAdmin.f.op")}>
          {ops.map((id) => {
            const ok = opAllowed(id, current);
            return (
              <button key={id} type="button" role="radio" aria-checked={op === id} disabled={!ok} className={op === id ? "on" : ""}
                onClick={() => set({ op: id, duration: id === "extend" || id === "set_end" ? { mode: "preset", days: 30 } : form.duration })}>
                {t(`premiumAdmin.op.${id}`)}
              </button>
            );
          })}
        </div>
        <span className="pc-hint">{t(`premiumAdmin.opHint.${op}`)}</span>
      </div>
      {showPlan ? (
        <div className="mt-f pa-f">
          <span>{t("premiumAdmin.f.plan")}</span>
          <Seg label={t("premiumAdmin.f.plan")} value={form.plan} onChange={(plan) => set({ plan })}
            options={PLANS.map((p) => [p, t(`premiumAdmin.plan.${p}`), op === "change_plan" && current?.plan_id === p])} />
        </div>
      ) : null}
      {op === "grant" ? (
        <Field label={t("premiumAdmin.f.start")} hint={form.startDate ? t("premiumAdmin.startLocal") : t("premiumAdmin.startNow")}>
          <DateInput label={t("premiumAdmin.f.start")} value={form.startDate} onChange={(startDate) => set({ startDate })} time timeValue={form.startTime} onTime={(startTime) => set({ startTime })} />
        </Field>
      ) : null}
      {showDuration ? (
        <DurationField t={t} value={form.duration} onChange={(duration) => set({ duration })} allowUnlimited={op === "grant"} />
      ) : null}
      {op === "set_end" && form.duration?.mode !== "date" ? <p className="pc-hint">{t("premiumAdmin.setEndFromNow")}</p> : null}
      <ToggleRow icon={Gift} label={t("premiumAdmin.f.free")} hint={t("premiumAdmin.freeHint")} on={form.isFree} onChange={(isFree) => set({ isFree })} />
      <Field label={`${t("premiumAdmin.f.reason")} *`} hint={t("premiumAdmin.reasonHint")}>
        <div className="mt-in"><input type="text" maxLength={500} value={form.reason} aria-required="true" onChange={(e) => set({ reason: e.target.value })} placeholder={t("premiumAdmin.reasonPh")} /></div>
      </Field>
      <Field label={t("premiumAdmin.f.note")}>
        <div className="mt-in ta"><textarea rows={2} maxLength={1000} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder={t("premiumAdmin.notePh")} /></div>
      </Field>
    </div>
  );
}
