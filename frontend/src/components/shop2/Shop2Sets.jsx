// "Setler" tab (draft A Deneme kabini as the base + draft C Sahne): set switcher, hero with
// the set's own colours, pieces with try / take-off eyes, the try-on cabin (profile card with
// before / after, chat, voice channel, join sound, desktop / phone, dark / light) or the
// stage in the user's own server, and the kasa (price ladder with owned pieces deducted,
// singles vs set, price history, title reward, saved outfits, owners, other sets).
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import {
  composeTryOnUser,
  countdownParts,
  currentLook,
  priceHistoryStats,
  SET_PIECE_GROUPS,
  setPricing,
  setProgress,
  setTryOn,
  SHOP2_PARTIAL_DAYS,
} from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, Layer, Num, Price, Seg, Sparkline, Toggle, useNow } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import Shop2Stage, { StagePicker, useStage } from "./Shop2Stage.jsx";
import { setGradient } from "./Shop2Vitrin.jsx";
import {
  BeforeAfter,
  DeviceFrame,
  S2ChatMessage,
  S2JoinSound,
  S2OtherMessage,
  S2PeerTile,
  S2ProfileCard,
  S2VoiceTile,
} from "./Shop2Preview.jsx";
import {
  Bookmark,
  Cart,
  Check,
  ChevronLeft,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Gift,
  Heart,
  Layers,
  MessageCircle,
  Monitor,
  Moon,
  PriceTag,
  Share2,
  Shirt,
  Smartphone,
  Split,
  Store,
  Sun,
  Undo2,
  User,
  Users,
  Volume2,
} from "./shop2Icons.jsx";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

function SetSwitcher({ sets, active, onPick }) {
  const { t } = useLocale();
  const s2 = useS2();
  const now = useNow(true, 60000);
  const ends = sets.map((x) => x.endsAt).filter(Boolean).sort()[0];
  const left = ends ? countdownParts(ends, now) : null;
  return (
    <div className="s2-switch" role="tablist" aria-label={t("shop2.sets.switch")}>
      {sets.map((x) => (
        <button key={x.key} type="button" role="tab" aria-selected={x.key === active} className={x.key === active ? "is-on" : ""} onClick={() => onPick(x.key)} style={{ "--set-accent": x.palette?.[2] }}>
          <span className="s2-switch-art" style={{ background: setGradient(x.palette) }} />
          <span>
            <b>{s2.setName(x)}</b>
            <small className="s2-num">{formatNumber(x.yourPrice ?? x.setPrice)} {t("shop2.common.d")} · {t("shop2.sets.ownedN", { n: x.ownedCount })}</small>
          </span>
        </button>
      ))}
      {left && !left.done ? <span className="s2-switch-note"><Clock size={14} />{t("shop2.sets.changeIn", { d: Math.floor(left.h / 24), h: left.h % 24 })}</span> : null}
    </div>
  );
}

function Hero({ set, pricing }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const banner = set.pieces.find((p) => p.item.category === "banner")?.item;
  const art = banner?.preview_url || banner?.asset_url;
  const left = set.endsAt ? countdownParts(set.endsAt) : null;
  const prog = setProgress(set);
  return (
    <section className="s2-hero" style={{ "--set-bg": setGradient(set.palette), ...(art ? { "--set-art": `url("${String(art).replace(/"/g, "%22")}")` } : {}) }}>
      <div className="s2-hero-text">
        <div className="s2-eyebrow is-set"><Layers size={13} />{t("shop2.sets.eyebrow", { n: set.pieceCount })}</div>
        <h1>{s2.setName(set)}</h1>
        <p>{set.tagline ? s2.itemName({ name: set.tagline }) : t("shop2.banner.desc")}</p>
        <div className="s2-hero-chips">
          <Chip icon={PriceTag}>{t("shop2.sets.discount", { n: pricing.discountPct })}</Chip>
          {left && !left.done ? <Chip icon={Clock}>{t("shop2.sets.leavesIn", { d: Math.floor(left.h / 24), h: left.h % 24 })}</Chip> : null}
          {set.ownersCount ? <Chip icon={Users}>{t("shop2.sets.owners", { n: formatNumber(set.ownersCount, locale) })}</Chip> : null}
          {set.viewersNow ? <Chip icon={Eye}>{t("shop2.sets.viewers", { n: set.viewersNow })}</Chip> : null}
        </div>
      </div>
      <div className="s2-hero-stats">
        <div className="s2-stat">
          <span className="s2-eyebrow">{t("shop2.sets.youHave")}</span>
          <b className="s2-num">{prog.owned} <small>{t("shop2.sets.ofPieces", { n: prog.total })}</small></b>
          <span className="s2-bar is-thin"><i style={{ width: `${Math.round(prog.pct * 100)}%` }} /></span>
        </div>
        <div className="s2-stat">
          <span className="s2-eyebrow">{t("shop2.sets.setPrice")}</span>
          <Price value={pricing.setPrice} size="lg" />
          <s className="s2-num s2-dim">{formatNumber(pricing.sum, locale)} {t("shop2.common.d")}</s>
        </div>
        <div className="s2-stat">
          <span className="s2-eyebrow">{t("shop2.sets.yourPrice")}</span>
          <Price value={pricing.yourPrice} size="lg" />
          <small className="s2-dim">{pricing.ownedDeduction ? t("shop2.sets.deducted", { n: formatNumber(pricing.ownedDeduction, locale) }) : t("shop2.sets.noneOwned")}</small>
        </div>
      </div>
    </section>
  );
}

