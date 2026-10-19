import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCircle2, Coins, Flame, Gift, Search, SortAsc, Undo2, X } from "lucide-react";
import { useLocale, useT } from "../../context/LocaleContext";
import { hapticSelection, hapticTabTick } from "../../lib/fluid/haptics";
import {
  COUNTRY_REGIONS,
  POPULAR_CODES,
  countryCode,
  countryName,
  countryRegions,
  groupByLetter,
  isTerritory,
  matchesCountry,
  primaryRegion,
  sortCountries,
} from "../../lib/countryFlags";
import { Avatar } from "../ui/Avatar";
import AdminBadge from "../social/AdminBadge";
import { CountryBadge, CountryFlag } from "./CountryFlag";
import { condenseLetters, railCapacity } from "../../lib/letterRail";

const REGION_LABEL = Object.fromEntries(COUNTRY_REGIONS.map((r) => [r.id, r.label]));

function regionLabel(item, t) {
  const id = primaryRegion(item);
  return id ? t(REGION_LABEL[id] || id) : "";
}

/** Buy / equip state of one flag. */
function cardState({ owned, equipped }) {
  if (equipped) return "equipped";
  if (owned) return "owned";
  return "buy";
}

function CountryAction({ item, state, busy, affordable, hasVoucher, onBuy, onEquip, t }) {
  if (state === "equipped") {
    return (
      <div className="cs-actions">
        <span className="cs-pill is-equipped"><Check size={12} strokeWidth={2.6} /> {t("Worn")}</span>
        <button type="button" className="cs-btn is-ghost" disabled={busy} onClick={() => onEquip(item, true)}>
          {t("Take off")}
        </button>
      </div>
    );
  }
  if (state === "owned") {
    return (
      <div className="cs-actions">
        <span className="cs-pill is-owned"><CheckCircle2 size={12} /> {t("Yours")}</span>
        <button type="button" className="cs-btn is-ghost" disabled={busy} onClick={() => onEquip(item, false)}>
          {t("Wear")}
        </button>
      </div>
    );
  }
  return (
    <div className="cs-actions">
      {hasVoucher ? (
        <span className="cs-price is-free"><Gift size={12} /> {t("Free")}</span>
      ) : (
        <span className="cs-price"><Coins size={12} /> {(item.price_descoin || 0).toLocaleString()}</span>
      )}
      <button
        type="button"
        className="cs-btn is-primary"
        disabled={busy || (!affordable && !hasVoucher)}
        title={!affordable && !hasVoucher ? t("Not enough DesCoin yet") : undefined}
        onClick={() => onBuy(item)}
      >
        {busy ? t("Buying…") : hasVoucher ? t("Get") : t("Buy")}
      </button>
    </div>
  );
}

/** iOS-style switch: the whole row toggles, announced as a switch. */
function SwitchRow({ checked, onChange, inline = false, children }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`cs-toggle-row${inline ? " is-inline" : ""}${checked ? " is-on" : ""}`}
      onClick={() => {
        hapticSelection();
        onChange(!checked);
      }}
    >
      <span className="cs-switch" aria-hidden="true" />
      <span className="cs-toggle-label">{children}</span>
    </button>
  );
}

