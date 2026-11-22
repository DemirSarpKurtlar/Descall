// Gifts (draft C "Hediyeler" tab + draft A right drawer): pick a friend (who owns it is
// greyed out, who wishes it comes first), message with quick lines, deliver now or at a
// time, hidden package, anonymous, wrap colour, thank-you card,
// a live preview of what the friend gets (phone notification, opening, desktop chat), the
// total with owned pieces deducted for sets, drafts, and send tracking with a 5-minute
// recall ring. The tab also lists received gifts to open.
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import shop2Api from "../../lib/shop2Api.js";
import { serverMessage } from "../../i18n/serverText.js";
import {
  canRecall,
  filterRecipients,
  normalizeRecipient,
  giftPrice,
  giftWhen,
  messageCount,
  mmss,
  SHOP2_MESSAGE_MAX,
  SHOP2_RECALL_MS,
  setPricing,
  windowLeft,
} from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, CloseX, Coin, Price, Ring, Seg, Toggle, useNow } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { useAgo } from "./Shop2Detail.jsx";
import {
  Calendar,
  Check,
  Eye,
  Gift,
  Heart,
  Info,
  Layers,
  Lock,
  MessageCircle,
  Monitor,
  Package,
  Search,
  Send,
  Smartphone,
  Undo2,
  User,
  Users,
} from "./shop2Icons.jsx";

export const WRAPS = ["#587af5", "#f0567a", "#2fbf8a", "#f2c230", "#a77bff"];
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const nameOf = (f) => f?.displayName || f?.display_name || f?.username || "";

