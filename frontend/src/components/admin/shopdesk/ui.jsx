/**
 * Mağaza masası building blocks: item thumbnails (real cosmetic classes), switches, charts,
 * segmented controls, dropdowns (opaque DossierMenu), user / item pickers.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import DossierMenu from "../dossier/DossierMenu.jsx";
import ShopItemThumb from "../../shop/ShopItemThumb.jsx";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { Check, ChevronDown, Search, X } from "../../ui/Icon.jsx";
import { barHeights, num, sparkPath } from "./shopDeskModel.js";

/* ------------------------------------------------------------------ thumbnails */

/** Item thumbnail (real cosmetic classes), shared with the user shop storefront. */
export function ItemThumb({ item, size = 40, className = "" }) {
  return <ShopItemThumb item={item} size={size} className={`sdk-th ${className}`.trim()} />;
}

/* ------------------------------------------------------------------ small parts */

export function NewTag() {
  const { t } = useLocale();
  return <span className="sdk-new">{t("shopDesk.new")}</span>;
}

export function Pill({ tone = "gray", children, className = "" }) {
  return <span className={`sdk-pill is-${tone} ${className}`}>{children}</span>;
}

const RARITY_TONE = { common: "gray", rare: "blue", epic: "violet", legendary: "amber", mythic: "red" };
export function RarityPill({ rarity }) {
  const { t } = useLocale();
  const r = RARITY_TONE[rarity] ? rarity : "common";
  return <Pill tone={RARITY_TONE[r]}>{t(`shopDesk.rarity.${r}`)}</Pill>;
}

export function Toggle({ checked, onChange, label, disabled = false, busy = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      className={`sdk-switch${checked ? " is-on" : ""}${busy ? " is-busy" : ""}`}
      disabled={disabled || busy}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
    >
      <span />
    </button>
  );
}

/** Row / header selection box: the app's GlassCheckbox (header shows "some selected" as a dash). */
export function Check2({ checked, onChange, label, indeterminate = false }) {
  return (
    <span className={`sdk-check${indeterminate && !checked ? " is-mixed" : ""}`} onClick={(e) => e.stopPropagation()}>
      <GlassCheckbox checked={Boolean(checked)} onChange={(e) => onChange?.(e.target.checked)} aria-label={label} />
    </span>
  );
}