function PurchaseDialog({ item, me, balance, hasVoucher, currentItem, onCancel, onConfirm, busy, isMobile, t, locale }) {
  const [equipAfter, setEquipAfter] = useState(true);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef(null);
  const confirmRef = useRef(null);
  const price = Number(item.price_descoin) || 0;
  const after = hasVoucher ? balance : balance - price;
  const code = countryCode(item);

  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
    // Capture + stop so Escape closes only this dialog, not Settings behind it.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const onPointerDown = (e) => {
    if (!isMobile) return;
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (dragStart.current == null) return;
    setDrag(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    dragStart.current = null;
    if (drag > 110) onCancel();
    else setDrag(0);
  };

  const previewUser = me ? { ...me, equippedCountry: item } : { equippedCountry: item };
  const displayName = me?.displayName || me?.display_name || me?.username || t("User");

  return createPortal(
    <div className={`cs-dialog-root${isMobile ? " is-sheet" : ""}`} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="cs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-dialog-title"
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        {isMobile ? (
          <div
            className="cs-sheet-grabber"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden="true"
          />
        ) : null}
        <div className="cs-dialog-head">
          <span className="cs-eyebrow">{t("Country badge")}</span>
          <button type="button" className="cs-icon-btn" aria-label={t("Close")} onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="cs-dialog-hero">
          <div className="cs-flag-tile is-hero"><CountryFlag item={item} size={56} /></div>
          <div>
            <h3 id="cs-dialog-title">{countryName(item, locale)}</h3>
            <p className="cs-muted">{regionLabel(item, t)} · ISO {code}</p>
            <span className="cs-chip-static">{t("Every country costs the same")}</span>
          </div>
        </div>
        <div className="cs-preview">
          <span className="cs-eyebrow">{t("How it looks on your profile")}</span>
          <div className="cs-preview-user">
            <Avatar name={displayName} size={36} user={me} />
            <div>
              <strong>{displayName}</strong>
              <span className="cs-muted">@{String(me?.username || "user").toLowerCase()}</span>
            </div>
          </div>
          <div className="user-profile-badges">
            <CountryBadge user={previewUser} />
            <AdminBadge user={me} variant="chip" />
          </div>
        </div>
        <div className="cs-ledger">
          <div><span>{t("Price")}</span><b className={hasVoucher ? "is-free" : "is-coin"}>{hasVoucher ? t("Free") : <><Coins size={13} /> {price.toLocaleString()}</>}</b></div>
          <div><span>{t("Balance")}</span><b>{balance.toLocaleString()}</b></div>
          <div><span>{t("After")}</span><b>{after.toLocaleString()}</b></div>
        </div>
        {hasVoucher ? (
          <p className="cs-voucher-note"><Gift size={14} /> {t("Your free country: titles were retired, so this flag is on us. No DesCoin is spent.")}</p>
        ) : null}
        <SwitchRow checked={equipAfter} onChange={setEquipAfter}>
          {t("Wear it right after buying")}
          {currentItem && currentItem.id !== item.id ? (
            <span className="cs-muted"> ({t("{country} comes off", { country: countryName(currentItem, locale) })})</span>
          ) : null}
        </SwitchRow>
        <div className="cs-dialog-actions">
          <button type="button" className="cs-btn is-ghost is-lg" onClick={onCancel}>{t("Cancel")}</button>
          <button
            ref={confirmRef}
            type="button"
            className="cs-btn is-primary is-lg"
            disabled={busy || (!hasVoucher && balance < price)}
            onClick={() => onConfirm({ equipAfter, useVoucher: hasVoucher })}
          >
            {busy ? t("Buying…") : hasVoucher ? t("Get it free") : t("Buy for {amount} DesCoin", { amount: price.toLocaleString() })}
          </button>
        </div>
        <p className="cs-footnote">{t("A flag you buy stays on your account; change it whenever you like. Only one flag is worn at a time.")}</p>
      </div>
    </div>,
    document.body
  );
}

