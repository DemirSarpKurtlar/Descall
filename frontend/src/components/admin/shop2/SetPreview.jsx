/**
 * Kullanıcının göreceği (Draft A frame A2 right column + Draft B frame B2 stage): the set
 * card in the shop on desktop and phone at the same time, for a sample user (owned
 * pieces deducted), drawn with the user shop's own renderers (framed avatar, name colour
 * + badge, chat bubble, voice tile, join sound); the lifecycle states (soon / on sale /
 * last 24 h / sold out) switch the stage; "Kime ne fiyat" tiers and the forecast.
 */
import { useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { cssUrl } from "../../../lib/cssUrl";
import { S2Avatar, S2ChatMessage, S2Name } from "../../shop2/Shop2Preview.jsx";
import { JoinSoundPreview, VoiceTilePreview } from "../../voice/VoiceCosmetics.jsx";
import { ChevronDown, Eye, Gift, Monitor, Smartphone, TrendingUp } from "./icons.js";
import { Coin, Pill, Popover, Seg, Thumb, useFmt } from "./ui.jsx";
import { SET_SLOTS, leftParts, priceForOwner, priceTiers, setPricing } from "./shop2Model.js";

const EQUIP_FIELD = {
  avatar_frame: "equippedAvatarFrame",
  banner: "equippedBanner",
  profile_color: "equippedProfileColor",
  profile_badge: "equippedBadge",
  avatar_effect: "equippedAvatarEffect",
  chat_bubble: "equippedChatBubble",
  voice_tile: "equippedVoiceTile",
  join_sound: "equippedJoinSound",
};

/** The sample user wearing every piece of the set. */
export function wearing(set, base) {
  const u = { username: base?.username || "elifkaya", displayName: base?.displayName || "Elif Kaya", avatarUrl: base?.avatarUrl || null, status: "online" };
  for (const s of SET_SLOTS) if (set?.pieces?.[s]) u[EQUIP_FIELD[s]] = set.pieces[s];
  return u;
}

/** Sample users: none / 1–2 pieces / 3+ pieces (cheapest pieces owned), or a real user. */
export function sampleOwned(set, sample) {
  const list = SET_SLOTS.map((s) => set?.pieces?.[s]).filter(Boolean);
  if (sample?.ownedIds) return sample.ownedIds;
  const n = sample?.id === "few" ? 2 : sample?.id === "many" ? 3 : 0;
  return [...list].sort((a, b) => (a.price_descoin || 0) - (b.price_descoin || 0)).slice(0, n).map((it) => it.id);
}

export const STAGES = ["upcoming", "live", "last24", "soldout"];

export default function SetPreview({ set, now, stage, onStage, sample, onSample, users = [], onPhoneSeen, forecast }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const [device, setDevice] = useState("both");
  const [pickOpen, setPickOpen] = useState(false);
  const pickRef = useRef(null);
  const pieces = SET_SLOTS.map((s) => set?.pieces?.[s]).filter(Boolean);
  const owned = useMemo(() => sampleOwned(set, sample), [set, sample]);
  const pr = setPricing(pieces, set?.price);
  const mine = priceForOwner(pieces, set?.price, owned);
  const tiers = useMemo(() => {
    const payers = set?.payers || [];
    if (!payers.length) return priceTiers(pieces, set?.price, {});
    const known = payers.reduce((a, p) => a + (Number(p.users) || 0), 0);
    return [
      ...payers.map((p) => ({ key: p.key, price: p.pays ?? null, users: p.users, share: p.users != null && known ? Math.round((p.users / known) * 100) : null })),
      { key: "all", price: null, hidden: true, share: null },
    ];
  }, [set, pieces]);
  const sampleLabel = sample?.username ? `@${sample.username}` : t(`adminShop2.pv.sample.${sample?.id || "none"}`);

  const show = (d) => {
    setDevice(d);
    if (d !== "desktop") onPhoneSeen?.();
  };

  return (
    <div className="as2-pv" data-testid="as2-preview">
      <div className="as2-pv-h">
        <h3>
          <Eye size={16} />
          {t("adminShop2.pv.title")}
        </h3>
        <Seg
          size="sm"
          value={device}
          onChange={show}
          label={t("adminShop2.preview.device")}
          options={[
            { id: "desktop", label: <Monitor size={14} aria-label={t("adminShop2.preview.desktop")} /> },
            { id: "phone", label: <Smartphone size={14} aria-label={t("adminShop2.preview.phone")} /> },
            { id: "both", label: t("adminShop2.preview.both") },
          ]}
        />
      </div>
      <div className="as2-pv-sample">
        <span className="as2-muted">{t("adminShop2.pv.sampleLabel")}</span>
        <span className="as2-rel" ref={pickRef}>
          <button type="button" className="as2-pv-pick" onClick={() => setPickOpen((v) => !v)} aria-expanded={pickOpen}>
            <i className="as2-pv-pick-av">{(sample?.username || "E").charAt(0).toUpperCase()}</i>
            <span>
              {sampleLabel} · {owned.length ? t("adminShop2.pv.ownedN", { n: owned.length }) : t("adminShop2.pv.ownedNone")}
            </span>
            <ChevronDown size={14} />
          </button>
        </span>
        <Popover open={pickOpen} onClose={() => setPickOpen(false)} anchorRef={pickRef} width={260} label={t("adminShop2.pv.sampleLabel")}>
          {["none", "few", "many"].map((id) => (
            <button
              key={id}
              type="button"
              className="as2-pop-it"
              onClick={() => {
                setPickOpen(false);
                onSample({ id });
              }}
            >
              {t(`adminShop2.pv.sample.${id}`)}
            </button>
          ))}
          {users.length ? <div className="as2-pop-cap">{t("adminShop2.pv.realUsers")}</div> : null}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className="as2-pop-it"
              onClick={() => {
                setPickOpen(false);
                onSample({ id: u.id, username: u.username, ownedIds: u.ownedIds || [] });
              }}
            >
              @{u.username}
            </button>
          ))}
        </Popover>
      </div>

      <div className={`as2-pv-stage is-${device}`}>
        {device !== "phone" ? <DesktopCard set={set} now={now} stage={stage} mine={mine} pr={pr} owned={owned} sampleName={sample?.username} /> : null}
        <div className="as2-pv-row">
          {device !== "desktop" ? <PhoneCard set={set} now={now} stage={stage} mine={mine} pr={pr} /> : null}
          {(
            <div className="as2-pv-side">
              <div className="as2-cap">{t("adminShop2.pv.whoPays")}</div>
              {tiers.map((tr) => (
                <div key={tr.key} className={`as2-tier${tr.hidden ? " is-hidden" : ""}`}>
                  <span>
                    <small>{t(`adminShop2.pv.tier.${tr.key}`)}</small>
                    <b className="tnum">{tr.hidden ? t("adminShop2.pv.hidden") : tr.price == null ? "–" : `${f.n(tr.price)} D`}</b>
                  </span>
                  {tr.users != null ? <em className="tnum">{t("adminShop2.pv.users", { n: f.n(tr.users) })}</em> : tr.share != null ? <em className="tnum">{f.p(tr.share, 0)}</em> : null}
                </div>
              ))}
              {forecast ? (
                <div className="as2-fc">
                  <small>
                    <TrendingUp size={13} />
                    {t("adminShop2.pv.forecast")}
                  </small>
                  <p>{t(forecast.soldOutDays ? "adminShop2.pv.forecastV" : "adminShop2.pv.forecastOpen", { lo: f.n(forecast.firstDayLo), hi: f.n(forecast.firstDayHi), d: forecast.soldOutDays || 0 })}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {device !== "phone" ? <WornStrip set={set} sampleName={sample?.username} /> : null}

      <div className="as2-cap as2-mt12">
        {t("adminShop2.pv.lifecycle")}
        <span className="as2-muted as2-ml">{t("adminShop2.pv.lifecycleHint")}</span>
      </div>
      <div className="as2-life">
        {STAGES.map((st) => (
          <button key={st} type="button" className={`as2-life-c is-${st}${stage === st ? " is-on" : ""}`} onClick={() => onStage(st)} aria-pressed={stage === st} data-testid={`as2-stage-${st}`}>
            <span className="as2-life-art" style={heroStyle(set)}>
              <Pill tone={st === "last24" ? "red" : st === "soldout" ? "gray" : st === "live" ? "green" : "blue"}>{t(`adminShop2.pv.stage.${st}`)}</Pill>
              <MiniAv set={set} />
            </span>
            <small>{stageNote(t, st, set, now, locale)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function heroStyle(set) {
  const banner = set?.pieces?.banner;
  const art = banner?.preview_url || banner?.asset_url;
  const pal = set?.palette || [];
  return {
    "--p0": pal[0] || "#151a2e",
    "--p1": pal[1] || "#2a3a78",
    "--p2": pal[2] || "#7a8fff",
    "--p3": pal[3] || "#e6ebff",
    ...(art ? { backgroundImage: `linear-gradient(180deg, rgba(8,10,20,.05), rgba(8,10,20,.72)), ${cssUrl(art)}` } : {}),
  };
}

function MiniAv({ set }) {
  const frame = set?.pieces?.avatar_frame;
  const art = frame?.preview_url || frame?.asset_url;
  return (
    <span className="as2-miniav">
      <i />
      {art ? <img src={art} alt="" /> : null}
    </span>
  );
}

function stageNote(t, st, set, now, locale) {
  if (st === "upcoming") return set?.startsAt ? t("adminShop2.pv.note.upcoming", { when: formatAppDateTime(set.startsAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("adminShop2.pv.note.upcomingNone");
  if (st === "live") {
    const l = leftParts(set?.endsAt, now);
    return l ? t("adminShop2.pv.note.live", { d: l.d, h: l.h }) : t("adminShop2.pv.note.liveOpen");
  }
  if (st === "last24") return t("adminShop2.pv.note.last24");
  return t("adminShop2.pv.note.soldout");
}

function countdown(t, set, stage, now, locale) {
  const stock = set?.stock || {};
  const stockTxt = stock.total != null ? t("adminShop2.pv.stockLeft", { left: stock.left ?? stock.total, total: stock.total }) : t("adminShop2.pv.stockOpen");
  if (stage === "upcoming") return `${t("adminShop2.pv.opens", { when: set?.startsAt ? formatAppDateTime(set.startsAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–" })} · ${stockTxt}`;
  if (stage === "soldout") return t("adminShop2.pv.soldOut");
  if (stage === "last24") return `${t("adminShop2.pv.lastHours", { h: 23 })} · ${stockTxt}`;
  const l = leftParts(set?.endsAt, now);
  return `${l ? t("adminShop2.pv.left", { d: l.d, h: l.h }) : t("adminShop2.pv.noEnd")} · ${stockTxt}`;
}

function PriceRow({ set, mine, pr, compact = false }) {
  const { t } = useLocale();
  const f = useFmt();
  if (mine.hidden) return <p className="as2-pv-all">{t("adminShop2.pv.allOwned")}</p>;
  const adv = pr.sum ? Math.round((1 - (mine.price || 0) / pr.sum) * 100) : 0;
  return (
    <div className="as2-pv-price">
      <span>
        <Coin value={mine.price} strike={pr.sum} size={compact ? "md" : "lg"} />
        <small className={mine.owned ? "as2-pos" : "as2-muted"}>{mine.owned ? t("adminShop2.pv.deducted", { n: mine.owned }) : t("adminShop2.pv.fullSet", { n: SET_SLOTS.length })}</small>
      </span>
      {!compact && adv > 0 ? <Pill tone="green">{t("adminShop2.pv.advantage", { pct: f.n(adv) })}</Pill> : null}
    </div>
  );
}

function Buttons({ stage, compact = false }) {
  const { t } = useLocale();
  if (stage === "soldout")
    return (
      <div className="as2-pv-btns">
        <span className="as2-pv-buy is-ghost">{t("adminShop2.pv.askBack")}</span>
      </div>
    );
  if (stage === "upcoming")
    return (
      <div className="as2-pv-btns">
        <span className="as2-pv-buy is-ghost">{t("adminShop2.pv.remind")}</span>
      </div>
    );
  return (
    <div className="as2-pv-btns">
      <span className="as2-pv-buy">{t("adminShop2.pv.buySet")}</span>
      {!compact ? <span className="as2-pv-sec">{t("adminShop2.pv.pieces")}</span> : null}
      <span className="as2-pv-gift" aria-hidden="true">
        <Gift size={15} />
      </span>
    </div>
  );
}

function Hero({ set, now, stage, sampleName, compact = false }) {
  const { t, locale } = useLocale();
  const user = wearing(set, sampleName ? { username: sampleName, displayName: sampleName } : null);
  return (
    <div className={`as2-hero is-${stage}${compact ? " is-compact" : ""}`} style={heroStyle(set)}>
      <div className="as2-hero-chips">
        <Pill tone="glass">{stage === "upcoming" ? t("adminShop2.pv.newSet") : t("adminShop2.pv.setPieces", { n: SET_SLOTS.length })}</Pill>
        {set?.stock?.total != null ? <Pill tone="amber">{stage === "upcoming" ? t("adminShop2.pv.units", { n: set.stock.total }) : t("adminShop2.pv.limited")}</Pill> : null}
      </div>
      <span className="as2-hero-av">
        <S2Avatar user={user} size={compact ? 46 : 72} />
      </span>
      <div className="as2-hero-t">
        <b className="as2-hero-name">
          <S2Name user={{ ...user, equippedBadge: null }} badge={false}>
            {set?.name || t("adminShop2.b.untitled")}
          </S2Name>
        </b>
        <small className={stage === "last24" ? "is-urgent" : ""}>{countdown(t, set, stage, now, locale)}</small>
      </div>
    </div>
  );
}

function DesktopCard({ set, now, stage, mine, pr, sampleName }) {
  const { t } = useLocale();
  return (
    <div className="as2-dev is-desktop">
      <div className="as2-dev-bar">
        <i />
        <i />
        <i />
        <span>{t("adminShop2.pv.chrome")}</span>
      </div>
      <div className="as2-dev-body">
        <div className="as2-shop-tabs">
          <span>{t("adminShop2.pv.tab.today")}</span>
          <span className="is-on">{t("adminShop2.pv.tab.sets")}</span>
          <span>{t("adminShop2.pv.tab.night")}</span>
          <Coin value={12450} size="sm" />
        </div>
        <div className={`as2-scard is-${stage}`}>
          <Hero set={set} now={now} stage={stage} sampleName={sampleName} />
          <div className="as2-scard-pieces">
            {SET_SLOTS.map((s) => (
              <span key={s} className={`as2-scard-pc${set?.pieces?.[s] ? "" : " is-empty"}`}>
                {set?.pieces?.[s] ? <Thumb item={set.pieces[s]} size={30} /> : null}
              </span>
            ))}
          </div>
          <PriceRow set={set} mine={mine} pr={pr} />
          <Buttons stage={stage} />
        </div>
      </div>
    </div>
  );
}

function PhoneCard({ set, now, stage, mine, pr }) {
  return (
    <div className="as2-dev is-phone">
      <div className="as2-dev-notch" />
      <div className={`as2-scard is-${stage} is-phone`}>
        <Hero set={set} now={now} stage={stage} compact />
        <div className="as2-scard-pieces is-mini">
          {SET_SLOTS.map((s) => (
            <span key={s} className={`as2-scard-pc${set?.pieces?.[s] ? "" : " is-empty"}`}>
              {set?.pieces?.[s] ? <Thumb item={set.pieces[s]} size={18} /> : null}
            </span>
          ))}
        </div>
        <PriceRow set={set} mine={mine} pr={pr} compact />
        <Buttons stage={stage} compact />
      </div>
    </div>
  );
}

/** The set worn: a chat line with the bubble, the voice tile with the join sound. */
function WornStrip({ set, sampleName }) {
  const { t } = useLocale();
  const user = wearing(set, sampleName ? { username: sampleName, displayName: sampleName } : null);
  const hasChat = set?.pieces?.chat_bubble || set?.pieces?.profile_color;
  const hasVoice = set?.pieces?.voice_tile || set?.pieces?.join_sound;
  if (!hasChat && !hasVoice) return null;
  return (
    <div className="as2-worn">
      <div className="as2-cap">{t("adminShop2.pv.worn")}</div>
      <div className="as2-worn-row">
        {hasChat ? (
          <div className="as2-worn-chat">
            <S2ChatMessage user={user} text={t("adminShop2.pv.chatSample")} time="21:41" />
          </div>
        ) : null}
        {hasVoice ? (
          <div className="as2-worn-voice">
            {set?.pieces?.voice_tile ? <VoiceTilePreview item={set.pieces.voice_tile} name={user.displayName || user.username} initials={String(user.displayName || user.username || "E").slice(0, 2).toUpperCase()} wide /> : null}
            {set?.pieces?.join_sound ? <JoinSoundPreview item={set.pieces.join_sound} compact /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
