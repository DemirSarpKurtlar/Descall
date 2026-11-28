/**
 * Descall+ merkezi (draft 5B section 1): plans on the left, the servers you boost in the middle
 * (level bars, what each level opens), friends you can gift on the right; below it the
 * Free / Descall+ / Ultra comparison and the honest note. Opened from the rail icon.
 */
import { useMemo, useState } from "react";
import { useLocale, useT } from "../context/LocaleContext";
import { Check, Gift, Info, Rocket, Sparkles, Ticket, Users, AlertTriangle, Settings, Loader2 } from "../components/ui/Icon.jsx";
import { featuresForPlan } from "../premium/features.js";
import { formatDate } from "../i18n/format.js";
import { PAvatar, PlanPill, Price, PlusWindow, ServerTile, LevelBar, ErrorLine } from "./ui.jsx";
import { usePlus, refreshHub } from "./plusStore.js";
import { openPlus } from "./openPlus.js";
import { boost as boostServer, sendTicket } from "./plusApi.js";
import { comparison, daysLeft, errorKey, levelAdds, shareOf } from "./model.js";
import TrialBanner from "./TrialBanner.jsx";

function coinsOf(plans, id) {
  const p = (plans || []).find((x) => x.id === id);
  return p ? Number(p.monthlyDescoin) || 0 : null;
}

export function PlansColumn({ hub, onTry, compact = false }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const offer = hub?.offer || {};
  const cmp = comparison(offer);
  const me = hub?.me || {};
  const prices = offer.prices || null;
  const fmt = (n) => new Intl.NumberFormat(locale || "tr").format(n);
  const plusCoins = coinsOf(hub?.plans, "plus");
  const ultraCoins = coinsOf(hub?.plans, "ultra");
  const trialOk = offer.features?.trial && !me.trialUsed && !me.active;
  return (
    <section className="p2-col" aria-labelledby="p2-plans-h">
      <div className="p2-colhead"><div className="p2-grow"><h3 id="p2-plans-h">{t("plus2.hub.plans")}</h3><div className="p2-sub">{t("plus2.hub.plansSub")}</div></div></div>
      <div className="p2-plan">
        <div className="p2-plan-top"><b>{t("plus2.plan.free")}</b><Price minor={0} currency={offer.currency} /></div>
        <div className="p2-small p2-muted">{t("plus2.hub.freeLine", { h: cmp.free.screen })}</div>
      </div>
      <div className="p2-plan is-plus">
        <div className="p2-plan-top">
          <PlanPill plan="plus" />
          {prices ? <Price minor={prices.plus_monthly} currency={offer.currency} per="month" /> : <span className="p2-price p2-muted">{t("plus2.hub.soon")}</span>}
        </div>
        <ul className="p2-perks">
          <li><Rocket /><b>{t("plus2.perk.boosts", { n: cmp.plus.boosts })}</b></li>
          <li><Sparkles />{t("plus2.perk.animated")}</li>
          <li><Check />{t("plus2.perk.badge")}</li>
          <li><Check />{t("plus2.perk.screen", { q: cmp.plus.screen })}</li>
          {plusCoins ? <li><Check />{t("plus2.perk.coins", { n: fmt(plusCoins) })}</li> : null}
          <li><Ticket />{t("plus2.perk.tickets", { n: cmp.plus.tickets })}</li>
          {!compact ? <li><Check />{t("plus2.perk.tools", { n: featuresForPlan("plus").length })}</li> : null}
        </ul>
        {me.plan === "plus" ? (
          <span className="p2-pill is-ok"><Check />{t("plus2.hub.yourPlan")}</span>
        ) : prices && !me.active ? (
          <button type="button" className="p2-btn is-cta" onClick={() => onTry?.("plus")}>{trialOk ? t("plus2.cta.trial", { days: offer.trial?.days || 3 }) : t("plus2.cta.buyPlus")}</button>
        ) : null}
      </div>
      <div className="p2-plan is-ultra">
        <div className="p2-plan-top">
          <PlanPill plan="ultra" />
          {prices ? <Price minor={prices.ultra_monthly} currency={offer.currency} per="month" /> : null}
        </div>
        <div className="p2-small" style={{ color: "var(--p2-t2)" }}>
          {t("plus2.hub.ultraLine", { boosts: cmp.ultra.boosts, coins: ultraCoins ? fmt(ultraCoins) : "-", tools: featuresForPlan("ultra").length })}
        </div>
        {me.plan === "ultra" ? <span className="p2-pill is-ok"><Check />{t("plus2.hub.yourPlan")}</span>
          : prices && (me.plan === "plus" || !me.active) ? <button type="button" className="p2-btn is-sm" onClick={() => onTry?.("ultra")}>{me.plan === "plus" ? t("plus2.cta.upgrade") : t("plus2.cta.chooseUltra")}</button> : null}
      </div>
    </section>
  );
}

