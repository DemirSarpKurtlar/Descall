// "Gece pazarı" (draft C console tab + draft A flip window): personal hidden cards with a
// category hint on the back, flip to reveal the discount (3D), keep up to 2 opened deals
// until closing, open together with a friend for +1 flip, notify / remind toggles, opening
// log, tonight's saving and the price-history check, buy or gift the deal directly.
import { useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import { nightSummary, priceHistoryStats, SHOP2_NIGHT_URGENT_MS, windowProgress } from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, CloseX, Price, RollingClock, Sparkline, Toggle, useNow } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { Bell, Cart, Clock, Gift, History, Info, MessageCircle, Moon, Pin, Sparkles, Star, User, Users, Volume2, Waveform } from "./shop2Icons.jsx";

const HINT_ICON = { profile: User, frame: User, chat: MessageCircle, voice: Volume2, sound: Waveform, badge: Star, effect: Sparkles };

function hintOf(card) {
  const c = card.hint || card.item?.category || "";
  if (["banner", "avatar_frame", "profile_color", "profile_aura"].includes(c)) return "profile";
  if (["chat_bubble", "typing_flare", "reaction_burst"].includes(c)) return "chat";
  if (["voice_tile", "call_overlay"].includes(c)) return "voice";
  if (c === "join_sound") return "sound";
  if (c === "profile_badge") return "badge";
  if (["avatar_effect", "name_effect", "presence_flare"].includes(c)) return "effect";
  if (c === "frame") return "frame";
  return c || "profile";
}

function NightCard({ card, active, onFlip, busy, noFlips, index }) {
  const { t } = useLocale();
  const s2 = useS2();
  const hint = hintOf(card);
  const Icon = HINT_ICON[hint] || Moon;
  return (
    <button
      type="button"
      className={`s2-ncard${card.flipped ? " is-flipped" : ""}${active ? " is-active" : ""}${card.kept ? " is-kept" : ""}${noFlips && !card.flipped ? " is-spent" : ""}`}
      style={{ "--i": index }}
      onClick={() => onFlip(card)}
      disabled={busy}
      aria-label={card.flipped ? s2.itemName(card.item) : t("shop2.night.flipCard", { hint: t(`shop2.night.hint.${hint}`) })}
    >
      <span className="s2-ncard-inner">
        <span className="s2-ncard-back">
          <span className="s2-ncard-pattern" aria-hidden="true" />
          <Moon size={26} weight="fill" className="s2-ncard-moon" />
          <span className="s2-ncard-hint"><Icon size={12} />{t(`shop2.night.hint.${hint}`)}</span>
        </span>
        <span className="s2-ncard-front">
          {card.item ? <Shop2Art item={card.item} size="card" me={s2.me} sample={s2.me?.displayName} /> : null}
          {card.discountPct ? <span className="s2-disc is-gold s2-num">-%{card.discountPct}</span> : null}
          <span className="s2-ncard-body">
            <small className={`s2-rar is-${card.item?.rarity || "common"}`}>{t(`shop2.rarity.${card.item?.rarity || "common"}`)}</small>
            <b>{card.item ? s2.itemName(card.item) : ""}</b>
            <Price value={card.price} old={card.basePrice} size="sm" />
          </span>
        </span>
      </span>
      {card.kept ? <span className="s2-pin"><Pin size={12} weight="fill" />{t("shop2.night.kept")}</span> : null}
    </button>
  );
}

