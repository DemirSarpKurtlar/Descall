/**
 * Yönetici Paneli iskeleti (3.1, onaylı taslak 30 Eki 2026):
 *  - desktop / iPad: sol menüde bütün bölümler ikonlarıyla, gruplu, aranabilir;
 *  - phone: üst çubuk (menü · bölüm adı · kapat) + tam ekran menü;
 *  - standalone (Electron'daki ayrı yönetici penceresi): kendi başlık çubuğu ve
 *    pencere düğmeleri, ana Descall penceresi serbest kalır.
 * Menü verisi adminNav.js'ten gelir (tek kaynak, testli).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { List, Search, X } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import AdminVersionBadge from "./AdminVersionBadge.jsx";
import { groupAdminTabs } from "./adminNav.js";
import logoIcon from "../../assets/admin-logo-icon.png";
import "../../styles/admin-shell.css";

function NavList({ tabs, current, onPick, badges, query, t, big = false }) {
  const groups = useMemo(() => groupAdminTabs(tabs, t, query), [tabs, t, query]);
  if (!groups.length) return <p className="adm-nav-empty">{t("admin.navNoMatch")}</p>;
  return groups.map((g) => (
    <div key={g.key} className="adm-nav-group" role="group" aria-label={g.label}>
      <div className="adm-nav-label">{g.label}</div>
      {g.items.map((tab) => {
        const Icon = tab.icon;
        const on = tab.id === current;
        const n = Number(badges?.[tab.id]) || 0;
        return (
          <button
            key={tab.id}
            type="button"
            className={`adm-nav-item${on ? " is-on" : ""}`}
            aria-current={on ? "page" : undefined}
            onClick={() => onPick(tab.id)}
            data-tab={tab.id}
          >
            <Icon size={big ? 20 : 17} weight={on ? "fill" : "regular"} aria-hidden="true" />
            <span>{t(tab.label)}</span>
            {n > 0 ? <em className="tnum">{n > 99 ? "99+" : n}</em> : null}
          </button>
        );
      })}
    </div>
  ));
}

function SideHead({ t, onClose, closeLabel }) {
  return (
    <div className="adm-side-head">
      <span className="adm-logo"><img src={logoIcon} alt="" /></span>
      <div className="adm-side-title">
        <b>{t("admin.title")}</b>
        <AdminVersionBadge t={t} />
      </div>
      {onClose ? (
        <button type="button" className="adm-icon-btn" onClick={onClose} aria-label={closeLabel}>
          <X size={17} />
        </button>
      ) : null}
    </div>
  );
}

function SearchBox({ value, onChange, inputRef, t, hint }) {
  return (
    <label className="adm-search">
      <Search size={15} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("admin.navSearch")}
        aria-label={t("admin.navSearch")}
      />
      {hint ? <kbd>Ctrl K</kbd> : null}
    </label>
  );
}

function Me({ viewer, moderatorOnly, t }) {
  if (!viewer) return null;
  return (
    <div className="adm-me">
      <span className="adm-me-av" aria-hidden="true">{String(viewer).slice(0, 1).toUpperCase()}</span>
      <div>
        <b>{viewer}</b>
        <span>{moderatorOnly ? t("admin.roleModerator") : t("admin.roleAdmin")}</span>
      </div>
    </div>
  );
}

function TitleBar({ t }) {
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  return (
    <div className="adm-titlebar" onDoubleClick={() => api?.maximizeWindow?.()}>
      <img src={logoIcon} alt="" />
      <span className="adm-titlebar-name">descall</span>
      <span className="adm-titlebar-sub">{t("admin.windowTitle")}</span>
      <span className="adm-titlebar-sp" />
      <button type="button" className="adm-wc" aria-label={t("Minimize")} onClick={() => api?.minimizeWindow?.()}>
        <svg width="12" height="12" aria-hidden="true"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.3" /></svg>
      </button>
      <button type="button" className="adm-wc" aria-label={t("Maximize")} onClick={() => api?.maximizeWindow?.()}>
        <svg width="12" height="12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
      </button>
      <button type="button" className="adm-wc is-x" aria-label={t("Close")} onClick={() => (api?.closeWindow ? api.closeWindow() : window.close())}>
        <svg width="12" height="12" aria-hidden="true"><path d="M2 2l8 8M10 2 2 10" stroke="currentColor" strokeWidth="1.3" /></svg>
      </button>
    </div>
  );
}

export default function AdminShell({
  tabs,
  current,
  onSelect,
  badges,
  layout = "desktop",
  standalone = false,
  onClose,
  viewer,
  moderatorOnly = false,
  banner = null,
  children,
}) {
  const { t } = useLocale();
  const phone = layout === "phone";
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const searchRef = useRef(null);
  const mainRef = useRef(null);
  const cur = tabs.find((x) => x.id === current) || tabs[0];

  const pick = (id) => {
    setDrawer(false);
    setQuery("");
    onSelect(id);
  };

  // Each section starts at its top.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [current]);

  useEffect(() => {
    const onKey = (e) => {
      // A section with its own search (Geri Bildirim) claims Ctrl+K first.
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k" && !phone && !e.defaultPrevented) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select?.();
        return;
      }
      if (e.key === "Escape" && drawer) {
        e.stopPropagation();
        setDrawer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, drawer]);

  if (phone) {
    const CurIcon = cur?.icon;
    return (
      <div className={`adm adm-phone${standalone ? " is-standalone" : ""}`} data-layout="phone">
        <header className="adm-topbar">
          <button type="button" className="adm-icon-btn" onClick={() => setDrawer(true)} aria-label={t("admin.openMenu")} aria-expanded={drawer}>
            <List size={20} />
          </button>
          <h1 className="adm-topbar-title">
            {CurIcon ? <CurIcon size={18} weight="fill" aria-hidden="true" /> : null}
            <span>{cur ? t(cur.label) : t("admin.title")}</span>
          </h1>
          {onClose ? (
            <button type="button" className="adm-icon-btn" onClick={onClose} aria-label={t("Close")}>
              <X size={18} />
            </button>
          ) : null}
        </header>
        {banner}
        <main ref={mainRef} className="adm-main" data-tab={current}>{children}</main>
        {drawer ? (
          <div className="adm-drawer" role="dialog" aria-modal="true" aria-label={t("admin.sections")}>
            <aside className="adm-side is-drawer">
              <SideHead t={t} onClose={() => setDrawer(false)} closeLabel={t("admin.closeMenu")} />
              <SearchBox value={query} onChange={setQuery} inputRef={searchRef} t={t} hint={false} />
              <nav className="adm-nav" aria-label={t("admin.sections")}>
                <NavList tabs={tabs} current={current} onPick={pick} badges={badges} query={query} t={t} big />
              </nav>
              <Me viewer={viewer} moderatorOnly={moderatorOnly} t={t} />
            </aside>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`adm adm-${layout}${standalone ? " is-standalone" : ""}`} data-layout={layout}>
      {standalone ? <TitleBar t={t} /> : null}
      <div className="adm-frame">
        <aside className="adm-side">
          <SideHead t={t} onClose={standalone ? null : onClose} closeLabel={t("Close")} />
          <SearchBox value={query} onChange={setQuery} inputRef={searchRef} t={t} hint />
          <nav className="adm-nav" aria-label={t("admin.sections")}>
            <NavList tabs={tabs} current={current} onPick={pick} badges={badges} query={query} t={t} />
          </nav>
          <Me viewer={viewer} moderatorOnly={moderatorOnly} t={t} />
        </aside>
        <main ref={mainRef} className="adm-main" data-tab={current}>
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}