function LetterRail({ letters, onJump, t }) {
  const railRef = useRef(null);
  const lastRef = useRef(null);
  const [capacity, setCapacity] = useState(Infinity);
  // The rail sticks inside the shop's scroll area. On a short window that
  // area is shorter than A–Z, so condense instead of running past the edge.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    const scroller = rail.closest(".shop-catalog, .us-main-scroll");
    const measure = () => {
      const top = parseFloat(getComputedStyle(rail).top) || 0;
      const box = scroller ? scroller.clientHeight : window.innerHeight;
      const next = railCapacity({ available: box - top - 12 });
      setCapacity((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    if (scroller) ro.observe(scroller);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const rows = useMemo(() => condenseLetters(letters, capacity), [letters, capacity]);
  const pick = (clientY) => {
    const rail = railRef.current;
    if (!rail || !letters.length) return;
    const rect = rail.getBoundingClientRect();
    const idx = Math.min(letters.length - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * letters.length)));
    const letter = letters[idx];
    if (letter !== lastRef.current) {
      lastRef.current = letter;
      hapticTabTick();
      onJump(letter);
    }
  };
  return (
    <nav
      ref={railRef}
      className="cs-letter-rail"
      aria-label={t("Jump to letter")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        lastRef.current = null;
        pick(e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pointerType === "touch") pick(e.clientY);
      }}
    >
      {rows.map((row, i) => (
        <button
          key={row.dot ? `dot-${i}` : row.letter}
          type="button"
          tabIndex={-1}
          className={row.dot ? "is-dot" : undefined}
          aria-label={row.dot ? row.letter : undefined}
          onClick={() => onJump(row.letter)}
        >
          {row.label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Countries tab of the shop: search (TR/EN/ISO), Popular / A–Z, continent
 * filters, owned / equipped filters, territories switch, a letter rail and a
 * purchase dialog (bottom sheet on phones). One flag is worn at a time.
 */
export default function CountryShop({
  items,
  ownedItemIds,
  equippedId,
  balance,
  vouchers = 0,
  me,
  busyItemId,
  onBuy,
  onEquip,
  isMobile = false,
}) {
  const t = useT();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("popular");
  const [owner, setOwner] = useState("all");
  const [region, setRegion] = useState("all");
  const [territories, setTerritories] = useState(true);
  const [dialogItem, setDialogItem] = useState(null);
  const [undo, setUndo] = useState(null);
  const searchRef = useRef(null);
  const groupRefs = useRef(new Map());

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!undo) return undefined;
    const id = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(id);
  }, [undo]);

  const equippedItem = useMemo(() => items.find((i) => i.id === equippedId) || null, [items, equippedId]);
  const ownedCount = useMemo(() => items.filter((i) => ownedItemIds.has(i.id)).length, [items, ownedItemIds]);

  const base = useMemo(
    () => items.filter((i) => (territories || !isTerritory(i)) && matchesCountry(i, query)),
    [items, territories, query]
  );
  const regionCounts = useMemo(() => {
    const map = new Map();
    for (const i of base) for (const r of countryRegions(i)) map.set(r, (map.get(r) || 0) + 1);
    return map;
  }, [base]);
  const filtered = useMemo(
    () =>
      base.filter((i) => {
        if (region !== "all" && !countryRegions(i).includes(region)) return false;
        if (owner === "owned" && !ownedItemIds.has(i.id)) return false;
        if (owner === "equipped" && i.id !== equippedId) return false;
        return true;
      }),
    [base, region, owner, ownedItemIds, equippedId]
  );
  const alpha = useMemo(() => sortCountries(filtered, "az", locale), [filtered, locale]);
  const groups = useMemo(() => groupByLetter(alpha, locale), [alpha, locale]);
  const popular = useMemo(() => {
    if (sort !== "popular" || query || owner !== "all") return [];
    return sortCountries(filtered, "popular", locale).filter((i) => POPULAR_CODES.includes(countryCode(i)));
  }, [filtered, sort, query, owner, locale]);

  const jump = useCallback((letter) => {
    const el = groupRefs.current.get(letter);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const doEquip = async (item, isEquipped) => {
    const previous = equippedItem;
    await onEquip(item, isEquipped);
    if (!isEquipped && previous && previous.id !== item.id) {
      setUndo({ item, previous });
    } else if (isEquipped) {
      setUndo({ item: null, previous: item });
    }
  };

  const confirmBuy = async ({ equipAfter, useVoucher }) => {
    const item = dialogItem;
    const previous = equippedItem;
    const ok = await onBuy(item, { useVoucher, equipAfter });
    if (ok) {
      setDialogItem(null);
      if (equipAfter && previous && previous.id !== item.id) setUndo({ item, previous });
    }
  };

  const renderCard = (item) => {
    const owned = ownedItemIds.has(item.id);
    const equipped = item.id === equippedId;
    const state = cardState({ owned, equipped });
    const busy = busyItemId === item.id;
    const affordable = balance >= (Number(item.price_descoin) || 0);
    return (
      <div key={item.id} className={`cs-card is-${state}`} data-code={countryCode(item)}>
        <button
          type="button"
          className="cs-card-hit"
          aria-label={countryName(item, locale)}
          onClick={() => {
            hapticSelection();
            if (state === "buy") setDialogItem(item);
            else doEquip(item, equipped);
          }}
        />
        <div className="cs-flag-tile"><CountryFlag item={item} size={isMobile ? 26 : 34} decorative /></div>
        <div className="cs-card-text">
          <span className="cs-card-name" title={countryName(item, locale)}>{countryName(item, locale)}</span>
          <span className="cs-card-region">{regionLabel(item, t)}</span>
        </div>
        <CountryAction
          item={item}
          state={state}
          busy={busy}
          affordable={affordable}
          hasVoucher={vouchers > 0}
          onBuy={(it) => setDialogItem(it)}
          onEquip={doEquip}
          t={t}
        />
      </div>
    );
  };

  const letters = groups.map((g) => g.letter);

  return (
    <div className={`country-shop${isMobile ? " is-mobile" : ""}`}>
      {vouchers > 0 ? (
        <div className="cs-voucher-banner" role="status">
          <Gift size={16} />
          <span>{t("You have a free country. Pick any flag, no DesCoin is spent.")}</span>
        </div>
      ) : null}
      <div className="cs-toolbar">
        <div className="cs-toolbar-row">
          <label className="cs-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isMobile ? t("Search countries") : t("Search: Türkiye, Japan, JP…")}
              aria-label={t("Search countries")}
              enterKeyHint="search"
            />
            {!isMobile ? <kbd className="cs-kbd">{navigator.platform?.includes("Mac") ? "⌘K" : "Ctrl K"}</kbd> : null}
          </label>
          <div className="cs-seg" role="radiogroup" aria-label={t("Sort")}>
            <button type="button" role="radio" aria-checked={sort === "popular"} className={sort === "popular" ? "is-on" : ""} onClick={() => setSort("popular")}>
              <Flame size={13} /> {t("Popular")}
            </button>
            <button type="button" role="radio" aria-checked={sort === "az"} className={sort === "az" ? "is-on" : ""} onClick={() => setSort("az")}>
              <SortAsc size={13} /> A–Z
            </button>
          </div>
          <div className="cs-seg" role="radiogroup" aria-label={t("Show")}>
            <button type="button" role="radio" aria-checked={owner === "all"} className={owner === "all" ? "is-on" : ""} onClick={() => setOwner("all")}>{t("All")}</button>
            <button type="button" role="radio" aria-checked={owner === "owned"} className={owner === "owned" ? "is-on" : ""} onClick={() => setOwner("owned")}>
              {isMobile ? t("Mine") : t("Owned by me")} {ownedCount ? <span className="cs-count">{ownedCount}</span> : null}
            </button>
            {!isMobile ? (
              <button type="button" role="radio" aria-checked={owner === "equipped"} className={owner === "equipped" ? "is-on" : ""} onClick={() => setOwner("equipped")}>{t("Worn")}</button>
            ) : null}
          </div>
        </div>
        <div className="cs-toolbar-row is-chips">
          <div className="cs-chips" role="radiogroup" aria-label={t("Continent")}>
            <button type="button" role="radio" aria-checked={region === "all"} className={`cs-chip${region === "all" ? " is-on" : ""}`} onClick={() => setRegion("all")}>
              {t("All")} <span className="cs-count">{base.length}</span>
            </button>
            {COUNTRY_REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={region === r.id}
                className={`cs-chip${region === r.id ? " is-on" : ""}`}
                onClick={() => setRegion(r.id)}
                disabled={!regionCounts.get(r.id)}
              >
                {t(r.label)} <span className="cs-count">{regionCounts.get(r.id) || 0}</span>
              </button>
            ))}
          </div>
          <SwitchRow inline checked={territories} onChange={setTerritories}>
            {t("Include territories")}
          </SwitchRow>
        </div>
      </div>

      <div className="cs-body">
        <div className="cs-list" aria-live="polite">
          {filtered.length === 0 ? (
            <p className="cs-empty">{t("No country matches “{query}”.", { query })}</p>
          ) : null}
          {popular.length ? (
            <section className="cs-group">
              <h5 className="cs-group-title">{t("Popular")} <span className="cs-muted">{t("Most worn on Descall")}</span></h5>
              <div className="cs-grid">{popular.map(renderCard)}</div>
            </section>
          ) : null}
          {groups.map((g) => (
            <section
              key={g.letter}
              className="cs-group"
              ref={(el) => {
                if (el) groupRefs.current.set(g.letter, el);
                else groupRefs.current.delete(g.letter);
              }}
            >
              <h5 className="cs-group-title is-letter">{g.letter}</h5>
              <div className="cs-grid">{g.items.map(renderCard)}</div>
            </section>
          ))}
        </div>
        {letters.length > 4 ? <LetterRail letters={letters} onJump={jump} t={t} /> : null}
      </div>

      {dialogItem ? (
        <PurchaseDialog
          item={dialogItem}
          me={me}
          balance={balance}
          hasVoucher={vouchers > 0}
          currentItem={equippedItem}
          busy={busyItemId === dialogItem.id}
          isMobile={isMobile}
          onCancel={() => setDialogItem(null)}
          onConfirm={confirmBuy}
          t={t}
          locale={locale}
        />
      ) : null}

      {undo ? (
        <div className="cs-undo" role="status">
          {undo.item ? <CountryFlag item={undo.item} size={16} decorative /> : null}
          <span>
            {undo.item
              ? t("{country} is on", { country: countryName(undo.item, locale) })
              : t("{country} removed", { country: countryName(undo.previous, locale) })}
            {undo.item && undo.previous ? ` · ${t("{country} came off", { country: countryName(undo.previous, locale) })}` : ""}
          </span>
          <button
            type="button"
            className="cs-btn is-ghost"
            onClick={async () => {
              const { previous } = undo;
              setUndo(null);
              await onEquip(previous, false);
            }}
          >
            <Undo2 size={13} /> {t("Undo")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { cardState };

/**
 * Envanter view of the shop: the worn flag, every owned flag, other owned
 * items by category, and a note when retired titles were on the account.
 */
export function ShopInventoryView({
  inventory,
  equippedIdFor,
  busyItemId,
  onEquip,
  retiredTitles = 0,
  categoryLabel,
  onBrowseCountries,
}) {
  const t = useT();
  const { locale } = useLocale();
  const rows = inventory.filter((row) => row?.item);
  const countries = sortCountries(
    rows.map((r) => r.item).filter((i) => i.category === "countries"),
    "az",
    locale
  );
  const equippedCountryId = equippedIdFor("countries");
  const worn = countries.find((i) => i.id === equippedCountryId) || null;
  const others = new Map();
  for (const row of rows) {
    if (row.item.category === "countries") continue;
    if (!others.has(row.item.category)) others.set(row.item.category, []);
    others.get(row.item.category).push(row.item);
  }

  return (
    <div className="shop-inventory">
      <section className="inv-worn">
        <span className="cs-eyebrow">{t("Your flag")}</span>
        {worn ? (
          <div className="inv-worn-card">
            <div className="cs-flag-tile is-hero"><CountryFlag item={worn} size={44} /></div>
            <div className="inv-worn-text">
              <strong>{countryName(worn, locale)}</strong>
              <span className="cs-muted">{t("Shown on your profile, hover card, member list and messages.")}</span>
            </div>
            <button type="button" className="cs-btn is-ghost" disabled={busyItemId === worn.id} onClick={() => onEquip(worn, true)}>
              {t("Take off")}
            </button>
          </div>
        ) : (
          <div className="inv-worn-card is-empty">
            <span className="cs-muted">{countries.length ? t("No flag worn. Pick one below.") : t("You have no flag yet.")}</span>
            {!countries.length ? (
              <button type="button" className="cs-btn is-primary" onClick={onBrowseCountries}>{t("Browse countries")}</button>
            ) : null}
          </div>
        )}
      </section>

      {countries.length ? (
        <section className="cs-group">
          <h5 className="cs-group-title">{t("Your countries")} <span className="cs-count">{countries.length}</span></h5>
          <div className="cs-grid">
            {countries.map((item) => {
              const equipped = item.id === equippedCountryId;
              return (
                <div key={item.id} className={`cs-card is-${equipped ? "equipped" : "owned"}`}>
                  <div className="cs-flag-tile"><CountryFlag item={item} size={30} decorative /></div>
                  <div className="cs-card-text">
                    <span className="cs-card-name">{countryName(item, locale)}</span>
                    <span className="cs-card-region">{regionLabel(item, t)}</span>
                  </div>
                  <CountryAction item={item} state={equipped ? "equipped" : "owned"} busy={busyItemId === item.id} onEquip={onEquip} t={t} />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {[...others.entries()].map(([category, list]) => (
        <section key={category} className="cs-group">
          <h5 className="cs-group-title">{t(categoryLabel(category))} <span className="cs-count">{list.length}</span></h5>
          <div className="inv-other-list">
            {list.map((item) => {
              const equipped = equippedIdFor(category) === item.id;
              return (
                <div key={item.id} className={`inv-other-row${equipped ? " is-equipped" : ""}`}>
                  <span className="inv-other-name">{item.name}</span>
                  <button type="button" className="cs-btn is-ghost" disabled={busyItemId === item.id} onClick={() => onEquip(item, equipped)}>
                    {equipped ? t("Unequip") : t("Apply")}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {retiredTitles > 0 ? (
        <p className="inv-retired-note">
          {t("Profile titles were retired in 2.13.0. Your {count} old titles stay on your account but are no longer shown.", { count: retiredTitles })}
        </p>
      ) : null}
    </div>
  );
}