function PieceRow({ piece, hidden, onEye, open, onOpen }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const item = piece.item;
  const wished = s2.data.wishlist.some((w) => sameId(w.id, item.id));
  return (
    <div className={`s2-piece${open ? " is-open" : ""}${hidden ? " is-hidden" : ""}`}>
      <div className="s2-piece-main" role="button" tabIndex={0} onClick={(e) => !e.target.closest("button") && onOpen()} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
        <Shop2Art item={item} size="tile" me={s2.me} />
        <span className="s2-piece-text">
          <b>{s2.itemName(item)}</b>
          <small>{t(`shop2.cat.${item.category}`)}</small>
        </span>
        {piece.owned ? <span className="s2-owned"><Check size={13} />{t("shop2.common.owned")}</span> : <Price value={item.price_descoin} size="sm" />}
        <button
          type="button"
          className={`s2-eye${hidden ? "" : " is-on"}`}
          onClick={onEye}
          aria-pressed={!hidden}
          aria-label={hidden ? t("shop2.sets.tryPiece") : t("shop2.sets.removePiece")}
          title={hidden ? t("shop2.sets.tryPiece") : t("shop2.sets.removePiece")}
        >
          {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {open && !piece.owned ? (
        <div className="s2-piece-actions">
          <button type="button" className="s2-btn is-sm" onClick={() => s2.openCheckout({ kind: "item", item, price: item.price_descoin, setKey: item.set_key })}><Cart size={14} />{t("shop2.sets.buyOne", { n: formatNumber(item.price_descoin, locale) })}</button>
          <button type="button" className="s2-btn is-sm" onClick={() => s2.openGift({ item, price: item.price_descoin })}><Gift size={14} />{t("shop2.gifts.giftShort")}</button>
          <button type="button" className={`s2-ibtn is-sm${wished ? " is-on" : ""}`} onClick={() => s2.actions.toggleWishlist(item, !wished)} aria-pressed={wished} aria-label={t("shop2.wishlist.toggle")}><Heart size={14} weight={wished ? "fill" : "regular"} /></button>
        </div>
      ) : null}
    </div>
  );
}

function Pieces({ set, hidden, setHidden, onCurrentLook }) {
  const { t } = useLocale();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const missing = set.pieces.filter((p) => !p.owned).length;
  const toggle = (id) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
  };
  return (
    <section className="s2-col s2-pieces">
      <div className="s2-colh">
        <Layers size={16} />
        <h3>{t("shop2.sets.pieces")}</h3>
        <span className="s2-count">{set.pieces.length}</span>
        <Seg size="sm" value={filter} onChange={setFilter} label={t("shop2.sets.pieces")} options={[{ id: "all", label: t("shop2.sets.all") }, { id: "missing", label: t("shop2.sets.missingN", { n: missing }) }]} />
      </div>
      <div className="s2-col-scroll">
        {SET_PIECE_GROUPS.map((g) => {
          const list = set.pieces.filter((p) => g.categories.includes(p.item.category) && (filter === "all" || !p.owned));
          if (!list.length) return null;
          const owned = list.filter((p) => p.owned).length;
          return (
            <div key={g.id} className="s2-pgroup">
              <div className="s2-pgroup-h">
                <span>{t(`shop2.sets.group.${g.id}`)}</span>
                <small>{owned ? t("shop2.sets.groupOwned", { n: owned }) : t("shop2.sets.groupN", { n: list.length })}</small>
              </div>
              {list.map((p) => (
                <PieceRow key={p.item.id} piece={p} hidden={hidden.has(String(p.item.id))} onEye={() => toggle(String(p.item.id))} open={sameId(open, p.item.id)} onOpen={() => setOpen((o) => (sameId(o, p.item.id) ? null : p.item.id))} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="s2-colfoot">
        <button type="button" className="s2-btn is-sm" onClick={() => setHidden(new Set())}><Eye size={14} />{t("shop2.sets.tryAll")}</button>
        <button type="button" className="s2-btn is-sm" onClick={onCurrentLook}><Undo2 size={14} />{t("shop2.sets.currentLook")}</button>
      </div>
    </section>
  );
}

/** Cabin body: profile card (+ before / after), chat, voice channel. */
function CabinScene({ set, user, me, device, compare, light, focus = "all" }) {
  const { t } = useLocale();
  const s2 = useS2();
  const withSet = t("shop2.sets.withSet", { name: s2.setName(set) });
  const card = compare ? (
    <BeforeAfter
      before={<S2ProfileCard user={me} />}
      after={<S2ProfileCard user={user} />}
      labels={{ before: t("shop2.sets.now"), after: withSet, slider: t("shop2.sets.compare") }}
    />
  ) : (
    <S2ProfileCard user={user} />
  );
  const chat = (
    <div className="s2-panel">
      <div className="s2-eyebrow"><MessageCircle size={13} />{t("shop2.sets.inChat")}</div>
      <S2OtherMessage name={t("shop2.sample.p1")} text={t("shop2.sample.chat1")} time="21:40" tone={1} />
      <S2ChatMessage user={user} text={t("shop2.sample.chat2")} time="21:41" highlight />
    </div>
  );
  const voice = (
    <div className="s2-panel">
      <div className="s2-eyebrow"><Volume2 size={13} />{t("shop2.sets.inVoice")}<span className="s2-live">{t("shop2.sets.talking")}</span></div>
      <div className="s2-voice-row">
        <S2VoiceTile user={user} size={device === "phone" ? "md" : "lg"} joined={{ who: t("shop2.sample.joined", { name: user?.displayName || user?.username || "" }), sound: "" }} />
        <div className="s2-stage-peers">
          <S2PeerTile name={t("shop2.sample.p2")} tone={2} small />
          <S2PeerTile name={t("shop2.sample.p3")} tone={3} small />
        </div>
      </div>
    </div>
  );
  const parts = focus === "profile" ? [card] : focus === "chat" ? [chat] : focus === "voice" ? [voice] : null;
  if (device === "phone") {
    return (
      <DeviceFrame mode="phone" light={light} className="s2-cabin-phone">
        <div className="s2-cabin-stack">{parts || [card, chat, voice]}</div>
      </DeviceFrame>
    );
  }
  return (
    <div className={`s2-cabin-desk${light ? " is-light" : ""}`}>
      {parts ? <div className="s2-cabin-solo">{parts}</div> : (
        <>
          <div className="s2-cabin-card">
            {card}
            {compare ? <div className="s2-cabin-cap"><span>{t("shop2.sets.now")}</span><span className="s2-accent">{withSet}</span></div> : null}
          </div>
          <div className="s2-cabin-side">
            {chat}
            {voice}
          </div>
        </>
      )}
    </div>
  );
}

function Cabin({ set, user, me, stage, mode, setMode, joinItem }) {
  const { t } = useLocale();
  const s2 = useS2();
  const [device, setDevice] = useState("desktop");
  const [compare, setCompare] = useState(false);
  const [light, setLight] = useState(false);
  const [others, setOthers] = useState(false);
  return (
    <section className={`s2-col s2-cabin${others ? " is-others" : ""}`}>
      <div className="s2-colh is-wrap">
        <Shirt size={16} />
        <h3>{mode === "stage" ? t("shop2.sets.stage") : t("shop2.sets.cabin")}</h3>
        <Chip tone="green" className="s2-dotchip">{mode === "stage" ? t("shop2.sets.onYourServer") : t("shop2.sets.ownProfile")}</Chip>
        <span className="s2-colh-r">
          <Seg size="sm" value={mode} onChange={setMode} label={t("shop2.sets.mode")} options={[{ id: "cabin", label: t("shop2.sets.cabinShort"), icon: Shirt }, { id: "stage", label: t("shop2.sets.stageShort"), icon: Store }]} />
          <Seg size="sm" value={device} onChange={setDevice} label={t("shop2.sets.device")} options={[{ id: "desktop", title: t("shop2.detail.desktop"), icon: Monitor, label: s2.width > 1300 ? t("shop2.detail.desktop") : undefined }, { id: "phone", title: t("shop2.detail.phone"), icon: Smartphone, label: s2.width > 1300 ? t("shop2.detail.phone") : undefined }]} />
          {mode === "cabin" ? (
            <button type="button" className={`s2-btn is-sm${compare ? " is-active" : ""}`} aria-pressed={compare} onClick={() => setCompare((x) => !x)}><Split size={14} />{t("shop2.sets.beforeAfter")}</button>
          ) : null}
          <Seg size="sm" value={light ? "light" : "dark"} onChange={(v) => setLight(v === "light")} label={t("shop2.sets.theme")} options={[{ id: "dark", icon: Moon, title: t("shop2.sets.dark") }, { id: "light", icon: Sun, title: t("shop2.sets.light") }]} />
        </span>
      </div>
      {mode === "stage" ? (
        <div className="s2-stagebar">
          <StagePicker stage={stage} />
          <label className="s2-toggle-row">
            <Eye size={14} />
            <span>{t("shop2.sets.othersEyes")}</span>
            <Toggle checked={others} onChange={setOthers} label={t("shop2.sets.othersEyes")} />
          </label>
        </div>
      ) : null}
      <div className={`s2-cabin-body${light ? " is-light" : ""}`}>
        {mode === "stage" ? (
          device === "phone" ? (
            <DeviceFrame mode="phone" light={light} reduced={others}><Shop2Stage user={user} stage={stage} compact joinName={joinItem ? s2.itemName(joinItem) : ""} /></DeviceFrame>
          ) : (
            <div className={others ? "s2-reduced" : ""}><Shop2Stage user={user} stage={stage} joinName={joinItem ? s2.itemName(joinItem) : ""} /></div>
          )
        ) : (
          <CabinScene set={set} user={user} me={me} device={device} compare={compare} light={light} />
        )}
      </div>
      <div className="s2-cabin-foot">
        <S2JoinSound item={joinItem} title={joinItem ? s2.itemName(joinItem) : t("shop2.cat.join_sound")} />
        <span className="s2-palette">
          <span className="s2-muted">{t("shop2.sets.palette")}</span>
          {(set.palette || []).map((c) => <i key={c} style={{ background: c }} title={c} />)}
        </span>
      </div>
    </section>
  );
}

function Kasa({ set, pricing, hidden, onSaveLook }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const [forWhom, setForWhom] = useState("me");
  const hist = priceHistoryStats(set.priceHistory, pricing.yourPrice);
  const prog = setProgress(set);
  const wishedAll = set.pieces.filter((p) => !p.owned).every((p) => s2.data.wishlist.some((w) => sameId(w.id, p.item.id)));
  const others = (s2.data.sets.length ? s2.data.sets : s2.data.storefront?.featuredSets || []).filter((x) => x.key !== set.key).slice(0, 3);
  const after = s2.balance - pricing.yourPrice;
  const title = set.reward?.title ? s2.itemName({ name: set.reward.title }) : t("shop2.sets.rewardDefault", { name: s2.setName(set) });
  const outfits = s2.data.outfits.slice(0, 4);
  const partialDays = set.partialPriceUntil ? Math.max(0, Math.ceil((set.partialPriceUntil - Date.now()) / 86400000)) : 0;
  return (
    <section className="s2-col s2-kasa">
      <div className="s2-colh">
        <Cart size={16} />
        <h3>{t("shop2.kasa.title")}</h3>
        {pricing.ownedCount ? <Chip tone="green" icon={Check}>{t("shop2.kasa.deducted")}</Chip> : null}
      </div>
      <div className="s2-col-scroll">
        <div className="s2-ladder">
          <span>{t("shop2.kasa.sumN", { n: set.pieceCount })}</span><b className="s2-num"><Num value={pricing.sum} /> {t("shop2.common.d")}</b>
          <span>{t("shop2.kasa.setDiscount", { n: pricing.discountPct })}</span><b className="s2-num is-green">-<Num value={pricing.discount} /> {t("shop2.common.d")}</b>
          <span>{t("shop2.kasa.ownedN", { n: pricing.ownedCount })}</span><b className="s2-num is-green">-<Num value={pricing.ownedDeduction} /> {t("shop2.common.d")}</b>
        </div>
        <div className="s2-pay">
          <span>{t("shop2.kasa.youPay")}</span>
          <Price value={pricing.yourPrice} old={pricing.sum} size="xxl" />
          <div className="s2-balance">
            <span>{t("shop2.kasa.balance", { n: formatNumber(s2.balance, locale) })}</span>
            <span className={after < 0 ? "is-red" : ""}>{t("shop2.kasa.after", { n: formatNumber(after, locale) })}</span>
          </div>
          <span className="s2-bar is-grad"><i style={{ width: `${Math.max(0, Math.min(100, Math.round((after / Math.max(1, s2.balance)) * 100)))}%` }} /></span>
        </div>
        {pricing.missingCount ? (
          <div className="s2-save">
            <PriceTag size={15} />
            <span>{t("shop2.kasa.savings", { n: pricing.missingCount, singles: formatNumber(pricing.missingSingles, locale), save: formatNumber(pricing.savingVsSingles, locale) })}</span>
          </div>
        ) : null}
        {pricing.partialActive ? <p className="s2-note"><Clock size={14} />{t("shop2.kasa.partialLock", { d: partialDays || SHOP2_PARTIAL_DAYS })}</p> : null}
        <Seg value={forWhom} onChange={setForWhom} label={t("shop2.kasa.forWhom")} className="is-full" options={[{ id: "me", label: t("shop2.kasa.forMe"), icon: User }, { id: "friend", label: t("shop2.kasa.forFriend"), icon: Gift }]} />
        {forWhom === "me" ? (
          <button type="button" className="s2-btn is-primary is-wide is-lg" disabled={pricing.complete || after < 0} onClick={() => s2.openCheckout({ kind: "set", setKey: set.key, pieceIds: null, hidden: [...hidden] })}>
            <Cart size={17} />
            {pricing.complete ? t("shop2.kasa.complete") : t("shop2.kasa.buy", { n: formatNumber(pricing.yourPrice, locale) })}
          </button>
        ) : (
          <button type="button" className="s2-btn is-primary is-wide is-lg" onClick={() => s2.openGift({ setKey: set.key })}>
            <Gift size={17} />
            {t("shop2.kasa.giftSet")}
          </button>
        )}
        <div className="s2-row">
          <button type="button" className="s2-btn is-flex" onClick={() => s2.openGift({ setKey: set.key })}><Gift size={15} />{t("shop2.gifts.giftIt")}</button>
          <button type="button" className={`s2-btn is-flex${wishedAll ? " is-active" : ""}`} onClick={() => set.pieces.filter((p) => !p.owned).forEach((p) => s2.actions.toggleWishlist(p.item, !wishedAll))}><Heart size={15} weight={wishedAll ? "fill" : "regular"} />{t("shop2.wishlist.short")}</button>
        </div>
        <button type="button" className="s2-btn is-wide" onClick={onSaveLook}><Bookmark size={15} />{t("shop2.kasa.saveLook")}</button>
        <div className="s2-reward" style={{ "--set-accent": set.palette?.[2] }}>
          <div className="s2-reward-h"><Crown size={16} /><b>{t("shop2.kasa.reward", { title })}</b><span className="s2-num">{prog.owned} / {prog.total}</span></div>
          <p>{t("shop2.kasa.rewardBody", { n: prog.total })}</p>
          <span className="s2-bar is-gold"><i style={{ width: `${Math.round(prog.pct * 100)}%` }} /></span>
        </div>
        <div className="s2-hist">
          <div className="s2-eyebrow"><Clock size={13} />{t("shop2.detail.history30")}{hist.isLowest ? <Chip tone="green">{t("shop2.kasa.lowest")}</Chip> : null}</div>
          {hist.points.length > 1 ? <Sparkline values={hist.points} step tone="blue" /> : <p className="s2-muted">{t("shop2.kasa.noHistory")}</p>}
        </div>
        {outfits.length ? (
          <div className="s2-outfits">
            <div className="s2-eyebrow"><Bookmark size={13} />{t("shop2.kasa.savedLooks")}</div>
            <div className="s2-chips-wrap">
              {outfits.map((o) => (
                <button key={o.id} type="button" className="s2-chip is-btn" onClick={() => applyOutfit(s2, o, t)}>
                  <Bookmark size={12} />{o.auto ? t("shop2.kasa.previousLook") : o.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {set.ownersCount || set.owners.length ? (
          <div className="s2-owners">
            <div className="s2-eyebrow"><Users size={13} />{t("shop2.kasa.owners")}{set.salesSeries.length ? <Chip tone="green">{t("shop2.kasa.lastHour", { n: set.salesSeries.slice(-1)[0] || 0 })}</Chip> : null}</div>
            <div className="s2-owners-row">
              <span className="s2-stack">
                {set.owners.slice(0, 4).map((o, i) => <span key={o.id || i} className={`s2-letter is-xs tone-${i + 1}`}>{String(o.displayName || o.username || "?").charAt(0)}</span>)}
              </span>
              <span className="s2-muted">
                {set.owners.length
                  ? t("shop2.kasa.ownersFriends", { names: set.owners.slice(0, 2).map((o) => o.displayName || o.username).join(", "), n: formatNumber(Math.max(0, set.ownersCount - 2), locale) })
                  : t("shop2.sets.owners", { n: formatNumber(set.ownersCount, locale) })}
              </span>
              {set.salesSeries.length > 1 ? <span className="s2-owners-spark"><Sparkline values={set.salesSeries} width={90} height={26} marker={false} tone="gold" /></span> : null}
            </div>
          </div>
        ) : null}
        {others.length ? (
          <div className="s2-others">
            <div className="s2-eyebrow">{t("shop2.kasa.otherSets")}</div>
            {others.map((o) => (
              <button key={o.key} type="button" className="s2-other" onClick={() => s2.openSet(o.key)}>
                <span className="s2-switch-art" style={{ background: setGradient(o.palette) }} />
                <span><b>{s2.setName(o)}</b><small>{t("shop2.sets.ownedN", { n: o.ownedCount })}</small></span>
                <Price value={o.yourPrice ?? o.setPrice} size="sm" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Wear a saved outfit through the regular equip endpoint, one slot at a time. */
export async function applyOutfit(s2, outfit, t) {
  const byId = new Map(s2.inventory.map((r) => [String(r.itemId), r.item]));
  let n = 0;
  for (const [category, id] of Object.entries(outfit.items || {})) {
    const item = byId.get(String(id));
    if (!item) continue;
    if (sameId(s2.equippedIdFor(category), id)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await s2.onEquip?.(item, false)) n += 1;
    } catch {
      /* keep going */
    }
  }
  if (!n) {
    // Not in the loaded inventory yet (just bought): let the server wear it.
    const res = await s2.actions.applyOutfit(outfit);
    if (res) n = Object.keys(outfit.items || {}).length;
  }
  s2.toast(t("shop2.kasa.lookApplied", { n }), { tone: "ok" });
}

/** Undo "Hepsini kuşan": put back the previous item of each slot, or take the new one off. */
export async function restoreLook(s2, prevLook, newItems, t) {
  const byId = new Map(s2.inventory.map((r) => [String(r.itemId), r.item]));
  for (const it of newItems) {
    const prevId = prevLook?.[it.category];
    try {
      if (prevId != null && byId.get(String(prevId))) {
        // eslint-disable-next-line no-await-in-loop
        await s2.onEquip?.(byId.get(String(prevId)), false);
      } else if (sameId(s2.equippedIdFor(it.category), it.id) || prevId == null) {
        // eslint-disable-next-line no-await-in-loop
        await s2.onEquip?.(it, true);
      }
    } catch {
      /* keep going */
    }
  }
  s2.toast(t("shop2.celebrate.restored"), { tone: "ok" });
}

function SaveLookDialog({ onSave, onClose, phone }) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  return (
    <Layer kind={phone ? "sheet" : "dialog"} onClose={onClose} label={t("shop2.kasa.saveLook")} className="s2-dialog is-sm">
      <h3 className="s2-dialog-title">{t("shop2.kasa.saveLook")}</h3>
      <p className="s2-muted">{t("shop2.kasa.saveLookBody")}</p>
      <input className="s2-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("shop2.kasa.lookName")} aria-label={t("shop2.kasa.lookName")} />
      <div className="s2-row">
        <button type="button" className="s2-btn is-flex" onClick={onClose}>{t("shop2.common.cancel")}</button>
        <button type="button" className="s2-btn is-primary is-flex2" disabled={!name.trim()} onClick={() => onSave(name.trim())}>{t("shop2.common.save")}</button>
      </div>
    </Layer>
  );
}

// ---------------------------------------------------------------------------
// Phone (A telefon + C telefon).

function PhoneSet({ set, sets, pricing, user, me, hidden, setHidden, stage, mode, setMode, onPick, joinItem, onSaveLook }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const [focus, setFocus] = useState("all");
  const [device, setDevice] = useState("phone");
  const touch = useRef(null);
  const idx = sets.findIndex((x) => x.key === set.key);
  const go = (d) => {
    const next = sets[(idx + d + sets.length) % sets.length];
    if (next) onPick(next.key);
  };
  const prog = setProgress(set);
  const banner = set.pieces.find((p) => p.item.category === "banner")?.item;
  const art = banner?.preview_url || banner?.asset_url;
  const left = set.endsAt ? countdownParts(set.endsAt) : null;
  const wished = set.pieces.filter((p) => !p.owned).every((p) => s2.data.wishlist.some((w) => sameId(w.id, p.item.id)));
  return (
    <div className="s2-pset">
      <div className="s2-pset-top">
        <button type="button" className="s2-ibtn" onClick={() => s2.setTab("vitrin")} aria-label={t("shop2.common.back")}><ChevronLeft size={18} /></button>
        <span className="s2-pset-title">
          <b>{s2.setName(set)}</b>
          <span className="s2-pdots">
            {sets.map((x) => <button key={x.key} type="button" aria-label={s2.setName(x)} className={x.key === set.key ? "is-on" : ""} style={{ background: x.palette?.[2] }} onClick={() => onPick(x.key)} />)}
            <small className="s2-num">{idx + 1} / {sets.length}</small>
          </span>
        </span>
        <button type="button" className={`s2-ibtn${wished ? " is-on" : ""}`} onClick={() => set.pieces.filter((p) => !p.owned).forEach((p) => s2.actions.toggleWishlist(p.item, !wished))} aria-label={t("shop2.wishlist.toggle")}><Heart size={18} weight={wished ? "fill" : "regular"} /></button>
        <button type="button" className="s2-ibtn" onClick={async () => {
          try {
            await s2.actions.shareLook({ setKey: set.key });
            s2.toast(t("shop2.celebrate.shared"), { tone: "ok" });
          } catch {
            s2.toast(t("shop2.errors.share"), { tone: "error" });
          }
        }} aria-label={t("shop2.sets.share")}><Share2 size={18} /></button>
      </div>
      <div
        className="s2-pset-hero"
        style={{ "--set-bg": setGradient(set.palette), ...(art ? { "--set-art": `url("${String(art).replace(/"/g, "%22")}")` } : {}) }}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="s2-hero-chips">
          <Chip>{t("shop2.sets.discount", { n: pricing.discountPct })}</Chip>
          {left && !left.done ? <Chip icon={Clock}>{t("shop2.sets.daysHours", { d: Math.floor(left.h / 24), h: left.h % 24 })}</Chip> : null}
        </div>
        <p>{set.tagline ? s2.itemName({ name: set.tagline }) : t("shop2.banner.desc")}</p>
      </div>
      <div className="s2-pset-cabin">
        <div className="s2-pset-tabs">
          {mode === "stage" ? <StagePicker stage={stage} /> : (
            <Seg size="sm" value={focus} onChange={setFocus} label={t("shop2.sets.cabin")} options={[{ id: "all", label: t("shop2.sets.focusAll") }, { id: "profile", label: t("shop2.sets.focusProfile") }, { id: "chat", label: t("shop2.sets.focusChat") }, { id: "voice", label: t("shop2.sets.focusVoice") }]} />
          )}
          <Seg size="sm" value={device} onChange={setDevice} label={t("shop2.sets.device")} options={[{ id: "desktop", icon: Monitor, title: t("shop2.detail.desktop") }, { id: "phone", icon: Smartphone, title: t("shop2.detail.phone") }]} />
        </div>
        <div className="s2-pset-stage">
          {mode === "stage" ? <Shop2Stage user={user} stage={stage} compact joinName={joinItem ? s2.itemName(joinItem) : ""} /> : device === "desktop" ? (
            <div className="s2-pset-desk"><CabinScene set={set} user={user} me={me} device="desktop" focus={focus} /></div>
          ) : (
            <div className="s2-cabin-stack is-bare">
              {focus === "all" || focus === "profile" ? (
                <div className="s2-pset-duo">
                  <S2ProfileCard user={user} compact />
                  {focus === "all" ? (
                    <div className="s2-pset-duo-r">
                      <S2VoiceTile user={user} size="sm" joined={{ who: t("shop2.sample.joinedShort"), sound: "" }} />
                      <S2JoinSound item={joinItem} compact />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {focus === "all" || focus === "chat" ? <S2ChatMessage user={user} text={t("shop2.sample.chat2")} time="21:41" highlight /> : null}
              {focus === "voice" ? <><S2VoiceTile user={user} size="md" joined={{ who: t("shop2.sample.joinedShort"), sound: "" }} /><S2JoinSound item={joinItem} title={joinItem ? s2.itemName(joinItem) : ""} /></> : null}
            </div>
          )}
        </div>
        <div className="s2-pset-mode">
          <Seg size="sm" value={mode} onChange={setMode} label={t("shop2.sets.mode")} options={[{ id: "cabin", label: t("shop2.sets.cabinShort"), icon: Shirt }, { id: "stage", label: t("shop2.sets.stageShort"), icon: Store }]} />
        </div>
      </div>
      <div className="s2-sech is-small">
        <span className="s2-eyebrow">{t("shop2.sets.piecesCaps")}</span>
        <span className="s2-muted">{t("shop2.sets.missingOwned", { m: prog.left, o: prog.owned })}</span>
        <button type="button" className="s2-link s2-sech-r" onClick={() => setHidden(new Set())}>{t("shop2.sets.tryAll")}</button>
      </div>
      <div className="s2-pgrid">
        {set.pieces.map((p) => {
          const off = hidden.has(String(p.item.id));
          return (
            <button
              key={p.item.id}
              type="button"
              className={`s2-ppiece${p.owned ? " is-owned" : ""}${off ? " is-off" : ""}`}
              aria-pressed={!off}
              onClick={() => {
                const next = new Set(hidden);
                if (off) next.delete(String(p.item.id));
                else next.add(String(p.item.id));
                setHidden(next);
                try {
                  navigator.vibrate?.(8);
                } catch {
                  /* no haptics */
                }
              }}
            >
              <Shop2Art item={p.item} size="tile" me={s2.me} />
              <span className="s2-ppiece-t">
                <b>{s2.itemName(p.item)}</b>
                {p.owned ? <small className="is-green"><Check size={12} />{t("shop2.common.owned")}</small> : <Price value={p.item.price_descoin} size="sm" />}
              </span>
              <span className={`s2-tick${off ? "" : " is-on"}`}><Check size={12} weight="bold" /></span>
            </button>
          );
        })}
      </div>
      <div className="s2-reward is-row" style={{ "--set-accent": set.palette?.[2] }}>
        <Crown size={18} />
        <span>{t("shop2.kasa.rewardLeft", { title: set.reward?.title ? s2.itemName({ name: set.reward.title }) : t("shop2.sets.rewardDefault", { name: s2.setName(set) }), n: prog.left })}</span>
        <span className="s2-bar is-gold"><i style={{ width: `${Math.round(prog.pct * 100)}%` }} /></span>
      </div>
      <button type="button" className="s2-btn is-wide" onClick={onSaveLook}><Bookmark size={15} />{t("shop2.kasa.saveLook")}</button>
      <div className="s2-pbar">
        <span className="s2-pbar-t">
          <small><s className="s2-num">{formatNumber(pricing.sum, locale)}</s> · {pricing.ownedCount ? t("shop2.sets.ownedDeductedShort", { n: pricing.ownedCount }) : t("shop2.sets.discount", { n: pricing.discountPct })}</small>
          <Price value={pricing.yourPrice} size="xl" />
        </span>
        <button type="button" className="s2-ibtn is-lg" onClick={() => s2.openGift({ setKey: set.key })} aria-label={t("shop2.gifts.giftIt")}><Gift size={19} /></button>
        <button type="button" className="s2-btn is-primary is-lg" disabled={pricing.complete} onClick={() => s2.openCheckout({ kind: "set", setKey: set.key, pieceIds: null })}><Cart size={17} />{t("shop2.sets.buyShort")}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function Shop2Sets({ setKey, onSetKey }) {
  const { t } = useLocale();
  const s2 = useS2();
  const list = s2.data.sets.length ? s2.data.sets : s2.data.storefront?.featuredSets || [];
  const key = setKey || list[0]?.key || null;
  const set = key ? s2.data.setDetails[key] : null;
  const [hidden, setHidden] = useState(() => new Set());
  const [mode, setMode] = useState(() => s2.data.prefs.setMode || "cabin");
  const [saving, setSaving] = useState(false);
  const stage = useStage();
  const { loadSet } = s2.actions;
  const { setPalette } = s2;
  useEffect(() => {
    if (key && !s2.data.setDetails[key]) loadSet(key);
    setHidden(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (set?.palette?.length) setPalette(set.palette);
    return () => setPalette(null);
  }, [set?.key, set?.palette, setPalette]);
  const tryOn = useMemo(() => setTryOn(set, hidden), [set, hidden]);
  const user = useMemo(() => composeTryOnUser(s2.me, tryOn), [s2.me, tryOn]);
  const pricing = useMemo(() => (set ? setPricing(set) : null), [set]);
  const changeMode = (m) => {
    setMode(m);
    s2.actions.setPref({ setMode: m });
  };
  if (!list.length && !set) {
    return (
      <div className="s2-empty">
        <Layers size={28} />
        <h3>{t("shop2.sets.emptyTitle")}</h3>
        <p>{t("shop2.sets.emptyBody")}</p>
      </div>
    );
  }
  if (!set) return <div className="s2-skeleton is-sets" aria-busy="true"><i /><i /><i /></div>;
  const joinItem = set.pieces.find((p) => p.item.category === "join_sound")?.item || null;
  const saveLook = async (name) => {
    const items = { ...currentLook(s2.me) };
    for (const p of set.pieces) if (!hidden.has(String(p.item.id))) items[p.item.category] = p.item.id;
    await s2.actions.saveOutfit(name, items);
    setSaving(false);
    s2.toast(t("shop2.kasa.lookSaved", { name }), { tone: "ok" });
  };
  const allSets = list.length ? list : [set];
  if (s2.layout === "phone") {
    return (
      <>
        <PhoneSet set={set} sets={allSets} pricing={pricing} user={user} me={s2.me} hidden={hidden} setHidden={setHidden} stage={stage} mode={mode} setMode={changeMode} onPick={onSetKey} joinItem={joinItem} onSaveLook={() => setSaving(true)} />
        {saving ? <SaveLookDialog phone onSave={saveLook} onClose={() => setSaving(false)} /> : null}
      </>
    );
  }
  return (
    <div className="s2-sets">
      <SetSwitcher sets={allSets} active={set.key} onPick={onSetKey} />
      <Hero set={set} pricing={pricing} />
      <div className="s2-sets-grid">
        <Pieces set={set} hidden={hidden} setHidden={setHidden} onCurrentLook={() => setHidden(new Set(set.pieces.map((p) => String(p.item.id))))} />
        <Cabin set={set} user={user} me={s2.me} stage={stage} mode={mode} setMode={changeMode} joinItem={joinItem} />
        <Kasa set={set} pricing={pricing} hidden={hidden} onSaveLook={() => setSaving(true)} />
      </div>
      {saving ? <SaveLookDialog onSave={saveLook} onClose={() => setSaving(false)} /> : null}
    </div>
  );
}
