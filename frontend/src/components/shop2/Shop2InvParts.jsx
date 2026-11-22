// Inventory "Stüdyo" pieces (owner pick, draft A, 22 Nov 2026): live preview with before /
// after, where-it-shows mini previews, palette score, saved look tiles, slot rail, item
// cards and rows, equip history rows, the "Değişiklik denemede" bar and the opaque menu.
// State lives in Shop2Inventory.jsx; these only draw and call back.
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import { cssUrl } from "../../lib/cssUrl";
import { rarityOf } from "../../lib/shop2Logic.js";
import { ageOf } from "../../lib/shop2Inventory.js";
import { Layer, Ring } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { assetSrc, BeforeAfter, displayNameOf, S2Avatar, S2ChatMessage, S2MemberRow, S2Name, S2ProfileCard, S2VoiceTile } from "./Shop2Preview.jsx";
import {
  ArrowRight,
  Bookmark,
  Check,
  Clock,
  Eye,
  Gift,
  Lock,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Split,
  Trash2,
  Undo2,
  Users,
  Wand2,
  X,
} from "./shop2Icons.jsx";

export const RARITY_COLOR = { common: "#aab3cc", rare: "#6d8cff", epic: "#b98bff", legendary: "#ffc94d", mythic: "#ff7ab6" };

/** "21:42", "Dün", "3 gün": history and look times. */
export function useStamp() {
  const { t, locale } = useLocale();
  return (at, now = Date.now()) => {
    if (!at) return "";
    const d = new Date(at);
    const today = new Date(now);
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    const y = new Date(now - 86_400_000);
    if (d.toDateString() === y.toDateString()) return t("shop2.inv.yesterday");
    return t("shop2.inv.daysAgo", { n: Math.max(2, Math.round((now - at) / 86_400_000)) });
  };
}

export function useAge() {
  const { t } = useLocale();
  return (at) => {
    const a = ageOf(at);
    return a ? t(`shop2.inv.age.${a.unit}`, { n: a.n }) : "";
  };
}

/** Small opaque popover menu (sort, set filter, slot locks, look options). */
export function Menu({ label, button, children, align = "right", className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", off);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  return (
    <span className={`s2-iv-menu ${className}`.trim()} ref={ref}>
      {button({ open, toggle: () => setOpen((o) => !o), props: { "aria-haspopup": "menu", "aria-expanded": open, "aria-label": label } })}
      {open ? (
        <span className={`s2-iv-pop is-${align}`} role="menu" aria-label={label}>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </span>
      ) : null}
    </span>
  );
}

