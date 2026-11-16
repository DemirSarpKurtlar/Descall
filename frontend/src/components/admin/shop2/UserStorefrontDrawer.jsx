/**
 * Kullanıcı vitrini (Draft A frame A3): the 4 items a user sees today / tomorrow / in the
 * past, why each one is there (slot, weight, last seen, band), the seed and rule version
 * (the storefront can be rebuilt exactly), what the pool dropped for this user, the
 * sets at this user's price, refresh / gift / night market state and the last 7 days.
 * Actions: audit trail for the user, grant a free refresh, rebuild the storefront.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { Check, ChevronRight, Eye, Gift, History, Lock, Moon, RefreshCw, Search, Shuffle2, Sparkles, UserRound } from "./icons.js";
import { shop2Api } from "./adminShop2Api.js";
import { Coin, Dialog, Drawer, Pill, RarityPill, ReasonField, Seg, SetMark, Skel, Thumb, UserAv, useFmt, useItemName, fdt } from "./ui.jsx";
import { clock, istDay, nextReset, reasonOk } from "./shop2Model.js";

export default function UserStorefrontDrawer({ open, userId, onPick, onClose, now, notify, fail, onOpenUser, onAudit }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const name = useItemName();
  const [day, setDay] = useState("today");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [confirm, setConfirm] = useState(null); // "regen" | "refresh"
  const [shuffle, setShuffle] = useState(0);

  useEffect(() => {
    if (!open) return;
    setDay("today");
  }, [open, userId]);

  useEffect(() => {
    if (!open || !userId) {
      setData(null);
      return;
    }
    setData(null);
    setErr(false);
    shop2Api
      .userStorefront(userId, day)
      .then((d) => {
        setData(d);
        setShuffle((n) => n + 1);
      })
      .catch(() => setErr(true));
  }, [open, userId, day]);

  const u = data?.user;
  const resetsAt = data?.resetsAt ? Date.parse(data.resetsAt) : nextReset(now);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={Eye}
      title={t("adminShop2.us.title")}
      subtitle={t("adminShop2.us.sub")}
      width={660}
      testId="as2-user-drawer"
      footer={
        userId ? (
          <>
            <button type="button" className="as2-btn" onClick={() => u && onAudit(u)} disabled={!u}>
              <History size={15} />
              {t("adminShop2.us.audit")}
            </button>
            <button type="button" className="as2-btn" onClick={() => setConfirm("refresh")} disabled={!u || day !== "today"} data-testid="as2-us-grant">
              <RefreshCw size={15} />
              {t("adminShop2.us.grant")}
            </button>
            <button type="button" className="as2-btn is-amber as2-ml" onClick={() => setConfirm("regen")} disabled={!u || day !== "today"} data-testid="as2-us-regen">
              <Shuffle2 size={15} />
              {t("adminShop2.us.regen")}
            </button>
          </>
        ) : null
      }
    >
      {!userId ? (
        <UserPicker onPick={onPick} />
      ) : err ? (
        <p className="as2-err">{t("adminShop2.err.generic")}</p>
      ) : (
        <div className="as2-us">
          <div className="as2-us-head">
            {u ? <UserAv name={u.username} src={u.avatarUrl} size={46} /> : <Skel w={46} h={46} r={14} />}
            <div className="as2-us-who">
              {u ? (
                <>
                  <b>
                    {u.displayName || u.username} <span className="as2-muted">@{u.username}</span>
                    {data?.newAccount ? <Pill tone="amber">{t("adminShop2.us.newAccount")}</Pill> : null}
                  </b>
                  <small>{t("adminShop2.us.facts", { owned: f.n(data?.ownedCount ?? 0), wish: f.n(data?.wishlistCount ?? 0) })}</small>
                </>
              ) : (
                <Skel w="70%" h={30} />
              )}
            </div>
            <Seg
              size="sm"
              value={day}
              onChange={setDay}
              label={t("adminShop2.us.day")}
              options={[
                { id: "today", label: t("adminShop2.us.today") },
                { id: "tomorrow", label: t("adminShop2.us.tomorrow") },
                { id: "history", label: t("adminShop2.us.history") },
              ]}
            />
          </div>
          <div className="as2-us-seed">
            <i className="as2-dot is-live" />
            {day === "tomorrow" ? <span>{t("adminShop2.us.tomorrowAt")}</span> : <span>{t("adminShop2.us.resetIn")}</span>}
            <b className="tnum">{clock(resetsAt - now)}</b>
            <span className="as2-muted">
              · {t("adminShop2.us.seed", { seed: data?.seed || "…", v: data?.ruleVersion ?? "…" })}
            </span>
            {u && onOpenUser ? (
              <button type="button" className="as2-link as2-ml" onClick={() => onOpenUser(u.id)}>
                {t("adminShop2.us.dossier")}
              </button>
            ) : null}
          </div>

          {day === "history" ? null : (
            <div className="as2-us-cards" key={shuffle}>
              {!data
                ? Array.from({ length: 4 }, (_, i) => <Skel key={i} h={96} r={14} />)
                : (data.slots || []).map((s, i) => (
                    <div key={`${s.item?.id || i}`} className={`as2-us-card${s.locked ? " is-locked" : ""}${s.source === "refresh" ? " is-refresh" : ""}`} style={{ "--i": i }} tabIndex={0}>
                      <Thumb item={s.item} size={56} />
                      <span className="as2-us-ct">
                        <b>
                          <span className="as2-muted tnum">#{s.slot ?? i + 1}</span> {name(s.item)}
                          {s.locked ? <Lock size={13} /> : null}
                        </b>
                        <span className="as2-us-cp">
                          <RarityPill rarity={s.item?.rarity} />
                          <Coin value={s.item?.price_descoin} />
                        </span>
                        <small className="as2-us-why">{whyText(t, s.why.slice(0, 3), f)}</small>
                        {s.why.length > 3 ? <small className="as2-us-rule">{whyText(t, s.why.slice(3), f)}</small> : null}
                      </span>
                    </div>
                  ))}
            </div>
          )}

          {day !== "history" && data ? (
            <div className="as2-us-box">
              <div className="as2-us-bh">
                <span className="as2-cap">{t("adminShop2.us.excluded")}</span>
                {data.excluded?.pool != null ? <span className="as2-muted tnum">{t("adminShop2.us.poolTo", { pool: f.n(data.excluded.pool), cand: f.n(data.excluded.candidates ?? 0) })}</span> : null}
              </div>
              <div className="as2-us-chips">
                <Pill tone="gray">{t("adminShop2.us.ex.owned", { n: f.n(data.excluded?.owned ?? 0) })}</Pill>
                <Pill tone="gray">{t("adminShop2.us.ex.recent", { n: f.n(data.excluded?.recent ?? 0), d: data.excluded?.recentDays ?? 7 })}</Pill>
                {data.excluded?.region ? <Pill tone="gray">{t("adminShop2.us.ex.region", { n: f.n(data.excluded.region) })}</Pill> : null}
                {data.relaxed?.length ? <Pill tone="amber">{t("adminShop2.us.ex.relaxed")}</Pill> : null}
                {data.excluded?.newAccountCap ? <Pill tone="amber">{t("adminShop2.us.ex.cap", { n: f.n(data.excluded.newAccountCap) })}</Pill> : <Pill tone="green">{t("adminShop2.us.ex.noCap")}</Pill>}
              </div>
            </div>
          ) : null}

          {day !== "history" && data?.sets?.length ? (
            <div className="as2-us-box">
              <span className="as2-cap">{t("adminShop2.us.sets")}</span>
              {data.sets.map((s) => (
                <div key={s.key} className="as2-us-set">
                  <SetMark set={s} size={30} />
                  <b>{s.name}</b>
                  {/* Struck set price only when owned pieces lower it (the same number twice read as a fake discount). */}
                  {s.yourPrice != null && s.yourPrice < s.setPrice ? (
                    <>
                      <s className="tnum">{f.n(s.setPrice)}</s>
                      <ChevronRight size={14} className="as2-muted" />
                    </>
                  ) : null}
                  {s.yourPrice == null ? <span className="as2-muted">{t("adminShop2.us.setClosed")}</span> : <Coin value={s.yourPrice} />}
                  <small className="as2-muted as2-ml">{s.ownedPieces ? t("adminShop2.us.ownedPieces", { n: s.ownedPieces, total: s.total || 8 }) : t("adminShop2.us.ownedNone")}</small>
                </div>
              ))}
            </div>
          ) : null}

          {data ? (
            <div className="as2-us-trio">
              <div>
                <small>
                  <RefreshCw size={14} />
                  {t("adminShop2.us.refresh")}
                </small>
                <b>{data.refresh?.used ? t("adminShop2.us.refreshUsed", { time: data.refresh.at ? fdt(data.refresh.at, locale, { hour: "2-digit", minute: "2-digit" }) : "" }) : t("adminShop2.us.refreshFree")}</b>
                <em>{data.refresh?.free ? t("adminShop2.us.refreshPremium") : t("adminShop2.us.refreshPrice", { price: f.n(data.refresh?.price ?? 150) })}</em>
              </div>
              <div>
                <small>
                  <Gift size={14} />
                  {t("adminShop2.us.gifts")}
                </small>
                <b className="tnum">{t("adminShop2.us.giftsSent", { n: data.gifts?.sent ?? 0, cap: data.gifts?.cap ?? "–" })}</b>
                <em className="tnum">{t("adminShop2.us.giftsGot", { n: data.gifts?.received ?? 0, cap: data.gifts?.receiveCap ?? "–" })}{data.gifts?.blocked ? ` · ${t("adminShop2.tile.blocked", { n: data.gifts.blocked })}` : ""}</em>
              </div>
              <div>
                <small>
                  <Moon size={14} />
                  {t("adminShop2.us.night")}
                </small>
                <b>{data.nightMarket?.open ? t("adminShop2.us.nightOpen") : data.nightMarket?.next ? t("adminShop2.us.nightNext") : t("adminShop2.us.nightNone")}</b>
                <em>
                  {data.nightMarket?.open
                    ? t("adminShop2.us.nightFlips", { used: data.nightMarket.flipsUsed ?? 0, n: data.nightMarket.flips ?? 0, bought: data.nightMarket.bought ?? 0 })
                    : data.nightMarket?.next
                    ? fdt(data.nightMarket.next, locale, { weekday: "short", hour: "2-digit", minute: "2-digit" })
                    : ""}
                </em>
              </div>
            </div>
          ) : null}

          {data?.history?.length ? <History7 history={data.history} totals={data.totals} /> : null}
        </div>
      )}
      <ConfirmUser
        kind={confirm}
        user={u}
        onClose={() => setConfirm(null)}
        onDone={(kind) => {
          setConfirm(null);
          notify(t(kind === "regen" ? "adminShop2.toast.regenerated" : "adminShop2.toast.refreshGranted", { user: `@${u?.username}` }));
          if (kind === "regen") {
            shop2Api
              .userStorefront(userId, "today")
              .then((d) => {
                setData(d);
                setShuffle((n) => n + 1);
              })
              .catch(() => {});
          }
        }}
        fail={fail}
      />
    </Drawer>
  );
}

