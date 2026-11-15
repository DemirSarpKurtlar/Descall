/**
 * Hediye ve yenileme sınırları (Draft A "Kurallar ve sınırlar" → editor): gift caps
 * (daily send / receive, same person, daily amount, set gifts, account age, cooldown,
 * profanity filter, ring detection, night market items), storefront refresh (per day,
 * price, Descall+ free, locked card), new accounts (days, slot cap, set purchase age),
 * blocked attempts. Every change shows what the limited person will read and needs a
 * reason (audit trail).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { Gift, Monitor, Save, Smartphone } from "./icons.js";
import { shop2Api } from "./adminShop2Api.js";
import { Drawer, Pill, Seg, Skel, Switch, Tabs, UserAv, useFmt } from "./ui.jsx";
import { NumBox } from "./AlgorithmPanel.jsx";
import { changedPaths, reasonOk } from "./shop2Model.js";

const DEFAULT = {
  gift: { dailySend: 3, dailyReceive: 5, samePersonPerWeek: 2, dailyAmount: 20000, setGiftPerDay: 1, minAccountDaysSend: 7, minAccountDaysSet: 3, cooldownMin: 2, profanityFilter: true, ringDetect: true, nightMarketGiftable: false },
  refresh: { perDay: 1, price: 150, premiumFree: true, lockedCards: 1 },
  newAccount: { days: 3, slotCap: 1500, setBuyDays: 3 },
};

function merge(data) {
  const L = data?.limits || data || {};
  return { gift: { ...DEFAULT.gift, ...(L.gift || {}) }, refresh: { ...DEFAULT.refresh, ...(L.refresh || {}) }, newAccount: { ...DEFAULT.newAccount, ...(L.newAccount || {}) } };
}

export default function LimitsDrawer({ open, tab, onTab, onClose, data, onSaved, notify, fail }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const saved = useMemo(() => merge(data), [data]);
  const [s, setS] = useState(saved);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState("desktop");
  useEffect(() => {
    if (open) {
      setS(saved);
      setReason("");
    }
  }, [open, saved]);
  const changes = changedPaths(s, saved);
  const put = (group, key, v) => setS((x) => ({ ...x, [group]: { ...x[group], [key]: v } }));
  const prevOf = (group, key) => (String(saved[group][key]) !== String(s[group][key]) ? <Pill tone="amber">{t("adminShop2.lim.was", { v: typeof saved[group][key] === "boolean" ? t(saved[group][key] ? "adminShop2.on" : "adminShop2.off") : f.n(saved[group][key]) })}</Pill> : null);
  const blocked = data?.blocked || [];
  const stats = data?.stats || {};

  const save = async () => {
    setBusy(true);
    try {
      const patch = {};
      for (const p of changes) {
        const [g, k] = p.split(".");
        patch[g] = { ...(patch[g] || {}), [k]: s[g][k] };
      }
      await shop2Api.saveLimits(patch, reason.trim());
      notify(t("adminShop2.toast.limitsSaved", { n: changes.length }));
      onSaved?.();
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const G = s.gift;
  const R = s.refresh;
  const N = s.newAccount;
  const message =
    tab === "refresh"
      ? t("adminShop2.lim.msgRefresh", { n: R.perDay, price: f.n(R.price) })
      : tab === "newAccount"
      ? t("adminShop2.lim.msgNew", { days: N.days, cap: f.n(N.slotCap) })
      : t("adminShop2.lim.msgGift", { n: G.dailySend });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Gift}
      tone="amber"
      title={t("adminShop2.lim.title")}
      subtitle={t("adminShop2.lim.sub", { v: data?.version ?? 1, n: changes.length })}
      width={680}
      testId="as2-limits-drawer"
      footer={
        <>
          <input className="as2-ft-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("adminShop2.reason.ph")} aria-label={t("adminShop2.reason.label")} data-testid="as2-limits-reason" />
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className="as2-btn is-p" onClick={save} disabled={busy || !changes.length || !reasonOk(reason)} data-testid="as2-limits-save">
            <Save size={15} />
            {t("adminShop2.save")}
          </button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={onTab}
        label={t("adminShop2.lim.title")}
        options={[
          { id: "gift", label: t("adminShop2.lim.tab.gift") },
          { id: "refresh", label: t("adminShop2.lim.tab.refresh") },
          { id: "newAccount", label: t("adminShop2.lim.tab.newAccount") },
          { id: "blocked", label: t("adminShop2.lim.tab.blocked"), count: blocked.length || null },
        ]}
      />
      {!data ? (
        <Skel h={300} r={14} />
      ) : tab === "gift" ? (
        <>
          <div className="as2-num-grid is-4">
            <NumBox label={t("adminShop2.lim.g.dailySend")} value={G.dailySend} unit={t("adminShop2.unit.gift")} onChange={(v) => put("gift", "dailySend", v)} max={50} tag={prevOf("gift", "dailySend")} testId="as2-lim-dailySend" />
            <NumBox label={t("adminShop2.lim.g.dailyReceive")} value={G.dailyReceive} unit={t("adminShop2.unit.gift")} onChange={(v) => put("gift", "dailyReceive", v)} max={50} tag={prevOf("gift", "dailyReceive")} />
            <NumBox label={t("adminShop2.lim.g.samePerson")} value={G.samePersonPerWeek} unit={t("adminShop2.unit.per7")} onChange={(v) => put("gift", "samePersonPerWeek", v)} max={20} tag={prevOf("gift", "samePersonPerWeek")} />
            <NumBox label={t("adminShop2.lim.g.dailyAmount")} value={G.dailyAmount} unit="D" onChange={(v) => put("gift", "dailyAmount", v)} max={500000} step={500} tag={prevOf("gift", "dailyAmount")} />
            <NumBox label={t("adminShop2.lim.g.setGift")} value={G.setGiftPerDay} unit={t("adminShop2.unit.perDay")} onChange={(v) => put("gift", "setGiftPerDay", v)} max={10} tag={prevOf("gift", "setGiftPerDay")} />
            <NumBox label={t("adminShop2.lim.g.sendAge")} value={G.minAccountDaysSend} unit={t("adminShop2.unit.days")} onChange={(v) => put("gift", "minAccountDaysSend", v)} max={365} tag={prevOf("gift", "minAccountDaysSend")} />
            <NumBox label={t("adminShop2.lim.g.setAge")} value={G.minAccountDaysSet} unit={t("adminShop2.unit.days")} onChange={(v) => put("gift", "minAccountDaysSet", v)} max={365} tag={prevOf("gift", "minAccountDaysSet")} />
            <NumBox label={t("adminShop2.lim.g.cooldown")} value={G.cooldownMin} unit={t("adminShop2.unit.min")} onChange={(v) => put("gift", "cooldownMin", v)} max={120} tag={prevOf("gift", "cooldownMin")} />
          </div>
          <div className="as2-lim-tg">
            {[
              ["profanityFilter", "adminShop2.lim.g.profanity"],
              ["ringDetect", "adminShop2.lim.g.ring"],
              ["nightMarketGiftable", "adminShop2.lim.g.nightGift"],
            ].map(([k, key]) => (
              <label key={k} className="as2-tg">
                <Switch checked={Boolean(G[k])} onChange={(v) => put("gift", k, v)} label={t(key)} />
                <span>{t(key)}</span>
                {prevOf("gift", k)}
              </label>
            ))}
          </div>
        </>
      ) : tab === "refresh" ? (
        <>
          <div className="as2-num-grid is-4">
            <NumBox label={t("adminShop2.lim.r.perDay")} value={R.perDay} unit={t("adminShop2.unit.perDay")} onChange={(v) => put("refresh", "perDay", v)} min={0} max={5} tag={prevOf("refresh", "perDay")} testId="as2-lim-perDay" />
            <NumBox label={t("adminShop2.lim.r.price")} value={R.price} unit="D" onChange={(v) => put("refresh", "price", v)} min={0} max={5000} step={10} tag={prevOf("refresh", "price")} />
            <NumBox label={t("adminShop2.lim.r.locked")} value={R.lockedCards} unit={t("adminShop2.unit.card")} onChange={(v) => put("refresh", "lockedCards", v)} min={0} max={2} tag={prevOf("refresh", "lockedCards")} />
          </div>
          <div className="as2-lim-tg">
            <label className="as2-tg">
              <Switch checked={Boolean(R.premiumFree)} onChange={(v) => put("refresh", "premiumFree", v)} label={t("adminShop2.lim.r.premiumFree")} />
              <span>{t("adminShop2.lim.r.premiumFree")}</span>
              {prevOf("refresh", "premiumFree")}
            </label>
          </div>
          <div className="as2-lim-stats">
            <span>
              <small>{t("adminShop2.lim.r.today")}</small>
              <b className="tnum">{f.n(stats.refreshToday ?? 0)}</b>
            </span>
            <span>
              <small>{t("adminShop2.lim.r.buyAfter")}</small>
              <b className="tnum">{f.p(stats.buyAfterRefreshPct ?? 0)}</b>
            </span>
            <span>
              <small>{t("adminShop2.lim.r.revenue")}</small>
              <b className="tnum">{f.c(stats.refreshRevenue ?? 0)} D</b>
            </span>
          </div>
        </>
      ) : tab === "newAccount" ? (
        <div className="as2-num-grid is-3">
          <NumBox label={t("adminShop2.lim.n.days")} value={N.days} unit={t("adminShop2.unit.days")} onChange={(v) => put("newAccount", "days", v)} max={30} tag={prevOf("newAccount", "days")} />
          <NumBox label={t("adminShop2.lim.n.cap")} value={N.slotCap} unit="D" onChange={(v) => put("newAccount", "slotCap", v)} max={20000} step={50} tag={prevOf("newAccount", "slotCap")} />
          <NumBox label={t("adminShop2.lim.n.setBuy")} value={N.setBuyDays} unit={t("adminShop2.unit.days")} onChange={(v) => put("newAccount", "setBuyDays", v)} max={30} tag={prevOf("newAccount", "setBuyDays")} />
        </div>
      ) : (
        <div className="as2-blocked">
          {!blocked.length ? <p className="as2-empty">{t("adminShop2.lim.noBlocked")}</p> : null}
          {blocked.map((b, i) => (
            <div key={i} className="as2-blk">
              <span className="tnum as2-muted">{formatAppDateTime(b.at, locale, { hour: "2-digit", minute: "2-digit" })}</span>
              <UserAv name={b.username} size={22} />
              <b>@{b.username}</b>
              <span className="as2-muted">{b.reasonKey ? t(`adminShop2.lim.why.${b.reasonKey}`, b.vars || {}) : b.reason}</span>
              {b.reasonKey === "ring" ? <Pill tone="red">{t("adminShop2.lim.ringRisk")}</Pill> : null}
            </div>
          ))}
        </div>
      )}

      {tab !== "blocked" && data ? (
        <div className="as2-lim-pv">
          <div className="as2-nm-bh">
            <span className="as2-cap">{t("adminShop2.lim.preview")}</span>
            <Seg
              size="sm"
              value={device}
              onChange={setDevice}
              label={t("adminShop2.preview.device")}
              options={[
                { id: "desktop", label: <Monitor size={14} aria-label={t("adminShop2.preview.desktop")} /> },
                { id: "phone", label: <Smartphone size={14} aria-label={t("adminShop2.preview.phone")} /> },
              ]}
            />
          </div>
          <div className={`as2-lim-msg is-${device}`}>
            <b>{t(tab === "refresh" ? "adminShop2.lim.msgRefreshT" : tab === "newAccount" ? "adminShop2.lim.msgNewT" : "adminShop2.lim.msgGiftT")}</b>
            <p>{message}</p>
          </div>
          {tab === "gift" ? <p className="as2-hint">{t("adminShop2.lim.yesterday", { n: f.n(stats.wouldBlockYesterday ?? 0), pct: f.p(stats.legitShare ?? 0, 0) })}</p> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
