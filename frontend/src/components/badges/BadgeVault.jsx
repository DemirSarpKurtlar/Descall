// Badge vault (approved mockup 2026-10-26, /workspace/ui-special-badges/popup): the "+" next to
// the worn badge on the full profile opens every badge the person owns. Desktop: a second
// dialog stacked over the profile card. iPhone: a second bottom sheet. Others see it read-only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus, X, Check, ChevronDown, Lock, Gift } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { CountryBadge, CountryFlag } from "../shop/CountryFlag";
import { SpecialBadgeIcon, TIER_ORDER, ART_BY_ID, tierPalette } from "./specialBadgeArt.jsx";
import { SpecialBadgeChip, useBadgeCopy } from "./SpecialBadge.jsx";
import {
  BADGE_TOTAL, equipMine, equippedFor, formatSerial, holdersOf, loadCatalog, loadUserBadges,
  sortOwned, useSpecialBadgeStore, userBadgesState,
} from "../../lib/specialBadges";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticSelection, hapticSuccess } from "../../lib/fluid/haptics";
import { openPromoRedeem } from "../../lib/promoBus";
import { showBadgeToast } from "./BadgeToast.jsx";

const idOf = (u) => u?.id || u?._id || null;
const sameId = (a, b) => Boolean(a && b && String(a) === String(b));
const nameOfUser = (u) => u?.displayName || u?.display_name || u?.username || "";

/** Turkish genitive with apostrophe: Mert'in, Ayşe'nin, Oğuz'un, Gül'ün. */
export function possessiveTr(n) {
  const s = String(n || "");
  const low = s.toLocaleLowerCase("tr");
  const m = [...low].reverse().find((c) => "aeıioöuü".includes(c)) || "e";
  const v = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" }[m];
  const endsV = "aeıioöuü".includes(low.slice(-1));
  return `${s}'${endsV ? "n" : ""}${v}n`;
}

/** "{a} rozetten {n} tanesi sende" with {n} in bold. */
function Rich({ text, bold }) {
  const parts = String(text).split(/(\u0000)/);
  return <>{parts.map((p, i) => (p === "\u0000" ? <b key={i} className="tnum">{bold}</b> : <span key={i}>{p}</span>))}</>;
}

function useOwned(userId) {
  useSpecialBadgeStore();
  useEffect(() => {
    if (!userId) return;
    loadUserBadges(userId).catch(() => {});
    loadCatalog().catch(() => {});
  }, [userId]);
  return userBadgesState(userId);
}

/**
 * Profile row: country badge, the one worn special badge, and the "+" that opens the vault.
 * Others' profiles hide "+" when they own nothing; your own always shows it (empty state).
 */
export function ProfileBadgeRow({ user, me, size = "md", trailing = null, className = "" }) {
  const { t } = useBadgeCopy();
  const userId = idOf(user);
  const self = sameId(userId, idOf(me));
  const { data } = useOwned(userId);
  const [open, setOpen] = useState(false);
  const eq = equippedFor(user);
  const count = data?.badges?.length || 0;
  const showPlus = self || count > 0;
  const hasCountry = Boolean(user?.equippedCountry);
  if (!hasCountry && !eq && !showPlus && !trailing) return null;
  return (
    <span className={`bp-row bp-row-${size}${className ? ` ${className}` : ""}`}>
      <CountryBadge user={user} special={false} />
      {eq ? <SpecialBadgeChip id={eq.id} /> : null}
      {showPlus ? (
        <button
          type="button"
          className="bp-plus"
          onClick={(e) => { e.stopPropagation(); hapticSelection(); setOpen(true); }}
          aria-label={count ? t("badges.allBadgesN", { n: count }) : t("badges.badges")}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Plus size={13} strokeWidth={2.4} />
          <span className="bp-tip" aria-hidden="true">{t("badges.allBadges")}{count ? <span className="bp-tip-n tnum">{count}</span> : null}</span>
        </button>
      ) : null}
      {trailing}
      <AnimatePresence>
        {open ? <BadgeVault key="vault" user={user} me={me} self={self} variant={size === "ios" ? "sheet" : "desk"} onClose={() => setOpen(false)} /> : null}
      </AnimatePresence>
    </span>
  );
}

function shortDate(iso, locale) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
}

