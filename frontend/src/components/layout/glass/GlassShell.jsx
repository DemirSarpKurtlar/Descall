/**
 * Liquid Glass navigation shell (2.9.154, Stage 2 of glass-redesign/uygulama-plani.md).
 *
 * iPhone app only: AppLayout provides GlassShellContext only when html.glass-ui
 * is on AND the layout is mobile. Every consumer renders its pre-glass tree when
 * the context is null, so web / desktop / Android / iPad are untouched.
 *
 * Geometry = approved mockup (final/src/glass.css, 440×956):
 *   toolbar  y = safe-top − 2 (60), 44 tall · me-btn | bgroup | + (cbtn)
 *   title    y = chrome + 52 (112), 34/40 bold
 *   search   y = chrome + 102 (162), 42 tall
 *   tab bar  floats 24 above the bottom (home indicator 34 − 10), 64 tall, 7 columns
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search, Plus } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { STATUS_META } from "../../../lib/presence";
import { resolveDisplayName } from "../../../lib/userProfile";
import { createValueAnimator } from "../../../lib/fluid/animator";
import { SPRINGS } from "../../../lib/fluid/springs";
import { usePressFeedback } from "../../../hooks/usePressFeedback";
import { useT } from "../../../context/LocaleContext";

/** null = glass shell off (render the classic tree). */
export const GlassShellContext = createContext(null);

export function useGlassShell() {
  return useContext(GlassShellContext);
}