export function Spark({ values, tone = "brand", w = 72, h = 22 }) {
  const d = sparkPath(values, w, h);
  if (!d) return <span className="sdk-spark" style={{ width: w, height: h }} />;
  return (
    <svg className={`sdk-spark is-${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} className="sdk-spark-fill" />
      <path d={d} className="sdk-spark-line" />
    </svg>
  );
}

/**
 * Vertical bars. values: numbers (null = failed run); tones per bar from `toneOf(v, i)`.
 * `labels` under each bar, `tops` above.
 */
export function Bars({ values, labels, tops, toneOf, height = 110, ariaLabel, onPick, activeIndex = -1 }) {
  const heights = barHeights(values.map((v) => (v == null ? 0 : v)));
  return (
    <div className="sdk-bars" style={{ "--bars-h": `${height}px` }} role="img" aria-label={ariaLabel}>
      {values.map((v, i) => {
        const tone = toneOf ? toneOf(v, i) : "brand";
        const h = v == null ? 100 : heights[i];
        return (
          <button
            type="button"
            key={i}
            className={`sdk-bar is-${tone}${activeIndex === i ? " is-active" : ""}`}
            onClick={onPick ? () => onPick(i) : undefined}
            tabIndex={onPick ? 0 : -1}
            aria-label={labels?.[i] ? `${labels[i]}: ${tops?.[i] ?? v ?? ""}` : undefined}
          >
            <span className="sdk-bar-top">{tops?.[i] ?? ""}</span>
            <span className="sdk-bar-col">
              <span className="sdk-bar-fill" style={{ height: h ? `${h}%` : "3px" }} />
            </span>
            {labels ? <span className="sdk-bar-lab">{labels[i]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Seg({ items, value, onChange, label, small = false, className = "" }) {
  return (
    <div className={`sdk-seg${small ? " is-small" : ""} ${className}`} role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          className={value === it.id ? "is-on" : ""}
          onClick={() => onChange(it.id)}
          disabled={it.disabled}
        >
          {it.icon ? <it.icon size={15} /> : null}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Button + opaque menu with a check on the current option. */
export function Dropdown({ label, prefix, value, options, onChange, icon: Icon, width = 240, className = "", testId }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`sdk-dd ${className}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
      >
        {Icon ? <Icon size={16} /> : null}
        <span>
          {prefix ? `${prefix}: ` : ""}
          {current?.label ?? label}
        </span>
        <ChevronDown size={14} />
      </button>
      <DossierMenu
        open={open}
        anchorRef={ref}
        onClose={() => setOpen(false)}
        label={label}
        width={width}
        items={options.map((o) => ({
          id: o.id,
          label: o.label,
          sub: o.sub,
          icon: o.id === value ? Check : o.icon || Blank,
          onSelect: () => onChange(o.id),
        }))}
      />
    </>
  );
}

function Blank({ size = 17 }) {
  return <span style={{ width: size, height: size, display: "inline-block", flex: "none" }} />;
}

/* ------------------------------------------------------------------ people */

const AV_TONES = ["#e04f8a", "#f08a3c", "#4f8cf0", "#3fbf7f", "#9b5de5", "#e0b13a", "#3bb8c4"];
export function Ava({ user, size = 32 }) {
  const name = user?.displayName || user?.username || "?";
  let h = 0;
  for (const ch of String(user?.username || name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = AV_TONES[h % AV_TONES.length];
  return (
    <span className="sdk-ava" style={{ width: size, height: size, "--ava": bg, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" draggable={false} /> : Array.from(name)[0]?.toLocaleUpperCase("tr")}
    </span>
  );
}

export function useUserSearch(q) {
  const [state, setState] = useState({ users: [], loading: false });
  useEffect(() => {
    const term = String(q || "").trim();
    if (!term) {
      setState({ users: [], loading: false });
      return undefined;
    }
    let stop = false;
    setState((s) => ({ ...s, loading: true }));
    const id = setTimeout(async () => {
      try {
        const d = await adminFetch(`/shop/desk/users?q=${encodeURIComponent(term)}`);
        if (!stop) setState({ users: d.users || [], loading: false });
      } catch {
        if (!stop) setState({ users: [], loading: false });
      }
    }, 220);
    return () => {
      stop = true;
      clearTimeout(id);
    };
  }, [q]);
  return state;
}

/**
 * Pick one user (value = user | null) or several (multi, value = user[]).
 * Shows the picked user as a card with balance (Draft A quick panel).
 */
export function UserPicker({ value, onChange, multi = false, placeholder, autoFocus = false, inputRef: extRef }) {
  const { t, locale } = useLocale();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const { users, loading } = useUserSearch(q);
  const listId = useId();
  const ownRef = useRef(null);
  const inputRef = extRef || ownRef;
  const picked = multi ? value || [] : value ? [value] : [];
  const pick = useCallback(
    (u) => {
      if (multi) {
        if (!picked.some((p) => p.id === u.id)) onChange([...picked, u]);
      } else onChange(u);
      setQ("");
      setOpen(false);
      setHi(0);
    },
    [multi, picked, onChange]
  );
  const results = users.filter((u) => !picked.some((p) => p.id === u.id));

  if (!multi && value) {
    return (
      <div className="sdk-user-card">
        <Ava user={value} size={36} />
        <div>
          <b>{value.displayName}</b>
          <small>
            @{value.username} · {t("shopDesk.balanceShort", { n: num(value.balance, locale) })}
            {value.frozen ? ` · ${t("shopDesk.frozen")}` : ""}
          </small>
        </div>
        <button type="button" className="sdk-icon-btn" onClick={() => onChange(null)} aria-label={t("shopDesk.clearUser")}>
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="sdk-picker">
      {multi && picked.length ? (
        <div className="sdk-chips">
          {picked.map((u) => (
            <span key={u.id} className="sdk-chip-user">
              <Ava user={u} size={20} />@{u.username}
              <button type="button" onClick={() => onChange(picked.filter((p) => p.id !== u.id))} aria-label={t("shopDesk.removeUser", { user: u.username })}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="sdk-search-in">
        <Search size={16} />
        <input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          placeholder={placeholder || t("shopDesk.userSearchPh")}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && results[hi]) {
              e.preventDefault();
              pick(results[hi]);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {loading ? <span className="sdk-spin" aria-hidden="true" /> : null}
      </div>
      {open && results.length ? (
        <ul className="sdk-hits" id={listId} role="listbox">
          {results.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === hi}>
              <button type="button" className={i === hi ? "is-hi" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(u)}>
                <Ava user={u} size={26} />
                <span>
                  <b>{u.displayName}</b>
                  <small>
                    @{u.username} · {num(u.balance, locale)} DC
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Searchable item list (single pick). */
export function ItemPicker({ items, value, onChange, placeholder, max = 8 }) {
  const { t, locale } = useLocale();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = items.find((it) => it.id === value) || null;
  const results = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return items.filter((it) => !it.retired && (!needle || `${it.name} ${it.sku}`.toLocaleLowerCase("tr").includes(needle))).slice(0, max);
  }, [items, q, max]);
  if (selected && !open) {
    return (
      <div className="sdk-user-card">
        <ItemThumb item={selected} size={36} />
        <div>
          <b>{selected.name}</b>
          <small>
            {t(`shopDesk.cat.${selected.category}`)} · {num(selected.price_descoin, locale)} DC
          </small>
        </div>
        <button type="button" className="sdk-icon-btn" onClick={() => onChange("")} aria-label={t("shopDesk.clearItem")}>
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="sdk-picker">
      <div className="sdk-search-in">
        <Search size={16} />
        <input
          value={q}
          placeholder={placeholder || t("shopDesk.itemSearchPh")}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              onChange(results[0].id);
              setOpen(false);
              setQ("");
            }
          }}
        />
      </div>
      {open && results.length ? (
        <ul className="sdk-hits" role="listbox">
          {results.map((it) => (
            <li key={it.id} role="option" aria-selected={it.id === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(it.id);
                  setOpen(false);
                  setQ("");
                }}
              >
                <ItemThumb item={it} size={26} />
                <span>
                  <b>{it.name}</b>
                  <small>
                    {t(`shopDesk.cat.${it.category}`)} · {num(it.price_descoin, locale)} DC
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ERR_CODES = new Set([
  "not_found", "not_installed", "reason_required", "bad_op", "pct_required", "no_items", "section_not_manual", "bad_schedule",
  "section_required", "bad_request", "bad_mode", "drift_changed", "bad_window", "stock_below_sold", "cosmetic_removed", "bad_action",
  "server_error", "name_required", "bad_kind", "starts_required", "ends_required", "scope_required", "title_required", "bad_stock",
  "bad_sale_window", "no_drift", "negative_ledger",
]);

/** Localized text for an admin API error (the shop desk routes answer with codes). */
export function errMsg(t, e, fallbackKey = "shopDesk.saveError") {
  const code = e?.code || (ERR_CODES.has(e?.message) ? e.message : null);
  if (code && ERR_CODES.has(code)) return t(`shopDesk.err.${code}`);
  if (e?.message && !/^[a-z_]+$/.test(e.message)) return e.message;
  return t(fallbackKey);
}

export function Skel({ h = 14, w = "100%", r = 8 }) {
  return <span className="sdk-skel" style={{ height: h, width: w, borderRadius: r }} />;
}

export function Empty({ icon: Icon, title, body, action }) {
  return (
    <div className="sdk-empty">
      {Icon ? <Icon size={26} /> : null}
      <b>{title}</b>
      {body ? <p>{body}</p> : null}
      {action || null}
    </div>
  );
}

/** Download text as a file (CSV buttons). */
export function downloadText(name, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