function Hero({ me, self, sel, eq, myBadges, onEquip, busy, phone }) {
  const { t, locale, name, desc, tierLabel, num } = useBadgeCopy();
  const tier = ART_BY_ID[sel.id].tier;
  const pal = tierPalette(sel.id);
  const isEq = eq === sel.id;
  const mine = !self ? myBadges?.find((x) => x.id === sel.id) : null;
  const holders = holdersOf(sel.id);
  const giver = sel.via === "promo" ? t("badges.viaPromo")
    : !sel.grantedBy ? t("badges.viaTeam")
      : sameId(sel.grantedBy.id, idOf(me)) ? t("badges.viaYou")
        : t("badges.viaBy", { name: sel.grantedBy.displayName || sel.grantedBy.username });
  const now = new Date().toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <section className={`bp-hero t-${tier}`} style={{ "--bp-glow": pal.glow }} aria-live="polite">
      <div className="bp-hero-art"><SpecialBadgeIcon id={sel.id} size={phone ? 72 : 84} /></div>
      <div className="bp-hero-copy">
        <div className="bp-hero-title">
          <h3>{name(sel.id)}</h3>
          <span className={`sb-tier-pill t-${tier}`}>{tierLabel(tier)}</span>
        </div>
        <p className="bp-hero-how">{desc(sel.id)}</p>
        <dl className="bp-hero-meta">
          <div><dt>{t("badges.serial")}</dt><dd className="bp-mono">{formatSerial(sel.serial)}</dd></div>
          {holders != null ? <div><dt>{t("badges.holders")}</dt><dd className="tnum">{t("badges.holdersN", { n: num(holders) })}</dd></div> : null}
          <div><dt>{self ? t("badges.gotSelf") : t("badges.gotOther")}</dt><dd>{shortDate(sel.grantedAt, locale)}</dd></div>
          <div><dt>{t("badges.from")}</dt><dd>{giver}</dd></div>
        </dl>
      </div>
      <div className="bp-hero-act">
        {self ? (isEq ? (
          <>
            <span className="bp-eq-state"><Check size={14} strokeWidth={2.4} /> {t("badges.wearing")}</span>
            <button type="button" className="bp-btn is-ghost" disabled={busy} onClick={() => onEquip(null)}>{t("badges.unequip")}</button>
          </>
        ) : (
          <>
            <button type="button" className="bp-btn is-brand" disabled={busy} onClick={() => onEquip(sel.id)}>{t("badges.equip")}</button>
            {eq ? <span className="bp-act-hint">{t("badges.replaces", { name: name(eq) })}</span> : null}
          </>
        )) : (
          <>
            {isEq ? <span className="bp-eq-state"><Check size={14} strokeWidth={2.4} /> {t("badges.wearingOther")}</span> : null}
            {mine ? <span className="bp-act-hint is-pos">{t("badges.alsoYours", { serial: "\u0001" }).split("\u0001")[0]}<b className="bp-mono">{formatSerial(mine.serial)}</b>{t("badges.alsoYours", { serial: "\u0001" }).split("\u0001")[1]}</span> : null}
          </>
        )}
      </div>
      {self && !isEq && me ? (
        <div className="bp-preview" aria-label={t("badges.previewAria")}>
          <span className="bp-preview-k">{t("badges.previewK")}</span>
          <Avatar name={nameOfUser(me)} size={22} user={me} animate="none" />
          <b>{nameOfUser(me)}</b>
          {me.equippedCountry ? <CountryFlag item={me.equippedCountry} size={14} decorative /> : null}
          <SpecialBadgeIcon id={sel.id} size={17} />
          <span className="bp-preview-time tnum">{t("badges.today", { time: now })}</span>
          <span className="bp-preview-msg">{t("badges.previewMsg")}</span>
        </div>
      ) : null}
    </section>
  );
}

function Tile({ it, eq, selId, onSelect }) {
  const { t, name, tierLabel } = useBadgeCopy();
  const tier = ART_BY_ID[it.id].tier;
  const isEq = eq === it.id, isSel = selId === it.id;
  const label = t(isEq ? "badges.tileAriaOn" : "badges.tileAria", { name: name(it.id), tier: tierLabel(tier), serial: formatSerial(it.serial) });
  return (
    <button type="button" className={`bp-tile${isEq ? " is-eq" : ""}${isSel ? " is-sel" : ""}`} aria-pressed={isSel} aria-label={label}
      onClick={() => { if (!isSel) hapticSelection(); onSelect(it.id); }}>
      {isEq ? <span className="bp-tile-eq" aria-hidden="true"><Check size={10} strokeWidth={3.2} />{t("badges.wearing")}</span> : null}
      <SpecialBadgeIcon id={it.id} size={52} />
      <b className="bp-tile-name">{name(it.id)}</b>
      <span className="bp-tile-meta" aria-hidden="true"><span className={`bp-dot t-${tier}`} />{tierLabel(tier)}<span className="bp-mono">{formatSerial(it.serial)}</span></span>
    </button>
  );
}

