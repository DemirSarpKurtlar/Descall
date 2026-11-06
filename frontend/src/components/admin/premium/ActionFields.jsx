import { Gift } from "../../ui/Icon.jsx";
import { OPS, PLANS, subscriptionState } from "./premiumModel.js";
import { DurationField, Field, Seg, ToggleRow } from "./PremiumUi.jsx";

export function freshActionForm(op = "grant") {
  return {
    op,
    plan: "plus",
    duration: { mode: "preset", days: 30 },
    isFree: true,
    note: "",
    reason: "",
  };
}

/** The form as premiumModel.buildApplyPayload / buildBulkPayload expect it. */
export function formForModel(f) {
  return { ...f };
}

/**
 * Which ops make sense for this member (undefined current = bulk: every op), matching
 * premium_admin_apply: only "grant" works without an active membership (already_active
 * otherwise); every other op answers not_active on an ended one.
 */
export function opAllowed(op, current) {
  if (current === undefined) return true;
  const st = subscriptionState(current).state;
  if (op === "grant") return st !== "active";
  if (st !== "active") return false;
  if (op === "extend" || op === "set_unlimited") return !current.unlimited;
  return true;
}

/** The first op that fits this member (extend for an active one, else grant). */
export function defaultOp(current) {
  return ["extend", "grant", "change_plan", "set_end", "cancel", "set_unlimited"].find((op) => opAllowed(op, current)) || "grant";
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
      {op === "grant" ? <p className="pc-hint">{t("premiumAdmin.grantStartsNow")}</p> : null}
      {showDuration ? (
        <DurationField t={t} value={form.duration} onChange={(duration) => set({ duration })} allowUnlimited={op === "grant"} allowDate={op !== "extend"} />
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