function ServerBoostCard({ server, open, onToggle, onBoost, busy, levels }) {
  const t = useT();
  const prog = server.progress || {};
  const next = prog.next;
  return (
    <div className={`p2-srv${open ? " is-open" : ""}`}>
      <div className="p2-row">
        <ServerTile server={server} size={open ? 40 : 34} />
        <button type="button" className="p2-grow" onClick={onToggle} style={{ border: 0, background: "none", padding: 0, textAlign: "left" }} aria-expanded={open}>
          <div className="p2-ell" style={{ fontWeight: 700, fontSize: 14 }}>{server.name}</div>
          {open ? (
            <div className="p2-sub p2-ell">
              {t("plus2.srv.meta", { members: server.members ?? 0, online: server.online ?? 0, count: server.count })}
              {server.myBoosts ? ` · ${t("plus2.srv.mine", { n: server.myBoosts })}` : ""}
            </div>
          ) : null}
        </button>
        {server.level > 0 ? <span className="p2-pill is-ok">{t("plus2.level.name", { level: server.level })}</span> : null}
        {!open ? (
          <button type="button" className={`p2-btn is-sm${next && next.missing <= 1 ? " is-cta" : ""}`} onClick={onBoost} disabled={busy}>
            <Rocket />{t("plus2.cta.boost")}
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <div className="p2-row" style={{ gap: 10 }}>
            <div className="p2-grow"><LevelBar count={server.count} levels={levels} /></div>
            <span className="p2-small p2-muted tnum" style={{ alignSelf: "flex-start" }}>{server.count} / {prog.max}</span>
          </div>
          <div className="p2-lvls">
            {(levels || []).map((l, i) => (
              <div key={i} className={`p2-lvl${server.level >= i + 1 ? " is-on" : ""}`}>
                <b>{server.level >= i + 1 ? t("plus2.level.open", { level: i + 1 }) : t("plus2.level.name", { level: i + 1 }).toUpperCase()}</b>
                {levelAdds(i, levels).map((a) => t(`plus2.add.${a.key}`, { n: a.n, h: a.h, fps: a.fps, vanity: server.vanity || "slug" })).join(", ")}
              </div>
            ))}
          </div>
          <div className="p2-row">
            {server.goal && server.goal.show ? <span className="p2-small p2-muted p2-grow">{t("plus2.srv.goal", { level: server.goal.level, days: server.goal.daysLeft ?? "-" })}</span> : <span className="p2-grow" />}
            <button type="button" className="p2-btn is-sm is-cta" onClick={onBoost} disabled={busy}><Rocket />{t("plus2.cta.boost")}</button>
          </div>
        </>
      ) : (
        <div className="p2-row">
          <div className="p2-grow"><LevelBar count={server.count} levels={levels} thin showTicks={false} /></div>
          <span className="p2-small p2-muted tnum p2-ell" style={{ maxWidth: "60%" }}>
            {server.count} / {next ? next.boosts : prog.max}
            {next ? ` · ${t("plus2.srv.toLevel", { level: next.level, missing: next.missing })}` : ""}
            {server.goal?.show && !server.goal.reached ? ` · ${t("plus2.srv.goalShort", { level: server.goal.level })}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function BoostsColumn({ hub, onNeedPlan }) {
  const t = useT();
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const servers = hub?.servers || [];
  const levels = hub?.offer?.levels;
  const free = hub?.boosts?.free ?? 0;
  const firstOpen = openId ?? servers[0]?.id ?? null;
  const doBoost = async (s) => {
    setErr(null);
    if (!hub?.me?.active) { onNeedPlan?.(s); return; }
    if (free <= 0) { openPlus({ view: "manage" }); return; }
    setBusy(s.id);
    try {
      await boostServer(s.id);
      await refreshHub();
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="p2-col" aria-labelledby="p2-boost-h">
      <div className="p2-colhead">
        <div className="p2-grow"><h3 id="p2-boost-h">{t("plus2.hub.boosts")}</h3><div className="p2-sub">{t("plus2.hub.boostsSub")}</div></div>
        {hub?.me?.active ? <span className="p2-pill is-info"><Rocket />{t("plus2.hub.ready", { n: free })}</span> : null}
      </div>
      <ErrorLine code={err} />
      {servers.length === 0 ? <div className="p2-empty">{t("plus2.hub.noServers")}</div> : null}
      {servers.map((s) => (
        <ServerBoostCard key={s.id} server={s} levels={levels} open={firstOpen === s.id} onToggle={() => setOpenId(firstOpen === s.id ? "none" : s.id)} onBoost={() => doBoost(s)} busy={busy === s.id} />
      ))}
      <div className="p2-note"><Info />{t("plus2.hub.boostRules", { days: hub?.offer?.boosts?.moveCooldownDays ?? 7, grace: hub?.offer?.boosts?.graceDays ?? 3 })}</div>
    </section>
  );
}

function GiftsColumn({ hub }) {
  const t = useT();
  const [ticketFor, setTicketFor] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const friends = hub?.friends || [];
  const giftsOn = hub?.offer?.features?.gifts;
  const top = friends.find((f) => (f.asked || f.wishlist) && !f.plan) || null;
  const rest = friends.filter((f) => f !== top).slice(0, 6);
  const group = (hub?.gifts?.groups || []).find((g) => g.status === "collecting") || null;
  const tickets = hub?.tickets || {};
  const freeTicket = (tickets.own || []).find((x) => x.status === "available");
  const ticketTargets = friends.filter((f) => !f.plan);
  const sendT = async () => {
    if (!freeTicket || !ticketFor) return;
    setSending(true);
    setMsg(null);
    try {
      await sendTicket(freeTicket.id, ticketFor);
      setMsg("plus2.ticket.sent");
      setTicketFor("");
      await refreshHub();
    } catch (e) {
      setMsg(errorKey(e?.code));
    } finally {
      setSending(false);
    }
  };
  const giftTo = (f) => openPlus({ view: "checkout", tab: "gift", recipientId: f.id, recipient: f });
  return (
    <section className="p2-col" aria-labelledby="p2-gift-h">
      <div className="p2-colhead"><div className="p2-grow"><h3 id="p2-gift-h">{t("plus2.hub.gift")}</h3><div className="p2-sub">{t("plus2.hub.giftSub")}</div></div></div>
      {top ? (
        <div className="p2-friend-hl">
          <div className="p2-row">
            <PAvatar user={top} size={38} online={top.online} />
            <div className="p2-grow"><div style={{ fontWeight: 700 }}>{top.displayName || top.username}</div><div className="p2-sub">{t(top.asked ? "plus2.gift.askedYou" : "plus2.gift.wishlist")}</div></div>
          </div>
          {giftsOn ? <button type="button" className="p2-btn is-cta" onClick={() => giftTo(top)}><Gift />{t("plus2.cta.gift")}</button> : null}
        </div>
      ) : null}
      <div>
        {rest.map((f) => (
          <div key={f.id} className="p2-friend">
            <PAvatar user={f} size={30} online={f.online} />
            <span className="p2-grow p2-ell" style={{ fontSize: 13.5 }}>{f.displayName || f.username}</span>
            {f.plan ? <PlanPill plan={f.plan} /> : giftsOn ? <button type="button" className="p2-btn is-sm" onClick={() => giftTo(f)}>{t("plus2.cta.giftShort")}</button> : null}
          </div>
        ))}
        {friends.length === 0 ? <div className="p2-empty">{t("plus2.hub.noFriends")}</div> : null}
      </div>
      {group ? (
        <div className="p2-mini">
          <div className="p2-row"><Users size={16} /><b style={{ fontSize: 13.5 }}>{t("plus2.group.title")}</b></div>
          <div className="p2-small p2-muted">{t("plus2.group.line", { name: group.to?.displayName || group.to?.username || "", months: group.months, paid: group.paid, shares: group.shares })}</div>
          <div className="p2-bar is-thin is-warm"><i style={{ width: `${Math.round((group.paid / group.shares) * 100)}%` }} /></div>
        </div>
      ) : null}
      {hub?.offer?.features?.tickets && (tickets.available > 0 || hub?.me?.active) ? (
        <div className="p2-mini">
          <div className="p2-row"><Ticket size={16} /><b style={{ fontSize: 13.5 }}>{t("plus2.ticket.title", { n: tickets.available || 0 })}</b></div>
          <div className="p2-small p2-muted">{t("plus2.ticket.sub", { days: hub?.offer?.trial?.days || 3 })}</div>
          {freeTicket && ticketTargets.length ? (
            <div className="p2-row">
              <select className="p2-select" value={ticketFor} onChange={(e) => setTicketFor(e.target.value)} aria-label={t("plus2.ticket.pick")}>
                <option value="">{t("plus2.ticket.pick")}</option>
                {ticketTargets.map((f) => <option key={f.id} value={f.id}>{f.displayName || f.username}</option>)}
              </select>
              <button type="button" className="p2-btn is-sm is-cta" onClick={sendT} disabled={!ticketFor || sending}>{sending ? <Loader2 className="p2-spin" /> : t("plus2.ticket.send")}</button>
            </div>
          ) : null}
          {msg ? <div className={msg === "plus2.ticket.sent" ? "p2-small" : "p2-err"} style={msg === "plus2.ticket.sent" ? { color: "var(--p2-ok)" } : undefined}>{t(msg)}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

export function Comparison({ hub }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const offer = hub?.offer || {};
  const cmp = comparison(offer);
  const fmt = (n) => new Intl.NumberFormat(locale || "tr").format(n);
  const plusCoins = coinsOf(hub?.plans, "plus");
  const ultraCoins = coinsOf(hub?.plans, "ultra");
  const levels = offer.levels || [];
  const soloLevel = (n) => levels.filter((l) => n >= l.boosts).length;
  const col = (tier, title, price, extra) => (
    <div className={`p2-cmp${tier === "plus" ? " is-plus" : tier === "ultra" ? " is-ultra" : ""}`}>
      <div className="p2-plan-top">{tier === "free" ? <b>{title}</b> : <PlanPill plan={tier} />}{price}</div>
      <dl>
        <div><dt>{t("plus2.cmp.forYou")}</dt><dd>{extra.you}</dd></div>
        <div><dt>{t("plus2.cmp.forServer")}</dt><dd>{extra.server}</dd></div>
        <div><dt>{t("plus2.cmp.forFriend")}</dt><dd>{extra.friend}</dd></div>
        <div><dt>{t("plus2.cmp.wallet")}</dt><dd>{extra.wallet}</dd></div>
      </dl>
    </div>
  );
  return (
    <div className="p2-compare">
      {col("free", t("plus2.plan.free"), <Price minor={0} currency={offer.currency} />, {
        you: <>{t("plus2.cmp.freeYou")}<br />{t("plus2.cmp.screen", { q: cmp.free.screen })}</>,
        server: t("plus2.cmp.freeServer"),
        friend: t("plus2.cmp.freeFriend"),
        wallet: t("plus2.cmp.freeWallet"),
      })}
      {col("plus", "", offer.prices ? <Price minor={offer.prices.plus_monthly} currency={offer.currency} per="month" /> : null, {
        you: <>{t("plus2.cmp.plusYou")}<br />{t("plus2.cmp.screen", { q: cmp.plus.screen })}</>,
        server: <b>{t("plus2.cmp.boostSolo", { n: cmp.plus.boosts, level: soloLevel(cmp.plus.boosts) })}</b>,
        friend: t("plus2.cmp.giftTickets", { n: cmp.plus.tickets }),
        wallet: plusCoins ? t("plus2.cmp.walletTools", { coins: fmt(plusCoins), tools: featuresForPlan("plus").length }) : t("plus2.cmp.tools", { tools: featuresForPlan("plus").length }),
      })}
      {col("ultra", "", offer.prices ? <Price minor={offer.prices.ultra_monthly} currency={offer.currency} per="month" /> : null, {
        you: <>{t("plus2.cmp.ultraYou")}<br />{t("plus2.cmp.screenSource", { q: cmp.ultra.screen })}</>,
        server: <b>{t("plus2.cmp.boostSolo", { n: cmp.ultra.boosts, level: soloLevel(cmp.ultra.boosts) })}</b>,
        friend: t("plus2.cmp.giftTickets", { n: cmp.ultra.tickets }),
        wallet: ultraCoins ? t("plus2.cmp.walletTools", { coins: fmt(ultraCoins), tools: featuresForPlan("ultra").length }) : t("plus2.cmp.tools", { tools: featuresForPlan("ultra").length }),
      })}
    </div>
  );
}

export default function PlusHub({ onClose }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const { hub, loading, error } = usePlus({ load: "hub" });
  const offer = hub?.offer;
  const me = hub?.me || {};
  const salesOn = Boolean(offer?.salesOn);
  const onTry = (plan) => openPlus({ view: "checkout", tab: "self", plan, moment: "server_paywall" });
  const onNeedPlan = (server) => {
    if (salesOn) openPlus({ view: "server", serverId: server.id });
  };
  const head = useMemo(() => (
    <div className="p2-row p2-grow">
      <Sparkles size={18} style={{ color: "var(--p2-a)" }} />
      <h2 style={{ margin: 0 }}>{t("plus2.hub.title")}</h2>
      {me.active ? <PlanPill plan={me.plan} /> : null}
      {me.active && me.endsAt && !me.unlimited ? <span className="p2-small p2-muted">{t(me.cancelAtPeriodEnd ? "plus2.hub.endsOn" : me.autoRenew ? "plus2.hub.renewsOn" : "plus2.hub.endsOn", { date: formatDate(me.endsAt, locale, { day: "numeric", month: "short" }) })}</span> : null}
      <span className="p2-grow" />
      {me.active ? <button type="button" className="p2-btn is-sm" onClick={() => openPlus({ view: "manage" })}><Settings />{t("plus2.hub.manage")}</button> : null}
    </div>
  ), [me.active, me.plan, me.endsAt, me.unlimited, me.cancelAtPeriodEnd, me.autoRenew, t, locale]);
  return (
    <PlusWindow title={t("plus2.hub.title")} onClose={onClose} head={head}>
      {!hub && loading ? <div className="p2-empty"><Loader2 className="p2-spin" /></div> : null}
      {!hub && error ? <div style={{ padding: 20 }}><ErrorLine code={errorKey(error)} /></div> : null}
      {hub ? (
        <>
          {me.trialEndsAt ? <div style={{ padding: "14px 20px 0" }}><TrialBanner me={me} offer={offer} /></div> : null}
          {!salesOn ? (
            <div className="p2-off" role="note"><Info size={16} />{t(me.active ? "plus2.hub.offMember" : "plus2.hub.off")}</div>
          ) : null}
          <div className="p2-hub">
            <PlansColumn hub={hub} onTry={onTry} />
            <BoostsColumn hub={hub} onNeedPlan={onNeedPlan} />
            <GiftsColumn hub={hub} />
          </div>
          <Comparison hub={hub} />
          <div className="p2-honest" role="note"><AlertTriangle />{t("plus2.hub.honest", { h: comparison(offer).free.screen, days: daysLeft(me.trialEndsAt) ?? 0 })}</div>
        </>
      ) : null}
    </PlusWindow>
  );
}

export { shareOf };