/** Opens the (rail-owned) status picker as the mockup-18 glass menu. */
export const GLASS_STATUS_EVENT = "descall:glass-status-open";

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function PressButton({ className = "", children, ...rest }) {
  // Small toolbar controls read as dead at the default 0.97. 0.88 is the
  // optical press, and the glass fill is a child so iOS can scale the button
  // (WebKit ignores transform on the element that owns backdrop-filter).
  const press = usePressFeedback({ scale: 0.88, haptic: true });
  const fill = /\bg-glass\b/.test(className);
  return (
    <button type="button" {...rest} {...press} className={className}>
      {fill ? <span className="g-press-plate" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** Leading toolbar slot: own avatar + status dot (replaces the rail avatar). */
export function GlassMeButton({ className = "" }) {
  const shell = useGlassShell();
  const t = useT();
  if (!shell) return null;
  const { me, myStatus = "online" } = shell;
  const statusKey = STATUS_META[myStatus] ? myStatus : "online";
  const name = resolveDisplayName(me) || t("You");
  return (
    <PressButton
      className={`g-me-btn g-glass ${className}`.trim()}
      data-gid="toolbar-avatar"
      aria-label={`${name} — ${t("change status")}`}
      aria-haspopup="menu"
      onClick={() => {
        try {
          window.dispatchEvent(new CustomEvent(GLASS_STATUS_EVENT));
        } catch {
          /* ignore */
        }
      }}
    >
      <GlassMeAvatar me={me} statusKey={statusKey} />
    </PressButton>
  );
}

export function GlassMeAvatar({ me, statusKey = "online", imageUrl }) {
  return (
    <span className="g-me-av">
      <Avatar
        name={resolveDisplayName(me)}
        size={38}
        user={me}
        imageUrl={imageUrl || me?.avatarUrl || me?.avatar_url || null}
        animate="always"
        loading="eager"
      />
      <span className={`g-st status-${statusKey}`} aria-hidden="true" />
    </span>
  );
}

/**
 * Large-title list header: toolbar (me-btn · bgroup · +), large title (+ sub),
 * optional search field, and the top scroll-edge mask.
 *
 * buttons: [{ id, icon: LucideIcon, label, onClick, badge? }]
 * plus:    { icon?, label, onClick, disabled? } | null
 * search:  { value, onChange, inputRef?, placeholder? } | null
 * searchCollapsible: search field only shows after the Search button is tapped
 */
export function GlassListHeader({
  title,
  sub = "",
  inlineTitle = false,
  buttons = [],
  plus = null,
  search = null,
  searchCollapsible = false,
}) {
  const t = useT();
  const shell = useGlassShell();
  const localInput = useRef(null);
  const inputRef = search?.inputRef || localInput;
  const [searchOpen, setSearchOpen] = useState(false);
  const showSearch = Boolean(search) && (!searchCollapsible || searchOpen || Boolean(search?.value));

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen, inputRef]);

  if (!shell) return null;
  const variant = inlineTitle ? "inline" : showSearch ? "search" : sub ? "sub" : "title";
  const PlusIcon = plus?.icon || Plus;

  return (
    <div className={`g-list-head g-head-${variant}${sub && showSearch ? " g-head-has-sub" : ""}`} data-gid="list-header">
      <div className="g-edge-top" aria-hidden="true" />
      <div className="g-toolbar" data-gid="toolbar">
        <GlassMeButton />
        <div className="g-sp" />
        {inlineTitle ? <div className="g-inline-title">{title}</div> : null}
        {buttons.length > 0 ? (
          <div className="g-bgroup g-glass" data-gid="toolbar-bgroup">
            {buttons.map((b) => {
              const Icon = b.icon;
              const isSearch = b.id === "search";
              return (
                <PressButton
                  key={b.id}
                  className={`g-bgroup-btn${b.danger ? " danger" : ""}${b.active ? " on" : ""}`}
                  aria-label={b.badge ? `${b.label} ${b.badge}` : b.label}
                  title={b.label}
                  aria-pressed={b.active === undefined ? undefined : Boolean(b.active)}
                  onClick={(e) => {
                    if (isSearch && search) {
                      if (searchCollapsible && !showSearch) setSearchOpen(true);
                      else inputRef.current?.focus();
                      return;
                    }
                    b.onClick?.(e);
                  }}
                >
                  <Icon size={20} strokeWidth={1.9} />
                  {b.badge ? <b className="g-nb">{b.badge > 99 ? "99+" : b.badge}</b> : null}
                </PressButton>
              );
            })}
          </div>
        ) : null}
        {plus ? (
          <PressButton
            className="g-cbtn g-glass g-tint-brand"
            data-gid="toolbar-plus"
            aria-label={plus.label}
            title={plus.label}
            disabled={plus.disabled}
            aria-haspopup={plus.menu ? "menu" : undefined}
            onClick={plus.onClick}
          >
            <PlusIcon size={20} strokeWidth={1.9} />
          </PressButton>
        ) : null}
      </div>
      {!inlineTitle ? (
        <h1 className="g-large-title" data-gid="large-title">
          {title}
          {sub ? <small>{sub}</small> : null}
        </h1>
      ) : null}
      {showSearch ? (
        <label className="g-searchbar g-glass" data-gid="search">
          <Search size={18} strokeWidth={1.9} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="search-input g-search-input"
            placeholder={search.placeholder || t("Search")}
            value={search.value}
            onChange={search.onChange}
            onBlur={() => {
              if (searchCollapsible && !search.value) setSearchOpen(false);
            }}
            enterKeyHint="search"
          />
        </label>
      ) : null}
    </div>
  );
}

/** Small glass pull-down menu anchored under a toolbar button (e.g. Servers +). */
export function GlassToolbarMenu({ open, onClose, items }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    // Defer so the opening tap does not close it again.
    const id = setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("touchstart", onDoc, { passive: true });
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className="g-menu g-glass g-heavy g-toolbar-menu" role="menu">
      {items.map((it) =>
        it.sep ? (
          <div key={it.id} className="g-msep" role="separator" />
        ) : (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            className={`g-mi${it.active ? " on" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              onClose?.();
              it.onClick?.();
            }}
          >
            {it.icon ? <it.icon size={19} strokeWidth={1.9} /> : null}
            <span>{it.label}</span>
          </button>
        )
      )}
    </div>
  );
}

/**
 * Floating 7-tab glass bar (same destinations + order as the rail; Play only
 * when the LFG feature is on). The selected-tab lens slides on the `move` spring.
 */
export function GlassTabBar({ items, activeId, onSelect, badges = {} }) {
  const lensRef = useRef(null);
  const animRef = useRef(null);
  const activeIndex = Math.max(0, items.findIndex((it) => it.id === activeId));
  const hasActive = items.some((it) => it.id === activeId);
  const n = items.length || 1;

  const animator = useMemo(
    () =>
      createValueAnimator(activeIndex, (v) => {
        const el = lensRef.current;
        if (el) el.style.transform = `translate3d(${(v * 100).toFixed(3)}%,0,0)`;
      }, { scale: 0.01 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  animRef.current = animator;

  useLayoutEffect(() => {
    const a = animRef.current;
    if (!a) return;
    if (prefersReducedMotion() || !lensRef.current?.dataset.ready) {
      a.set(activeIndex);
      if (lensRef.current) lensRef.current.dataset.ready = "1";
    } else {
      a.to(activeIndex, { preset: SPRINGS.move });
    }
  }, [activeIndex]);

  return (
    <nav
      className="g-tabbar g-glass"
      data-gid="tabbar"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, "--g-tab-n": n }}
      aria-label="Primary"
    >
      <span
        ref={lensRef}
        className={`g-tab-lens g-lens${hasActive ? "" : " is-hidden"}`}
        aria-hidden="true"
      />
      {items.map((item) => {
        const Icon = item.icon;
        const on = item.id === activeId;
        const badge = Number(badges[item.id]) || 0;
        return (
          <GlassTab
            key={item.id}
            on={on}
            label={item.label}
            badge={badge}
            onSelect={() => onSelect(item.id)}
          >
            <Icon size={22} strokeWidth={on ? 2.2 : 1.85} />
          </GlassTab>
        );
      })}
    </nav>
  );
}

function GlassTab({ on, label, badge, onSelect, children }) {
  const press = usePressFeedback({ scale: 0.92 });
  return (
    <button
      type="button"
      {...press}
      className={`g-tab${on ? " on" : ""}`}
      aria-current={on ? "page" : undefined}
      aria-label={badge > 0 ? `${label} ${badge > 99 ? "99+" : badge}` : label}
      // Re-tapping the current tab returns to its root list (iOS pop-to-root).
      onClick={() => onSelect()}
    >
      {children}
      <span className="g-tab-label">{label}</span>
      {badge > 0 ? <span className="g-dotb">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}
