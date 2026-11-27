/**
 * Small Descall+ 2.0 surfaces that live inside other screens (draft 5B "Uygulamada nerede görünür"):
 *   BoostGoalBar         thin goal bar on top of a server's channel list (owner's goal, live)
 *   BoostersGroup        "Takviye edenler · 4" group in the member list (owner can hide it)
 *   BoostMark            the boost icon next to a booster's name
 *   ServerBoostSettings  Sunucu ayarları > Takviye ve seviye (owner: goal level / date, switches)
 *   ProfileBoostNote     moment 6: another person's card ("X, Gece Kuşları'nı takviye ediyor") + Teşekkür et
 *   StoreGiftCard        moment 8: Mağaza > Hediyeler, the Descall+ gift card
 *   StreakTicketCard     moment 10: after a 30-day streak, the bonus trial ticket (keep or send)
 *   DmGiftStrip          moment 11: gift cards between you and the other person, in the DM
 *   LockedEmojiCard      moment 3 (ready for server emoji; the free path "join" is always next to it)
 *   FileTooBigCard       moment 1 (inline under the composer; compress first)
 *   PublicBoostWall      the thank-you wall on /s/<slug>
 * None of them render while Descall+ 2.0 is off for this platform.
 */
import { useCallback, useEffect, useState } from "react";
import { useLocale, useT } from "../context/LocaleContext";
import { Gift, Heart, Rocket, Target, Ticket, FileText as FileIcon, Smile, Loader2 } from "../components/ui/Icon.jsx";
import { formatDate } from "../i18n/format.js";
import { PAvatar, LevelBar, Switch, ErrorLine } from "./ui.jsx";
import { usePlus, refreshHub } from "./plusStore.js";
import { getGifts, getServerBoost, getTickets, redeemTicket, saveServerBoostSettings, sendTicket, thankBoosters, trackPaywall } from "./plusApi.js";
import { openPlus } from "./openPlus.js";
import { errorKey, formatPrice } from "./model.js";
import { GiftCard } from "./GiftTracker.jsx";
import "./plus2.css";

/* ---------------- server boost data (one fetch per server, live via plus:server) ---------------- */

const cache = new Map(); // serverId -> { at, data }
const subs = new Map(); // serverId -> Set(fn)

export function invalidateServerBoost(serverId) {
  cache.delete(String(serverId));
  for (const fn of subs.get(String(serverId)) || []) fn();
}

export function useServerBoost(serverId, { enabled = true } = {}) {
  const [data, setData] = useState(() => cache.get(String(serverId))?.data || null);
  const load = useCallback(async () => {
    if (!serverId || !enabled) return;
    const hit = cache.get(String(serverId));
    if (hit && Date.now() - hit.at < 60000) {
      setData(hit.data);
      return;
    }
    try {
      const d = await getServerBoost(serverId);
      cache.set(String(serverId), { at: Date.now(), data: d });
      setData(d);
    } catch {
      setData(null);
    }
  }, [serverId, enabled]);
  useEffect(() => {
    load();
    if (!serverId) return undefined;
    const key = String(serverId);
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(load);
    return () => subs.get(key)?.delete(load);
  }, [load, serverId]);
  return data;
}

/** Socket: "plus:server" refreshes the server's boost data (PlusHost wires it). */
export function onPlusServerEvent(payload) {
  if (payload?.serverId) invalidateServerBoost(payload.serverId);
}

function useBoostsOn() {
  const { offer } = usePlus({ load: "offer" });
  return Boolean(offer?.boostsOn);
}

/* ---------------- goal bar ---------------- */

export function BoostGoalBar({ serverId }) {
  const t = useT();
  const on = useBoostsOn();
  const data = useServerBoost(serverId, { enabled: on });
  const goal = data?.server?.goal;
  if (!on || !goal || !goal.show || goal.reached) return null;
  return (
    <div className="p2">
      <button type="button" className="p2-goalbar" onClick={() => openPlus({ view: "server", serverId })}>
        <span className="p2-row"><Target /><span className="p2-grow p2-ell">{t("plus2.goal.bar", { level: goal.level, n: goal.missing })}</span>{goal.daysLeft != null ? <span className="p2-muted tnum">{t("plus2.goal.days", { n: goal.daysLeft })}</span> : null}</span>
        <LevelBar count={data.server.count} levels={data.levels} thin showTicks={false} />
      </button>
    </div>
  );
}