export function MenuItem({ on = false, icon: Icon, children, onClick, danger = false }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} className={`s2-iv-mi${on ? " is-on" : ""}${danger ? " is-danger" : ""}`} onClick={onClick}>
      {Icon ? <Icon size={14} /> : <span className="s2-iv-mi-dot" />}
      <span>{children}</span>
      {on ? <Check size={13} className="s2-iv-mi-check" /> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Preview.

/** Phone screen with the profile as friends see it on a phone (status bar, banner, chat). */
export function PhoneMock({ user, big = false }) {
  const { t, locale } = useLocale();
  const banner = assetSrc(user?.equippedBanner) || user?.bannerUrl || null;
  const name = displayNameOf(user, t("shop2.preview.you"));
  const time = new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`s2-iv-phone${big ? " is-big" : ""}`}>
      <div className="s2-iv-phone-screen">
        <div className="s2-iv-phone-status" aria-hidden="true"><b>{time}</b><i /><span><i /><i /><i /></span></div>
        <div className="s2-iv-phone-ban" style={banner ? { backgroundImage: cssUrl(banner) } : undefined} />
        <div className="s2-iv-phone-body">
          <S2Avatar user={user} size={big ? 62 : 46} status="online" className="s2-iv-phone-av" />
          <div className="s2-iv-phone-name"><S2Name user={user}>{name}</S2Name></div>
          <small className="s2-iv-phone-handle">@{String(user?.username || "descall").toLowerCase()} · {t("shop2.preview.online")}</small>
          <div className="s2-iv-phone-btns" aria-hidden="true">
            <span className="is-pri"><MessageCircle size={10} />{t("shop2.inv.msgBtn")}</span>
            <span><Users size={10} />{t("shop2.inv.friendBtn")}</span>
          </div>
          <div className="s2-iv-phone-about">
            <span>{t("shop2.preview.about")}</span>
            <p>{user?.bio || t("shop2.preview.aboutSample")}</p>
          </div>
          <div className="s2-iv-phone-chat">
            <span className="s2-iv-phone-q">{t("shop2.sample.chat1")}</span>
            <span className="s2-iv-phone-a">{t("shop2.inv.chatLine")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "ÖNCE / SONRA" chips: from -> to art per changed slot. */
export function DiffChips({ changes, itemFor, compact = false }) {
  const { t } = useLocale();
  if (!changes.length) return null;
  return (
    <div className={`s2-iv-diff${compact ? " is-compact" : ""}`}>
      <span className="s2-eyebrow"><Split size={12} />{t("shop2.inv.diff")}</span>
      {changes.map((c) => (
        <span key={c.category} className="s2-iv-diff-chip">
          <ArtOrEmpty item={itemFor(c.from, c.category, true)} size="chip" />
          <ArrowRight size={12} className="s2-iv-arrow" />
          <ArtOrEmpty item={itemFor(c.to, c.category)} size="chip" />
          <b>{t(`shop2.inv.slot.${c.category}`)}</b>
        </span>
      ))}
    </div>
  );
}

function ArtOrEmpty({ item, size = "chip" }) {
  return item ? <Shop2Art item={item} size={size} /> : <span className={`s2-art is-${size} is-empty s2-iv-none`} aria-hidden="true"><X size={10} /></span>;
}

export function PaletteRing({ value, size = 50 }) {
  const { t } = useLocale();
  return (
    <span className="s2-iv-ring" style={{ "--v": value, "--sz": `${size}px` }}>
      <b className="s2-num">{value}</b>
      {size >= 44 ? <small>{t("shop2.inv.scoreLabel")}</small> : null}
    </span>
  );
}

/** "Palet uyumu": score ring, worn colours (the one off the palette outlined), hint, fix. */
export function PaletteBar({ report, nameOf, setNameOf, onFix, compact = false }) {
  const { t } = useLocale();
  if (!report) {
    return (
      <div className={`s2-iv-harm is-none${compact ? " is-compact" : ""}`}>
        <span className="s2-iv-harm-ico"><Palette size={16} /></span>
        <p className="s2-muted">{t("shop2.inv.paletteNone")}</p>
      </div>
    );
  }
  const set = setNameOf(report.setKey);
  const text = report.weakest
    ? report.suggestion
      ? t(compact ? "shop2.inv.paletteOffShort" : "shop2.inv.paletteOff", { item: nameOf(report.weakest.item), set, better: nameOf(report.suggestion.item), n: report.suggestion.score })
      : t("shop2.inv.paletteOffNoFix", { item: nameOf(report.weakest.item), set })
    : t("shop2.inv.paletteGood", { set });
  return (
    <div className={`s2-iv-harm${compact ? " is-compact" : ""}${report.weakest ? " is-off" : " is-good"}`}>
      <PaletteRing value={report.score} size={compact ? 38 : 50} />
      <div className="s2-iv-harm-b">
        <div className="s2-iv-harm-t">
          {!compact ? <Palette size={14} /> : null}
          <b>{t("shop2.inv.palette")}</b>
          {!compact ? (
            <span className="s2-iv-sw" aria-hidden="true">
              {report.swatches.map((s) => <i key={s.category} className={s.off ? "is-off" : ""} style={{ background: s.color }} />)}
            </span>
          ) : null}
        </div>
        <p>{text}</p>
      </div>
      {report.suggestion ? (
        <button type="button" className="s2-btn is-sm s2-iv-fix" onClick={onFix}>
          {!compact ? <Wand2 size={14} /> : null}
          {t(compact ? "shop2.inv.fixShort" : "shop2.inv.fix")}
        </button>
      ) : null}
    </div>
  );
}

/** The whole desktop preview panel body (stage + where it shows + palette). */
export function PreviewStage({ before, after, mode, side, split, changes, itemFor, withPhone = true }) {
  const { t } = useLocale();
  const user = side === "before" ? before : after;
  return (
    <div className={`s2-iv-stage is-${mode}`}>
      <DiffChips changes={changes} itemFor={itemFor} />
      {split ? (
        <div className="s2-iv-split">
          <BeforeAfter
            before={<S2ProfileCard user={before} />}
            after={<S2ProfileCard user={after} />}
            labels={{ before: t("shop2.inv.before"), after: t("shop2.inv.after"), slider: t("shop2.inv.compare") }}
          />
        </div>
      ) : mode === "phone" ? (
        <div className="s2-iv-stage-row is-phone">
          <PhoneMock user={user} big />
        </div>
      ) : (
        <div className="s2-iv-stage-row">
          <S2ProfileCard user={user} className="s2-iv-pcard" />
          {withPhone ? (
            <div className="s2-iv-stage-phone">
              <span className="s2-eyebrow">{t("shop2.inv.onPhone")}</span>
              <PhoneMock user={user} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function Places({ user }) {
  const { t } = useLocale();
  return (
    <div className="s2-iv-places">
      <div className="s2-iv-place">
        <span className="s2-eyebrow"><MessageCircle size={12} />{t("shop2.inv.inChat")}</span>
        <S2ChatMessage user={user} text={t("shop2.inv.chatLine")} time={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
      </div>
      <div className="s2-iv-place">
        <span className="s2-eyebrow"><Users size={12} />{t("shop2.inv.members")}</span>
        <S2MemberRow user={user} sub={t("shop2.inv.memberSub")} />
        <div className="s2-iv-other">
          <span className="s2-letter tone-3">{t("shop2.sample.p1").charAt(0)}</span>
          <span><b>{t("shop2.sample.p1")}</b><small>{t("shop2.preview.online")}</small></span>
        </div>
      </div>
      <div className="s2-iv-place">
        <span className="s2-eyebrow"><Mic size={12} />{t("shop2.inv.inVoice")}</span>
        <S2VoiceTile user={user} size="sm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved looks.

/** Mini profile strip of a saved look (banner, framed avatar, coloured name). */
export function MiniLook({ user }) {
  const { t } = useLocale();
  const banner = assetSrc(user?.equippedBanner) || null;
  return (
    <div className="s2-iv-ml" aria-hidden="true">
      <div className="s2-iv-ml-ban" style={banner ? { backgroundImage: cssUrl(banner) } : undefined} />
      <S2Avatar user={user} size={34} className="s2-iv-ml-av" />
      <span className="s2-iv-ml-nm"><S2Name user={user}>{displayNameOf(user, t("shop2.preview.you"))}</S2Name></span>
    </div>
  );
}

export function LookTile({ look, user, on, pieces, meta, auto, busy, onWear, onPreview, onRename, onPin, onDelete }) {
  const { t } = useLocale();
  return (
    <div className={`s2-iv-lt${on ? " is-on" : ""}${auto ? " is-auto" : ""}`} data-look={look.id}>
      <button type="button" className="s2-iv-lt-art" onClick={onPreview} title={t("shop2.inv.tryLook")} aria-label={`${t("shop2.inv.tryLook")}: ${look.name || t("shop2.kasa.previousLook")}`}>
        <MiniLook user={user} />
      </button>
      <div className="s2-iv-lt-b">
        <div className="s2-iv-lt-t">
          <b title={auto ? t("shop2.kasa.previousLook") : look.name}>{auto ? t("shop2.kasa.previousLook") : look.name}</b>
          {look.pinned ? <Pin size={12} className="s2-iv-lt-pin" /> : null}
          <Menu label={t("shop2.inv.lookMenu")} button={({ toggle, props }) => (
            <button type="button" className="s2-iv-lt-more" onClick={toggle} {...props}><MoreHorizontal size={15} /></button>
          )}>
            {(close) => (
              <>
                <MenuItem icon={Pencil} onClick={() => { close(); onRename(); }}>{t("shop2.inv.rename")}</MenuItem>
                {!auto ? <MenuItem icon={look.pinned ? PinOff : Pin} onClick={() => { close(); onPin(); }}>{t(look.pinned ? "shop2.inv.unpin" : "shop2.inv.pin")}</MenuItem> : null}
                <MenuItem icon={Eye} onClick={() => { close(); onPreview(); }}>{t("shop2.inv.tryLook")}</MenuItem>
                <MenuItem icon={Trash2} danger onClick={() => { close(); onDelete(); }}>{t("shop2.inv.delete")}</MenuItem>
              </>
            )}
          </Menu>
        </div>
        <small>{auto ? <><Clock size={11} />{meta}</> : `${t("shop2.inv.pieces", { n: pieces })}${meta ? ` · ${meta}` : ""}`}</small>
      </div>
      {on ? (
        <span className="s2-chip is-green s2-iv-lt-st"><Check size={11} />{t("shop2.inv.wearing")}</span>
      ) : (
        <button type="button" className="s2-btn is-sm s2-iv-lt-go" disabled={busy} onClick={onWear}><Check size={13} />{t("shop2.inv.wear")}</button>
      )}
    </div>
  );
}

/** Name a look (save / rename). */
export function NameDialog({ title, initial = "", onSave, onClose, phone }) {
  const { t } = useLocale();
  const [name, setName] = useState(initial);
  return (
    <Layer kind={phone ? "sheet" : "dialog"} onClose={onClose} label={title} className="s2-dialog is-sm">
      <h3 className="s2-dialog-title">{title}</h3>
      <p className="s2-muted">{t("shop2.kasa.saveLookBody")}</p>
      <form className="s2-iv-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name.trim()); }}>
        <input className="s2-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("shop2.kasa.lookName")} aria-label={t("shop2.kasa.lookName")} />
        <div className="s2-row">
          <button type="button" className="s2-btn is-flex" onClick={onClose}>{t("shop2.common.cancel")}</button>
          <button type="submit" className="s2-btn is-primary is-flex2" disabled={!name.trim()}>{t("shop2.common.save")}</button>
        </div>
      </form>
    </Layer>
  );
}

export function ConfirmDialog({ title, body, confirm, onConfirm, onClose, phone }) {
  const { t } = useLocale();
  return (
    <Layer kind={phone ? "sheet" : "dialog"} onClose={onClose} label={title} className="s2-dialog is-sm">
      <h3 className="s2-dialog-title">{title}</h3>
      <p className="s2-muted">{body}</p>
      <div className="s2-row">
        <button type="button" className="s2-btn is-flex" onClick={onClose}>{t("shop2.common.cancel")}</button>
        <button type="button" className="s2-btn is-flex2 s2-iv-danger" onClick={onConfirm}><Trash2 size={14} />{confirm}</button>
      </div>
    </Layer>
  );
}

// ---------------------------------------------------------------------------
// Slot rail.

export function SlotButton({ category, item, itemName, count, pending, fresh, on, onClick, index, compact = false }) {
  const { t } = useLocale();
  const s2Name = item ? itemName : t("shop2.inv.emptySlot");
  if (compact) {
    return (
      <button type="button" className={`s2-iv-pslot${on ? " is-on" : ""}`} onClick={onClick} aria-pressed={on} data-slot={category}>
        <ArtOrEmpty item={item} size="slot" />
        <span>{t(`shop2.inv.slot.${category}`)}</span>
        {pending ? <i className="s2-iv-pdot" /> : fresh ? <i className="s2-iv-ndot" /> : null}
      </button>
    );
  }
  return (
    <button type="button" className={`s2-iv-slot${on ? " is-on" : ""}`} onClick={onClick} aria-pressed={on} data-slot={category} title={index ? `${t(`shop2.inv.slot.${category}`)} (${index})` : undefined}>
      <ArtOrEmpty item={item} size="slot" />
      <span className="s2-iv-slot-t">
        <b>{t(`shop2.inv.slot.${category}`)}</b>
        <small>{s2Name}</small>
      </span>
      <span className="s2-iv-slot-r">
        {pending ? <i className="s2-iv-pdot" title={t("shop2.inv.pending")} /> : fresh ? <i className="s2-iv-ndot" title={t("shop2.inv.badge.new")} /> : null}
        <em className="s2-num">{count}</em>
      </span>
    </button>
  );
}

export function SetBars({ list, nameOf, hint, onOpen, onHint }) {
  const { t, locale } = useLocale();
  if (!list.length) return <p className="s2-iv-sp-miss">{t("shop2.inv.noSets")}</p>;
  return (
    <>
      {list.map((s) => (
        <button type="button" key={s.key} className="s2-iv-sp" onClick={() => onOpen(s.key)} style={{ "--c": s.palette[2] || s.palette[0] || "#587af5", "--p": `${Math.round(s.pct * 100)}%` }}>
          <span className="s2-iv-sp-t"><b>{nameOf(s)}</b><em className="s2-num">{s.owned}/{s.total}</em></span>
          <i />
        </button>
      ))}
      {hint ? (
        <button type="button" className="s2-iv-sp-miss is-link" onClick={onHint}>
          {t(hint.inStorefront ? "shop2.inv.missingStore" : "shop2.inv.missingSet", { set: hint.setName, n: hint.left, item: hint.itemName, price: formatNumber(hint.price, locale) })}
        </button>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Item card / row.

export function ItemCard({ entry, name, labels, setChip, equipped, trying, busy, onTry, onEquip, onUnequip, big = false, list = false, me }) {
  const { t } = useLocale();
  const r = rarityOf(entry.item);
  const action = trying ? (
    <button type="button" className="s2-btn is-primary is-sm is-wide" disabled={busy} onClick={onEquip}><Check size={14} />{t("shop2.common.equip")}</button>
  ) : equipped ? (
    <button type="button" className="s2-btn is-sm is-wide" disabled={busy} onClick={onUnequip}>{t("shop2.common.unequip")}</button>
  ) : (
    <button type="button" className="s2-btn is-sm is-wide s2-iv-try" onClick={onTry}>{t("shop2.inv.try")}</button>
  );
  const badges = (
    <>
      <span className="s2-iv-badges">
        {entry.gift && entry.recent ? <span className="s2-iv-b is-gift"><Gift size={10} />{t("shop2.inv.badge.gift")}</span> : entry.isNew ? <span className="s2-iv-b is-new">{t("shop2.inv.badge.new")}</span> : null}
      </span>
      {equipped && !list ? <span className="s2-iv-b is-eq"><Check size={10} />{t("shop2.inv.badge.equipped")}</span> : null}
      {trying && !list ? <span className="s2-iv-b is-try"><Eye size={10} />{t("shop2.inv.badge.trying")}</span> : null}
    </>
  );
  if (list) {
    return (
      <div className={`s2-iv-row${equipped ? " is-eq" : ""}${trying ? " is-try" : ""}`} data-item={entry.id}>
        <button type="button" className="s2-iv-row-art" onClick={onTry} aria-label={`${t("shop2.inv.try")}: ${name}`}><Shop2Art item={entry.item} size="tile" me={me} /></button>
        <span className="s2-iv-row-t">
          <b>{name}</b>
          <small><i className="s2-iv-rd" style={{ background: RARITY_COLOR[r] }} />{labels.rarity} · {labels.category}</small>
        </span>
        {setChip}
        <span className="s2-iv-row-tags">
          {trying ? <span className="s2-iv-b is-try"><Eye size={10} />{t("shop2.inv.badge.trying")}</span> : equipped ? <span className="s2-iv-b is-eq"><Check size={10} />{t("shop2.inv.badge.equipped")}</span> : null}
          {entry.gift && entry.recent ? <span className="s2-iv-b is-gift"><Gift size={10} />{t("shop2.inv.badge.gift")}</span> : entry.isNew ? <span className="s2-iv-b is-new">{t("shop2.inv.badge.new")}</span> : null}
        </span>
        <span className="s2-iv-row-act">{action}</span>
      </div>
    );
  }
  return (
    <div className={`s2-iv-card is-r-${r}${equipped ? " is-eq" : ""}${trying ? " is-try" : ""}${big ? " is-big" : ""}`} data-item={entry.id}>
      <button type="button" className="s2-iv-card-art" onClick={onTry} aria-label={`${t("shop2.inv.try")}: ${name}`}>
        <Shop2Art item={entry.item} size="card" me={me} sample={displayNameOf(me)} />
        {badges}
      </button>
      <div className="s2-iv-card-body">
        <b title={name}>{name}</b>
        <small><i className="s2-iv-rd" style={{ background: RARITY_COLOR[r] }} />{labels.rarity} · {labels.category}</small>
        {setChip}
      </div>
      <div className="s2-iv-card-act">{action}</div>
    </div>
  );
}

export function SetChip({ name, owned, total, palette }) {
  if (!name) return null;
  return (
    <span className="s2-iv-setchip" style={{ "--c": palette?.[2] || palette?.[0] || "#587af5" }}>
      <Ring fraction={total ? owned / total : 0} size={14} />
      <span>{name}</span>
      <em className="s2-num">{owned}/{total}</em>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Equip history row and the pending bar.

export function HistRow({ time, title, from, to, fromName, toName, more, live = false, button, compact = false }) {
  return (
    <div className={`s2-iv-hi${live ? " is-live" : ""}${compact ? " is-compact" : ""}`}>
      <span className="s2-iv-hi-t s2-num">{time}</span>
      <div className="s2-iv-hi-b">
        <b>{title}</b>
        <small>
          {from !== undefined ? <><ArtOrEmpty item={from} size="chip" /><span>{fromName}</span><ArrowRight size={11} className="s2-iv-arrow" /><ArtOrEmpty item={to} size="chip" /><span>{toName}</span>{more ? <em>{more}</em> : null}</> : null}
        </small>
      </div>
      {button}
    </div>
  );
}

export function PendingBar({ changes, itemFor, onRemove, onUndo, onSave, onApply, busy, phone }) {
  const { t } = useLocale();
  if (!changes.length) return null;
  const names = changes.map((c) => t(`shop2.inv.slot.${c.category}`)).join(", ");
  return (
    <div className={`s2-iv-pbar${phone ? " is-phone" : ""}`} role="region" aria-label={t("shop2.inv.pending")}>
      <div className="s2-iv-pbar-l">
        <span className="s2-iv-pbar-n s2-num">{changes.length}</span>
        <div>
          <b>{t("shop2.inv.pending")}</b>
          <small>{phone ? names : t("shop2.inv.pendingSub")}</small>
        </div>
      </div>
      {!phone ? (
        <div className="s2-iv-pbar-diff">
          {changes.map((c) => (
            <span key={c.category} className="s2-iv-df">
              <ArtOrEmpty item={itemFor(c.from, c.category, true)} size="chip" />
              <ArrowRight size={12} className="s2-iv-arrow" />
              <ArtOrEmpty item={itemFor(c.to, c.category)} size="chip" />
              <em>{t(`shop2.inv.slot.${c.category}`)}</em>
              <button type="button" className="s2-ibtn is-sm is-plain" onClick={() => onRemove(c.category)} aria-label={t("shop2.inv.removeChange", { slot: t(`shop2.inv.slot.${c.category}`) })}><X size={12} /></button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="s2-iv-pbar-r">
        {phone ? (
          <button type="button" className="s2-ibtn" onClick={onUndo} aria-label={t("shop2.inv.undo")}><Undo2 size={16} /></button>
        ) : (
          <>
            <button type="button" className="s2-btn" onClick={onUndo}><Undo2 size={14} />{t("shop2.inv.undo")}</button>
            <button type="button" className="s2-btn s2-iv-pbar-save" onClick={onSave} title={t("shop2.inv.saveAsLook")} aria-label={t("shop2.inv.saveAsLook")}><Bookmark size={14} /><span>{t("shop2.inv.saveAsLook")}</span></button>
          </>
        )}
        <button type="button" className="s2-btn is-primary" disabled={busy} aria-busy={busy || undefined} onClick={onApply}><Check size={15} />{t("shop2.inv.apply")}</button>
      </div>
    </div>
  );
}

export function LockChips({ locks, onToggle, slots }) {
  const { t } = useLocale();
  return (
    <div className="s2-iv-shuf-l">
      {locks.map((c) => (
        <button type="button" key={c} className="s2-chip is-btn s2-iv-lock" onClick={() => onToggle(c)} aria-label={t("shop2.inv.unlock", { slot: t(`shop2.inv.slot.${c}`) })}>
          <Lock size={10} />{t(`shop2.inv.slot.${c}`)}
        </button>
      ))}
      <Menu label={t("shop2.inv.lockAdd")} align="left" button={({ toggle, props }) => (
        <button type="button" className="s2-chip is-btn s2-iv-lock is-add" onClick={toggle} {...props}><Lock size={10} />{locks.length ? "+" : t("shop2.inv.lockAdd")}</button>
      )}>
        {slots.map((c) => <MenuItem key={c} on={locks.includes(c)} onClick={() => onToggle(c)}>{t(`shop2.inv.slot.${c}`)}</MenuItem>)}
      </Menu>
    </div>
  );
}

