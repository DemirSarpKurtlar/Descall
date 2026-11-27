/**
 * The left list column while the "Başla panosu" is on (desktop): progress ring, the 5-day
 * checklist with its DesCoin, "Sunucuların" and "Önerilen" (servers you have not joined,
 * dashed). When the dashboard is hidden, a small "Başla panosunu aç" row brings it back.
 */
import { useT } from "../../context/LocaleContext";
import { useOnboarding } from "./OnboardingContext";
import { ServerIcon } from "./parts";
import { ringPercent, stepSub } from "../../lib/onboarding";
import { Check, Eye, Sparkles } from "../ui/Icon.jsx";

export function ChecklistItems({ onStep }) {
  const t = useT();
  const o = useOnboarding();
  const cl = o?.data?.checklist;
  if (!cl) return null;
  const joinedOther = (o.data.myServers || []).find((s) => !s.official);
  return (
    <div className="onb-cl" role="list" aria-label={t("onb.side.listAria")}>
      {cl.items.map((it) => {
        const now = !it.done && cl.next === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="listitem"
            className={`onb-ci${it.done ? " is-done" : ""}${now ? " is-now" : ""}`}
            onClick={() => onStep?.(it.id)}
            aria-label={`${t(`onb.step.${it.id}.t`)}${it.done ? `, ${t("onb.side.doneAria")}` : ""}`}
          >
            <span className="ck">{it.done ? <Check size={12} strokeWidth={3} /> : null}</span>
            <div>
              <b>{t(`onb.step.${it.id}.t`)}</b>
              <small>
                {stepSub(t, it, {
                  interests: o.interests,
                  joinedName: it.id === "join" && it.done ? joinedOther?.name : null,
                  previewName: it.id === "join" ? o.previewTarget?.name : null,
                })}
              </small>
            </div>
            <em>+{it.done && it.paid ? it.paidAmount : it.reward}</em>
          </button>
        );
      })}
    </div>
  );
}

export default function StartSidebar({ onStep }) {
  const t = useT();
  const o = useOnboarding();
  if (!o || !o.inWindow) return null;
  const d = o.data || {};
  if (!o.active) {
    if (!o.hidden) return null;
    return (
      <div className="onb">
        <button type="button" className="onb-gl onb-reopen" onClick={() => void o.setHidden(false)} data-testid="onb-reopen">
          <Sparkles size={14} />
          {t("onb.side.reopen")}
          <span className="onb-pill gl">{t("onb.dayOf", { day: d.day, total: d.windowDays })}</span>
        </button>
      </div>
    );
  }
  const cl = d.checklist || { doneCount: 0, total: 5, earned: 0, rewardTotal: 160 };
  const daysLeft = Math.max(0, (d.windowDays || 5) - (d.day || 1));
  const mine = (d.myServers || []).slice(0, 4);
  const suggested = (d.suggestions || []).slice(0, 3);
  return (
    <div className="onb onb-side" data-testid="onb-sidebar">
      <div className="onb-side-hd">
        <h2>{t("onb.title")}</h2>
        <span className="onb-pill gl">{t("onb.dayOf", { day: d.day, total: d.windowDays })}</span>
      </div>
      <div className="onb-gl onb-prog">
        <div className="onb-ring" style={{ "--p": ringPercent(cl.doneCount, cl.total) }} role="img" aria-label={t("onb.side.ringAria", { done: cl.doneCount, total: cl.total })}>
          <b>{cl.doneCount}/{cl.total}</b>
        </div>
        <div>
          <b className="tnum">{t("onb.side.progress", { earned: cl.earned, total: cl.rewardTotal })}</b>
          <div className="onb-bar"><i style={{ width: `${Math.round((cl.earned / Math.max(1, cl.rewardTotal)) * 100)}%` }} /></div>
          <small>{daysLeft > 0 ? t("onb.side.daysLeft", { n: daysLeft }) : t("onb.side.lastDay")}</small>
        </div>
      </div>
      <ChecklistItems onStep={onStep} />
      {mine.length ? (
        <>
          <div className="onb-cg">{t("onb.side.yourServers")}</div>
          {mine.map((s) => (
            <button key={s.id} type="button" className="onb-sv" onClick={() => o.openChannel?.(s.id)}>
              <ServerIcon server={s} size={28} official={s.official} />
              <b>{s.name}</b>
            </button>
          ))}
        </>
      ) : null}
      {suggested.length ? (
        <>
          <div className="onb-cg">
            {t("onb.side.suggested")} <span className="onb-dim">· {t("onb.side.notJoined")}</span>
          </div>
          {suggested.map((s) => {
            const on = o.previewTarget && String(o.previewTarget.id) === String(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`onb-sv is-ghost${on ? " is-on" : ""}`}
                onClick={() => o.openPreview({ id: s.id, name: s.name, iconUrl: s.iconUrl, category: s.category }, { slot: "sidebar" })}
              >
                <ServerIcon server={s} size={28} />
                <b>{s.name}</b>
                {on ? <Eye size={14} /> : null}
              </button>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

/** Phone "Sıradaki" card (draft phone 1). */
export function NextStepCard() {
  const t = useT();
  const o = useOnboarding();
  const cl = o?.data?.checklist;
  if (!cl) return null;
  const next = cl.items.find((i) => i.id === cl.next);
  return (
    <div className="onb-gl onb-pg onb-next">
      <div className="onb-ring" style={{ "--p": ringPercent(cl.doneCount, cl.total) }} role="img" aria-label={t("onb.side.ringAria", { done: cl.doneCount, total: cl.total })}>
        <b>{cl.doneCount}/{cl.total}</b>
      </div>
      <div>
        <b>{next ? t("onb.next", { step: t(`onb.step.${next.id}.t`) }) : t("onb.allDone")}</b>
        <small className="tnum">
          {next ? t("onb.nextSub", { n: next.reward }) : t("onb.side.progress", { earned: cl.earned, total: cl.rewardTotal })}
          {next && next.id !== "first_message" && !o.data?.firstHello?.at ? ` · ${t("onb.nextHello")}` : ""}
        </small>
        <div className="onb-bar"><i style={{ width: `${Math.round((cl.earned / Math.max(1, cl.rewardTotal)) * 100)}%` }} /></div>
      </div>
    </div>
  );
}
