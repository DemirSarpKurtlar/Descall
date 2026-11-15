/**
 * Liste ve inceleme paneli (Draft A): tabs per status with counts, audience
 * and language filters, the pinned group (drag to reorder) and the others;
 * each row shows seen share and button clicks, a pin toggle and the row menu.
 */
import { useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { AnnTile } from "../../announcements/AnnGlyph.jsx";
import { LOCALES, LOCALE_CODE, plainText, fmtDateTime, fmtNumber, fmtPct, langSummary, seenRate } from "./announcementsModel.js";
import { agoText, audienceText } from "./BoardView.jsx";
import { Chip, Ic, Menu } from "./ui.jsx";

const LANG_KEY = { tr: "tr", en: "en", de: "de", es: "es", fr: "fr", "pt-BR": "ptBR", ru: "ru" };

function Row({ item, selected, onSelect, onPin, onMenu, menuOpen, drag, t, locale }) {
  const ref = useRef(null);
  const s = langSummary(item.langStates || {});
  const rate = seenRate(item);
  const published = ["live", "ended", "archived"].includes(item.status);
  return (
    <div
      className={`an-arow${selected ? " is-sel" : ""}${drag?.over ? " is-over" : ""}`}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-testid={`an-row-${item.id}`}
      draggable={Boolean(drag)}
      onDragStart={drag?.onStart}
      onDragOver={drag?.onOver}
      onDragLeave={drag?.onLeave}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onEnd}
    >
      <span className="an-g" aria-hidden="true">{drag ? <Ic name="grip" size={16} /> : null}</span>
      <AnnTile item={item} size="lg" />
      <div className="an-arow-main">
        <div className="an-arow-t">
          <b>{item.title}</b>
          {item.pinned ? <Chip tone="amber">{t("annc.u.pinned")}</Chip> : null}
          <Chip tone={item.priority === "urgent" ? "red" : item.priority === "important" ? "gold" : "gray"}>{t(`annc.prio.${item.priority}`)}</Chip>
        </div>
        <p>{plainText(item.content)}</p>
        <div className="an-meta">
          <span>
            <Ic name="users" size={14} />
            {audienceText(item.audience, t)}
          </span>
          <span>
            <Ic name="lang" size={14} />
            {t("annc.list.langs", { n: s.covered })}
          </span>
          <span>
            {item.author ? `@${item.author}` : ""} · {fmtDateTime(item.publishedAt || item.startsAt || item.createdAt, locale)}
          </span>
          <span>
            <Ic name="timer" size={14} />
            {item.endsAt ? fmtDateTime(item.endsAt, locale) : t("annc.list.forever")}
          </span>
        </div>
      </div>
      <div className="an-mt">
        {published ? (
          <>
            <div className="an-mt-l">
              <span>{t("annc.list.seen")}</span>
              <b className="tnum">{rate == null ? "—" : fmtPct(rate, locale)}</b>
            </div>
            <div className="an-pb" aria-hidden="true">
              <i style={{ width: `${Math.min(100, rate || 0)}%` }} />
            </div>
            <div className="an-mt-l">
              <span>{t("annc.list.clicks")}</span>
              <b className="tnum">{item.ctaUrl ? fmtNumber(item.stats?.clicked || 0, locale) : "—"}</b>
            </div>
          </>
        ) : (
          <div className="an-mt-l is-col">
            <span>{item.status === "scheduled" ? t("annc.list.publishes") : t("annc.list.updated")}</span>
            <b>{item.status === "scheduled" ? fmtDateTime(item.startsAt, locale) : agoText(item.updatedAt || item.createdAt, t)}</b>
          </div>
        )}
      </div>
      <div className="an-acts2" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={`an-ibtn${item.pinned ? " is-amber" : ""}`} onClick={() => onPin(item)} aria-pressed={item.pinned} aria-label={item.pinned ? t("annc.act.unpin") : t("annc.act.pin")} disabled={!["live", "scheduled"].includes(item.status)}>
          <Ic name="pin" size={18} />
        </button>
        <button type="button" ref={ref} className={`an-ibtn${menuOpen ? " is-on" : ""}`} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t("annc.more")} onClick={() => onMenu(item, ref)}>
          <Ic name="more" size={18} />
        </button>
      </div>
    </div>
  );
}