/** "· Seviye 2" next to the server's member count; opens the boost page (draft: tap the server name). */
export function ServerLevelChip({ serverId }) {
  const t = useT();
  const on = useBoostsOn();
  const data = useServerBoost(serverId, { enabled: on });
  if (!on || !data?.server) return null;
  return (
    <button
      type="button"
      className="p2-levelchip"
      onClick={(e) => { e.stopPropagation(); openPlus({ view: "server", serverId }); }}
      aria-label={t("plus2.srv.openPage")}
      style={{ border: 0, background: "none", padding: 0, marginLeft: 4, color: "inherit", font: "inherit", cursor: "pointer" }}
    >
      {" · "}<Rocket size={11} style={{ verticalAlign: "-1px" }} /> {data.server.level > 0 ? t("plus2.level.name", { level: data.server.level }) : t("plus2.srv.boostCount", { n: data.server.count })}
    </button>
  );
}

/* ---------------- member list ---------------- */

export function BoostMark({ title }) {
  return <span className="p2-boostmark" title={title} aria-label={title}><Rocket /></span>;
}

/** Ids of the people boosting a server (for the badge next to names). Empty when off / hidden. */
export function useBoosterIds(serverId) {
  const on = useBoostsOn();
  const data = useServerBoost(serverId, { enabled: on });
  if (!on || !data) return { ids: new Set(), showGroup: false, boosters: [] };
  return {
    ids: new Set((data.boosters || []).map((b) => String(b.userId))),
    showGroup: data.server?.settings?.showBoostersGroup !== false,
    boosters: data.boosters || [],
  };
}

export function BoostersGroup({ serverId, renderMember }) {
  const t = useT();
  const { showGroup, boosters } = useBoosterIds(serverId);
  if (!showGroup || boosters.length === 0) return null;
  return (
    <div className="p2-boosters-group">
      <div className="p2-eyebrow" style={{ padding: "10px 8px 4px" }}>{t("plus2.members.boosters", { n: boosters.length })}</div>
      {boosters.map((b) => (renderMember ? renderMember(b) : (
        <div key={b.userId} className="p2-friend" style={{ padding: "4px 8px" }}>
          <PAvatar user={b.user} size={28} />
          <span className="p2-ell" style={{ fontSize: 13.5, fontWeight: 650, color: "color-mix(in srgb, #ff7ad9 45%, var(--text-0))" }}>{b.user?.displayName || b.user?.username}</span>
          <BoostMark title={t("plus2.members.boosting")} />
        </div>
      )))}
    </div>
  );
}

/* ---------------- owner settings ---------------- */

export function ServerBoostSettings({ serverId }) {
  const t = useT();
  const on = useBoostsOn();
  const data = useServerBoost(serverId, { enabled: on });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data?.server?.settings) setForm({ ...data.server.settings });
  }, [data?.server?.settings]);
  if (!on || !data || !data.server?.isOwner || !form) return null;
  const save = async (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await saveServerBoostSettings(serverId, patch);
      invalidateServerBoost(serverId);
      setSaved(true);
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="p2" aria-labelledby="p2-sset">
      <div className="p2-row p2-card" style={{ padding: "10px 12px" }}>
        <Rocket size={18} />
        <b id="p2-sset" className="p2-grow">{t("plus2.settings.title")}</b>
        <span className="p2-pill is-ok">{t("plus2.level.short", { level: data.server.level })}</span>
      </div>
      <div className="p2-card" style={{ padding: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ fontSize: 13.5 }}>{t("plus2.settings.goal")}</b>
        <div className="p2-grid2">
          <select className="p2-select" value={form.goalLevel || ""} disabled={busy} onChange={(e) => save({ goalLevel: e.target.value ? Number(e.target.value) : null })} aria-label={t("plus2.settings.goalLevel")}>
            <option value="">{t("plus2.settings.noGoal")}</option>
            {[1, 2, 3].map((l) => <option key={l} value={l}>{t("plus2.level.name", { level: l })}</option>)}
          </select>
          <input type="date" className="p2-input" value={form.goalDue || ""} disabled={busy || !form.goalLevel} onChange={(e) => save({ goalDue: e.target.value || null })} aria-label={t("plus2.settings.goalDue")} />
        </div>
        <label className="p2-row" style={{ fontSize: 13 }}><Switch checked={form.goalShow !== false} onChange={(v) => save({ goalShow: v })} label={t("plus2.settings.goalShow")} disabled={busy} /><span>{t("plus2.settings.goalShow")}</span></label>
        <label className="p2-row" style={{ fontSize: 13 }}><Switch checked={form.showBoostersGroup !== false} onChange={(v) => save({ showBoostersGroup: v })} label={t("plus2.settings.group")} disabled={busy} /><span>{t("plus2.settings.group")}</span></label>
        <label className="p2-row" style={{ fontSize: 13 }}><Switch checked={form.thankWall !== false} onChange={(v) => save({ thankWall: v })} label={t("plus2.settings.wall")} disabled={busy} /><span>{t("plus2.settings.wall")}</span></label>
        <div className="p2-note">{t("plus2.settings.rule")}</div>
        {saved ? <div className="p2-small" style={{ color: "var(--p2-ok)" }}>{t("plus2.settings.saved")}</div> : null}
        <ErrorLine code={err} />
      </div>
    </section>
  );
}