function useRecipients(target) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const key = target?.setKey || target?.item?.id || "";
  useEffect(() => {
    let off = false;
    setLoading(true);
    const params = target?.setKey ? { setKey: target.setKey } : target?.item ? { itemId: target.item.id } : null;
    const load = params
      ? shop2Api.giftRecipients(params).then((r) => (r?.recipients || r?.friends || []).map(normalizeRecipient).filter(Boolean))
      : Promise.reject(new Error("no target"));
    load
      .catch(() => shop2Api.friends().then((r) => r?.friends || []))
      .then((friends) => {
        if (!off) setList(Array.isArray(friends) ? friends : []);
      })
      .catch(() => {})
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { list, loading };
}

/** "YYYY-MM-DDTHH:mm" in local time, the value format of <input type="datetime-local">. */
export function localMinute(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Letter({ f, tone = 0 }) {
  const src = f?.avatarUrl || f?.avatar_url;
  return src ? <img className="s2-face" src={src} alt="" /> : <span className={`s2-letter tone-${tone % 6}`}>{nameOf(f).charAt(0) || "?"}</span>;
}

/** What the friend gets: phone lock screen + opening, or the desktop chat row. */
function GiftPreview({ to, sender, item, setName, message, wrap, hiddenItem, hideName, when, view, both }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const from = hideName ? t("shop2.gifts.someone") : sender;
  const label = hiddenItem ? t("shop2.gifts.aPackage") : setName || (item ? s2.itemName(item) : "");
  const at = when || new Date();
  const clock = at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  // Phone chrome: status bar with a Dynamic Island pill, then the screen, then the home
  // indicator. Sizes inside are container units (cqw), so the phone keeps its proportions
  // at any width (single preview, the pair in the tab, the small one in the drawer).
  const chrome = (body, opened) => (
    <div className={`s2-gphone${opened ? " is-opened" : ""}`} style={{ "--wrap": wrap }}>
      <div className="s2-gphone-screen">
        <div className="s2-gphone-status" aria-hidden="true">
          <b className="s2-num">{clock}</b>
          <span className="s2-gphone-island" />
          <span className="s2-gphone-sys"><i /><i /><i /><i /><em /></span>
        </div>
        {body}
        <span className="s2-gphone-home" aria-hidden="true" />
      </div>
    </div>
  );
  const phone = chrome(
    <>
      <div className="s2-gphone-time">
        <Lock size={11} />
        <small>{at.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</small>
        <b className="s2-num">{clock}</b>
      </div>
      <div className="s2-gphone-stack">
        <div className="s2-gnotif">
          <span className="s2-gnotif-ic"><Gift size={14} /></span>
          <span>
            <span className="s2-gnotif-top"><b>{t("shop2.gifts.appName")}</b><small>{t("shop2.gifts.justNow")}</small></span>
            <small>{t("shop2.gifts.notif", { name: from })}</small>
          </span>
        </div>
        <div className="s2-gopen">
          <span className="s2-gbox" aria-hidden="true"><i /></span>
          <b>{t("shop2.gifts.fromX", { name: from })}</b>
          {message ? <p>{`"${message.length > 70 ? `${message.slice(0, 70)}...` : message}"`}</p> : null}
          <span className="s2-btn is-primary is-sm is-fake">{t("shop2.gifts.openPackage")}</span>
        </div>
      </div>
    </>,
    false,
  );
  const opened = chrome(
    <div className="s2-gopened">
      {item && !hiddenItem ? <Shop2Art item={item} size="card" me={to} sample={nameOf(to)} /> : <span className="s2-gbox is-lg" style={{ "--wrap": wrap }}><i /></span>}
      <b>{label}</b>
      <small>{t("shop2.gifts.fromShort", { name: from })}</small>
      <span className="s2-btn is-primary is-sm is-fake">{t("shop2.gifts.wearNow")}</span>
    </div>,
    true,
  );
  const desktop = (
    <div className="s2-gdesk">
      <div className="s2-gdesk-row">
        <span className="s2-letter tone-1">{String(from).charAt(0)}</span>
        <span><b>{from}</b> <small>{t("shop2.gifts.justNow")}</small></span>
      </div>
      <div className="s2-gdesk-pack" style={{ "--wrap": wrap }}>
        <span className="s2-gnotif-ic is-wrap"><Gift size={15} /></span>
        <span><b>{t("shop2.gifts.packageForYou")}</b><small>{hiddenItem ? t("shop2.gifts.openToSee") : label}</small></span>
        <span className="s2-btn is-primary is-sm is-fake">{t("shop2.gifts.open")}</span>
      </div>
      {message ? <p className="s2-gdesk-msg">{message}</p> : null}
    </div>
  );
  if (both) {
    return (
      <div className="s2-gprev-all">
        <div className="s2-gprev-pane">
          <div className="s2-eyebrow is-plain">{t("shop2.gifts.desktopChat")}</div>
          {desktop}
        </div>
        <div className="s2-gprev-pane">
          <div className="s2-eyebrow is-plain">{t("shop2.gifts.phoneAndOpen")}</div>
          <div className="s2-gphones">{phone}{opened}</div>
        </div>
      </div>
    );
  }
  return view === "phone" ? <div className="s2-gphones is-one">{phone}</div> : desktop;
}

export function GiftComposer({ target: initial, variant = "tab", onDone, onClose }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const [target, setTarget] = useState(initial || null);
  const draftKey = target?.setKey ? `set:${target.setKey}` : target?.item ? `item:${target.item.id}` : "";
  const draft = s2.data.prefs.giftDrafts?.[draftKey] || {};
  const [to, setTo] = useState(draft.to || null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(draft.message || "");
  const [when, setWhen] = useState(giftWhen(draft.when));
  const [at, setAt] = useState(draft.at || "");
  const [hiddenItem, setHiddenItem] = useState(draft.hiddenItem ?? true);
  const [hideName, setHideName] = useState(Boolean(draft.hideName));
  const [thankCard, setThankCard] = useState(draft.thankCard ?? true);
  const [wrap, setWrap] = useState(draft.wrap || WRAPS[1]);
  const [view, setView] = useState("phone");
  const [busy, setBusy] = useState(false);
  const { list, loading } = useRecipients(target);
  const phone = s2.layout === "phone";
  useEffect(() => setTarget(initial || null), [initial]);
  const set = target?.setKey ? s2.data.setDetails[target.setKey] : null;
  const { loadSet } = s2.actions;
  useEffect(() => {
    if (target?.setKey && !set) loadSet(target.setKey);
  }, [target?.setKey, set, loadSet]);
  useEffect(() => {
    if (!target && variant === "tab") {
      const first = s2.data.storefront?.slots?.find((x) => !s2.owned.has(x.item.id)) || s2.data.storefront?.slots?.[0];
      if (first) setTarget({ item: first.item, price: first.price });
    }
  }, [target, variant, s2.data.storefront, s2.owned]);
  const friends = useMemo(() => list.map((f) => ({ ...f, owns: Boolean(f.owns || f.hasItem), wishes: Boolean(f.wishes || f.inWishlist) })), [list]);
  const shown = filterRecipients(friends, filter, query);
  const friend = friends.find((f) => sameId(f.id, to)) || null;
  const item = target?.item || null;
  const count = messageCount(message);
  const tooLong = count > SHOP2_MESSAGE_MAX;
  const sendAt = when === "at" && at ? new Date(at) : null;
  const sendAtIso = sendAt && Number.isFinite(sendAt.getTime()) ? sendAt.toISOString() : "";
  // Server pre-check for this friend: price (their pieces deducted) or why it cannot be sent
  // now (daily caps, new account, gifts closed, schedule too far), shown before "Gönder".
  const [quote, setQuote] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const friendId = friend?.id ?? null;
  const quoteKey = target?.nightCardIndex != null ? `night:${target.nightCardIndex}` : target?.setKey ? `set:${target.setKey}` : item ? `item:${item.id}` : "";
  const quoteId = `${friendId}|${quoteKey}`;
  useEffect(() => {
    // A new delivery time keeps the friend's price; only the reason is checked again.
    setQuote((q) => (q && q.quoteId === quoteId ? q : null));
    setBlocked(null);
    if (friendId == null || !quoteKey) return undefined;
    let off = false;
    const body = {
      toUserId: friendId,
      ...(target?.nightCardIndex != null ? { nightCardIndex: target.nightCardIndex } : target?.setKey ? { setKey: target.setKey } : { itemId: item?.id }),
      ...(sendAtIso ? { sendAt: sendAtIso } : {}),
    };
    const timer = setTimeout(() => {
      shop2Api.giftQuote(body).then((q) => {
        if (off) return;
        if (q?.ok) setQuote({ ...q, quoteId });
        else if (q && q.ok === false) setBlocked(serverMessage(q) || t("shop2.errors.gift"));
      }).catch((err) => {
        // 409 recipient_owns / 410 not_available / 404: the server's reason, translated.
        if (!off && err?.status && err.status < 500 && err.status !== 429) setBlocked(err.message || t("shop2.errors.gift"));
      });
    }, 250);
    return () => {
      off = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId, quoteKey, sendAtIso]);
  const liveQuote = quote && quote.quoteId === quoteId ? quote : null;
  const price = liveQuote?.price != null ? Number(liveQuote.price) : item ? Number(target.price ?? item.price_descoin) : set ? giftPrice({ set, friend }) : 0;
  const setDeduct = liveQuote?.ownedDeducted != null ? Number(liveQuote.ownedDeducted) : set && friend ? Math.max(0, setPricing({ ...set, pieces: set.pieces.map((p) => ({ ...p, owned: false })), yourPrice: null }).yourPrice - price) : 0;
  const sender = s2.me?.displayName || s2.me?.username || "";
  const limits = s2.data.gifts.limits;
  const canSend = friend && !friend.owns && friend.acceptsGifts !== false && !blocked && !tooLong && !busy && price <= s2.balance && limits?.paused !== true && (when !== "at" || (sendAt && sendAt.getTime() > Date.now()));
  // Why "Gönder" is off for the chosen friend (server reason first, then the wallet).
  const timeBad = when === "at" && !(sendAt && sendAt.getTime() > Date.now());
  // Neutral hint for the next step when "Gonder" is off for no error: no friend, no time.
  const stepNote = !friend ? t("shop2.gifts.pickFriendFirst") : timeBad ? t("shop2.gifts.pickFutureTime") : null;
  const blockNote = !friend ? null : blocked || (limits?.paused === true ? t("Gifts are paused right now.") : null) || (price > s2.balance ? t("shop2.kasa.shortBy", { n: formatNumber(price - s2.balance, locale) }) : null);
  const setName = set ? s2.setName(set) : null;
  const itemSet = item?.set_key ? (s2.data.sets.find((x) => x.key === item.set_key) || s2.data.storefront?.featuredSets?.find((x) => x.key === item.set_key)) : null;

  // iPhone: the keyboard slides up after focus; once the panel has shrunk above it
  // (html.kb-open), bring the message box back into the middle of what is left.
  const keepInView = (e) => {
    const el = e.currentTarget;
    setTimeout(() => el.isConnected && el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 350);
  };
  const saveDraft = () => {
    const drafts = { ...(s2.data.prefs.giftDrafts || {}), [draftKey]: { to, message, when, at, hiddenItem, hideName, thankCard, wrap } };
    s2.actions.setPref({ giftDrafts: drafts });
    s2.toast(t("shop2.gifts.draftSaved"), { tone: "ok" });
  };
  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await s2.actions.sendGift({
        toUserId: friend.id,
        itemId: item?.id,
        setKey: target?.setKey,
        nightCardIndex: target?.nightCardIndex,
        message: message.trim(),
        sendAt: sendAt ? sendAt.toISOString() : null,
        hideName,
        hiddenItem,
        wrap,
        thankCard,
      });
      const drafts = { ...(s2.data.prefs.giftDrafts || {}) };
      delete drafts[draftKey];
      s2.actions.setPref({ giftDrafts: drafts });
      s2.toast(sendAt ? t("shop2.gifts.scheduled", { name: nameOf(friend) }) : t("shop2.gifts.sent", { name: nameOf(friend) }), {
        tone: "ok",
        action: variant === "drawer" ? { label: t("shop2.gifts.track"), run: () => s2.setTab("gifts") } : null,
      });
      setMessage("");
      setTo(null);
      onDone?.();
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.gift"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const recipients = (
    <section className="s2-col s2-gto">
      <div className="s2-colh"><Users size={15} /><h3>{variant === "drawer" ? t("shop2.gifts.step1") : t("shop2.gifts.to")}</h3>{variant === "tab" ? <span className="s2-muted s2-colh-r">{t("shop2.gifts.friendsN", { n: friends.length })}</span> : null}</div>
      {variant === "tab" || friends.length > 6 ? (
        <label className="s2-searchbox"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("shop2.gifts.searchFriend")} aria-label={t("shop2.gifts.searchFriend")} /></label>
      ) : null}
      <div className="s2-chips-wrap">
        {["all", "online", "notOwned", "wishlist"].map((f) => (
          <button key={f} type="button" className={`s2-chip is-btn${filter === f ? " is-on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "wishlist" ? <Heart size={12} /> : null}
            {t(`shop2.gifts.filter.${f}`)}
          </button>
        ))}
      </div>
      <div className="s2-gto-list" role="radiogroup" aria-label={t("shop2.gifts.to")}>
        {loading ? <div className="s2-skeleton is-rows"><i /><i /><i /></div> : shown.length ? shown.map((f, i) => {
          const on = sameId(f.id, to);
          const owned = set ? (f.ownedCount ?? (Array.isArray(f.ownedPieceIds) ? f.ownedPieceIds.length : null)) : null;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={f.owns || f.acceptsGifts === false}
              className={`s2-friend${on ? " is-on" : ""}${f.wishes ? " is-wish" : ""}`}
              onClick={() => setTo(f.id)}
            >
              <span className="s2-friend-av"><Letter f={f} tone={i + 1} />{f.status && f.status !== "offline" ? <i className="s2-online" /> : null}</span>
              <span className="s2-friend-t">
                <b>{nameOf(f)}</b>
                <small>
                  {f.owns ? t("shop2.gifts.alreadyHas") : f.acceptsGifts === false ? t("shop2.gifts.closed") : f.wishes ? t("shop2.gifts.wishesIt") : f.status && f.status !== "offline" ? t("shop2.gifts.online") : t("shop2.gifts.offline")}
                </small>
              </span>
              {owned != null ? <Chip tone="green">{owned}/{set.pieceCount}</Chip> : null}
              {f.wishes ? <Heart size={14} weight="fill" className="s2-heart" /> : null}
              <span className={`s2-radio-dot${on ? " is-on" : ""}`}>{on ? <Check size={12} weight="bold" /> : null}</span>
            </button>
          );
        }) : <p className="s2-muted">{t("shop2.gifts.noFriends")}</p>}
      </div>
      {variant === "tab" ? <p className="s2-note">{t("shop2.gifts.blockedNote")}</p> : null}
    </section>
  );

  const form = (
    <section className="s2-col s2-gform">
      {variant === "tab" ? <div className="s2-colh"><Gift size={15} /><h3>{t("shop2.gifts.gift")}</h3></div> : null}
      {variant === "tab" && (item || set) ? (
        <div className="s2-gitem">
          {item ? <Shop2Art item={item} size="tile" me={s2.me} /> : <Layers size={22} />}
          <span><b>{item ? s2.itemName(item) : setName}</b><small>{item ? `${t(`shop2.cat.${item.category}`)} · ${t(`shop2.rarity.${item.rarity || "common"}`)}` : t("shop2.gifts.wholeSet")}</small></span>
          <Price value={price} old={item && item.price_descoin > price ? item.price_descoin : null} />
        </div>
      ) : null}
      {variant === "drawer" ? <div className="s2-step"><span>2</span>{t("shop2.gifts.message")}</div> : <div className="s2-eyebrow">{t("shop2.gifts.message")}</div>}
      <div className={`s2-textarea${tooLong ? " is-over" : ""}`}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} onFocus={phone ? keepInView : undefined} rows={3} placeholder={t("shop2.gifts.messagePh")} aria-label={t("shop2.gifts.message")} />
        <small className="s2-num">{count} / {SHOP2_MESSAGE_MAX}</small>
      </div>
      <div className="s2-chips-wrap">
        {["bday", "congrats", "thinking"].map((k) => (
          <button key={k} type="button" className="s2-chip is-btn" onClick={() => setMessage(t(`shop2.gifts.quick.${k}`))}>{t(`shop2.gifts.quick.${k}`)}</button>
        ))}
      </div>
      {variant === "drawer" ? <div className="s2-step"><span>3</span>{t("shop2.gifts.delivery")}</div> : <div className="s2-eyebrow">{t("shop2.gifts.delivery")}</div>}
      <div className="s2-gwhen">
        <Seg
          size="sm"
          value={when}
          onChange={setWhen}
          label={t("shop2.gifts.delivery")}
          options={[
            { id: "now", label: t("shop2.gifts.now") },
            { id: "at", icon: Calendar, label: t("shop2.gifts.pickTime") },
          ]}
        />
        {when === "at" ? <input type="datetime-local" className="s2-input is-sm" min={localMinute(new Date(Date.now() + 60000))} value={at} onChange={(e) => setAt(e.target.value)} aria-label={t("shop2.gifts.pickTime")} /> : null}
      </div>
      <div className="s2-gopts">
        <label className="s2-toggle-row"><Eye size={15} /><span>{t("shop2.gifts.hideItem")}</span><Toggle checked={hiddenItem} onChange={setHiddenItem} label={t("shop2.gifts.hideItem")} /></label>
        <label className="s2-toggle-row"><User size={15} /><span>{t("shop2.gifts.hideName")}</span><Toggle checked={hideName} onChange={setHideName} label={t("shop2.gifts.hideName")} /></label>
        <label className="s2-toggle-row"><MessageCircle size={15} /><span>{t("shop2.gifts.thankCard")}</span><Toggle checked={thankCard} onChange={setThankCard} label={t("shop2.gifts.thankCard")} /></label>
      </div>
      <div className="s2-wraps">
        <span className="s2-muted">{t("shop2.gifts.wrap")}</span>
        {WRAPS.map((c) => (
          <button key={c} type="button" className={`s2-swatch${wrap === c ? " is-on" : ""}`} style={{ background: c }} onClick={() => setWrap(c)} aria-pressed={wrap === c} aria-label={t("shop2.gifts.wrapColor")} />
        ))}
      </div>
      {variant === "tab" && friend?.wishlist?.length ? (
        <div className="s2-gwish">
          <div className="s2-eyebrow">{t("shop2.gifts.fromWishlist", { name: nameOf(friend) })}</div>
          <div className="s2-gwish-row">
            {friend.wishlist.slice(0, 3).map((w) => (
              <button key={w.id} type="button" className={`s2-gwish-item${sameId(w.id, item?.id) ? " is-on" : ""}`} onClick={() => setTarget({ item: w, price: w.price_descoin })}>
                <Shop2Art item={w} size="tile" me={friend} />
                <span><b>{s2.itemName(w)}</b><small className="s2-num">{formatNumber(w.price_descoin, locale)} {t("shop2.common.d")}</small></span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {variant === "drawer" ? <RecentSent /> : null}
    </section>
  );

  const preview = (
    <section className="s2-col s2-gprev">
      <div className="s2-colh">
        <Eye size={15} />
        <h3>{t("shop2.gifts.theyWillSee", { name: friend ? nameOf(friend) : t("shop2.gifts.yourFriend") })}</h3>
        {variant === "drawer" ? (
          <span className="s2-colh-r"><Seg size="sm" value={view} onChange={setView} label={t("shop2.gifts.previewOn")} options={[{ id: "phone", icon: Smartphone, title: t("shop2.detail.phone") }, { id: "desktop", icon: Monitor, title: t("shop2.detail.desktop") }]} /></span>
        ) : null}
      </div>
      <GiftPreview to={friend} sender={sender} item={item} setName={setName} message={message} wrap={wrap} hiddenItem={hiddenItem} hideName={hideName} when={sendAt} view={view} both={variant === "tab" && !phone} />
      {variant === "drawer" && !phone ? (
        <div className="s2-gdesk-mini">
          <span className="s2-vlabel">{t("shop2.detail.desktop")}</span>
          <GiftPreview to={friend} sender={sender} item={item} setName={setName} message={message} wrap={wrap} hiddenItem={hiddenItem} hideName={hideName} when={sendAt} view={view === "phone" ? "desktop" : "phone"} />
        </div>
      ) : null}
      <p className="s2-note"><Info size={14} />{hiddenItem ? t("shop2.gifts.hiddenNote", { name: friend ? nameOf(friend) : t("shop2.gifts.yourFriend") }) : friend && (!friend.status || friend.status === "offline") ? t("shop2.gifts.offlineNote", { name: nameOf(friend) }) : t("shop2.gifts.openNote")}</p>
    </section>
  );

  const foot = (
    <div className="s2-gfoot">
      <div className="s2-gtotal">
        <span className="s2-eyebrow">{t("shop2.gifts.total")}</span>
        <span className="s2-price is-lg"><Coin size="lg" /><b className="s2-num">{formatNumber(price, locale)}</b></span>
        {price <= s2.balance ? <small className="s2-num s2-gtotal-bal">{t("shop2.gifts.balance", { from: formatNumber(s2.balance, locale), to: formatNumber(s2.balance - price, locale) })}</small> : null}
        {setDeduct > 0 ? <small className="is-green">{t("shop2.gifts.theirsDeducted", { n: formatNumber(setDeduct, locale) })}</small> : null}
      </div>
      {blockNote ? (
        <p className="s2-gfoot-note is-block" role="alert"><Info size={14} />{blockNote}</p>
      ) : stepNote ? (
        <p className="s2-gfoot-note is-step" aria-live="polite"><Info size={14} />{stepNote}</p>
      ) : (
        <p className="s2-gfoot-note"><Undo2 size={14} />{t("shop2.gifts.recallNote", { m: SHOP2_RECALL_MS / 60000 })}{limits?.dailyLeft != null ? ` · ${t("shop2.gifts.dailyLeft", { n: limits.dailyLeft })}` : ""}</p>
      )}
      {onClose ? <button type="button" className="s2-btn s2-gfoot-cancel" onClick={onClose}>{t("shop2.common.cancel")}</button> : null}
      <button type="button" className="s2-btn s2-gfoot-draft" onClick={saveDraft} disabled={!draftKey}>{t("shop2.gifts.saveDraft")}</button>
      <button type="button" className="s2-btn is-primary s2-gfoot-send" disabled={!canSend} onClick={send}>
        <Send size={15} />
        {sendAt ? t("shop2.gifts.schedule") : t("shop2.gifts.send")}
      </button>
    </div>
  );

  if (variant === "drawer") {
    return (
      <div className={`s2-gdrawer${phone ? " is-phone" : ""}`}>
        <div className="s2-gdrawer-head">
          {item ? <Shop2Art item={item} size="tile" me={s2.me} /> : <span className="s2-set-thumb is-lg"><Layers size={20} /></span>}
          <span>
            <small className="s2-eyebrow">{t("shop2.gifts.giftIt")}</small>
            <b>{item ? s2.itemName(item) : setName}</b>
            <small className="s2-muted">{item ? `${t(`shop2.cat.${item.category}`)} · ${t(`shop2.rarity.${item.rarity || "common"}`)}` : t("shop2.gifts.wholeSet")}</small>
          </span>
          {itemSet && item ? (
            <button type="button" className="s2-btn is-sm" onClick={() => setTarget({ setKey: itemSet.key })}><Layers size={14} />{t("shop2.gifts.giftSet")}</button>
          ) : null}
          {onClose ? <CloseX onClick={onClose} label={t("shop2.common.close")} /> : null}
        </div>
        <div className="s2-gdrawer-body">
          <div className="s2-gdrawer-form">
            {recipients}
            {form}
          </div>
          {preview}
        </div>
        {foot}
      </div>
    );
  }
  return (
    <div className="s2-gtab-compose">
      {recipients}
      <div className="s2-gform-wrap">{form}{foot}</div>
      {preview}
    </div>
  );
}

function RecentSent() {
  const { t } = useLocale();
  const s2 = useS2();
  const list = s2.data.gifts.sent.slice(0, 2);
  if (!list.length) return null;
  return (
    <div className="s2-recent">
      <div className="s2-eyebrow">{t("shop2.gifts.recent")}</div>
      {list.map((g, i) => (
        <div key={g.id} className="s2-recent-row">
          <Letter f={g.to} tone={i + 2} />
          <b>{nameOf(g.to)}</b>
          <span className="s2-muted">{giftLabel(s2, g)}</span>
          <StatusChip gift={g} />
        </div>
      ))}
    </div>
  );
}

/** What a sent gift was: the set name for a set gift (its items are only the missing pieces). */
function giftLabel(s2, g) {
  if (g.setKey && (g.kind === "set" || g.itemCount > 1)) {
    const set = s2.data.setDetails[g.setKey] || s2.data.sets.find((x) => x.key === g.setKey) || s2.data.storefront?.featuredSets?.find((x) => x.key === g.setKey);
    if (set) return s2.setName(set);
  }
  if (g.item) return s2.itemName(g.item);
  return g.setName ? s2.itemName({ name: g.setName }) : "";
}

function StatusChip({ gift }) {
  const { t } = useLocale();
  const tone = { scheduled: "blue", delivered: "gold", opened: "green", equipped: "green", thanked: "green", recalled: "muted" }[gift.status] || "muted";
  return <Chip tone={tone}>{t(`shop2.gifts.status.${gift.status}`)}</Chip>;
}

function Tracking() {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const now = useNow(true);
  const ago = useAgo();
  const [busy, setBusy] = useState(null);
  const sent = s2.data.gifts.sent;
  const recall = async (g) => {
    setBusy(g.id);
    try {
      await s2.actions.recallGift(g.id);
      s2.toast(t("shop2.gifts.recalled"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.recall"), { tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="s2-track">
      <table>
        <thead>
          <tr>
            <th>{t("shop2.gifts.colSent")}</th>
            <th>{t("shop2.gifts.colTo")}</th>
            <th>{t("shop2.gifts.colStatus")}</th>
            <th>{t("shop2.gifts.colWhen")}</th>
            <th aria-label={t("shop2.gifts.colAction")} />
          </tr>
        </thead>
        <tbody>
          {sent.length ? sent.map((g, i) => {
            const recallable = canRecall(g, now);
            const left = recallable ? windowLeft(g.sentAt, SHOP2_RECALL_MS, now, g.recallUntil) : 0;
            return (
              <tr key={g.id} className={`is-${g.status}`}>
                <td>{giftLabel(s2, g)}</td>
                <td><span className="s2-who"><Letter f={g.to} tone={i + 1} />{nameOf(g.to)}</span></td>
                <td><StatusChip gift={g} /></td>
                <td className="s2-muted">{g.status === "scheduled" && g.sendAt ? new Date(g.sendAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ago(g.sentAt)}</td>
                <td className="s2-track-act">
                  {recallable ? (
                    <button type="button" className="s2-btn is-sm" disabled={busy === g.id} onClick={() => recall(g)}>
                      {g.status !== "scheduled" && left > 0 ? <Ring fraction={left / (SHOP2_RECALL_MS / 1000)} /> : <Undo2 size={14} />}
                      {g.status === "scheduled" ? t("shop2.gifts.cancelScheduled") : left > 0 ? t("shop2.gifts.recallN", { t: mmss(left) }) : t("shop2.gifts.recall")}
                    </button>
                  ) : g.status === "thanked" ? <span className="s2-ok">{t("shop2.gifts.status.thanked")}</span> : null}
                </td>
              </tr>
            );
          }) : (
            <tr><td colSpan={5} className="s2-muted">{t("shop2.gifts.noneSent")}</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function Received() {
  const { t } = useLocale();
  const s2 = useS2();
  const ago = useAgo();
  const list = s2.data.gifts.received.filter((g) => g.status !== "recalled").slice(0, 6);
  if (!list.length) return null;
  const open = async (g) => {
    try {
      await s2.actions.openGift(g.id);
      s2.toast(t("shop2.gifts.openedToast"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.open"), { tone: "error" });
    }
  };
  const thank = async (g) => {
    try {
      await shop2Api.thankGift(g.id);
      s2.actions.loadGifts();
      s2.toast(t("shop2.gifts.thanked"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.thank"), { tone: "error" });
    }
  };
  return (
    <section className="s2-received">
      <div className="s2-eyebrow"><Package size={13} />{t("shop2.gifts.received")}</div>
      <div className="s2-received-row">
        {list.map((g, i) => {
          const isOpen = g.openedAt || ["opened", "equipped", "thanked"].includes(g.status);
          return (
            <div key={g.id} className={`s2-rgift${isOpen ? " is-open" : ""}`} style={{ "--wrap": g.wrap || WRAPS[i % WRAPS.length] }}>
              {isOpen && g.item ? <Shop2Art item={g.item} size="tile" me={s2.me} /> : <span className="s2-gbox"><i /></span>}
              <span>
                <b>{g.hideName ? t("shop2.gifts.someone") : nameOf(g.from)}</b>
                <small>{isOpen && g.item ? s2.itemName(g.item) : ago(g.sentAt)}</small>
              </span>
              {isOpen ? (
                g.status === "thanked" ? <Chip tone="green">{t("shop2.gifts.status.thanked")}</Chip> : <button type="button" className="s2-btn is-sm" onClick={() => thank(g)}>{t("shop2.gifts.thank")}</button>
              ) : (
                <button type="button" className="s2-btn is-sm is-primary" onClick={() => open(g)}>{t("shop2.gifts.open")}</button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Shop2Gifts({ onClose }) {
  const { t } = useLocale();
  const s2 = useS2();
  return (
    <div className={`s2-gifts${s2.layout === "phone" ? " is-phone" : ""}`}>
      {onClose ? (
        <div className="s2-fullhead">
          <h2>{t("shop2.gifts.title")}</h2>
          <CloseX onClick={onClose} label={t("shop2.common.close")} />
        </div>
      ) : null}
      <Received />
      <GiftComposer variant="tab" />
      <Tracking />
    </div>
  );
}
