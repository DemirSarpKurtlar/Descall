/**
 * Hediye, yenileme ve satın alma kuralları (Draft A "Kurallar ve sınırlar" → editor, server
 * limits in lib/shop2/rules.js): gifts (per day, per recipient, receive cap, account age
 * to send / to buy a set, message length, schedule horizon, ring detection + window, on /
 * frozen), storefront refresh (per day, price, Descall+ free, streak), purchases (refund
 * window, partial lock, set discount band, undo window), gift ring flags. Every change
 * shows the previous value, what a limited person reads, "if this had applied yesterday"
 * for gifts, and needs a reason; saving offers a 10-minute undo (POST /limits/undo).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { AlertTriangle, Gift, Lock, Monitor, Save, Smartphone, Unlock } from "./icons.js";
import { shop2Api } from "./adminShop2Api.js";
import { Dialog, Drawer, Pill, ReasonField, Seg, Skel, Switch, Tabs, UserAv, useFmt } from "./ui.jsx";
import { NumBox } from "./AlgorithmPanel.jsx";
import { changedPaths, reasonOk } from "./shop2Model.js";

const GROUPS = { gift: "gifts", refresh: "refresh", purchases: "purchases" };

function pick(data) {
  return { gifts: { ...(data?.gift || {}) }, refresh: { ...(data?.refresh || {}) }, purchases: { ...(data?.purchases || {}) } };
}

export default function LimitsDrawer({ open, tab, onTab, onClose, data, onSaved, notify, fail }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const saved = useMemo(() => pick(data), [data]);
  const [s, setS] = useState(saved);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState("desktop");
  const [impact, setImpact] = useState(null);
  const [flags, setFlags] = useState(null);
  const [freeze, setFreeze] = useState(null); // true | false
  const [resolve, setResolve] = useState(null); // { flag, action }

  useEffect(() => {
    if (open) {
      setS(saved);
      setReason("");
      setImpact(null);
    }
  }, [open, saved]);

  // "If this had applied yesterday" for gift changes (read-only POST, no code needed).
  useEffect(() => {
    if (!open || tab !== "gift") return undefined;
    const id = setTimeout(() => {
      shop2Api
        .limitsImpact(s.gifts)
        .then(setImpact)
        .catch(() => setImpact(null));
    }, 400);
    return () => clearTimeout(id);
  }, [open, tab, s.gifts]);

  useEffect(() => {
    if (!open || tab !== "flags") return;
    setFlags(null);
    shop2Api
      .giftFlags()
      .then(setFlags)
      .catch(() => setFlags([]));
  }, [open, tab]);

  const changes = changedPaths(s, saved);
  const put = (group, key, v) => setS((x) => ({ ...x, [group]: { ...x[group], [key]: v } }));
  const was = (group, key) => {
    const a = saved[group]?.[key];
    if (String(a) === String(s[group]?.[key])) return null;
    return <Pill tone="amber">{t("adminShop2.lim.was", { v: typeof a === "boolean" ? t(a ? "adminShop2.on" : "adminShop2.off") : f.n(a ?? 0) })}</Pill>;
  };
  const box = (group, key, label, extra = {}) => <NumBox key={key} label={label} value={s[group]?.[key]} onChange={(v) => put(group, key, v)} tag={was(group, key)} testId={`as2-lim-${key}`} {...extra} />;
  const sw = (group, key, label) => (
    <label key={key} className="as2-tg">
      <Switch checked={Boolean(s[group]?.[key])} onChange={(v) => put(group, key, v)} label={label} />
      <span>{label}</span>
      {was(group, key)}
    </label>
  );

  const save = async () => {
    setBusy(true);
    try {
      const patch = {};
      for (const p of changes) {
        const [g, k] = p.split(".");
        patch[g] = { ...(patch[g] || {}), [k]: s[g][k] };
      }
      await shop2Api.saveLimits(patch, reason.trim());
      onSaved?.(changes.length);
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const G = s.gifts;
  const R = s.refresh;
  const stats = data?.stats || {};
  const code = (c) => t(`adminShop2.lim.why.${c}`, { n: c === "gift_daily_cap" ? G.perDay : c === "gift_recipient_cap" ? G.perRecipientDay : c === "gift_receive_cap" ? G.receivePerDay : c === "gift_new_account" ? G.minAccountDaysSend : G.minAccountDaysSetBuy });
  const message = tab === "refresh" ? t("adminShop2.lim.msgRefresh", { n: R.perDay, price: f.n(R.price) }) : t("adminShop2.lim.msgGift", { n: G.perDay });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Gift}
      tone="amber"
      title={t("adminShop2.lim.title")}
      subtitle={t("adminShop2.lim.sub", { v: data?.version ?? 1, n: changes.length })}
      badge={G.frozen ? <Pill tone="red">{t("adminShop2.lim.frozen")}</Pill> : null}
      width={700}
      testId="as2-limits-drawer"
      footer={
        tab === "flags" ? null : (
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
        )
      }
    >
      <Tabs
        value={tab}
        onChange={onTab}
        label={t("adminShop2.lim.title")}
        options={[
          { id: "gift", label: t("adminShop2.lim.tab.gift") },
          { id: "refresh", label: t("adminShop2.lim.tab.refresh") },
          { id: "purchases", label: t("adminShop2.lim.tab.purchases") },
          { id: "flags", label: t("adminShop2.lim.tab.flags"), count: stats.openFlags || null },
        ]}
      />
      {!data ? (
        <Skel h={300} r={14} />
      ) : tab === "gift" ? (
        <>
          <div className="as2-num-grid is-4">
            {box("gifts", "perDay", t("adminShop2.lim.g.dailySend"), { unit: t("adminShop2.unit.perDay"), max: 50 })}
            {box("gifts", "receivePerDay", t("adminShop2.lim.g.dailyReceive"), { unit: t("adminShop2.unit.perDay"), max: 50 })}
            {box("gifts", "perRecipientDay", t("adminShop2.lim.g.samePerson"), { unit: t("adminShop2.unit.perDay"), max: 20 })}
            {box("gifts", "maxMessage", t("adminShop2.lim.g.maxMessage"), { unit: t("adminShop2.unit.chars"), max: 500 })}
            {box("gifts", "minAccountDaysSend", t("adminShop2.lim.g.sendAge"), { unit: t("adminShop2.unit.days"), max: 365 })}
            {box("gifts", "minAccountDaysSetBuy", t("adminShop2.lim.g.setAge"), { unit: t("adminShop2.unit.days"), max: 365 })}
            {box("gifts", "maxScheduleDays", t("adminShop2.lim.g.schedule"), { unit: t("adminShop2.unit.days"), max: 90 })}
            {box("gifts", "ringWindowDays", t("adminShop2.lim.g.ringWindow"), { unit: t("adminShop2.unit.days"), min: 1, max: 60 })}
          </div>
          <div className="as2-lim-tg">
            {sw("gifts", "enabled", t("adminShop2.lim.g.enabled"))}
            {sw("gifts", "ringDetection", t("adminShop2.lim.g.ring"))}
            <button type="button" className={`as2-btn is-sm ${G.frozen ? "" : "is-danger-soft"} as2-ml`} onClick={() => setFreeze(!G.frozen)} data-testid="as2-gift-freeze">
              {G.frozen ? <Unlock size={14} /> : <Lock size={14} />}
              {t(G.frozen ? "adminShop2.lim.unfreeze" : "adminShop2.lim.freeze")}
            </button>
          </div>
          {impact ? (
            <div className="as2-lim-impact">
              <span className="as2-cap">{t("adminShop2.lim.ifYesterday")}</span>
              <b className="tnum">{t("adminShop2.lim.impactV", { n: f.n(impact.proposed?.blocked ?? 0), total: f.n(impact.gifts ?? 0) })}</b>
              <em className={`tnum ${(impact.delta?.blocked ?? 0) > 0 ? "as2-amber" : "as2-pos"}`}>{t("adminShop2.lim.impactDelta", { d: `${(impact.delta?.blocked ?? 0) >= 0 ? "+" : "−"}${f.n(Math.abs(impact.delta?.blocked ?? 0))}`, amount: f.c(Math.abs(impact.delta?.blockedAmount ?? 0)) })}</em>
            </div>
          ) : null}
          <div className="as2-lim-stats">
            <span>
              <small>{t("adminShop2.lim.giftsToday")}</small>
              <b className="tnum">{f.n(stats.giftsToday ?? 0)}</b>
            </span>
            <span>
              <small>{t("adminShop2.lim.blockedToday")}</small>
              <b className="tnum">{f.n(stats.giftBlockedToday ?? 0)}</b>
            </span>
            <span>
              <small>{t("adminShop2.lim.tab.flags")}</small>
              <b className="tnum">{f.n(stats.openFlags ?? 0)}</b>
            </span>
          </div>
          {Object.keys(stats.blockedByCode || {}).length ? (
            <div className="as2-us-chips">
              {Object.entries(stats.blockedByCode).map(([c, n]) => (
                <Pill key={c} tone="amber">
                  {code(c)} · {f.n(n)}
                </Pill>
              ))}
            </div>
          ) : null}
        </>
      ) : tab === "refresh" ? (
        <>
          <div className="as2-num-grid is-4">
            {box("refresh", "perDay", t("adminShop2.lim.r.perDay"), { unit: t("adminShop2.unit.perDay"), max: 10 })}
            {box("refresh", "price", t("adminShop2.lim.r.price"), { unit: "D", max: 5000, step: 10 })}
            {box("refresh", "streakDays", t("adminShop2.lim.r.streak"), { unit: t("adminShop2.unit.days"), max: 60 })}
          </div>
          <div className="as2-lim-tg">{sw("refresh", "premiumFree", t("adminShop2.lim.r.premiumFree"))}</div>
          <div className="as2-lim-stats">
            <span>
              <small>{t("adminShop2.lim.r.today")}</small>
              <b className="tnum">{f.n(stats.refreshToday ?? 0)}</b>
            </span>
            <span>
              <small>{t("adminShop2.lim.r.revenue")}</small>
              <b className="tnum">{f.c(stats.refreshRevenue ?? 0)} D</b>
            </span>
          </div>
        </>
      ) : tab === "purchases" ? (
        <div className="as2-num-grid is-3">
          {box("purchases", "refundMinutes", t("adminShop2.lim.p.refund"), { unit: t("adminShop2.unit.min"), max: 120 })}
          {box("purchases", "partialLockDays", t("adminShop2.lim.p.partial"), { unit: t("adminShop2.unit.days"), max: 30 })}
          {box("purchases", "actionUndoMinutes", t("adminShop2.lim.p.undo"), { unit: t("adminShop2.unit.min"), max: 60 })}
          {box("purchases", "setDiscountMin", t("adminShop2.lim.p.discMin"), { unit: "%", max: 60 })}
          {box("purchases", "setDiscountMax", t("adminShop2.lim.p.discMax"), { unit: "%", max: 80 })}
        </div>
      ) : (
        <div className="as2-blocked">
          {flags == null ? <Skel h={120} r={12} /> : null}
          {flags && !flags.length ? <p className="as2-empty">{t("adminShop2.lim.noFlags")}</p> : null}
          {(flags || []).map((fl) => (
            <div key={fl.id} className={`as2-flag${fl.status === "open" ? " is-open" : ""}`}>
              <div className="as2-flag-h">
                <AlertTriangle size={16} />
                <b>{t(fl.kind === "ping_pong" ? "adminShop2.lim.flagPingPong" : "adminShop2.lim.flagRing")}</b>
                <Pill tone={fl.status === "open" ? "red" : "gray"}>{fl.status === "open" ? t("adminShop2.lim.ringRisk") : fl.resolution || fl.status}</Pill>
                <span className="as2-muted as2-ml tnum">{formatAppDateTime(fl.createdAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="as2-flag-users">
                {(fl.users || []).slice(0, 8).map((u) => (
                  <span key={u.id || u} className="as2-chip is-ghost">
                    <UserAv name={u.username || String(u)} size={18} />@{u.username || String(u).slice(0, 8)}
                  </span>
                ))}
              </div>
              <div className="as2-flag-ft">
                <span className="tnum">{t("adminShop2.lim.flagAmount", { amount: f.n(fl.amount ?? 0), n: (fl.edges || []).length })}</span>
                {fl.status === "open" ? (
                  <span className="as2-ml as2-warn-acts">
                    <button type="button" className="as2-btn is-sm is-danger-soft" onClick={() => setResolve({ flag: fl, action: "freeze" })}>
                      <Lock size={14} />
                      {t("adminShop2.lim.flagFreeze")}
                    </button>
                    <button type="button" className="as2-btn is-sm" onClick={() => setResolve({ flag: fl, action: "dismiss" })}>
                      {t("adminShop2.lim.flagDismiss")}
                    </button>
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (tab === "gift" || tab === "refresh") ? (
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
            <b>{t(tab === "refresh" ? "adminShop2.lim.msgRefreshT" : "adminShop2.lim.msgGiftT")}</b>
            <p>{message}</p>
          </div>
        </div>
      ) : null}

      <ReasonDialog
        open={freeze != null}
        title={t(freeze ? "adminShop2.lim.freezeTitle" : "adminShop2.lim.unfreezeTitle")}
        sub={t(freeze ? "adminShop2.lim.freezeSub" : "adminShop2.lim.unfreezeSub")}
        danger={Boolean(freeze)}
        go={t(freeze ? "adminShop2.lim.freeze" : "adminShop2.lim.unfreeze")}
        onClose={() => setFreeze(null)}
        onConfirm={async (r) => {
          await shop2Api.freezeGifts(Boolean(freeze), r);
          notify(t(freeze ? "adminShop2.toast.giftsFrozen" : "adminShop2.toast.giftsUnfrozen"));
          setFreeze(null);
          onSaved?.(1);
        }}
        fail={fail}
      />
      <ReasonDialog
        open={Boolean(resolve)}
        title={t(resolve?.action === "freeze" ? "adminShop2.lim.flagFreezeTitle" : "adminShop2.lim.flagDismissTitle")}
        sub={t(resolve?.action === "freeze" ? "adminShop2.lim.flagFreezeSub" : "adminShop2.lim.flagDismissSub")}
        danger={resolve?.action === "freeze"}
        go={t(resolve?.action === "freeze" ? "adminShop2.lim.flagFreeze" : "adminShop2.lim.flagDismiss")}
        onClose={() => setResolve(null)}
        onConfirm={async (r) => {
          await shop2Api.resolveFlag(resolve.flag.id, resolve.action, r);
          notify(t("adminShop2.toast.flagResolved"));
          setResolve(null);
          setFlags(null);
          shop2Api.giftFlags().then(setFlags).catch(() => setFlags([]));
        }}
        fail={fail}
      />
    </Drawer>
  );
}

function ReasonDialog({ open, title, sub, go, danger, onClose, onConfirm, fail }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={danger ? Lock : Unlock}
      tone={danger ? "red" : "blue"}
      title={title}
      subtitle={sub}
      width={520}
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button
            type="button"
            className={`as2-btn ${danger ? "is-danger" : "is-p"}`}
            disabled={busy || !reasonOk(reason)}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {go}
          </button>
        </>
      }
    >
      <ReasonField value={reason} onChange={setReason} autoFocus />
    </Dialog>
  );
}

export { GROUPS };
