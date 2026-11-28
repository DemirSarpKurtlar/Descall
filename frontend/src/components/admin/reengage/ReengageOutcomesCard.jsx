import { useEffect, useState } from "react";
import { useT } from "../../../context/LocaleContext";
import { reengageAdmin } from "../../../api/reengage";
import "../../../styles/reengage.css";

/**
 * Elde tutma: the growth 3B "Ölçüm" line. Day-7 absentees who came back within 48 h
 * (target 18 %), by source (a friend's call vs a system message) against the control
 * group, and how many returners came back by writing to someone (first-message rate).
 */
export default function ReengageOutcomesCard() {
  const t = useT();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    reengageAdmin
      .outcomes()
      .then((r) => alive && setD(r))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);
  if (err || (d && d.ready === false)) return null;
  if (!d) return <div className="rg-skel types" />;
  const r = d.d7Return48h;
  const pct = (v) => (v == null ? "—" : `%${v}`);
  return (
    <section className="rg-card rg-outcomes" aria-label={t("rg3.outcomes.title")}>
      <div className="rg-card-h">
        <b>{t("rg3.outcomes.title")}</b>
        <small>{t(`rg3.admin.modeIs_${d.mode?.mode || "off"}`)}</small>
      </div>
      <div className="rg-kpis">
        <div className="rg-kpi green">
          <small>{t("rg3.outcomes.d7")}</small>
          <b>{pct(r.all.rate)}</b>
          <em>{t("rg3.outcomes.target", { target: r.target, n: r.all.n })}</em>
        </div>
        <div className="rg-kpi">
          <small>{t("rg3.outcomes.friendCall")}</small>
          <b>{pct(r.friendCall.rate)}</b>
          <em>{t("rg3.outcomes.n", { n: r.friendCall.n })}</em>
        </div>
        <div className="rg-kpi">
          <small>{t("rg3.outcomes.system")}</small>
          <b>{pct(r.system.rate)}</b>
          <em>{t("rg3.outcomes.n", { n: r.system.n })}</em>
        </div>
        <div className="rg-kpi">
          <small>{t("rg3.outcomes.control")}</small>
          <b>{pct(r.control.rate)}</b>
          <em>{t("rg3.outcomes.n", { n: r.control.n })}</em>
        </div>
        <div className="rg-kpi">
          <small>{t("rg3.outcomes.firstMsg")}</small>
          <b>{pct(d.firstMessageRate.rate)}</b>
          <em>{t("rg3.outcomes.firstMsgSub", { wrote: d.firstMessageRate.wrote, returners: d.firstMessageRate.returners })}</em>
        </div>
      </div>
    </section>
  );
}
