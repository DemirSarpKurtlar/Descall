import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import GlassCheckbox from "../../ui/GlassCheckbox.jsx";
import { BarList, SERIES_A, SERIES_B, fmtNum, fmtPct } from "./GrowthCharts.jsx";

/**
 * "Başla panosu" numbers inside Elde tutma (growth phase 2A "Ölçüm"): did the first five
 * minutes work? First message within the first day of new accounts (goal %42 -> %65),
 * the dashboard funnel (opened > previewed > joined > first message), which interest and
 * which server card brought first messages, D1 of dashboard openers vs everyone else, and
 * the official community server setting. GET/PUT /admin/growth/onboarding.
 */
export default function OnboardingCard({ days }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setErr("");
    adminFetch(`/growth/onboarding?days=${days}`)
      .then((d) => {
        setData(d);
        setCfg({
          communityServerId: d?.settings?.communityServerId || "",
          enabled: d?.settings?.enabled !== false,
          autoJoin: d?.settings?.autoJoin !== false,
          rehberEnabled: d?.settings?.rehberEnabled !== false,
          rewardsEnabled: d?.settings?.rewardsEnabled !== false,
        });
      })
      .catch((e) => setErr(e?.message || t("admin.loadError")));
  }, [days, t]);
  useEffect(load, [load]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setSaved(false);
    setErr("");
    try {
      await adminFetch("/growth/onboarding/config", { method: "PUT", body: JSON.stringify({ ...cfg, communityServerId: cfg.communityServerId.trim() || null }) });
      setSaved(true);
      load();
    } catch (e) {
      setErr(e?.message || t("onb.admin.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!data && !err) return <div className="agr-card"><p className="muted">{t("Loading...")}</p></div>;
  const f = data?.funnel || {};
  const fd = data?.firstDay || {};
  const co = data?.cohort || {};
  const d1 = (x) => (x?.eligible ? fmtPct(x.pct, locale) : "–");
  return (
    <div className="agr-card agr-onb" data-testid="admin-onb">
      <h3>{t("onb.admin.title")}</h3>
      <p className="muted agr-note">{t("onb.admin.sub")}</p>
      {err ? <p className="admin-inline-error">{err}</p> : null}
      {data ? (
        <>
          <div className="agr-kpis" style={{ marginBottom: 12 }}>
            <div className="agr-kpi">
              <span>{t("onb.admin.firstDay")}</span>
              <strong>{fmtPct(fd.pct, locale)}</strong>
              <em>{t("onb.admin.firstDayHint", { n: fd.firstDayMessage || 0, total: fd.signups || 0 })}</em>
            </div>
            <div className="agr-kpi">
              <span>{t("onb.admin.hello")}</span>
              <strong>{fmtNum(f.firstHello || 0, locale)}</strong>
              <em>{t("onb.admin.helloHint", { n: f.opened || 0 })}</em>
            </div>
            <div className="agr-kpi">
              <span>{t("onb.admin.d1Open")}</span>
              <strong>{d1(co.opened)}</strong>
              <em>{t("admin.grOf", { kept: co.opened?.kept || 0, n: co.opened?.eligible || 0 })}</em>
            </div>
            <div className="agr-kpi">
              <span>{t("onb.admin.d1Other")}</span>
              <strong>{d1(co.others)}</strong>
              <em>{t("admin.grOf", { kept: co.others?.kept || 0, n: co.others?.eligible || 0 })}</em>
            </div>
          </div>
          <div className="agr-grid2">
            <div>
              <h4 className="agr-sub">{t("onb.admin.funnel")}</h4>
              <BarList
                locale={locale}
                items={[
                  { key: "o", label: t("onb.admin.fOpened"), value: f.opened || 0 },
                  { key: "p", label: t("onb.admin.fPreviewed"), value: f.previewed || 0 },
                  { key: "j", label: t("onb.admin.fJoined"), value: f.joined || 0 },
                  { key: "m", label: t("onb.admin.fHello"), value: f.firstHello || 0 },
                  { key: "u", label: t("onb.admin.fUndone"), value: f.undone || 0 },
                  { key: "h", label: t("onb.admin.fHidden"), value: f.hidden || 0 },
                ]}
              />
            </div>
            <div>
              <h4 className="agr-sub">{t("onb.admin.byInterest")}</h4>
              {data.byInterest?.length ? (
                <BarList
                  locale={locale}
                  color={SERIES_B}
                  items={data.byInterest.map((r) => ({ key: r.id, label: `${t(`onb.interest.${r.id}`)} · ${t("onb.admin.ofPicked", { n: r.firstHello, total: r.picked })}`, value: r.firstHello }))}
                />
              ) : <p className="muted">{t("onb.admin.none")}</p>}
            </div>
          </div>
          <h4 className="agr-sub" style={{ marginTop: 14 }}>{t("onb.admin.byServer")}</h4>
          {data.byServer?.length ? (
            <div className="agr-cohort-wrap">
              <table className="agr-cohort agr-onb-table">
                <thead>
                  <tr>
                    <th>{t("onb.admin.server")}</th>
                    <th>{t("onb.admin.fPreviewed")}</th>
                    <th>{t("onb.admin.fJoined")}</th>
                    <th>{t("onb.admin.fHello")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byServer.map((r) => (
                    <tr key={r.serverId}>
                      <th scope="row">{r.name || r.serverId.slice(0, 8)}</th>
                      <td>{fmtNum(r.previewed, locale)}</td>
                      <td>{fmtNum(r.joined, locale)}</td>
                      <td style={{ color: r.firstHello ? SERIES_A : undefined, fontWeight: 700 }}>{fmtNum(r.firstHello, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">{t("onb.admin.none")}</p>}
          {Object.keys(data.bySlot || {}).length ? (
            <p className="muted agr-foot" style={{ marginTop: 8 }}>
              {t("onb.admin.bySlot")}{" "}
              {Object.entries(data.bySlot).map(([k, v]) => `${t(`onb.admin.slot.${k}`)} ${fmtNum(v, locale)}`).join(" · ")}
            </p>
          ) : null}
        </>
      ) : null}
      {cfg ? (
        <form
          className="agr-onb-cfg"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h4 className="agr-sub">{t("onb.admin.settings")}</h4>
          <label>
            <span>{t("onb.admin.community")}</span>
            <input
              type="text"
              value={cfg.communityServerId}
              placeholder={t("onb.admin.communityPh")}
              onChange={(e) => setCfg({ ...cfg, communityServerId: e.target.value })}
              spellCheck={false}
            />
            <em className="muted">{data?.settings?.community?.name ? t("onb.admin.communityNow", { name: data.settings.community.name }) : t("onb.admin.communityNone")}</em>
          </label>
          <div className="agr-onb-toggles">
            {["enabled", "autoJoin", "rehberEnabled", "rewardsEnabled"].map((k) => (
              <label key={k} className="agr-onb-check">
                <GlassCheckbox checked={Boolean(cfg[k])} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} />
                {t(`onb.admin.flag.${k}`)}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" className="agr-save" disabled={saving}>{saving ? t("onb.admin.saving") : t("onb.admin.save")}</button>
            {saved ? <span className="muted">{t("onb.admin.saved")}</span> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