function whyText(t, list, f) {
  return (list || [])
    .map((w) => {
      const vars = { ...(w.vars || {}) };
      if (vars.r) vars.r = t(`adminShop2.rarity.${vars.r}`);
      if (vars.w != null) vars.w = f.n(vars.w, { maximumFractionDigits: 2 });
      if (vars.a != null) vars.a = f.n(vars.a);
      if (vars.b != null) vars.b = Number(vars.b) >= 100000 ? "∞" : f.n(vars.b);
      return t(w.key, vars);
    })
    .join(" · ");
}

function History7({ history, totals }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  return (
    <div className="as2-us-box">
      <div className="as2-us-bh">
        <span className="as2-cap">{t("adminShop2.us.last7")}</span>
        <span className="as2-muted tnum">
          {t("adminShop2.us.last7Sum", { views: f.n(totals?.impressions ?? history.length * 4), buys: f.n(totals?.buys ?? 0), refresh: f.n(totals?.refreshes ?? 0) })}
        </span>
      </div>
      <div className="as2-us-7">
        {history.slice(-7).map((d) => (
          <div key={d.day} className="as2-us-7d">
            <small>{fdt(new Date(Date.parse(`${d.day}T09:00:00Z`)).toISOString(), locale, { weekday: "short" })}</small>
            <div className="as2-us-7g">
              {(d.items || []).slice(0, 4).map((x, i) => (
                <span key={i} className={`as2-us-7i${x.bought ? " is-bought" : ""}`} title={x.item?.name ? String(typeof x.item.name === "object" ? x.item.name[locale] || x.item.name.tr : x.item.name) : ""}>
                  <Thumb item={x.item} size={30} />
                  {x.bought ? (
                    <i className="as2-us-7c">
                      <Check size={10} />
                    </i>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserPicker({ onPick }) {
  const { t } = useLocale();
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim().replace(/^@/, "");
    if (term.length < 2) {
      setList([]);
      return undefined;
    }
    setBusy(true);
    const id = setTimeout(() => {
      shop2Api
        .searchUsers(term)
        .then((r) => setList(r?.users || []))
        .catch(() => setList([]))
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <div className="as2-upick">
      <label className="as2-search is-wide">
        <Search size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adminShop2.us.pickPh")} data-autofocus="" data-testid="as2-us-search" />
      </label>
      <p className="as2-hint">{t("adminShop2.us.pickHint")}</p>
      <div className="as2-upick-list">
        {busy && !list.length ? <Skel h={44} r={10} /> : null}
        {list.map((u) => (
          <button key={u.id} type="button" className="as2-upick-it" onClick={() => onPick(u.id)}>
            <UserAv name={u.username} src={u.avatarUrl} size={30} />
            <span>
              <b>{u.displayName || u.username}</b>
              <small>@{u.username}</small>
            </span>
            <UserRound size={15} className="as2-muted as2-ml" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfirmUser({ kind, user, onClose, onDone, fail }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (kind) setReason("");
  }, [kind]);
  const go = async () => {
    setBusy(true);
    try {
      if (kind === "regen") await shop2Api.regenerate(user.id, reason.trim());
      else await shop2Api.grantRefresh(user.id, reason.trim());
      onDone(kind);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={Boolean(kind && user)}
      onClose={onClose}
      busy={busy}
      icon={kind === "regen" ? Shuffle2 : RefreshCw}
      tone={kind === "regen" ? "amber" : "blue"}
      title={t(kind === "regen" ? "adminShop2.us.regenTitle" : "adminShop2.us.grantTitle", { user: `@${user?.username || ""}` })}
      subtitle={t(kind === "regen" ? "adminShop2.us.regenSub" : "adminShop2.us.grantSub")}
      width={520}
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className={`as2-btn ${kind === "regen" ? "is-amber" : "is-p"}`} onClick={go} disabled={busy || !reasonOk(reason)} data-testid="as2-us-confirm">
            {kind === "regen" ? <Shuffle2 size={15} /> : <Sparkles size={15} />}
            {t(kind === "regen" ? "adminShop2.us.regenGo" : "adminShop2.us.grantGo")}
          </button>
        </>
      }
    >
      <ReasonField value={reason} onChange={setReason} autoFocus />
    </Dialog>
  );
}