/* ---------------- moment 6: someone else's card ---------------- */

export function ProfileBoostNote({ user, serverId, serverName }) {
  const t = useT();
  const { ids } = useBoosterIds(serverId);
  const [thanked, setThanked] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user?.id || !ids.has(String(user.id))) return null;
  const name = user.displayName || user.username;
  const thank = async () => {
    setBusy(true);
    try {
      await thankBoosters(serverId, { toUserId: user.id, message: "" });
      setThanked(true);
    } catch {
      /* rate limited: the button stays */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p2" style={{ marginTop: 8 }}>
      <div className="p2-moment" style={{ padding: 10 }}>
        <div className="p2-small" style={{ color: "var(--p2-t2)" }}>{t("plus2.card.boosting", { name, server: serverName || "" })}</div>
        <div className="p2-row">
          <button type="button" className="p2-btn is-sm" onClick={thank} disabled={busy || thanked}><Heart />{thanked ? t("plus2.card.thanked") : t("plus2.card.thank")}</button>
          <button type="button" className="p2-btn is-sm is-cta" onClick={() => { trackPaywall("profile_card", "clicked", { serverId }); openPlus({ view: "hub" }); }}>{t("plus2.card.getLook")}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- moment 8: store ---------------- */

export function StoreGiftCard() {
  const t = useT();
  const { locale } = useLocale() || {};
  const { offer } = usePlus({ load: "offer" });
  if (!offer?.salesOn || !offer?.features?.gifts || !offer?.prices) return null;
  return (
    <div className="p2">
      <button type="button" className="p2-card p2-row" style={{ padding: 12, width: "100%", border: 0, textAlign: "left" }} onClick={() => openPlus({ view: "checkout", tab: "gift" })}>
        <span className="p2-av is-sq" style={{ width: 42, height: 42, background: "linear-gradient(145deg,#8d86ff,#587af5)" }}><Gift size={20} /></span>
        <span className="p2-grow">
          <b style={{ fontSize: 14 }}>{t("plus2.store.title")}</b>
          <span className="p2-sub" style={{ display: "block" }}>
            {t("plus2.store.one")} {formatPrice(offer.prices.gift_plus_1, offer.currency, locale)} · {t("plus2.store.three")} {formatPrice(offer.prices.gift_plus_3, offer.currency, locale)}
          </span>
        </span>
      </button>
    </div>
  );
}

/* ---------------- moment 10: streak ticket ---------------- */

export function StreakTicketCard({ onDone }) {
  const t = useT();
  const { hub, offer } = usePlus({ load: "hub" });
  const [tickets, setTickets] = useState(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  useEffect(() => { getTickets().then(setTickets).catch(() => setTickets(null)); }, []);
  const ticket = (tickets?.own || []).find((x) => x.source === "streak" && x.status === "available");
  if (!offer?.features?.tickets || !ticket) return null;
  const friends = (hub?.friends || []).filter((f) => !f.plan);
  const run = async (fn, key) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setDone(key);
      refreshHub();
      onDone?.();
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p2">
      <div className="p2-moment">
        <div className="p2-h"><Ticket />{t("plus2.streak.bonus", { days: offer?.trial?.days || 3 })}</div>
        {done ? <div className="p2-small" style={{ color: "var(--p2-ok)" }}>{t(done === "self" ? "plus2.streak.started" : "plus2.ticket.sent")}</div> : (
          <div className="p2-row" style={{ flexWrap: "wrap" }}>
            {!tickets?.trialUsed && !hub?.me?.active ? <button type="button" className="p2-btn is-sm" disabled={busy} onClick={() => run(() => redeemTicket(ticket.id), "self")}>{t("plus2.streak.self")}</button> : null}
            {friends.length ? (
              <>
                <select className="p2-select" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("plus2.ticket.pick")}>
                  <option value="">{t("plus2.ticket.pick")}</option>
                  {friends.map((f) => <option key={f.id} value={f.id}>{f.displayName || f.username}</option>)}
                </select>
                <button type="button" className="p2-btn is-sm is-cta" disabled={!to || busy} onClick={() => run(() => sendTicket(ticket.id, to), "friend")}>{busy ? <Loader2 className="p2-spin" /> : t("plus2.streak.friend")}</button>
              </>
            ) : null}
          </div>
        )}
        <ErrorLine code={err} />
      </div>
    </div>
  );
}

/* ---------------- moment 11: DM gift strip ---------------- */

let giftsCache = { at: 0, data: null, inflight: null };
function loadGiftsCached(force = false) {
  if (!force && giftsCache.data && Date.now() - giftsCache.at < 60000) return Promise.resolve(giftsCache.data);
  if (giftsCache.inflight) return giftsCache.inflight;
  giftsCache.inflight = getGifts()
    .then((d) => { giftsCache = { at: Date.now(), data: d, inflight: null }; return d; })
    .catch(() => { giftsCache.inflight = null; return null; });
  return giftsCache.inflight;
}

export function DmGiftStrip({ otherUserId }) {
  const { hub, offer } = usePlus({ load: "offer" });
  const [gifts, setGifts] = useState(() => hub?.gifts || giftsCache.data);
  const on = Boolean(offer?.features?.gifts || offer?.boostsOn);
  useEffect(() => {
    if (!on || !otherUserId) return;
    let alive = true;
    loadGiftsCached(Boolean(hub?.gifts)).then((d) => { if (alive && d) setGifts(d); });
    return () => { alive = false; };
  }, [on, otherUserId, hub?.gifts]);
  if (!otherUserId || !gifts) return null;
  const received = (gifts.received || []).filter((g) => g.from?.id === otherUserId && g.status === "delivered");
  const sent = (gifts.sent || []).filter((g) => g.to?.id === otherUserId && ["scheduled", "delivered"].includes(g.status));
  if (!received.length && !sent.length) return null;
  return (
    <div className="p2" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 16px" }}>
      {received.map((g) => <GiftCard key={g.id} gift={g} viewer="recipient" />)}
      {sent.map((g) => <GiftCard key={g.id} gift={g} viewer="sender" />)}
    </div>
  );
}

/* ---------------- moments 3 and 1 ---------------- */

export function LockedEmojiCard({ emoji, serverName, onJoin }) {
  const t = useT();
  const { offer } = usePlus({ load: "offer" });
  if (!offer?.salesOn) return null;
  return (
    <div className="p2"><div className="p2-moment">
      <div className="p2-h"><Smile />{`:${emoji}:`}</div>
      <div className="p2-small p2-muted">{t("plus2.emoji.body", { server: serverName })}</div>
      <div className="p2-row">
        <button type="button" className="p2-btn is-sm" onClick={onJoin}>{t("plus2.emoji.join")}</button>
        <button type="button" className="p2-btn is-sm is-cta" onClick={() => { trackPaywall("locked_emoji", "clicked"); openPlus({ view: "checkout", tab: "self", moment: "locked_emoji" }); }}>{t("plus2.emoji.everywhere")}</button>
      </div>
    </div></div>
  );
}

export function FileTooBigCard({ name, sizeMb, limitMb, serverId, onCompress }) {
  const t = useT();
  const { offer } = usePlus({ load: "offer" });
  if (!offer?.salesOn) return null;
  return (
    <div className="p2"><div className="p2-moment">
      <div className="p2-row"><FileIcon size={18} /><div className="p2-grow"><b className="p2-ell" style={{ display: "block", fontSize: 13 }}>{name}</b><span className="p2-small" style={{ color: "var(--danger-text, #ff7b7b)" }}>{t("plus2.file.over", { size: sizeMb, limit: limitMb })}</span></div></div>
      <div className="p2-row">
        {onCompress ? <button type="button" className="p2-btn is-sm" onClick={onCompress}>{t("plus2.file.compress")}</button> : null}
        <button type="button" className="p2-btn is-sm is-cta" onClick={() => { trackPaywall("file_too_big", "clicked", { serverId }); openPlus({ view: serverId ? "server" : "checkout", serverId, mode: "paywall", tab: "self", moment: "file_too_big" }); }}>{t("plus2.file.bigger")}</button>
      </div>
    </div></div>
  );
}

/* ---------------- public page ---------------- */

export function PublicBoostWall({ wall }) {
  const t = useT();
  const { locale } = useLocale() || {};
  if (!wall?.boosters?.length) return null;
  return (
    <section className="p2 p2-card" style={{ padding: 16 }} aria-labelledby="p2-wall-h">
      <div className="p2-row"><Heart size={16} /><b id="p2-wall-h">{t("plus2.wall.title")}</b><span className="p2-grow" /><span className="p2-pill is-ok">{t("plus2.level.short", { level: wall.level })}</span></div>
      <div className="p2-sub" style={{ marginBottom: 10 }}>{t("plus2.wall.sub", { n: wall.count })}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {wall.boosters.map((b) => (
          <div key={b.username} className="p2-row" style={{ minWidth: 180 }}>
            <PAvatar user={b} size={30} />
            <div className="p2-grow"><div className="p2-ell" style={{ fontWeight: 650, fontSize: 13 }}>{b.displayName || b.username}</div><div className="p2-sub">{t("plus2.wall.since", { date: formatDate(b.since, locale, { month: "short", year: "numeric" }) })}</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}
