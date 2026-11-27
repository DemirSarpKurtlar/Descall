/**
 * A server's boost page (draft 5B: iPhone "Takviye seviyesi", opened from the server name / goal bar)
 * and the in-server paywall ("Kod Atölyesi'ni yükselt · 1 takviye uzak"): what the next level opens
 * for everyone, who benefits, the owner's goal, the thank-you wall, and one action:
 * boost (members with a free boost), try / buy (others), or move a boost (members without one).
 */
import { useCallback, useEffect, useState } from "react";
import { useLocale, useT } from "../context/LocaleContext";
import { Check, Heart, Lock, Rocket, Target, Loader2, Info } from "../components/ui/Icon.jsx";
import { formatDate } from "../i18n/format.js";
import { PAvatar, PlusWindow, ServerTile, LevelBar, ErrorLine, Price } from "./ui.jsx";
import { boost, decidePaywall, getServerBoost, thankBoosters, trackPaywall } from "./plusApi.js";
import { usePlus, refreshHub } from "./plusStore.js";
import { openPlus } from "./openPlus.js";
import { errorKey, levelAdds } from "./model.js";

export default function ServerBoostPage({ serverId, onClose, mode = "page" }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const { offer } = usePlus({ load: "offer" });
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState("");
  const [thanked, setThanked] = useState(false);
  const [verdict, setVerdict] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await getServerBoost(serverId));
      setErr(null);
    } catch (e) {
      setErr(errorKey(e?.code));
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (mode !== "paywall") return;
    decidePaywall("server_paywall", serverId).then(setVerdict).catch(() => setVerdict({ show: "full" }));
  }, [mode, serverId]);

  const s = data?.server;
  const me = data?.me || {};
  const levels = data?.levels || offer?.levels || [];
  const next = s?.progress?.next || null;
  const salesOn = Boolean(offer?.salesOn);
  const trialOk = salesOn && offer?.features?.trial && !me.trialUsed && !me.plan;
  const price = offer?.prices?.plus_monthly ?? null;

  const doBoost = async () => {
    setBusy(true);
    setErr(null);
    try {
      await boost(serverId);
      await load();
      refreshHub();
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(false);
    }
  };
  const doBuy = () => {
    trackPaywall("server_paywall", "clicked", { serverId });
    openPlus({ view: "checkout", tab: "self", plan: "plus", moment: "server_paywall", serverId });
  };
  const doThank = async () => {
    setBusy(true);
    try {
      await thankBoosters(serverId, { message: thanks.trim() });
      setThanked(true);
      setThanks("");
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(false);
    }
  };

  const action = () => {
    if (!s) return null;
    if (me.plan && me.free > 0) {
      return <button type="button" className="p2-btn is-cta is-lg" onClick={doBoost} disabled={busy}>{busy ? <Loader2 className="p2-spin" /> : <Rocket />}{next ? t("plus2.cta.boostLeft", { n: next.missing }) : t("plus2.cta.boost")}</button>;
    }
    if (me.plan) {
      return <button type="button" className="p2-btn is-lg" onClick={() => openPlus({ view: "manage" })}><Rocket />{t("plus2.srv.moveHere")}</button>;
    }
    if (!salesOn) return null;
    return (
      <button type="button" className="p2-btn is-cta is-lg" onClick={doBuy}>
        {trialOk ? t("plus2.cta.trialThen", { days: offer?.trial?.days || 3 }) : t("plus2.cta.buyPlus")}
        {price != null ? <>&nbsp;<Price minor={price} currency={offer?.currency} per="month" /></> : null}
      </button>
    );
  };

  const benefit = s ? Math.max(0, (s.members || 0) - 1) : 0;
  return (
    <PlusWindow title={s?.name || t("plus2.srv.title")} onClose={onClose} size="narrow">
      {!data && !err ? <div className="p2-empty"><Loader2 className="p2-spin" /></div> : null}
      {err && !data ? <div style={{ padding: 18 }}><ErrorLine code={err} /></div> : null}
      {s ? (
        mode === "paywall" && !me.plan ? (
          <div className="p2-paywall">
            <div className="p2-row">
              <ServerTile server={s} size={42} />
              <div className="p2-grow">
                <div style={{ fontWeight: 750, fontSize: 16 }}>{t("plus2.pay.title", { server: s.name })}</div>
                <div className="p2-sub">{next ? t("plus2.pay.away", { n: next.missing, level: next.level }) : t("plus2.pay.max")}</div>
              </div>
            </div>
            <LevelBar count={s.count} levels={levels} thin showTicks={false} />
            {next ? (
              <ul className="p2-perks is-ok">
                {levelAdds(next.level - 1, levels).map((a) => <li key={a.key}><Check />{t(`plus2.everyone.${a.key}`, { n: a.n, h: a.h, fps: a.fps, vanity: s.vanity || "slug" })}</li>)}
              </ul>
            ) : null}
            {verdict?.show !== "compact" ? (
              <div className="p2-mini">
                <b style={{ fontSize: 13 }}>{t("plus2.pay.withPlus", { n: offer?.tiers?.plus?.boosts ?? 2 })}</b>
                <span className="p2-small p2-muted">{t("plus2.pay.forYou")}</span>
              </div>
            ) : null}
            {action()}
            <div className="p2-who">{t("plus2.pay.benefit", { n: benefit })}</div>
            <ErrorLine code={err} />
          </div>
        ) : (
          <div className="p2-srvpage">
            <div className="p2-banner">
              {s.level > 0 ? <span className="p2-pill is-ok">{t("plus2.level.name", { level: s.level })}</span> : null}
            </div>
            <div className="p2-row">
              <div className="p2-grow"><div className="p2-h">{t("plus2.srv.level")}</div><div className="p2-sub">{t("plus2.srv.fromPeople", { count: s.count, people: data.boosters.length })}</div></div>
              <span className="p2-big tnum">{s.count}<small>/{s.progress.max}</small></span>
            </div>
            <LevelBar count={s.count} levels={levels} thin showTicks={false} />
            <ul className="p2-perks is-ok">
              {levels.map((l, i) => levelAdds(i, levels).map((a) => (
                <li key={`${i}-${a.key}`} style={s.level > i ? undefined : { color: "var(--p2-t3)" }}>
                  {s.level > i ? <Check /> : <Lock />}
                  {s.level > i ? t(`plus2.everyone.${a.key}`, { n: a.n, h: a.h, fps: a.fps, vanity: s.vanity || "slug" }) : t("plus2.srv.locked", { level: i + 1, what: t(`plus2.add.${a.key}`, { n: a.n, h: a.h, fps: a.fps, vanity: s.vanity || "slug" }) })}
                </li>
              )))}
            </ul>
            {data.boosters.length ? (
              <div>
                <div className="p2-eyebrow" style={{ marginBottom: 8 }}>{t("plus2.srv.wall")}</div>
                <div className="p2-wall">
                  <div className="p2-stack">
                    {data.boosters.slice(0, 3).map((b) => <PAvatar key={b.userId} user={b.user} size={30} />)}
                    {data.boosters.length > 3 ? <span className="p2-av" style={{ width: 30, height: 30, background: "var(--surface-3)", fontSize: 11 }}>+{data.boosters.length - 3}</span> : null}
                  </div>
                  <span className="p2-small p2-muted p2-ell">{data.boosters.slice(0, 3).map((b) => b.user?.displayName || b.user?.username).filter(Boolean).join(", ")}{data.boosters.length > 3 ? "..." : ""}</span>
                </div>
              </div>
            ) : null}
            {s.goal && s.goal.show ? (
              <div className="p2-goal">
                <div className="p2-row" style={{ gap: 8 }}><Target size={15} /><b style={{ fontSize: 13 }}>{t("plus2.srv.ownerGoal", { date: s.goal.due ? formatDate(`${s.goal.due}T12:00:00`, locale, { day: "numeric", month: "short" }) : "", level: s.goal.level })}</b></div>
                <div className="p2-small p2-muted">{s.goal.reached ? t("plus2.srv.goalReached") : t("plus2.srv.goalLeft", { n: s.goal.missing, days: s.goal.daysLeft ?? "-" })}</div>
              </div>
            ) : null}
            {s.isOwner && data.boosters.length ? (
              <div className="p2-mini">
                <div className="p2-row"><Heart size={15} /><b style={{ fontSize: 13 }}>{t("plus2.srv.thankTitle")}</b></div>
                {thanked ? <div className="p2-small" style={{ color: "var(--p2-ok)" }}>{t("plus2.srv.thanked")}</div> : (
                  <div className="p2-row">
                    <input className="p2-input" value={thanks} maxLength={300} onChange={(e) => setThanks(e.target.value)} placeholder={t("plus2.srv.thankPh")} aria-label={t("plus2.srv.thankTitle")} />
                    <button type="button" className="p2-btn is-sm is-cta" onClick={doThank} disabled={busy}>{t("plus2.srv.thankSend")}</button>
                  </div>
                )}
              </div>
            ) : null}
            {!salesOn && !me.plan ? <div className="p2-note"><Info />{t("plus2.srv.offNote")}</div> : null}
            <ErrorLine code={err} />
            {action()}
          </div>
        )
      ) : null}
    </PlusWindow>
  );
}
