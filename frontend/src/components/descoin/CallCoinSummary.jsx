/*
 * End-of-call DesCoin summary (owner pick: draft C "Halkalı para + öne çıkan ürün",
 * combined with draft B's receipt rows, Nov 2026). Top to bottom:
 *   1. hero: the coin inside today's progress ring (earlier today / this call / left of
 *      the 400 daily cap), "+42 DesCoin", duration + talk minutes, the call line and its
 *      context chips (avatar, DM / group / server channel, screen shared, time range)
 *   2. receipt rows behind a perforated divider: talking, screen sharing (hidden at 0)
 *   3. previous -> new balance and the call streak
 *   4. near-cap warning (only when a daily cap is at least 90% used)
 *   5. featured shop item (sale / limited stock / time-limited, live countdown) + buttons
 *   6. footer: receipt number (opens the wallet history), summary settings, "don't show again"
 * Desktop / web / Electron: centered glass popup. Narrow (iPhone, iPad split): bottom sheet.
 * Motion follows the draft captions; prefers-reduced-motion / Hareketi azalt shows the end state.
 * Pure helpers: lib/callCoinPrefs.js. Styles: styles/call-coin-summary.css.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useT } from "../../context/LocaleContext";
import { formatNumber, formatTime, formatDate } from "../../i18n/format.js";
import { localizeShopItem } from "../../lib/shopItemI18n.js";
import { SHOP_CATEGORY_TABS } from "../../lib/shopCategories.js";
import { API_BASE_URL } from "../../config/api";
import {
  absoluteAssetUrl,
  activeMinutes,
  countdownParts,
  ringFractions,
  splitDuration,
} from "../../lib/callCoinPrefs.js";
import { CcsIcon, CoinArt, MiniCoin } from "./callCoinIcons.jsx";

/* ------------------------------------------------------------------ hooks */

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  try {
    if (document.documentElement.classList.contains("reduce-motion")) return true;
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/** Counts from `from` to `to` (ease-out) after `delay` ms; the end value right away when still. */
function useCountUp(to, { from = 0, duration = 900, delay = 0, still = false } = {}) {
  const [v, setV] = useState(still ? to : from);
  useEffect(() => {
    if (still || typeof window === "undefined" || !window.requestAnimationFrame) {
      setV(to);
      return undefined;
    }
    let raf = 0;
    let start = 0;
    setV(from);
    const timer = window.setTimeout(() => {
      const step = (ts) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / duration);
        const e = 1 - (1 - p) ** 3;
        setV(Math.round(from + (to - from) * e));
        if (p < 1) raf = window.requestAnimationFrame(step);
      };
      raf = window.requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
    };
  }, [to, from, duration, delay, still]);
  return v;
}

function useNow(enabled, frozenNow) {
  const [now, setNow] = useState(() => frozenNow ?? Date.now());
  useEffect(() => {
    if (!enabled || frozenNow != null) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled, frozenNow]);
  return frozenNow ?? now;
}

function useNarrow(forced) {
  const query = "(max-width: 699px)";
  const [narrow, setNarrow] = useState(() => {
    if (forced) return forced === "sheet";
    if (typeof window === "undefined") return false;
    return Boolean(window.matchMedia?.(query)?.matches);
  });
  useEffect(() => {
    if (forced || typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [forced]);
  return forced ? forced === "sheet" : narrow;
}

/* ------------------------------------------------------------------ pieces */

function Ring({ size, stroke, fractions }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const beforeLen = Math.max(0, c * fractions.before - (fractions.before > 0 ? 3 : 0));
  const callLen = c * fractions.call;
  const ticks = [];
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * 2 * Math.PI - Math.PI / 2;
    const r1 = r - stroke / 2 - 6;
    const r2 = r1 - (i % 10 === 0 ? 6 : 3);
    ticks.push(
      <line
        key={i}
        x1={mid + r1 * Math.cos(a)}
        y1={mid + r1 * Math.sin(a)}
        x2={mid + r2 * Math.cos(a)}
        y2={mid + r2 * Math.sin(a)}
        stroke={`rgba(255,255,255,${i % 10 === 0 ? 0.3 : 0.12})`}
        strokeWidth="1.5"
      />
    );
  }
  return (
    <svg className="ccs-rg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${uid}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d8cff" />
          <stop offset="1" stopColor="#9b5de5" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe59a" />
          <stop offset="1" stopColor="#f08a24" />
        </linearGradient>
      </defs>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
      {beforeLen > 0 ? (
        <circle
          className="ccs-arc ccs-arc-before"
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={`url(#${uid}a)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${beforeLen} ${c}`}
          style={{ "--len": beforeLen }}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      ) : null}
      {callLen > 0 ? (
        <circle
          className="ccs-arc ccs-arc-call"
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={`url(#${uid}b)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${callLen} ${c}`}
          style={{ "--len": callLen }}
          transform={`rotate(${-90 + fractions.before * 360} ${mid} ${mid})`}
        />
      ) : null}
      {ticks}
    </svg>
  );
}

function initials(name) {
  const s = String(name || "").trim();
  return s ? s[0].toLocaleUpperCase() : "D";
}

function Avatar({ url, name, square }) {
  const [broken, setBroken] = useState(false);
  const src = absoluteAssetUrl(url, API_BASE_URL);
  return (
    <span className={`ccs-av${square ? " is-square" : ""}`} aria-hidden="true">
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <b>{initials(name)}</b>}
    </span>
  );
}