function SortMenu({ value, onChange }) {
  const { t } = useBadgeCopy();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", close, true); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  const opts = [["tier", t("badges.sortTier")], ["new", t("badges.sortNew")], ["name", t("badges.sortName")]];
  return (
    <div className="bp-sort-wrap" ref={ref}>
      <button type="button" className="bp-sort" aria-haspopup="listbox" aria-expanded={open} aria-label={`${t("badges.sortLabel")}: ${opts.find((o) => o[0] === value)[1]}`} onClick={() => setOpen((v) => !v)}>
        {opts.find((o) => o[0] === value)[1]} <ChevronDown size={13} />
      </button>
      {open ? (
        <ul className="bp-sort-menu" role="listbox" aria-label={t("badges.sortLabel")}>
          {opts.map(([k, label]) => (
            <li key={k} role="option" aria-selected={value === k}>
              <button type="button" onClick={() => { onChange(k); setOpen(false); }}>{label}{value === k ? <Check size={13} /> : null}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Filters({ list, tier, onTier, sort, onSort }) {
  const { t, tierLabel } = useBadgeCopy();
  const counts = TIER_ORDER.map((x) => [x, list.filter((b) => ART_BY_ID[b.id].tier === x).length]).filter(([, n]) => n > 0);
  return (
    <div className="bp-tools">
      <div className="bp-seg" role="tablist" aria-label={t("badges.rarity")}>
        <button type="button" role="tab" aria-selected={tier === "all"} className={tier === "all" ? "on" : ""} onClick={() => onTier("all")}>{t("badges.all")} <span className="tnum">{list.length}</span></button>
        {counts.map(([x, n]) => (
          <button type="button" role="tab" key={x} aria-selected={tier === x} className={tier === x ? "on" : ""} onClick={() => onTier(x)}>{tierLabel(x)} <span className="tnum">{n}</span></button>
        ))}
      </div>
      <SortMenu value={sort} onChange={onSort} />
    </div>
  );
}

function Empty({ self, user, onUseCode }) {
  const { t } = useBadgeCopy();
  return (
    <div className="bp-empty">
      <div className="bp-empty-art" aria-hidden="true">
        {["og", "facebook", "ekim29"].map((id) => <SpecialBadgeIcon key={id} id={id} size={44} />)}
      </div>
      <h3>{self ? t("badges.emptySelf") : t("badges.emptyOther", { name: nameOfUser(user) })}</h3>
      <p>{self ? t("badges.emptySelfBody") : t("badges.emptyOtherBody")}</p>
      {self ? <button type="button" className="bp-btn is-ghost" onClick={onUseCode}><Gift size={14} /> {t("badges.useCode")}</button> : null}
    </div>
  );
}

export function BadgeVault({ user, me, self, variant = "desk", onClose }) {
  const { t, locale, name } = useBadgeCopy();
  const reduce = useReducedMotion();
  const userId = idOf(user);
  const { data, error } = useOwned(userId);
  const mine = useOwned(self ? null : idOf(me)).data;
  const [tier, setTier] = useState("all");
  const [sort, setSort] = useState("tier");
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const phone = variant === "sheet";
  const all = useMemo(() => sortOwned(data?.badges || [], sort, name), [data, sort, name]);
  const list = tier === "all" ? all : all.filter((b) => ART_BY_ID[b.id].tier === tier);
  const eq = data ? (data.equipped || null) : (equippedFor(user)?.id || null);
  const sel = list.find((x) => x.id === selId) || list.find((x) => x.id === eq) || list[0] || null;
  const who = nameOfUser(user);
  const close = useCallback(() => onClose?.(), [onClose]);
  const dialogRef = useRef(null);

  // Stack: the profile card behind steps back while the vault is open.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("bp-stacked");
    return () => el.classList.remove("bp-stacked");
  }, []);
  // Esc closes only the vault (capture beats the profile modal's own Esc listener).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);
  // Focus the dialog on open; give focus back to the "+" on close.
  useEffect(() => {
    const prev = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });
    return () => { if (prev && typeof prev.focus === "function") prev.focus({ preventScroll: true }); };
  }, []);

  const equip = async (badgeId) => {
    if (!self || busy) return;
    const before = eq;
    setBusy(true);
    try {
      await equipMine(userId, badgeId);
      hapticSuccess();
      const shown = badgeId || before;
      showBadgeToast({
        id: shown,
        text: badgeId ? t("badges.toastOn", { name: name(badgeId) }) : t("badges.toastOff", { name: name(before) }),
        undo: async () => { try { await equipMine(userId, before); } catch { showBadgeToast({ text: t("badges.errEquip"), tone: "err" }); } },
      });
    } catch {
      showBadgeToast({ text: t("badges.errEquip"), tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const total = BADGE_TOTAL;
  const count = data?.badges?.length || 0;
  const countText = count
    ? t(self ? "badges.countSelf" : "badges.countOther", { total, n: "\u0000" })
    : t("badges.countNone", { total });
  const title = self ? t("badges.titleSelf") : t("badges.titleOther", { owner: locale === "tr" ? possessiveTr(who) : `${who}'s` });
  const enter = reduce ? { opacity: 0 } : phone ? { y: "100%" } : { opacity: 0, scale: 0.96, filter: "blur(8px)" };
  const shown = reduce ? { opacity: 1 } : phone ? { y: 0 } : { opacity: 1, scale: 1, filter: "blur(0px)" };
  const exit = reduce ? { opacity: 0 } : phone ? { y: "100%" } : { opacity: 0, scale: 0.97, filter: "blur(6px)" };
  const trans = reduce ? REDUCED_MOTION_FADE : framerSpring(phone ? SPRINGS.sheet : SPRINGS.materialize);

  const body = (
    <motion.div
      ref={dialogRef}
      tabIndex={-1}
      className={`bp-pop${phone ? " is-sheet" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bp-title"
      onClick={(e) => e.stopPropagation()}
      initial={enter}
      animate={shown}
      exit={exit}
      transition={trans}
    >
      {phone ? <SheetGrabber onClose={close} label={t("badges.close")} /> : null}
      <header className="bp-head">
        <div>
          <h2 id="bp-title">{title}</h2>
          <p className="tnum">{count ? <Rich text={countText} bold={count} /> : countText}</p>
        </div>
        <button type="button" className="bp-x" aria-label={t("badges.close")} onClick={close}><X size={16} /></button>
      </header>
      {!data && !error ? <div className="bp-loading" role="status" aria-label={t("badges.loading")}><span /><span /><span /></div> : null}
      {error && !data ? (
        <div className="bp-empty"><p>{t("badges.errLoad")}</p><button type="button" className="bp-btn is-ghost" onClick={() => loadUserBadges(userId, { fresh: true }).catch(() => {})}>{t("badges.retry")}</button></div>
      ) : null}
      {data && count === 0 ? <Empty self={self} user={user} onUseCode={() => { close(); openPromoRedeem(); }} /> : null}
      {data && count > 0 && sel ? (
        <div className="bp-scroll">
          <Hero me={me} self={self} sel={sel} eq={eq} myBadges={mine?.badges} onEquip={equip} busy={busy} phone={phone} />
          <Filters list={all} tier={tier} onTier={(x) => { setTier(x); setSelId(null); }} sort={sort} onSort={setSort} />
          <div className="bp-grid">{list.map((it) => <Tile key={it.id} it={it} eq={eq} selId={sel.id} onSelect={setSelId} />)}</div>
          <p className="bp-foot"><Lock size={12} /> {self ? t("badges.footSelf") : t("badges.footOther")}</p>
        </div>
      ) : null}
      {phone && self && sel ? (
        <div className="bp-sheet-bar">
          {sel.id !== eq ? (
            <button type="button" className="bp-btn is-brand is-wide" disabled={busy} onClick={() => equip(sel.id)}>
              <SpecialBadgeIcon id={sel.id} size={18} /> {t("badges.wearNamed", { name: name(sel.id) })}
            </button>
          ) : (
            <button type="button" className="bp-btn is-ghost is-wide" disabled={busy} onClick={() => equip(null)}>
              {t("badges.takeOffNamed", { name: name(sel.id) })}
            </button>
          )}
        </div>
      ) : null}
    </motion.div>
  );
  return createPortal(
    <motion.div
      className={`bp-scrim${phone ? " is-sheet" : ""}`}
      onClick={(e) => { e.stopPropagation(); close(); }}
      onPointerDown={(e) => e.stopPropagation()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduce ? REDUCED_MOTION_FADE : { duration: 0.2 }}
    >
      {body}
    </motion.div>,
    document.body,
  );
}

/** Grabber: drag down (or tap) to close the sheet. */
function SheetGrabber({ onClose, label }) {
  const start = useRef(null);
  return (
    <div
      className="bp-grabber-hit"
      role="button"
      tabIndex={-1}
      aria-label={label}
      onClick={onClose}
      onPointerDown={(e) => { start.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); }}
      onPointerUp={(e) => { if (start.current != null && e.clientY - start.current > 60) onClose(); start.current = null; }}
    >
      <div className="bp-grabber" aria-hidden="true" />
    </div>
  );
}