export default function Shop2Night({ onClose }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const nm = s2.data.night;
  const now = useNow(true);
  const [activeIdx, setActiveIdx] = useState(null);
  const [busy, setBusy] = useState(false);
  const prefs = s2.data.prefs;
  const phone = s2.layout === "phone";
  if (!nm) return <div className="s2-skeleton" aria-busy="true"><i /><i /></div>;
  const sum = nightSummary(nm);
  const opened = nm.cards.filter((c) => c.flipped);
  const active = nm.cards.find((c) => c.index === activeIdx) || opened[opened.length - 1] || null;
  const urgent = nm.closesAt && nm.closesAt - now < SHOP2_NIGHT_URGENT_MS;
  const setPref = (patch) => {
    s2.actions.setPref(patch);
    if ("nightNotify" in patch) s2.actions.nightNotify(patch.nightNotify);
  };
  const flip = async (card) => {
    if (card.flipped) {
      setActiveIdx(card.index);
      return;
    }
    if (!nm.open) return;
    if (nm.flipsLeft <= 0) {
      s2.toast(t("shop2.night.noFlips"), { tone: "info" });
      return;
    }
    setBusy(true);
    try {
      await s2.actions.flip(card.index);
      setActiveIdx(card.index);
      try {
        navigator.vibrate?.(14);
      } catch {
        /* no haptics */
      }
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.flip"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const keep = (card) => {
    if (!card.kept && !sum.canKeepMore) {
      s2.toast(t("shop2.night.keepLimit", { n: nm.keepLimit }), { tone: "info" });
      return;
    }
    s2.actions.keepNight(card.index, !card.kept).catch((err) => s2.toast(err?.message || t("shop2.night.keepLimit", { n: nm.keepLimit }), { tone: "error" }));
  };
  const hist = active ? priceHistoryStats(active.priceHistory, active.price) : null;
  const prevLow = active?.previousLowest ?? hist?.previousLowest;
  const cheaper = prevLow && active ? Math.round((1 - active.price / prevLow) * 100) : 0;
  const opensAt = nm.opensAt ? new Date(nm.opensAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "21:00";
  const closesAt = nm.closesAt ? new Date(nm.closesAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "03:00";

  const head = (
    <div className={`s2-nhead${urgent ? " is-urgent" : ""}`}>
      <span className="s2-nhead-ic"><Moon size={22} weight="fill" /></span>
      <div className="s2-nhead-t">
        <h2>{nm.open ? t("shop2.night.openTitle") : t("shop2.night.closedTitle")}</h2>
        <p>{nm.open ? t("shop2.night.openSub", { time: opensAt, n: nm.cards.length }) : t("shop2.night.closedSub", { time: opensAt })}</p>
      </div>
      {nm.open ? (
        <div className="s2-nprog">
          <div className="s2-nprog-l"><span>{opensAt}</span><span>{t("shop2.night.closesIn")} <RollingClock target={nm.closesAt} urgentMs={SHOP2_NIGHT_URGENT_MS} /></span><span>{closesAt}</span></div>
          <span className="s2-bar is-night"><i style={{ width: `${Math.round(windowProgress(nm.opensAt, nm.closesAt, now) * 100)}%` }} /></span>
        </div>
      ) : (
        <div className="s2-nprog"><span className="s2-muted">{t("shop2.night.opensIn")}</span> <RollingClock target={nm.nextOpensAt || nm.opensAt} /></div>
      )}
      <div className="s2-nstats">
        <div><span>{t("shop2.night.opened")}</span><b className="s2-num">{sum.opened}</b></div>
        <div><span>{t("shop2.night.keptN")}</span><b className="s2-num">{sum.kept}</b></div>
        <div>
          <span>{t("shop2.night.flipsLeft")}</span>
          <b className="s2-num">{sum.flipsLeft} / {sum.flipsTotal}</b>
          <span className="s2-flipdots" aria-hidden="true">{Array.from({ length: sum.flipsTotal }, (_, i) => <i key={`${i}-${sum.flipsLeft}`} className={i < sum.flipsLeft ? "is-on" : "is-gone"} />)}</span>
        </div>
        <div><span>{t("shop2.night.savedTonight")}</span><b className="s2-num">{formatNumber(sum.saved, locale)} {t("shop2.common.d")}</b></div>
      </div>
      {onClose ? <CloseX onClick={onClose} label={t("shop2.common.close")} /> : null}
    </div>
  );

  const log = (
    <section className="s2-col s2-nlog">
      <div className="s2-eyebrow"><History size={13} />{t("shop2.night.log")}</div>
      <ul>
        {nm.log.length ? nm.log.slice().reverse().map((e, i) => (
          <li key={i}>
            <time>{e.at ? new Date(e.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : ""}</time>
            <span>
              <b>{t(`shop2.night.logKind.${e.kind}`, { n: (e.card ?? 0) + 1, name: e.name || "" })}</b>
              <small className={e.kind === "flip" ? "is-gold" : e.kind === "friend" ? "is-violet" : ""}>
                {e.kind === "flip" && e.item ? `${s2.itemName(e.item)}${e.detail ? ` ${e.detail}` : ""}` : e.kind === "flip_used" ? `${e.from ?? ""} → ${e.to ?? ""}` : e.detail || ""}
              </small>
            </span>
          </li>
        )) : <li className="s2-muted">{t("shop2.night.logEmpty")}</li>}
      </ul>
      {nm.friendBonus || nm.coOpenBonus ? (
        <div className="s2-friendbonus">
          <Users size={16} />
          <span>{nm.friendBonus?.name || nm.friendBonus?.displayName ? t("shop2.night.friendBonus", { name: nm.friendBonus.name || nm.friendBonus.displayName }) : t("shop2.night.coOpen", { n: nm.coOpenBonus || 1 })}</span>
        </div>
      ) : (
        <div className="s2-friendbonus is-hint">
          <Users size={16} />
          <span>{t("shop2.night.coOpenHint")}</span>
        </div>
      )}
      <div className="s2-nprefs">
        <label className="s2-toggle-row"><Bell size={15} /><span>{t("shop2.night.notifyOpen")}</span><Toggle checked={prefs.nightNotify ?? nm.notify ?? true} onChange={(v) => setPref({ nightNotify: v })} label={t("shop2.night.notifyOpen")} /></label>
        <label className="s2-toggle-row"><Clock size={15} /><span>{t("shop2.night.remind")}</span><Toggle checked={prefs.nightRemind ?? true} onChange={(v) => setPref({ nightRemind: v })} label={t("shop2.night.remind")} /></label>
      </div>
    </section>
  );

  const deck = (
    <section className={`s2-col s2-ndeck${nm.open ? "" : " is-closed"}`}>
      <div className={`s2-ngrid is-${nm.cards.length > 6 ? 8 : 6}`}>
        {nm.cards.map((c, i) => (
          <NightCard key={c.index} card={c} index={i} active={active?.index === c.index} onFlip={flip} busy={busy || !nm.open} noFlips={nm.flipsLeft <= 0} />
        ))}
      </div>
      <p className="s2-note"><Info size={14} />{nm.flipsLeft <= 0 && nm.open ? t("shop2.night.tomorrow") : t("shop2.night.hintNote")}</p>
    </section>
  );

  const panel = (
    <section className="s2-col s2-npanel">
      <div className="s2-eyebrow"><Moon size={13} />{t("shop2.night.openedCard")}</div>
      {active?.item ? (
        <>
          <div className="s2-npanel-art"><Shop2Art item={active.item} size="card" me={s2.me} sample={s2.me?.displayName} /></div>
          <div className="s2-eyebrow is-violet">{t(`shop2.rarity.${active.item.rarity || "common"}`)} · {t("shop2.night.onlyYou")}</div>
          <h3>{s2.itemName(active.item)}</h3>
          <p className="s2-muted">{t(`shop2.cat.${active.item.category}`)}</p>
          <div className="s2-npanel-price">
            <Price value={active.price} old={active.basePrice} size="xxl" />
            {active.discountPct ? <Chip tone="gold">-%{active.discountPct}</Chip> : null}
          </div>
          {prevLow ? (
            <div className="s2-hist is-gold">
              <div className="s2-eyebrow">{t("shop2.night.priceHistory")}</div>
              <p>{cheaper > 0 ? t("shop2.night.cheaper", { n: formatNumber(prevLow, locale), pct: cheaper }) : t("shop2.night.notCheaper", { n: formatNumber(prevLow, locale) })}</p>
              {hist.points.length > 1 ? <Sparkline values={[...hist.points, active.price]} tone="gold" /> : null}
            </div>
          ) : null}
          <div className="s2-row">
            <button type="button" className="s2-btn is-gold is-flex2" disabled={active.bought || s2.balance < active.price || !nm.open} onClick={() => s2.openCheckout({ kind: "night", card: active, item: active.item, price: active.price })}>
              {active.bought ? t("shop2.common.owned") : t("shop2.night.buy", { n: formatNumber(active.price, locale) })}
            </button>
            <button type="button" className="s2-ibtn" onClick={() => s2.openGift({ item: active.item, price: active.price, nightCardIndex: active.index })} aria-label={t("shop2.gifts.giftIt")}><Gift size={17} /></button>
            <button type="button" className="s2-ibtn" onClick={() => s2.addToCart(active.item, active.price)} aria-label={t("shop2.cart.add")}><Cart size={17} /></button>
          </div>
          <button type="button" className={`s2-btn is-wide${active.kept ? " is-active" : ""}`} onClick={() => keep(active)} disabled={!nm.open}>
            <Pin size={15} weight={active.kept ? "fill" : "regular"} />
            {active.kept ? t("shop2.night.unkeep") : t("shop2.night.keep")}
          </button>
          <p className="s2-note">{t("shop2.night.keepNote", { n: nm.keepLimit })}</p>
        </>
      ) : (
        <div className="s2-empty is-small">
          <Moon size={24} />
          <p>{nm.open ? t("shop2.night.pickCard") : t("shop2.night.closedBody")}</p>
        </div>
      )}
    </section>
  );

  return (
    <div className={`s2-night${phone ? " is-phone" : ""}`}>
      {head}
      {phone ? (
        <>
          {deck}
          {active?.item ? panel : null}
          {log}
        </>
      ) : (
        <div className="s2-night-grid">
          {log}
          {deck}
          {panel}
        </div>
      )}
    </div>
  );
}