export default function ListView({ tab, setTab, counts, items, selectedId, onSelect, onPin, onMenu, menuFor, onReorderPins, filters, setFilters }) {
  const { t, locale } = useLocale();
  const [fMenu, setFMenu] = useState(null);
  const audRef = useRef(null);
  const langRef = useRef(null);
  const [drag, setDrag] = useState({ id: null, over: null });
  const pinned = tab === "live" ? items.filter((i) => i.pinned).sort((a, b) => (a.pinOrder || 99) - (b.pinOrder || 99)) : [];
  const rest = tab === "live" ? items.filter((i) => !i.pinned) : items;
  const tabs = ["live", "scheduled", "draft", ...(counts.pending ? ["pending"] : []), "ended", "archived"];

  const dragFor = (item) => ({
    over: drag.over === item.id && drag.id !== item.id,
    onStart: (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `pin:${item.id}`);
      setDrag({ id: item.id, over: null });
    },
    onOver: (e) => {
      e.preventDefault();
      if (drag.over !== item.id) setDrag((d) => ({ ...d, over: item.id }));
    },
    onLeave: () => setDrag((d) => ({ ...d, over: null })),
    onDrop: (e) => {
      e.preventDefault();
      const ids = pinned.map((p) => p.id).filter((x) => x !== drag.id);
      ids.splice(ids.indexOf(item.id) < 0 ? ids.length : ids.indexOf(item.id), 0, drag.id);
      setDrag({ id: null, over: null });
      if (drag.id) onReorderPins(ids);
    },
    onEnd: () => setDrag({ id: null, over: null }),
  });

  return (
    <div className="an-listv">
      <div className="an-tabs" role="tablist" aria-label={t("annc.list.tabs")}>
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`an-tab${tab === id ? " is-on" : ""}`} onClick={() => setTab(id)} data-testid={`an-tab-${id}`}>
            {t(`annc.tab.${id}`)}
            {counts[id] ? <em className="tnum">{counts[id]}</em> : null}
          </button>
        ))}
        <span className="an-sp" />
        <button type="button" ref={audRef} className={`an-fp${filters.audience !== "all" ? " is-on" : ""}`} aria-haspopup="menu" onClick={() => setFMenu(fMenu === "aud" ? null : "aud")}>
          <Ic name="users" size={16} />
          {filters.audience === "all" ? t("annc.filter.audience") : t(`annc.filter.aud.${filters.audience}`)}
        </button>
        <button type="button" ref={langRef} className={`an-fp${filters.lang !== "all" ? " is-on" : ""}`} aria-haspopup="menu" onClick={() => setFMenu(fMenu === "lang" ? null : "lang")}>
          <Ic name="lang" size={16} />
          {filters.lang === "all" ? t("annc.filter.lang") : LOCALE_CODE[filters.lang]}
        </button>
        <Menu
          open={fMenu === "aud"}
          anchorRef={audRef}
          onClose={() => setFMenu(null)}
          label={t("annc.filter.audience")}
          width={220}
          items={["all", "everyone", "targeted"].map((id) => ({ id, label: t(`annc.filter.aud.${id}`), active: filters.audience === id, trail: filters.audience === id ? <Ic name="tick" size={15} /> : null, onSelect: () => setFilters({ ...filters, audience: id }) }))}
        />
        <Menu
          open={fMenu === "lang"}
          anchorRef={langRef}
          onClose={() => setFMenu(null)}
          label={t("annc.filter.lang")}
          width={240}
          items={[{ id: "all", label: t("annc.filter.allLangs"), active: filters.lang === "all", onSelect: () => setFilters({ ...filters, lang: "all" }) }, ...LOCALES.map((l) => ({ id: l, label: t(`annc.lang.${LANG_KEY[l]}`), trail: filters.lang === l ? <Ic name="tick" size={15} /> : LOCALE_CODE[l], onSelect: () => setFilters({ ...filters, lang: l }) }))]}
        />
      </div>
      {pinned.length ? (
        <>
          <div className="an-sh">
            <Ic name="pin" size={15} />
            {t("annc.list.pinned")}
            <span className="an-x">{t("annc.list.dragHint")}</span>
          </div>
          {pinned.map((i) => (
            <Row key={i.id} item={i} selected={selectedId === i.id} onSelect={onSelect} onPin={onPin} onMenu={onMenu} menuOpen={menuFor === i.id} drag={dragFor(i)} t={t} locale={locale} />
          ))}
          {rest.length ? <div className="an-sh">{t("annc.list.others")}</div> : null}
        </>
      ) : null}
      {rest.map((i) => (
        <Row key={i.id} item={i} selected={selectedId === i.id} onSelect={onSelect} onPin={onPin} onMenu={onMenu} menuOpen={menuFor === i.id} t={t} locale={locale} />
      ))}
      {!items.length ? (
        <div className="an-empty">
          <Ic name={tab === "archived" ? "archive" : "megaphone"} size={22} />
          <p>{t(`annc.list.empty.${tab}`)}</p>
        </div>
      ) : null}
    </div>
  );
}