function fmtDuration(t, sec) {
  const { h, m, s } = splitDuration(sec);
  if (h > 0) return t("coinpop.dur.hm", { h, m });
  if (m > 0) return t("coinpop.dur.ms", { m, s });
  return t("coinpop.dur.s", { s });
}

function dayLabel(t, iso, locale, now) {
  const d = new Date(iso);
  const today = new Date(now);
  const y = new Date(now - 86_400_000);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return t("coinpop.today");
  if (same(d, y)) return t("coinpop.yesterday");
  return formatDate(d, locale, { day: "numeric", month: "short" });
}

/** Local clock time of the next UTC midnight (the daily caps reset there). */
function capResetTime(locale, now) {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return formatTime(d, locale);
}

function categoryLabel(t, category) {
  const tab = SHOP_CATEGORY_TABS.find((x) => x.id === category);
  return tab ? t(tab.label) : null;
}

/* ------------------------------------------------------------------ main */

/**
 * @param {object} props
 * @param {object} props.summary  `descoin:call-summary` payload
 * @param {"auto"|"desktop"|"sheet"} [props.variant]
 * @param {boolean} [props.preview]  static (settings preview / harness): no scrim, no focus trap
 * @param {number} [props.now]  frozen clock (tests, preview)
 */
export default function CallCoinSummary({
  summary,
  variant = "auto",
  preview = false,
  now: frozenNow,
  still: forcedStill,
  onClose,
  onBuy,
  onSpend,
  onWallet,
  onSettings,
  onNever,
}) {
  const t = useT();
  const { locale } = useLocale();
  const sheet = useNarrow(variant === "auto" ? null : variant);
  const still = forcedStill ?? (preview || prefersReducedMotion());
  const titleId = useId();
  const cardRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const [featured, setFeatured] = useState(summary?.featuredItem || null);
  useEffect(() => setFeatured(summary?.featuredItem || null), [summary]);

  const s = summary || {};
  const earned = Math.max(0, Number(s.earnedTotal) || 0);
  const now = useNow(Boolean(featured?.endsAt), frozenNow);
  const fractions = ringFractions(s);
  const todayLeft = Math.max(0, (s.todayCap || 400) - (s.todayEarned || 0));
  const fmt = (n) => formatNumber(Math.max(0, Math.round(Number(n) || 0)), locale);

  const heroValue = useCountUp(earned, { duration: 900, delay: 350, still });
  const voiceValue = useCountUp(s.earnedVoice || 0, { duration: 700, delay: 520, still });
  const screenValue = useCountUp(s.earnedScreenshare || 0, { duration: 700, delay: 580, still });

  const close = useCallback(() => {
    if (preview) return onClose?.();
    if (still) return onClose?.();
    setClosing(true);
    window.setTimeout(() => onClose?.(), 180);
  }, [onClose, preview, still]);

  // Escape closes; focus moves into the dialog and stays there (live popup only).
  useEffect(() => {
    if (preview) return undefined;
    const card = cardRef.current;
    const prev = typeof document !== "undefined" ? document.activeElement : null;
    const first = card?.querySelector("[data-autofocus]") || card?.querySelector("button");
    first?.focus?.({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !card) return;
      const nodes = [...card.querySelectorAll("button, a[href]")].filter((n) => !n.disabled);
      if (!nodes.length) return;
      const firstN = nodes[0];
      const lastN = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstN) {
        e.preventDefault();
        lastN.focus();
      } else if (!e.shiftKey && document.activeElement === lastN) {
        e.preventDefault();
        firstN.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
  }, [close, preview]);

  // Live stock / price: a shop change for this item (or a broad one) refreshes it.
  useEffect(() => {
    if (preview || !featured?.id || typeof window === "undefined") return undefined;
    let alive = true;
    const onChange = async (e) => {
      const changed = e?.detail?.itemId;
      if (changed && String(changed) !== String(featured.id)) return;
      try {
        const { getShopCatalog } = await import("../../api/shop.js");
        const res = await getShopCatalog({ fresh: true });
        const row = (res?.items || []).find((it) => String(it.id) === String(featured.id));
        if (!alive) return;
        if (!row || row.sold_out) {
          setFeatured((f) => (f ? { ...f, stockLeft: 0, soldOut: true } : f));
          return;
        }
        setFeatured((f) =>
          f
            ? {
                ...f,
                price: row.price_descoin,
                listPrice: Math.max(row.price_descoin, row.list_price_descoin || row.price_descoin),
                discountPct: row.discount_pct || 0,
                stockLeft: row.stock_left ?? null,
                affordable: (s.balance || 0) >= row.price_descoin,
              }
            : f
        );
      } catch {
        /* keep what we have */
      }
    };
    window.addEventListener("descall:shop-catalog-changed", onChange);
    return () => {
      alive = false;
      window.removeEventListener("descall:shop-catalog-changed", onChange);
    };
  }, [featured?.id, preview, s.balance]);

  const display = s.display || {};
  const ctxLabel = t(`coinpop.ctx.${s.context || "dm"}`);
  const kick =
    s.context === "server"
      ? t("coinpop.kick.server", { server: display.serverName || ctxLabel, channel: display.channelName || display.name || "" })
      : display.name
        ? t(`coinpop.kick.${s.context === "group" ? "group" : "dm"}`, { name: display.name })
        : t("coinpop.kick.plain");
  const durationText = fmtDuration(t, s.durationSec || 0);
  const talkMin = activeMinutes(s.talkSec || 0);
  const screenMin = activeMinutes(s.screenSec || 0);
  const timeRange =
    s.startedAt && s.endedAt
      ? t("coinpop.timeRange", {
          day: dayLabel(t, s.startedAt, locale, now),
          from: formatTime(new Date(s.startedAt), locale),
          to: formatTime(new Date(s.endedAt), locale),
        })
      : null;
  const peopleText =
    s.context === "server" && s.people ? t("coinpop.channelPeople", { n: s.people }) : s.context === "group" && s.people ? t("coinpop.people", { n: s.people }) : null;

  const warn = s.nearCap || null;
  const warnTitle = warn ? t(`coinpop.warn.${warn.kind}${warn.left > 0 ? "" : "Full"}`) : null;
  const warnBefore = warn ? Math.max(0, warn.earned - (warn.kind === "voice" ? s.earnedVoice || 0 : warn.kind === "screenshare" ? s.earnedScreenshare || 0 : earned)) : 0;

  const item = featured && !featured.soldOut ? featured : null;
  const itemLabel = item ? localizeShopItem({ id: item.id, sku: item.sku, name: item.name, description: item.description, category: item.category, country_code: item.countryCode }, locale).name : "";
  const countdown = item?.endsAt ? countdownParts(item.endsAt, now) : null;
  const countdownText = countdown ? (countdown.d > 0 ? t("coinpop.feat.days", { d: countdown.d, time: countdown.clock }) : countdown.clock) : null;
  const catText = item ? categoryLabel(t, item.category) : null;
  const balanceAfter = s.balance || 0;
  const affordable = item ? balanceAfter >= item.price : false;
  const missing = item ? Math.max(0, item.price - balanceAfter) : 0;
  const itemImg = item ? absoluteAssetUrl(item.imageUrl, API_BASE_URL) : null;

  const ringSize = sheet ? 168 : 184;
  const ringStroke = sheet ? 11 : 12;
  const coinSize = sheet ? 86 : 94;

  const cls = [
    "ccs-card",
    sheet ? "is-sheet" : "is-desk",
    still ? "is-still" : "is-anim",
    closing ? "is-closing" : "",
    preview ? "is-preview" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const card = (
    <section
      ref={cardRef}
      className={cls}
      role={preview ? undefined : "dialog"}
      aria-modal={preview ? undefined : "true"}
      aria-labelledby={titleId}
      lang={locale}
      data-context={s.context}
    >
      {sheet ? <div className="ccs-grab" aria-hidden="true" /> : null}
      {!sheet ? (
        <button type="button" className="ccs-x" onClick={close} aria-label={t("coinpop.close")} data-autofocus>
          <CcsIcon name="x" size={15} />
        </button>
      ) : null}

      <div className="ccs-scroll">
        {/* 1. hero */}
        <div className="ccs-top">
          <div className="ccs-ringw" style={{ width: ringSize, height: ringSize }}>
            <Ring size={ringSize} stroke={ringStroke} fractions={fractions} />
            <span className="ccs-coin3d">
              <CoinArt size={coinSize} className="ccs-coin" />
            </span>
          </div>
          <div className="ccs-head">
            <div className="ccs-kick" id={titleId}>
              {s.context === "server" ? <CcsIcon name="volume" size={13} /> : null}
              <span>{kick}</span>
            </div>
            <div className="ccs-ctx">
              <Avatar url={display.avatarUrl} name={display.serverName || display.name} square={s.context !== "dm"} />
              <span className="ccs-chip">
                <CcsIcon name={s.context === "server" ? "volume" : s.context === "group" ? "users" : "phone"} size={12} />
                {ctxLabel}
              </span>
              {s.screenShared ? (
                <span className="ccs-chip is-violet">
                  <CcsIcon name="screen" size={12} />
                  {t("coinpop.screenShared")}
                </span>
              ) : null}
              {timeRange ? <span className="ccs-range num">{timeRange}</span> : null}
            </div>
            <h2 className="ccs-amt">
              <b className="ccs-gold num">+{fmt(heroValue)}</b>
              <span>{t("coinpop.unit")}</span>
            </h2>
            <div className="ccs-meta">
              <CcsIcon name="clock" size={14} />
              {sheet ? (
                <span>{t(s.context === "server" ? "coinpop.spentChannel" : "coinpop.spentCall", { duration: durationText })}</span>
              ) : (
                <>
                  <span className="num">{durationText}</span>
                  {talkMin > 0 ? (
                    <>
                      <span className="ccs-dot" aria-hidden="true">·</span>
                      <CcsIcon name="mic" size={14} />
                      <span className="num">{t("coinpop.talkMeta", { m: talkMin })}</span>
                    </>
                  ) : null}
                  {peopleText ? (
                    <>
                      <span className="ccs-dot" aria-hidden="true">·</span>
                      <span>{peopleText}</span>
                    </>
                  ) : null}
                </>
              )}
            </div>
            <div className="ccs-lg">
              <span className="ccs-lg-title">
                {t("coinpop.legend.title")}{" "}
                <b className="num">
                  {fmt(s.todayEarned)}
                  <em> / {fmt(s.todayCap || 400)}</em>
                </b>
              </span>
              <span>
                <i className="is-before" />
                {t("coinpop.legend.before", { n: fmt(s.todayBefore) })}
              </span>
              <span>
                <i className="is-call" />
                {t("coinpop.legend.call", { n: fmt(earned) })}
              </span>
              <span>
                <i className="is-left" />
                {t("coinpop.legend.left", { n: fmt(todayLeft) })}
              </span>
            </div>
          </div>
        </div>

        {/* 2. receipt rows */}
        <div className="ccs-perf" aria-hidden="true" />
        <ul className="ccs-rows" aria-label={t("coinpop.rows.label")}>
          {(s.earnedVoice || 0) > 0 ? (
            <li className="ccs-li" style={{ "--i": 0 }}>
              <span className="ccs-li-ic is-blue">
                <CcsIcon name="mic" size={15} />
              </span>
              <span className="ccs-li-t">
                <b>{t("coinpop.rows.voice")}</b>
                <small>{t("coinpop.rows.voiceSub", { n: talkMin })}</small>
              </span>
              <em className="num">+{fmt(voiceValue)}</em>
            </li>
          ) : null}
          {(s.earnedScreenshare || 0) > 0 ? (
            <li className="ccs-li" style={{ "--i": 1 }}>
              <span className="ccs-li-ic is-violet">
                <CcsIcon name="screen" size={15} />
              </span>
              <span className="ccs-li-t">
                <b>{t("coinpop.rows.screen")}</b>
                <small>{t("coinpop.rows.screenSub", { n: screenMin })}</small>
              </span>
              <em className="num">+{fmt(screenValue)}</em>
            </li>
          ) : null}
          {s.hourCapReached ? (
            <li className="ccs-li ccs-li-note" style={{ "--i": 2 }}>
              <span className="ccs-li-ic is-amber">
                <CcsIcon name="timer" size={15} />
              </span>
              <span className="ccs-li-t">
                <small>{t("coinpop.rows.hourCap")}</small>
              </span>
            </li>
          ) : null}
        </ul>

        {/* 3. balance + streak */}
        <div className="ccs-bb">
          <div className="ccs-bb-old">
            <small>{t("coinpop.balance.before")}</small>
            <b className="num">{fmt(s.balanceBefore)}</b>
          </div>
          <span className="ccs-bb-ar" aria-hidden="true">
            <CcsIcon name="arrow" size={18} />
          </span>
          <div className="ccs-bb-new">
            <small>{t("coinpop.balance.after")}</small>
            <b className="num">{fmt(balanceAfter)}</b>
          </div>
          <div className="ccs-bb-streak">
            <small>{t(sheet ? "coinpop.streak.short" : "coinpop.streak.label")}</small>
            <b className="num">
              {fmt(Math.max(1, s.streakDays || 1))}
              <em> {t(sheet ? "coinpop.streak.shortDays" : "coinpop.streak.days", { n: Math.max(1, s.streakDays || 1) }).replace(/^\s*[\d.,\s]+/, "")}</em>
            </b>
          </div>
        </div>

        {/* 4. near-cap warning */}
        {warn ? (
          <div className="ccs-warn" role="status">
            <div className="ccs-warn-t">
              <CcsIcon name="alert" size={14} />
              <span>{warnTitle}</span>
              <b className="num">
                {fmt(warn.earned)} / {fmt(warn.cap)}
              </b>
            </div>
            <div className="ccs-bar" aria-hidden="true">
              <i className="is-before" style={{ width: `${(Math.min(warnBefore, warn.cap) / warn.cap) * 100}%` }} />
              <i className="is-call" style={{ width: `${(Math.max(0, Math.min(warn.earned, warn.cap) - Math.min(warnBefore, warn.cap)) / warn.cap) * 100}%` }} />
            </div>
            <small>
              {warn.left > 0 ? t("coinpop.warn.more", { n: fmt(warn.left) }) : t("coinpop.warn.none")} · {t("coinpop.warn.reset", { time: capResetTime(locale, now) })}
            </small>
          </div>
        ) : null}

        {/* 5. featured item */}
        {item ? (
          <div className="ccs-feat" aria-label={t("coinpop.feat.label")}>
            <span className="ccs-thumb">
              {itemImg ? <img src={itemImg} alt="" loading="lazy" /> : <CoinArt size={56} />}
              {item.discountPct > 0 ? <span className="ccs-badge num">{t("coinpop.feat.discount", { n: item.discountPct })}</span> : null}
            </span>
            <div className="ccs-feat-i">
              <div className="ccs-feat-t1">
                <span className="ccs-chip is-gold">
                  <CcsIcon name="sparkle" size={11} />
                  {t("coinpop.feat.featured")}
                </span>
                {item.stockLeft != null ? (
                  <span className="ccs-chip is-amber">
                    <CcsIcon name="box" size={11} />
                    <span className="num">{t("coinpop.feat.stockLeft", { n: fmt(item.stockLeft) })}</span>
                  </span>
                ) : null}
              </div>
              <h3>{itemLabel}</h3>
              <div className="ccs-feat-m">
                {catText ? <span className="ccs-chip">{catText}</span> : null}
                {countdownText ? (
                  <span className="ccs-chip is-red" aria-label={t("coinpop.feat.endsIn", { time: countdownText })}>
                    <CcsIcon name="timer" size={11} />
                    <span className="num">{countdownText}</span>
                  </span>
                ) : null}
              </div>
              <div className="ccs-pr">
                {item.listPrice > item.price ? (
                  <s className="num" aria-label={t("coinpop.feat.oldPrice", { n: fmt(item.listPrice) })}>
                    {fmt(item.listPrice)}
                  </s>
                ) : null}
                <b>
                  <MiniCoin size={18} />
                  <span className="num">{fmt(item.price)}</span>
                </b>
                {!sheet ? (
                  affordable ? (
                    <span className="ccs-ok">
                      <CcsIcon name="check" size={12} />
                      {t("coinpop.feat.enough")}
                    </span>
                  ) : (
                    <span className="ccs-short num">{t("coinpop.feat.short", { n: fmt(missing) })}</span>
                  )
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="ccs-row">
          {item ? (
            <>
              <button type="button" className="ccs-btn is-gold" onClick={() => onBuy?.(item, s)}>
                <CcsIcon name="tag" size={16} />
                <span className="num">{t(sheet ? "coinpop.btn.buyShort" : "coinpop.btn.buyNow", { n: fmt(item.price) })}</span>
              </button>
              <button type="button" className="ccs-btn is-blue" onClick={() => onSpend?.(item, s)}>
                <CcsIcon name="bag" size={16} />
                {t("coinpop.btn.spend")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ccs-btn is-blue" onClick={() => onSpend?.(null, s)}>
                <CcsIcon name="bag" size={16} />
                {t("coinpop.btn.spend")}
              </button>
              <button type="button" className="ccs-btn" onClick={() => onWallet?.(s)}>
                <CcsIcon name="list" size={16} />
                {t("coinpop.btn.wallet")}
              </button>
            </>
          )}
        </div>

        {/* 6. footer */}
        <div className="ccs-ft">
          <button type="button" className="ccs-link is-muted" onClick={() => onWallet?.(s)}>
            {t(sheet ? "coinpop.foot.receiptShort" : "coinpop.foot.receipt", { id: s.receipt || "" })}
          </button>
          <span className="ccs-ft-r">
            <button type="button" className="ccs-link" onClick={() => onSettings?.(s)}>
              {t("coinpop.foot.settings")}
            </button>
            <span className="ccs-dot" aria-hidden="true">·</span>
            <button type="button" className="ccs-link" onClick={() => onNever?.(s)}>
              {t("coinpop.foot.never")}
            </button>
          </span>
        </div>
      </div>
    </section>
  );

  if (preview) return card;
  return (
    <div
      className={`ccs-scrim${sheet ? " is-sheet" : ""}${closing ? " is-closing" : ""}${still ? " is-still" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {card}
    </div>
  );
}

/** Sample payload for the settings preview and "play a sample". */
export function sampleCallCoinSummary(t, { now = Date.now() } = {}) {
  const ended = now;
  const started = ended - (38 * 60 + 12) * 1000;
  return {
    v: 1,
    sessionId: `sample-${ended}`,
    receipt: "DC-7F3A",
    context: "dm",
    origin: "self",
    sample: true,
    display: { id: "sample", name: t("coinpop.settings.sampleName"), avatarUrl: null },
    people: 2,
    startedAt: new Date(started).toISOString(),
    endedAt: new Date(ended).toISOString(),
    durationSec: 38 * 60 + 12,
    talkSec: 26 * 60,
    screenSec: 8 * 60,
    screenShared: true,
    earnedVoice: 26,
    earnedScreenshare: 16,
    earnedTotal: 42,
    balance: 1284,
    balanceBefore: 1242,
    todayEarned: 254,
    todayBefore: 212,
    todayCap: 400,
    streakDays: 4,
    nearCap: { kind: "voice", earned: 172, cap: 180, left: 8 },
    hourCapReached: false,
    featuredItem: {
      id: "sample-item",
      name: t("coinpop.settings.sampleItem"),
      category: "avatar_effect",
      imageUrl: null,
      price: 600,
      listPrice: 800,
      discountPct: 25,
      stockLeft: 14,
      endsAt: new Date(now + (5 * 3600 + 12 * 60 + 44) * 1000).toISOString(),
      kind: "sale",
      affordable: true,
    },
  };
}

export function useSampleSummary(t, now) {
  return useMemo(() => sampleCallCoinSummary(t, { now }), [t, now]);
}
